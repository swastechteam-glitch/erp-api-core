import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Loan Advance Entry  (port of frmLoan + frmLoanDetails).
//
//   A loan / advance header + an installment schedule (Deduction Date / Amount).
//   Pick the Loan & Advances pay head (vw_PayHead PayHeadCode = 2) and an active
//   employee; enter Loan Amount + No of Installment -> EMI auto = Amount / count,
//   and the schedule auto-fills (row 0 = Loan Date, each next +1 month, amount =
//   EMI). Save: sp_Loan_AddEdit (returns LoanCode), then sp_LoanDetails_Delete +
//   sp_LoanDetails_Insert per schedule row. The grid lists loans (sp_Loan_GetAll)
//   with edit / delete (sp_Loan_Delete).
//
//   Company + financial-year scoped; user / node come from the auth token.
//
//   Endpoints
//     GET    /options                         loan pay heads + active employees
//     GET    /employee-lookup?empId=&loanDate=&payHeadCode=   find by EmployeeID
//     GET    /employee-detail/:employeeCode?loanDate=&payHeadCode=  details + bal
//     GET    /list                            sp_Loan_GetAll
//     GET    /details/:loanCode               tbl_LoanDetails (schedule for edit)
//     POST   /save                            sp_Loan_AddEdit + details (txn)
//     DELETE /:loanCode                        sp_Loan_Delete
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

const buildDetails = (emp) =>
  `Emp Name  :${pick(emp, "EmployeeName") ?? ""}\n` +
  `Emp Group : ${pick(emp, "EmpGroupName") ?? ""}\n` +
  `Designation : ${pick(emp, "DesignationName") ?? ""}\n` +
  `Address : ${pick(emp, "Address1") ?? ""}`;

// Cur Balance from sp_EmployeeLedger (ClosingAmount) — only when the loan pay
// head has an EarningDeduction (mirrors the desktop gate).
const currentBalance = async (pool, cc, employeeCode, loanDate, earningDeduction) => {
  if (employeeCode <= 0 || earningDeduction == null || earningDeduction === "") return "";
  try {
    const rs = await pool
      .request()
      .input("CompanyCode", sql.Int, cc)
      .input("EmployeeCode", sql.Int, employeeCode)
      .input("FromDate", sql.VarChar(10), loanDate)
      .input("ToDate", sql.VarChar(10), loanDate)
      .execute("sp_EmployeeLedger");
    const row = (rs.recordset || [])[0];
    if (row) return toNum(pick(row, "ClosingAmount")).toFixed(2);
  } catch {
    /* best-effort */
  }
  return "";
};

const getPayHeadEarningDeduction = async (pool, payHeadCode) => {
  try {
    const rs = await pool
      .request()
      .input("PayHeadCode", sql.Int, payHeadCode)
      .query("Select EarningDeduction from vw_PayHead Where PayHeadCode = @PayHeadCode");
    return pick((rs.recordset || [])[0], "EarningDeduction");
  } catch {
    return null;
  }
};

// GET /loan-entry/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    const lnRs = await pool.request().query("Select * from vw_PayHead Where PayHeadCode IN (2)");
    const loanNames = (lnRs.recordset || []).map((x) => ({
      value: toInt(pick(x, "PayHeadCode")),
      label: (pick(x, "PayHeadName") ?? "").toString(),
      earningDeduction: pick(x, "EarningDeduction") ?? null,
    }));

    const empRs = await pool
      .request()
      .input("CompanyCode", sql.Int, cc)
      .query("Select * from vw_Employee_New where CompanyCode = @CompanyCode AND DOL IS NULL Order by EmployeeID");
    const employees = (empRs.recordset || []).map((x) => ({
      value: toInt(pick(x, "EmployeeCode")),
      label: (pick(x, "str_EmployeeID", "EmployeeID") ?? "").toString(),
      employeeId: (pick(x, "EmployeeID") ?? "").toString(),
    }));

    return sendSuccess(res, { loanNames, employees });
  } catch (err) {
    console.error("DB Error (LoanEntry.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /loan-entry/employee-detail/:employeeCode?loanDate=&payHeadCode=
export const employeeDetail = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const employeeCode = toInt(req.params.employeeCode);
    if (employeeCode <= 0) return sendError(res, "Invalid EmployeeCode", 400);
    const loanDate = ymd(req.query.loanDate);
    const payHeadCode = toInt(req.query.payHeadCode) || 2;
    const pool = await getPool(req.headers.subdbname);

    const empRs = await pool
      .request()
      .input("CompanyCode", sql.Int, cc)
      .input("EmployeeCode", sql.Int, employeeCode)
      .query("Select * from vw_Employee_New where CompanyCode = @CompanyCode AND EmployeeCode = @EmployeeCode");
    const emp = (empRs.recordset || [])[0] || {};

    const earningDeduction = await getPayHeadEarningDeduction(pool, payHeadCode);
    const curBalance = await currentBalance(pool, cc, employeeCode, loanDate, earningDeduction);

    return sendSuccess(res, {
      employeeCode,
      employeeId: (pick(emp, "EmployeeID") ?? "").toString(),
      details: buildDetails(emp),
      curBalance,
      earningDeduction,
    });
  } catch (err) {
    console.error("DB Error (LoanEntry.employeeDetail):", err);
    return sendError(res, err);
  }
};

