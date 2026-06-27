import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Production Employee Engaged Entry
//   (port of WinForms frmProdnEmpEngaged / frmProdnEmpEngagedDetails)
//
//   Header (Engaged Date / Shift / Branch) + one typed row per Department +
//   Designation: pick Department + Designation (autofills the designation's
//   Salary) + No.Of Employee. Footer totals (Total Employees = sum NoOfEmployee,
//   Total Salary = sum Salary) summed live; only Total Employees is persisted on
//   the header. "Per Load" pulls the previous day's engagement grid for the same
//   Branch + Shift (sp_Prodn_EmpEng_PerviousGrid).
//
//   Save is one transaction: header AddEdit (ExecuteScalar -> ProdnEmpEngagedCode)
//   -> details Delete -> per-row Insert. company + FY scoped, @User/@Node.
//   FK error -> friendly "Please Check the Entry" 409.
// ---------------------------------------------------------------------------

const toInt = (v) => parseInt(v) || 0;
const toNum = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const D = (v) => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; };

const scalar = async (request, proc) => {
  const r = await request.execute(proc);
  const row = r.recordset && r.recordset[0];
  return row ? row[Object.keys(row)[0]] : undefined;
};

// GET /prodn-emp-engaged/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = toInt(req.headers.companyCode);
    const pool = await getPool(req.headers.subdbname);

    const [shifts, branches, departments, designations] = await Promise.all([
      pool.request().query(`select ShiftNo, ShiftName, ShiftCode, WorkingMins from tbl_Shift where CompanyCode = ${companyCode} AND ShiftCode in (1,2,3,4,5,6,7) Order by ShiftNo`),
      pool.request().query(`SELECT BranchCode, BranchName from tbl_Branch Where CompanyCode = ${companyCode} Order by BranchName`),
      pool.request().query("Select DepartmentName, ShortName, OrderNo, DepartmentCode from tbl_Department where DepartmentCode in (Select Distinct(DepartmentCode) from tbl_Employee where Status = 1) Order bY OrderNo"),
      pool.request().query("Select DesignationName, Salary, ProdnDesignationCode from tbl_Prodn_Designation Order By DesignationName"),
    ]);

    return sendSuccess(res, {
      shifts: shifts.recordset.map((r) => ({ value: r.ShiftCode, label: r.ShiftName })),
      branches: branches.recordset.map((r) => ({ value: r.BranchCode, label: r.BranchName })),
      departments: departments.recordset.map((r) => ({ value: r.DepartmentCode, label: r.DepartmentName })),
      designations: designations.recordset.map((r) => ({ value: r.ProdnDesignationCode, label: r.DesignationName, salary: r.Salary })),
    });
  } catch (err) {
    console.error("DB Error (getOptions prodn-emp-engaged):", err);
    return sendError(res, err);
  }
};

// GET /prodn-emp-engaged/per-load?branchCode=&shiftCode=
export const getPerLoad = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = toInt(req.headers.companyCode);
    const branchCode = toInt(req.query.branchCode);
    const shiftCode = toInt(req.query.shiftCode);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request().input("CompanyCode", sql.Int, companyCode);
    if (branchCode > 0) request.input("BranchCode", sql.Int, branchCode);
    if (shiftCode > 0) request.input("ShiftCode", sql.Int, shiftCode);
    const result = await request.execute("sp_Prodn_EmpEng_PerviousGrid");

    const rows = (result.recordset || []).map((d) => ({
      DepartmentCode: d.DepartmentCode, DepartmentName: d.DepartmentName,
      ProdnDesignationCode: d.ProdnDesignationCode, DesignationName: d.DesignationName,
      Salary: toNum(d.Salary), NoOfEmployees: toNum(d.NoOfEmployees),
    }));
    return sendSuccess(res, rows);
  } catch (err) {
    console.error("DB Error (getPerLoad prodn-emp-engaged):", err);
    return sendError(res, err);
  }
};

// GET /prodn-emp-engaged/lists
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = toInt(req.headers.companyCode);
    const fyCode = toInt(req.headers.FYCode);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("FyCode", sql.Int, fyCode)
      .execute("sp_Prodn_EmpEngaged_GetAll");
    const data = result.recordset.map((item) => ({ ...item, id: item.ProdnEmpEngagedCode }));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getList prodn-emp-engaged):", err);
    return sendError(res, err);
  }
};

// GET /prodn-emp-engaged/list/:code
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = toInt(req.headers.companyCode);
    const fyCode = toInt(req.headers.FYCode);
    const code = toInt(req.params.code);
    if (!code) return sendError(res, "Invalid ProdnEmpEngagedCode", 400);

    const pool = await getPool(req.headers.subdbname);

    // Header from the GetAll list (VB reads the row passed from the grid).
    const headRes = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("FyCode", sql.Int, fyCode)
      .execute("sp_Prodn_EmpEngaged_GetAll");
    const h = (headRes.recordset || []).find((r) => toInt(r.ProdnEmpEngagedCode) === code);
    if (!h) return sendError(res, "Production Employee Engaged not found", 404);

    const header = {
      ProdnEmpEngagedCode: h.ProdnEmpEngagedCode, EngagedDate: h.EngagedDate,
      BranchCode: h.BranchCode, ShiftCode: h.ShiftCode,
    };

    const detRes = await pool
      .request()
      .input("ProdnEmpEngagedCode", sql.Int, code)
      .query("Select * from vw_Prodn_EmpEngagedDetails Where ProdnEmpEngagedCode = @ProdnEmpEngagedCode");
    const details = (detRes.recordset || []).map((d) => ({
      DepartmentCode: d.DepartmentCode, DepartmentName: d.DepartmentName,
      ProdnDesignationCode: d.ProdnDesignationCode, DesignationName: d.DesignationName,
      Salary: toNum(d.Salary), NoOfEmployees: toNum(d.NoOfEmployees),
    }));

    return sendSuccess(res, { header, details });
  } catch (err) {
    console.error("DB Error (getById prodn-emp-engaged):", err);
    return sendError(res, err);
  }
};

