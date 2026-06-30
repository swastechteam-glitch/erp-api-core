import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Vacation Entry  (port of the WinForms frmVacationEntry — the "Out"/new flow).
//
//   Pick an eligible employee (DOL null, active, not already on an open vacation)
//   -> details / photo / contact / place / previous-vacation grid auto-fill.
//   From + Total Leave Days drive To (To = From + days - 1). Save runs
//   sp_VacationEntry_AddEdit and flags the employee LeaveStatus = 'ON LEAVE'.
//
//   Company-scoped; user/node from the auth token.
//
//   Endpoints
//     GET   /options                       eligible employees + next vacation no
//     GET   /employee-detail/:employeeCode details + contact/place/photo + previous
//     POST  /save                          sp_VacationEntry_AddEdit (txn)
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

// GET /vacation-entry/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    const emp = await pool
      .request()
      .input("CompanyCode", sql.Int, cc)
      .query(
        "Select str_EmployeeID, EmployeeName, EmployeeCode from vw_Employee_New " +
          "Where CompanyCode = @CompanyCode AND EmployeeCode NOT IN " +
          "(Select EmployeeCode from tbl_VacationEntry Where CompanyCode = @CompanyCode AND ReturnDate IS NULL) " +
          "and DOL IS NULL AND Emp_Status = 1 Order by EmployeeID"
      );

    let vacationNo = "";
    try {
      const noRs = await pool.request().input("CompanyCode", sql.Int, cc).execute("sp_VacationEntry_No");
      const row = (noRs.recordset || [])[0];
      if (row) vacationNo = (Object.values(row)[0] ?? "").toString();
    } catch {
      /* number is best-effort */
    }

    return sendSuccess(res, {
      employees: (emp.recordset || []).map((x) => ({
        value: toInt(pick(x, "EmployeeCode")),
        label: (pick(x, "str_EmployeeID", "EmployeeID") ?? "").toString(),
      })),
      vacationNo,
    });
  } catch (err) {
    console.error("DB Error (VacationEntry.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /vacation-entry/employee-detail/:employeeCode
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
      .query("Select * from vw_Employee_New where CompanyCode = @CompanyCode AND EmployeeCode = @EmployeeCode");
    const emp = (empRs.recordset || [])[0] || {};

    // contact + place come straight from tbl_Employee (matches the desktop)
    let contactNo = "";
    let place = "";
    try {
      const d = await pool
        .request()
        .input("EmployeeCode", sql.Int, employeeCode)
        .query("SELECT PhoneNo, Address1, Address2, City, District FROM tbl_Employee WHERE EmployeeCode = @EmployeeCode");
      const row = (d.recordset || [])[0];
      if (row) {
        contactNo = (pick(row, "PhoneNo") ?? "").toString();
        place = [pick(row, "Address1"), pick(row, "Address2"), pick(row, "City"), pick(row, "District")]
          .map((x) => (x == null ? "" : String(x).trim()))
          .filter(Boolean)
          .join(", ");
      }
    } catch {
      /* best-effort */
    }

    // photo
    let photo = "";
    try {
      const ph = await pool
        .request()
        .input("CompanyCode", sql.Int, cc)
        .input("EmployeeCode", sql.Int, employeeCode)
        .query("select Photo from tbl_employee_Photo where CompanyCode = @CompanyCode AND EmployeeCode = @EmployeeCode");
      const buf = pick((ph.recordset || [])[0], "Photo");
      if (buf && Buffer.isBuffer(buf)) photo = `data:image/jpeg;base64,${buf.toString("base64")}`;
    } catch {
      /* no photo */
    }

    // previous vacation details
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

    return sendSuccess(res, {
      details:
        `Department : ${pick(emp, "DepartmentName") ?? ""}\n` +
        `${pick(emp, "DesignationName") ?? ""}\n` +
        `${ddmmyyyy(pick(emp, "DateofJoining", "DateOfJoining"))}\n` +
        `Agent : ${pick(emp, "AgentName") ?? ""}`,
      contactNo,
      place,
      photo,
      previous,
    });
  } catch (err) {
    console.error("DB Error (VacationEntry.employeeDetail):", err);
    return sendError(res, err);
  }
};

// POST /vacation-entry/save  -> sp_VacationEntry_AddEdit (+ LeaveStatus) in a txn
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
    const fromDate = ymd(b.fromDate);
    const toDate = ymd(b.toDate);
    const totLeaveDays = toInt(b.totLeaveDays);
    const relationship = (b.relationship ?? "").toString().trim();
    const place = (b.place ?? "").toString().trim();
    const contactNo = (b.contactNo ?? "").toString().trim();
    const reason = (b.reason ?? "").toString().trim();

    // validations (mirror btnSave, Out flow)
    if (employeeCode <= 0) return sendError(res, "Select the Employee....", 400);
    if (totLeaveDays <= 0) return sendError(res, "Select the Total Leave Days....", 400);
    if (!fromDate || !toDate) return sendError(res, "Invalid Date", 400);
    if (toDate < fromDate) return sendError(res, "From Date should not be greater than To Date", 400);
    if (!relationship) return sendError(res, "Select the Relationship.....", 400);
    if (!place) return sendError(res, "Enter the Place.....", 400);
    if (contactNo.length < 10) return sendError(res, "Enter the Contact No.....", 400);
    if (!reason) return sendError(res, "Enter the Reason No.....", 400);

    const pool = await getPool(req.headers.subdbname);
    transaction = pool.transaction();
    await transaction.begin();

    const rq = transaction.request();
    rq.input("VacationEntryDate", sql.VarChar(10), ymd(b.vacationDate));
    rq.input("VacationEntryNo", sql.Int, toInt(b.vacationNo));
    rq.input("EmployeeCode", sql.Int, employeeCode);
    rq.input("FromDate", sql.VarChar(10), fromDate);
    rq.input("ToDate", sql.VarChar(10), toDate);
    rq.input("TotalLeaveDays", sql.Int, totLeaveDays);
    rq.input("ResponserName", sql.NVarChar, relationship);
    rq.input("Place", sql.NVarChar, place);
    rq.input("ContractNo", sql.NVarChar, contactNo);
    rq.input("Reason", sql.NVarChar, reason);
    rq.input("CompanyCode", sql.Int, companyCode);
    rq.input("User", sql.Int, parseInt(userId));
    rq.input("Node", sql.Int, parseInt(nodeCode));
    await rq.execute("sp_VacationEntry_AddEdit");

    // new entry -> employee goes ON LEAVE
    await transaction
      .request()
      .input("EmployeeCode", sql.Int, employeeCode)
      .query("UPDATE tbl_Employee SET LeaveStatus = 'ON LEAVE' WHERE EmployeeCode = @EmployeeCode");

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
    console.error("DB Error (VacationEntry.save):", err);
    return sendError(res, err);
  }
};
