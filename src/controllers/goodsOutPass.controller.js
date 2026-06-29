import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Goods Out Pass — gate-out data entry (port of WinForms frmGoodsOutStore).
//
// Creates a Goods Out Pass for material leaving the premises. Goods-Type-driven:
//   - Pass number is re-issued by sp_GateEntryGoodsOut_BindNo(@GoodsTypeCode).
//   - In/Out Type list depends on (GoodsType, MaterialType).
//   - Item lookup source depends on MaterialType (vw_Item / RawMaterial /
//     CountName / WasteItem).
//   - Ref No source depends on the In/Out Type's TransGoodsTypeCode
//     (3→Yarn, 5→ServiceOrder, 9→CottonReject), and selecting a Ref No
//     pre-fills the item grid.
//
// Save (one transaction, exact VB order):
//   sp_GateEntryGoodsOut_BindNo (re-issue no, server-side)
//   sp_GateEntryGoodsOut_AddEdit (header → GoodsOutPassCode)
//   sp_GateEntryGoodsOutDetails_Delete
//   loop sp_GateEntryGoodsOutDetails_Insert (each line incl. its @GoodsImage)
//
// Company / FY / user / node come from the session headers — never the client.
// Company display fields are re-derived server-side from sp_GateEntry_GetCompany.
// Fresh /goods-out-pass namespace (no collision with /gate or /stores).
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
const getFYCode = (req) => toInt(req.headers.FYCode);
const getUserCode = (req) => toInt(req.headers.userId);
const getNodeCode = (req) => toInt(req.headers.nodeCode);
const D = (v) => (v ? new Date(v) : null);
const pick = (row, ...keys) => {
  for (const k of keys) {
    const x = row?.[k];
    if (x !== null && x !== undefined && String(x).trim() !== "") return x;
  }
  return null;
};
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
const dataUriToBuffer = (dataUri) => {
  if (!dataUri || typeof dataUri !== "string") return null;
  const i = dataUri.indexOf(",");
  if (!dataUri.startsWith("data:") || i < 0) return null;
  try {
    return Buffer.from(dataUri.slice(i + 1), "base64");
  } catch {
    return null;
  }
};
const serverDate = async (pool) => {
  const r = await pool.request().query("SELECT CAST(GETDATE() AS date) AS d");
  return r.recordset?.[0]?.d || null;
};
const scalar = async (request, proc) => {
  const r = await request.execute(proc);
  if (r.returnValue !== undefined && Number.isInteger(r.returnValue) && !r.recordset?.length) return r.returnValue;
  const row = r.recordset?.[0];
  return row ? Object.values(row)[0] : null;
};

// Issue the next pass number for a goods type (server-side; never trusts client).
const bindNoFor = async (pool, companyCode, fyCode, goodsTypeCode) => {
  if (goodsTypeCode <= 0) return 0;
  const v = await scalar(
    pool.request().input("CompanyCode", sql.Int, companyCode).input("FYCode", sql.Int, fyCode).input("GoodsTypeCode", sql.Int, goodsTypeCode),
    "sp_GateEntryGoodsOut_BindNo",
  );
  return toInt(v);
};

// Re-derive the selected party's stored fields from sp_GateEntry_GetCompany by
// its row SNO (the dropdown value), so the save never trusts client strings.
const getCompanyRow = async (pool, sno) => {
  const r = await pool.request().execute("sp_GateEntry_GetCompany");
  return (r.recordset || []).find((x) => toInt(pick(x, "SNO", "Sno")) === sno) || null;
};

