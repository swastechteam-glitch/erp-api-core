import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Machine Make master (port of the WinForms frmMachineMake)
//   - List   : Select ... from tbl_MachineMake
//   - Create : EXEC sp_MachineMake_AddEdit  (without @MachineMakeCode)
//   - Update : EXEC sp_MachineMake_AddEdit  (with @MachineMakeCode)
//   - Delete : EXEC sp_MachineMake_Delete
// AddEdit requires @User / @Node which we read from the auth token (headers).
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

const toBit = (v) => {
  if (v === true || v === 1 || v === "1") return 1;
  if (typeof v === "string" && v.trim().toUpperCase() === "ACTIVE") return 1;
  return 0;
};

const SELECT_COLS =
  "Select MachineMakeCode, MachineMakeName, Status from tbl_MachineMake";

// GET /machine-make/lists  -> mirrors frmMachineMakeDetails list query
export const getMachineMakeList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .query(`${SELECT_COLS} order by MachineMakeCode desc`);

    const data = result.recordset.map((item) => ({
      ...item,
      id: item.MachineMakeCode,
      StatusText: STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getMachineMakeList):", err);
    return sendError(res, err);
  }
};

// GET /machine-make/list/:machineMakeCode  -> single record
export const getMachineMakeById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.machineMakeCode);
    if (!code) return sendError(res, "Invalid MachineMakeCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("MachineMakeCode", sql.Int, code)
      .query(`${SELECT_COLS} where MachineMakeCode = @MachineMakeCode`);

    if (!result.recordset.length)
      return sendError(res, "Machine Make not found", 404);

    const row = result.recordset[0];
    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getMachineMakeById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_MachineMake_AddEdit (btnSave_Click)
const saveOrUpdateMachineMake = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const name = (body.MachineMakeName || "").trim();

    // Same validation the form enforces: name is mandatory.
    if (!name)
      return sendError(res, "Machine Make Name should not be empty", 400);

    const code = isEdit
      ? parseInt(req.params.machineMakeCode ?? body.MachineMakeCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid MachineMakeCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) request.input("MachineMakeCode", sql.Int, code);
    request.input("MachineMakeName", sql.NVarChar, name);
    request.input("Status", sql.Bit, toBit(body.Status));

    await request.execute("sp_MachineMake_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint -> friendly 409 (matches form behaviour).
    if (
      err.message &&
      err.message.includes("UK_MachineMakeName_tblMachineMake")
    ) {
      return sendError(res, "Already exist the MachineMake Name", 409);
    }
    console.error("DB Error (saveOrUpdateMachineMake):", err);
    return sendError(res, err);
  }
};

// POST /machine-make/create        -> create
export const createMachineMake = (req, res) =>
  saveOrUpdateMachineMake(req, res, false);

// PUT  /machine-make/update/:code  -> update
export const updateMachineMake = (req, res) =>
  saveOrUpdateMachineMake(req, res, true);

// DELETE /machine-make/delete/:machineMakeCode -> EXEC sp_MachineMake_Delete
export const deleteMachineMake = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.machineMakeCode);
    if (!code) return sendError(res, "Invalid MachineMakeCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("MachineMakeCode", sql.Int, code)
      .execute("sp_MachineMake_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    // Still referenced elsewhere -> friendly 409 instead of a raw FK error.
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the MachineMake!", 409);
    }
    console.error("DB Error (deleteMachineMake):", err);
    return sendError(res, err);
  }
};
