import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Route Vehicle master (port of the WinForms frmRouteVehicle / frmRouteVehicleDetails)
//
//   A company-scoped master: Route (tbl_Route) + Vehicle Name + Vehicle No +
//   Owner Name + Mobile No + Status. The Route dropdown is fed by sp_Route_GetAll.
//
//   Stored procs (kept identical to the desktop):
//     sp_Route_Vehicle_AddEdit  -> insert/update (@User/@Node + @CompanyCode, edit adds @VehicleCode)
//     sp_Route_Vehicle_GetAll   -> list (@CompanyCode)
//     sp_Route_Vehicle_Delete   -> delete (@VehicleCode,@CompanyCode)
//   Route lookup: sp_Route_GetAll (@CompanyCode).
//
//   NB: the desktop column / SP param for the owner is "OwerName" (a typo in the
//   schema) — kept verbatim so the SP binds.
//
//   Endpoints
//     GET    /options          routes (Route Name dropdown)
//     GET    /lists            sp_Route_Vehicle_GetAll for the company
//     GET    /list/:code       one vehicle (from GetAll)
//     POST   /create           sp_Route_Vehicle_AddEdit (no @VehicleCode)
//     PUT    /update/:code     sp_Route_Vehicle_AddEdit (with @VehicleCode)
//     DELETE /delete/:code     sp_Route_Vehicle_Delete
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");
const toStatusBit = (status) => {
  if (status === true || status === 1 || status === "1") return 1;
  if (typeof status === "string" && status.trim().toUpperCase() === "ACTIVE") return 1;
  return 0;
};
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const pick = (row, ...keys) => {
  if (!row) return undefined;
  for (const k of keys) {
    if (k == null) continue;
    if (row[k] !== undefined) return row[k];
    const lk = String(k).toLowerCase();
    const hit = Object.keys(row).find((o) => o.toLowerCase() === lk);
    if (hit) return row[hit];
  }
  return undefined;
};

// GET /route-vehicle/options  -> routes for the Route Name dropdown
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_Route_GetAll");
    return sendSuccess(res, {
      routes: (r.recordset || []).map((x) => ({
        value: toInt(pick(x, "RouteCode")),
        label: pick(x, "RouteName") ?? "",
      })),
    });
  } catch (err) {
    console.error("DB Error (RouteVehicle.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /route-vehicle/lists  -> sp_Route_Vehicle_GetAll @CompanyCode
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_Route_Vehicle_GetAll");
    const data = (r.recordset || []).map((row) => {
      const code = toInt(pick(row, "VehicleCode"));
      return {
        ...row,
        id: code,
        VehicleCode: code,
        RouteName: pick(row, "RouteName") ?? "",
        VehicleName: pick(row, "VehicleName") ?? "",
        VehicleNo: pick(row, "VehicleNo") ?? "",
        OwerName: pick(row, "OwerName", "OwnerName") ?? "",
        MobileNo: pick(row, "MobileNo") ?? "",
        Status: STATUS_LABEL(toStatusBit(pick(row, "Status"))),
      };
    });
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (RouteVehicle.getList):", err);
    return sendError(res, err);
  }
};

// GET /route-vehicle/list/:code  -> one record for the edit screen (from GetAll).
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (code <= 0) return sendError(res, "Invalid VehicleCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_Route_Vehicle_GetAll");
    const row = (r.recordset || []).find((x) => toInt(pick(x, "VehicleCode")) === code);
    if (!row) return sendError(res, "Route Vehicle not found", 404);

    return sendSuccess(res, {
      VehicleCode: code,
      RouteCode: toInt(pick(row, "RouteCode")),
      VehicleName: pick(row, "VehicleName") ?? "",
      VehicleNo: pick(row, "VehicleNo") ?? "",
      OwerName: pick(row, "OwerName", "OwnerName") ?? "",
      MobileNo: pick(row, "MobileNo") ?? "",
      Status: toStatusBit(pick(row, "Status")),
    });
  } catch (err) {
    console.error("DB Error (RouteVehicle.getById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_Route_Vehicle_AddEdit (btnSave_Click)
const saveOrUpdate = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const companyCode = getCompanyCode(req);
    if (companyCode <= 0)
      return sendError(res, "You are logged in to a group of companies; switch to a single company.", 400);

    const body = req.body || {};
    const routeCode = toInt(body.RouteCode);
    const vehicleName = (body.VehicleName || "").trim();
    const vehicleNo = (body.VehicleNo || "").trim();
    const owerName = (body.OwerName || "").trim();
    const mobileNo = (body.MobileNo || "").trim();

    // Same validation order the form enforces.
    if (routeCode <= 0) return sendError(res, "Select the Route Name...", 400);
    if (!vehicleName) return sendError(res, "Vehicle Name should not be empty", 400);
    if (!vehicleNo) return sendError(res, "Vehicle No should not be empty", 400);
    if (!owerName) return sendError(res, "Ower Name should not be empty", 400);
    if (!mobileNo) return sendError(res, "Enter the Route_Vehicle Mobile No", 400);

    const code = isEdit ? toInt(req.params.code ?? body.VehicleCode) : null;
    if (isEdit && !code) return sendError(res, "Invalid VehicleCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) request.input("VehicleCode", sql.Int, code);
    request.input("VehicleName", sql.NVarChar, vehicleName);
    request.input("VehicleNo", sql.NVarChar, vehicleNo);
    request.input("OwerName", sql.NVarChar, owerName);
    request.input("MobileNo", sql.NVarChar, mobileNo);
    request.input("RouteCode", sql.Int, routeCode);
    request.input("Status", sql.Int, toStatusBit(body.Status));
    request.input("CompanyCode", sql.Int, companyCode);

    await request.execute("sp_Route_Vehicle_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (err.message && err.message.includes("UK_")) {
      return sendError(res, "Already exist the Route_Vehicle Name", 409);
    }
    console.error("DB Error (saveOrUpdateRouteVehicle):", err);
    return sendError(res, err);
  }
};

// POST /route-vehicle/create
export const create = (req, res) => saveOrUpdate(req, res, false);

// PUT  /route-vehicle/update/:code
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /route-vehicle/delete/:code  -> sp_Route_Vehicle_Delete (@VehicleCode,@CompanyCode)
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (code <= 0) return sendError(res, "Invalid VehicleCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("VehicleCode", sql.Int, code)
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_Route_Vehicle_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("FK_") || err.message.includes("REFERENCE"))) {
      return sendError(res, "You can not delete the Route Vehicle !", 409);
    }
    console.error("DB Error (deleteRouteVehicle):", err);
    return sendError(res, err);
  }
};