// ---- GET /goods-out-pass/options ------------------------------------------
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);
    const today = await serverDate(pool);
    if (companyCode <= 0) return sendSuccess(res, { groupLogin: true, serverDate: today });

    const q = (sqlText, req2) => (req2 || pool.request()).query(sqlText).then((r) => r.recordset || []);
    const [goodsTypes, materialTypes, uoms, departments, branches, companies, settings] = await Promise.all([
      q("SELECT GoodsTypeCode, GoodsTypeName FROM tbl_GateEntryGoodsType"),
      q("SELECT MaterialTypeCode, MaterialType FROM tbl_MaterialType"),
      q("SELECT ItemUOMName, ItemUOMCode FROM tbl_ItemUOM ORDER BY ItemUOMName"),
      q("SELECT DepartmentName, DepartmentCode FROM tbl_Department ORDER BY DepartmentName"),
      pool.request().input("CompanyCode", sql.Int, companyCode).query("SELECT BranchName, BranchCode FROM tbl_Branch WHERE CompanyCode = @CompanyCode AND Status = 1 ORDER BY BranchName").then((r) => r.recordset || []),
      pool.request().execute("sp_GateEntry_GetCompany").then((r) => r.recordset || []).catch(() => []),
      q("SELECT (SELECT COUNT(*) FROM tbl_Setting WHERE GoodsOut_WithImage = 1) AS a, (SELECT COUNT(*) FROM tbl_Setting WHERE GateEntry_GoodsinWithImage = 1) AS b").catch(() => [{ a: 0, b: 0 }]),
    ]);

    const photoRequired = toInt(settings?.[0]?.a) > 0 || toInt(settings?.[0]?.b) > 0;
    return sendSuccess(res, {
      groupLogin: false,
      serverDate: today,
      photoRequired,
      goodsTypes: goodsTypes.map((x) => ({ value: toInt(pick(x, "GoodsTypeCode")), label: str(pick(x, "GoodsTypeName")) })),
      materialTypes: materialTypes.map((x) => ({ value: toInt(pick(x, "MaterialTypeCode")), label: str(pick(x, "MaterialType")) })),
      uoms: uoms.map((x) => ({ value: toInt(pick(x, "ItemUOMCode")), label: str(pick(x, "ItemUOMName")) })),
      departments: departments.map((x) => ({ value: toInt(pick(x, "DepartmentCode")), label: str(pick(x, "DepartmentName")) })),
      branches: branches.map((x) => ({ value: toInt(pick(x, "BranchCode")), label: str(pick(x, "BranchName")) })),
      companies: companies.map((x) => ({
        value: toInt(pick(x, "SNO", "Sno")),
        label: str(pick(x, "strVendorName", "VendorName")),
        vendorName: str(pick(x, "VendorName")),
        vendorType: str(pick(x, "VendorType")),
        vendorCode: toInt(pick(x, "VendorCode")),
        mobileNo: str(pick(x, "MobileNo")),
      })),
    });
  } catch (err) {
    console.error("DB Error (GoodsOutPass.getOptions):", err);
    return sendError(res, err);
  }
};

// ---- GET /goods-out-pass/bind-no?goodsTypeCode= ---------------------------
export const getBindNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    if (companyCode <= 0) return sendSuccess(res, { no: 0 });
    const pool = await getPool(req.headers.subdbname);
    const no = await bindNoFor(pool, companyCode, getFYCode(req), toInt(req.query.goodsTypeCode));
    return sendSuccess(res, { no });
  } catch (err) {
    console.error("DB Error (GoodsOutPass.getBindNo):", err);
    return sendError(res, err);
  }
};

// ---- GET /goods-out-pass/inout-types?goodsTypeCode=&materialTypeCode= ------
export const getInOutTypes = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const goodsType = toInt(req.query.goodsTypeCode);
    const mat = toInt(req.query.materialTypeCode);
    let where;
    if (goodsType === 1) where = "ModeOutReturnable = 1 AND MaterialTypeCode = @MaterialTypeCode";
    else if (goodsType === 2) where = "ModeOutNonReturnable = 1 AND MaterialTypeCode = @MaterialTypeCode";
    else where = "ModeOutReturnable = 1 AND MaterialTypeCode = 0";
    const r = await pool
      .request()
      .input("MaterialTypeCode", sql.Int, mat)
      .query(`SELECT TransGoodsTypeName, TransGoodsTypeCode FROM tbl_GateEntryTransGoodsType WHERE ${where} ORDER BY TransGoodsTypeName`);
    return sendSuccess(res, (r.recordset || []).map((x) => ({ value: toInt(pick(x, "TransGoodsTypeCode")), label: str(pick(x, "TransGoodsTypeName")) })));
  } catch (err) {
    console.error("DB Error (GoodsOutPass.getInOutTypes):", err);
    return sendError(res, err);
  }
};

