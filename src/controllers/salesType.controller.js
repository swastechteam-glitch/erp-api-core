import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Sales Type master (port of the WinForms frmSalesType / frmSalesTypeDetails)
//   - List   : EXEC sp_SalesType_GetAll
//   - Create : EXEC sp_SalesType_AddEdit   (@C_User / @C_Node, no code)
//   - Update : EXEC sp_SalesType_AddEdit   (@E_User / @E_Node / @SalesTypeCode)
//   - Delete : EXEC sp_SalesType_Delete
// The VB form (btnSave_Click) validates Sales Type, Prefix and Name In Tally as
// mandatory and maps UK_SalesType_tbl_SalesType to "Already exist the SalesType".
// Status combo: ACTIVE -> 1, INACTIVE -> 0. Mirrors countGroup.controller.js.
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

// GET /sales-type/lists  -> mirrors frmSalesTypeDetails list
export const getSalesTypeList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_SalesType_GetAll");

    const data = (result.recordset || []).map((item) => ({
      ...item,
      id: item.SalesTypeCode,
      StatusText: STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getSalesTypeList):", err);
    return sendError(res, err);
  }
};

// GET /sales-type/list/:salesTypeCode  -> single record (filtered from GetAll)
export const getSalesTypeById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = toInt(req.params.salesTypeCode);
    if (!code) return sendError(res, "Invalid SalesTypeCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_SalesType_GetAll");
    const row = (result.recordset || []).find(
      (r) => toInt(r.SalesTypeCode) === code
    );

    if (!row) return sendError(res, "Sales Type not found", 404);
    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getSalesTypeById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_SalesType_AddEdit (btnSave_Click)
const saveOrUpdateSalesType = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const salesType = (body.SalesType || "").trim();
    const prefix = (body.Prefix || "").trim();
    const tally = (body.SalesTypeInTally || "").trim();

    // Same validation the form enforces (btnSave_Click).
    if (!salesType)
      return sendError(res, "SalesType Name should not be empty", 400);
    if (!prefix) return sendError(res, "Prefix should not be empty", 400);
    if (!tally)
      return sendError(res, "Sales Type Name In Tally should not be empty", 400);

    const code = isEdit
      ? toInt(req.params.salesTypeCode ?? body.SalesTypeCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid SalesTypeCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // The proc uses C_* params for a new row and E_* params for an edit.
    if (isEdit) {
      request.input("E_User", sql.Int, toInt(userId));
      request.input("E_Node", sql.Int, toInt(nodeCode));
      request.input("SalesTypeCode", sql.Int, code);
    } else {
      request.input("C_User", sql.Int, toInt(userId));
      request.input("C_Node", sql.Int, toInt(nodeCode));
    }
    request.input("SalesType", sql.NVarChar, salesType);
    request.input("SalesTypeInTally", sql.NVarChar, tally);
    request.input("Prefix", sql.NVarChar, prefix);
    request.input("Status", sql.Bit, toBit(body.Status));

    await request.execute("sp_SalesType_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique index -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_SalesType_tbl_SalesType")) {
      return sendError(res, "Already exist the SalesType", 409);
    }
    console.error("DB Error (saveOrUpdateSalesType):", err);
    return sendError(res, err);
  }
};

// POST /sales-type/create        -> create
export const createSalesType = (req, res) =>
  saveOrUpdateSalesType(req, res, false);

// PUT  /sales-type/update/:code  -> update
export const updateSalesType = (req, res) =>
  saveOrUpdateSalesType(req, res, true);

// DELETE /sales-type/delete/:salesTypeCode -> EXEC sp_SalesType_Delete
export const deleteSalesType = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = toInt(req.params.salesTypeCode);
    if (!code) return sendError(res, "Invalid SalesTypeCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("SalesTypeCode", sql.Int, code)
      .execute("sp_SalesType_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the SalesType!", 409);
    }
    console.error("DB Error (deleteSalesType):", err);
    return sendError(res, err);
  }
};
