import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Labour Agent Commission  (port of frmLabourAgentCommission + …Details).
//
//   Pick Pay Type + Agent -> Pay Periods load; pick a Pay Period and View to
//   pull the agent's pending employees (sp_LabourAgentCommission_GetPendings).
//   Tick employees; the totals (persons / W.Days / Total Days / Commission /
//   Food) sum from the ticked rows. Save runs sp_LabourAgentCommission_AddEdit
//   (returns LACCode) then sp_LabourAgentCommissionDetails_Delete +
//   sp_LabourAgentCommissionDetails_Insert per ticked row. The grid lists
//   commissions (sp_LabourAgentCommission_GetAll) with delete (…_Delete).
//
//   Company + financial-year scoped; user / node come from the auth token.
//
//   Endpoints
//     GET    /options                     pay types + agents + next No
//     GET    /pay-periods?agentCode=&payTypeCode=   agent+type pay periods
//     GET    /pendings?agentCode=&payPeriodCode=&payTypeCode=   pending rows
//     GET    /list                        sp_LabourAgentCommission_GetAll
//     POST   /save                        AddEdit + details (txn)
//     DELETE /:lacCode                     sp_LabourAgentCommission_Delete
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

// GET /labour-agent-commission/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const fy = getFYCode(req);
    const pool = await getPool(req.headers.subdbname);

    const ptRs = await pool.request().query("Select PayTypeName, PayTypeCode from tbl_PayType where Status = 1");
    const payTypes = (ptRs.recordset || []).map((x) => ({
      value: toInt(pick(x, "PayTypeCode")),
      label: (pick(x, "PayTypeName") ?? "").toString(),
    }));

    const agRs = await pool.request().input("CompanyCode", sql.Int, cc).execute("sp_LabourAgentCommission_getbyAgent");
    const agents = (agRs.recordset || []).map((x) => ({
      value: toInt(pick(x, "AgentCode")),
      label: (pick(x, "AgentName") ?? "").toString(),
      labourCommission: toNum(pick(x, "LabourCommission")),
      foodAllowance: toNum(pick(x, "FoodAllowance")),
    }));

    let lacNo = "";
    try {
      const noRs = await pool
        .request()
        .input("CompanyCode", sql.Int, cc)
        .input("FYCode", sql.Int, fy)
        .query("Select ISNULL(Max(LACNo),0)+1 as No from tbl_LabourAgentCommission where CompanyCode = @CompanyCode AND FYCode = @FYCode");
      lacNo = (pick((noRs.recordset || [])[0], "No") ?? "").toString();
    } catch {
      /* best-effort */
    }

    return sendSuccess(res, { payTypes, agents, lacNo });
  } catch (err) {
    console.error("DB Error (LabourAgentCommission.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /labour-agent-commission/pay-periods?agentCode=&payTypeCode=
export const getPayPeriods = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const agentCode = toInt(req.query.agentCode);
    const payTypeCode = toInt(req.query.payTypeCode);
    const pool = await getPool(req.headers.subdbname);

    let payPeriods = [];
    if (agentCode > 0 && payTypeCode > 0) {
      const rs = await pool
        .request()
        .input("CompanyCode", sql.Int, cc)
        .input("AgentCode", sql.Int, agentCode)
        .input("PayTypeCode", sql.Int, payTypeCode)
        .execute("sp_LabourAgentCommission_getbyPaypeiod");
      payPeriods = (rs.recordset || []).map((x) => ({
        value: toInt(pick(x, "PayPeriodCode")),
        label: (pick(x, "PayPeriodName") ?? "").toString(),
        fromDate: ymd(pick(x, "PayPeriodFrom", "PayperiodFrom")),
        toDate: ymd(pick(x, "PayPeriodTo", "PayperiodTo")),
      }));
    }
    return sendSuccess(res, { payPeriods });
  } catch (err) {
    console.error("DB Error (LabourAgentCommission.getPayPeriods):", err);
    return sendError(res, err);
  }
};

