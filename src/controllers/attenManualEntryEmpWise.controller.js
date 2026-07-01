import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Attendance Manual Entry — Employee Wise  (port of frmEmployeeAttendanceOffLine,
// a.k.a. "Attendance Alter - New" / "Manual Attendance (Off Line)").
//
//   Pick PayType + PayPeriod (-> From/To dates) and ONE employee. The grid then
//   merges, one row per calendar day, four sources:
//      1. sp_ManualEntry_GetAll            (existing manual entries)
//      2. vw_MachineEntry_WithoutManual    (raw machine punches)
//      3. sp_Atten_OffLine_Load            (offline machine load)
//      4. sp_Employee_GetByCalendar        (fill any missing day as Absent / WO)
//   then post-fills shift times for present-type statuses.
//
//   The user edits Shift / Status / Manual-OT inline; rows that actually change
//   are flagged and Save persists them via sp_ManualEntry_EmpWise_AddEdit. A
//   manual row can be deleted (sp_EmployeeAttendance_Delete) which then
//   regenerates that employee's attendance (sp_Generate_Attendance_New_Unit1).
//
//   Company-scoped; user/node from the auth token.
//
//   Endpoints
//     GET    /options                         pay types, shifts, leaves, employees, CL flag
//     GET    /pay-periods/:payTypeCode         open pay periods for a pay type
//     GET    /employee-details                 one employee detail + CL balance (+photo)
//     GET    /grid                             merged day grid
//     POST   /save                             sp_ManualEntry_EmpWise_AddEdit (altered rows)
//     DELETE /delete/:manualCode               delete + regenerate attendance
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
// SQL datetime -> "HH:mm" (UTC accessors: tedious surfaces wall-clock as UTC)
const hm = (v) => {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(v);
  if (!Number.isNaN(d.getTime())) return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  const m = String(v).match(/(\d{1,2}):(\d{2})/);
  return m ? `${pad(toInt(m[1]))}:${m[2]}` : "";
};
// SQL datetime -> "YYYY-MM-DDTHH:mm" (datetime-local) or ""
const dtLocal = (v) => {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(v);
  if (!Number.isNaN(d.getTime()))
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  const m = String(v).match(/(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})/);
  return m ? `${m[1]}T${pad(toInt(m[2]))}:${m[3]}` : "";
};
// datetime-local "...T HH:mm" -> 'YYYY-MM-DD HH:mm:00' or null
const dtSave = (v) => {
  if (!v) return null;
  const m = String(v).match(/(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})/);
  return m ? `${m[1]} ${pad(toInt(m[2]))}:${m[3]}:00` : null;
};
const addDays = (ds, n) => {
  if (!ds) return "";
  const d = new Date(`${ds}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
// VB DateDiff(Hour, t1, t2): difference in whole hours ignoring minutes
const hoursDiffVB = (a, b) => {
  const da = a instanceof Date ? a : new Date(a);
  const db = b instanceof Date ? b : new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return 0;
  const ta = Date.UTC(da.getUTCFullYear(), da.getUTCMonth(), da.getUTCDate(), da.getUTCHours());
  const tb = Date.UTC(db.getUTCFullYear(), db.getUTCMonth(), db.getUTCDate(), db.getUTCHours());
  return Math.round((tb - ta) / 3600000);
};
// tbl_Shift.WorkingHours -> decimal hours
const workHoursDec = (v) => {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.getUTCHours() + v.getUTCMinutes() / 60;
  const s = String(v);
  const m = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return toInt(m[1]) + toInt(m[2]) / 60;
  const n = Number(s);
  return Number.isNaN(n) ? 0 : n;
};

// GET /atten-manual-entry-empwise/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);
    const [payTypes, shifts, leaves, employees, clSet] = await Promise.all([
      pool.request().query("Select PayTypeName, PayTypeCode from tbl_PayType Where Status = 1"),
      pool
        .request()
        .input("CompanyCode", sql.Int, cc)
        .query("Select ShiftName, ShiftCode, InTime, OutTime, NextInTime, NextOutTime, WorkingHours from tbl_Shift Where CompanyCode = @CompanyCode"),
      pool.request().query("Select LeaveName, LeaveCode, ShortCode, Salary from tbl_Leave"),
      pool
        .request()
        .input("CompanyCode", sql.Int, cc)
        .query("Select EmployeeName, EmployeeCode, EmployeeID, DepartmentCode, DepartmentName, WeekDayName from vw_Employee_New where CompanyCode = @CompanyCode"),
      pool.request().query("Select CL from tbl_Setting where CL = 1"),
    ]);
    return sendSuccess(res, {
      payTypes: (payTypes.recordset || []).map((x) => ({
        value: toInt(pick(x, "PayTypeCode")),
        label: pick(x, "PayTypeName") ?? "",
      })),
      shifts: (shifts.recordset || []).map((x) => ({
        value: toInt(pick(x, "ShiftCode")),
        label: pick(x, "ShiftName") ?? "",
        InTime: hm(pick(x, "InTime")),
        OutTime: hm(pick(x, "OutTime")),
        NextInTime: toBit(pick(x, "NextInTime")),
        NextOutTime: toBit(pick(x, "NextOutTime")),
        WorkingHours: workHoursDec(pick(x, "WorkingHours")),
      })),
      statuses: (leaves.recordset || []).map((x) => ({
        value: toInt(pick(x, "LeaveCode")),
        label: pick(x, "LeaveName") ?? "",
        ShortCode: (pick(x, "ShortCode") ?? "").toString().trim(),
        Salary: toBit(pick(x, "Salary")),
      })),
      employees: (employees.recordset || []).map((x) => ({
        value: toInt(pick(x, "EmployeeCode")),
        label: pick(x, "EmployeeName") ?? "",
        EmployeeID: (pick(x, "EmployeeID") ?? "").toString(),
        DepartmentCode: toInt(pick(x, "DepartmentCode")),
        DepartmentName: pick(x, "DepartmentName") ?? "",
        WeekDayName: (pick(x, "WeekDayName") ?? "").toString(),
      })),
      cl: (clSet.recordset || []).length === 1,
    });
  } catch (err) {
    console.error("DB Error (AttenManualEntryEmpWise.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /atten-manual-entry-empwise/pay-periods/:payTypeCode
export const getPayPeriods = async (req, res) => {
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
        "Select PayPeriodName, PayPeriodCode, PayPeriodFrom, PayPeriodTo from tbl_PayPeriod where CompanyCode = @CompanyCode AND Finalize = 0 AND PayTypeCode = @PayTypeCode ORDER BY PayPeriodFrom DESC"
      );
    return sendSuccess(
      res,
      (r.recordset || []).map((x) => ({
        value: toInt(pick(x, "PayPeriodCode")),
        label: pick(x, "PayPeriodName") ?? "",
        From: ymd(pick(x, "PayPeriodFrom")),
        To: ymd(pick(x, "PayPeriodTo")),
      }))
    );
  } catch (err) {
    console.error("DB Error (AttenManualEntryEmpWise.getPayPeriods):", err);
    return sendError(res, err);
  }
};

// GET /atten-manual-entry-empwise/employee-details?employeeId=&payPeriodCode=&fromDate=&toDate=
export const employeeDetails = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const employeeId = (req.query.employeeId || "").toString().trim();
    const payPeriodCode = toInt(req.query.payPeriodCode);
    const fromDate = ymd(req.query.fromDate);
    const toDate = ymd(req.query.toDate);
    if (!employeeId) return sendError(res, "Invalid EmployeeID", 400);

    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, cc)
      .input("EmployeeID", sql.VarChar(50), employeeId)
      .query("Select * from vw_Employee_New where CompanyCode = @CompanyCode AND EmployeeID = @EmployeeID");
    const emp = (r.recordset || [])[0];
    if (!emp) return sendError(res, "Invalid EmployeeID", 404);
    const employeeCode = toInt(pick(emp, "EmployeeCode"));

    // photo (best-effort)
    let photo = "";
    try {
      const ph = await pool
        .request()
        .input("CompanyCode", sql.Int, cc)
        .input("EmployeeCode", sql.Int, employeeCode)
        .query("select Photo from tbl_Employee_Photo where CompanyCode = @CompanyCode AND EmployeeCode = @EmployeeCode");
      const buf = pick((ph.recordset || [])[0], "Photo");
      if (buf && Buffer.isBuffer(buf)) photo = `data:image/jpeg;base64,${buf.toString("base64")}`;
    } catch {
      /* no photo */
    }

    // CL balance (only when the CL setting is on)
    let clBalance = "";
    try {
      const clSet = await pool.request().query("Select CL from tbl_Setting where CL = 1");
      if ((clSet.recordset || []).length === 1 && payPeriodCode > 0 && employeeCode > 0) {
        const bal = await pool
          .request()
          .input("EmployeeCode", sql.Int, employeeCode)
          .input("PayPeriodCode", sql.Int, payPeriodCode)
          .input("FromDate", sql.VarChar(10), fromDate)
          .input("ToDate", sql.VarChar(10), toDate)
          .execute("sp_CLBalance");
        const b = (bal.recordset || [])[0];
        if (b) clBalance = (pick(b, "TotalBalanceEligibleLeave") ?? "").toString();
      }
    } catch {
      /* best-effort */
    }

    const otCalc = toBit(pick(emp, "CalculateOT")) ? "YES" : "NO";
    return sendSuccess(res, {
      EmployeeCode: employeeCode,
      EmployeeID: (pick(emp, "EmployeeID") ?? employeeId).toString(),
      EmployeeName: pick(emp, "EmployeeName") ?? "",
      DepartmentCode: toInt(pick(emp, "DepartmentCode")),
      DepartmentName: pick(emp, "DepartmentName") ?? "",
      WeekDayName: (pick(emp, "WeekDayName") ?? "").toString(),
      clBalance,
      photo,
      details:
        `Emp Group : ${pick(emp, "EmpGroupName") ?? ""} / Designation : ${pick(emp, "DesignationName") ?? ""}\n` +
        `Shift : ${pick(emp, "ShiftName") ?? ""}\n` +
        `D.O.J : ${ymd(pick(emp, "DateofJoining"))}\n` +
        `W.O : ${pick(emp, "WeekDayName") ?? ""}\n` +
        `Salary : ${pick(emp, "Salary") ?? ""}\n` +
        `OT Calc : ${otCalc}` +
        (clBalance !== "" ? `\nCL Balance : ${clBalance}` : ""),
    });
  } catch (err) {
    console.error("DB Error (AttenManualEntryEmpWise.employeeDetails):", err);
    return sendError(res, err);
  }
};

// statuses whose times get filled from the shift during the initial merge
const STEP5_PRESENT = new Set([
  "X", "X\\", "X/", "\\", "\\\\", "\\/", "CF", "CF/", "CF\\", "CF\\/",
  "HX", "HX/", "WX", "WX/", "WO\\", "WO\\/", "H\\", "H\\/",
]);

// GET /atten-manual-entry-empwise/grid?employeeCode=&payTypeCode=&payPeriodCode=&fromDate=&toDate=
export const getGrid = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const employeeCode = toInt(req.query.employeeCode);
    const payTypeCode = toInt(req.query.payTypeCode);
    const payPeriodCode = toInt(req.query.payPeriodCode);
    const fromDate = ymd(req.query.fromDate);
    const toDate = ymd(req.query.toDate);
    if (employeeCode <= 0 || payTypeCode <= 0 || payPeriodCode <= 0 || !fromDate || !toDate)
      return sendSuccess(res, []);

    const pool = await getPool(req.headers.subdbname);

    // employee header (WeekDayName / department for fill rows)
    const empRs = await pool
      .request()
      .input("CompanyCode", sql.Int, cc)
      .input("EmployeeCode", sql.Int, employeeCode)
      .query("Select * from vw_Employee_New where CompanyCode = @CompanyCode AND EmployeeCode = @EmployeeCode");
    const emp = (empRs.recordset || [])[0] || {};
    const weekDay = (pick(emp, "WeekDayName") ?? "").toString().toUpperCase();
    const empDeptCode = toInt(pick(emp, "DepartmentCode"));
    const empDeptName = pick(emp, "DepartmentName") ?? "";
    const empIdStr = (pick(emp, "EmployeeID") ?? "").toString();
    const empNameStr = pick(emp, "EmployeeName") ?? "";

    // shifts map (for default + step-5 fill)
    const shRs = await pool
      .request()
      .input("CompanyCode", sql.Int, cc)
      .query("Select ShiftName, ShiftCode, InTime, OutTime, NextInTime, NextOutTime, WorkingHours from tbl_Shift Where CompanyCode = @CompanyCode");
    const shiftMap = new Map();
    (shRs.recordset || []).forEach((s) =>
      shiftMap.set(toInt(pick(s, "ShiftCode")), {
        ShiftName: pick(s, "ShiftName") ?? "",
        InTime: hm(pick(s, "InTime")),
        OutTime: hm(pick(s, "OutTime")),
        NextInTime: toBit(pick(s, "NextInTime")),
        NextOutTime: toBit(pick(s, "NextOutTime")),
        WorkingHours: workHoursDec(pick(s, "WorkingHours")),
      })
    );
    const defaultShiftCode = cc === 1 ? 1 : cc === 2 ? 5 : 0;

    const rows = [];
    const seenDates = new Set();
    const baseEmp = {
      DepartmentName: empDeptName,
      DepartmentCode: empDeptCode,
      EmpID: empIdStr,
      EmployeeName: empNameStr,
      EmployeeCode: employeeCode,
    };

    // ---- 1. manual entries -------------------------------------------------
    try {
      const r = await pool
        .request()
        .input("CompanyCode", sql.Int, cc)
        .input("FromDate", sql.VarChar(10), fromDate)
        .input("ToDate", sql.VarChar(10), toDate)
        .input("EmployeeCode", sql.Int, employeeCode)
        .execute("sp_ManualEntry_GetAll");
      for (const row of r.recordset || []) {
        const inT = pick(row, "Intime", "InTime");
        const outT = pick(row, "Outtime", "OutTime");
        const totHrs = inT && outT ? hoursDiffVB(inT, outT) : 0;
        const mot = toNum(pick(row, "MOT"));
        const motEntry = toBit(pick(row, "MOTEntry"));
        const attenEntry = toBit(pick(row, "AttenEntry"));
        const status = (pick(row, "Status") ?? "").toString().trim();
        const d = ymd(pick(row, "AttenDate"));
        seenDates.add(d);
        rows.push({
          ...baseEmp,
          AttenDate: d,
          Type: "Manual",
          DepartmentName: pick(row, "DepartmentName") ?? empDeptName,
          DepartmentCode: toInt(pick(row, "DepartmentCode")) || empDeptCode,
          EmpID: (pick(row, "EmployeeID") ?? empIdStr).toString(),
          EmployeeName: pick(row, "EmployeeName") ?? empNameStr,
          ShiftName: pick(row, "ShiftName") ?? "",
          ShiftCode: toInt(pick(row, "ShiftCode")),
          ShiftCode_Org: toInt(pick(row, "ShiftCode")),
          LeaveCode: toInt(pick(row, "LeaveCode")),
          AttenStatus: status,
          AttenStatus_Org: status,
          HalfDay: toBit(pick(row, "HalfDay")),
          InTime: dtLocal(inT),
          OutTime: dtLocal(outT),
          InTime_Org: dtLocal(inT),
          OutTime_Org: dtLocal(outT),
          OTIn: dtLocal(pick(row, "OTIntime", "OTInTime")),
          OTOut: dtLocal(pick(row, "OTOuttime", "OTOutTime")),
          TotHrs: totHrs,
          TotHrs_Org: totHrs,
          AutoOT: 0,
          MOT: mot,
          MOT_Org: mot,
          TotOT: motEntry ? mot : 0,
          ManualCode: toInt(pick(row, "ManualCode")),
          Reason: pick(row, "Reason") ?? "",
          Alter: attenEntry ? 1 : 0,
          AlterOT: motEntry ? 1 : 0,
          CurrentAlter: 0,
          CurrentAlterOT: 0,
        });
      }
    } catch (e) {
      console.warn("AttenManualEntryEmpWise.getGrid manual source:", e.message);
    }

    // ---- 2. machine entries (without manual) -------------------------------
    try {
      const r = await pool
        .request()
        .input("CompanyCode", sql.Int, cc)
        .input("FromDate", sql.VarChar(10), fromDate)
        .input("ToDate", sql.VarChar(10), toDate)
        .input("EmployeeCode", sql.Int, employeeCode)
        .query(
          "Select * from vw_MachineEntry_WithoutManual WHERE CompanyCode = @CompanyCode AND CalendarDate >= @FromDate AND CalendarDate <= @ToDate AND EmployeeCode = @EmployeeCode Order by CalendarDate"
        );
      for (const row of r.recordset || []) {
        const inT = pick(row, "InTime");
        const outT = pick(row, "OutTime");
        const totHrs = pick(row, "Working_Mins") != null ? Math.round((toNum(pick(row, "Working_Mins")) / 60) * 100) / 100 : 0;
        const autoOT = toNum(pick(row, "OT_Hours"));
        const status = (pick(row, "Status") ?? "").toString().trim();
        const d = ymd(pick(row, "CalendarDate"));
        seenDates.add(d);
        rows.push({
          ...baseEmp,
          AttenDate: d,
          Type: "Machine",
          DepartmentName: pick(row, "DepartmentName") ?? empDeptName,
          DepartmentCode: toInt(pick(row, "DepartmentCode")) || empDeptCode,
          EmpID: (pick(row, "EmployeeID") ?? empIdStr).toString(),
          EmployeeName: pick(row, "EmployeeName") ?? empNameStr,
          ShiftName: pick(row, "ShiftName") ?? "",
          ShiftCode: toInt(pick(row, "ShiftCode")),
          ShiftCode_Org: toInt(pick(row, "ShiftCode")),
          LeaveCode: toInt(pick(row, "LeaveCode")),
          AttenStatus: status,
          AttenStatus_Org: status,
          HalfDay: toBit(pick(row, "HalfDay")),
          InTime: dtLocal(inT),
          OutTime: dtLocal(outT),
          InTime_Org: dtLocal(inT),
          OutTime_Org: dtLocal(outT),
          OTIn: dtLocal(pick(row, "OTInTime")),
          OTOut: dtLocal(pick(row, "OTOutTime")),
          TotHrs: totHrs,
          TotHrs_Org: totHrs,
          AutoOT: autoOT,
          MOT: 0,
          MOT_Org: 0,
          TotOT: autoOT,
          ManualCode: 0,
          Reason: "",
          Alter: 0,
          AlterOT: 0,
          CurrentAlter: 0,
          CurrentAlterOT: 0,
        });
      }
    } catch (e) {
      console.warn("AttenManualEntryEmpWise.getGrid machine source:", e.message);
    }

    // ---- 3. offline load ---------------------------------------------------
    try {
      const r = await pool
        .request()
        .input("CompanyCode", sql.Int, cc)
        .input("FromDate", sql.VarChar(10), fromDate)
        .input("ToDate", sql.VarChar(10), toDate)
        .input("EmployeeCode", sql.Int, employeeCode)
        .execute("sp_Atten_OffLine_Load");
      for (const row of r.recordset || []) {
        const d = ymd(pick(row, "CalendarDate"));
        const dayName = new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }).toUpperCase();
        const isWO = dayName === weekDay;
        seenDates.add(d);
        rows.push({
          ...baseEmp,
          AttenDate: d,
          Type: "Machine",
          DepartmentName: pick(row, "DepartmentName") ?? empDeptName,
          DepartmentCode: toInt(pick(row, "DepartmentCode")) || empDeptCode,
          EmpID: (pick(row, "EmployeeID") ?? empIdStr).toString(),
          EmployeeName: pick(row, "EmployeeName") ?? empNameStr,
          ShiftName: shiftMap.get(defaultShiftCode)?.ShiftName ?? "",
          ShiftCode: defaultShiftCode,
          ShiftCode_Org: defaultShiftCode,
          LeaveCode: isWO ? 11 : 7,
          AttenStatus: isWO ? "WO" : "A",
          AttenStatus_Org: isWO ? "WO" : "A",
          HalfDay: 0,
          InTime: "", OutTime: "", InTime_Org: "", OutTime_Org: "", OTIn: "", OTOut: "",
          TotHrs: 0, TotHrs_Org: 0, AutoOT: 0, MOT: 0, MOT_Org: 0, TotOT: 0,
          ManualCode: 0, Reason: "",
          Alter: 0, AlterOT: 0, CurrentAlter: 0, CurrentAlterOT: 0,
        });
      }
    } catch (e) {
      console.warn("AttenManualEntryEmpWise.getGrid offline source:", e.message);
    }

    // ---- 4. fill any missing calendar day as Absent ------------------------
    try {
      const r = await pool
        .request()
        .input("CompanyCode", sql.Int, cc)
        .input("EmployeeCode", sql.Int, employeeCode)
        .input("FromDate", sql.VarChar(10), fromDate)
        .input("ToDate", sql.VarChar(10), toDate)
        .execute("sp_Employee_GetByCalendar");
      for (const row of r.recordset || []) {
        const d = ymd(pick(row, "CalendarDate"));
        if (seenDates.has(d)) continue;
        seenDates.add(d);
        rows.push({
          ...baseEmp,
          AttenDate: d,
          Type: "Machine",
          ShiftName: shiftMap.get(defaultShiftCode)?.ShiftName ?? "",
          ShiftCode: defaultShiftCode,
          ShiftCode_Org: defaultShiftCode,
          LeaveCode: 7,
          AttenStatus: "A",
          AttenStatus_Org: "A",
          HalfDay: 0,
          InTime: "", OutTime: "", InTime_Org: "", OutTime_Org: "", OTIn: "", OTOut: "",
          TotHrs: 0, TotHrs_Org: 0, AutoOT: 0, MOT: 0, MOT_Org: 0, TotOT: 0,
          ManualCode: 0, Reason: "",
          Alter: 0, AlterOT: 0, CurrentAlter: 0, CurrentAlterOT: 0,
        });
      }
    } catch (e) {
      console.warn("AttenManualEntryEmpWise.getGrid calendar source:", e.message);
    }

    // ---- 5. post-fill shift times for present-type statuses -----------------
    for (const row of rows) {
      const st = (row.AttenStatus || "").toString().trim();
      if (STEP5_PRESENT.has(st)) {
        const sh = shiftMap.get(toInt(row.ShiftCode));
        if (sh && !row.InTime) {
          const inDate = sh.NextInTime ? addDays(row.AttenDate, 1) : row.AttenDate;
          const outDate = sh.NextOutTime ? addDays(row.AttenDate, 1) : row.AttenDate;
          row.InTime = sh.InTime ? `${inDate}T${sh.InTime}` : "";
          row.OutTime = sh.OutTime ? `${outDate}T${sh.OutTime}` : "";
          row.InTime_Org = row.InTime;
          row.OutTime_Org = row.OutTime;
          row.TotHrs = sh.WorkingHours;
          row.TotHrs_Org = sh.WorkingHours;
        }
      } else {
        row.InTime = ""; row.OutTime = ""; row.InTime_Org = ""; row.OutTime_Org = "";
        row.TotHrs = 0; row.TotHrs_Org = 0;
      }
    }

    // sort by date asc, stamp id + display fields
    rows.sort((a, b) => (a.AttenDate < b.AttenDate ? -1 : a.AttenDate > b.AttenDate ? 1 : 0));
    rows.forEach((r, i) => {
      r.id = i + 1;
      r.AttenDateDisp = r.AttenDate ? r.AttenDate.split("-").reverse().join("/") : "";
    });

    return sendSuccess(res, rows);
  } catch (err) {
    console.error("DB Error (AttenManualEntryEmpWise.getGrid):", err);
    return sendError(res, err);
  }
};

// POST /atten-manual-entry-empwise/save
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
    const employeeCode = toInt(b.employeeCode);
    const departmentCode = toInt(b.departmentCode);
    const rows = Array.isArray(b.rows) ? b.rows : [];
    if (employeeCode <= 0) return sendError(res, "Select the Employee", 400);

    const altered = rows.filter(
      (r) =>
        (toInt(r.CurrentAlter) === 1 || toInt(r.CurrentAlterOT) === 1) &&
        (toInt(r.Alter) === 1 || toInt(r.AlterOT) === 1)
    );

    const pool = await getPool(req.headers.subdbname);
    transaction = pool.transaction();
    await transaction.begin();

    for (const r of altered) {
      const rq = transaction.request();
      if (toInt(r.ManualCode) > 0) rq.input("ManualCode", sql.Int, toInt(r.ManualCode));
      rq.input("AttenDate", sql.VarChar(10), ymd(r.AttenDate));
      rq.input("DepartmentCode", sql.Int, departmentCode);
      rq.input("ShiftCode", sql.Int, toInt(r.ShiftCode));
      rq.input("ShiftCategoryCode", sql.Int, 0);
      rq.input("EmployeeCode", sql.Int, employeeCode);
      rq.input("Status", sql.NVarChar, (r.AttenStatus ?? "").toString());
      if (dtSave(r.OTIn)) rq.input("OTInTime", sql.VarChar(19), dtSave(r.OTIn));
      if (dtSave(r.OTOut)) rq.input("OTOutTime", sql.VarChar(19), dtSave(r.OTOut));
      const mot = toNum(r.MOT);
      rq.input("MOT", sql.Decimal(18, 2), mot < 0 ? 0 : mot);
      rq.input("LeaveCode", sql.Int, toInt(r.LeaveCode));
      rq.input("Reason", sql.NVarChar, "");
      rq.input("W_Hours", sql.Decimal(18, 2), toNum(r.TotHrs));
      rq.input("OT_Hours", sql.Decimal(18, 2), toNum(r.TotOT));
      if (dtSave(r.InTime)) rq.input("InTime", sql.VarChar(19), dtSave(r.InTime));
      if (dtSave(r.OutTime)) rq.input("OutTime", sql.VarChar(19), dtSave(r.OutTime));
      rq.input("AttenEntry", sql.Int, toInt(r.Alter) === 1 ? 1 : 0);
      rq.input("MOTEntry", sql.Int, toInt(r.AlterOT) === 1 ? 1 : 0);
      rq.input("CompanyCode", sql.Int, companyCode);
      rq.input("User", sql.Int, parseInt(userId));
      rq.input("Node", sql.Int, parseInt(nodeCode));
      await rq.execute("sp_ManualEntry_EmpWise_AddEdit");
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
    console.error("DB Error (AttenManualEntryEmpWise.save):", err);
    return sendError(res, err);
  }
};

// DELETE /atten-manual-entry-empwise/delete/:manualCode?payTypeCode=&employeeCode=&fromDate=&toDate=
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const manualCode = toInt(req.params.manualCode);
    if (manualCode <= 0) return sendError(res, "This is Machine Entry did not Delete.....", 400);

    const payTypeCode = toInt(req.query.payTypeCode);
    const employeeCode = toInt(req.query.employeeCode);
    const fromDate = ymd(req.query.fromDate);
    const toDate = ymd(req.query.toDate);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("ManualCode", sql.Int, manualCode)
      .input("CompanyCode", sql.Int, cc)
      .execute("sp_EmployeeAttendance_Delete");

    // regenerate this employee's attendance over the range
    if (payTypeCode > 0 && employeeCode > 0 && fromDate && toDate) {
      try {
        const rq = pool.request();
        rq.timeout = 600000;
        await rq
          .input("PayTypeCode", sql.Int, payTypeCode)
          .input("CompanyCode", sql.Int, cc)
          .input("EmployeeCode", sql.Int, employeeCode)
          .input("FromDate", sql.VarChar(10), fromDate)
          .input("ToDate", sql.VarChar(10), toDate)
          .execute("sp_Generate_Attendance_New_Unit1");
      } catch (e) {
        console.warn("AttenManualEntryEmpWise.remove regenerate:", e.message);
      }
    }

    return sendSuccess(res, null, "Deleted Successfully...");
  } catch (err) {
    console.error("DB Error (AttenManualEntryEmpWise.remove):", err);
    return sendError(res, err);
  }
};
