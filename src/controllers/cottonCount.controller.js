import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Cotton Count master (port of the WinForms frmCottonCount)
//   - List   : SELECT from tbl_CottonCount   (form uses a direct select)
//   - Create : EXEC sp_CottonCount_AddEdit   (without @CottonCountCode)
//   - Update : EXEC sp_CottonCount_AddEdit   (with @CottonCountCode)
//   - Delete : EXEC sp_CottonCount_Delete
// AddEdit requires @User / @Node which we read from the auth token (headers).
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

const toBit = (v) => {
  if (v === true || v === 1 || v === "1") return 1;
  if (typeof v === "string" && v.trim().toUpperCase() === "ACTIVE") return 1;
  return 0;
};

// GET /cotton-count/lists  -> mirrors frmCottonCountDetails list
export const getCottonCountList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .query(
        "Select CottonCountCode, CottonCountName, Status from tbl_CottonCount"
      );

    const data = result.recordset.map((item) => ({
      ...item,
      id: item.CottonCountCode,
      StatusText: STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getCottonCountList):", err);
    return sendError(res, err);
  }
};

// GET /cotton-count/list/:cottonCountCode  -> single record
export const getCottonCountById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.cottonCountCode);
    if (!code) return sendError(res, "Invalid CottonCountCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CottonCountCode", sql.Int, code)
      .query(
        "Select CottonCountCode, CottonCountName, Status " +
          "from tbl_CottonCount where CottonCountCode = @CottonCountCode"
      );

    if (!result.recordset.length)
      return sendError(res, "Cotton Count not found", 404);

    const row = result.recordset[0];
    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getCottonCountById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_CottonCount_AddEdit (btnSave_Click)
const saveOrUpdateCottonCount = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const name = (body.CottonCountName || "").trim();

    // Same validation the form enforces: name is mandatory.
    if (!name)
      return sendError(res, "CottonCount Name should not be empty", 400);

    const code = isEdit
      ? parseInt(req.params.cottonCountCode ?? body.CottonCountCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid CottonCountCode for update", 400);

    const pool = await getPool(req.headers.subdbname);

    // Reject a duplicate name BEFORE saving.
    const dupReq = pool.request().input("Name", sql.NVarChar, name);
    let dupQuery =
      "SELECT 1 from tbl_CottonCount WHERE LTRIM(RTRIM(CottonCountName)) = @Name";
    if (isEdit) {
      dupReq.input("Code", sql.Int, code);
      dupQuery += " AND CottonCountCode <> @Code";
    }
    const dup = await dupReq.query(dupQuery);
    if (dup.recordset.length) return sendError(res, "Mixing already exists", 409);

    const request = pool.request();

    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) request.input("CottonCountCode", sql.Int, code);
    request.input("CottonCountName", sql.NVarChar, name);
    request.input("Status", sql.Bit, toBit(body.Status));

    await request.execute("sp_CottonCount_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique index -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("IX_tbl_CottonCount")) {
      return sendError(res, "Already exist the Cotton Count Name", 409);
    }
    console.error("DB Error (saveOrUpdateCottonCount):", err);
    return sendError(res, err);
  }
};

// POST /cotton-count/create        -> create
export const createCottonCount = (req, res) =>
  saveOrUpdateCottonCount(req, res, false);

// PUT  /cotton-count/update/:code  -> update
export const updateCottonCount = (req, res) =>
  saveOrUpdateCottonCount(req, res, true);

// DELETE /cotton-count/delete/:cottonCountCode -> EXEC sp_CottonCount_Delete
export const deleteCottonCount = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.cottonCountCode);
    if (!code) return sendError(res, "Invalid CottonCountCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("CottonCountCode", sql.Int, code)
      .execute("sp_CottonCount_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the Cotton Count!", 409);
    }
    console.error("DB Error (deleteCottonCount):", err);
    return sendError(res, err);
  }
};
