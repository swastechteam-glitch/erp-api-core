import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";
import { isDuplicateByGetAll } from "../utils/duplicateCheck.js";

// ---------------------------------------------------------------------------
// Raw Material master (port of the WinForms frmRawMaterial)
//   - List   : EXEC sp_RawMaterial_GetAll
//   - Create : EXEC sp_RawMaterial_AddEdit  (without @RawMaterialCode)
//   - Update : EXEC sp_RawMaterial_AddEdit  (with @RawMaterialCode)
//   - Delete : EXEC sp_RawMaterial_Delete
//   - Options: Raw Material Type lookup (GET /raw-material/options)
// AddEdit requires @User / @Node which we read from the auth token (headers).
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

const toBit = (v) => {
  if (v === true || v === 1 || v === "1") return 1;
  if (typeof v === "string" && v.trim().toUpperCase() === "ACTIVE") return 1;
  return 0;
};

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};

// GET /raw-material/lists  -> mirrors frmRawMaterialDetails list
export const getRawMaterialList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_RawMaterial_GetAll");

    const data = result.recordset.map((item) => ({
      ...item,
      id: item.RawMaterialCode,
      StatusText: STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getRawMaterialList):", err);
    return sendError(res, err);
  }
};

// GET /raw-material/list/:rawMaterialCode  -> single record
export const getRawMaterialById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.rawMaterialCode);
    if (!code) return sendError(res, "Invalid RawMaterialCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("RawMaterialCode", sql.Int, code)
      .query(
        "Select RawMaterialCode, RawMaterialName, ShortName, RawMaterialTypeCode, HSNCode, Status " +
          "from tbl_RawMaterial where RawMaterialCode = @RawMaterialCode"
      );

    if (!result.recordset.length)
      return sendError(res, "Raw Material not found", 404);

    const row = result.recordset[0];
    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getRawMaterialById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_RawMaterial_AddEdit (btnSave_Click)
const saveOrUpdateRawMaterial = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const name = (body.RawMaterialName || "").trim();
    const shortName = (body.ShortName || "").trim();
    const typeCode = toInt(body.RawMaterialTypeCode);

    // Same validations the form enforces.
    if (!name)
      return sendError(res, "RawMaterial Name should not be empty", 400);
    if (!shortName)
      return sendError(res, "RawMaterial Short Name should not be empty", 400);
    if (!typeCode) return sendError(res, "Select the Raw Material Type", 400);

    const code = isEdit
      ? parseInt(req.params.rawMaterialCode ?? body.RawMaterialCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid RawMaterialCode for update", 400);

    const pool = await getPool(req.headers.subdbname);

    // Reject a duplicate name BEFORE saving.
    if (
      await isDuplicateByGetAll(pool, {
        proc: "sp_RawMaterial_GetAll",
        nameField: "RawMaterialName",
        codeField: "RawMaterialCode",
        name,
        code: isEdit ? code : null,
      })
    )
      return sendError(res, "Raw Material already exists", 409);

    const request = pool.request();

    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) request.input("RawMaterialCode", sql.Int, code);
    request.input("RawMaterialName", sql.NVarChar, name);
    request.input("ShortName", sql.NVarChar, shortName);
    request.input("RawMaterialTypeCode", sql.Int, typeCode);
    request.input("HSNCode", sql.NVarChar, (body.HSNCode || "").trim());
    request.input("Status", sql.Bit, toBit(body.Status));

    await request.execute("sp_RawMaterial_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_tbl_RawMaterial")) {
      return sendError(res, "Already exist the RawMaterial Name", 409);
    }
    console.error("DB Error (saveOrUpdateRawMaterial):", err);
    return sendError(res, err);
  }
};

// POST /raw-material/create        -> create
export const createRawMaterial = (req, res) =>
  saveOrUpdateRawMaterial(req, res, false);

// PUT  /raw-material/update/:code  -> update
export const updateRawMaterial = (req, res) =>
  saveOrUpdateRawMaterial(req, res, true);

// DELETE /raw-material/delete/:rawMaterialCode -> EXEC sp_RawMaterial_Delete
export const deleteRawMaterial = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.rawMaterialCode);
    if (!code) return sendError(res, "Invalid RawMaterialCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("RawMaterialCode", sql.Int, code)
      .execute("sp_RawMaterial_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the RawMaterial!", 409);
    }
    console.error("DB Error (deleteRawMaterial):", err);
    return sendError(res, err);
  }
};

// GET /raw-material/options -> Raw Material Type lookup for the form dropdown.
export const getRawMaterialOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .query("Select RawMaterialTypeCode, RawMaterialTypeName from tbl_RawMaterialType");

    return sendSuccess(res, {
      rawMaterialTypes: result.recordset.map((r) => ({
        value: r.RawMaterialTypeCode,
        label: r.RawMaterialTypeName,
      })),
    });
  } catch (err) {
    console.error("DB Error (getRawMaterialOptions):", err);
    return sendError(res, err);
  }
};
