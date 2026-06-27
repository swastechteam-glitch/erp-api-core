import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";
import { isDuplicateByGetAll } from "../utils/duplicateCheck.js";

// ---------------------------------------------------------------------------
// Tax master (port of the WinForms frmTax)
//   - List   : EXEC sp_Tax_GetAll
//   - Create : EXEC sp_Tax_AddEdit  (without @TaxCode)
//   - Update : EXEC sp_Tax_AddEdit  (with @TaxCode)
//   - Delete : EXEC sp_Tax_Delete
// AddEdit params: @User, @Node, [@TaxCode], @Fixed, @TaxName, @Tax, @Status.
// (Fixed is a hidden flag in the form; defaults to false.)
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

const toBit = (v) => {
  if (v === true || v === 1 || v === "1") return 1;
  if (typeof v === "string" && v.trim().toUpperCase() === "ACTIVE") return 1;
  return 0;
};

// GET /tax/lists  -> EXEC sp_Tax_GetAll
export const getTaxList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_Tax_GetAll");

    const data = result.recordset
      // Newest first (the SP doesn't guarantee order, so sort here).
      .sort((a, b) => b.TaxCode - a.TaxCode)
      .map((item) => ({
        ...item,
        id: item.TaxCode,
        StatusText: STATUS_LABEL(item.Status),
      }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getTaxList):", err);
    return sendError(res, err);
  }
};

// GET /tax/list/:taxCode  -> single record (filtered from GetAll)
export const getTaxById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.taxCode);
    if (!code) return sendError(res, "Invalid TaxCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_Tax_GetAll");
    const row = result.recordset.find((r) => r.TaxCode === code);

    if (!row) return sendError(res, "Tax not found", 404);

    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getTaxById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_Tax_AddEdit (btnSave_Click)
const saveOrUpdateTax = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const name = (body.TaxName || "").trim();
    const tax = isNaN(parseFloat(body.Tax)) ? 0 : parseFloat(body.Tax);

    // Same validation the form enforces: name is mandatory.
    if (!name)
      return sendError(res, "Tax Name should not be empty", 400);

    const code = isEdit ? parseInt(req.params.taxCode ?? body.TaxCode) : null;
    if (isEdit && !code)
      return sendError(res, "Invalid TaxCode for update", 400);

    const pool = await getPool(req.headers.subdbname);

    // Reject a duplicate name BEFORE saving.
    if (
      await isDuplicateByGetAll(pool, {
        proc: "sp_Tax_GetAll",
        nameField: "TaxName",
        codeField: "TaxCode",
        name,
        code: isEdit ? code : null,
      })
    )
      return sendError(res, "Tax already exists", 409);

    const request = pool.request();

    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) request.input("TaxCode", sql.Int, code);
    request.input("Fixed", sql.Bit, toBit(body.Fixed));
    request.input("TaxName", sql.NVarChar, name);
    request.input("Tax", sql.Decimal(18, 2), tax);
    request.input("Status", sql.Bit, toBit(body.Status));

    await request.execute("sp_Tax_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_TaxName_tblTax")) {
      return sendError(res, "Already exist the Tax Name", 409);
    }
    console.error("DB Error (saveOrUpdateTax):", err);
    return sendError(res, err);
  }
};

// POST /tax/create        -> create
export const createTax = (req, res) => saveOrUpdateTax(req, res, false);

// PUT  /tax/update/:code  -> update
export const updateTax = (req, res) => saveOrUpdateTax(req, res, true);

// DELETE /tax/delete/:taxCode -> EXEC sp_Tax_Delete
export const deleteTax = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.taxCode);
    if (!code) return sendError(res, "Invalid TaxCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("TaxCode", sql.Int, code)
      .execute("sp_Tax_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    // Still referenced elsewhere -> friendly 409 instead of a raw FK error.
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the Tax!", 409);
    }
    console.error("DB Error (deleteTax):", err);
    return sendError(res, err);
  }
};
