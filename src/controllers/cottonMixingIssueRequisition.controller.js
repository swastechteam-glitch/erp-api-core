import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Cotton Mixing Issue Requisition (port of frmCottonMixingIssue_Requisition_New)
//   Reserve cotton lots for a mixing (count) — a "mixing chart". Add lots line
//   by line (or "Pre Load" from the count's mixing rule), enter No of Bales,
//   and save. Quality averages (2.5/U%/Mic/TR/FQI/RD) are weighted by bales.
//   - Options  : Mixing Name list (tbl_CottonCount)
//   - Next no  : sp_CMIRequisition_BindNo (@CompanyCode, @FYCode)
//   - Lot stock: sp_CottonIssue_LotStock (the Mill Lot dropdown + quality cols)
//   - Bales    : per-lot Stock (sp_CottonIssue_BalesStock count) and Pending /
//                reserved (sp_CMIRequisitionReserved_GetbyArrival sum)
//   - Pre Load : sp_CMIRequisition_PreLoad + _PreLoad_InStock (grid prefill)
//   - List     : sp_CMIRequisition_GetAll
//   - One      : GetAll row + vw_CMIRequisitionDetails
//   - Save     : sp_CMIRequisition_AddEdit (ExecuteScalar -> CMIRequisitionCode)
//                then sp_CMIRequisitionDetails_Delete + _Insert per lot (>0 bales).
//   - Delete   : sp_CMIRequisition_Delete.
//
// Company from req.headers.companyCode, FY from req.headers.FYCode; AddEdit also
// needs @User / @Node from req.headers.userId / nodeCode.
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getFYCode = (req) => toInt(req.headers.FYCode);
const D = (v) => (v ? new Date(v) : null);

const scalar = async (request, proc) => {
  const r = await request.execute(proc);
  const row = r.recordset?.[0];
  return row ? toInt(Object.values(row)[0]) : 0;
};

// per-lot stock (bale count) and reserved/pending bales.
const lotStockAndReserved = async (pool, companyCode, arrivalCode) => {
  const [bales, reserved] = await Promise.all([
    pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("ArrivalCode", sql.Int, arrivalCode)
      .execute("sp_CottonIssue_BalesStock"),
    pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("ArrivalCode", sql.Int, arrivalCode)
      .execute("sp_CMIRequisitionReserved_GetbyArrival"),
  ]);
  const stock = (bales.recordset || []).length;
  const pending = (reserved.recordset || []).reduce(
    (sum, r) => sum + toNum(r.TotalReservedBales),
    0
  );
  return { stock, pending };
};

// GET /cotton-mixing-issue-requisition/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .query("Select CottonCountCode, CottonCountName from tbl_CottonCount Order By CottonCountName");
    return sendSuccess(res, {
      mixingNames: r.recordset.map((x) => ({ value: x.CottonCountCode, label: x.CottonCountName })),
    });
  } catch (err) {
    console.error("DB Error (CMIRequisition.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /cotton-mixing-issue-requisition/next-no
export const getNextNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const no = await scalar(
      pool.request().input("CompanyCode", sql.Int, getCompanyCode(req)).input("FYCode", sql.Int, getFYCode(req)),
      "sp_CMIRequisition_BindNo"
    );
    return sendSuccess(res, { nextNo: no });
  } catch (err) {
    console.error("DB Error (CMIRequisition.getNextNo):", err);
    return sendError(res, err);
  }
};

// GET /cotton-mixing-issue-requisition/lot-stock -> Mill Lot dropdown + quality cols
export const getLotStock = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_CottonIssue_LotStock");
    const lots = (r.recordset || []).map((x) => ({ value: x.ArrivalCode, label: x.MillLotNo, ...x }));
    return sendSuccess(res, { lots });
  } catch (err) {
    console.error("DB Error (CMIRequisition.getLotStock):", err);
    return sendError(res, err);
  }
};

