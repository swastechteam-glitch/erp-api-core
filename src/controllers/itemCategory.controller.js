import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Item Category master (port of the WinForms frmItemCategory)
//   - List       : EXEC sp_ItemCategory_GetAll
//   - ItemGroups : tbl_ItemGroup (dropdown source)
//   - Create     : EXEC sp_ItemCategory_AddEdit  (without @ItemCategoryCode)
//   - Update     : EXEC sp_ItemCategory_AddEdit  (with @ItemCategoryCode)
//   - Delete     : EXEC sp_ItemCategory_Delete
// AddEdit requires @User / @Node which we read from the auth token (headers).
// (No Status column on this master.)
// ---------------------------------------------------------------------------

// GET /item-category/lists  -> EXEC sp_ItemCategory_GetAll
export const getItemCategoryList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_ItemCategory_GetAll");

    const data = result.recordset
      // Newest first (the SP doesn't guarantee order, so sort here).
      .sort((a, b) => b.ItemCategoryCode - a.ItemCategoryCode)
      .map((item) => ({ ...item, id: item.ItemCategoryCode }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getItemCategoryList):", err);
    return sendError(res, err);
  }
};

// GET /item-category/item-groups  -> dropdown source (tbl_ItemGroup)
export const getItemGroupsDropdown = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .query(
        "Select ItemGroupCode, ItemGroupName from tbl_ItemGroup order by ItemGroupName"
      );

    return sendSuccess(res, result.recordset);
  } catch (err) {
    console.error("DB Error (getItemGroupsDropdown):", err);
    return sendError(res, err);
  }
};

// GET /item-category/list/:itemCategoryCode  -> single record (from GetAll)
export const getItemCategoryById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.itemCategoryCode);
    if (!code) return sendError(res, "Invalid ItemCategoryCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_ItemCategory_GetAll");
    const row = result.recordset.find((r) => r.ItemCategoryCode === code);

    if (!row) return sendError(res, "Item Category not found", 404);

    return sendSuccess(res, row);
  } catch (err) {
    console.error("DB Error (getItemCategoryById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_ItemCategory_AddEdit (btnSave_Click)
const saveOrUpdateItemCategory = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const name = (body.ItemCategoryName || "").trim();
    const itemGroupCode = parseInt(body.ItemGroupCode);

    // Validation mirrors btnSave_Click.
    if (!name)
      return sendError(res, "ItemCategory Name should not be empty", 400);
    if (!itemGroupCode || itemGroupCode <= 0)
      return sendError(res, "Select the Item Group Name", 400);

    const code = isEdit
      ? parseInt(req.params.itemCategoryCode ?? body.ItemCategoryCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid ItemCategoryCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) request.input("ItemCategoryCode", sql.Int, code);
    request.input("ItemGroupCode", sql.Int, itemGroupCode);
    request.input("ItemCategoryName", sql.NVarChar, name);

    await request.execute("sp_ItemCategory_AddEdit");

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
      err.message.includes("UK_ItemCategoryName_tblItemCategory")
    ) {
      return sendError(res, "Already exist the ItemCategory Name", 409);
    }
    console.error("DB Error (saveOrUpdateItemCategory):", err);
    return sendError(res, err);
  }
};

// POST /item-category/create        -> create
export const createItemCategory = (req, res) =>
  saveOrUpdateItemCategory(req, res, false);

// PUT  /item-category/update/:code  -> update
export const updateItemCategory = (req, res) =>
  saveOrUpdateItemCategory(req, res, true);

// DELETE /item-category/delete/:itemCategoryCode -> EXEC sp_ItemCategory_Delete
export const deleteItemCategory = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.itemCategoryCode);
    if (!code) return sendError(res, "Invalid ItemCategoryCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("ItemCategoryCode", sql.Int, code)
      .execute("sp_ItemCategory_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    // Still referenced elsewhere -> friendly 409 instead of a raw FK error.
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(
        res,
        "You can not delete the ItemCategory!",
        409
      );
    }
    console.error("DB Error (deleteItemCategory):", err);
    return sendError(res, err);
  }
};
