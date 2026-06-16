import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// State master (port of the WinForms frmState)
//   - List   : EXEC sp_State_GetAll
//   - Create : EXEC sp_State_AddEdit  (without @StateCode)
//   - Update : EXEC sp_State_AddEdit  (with @StateCode)
//   - Delete : EXEC sp_State_Delete
// NOTE: This master has NO Status column and the AddEdit SP takes NO @User/@Node
//       (per frmState.vb — those params are commented out).
// ---------------------------------------------------------------------------

// GET /state/lists  -> EXEC sp_State_GetAll
export const getStateList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_State_GetAll");

    const data = result.recordset
      // Newest first (the SP doesn't guarantee order, so sort here).
      .sort((a, b) => b.StateCode - a.StateCode)
      .map((item) => ({ ...item, id: item.StateCode }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getStateList):", err);
    return sendError(res, err);
  }
};

// GET /state/list/:stateCode  -> single record (filtered from GetAll)
export const getStateById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.stateCode);
    if (!code) return sendError(res, "Invalid StateCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_State_GetAll");
    const row = result.recordset.find((r) => r.StateCode === code);

    if (!row) return sendError(res, "State not found", 404);

    return sendSuccess(res, row);
  } catch (err) {
    console.error("DB Error (getStateById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_State_AddEdit (btnSave_Click)
const saveOrUpdateState = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const body = req.body || {};
    const stateName = (body.StateName || "").trim();
    const stateId = (body.StateID || "").toString().trim();

    // Validation mirrors btnSave_Click.
    if (!stateName)
      return sendError(res, "State Name should not be empty", 400);
    if (!stateId)
      return sendError(res, "State Code should not be empty", 400);

    const code = isEdit
      ? parseInt(req.params.stateCode ?? body.StateCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid StateCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    if (isEdit) request.input("StateCode", sql.Int, code);
    request.input("StateName", sql.NVarChar, stateName);
    request.input("StateID", sql.NVarChar, stateId);

    await request.execute("sp_State_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_StateName_tblState")) {
      return sendError(res, "Already exist the State Name", 409);
    }
    console.error("DB Error (saveOrUpdateState):", err);
    return sendError(res, err);
  }
};

// POST /state/create        -> create
export const createState = (req, res) => saveOrUpdateState(req, res, false);

// PUT  /state/update/:code  -> update
export const updateState = (req, res) => saveOrUpdateState(req, res, true);

// DELETE /state/delete/:stateCode -> EXEC sp_State_Delete
export const deleteState = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.stateCode);
    if (!code) return sendError(res, "Invalid StateCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("StateCode", sql.Int, code)
      .execute("sp_State_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    // Still referenced elsewhere -> friendly 409 instead of a raw FK error.
    if (err.message && err.message.includes("REFERENCE")) {
      return sendError(res, "This state is in use and cannot be deleted", 409);
    }
    console.error("DB Error (deleteState):", err);
    return sendError(res, err);
  }
};