const mapPendingRow = (row, i) => ({
  id: i + 1,
  employeeCode: toInt(pick(row, "EmployeeCode")),
  departmentCode: toInt(pick(row, "DepartmentCode")),
  payPeriodCode: toInt(pick(row, "PayperiodCode", "PayPeriodCode")),
  employeeName: (pick(row, "Employeename", "EmployeeName") ?? "").toString(),
  departmentName: (pick(row, "Departmentname_English", "DepartmentName") ?? "").toString(),
  categoryName: (pick(row, "EmpCategoryName") ?? "").toString(),
  wDays: toNum(pick(row, "WDays")),
  otHours: toNum(pick(row, "OTHours")),
  otDays: toNum(pick(row, "OTDays")),
  totalDays: toNum(pick(row, "TotalDays")),
  salary: toNum(pick(row, "Salary")),
  basicSalary: toNum(pick(row, "BasicSalary")),
  comPerDay: toNum(pick(row, "ComPerDay")),
  comAmount: toNum(pick(row, "ComAmount")),
  foodAmount: toNum(pick(row, "FoodAmount")),
  foodAmountPerDay: toNum(pick(row, "FoodAmountPerDay")),
  totalAmount: toNum(pick(row, "TotalAmount")),
});

// GET /labour-agent-commission/pendings?agentCode=&payPeriodCode=&payTypeCode=
export const getPendings = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const agentCode = toInt(req.query.agentCode);
    const payPeriodCode = toInt(req.query.payPeriodCode);
    const payTypeCode = toInt(req.query.payTypeCode);
    const pool = await getPool(req.headers.subdbname);

    let rows = [];
    if (agentCode > 0 && payPeriodCode > 0 && payTypeCode > 0) {
      const rs = await pool
        .request()
        .input("CompanyCode", sql.Int, cc)
        .input("AgentCode", sql.Int, agentCode)
        .input("PayperiodCode", sql.Int, payPeriodCode)
        .input("PayTypeCode", sql.Int, payTypeCode)
        .execute("sp_LabourAgentCommission_GetPendings");
      rows = (rs.recordset || []).map(mapPendingRow);
    }
    return sendSuccess(res, { rows });
  } catch (err) {
    console.error("DB Error (LabourAgentCommission.getPendings):", err);
    return sendError(res, err);
  }
};

// GET /labour-agent-commission/list  -> sp_LabourAgentCommission_GetAll
export const list = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    const rs = await pool.request().input("CompanyCode", sql.Int, cc).execute("sp_LabourAgentCommission_GetAll");
    const rows = (rs.recordset || []).map((row, i) => {
      const code = toInt(pick(row, "LACCode"));
      return {
        id: code || i + 1,
        lacCode: code,
        lacNo: toInt(pick(row, "LACNo")),
        lacDate: ddmmyyyy(pick(row, "LACDate")),
        agentName: (pick(row, "AgentName") ?? "").toString(),
        payTypeName: (pick(row, "PayTypeName") ?? "").toString(),
        payPeriodName: (pick(row, "PayPeriodName") ?? "").toString(),
        totalPerson: toInt(pick(row, "TotalPerson")),
        totalCommissionAmount: toNum(pick(row, "TotalCommissionAmount")),
        totalFoodAmount: toNum(pick(row, "TotalFoodAmount")),
        remarks: (pick(row, "Remarks") ?? "").toString(),
      };
    });

    return sendSuccess(res, { rows });
  } catch (err) {
    console.error("DB Error (LabourAgentCommission.list):", err);
    return sendError(res, err);
  }
};

