import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";
import { isDuplicateByGetAll } from "../utils/duplicateCheck.js";

// ---------------------------------------------------------------------------
// Solar & Wind Mill Location master (port of WinForms frmSolarLocation / Details)
//   - List   : EXEC sp_SolarLocation_GetAll
//   - Create : EXEC sp_SolarLocation_AddEdit  (@C_User / @C_Node, no code)
//   - Update : EXEC sp_SolarLocation_AddEdit  (@E_User / @E_Node + @SolarLocationCode)
//   - Delete : EXEC sp_SolarLocation_Delete   @SolarLocationCode
// Note: this SP keeps the create / edit user+node under DIFFERENT param names
// (@C_* vs @E_*), and is NOT company-scoped (unlike Solar Group / Plant Group).
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

// Accepts true / 1 / "1" / "ACTIVE" as active, everything else inactive.
const toStatusBit = (status) => {
  if (status === true || status === 1 || status === "1") return 1;
  if (typeof status === "string" && status.trim().toUpperCase() === "ACTIVE")
    return 1;
  return 0;
};

// GET /solar-location/lists  -> EXEC sp_SolarLocation_GetAll
export const getSolarLocationList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_SolarLocation_GetAll");

    const data = result.recordset
      // Newest first (the SP doesn't guarantee order, so sort here).
      .sort((a, b) => b.SolarLocationCode - a.SolarLocationCode)
      .map((item) => ({
        ...item,
        id: item.SolarLocationCode,
        StatusText: STATUS_LABEL(item.Status),
      }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getSolarLocationList):", err);
    return sendError(res, err);
  }
};

// GET /solar-location/list/:solarLocationCode  -> single record
export const getSolarLocationById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.solarLocationCode);
    if (!code) return sendError(res, "Invalid SolarLocationCode", 400);

    const pool = await getPool(req.headers.subdbname);
    // No single-row SP exists; filter the GetAll result.
    const result = await pool.request().execute("sp_SolarLocation_GetAll");
    const row = result.recordset.find((r) => r.SolarLocationCode === code);

    if (!row) return sendError(res, "Solar Location not found", 404);

    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getSolarLocationById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_SolarLocation_AddEdit (btnSave_Click)
const saveOrUpdateSolarLocation = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const name = (body.SolarLocationName || "").trim();

    // Same validation the form enforces: location name is mandatory.
    if (!name)
      return sendError(res, "Solar Location should not be empty", 400);

    // Val() in VB returns 0 for blank / non-numeric input.
    const mf = Number(body.MF) || 0;
    const kwp = Number(body.KWP) || 0;
    const rate = Number(body.Rate) || 0;
    const solarGroupCode = parseInt(body.SolarGroupCode) || null;

    const code = isEdit
      ? parseInt(req.params.solarLocationCode ?? body.SolarLocationCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid SolarLocationCode for update", 400);

    const pool = await getPool(req.headers.subdbname);

    if (
      await isDuplicateByGetAll(pool, {
        proc: "sp_SolarLocation_GetAll",
        nameField: "SolarLocationName",
        codeField: "SolarLocationCode",
        name,
        code,
      })
    )
      return sendError(res, "Already Exist this Solar Location", 409);

    const request = pool.request();

    // create -> @C_User / @C_Node ; edit -> @E_User / @E_Node + code
    if (isEdit) {
      request.input("E_User", sql.Int, parseInt(userId));
      request.input("E_Node", sql.Int, parseInt(nodeCode));
      request.input("SolarLocationCode", sql.Int, code);
    } else {
      request.input("C_User", sql.Int, parseInt(userId));
      request.input("C_Node", sql.Int, parseInt(nodeCode));
    }

    request.input("SolarLocationName", sql.NVarChar, name);
    request.input("SolarGroupCode", sql.Int, solarGroupCode);
    request.input("MF", sql.Decimal(18, 3), mf);
    request.input("KWP", sql.Decimal(18, 3), kwp);
    request.input("Rate", sql.Decimal(18, 3), rate);
    request.input("Status", sql.Bit, toStatusBit(body.Status));

    await request.execute("sp_SolarLocation_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "Record Updated Successfully" : "Record Saved Successfully",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_")) {
      return sendError(res, "Already Exist this Solar Location", 409);
    }
    console.error("DB Error (saveOrUpdateSolarLocation):", err);
    return sendError(res, err);
  }
};

// POST /solar-location/create        -> create
export const createSolarLocation = (req, res) =>
  saveOrUpdateSolarLocation(req, res, false);

// PUT  /solar-location/update/:code  -> update
export const updateSolarLocation = (req, res) =>
  saveOrUpdateSolarLocation(req, res, true);

// DELETE /solar-location/delete/:solarLocationCode -> EXEC sp_SolarLocation_Delete
export const deleteSolarLocation = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.solarLocationCode);
    if (!code) return sendError(res, "Invalid SolarLocationCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();
    request.input("SolarLocationCode", sql.Int, code);

    await request.execute("sp_SolarLocation_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("FK_") || err.message.includes("REFERENCE"))) {
      return sendError(res, "You cannot delete this Solar Location !", 409);
    }
    console.error("DB Error (deleteSolarLocation):", err);
    return sendError(res, err);
  }
};