// ---- GET /goods-out-pass/items?materialTypeCode= --------------------------
export const getItems = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const mat = toInt(req.query.materialTypeCode);
    let q;
    if (mat === 1 || mat === 5) q = "SELECT ItemCode AS code, ItemName AS name, ItemID, Partnumber, ItemUOMCode, HSNCode, DrawingNo, CatalogueNo FROM vw_Item WHERE Status = 1 ORDER BY ItemName";
    else if (mat === 2) q = "SELECT RawMaterialCode AS code, RawMaterialName AS name, HSNCode FROM tbl_RawMaterial WHERE Status = 1 ORDER BY RawMaterialName";
    else if (mat === 3) q = "SELECT CountNameCode AS code, CountName AS name FROM tbl_CountName WHERE Status = 1 ORDER BY CountName";
    else if (mat === 4) q = "SELECT WasteItemCode AS code, WasteItemName AS name, HSNCode FROM tbl_WasteItem ORDER BY WasteItemName";
    else return sendSuccess(res, []);
    const r = await pool.request().query(q);
    return sendSuccess(
      res,
      (r.recordset || []).map((x) => ({
        value: toInt(pick(x, "code")),
        label: str(pick(x, "name")),
        ItemID: str(pick(x, "ItemID")),
        PartNo: str(pick(x, "Partnumber", "PartNumber")),
        ItemUomCode: toInt(pick(x, "ItemUOMCode")),
        HSNCode: str(pick(x, "HSNCode")),
        DrawingNo: str(pick(x, "DrawingNo")),
        CatalogueNo: str(pick(x, "CatalogueNo")),
      })),
    );
  } catch (err) {
    console.error("DB Error (GoodsOutPass.getItems):", err);
    return sendError(res, err);
  }
};

// ---- GET /goods-out-pass/ref-nos?transGoodsTypeCode= ----------------------
export const getRefNos = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);
    const trans = toInt(req.query.transGoodsTypeCode);
    let proc = "sp_GateEntry_YarnGatePass";
    let fy = getFYCode(req);
    if (trans === 3) proc = "sp_GateEntry_YarnGatePass";
    else if (trans === 5) proc = "sp_GateEntry_ServiceOrderRequistion";
    else if (trans === 9) proc = "sp_GateEntry_CottonReject";
    else fy = 0; // empty fallback (matches the VB's FYCode = 0)
    const r = await pool.request().input("CompanyCode", sql.Int, companyCode).input("FYCode", sql.Int, fy).execute(proc);
    return sendSuccess(res, (r.recordset || []).map((x) => ({ value: toInt(pick(x, "GatePassNo")), label: str(pick(x, "strGatePassNo")) })));
  } catch (err) {
    console.error("DB Error (GoodsOutPass.getRefNos):", err);
    return sendError(res, err);
  }
};

// ---- GET /goods-out-pass/ref-details?transGoodsTypeCode=&refCode= ----------
// Pre-fill rows for the item grid when a Ref No is chosen (Yarn invoice / Cotton
// reject). Returns normalized line objects.
export const getRefDetails = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const fyCode = getFYCode(req);
    const pool = await getPool(req.headers.subdbname);
    const trans = toInt(req.query.transGoodsTypeCode);
    const refCode = toInt(req.query.refCode);
    if (refCode <= 0) return sendSuccess(res, []);

    let rows = [];
    if (trans === 3) {
      const r = await pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("GatePassNo", sql.Int, refCode)
        .input("FYCode", sql.Int, fyCode)
        .query("SELECT CountName, CountTypeCode, Qty FROM vw_Invoice WHERE CompanyCode = @CompanyCode AND GatePassNo = @GatePassNo AND FYCode = @FYCode");
      rows = (r.recordset || []).map((x) => ({ itemName: str(pick(x, "CountName")), countNameCode: toInt(pick(x, "CountTypeCode")), outQty: toNum(pick(x, "Qty")) }));
    } else if (trans === 9) {
      const r = await pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("CottonRejectCode", sql.Int, refCode)
        .input("FYCode", sql.Int, fyCode)
        .query("SELECT RawMaterialName, RawMaterialCode, NoofBales FROM vw_CottonRejectDetails WHERE CompanyCode = @CompanyCode AND CottonRejectCode = @CottonRejectCode AND FYCode = @FYCode");
      rows = (r.recordset || []).map((x) => ({ itemName: str(pick(x, "RawMaterialName")), rawMaterialCode: toInt(pick(x, "RawMaterialCode")), outQty: toNum(pick(x, "NoofBales")) }));
    }
    return sendSuccess(res, rows);
  } catch (err) {
    console.error("DB Error (GoodsOutPass.getRefDetails):", err);
    return sendError(res, err);
  }
};

