import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Item Usage Type master (port of the WinForms frmItemUsageType)
//   - List   : EXEC sp_ItemUsageType_GetAll
//   - Create : EXEC sp_ItemUsageType_AddEdit  (without @ItemUsageTypeCode)
//   - Update : EXEC sp_ItemUsageType_AddEdit  (with @ItemUsageTypeCode)
//   - Delete : EXEC sp_ItemUsageType_Delete
// AddEdit params: @User, @Node, [@ItemUsageTypeCode], @ItemUsageTypeName, @Status.
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

const toBit = (v) => {
  if (v === true || v === 1 || v === "1") return 1;
  if (typeof v === "string" && v.trim().toUpperCase() === "ACTIVE") return 1;
  return 0;
};

// GET /item-usage-type/lists  -> EXEC sp_ItemUsageType_GetAll
export const getItemUsageTypeList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_ItemUsageType_GetAll");

    const data = result.recordset
      .sort((a, b) => b.ItemUsageTypeCode - a.ItemUsageTypeCode)
      .map((item) => ({
        ...item,
        id: item.ItemUsageTypeCode,
        StatusText: STATUS_LABEL(item.Status),
      }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getItemUsageTypeList):", err);
    return sendError(res, err);
  }
};

// GET /item-usage-type/list/:itemUsageTypeCode  -> single record (from GetAll)
export const getItemUsageTypeById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.itemUsageTypeCode);
    if (!code) return sendError(res, "Invalid ItemUsageTypeCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_ItemUsageType_GetAll");
    const row = result.recordset.find((r) => r.ItemUsageTypeCode === code);

    if (!row) return sendError(res, "Item Usage Type not found", 404);

    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getItemUsageTypeById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_ItemUsageType_AddEdit (btnSave_Click)
const saveOrUpdateItemUsageType = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const name = (body.ItemUsageTypeName || "").trim();

    // Validation mirrors btnSave_Click.
    if (!name)
      return sendError(res, "Item Usage Type Name should not be empty", 400);

    const code = isEdit
      ? parseInt(req.params.itemUsageTypeCode ?? body.ItemUsageTypeCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid ItemUsageTypeCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) request.input("ItemUsageTypeCode", sql.Int, code);
    request.input("ItemUsageTypeName", sql.NVarChar, name);
    request.input("Status", sql.Bit, toBit(body.Status));

    await request.execute("sp_ItemUsageType_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_ItemUsageTypeName_tblItemUsageType")) {
      return sendError(res, "Already exist the ItemUsageType Name", 409);
    }
    console.error("DB Error (saveOrUpdateItemUsageType):", err);
    return sendError(res, err);
  }
};

// POST /item-usage-type/create        -> create
export const createItemUsageType = (req, res) =>
  saveOrUpdateItemUsageType(req, res, false);

// PUT  /item-usage-type/update/:code  -> update
export const updateItemUsageType = (req, res) =>
  saveOrUpdateItemUsageType(req, res, true);

// DELETE /item-usage-type/delete/:itemUsageTypeCode -> EXEC sp_ItemUsageType_Delete
export const deleteItemUsageType = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.itemUsageTypeCode);
    if (!code) return sendError(res, "Invalid ItemUsageTypeCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("ItemUsageTypeCode", sql.Int, code)
      .execute("sp_ItemUsageType_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    // Still referenced elsewhere -> friendly 409 instead of a raw FK error.
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the ItemUsageType!", 409);
    }
    console.error("DB Error (deleteItemUsageType):", err);
    return sendError(res, err);
  }
};
