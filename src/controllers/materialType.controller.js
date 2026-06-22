import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Material Type master (port of the WinForms frmMaterialType)
//   - List   : EXEC sp_MaterialType_GetAll
//   - Create : EXEC sp_MaterialType_AddEdit   (without @MaterialTypeCode)
//   - Update : EXEC sp_MaterialType_AddEdit   (with @MaterialTypeCode)
//   - Delete : EXEC sp_MaterialType_Delete
// NOTE: AddEdit does NOT take @User / @Node (matches the VB btnSave_Click).
// The WinForms ItemType radio group (Item=I / Raw Material=R / Waste Item=W /
// Count Type=C) is sent as a single @ItemType char.
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

const ITEM_TYPES = ["I", "R", "W", "C"];

const toBit = (v) => {
  if (v === true || v === 1 || v === "1") return 1;
  if (typeof v === "string" && v.trim().toUpperCase() === "ACTIVE") return 1;
  return 0;
};

const toItemType = (v) => {
  const t = (v || "I").toString().trim().toUpperCase();
  return ITEM_TYPES.includes(t) ? t : "I";
};

// GET /material-type/lists  -> mirrors frmMaterialTypeDetails list
export const getMaterialTypeList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_MaterialType_GetAll");

    const data = result.recordset.map((item) => ({
      ...item,
      id: item.MaterialTypeCode,
      StatusText: STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getMaterialTypeList):", err);
    return sendError(res, err);
  }
};

// GET /material-type/list/:code  -> single record
export const getMaterialTypeById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.code);
    if (!code) return sendError(res, "Invalid MaterialTypeCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("MaterialTypeCode", sql.Int, code)
      .query(
        "Select MaterialTypeCode, MaterialType, Status, ItemType " +
          "from tbl_MaterialType where MaterialTypeCode = @MaterialTypeCode"
      );

    if (!result.recordset.length)
      return sendError(res, "Material Type not found", 404);

    const row = result.recordset[0];
    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getMaterialTypeById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_MaterialType_AddEdit (btnSave_Click)
const saveOrUpdate = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const body = req.body || {};
    const name = (body.MaterialType || "").trim();

    // Same validation the form enforces.
    if (!name) return sendError(res, "Material Type should not be empty", 400);

    const code = isEdit
      ? parseInt(req.params.code ?? body.MaterialTypeCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid MaterialTypeCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    if (isEdit) request.input("MaterialTypeCode", sql.Int, code);
    request.input("MaterialType", sql.NVarChar, name);
    request.input("Status", sql.Bit, toBit(body.Status));
    request.input("ItemType", sql.VarChar, toItemType(body.ItemType));

    await request.execute("sp_MaterialType_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint -> friendly 409.
    if (err.message && err.message.includes("UK_")) {
      return sendError(res, "Already exist the Material Type", 409);
    }
    console.error("DB Error (saveOrUpdateMaterialType):", err);
    return sendError(res, err);
  }
};

// POST /material-type/create        -> create
export const createMaterialType = (req, res) =>
  saveOrUpdate(req, res, false);

// PUT  /material-type/update/:code  -> update
export const updateMaterialType = (req, res) =>
  saveOrUpdate(req, res, true);

// DELETE /material-type/delete/:code -> EXEC sp_MaterialType_Delete
export const deleteMaterialType = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.code);
    if (!code) return sendError(res, "Invalid MaterialTypeCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("MaterialTypeCode", sql.Int, code)
      .execute("sp_MaterialType_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the Material Type!", 409);
    }
    console.error("DB Error (deleteMaterialType):", err);
    return sendError(res, err);
  }
};
