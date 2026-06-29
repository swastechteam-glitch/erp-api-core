import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Duplicate Bill Print (port of WinForms frmInvoiceDuplicatePrint).
// Filter by Customer / Bill No (+ GST toggle, Invoice Copy, and an Invoice /
// Pre-Print / Export mode), list matching invoices, then View one to render a
// browser-printable invoice (the desktop RDLC report becomes HTML).
//
//   Options : GET /yarn-duplicate-bill-print/options
//   List    : GET /yarn-duplicate-bill-print/lists?customerCode=&invoiceCode=
//   Report  : GET /yarn-duplicate-bill-print/report/:invoiceCode
//
// CompanyCode / FYCode come from the JWT (Company is fixed, as in the VB).
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getFYCode = (req) => toInt(req.headers.FYCode);

const opt = (rs, valueKey, labelKey) =>
  (rs.recordset || []).map((r) => ({ ...r, value: r[valueKey], label: r[labelKey] }));

// GET /yarn-duplicate-bill-print/options — filter dropdowns.
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const companyCode = getCompanyCode(req);
    const fyCode = getFYCode(req);

    const [customers, billNos, companies] = await Promise.all([
      pool.request().query("Select CustomerName, CustomerCode from tbl_Customer Where Yarn=1 AND ApprovalCode=1 Order BY CustomerName"),
      pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("FyCode", sql.Int, fyCode)
        .query("SELECT StrBillNo, InvoiceCode, BillDate, BillNo, CustomerName FROM vw_Invoice Where CompanyCode = @CompanyCode AND FyCode = @FyCode"),
      pool.request().input("CompanyCode", sql.Int, companyCode).execute("sp_Company_GetAll"),
    ]);

    return sendSuccess(res, {
      customers: opt(customers, "CustomerCode", "CustomerName"),
      billNos: opt(billNos, "InvoiceCode", "StrBillNo"),
      companies: opt(companies, "CompanyCode", "ShortName"),
      invoiceCopies: [
        "ORIGINAL FOR BUYER",
        "DUPLICATE FOR TRANSPORTER",
        "TRIPLICATE FOR ASSESSEE",
        "EXTRA COPY",
        "DUPLICATE COPY",
      ].map((label) => ({ value: label, label })),
      companyCode,
    });
  } catch (err) {
    console.error("DB Error (YarnDuplicateBillPrint.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /yarn-duplicate-bill-print/lists?customerCode=&invoiceCode= — matching bills.
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const request = pool
      .request()
      .input("FYCode", sql.Int, getFYCode(req))
      .input("CompanyCode", sql.Int, getCompanyCode(req));
    const customerCode = toInt(req.query.customerCode);
    const invoiceCode = toInt(req.query.invoiceCode);
    if (customerCode > 0) request.input("CustomerCode", sql.Int, customerCode);
    if (invoiceCode > 0) request.input("InvoiceCode", sql.Int, invoiceCode);
    const rs = await request.execute("sp_Duplicate_InvoicePrint");
    return sendSuccess(res, rs.recordset || []);
  } catch (err) {
    console.error("DB Error (YarnDuplicateBillPrint.getList):", err);
    return sendError(res, err);
  }
};

// GET /yarn-duplicate-bill-print/report/:invoiceCode — data for the printable invoice.
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
    console.error("DB Error (YarnDuplicateBillPrint.getReport):", err);
    return sendError(res, err);
  }
};
