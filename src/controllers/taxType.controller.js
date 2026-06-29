import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Tax Type master (port of the WinForms frmTaxType / frmTaxTypeDetails)
//   - List   : EXEC sp_TaxType_GetAll
//   - Create : EXEC sp_TaxType_AddEdit   (@C_User / @C_Node, no code)
//   - Update : EXEC sp_TaxType_AddEdit   (@E_User / @E_Node / @TaxTypeCode)
//   - Delete : EXEC sp_TaxType_Delete
// The VB form (btnSave_Click) validates Tax Type, Printing Name (TaxName) and
// Invoice Heading as mandatory and maps UK_TaxType_tbl_TaxType to
// "Already exist the TaxType Name". The Sales Type combo is fed from
// sp_SalesType_GetAll (cmbSalesType.RecordSource). PackingChargesQtyKgs is the
// combo index: QTY -> 0, KGS -> 1. Several rate columns (TNGST/CESS/BED/AED/
// Surcharge) are hidden on the form, so they default to 0 here.
// Status combo: ACTIVE -> 1, INACTIVE -> 0. Mirrors salesType.controller.js.
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

const toBit = (v) => {
  if (v === true || v === 1 || v === "1") return 1;
  if (typeof v === "string" && v.trim().toUpperCase() === "ACTIVE") return 1;
  return 0;
};

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};

const toNum = (v) => {
  const n = parseFloat(v);
  return Number.isNaN(n) ? 0 : n;
};

// GET /tax-type/lists  -> mirrors frmTaxTypeDetails list
export const getTaxTypeList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_TaxType_GetAll");

    const data = (result.recordset || []).map((item) => ({
      ...item,
      id: item.TaxTypeCode,
      StatusText: STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getTaxTypeList):", err);
    return sendError(res, err);
  }
};

// GET /tax-type/list/:taxTypeCode  -> single record (filtered from GetAll)
export const getTaxTypeById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = toInt(req.params.taxTypeCode);
    if (!code) return sendError(res, "Invalid TaxTypeCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_TaxType_GetAll");
    const row = (result.recordset || []).find(
      (r) => toInt(r.TaxTypeCode) === code
    );

    if (!row) return sendError(res, "Tax Type not found", 404);
    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getTaxTypeById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_TaxType_AddEdit (btnSave_Click)
const saveOrUpdateTaxType = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const taxType = (body.TaxType || "").trim();
    const taxName = (body.TaxName || "").trim();
    const invoiceHeading = (body.InvoiceHeadingName || "").trim();

    // Same validation the form enforces (btnSave_Click).
    if (!taxType) return sendError(res, "Tax Type should not be empty", 400);
    if (!taxName)
      return sendError(res, "Printing Name should not be empty", 400);
    if (!invoiceHeading)
      return sendError(res, "Invoice Heading Name should not be empty", 400);

    const code = isEdit
      ? toInt(req.params.taxTypeCode ?? body.TaxTypeCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid TaxTypeCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // The proc uses C_* params for a new row and E_* params for an edit.
    if (isEdit) {
      request.input("E_User", sql.Int, toInt(userId));
      request.input("E_Node", sql.Int, toInt(nodeCode));
      request.input("TaxTypeCode", sql.Int, code);
    } else {
      request.input("C_User", sql.Int, toInt(userId));
      request.input("C_Node", sql.Int, toInt(nodeCode));
    }

    request.input("SalesTypeCode", sql.Int, toInt(body.SalesTypeCode));
    request.input("TaxType", sql.NVarChar, taxType);
    request.input("TaxName", sql.NVarChar, taxName);
    request.input("InvoiceHeadingName", sql.NVarChar, invoiceHeading);
    request.input("InvoiceNoPrefix", sql.NVarChar, (body.InvoiceNoPrefix || "").trim());

    request.input("CGST", sql.Decimal(18, 3), toNum(body.CGST));
    request.input("SGST", sql.Decimal(18, 3), toNum(body.SGST));
    request.input("IGST", sql.Decimal(18, 3), toNum(body.IGST));
    request.input("Insurance", sql.Decimal(18, 3), toNum(body.Insurance));

    // Hidden-on-form rate columns — default to 0 (kept for proc compatibility).
    request.input("TNGST", sql.Decimal(18, 3), toNum(body.TNGST));
    request.input("CESS", sql.Decimal(18, 3), toNum(body.CESS));
    request.input("Bed", sql.Decimal(18, 3), toNum(body.Bed));
    request.input("Aed", sql.Decimal(18, 3), toNum(body.Aed));
    request.input("Surcharge", sql.Decimal(18, 3), toNum(body.Surcharge));

    request.input("Freight", sql.Decimal(18, 3), toNum(body.Freight));
    request.input("FabricCharge", sql.Decimal(18, 3), toNum(body.FabricCharge));
    request.input("PackingCharges", sql.Decimal(18, 3), toNum(body.PackingCharges));
    request.input("PackingChargesQtyKgs", sql.Int, toInt(body.PackingChargesQtyKgs));
    // Default to ACTIVE when Status is omitted (VB combo defaults to ACTIVE).
    request.input("Status", sql.Bit, body.Status === undefined ? 1 : toBit(body.Status));

    await request.execute("sp_TaxType_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique index -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_TaxType_tbl_TaxType")) {
      return sendError(res, "Already exist the TaxType Name", 409);
    }
    console.error("DB Error (saveOrUpdateTaxType):", err);
    return sendError(res, err);
  }
};

// POST /tax-type/create        -> create
export const createTaxType = (req, res) =>
  saveOrUpdateTaxType(req, res, false);

// PUT  /tax-type/update/:code  -> update
export const updateTaxType = (req, res) =>
  saveOrUpdateTaxType(req, res, true);

// DELETE /tax-type/delete/:taxTypeCode -> EXEC sp_TaxType_Delete
export const deleteTaxType = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = toInt(req.params.taxTypeCode);
    if (!code) return sendError(res, "Invalid TaxTypeCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("TaxTypeCode", sql.Int, code)
      .execute("sp_TaxType_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the TaxType!", 409);
    }
    console.error("DB Error (deleteTaxType):", err);
    return sendError(res, err);
  }
};

// --- Dropdown lookups (mirror the cmb* RecordSource calls in Bind_Data) ------

// GET /tax-type/sales-types -> cmbSalesType (EXEC sp_SalesType_GetAll)
export const getSalesTypeOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_SalesType_GetAll");
    const data = (result.recordset || []).map((item) => ({
      ...item,
      value: item.SalesTypeCode,
      label: item.SalesType,
    }));
    return sendSuccess(res, data);
  } catch (err) {
    console.error("DB Error (getSalesTypeOptions):", err);
    return sendError(res, err);
  }
};
