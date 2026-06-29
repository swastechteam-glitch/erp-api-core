import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Invoice Delete (port of WinForms frmInvoiceDelete).
// A list + DELETE only screen — the VB disables Edit (EditVisible=False) and
// the Add handler is commented out, so the only action is deleting an invoice.
//
//   List   : GET    /yarn-invoice-delete/lists
//   Delete : DELETE /yarn-invoice-delete/:invoiceCode
//
// CompanyCode / userId / nodeCode come from the JWT.
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const getCompanyCode = (req) => toInt(req.headers.companyCode);

// GET /yarn-invoice-delete/lists — deletable invoices.
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const rs = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_Invoice_Delete_GetAll");
    return sendSuccess(res, rs.recordset || []);
  } catch (err) {
    console.error("DB Error (YarnInvoiceDelete.getList):", err);
    return sendError(res, err);
  }
};

// DELETE /yarn-invoice-delete/:invoiceCode — sp_Invoice_Delete.
export const remove = async (req, res) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const invoiceCode = toInt(req.params.invoiceCode);
    if (invoiceCode <= 0) return sendError(res, "Invalid InvoiceCode", 400);

    const pool = await getPool(req.headers.subdbname);
    tx = new sql.Transaction(pool);
    await tx.begin();
    await new sql.Request(tx)
      .input("InvoiceCode", sql.Int, invoiceCode)
      .input("Del_User", sql.Int, toInt(userId))
      .input("Del_Node", sql.Int, toInt(nodeCode))
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_Invoice_Delete");
    await tx.commit();
    return sendSuccess(res, { InvoiceCode: invoiceCode }, "The record is deleted");
  } catch (err) {
    if (tx) { try { await tx.rollback(); } catch (_) {} }
    if (err.message && err.message.includes("FK_"))
      return sendError(res, "You can not delete the Invoice!", 409);
    console.error("DB Error (YarnInvoiceDelete.remove):", err);
    return sendError(res, err);
  }
};