// ---- POST /goods-out-pass/create ------------------------------------------
export const create = async (req, res) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    if (companyCode <= 0) return sendError(res, "You Are Login in Group of Company, please change in any one Company", 400);
    const fyCode = getFYCode(req);
    const b = req.body || {};

    const goodsTypeCode = toInt(b.goodsTypeCode);
    const materialTypeCode = toInt(b.materialTypeCode);
    const transGoodsTypeCode = toInt(b.transGoodsTypeCode);
    const companySNO = toInt(b.companySNO);
    const vehicleNo = str(b.vehicleNo);
    const invoiceNumber = str(b.invoiceNumber);
    const remarks = str(b.remarks);
    const departmentCode = toInt(b.departmentCode);
    const branchCode = toInt(b.branchCode);
    const refCode = toInt(b.refCode);
    const refNo = str(b.refNo);
    const storeOutDate = D(b.storeOutDate);
    const details = Array.isArray(b.details) ? b.details : [];

    // ---- server-side validation (mirrors the VB, in order) ----------------
    if (companySNO <= 0) return sendError(res, "Select the Company Name...", 400, { field: "companySNO" });
    if (goodsTypeCode <= 0) return sendError(res, "Select the Goods Type", 400, { field: "goodsTypeCode" });
    if (transGoodsTypeCode <= 0) return sendError(res, "Select the In / Out Type Name...", 400, { field: "transGoodsTypeCode" });
    if (materialTypeCode <= 0) return sendError(res, "Select the Material Type...", 400, { field: "materialTypeCode" });
    if (!vehicleNo) return sendError(res, "Type Vehicle No...", 400, { field: "vehicleNo" });
    if (!storeOutDate || Number.isNaN(storeOutDate.getTime())) return sendError(res, "Check Date ", 400, { field: "storeOutDate" });
    if (!details.length) return sendError(res, "Enter the Item....", 400, { field: "items" });
    const totalOutQty = details.reduce((s, d) => s + toNum(d.outQty), 0);
    if (totalOutQty <= 0) return sendError(res, "Enter the Out Qty.....", 400, { field: "items" });

    const pool = await getPool(req.headers.subdbname);

    // photo-required setting (re-checked server-side)
    const setRes = await pool.request().query("SELECT (SELECT COUNT(*) FROM tbl_Setting WHERE GoodsOut_WithImage = 1) AS a, (SELECT COUNT(*) FROM tbl_Setting WHERE GateEntry_GoodsinWithImage = 1) AS b").catch(() => ({ recordset: [{ a: 0, b: 0 }] }));
    const photoRequired = toInt(setRes.recordset?.[0]?.a) > 0 || toInt(setRes.recordset?.[0]?.b) > 0;
    if (photoRequired && details.some((d) => !dataUriToBuffer(d.image))) return sendError(res, "Photo Not Found....", 400, { field: "items" });

    // re-derive the party + re-issue the pass number server-side
    const company = await getCompanyRow(pool, companySNO);
    if (!company) return sendError(res, "Select the Company Name...", 400, { field: "companySNO" });
    const vendorName = str(pick(company, "VendorName"));
    const vendorType = str(pick(company, "VendorType"));
    const vendorCode = toInt(pick(company, "VendorCode"));
    const mobileNo = str(pick(company, "MobileNo"));

    const passNo = await bindNoFor(pool, companyCode, fyCode, goodsTypeCode);
    if (passNo <= 0) return sendError(res, "Select the Goods Type", 400, { field: "goodsTypeCode" });

    const now = new Date();
    tx = new sql.Transaction(pool);
    await tx.begin();

    // 1) header -> GoodsOutPassCode
    const head = new sql.Request(tx);
    head.input("Goodspassnumber", sql.Int, passNo);
    head.input("VehicleNo", sql.NVarChar, vehicleNo);
    head.input("MobileNumber", sql.NVarChar, mobileNo);
    head.input("CompanyName", sql.NVarChar, vendorName);
    if (vendorType.toLowerCase() === "supplier") head.input("SupplierCode", sql.Int, vendorCode);
    else head.input("CustomerCode", sql.Int, vendorCode);
    if (departmentCode > 0) head.input("DepartmentCode", sql.Int, departmentCode);
    if (branchCode > 0) head.input("BranchCode", sql.Int, branchCode);
    head.input("InvoiceNumber", sql.NVarChar, invoiceNumber);
    head.input("GoodsTypeCode", sql.Int, goodsTypeCode);
    head.input("TransGoodsTypeCode", sql.Int, transGoodsTypeCode);
    head.input("Reason", sql.NVarChar, remarks);
    head.input("MaterialTypeCode", sql.Int, materialTypeCode);
    head.input("StoreOutDate", sql.DateTime, storeOutDate);
    head.input("StoreOuttime", sql.DateTime, now);
    head.input("Cancel", sql.Int, 0);
    head.input("CancelReason", sql.NVarChar, "");
    head.input("RefCode", sql.Int, refCode > 0 ? refCode : 0);
    head.input("RefNo", sql.NVarChar, refCode > 0 ? refNo : "");
    if (goodsTypeCode === 1) head.input("ExpectedDate", sql.DateTime, D(b.expectedDate) || storeOutDate);
    head.input("FYCode", sql.Int, fyCode);
    head.input("CompanyCode", sql.Int, companyCode);
    head.input("user", sql.Int, getUserCode(req));
    head.input("Node", sql.Int, getNodeCode(req));
    const goodsOutCode = toInt(await scalar(head, "sp_GateEntryGoodsOut_AddEdit"));
    if (goodsOutCode <= 0) throw new Error("Header save returned no GoodsOutPassCode");

    // 2) clear existing detail rows
    await new sql.Request(tx).input("GoodsOutPassCode", sql.Int, goodsOutCode).input("CompanyCode", sql.Int, companyCode).execute("sp_GateEntryGoodsOutDetails_Delete");

    // 3) insert each line (incl. its own GoodsImage)
    for (const d of details) {
      const r = new sql.Request(tx);
      r.input("GoodsOutPassCode", sql.Int, goodsOutCode);
      r.input("ItemName", sql.NVarChar, str(d.itemName));
      r.input("ItemDescription", sql.NVarChar, str(d.itemDescription));
      r.input("OutQty", sql.Decimal(18, 3), toNum(d.outQty));
      r.input("ItemCode", sql.Int, toInt(d.itemCode));
      r.input("ItemUOMCode", sql.Int, toInt(d.itemUomCode));
      r.input("CountNameCode", sql.Int, toInt(d.countNameCode));
      r.input("RawMaterialCode", sql.Int, toInt(d.rawMaterialCode));
      r.input("WasteItemCode", sql.Int, toInt(d.wasteItemCode));
      r.input("Rate", sql.Decimal(18, 2), toNum(d.rate));
      r.input("Amount", sql.Decimal(18, 2), toNum(d.amount));
      if (toInt(d.goodsInPassCode) > 0) r.input("GoodsInPassCode", sql.Int, toInt(d.goodsInPassCode));
      r.input("GoodsImage", sql.VarBinary(sql.MAX), dataUriToBuffer(d.image));
      r.input("SORReason", sql.NVarChar, str(d.reason));
      r.input("CompanyCode", sql.Int, companyCode);
      await r.execute("sp_GateEntryGoodsOutDetails_Insert");
    }

    await tx.commit();
    return sendSuccess(res, { goodsOutPassCode: goodsOutCode, goodsPassNumber: passNo }, "Saved Successfully...", 201);
  } catch (err) {
    if (tx) {
      try {
        await tx.rollback();
      } catch (_) {
        /* ignore */
      }
    }
    if (String(err?.message || "").includes("UK_") || String(err?.message || "").toUpperCase().includes("UNIQUE")) return sendError(res, "Already exist the Item", 400);
    console.error("DB Error (GoodsOutPass.create):", err);
    return sendError(res, err);
  }
};

