import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Invoice Cancel — port of WinForms frmInvoiceCancel. List the invoices that
// can be cancelled, View the selected invoice (the desktop RDLC preview becomes
// HTML), then Cancel the bill (sp_InvoiceCancel_Insert, transactional).
// There is no add/edit in this form — it is a list + view + cancel screen.
//
//   List   : GET  /yarn-invoice-cancel/lists
//   Report : GET  /yarn-invoice-cancel/report/:invoiceCode
//   Cancel : POST /yarn-invoice-cancel/cancel/:invoiceCode
//
// CompanyCode / userId / nodeCode come from the JWT headers.
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const str = (v) => (v == null ? "" : String(v));
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getUserId = (req) => toInt(req.headers.userId);
const getNodeCode = (req) => toInt(req.headers.nodeCode);

// GET /yarn-invoice-cancel/lists — invoices eligible for cancellation.
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const rs = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_Cancel_InvoiceList");
    return sendSuccess(res, rs.recordset || []);
  } catch (err) {
    console.error("DB Error (InvoiceCancel.getList):", err);
    return sendError(res, err);
  }
};

// GET /yarn-invoice-cancel/report/:invoiceCode — data for the invoice preview.
export const getReport = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const companyCode = getCompanyCode(req);
    const invoiceCode = toInt(req.params.invoiceCode);
    if (invoiceCode <= 0) return sendError(res, "Invalid InvoiceCode", 400);

    const [header, details, company, multi] = await Promise.all([
      pool.request().input("CompanyCode", sql.Int, companyCode).input("InvoiceCode", sql.Int, invoiceCode).query("Select * from vw_Invoice where CompanyCode = @CompanyCode AND InvoiceCode = @InvoiceCode"),
      pool.request().input("CompanyCode", sql.Int, companyCode).input("InvoiceCode", sql.Int, invoiceCode).execute("sp_Invoice_GetByInvoiceCode"),
      pool.request().input("CompanyCode", sql.Int, companyCode).execute("sp_Company_GetAll"),
      pool.request().input("CompanyCode", sql.Int, companyCode).input("InvoiceCode", sql.Int, invoiceCode).execute("sp_Invoice_GetByInvoiceCode_Multi"),
    ]);

    return sendSuccess(res, {
      header: header.recordset?.[0] || {},
      details: details.recordset || [],
      company: company.recordset?.[0] || {},
      multi: multi.recordset || [],
    });
  } catch (err) {
    console.error("DB Error (InvoiceCancel.getReport):", err);
    return sendError(res, err);
  }
};

// POST /yarn-invoice-cancel/cancel/:invoiceCode — cancel the bill.
export const cancel = async (req, res) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const invoiceCode = toInt(req.params.invoiceCode);
    if (invoiceCode <= 0) return sendError(res, "Invalid InvoiceCode", 400);

    tx = new sql.Transaction(pool);
    await tx.begin();
    await new sql.Request(tx)
      .input("InvoiceCode", sql.Int, invoiceCode)
      .input("CancelUserCode", sql.Int, getUserId(req))
      .input("CancelNodeCode", sql.Int, getNodeCode(req))
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_InvoiceCancel_Insert");
    await tx.commit();

    return sendSuccess(res, { cancelled: invoiceCode });
  } catch (err) {
    if (tx) await tx.rollback().catch(() => {});
    console.error("DB Error (InvoiceCancel.cancel):", err);
    const msg = str(err?.message);
    if (/REFERENCE|conflict|FK_/i.test(msg)) {
      return sendError(res, "This invoice is referenced elsewhere and cannot be cancelled.", 409);
    }
    return sendError(res, err);
  }
};
