import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Tip Colour master (port of the WinForms frmTipColour / frmTipColourDetails)
//   - List   : EXEC sp_TipColour_GetAll
//   - Create : EXEC sp_TipColour_AddEdit   (@C_User / @C_Node, no code)
//   - Update : EXEC sp_TipColour_AddEdit   (@E_User / @E_Node / @TipColourCode)
//   - Delete : EXEC sp_TipColour_Delete
// The VB form (btnSave_Click) validates Tip Colour as mandatory and maps the
// UK_TipColour_tbl_Tip unique violation to "Already exist the Tip Colour".
// Status combo: ACTIVE -> 1, INACTIVE -> 0. Mirrors countGroup.controller.js.
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

// GET /tip-colour/lists  -> mirrors frmTipColourDetails list
export const getTipColourList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_TipColour_GetAll");

    const data = (result.recordset || []).map((item) => ({
      ...item,
      id: item.TipColourCode,
      StatusText: STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getTipColourList):", err);
    return sendError(res, err);
  }
};

// GET /tip-colour/list/:tipColourCode  -> single record (filtered from GetAll)
export const getTipColourById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = toInt(req.params.tipColourCode);
    if (!code) return sendError(res, "Invalid TipColourCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_TipColour_GetAll");
    const row = (result.recordset || []).find(
      (r) => toInt(r.TipColourCode) === code
    );

    if (!row) return sendError(res, "Tip Colour not found", 404);
    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getTipColourById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_TipColour_AddEdit (btnSave_Click)
const saveOrUpdateTipColour = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const tipColour = (body.TipColour || "").trim();

    // Same validation the form enforces.
    if (!tipColour)
      return sendError(res, "Tip Colour should not be empty", 400);

    const code = isEdit
      ? toInt(req.params.tipColourCode ?? body.TipColourCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid TipColourCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // The proc uses C_* params for a new row and E_* params for an edit.
    if (isEdit) {
      request.input("E_User", sql.Int, toInt(userId));
      request.input("E_Node", sql.Int, toInt(nodeCode));
      request.input("TipColourCode", sql.Int, code);
    } else {
      request.input("C_User", sql.Int, toInt(userId));
      request.input("C_Node", sql.Int, toInt(nodeCode));
    }
    request.input("TipColour", sql.NVarChar, tipColour);
    request.input("Status", sql.Bit, toBit(body.Status));

    await request.execute("sp_TipColour_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique index -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_TipColour_tbl_Tip")) {
      return sendError(res, "Already exist the Tip Colour", 409);
    }
    console.error("DB Error (saveOrUpdateTipColour):", err);
    return sendError(res, err);
  }
};

// POST /tip-colour/create        -> create
export const createTipColour = (req, res) =>
  saveOrUpdateTipColour(req, res, false);

// PUT  /tip-colour/update/:code  -> update
export const updateTipColour = (req, res) =>
  saveOrUpdateTipColour(req, res, true);

// DELETE /tip-colour/delete/:tipColourCode -> EXEC sp_TipColour_Delete
export const deleteTipColour = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = toInt(req.params.tipColourCode);
    if (!code) return sendError(res, "Invalid TipColourCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("TipColourCode", sql.Int, code)
      .execute("sp_TipColour_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the TipColour!", 409);
    }
    console.error("DB Error (deleteTipColour):", err);
    return sendError(res, err);
  }
};
