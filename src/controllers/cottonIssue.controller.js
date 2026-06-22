import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Cotton Issue (port of the WinForms frmCottonIssue)
//   Issue cotton bales to production against a Mixing Issue Requisition, bale
//   by bale. Pick a Requisition (loads its per-lot requ/issue/pending grid),
//   pick a Mill Lot (loads its in-stock bales), pick a Bale + enter current
//   weight, add it; repeat until the requisition bales are fully issued.
//   - Next no  : sp_CottonIssue_No (@CompanyCode, @IssueType='Issue', @FYCode)
//   - Requ list: sp_CottonIssue_LoadCMIRequisition (the Requisition No dropdown)
//   - Requ grid: sp_CottonIssueBale_CMIRBale_Checkecing (Requ/Issue/Pending/lot)
//   - Requ lots: sp_CottonIssue_LotStock_GetbyCMIRequisitionCode (Mill Lot dd)
//   - Bales    : sp_CottonIssue_BalesStock (@Entry=1) — in-stock bales of a lot
//   - List     : sp_CottonIssue_GetAll (@IssueType='Issue')
//   - One      : GetAll row + vw_CottonIssueDetails
//   - Save     : sp_CottonIssue_AddEdit (ExecuteScalar -> CottonIssueCode) then
//                sp_CottonIssueDetails_Delete + _AddEdit per bale.
//   - Delete   : sp_CottonIssue_Delete (@IssueType='Issue').
//
// Company from req.headers.companyCode, FY from req.headers.FYCode; AddEdit also
// needs @User / @Node from req.headers.userId / nodeCode. The desktop serial
// scale + barcode capture are NOT ported (current weight is entered manually).
// ---------------------------------------------------------------------------

const ISSUE_TYPE = "Issue";
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

// GET /cotton-issue/next-no
export const getNextNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const no = await scalar(
      pool
        .request()
        .input("CompanyCode", sql.Int, getCompanyCode(req))
        .input("IssueType", sql.NVarChar, ISSUE_TYPE)
        .input("FYCode", sql.Int, getFYCode(req)),
      "sp_CottonIssue_No"
    );
    return sendSuccess(res, { nextNo: no });
  } catch (err) {
    console.error("DB Error (CottonIssue.getNextNo):", err);
    return sendError(res, err);
  }
};

// GET /cotton-issue/requisitions -> the Requisition No dropdown
export const getRequisitions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_CottonIssue_LoadCMIRequisition");
    const requisitions = (r.recordset || []).map((x) => ({
      value: x.CMIRequisitionCode,
      label: x.str_CMIRequisitionNo ?? x.CMIRequisitionNo,
      ...x,
    }));
    return sendSuccess(res, { requisitions });
  } catch (err) {
    console.error("DB Error (CottonIssue.getRequisitions):", err);
    return sendError(res, err);
  }
};

// GET /cotton-issue/requisition/:code -> { rows (requ/issue/pending grid), lots }
export const getRequisitionDetail = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cmiCode = parseInt(req.params.code);
    if (!cmiCode) return sendError(res, "Invalid CMIRequisitionCode", 400);
    const companyCode = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    const [bales, lots] = await Promise.all([
      pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("CMIRequisitionCode", sql.Int, cmiCode)
        .execute("sp_CottonIssueBale_CMIRBale_Checkecing"),
      pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("CMIRequisitionCode", sql.Int, cmiCode)
        .execute("sp_CottonIssue_LotStock_GetbyCMIRequisitionCode"),
    ]);

    const rows = (bales.recordset || []).map((r) => ({
      ArrivalCode: toInt(r.ArrivalCode),
      MillLotNo: (r.MillLotNo || "").toString().trim(),
      Requ: toNum(r.CMIBales),
      Issue: toNum(r.IssueBales),
      Pending: toNum(r.PendingQty),
    }));
    return sendSuccess(res, {
      rows,
      lots: (lots.recordset || []).map((r) => ({ value: r.ArrivalCode, label: r.MillLotNo, ...r })),
      pendingTotal: rows.reduce((s, r) => s + r.Pending, 0),
    });
  } catch (err) {
    console.error("DB Error (CottonIssue.getRequisitionDetail):", err);
    return sendError(res, err);
  }
};

// GET /cotton-issue/bales-stock/:arrivalCode -> in-stock bales of a lot
export const getBalesStock = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const arrivalCode = parseInt(req.params.arrivalCode);
    if (!arrivalCode) return sendError(res, "Invalid ArrivalCode", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("Entry", sql.Int, 1)
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("ArrivalCode", sql.Int, arrivalCode)
      .execute("sp_CottonIssue_BalesStock");
    const bales = (r.recordset || []).map((x) => ({
      value: x.WeighmentDetailsCode,
      label: x.strBaleNo ?? x.BaleNo,
      WeighmentDetailsCode: toInt(x.WeighmentDetailsCode),
      BaleNo: x.BaleNo,
      GrossWeight: toNum(x.GrossWeight),
      WeighmentCode: toInt(x.WeighmentCode),
      ArrivalCode: toInt(x.ArrivalCode) || arrivalCode,
    }));
    return sendSuccess(res, { bales });
  } catch (err) {
    console.error("DB Error (CottonIssue.getBalesStock):", err);
    return sendError(res, err);
  }
};

// GET /cotton-issue/lists
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("IssueType", sql.NVarChar, ISSUE_TYPE)
      .execute("sp_CottonIssue_GetAll");
    const data = (result.recordset || [])
      .map((r) => ({ ...r, id: r.CottonIssueCode }))
      .sort((a, b) => Number(b.CottonIssueCode) - Number(a.CottonIssueCode));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (CottonIssue.getList):", err);
    return sendError(res, err);
  }
};

