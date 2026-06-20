import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Vehicle Capacity master (port of the WinForms frmVehicleCapacity)
//   - List   : EXEC sp_VehicleCapacity_GetAll @VehicleTypeCode = 1
//   - Create : EXEC sp_VehicleCapacity_AddEdit  (without @VehicleCapacityCode)
//   - Update : EXEC sp_VehicleCapacity_AddEdit  (with @VehicleCapacityCode)
//   - Delete : EXEC sp_VehicleCapacity_Delete
// AddEdit requires @User / @Node which we read from the auth token (headers).
// VehicleTypeCode is fixed at 1 (Vehicle) — same default the form uses.
// ---------------------------------------------------------------------------

const VEHICLE_TYPE_CODE = 1;

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

const toBit = (v) => {
  if (v === true || v === 1 || v === "1") return 1;
  if (typeof v === "string" && v.trim().toUpperCase() === "ACTIVE") return 1;
  return 0;
};

// GET /vehicle-capacity/lists  -> mirrors frmVehicleCapacityDetails list query
export const getVehicleCapacityList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("VehicleTypeCode", sql.Int, VEHICLE_TYPE_CODE)
      .execute("sp_VehicleCapacity_GetAll");

    const data = result.recordset.map((item) => ({
      ...item,
      id: item.VehicleCapacityCode,
      StatusText: STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getVehicleCapacityList):", err);
    return sendError(res, err);
  }
};

// GET /vehicle-capacity/list/:vehicleCapacityCode  -> single record
export const getVehicleCapacityById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.vehicleCapacityCode);
    if (!code) return sendError(res, "Invalid VehicleCapacityCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("VehicleCapacityCode", sql.Int, code)
      .query(
        "Select VehicleCapacityCode, VehicleCapacityName, Capacity, VehicleTypeCode, Status " +
          "from tbl_VehicleCapacity where VehicleCapacityCode = @VehicleCapacityCode"
      );

    if (!result.recordset.length)
      return sendError(res, "Vehicle Capacity not found", 404);

    const row = result.recordset[0];
    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getVehicleCapacityById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_VehicleCapacity_AddEdit (btnSave_Click)
const saveOrUpdateVehicleCapacity = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const name = (body.VehicleCapacityName || "").trim();
    const capacity = Number(body.Capacity) || 0;

    // Same validations the form enforces: name + capacity are mandatory.
    if (!name)
      return sendError(res, "VehicleCapacity Name should not be empty", 400);
    if (!capacity) return sendError(res, "Enter the Capacity", 400);

    const code = isEdit
      ? parseInt(req.params.vehicleCapacityCode ?? body.VehicleCapacityCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid VehicleCapacityCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) request.input("VehicleCapacityCode", sql.Int, code);
    request.input("VehicleTypeCode", sql.Int, VEHICLE_TYPE_CODE);
    request.input("VehicleCapacityName", sql.NVarChar, name);
    request.input("Capacity", sql.Decimal(18, 2), capacity);
    request.input("Status", sql.Bit, toBit(body.Status));

    await request.execute("sp_VehicleCapacity_AddEdit");

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
      err.message.includes("UK_VehicleCapacityName_tblVehicleCapacity")
    ) {
      return sendError(res, "Already exist the VehicleCapacity Name", 409);
    }
    console.error("DB Error (saveOrUpdateVehicleCapacity):", err);
    return sendError(res, err);
  }
};

// POST /vehicle-capacity/create        -> create
export const createVehicleCapacity = (req, res) =>
  saveOrUpdateVehicleCapacity(req, res, false);

// PUT  /vehicle-capacity/update/:code  -> update
export const updateVehicleCapacity = (req, res) =>
  saveOrUpdateVehicleCapacity(req, res, true);

// DELETE /vehicle-capacity/delete/:vehicleCapacityCode -> EXEC sp_VehicleCapacity_Delete
export const deleteVehicleCapacity = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.vehicleCapacityCode);
    if (!code) return sendError(res, "Invalid VehicleCapacityCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("VehicleCapacityCode", sql.Int, code)
      .execute("sp_VehicleCapacity_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the VehicleCapacity!", 409);
    }
    console.error("DB Error (deleteVehicleCapacity):", err);
    return sendError(res, err);
  }
};
