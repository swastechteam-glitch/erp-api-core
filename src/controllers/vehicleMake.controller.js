import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Vehicle Make master (port of the WinForms frmVehicleMake)
//   - List   : EXEC sp_VehicleMake_GetAll @VehicleTypeCode = 1
//   - Create : EXEC sp_VehicleMake_AddEdit  (without @VehicleMakeCode)
//   - Update : EXEC sp_VehicleMake_AddEdit  (with @VehicleMakeCode)
//   - Delete : EXEC sp_VehicleMake_Delete
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

// GET /vehicle-make/lists  -> mirrors frmVehicleMakeDetails list query
export const getVehicleMakeList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("VehicleTypeCode", sql.Int, VEHICLE_TYPE_CODE)
      .execute("sp_VehicleMake_GetAll");

    const data = result.recordset.map((item) => ({
      ...item,
      id: item.VehicleMakeCode,
      StatusText: STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getVehicleMakeList):", err);
    return sendError(res, err);
  }
};

// GET /vehicle-make/list/:vehicleMakeCode  -> single record
export const getVehicleMakeById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.vehicleMakeCode);
    if (!code) return sendError(res, "Invalid VehicleMakeCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("VehicleMakeCode", sql.Int, code)
      .query(
        "Select VehicleMakeCode, VehicleMakeName, VehicleTypeCode, Status " +
          "from tbl_VehicleMake where VehicleMakeCode = @VehicleMakeCode"
      );

    if (!result.recordset.length)
      return sendError(res, "Vehicle Make not found", 404);

    const row = result.recordset[0];
    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getVehicleMakeById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_VehicleMake_AddEdit (btnSave_Click)
const saveOrUpdateVehicleMake = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const name = (body.VehicleMakeName || "").trim();

    // Same validation the form enforces: name is mandatory.
    if (!name)
      return sendError(res, "VehicleMake Name should not be empty", 400);

    const code = isEdit
      ? parseInt(req.params.vehicleMakeCode ?? body.VehicleMakeCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid VehicleMakeCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) request.input("VehicleMakeCode", sql.Int, code);
    request.input("VehicleTypeCode", sql.Int, VEHICLE_TYPE_CODE);
    request.input("VehicleMakeName", sql.NVarChar, name);
    request.input("Status", sql.Bit, toBit(body.Status));

    await request.execute("sp_VehicleMake_AddEdit");

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
      err.message.includes("UK_VehicleMakeName_tblVehicleMake")
    ) {
      return sendError(res, "Already exist the VehicleMake Name", 409);
    }
    console.error("DB Error (saveOrUpdateVehicleMake):", err);
    return sendError(res, err);
  }
};

// POST /vehicle-make/create        -> create
export const createVehicleMake = (req, res) =>
  saveOrUpdateVehicleMake(req, res, false);

// PUT  /vehicle-make/update/:code  -> update
export const updateVehicleMake = (req, res) =>
  saveOrUpdateVehicleMake(req, res, true);

// DELETE /vehicle-make/delete/:vehicleMakeCode -> EXEC sp_VehicleMake_Delete
export const deleteVehicleMake = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.vehicleMakeCode);
    if (!code) return sendError(res, "Invalid VehicleMakeCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("VehicleMakeCode", sql.Int, code)
      .execute("sp_VehicleMake_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    // Still referenced elsewhere -> friendly 409 instead of a raw FK error.
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the VehicleMake!", 409);
    }
    console.error("DB Error (deleteVehicleMake):", err);
    return sendError(res, err);
  }
};
