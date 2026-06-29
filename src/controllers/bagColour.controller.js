import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Bag Colour master (port of the WinForms frmBagColour / frmBagColourDetails)
//   - List   : EXEC sp_BagColour_GetAll
//   - Create : EXEC sp_BagColour_AddEdit   (@C_User / @C_Node, no code)
//   - Update : EXEC sp_BagColour_AddEdit   (@E_User / @E_Node / @BagColourCode)
//   - Delete : EXEC sp_BagColour_Delete
// The VB form (btnSave_Click) validates Bag Colour as mandatory and maps a
// UK_ unique violation to "Already exist the Bag Colour".
// Status combo: ACTIVE -> 1, INACTIVE -> 0. Mirrors tipColour.controller.js.
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

// GET /bag-colour/lists  -> mirrors frmBagColourDetails list
export const getBagColourList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_BagColour_GetAll");

    const data = (result.recordset || []).map((item) => ({
      ...item,
      id: item.BagColourCode,
      StatusText: STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getBagColourList):", err);
    return sendError(res, err);
  }
};

// GET /bag-colour/list/:bagColourCode  -> single record (filtered from GetAll)
export const getBagColourById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = toInt(req.params.bagColourCode);
    if (!code) return sendError(res, "Invalid BagColourCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_BagColour_GetAll");
    const row = (result.recordset || []).find(
      (r) => toInt(r.BagColourCode) === code
    );

    if (!row) return sendError(res, "Bag Colour not found", 404);
    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getBagColourById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_BagColour_AddEdit (btnSave_Click)
const saveOrUpdateBagColour = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const bagColour = (body.BagColour || "").trim();

    // Same validation the form enforces.
    if (!bagColour)
      return sendError(res, "Bag Colour should not be empty", 400);

    const code = isEdit
      ? toInt(req.params.bagColourCode ?? body.BagColourCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid BagColourCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // The proc uses C_* params for a new row and E_* params for an edit.
    if (isEdit) {
      request.input("E_User", sql.Int, toInt(userId));
      request.input("E_Node", sql.Int, toInt(nodeCode));
      request.input("BagColourCode", sql.Int, code);
    } else {
      request.input("C_User", sql.Int, toInt(userId));
      request.input("C_Node", sql.Int, toInt(nodeCode));
    }
    request.input("BagColour", sql.NVarChar, bagColour);
    request.input("Status", sql.Bit, toBit(body.Status));

    await request.execute("sp_BagColour_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique index -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_")) {
      return sendError(res, "Already exist the Bag Colour", 409);
    }
    console.error("DB Error (saveOrUpdateBagColour):", err);
    return sendError(res, err);
  }
};

// POST /bag-colour/create        -> create
export const createBagColour = (req, res) =>
  saveOrUpdateBagColour(req, res, false);

// PUT  /bag-colour/update/:code  -> update
export const updateBagColour = (req, res) =>
  saveOrUpdateBagColour(req, res, true);

// DELETE /bag-colour/delete/:bagColourCode -> EXEC sp_BagColour_Delete
export const deleteBagColour = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = toInt(req.params.bagColourCode);
    if (!code) return sendError(res, "Invalid BagColourCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("BagColourCode", sql.Int, code)
      .execute("sp_BagColour_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the BagColour!", 409);
    }
    console.error("DB Error (deleteBagColour):", err);
    return sendError(res, err);
  }
};
