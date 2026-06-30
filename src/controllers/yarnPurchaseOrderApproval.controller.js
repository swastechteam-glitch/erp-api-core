import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Yarn Purchase Order Approval (port of WinForms frmYarnPurchaseOrderApproval).
// An approval workflow (NOT add/edit/delete): list the purchase orders awaiting
// approval (sp_YarnPurchaseOrder_GetAll @Approval=0 @Reject=0), pick one to view
// its line details, then Approve (sp_YarnPurchaseOrder_Approval) or Reject
// (sp_YarnPurchaseOrder_Reject).
//
//   Pending : GET  /yarn-purchase-order-approval/pending        (sp_YarnPurchaseOrder_GetAll)
//   Detail  : GET  /yarn-purchase-order-approval/detail/:code   (header + sp_YarnPurchaseOrderDetails_GetAll)
//   Approve : POST /yarn-purchase-order-approval/approve/:code  (sp_YarnPurchaseOrder_Approval)
//   Reject  : POST /yarn-purchase-order-approval/reject/:code   (sp_YarnPurchaseOrder_Reject)
//
// The desktop RDLC report viewer (rptYarnPurchaseOrder.rdlc) is replaced by the
// detail grid. The VB loads a Company combo but the grid is filtered by the
// logged-in company, so CompanyCode / FYCode / userId all come from the JWT —
// same as the globals the WinForms used. Approve/Reject carry the decision date
// (defaults to today).
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const D = (v) => (v ? new Date(v) : new Date());
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getFYCode = (req) => toInt(req.headers.FYCode);
const getUserId = (req) => toInt(req.headers.userId);

// GET /yarn-purchase-order-approval/pending — orders awaiting approval (the grid).
export const getPending = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const rs = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("FYCode", sql.Int, getFYCode(req))
      .input("Approval", sql.Int, 0)
      .input("Reject", sql.Int, 0)
      .execute("sp_YarnPurchaseOrder_GetAll");
    const data = (rs.recordset || [])
      .map((r) => ({ ...r, id: r.YarnPurchaseOrderCode }))
      .sort((a, b) => Number(b.YarnPurchaseOrderCode) - Number(a.YarnPurchaseOrderCode));
    return sendSuccess(res, data);
  } catch (err) {
    console.error("DB Error (YarnPurchaseOrderApproval.getPending):", err);
    return sendError(res, err);
  }
};

// GET /yarn-purchase-order-approval/detail/:code — header + line details (Rpt_View).
export const getDetail = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (code <= 0) return sendError(res, "Invalid YarnPurchaseOrderCode", 400);
    const pool = await getPool(req.headers.subdbname);

    const [header, details, company] = await Promise.all([
      pool.request().input("Code", sql.Int, code).query("Select * from vw_YarnPurchaseOrder where YarnPurchaseOrderCode = @Code"),
      pool.request().input("YarnPurchaseOrderCode", sql.Int, code).execute("sp_YarnPurchaseOrderDetails_GetAll"),
      pool.request().input("CompanyCode", sql.Int, getCompanyCode(req)).execute("sp_Company_GetAll"),
    ]);

    return sendSuccess(res, {
      company: company.recordset?.[0] || {},
      header: header.recordset?.[0] || {},
      details: details.recordset || [],
    });
  } catch (err) {
    console.error("DB Error (YarnPurchaseOrderApproval.getDetail):", err);
    return sendError(res, err);
  }
};

// POST /yarn-purchase-order-approval/approve/:code — sp_YarnPurchaseOrder_Approval.
export const approve = async (req, res) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = getUserId(req);
    if (!userId) return sendError(res, "Missing user context (userId)", 400);
    const code = toInt(req.params.code);
    if (code <= 0) return sendError(res, "Select the Yarn Purchase Order", 400);

    const pool = await getPool(req.headers.subdbname);
    tx = new sql.Transaction(pool);
    await tx.begin();
    await new sql.Request(tx)
      .input("ApprovalDate", sql.DateTime, D(req.body?.ApprovalDate))
      .input("YarnPurchaseOrderCode", sql.Int, code)
      .input("ApprovalUserCode", sql.Int, userId)
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_YarnPurchaseOrder_Approval");
    await tx.commit();
    return sendSuccess(res, { YarnPurchaseOrderCode: code }, "Yarn Purchase Order Approved");
  } catch (err) {
    if (tx) { try { await tx.rollback(); } catch (_) {} }
    console.error("DB Error (YarnPurchaseOrderApproval.approve):", err);
    return sendError(res, err);
  }
};

// POST /yarn-purchase-order-approval/reject/:code — sp_YarnPurchaseOrder_Reject.
export const reject = async (req, res) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = getUserId(req);
    if (!userId) return sendError(res, "Missing user context (userId)", 400);
    const code = toInt(req.params.code);
    if (code <= 0) return sendError(res, "Select the Yarn Purchase Order", 400);

    const pool = await getPool(req.headers.subdbname);
    tx = new sql.Transaction(pool);
    await tx.begin();
    await new sql.Request(tx)
      .input("RejectDate", sql.DateTime, D(req.body?.RejectDate || req.body?.ApprovalDate))
      .input("YarnPurchaseOrderCode", sql.Int, code)
      .input("RejectUserCode", sql.Int, userId)
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_YarnPurchaseOrder_Reject");
    await tx.commit();
    return sendSuccess(res, { YarnPurchaseOrderCode: code }, "Yarn Purchase Order Rejected");
  } catch (err) {
    if (tx) { try { await tx.rollback(); } catch (_) {} }
    console.error("DB Error (YarnPurchaseOrderApproval.reject):", err);
    return sendError(res, err);
  }
};