// ---- GET /goods-out-pass/pending?gatePassNo=&supplierCode= -----------------
// Pending dispatch documents (Goods-In passes with pending qty) — edit source.
export const getPending = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    if (companyCode <= 0) return sendSuccess(res, []);
    const pool = await getPool(req.headers.subdbname);
    const gatePassNo = toInt(req.query.gatePassNo);
    const supplierCode = toInt(req.query.supplierCode);

    const r = pool.request().input("CompanyCode", sql.Int, companyCode);
    if (gatePassNo > 0) r.input("GoodsPassNumber", sql.Int, gatePassNo).input("FYCode", sql.Int, getFYCode(req));
    else if (supplierCode > 0) r.input("SupplierCode", sql.Int, supplierCode);
    const result = await r.execute("sp_GateEntryGoods_OutPending");

    const rows = (result.recordset || []).map((x, i) => ({
      id: toInt(pick(x, "GoodsInPassCode")) || i,
      GoodsInPassCode: toInt(pick(x, "GoodsInPassCode")),
      GoodsPassNumber: pick(x, "GoodsPassNumber", "GoodsPassnumber"),
      CompanyName: str(pick(x, "CompanyName")),
      MobileNumber: str(pick(x, "MobileNumber")),
      VehicleNo: str(pick(x, "VehicleNo")),
      MaterialType: str(pick(x, "MaterialType")),
      GateInDate: pick(x, "GateInDate") || null,
    }));
    return sendSuccess(res, rows);
  } catch (err) {
    console.error("DB Error (GoodsOutPass.getPending):", err);
    return sendError(res, err);
  }
};

