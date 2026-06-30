import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Yarn Sales Return Approval (port of WinForms frmSalesReturnApproval).
// An approval workflow (NOT add/edit/delete): list the sales returns awaiting
// approval, pick one to view its line details, then Approve or Reject (both go
// through sp_SalesReturnApproval_Insert, distinguished by @Reject 0/1).
//
//   Pending : GET  /yarn-sales-return-approval/pending      (sp_SalesReturnApproval)
//   Detail  : GET  /yarn-sales-return-approval/detail/:code (sp_SalesReturnDetails_GetAll)
//   Approve : POST /yarn-sales-return-approval/approve/:code (sp_SalesReturnApproval_Insert @Reject=0)
//   Reject  : POST /yarn-sales-return-approval/reject/:code  (sp_SalesReturnApproval_Insert @Reject=1)
//
// The desktop RDLC report viewer (rptSalesReturn.rdlc) is replaced by the
// detail grid (sp_SalesReturnDetails_GetAll). The VB loads a Company combo but
// the grid is actually filtered by the logged-in company (int_CompanyCode), so
// CompanyCode / FYCode / userId / nodeCode all come from the JWT headers — same
// as the globals the WinForms used. Approve/Reject carry the optional Remarks
// and the approval date (defaults to today).
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const str = (v) => (v == null ? "" : String(v));
const D = (v) => (v ? new Date(v) : new Date());
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getFYCode = (req) => toInt(req.headers.FYCode);
const getUserId = (req) => toInt(req.headers.userId);
const getNodeCode = (req) => toInt(req.headers.nodeCode);

// GET /yarn-sales-return-approval/pending — returns awaiting approval (the grid).
export const getPending = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const rs = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_SalesReturnApproval");
    const data = (rs.recordset || [])
      .map((r) => ({ ...r, id: r.SalesReturnCode }))
      .sort((a, b) => Number(b.SalesReturnCode) - Number(a.SalesReturnCode));
    return sendSuccess(res, data);
  } catch (err) {
    console.error("DB Error (YarnSalesReturnApproval.getPending):", err);
    return sendError(res, err);
  }
};

// GET /yarn-sales-return-approval/detail/:code — line details to preview (Rpt_View).
export const getDetail = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (code <= 0) return sendError(res, "Invalid SalesReturnCode", 400);
    const pool = await getPool(req.headers.subdbname);
    const rs = await pool
      .request()
      .input("SalesReturnCode", sql.Int, code)
      .execute("sp_SalesReturnDetails_GetAll");
    return sendSuccess(res, rs.recordset || []);
  } catch (err) {
    console.error("DB Error (YarnSalesReturnApproval.getDetail):", err);
    return sendError(res, err);
  }
};

// Shared approve/reject (sp_SalesReturnApproval_Insert). `reject` is 0 or 1.
const decide = async (req, res, reject) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = getUserId(req);
    if (!userId) return sendError(res, "Missing user context (userId)", 400);
    const code = toInt(req.params.code);
    if (code <= 0) return sendError(res, "Select the SalesReturn", 400);

    const pool = await getPool(req.headers.subdbname);
    tx = new sql.Transaction(pool);
    await tx.begin();
    await new sql.Request(tx)
      .input("ApprovalDate", sql.DateTime, D(req.body?.ApprovalDate))
      .input("SalesReturnCode", sql.Int, code)
      .input("Remarks", sql.NVarChar(500), str(req.body?.Remarks).trim())
      .input("Reject", sql.Int, reject)
      .input("FYCode", sql.Int, getFYCode(req))
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("User", sql.Int, userId)
      .input("Node", sql.Int, getNodeCode(req))
      .execute("sp_SalesReturnApproval_Insert");
    await tx.commit();
    return sendSuccess(
      res,
      { SalesReturnCode: code },
      reject ? "Sales Return Rejected" : "Sales Return Approved",
    );
  } catch (err) {
    if (tx) { try { await tx.rollback(); } catch (_) {} }
    console.error("DB Error (YarnSalesReturnApproval.decide):", err);
    return sendError(res, err);
  }
};

// POST /yarn-sales-return-approval/approve/:code
export const approve = (req, res) => decide(req, res, 0);

// POST /yarn-sales-return-approval/reject/:code
export const reject = (req, res) => decide(req, res, 1);
