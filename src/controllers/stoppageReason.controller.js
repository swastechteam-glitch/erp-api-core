import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Stoppage Reason master (port of WinForms frmStoppageReason / frmStoppageReasonDetails)
//   - Options: Stoppage Group dropdown (tbl_StoppageGroup, Status = 1)
//   - List   : EXEC sp_StoppageReason_GetAll
//   - Create : EXEC sp_StoppageReason_AddEdit  (without @StoppageReasonCode)
//   - Update : EXEC sp_StoppageReason_AddEdit  (with @StoppageReasonCode)
//   - Delete : EXEC sp_StoppageReason_Delete
// AddEdit requires @User / @Node which we read from the auth token (headers).
// Mirrors the form: Stoppage Group + Stoppage Reason (required) + Short Name
// (required) + Status.
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

const toBit = (v) => {
  if (v === true || v === 1 || v === "1") return 1;
  if (typeof v === "string" && v.trim().toUpperCase() === "ACTIVE") return 1;
  return 0;
};

// GET /stoppage-reason/options  -> dropdown lookups (Stoppage Group)
export const getStoppageReasonOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const groups = await pool
      .request()
      .query(
        "Select StoppageGroupCode, StoppageGroupName from tbl_StoppageGroup Where Status = 1 ORDER BY StoppageGroupName"
      );

    return sendSuccess(res, {
      stoppageGroups: groups.recordset.map((r) => ({
        value: r.StoppageGroupCode,
        label: r.StoppageGroupName,
      })),
    });
  } catch (err) {
    console.error("DB Error (getStoppageReasonOptions):", err);
    return sendError(res, err);
  }
};

// GET /stoppage-reason/lists  -> mirrors frmStoppageReasonDetails list
export const getStoppageReasonList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_StoppageReason_GetAll");

    const data = result.recordset.map((item) => ({
      ...item,
      id: item.StoppageReasonCode,
      StatusText: STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getStoppageReasonList):", err);
    return sendError(res, err);
  }
};

// GET /stoppage-reason/list/:stoppageReasonCode  -> single record
export const getStoppageReasonById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.stoppageReasonCode);
    if (!code) return sendError(res, "Invalid StoppageReasonCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("StoppageReasonCode", sql.Int, code)
      .query(
        "SELECT StoppageReasonCode, StoppageGroupCode, StoppageReason, ShortName, Status " +
          "FROM tbl_StoppageReason WHERE StoppageReasonCode = @StoppageReasonCode"
      );

    if (!result.recordset.length)
      return sendError(res, "Stoppage Reason not found", 404);

    const row = result.recordset[0];
    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getStoppageReasonById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_StoppageReason_AddEdit (btnSave_Click)
const saveOrUpdateStoppageReason = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const name = (body.StoppageReason || "").trim();
    const shortName = (body.ShortName || "").trim();
    const groupCode = parseInt(body.StoppageGroupCode);

    // Same validations the form enforces.
    if (!groupCode)
      return sendError(res, "Select the Stoppage Group", 400);
    if (!name)
      return sendError(res, "Stoppage Reason Name should not be empty", 400);
    if (!shortName)
      return sendError(res, "Short Name should not be empty", 400);

    const code = isEdit
      ? parseInt(req.params.stoppageReasonCode ?? body.StoppageReasonCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid StoppageReasonCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) request.input("StoppageReasonCode", sql.Int, code);
    request.input("StoppageGroupCode", sql.Int, groupCode);
    request.input("StoppageReason", sql.NVarChar, name);
    request.input("ShortName", sql.NVarChar, shortName);
    request.input("Status", sql.Bit, toBit(body.Status));

    await request.execute("sp_StoppageReason_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_StoppageReasonName")) {
      return sendError(res, "Already exist the StoppageReason Name", 409);
    }
    console.error("DB Error (saveOrUpdateStoppageReason):", err);
    return sendError(res, err);
  }
};

// POST /stoppage-reason/create        -> create
export const createStoppageReason = (req, res) =>
  saveOrUpdateStoppageReason(req, res, false);

// PUT  /stoppage-reason/update/:code  -> update
export const updateStoppageReason = (req, res) =>
  saveOrUpdateStoppageReason(req, res, true);

// DELETE /stoppage-reason/delete/:stoppageReasonCode -> EXEC sp_StoppageReason_Delete
export const deleteStoppageReason = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.stoppageReasonCode);
    if (!code) return sendError(res, "Invalid StoppageReasonCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("StoppageReasonCode", sql.Int, code)
      .execute("sp_StoppageReason_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the StoppageReason!", 409);
    }
    console.error("DB Error (deleteStoppageReason):", err);
    return sendError(res, err);
  }
};
