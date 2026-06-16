import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Maintenance Group master (port of the WinForms frmMaintenanceGroup)
//   - List   : EXEC sp_MaintenanceGroup_GetAll
//   - Create : EXEC sp_MaintenanceGroup_AddEdit  (without @MaintenanceGroupCode)
//   - Update : EXEC sp_MaintenanceGroup_AddEdit  (with @MaintenanceGroupCode)
//   - Delete : EXEC sp_MaintenanceGroup_Delete
// AddEdit requires @User / @Node which we read from the auth token (headers).
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

// Accepts true / 1 / "1" / "ACTIVE" as active, everything else inactive.
const toStatusBit = (status) => {
  if (status === true || status === 1 || status === "1") return 1;
  if (typeof status === "string" && status.trim().toUpperCase() === "ACTIVE")
    return 1;
  return 0;
};

// GET /maintenance-group/lists  -> EXEC sp_MaintenanceGroup_GetAll
export const getMaintenanceGroupList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_MaintenanceGroup_GetAll");

    const data = result.recordset
      // Newest first (the SP doesn't guarantee order, so sort here).
      .sort((a, b) => b.MaintenanceGroupCode - a.MaintenanceGroupCode)
      .map((item) => ({
        ...item,
        id: item.MaintenanceGroupCode,
        StatusText: STATUS_LABEL(item.Status),
      }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getMaintenanceGroupList):", err);
    return sendError(res, err);
  }
};

// GET /maintenance-group/list/:maintenanceGroupCode  -> single record
export const getMaintenanceGroupById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.maintenanceGroupCode);
    if (!code) return sendError(res, "Invalid MaintenanceGroupCode", 400);

    const pool = await getPool(req.headers.subdbname);
    // No single-row SP exists; filter the GetAll result so we don't guess the
    // physical table / column names.
    const result = await pool.request().execute("sp_MaintenanceGroup_GetAll");
    const row = result.recordset.find(
      (r) => r.MaintenanceGroupCode === code
    );

    if (!row) return sendError(res, "Maintenance Group not found", 404);

    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getMaintenanceGroupById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_MaintenanceGroup_AddEdit (btnSave_Click)
const saveOrUpdateMaintenanceGroup = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const name = (body.MaintenanceGroupName || "").trim();

    // Same validation the form enforces: name is mandatory.
    if (!name)
      return sendError(res, "Maintenance Group Name should not be empty", 400);

    const code = isEdit
      ? parseInt(req.params.maintenanceGroupCode ?? body.MaintenanceGroupCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid MaintenanceGroupCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    if (isEdit) request.input("MaintenanceGroupCode", sql.Int, code);
    request.input("MaintenanceGroupName", sql.NVarChar, name);
    request.input("Status", sql.Bit, toStatusBit(body.Status));
    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));

    await request.execute("sp_MaintenanceGroup_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_MaintenanceGroupName")) {
      return sendError(res, "Already exist the Maintenance Group Name", 409);
    }
    console.error("DB Error (saveOrUpdateMaintenanceGroup):", err);
    return sendError(res, err);
  }
};

// POST /maintenance-group/create        -> create
export const createMaintenanceGroup = (req, res) =>
  saveOrUpdateMaintenanceGroup(req, res, false);

// PUT  /maintenance-group/update/:code  -> update
export const updateMaintenanceGroup = (req, res) =>
  saveOrUpdateMaintenanceGroup(req, res, true);

// DELETE /maintenance-group/delete/:maintenanceGroupCode -> EXEC sp_MaintenanceGroup_Delete
export const deleteMaintenanceGroup = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.maintenanceGroupCode);
    if (!code) return sendError(res, "Invalid MaintenanceGroupCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();
    request.input("MaintenanceGroupCode", sql.Int, code);

    await request.execute("sp_MaintenanceGroup_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    // Still referenced elsewhere -> friendly 409 instead of a raw FK error.
    if (err.message && err.message.includes("REFERENCE")) {
      return sendError(
        res,
        "This maintenance group is in use and cannot be deleted",
        409
      );
    }
    console.error("DB Error (deleteMaintenanceGroup):", err);
    return sendError(res, err);
  }
};
