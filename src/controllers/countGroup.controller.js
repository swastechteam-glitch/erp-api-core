import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Count Group master (port of the WinForms frmCountGroup / frmCountGroupDetails)
//   - List   : EXEC sp_CountGroup_GetAll
//   - Create : EXEC sp_CountGroup_AddEdit   (@C_User / @C_Node, no code)
//   - Update : EXEC sp_CountGroup_AddEdit   (@E_User / @E_Node / @CountGroupCode)
//   - Delete : EXEC sp_CountGroup_Delete
// The VB form validates Count Group Name + Name In Tally as mandatory and maps
// the UK_CountGroup_tblCountGroup unique violation to "Already exist the Count Name".
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

// GET /count-group/lists  -> mirrors frmCountGroupDetails list
export const getCountGroupList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_CountGroup_GetAll");

    const data = (result.recordset || []).map((item) => ({
      ...item,
      id: item.CountGroupCode,
      StatusText: STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getCountGroupList):", err);
    return sendError(res, err);
  }
};

// GET /count-group/list/:countGroupCode  -> single record (filtered from GetAll)
export const getCountGroupById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = toInt(req.params.countGroupCode);
    if (!code) return sendError(res, "Invalid CountGroupCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_CountGroup_GetAll");
    const row = (result.recordset || []).find(
      (r) => toInt(r.CountGroupCode) === code
    );

    if (!row) return sendError(res, "Count Group not found", 404);
    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getCountGroupById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_CountGroup_AddEdit (btnSave_Click)
const saveOrUpdateCountGroup = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const name = (body.CountGroupName || "").trim();
    const tally = (body.CountGroupInTally || "").trim();

    // Same validation the form enforces.
    if (!name) return sendError(res, "Count Name should not be empty", 400);
    if (!tally)
      return sendError(res, "Count Name In Tally should not be empty", 400);

    const code = isEdit
      ? toInt(req.params.countGroupCode ?? body.CountGroupCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid CountGroupCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // The proc uses C_* params for a new row and E_* params for an edit.
    if (isEdit) {
      request.input("E_User", sql.Int, toInt(userId));
      request.input("E_Node", sql.Int, toInt(nodeCode));
      request.input("CountGroupCode", sql.Int, code);
    } else {
      request.input("C_User", sql.Int, toInt(userId));
      request.input("C_Node", sql.Int, toInt(nodeCode));
    }
    request.input("CountGroupName", sql.NVarChar, name);
    request.input("CountGroupInTally", sql.NVarChar, tally);
    request.input("ShortName", sql.NVarChar, (body.ShortName || "").trim());
    request.input("ShortOrderNumber", sql.Int, toInt(body.ShortOrderNumber));
    request.input("Status", sql.Bit, toBit(body.Status));

    await request.execute("sp_CountGroup_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique index -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_CountGroup_tblCountGroup")) {
      return sendError(res, "Already exist the Count Name", 409);
    }
    console.error("DB Error (saveOrUpdateCountGroup):", err);
    return sendError(res, err);
  }
};

// POST /count-group/create        -> create
export const createCountGroup = (req, res) =>
  saveOrUpdateCountGroup(req, res, false);

// PUT  /count-group/update/:code  -> update
export const updateCountGroup = (req, res) =>
  saveOrUpdateCountGroup(req, res, true);

// DELETE /count-group/delete/:countGroupCode -> EXEC sp_CountGroup_Delete
export const deleteCountGroup = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = toInt(req.params.countGroupCode);
    if (!code) return sendError(res, "Invalid CountGroupCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("CountGroupCode", sql.Int, code)
      .execute("sp_CountGroup_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the Count Group!", 409);
    }
    console.error("DB Error (deleteCountGroup):", err);
    return sendError(res, err);
  }
};