// POST /labour-agent-commission/save  -> AddEdit + details (txn)
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
    const isEdit = toInt(b.lacCode) > 0;
    const agentCode = toInt(b.agentCode);
    const payTypeCode = toInt(b.payTypeCode);
    const payPeriodCode = toInt(b.payPeriodCode);
    const rows = Array.isArray(b.rows) ? b.rows : [];

    // validations (mirror btnSave, in order)
    if (agentCode <= 0) return sendError(res, "Select the AgentName......", 400);
    if (payTypeCode <= 0) return sendError(res, "Select the Pay Type......", 400);
    if (payPeriodCode <= 0) return sendError(res, "Select the Pay Period......", 400);
    if (rows.length === 0) return sendError(res, "Enter the Details", 400);

    // totals from the (already selected) rows
    const T = rows.reduce(
      (a, r) => ({
        person: a.person + 1,
        wDays: a.wDays + toNum(r.wDays),
        otHours: a.otHours + toNum(r.otHours),
        otDays: a.otDays + toNum(r.otDays),
        totalDays: a.totalDays + toNum(r.totalDays),
        salary: a.salary + toNum(r.basicSalary),
        commission: a.commission + toNum(r.comAmount),
        food: a.food + toNum(r.foodAmount),
      }),
      { person: 0, wDays: 0, otHours: 0, otDays: 0, totalDays: 0, salary: 0, commission: 0, food: 0 }
    );

    if (T.commission + T.food <= 0)
      return sendError(res, "Check the Agent Commission Amount in Master", 400);

    const pool = await getPool(req.headers.subdbname);
    transaction = pool.transaction();
    await transaction.begin();

    // sp_LabourAgentCommission_AddEdit -> returns LACCode (ExecuteScalar)
    const rq = transaction.request();
    if (isEdit) rq.input("LACCode", sql.Int, toInt(b.lacCode));
    rq.input("LACDate", sql.VarChar(10), ymd(b.lacDate));
    rq.input("LACNo", sql.Int, toInt(b.lacNo));
    rq.input("AgentCode", sql.Int, agentCode);
    rq.input("PayTypeCode", sql.Int, payTypeCode);
    rq.input("PayPeriodCode", sql.Int, payPeriodCode);
    rq.input("TotalPerson", sql.Int, T.person);
    rq.input("TotalWorkingDays", sql.Decimal(18, 2), T.wDays);
    rq.input("TotalOTHours", sql.Decimal(18, 2), T.otHours);
    rq.input("TotalOTDays", sql.Decimal(18, 2), T.otDays);
    rq.input("TotalWDays_OTDays", sql.Decimal(18, 2), T.totalDays);
    rq.input("TotalSalary", sql.Decimal(18, 2), T.salary);
    rq.input("TotalCommissionAmount", sql.Decimal(18, 2), T.commission);
    rq.input("TotalFoodAmount", sql.Decimal(18, 2), T.food);
    rq.input("Remarks", sql.NVarChar, (b.remarks ?? "").toString().trim());
    rq.input("FYCode", sql.Int, fyCode);
    rq.input("CompanyCode", sql.Int, companyCode);
    rq.input("User", sql.Int, parseInt(userId));
    rq.input("Node", sql.Int, parseInt(nodeCode));

    const addRs = await rq.execute("sp_LabourAgentCommission_AddEdit");
    let lacCode = toInt(Object.values((addRs.recordset || [])[0] || {})[0]);
    if (lacCode <= 0 && isEdit) lacCode = toInt(b.lacCode);

    // rewrite details
    await transaction
      .request()
      .input("LACCode", sql.Int, lacCode)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_LabourAgentCommissionDetails_Delete");

    for (const r of rows) {
      await transaction
        .request()
        .input("LACCode", sql.Int, lacCode)
        .input("EmployeeCode", sql.Int, toInt(r.employeeCode))
        .input("DepartmentCode", sql.Int, toInt(r.departmentCode))
        .input("WDays", sql.Decimal(18, 2), toNum(r.wDays))
        .input("OTHours", sql.Decimal(18, 2), toNum(r.otHours))
        .input("OTDays", sql.Decimal(18, 2), toNum(r.otDays))
        .input("WDays_OTDays", sql.Decimal(18, 2), toNum(r.totalDays))
        .input("Salary", sql.Decimal(18, 2), toNum(r.salary))
        .input("BasicSalary", sql.Decimal(18, 2), toNum(r.basicSalary))
        .input("CommissionAmountPerDay", sql.Decimal(18, 2), toNum(r.comPerDay))
        .input("CommissionAmount", sql.Decimal(18, 2), toNum(r.comAmount))
        .input("FoodAmount", sql.Decimal(18, 2), toNum(r.foodAmount))
        .input("FoodAmount_PerDay", sql.Decimal(18, 2), toNum(r.foodAmountPerDay))
        .input("CompanyCode", sql.Int, companyCode)
        .execute("sp_LabourAgentCommissionDetails_Insert");
    }

    await transaction.commit();
    return sendSuccess(
      res,
      { lacCode, lacNo: toInt(b.lacNo) },
      `${isEdit ? "The record is updated" : "The record is Saved"} - Labour Agent Commission No : ${toInt(b.lacNo)}`,
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch {
        /* ignore */
      }
    }
    console.error("DB Error (LabourAgentCommission.save):", err);
    return sendError(res, err);
  }
};

// DELETE /labour-agent-commission/:lacCode  -> sp_LabourAgentCommission_Delete
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const lacCode = toInt(req.params.lacCode);
    if (lacCode <= 0) return sendError(res, "Invalid LACCode", 400);
    const pool = await getPool(req.headers.subdbname);

    try {
      await pool
        .request()
        .input("LACCode", sql.Int, lacCode)
        .input("CompanyCode", sql.Int, cc)
        .execute("sp_LabourAgentCommission_Delete");
    } catch (spErr) {
      if (String(spErr.message || "").includes("FK_"))
        return sendError(res, "You cannot Delete the Labour Agent Commission !", 400);
      throw spErr;
    }
    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    console.error("DB Error (LabourAgentCommission.remove):", err);
    return sendError(res, err);
  }
};
