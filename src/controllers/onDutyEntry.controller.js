import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// On Duty Entry  (port of the WinForms frmOnDutyEntry + frmOnDutyEntryDetails).
//
//   Record an employee's "On Duty" spell (off-site work counted as present):
//   pick an active employee, a From / To date range and the Total On Duty Days
//   (= DateDiff(From, To) + 1). Save runs sp_OnDutyEntry_AddEdit; the details
//   grid lists existing entries (sp_OnDutyEntry_GetAll) with edit / delete
//   (sp_OnDutyEntry_Delete). Place / Contact No / Reason are hidden on the
//   desktop form so they are stored empty here.
//
//   Company-scoped; user / node come from the auth token.
//
//   Endpoints
//     GET    /options                 active employees + next OnDutyEntryNo
//     GET    /list                    sp_OnDutyEntry_GetAll (existing entries)
//     POST   /save                    sp_OnDutyEntry_AddEdit (txn)
//     DELETE /:onDutyEntryCode        sp_OnDutyEntry_Delete
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
const diffDays = (from, to) => {
  const a = ymd(from);
  const b = ymd(to);
  if (!a || !b) return 0;
  const d1 = new Date(`${a}T00:00:00Z`);
  const d2 = new Date(`${b}T00:00:00Z`);
  if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return 0;
  return Math.round((d2 - d1) / 86400000) + 1;
};

// GET /on-duty-entry/options
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
          "Where CompanyCode = @CompanyCode AND Emp_Status = 1 Order by EmployeeID"
      );

    let onDutyEntryNo = "";
    try {
      const noRs = await pool.request().input("CompanyCode", sql.Int, cc).execute("sp_OnDutyEntry_No");
      const row = (noRs.recordset || [])[0];
      if (row) onDutyEntryNo = (Object.values(row)[0] ?? "").toString();
    } catch {
      /* number is best-effort */
    }

    return sendSuccess(res, {
      employees: (emp.recordset || []).map((x) => ({
        value: toInt(pick(x, "EmployeeCode")),
        label: (pick(x, "str_EmployeeID", "EmployeeID") ?? "").toString(),
      })),
      onDutyEntryNo,
    });
  } catch (err) {
    console.error("DB Error (OnDutyEntry.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /on-duty-entry/list  -> sp_OnDutyEntry_GetAll (existing entries grid)
export const list = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    const rs = await pool.request().input("CompanyCode", sql.Int, cc).execute("sp_OnDutyEntry_GetAll");
    const rows = (rs.recordset || []).map((row, i) => {
      const code = toInt(pick(row, "OnDutyEntryCode", "OnDutyCode", "Code"));
      return {
        id: code || i + 1,
        onDutyEntryCode: code,
        onDutyEntryNo: toInt(pick(row, "OnDutyEntryNo", "OnDutyNo")),
        onDutyEntryDate: ddmmyyyy(pick(row, "OnDutyEntryDate", "OnDutyDate", "EntryDate")),
        employeeCode: toInt(pick(row, "EmployeeCode")),
        employeeName: (pick(row, "EmployeeName", "str_EmployeeID", "EmployeeID") ?? "").toString(),
        fromDate: ddmmyyyy(pick(row, "FromDate")),
        toDate: ddmmyyyy(pick(row, "ToDate")),
        totOnDutyDays: toInt(pick(row, "TotalOnDutyDays", "TotOnDutyDays", "OnDutyDays", "NoofDays")),
        // raw ISO dates so the form can re-populate cleanly on edit
        _fromDate: ymd(pick(row, "FromDate")),
        _toDate: ymd(pick(row, "ToDate")),
        _onDutyEntryDate: ymd(pick(row, "OnDutyEntryDate", "OnDutyDate", "EntryDate")),
      };
    });

    return sendSuccess(res, { rows });
  } catch (err) {
    console.error("DB Error (OnDutyEntry.list):", err);
    return sendError(res, err);
  }
};

// POST /on-duty-entry/save  -> sp_OnDutyEntry_AddEdit (txn)
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
    let totOnDutyDays = toInt(b.totOnDutyDays);
    if (totOnDutyDays <= 0) totOnDutyDays = diffDays(fromDate, toDate);

    // validations (mirror frmOnDutyEntry btnSave)
    if (employeeCode <= 0) return sendError(res, "Select the Employee....", 400);
    if (!fromDate || !toDate) return sendError(res, "Invalid Date", 400);
    if (toDate < fromDate) return sendError(res, "From Date should not be greater than To Date", 400);
    if (totOnDutyDays <= 0) return sendError(res, "Enter the Total On Duty Days.....", 400);

    const pool = await getPool(req.headers.subdbname);
    transaction = pool.transaction();
    await transaction.begin();

    const rq = transaction.request();
    rq.input("OnDutyEntryDate", sql.VarChar(10), ymd(b.onDutyEntryDate));
    rq.input("OnDutyEntryNo", sql.Int, toInt(b.onDutyEntryNo));
    rq.input("EmployeeCode", sql.Int, employeeCode);
    rq.input("FromDate", sql.VarChar(10), fromDate);
    rq.input("ToDate", sql.VarChar(10), toDate);
    rq.input("TotalOnDutyDays", sql.Int, totOnDutyDays);
    rq.input("Place", sql.NVarChar, (b.place ?? "").toString().trim());
    rq.input("ContactNo", sql.NVarChar, (b.contactNo ?? "").toString().trim());
    rq.input("Reason", sql.NVarChar, (b.reason ?? "").toString().trim());
    rq.input("CompanyCode", sql.Int, companyCode);
    rq.input("User", sql.Int, parseInt(userId));
    rq.input("Node", sql.Int, parseInt(nodeCode));
    await rq.execute("sp_OnDutyEntry_AddEdit");

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
    console.error("DB Error (OnDutyEntry.save):", err);
    return sendError(res, err);
  }
};

// DELETE /on-duty-entry/:onDutyEntryCode  -> sp_OnDutyEntry_Delete
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const onDutyEntryCode = toInt(req.params.onDutyEntryCode);
    if (onDutyEntryCode <= 0) return sendError(res, "Invalid OnDutyEntryCode", 400);
    const pool = await getPool(req.headers.subdbname);

    await pool.request().input("OnDutyEntryCode", sql.Int, onDutyEntryCode).execute("sp_OnDutyEntry_Delete");
    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    console.error("DB Error (OnDutyEntry.remove):", err);
    return sendError(res, err);
  }
};
