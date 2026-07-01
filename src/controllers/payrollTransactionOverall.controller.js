import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Earning And Deduction  (port of frmPayRollTransection_OverAll).
//
//   A matrix editor: pick Pay Type + Pay Period + Emp Group; the grid shows one
//   ROW per eligible employee (vw_Salary, Account_WDays > 0) and one editable
//   COLUMN per manual pay head (tbl_PayHead WHERE Manual = 1). Cells prefill from
//   the existing transactions (vw_Transection, PostingType = 1).
//
//   Save (per employee × per manual pay head): sp_TransectionDetails_Delete then,
//   when the amount > 0, sp_Transection_AddEdit (@PostingType = 1, @Status = 1).
//   So it fully replaces the manual earnings/deductions for the shown employees
//   in that pay period. All inside one transaction.
//
//   Company-scoped; user / node come from the auth token.
//
//   Endpoints
//     GET  /options                     pay types + pay periods + emp groups
//     GET  /pay-periods?payTypeCode=    pay periods for a pay type (cascade)
//     GET  /grid?empGroupCode=&payPeriodCode=   pay-head columns + employee rows
//     POST /save                        delete + AddEdit per cell (txn)
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

// manual pay heads (the dynamic grid columns) — one fetch, reused by grid + save
const getManualPayHeads = async (pool) => {
  const rs = await pool.request().query("Select * from tbl_PayHead Where Manual = 1");
  return (rs.recordset || []).map((x) => ({
    payHeadCode: toInt(pick(x, "PayHeadCode")),
    payHeadName: (pick(x, "PayHeadName") ?? "").toString(),
    payHeadTypeCode: toInt(pick(x, "PayHeadTypeCode")),
    refundable: (pick(x, "Refundable") ?? "").toString().trim(),
  }));
};

// GET /payroll-transaction-overall/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    const ptRs = await pool.request().query("Select PayTypeName, PayTypeCode from tbl_PayType Where Status = 1");
    const payTypes = (ptRs.recordset || []).map((x) => ({
      value: toInt(pick(x, "PayTypeCode")),
      label: (pick(x, "PayTypeName") ?? "").toString(),
    }));

    const ppRs = await pool
      .request()
      .input("CompanyCode", sql.Int, cc)
      .query("Select PayPeriodName, PayPeriodCode from tbl_PayPeriod Where Status = 1 AND Finalize = 0 AND CompanyCode = @CompanyCode");
    const payPeriods = (ppRs.recordset || []).map((x) => ({
      value: toInt(pick(x, "PayPeriodCode")),
      label: (pick(x, "PayPeriodName") ?? "").toString(),
    }));

    const egRs = await pool.request().query("SELECT EmpGroupCode, EmpGroupName FROM tbl_EmpGroup Where Status = 1");
    const empGroups = (egRs.recordset || []).map((x) => ({
      value: toInt(pick(x, "EmpGroupCode")),
      label: (pick(x, "EmpGroupName") ?? "").toString(),
    }));

    return sendSuccess(res, { payTypes, payPeriods, empGroups });
  } catch (err) {
    console.error("DB Error (PayRollTransectionOverAll.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /payroll-transaction-overall/pay-periods?payTypeCode=  (cmbPayType cascade)
export const getPayPeriods = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const payTypeCode = toInt(req.query.payTypeCode);
    const pool = await getPool(req.headers.subdbname);

    let payPeriods = [];
    if (payTypeCode > 0) {
      const rs = await pool
        .request()
        .input("CompanyCode", sql.Int, cc)
        .input("PayTypeCode", sql.Int, payTypeCode)
        .query(
          "Select PayPeriodName, PayPeriodCode from tbl_PayPeriod " +
            "Where CompanyCode = @CompanyCode AND Finalize = 0 AND PayTypeCode = @PayTypeCode"
        );
      payPeriods = (rs.recordset || []).map((x) => ({
        value: toInt(pick(x, "PayPeriodCode")),
        label: (pick(x, "PayPeriodName") ?? "").toString(),
      }));
    }
    return sendSuccess(res, { payPeriods });
  } catch (err) {
    console.error("DB Error (PayRollTransectionOverAll.getPayPeriods):", err);
    return sendError(res, err);
  }
};