// ---- GET /goods-out-pass/pending/:code  (GoodsInPassCode) ------------------
export const getPendingDoc = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    if (companyCode <= 0) return sendError(res, "You Are Login in Group of Company, please change in any one Company", 400);
    const code = toInt(req.params.code);
    if (code <= 0) return sendError(res, "Invalid GoodsInPassCode", 400);
    const pool = await getPool(req.headers.subdbname);

    const headRes = await pool.request().input("CompanyCode", sql.Int, companyCode).input("GoodsInPassCode", sql.Int, code).execute("sp_GateEntryGoods_OutPending");
    const h = headRes.recordset?.[0];
    if (!h) return sendError(res, "Pending pass not found", 404);

    const detRes = await pool.request().input("CompanyCode", sql.Int, companyCode).input("GoodsInPassCode", sql.Int, code).execute("sp_GateEntryGoods_OutPendingDetails");
    const items = (detRes.recordset || []).map((r, i) => ({
      sno: i + 1,
      itemName: str(pick(r, "ItemName")),
      itemDescription: str(pick(r, "ItemDescription")),
      inQty: toNum(pick(r, "InQty")),
      pendingQty: toNum(pick(r, "PendingQty")),
      itemCode: toInt(pick(r, "ItemCode")),
      rawMaterialCode: toInt(pick(r, "RawMaterialCode")),
      countNameCode: toInt(pick(r, "CountNameCode")),
      wasteItemCode: toInt(pick(r, "WasteItemCode")),
      itemUomCode: toInt(pick(r, "ItemUOMCode", "ItemUomCode")),
      reason: str(pick(r, "SORReason")),
      goodsInPassCode: toInt(pick(r, "GoodsInPassCode")),
    }));

    return sendSuccess(res, {
      header: {
        goodsInPassCode: toInt(pick(h, "GoodsInPassCode")),
        vehicleNo: str(pick(h, "VehicleNo")),
        invoiceNumber: str(pick(h, "InvoiceNumber")),
        materialTypeCode: toInt(pick(h, "MaterialTypeCode")),
        transGoodsTypeCode: toInt(pick(h, "TransGoodsTypeCode")),
        remarks: str(pick(h, "Reason")),
        supplierCode: toInt(pick(h, "SupplierCode")),
        departmentCode: toInt(pick(h, "DepartmentCode")),
        branchCode: toInt(pick(h, "BranchCode")),
        image: bufferToDataUri(h.GoodsImage),
      },
      items,
    });
  } catch (err) {
    console.error("DB Error (GoodsOutPass.getPendingDoc):", err);
    return sendError(res, err);
  }
};
