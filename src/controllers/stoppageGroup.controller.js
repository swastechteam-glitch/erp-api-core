import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Stoppage Group master (port of WinForms frmStoppageGroup / frmStoppageGroupDetails)
//   - List   : SELECT from tbl_StoppageGroup        (form uses a direct select)
//   - Create : EXEC sp_StoppageGroup_AddEdit         (without @StoppageGroupCode)
//   - Update : EXEC sp_StoppageGroup_AddEdit         (with @StoppageGroupCode)
//   - Delete : EXEC sp_StoppageGroup_Delete
// AddEdit requires @User / @Node which we read from the auth token (headers).
// Mirrors the form: Stoppage Group (required) + Status.
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

const toBit = (v) => {
  if (v === true || v === 1 || v === "1") return 1;
  if (typeof v === "string" && v.trim().toUpperCase() === "ACTIVE") return 1;
  return 0;
};

// GET /stoppage-group/lists  -> mirrors frmStoppageGroupDetails list
export const getStoppageGroupList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .query(
        "SELECT StoppageGroupCode, StoppageGroupName, Status FROM tbl_StoppageGroup Order By StoppageGroupName"
      );

    const data = result.recordset.map((item) => ({
      ...item,
      id: item.StoppageGroupCode,
      StatusText: STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getStoppageGroupList):", err);
    return sendError(res, err);
  }
};

// GET /stoppage-group/list/:stoppageGroupCode  -> single record
export const getStoppageGroupById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.stoppageGroupCode);
    if (!code) return sendError(res, "Invalid StoppageGroupCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("StoppageGroupCode", sql.Int, code)
      .query(
        "SELECT StoppageGroupCode, StoppageGroupName, Status " +
          "FROM tbl_StoppageGroup WHERE StoppageGroupCode = @StoppageGroupCode"
      );

    if (!result.recordset.length)
      return sendError(res, "Stoppage Group not found", 404);

    const row = result.recordset[0];
    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getStoppageGroupById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_StoppageGroup_AddEdit (btnSave_Click)
const saveOrUpdateStoppageGroup = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const name = (body.StoppageGroupName || "").trim();

    // Same validation the form enforces: name is mandatory.
    if (!name)
      return sendError(res, "Stoppage Group should not be empty", 400);

    const code = isEdit
      ? parseInt(req.params.stoppageGroupCode ?? body.StoppageGroupCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid StoppageGroupCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) request.input("StoppageGroupCode", sql.Int, code);
    request.input("StoppageGroupName", sql.NVarChar, name);
    request.input("Status", sql.Bit, toBit(body.Status));

    await request.execute("sp_StoppageGroup_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_")) {
      return sendError(res, "Already exist this Stoppage Group", 409);
    }
    console.error("DB Error (saveOrUpdateStoppageGroup):", err);
    return sendError(res, err);
  }
};

// POST /stoppage-group/create        -> create
export const createStoppageGroup = (req, res) =>
  saveOrUpdateStoppageGroup(req, res, false);

// PUT  /stoppage-group/update/:code  -> update
export const updateStoppageGroup = (req, res) =>
  saveOrUpdateStoppageGroup(req, res, true);

// DELETE /stoppage-group/delete/:stoppageGroupCode -> EXEC sp_StoppageGroup_Delete
export const deleteStoppageGroup = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.stoppageGroupCode);
    if (!code) return sendError(res, "Invalid StoppageGroupCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("StoppageGroupCode", sql.Int, code)
      .execute("sp_StoppageGroup_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the Stoppage Group!", 409);
    }
    console.error("DB Error (deleteStoppageGroup):", err);
    return sendError(res, err);
  }
};
