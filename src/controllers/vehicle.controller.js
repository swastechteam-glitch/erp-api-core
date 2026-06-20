import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Vehicle master (port of the WinForms frmVehicle)
//   - List    : EXEC sp_Vehicle_GetAll @VehicleTypeCode = 1
//   - Create  : EXEC sp_Vehicle_AddEdit  (without @VehicleCode)
//   - Update  : EXEC sp_Vehicle_AddEdit  (with @VehicleCode)
//   - Delete  : EXEC sp_Vehicle_Delete
//   - Options : lookup lists for the form dropdowns (GET /vehicle/options)
// AddEdit requires @User / @Node which we read from the auth token (headers).
//
// NOTE (scope): the vehicle photo (webcam/image capture) and the service-template
// child grid from the WinForms screen are intentionally NOT handled here yet.
// @VehiclePhoto is always sent as NULL and templates are left untouched.
// ---------------------------------------------------------------------------

const VEHICLE_TYPE_CODE = 1;

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

const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};

// GET /vehicle/lists  -> mirrors frmVehicleDetails list query
export const getVehicleList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("VehicleTypeCode", sql.Int, VEHICLE_TYPE_CODE)
      .execute("sp_Vehicle_GetAll");

    const data = result.recordset.map((item) => {
      // Never ship the raw photo blob in the list payload.
      const { VehiclePhoto, ...rest } = item;
      return {
        ...rest,
        id: item.VehicleCode,
        StatusText: STATUS_LABEL(item.Status),
      };
    });

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getVehicleList):", err);
    return sendError(res, err);
  }
};

// GET /vehicle/list/:vehicleCode  -> single record (no photo blob)
export const getVehicleById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.vehicleCode);
    if (!code) return sendError(res, "Invalid VehicleCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("VehicleCode", sql.Int, code)
      .query(
        `Select VehicleCode, VehicleName, RegistrationNumber, RegistrationDate,
                VehicleTypeCode, FuelType, RatePerKm_Hour, RatePerHrsBreaking,
                LoadingCost, RateTypeCode, UsageTypeCode, DepartmentCode,
                VehicleMakeCode, VehicleCapacityCode, MaintHeadCode, FuelHeadCode,
                GoodsCarrier, Status
         from tbl_Vehicle where VehicleCode = @VehicleCode`
      );

    if (!result.recordset.length)
      return sendError(res, "Vehicle not found", 404);

    const row = result.recordset[0];
    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getVehicleById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_Vehicle_AddEdit (btnSave_Click)
const saveOrUpdateVehicle = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const name = (body.VehicleName || "").trim();
    const regnNo = (body.RegistrationNumber || "").trim();
    // VehicleTypeCode is hidden in the WinForms screen (defaults to Vehicle = 1);
    // the visible "Vehicle Type" dropdown is actually the Usage Type. Default it
    // when the client doesn't send one so new rows stay in the type-1 list.
    const vehicleTypeCode = toInt(body.VehicleTypeCode) || VEHICLE_TYPE_CODE;

    // Same validations the form enforces (name + regn no).
    if (!name) return sendError(res, "Vehicle Name should not be empty", 400);
    if (!regnNo)
      return sendError(res, "Vehicle Regn No should not be empty", 400);

    const code = isEdit
      ? parseInt(req.params.vehicleCode ?? body.VehicleCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid VehicleCode for update", 400);

    const regnDate = body.RegistrationDate
      ? new Date(body.RegistrationDate)
      : new Date();

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) request.input("VehicleCode", sql.Int, code);

    request.input("VehicleName", sql.NVarChar, name);
    request.input("RegistrationNumber", sql.NVarChar, regnNo);
    request.input("RegistrationDate", sql.DateTime, regnDate);
    request.input("VehicleTypeCode", sql.Int, vehicleTypeCode);
    request.input("FuelType", sql.NVarChar, (body.FuelType || "").trim());
    request.input("RatePerKm_Hour", sql.Decimal(18, 2), toNum(body.RatePerKm_Hour));
    request.input("RatePerHrsBreaking", sql.Decimal(18, 2), toNum(body.RatePerHrsBreaking));
    request.input("LoadingCost", sql.Decimal(18, 2), toNum(body.LoadingCost));
    request.input("RateTypeCode", sql.Int, toInt(body.RateTypeCode));
    request.input("UsageTypeCode", sql.Int, toInt(body.UsageTypeCode));
    request.input("DepartmentCode", sql.Int, toInt(body.DepartmentCode));
    request.input("VehicleMakeCode", sql.Int, toInt(body.VehicleMakeCode));
    request.input("VehicleCapacityCode", sql.Int, toInt(body.VehicleCapacityCode));

    // The form only sends these heads when a real value is chosen (> 0).
    if (toInt(body.MaintHeadCode) > 0)
      request.input("MaintHeadCode", sql.Int, toInt(body.MaintHeadCode));
    if (toInt(body.FuelHeadCode) > 0)
      request.input("FuelHeadCode", sql.Int, toInt(body.FuelHeadCode));

    // Photo capture not handled yet -> always NULL (see header note).
    request.input("VehiclePhoto", sql.VarBinary(sql.MAX), null);
    request.input("Status", sql.Bit, toBit(body.Status));
    request.input("GoodsCarrier", sql.Bit, toBit(body.GoodsCarrier));

    await request.execute("sp_Vehicle_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (err.message && err.message.includes("UK_VehicleName_tblVehicle")) {
      return sendError(res, "Already exist the Vehicle Name", 409);
    }
    console.error("DB Error (saveOrUpdateVehicle):", err);
    return sendError(res, err);
  }
};

