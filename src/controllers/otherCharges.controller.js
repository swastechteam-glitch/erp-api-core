import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Other Charges master (port of the WinForms frmOtherCharges / frmOtherChargesDetails)
//   - List   : EXEC sp_OtherCharges_GetAll
//   - Create : EXEC sp_OtherCharges_AddEdit   (@C_User / @C_Node, no code)
//   - Update : EXEC sp_OtherCharges_AddEdit   (@E_User / @E_Node / @OtherChargesCode)
//   - Delete : EXEC sp_OtherCharges_Delete
// The VB form (btnSave_Click) validates Other Charge as mandatory and maps
// UK_OtherCharges_tbl_OtherCharges to "Already exist the OtherCharges Name".
// PerKg is a checkbox (Per Kg -> 1/0). Status combo: ACTIVE -> 1, INACTIVE -> 0.
// Mirrors salesType.controller.js.
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

// GET /other-charges/lists  -> mirrors frmOtherChargesDetails list
export const getOtherChargesList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_OtherCharges_GetAll");

    const data = (result.recordset || []).map((item) => ({
      ...item,
      id: item.OtherChargesCode,
      StatusText: STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getOtherChargesList):", err);
    return sendError(res, err);
  }
};

// GET /other-charges/list/:otherChargesCode  -> single record (filtered from GetAll)
export const getOtherChargesById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = toInt(req.params.otherChargesCode);
    if (!code) return sendError(res, "Invalid OtherChargesCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_OtherCharges_GetAll");
    const row = (result.recordset || []).find(
      (r) => toInt(r.OtherChargesCode) === code
    );

    if (!row) return sendError(res, "Other Charges not found", 404);
    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getOtherChargesById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_OtherCharges_AddEdit (btnSave_Click)
const saveOrUpdateOtherCharges = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const otherCharges = (body.OtherCharges || "").trim();

    // Same validation the form enforces (btnSave_Click).
    if (!otherCharges)
      return sendError(res, "Other Charge should not be empty", 400);

    const code = isEdit
      ? toInt(req.params.otherChargesCode ?? body.OtherChargesCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid OtherChargesCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // The proc uses C_* params for a new row and E_* params for an edit.
    if (isEdit) {
      request.input("E_User", sql.Int, toInt(userId));
      request.input("E_Node", sql.Int, toInt(nodeCode));
      request.input("OtherChargesCode", sql.Int, code);
    } else {
      request.input("C_User", sql.Int, toInt(userId));
      request.input("C_Node", sql.Int, toInt(nodeCode));
    }
    request.input("OtherCharges", sql.NVarChar, otherCharges);
    request.input("PerKg", sql.Bit, toBit(body.PerKg));
    request.input("Amount", sql.Decimal(18, 2), toNum(body.Amount));
    request.input("Status", sql.Bit, toBit(body.Status));

    await request.execute("sp_OtherCharges_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique index -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_OtherCharges_tbl_OtherCharges")) {
      return sendError(res, "Already exist the OtherCharges Name", 409);
    }
    console.error("DB Error (saveOrUpdateOtherCharges):", err);
    return sendError(res, err);
  }
};

// POST /other-charges/create        -> create
export const createOtherCharges = (req, res) =>
  saveOrUpdateOtherCharges(req, res, false);

// PUT  /other-charges/update/:code  -> update
export const updateOtherCharges = (req, res) =>
  saveOrUpdateOtherCharges(req, res, true);

// DELETE /other-charges/delete/:otherChargesCode -> EXEC sp_OtherCharges_Delete
export const deleteOtherCharges = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = toInt(req.params.otherChargesCode);
    if (!code) return sendError(res, "Invalid OtherChargesCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("OtherChargesCode", sql.Int, code)
      .execute("sp_OtherCharges_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the OtherCharges!", 409);
    }
    console.error("DB Error (deleteOtherCharges):", err);
    return sendError(res, err);
  }
};