// GET /cotton-mixing-issue-requisition/bales-stock/:arrivalCode -> { stock, pending }
export const getBalesStock = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const arrivalCode = parseInt(req.params.arrivalCode);
    if (!arrivalCode) return sendError(res, "Invalid ArrivalCode", 400);
    const pool = await getPool(req.headers.subdbname);
    const { stock, pending } = await lotStockAndReserved(pool, getCompanyCode(req), arrivalCode);
    return sendSuccess(res, { stock, pending });
  } catch (err) {
    console.error("DB Error (CMIRequisition.getBalesStock):", err);
    return sendError(res, err);
  }
};

// Normalize a Pre-Load row (the two procs use slightly different column names).
const normPreload = (r, stock) => ({
  ArrivalCode: toInt(r.ArrivalCode),
  MillLotNo: (r.MillLotNo || "").toString().trim(),
  Variety: r.RawMaterialName ?? "",
  TwoPointFivePer: toNum(r["25PerLen"] ?? r.Len25),
  UPer: toNum(r.Uni),
  Mic: toNum(r.Mic),
  TR: toNum(r.Trash),
  FQI: toNum(r.FQI),
  RD: toNum(r.Rd),
  Grade: r.Grade ?? "",
  Stock: stock,
  NoofBales: toNum(r.NoofBales),
});

// GET /cotton-mixing-issue-requisition/pre-load?cottonCountCode=
export const getPreLoad = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cottonCountCode = toInt(req.query.cottonCountCode);
    if (cottonCountCode <= 0) return sendError(res, "Select the Cotton Count Name", 400);

    const companyCode = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    const [mix, inStock] = await Promise.all([
      pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("CottonCountCode", sql.Int, cottonCountCode)
        .execute("sp_CMIRequisition_PreLoad"),
      pool
        .request()
        .input("CottonCountCode", sql.Int, cottonCountCode)
        .input("CompanyCode", sql.Int, companyCode)
        .execute("sp_CMIRequisition_PreLoad_InStock"),
    ]);

    const rows = [];
    // Mixing-rule rows: keep only those with available bale stock.
    for (const r of mix.recordset || []) {
      const { stock } = await lotStockAndReserved(pool, companyCode, toInt(r.ArrivalCode));
      if (stock > 0) rows.push(normPreload(r, stock));
    }
    // Remaining in-stock lots, defaulted to 0 bales (stock net of reserved).
    for (const r of inStock.recordset || []) {
      const { stock, pending } = await lotStockAndReserved(pool, companyCode, toInt(r.ArrivalCode));
      rows.push({ ...normPreload(r, Math.max(0, stock - pending)), NoofBales: 0 });
    }

    return sendSuccess(res, { rows });
  } catch (err) {
    console.error("DB Error (CMIRequisition.getPreLoad):", err);
    return sendError(res, err);
  }
};

// GET /cotton-mixing-issue-requisition/lists
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("FYCode", sql.Int, getFYCode(req))
      .execute("sp_CMIRequisition_GetAll");
    const data = (result.recordset || [])
      .map((r) => ({ ...r, id: r.CMIRequisitionCode }))
      .sort((a, b) => Number(b.CMIRequisitionCode) - Number(a.CMIRequisitionCode));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (CMIRequisition.getList):", err);
    return sendError(res, err);
  }
};

// GET /cotton-mixing-issue-requisition/list/:code -> header + detail rows
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = parseInt(req.params.code);
    if (!code) return sendError(res, "Invalid CMIRequisitionCode", 400);

    const companyCode = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    const listRes = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("FYCode", sql.Int, getFYCode(req))
      .execute("sp_CMIRequisition_GetAll");
    const row = listRes.recordset.find((r) => parseInt(r.CMIRequisitionCode) === code);
    if (!row) return sendError(res, "Cotton Mixing Issue Requisition not found", 404);

    const det = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("CMIRequisitionCode", sql.Int, code)
      .query(
        "Select * from vw_CMIRequisitionDetails Where CompanyCode = @CompanyCode AND CMIRequisitionCode = @CMIRequisitionCode"
      );

    const details = (det.recordset || []).map((r) => ({
      ArrivalCode: toInt(r.ArrivalCode),
      MillLotNo: (r.MillLotNo || "").toString().trim(),
      Variety: r.RawMaterialName ?? r.Variety ?? "",
      NoofBales: toNum(r.NoOfBales),
      Stock: toNum(r.OpeningBales ?? r.Stock),
      TwoPointFivePer: toNum(r.Len25 ?? r["25PerLen"]),
      UPer: toNum(r.Uni),
      Mic: toNum(r.Mic),
      TR: toNum(r.Trash),
      FQI: toNum(r.FQI),
      RD: toNum(r.Rd),
      Grade: r.Grade ?? "",
    }));

    return sendSuccess(res, { ...row, details });
  } catch (err) {
    console.error("DB Error (CMIRequisition.getById):", err);
    return sendError(res, err);
  }
};

