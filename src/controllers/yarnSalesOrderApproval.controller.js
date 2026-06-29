import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Yarn Sales Order Approval (port of WinForms frmSalesOrderApproval).
// An approval workflow (NOT add/edit/delete): list PENDING sales orders, pick
// one to view its line details + customer credit check, then Approve.
//
//   Pending : GET  /yarn-sales-order-approval/pending
//   Detail  : GET  /yarn-sales-order-approval/detail/:soCode
//   Credit  : GET  /yarn-sales-order-approval/credit?customerCode=&amount=
//   Approve : POST /yarn-sales-order-approval/approve/:soCode
//
// The desktop RDLC report viewer is replaced by the order-detail grid
// (sp_SalesOrderDetails_GetAll). CompanyCode / userId come from the JWT.
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

// GET /yarn-sales-order-approval/pending — orders awaiting approval.
export const getPending = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const rs = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_Pending_SalesOrderApproval_Multi");
    return sendSuccess(res, rs.recordset || []);
  } catch (err) {
    console.error("DB Error (YarnSalesOrderApproval.getPending):", err);
    return sendError(res, err);
  }
};

// GET /yarn-sales-order-approval/detail/:soCode — order line details to preview.
export const getDetail = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const soCode = toInt(req.params.soCode);
    if (soCode <= 0) return sendError(res, "Invalid SOCode", 400);
    const pool = await getPool(req.headers.subdbname);
    const rs = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("SOCode", sql.Int, soCode)
      .execute("sp_SalesOrderDetails_GetAll");
    return sendSuccess(res, rs.recordset || []);
  } catch (err) {
    console.error("DB Error (YarnSalesOrderApproval.getDetail):", err);
    return sendError(res, err);
  }
};

// GET /yarn-sales-order-approval/credit?customerCode=&amount= — credit check.
// Mirrors CreditChecking(): total = Σ ledger ClosingAmount (all companies),
// curBill = the order Amount, available = creditLimit - (total + curBill).
export const getCredit = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const customerCode = toInt(req.query.customerCode);
    const curBill = toNum(req.query.amount);
    const today = new Date();

    const [ledger, limit] = await Promise.all([
      pool
        .request()
        .input("FromDate", sql.DateTime, today)
        .input("ToDate", sql.DateTime, today)
        .input("CustomerCode", sql.Int, customerCode)
        .execute("sp_CustomerLedger_Detailed"),
      pool.request().input("CustomerCode", sql.Int, customerCode).query("Select CreditLimit from tbl_Customer where CustomerCode = @CustomerCode"),
    ]);

    const total = (ledger.recordset || []).reduce((s, r) => s + toNum(r.ClosingAmount), 0);
    const creditLimit = toNum(limit.recordset?.[0]?.CreditLimit);
    const available = creditLimit - (total + curBill);
    return sendSuccess(res, { creditLimit, total, curBill, available, exceeds: available < 0 });
  } catch (err) {
    console.error("DB Error (YarnSalesOrderApproval.getCredit):", err);
    return sendError(res, err);
  }
};

// POST /yarn-sales-order-approval/approve/:soCode — sp_SalesOrder_Approval.
export const approve = async (req, res) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    if (!userId) return sendError(res, "Missing user context (userId)", 400);
    const soCode = toInt(req.params.soCode);
    if (soCode <= 0) return sendError(res, "Invalid SOCode", 400);

    const pool = await getPool(req.headers.subdbname);
    tx = new sql.Transaction(pool);
    await tx.begin();
    await new sql.Request(tx)
      .input("SOCode", sql.Int, soCode)
      .input("ApprovalUserCode", sql.Int, toInt(userId))
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_SalesOrder_Approval");
    await tx.commit();
    return sendSuccess(res, { SOCode: soCode }, "The Sales Order is approved");
  } catch (err) {
    if (tx) { try { await tx.rollback(); } catch (_) {} }
    console.error("DB Error (YarnSalesOrderApproval.approve):", err);
    return sendError(res, err);
  }
};