// GET /payroll-transaction-overall/grid?empGroupCode=&payPeriodCode=
export const getGrid = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const empGroupCode = toInt(req.query.empGroupCode);
    const payPeriodCode = toInt(req.query.payPeriodCode);
    const pool = await getPool(req.headers.subdbname);

    const payHeads = await getManualPayHeads(pool);

    let rows = [];
    if (empGroupCode > 0 && payPeriodCode > 0) {
      // employees (Load_Data)
      const empRs = await pool
        .request()
        .input("EmpGroupCode", sql.Int, empGroupCode)
        .input("PayPeriodCode", sql.Int, payPeriodCode)
        .query(
          "SELECT Convert(nvarchar(25),EmployeeID) + ' - ' + EmployeeName As EmpName, EmployeeCode, NetSalary " +
            "FROM vw_Salary Where Account_WDays > 0 AND EmpGroupCode = @EmpGroupCode AND PayPeriodCode = @PayPeriodCode " +
            "Order BY EmpGroupCode, EmployeeID"
        );

      // existing manual transactions for the period (Load_Pervious_Data)
      const prevRs = await pool
        .request()
        .input("PayPeriodCode", sql.Int, payPeriodCode)
        .query("Select * from vw_Transection Where PostingType = 1 AND PayPeriodCode = @PayPeriodCode");
      const prevByEmp = new Map(); // employeeCode -> { payHeadCode: amount }
      for (const p of prevRs.recordset || []) {
        const ec = toInt(pick(p, "EmployeeCode"));
        const ph = toInt(pick(p, "PayHeadCode"));
        const amt = toNum(pick(p, "EarningsAmount")) + toNum(pick(p, "DeductionsAmount"));
        if (!prevByEmp.has(ec)) prevByEmp.set(ec, {});
        prevByEmp.get(ec)[ph] = (prevByEmp.get(ec)[ph] || 0) + amt;
      }

      rows = (empRs.recordset || []).map((e) => {
        const employeeCode = toInt(pick(e, "EmployeeCode"));
        const existing = prevByEmp.get(employeeCode) || {};
        const values = {};
        for (const h of payHeads) values[h.payHeadCode] = toNum(existing[h.payHeadCode] || 0);
        return {
          employeeCode,
          employeeName: (pick(e, "EmpName") ?? "").toString(),
          netSalary: toNum(pick(e, "NetSalary")),
          values,
        };
      });
    }

    return sendSuccess(res, { payHeads, rows });
  } catch (err) {
    console.error("DB Error (PayRollTransectionOverAll.getGrid):", err);
    return sendError(res, err);
  }
};

// POST /payroll-transaction-overall/save  -> delete + AddEdit per cell (txn)
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
    const payPeriodCode = toInt(b.payPeriodCode);
    const payTypeCode = toInt(b.payTypeCode);
    const rows = Array.isArray(b.rows) ? b.rows : [];

    // validations (mirror btnSave)
    if (payTypeCode <= 0) return sendError(res, "Select the PayType", 400);
    if (payPeriodCode <= 0) return sendError(res, "Select the Pay Period", 400);

    const pool = await getPool(req.headers.subdbname);
    const payHeads = await getManualPayHeads(pool);
    if (payHeads.length === 0) return sendError(res, "Check the PayHead....", 400);
    const headByCode = new Map(payHeads.map((h) => [h.payHeadCode, h]));

    transaction = pool.transaction();
    await transaction.begin();

    for (const row of rows) {
      const employeeCode = toInt(row?.employeeCode);
      if (employeeCode <= 0) continue;
      const values = row?.values || {};
      for (const head of payHeads) {
        const amount = toNum(values[head.payHeadCode]);

        // delete existing detail for this employee + period + pay head
        await transaction
          .request()
          .input("PayPeriodCode", sql.Int, payPeriodCode)
          .input("EmployeeCode", sql.Int, employeeCode)
          .input("PayHeadCode", sql.Int, head.payHeadCode)
          .input("CompanyCode", sql.Int, companyCode)
          .execute("sp_TransectionDetails_Delete");

        // insert only when a non-zero amount was entered
        if (amount > 0) {
          const meta = headByCode.get(head.payHeadCode);
          await transaction
            .request()
            .input("PayPeriodCode", sql.Int, payPeriodCode)
            .input("EmployeeCode", sql.Int, employeeCode)
            .input("PayHeadCode", sql.Int, head.payHeadCode)
            .input("PayHeadTypeCode", sql.Int, meta.payHeadTypeCode)
            .input("Refundable", sql.NVarChar, meta.refundable)
            .input("Amount", sql.Decimal(18, 3), amount)
            .input("PostingType", sql.Int, 1)
            .input("Status", sql.Bit, true)
            .input("CompanyCode", sql.Int, companyCode)
            .input("User", sql.Int, parseInt(userId))
            .input("Node", sql.Int, parseInt(nodeCode))
            .execute("sp_Transection_AddEdit");
        }
      }
    }

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
    console.error("DB Error (PayRollTransectionOverAll.save):", err);
    return sendError(res, err);
  }
};
