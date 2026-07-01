import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Attendance & OT Approval — Stage 2  (port of frmEmployeeAttendanceOffLineApproval2).
//
//   Lists entries that cleared Stage 1 but not Stage 2
//   (sp_ManualEntryApproval_Pendings @CompanyCode, @Approval=1, @Approval2=0).
//   Tick rows and Approve runs sp_ManualEntryApproval2_AddEdit
//   @User, @Node, @Approval2=1, @ManualCode for each, then the list refreshes.
//
//   Company-scoped; user/node from the auth token.
//
//   Endpoints
//     GET   /pendings    sp_ManualEntryApproval_Pendings (Stage-2 pending)
//     POST  /approve     sp_ManualEntryApproval2_AddEdit (selected, txn)
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
// SQL datetime -> "h:mmAM" (UTC accessors, wall-clock); "" when empty
const hmAmPm = (v) => {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) {
    const m = String(v).match(/(\d{1,2}):(\d{2})/);
    if (!m) return "";
    let h = toInt(m[1]);
    const ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${m[2]}${ap}`;
  }
  let h = d.getUTCHours();
  const min = pad(d.getUTCMinutes());
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${min}${ap}`;
};

// GET /atten-approval2/pendings
export const getPendings = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, cc)
      .input("Approval", sql.Int, 1)
      .input("Approval2", sql.Int, 0)
      .execute("sp_ManualEntryApproval_Pendings");

    const data = (r.recordset || []).map((row, i) => ({
      id: i + 1,
      ManualCode: toInt(pick(row, "ManualCode")),
      AttenDate: ddmmyyyy(pick(row, "AttenDate")),
      ShiftName: pick(row, "ShiftName") ?? "",
      DepartmentName: pick(row, "DepartmentName") ?? "",
      EmployeeID: (pick(row, "EmployeeID") ?? "").toString(),
      EmployeeName: pick(row, "EmployeeName") ?? "",
      Status: (pick(row, "Status") ?? "").toString(),
      InTime: hmAmPm(pick(row, "InTime")),
      OutTime: hmAmPm(pick(row, "OutTime")),
      MOT: toNum(pick(row, "MOT")),
      W_Hours: toNum(pick(row, "W_Hours")).toFixed(2),
      OT_Hours: toNum(pick(row, "OT_Hours")).toFixed(2),
      ManualEntryReason: pick(row, "ManualEntryReason") ?? "",
    }));
    return sendSuccess(res, data);
  } catch (err) {
    console.error("DB Error (AttenApproval2.getPendings):", err);
    return sendError(res, err);
  }
};

// POST /atten-approval2/approve  -> sp_ManualEntryApproval2_AddEdit for selected rows (txn)
export const approve = async (req, res) => {
  let transaction;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode) return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const b = req.body || {};
    const manualCodes = Array.isArray(b.manualCodes)
      ? [...new Set(b.manualCodes.map(toInt).filter((x) => x > 0))]
      : [];
    if (manualCodes.length === 0)
      return sendError(res, "Please Select the Employee for Attendance Manual Entry", 400);

    const pool = await getPool(req.headers.subdbname);
    transaction = pool.transaction();
    await transaction.begin();

    for (const manualCode of manualCodes) {
      const rq = transaction.request();
      rq.input("User", sql.Int, parseInt(userId));
      rq.input("Node", sql.Int, parseInt(nodeCode));
      rq.input("Approval2", sql.Int, 1);
      rq.input("ManualCode", sql.Int, manualCode);
      await rq.execute("sp_ManualEntryApproval2_AddEdit");
    }

    await transaction.commit();
    return sendSuccess(res, { approved: manualCodes.length }, "The Attendance Manual Entry is Approved");
  } catch (err) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch {
        /* ignore */
      }
    }
    console.error("DB Error (AttenApproval2.approve):", err);
    return sendError(res, err);
  }
};
