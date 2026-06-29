import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";
import { applyBranchCode, showBranchDropDown } from "../utils/common.js";

// ---------------------------------------------------------------------------
// Goods In Pass — store-in acknowledgment for gate-entry goods passes
// (port of WinForms frmGoodsInStore). Gate entry creates a Goods In Pass when
// material arrives; here the store reviews each PENDING pass and either Stores
// it In (acknowledges receipt) or Rejects/Cancels it.
//
//   - options   : Material Type dropdown (tbl_MaterialType) + server date.
//   - list      : tabbed pending / stored-in / cancelled from vw_GateEntryGoodsIn
//                 (+ Total In Qty from tbl_GateEntryGoodsInDetails), ROW_NUMBER()
//                 CTE paging (SQL Server 2008 compatible), Material-Type filter.
//   - document  : web_sp_GateEntryGoodsIn_GetAll (header) + web_sp_GateEntry
//                 GoodsInDetails_GetAll (line items incl. GoodsImage).
//   - store-in  : UPDATE StoreInDate = GETDATE(), Store_InTime = <server time>.
//   - reject    : UPDATE Cancel = 1, StoreInDate = GETDATE(), Store_InTime = ...
//
//   store-in / reject are STATUS-GUARDED (only act on passes still pending,
//   StoreInDate IS NULL) -> HTTP 409 if the pass already left the queue. Company
//   / user / node come from the session headers — never the client. This is a
//   FRESH namespace (/goods-in-pass) that deliberately does NOT collide with the
//   legacy /stores/goods-in-approvals flow.
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};
const str = (v) => (v ?? "").toString().trim();
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const pick = (row, ...keys) => {
  for (const k of keys) {
    const x = row?.[k];
    if (x !== null && x !== undefined && String(x).trim() !== "") return x;
  }
  return null;
};
// mssql Image / varbinary -> data URI (mime sniffed from magic bytes).
const bufferToDataUri = (buf) => {
  if (!buf) return null;
  try {
    const b = Buffer.isBuffer(buf) ? buf : buf?.data ? Buffer.from(buf.data) : null;
    if (!b || b.length < 4) return null;
    let mime = "image/jpeg";
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) mime = "image/png";
    else if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) mime = "image/gif";
    else if (b[0] === 0x42 && b[1] === 0x4d) mime = "image/bmp";
    return `data:${mime};base64,${b.toString("base64")}`;
  } catch {
    return null;
  }
};
const serverDate = async (pool) => {
  const r = await pool.request().query("SELECT CAST(GETDATE() AS date) AS d");
  return r.recordset?.[0]?.d || null;
};

// Tab → status predicate (against the joined header table alias `t`). A pending
// pass has StoreInDate NULL; Store-In sets StoreInDate (Cancel stays 0); Reject
// sets Cancel=1 (and StoreInDate), so cancelled rows also carry a StoreInDate.
const TAB_PREDICATE = {
  pending: "t.StoreInDate IS NULL",
  storedin: "t.StoreInDate IS NOT NULL AND ISNULL(t.Cancel, 0) = 0",
  cancelled: "ISNULL(t.Cancel, 0) = 1",
};

