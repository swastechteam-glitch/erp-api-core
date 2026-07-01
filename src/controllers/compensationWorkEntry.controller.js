import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Compensation Work Entry  (port of frmCompensationWorkEntry + …Details).
//
//   Records a compensatory-off adjustment: an employee who worked on a
//   Working Date gets a Compensation Date off (Full / Half day) for a Shift,
//   approved by someone, with a reason. Save runs sp_CompensationWorkEntry_AddEdit;
//   the grid lists entries (sp_CompensationWorkEntry_GetAll) with edit / delete.
//
//   Save re-checks tbl_Employee_Attendance (mirrors the desktop btnSave):
//     • Compensation Date already FULL-day present ('X','X/')      -> block
//     • Duration = FULL DAY but only HALF available ('\','\\')     -> block
//     • Compensation Date is Native Leave ('NL','VL/')             -> block
//     • max 2 adjustments per employee per (working-date) month    -> block
//   Working-Date presence is advisory only (matches the desktop — a warning,
//   never a hard stop); it is surfaced by /attendance-check.
//
//   Company-scoped; user / node come from the auth token.
//
//   Endpoints
//     GET    /options                 employees + shifts + next No
//     GET    /list                    sp_CompensationWorkEntry_GetAll
//     GET    /attendance-check        live attendance feedback (non-blocking)
//     POST   /save                    sp_CompensationWorkEntry_AddEdit (txn)
//     DELETE /:compensationWorkEntryCode  sp_CompensationWorkEntry_Delete
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const pad = (n) => String(n).padStart(2, "0");
const ymd = (v) => {
  if (!v) return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  const m = String(v).match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : String(v).slice(0, 10);
};
const ddmmyyyy = (v) => {
  const d = ymd(v);
  return d ? d.split("-").reverse().join("/") : "";
};
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
// first / last day (yyyy-mm-dd) of the month that contains `d`
const monthBounds = (d) => {
  const s = ymd(d);
  if (!s) return { first: "", last: "" };
  const [y, m] = s.split("-").map((x) => parseInt(x));
  const first = `${y}-${pad(m)}-01`;
  const last = ymd(new Date(Date.UTC(y, m, 0))); // day 0 of next month = last day of this
  return { first, last };
};

// tbl_Employee_Attendance status probes (constants -> safe to inline)
const PRESENT_STATUSES = "'X','X/','WO','H','\\','\\\\'"; // working-date "present"
const FULL_PRESENT_STATUSES = "'X','X/'"; // comp-date full-day present
const HALF_STATUSES = "'\\','\\\\'"; // comp-date half-day
const NL_STATUSES = "'NL','VL/'"; // comp-date native leave

const attnCount = async (pool, employeeCode, calendarDate, statusList) => {
  if (employeeCode <= 0 || !calendarDate) return 0;
  const rs = await pool
    .request()
    .input("EmployeeCode", sql.Int, employeeCode)
    .input("CalendarDate", sql.VarChar(10), calendarDate)
    .query(
      `SELECT COUNT(*) AS n FROM tbl_Employee_Attendance ` +
        `WHERE Status IN (${statusList}) AND EmployeeCode = @EmployeeCode AND CalendarDate = @CalendarDate`
    );
  return toInt(pick((rs.recordset || [])[0], "n"));
};

