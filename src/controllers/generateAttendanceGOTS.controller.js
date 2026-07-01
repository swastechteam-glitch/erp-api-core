import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Generate Attendance New (port of the WinForms frmGenerateAttendanceGOTS)
//
//   Identical to Generate Attendance EXCEPT it runs sp_Generate_Attendance_
//   New_Unit1_GOTS day-by-day (the "GOTS" variant). Same Pay Type -> Pay Period
//   -> From/To flow, same day loop + counter, same validations/messages.
//
//   Runs as a BACKGROUND JOB (the day loop can exceed the gateway's 60s timeout);
//   the UI polls /progress for the live day counter. Job state is in-memory.
//
//   Endpoints (mounted at /generate-attendance-gots)
//     GET  /options                       pay types (tbl_PayType, Status=1)
//     GET  /pay-periods/:payTypeCode      open pay periods for a type (+From/To)
//     POST /generate                      start a background generate, returns { runId }
//     GET  /progress/:runId               poll a running/finished generate
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
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

// ---- in-memory job registry (single on-prem core process) -----------------
const jobs = new Map();
let runSeq = 0;

// GET /generate-attendance-gots/options  -> pay types
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool.request().query("Select PayTypeName, PayTypeCode from tbl_PayType Where Status = 1");
    return sendSuccess(res, {
      payTypes: (r.recordset || []).map((x) => ({
        value: toInt(pick(x, "PayTypeCode")),
        label: pick(x, "PayTypeName") ?? "",
      })),
    });
  } catch (err) {
    console.error("DB Error (GenerateAttendanceGOTS.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /generate-attendance-gots/pay-periods/:payTypeCode  -> open pay periods (+From/To)
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
        "SELECT PayPeriodCode, PayPeriodName, PayPeriodFrom, PayPeriodTo FROM tbl_PayPeriod WHERE CompanyCode = @CompanyCode AND Finalize = 0 AND PayTypeCode = @PayTypeCode ORDER BY PayPeriodFrom DESC"
      );
    return sendSuccess(
      res,
      (r.recordset || []).map((x) => ({
        value: toInt(pick(x, "PayPeriodCode")),
        label: pick(x, "PayPeriodName") ?? "",
        PayPeriodFrom: ymd(pick(x, "PayPeriodFrom")),
        PayPeriodTo: ymd(pick(x, "PayPeriodTo")),
      }))
    );
  } catch (err) {
    console.error("DB Error (GenerateAttendanceGOTS.getPayPeriods):", err);
    return sendError(res, err);
  }
};

// The background worker — loop day-by-day calling sp_Generate_Attendance_New_Unit1_GOTS.
async function runGenerate(job, ctx) {
  const { subdbname, companyCode, payTypeCode, fromDate, toDate } = ctx;
  try {
    const pool = await getPool(subdbname);
    const start = new Date(`${fromDate}T00:00:00`);
    const end = new Date(`${toDate}T00:00:00`);
    const total = Math.floor((end - start) / 86400000) + 1;
    job.totalDays = total;

    let cnt = 0;
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      cnt += 1;
      job.dayCount = cnt;
      const ds = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      job.lines.push(`Day ${cnt} / ${total} : ${ds}`);
      try {
        const rq = pool.request();
        rq.timeout = 600000; // mirror the desktop CommandTimeout = 600
        await rq
          .input("FromDate", sql.VarChar(10), ds)
          .input("ToDate", sql.VarChar(10), ds)
          .input("PayTypeCode", sql.Int, payTypeCode)
          .input("CompanyCode", sql.Int, companyCode)
          .execute("sp_Generate_Attendance_New_Unit1_GOTS");
      } catch (err) {
        job.lines.push(`Day ${ds} error: ${err.message}`);
      }
    }

    job.status = "done";
    job.message = "Generated Successfully";
    job.lines.push("Generated Successfully");
  } catch (err) {
    job.status = "error";
    job.message = err.message || "Generate failed";
    job.lines.push(`Error: ${job.message}`);
    console.error("DB Error (GenerateAttendanceGOTS.runGenerate):", err);
  }
}

// POST /generate-attendance-gots/generate  -> start a background generate
export const startGenerate = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    if (companyCode <= 0)
      return sendError(res, "You are logged in to a group of companies; switch to a single company.", 400);

    const b = req.body || {};
    const payTypeCode = toInt(b.PayTypeCode);
    const payPeriodCode = toInt(b.PayPeriodCode);
    const fromDate = ymd(b.FromDate);
    const toDate = ymd(b.ToDate);

    if (payTypeCode <= 0) return sendError(res, "Select the PayType....", 400);
    if (payPeriodCode <= 0) return sendError(res, "Select the Pay Period....", 400);
    if (!fromDate) return sendError(res, "Invalid From Date", 400);
    if (!toDate) return sendError(res, "Invalid To Date", 400);
    if (toDate < fromDate) return sendError(res, "From Date should not be greater than To Date", 400);

    runSeq += 1;
    const runId = `gots_${runSeq}`;
    const job = {
      runId,
      status: "running",
      message: "",
      lines: ["Starting generate…"],
      dayCount: 0,
      totalDays: 0,
    };
    jobs.set(runId, job);
    if (jobs.size > 20) {
      for (const [k, v] of jobs) {
        if (v.status !== "running") {
          jobs.delete(k);
          if (jobs.size <= 20) break;
        }
      }
    }

    runGenerate(job, {
      subdbname: req.headers.subdbname,
      companyCode,
      payTypeCode,
      fromDate,
      toDate,
    });

    return sendSuccess(res, { runId }, "Generate started", 202);
  } catch (err) {
    console.error("DB Error (GenerateAttendanceGOTS.startGenerate):", err);
    return sendError(res, err);
  }
};

// GET /generate-attendance-gots/progress/:runId
export const getProgress = async (req, res) => {
  const job = jobs.get(req.params.runId);
  if (!job) return sendError(res, "Generate run not found", 404);
  return sendSuccess(res, {
    runId: job.runId,
    status: job.status,
    message: job.message,
    lines: job.lines,
    dayCount: job.dayCount,
    totalDays: job.totalDays,
  });
};
