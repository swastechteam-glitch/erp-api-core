import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Muster Generate (port of the WinForms frmGenerateMuster / rptMusterGenerate)
//
//   Pick Pay Type -> Pay Period (auto-fills From/To from the period), then
//   Generate runs sp_Muster_Generate_Unit1 (@FromDate, @ToDate, @PayperiodCode,
//   @CompanyCode; 600s timeout) exactly like the desktop's btnGenerate_Click.
//
//   Unlike Generate Attendance there is NO day loop — it is a single SP call —
//   but that call can run for minutes (desktop CommandTimeout = 600), longer than
//   the gateway's 60s forwarder timeout, so /generate runs as a BACKGROUND JOB
//   and the UI polls /progress. Job state is in-memory (single on-prem core proc).
//
//   Endpoints
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

// GET /muster/options  -> pay types
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
    console.error("DB Error (MusterGenerate.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /muster/pay-periods/:payTypeCode  -> open pay periods (+From/To)
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
    console.error("DB Error (MusterGenerate.getPayPeriods):", err);
    return sendError(res, err);
  }
};

// The background worker — single sp_Muster_Generate_Unit1 call.
async function runGenerate(job, ctx) {
  const { subdbname, companyCode, payPeriodCode, fromDate, toDate } = ctx;
  try {
    const pool = await getPool(subdbname);
    const rq = pool.request();
    rq.timeout = 600000; // mirror the desktop CommandTimeout = 600
    await rq
      .input("FromDate", sql.VarChar(10), fromDate)
      .input("ToDate", sql.VarChar(10), toDate)
      .input("PayperiodCode", sql.Int, payPeriodCode)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_Muster_Generate_Unit1");

    job.status = "done";
    job.message = "Muster Generated Successfully";
    job.lines.push("Muster Generated Successfully");
  } catch (err) {
    job.status = "error";
    job.message = err.message || "Generate failed";
    job.lines.push(`Error: ${job.message}`);
    console.error("DB Error (MusterGenerate.runGenerate):", err);
  }
}

// POST /muster/generate  -> start a background generate
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

    // validation order / messages (port of btnGenerate_Click)
    if (payTypeCode <= 0) return sendError(res, "Select the PayType....", 400);
    if (payPeriodCode <= 0) return sendError(res, "Select the Pay Period....", 400);
    if (!fromDate) return sendError(res, "Invalid From Date", 400);
    if (!toDate) return sendError(res, "Invalid To Date", 400);
    if (toDate < fromDate) return sendError(res, "From Date should not be greater than To Date", 400);

    runSeq += 1;
    const runId = `muster_${runSeq}`;
    const job = {
      runId,
      status: "running",
      message: "",
      lines: ["Starting muster generate…"],
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

    // fire-and-forget (the UI polls /progress)
    runGenerate(job, {
      subdbname: req.headers.subdbname,
      companyCode,
      payPeriodCode,
      fromDate,
      toDate,
    });

    return sendSuccess(res, { runId }, "Generate started", 202);
  } catch (err) {
    console.error("DB Error (MusterGenerate.startGenerate):", err);
    return sendError(res, err);
  }
};

// GET /muster/progress/:runId
export const getProgress = async (req, res) => {
  const job = jobs.get(req.params.runId);
  if (!job) return sendError(res, "Generate run not found", 404);
  return sendSuccess(res, {
    runId: job.runId,
    status: job.status,
    message: job.message,
    lines: job.lines,
  });
};
