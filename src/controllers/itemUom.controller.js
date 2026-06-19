import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Item Uom master (port of the WinForms frmItemUom)
//   - List   : EXEC sp_ItemUom_GetAll
//   - Create : EXEC sp_ItemUom_AddEdit  (without @ItemUomCode)
//   - Update : EXEC sp_ItemUom_AddEdit  (with @ItemUomCode)
//   - Delete : EXEC sp_ItemUom_Delete
// AddEdit params: @User, @Node, [@ItemUomCode], @ItemUomName, @UnitInNumbers, @Status.
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

const toBit = (v) => {
  if (v === true || v === 1 || v === "1") return 1;
  if (typeof v === "string" && v.trim().toUpperCase() === "ACTIVE") return 1;
  return 0;
};

// GET /item-uom/lists  -> EXEC sp_ItemUom_GetAll
export const getItemUomList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_ItemUom_GetAll");

    const data = result.recordset
      // Newest first (the SP doesn't guarantee order, so sort here).
      .sort((a, b) => b.ItemUomCode - a.ItemUomCode)
      .map((item) => ({
        ...item,
        id: item.ItemUomCode,
        StatusText: STATUS_LABEL(item.Status),
      }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getItemUomList):", err);
    return sendError(res, err);
  }
};

// GET /item-uom/list/:itemUomCode  -> single record (filtered from GetAll)
export const getItemUomById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.itemUomCode);
    if (!code) return sendError(res, "Invalid ItemUomCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_ItemUom_GetAll");
    const row = result.recordset.find((r) => r.ItemUomCode === code);

    if (!row) return sendError(res, "Item Uom not found", 404);

    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getItemUomById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_ItemUom_AddEdit (btnSave_Click)
const saveOrUpdateItemUom = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const name = (body.ItemUomName || "").trim();
    const unitInNumbers = isNaN(parseFloat(body.UnitInNumbers))
      ? 0
      : parseFloat(body.UnitInNumbers);

    // Validation mirrors btnSave_Click.
    if (!name)
      return sendError(res, "Item Uom Name should not be empty", 400);
    if (!unitInNumbers || unitInNumbers <= 0)
      return sendError(res, "Unit In Numbers should not be empty", 400);

    const code = isEdit
      ? parseInt(req.params.itemUomCode ?? body.ItemUomCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid ItemUomCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) request.input("ItemUomCode", sql.Int, code);
    request.input("ItemUomName", sql.NVarChar, name);
    request.input("UnitInNumbers", sql.Decimal(18, 2), unitInNumbers);
    request.input("Status", sql.Bit, toBit(body.Status));

    await request.execute("sp_ItemUom_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_ItemUomName_tblItemUom")) {
      return sendError(res, "Already exist the ItemUom Name", 409);
    }
    console.error("DB Error (saveOrUpdateItemUom):", err);
    return sendError(res, err);
  }
};

// POST /item-uom/create        -> create
export const createItemUom = (req, res) => saveOrUpdateItemUom(req, res, false);

// PUT  /item-uom/update/:code  -> update
export const updateItemUom = (req, res) => saveOrUpdateItemUom(req, res, true);

// DELETE /item-uom/delete/:itemUomCode -> EXEC sp_ItemUom_Delete
export const deleteItemUom = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.itemUomCode);
    if (!code) return sendError(res, "Invalid ItemUomCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("ItemUomCode", sql.Int, code)
      .execute("sp_ItemUom_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    // Still referenced elsewhere -> friendly 409 instead of a raw FK error.
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the ItemUom!", 409);
    }
    console.error("DB Error (deleteItemUom):", err);
    return sendError(res, err);
  }
};
