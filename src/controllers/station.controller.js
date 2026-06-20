import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Station master (port of the WinForms frmStation)
//   - List   : EXEC sp_Station_GetAll
//   - Create : EXEC sp_Station_AddEdit   (without @StationCode)
//   - Update : EXEC sp_Station_AddEdit   (with @StationCode)
//   - Delete : EXEC sp_Station_Delete
//   - Options: State lookup (GET /station/options) via sp_State_GetAll
// AddEdit requires @User / @Node which we read from the auth token (headers).
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

// GET /station/lists  -> mirrors frmStationDetails list
export const getStationList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_Station_GetAll");

    const data = result.recordset.map((item) => ({
      ...item,
      id: item.StationCode,
      StatusText: STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getStationList):", err);
    return sendError(res, err);
  }
};

// GET /station/list/:stationCode  -> single record
export const getStationById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.stationCode);
    if (!code) return sendError(res, "Invalid StationCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("StationCode", sql.Int, code)
      .query(
        "Select StationCode, StateCode, StationName, Status " +
          "from tbl_Station where StationCode = @StationCode"
      );

    if (!result.recordset.length)
      return sendError(res, "Station not found", 404);

    const row = result.recordset[0];
    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getStationById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_Station_AddEdit (btnSave_Click)
const saveOrUpdateStation = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const stateCode = toInt(body.StateCode);
    const name = (body.StationName || "").trim();

    // Same validations the form enforces.
    if (!stateCode) return sendError(res, "Select the State", 400);
    if (!name)
      return sendError(res, "Station Name should not be empty", 400);

    const code = isEdit
      ? parseInt(req.params.stationCode ?? body.StationCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid StationCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) request.input("StationCode", sql.Int, code);
    request.input("StateCode", sql.Int, stateCode);
    request.input("StationName", sql.NVarChar, name);
    request.input("Status", sql.Bit, toBit(body.Status));

    await request.execute("sp_Station_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_StationName")) {
      return sendError(res, "Already exist the Station Name", 409);
    }
    console.error("DB Error (saveOrUpdateStation):", err);
    return sendError(res, err);
  }
};

// POST /station/create        -> create
export const createStation = (req, res) =>
  saveOrUpdateStation(req, res, false);

// PUT  /station/update/:code  -> update
export const updateStation = (req, res) =>
  saveOrUpdateStation(req, res, true);

// DELETE /station/delete/:stationCode -> EXEC sp_Station_Delete
export const deleteStation = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.stationCode);
    if (!code) return sendError(res, "Invalid StationCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("StationCode", sql.Int, code)
      .execute("sp_Station_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the Station!", 409);
    }
    console.error("DB Error (deleteStation):", err);
    return sendError(res, err);
  }
};

// GET /station/options -> State lookup for the form dropdown.
export const getStationOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_State_GetAll");

    return sendSuccess(res, {
      states: result.recordset.map((r) => ({
        value: r.StateCode,
        label: r.StateName,
      })),
    });
  } catch (err) {
    console.error("DB Error (getStationOptions):", err);
    return sendError(res, err);
  }
};
