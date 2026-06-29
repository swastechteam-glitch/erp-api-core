import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Count Name master (port of the WinForms frmCountName / frmCountNameDetails)
//   - List   : EXEC sp_CountName_GetAll
//   - Create : EXEC sp_CountName_AddEdit   (@C_User / @C_Node, no code)
//   - Update : EXEC sp_CountName_AddEdit   (@E_User / @E_Node / @CountNameCode)
//   - Delete : EXEC sp_CountName_Delete
// The VB form (btnSave_Click) validates Count Group, Count Name and Name In
// Tally as mandatory and maps the UK_CountName_tblCountName unique violation to
// "Already exist the Count Name". Status combo: ACTIVE -> 1, INACTIVE -> 0.
// This mirrors countGroup.controller.js.
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

// GET /count-name/lists  -> mirrors frmCountNameDetails list
export const getCountNameList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_CountName_GetAll");

    const data = (result.recordset || []).map((item) => ({
      ...item,
      id: item.CountNameCode,
      StatusText: STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getCountNameList):", err);
    return sendError(res, err);
  }
};

// GET /count-name/list/:countNameCode  -> single record (filtered from GetAll)
export const getCountNameById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = toInt(req.params.countNameCode);
    if (!code) return sendError(res, "Invalid CountNameCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_CountName_GetAll");
    const row = (result.recordset || []).find(
      (r) => toInt(r.CountNameCode) === code
    );

    if (!row) return sendError(res, "Count Name not found", 404);
    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getCountNameById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_CountName_AddEdit (btnSave_Click)
const saveOrUpdateCountName = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const countGroupCode = toInt(body.CountGroupCode);
    const name = (body.CountName || "").trim();
    const tally = (body.CountNameInTally || "").trim();

    // Same validation the form enforces (btnSave_Click).
    if (!countGroupCode)
      return sendError(res, "Select the Count group Type", 400);
    if (!name) return sendError(res, "Count Name should not be empty", 400);
    if (!tally)
      return sendError(res, "Count Name In Tally should not be empty", 400);

    const code = isEdit
      ? toInt(req.params.countNameCode ?? body.CountNameCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid CountNameCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // The proc uses C_* params for a new row and E_* params for an edit.
    if (isEdit) {
      request.input("E_User", sql.Int, toInt(userId));
      request.input("E_Node", sql.Int, toInt(nodeCode));
      request.input("CountNameCode", sql.Int, code);
    } else {
      request.input("C_User", sql.Int, toInt(userId));
      request.input("C_Node", sql.Int, toInt(nodeCode));
    }
    request.input("CountName", sql.NVarChar, name);
    request.input("CountNameInTally", sql.NVarChar, tally);
    request.input("ShortName", sql.NVarChar, (body.ShortName || "").trim());
    request.input("ShortOrderNumber", sql.Int, toInt(body.ShortOrderNumber));
    request.input("CountGroupCode", sql.Int, countGroupCode);
    request.input("Status", sql.Bit, toBit(body.Status));

    await request.execute("sp_CountName_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique index -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_CountName_tblCountName")) {
      return sendError(res, "Already exist the Count Name", 409);
    }
    console.error("DB Error (saveOrUpdateCountName):", err);
    return sendError(res, err);
  }
};

// POST /count-name/create        -> create
export const createCountName = (req, res) =>
  saveOrUpdateCountName(req, res, false);

// PUT  /count-name/update/:code  -> update
export const updateCountName = (req, res) =>
  saveOrUpdateCountName(req, res, true);

// DELETE /count-name/delete/:countNameCode -> EXEC sp_CountName_Delete
export const deleteCountName = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = toInt(req.params.countNameCode);
    if (!code) return sendError(res, "Invalid CountNameCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("CountNameCode", sql.Int, code)
      .execute("sp_CountName_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the CountName!", 409);
    }
    console.error("DB Error (deleteCountName):", err);
    return sendError(res, err);
  }
};

// GET /count-name/count-groups -> dropdown source for cmbCountGroupName
//   VB: SELECT CountGroupCode,CountGroupName,ShortName FROM tbl_CountGroup
export const getCountGroupOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .query(
        "SELECT CountGroupCode, CountGroupName, ShortName FROM tbl_CountGroup ORDER BY CountGroupName"
      );

    const data = (result.recordset || []).map((item) => ({
      ...item,
      value: item.CountGroupCode,
      label: item.CountGroupName,
    }));

    return sendSuccess(res, data);
  } catch (err) {
    console.error("DB Error (getCountGroupOptions):", err);
    return sendError(res, err);
  }
};