// GET /goods-in-pass/options  -> Material Type dropdown + server date
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);
    const today = await serverDate(pool);
    if (companyCode <= 0) return sendSuccess(res, { groupLogin: true, materialTypes: [], serverDate: today });

    let materialTypes = [];
    try {
      const r = await pool
        .request()
        .query("SELECT MaterialTypeCode, MaterialType FROM tbl_MaterialType WHERE Status = 1 ORDER BY MaterialType");
      materialTypes = (r.recordset || []).map((x) => ({
        value: toInt(pick(x, "MaterialTypeCode")),
        label: str(pick(x, "MaterialType")),
      }));
    } catch (_) {
      materialTypes = [];
    }
    return sendSuccess(res, { groupLogin: false, materialTypes, serverDate: today });
  } catch (err) {
    console.error("DB Error (GoodsInPass.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /goods-in-pass/list?tab=&materialTypeCode=&page=&pageSize=
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    if (getCompanyCode(req) <= 0)
      return res.status(200).json({ data: [], currentPage: 1, pageSize: 10, totalRecords: 0, totalPages: 1 });

    const tab = (req.query.tab || "pending").toString().toLowerCase();
    const predicate = TAB_PREDICATE[tab] || TAB_PREDICATE.pending;
    const page = Math.max(1, toInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, toInt(req.query.pageSize) || 10));
    const fromRow = (page - 1) * pageSize + 1;
    const toRow = page * pageSize;
    const materialTypeCode = toInt(req.query.materialTypeCode);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();
    applyBranchCode(request, req.headers); // binds @CompanyCode (or @BranchCode for KPF)
    const scope = showBranchDropDown(req.headers.subdbname) ? "v.BranchCode = @BranchCode" : "v.CompanyCode = @CompanyCode";

    let matFilter = "";
    if (materialTypeCode > 0) {
      request.input("MaterialTypeCode", sql.Int, materialTypeCode);
      matFilter = " AND t.MaterialTypeCode = @MaterialTypeCode";
    }
    request.input("FromRow", sql.Int, fromRow);
    request.input("ToRow", sql.Int, toRow);

    // SQL 2008 paging: ROW_NUMBER() + COUNT() OVER() in a CTE, slice in the outer
    // query. The view carries the display columns; the joined base table carries
    // the authoritative status flags; the correlated subquery sums detail qty.
    const query = `
      WITH base AS (
        SELECT v.*,
          (SELECT ISNULL(SUM(d.InQty), 0)
             FROM tbl_GateEntryGoodsInDetails d
            WHERE d.CompanyCode = v.CompanyCode AND d.GoodsInpassCode = v.GoodsInPassCode) AS Gip_TotalInQty,
          ROW_NUMBER() OVER (ORDER BY v.GoodsInPassCode DESC) AS Gip_RowNum,
          COUNT(*) OVER () AS Gip_TotalRecords
        FROM vw_GateEntryGoodsIn v
        INNER JOIN tbl_GateEntryGoodsIn t
          ON t.GoodsInPassCode = v.GoodsInPassCode AND t.CompanyCode = v.CompanyCode
        WHERE ${scope} AND (${predicate})${matFilter}
      )
      SELECT * FROM base WHERE Gip_RowNum BETWEEN @FromRow AND @ToRow ORDER BY Gip_RowNum
    `;
    const result = await request.query(query);
    const recs = result.recordset || [];
    const totalRecords = recs.length > 0 ? toInt(pick(recs[0], "Gip_TotalRecords")) : 0;

    const rows = recs.map((x) => ({
      id: toInt(pick(x, "GoodsInPassCode")),
      GoodsInPassCode: toInt(pick(x, "GoodsInPassCode")),
      GoodsPassNumber: pick(x, "GoodsPassNumber", "GoodsPassnumber"),
      GateInDate: pick(x, "GateInDate") || null,
      SupplierName: str(pick(x, "SupplierName")),
      VehicleNo: str(pick(x, "VehicleNo")),
      MaterialType: str(pick(x, "MaterialType")),
      TotalInQty: toNum(pick(x, "Gip_TotalInQty")),
      EntryUser: str(pick(x, "UName", "EntryUser", "C_UserName")),
      EntryDate: pick(x, "C_Date", "EntryDate") || null,
      BranchName: str(pick(x, "BranchName")),
    }));

    return res.status(200).json({
      data: rows,
      currentPage: page,
      pageSize,
      totalRecords,
      totalPages: Math.max(1, Math.ceil(totalRecords / pageSize)),
    });
  } catch (err) {
    console.error("DB Error (GoodsInPass.getList):", err);
    return sendError(res, err);
  }
};