// GET /loan-entry/employee-lookup?empId=&loanDate=&payHeadCode=  (txtEmpID Enter/Leave)
export const employeeLookup = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const empId = (req.query.empId ?? "").toString().trim();
    if (!empId) return sendSuccess(res, { found: false });
    const loanDate = ymd(req.query.loanDate);
    const payHeadCode = toInt(req.query.payHeadCode) || 2;
    const pool = await getPool(req.headers.subdbname);

    const empRs = await pool
      .request()
      .input("CompanyCode", sql.Int, cc)
      .input("EmployeeID", sql.VarChar(50), empId)
      .query("Select * from vw_Employee_New WHERE DOL IS NULL AND CompanyCode = @CompanyCode AND EmployeeID = @EmployeeID");
    const emp = (empRs.recordset || [])[0];
    if (!emp) return sendSuccess(res, { found: false, message: "Employee ID is not found or Employee is Left..." });

    const employeeCode = toInt(pick(emp, "EmployeeCode"));
    const earningDeduction = await getPayHeadEarningDeduction(pool, payHeadCode);
    const curBalance = await currentBalance(pool, cc, employeeCode, loanDate, earningDeduction);

    return sendSuccess(res, {
      found: true,
      employeeCode,
      employeeLabel: (pick(emp, "str_EmployeeID", "EmployeeID") ?? "").toString(),
      employeeId: (pick(emp, "EmployeeID") ?? "").toString(),
      details: buildDetails(emp),
      curBalance,
      earningDeduction,
    });
  } catch (err) {
    console.error("DB Error (LoanEntry.employeeLookup):", err);
    return sendError(res, err);
  }
};

// GET /loan-entry/list  -> sp_Loan_GetAll (@CompanyCode, @FYCode)
export const list = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const fy = getFYCode(req);
    const pool = await getPool(req.headers.subdbname);

    const rs = await pool
      .request()
      .input("CompanyCode", sql.Int, cc)
      .input("FYCode", sql.Int, fy)
      .execute("sp_Loan_GetAll");
    const rows = (rs.recordset || []).map((row, i) => {
      const code = toInt(pick(row, "LoanCode"));
      return {
        id: code || i + 1,
        loanCode: code,
        loanDate: ddmmyyyy(pick(row, "LoanDate", "Loandate")),
        payHeadCode: toInt(pick(row, "PayHeadCode")),
        loanName: (pick(row, "PayHeadName", "LoanName") ?? "").toString(),
        employeeCode: toInt(pick(row, "EmployeeCode")),
        employeeName: (pick(row, "EmployeeName", "str_EmployeeID", "EmployeeID") ?? "").toString(),
        loanAmount: toNum(pick(row, "LoanAmount")),
        noofInstallment: toInt(pick(row, "NoofInstallment")),
        emiAmount: toNum(pick(row, "EMIAmount")),
        remarks: (pick(row, "Remarks") ?? "").toString(),
        _loanDate: ymd(pick(row, "LoanDate", "Loandate")),
      };
    });

    return sendSuccess(res, { rows });
  } catch (err) {
    console.error("DB Error (LoanEntry.list):", err);
    return sendError(res, err);
  }
};

// GET /loan-entry/details/:loanCode  -> tbl_LoanDetails (schedule for edit)
export const loanDetails = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const loanCode = toInt(req.params.loanCode);
    if (loanCode <= 0) return sendError(res, "Invalid LoanCode", 400);
    const pool = await getPool(req.headers.subdbname);

    const rs = await pool
      .request()
      .input("CompanyCode", sql.Int, cc)
      .input("LoanCode", sql.Int, loanCode)
      .query("Select * from tbl_LoanDetails where CompanyCode = @CompanyCode AND LoanCode = @LoanCode");
    const schedule = (rs.recordset || []).map((row) => ({
      deductionDate: ymd(pick(row, "DeductionDate")),
      deductionAmount: toNum(pick(row, "DeductionAmount")),
    }));

    return sendSuccess(res, { schedule });
  } catch (err) {
    console.error("DB Error (LoanEntry.loanDetails):", err);
    return sendError(res, err);
  }
};