// GET /compensation-work-entry/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    const empRs = await pool
      .request()
      .input("CompanyCode", sql.Int, cc)
      .query(
        "Select str_EmployeeID, EmployeeName, EmployeeCode from vw_Employee_New " +
          "Where CompanyCode = @CompanyCode AND Emp_Status = 1 Order by EmployeeID"
      );
    const employees = (empRs.recordset || []).map((x) => ({
      value: toInt(pick(x, "EmployeeCode")),
      label: (pick(x, "str_EmployeeID", "EmployeeID") ?? "").toString(),
    }));

    const shiftRs = await pool
      .request()
      .input("CompanyCode", sql.Int, cc)
      .query("Select ShiftCode, ShiftName from tbl_Shift Where CompanyCode = @CompanyCode");
    const shifts = (shiftRs.recordset || []).map((x) => ({
      value: toInt(pick(x, "ShiftCode")),
      label: (pick(x, "ShiftName") ?? "").toString(),
    }));

    let compensationWorkNo = "";
    try {
      const noRs = await pool.request().input("CompanyCode", sql.Int, cc).execute("sp_CompensationWorkEntry_No");
      const row = (noRs.recordset || [])[0];
      if (row) compensationWorkNo = (Object.values(row)[0] ?? "").toString();
    } catch {
      /* number is best-effort */
    }

    return sendSuccess(res, { employees, shifts, compensationWorkNo });
  } catch (err) {
    console.error("DB Error (CompensationWorkEntry.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /compensation-work-entry/list  -> sp_CompensationWorkEntry_GetAll
export const list = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    const rs = await pool.request().input("CompanyCode", sql.Int, cc).execute("sp_CompensationWorkEntry_GetAll");
    const rows = (rs.recordset || []).map((row, i) => {
      const code = toInt(pick(row, "CompensationWorkEntryCode", "Code"));
      const durIdx = toInt(pick(row, "Duration"));
      return {
        id: code || i + 1,
        compensationWorkEntryCode: code,
        compensationWorkNo: toInt(pick(row, "CompensationWorkEntryNo", "CompensationWorkNo")),
        compensationWorkDate: ddmmyyyy(pick(row, "CompensationWorkEntryDate")),
        employeeCode: toInt(pick(row, "EmployeeCode")),
        employeeName: (pick(row, "EmployeeName", "str_EmployeeID", "EmployeeID") ?? "").toString(),
        workingDate: ddmmyyyy(pick(row, "WorkingDate")),
        compensationDate: ddmmyyyy(pick(row, "CompensationDate")),
        shiftCode: toInt(pick(row, "Shift", "ShiftCode")),
        shiftName: (pick(row, "ShiftName") ?? "").toString(),
        durationCode: durIdx,
        duration: durIdx === 1 ? "HALF DAY" : "FULL DAY",
        approvedByCode: toInt(pick(row, "ApprovedBy")),
        approvedByName: (pick(row, "ApprovedByName", "ApprovedBy") ?? "").toString(),
        reason: (pick(row, "Reason") ?? "").toString(),
        // raw ISO for clean re-population on edit
        _compensationWorkDate: ymd(pick(row, "CompensationWorkEntryDate")),
        _workingDate: ymd(pick(row, "WorkingDate")),
        _compensationDate: ymd(pick(row, "CompensationDate")),
      };
    });

    return sendSuccess(res, { rows });
  } catch (err) {
    console.error("DB Error (CompensationWorkEntry.list):", err);
    return sendError(res, err);
  }
};

// GET /compensation-work-entry/attendance-check?employeeCode&workingDate&compensationDate&duration
// Non-blocking, mirrors the desktop dtpWorkingDate/dtpCompensation Leave events.
export const attendanceCheck = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const employeeCode = toInt(req.query.employeeCode);
    const workingDate = ymd(req.query.workingDate);
    const compensationDate = ymd(req.query.compensationDate);
    const duration = toInt(req.query.duration); // 0 = FULL DAY, 1 = HALF DAY

    const out = {
      workingDatePresent: true,
      compFullPresent: false,
      compHalfOnly: false,
      compNL: false,
      messages: [],
    };
    if (employeeCode <= 0) return sendSuccess(res, out);

    if (workingDate) {
      const present = await attnCount(pool, employeeCode, workingDate, PRESENT_STATUSES);
      out.workingDatePresent = present > 0;
      if (!out.workingDatePresent) out.messages.push("This Employee not present on this Working Date.");
    }
    if (compensationDate) {
      if ((await attnCount(pool, employeeCode, compensationDate, FULL_PRESENT_STATUSES)) > 0) {
        out.compFullPresent = true;
        out.messages.push("Already this employee full day present on this Compensation Date.");
      }
      if (duration === 0 && (await attnCount(pool, employeeCode, compensationDate, HALF_STATUSES)) > 0) {
        out.compHalfOnly = true;
        out.messages.push("This employee Half Day only available on this Compensation Date.");
      }
      if ((await attnCount(pool, employeeCode, compensationDate, NL_STATUSES)) > 0) {
        out.compNL = true;
        out.messages.push("This employee Native Leave (NL) on this Compensation Date.");
      }
    }
    return sendSuccess(res, out);
  } catch (err) {
    console.error("DB Error (CompensationWorkEntry.attendanceCheck):", err);
    return sendError(res, err);
  }
};

