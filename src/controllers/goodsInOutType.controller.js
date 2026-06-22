import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Goods In Out Type master (port of the WinForms frmGoodsInOutType)
//   - List   : EXEC sp_GateEntryTransGoodsType_GetAll
//   - Create : EXEC sp_GateEntryTransGoodsType_AddEdit  (without @TransGoodsTypeCode)
//   - Update : EXEC sp_GateEntryTransGoodsType_AddEdit  (with @TransGoodsTypeCode)
//   - Delete : EXEC sp_GateEntryTransGoodsType_Delete
//   - Options: Material Type lookup (GET /goods-in-out-type/options) via tbl_MaterialType
// AddEdit requires @User / @Node which we read from the auth token (headers).
// ---------------------------------------------------------------------------

const toBit = (v) => {
  if (v === true || v === 1 || v === "1") return 1;
  if (typeof v === "string" && v.trim().toUpperCase() === "TRUE") return 1;
  return 0;
};

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};

// GET /goods-in-out-type/lists  -> mirrors frmGoodsInOutTypeDetails list
export const getGoodsInOutTypeList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .execute("sp_GateEntryTransGoodsType_GetAll");

    const data = result.recordset.map((item) => ({
      ...item,
      id: item.TransGoodsTypeCode,
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getGoodsInOutTypeList):", err);
    return sendError(res, err);
  }
};

// GET /goods-in-out-type/list/:code  -> single record (filtered from GetAll)
export const getGoodsInOutTypeById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.code);
    if (!code) return sendError(res, "Invalid TransGoodsTypeCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .execute("sp_GateEntryTransGoodsType_GetAll");

    const row = result.recordset.find(
      (r) => parseInt(r.TransGoodsTypeCode) === code
    );
    if (!row) return sendError(res, "Goods In Out Type not found", 404);

    // Alias the GetAll mode columns (ModeIN*/ModeOUT*) to the camelCase field
    // names the React form binds to, so the edit modal prefills the checkboxes.
    return sendSuccess(res, {
      ...row,
      ModeInReturnable: row.ModeINReturnable,
      ModeInNonReturnable: row.ModeINNONReturnable,
      ModeOutReturnable: row.ModeOUTReturnable,
      ModeOutNonReturnable: row.ModeOUTNONReturnable,
    });
  } catch (err) {
    console.error("DB Error (getGoodsInOutTypeById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_GateEntryTransGoodsType_AddEdit (btnSave_Click)
const saveOrUpdate = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const materialTypeCode = toInt(body.MaterialTypeCode);
    const name = (body.TransGoodsTypeName || "").trim();

    // Same validations the form enforces.
    if (!materialTypeCode) return sendError(res, "Select the Material Type", 400);
    if (!name)
      return sendError(res, "GoodsInOutType Name should not be empty", 400);

    const code = isEdit
      ? parseInt(req.params.code ?? body.TransGoodsTypeCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid TransGoodsTypeCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) request.input("TransGoodsTypeCode", sql.Int, code);
    request.input("MaterialTypeCode", sql.Int, materialTypeCode);
    request.input("TransGoodsTypeName", sql.NVarChar, name);
    request.input("ModeInReturnable", sql.Bit, toBit(body.ModeInReturnable));
    request.input("ModeInNonReturnable", sql.Bit, toBit(body.ModeInNonReturnable));
    request.input("ModeOutReturnable", sql.Bit, toBit(body.ModeOutReturnable));
    request.input("ModeOutNonReturnable", sql.Bit, toBit(body.ModeOutNonReturnable));

    await request.execute("sp_GateEntryTransGoodsType_AddEdit");

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
      err.message.includes("UK_GoodsInOutType_tblGoodsInOutType")
    ) {
      return sendError(res, "Already exist the GoodsInOutType Name", 409);
    }
    console.error("DB Error (saveOrUpdateGoodsInOutType):", err);
    return sendError(res, err);
  }
};

// POST /goods-in-out-type/create        -> create
export const createGoodsInOutType = (req, res) =>
  saveOrUpdate(req, res, false);

// PUT  /goods-in-out-type/update/:code  -> update
export const updateGoodsInOutType = (req, res) =>
  saveOrUpdate(req, res, true);

// DELETE /goods-in-out-type/delete/:code -> EXEC sp_GateEntryTransGoodsType_Delete
export const deleteGoodsInOutType = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.code);
    if (!code) return sendError(res, "Invalid TransGoodsTypeCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("TransGoodsTypeCode", sql.Int, code)
      .execute("sp_GateEntryTransGoodsType_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the Goods In Out Type!", 409);
    }
    console.error("DB Error (deleteGoodsInOutType):", err);
    return sendError(res, err);
  }
};

// GET /goods-in-out-type/options -> Material Type lookup for the form dropdown.
export const getGoodsInOutTypeOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .query("Select MaterialTypeCode, MaterialType from tbl_MaterialType");

    return sendSuccess(res, {
      materialTypes: result.recordset.map((r) => ({
        value: r.MaterialTypeCode,
        label: r.MaterialType,
      })),
    });
  } catch (err) {
    console.error("DB Error (getGoodsInOutTypeOptions):", err);
    return sendError(res, err);
  }
};
