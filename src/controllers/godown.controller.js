import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Godown master (port of the WinForms frmGodown)
//   - List   : EXEC sp_Godown_GetAll
//   - Create : EXEC sp_Godown_AddEdit  (without @GodownCode)
//   - Update : EXEC sp_Godown_AddEdit  (with @GodownCode)
//   - Delete : EXEC sp_Godown_Delete
// AddEdit requires @User / @Node which we read from the auth token (headers).
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

const toStatusBit = (status) => {
  if (status === true || status === 1 || status === "1") return 1;
  if (typeof status === "string" && status.trim().toUpperCase() === "ACTIVE")
    return 1;
  return 0;
};

// GET /godown/lists  -> EXEC sp_Godown_GetAll
export const getGodownList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_Godown_GetAll");

    const data = result.recordset
      // Newest first (the SP doesn't guarantee order, so sort here).
      .sort((a, b) => b.GodownCode - a.GodownCode)
      .map((item) => ({
        ...item,
        id: item.GodownCode,
        StatusText: STATUS_LABEL(item.Status),
      }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getGodownList):", err);
    return sendError(res, err);
  }
};

// GET /godown/list/:godownCode  -> single record (filtered from GetAll)
export const getGodownById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.godownCode);
    if (!code) return sendError(res, "Invalid GodownCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_Godown_GetAll");
    const row = result.recordset.find((r) => r.GodownCode === code);

    if (!row) return sendError(res, "Godown not found", 404);

    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getGodownById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_Godown_AddEdit (btnSave_Click)
const saveOrUpdateGodown = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const name = (body.GodownName || "").trim();

    // Same validation the form enforces: name is mandatory.
    if (!name)
      return sendError(res, "Godown Name should not be empty", 400);

    const code = isEdit
      ? parseInt(req.params.godownCode ?? body.GodownCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid GodownCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) request.input("GodownCode", sql.Int, code);
    request.input("GodownName", sql.NVarChar, name);
    request.input("Status", sql.Bit, toStatusBit(body.Status));

    await request.execute("sp_Godown_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_GodownName_tblGodown")) {
      return sendError(res, "Already exist the Godown Name", 409);
    }
    console.error("DB Error (saveOrUpdateGodown):", err);
    return sendError(res, err);
  }
};

// POST /godown/create        -> create
export const createGodown = (req, res) => saveOrUpdateGodown(req, res, false);

// PUT  /godown/update/:code  -> update
export const updateGodown = (req, res) => saveOrUpdateGodown(req, res, true);

// DELETE /godown/delete/:godownCode -> EXEC sp_Godown_Delete
export const deleteGodown = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.godownCode);
    if (!code) return sendError(res, "Invalid GodownCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("GodownCode", sql.Int, code)
      .execute("sp_Godown_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    // Still referenced elsewhere -> friendly 409 instead of a raw FK error.
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the Godown!", 409);
    }
    console.error("DB Error (deleteGodown):", err);
    return sendError(res, err);
  }
};
