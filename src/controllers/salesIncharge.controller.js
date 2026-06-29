import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Sales Incharge master (port of the WinForms frmSupervisor / frmSupervisorDetails
// — located in the VB project's "11SalesIncharge" master folder, so "Sales
// Incharge" is the Supervisor master).
//   - List   : EXEC sp_Supervisor_GetAll
//   - Create : EXEC sp_Supervisor_AddEdit   (@C_User / @C_Node, no code)
//   - Update : EXEC sp_Supervisor_AddEdit   (@E_User / @E_Node / @SupervisorCode)
//   - Delete : EXEC sp_Supervisor_Delete
// The VB form (btnSave_Click) validates Supervisor Name as mandatory and maps
// UK_SupervisorName_tbl_Supervisor to "Already exist the Supervisor Name".
// Status: ACTIVE -> 1, INACTIVE -> 0. Mirrors salesType.controller.js.
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

// GET /sales-incharge/lists  -> mirrors frmSupervisorDetails list
export const getSalesInchargeList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_Supervisor_GetAll");

    const data = (result.recordset || []).map((item) => ({
      ...item,
      id: item.SupervisorCode,
      StatusText: STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getSalesInchargeList):", err);
    return sendError(res, err);
  }
};

// GET /sales-incharge/list/:supervisorCode  -> single record (filtered from GetAll)
export const getSalesInchargeById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = toInt(req.params.supervisorCode);
    if (!code) return sendError(res, "Invalid SupervisorCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_Supervisor_GetAll");
    const row = (result.recordset || []).find(
      (r) => toInt(r.SupervisorCode) === code
    );

    if (!row) return sendError(res, "Sales Incharge not found", 404);
    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getSalesInchargeById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_Supervisor_AddEdit (btnSave_Click)
const saveOrUpdateSalesIncharge = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const supervisorName = (body.SupervisorName || "").trim();

    // Same validation the form enforces (btnSave_Click).
    if (!supervisorName)
      return sendError(res, "Supervisor Name should not be empty", 400);

    const code = isEdit
      ? toInt(req.params.supervisorCode ?? body.SupervisorCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid SupervisorCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // The proc uses C_* params for a new row and E_* params for an edit.
    if (isEdit) {
      request.input("E_User", sql.Int, toInt(userId));
      request.input("E_Node", sql.Int, toInt(nodeCode));
      request.input("SupervisorCode", sql.Int, code);
    } else {
      request.input("C_User", sql.Int, toInt(userId));
      request.input("C_Node", sql.Int, toInt(nodeCode));
    }
    request.input("SupervisorName", sql.NVarChar, supervisorName);
    // Default to ACTIVE when Status is omitted (VB combo defaults to ACTIVE).
    request.input("Status", sql.Bit, body.Status === undefined ? 1 : toBit(body.Status));

    await request.execute("sp_Supervisor_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique index -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_SupervisorName_tbl_Supervisor")) {
      return sendError(res, "Already exist the Supervisor Name", 409);
    }
    console.error("DB Error (saveOrUpdateSalesIncharge):", err);
    return sendError(res, err);
  }
};

// POST /sales-incharge/create        -> create
export const createSalesIncharge = (req, res) =>
  saveOrUpdateSalesIncharge(req, res, false);

// PUT  /sales-incharge/update/:code  -> update
export const updateSalesIncharge = (req, res) =>
  saveOrUpdateSalesIncharge(req, res, true);

// DELETE /sales-incharge/delete/:supervisorCode -> EXEC sp_Supervisor_Delete
export const deleteSalesIncharge = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = toInt(req.params.supervisorCode);
    if (!code) return sendError(res, "Invalid SupervisorCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("SupervisorCode", sql.Int, code)
      .execute("sp_Supervisor_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the Supervisor!", 409);
    }
    console.error("DB Error (deleteSalesIncharge):", err);
    return sendError(res, err);
  }
};
