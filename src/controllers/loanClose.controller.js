import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Loan Close  (port of frmLoanClose + frmLoanCloseDetails).
//
//   Close out an employee's loan / advance balance: pick a Pay Head
//   (vw_PayHead PayHeadCode IN (2,28)) + employee -> the Pending Amount fills
//   from sp_EmployeeLedger (ClosingAmount for that pay head, as of today). Enter
//   the Closing Amount + remarks. Save runs sp_LoanClose_AddEdit; the grid lists
//   closings (sp_LoanClose_GetAll) with delete (sp_LoanClose_Delete). The desktop
//   list has edit disabled, so this exposes delete only.
//
//   Company + financial-year scoped; user / node come from the auth token.
//
//   Endpoints
//     GET    /options                    pay heads + employees + next No
//     GET    /pending?employeeCode=&payHeadCode=   sp_EmployeeLedger balance
//     GET    /list                       sp_LoanClose_GetAll
//     POST   /save                       sp_LoanClose_AddEdit
//     DELETE /:loanClosedCode            sp_LoanClose_Delete
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
const getFYCode = (req) => toInt(req.headers.FYCode);
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
const todayYMD = () => ymd(new Date());
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

// GET /loan-close/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const fy = getFYCode(req);
    const pool = await getPool(req.headers.subdbname);

    const phRs = await pool.request().query("Select * from vw_PayHead Where PayHeadCode IN (2, 28)");
    const payHeads = (phRs.recordset || []).map((x) => ({
      value: toInt(pick(x, "PayHeadCode")),
      label: (pick(x, "PayHeadName") ?? "").toString(),
    }));

    const empRs = await pool
      .request()
      .input("CompanyCode", sql.Int, cc)
      .query("Select EmployeeCode, str_EmployeeID from vw_Employee_New WHERE CompanyCode = @CompanyCode AND Emp_Status = 1 Order by EmployeeID");
    const employees = (empRs.recordset || []).map((x) => ({
      value: toInt(pick(x, "EmployeeCode")),
      label: (pick(x, "str_EmployeeID", "EmployeeID") ?? "").toString(),
    }));

    let loanClosedNo = "";
    try {
      const noRs = await pool
        .request()
        .input("CompanyCode", sql.Int, cc)
        .input("FYCode", sql.Int, fy)
        .execute("sp_LoanClose_BindNo");
      const row = (noRs.recordset || [])[0];
      if (row) loanClosedNo = (Object.values(row)[0] ?? "").toString();
    } catch {
      /* number is best-effort */
    }

    return sendSuccess(res, { payHeads, employees, loanClosedNo });
  } catch (err) {
    console.error("DB Error (LoanClose.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /loan-close/pending?employeeCode=&payHeadCode=  -> sp_EmployeeLedger balance
export const pending = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const employeeCode = toInt(req.query.employeeCode);
    const payHeadCode = toInt(req.query.payHeadCode);
    if (employeeCode <= 0) return sendSuccess(res, { pendingAmount: 0 });
    if (payHeadCode <= 0) return sendError(res, "Select the Pay Head....", 400);
    const pool = await getPool(req.headers.subdbname);
    const today = todayYMD();

    let pendingAmount = 0;
    try {
      const rs = await pool
        .request()
        .input("CompanyCode", sql.Int, cc)
        .input("FromDate", sql.VarChar(10), today)
        .input("ToDate", sql.VarChar(10), today)
        .input("EmployeeCode", sql.Int, employeeCode)
        .input("PayHeadCode", sql.Int, payHeadCode)
        .execute("sp_EmployeeLedger");
      pendingAmount = (rs.recordset || []).reduce((s, r) => s + toNum(pick(r, "ClosingAmount")), 0);
    } catch {
      /* best-effort */
    }

    return sendSuccess(res, { pendingAmount });
  } catch (err) {
    console.error("DB Error (LoanClose.pending):", err);
    return sendError(res, err);
  }
};

