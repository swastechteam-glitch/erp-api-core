import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Item Group master (port of the WinForms frmItemGroup)
//   - List   : EXEC sp_ItemGroup_GetAll
//   - Create : EXEC sp_ItemGroup_AddEdit  (without @ItemGroupCode)
//   - Update : EXEC sp_ItemGroup_AddEdit  (with @ItemGroupCode)
//   - Delete : EXEC sp_ItemGroup_Delete
// AddEdit params: @User, @Node, [@ItemGroupCode], @ItemGroupName. (No Status.)
// ---------------------------------------------------------------------------

// GET /item-group/lists  -> EXEC sp_ItemGroup_GetAll
export const getItemGroupList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_ItemGroup_GetAll");

    const data = result.recordset
      // Newest first (the SP doesn't guarantee order, so sort here).
      .sort((a, b) => b.ItemGroupCode - a.ItemGroupCode)
      .map((item) => ({ ...item, id: item.ItemGroupCode }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getItemGroupList):", err);
    return sendError(res, err);
  }
};

// GET /item-group/list/:itemGroupCode  -> single record (filtered from GetAll)
export const getItemGroupById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.itemGroupCode);
    if (!code) return sendError(res, "Invalid ItemGroupCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_ItemGroup_GetAll");
    const row = result.recordset.find((r) => r.ItemGroupCode === code);

    if (!row) return sendError(res, "Item Group not found", 404);

    return sendSuccess(res, row);
  } catch (err) {
    console.error("DB Error (getItemGroupById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_ItemGroup_AddEdit (btnSave_Click)
const saveOrUpdateItemGroup = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const name = (body.ItemGroupName || "").trim();

    // Same validation the form enforces: name is mandatory.
    if (!name)
      return sendError(res, "ItemGroup Name should not be empty", 400);

    const code = isEdit
      ? parseInt(req.params.itemGroupCode ?? body.ItemGroupCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid ItemGroupCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) request.input("ItemGroupCode", sql.Int, code);
    request.input("ItemGroupName", sql.NVarChar, name);

    await request.execute("sp_ItemGroup_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_ItemGroupName_tblItemGroup")) {
      return sendError(res, "Already exist the ItemGroup Name", 409);
    }
    console.error("DB Error (saveOrUpdateItemGroup):", err);
    return sendError(res, err);
  }
};

// POST /item-group/create        -> create
export const createItemGroup = (req, res) =>
  saveOrUpdateItemGroup(req, res, false);

// PUT  /item-group/update/:code  -> update
export const updateItemGroup = (req, res) =>
  saveOrUpdateItemGroup(req, res, true);

// DELETE /item-group/delete/:itemGroupCode -> EXEC sp_ItemGroup_Delete
export const deleteItemGroup = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.itemGroupCode);
    if (!code) return sendError(res, "Invalid ItemGroupCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("ItemGroupCode", sql.Int, code)
      .execute("sp_ItemGroup_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    // Still referenced elsewhere -> friendly 409 instead of a raw FK error.
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the ItemGroup!", 409);
    }
    console.error("DB Error (deleteItemGroup):", err);
    return sendError(res, err);
  }
};