// POST /compensation-work-entry/save  -> sp_CompensationWorkEntry_AddEdit (txn)
export const save = async (req, res) => {
  let transaction;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode) return sendError(res, "Missing user context (userId / nodeCode)", 400);
    const companyCode = getCompanyCode(req);
    if (companyCode <= 0)
      return sendError(res, "You are logged in to a group of companies; switch to a single company.", 400);

    const b = req.body || {};
    const isEdit = toInt(b.compensationWorkEntryCode) > 0;
    const employeeCode = toInt(b.employeeCode);
    const duration = toInt(b.duration); // 0 = FULL DAY, 1 = HALF DAY
    const shift = toInt(b.shift);
    const approvedBy = toInt(b.approvedBy);
    const reason = (b.reason ?? "").toString().trim();
    const workingDate = ymd(b.workingDate);
    const compensationDate = ymd(b.compensationDate);
    const entryDate = ymd(b.compensationWorkDate);

    // validations (mirror btnSave, in order)
    if (employeeCode <= 0) return sendError(res, "Select the Employee....", 400);
    if (duration < 0) return sendError(res, "Select the Duration....", 400);
    if (shift <= 0) return sendError(res, "Select the Shift....", 400);
    if (approvedBy <= 0) return sendError(res, "Select the Approved by....", 400);
    if (!reason) return sendError(res, "Enter the Reason No.....", 400);
    if (!workingDate || !compensationDate) return sendError(res, "Invalid Date", 400);

    const pool = await getPool(req.headers.subdbname);

    // Compensation-date attendance blocks
    if ((await attnCount(pool, employeeCode, compensationDate, FULL_PRESENT_STATUSES)) > 0)
      return sendError(res, "Already this employee full day present on this Compensation Date.", 400);
    if (duration === 0 && (await attnCount(pool, employeeCode, compensationDate, HALF_STATUSES)) > 0)
      return sendError(res, "This employee Half Day only available on this Compensation Date.", 400);
    if ((await attnCount(pool, employeeCode, compensationDate, NL_STATUSES)) > 0)
      return sendError(res, "This employee Native Leave (NL) on this Compensation Date.", 400);

    // max 2 adjustments per employee in the working-date's month
    const { first, last } = monthBounds(workingDate);
    if (first && last) {
      const cntRs = await pool
        .request()
        .input("EmployeeCode", sql.Int, employeeCode)
        .input("First", sql.VarChar(10), first)
        .input("Last", sql.VarChar(10), last)
        .query(
          "SELECT COUNT(*) AS n FROM tbl_CompensationWorkEntry " +
            "WHERE EmployeeCode = @EmployeeCode AND CompensationWorkEntryDate >= @First AND CompensationWorkEntryDate <= @Last"
        );
      if (toInt(pick((cntRs.recordset || [])[0], "n")) >= 2)
        return sendError(res, "Already 2 Days Adjusted...", 400);
    }

    transaction = pool.transaction();
    await transaction.begin();

    const rq = transaction.request();
    if (isEdit) rq.input("CompensationWorkEntryCode", sql.Int, toInt(b.compensationWorkEntryCode));
    rq.input("CompensationWorkEntryDate", sql.VarChar(10), entryDate);
    rq.input("CompensationWorkEntryNo", sql.Int, toInt(b.compensationWorkNo));
    rq.input("EmployeeCode", sql.Int, employeeCode);
    rq.input("Type", sql.Int, toInt(b.type)); // hidden on the desktop -> 0
    rq.input("CompensationDate", sql.VarChar(10), compensationDate);
    rq.input("WorkingDate", sql.VarChar(10), workingDate);
    rq.input("Shift", sql.Int, shift);
    rq.input("Duration", sql.Int, duration);
    rq.input("Reason", sql.NVarChar, reason);
    rq.input("ApprovedBy", sql.Int, approvedBy);
    rq.input("CompanyCode", sql.Int, companyCode);
    rq.input("User", sql.Int, parseInt(userId));
    rq.input("Node", sql.Int, parseInt(nodeCode));

    try {
      await rq.execute("sp_CompensationWorkEntry_AddEdit");
    } catch (spErr) {
      await transaction.rollback();
      transaction = null;
      if (String(spErr.message || "").includes("UK_")) return sendError(res, "Already Exists..", 400);
      throw spErr;
    }

    await transaction.commit();
    return sendSuccess(res, null, isEdit ? "The record is updated" : "The record is saved", isEdit ? 200 : 201);
  } catch (err) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch {
        /* ignore */
      }
    }
    console.error("DB Error (CompensationWorkEntry.save):", err);
    return sendError(res, err);
  }
};

// DELETE /compensation-work-entry/:compensationWorkEntryCode -> sp_CompensationWorkEntry_Delete
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.compensationWorkEntryCode);
    if (code <= 0) return sendError(res, "Invalid CompensationWorkEntryCode", 400);
    const pool = await getPool(req.headers.subdbname);

    await pool.request().input("CompensationWorkEntryCode", sql.Int, code).execute("sp_CompensationWorkEntry_Delete");
    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    console.error("DB Error (CompensationWorkEntry.remove):", err);
    return sendError(res, err);
  }
};
