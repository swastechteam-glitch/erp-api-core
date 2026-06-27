import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Maintenance Designation master (port of WinForms frmMaintenanceDesignation)
//   - List   : EXEC sp_MaintenanceDesignation_GetALL
//   - Create : EXEC sp_MaintenanceDesignation_AddEdit  (without @MaintenanceDesignationCode)
//   - Update : EXEC sp_MaintenanceDesignation_AddEdit  (with @MaintenanceDesignationCode)
//   - Delete : EXEC sp_MaintenanceDesignation_Delete
// Two fields only: DesignationName (required) + Salary (> 0). AddEdit needs
// @User / @Node from the auth token (headers).
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};

// GET /maintenance-designation/lists -> EXEC sp_MaintenanceDesignation_GetALL
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_MaintenanceDesignation_GetALL");
    const data = (result.recordset || [])
      .sort((a, b) => b.MaintenanceDesignationCode - a.MaintenanceDesignationCode)
      .map((item) => ({ ...item, id: item.MaintenanceDesignationCode }));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getMaintenanceDesignationList):", err);
    return sendError(res, err);
  }
};

// GET /maintenance-designation/list/:maintenanceDesignationCode -> single record
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.maintenanceDesignationCode);
    if (!code) return sendError(res, "Invalid MaintenanceDesignationCode", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_MaintenanceDesignation_GetALL");
    const row = (result.recordset || []).find((r) => r.MaintenanceDesignationCode === code);
    if (!row) return sendError(res, "Maintenance Designation not found", 404);
    return sendSuccess(res, row);
  } catch (err) {
    console.error("DB Error (getMaintenanceDesignationById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_MaintenanceDesignation_AddEdit (btnSave_Click)
const saveOrUpdate = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode) return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const name = (body.DesignationName || "").trim();
    const salary = toNum(body.Salary);

    // Same validation the form enforces.
    if (!name) return sendError(res, "Designation Name should not be Empty", 400);
    if (salary <= 0) return sendError(res, "Salary should not be Empty", 400);

    const code = isEdit ? toInt(req.params.maintenanceDesignationCode ?? body.MaintenanceDesignationCode) : null;
    if (isEdit && !code) return sendError(res, "Invalid MaintenanceDesignationCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();
    if (isEdit) request.input("MaintenanceDesignationCode", sql.Int, code);
    request.input("DesignationName", sql.NVarChar, name);
    request.input("Salary", sql.Decimal(18, 2), salary);
    request.input("User", sql.Int, toInt(userId));
    request.input("Node", sql.Int, toInt(nodeCode));

    await request.execute("sp_MaintenanceDesignation_AddEdit");
    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (err.message && err.message.includes("UK_")) {
      return sendError(res, "Already exist the Designation Name", 409);
    }
    console.error("DB Error (saveOrUpdateMaintenanceDesignation):", err);
    return sendError(res, err);
  }
};

export const create = (req, res) => saveOrUpdate(req, res, false);
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /maintenance-designation/delete/:maintenanceDesignationCode
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.maintenanceDesignationCode);
    if (!code) return sendError(res, "Invalid MaintenanceDesignationCode", 400);
    const pool = await getPool(req.headers.subdbname);
    await pool.request().input("MaintenanceDesignationCode", sql.Int, code).execute("sp_MaintenanceDesignation_Delete");
    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("FK_tbl") || err.message.includes("REFERENCE"))) {
      return sendError(res, "Can't able to Delete", 409);
    }
    console.error("DB Error (deleteMaintenanceDesignation):", err);
    return sendError(res, err);
  }
};
