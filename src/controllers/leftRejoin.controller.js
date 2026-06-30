import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Left And Rejoin  (port of the WinForms frmLeftRejoin / frmLeftRejoinDetails).
//
//   A single screen with a Left / Re Join toggle:
//     Left   (L) -> employee is leaving. Pick an ACTIVE employee (DOL null,
//                   Emp_Status = 1). Save flags tbl_Employee.LeaveStatus =
//                   'RELEAVE' and stamps the DOL (sp_Employee_LeftUpdate @DOL).
//     Re Join(R) -> employee returns. Pick an already-LEFT employee
//                   (DOL not null). Save stamps tbl_Employee.LastRejoinDate,
//                   passes @ReturnDate to the SP and clears the DOL
//                   (sp_Employee_LeftUpdate @DOL = NULL).
//
//   The body row is written through the SAME sp_VacationEntry_AddEdit the
//   desktop uses (with @Rejoin = 'L' | 'R'), so it shares the vacation ledger.
//
//   Company-scoped; user/node from the auth headers.
//
//   Endpoints
//     GET   /options?type=L|R              employees for that mode + next no
//     GET   /employee-detail/:employeeCode details / photo / DOL / previous
//     POST  /save                          AddEdit + employee flags (txn)
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const pad = (n) => String(n).padStart(2, "0");
const ymd = (v) => {
  if (!v) return "";
  if (v instanceof Date)
    return Number.isNaN(v.getTime())
      ? ""
      : `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  const m = String(v).match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : String(v).slice(0, 10);
};
const ddmmyyyy = (v) => {
  const d = ymd(v);
  return d ? d.split("-").reverse().join("/") : "";
};
const diffDays = (from, to) => {
  if (!from || !to) return 0;
  const a = new Date(`${from}T00:00:00Z`);
  const b = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.round((b - a) / 86400000) + 1;
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
// 'R' => Re Join (already-left employees), anything else => 'L' (active employees)
const modeOf = (req) =>
  String(req.query.type ?? req.body?.type ?? "L").trim().toUpperCase() === "R" ? "R" : "L";

// GET /left-rejoin/options?type=L|R
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const mode = modeOf(req);
    const pool = await getPool(req.headers.subdbname);

    // Left  -> active, not-yet-left employees (DOL IS NULL AND Emp_Status = 1)
    // Rejoin -> already-left employees (DOL IS NOT NULL)
    const where =
      mode === "R"
        ? "CompanyCode = @CompanyCode AND DOL IS NOT NULL"
        : "CompanyCode = @CompanyCode AND DOL IS NULL AND Emp_Status = 1";

    const emp = await pool
      .request()
      .input("CompanyCode", sql.Int, cc)
      .query(
        `Select str_EmployeeID, EmployeeName, EmployeeCode, DOL from vw_Employee_New ` +
          `Where ${where} Order by EmployeeID`
      );

    let vacationNo = "";
    try {
      const noRs = await pool
        .request()
        .input("CompanyCode", sql.Int, cc)
        .execute("sp_VacationEntry_No");
      const row = (noRs.recordset || [])[0];
      if (row) vacationNo = (Object.values(row)[0] ?? "").toString();
    } catch {
      /* number is best-effort */
    }

    return sendSuccess(res, {
      employees: (emp.recordset || []).map((x) => ({
        value: toInt(pick(x, "EmployeeCode")),
        label: (pick(x, "str_EmployeeID", "EmployeeID") ?? "").toString(),
        dol: ymd(pick(x, "DOL")),
      })),
      vacationNo,
    });
  } catch (err) {
    console.error("DB Error (LeftRejoin.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /left-rejoin/employee-detail/:employeeCode
export const employeeDetail = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const employeeCode = toInt(req.params.employeeCode);
    if (employeeCode <= 0) return sendError(res, "Invalid EmployeeCode", 400);
    const pool = await getPool(req.headers.subdbname);

    const empRs = await pool
      .request()
      .input("CompanyCode", sql.Int, cc)
      .input("EmployeeCode", sql.Int, employeeCode)
      .query(
        "Select * from vw_Employee_New where CompanyCode = @CompanyCode AND EmployeeCode = @EmployeeCode"
      );
    const emp = (empRs.recordset || [])[0] || {};

    // photo (best-effort)
    let photo = "";
    try {
      const ph = await pool
        .request()
        .input("CompanyCode", sql.Int, cc)
        .input("EmployeeCode", sql.Int, employeeCode)
        .query(
          "select Photo from tbl_employee_Photo where CompanyCode = @CompanyCode AND EmployeeCode = @EmployeeCode"
        );
      const buf = pick((ph.recordset || [])[0], "Photo");
      if (buf && Buffer.isBuffer(buf)) photo = `data:image/jpeg;base64,${buf.toString("base64")}`;
    } catch {
      /* no photo */
    }

    // previous vacation details (sp_Vacation_Previous @CompanyCode, @EmployeeCode)
    let previous = [];
    try {
      const pv = await pool
        .request()
        .input("CompanyCode", sql.Int, cc)
        .input("EmployeeCode", sql.Int, employeeCode)
        .execute("sp_Vacation_Previous");
      previous = (pv.recordset || []).map((row, i) => {
        const out = { id: i + 1 };
        for (const k of Object.keys(row)) {
          const v = row[k];
          out[k] = v instanceof Date ? ddmmyyyy(v) : v;
        }
        return out;
      });
    } catch {
      /* best-effort */
    }

    // details textbox (Department / Designation / DOJ / Father / Address / Phone)
    const details =
      `Department : ${pick(emp, "DepartmentName") ?? ""}\n` +
      `${pick(emp, "DesignationName") ?? ""}\n` +
      `${ddmmyyyy(pick(emp, "DateofJoining", "DateOfJoining"))}\n` +
      `${pick(emp, "FatherName") ?? ""}\n` +
      `Address \n` +
      `${pick(emp, "Address1") ?? ""}\n` +
      `${pick(emp, "Address2") ?? ""}\n` +
      `${pick(emp, "PhoneNo") ?? ""}`;

    return sendSuccess(res, {
      details,
      photo,
      dol: ymd(pick(emp, "DOL")),
      previous,
    });
  } catch (err) {
    console.error("DB Error (LeftRejoin.employeeDetail):", err);
    return sendError(res, err);
  }
};

// POST /left-rejoin/save  -> sp_VacationEntry_AddEdit (+ employee flags) in a txn
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
    const mode = modeOf(req); // 'L' | 'R'
    const employeeCode = toInt(b.employeeCode);
    const vacationDate = ymd(b.vacationDate);

    // mirror the desktop validation (btnSave): just needs an employee picked.
    if (employeeCode <= 0) return sendError(res, "Select the Employee....", 400);
    if (!vacationDate) return sendError(res, "Invalid Date", 400);

    // Left: From/To both default to the entry date. Re Join: From = employee DOL,
    // To = entry date (the leave span being closed). TotalLeaveDays follows the
    // span the same way the hidden desktop fields do.
    const fromDate = mode === "R" ? ymd(b.fromDate) || ymd(b.dol) || vacationDate : vacationDate;
    const toDate = ymd(b.toDate) || vacationDate;
    const totLeaveDays = toInt(b.totLeaveDays) || Math.max(1, diffDays(fromDate, toDate));

    const pool = await getPool(req.headers.subdbname);
    transaction = pool.transaction();
    await transaction.begin();

    // 1) employee flag update (runs first in the desktop, before the AddEdit)
    if (mode === "L") {
      await transaction
        .request()
        .input("EmployeeCode", sql.Int, employeeCode)
        .query("UPDATE tbl_Employee SET LeaveStatus = 'RELEAVE' WHERE EmployeeCode = @EmployeeCode");
    } else {
      await transaction
        .request()
        .input("EmployeeCode", sql.Int, employeeCode)
        .input("LastRejoinDate", sql.VarChar(10), vacationDate)
        .query("UPDATE tbl_Employee SET LastRejoinDate = @LastRejoinDate WHERE EmployeeCode = @EmployeeCode");
    }

    // 2) the vacation/left-rejoin ledger row
    const rq = transaction.request();
    rq.input("VacationEntryDate", sql.VarChar(10), vacationDate);
    rq.input("VacationEntryNo", sql.Int, toInt(b.vacationNo));
    rq.input("EmployeeCode", sql.Int, employeeCode);
    rq.input("FromDate", sql.VarChar(10), fromDate);
    rq.input("ToDate", sql.VarChar(10), toDate);
    rq.input("TotalLeaveDays", sql.Int, totLeaveDays);
    rq.input("ResponserName", sql.NVarChar, (b.responsorName ?? "").toString().trim());
    rq.input("Place", sql.NVarChar, (b.place ?? "").toString().trim());
    rq.input("ContractNo", sql.NVarChar, (b.contactNo ?? "").toString().trim());
    rq.input("Reason", sql.NVarChar, (b.reason ?? "").toString().trim());
    rq.input("Rejoin", sql.VarChar(1), mode);
    if (mode === "R") rq.input("ReturnDate", sql.VarChar(10), vacationDate);
    rq.input("CompanyCode", sql.Int, companyCode);
    rq.input("User", sql.Int, parseInt(userId));
    rq.input("Node", sql.Int, parseInt(nodeCode));
    await rq.execute("sp_VacationEntry_AddEdit");

    // 3) stamp / clear the DOL via sp_Employee_LeftUpdate
    const lu = transaction.request();
    lu.input("EmployeeCode", sql.Int, employeeCode);
    lu.input("DOL", sql.VarChar(10), mode === "L" ? vacationDate : null);
    lu.input("CompanyCode", sql.Int, companyCode);
    await lu.execute("sp_Employee_LeftUpdate");

    await transaction.commit();
    return sendSuccess(res, null, "The record is saved", 201);
  } catch (err) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch {
        /* ignore */
      }
    }
    console.error("DB Error (LeftRejoin.save):", err);
    return sendError(res, err);
  }
};
