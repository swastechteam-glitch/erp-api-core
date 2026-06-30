import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// OT Manual Entry  (port of the WinForms frmOTManualEntry — "Atten Manual Entry"
// OT-only variant). A single-date Manual-OT editor: pick a Date, the grid loads
// everyone who already has Manual-OT for that day (sp_Manual_Attendance_Status
// @MOTEntry=1). Look up an employee by ID, stage a row (Department / Shift /
// M.OT Hrs) with +, and Save persists the staged/changed rows via
// sp_ManualEntry_AddEdit (MOT-only). A saved row can be deleted
// (sp_EmployeeAttendance_OTManualEntry_Delete).
//
//   Company-scoped; user/node from the auth token.
//
//   Endpoints
//     GET    /options                  departments, shifts, employees, CL flag
//     GET    /grid                      sp_Manual_Attendance_Status (?attenDate=)
//     GET    /employee-lookup           one employee detail (?employeeId=&attenDate=)
//     POST   /save                      sp_ManualEntry_AddEdit (altered rows, txn)
//     DELETE /delete/:manualCode        sp_EmployeeAttendance_OTManualEntry_Delete
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
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  const m = String(v).match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : String(v).slice(0, 10);
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

// GET /ot-manual-entry/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);
    const [departments, shifts, employees, clSet] = await Promise.all([
      pool.request().query("Select DepartmentName_English, DepartmentCode from tbl_Department"),
      pool
        .request()
        .input("CompanyCode", sql.Int, cc)
        .query("Select ShiftName, ShiftCode, InTime, OutTime, NextInTime, NextOutTime from tbl_Shift WHERE CompanyCode = @CompanyCode"),
      pool
        .request()
        .input("CompanyCode", sql.Int, cc)
        .query("Select EmployeeID, EmployeeName, EmployeeCode, DepartmentCode from tbl_Employee WHERE CompanyCode = @CompanyCode"),
      pool.request().query("Select CL from tbl_Setting where CL = 1"),
    ]);
    return sendSuccess(res, {
      departments: (departments.recordset || []).map((x) => ({
        value: toInt(pick(x, "DepartmentCode")),
        label: pick(x, "DepartmentName_English", "DepartmentName") ?? "",
      })),
      shifts: (shifts.recordset || []).map((x) => ({
        value: toInt(pick(x, "ShiftCode")),
        label: pick(x, "ShiftName") ?? "",
      })),
      employees: (employees.recordset || []).map((x) => ({
        value: toInt(pick(x, "EmployeeCode")),
        label: pick(x, "EmployeeName") ?? "",
        EmployeeID: (pick(x, "EmployeeID") ?? "").toString(),
        DepartmentCode: toInt(pick(x, "DepartmentCode")),
      })),
      cl: (clSet.recordset || []).length === 1,
    });
  } catch (err) {
    console.error("DB Error (OTManualEntry.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /ot-manual-entry/grid?attenDate=  -> sp_Manual_Attendance_Status @MOTEntry=1
export const getGrid = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const attenDate = ymd(req.query.attenDate);
    if (!attenDate) return sendSuccess(res, []);

    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("MOTEntry", sql.Int, 1)
      .input("AttendanceDate", sql.VarChar(10), attenDate)
      .input("CompanyCode", sql.Int, cc)
      .execute("sp_Manual_Attendance_Status");

    const data = (r.recordset || [])
      .map((row) => ({
        ManualCode: toInt(pick(row, "ManualCode")),
        DepartmentName: pick(row, "DepartmentName") ?? "",
        DepartmentCode: toInt(pick(row, "DepartmentCode")),
        EmpID: (pick(row, "EmployeeID") ?? "").toString(),
        EmployeeName: pick(row, "EmployeeName") ?? "",
        EmployeeCode: toInt(pick(row, "EmployeeCode")),
        ShiftName: pick(row, "ShiftName") ?? "",
        ShiftCode: toInt(pick(row, "ShiftCode")),
        MOT_Hours: toNum(pick(row, "MOT")),
        MOTEntry: toBit(pick(row, "MOTEntry")),
        Alter: 0,
      }))
      .filter((x) => x.MOT_Hours > 0) // VB hides rows with MOT <= 0
      .map((x, i) => ({ ...x, id: i + 1 }));

    return sendSuccess(res, data);
  } catch (err) {
    console.error("DB Error (OTManualEntry.getGrid):", err);
    return sendError(res, err);
  }
};

