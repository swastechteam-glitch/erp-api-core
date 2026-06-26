import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Waste Item Group master (port of the WinForms frmWasteItemGroup)
//   - List   : SELECT from tbl_WasteItemGroup        (form uses a direct select)
//   - Create : EXEC sp_WasteItemGroup_AddEdit         (without @WasteItemGroupCode)
//   - Update : EXEC sp_WasteItemGroup_AddEdit         (with @WasteItemGroupCode)
//   - Delete : EXEC sp_WasteItemGroup_Delete
// AddEdit requires @User / @Node which we read from the auth token (headers).
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

const toBit = (v) => {
  if (v === true || v === 1 || v === "1") return 1;
  if (typeof v === "string" && v.trim().toUpperCase() === "ACTIVE") return 1;
  return 0;
};

// GET /waste-item-group/lists  -> mirrors frmWasteItemGroupDetails list
export const getWasteItemGroupList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .query(
        "SELECT WasteItemGroupCode, WasteItemGroupName, Status FROM tbl_WasteItemGroup Order By WasteItemGroupName"
      );

    const data = result.recordset.map((item) => ({
      ...item,
      id: item.WasteItemGroupCode,
      StatusText: STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getWasteItemGroupList):", err);
    return sendError(res, err);
  }
};

// GET /waste-item-group/list/:wasteItemGroupCode  -> single record
export const getWasteItemGroupById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.wasteItemGroupCode);
    if (!code) return sendError(res, "Invalid WasteItemGroupCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("WasteItemGroupCode", sql.Int, code)
      .query(
        "SELECT WasteItemGroupCode, WasteItemGroupName, Status " +
          "FROM tbl_WasteItemGroup WHERE WasteItemGroupCode = @WasteItemGroupCode"
      );

    if (!result.recordset.length)
      return sendError(res, "Waste Item Group not found", 404);

    const row = result.recordset[0];
    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getWasteItemGroupById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_WasteItemGroup_AddEdit (btnSave_Click)
const saveOrUpdateWasteItemGroup = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const name = (body.WasteItemGroupName || "").trim();

    // Same validation the form enforces: name is mandatory.
    if (!name)
      return sendError(res, "Waste Item Group Name should not be empty", 400);

    const code = isEdit
      ? parseInt(req.params.wasteItemGroupCode ?? body.WasteItemGroupCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid WasteItemGroupCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) request.input("WasteItemGroupCode", sql.Int, code);
    request.input("WasteItemGroupName", sql.NVarChar, name);
    request.input("Status", sql.Bit, toBit(body.Status));

    await request.execute("sp_WasteItemGroup_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_")) {
      return sendError(res, "Already exist this Waste Item Group Name", 409);
    }
    console.error("DB Error (saveOrUpdateWasteItemGroup):", err);
    return sendError(res, err);
  }
};

// POST /waste-item-group/create        -> create
export const createWasteItemGroup = (req, res) =>
  saveOrUpdateWasteItemGroup(req, res, false);

// PUT  /waste-item-group/update/:code  -> update
export const updateWasteItemGroup = (req, res) =>
  saveOrUpdateWasteItemGroup(req, res, true);

// DELETE /waste-item-group/delete/:wasteItemGroupCode -> EXEC sp_WasteItemGroup_Delete
export const deleteWasteItemGroup = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.wasteItemGroupCode);
    if (!code) return sendError(res, "Invalid WasteItemGroupCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("WasteItemGroupCode", sql.Int, code)
      .execute("sp_WasteItemGroup_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the Waste Item Group!", 409);
    }
    console.error("DB Error (deleteWasteItemGroup):", err);
    return sendError(res, err);
  }
};