// GET /cotton-issue/list/:code -> header + bale rows
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = parseInt(req.params.code);
    if (!code) return sendError(res, "Invalid CottonIssueCode", 400);

    const companyCode = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    const listRes = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("IssueType", sql.NVarChar, ISSUE_TYPE)
      .execute("sp_CottonIssue_GetAll");
    const row = listRes.recordset.find((r) => parseInt(r.CottonIssueCode) === code);
    if (!row) return sendError(res, "Cotton Issue not found", 404);

    const det = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("CottonIssueCode", sql.Int, code)
      .query(
        "Select * from vw_CottonIssueDetails Where CompanyCode = @CompanyCode AND CottonIssueCode = @CottonIssueCode"
      );

    const details = (det.recordset || []).map((r) => ({
      MillLotNo: (r.MillLotNo || "").toString().trim(),
      BaleNo: r.BaleNo,
      ActualWt: toNum(r.ActualWt),
      CurrentWt: toNum(r.CurrentWt),
      Difference: toNum(r.Difference),
      WeighmentDetailsCode: toInt(r.WeighmentDetailsCode),
      WeighmentCode: toInt(r.WeighmentCode),
      ArrivalCode: toInt(r.ArrivalCode),
    }));

    return sendSuccess(res, { ...row, details });
  } catch (err) {
    console.error("DB Error (CottonIssue.getById):", err);
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

    if (toInt(b.CMIRequisitionCode) <= 0) return sendError(res, "Select the Requisition No", 400);
    const details = (Array.isArray(b.details) ? b.details : []).filter(
      (d) => toInt(d.WeighmentDetailsCode) > 0
    );
    if (!details.length) return sendError(res, "Enter the Issue Details", 400);
    for (const d of details) {
      if (toInt(d.WeighmentCode) <= 0 || toInt(d.ArrivalCode) <= 0)
        return sendError(res, "Please check the entry", 400);
    }

    const noOfBales = details.length;
    const totalActual = details.reduce((s, d) => s + toNum(d.ActualWt), 0);
    const totalCurrent = details.reduce((s, d) => s + toNum(d.CurrentWt), 0);
    const totalDiff = details.reduce((s, d) => s + toNum(d.Difference), 0);

    const pool = await getPool(req.headers.subdbname);

    const issueNo = isEdit
      ? toInt(b.CottonIssueNo)
      : await scalar(
          pool
            .request()
            .input("CompanyCode", sql.Int, companyCode)
            .input("IssueType", sql.NVarChar, ISSUE_TYPE)
            .input("FYCode", sql.Int, fyCode),
          "sp_CottonIssue_No"
        );

    tx = new sql.Transaction(pool);
    await tx.begin();

    const head = new sql.Request(tx);
    if (isEdit && code) head.input("CottonIssueCode", sql.Int, code);
    head.input("CMIRequisitionCode", sql.Int, toInt(b.CMIRequisitionCode));
    head.input("CottonIssueNo", sql.Int, issueNo);
    head.input("CottonIssueDate", sql.DateTime, D(b.CottonIssueDate) || new Date());
    head.input("NoofBales", sql.Decimal(18, 3), noOfBales);
    head.input("TotalActualWt", sql.Decimal(18, 3), totalActual);
    head.input("TotalGrossWt", sql.Decimal(18, 3), totalCurrent);
    head.input("TotalDifference", sql.Decimal(18, 3), totalDiff);
    head.input("Remarks", sql.NVarChar, "");
    head.input("FromcompanyCode", sql.Int, companyCode);
    head.input("ToCompanyCode", sql.Int, companyCode);
    head.input("IssueType", sql.NVarChar, ISSUE_TYPE);
    head.input("FYCode", sql.Int, fyCode);
    head.input("CompanyCode", sql.Int, companyCode);
    head.input("User", sql.Int, parseInt(userId));
    head.input("Node", sql.Int, parseInt(nodeCode));
    const cottonIssueCode = await scalar(head, "sp_CottonIssue_AddEdit");

    await new sql.Request(tx)
      .input("CottonIssueCode", sql.Int, cottonIssueCode)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_CottonIssueDetails_Delete");

    let sno = 0;
    for (const d of details) {
      sno += 1;
      await new sql.Request(tx)
        .input("CottonIssueCode", sql.Int, cottonIssueCode)
        .input("SNo", sql.Int, sno)
        .input("WeighmentDetailsCode", sql.Int, toInt(d.WeighmentDetailsCode))
        .input("ActualWt", sql.Decimal(18, 3), toNum(d.ActualWt))
        .input("CurrentWt", sql.Decimal(18, 3), toNum(d.CurrentWt))
        .input("Difference", sql.Decimal(18, 3), toNum(d.Difference))
        .input("CompanyCode", sql.Int, companyCode)
        .input("WeighmentCode", sql.Int, toInt(d.WeighmentCode))
        .input("ArrivalCode", sql.Int, toInt(d.ArrivalCode))
        .execute("sp_CottonIssueDetails_AddEdit");
    }

    await tx.commit();
    return sendSuccess(
      res,
      { CottonIssueCode: cottonIssueCode },
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
    console.error("DB Error (saveOrUpdateCottonIssue):", err);
    return sendError(res, err);
  }
};

export const create = (req, res) => saveOrUpdate(req, res, false);
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /cotton-issue/delete/:code
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = parseInt(req.params.code);
    if (!code) return sendError(res, "Invalid CottonIssueCode", 400);
    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("IssueType", sql.NVarChar, ISSUE_TYPE)
      .input("CottonIssueCode", sql.Int, code)
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_CottonIssue_Delete");
    return sendSuccess(res, { CottonIssueCode: code }, "The record is deleted");
  } catch (err) {
    console.error("DB Error (CottonIssue.remove):", err);
    return sendError(res, err);
  }
};
