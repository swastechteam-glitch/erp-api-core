import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Loan Advance Approval  (port of frmLoanApprovalDetails).
//
//   Lists pending loans (sp_Loan_GetAll @Approval = 0). Selecting one shows its
//   request details (installment schedule + previous pending balance). Approve
//   stamps tbl_Loan: Approval = 1, ApprovalUserCode, ApprovalDate — for the one
//   selected loan (matches the desktop, which approves the viewed record).
//
//   Company + financial-year scoped; user comes from the auth token.
//
//   Endpoints
//     GET  /pendings                pending loans (sp_Loan_GetAll @Approval=0)
//     GET  /detail/:loanCode?employeeCode=&loanDate=   schedule + prev pending
//     POST /approve                 { loanCode, approvalDate } -> Approval = 1
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

// GET /loan-approval/pendings  -> sp_Loan_GetAll @CompanyCode,@FYCode,@Approval=0
export const pendings = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const fy = getFYCode(req);
    const pool = await getPool(req.headers.subdbname);

    const rs = await pool
      .request()
      .input("CompanyCode", sql.Int, cc)
      .input("FYCode", sql.Int, fy)
      .input("Approval", sql.Int, 0)
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
        loanAmount: toNum(pick(row, "LoanAmount", "LoanAmt")),
        noofInstallment: toInt(pick(row, "NoofInstallment")),
        emiAmount: toNum(pick(row, "EMIAmount")),
        remarks: (pick(row, "Remarks") ?? "").toString(),
        _loanDate: ymd(pick(row, "LoanDate", "Loandate")),
      };
    });

    return sendSuccess(res, { rows });
  } catch (err) {
    console.error("DB Error (LoanApproval.pendings):", err);
    return sendError(res, err);
  }
};

// GET /loan-approval/detail/:loanCode?employeeCode=&loanDate=
export const detail = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const loanCode = toInt(req.params.loanCode);
    if (loanCode <= 0) return sendError(res, "Invalid LoanCode", 400);
    const employeeCode = toInt(req.query.employeeCode);
    const loanDate = ymd(req.query.loanDate);
    const pool = await getPool(req.headers.subdbname);

    // installment schedule
    const schRs = await pool
      .request()
      .input("CompanyCode", sql.Int, cc)
      .input("LoanCode", sql.Int, loanCode)
      .query("Select * from tbl_LoanDetails where CompanyCode = @CompanyCode AND LoanCode = @LoanCode");
    const schedule = (schRs.recordset || []).map((row) => ({
      deductionDate: ddmmyyyy(pick(row, "DeductionDate")),
      deductionAmount: toNum(pick(row, "DeductionAmount")),
    }));

    // previous pending balance (sp_EmployeeLedger @Pending = 1) — sum ClosingAmount
    let previousPending = 0;
    if (employeeCode > 0 && loanDate) {
      try {
        const pRs = await pool
          .request()
          .input("CompanyCode", sql.Int, cc)
          .input("Pending", sql.Int, 1)
          .input("FromDate", sql.VarChar(10), loanDate)
          .input("ToDate", sql.VarChar(10), loanDate)
          .input("EmployeeCode", sql.Int, employeeCode)
          .execute("sp_EmployeeLedger");
        previousPending = (pRs.recordset || []).reduce((s, r) => s + toNum(pick(r, "ClosingAmount")), 0);
      } catch {
        /* best-effort */
      }
    }

    return sendSuccess(res, { schedule, previousPending });
  } catch (err) {
    console.error("DB Error (LoanApproval.detail):", err);
    return sendError(res, err);
  }
};

// POST /loan-approval/approve  { loanCode, approvalDate }  -> tbl_Loan Approval = 1
export const approve = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    if (!userId) return sendError(res, "Missing user context (userId)", 400);
    const cc = getCompanyCode(req);
    const b = req.body || {};
    const loanCode = toInt(b.loanCode);
    if (loanCode <= 0) return sendError(res, "Select a loan to approve", 400);
    const approvalDate = ymd(b.approvalDate) || ymd(new Date());
    const pool = await getPool(req.headers.subdbname);

    await pool
      .request()
      .input("Approval", sql.Int, 1)
      .input("ApprovalUserCode", sql.Int, parseInt(userId))
      .input("ApprovalDate", sql.VarChar(10), approvalDate)
      .input("CompanyCode", sql.Int, cc)
      .input("LoanCode", sql.Int, loanCode)
      .query(
        "Update tbl_Loan SET Approval = @Approval, ApprovalUserCode = @ApprovalUserCode, ApprovalDate = @ApprovalDate " +
          "where CompanyCode = @CompanyCode AND LoanCode = @LoanCode"
      );

    return sendSuccess(res, null, "Loan Approved.....");
  } catch (err) {
    console.error("DB Error (LoanApproval.approve):", err);
    return sendError(res, err);
  }
};
