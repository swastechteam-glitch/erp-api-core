import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Bill Conformation / Invoice Confirmation (port of frmInvoiceConfirmation).
// Lists pending invoices; selecting one runs a customer credit check + shows
// the invoice lines, then Confirm commits sp_InvoiceConfirmation_Insert.
//
//   Pending : GET  /yarn-bill-confirmation/pending
//   Detail  : GET  /yarn-bill-confirmation/detail/:invoiceCode
//   Credit  : GET  /yarn-bill-confirmation/credit?customerCode=&netAmount=
//   Confirm : POST /yarn-bill-confirmation/confirm/:invoiceCode
//
// The desktop RDLC invoice viewer becomes the order-line grid on the client.
// CompanyCode / userId come from the JWT.
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

// GET /yarn-bill-confirmation/pending — invoices awaiting confirmation.
export const getPending = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const rs = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_Pending_InvoiceList");
    return sendSuccess(res, rs.recordset || []);
  } catch (err) {
    console.error("DB Error (YarnBillConfirmation.getPending):", err);
    return sendError(res, err);
  }
};

// GET /yarn-bill-confirmation/detail/:invoiceCode — invoice line details.
export const getDetail = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const invoiceCode = toInt(req.params.invoiceCode);
    if (invoiceCode <= 0) return sendError(res, "Invalid InvoiceCode", 400);
    const pool = await getPool(req.headers.subdbname);
    const rs = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("InvoiceCode", sql.Int, invoiceCode)
      .execute("sp_Invoice_GetByInvoiceCode");
    return sendSuccess(res, rs.recordset || []);
  } catch (err) {
    console.error("DB Error (YarnBillConfirmation.getDetail):", err);
    return sendError(res, err);
  }
};

// GET /yarn-bill-confirmation/credit?customerCode=&netAmount= — credit check.
// Mirrors CreditChecking(): unitTotal = Σ ledger ClosingAmount; curBill = invoice
// NetAmount; despatchPending = sp_Invoice_Despatch_Pending - curBill;
// total = unitTotal + curBill + despatchPending; available = creditLimit - total.
export const getCredit = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const companyCode = getCompanyCode(req);
    const customerCode = toInt(req.query.customerCode);
    const curBill = toNum(req.query.netAmount);
    const today = new Date();

    const [ledger, limit, despatch] = await Promise.all([
      pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("FromDate", sql.DateTime, today)
        .input("ToDate", sql.DateTime, today)
        .input("CustomerCode", sql.Int, customerCode)
        .execute("sp_CustomerLedger_Detailed"),
      pool.request().input("CustomerCode", sql.Int, customerCode).query("Select CreditLimit from tbl_Customer where CustomerCode = @CustomerCode"),
      pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("CustomerCode", sql.Int, customerCode)
        .execute("sp_Invoice_Despatch_Pending"),
    ]);

    const unitTotal = (ledger.recordset || []).reduce((s, r) => s + toNum(r.ClosingAmount), 0);
    const creditLimit = toNum(limit.recordset?.[0]?.CreditLimit);
    const pendingAmount = toNum(despatch.recordset?.[0]?.PendingAmount);
    const despatchPending = pendingAmount - curBill;
    const total = unitTotal + curBill + despatchPending;
    const available = creditLimit - total;

    return sendSuccess(res, {
      creditLimit,
      unitTotal,
      despatchPending,
      curBill,
      total,
      available,
      exceeds: available < 0,
    });
  } catch (err) {
    console.error("DB Error (YarnBillConfirmation.getCredit):", err);
    return sendError(res, err);
  }
};

// POST /yarn-bill-confirmation/confirm/:invoiceCode — sp_InvoiceConfirmation_Insert.
export const confirm = async (req, res) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    if (!userId) return sendError(res, "Missing user context (userId)", 400);
    const invoiceCode = toInt(req.params.invoiceCode);
    if (invoiceCode <= 0) return sendError(res, "Invalid InvoiceCode", 400);

    const pool = await getPool(req.headers.subdbname);
    tx = new sql.Transaction(pool);
    await tx.begin();
    await new sql.Request(tx)
      .input("InvoiceCode", sql.Int, invoiceCode)
      .input("InvoiceConfDate", sql.DateTime, new Date())
      .input("InvoiceConfUser", sql.Int, toInt(userId))
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_InvoiceConfirmation_Insert");
    await tx.commit();
    return sendSuccess(res, { InvoiceCode: invoiceCode }, "The Invoice is confirmed");
  } catch (err) {
    if (tx) { try { await tx.rollback(); } catch (_) {} }
    console.error("DB Error (YarnBillConfirmation.confirm):", err);
    return sendError(res, err);
  }
};