const saveOrUpdate = async (req, res, isEdit) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const companyCode = getCompanyCode(req);
    const fyCode = getFYCode(req);
    const code = isEdit ? parseInt(req.params.code) : 0;
    const b = req.body || {};

    if (toInt(b.CottonCountCode) <= 0) return sendError(res, "Select the Mixing Cotton Name", 400);
    const details = (Array.isArray(b.details) ? b.details : []).filter((d) => toNum(d.NoofBales) > 0);
    if (!details.length) return sendError(res, "Enter the Details", 400);

    const totalBales = details.reduce((s, d) => s + toNum(d.NoofBales), 0);

    const pool = await getPool(req.headers.subdbname);

    const reqNo = isEdit
      ? toInt(b.CMIRequisitionNo)
      : await scalar(
          pool.request().input("CompanyCode", sql.Int, companyCode).input("FYCode", sql.Int, fyCode),
          "sp_CMIRequisition_BindNo"
        );

    tx = new sql.Transaction(pool);
    await tx.begin();

    const head = new sql.Request(tx);
    if (isEdit && code) head.input("CMIRequisitionCode", sql.Int, code);
    head.input("CMIRequisitionNo", sql.Int, reqNo);
    head.input("CMIRequisitionDate", sql.DateTime, D(b.CMIRequisitionDate) || new Date());
    head.input("TotalBales", sql.Decimal(18, 3), totalBales);
    head.input("CottonCountCode", sql.Int, toInt(b.CottonCountCode));
    head.input("FYCode", sql.Int, fyCode);
    head.input("CompanyCode", sql.Int, companyCode);
    head.input("User", sql.Int, parseInt(userId));
    head.input("Node", sql.Int, parseInt(nodeCode));
    const cmiCode = await scalar(head, "sp_CMIRequisition_AddEdit");

    await new sql.Request(tx)
      .input("CMIRequisitionCode", sql.Int, cmiCode)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_CMIRequisitionDetails_Delete");

    for (const d of details) {
      const stock = toNum(d.Stock);
      await new sql.Request(tx)
        .input("CMIRequisitionCode", sql.Int, cmiCode)
        .input("ArrivalCode", sql.Int, toInt(d.ArrivalCode))
        .input("NoOfBales", sql.Decimal(18, 3), toNum(d.NoofBales))
        .input("OpeningBales", sql.Decimal(18, 3), stock)
        .input("ClosingBales", sql.Decimal(18, 3), stock - toNum(d.NoofBales))
        .input("CompanyCode", sql.Int, companyCode)
        .execute("sp_CMIRequisitionDetails_Insert");
    }

    await tx.commit();
    return sendSuccess(
      res,
      { CMIRequisitionCode: cmiCode },
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (tx) {
      try {
        await tx.rollback();
      } catch (_) {}
    }
    if (err.message && err.message.includes("UK_")) {
      return sendError(res, "Please check the entry", 409);
    }
    console.error("DB Error (saveOrUpdateCMIRequisition):", err);
    return sendError(res, err);
  }
};

export const create = (req, res) => saveOrUpdate(req, res, false);
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /cotton-mixing-issue-requisition/delete/:code
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = parseInt(req.params.code);
    if (!code) return sendError(res, "Invalid CMIRequisitionCode", 400);
    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("CMIRequisitionCode", sql.Int, code)
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_CMIRequisition_Delete");
    return sendSuccess(res, { CMIRequisitionCode: code }, "The record is deleted");
  } catch (err) {
    console.error("DB Error (CMIRequisition.remove):", err);
    return sendError(res, err);
  }
};
