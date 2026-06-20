import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Raw Material Type master (port of the WinForms frmRawMaterialType)
//   - List   : EXEC sp_RawMaterialType_GetAll
//   - Create : EXEC sp_RawMaterialType_AddEdit  (without @RawMaterialTypeCode)
//   - Update : EXEC sp_RawMaterialType_AddEdit  (with @RawMaterialTypeCode)
//   - Delete : EXEC sp_RawMaterialType_Delete
// NOTE: this AddEdit proc takes NO @User / @Node (unlike most masters).
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

const toBit = (v) => {
  if (v === true || v === 1 || v === "1") return 1;
  if (typeof v === "string" && v.trim().toUpperCase() === "ACTIVE") return 1;
  return 0;
};

// GET /raw-material-type/lists  -> mirrors frmRawMaterialTypeDetails list
export const getRawMaterialTypeList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_RawMaterialType_GetAll");

    const data = result.recordset.map((item) => ({
      ...item,
      id: item.RawMaterialTypeCode,
      StatusText: STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getRawMaterialTypeList):", err);
    return sendError(res, err);
  }
};

// GET /raw-material-type/list/:rawMaterialTypeCode  -> single record
export const getRawMaterialTypeById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.rawMaterialTypeCode);
    if (!code) return sendError(res, "Invalid RawMaterialTypeCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("RawMaterialTypeCode", sql.Int, code)
      .query(
        "Select RawMaterialTypeCode, RawMaterialTypeName, Status " +
          "from tbl_RawMaterialType where RawMaterialTypeCode = @RawMaterialTypeCode"
      );

    if (!result.recordset.length)
      return sendError(res, "Raw Material Type not found", 404);

    const row = result.recordset[0];
    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getRawMaterialTypeById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_RawMaterialType_AddEdit (btnSave_Click)
const saveOrUpdateRawMaterialType = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const body = req.body || {};
    const name = (body.RawMaterialTypeName || "").trim();

    // Same validation the form enforces: name is mandatory.
    if (!name)
      return sendError(res, "Raw Material Type should not be empty", 400);

    const code = isEdit
      ? parseInt(req.params.rawMaterialTypeCode ?? body.RawMaterialTypeCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid RawMaterialTypeCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    if (isEdit) request.input("RawMaterialTypeCode", sql.Int, code);
    request.input("RawMaterialTypeName", sql.NVarChar, name);
    request.input("Status", sql.Bit, toBit(body.Status));

    await request.execute("sp_RawMaterialType_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (err.message && err.message.includes("UK_")) {
      return sendError(res, "Already exist the Raw Material Type", 409);
    }
    console.error("DB Error (saveOrUpdateRawMaterialType):", err);
    return sendError(res, err);
  }
};

// POST /raw-material-type/create        -> create
export const createRawMaterialType = (req, res) =>
  saveOrUpdateRawMaterialType(req, res, false);

// PUT  /raw-material-type/update/:code  -> update
export const updateRawMaterialType = (req, res) =>
  saveOrUpdateRawMaterialType(req, res, true);

// DELETE /raw-material-type/delete/:rawMaterialTypeCode -> EXEC sp_RawMaterialType_Delete
export const deleteRawMaterialType = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.rawMaterialTypeCode);
    if (!code) return sendError(res, "Invalid RawMaterialTypeCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("RawMaterialTypeCode", sql.Int, code)
      .execute("sp_RawMaterialType_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the Raw Material Type!", 409);
    }
    console.error("DB Error (deleteRawMaterialType):", err);
    return sendError(res, err);
  }
};
