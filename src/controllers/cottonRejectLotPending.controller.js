import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// RawMaterial Reject Lot Pending Approval / MD Cotton Quality Test Approval
//   (port of the WinForms frmCottonRejectLotPending — despite the name it is
//   the MD-level Cotton Quality Test approve/reject screen). Pick a Company,
//   pick a pending quality test (loads its parameter grid + lot details), set a
//   Grade + Allowance Rate (Rate/Candy) + remarks, then Approve or Reject.
//   Mirrors btnSave_Click:
//     EXEC sp_CottonQualityTestApproval_AddEdit (@Reject = @MD_Reject = 0/1)
//     UPDATE tbl_CottonQualityTest SET Grade = <grade> WHERE CQTCode = <code>
//
//   - GET    /cotton-reject-lot-pending/options                 -> companies + lookup maps
//   - GET    /cotton-reject-lot-pending/pendings?companyCode=   -> sp_CottonQualityTestApproval_Pendings_MD (paginated)
//   - GET    /cotton-reject-lot-pending/details/:code?companyCode= -> vw_CottonQualityTestDetails
//   - GET    /cotton-reject-lot-pending/lists?companyCode=      -> sp_CottonQualityTestApproval_MD_Delete_GetAll (paginated)
//   - PUT    /cotton-reject-lot-pending/approve/:code           -> AddEdit @Reject = @MD_Reject = 0
//   - PUT    /cotton-reject-lot-pending/reject/:code            -> AddEdit @Reject = @MD_Reject = 1
//   - DELETE /cotton-reject-lot-pending/delete/:approvalCode    -> sp_CottonQualityTestApproval_MD_Delete
//
// This is CROSS-COMPANY: the Company is chosen in the screen (cmbCompany), so
// pendings/details/approve/list/delete all use that selected CompanyCode (from
// query/body), falling back to req.headers.companyCode. FY from req.headers.FYCode,
// user/node from req.headers.userId / nodeCode. The desktop Print + the hidden
// Yarn Type combo (always "HOSIERY") are not ported.
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};
const getFYCode = (req) => toInt(req.headers.FYCode);
// Selected company (query/body) wins; else the JWT company.
const resolveCompany = (req, fromBody) =>
  toInt(fromBody ?? req.query.companyCode) || toInt(req.headers.companyCode);

// GET /cotton-reject-lot-pending/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);

    const [companies, suppliers, agents, stations, varieties] = await Promise.all([
      pool.request().execute("sp_Company_GetAll"),
      pool.request().query("Select SupplierName, SupplierCode from tbl_Supplier Order by SupplierName"),
      pool.request().query("Select AgentName, AgentCode from tbl_Agent Order by AgentName"),
      pool.request().query("Select StationName, StationCode from tbl_Station Order by StationName"),
      pool
        .request()
        .query("Select RawMaterialName, RawMaterialCode from tbl_RawMaterial Order by RawMaterialName"),
    ]);

    return sendSuccess(res, {
      companies: (companies.recordset || []).map((r) => ({
        value: r.CompanyCode,
        label: (r.CompanyName || "").toString().trim(),
      })),
      suppliers: (suppliers.recordset || []).map((r) => ({ value: r.SupplierCode, label: r.SupplierName })),
      agents: (agents.recordset || []).map((r) => ({ value: r.AgentCode, label: r.AgentName })),
      stations: (stations.recordset || []).map((r) => ({ value: r.StationCode, label: r.StationName })),
      varieties: (varieties.recordset || []).map((r) => ({ value: r.RawMaterialCode, label: r.RawMaterialName })),
    });
  } catch (err) {
    console.error("DB Error (CottonRejectLotPending.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /cotton-reject-lot-pending/pendings?companyCode= -> MD pending tests (paginated).
export const getPendings = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = resolveCompany(req);
    if (companyCode <= 0) return sendSuccess(res, []);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_CottonQualityTestApproval_Pendings_MD");
    const data = (result.recordset || []).map((r) => ({ ...r, id: r.CQTCode }));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (CottonRejectLotPending.getPendings):", err);
    return sendError(res, err);
  }
};