// POST /vehicle/create        -> create
export const createVehicle = (req, res) => saveOrUpdateVehicle(req, res, false);

// PUT  /vehicle/update/:code  -> update
export const updateVehicle = (req, res) => saveOrUpdateVehicle(req, res, true);

// DELETE /vehicle/delete/:vehicleCode -> EXEC sp_Vehicle_Delete
export const deleteVehicle = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.vehicleCode);
    if (!code) return sendError(res, "Invalid VehicleCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("VehicleCode", sql.Int, code)
      .execute("sp_Vehicle_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the Vehicle!", 409);
    }
    console.error("DB Error (deleteVehicle):", err);
    return sendError(res, err);
  }
};

// GET /vehicle/options -> lookup lists for the form dropdowns (Bind_Data()).
// Each list is returned as [{ value, label }] so the UI can bind directly.
export const getVehicleOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const map = (rows, vKey, lKey) =>
      rows.map((r) => ({ value: r[vKey], label: r[lKey] }));

    const [
      vehicleTypes,
      usageTypes,
      rateTypes,
      departments,
      heads,
      vehicleMakes,
      vehicleCapacities,
    ] = await Promise.all([
      pool.request().query("Select VehicleTypeCode, VehicleTypeName from tbl_VehicleType"),
      pool.request().query("Select UsageTypeCode, UsageTypeName from tbl_UsageType"),
      pool.request().query("Select RateTypeCode, RateTypeName from tbl_RateType"),
      pool.request().query("Select DepartmentCode, DepartmentName_English from tbl_Department"),
      pool.request().query("Select HeadCode, HeadName from tbl_Head"),
      pool.request().query("Select VehicleMakeCode, VehicleMakeName from tbl_VehicleMake Where VehicleTypeCode = 1"),
      pool.request().query("Select VehicleCapacityCode, VehicleCapacityName from tbl_VehicleCapacity Where VehicleTypeCode = 1"),
    ]);

    return sendSuccess(res, {
      vehicleTypes: map(vehicleTypes.recordset, "VehicleTypeCode", "VehicleTypeName"),
      usageTypes: map(usageTypes.recordset, "UsageTypeCode", "UsageTypeName"),
      rateTypes: map(rateTypes.recordset, "RateTypeCode", "RateTypeName"),
      departments: map(departments.recordset, "DepartmentCode", "DepartmentName_English"),
      heads: map(heads.recordset, "HeadCode", "HeadName"),
      vehicleMakes: map(vehicleMakes.recordset, "VehicleMakeCode", "VehicleMakeName"),
      vehicleCapacities: map(vehicleCapacities.recordset, "VehicleCapacityCode", "VehicleCapacityName"),
    });
  } catch (err) {
    console.error("DB Error (getVehicleOptions):", err);
    return sendError(res, err);
  }
};
