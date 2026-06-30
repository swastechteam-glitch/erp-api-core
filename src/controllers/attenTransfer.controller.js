import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Attendance Transfer  (port of the WinForms frmAttendenceTransfer).
//
//   Move one (relieved) employee's attendance onto another (active) employee.
//   From Employee  = employees that HAVE left  (vw_Employee_New, DOL IS NOT NULL)
//   To Employee    = employees still active    (vw_Employee_New, DOL IS NULL)
//   Transfer runs sp_Atten_Transfer @FromEmployeeCode, @ToEmployeeCode.
//
//   Faithful to the desktop: the employee lists are NOT company-scoped (the
//   form binds them straight from the view), so neither are these.
//
//   Endpoints
//     GET   /options    from/to employee lists
//     POST  /transfer   sp_Atten_Transfer
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
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

// GET /atten-transfer/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const [fromRs, toRs] = await Promise.all([
      pool
        .request()
        .query("select str_EmployeeID, EmployeeCode from vw_Employee_New where DOL is not null ORDER BY EmployeeID"),
      pool
        .request()
        .query("select str_EmployeeID, EmployeeCode, DateofJoining from vw_Employee_New where DOL is null ORDER BY EmployeeID"),
    ]);
    return sendSuccess(res, {
      fromEmployees: (fromRs.recordset || []).map((x) => ({
        value: toInt(pick(x, "EmployeeCode")),
        label: (pick(x, "str_EmployeeID", "EmployeeID") ?? "").toString(),
      })),
      toEmployees: (toRs.recordset || []).map((x) => ({
        value: toInt(pick(x, "EmployeeCode")),
        label: (pick(x, "str_EmployeeID", "EmployeeID") ?? "").toString(),
      })),
    });
  } catch (err) {
    console.error("DB Error (AttenTransfer.getOptions):", err);
    return sendError(res, err);
  }
};

// POST /atten-transfer/transfer  -> sp_Atten_Transfer
export const transfer = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const b = req.body || {};
    const fromEmployeeCode = toInt(b.fromEmployeeCode);
    const toEmployeeCode = toInt(b.toEmployeeCode);
    if (fromEmployeeCode <= 0) return sendError(res, "Select the From Employee...", 400);
    if (toEmployeeCode <= 0) return sendError(res, "Select the To Employee...", 400);
    if (fromEmployeeCode === toEmployeeCode)
      return sendError(res, "From and To Employee cannot be the same", 400);

    const pool = await getPool(req.headers.subdbname);
    const rq = pool.request();
    rq.timeout = 600000; // the transfer SP can touch a lot of rows
    await rq
      .input("FromEmployeeCode", sql.Int, fromEmployeeCode)
      .input("ToEmployeeCode", sql.Int, toEmployeeCode)
      .execute("sp_Atten_Transfer");

    return sendSuccess(res, null, "The record is transfered");
  } catch (err) {
    console.error("DB Error (AttenTransfer.transfer):", err);
    return sendError(res, err);
  }
};