// GET /cotton-reject-lot-pending/details/:code?companyCode= -> the parameter grid.
export const getDetails = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = parseInt(req.params.code);
    if (!code) return sendError(res, "Invalid CQTCode", 400);
    const companyCode = resolveCompany(req);

    const pool = await getPool(req.headers.subdbname);
    const det = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
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
      TestResult: r.TestResult ?? "",
    }));
    return sendSuccess(res, { details });
  } catch (err) {
    console.error("DB Error (CottonRejectLotPending.getDetails):", err);
    return sendError(res, err);
  }
};

// GET /cotton-reject-lot-pending/lists?companyCode= -> approved/rejected (paginated).
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = resolveCompany(req);
    if (companyCode <= 0) return sendSuccess(res, []);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("FYCode", sql.Int, getFYCode(req))
      .execute("sp_CottonQualityTestApproval_MD_Delete_GetAll");
    const data = (result.recordset || []).map((r) => ({ ...r, id: r.CQTApprovalCode ?? r.CQTCode }));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (CottonRejectLotPending.getList):", err);
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

    const b = req.body || {};
    const code = parseInt(req.params.code ?? b.CQTCode);
    if (!code) return sendError(res, "Select the Mill Lot No", 400);

    const companyCode = resolveCompany(req, b.CompanyCode);
    if (companyCode <= 0) return sendError(res, "Select the Company", 400);

    const grade = (b.Grade || "").toString().trim();
    if (!grade || grade === "--SELECT--") return sendError(res, "Select the Grade", 400);

    const pool = await getPool(req.headers.subdbname);
    tx = new sql.Transaction(pool);
    await tx.begin();

    const r = new sql.Request(tx);
    if (toInt(b.CQTApprovalCode) > 0) r.input("CQTApprovalCode", sql.Int, toInt(b.CQTApprovalCode));
    r.input("CQTApprovalDate", sql.DateTime, new Date());
    r.input("CQTCode", sql.Int, code);
    r.input("ArrivalCode", sql.Int, toInt(b.ArrivalCode));
    r.input("Grade", sql.NVarChar, grade);
    r.input("YarnType", sql.NVarChar, (b.YarnType || "HOSIERY").toString().trim());
    r.input("Remarks", sql.NVarChar, (b.Remarks || "").toString().trim());
    r.input("RatePerCandy", sql.Decimal(18, 3), toNum(b.RatePerCandy));
    r.input("Reject", sql.Int, rejectFlag);
    r.input("MD_Reject", sql.Int, rejectFlag);
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
    console.error("DB Error (CottonRejectLotPending.decide):", err);
    return sendError(res, err);
  }
};

// PUT /cotton-reject-lot-pending/approve/:code
export const approve = (req, res) => decide(req, res, 0);
// PUT /cotton-reject-lot-pending/reject/:code
export const reject = (req, res) => decide(req, res, 1);

// DELETE /cotton-reject-lot-pending/delete/:approvalCode?companyCode=
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const approvalCode = parseInt(req.params.approvalCode);
    if (!approvalCode) return sendError(res, "Invalid CQTApprovalCode", 400);
    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("CQTApprovalCode", sql.Int, approvalCode)
      .input("CompanyCode", sql.Int, resolveCompany(req))
      .execute("sp_CottonQualityTestApproval_MD_Delete");
    return sendSuccess(res, { CQTApprovalCode: approvalCode }, "The record is deleted");
  } catch (err) {
    if (err.number === 547) {
      return sendError(res, "This record is in use and can not be deleted", 409);
    }
    console.error("DB Error (CottonRejectLotPending.remove):", err);
    return sendError(res, err);
  }
};
