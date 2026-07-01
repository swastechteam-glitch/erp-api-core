import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Salary Hold  (port of frmHoldSalary).
//
//   Pick a Pay Period; the grid lists the employees already flagged for that
//   period (vw_HoldSalary) and lets you add more. Each row is Hold or Release.
//   Save upserts each employee row via sp_HoldSalary_AddEdit (@Hold = 1 Hold /
//   0 Release). Duplicate employees are rejected ("Already Exist this Employee").
//
//   Company-scoped; user / node come from the auth token.
//
//   Endpoints
//     GET  /options                 pay periods + active employees
//     GET  /list?payPeriodCode=     existing hold/release rows (vw_HoldSalary)
//     POST /save                    sp_HoldSalary_AddEdit per row (txn)
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const getCompanyCode = (req) => toInt(req.headers.companyCode);
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

// GET /hold-salary/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    const ppRs = await pool
      .request()
      .input("CompanyCode", sql.Int, cc)
      .query("Select PayPeriodName, PayPeriodCode from tbl_Payperiod where CompanyCode = @CompanyCode AND Finalize = 0 Order By PayPeriodCode Desc");
    const payPeriods = (ppRs.recordset || []).map((x) => ({
      value: toInt(pick(x, "PayPeriodCode")),
      label: (pick(x, "PayPeriodName") ?? "").toString(),
    }));

    const empRs = await pool
      .request()
      .input("CompanyCode", sql.Int, cc)
      .query("select EmployeeCode, str_EmployeeID from vw_Employee_New where DOL IS NULL and CompanyCode = @CompanyCode Order by EmployeeID");
    const employees = (empRs.recordset || []).map((x) => ({
      value: toInt(pick(x, "EmployeeCode")),
      label: (pick(x, "str_EmployeeID", "EmployeeID") ?? "").toString(),
    }));

    return sendSuccess(res, { payPeriods, employees });
  } catch (err) {
    console.error("DB Error (HoldSalary.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /hold-salary/list?payPeriodCode=  -> vw_HoldSalary
export const list = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const payPeriodCode = toInt(req.query.payPeriodCode);
    if (payPeriodCode <= 0) return sendSuccess(res, { rows: [] });
    const pool = await getPool(req.headers.subdbname);

    const rs = await pool
      .request()
      .input("PayPeriodCode", sql.Int, payPeriodCode)
      .query("Select * from vw_HoldSalary where PayPeriodCode = @PayPeriodCode");
    const rows = (rs.recordset || []).map((row, i) => ({
      id: i + 1,
      holdSalaryCode: toInt(pick(row, "HoldSalaryCode")),
      employeeCode: toInt(pick(row, "EmployeeCode")),
      employeeLabel: (pick(row, "str_EmployeeID", "EmployeeID", "EmployeeName") ?? "").toString(),
      // Hold = 1 -> "Hold", Hold = 0 -> "Release" (mirrors the desktop)
      hold: toInt(pick(row, "Hold")) === 1 ? "Hold" : "Release",
    }));

    return sendSuccess(res, { rows });
  } catch (err) {
    console.error("DB Error (HoldSalary.list):", err);
    return sendError(res, err);
  }
};

// POST /hold-salary/save  -> sp_HoldSalary_AddEdit per row (txn)
export const save = async (req, res) => {
  let transaction;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode) return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const b = req.body || {};
    const payPeriodCode = toInt(b.payPeriodCode);
    const rows = (Array.isArray(b.rows) ? b.rows : []).filter((r) => toInt(r?.employeeCode) > 0);

    // validations (mirror btnSave)
    if (payPeriodCode <= 0) return sendError(res, "Select the PayPeriod", 400);
    if (rows.length === 0) return sendError(res, "Enter the atleast one Employee", 400);

    // duplicate employee guard (mirror ValidateRow "Already Exist this Employee")
    const seen = new Set();
    for (const r of rows) {
      const ec = toInt(r.employeeCode);
      if (seen.has(ec)) return sendError(res, "Already Exist this Employee", 400);
      seen.add(ec);
    }

    const pool = await getPool(req.headers.subdbname);
    transaction = pool.transaction();
    await transaction.begin();

    try {
      for (const r of rows) {
        const rq = transaction.request();
        const holdSalaryCode = toInt(r.holdSalaryCode);
        if (holdSalaryCode > 0) rq.input("HoldSalaryCode", sql.Int, holdSalaryCode);
        rq.input("PayPeriodCode", sql.Int, payPeriodCode);
        rq.input("EmployeeCode", sql.Int, toInt(r.employeeCode));
        rq.input("Hold", sql.Int, String(r.hold) === "Hold" ? 1 : 0);
        rq.input("User", sql.Int, parseInt(userId));
        rq.input("Node", sql.Int, parseInt(nodeCode));
        await rq.execute("sp_HoldSalary_AddEdit");
      }
    } catch (spErr) {
      await transaction.rollback();
      transaction = null;
      if (String(spErr.message || "").includes("UK_")) return sendError(res, "Already Exist", 400);
      throw spErr;
    }

    await transaction.commit();
    return sendSuccess(res, null, "Record Saved Successfully", 201);
  } catch (err) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch {
        /* ignore */
      }
    }
    console.error("DB Error (HoldSalary.save):", err);
    return sendError(res, err);
  }
};
