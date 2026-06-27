import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Mixing Name master (port of the WinForms frmMixingName / frmMixingNameDetails)
//   - List   : EXEC sp_MixingName_GetAll
//   - Create : EXEC sp_MixingName_AddEdit   (@C_User/@C_Node, no @MixingNameCode)
//   - Update : EXEC sp_MixingName_AddEdit   (@E_User/@E_Node, with @MixingNameCode)
//   - Delete : EXEC sp_MixingName_Delete
// AddEdit requires User / Node which we read from the auth token (headers).
// Mirrors the form: Mixing Name + Short Name (both required) + Status.
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

const toBit = (v) => {
  if (v === true || v === 1 || v === "1") return 1;
  if (typeof v === "string" && v.trim().toUpperCase() === "ACTIVE") return 1;
  return 0;
};

// GET /mixing-name/lists  -> mirrors frmMixingNameDetails list
export const getMixingNameList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_MixingName_GetAll");

    const data = result.recordset.map((item) => ({
      ...item,
      id: item.MixingNameCode,
      StatusText: STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getMixingNameList):", err);
    return sendError(res, err);
  }
};

// GET /mixing-name/list/:mixingNameCode  -> single record
export const getMixingNameById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.mixingNameCode);
    if (!code) return sendError(res, "Invalid MixingNameCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("MixingNameCode", sql.Int, code)
      .query(
        "SELECT MixingNameCode, MixingName, ShortName, Status " +
          "FROM tbl_MixingName WHERE MixingNameCode = @MixingNameCode"
      );

    if (!result.recordset.length)
      return sendError(res, "Mixing Name not found", 404);

    const row = result.recordset[0];
    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getMixingNameById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_MixingName_AddEdit (btnSave_Click)
const saveOrUpdateMixingName = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const name = (body.MixingName || "").trim();
    const shortName = (body.ShortName || "").trim();

    // Same validation the form enforces: both names are mandatory.
    if (!name)
      return sendError(res, "Mixing Name should not be empty", 400);
    if (!shortName)
      return sendError(res, "Short Name should not be empty", 400);

    const code = isEdit
      ? parseInt(req.params.mixingNameCode ?? body.MixingNameCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid MixingNameCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // The SP uses create-prefixed (@C_*) vs edit-prefixed (@E_*) audit params.
    if (isEdit) {
      request.input("E_User", sql.Int, parseInt(userId));
      request.input("E_Node", sql.Int, parseInt(nodeCode));
      request.input("MixingNameCode", sql.Int, code);
    } else {
      request.input("C_User", sql.Int, parseInt(userId));
      request.input("C_Node", sql.Int, parseInt(nodeCode));
    }
    request.input("MixingName", sql.NVarChar, name);
    request.input("ShortName", sql.NVarChar, shortName);
    request.input("Status", sql.Bit, toBit(body.Status));

    await request.execute("sp_MixingName_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_MixingName")) {
      return sendError(res, "Already exist the Mixing Name", 409);
    }
    console.error("DB Error (saveOrUpdateMixingName):", err);
    return sendError(res, err);
  }
};

// POST /mixing-name/create        -> create
export const createMixingName = (req, res) =>
  saveOrUpdateMixingName(req, res, false);

// PUT  /mixing-name/update/:code  -> update
export const updateMixingName = (req, res) =>
  saveOrUpdateMixingName(req, res, true);

// DELETE /mixing-name/delete/:mixingNameCode -> EXEC sp_MixingName_Delete
export const deleteMixingName = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.mixingNameCode);
    if (!code) return sendError(res, "Invalid MixingNameCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("MixingNameCode", sql.Int, code)
      .execute("sp_MixingName_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the Mixing Name!", 409);
    }
    console.error("DB Error (deleteMixingName):", err);
    return sendError(res, err);
  }
};