// GET /loan-close/list  -> sp_LoanClose_GetAll
export const list = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    const rs = await pool.request().input("CompanyCode", sql.Int, cc).execute("sp_LoanClose_GetAll");
    const rows = (rs.recordset || []).map((row, i) => {
      const code = toInt(pick(row, "LoanClosedCode", "Code"));
      return {
        id: code || i + 1,
        loanClosedCode: code,
        loanClosedNo: toInt(pick(row, "LoanClosedNo")),
        loanClosedDate: ddmmyyyy(pick(row, "LoanClosedDate")),
        payHeadCode: toInt(pick(row, "PayHeadCode")),
        payHeadName: (pick(row, "PayHeadName") ?? "").toString(),
        employeeCode: toInt(pick(row, "EmployeeCode")),
        employeeName: (pick(row, "EmployeeName", "str_EmployeeID", "EmployeeID") ?? "").toString(),
        closedAmount: toNum(pick(row, "ClosedAmount")),
        remarks: (pick(row, "Remarks") ?? "").toString(),
      };
    });

    return sendSuccess(res, { rows });
  } catch (err) {
    console.error("DB Error (LoanClose.list):", err);
    return sendError(res, err);
  }
};

// POST /loan-close/save  -> sp_LoanClose_AddEdit
export const save = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode) return sendError(res, "Missing user context (userId / nodeCode)", 400);
    const companyCode = getCompanyCode(req);
    if (companyCode <= 0)
      return sendError(res, "You are logged in to a group of companies; switch to a single company.", 400);
    const fyCode = getFYCode(req);

    const b = req.body || {};
    const isEdit = toInt(b.loanClosedCode) > 0;
    const closedAmount = b.closedAmount;
    const employeeCode = toInt(b.employeeCode);
    const payHeadCode = toInt(b.payHeadCode);

    // validations (mirror btnSave, in order)
    if (closedAmount === "" || closedAmount == null) return sendError(res, "Entry The Closing Amount....", 400);
    if (employeeCode <= 0) return sendError(res, "Select The Employee Name.....", 400);
    if (payHeadCode <= 0) return sendError(res, "Select The Pay Head Name.....", 400);

    const pool = await getPool(req.headers.subdbname);
    const rq = pool.request();
    if (isEdit) rq.input("LoanClosedCode", sql.Int, toInt(b.loanClosedCode));
    rq.input("LoanClosedNo", sql.Int, toInt(b.loanClosedNo));
    rq.input("LoanClosedDate", sql.VarChar(10), ymd(b.loanClosedDate));
    rq.input("ClosedAmount", sql.Decimal(18, 2), toNum(closedAmount));
    rq.input("PayHeadCode", sql.Int, payHeadCode);
    rq.input("EmployeeCode", sql.Int, employeeCode);
    rq.input("Remarks", sql.NVarChar, (b.remarks ?? "").toString().trim());
    rq.input("FYCode", sql.Int, fyCode);
    rq.input("CompanyCode", sql.Int, companyCode);
    rq.input("User", sql.Int, parseInt(userId));
    rq.input("Node", sql.Int, parseInt(nodeCode));
    await rq.execute("sp_LoanClose_AddEdit");

    return sendSuccess(res, null, isEdit ? "The record is updated" : "The record is saved", isEdit ? 200 : 201);
  } catch (err) {
    console.error("DB Error (LoanClose.save):", err);
    return sendError(res, err);
  }
};

// DELETE /loan-close/:loanClosedCode  -> sp_LoanClose_Delete
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const loanClosedCode = toInt(req.params.loanClosedCode);
    if (loanClosedCode <= 0) return sendError(res, "Invalid LoanClosedCode", 400);
    const pool = await getPool(req.headers.subdbname);

    try {
      await pool
        .request()
        .input("LoanClosedCode", sql.Int, loanClosedCode)
        .input("CompanyCode", sql.Int, cc)
        .execute("sp_LoanClose_Delete");
    } catch (spErr) {
      if (String(spErr.message || "").includes("FK_"))
        return sendError(res, "You cannot Delete the Loan !", 400);
      throw spErr;
    }
    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    console.error("DB Error (LoanClose.remove):", err);
    return sendError(res, err);
  }
};
