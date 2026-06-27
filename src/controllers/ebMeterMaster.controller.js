import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";
import { isDuplicateByGetAll } from "../utils/duplicateCheck.js";

// ---------------------------------------------------------------------------
// EB Meter master (port of WinForms frmEBMeterMaster / frmEBMeterMasterDetails)
//   - List   : EXEC sp_EBMeterMaster_GetAll   @CompanyCode
//   - Create : EXEC sp_EBMeterMaster_AddEdit  (without @EBMeterCode)
//   - Update : EXEC sp_EBMeterMaster_AddEdit  (with @EBMeterCode)
//   - Delete : EXEC sp_EBMeterMaster_Delete   @EBMeterCode
// AddEdit requires @User / @Node (auth token headers); GetAll / AddEdit are
// company-scoped via @CompanyCode (int_CompanyCode).
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

// Accepts true / 1 / "1" / "ACTIVE" as active, everything else inactive.
const toStatusBit = (status) => {
  if (status === true || status === 1 || status === "1") return 1;
  if (typeof status === "string" && status.trim().toUpperCase() === "ACTIVE")
    return 1;
  return 0;
};

// GET /eb-meter/lists  -> EXEC sp_EBMeterMaster_GetAll @CompanyCode
export const getEBMeterList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const companyCode = parseInt(req.headers.companyCode);
    if (!companyCode) return sendError(res, "Missing company context", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_EBMeterMaster_GetAll");

    const data = result.recordset
      // Newest first (the SP doesn't guarantee order, so sort here).
      .sort((a, b) => b.EBMeterCode - a.EBMeterCode)
      .map((item) => ({
        ...item,
        id: item.EBMeterCode,
        StatusText: STATUS_LABEL(item.Status),
      }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getEBMeterList):", err);
    return sendError(res, err);
  }
};

// GET /eb-meter/list/:ebMeterCode  -> single record
export const getEBMeterById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const companyCode = parseInt(req.headers.companyCode);
    if (!companyCode) return sendError(res, "Missing company context", 400);

    const code = parseInt(req.params.ebMeterCode);
    if (!code) return sendError(res, "Invalid EBMeterCode", 400);

    const pool = await getPool(req.headers.subdbname);
    // No single-row SP exists; filter the GetAll result.
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_EBMeterMaster_GetAll");
    const row = result.recordset.find((r) => r.EBMeterCode === code);

    if (!row) return sendError(res, "EB Meter not found", 404);

    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getEBMeterById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_EBMeterMaster_AddEdit (btnSave_Click)
const saveOrUpdateEBMeter = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    const companyCode = parseInt(req.headers.companyCode);
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);
    if (!companyCode) return sendError(res, "Missing company context", 400);

    const body = req.body || {};
    const name = (body.EBMeterName || "").trim();

    // Same validation the form enforces: name is mandatory.
    if (!name)
      return sendError(res, "EBMeter Name should not be empty", 400);

    const description = (body.Description || "").trim();
    const machineFactor = Number(body.MachineFactor) || 0;

    const code = isEdit
      ? parseInt(req.params.ebMeterCode ?? body.EBMeterCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid EBMeterCode for update", 400);

    const pool = await getPool(req.headers.subdbname);

    if (
      await isDuplicateByGetAll(pool, {
        proc: "sp_EBMeterMaster_GetAll",
        params: [{ name: "CompanyCode", type: sql.Int, value: companyCode }],
        nameField: "EBMeterName",
        codeField: "EBMeterCode",
        name,
        code,
      })
    )
      return sendError(res, "Already exist the EBMeter Name", 409);

    const request = pool.request();

    if (isEdit) request.input("EBMeterCode", sql.Int, code);
    request.input("EBMeterName", sql.NVarChar, name);
    request.input("Description", sql.NVarChar, description);
    request.input("MachineFactor", sql.Decimal(18, 3), machineFactor);
    request.input("CompanyCode", sql.Int, companyCode);
    request.input("Status", sql.Bit, toStatusBit(body.Status));
    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));

    await request.execute("sp_EBMeterMaster_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_EBMeterName")) {
      return sendError(res, "Already exist the EBMeter Name", 409);
    }
    console.error("DB Error (saveOrUpdateEBMeter):", err);
    return sendError(res, err);
  }
};

// POST /eb-meter/create        -> create
export const createEBMeter = (req, res) => saveOrUpdateEBMeter(req, res, false);

// PUT  /eb-meter/update/:code  -> update
export const updateEBMeter = (req, res) => saveOrUpdateEBMeter(req, res, true);

// DELETE /eb-meter/delete/:ebMeterCode -> EXEC sp_EBMeterMaster_Delete
export const deleteEBMeter = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.ebMeterCode);
    if (!code) return sendError(res, "Invalid EBMeterCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();
    request.input("EBMeterCode", sql.Int, code);

    await request.execute("sp_EBMeterMaster_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("FK_") || err.message.includes("REFERENCE"))) {
      return sendError(res, "You cannot delete the EB Meter !", 409);
    }
    console.error("DB Error (deleteEBMeter):", err);
    return sendError(res, err);
  }
};
