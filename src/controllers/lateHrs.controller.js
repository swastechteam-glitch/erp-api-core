import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Late Hour Entry  (port of the WinForms frmLateHrs).
//
//   Pick a Date -> the grid loads that day's existing late-hour rows
//   (vw_LateHrs). Add employees with their Late Hours and Save persists each row
//   (sp_LateHrs_AddEdit). A saved row can be deleted (sp_LateHrs_Delete) unless
//   the pay period covering that date is already finalized.
//
//   Company-scoped; user/node from the auth token.
//
//   Endpoints
//     GET    /options                 active employees (DOL IS NULL)
//     GET    /grid                     vw_LateHrs for a date
//     POST   /save                     sp_LateHrs_AddEdit (rows, txn)
//     DELETE /delete/:lateHrsCode      sp_LateHrs_Delete (+ finalize guard)
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const toNum = (v) => {
  const n = Number(v);
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

// GET /late-hrs/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, cc)
      .query("select EmployeeCode, str_EmployeeID, EmployeeName from vw_Employee_New where DOL IS NULL and CompanyCode = @CompanyCode Order by str_EmployeeID");
    return sendSuccess(res, {
      employees: (r.recordset || []).map((x) => {
        const id = (pick(x, "str_EmployeeID", "EmployeeID") ?? "").toString();
        const name = (pick(x, "EmployeeName") ?? "").toString();
        return {
          value: toInt(pick(x, "EmployeeCode")),
          label: name ? `${id} - ${name}` : id,
          EmployeeID: id,
        };
      }),
    });
  } catch (err) {
    console.error("DB Error (LateHrs.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /late-hrs/grid?lateHrsDate=  -> vw_LateHrs
export const getGrid = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const lateHrsDate = ymd(req.query.lateHrsDate);
    if (!lateHrsDate) return sendSuccess(res, []);

    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, cc)
      .input("LateHrsDate", sql.VarChar(10), lateHrsDate)
      .query("Select * from vw_LateHrs where LateHrsDate = @LateHrsDate AND CompanyCode = @CompanyCode");

    const data = (r.recordset || []).map((row, i) => ({
      id: i + 1,
      LateHrsCode: toInt(pick(row, "LateHrsCode")),
      EmployeeCode: toInt(pick(row, "EmployeeCode")),
      EmployeeID: (pick(row, "str_EmployeeID", "EmployeeID") ?? "").toString(),
      LateHrs: toNum(pick(row, "LateHrs")),
    }));
    return sendSuccess(res, data);
  } catch (err) {
    console.error("DB Error (LateHrs.getGrid):", err);
    return sendError(res, err);
  }
};

// POST /late-hrs/save  -> sp_LateHrs_AddEdit per row (txn)
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
    const lateHrsDate = ymd(b.LateHrsDate);
    const rows = (Array.isArray(b.rows) ? b.rows : []).filter((r) => toInt(r.EmployeeCode) > 0);
    if (!lateHrsDate) return sendError(res, "Invalid Date", 400);
    if (rows.length === 0) return sendError(res, "Enter the Late Hours", 400);

    // duplicate-employee guard (mirrors the grid's "Already Exist this Employee")
    const seen = new Set();
    for (const r of rows) {
      const code = toInt(r.EmployeeCode);
      if (seen.has(code)) return sendError(res, "Already Exist this Employee", 400);
      seen.add(code);
      if (toNum(r.LateHrs) <= 0) return sendError(res, "Enter the Late Hours", 400);
    }

    const pool = await getPool(req.headers.subdbname);
    transaction = pool.transaction();
    await transaction.begin();

    for (const r of rows) {
      const rq = transaction.request();
      if (toInt(r.LateHrsCode) > 0) rq.input("LateHrsCode", sql.Int, toInt(r.LateHrsCode));
      rq.input("LateHrsDate", sql.VarChar(10), lateHrsDate);
      rq.input("EmployeeCode", sql.Int, toInt(r.EmployeeCode));
      rq.input("LateHrs", sql.Decimal(18, 2), toNum(r.LateHrs));
      rq.input("CompanyCode", sql.Int, companyCode);
      rq.input("User", sql.Int, parseInt(userId));
      rq.input("Node", sql.Int, parseInt(nodeCode));
      await rq.execute("sp_LateHrs_AddEdit");
    }

    await transaction.commit();
    return sendSuccess(res, { saved: rows.length }, "Record Saved Successfully", 201);
  } catch (err) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch {
        /* ignore */
      }
    }
    if (err.message && err.message.includes("UK_"))
      return sendError(res, "Already Exist", 409);
    console.error("DB Error (LateHrs.save):", err);
    return sendError(res, err);
  }
};

// DELETE /late-hrs/delete/:lateHrsCode?lateHrsDate=  -> sp_LateHrs_Delete (+ finalize guard)
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const lateHrsCode = toInt(req.params.lateHrsCode);
    const lateHrsDate = ymd(req.query.lateHrsDate);
    if (lateHrsCode <= 0) return sendError(res, "Invalid LateHrsCode", 400);

    const pool = await getPool(req.headers.subdbname);

    // block delete when the pay period covering the date is finalized
    if (lateHrsDate) {
      const fin = await pool
        .request()
        .input("CompanyCode", sql.Int, cc)
        .input("TheDate", sql.VarChar(10), lateHrsDate)
        .query("SELECT Finalize FROM tbl_PayPeriod WHERE @TheDate BETWEEN PayPeriodFrom AND PayPeriodTo AND Finalize = 1 AND CompanyCode = @CompanyCode");
      if ((fin.recordset || []).length > 0)
        return sendError(res, "Salary has already been finalized for the selected date", 409);
    }

    await pool
      .request()
      .input("LateHrsCode", sql.Int, lateHrsCode)
      .input("CompanyCode", sql.Int, cc)
      .execute("sp_LateHrs_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    console.error("DB Error (LateHrs.remove):", err);
    return sendError(res, err);
  }
};
