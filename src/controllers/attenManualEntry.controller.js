import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Attendance Manual Entry — Shift Wise (port of the WinForms frmAttenManualEntry)
//
//   Pick PayType + Date -> the grid loads everyone's attendance for that day
//   (sp_Manual_Attendance_Status). Look up an employee by ID (sp_Employee_GetAll
//   + current status + CL balance), stage a row in the entry strip (shift /
//   atten status / in-out / reason), and Save persists ONLY the changed rows
//   (Alter=1) via sp_ManualEntry_AddEdit, in one transaction. A grid row can be
//   deleted (sp_EmployeeAttendance_AttenManualEntry_Delete).
//
//   Company-scoped; user/node from the auth token.
//
//   Endpoints
//     GET    /options                       pay types, departments, reasons, leave statuses, CL setting
//     GET    /shifts                         shifts for the company (+In/Out/Next flags)
//     GET    /employees/:payTypeCode         employees for a pay type
//     GET    /grid                           sp_Manual_Attendance_Status (?payTypeCode=&attenDate=)
//     GET    /employee-lookup                one employee detail (?payTypeCode=&employeeId=&attenDate=)
//     POST   /save                           sp_ManualEntry_AddEdit (altered rows, txn)
//     DELETE /delete/:manualCode             sp_EmployeeAttendance_AttenManualEntry_Delete
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};
const toBit = (v) =>
  v === true || v === 1 || v === "1" || (typeof v === "string" && ["true", "yes", "y"].includes(v.trim().toLowerCase())) ? 1 : 0;
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const pad = (n) => String(n).padStart(2, "0");
const ymd = (v) => {
  if (!v) return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
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
// SQL datetime/time -> "HH:mm" (UTC accessors: tedious gives the wall clock as UTC)
const hm = (v) => {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(v);
  if (!Number.isNaN(d.getTime()))
    return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  const m = String(v).match(/(\d{1,2}):(\d{2})/);
  return m ? `${pad(toInt(m[1]))}:${m[2]}` : "";
};
const addDays = (ds, n) => {
  if (!ds) return "";
  const d = new Date(`${ds}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
// datetime-local "YYYY-MM-DDTHH:mm" (or "YYYY-MM-DD HH:mm") -> 'YYYY-MM-DD HH:mm:00' or null
const dtSave = (v) => {
  if (!v) return null;
  const m = String(v).match(/(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})/);
  if (!m) return null;
  return `${m[1]} ${pad(toInt(m[2]))}:${m[3]}:00`;
};

// GET /atten-manual-entry/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const [payTypes, departments, reasons, leaves, clSet] = await Promise.all([
      pool.request().query("Select PayTypeName, PayTypeCode from tbl_PayType Where Status = 1"),
      pool.request().query("Select DepartmentName_English, DepartmentCode from tbl_Department"),
      pool.request().query("Select ManualEntryReason, ManualEntryReasonCode from tbl_ManualEntryReason Where Status = 1"),
      pool.request().query("Select LeaveName, LeaveCode, Salary, ShortCode from tbl_Leave Where Status = 1"),
      pool.request().query("Select CL from tbl_Setting where CL = 1"),
    ]);
    return sendSuccess(res, {
      payTypes: (payTypes.recordset || []).map((x) => ({
        value: toInt(pick(x, "PayTypeCode")),
        label: pick(x, "PayTypeName") ?? "",
      })),
      departments: (departments.recordset || []).map((x) => ({
        value: toInt(pick(x, "DepartmentCode")),
        label: pick(x, "DepartmentName_English", "DepartmentName") ?? "",
      })),
      reasons: (reasons.recordset || []).map((x) => ({
        value: toInt(pick(x, "ManualEntryReasonCode")),
        label: pick(x, "ManualEntryReason") ?? "",
      })),
      attenStatuses: (leaves.recordset || []).map((x) => ({
        value: toInt(pick(x, "LeaveCode")),
        label: pick(x, "LeaveName") ?? "",
        Salary: toBit(pick(x, "Salary")),
        ShortCode: (pick(x, "ShortCode") ?? "").toString().trim(),
      })),
      cl: (clSet.recordset || []).length > 0,
    });
  } catch (err) {
    console.error("DB Error (AttenManualEntry.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /atten-manual-entry/shifts
export const getShifts = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, cc)
      .query(
        "Select ShiftName, ShiftCode, InTime, OutTime, NextInTime, NextOutTime from tbl_Shift Where CompanyCode = @CompanyCode"
      );
    return sendSuccess(
      res,
      (r.recordset || []).map((x) => ({
        value: toInt(pick(x, "ShiftCode")),
        label: pick(x, "ShiftName") ?? "",
        InTime: hm(pick(x, "InTime")),
        OutTime: hm(pick(x, "OutTime")),
        NextInTime: toBit(pick(x, "NextInTime")),
        NextOutTime: toBit(pick(x, "NextOutTime")),
      }))
    );
  } catch (err) {
    console.error("DB Error (AttenManualEntry.getShifts):", err);
    return sendError(res, err);
  }
};

// GET /atten-manual-entry/employees/:payTypeCode
export const getEmployees = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const payTypeCode = toInt(req.params.payTypeCode);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, cc)
      .input("PayTypeCode", sql.Int, payTypeCode)
      .query(
        "Select EmployeeID, EmployeeName, EmployeeCode, DepartmentCode from tbl_Employee where CompanyCode = @CompanyCode AND PayTypeCode = @PayTypeCode"
      );
    return sendSuccess(
      res,
      (r.recordset || []).map((x) => ({
        value: toInt(pick(x, "EmployeeCode")),
        label: pick(x, "EmployeeName") ?? "",
        EmployeeID: pick(x, "EmployeeID") ?? "",
        DepartmentCode: toInt(pick(x, "DepartmentCode")),
      }))
    );
  } catch (err) {
    console.error("DB Error (AttenManualEntry.getEmployees):", err);
    return sendError(res, err);
  }
};

// GET /atten-manual-entry/grid?payTypeCode=&attenDate=  -> sp_Manual_Attendance_Status
export const getGrid = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const payTypeCode = toInt(req.query.payTypeCode);
    const attenDate = ymd(req.query.attenDate);
    if (payTypeCode <= 0 || !attenDate) return sendSuccess(res, []);

    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, cc)
      .input("AttenEntry", sql.Int, 1)
      .input("PayTypeCode", sql.Int, payTypeCode)
      .input("AttendanceDate", sql.VarChar(10), attenDate)
      .execute("sp_Manual_Attendance_Status");

    const data = (r.recordset || []).map((row, i) => {
      const inT = pick(row, "InTime");
      const outT = pick(row, "OutTime");
      const nextOut = toBit(pick(row, "NextOutTime"));
      const inDisp = inT ? `${attenDate} ${hm(inT)}` : "";
      const outDisp = outT ? `${nextOut ? addDays(attenDate, 1) : attenDate} ${hm(outT)}` : "";
      return {
        id: i + 1,
        ManualCode: toInt(pick(row, "ManualCode")),
        DepartmentName: pick(row, "DepartmentName") ?? "",
        DepartmentCode: toInt(pick(row, "DepartmentCode")),
        EmpID: pick(row, "EmployeeID") ?? "",
        EmployeeName: pick(row, "EmployeeName") ?? "",
        EmployeeCode: toInt(pick(row, "EmployeeCode")),
        ShiftName: pick(row, "ShiftName") ?? "",
        ShiftCode: toInt(pick(row, "ShiftCode")),
        AttenStatus: pick(row, "LeaveName") ?? "",
        LeaveCode: toInt(pick(row, "LeaveCode")),
        HalfDay: toBit(pick(row, "HalfDay")),
        InTime: inDisp ? inDisp.replace(" ", "T") : "",
        OutTime: outDisp ? outDisp.replace(" ", "T") : "",
        InTimeDisp: inDisp,
        OutTimeDisp: outDisp,
        Working_Hrs: (pick(row, "W_Hours") ?? "").toString(),
        MOT_Hours: toNum(pick(row, "MOT")),
        StatusShort: (pick(row, "Status") ?? "").toString(),
        AttenEntry: toBit(pick(row, "AttenEntry")),
        ReasonCode: toInt(pick(row, "ReasonCode")),
        Reason: pick(row, "ManualEntryReason") ?? "",
        Alter: 0,
      };
    });
    return sendSuccess(res, data);
  } catch (err) {
    console.error("DB Error (AttenManualEntry.getGrid):", err);
    return sendError(res, err);
  }
};

// GET /atten-manual-entry/employee-lookup?payTypeCode=&employeeId=&attenDate=
export const employeeLookup = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const employeeId = (req.query.employeeId || "").toString().trim();
    const attenDate = ymd(req.query.attenDate);
    if (!employeeId) return sendError(res, "Invalid EmployeeID", 400);

    const pool = await getPool(req.headers.subdbname);
    const empRs = await pool
      .request()
      .input("CompanyCode", sql.Int, cc)
      .input("EmployeeID", sql.VarChar(50), employeeId)
      .execute("sp_Employee_GetAll");
    const emp = (empRs.recordset || [])[0];
    if (!emp) return sendError(res, "Invalid EmployeeID", 404);

    const employeeCode = toInt(pick(emp, "EmployeeCode"));

    // current status + existing punches for the date
    let currentStatus = "";
    let existing = null;
    if (attenDate) {
      const attRs = await pool
        .request()
        .input("CalendarDate", sql.VarChar(10), attenDate)
        .input("EmployeeCode", sql.Int, employeeCode)
        .query("Select * from tbl_Employee_Attendance where CalendarDate = @CalendarDate AND EmployeeCode = @EmployeeCode");
      const att = (attRs.recordset || [])[0];
      if (att) {
        currentStatus = (pick(att, "Status") ?? "").toString();
        existing = {
          ShiftCode: toInt(pick(att, "ShiftCode")),
          InTime: hm(pick(att, "InTime")),
          OutTime: hm(pick(att, "OutTime", "OuTTime")),
        };
      }
    }

    // CL / EL balance (only when the CL setting is on)
    let elBalance = "";
    try {
      const clSet = await pool.request().query("Select CL from tbl_Setting where CL = 1");
      if ((clSet.recordset || []).length > 0 && attenDate) {
        const bal = await pool
          .request()
          .input("EmployeeCode", sql.Int, employeeCode)
          .input("FromDate", sql.VarChar(10), attenDate)
          .input("ToDate", sql.VarChar(10), attenDate)
          .execute("sp_CLBalance");
        const b = (bal.recordset || [])[0];
        if (b) elBalance = (pick(b, "TotalBalanceEligibleLeave") ?? "").toString();
      }
    } catch {
      /* CL balance is best-effort */
    }

    const dol = pick(emp, "DOL");
    const releaved = !!(dol && attenDate && ymd(dol) < attenDate);

    return sendSuccess(res, {
      EmployeeCode: employeeCode,
      EmployeeID: pick(emp, "EmployeeID") ?? employeeId,
      EmployeeName: pick(emp, "EmployeeName") ?? "",
      DepartmentCode: toInt(pick(emp, "DepartmentCode")),
      ShiftCode: toInt(pick(emp, "ShiftCode")),
      details: {
        EmpGroupName: (pick(emp, "EmpGroupName") ?? "").toString(),
        DesignationName: (pick(emp, "DesignationName") ?? "").toString(),
        DateOfBirth: ymd(pick(emp, "DateOfBirth")),
        Address1: (pick(emp, "Address1") ?? "").toString(),
        Salary: (pick(emp, "Salary") ?? "").toString(),
      },
      currentStatus,
      elBalance,
      existing,
      releaved,
    });
  } catch (err) {
    console.error("DB Error (AttenManualEntry.employeeLookup):", err);
    return sendError(res, err);
  }
};

// "HH:mm" -> decimal "H.MM" (port of numericRepresentation = hour + minute/100)
const whoursDecimal = (s) => {
  const m = String(s || "").match(/(\d{1,2}):(\d{2})/);
  if (!m) return "0.00";
  return (toInt(m[1]) + toInt(m[2]) / 100).toFixed(2);
};

// POST /atten-manual-entry/save  -> sp_ManualEntry_AddEdit for altered rows (txn)
export const save = async (req, res) => {
  let transaction;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);
    const companyCode = getCompanyCode(req);
    if (companyCode <= 0)
      return sendError(res, "You are logged in to a group of companies; switch to a single company.", 400);

    const b = req.body || {};
    const attenDate = ymd(b.AttenDate);
    const rows = Array.isArray(b.rows) ? b.rows : [];
    const altered = rows.filter((r) => toInt(r.Alter) > 0);
    if (!attenDate) return sendError(res, "Invalid Date", 400);
    if (rows.length === 0) return sendError(res, "Enter the Attendance", 400);

    const pool = await getPool(req.headers.subdbname);
    transaction = pool.transaction();
    await transaction.begin();

    for (const r of altered) {
      const rq = transaction.request();
      rq.input("AttenDate", sql.VarChar(10), attenDate);
      if (toInt(r.ManualCode) > 0) rq.input("ManualCode", sql.Int, toInt(r.ManualCode));
      rq.input("DepartmentCode", sql.Int, toInt(r.DepartmentCode));
      rq.input("ShiftCode", sql.Int, toInt(r.ShiftCode));
      rq.input("EmployeeCode", sql.Int, toInt(r.EmployeeCode));
      rq.input("Status", sql.NVarChar, (r.StatusShort ?? "").toString());
      rq.input("InTime", sql.VarChar(19), dtSave(r.InTime));
      rq.input("OutTime", sql.VarChar(19), dtSave(r.OutTime));
      rq.input("LeaveCode", sql.Int, toInt(r.LeaveCode));
      rq.input("HalfDay", sql.Bit, toBit(r.HalfDay));
      rq.input("ReasonCode", sql.Int, toInt(r.ReasonCode));
      rq.input("Reason", sql.NVarChar, (r.Reason ?? "").toString());
      rq.input("W_Hours", sql.Decimal(18, 2), toNum(whoursDecimal(r.Working_Hrs)));
      rq.input("MOT", sql.Decimal(18, 2), toNum(r.MOT_Hours));
      rq.input("OT_Hours", sql.Decimal(18, 2), 0);
      rq.input("ShiftCategoryCode", sql.Int, 0);
      rq.input("AttenEntry", sql.Int, 1);
      rq.input("CompanyCode", sql.Int, companyCode);
      rq.input("User", sql.Int, parseInt(userId));
      rq.input("Node", sql.Int, parseInt(nodeCode));
      await rq.execute("sp_ManualEntry_AddEdit");
    }

    await transaction.commit();
    return sendSuccess(res, { saved: altered.length }, "The record is saved", 201);
  } catch (err) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch {
        /* ignore */
      }
    }
    console.error("DB Error (AttenManualEntry.save):", err);
    return sendError(res, err);
  }
};

// DELETE /atten-manual-entry/delete/:manualCode  -> sp_EmployeeAttendance_AttenManualEntry_Delete
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const manualCode = toInt(req.params.manualCode);
    if (manualCode <= 0) return sendError(res, "Invalid ManualCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("CompanyCode", sql.Int, cc)
      .input("ManualCode", sql.Int, manualCode)
      .execute("sp_EmployeeAttendance_AttenManualEntry_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("FK_") || err.message.includes("REFERENCE"))) {
      return sendError(res, "This attendance entry is in use and cannot be deleted", 409);
    }
    console.error("DB Error (AttenManualEntry.remove):", err);
    return sendError(res, err);
  }
};
