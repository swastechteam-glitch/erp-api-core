import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Waste Invoice Approval (port of the WinForms frmWasteInvoiceApproval)
//   Approve / Reject pending waste invoices, with a small edit panel to fix the
//   Date / Vehicle / Permit No / Delivery Address before approving.
//
//   - GET    /waste-invoice-approval/options           -> { vehicles }
//   - GET    /waste-invoice-approval/pending            -> vw_WasteInvoiceApproval_Pending (?fromDate&toDate&customerCode, paginated)
//   - GET    /waste-invoice-approval/detail/:code       -> tbl_WasteInvoice header (for the edit panel)
//   - PUT    /waste-invoice-approval/update/:code       -> sp_WasteInvoice_Update (date/vehicle/permit/delivery)
//   - POST   /waste-invoice-approval/approve            -> sp_WasteInvoice_Approval_Insert
//   - DELETE /waste-invoice-approval/reject/:code       -> sp_WasteInvoice_Delete
//
// The embedded RDLC report viewer + invoice-copy print are NOT ported.
// Company from req.headers.companyCode, FY from req.headers.FYCode, user context
// from req.headers.userId / nodeCode.
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getFYCode = (req) => toInt(req.headers.FYCode);
const todayStr = () => new Date().toISOString().slice(0, 10);

// GET /waste-invoice-approval/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    let vehicles = [];
    try {
      const v = await pool
        .request()
        .input("VehicleTypecode", sql.Int, 1)
        .input("Status", sql.Int, 1)
        .execute("sp_Vehicle_GetAll");
      vehicles = v.recordset.map((x) => ({ value: x.VehicleCode, label: x.VehicleName }));
    } catch (e) {
      console.warn("WasteInvoiceApproval options: sp_Vehicle_GetAll failed", e.message);
    }
    return sendSuccess(res, { vehicles });
  } catch (err) {
    console.error("DB Error (getOptions WasteInvoiceApproval):", err);
    return sendError(res, err);
  }
};

// GET /waste-invoice-approval/pending  (filtered + paginated)
export const getPending = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .query("Select * from vw_WasteInvoiceApproval_Pending Where CompanyCode = @CompanyCode");

    const fromDate = req.query.fromDate ? new Date(req.query.fromDate) : null;
    const toDate = req.query.toDate ? new Date(req.query.toDate) : null;
    const customerCode = toInt(req.query.customerCode);

    let data = result.recordset.map((r) => ({ ...r, id: r.WasteInvoiceCode }));
    data = data.filter((r) => {
      if (fromDate && r.WasteInvoiceDate && new Date(r.WasteInvoiceDate) < fromDate) return false;
      if (toDate && r.WasteInvoiceDate && new Date(r.WasteInvoiceDate) > toDate) return false;
      if (customerCode > 0 && toInt(r.CustomerCode) !== customerCode) return false;
      return true;
    });
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getPending WasteInvoiceApproval):", err);
    return sendError(res, err);
  }
};

// GET /waste-invoice-approval/detail/:code  -> tbl_WasteInvoice (edit panel)
export const getDetail = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (!code) return sendError(res, "Invalid WasteInvoiceCode", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("WasteInvoiceCode", sql.Int, code)
      .query("Select * from tbl_WasteInvoice where CompanyCode = @CompanyCode AND WasteInvoiceCode = @WasteInvoiceCode");
    const row = r.recordset?.[0];
    if (!row) return sendError(res, "Waste Invoice not found", 404);
    return sendSuccess(res, row);
  } catch (err) {
    console.error("DB Error (getDetail WasteInvoiceApproval):", err);
    return sendError(res, err);
  }
};

// PUT /waste-invoice-approval/update/:code  -> sp_WasteInvoice_Update
export const updateDetail = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (!code) return sendError(res, "Invalid WasteInvoiceCode", 400);
    const body = req.body || {};
    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("WasteInvoiceCode", sql.Int, code)
      .input("WasteInvoiceDate", sql.DateTime, new Date(body.WasteInvoiceDate || todayStr()))
      .input("VehicleCode", sql.Int, toInt(body.VehicleCode))
      .input("DeliveryDetails", sql.NVarChar, String(body.DeliveryDetails || ""))
      .input("PermitNo", sql.NVarChar, String(body.PermitNo || ""))
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_WasteInvoice_Update");
    return sendSuccess(res, { WasteInvoiceCode: code }, "The record is updated", 200);
  } catch (err) {
    console.error("DB Error (updateDetail WasteInvoiceApproval):", err);
    return sendError(res, err);
  }
};

// POST /waste-invoice-approval/approve  -> sp_WasteInvoice_Approval_Insert
export const approve = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    if (!req.headers.userId || !req.headers.nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);
    const body = req.body || {};
    const code = toInt(body.WasteInvoiceCode);
    if (!code) return sendError(res, "Select the Waste Invoice", 400);
    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("ApprovalDate", sql.DateTime, new Date(body.ApprovalDate || todayStr()))
      .input("WasteInvoiceCode", sql.Int, code)
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("User", sql.Int, toInt(req.headers.userId))
      .input("Node", sql.Int, toInt(req.headers.nodeCode))
      .input("FYCode", sql.Int, getFYCode(req))
      .execute("sp_WasteInvoice_Approval_Insert");
    return sendSuccess(res, { WasteInvoiceCode: code }, "The record is Approved", 201);
  } catch (err) {
    console.error("DB Error (approve WasteInvoiceApproval):", err);
    return sendError(res, err);
  }
};

// DELETE /waste-invoice-approval/reject/:code  -> sp_WasteInvoice_Delete
export const reject = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    if (!req.headers.userId || !req.headers.nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);
    const code = toInt(req.params.code);
    if (!code) return sendError(res, "Invalid WasteInvoiceCode", 400);
    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("WasteInvoiceCode", sql.Int, code)
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("Del_User", sql.Int, toInt(req.headers.userId))
      .input("Del_Node", sql.Int, toInt(req.headers.nodeCode))
      .execute("sp_WasteInvoice_Delete");
    return sendSuccess(res, { WasteInvoiceCode: code }, "The record is Rejected");
  } catch (err) {
    console.error("DB Error (reject WasteInvoiceApproval):", err);
    return sendError(res, err);
  }
};