// POST /loan-entry/save  -> sp_Loan_AddEdit + sp_LoanDetails_Delete/_Insert (txn)
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
    const fyCode = getFYCode(req);

    const b = req.body || {};
    const isEdit = toInt(b.loanCode) > 0;
    const loanDate = ymd(b.loanDate);
    const employeeCode = toInt(b.employeeCode);
    const payHeadCode = toInt(b.payHeadCode) || 2;
    const loanAmount = toNum(b.loanAmount);
    const noofInstallment = toInt(b.noofInstallment);
    const emiAmount = toNum(b.emiAmount);
    const remarks = (b.remarks ?? "").toString().trim();
    const schedule = Array.isArray(b.schedule) ? b.schedule : [];

    // validations (mirror btnSave)
    if (payHeadCode <= 0) return sendError(res, "Select the Loan Name", 400);
    if (employeeCode <= 0) return sendError(res, "Select the Employee Name", 400);
    if (!(loanAmount > 0)) return sendError(res, "Loan Amount should not be empty", 400);
    if (noofInstallment === 0) return sendError(res, "Enter the No of Installment...", 400);
    if (emiAmount === 0) return sendError(res, "Enter the EMI Amount...", 400);
    for (const s of schedule) {
      if (ymd(s.deductionDate) < loanDate) return sendError(res, "Please the Check the Deduction Date", 400);
      if (toNum(s.deductionAmount) < 0) return sendError(res, "Please the Check the Deduction Amount", 400);
    }
    const total = schedule.reduce((sum, s) => sum + toNum(s.deductionAmount), 0);
    // compare rounded to 2 decimals to avoid float noise (VB compared Val() to Val())
    if (Math.round(loanAmount * 100) !== Math.round(total * 100))
      return sendError(res, "Please the Check the Loan Amount & Deduction Amount ", 400);

    const pool = await getPool(req.headers.subdbname);
    transaction = pool.transaction();
    await transaction.begin();

    // sp_Loan_AddEdit -> returns LoanCode (ExecuteScalar)
    const rq = transaction.request();
    rq.input("User", sql.Int, parseInt(userId));
    rq.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) rq.input("LoanCode", sql.Int, toInt(b.loanCode));
    rq.input("LoanDate", sql.VarChar(10), loanDate);
    rq.input("EmployeeCode", sql.Int, employeeCode);
    rq.input("PayHeadCode", sql.Int, payHeadCode);
    rq.input("LoanAmount", sql.Decimal(18, 2), loanAmount);
    rq.input("NoofInstallment", sql.Int, noofInstallment);
    rq.input("EMIAmount", sql.Decimal(18, 2), emiAmount);
    rq.input("Remarks", sql.NVarChar, remarks);
    rq.input("FYCode", sql.Int, fyCode);
    rq.input("CompanyCode", sql.Int, companyCode);

    let loanCode;
    try {
      const addRs = await rq.execute("sp_Loan_AddEdit");
      loanCode = toInt(Object.values((addRs.recordset || [])[0] || {})[0]);
      if (loanCode <= 0 && isEdit) loanCode = toInt(b.loanCode);
    } catch (spErr) {
      await transaction.rollback();
      transaction = null;
      if (String(spErr.message || "").includes("UK_LoanName_tblLoan"))
        return sendError(res, "Already exist the Loan Name", 400);
      throw spErr;
    }

    // rewrite the schedule
    await transaction
      .request()
      .input("LoanCode", sql.Int, loanCode)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_LoanDetails_Delete");

    for (const s of schedule) {
      await transaction
        .request()
        .input("LoanCode", sql.Int, loanCode)
        .input("DeductionDate", sql.VarChar(10), ymd(s.deductionDate))
        .input("DeductionAmount", sql.Decimal(18, 2), toNum(s.deductionAmount))
        .input("CompanyCode", sql.Int, companyCode)
        .execute("sp_LoanDetails_Insert");
    }

    await transaction.commit();
    return sendSuccess(res, { loanCode }, isEdit ? "The record is updated" : "The record is saved", isEdit ? 200 : 201);
  } catch (err) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch {
        /* ignore */
      }
    }
    console.error("DB Error (LoanEntry.save):", err);
    return sendError(res, err);
  }
};

// DELETE /loan-entry/:loanCode  -> sp_Loan_Delete
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const loanCode = toInt(req.params.loanCode);
    if (loanCode <= 0) return sendError(res, "Invalid LoanCode", 400);
    const pool = await getPool(req.headers.subdbname);

    try {
      await pool
        .request()
        .input("CompanyCode", sql.Int, cc)
        .input("LoanCode", sql.Int, loanCode)
        .execute("sp_Loan_Delete");
    } catch (spErr) {
      if (String(spErr.message || "").includes("FK_"))
        return sendError(res, "You cannot Delete the Loan !", 400);
      throw spErr;
    }
    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    console.error("DB Error (LoanEntry.remove):", err);
    return sendError(res, err);
  }
};
