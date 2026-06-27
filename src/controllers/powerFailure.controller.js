import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// EB Power Failure (port of WinForms frmEB_PowerFailure)
//
// Single-table header-only entry: Date, Shift, Time From / Time To (each with a
// "Next Day" flag), Total Minute (computed), Reason. Shows the Last Entry's
// date + shift for reference.
//
//   Lookups : shifts (tbl_Shift) + last-entry (max tbl_PowerFailure)
//   List    : sp_PowerFailure_GetAll
//   One     : header (from GetAll)
//   Save    : sp_PowerFailure_AddEdit            (ExecuteNonQuery)
//   Delete  : sp_PowerFailure_Delete
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};
const D = (v) => (v ? new Date(v) : null);
const getCompanyCode = (req) => toInt(req.headers.companyCode);

// =========================================================================
// LOOKUPS
// =========================================================================

// GET /power-failure/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    const shifts = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .query("SELECT ShiftCode, ShiftName FROM tbl_Shift WHERE CompanyCode = @CompanyCode AND Status = 1");

    // Last saved entry (max PowerFailureCode) -> date + shift for reference.
    const last = await pool
      .request()
      .query(
        "SELECT TOP 1 PowerFailureCode, PowerFailureDate, ShiftCode FROM tbl_PowerFailure ORDER BY PowerFailureCode DESC"
      );

    return sendSuccess(res, {
      shifts: shifts.recordset,
      reasons: ["EB POWER HOUSE TRIP", "RAIN PROBLE"],
      lastEntry: last.recordset?.[0] || null,
    });
  } catch (err) {
    console.error("DB Error (PowerFailure.getOptions):", err);
    return sendError(res, err);
  }
};

// =========================================================================
// LIST / ONE
// =========================================================================

// GET /power-failure/lists
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool.request().execute("sp_PowerFailure_GetAll");
    const data = (r.recordset || [])
      .sort((a, b) => b.PowerFailureCode - a.PowerFailureCode)
      .map((x) => ({ ...x, id: x.PowerFailureCode }));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (PowerFailure.getList):", err);
    return sendError(res, err);
  }
};

// GET /power-failure/list/:code
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (!code) return sendError(res, "Invalid code", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool.request().execute("sp_PowerFailure_GetAll");
    const row = (r.recordset || []).find((x) => x.PowerFailureCode === code);
    if (!row) return sendError(res, "Power Failure not found", 404);
    return sendSuccess(res, row);
  } catch (err) {
    console.error("DB Error (PowerFailure.getById):", err);
    return sendError(res, err);
  }
};

// =========================================================================
// SAVE
// =========================================================================

// Build a DateTime from a base date (YYYY-MM-DD) + "HH:mm", + 1 day if nextDay.
const combine = (dateStr, timeStr, nextDay) => {
  const base = D(dateStr) || new Date();
  const [h, m] = String(timeStr || "00:00").split(":");
  base.setHours(toInt(h), toInt(m), 0, 0);
  if (nextDay) base.setDate(base.getDate() + 1);
  return base;
};

const saveOrUpdate = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode) return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const b = req.body || {};
    const shiftCode = toInt(b.ShiftCode);
    const totalHours = toNum(b.TotalHours);
    const powerFailureDate = D(b.PowerFailureDate) || new Date();

    // Validation — mirrors the WinForms btnSave.
    if (!shiftCode) return sendError(res, "Select the Shift", 400);
    if (b.TotalHours === "" || b.TotalHours == null) return sendError(res, "Enter the Total Hours", 400);

    const code = isEdit ? toInt(req.params.code ?? b.PowerFailureCode) : 0;
    if (isEdit && !code) return sendError(res, "Invalid code for update", 400);

    const timeFrom = combine(b.PowerFailureDate, b.TimeFrom, b.NextDayIn);
    const timeTo = combine(b.PowerFailureDate, b.TimeTo, b.NextDayOut);

    const pool = await getPool(req.headers.subdbname);
    const request = pool
      .request()
      .input("User", sql.Int, toInt(userId))
      .input("Node", sql.Int, toInt(nodeCode))
      .input("PowerFailureDate", sql.DateTime, powerFailureDate)
      .input("ShiftCode", sql.Int, shiftCode)
      .input("TimeFrom", sql.DateTime, timeFrom)
      .input("TimeTo", sql.DateTime, timeTo)
      .input("TotalHours", sql.Decimal(18, 1), totalHours)
      .input("Reason", sql.NVarChar, (b.Reason || "").toString().trim());
    if (code) request.input("PowerFailureCode", sql.Int, code);

    await request.execute("sp_PowerFailure_AddEdit");
    return sendSuccess(
      res,
      { PowerFailureCode: code || null },
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    console.error("DB Error (PowerFailure.saveOrUpdate):", err);
    return sendError(res, err);
  }
};

export const create = (req, res) => saveOrUpdate(req, res, false);
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /power-failure/delete/:code
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (!code) return sendError(res, "Invalid code", 400);
    const pool = await getPool(req.headers.subdbname);
    await pool.request().input("PowerFailureCode", sql.Int, code).execute("sp_PowerFailure_Delete");
    return sendSuccess(res, { PowerFailureCode: code }, "The record is deleted");
  } catch (err) {
    if (err.message && err.message.includes("FK_")) return sendError(res, "You cannot delete this Power Failure", 409);
    console.error("DB Error (PowerFailure.remove):", err);
    return sendError(res, err);
  }
};
