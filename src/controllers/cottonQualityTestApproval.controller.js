import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Cotton Quality Test Approval (port of frmCottonTestApproval)
//   Pick a pending quality test, view its parameter grid + lot details, set a
//   Grade + Allowance Rate (Rate/Candy) + remarks, then Approve or Reject.
//   Mirrors the WinForms btnApprove/btnReject flow:
//     EXEC sp_CottonQualityTestApproval_AddEdit (@Reject = 0 approve / 1 reject)
//     UPDATE tbl_CottonQualityTest SET Grade = <grade> WHERE CQTCode = <code>
//
//   - GET /cotton-quality-test-approval/pendings        -> sp_CottonQualityTestApproval_Pendings (paginated)
//   - GET /cotton-quality-test-approval/details/:code   -> vw_CottonQualityTestDetails @CQTCode
//   - PUT /cotton-quality-test-approval/approve/:code   -> AddEdit @Reject = 0
//   - PUT /cotton-quality-test-approval/reject/:code    -> AddEdit @Reject = 1
//
// Company from req.headers.companyCode, FY from req.headers.FYCode, user/node
// from req.headers.userId / nodeCode.
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

// GET /cotton-quality-test-approval/pendings -> the pending tests (paginated).
export const getPendings = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request().input("CompanyCode", sql.Int, getCompanyCode(req));
    // Optional ArrivalCode filter (the WinForms Mill Lot No search).
    const arrivalCode = toInt(req.query.arrivalCode);
    if (arrivalCode > 0) request.input("ArrivalCode", sql.Int, arrivalCode);

    const result = await request.execute("sp_CottonQualityTestApproval_Pendings");
    const data = (result.recordset || []).map((r) => ({ ...r, id: r.CQTCode }));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (CQT Approval getPendings):", err);
    return sendError(res, err);
  }
};

// GET /cotton-quality-test-approval/details/:code -> the parameter grid for a test.
export const getDetails = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = parseInt(req.params.code);
    if (!code) return sendError(res, "Invalid CQTCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const det = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("CQTCode", sql.Int, code)
      .query(
        "Select * from vw_CottonQualityTestDetails Where CompanyCode = @CompanyCode AND CQTCode = @CQTCode",
      );

    const details = (det.recordset || []).map((r) => ({
      CQTParameterCode: toInt(r.CQTParameterCode),
      CQTParameterName: (r.CQTParameterName || "").toString().trim(),
      FromParameter: toNum(r.CQTParameterFrom),
      From1: (r.CQTParameterFrom1 || "").toString().trim(),
      ToParameter: toNum(r.CQTParameterTo),
      To1: (r.CQTParameterTo1 || "").toString().trim(),
      PartyFrom: r.PartyFrom ?? "",
      PartyFrom1: (r.PartyFrom1 || "").toString().trim(),
      PartyTo: r.PartyTo ?? "",
      PartyTo1: (r.PartyTo1 || "").toString().trim(),
      TestResult: toNum(r.TestResult),
      HighLight: toInt(r.HighLight),
    }));
    return sendSuccess(res, { details });
  } catch (err) {
    console.error("DB Error (CQT Approval getDetails):", err);
    return sendError(res, err);
  }
};

// Shared approve/reject runner (rejectFlag = 0 approve, 1 reject).
const decide = async (req, res, rejectFlag) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const code = parseInt(req.params.code ?? req.body?.CQTCode);
    if (!code) return sendError(res, "Select the Mill Lot No", 400);

    const b = req.body || {};
    const grade = (b.Grade || "").toString().trim();
    if (!grade || grade === "--SELECT--") return sendError(res, "Select the Grade", 400);

    const companyCode = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);
    tx = new sql.Transaction(pool);
    await tx.begin();

    const r = new sql.Request(tx);
    r.input("CQTApprovalDate", sql.DateTime, new Date());
    r.input("CQTCode", sql.Int, code);
    r.input("ArrivalCode", sql.Int, toInt(b.ArrivalCode));
    r.input("Grade", sql.NVarChar, grade);
    r.input("YarnType", sql.NVarChar, (b.YarnType || "").toString().trim());
    r.input("Remarks", sql.NVarChar, (b.Remarks || "").toString().trim());
    r.input("RatePerCandy", sql.Decimal(18, 3), toNum(b.RatePerCandy));
    r.input("Reject", sql.Int, rejectFlag);
    r.input("MD_Reject", sql.Int, 0);
    r.input("FYCode", sql.Int, getFYCode(req));
    r.input("CompanyCode", sql.Int, companyCode);
    r.input("User", sql.Int, parseInt(userId));
    r.input("Node", sql.Int, parseInt(nodeCode));
    await r.execute("sp_CottonQualityTestApproval_AddEdit");

    // Keep the test's stored Grade in sync (matches the WinForms post-update).
    await new sql.Request(tx)
      .input("Grade", sql.NVarChar, grade)
      .input("CompanyCode", sql.Int, companyCode)
      .input("CQTCode", sql.Int, code)
      .query(
        "Update tbl_CottonQualityTest Set Grade = @Grade Where CompanyCode = @CompanyCode AND CQTCode = @CQTCode",
      );

    await tx.commit();
    return sendSuccess(
      res,
      { CQTCode: code },
      rejectFlag ? "The record is Rejected" : "The record is Approved",
      200,
    );
  } catch (err) {
    if (tx) {
      try {
        await tx.rollback();
      } catch (_) {}
    }
    console.error("DB Error (CQT Approval decide):", err);
    return sendError(res, err);
  }
};

// PUT /cotton-quality-test-approval/approve/:code
export const approve = (req, res) => decide(req, res, 0);
// PUT /cotton-quality-test-approval/reject/:code
export const reject = (req, res) => decide(req, res, 1);