const saveOrUpdate = async (req, res, isEdit) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = toInt(req.headers.companyCode);
    const fyCode = toInt(req.headers.FYCode);
    const userId = toInt(req.headers.userId);
    const nodeCode = toInt(req.headers.nodeCode);

    const body = req.body || {};
    const branchCode = toInt(body.BranchCode);
    const shiftCode = toInt(body.ShiftCode);
    const engagedDate = D(body.EngagedDate);
    const details = Array.isArray(body.details) ? body.details : [];

    if (!shiftCode) return sendError(res, "Select the Shift", 400);
    if (branchCode <= 0) return sendError(res, "Select the Branch", 400);
    if (!details.length) return sendError(res, "Enter the Details", 400);

    const computed = details
      .filter((d) => toInt(d.DepartmentCode) > 0 && toInt(d.ProdnDesignationCode) > 0)
      .map((d) => ({
        departmentCode: toInt(d.DepartmentCode),
        prodnDesignationCode: toInt(d.ProdnDesignationCode),
        salary: toNum(d.Salary),
        noOfEmployees: toNum(d.NoOfEmployees),
      }));
    if (!computed.length) return sendError(res, "Enter the Details", 400);

    const totalEmployees = r2(computed.reduce((a, r) => a + r.noOfEmployees, 0));

    const editCode = isEdit ? toInt(req.params.code) : 0;
    if (isEdit && !editCode) return sendError(res, "Invalid ProdnEmpEngagedCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    tx = new sql.Transaction(pool);
    await tx.begin();

    // Header AddEdit -> ProdnEmpEngagedCode
    const hReq = new sql.Request(tx);
    if (isEdit) hReq.input("ProdnEmpEngagedCode", sql.Int, editCode);
    hReq.input("BranchCode", sql.Int, branchCode);
    hReq.input("EngagedDate", sql.DateTime, engagedDate);
    hReq.input("TotalEmployees", sql.Decimal(18, 2), totalEmployees);
    hReq.input("ShiftCode", sql.Int, shiftCode);
    hReq.input("CompanyCode", sql.Int, companyCode);
    hReq.input("FYCode", sql.Int, fyCode);
    hReq.input("User", sql.Int, userId);
    hReq.input("Node", sql.Int, nodeCode);
    const engagedCode = await scalar(hReq, "sp_Prodn_EmpEngaged_AddEdit");
    if (!engagedCode) throw new Error("Header save returned no ProdnEmpEngagedCode");

    // Details: delete then per-row insert.
    await new sql.Request(tx).input("ProdnEmpEngagedCode", sql.Int, engagedCode).execute("sp_Prodn_EmpEngagedDetails_Delete");

    for (const c of computed) {
      const dr = new sql.Request(tx);
      dr.input("ProdnEmpEngagedCode", sql.Int, engagedCode);
      dr.input("DepartmentCode", sql.Int, c.departmentCode);
      dr.input("ProdnDesignationCode", sql.Int, c.prodnDesignationCode);
      dr.input("Salary", sql.Decimal(18, 2), c.salary);
      dr.input("NoOfEmployees", sql.Decimal(18, 2), c.noOfEmployees);
      await dr.execute("sp_Prodn_EmpEngagedDetails_Insert");
    }

    await tx.commit();
    return sendSuccess(res, { ProdnEmpEngagedCode: engagedCode }, isEdit ? "The record is updated" : "The record is saved", isEdit ? 200 : 201);
  } catch (err) {
    if (tx) { try { await tx.rollback(); } catch (_) {} }
    if (err.message && err.message.includes("FK_")) {
      return sendError(res, "Please Check the Entry", 409);
    }
    console.error("DB Error (saveOrUpdate prodn-emp-engaged):", err);
    return sendError(res, err);
  }
};

// POST /prodn-emp-engaged/create
export const create = (req, res) => saveOrUpdate(req, res, false);
// PUT  /prodn-emp-engaged/update/:code
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /prodn-emp-engaged/delete/:code
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (!code) return sendError(res, "Invalid ProdnEmpEngagedCode", 400);
    const pool = await getPool(req.headers.subdbname);
    await pool.request().input("ProdnEmpEngagedCode", sql.Int, code).execute("sp_Prodn_EmpEngaged_Delete");
    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("REFERENCE") || err.message.includes("FK_"))) {
      return sendError(res, "You can not delete this record!", 409);
    }
    console.error("DB Error (remove prodn-emp-engaged):", err);
    return sendError(res, err);
  }
};