// GET /ot-manual-entry/employee-lookup?employeeId=&attenDate=
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
      .input("EmployeeID", sql.VarChar(50), employeeId)
      .input("CompanyCode", sql.Int, cc)
      .execute("sp_Employee_GetAll");
    const emp = (empRs.recordset || [])[0];
    if (!emp) return sendError(res, "Invalid EmployeeID", 404);
    const employeeCode = toInt(pick(emp, "EmployeeCode"));

    // current attendance (status / MOT / shift) for the date
    let currentMOT = 0;
    let shiftCode = 0;
    if (attenDate) {
      const attRs = await pool
        .request()
        .input("CalendarDate", sql.VarChar(10), attenDate)
        .input("EmployeeCode", sql.Int, employeeCode)
        .query("Select * from tbl_Employee_Attendance where CalendarDate = @CalendarDate AND EmployeeCode = @EmployeeCode");
      const att = (attRs.recordset || [])[0];
      if (att) {
        currentMOT = toNum(pick(att, "MOT_Hours"));
        shiftCode = toInt(pick(att, "ShiftCode"));
      }
    }

    // EL / CL balance (only when the CL setting is on)
    let elBalance = "";
    try {
      const clSet = await pool.request().query("Select CL from tbl_Setting where CL = 1");
      if ((clSet.recordset || []).length === 1 && attenDate) {
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
      /* best-effort */
    }

    const dol = pick(emp, "DOL");
    const releaved = !!(dol && attenDate && ymd(dol) < attenDate);

    return sendSuccess(res, {
      EmployeeCode: employeeCode,
      EmployeeID: (pick(emp, "EmployeeID") ?? employeeId).toString(),
      EmployeeName: pick(emp, "EmployeeName") ?? "",
      DepartmentCode: toInt(pick(emp, "DepartmentCode")),
      shiftCode,
      currentMOT,
      elBalance,
      releaved,
      details:
        `Emp Group : ${pick(emp, "EmpGroupName") ?? ""}\n` +
        `Designation : ${pick(emp, "DesignationName") ?? ""}\n` +
        `D.O.B : ${ymd(pick(emp, "DateOfBirth"))}\n` +
        `Address : ${pick(emp, "Address1") ?? ""}\n` +
        `Previous Salary : ${pick(emp, "Salary") ?? ""}`,
    });
  } catch (err) {
    console.error("DB Error (OTManualEntry.employeeLookup):", err);
    return sendError(res, err);
  }
};

// POST /ot-manual-entry/save  -> sp_ManualEntry_AddEdit (MOT-only) for altered rows (txn)
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
    const attenDate = ymd(b.AttenDate);
    const rows = Array.isArray(b.rows) ? b.rows : [];
    if (!attenDate) return sendError(res, "Invalid Date", 400);
    if (rows.length === 0) return sendError(res, "Enter the Attendance", 400);
    const altered = rows.filter((r) => toInt(r.Alter) > 0);

    const pool = await getPool(req.headers.subdbname);
    transaction = pool.transaction();
    await transaction.begin();

    for (const r of altered) {
      const rq = transaction.request();
      rq.input("AttenDate", sql.VarChar(10), attenDate);
      if (toInt(r.ManualCode) > 0) rq.input("ManualCode", sql.Int, toInt(r.ManualCode));
      rq.input("DepartmentCode", sql.Int, toInt(r.DepartmentCode));
      rq.input("ShiftCode", sql.Int, toInt(r.ShiftCode));
      rq.input("ShiftCategoryCode", sql.Int, 0);
      rq.input("EmployeeCode", sql.Int, toInt(r.EmployeeCode));
      rq.input("MOT", sql.Decimal(18, 2), toNum(r.MOT_Hours));
      rq.input("MOTEntry", sql.Int, 1);
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
    console.error("DB Error (OTManualEntry.save):", err);
    return sendError(res, err);
  }
};

// DELETE /ot-manual-entry/delete/:manualCode  -> sp_EmployeeAttendance_OTManualEntry_Delete
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
      .execute("sp_EmployeeAttendance_OTManualEntry_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    console.error("DB Error (OTManualEntry.remove):", err);
    return sendError(res, err);
  }
};