// GET /goods-in-pass/document/:code  -> header + line items (incl. GoodsImage)
export const getDocument = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (code <= 0) return sendError(res, "Invalid GoodsInPassCode", 400);
    const pool = await getPool(req.headers.subdbname);

    const reqH = pool.request();
    applyBranchCode(reqH, req.headers);
    const headerRes = await reqH.input("GoodsInPassCode", sql.Int, code).execute("web_sp_GateEntryGoodsIn_GetAll");

    const reqD = pool.request();
    applyBranchCode(reqD, req.headers);
    const detRes = await reqD.input("GoodsInPassCode", sql.Int, code).execute("web_sp_GateEntryGoodsInDetails_GetAll");

    const h = headerRes.recordsets?.[0]?.[0] || headerRes.recordset?.[0] || {};
    const recs = detRes.recordset || [];
    if (!Object.keys(h).length && !recs.length) return sendError(res, "Pass not found", 404);

    // Header-display fields: prefer the header SP, fall back to the FIRST detail
    // row — the details SP denormalizes them (MaterialType, UName, VehicleNo,
    // GoodsType… repeat on every line), and the header SP leaves some null.
    const d0 = recs[0] || {};
    const hpick = (...keys) => pick(h, ...keys) ?? pick(d0, ...keys);

    const items = recs.map((r, i) => ({
      sno: i + 1,
      itemName: str(pick(r, "ItemName")),
      itemDescription: str(pick(r, "ItemDescription")),
      partNo: str(pick(r, "PartNo", "PartNumber", "Partnumber")),
      uom: str(pick(r, "ItemUomName", "UomName")),
      inQty: toNum(pick(r, "InQty")),
      image: bufferToDataUri(r.GoodsImage),
    }));
    const totalInQty = items.reduce((s, x) => s + x.inQty, 0);

    return sendSuccess(res, {
      header: {
        passNo: hpick("GoodsPassnumber", "GoodsPassNumber") ?? "",
        gateInDate: hpick("GateInDate") || null,
        inTime: str(hpick("InTime")),
        supplierName: str(hpick("SupplierName", "CompanyName")),
        vehicleNo: str(hpick("VehicleNo")),
        materialType: str(hpick("MaterialType")),
        goodsType: str(hpick("GoodsTypeName")),
        transGoodsType: str(hpick("TransGoodsTypeName")),
        department: str(hpick("DepartmentName")),
        branch: str(hpick("BranchName")),
        preparedBy: str(hpick("UName")),
        createdDate: hpick("C_Date") || null,
        system: str(hpick("NodeName")),
      },
      items,
      totalInQty,
    });
  } catch (err) {
    console.error("DB Error (GoodsInPass.getDocument):", err);
    return sendError(res, err);
  }
};

// Shared store-in / reject. Status-guarded (StoreInDate IS NULL) -> 409. The
// WHERE scopes by CompanyCode (a confirmed base column + GoodsInPassCode is the
// unique PK), correct for every tenant incl. branch (KPF) DBs.
const actOnPass = async (req, res, { setClause, okMessage }) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    if (companyCode <= 0)
      return sendError(res, "You Are Login in Group of Company, please change in any one Company", 400);
    const code = toInt(req.body?.goodsInPassCode);
    if (code <= 0) return sendError(res, "Select the Pass...", 400);

    const pool = await getPool(req.headers.subdbname);
    tx = new sql.Transaction(pool);
    await tx.begin();
    const r = await new sql.Request(tx)
      .input("CompanyCode", sql.Int, companyCode)
      .input("GoodsInPassCode", sql.Int, code)
      .query(
        `UPDATE tbl_GateEntryGoodsIn SET ${setClause} ` +
          "WHERE CompanyCode = @CompanyCode AND GoodsInPassCode = @GoodsInPassCode AND StoreInDate IS NULL",
      );
    const affected = r.rowsAffected?.[0] || 0;
    if (affected === 0) {
      await tx.rollback();
      return sendError(res, "This pass was already stored-in or rejected — please reload.", 409);
    }
    await tx.commit();
    return sendSuccess(res, { goodsInPassCode: code }, okMessage);
  } catch (err) {
    if (tx) {
      try {
        await tx.rollback();
      } catch (_) {
        /* ignore */
      }
    }
    console.error("DB Error (GoodsInPass.actOnPass):", err);
    return sendError(res, err);
  }
};

// POST /goods-in-pass/store-in   { goodsInPassCode }
export const storeIn = (req, res) =>
  actOnPass(req, res, {
    setClause: "StoreInDate = GETDATE(), Store_InTime = CONVERT(VARCHAR(8), GETDATE(), 108)",
    okMessage: "Pass Approved.....",
  });

// POST /goods-in-pass/reject   { goodsInPassCode }
export const reject = (req, res) =>
  actOnPass(req, res, {
    setClause: "Cancel = 1, StoreInDate = GETDATE(), Store_InTime = CONVERT(VARCHAR(8), GETDATE(), 108)",
    okMessage: "Pass Rejected.....",
  });
