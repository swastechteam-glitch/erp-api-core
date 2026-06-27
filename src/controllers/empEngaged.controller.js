import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Electrical / Mechanical Engagement (port of WinForms frmMaintenanceEmpEngaged)
//
// Records how many employees of each Department + Maintenance-Designation were
// engaged on a date. Shared by Mechanical ('M') and Electrical ('E'); defaults
// to 'E'. Pass ?serviceType=M to reuse it for the Mechanical menu.
//
//   Lookups : departments (only those that have machines) / designations
//             (carry Salary) / branches
//   List    : sp_MaintenanceEmpEngaged_GetAll (@FyCode,@CompanyCode)
//   One     : header (from GetAll) + vw_MaintenanceEmpEngagedDetails
//   Save    : sp_MaintenanceEmpEngaged_AddEdit (scalar -> code) + details
//             _Delete/_Insert
//   Delete  : sp_MaintenanceEmpEngaged_Delete
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};
const D = (v) => (v ? new Date(v) : null);
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getFYCode = (req) => toInt(req.headers.FYCode);
const getServiceType = (req) =>
  String(req.query.serviceType || req.body?.ServiceType || "E").toUpperCase() === "M" ? "M" : "E";

const scalar = async (request, proc) => {
  const r = await request.execute(proc);
  const row = r.recordset?.[0];
  return row ? toInt(Object.values(row)[0]) : 0;
};

// =========================================================================
// LOOKUPS
// =========================================================================

// GET /emp-engaged/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    const [departments, designations, branches] = await Promise.all([
      pool.request().query(
        "SELECT DepartmentName, DepartmentCode FROM tbl_Department " +
          "WHERE DepartmentCode IN (SELECT DepartmentCode FROM tbl_Machine WHERE Status=1) ORDER BY DepartmentName"
      ),
      pool.request().query("SELECT MaintenanceDesignationCode, DesignationName, Salary FROM tbl_MaintenanceDesignation"),
      pool.request().input("CompanyCode", sql.Int, companyCode)
        .query("SELECT BranchCode, BranchName FROM tbl_Branch WHERE CompanyCode = @CompanyCode ORDER BY BranchName"),
    ]);

    return sendSuccess(res, {
      departments: departments.recordset,
      designations: designations.recordset,
      branches: branches.recordset,
    });
  } catch (err) {
    console.error("DB Error (EmpEngaged.getOptions):", err);
    return sendError(res, err);
  }
};

// =========================================================================
// LIST / ONE
// =========================================================================

// GET /emp-engaged/lists
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("FyCode", sql.Int, getFYCode(req))
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_MaintenanceEmpEngaged_GetAll");
    const data = (r.recordset || [])
      .sort((a, b) => b.MaintenanceEmpEngagedCode - a.MaintenanceEmpEngagedCode)
      .map((x) => ({ ...x, id: x.MaintenanceEmpEngagedCode }));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (EmpEngaged.getList):", err);
    return sendError(res, err);
  }
};

// GET /emp-engaged/list/:code
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (!code) return sendError(res, "Invalid code", 400);
    const pool = await getPool(req.headers.subdbname);
    const head = await pool
      .request()
      .input("FyCode", sql.Int, getFYCode(req))
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_MaintenanceEmpEngaged_GetAll");
    const header = (head.recordset || []).find((r) => r.MaintenanceEmpEngagedCode === code);
    if (!header) return sendError(res, "Engagement not found", 404);
    const det = await pool
      .request()
      .input("MaintenanceEmpEngagedCode", sql.Int, code)
      .query("SELECT * FROM vw_MaintenanceEmpEngagedDetails WHERE MaintenanceEmpEngagedCode = @MaintenanceEmpEngagedCode");
    return sendSuccess(res, { ...header, details: det.recordset || [] });
  } catch (err) {
    console.error("DB Error (EmpEngaged.getById):", err);
    return sendError(res, err);
  }
};

// =========================================================================
// SAVE
// =========================================================================
const saveOrUpdate = async (req, res, isEdit) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    const companyCode = getCompanyCode(req);
    const fyCode = getFYCode(req);
    const serviceType = getServiceType(req);
    if (!userId || !nodeCode) return sendError(res, "Missing user context (userId / nodeCode)", 400);
    if (!companyCode) return sendError(res, "Missing company context", 400);

    const b = req.body || {};
    const branchCode = toInt(b.BranchCode);
    const engagedDate = D(b.EngagedDate) || new Date();
    const rows = (Array.isArray(b.details) ? b.details : []).filter(
      (d) => toInt(d.DepartmentCode) > 0 && toInt(d.MaintenanceDesignationCode ?? d.DesignationCode) > 0
    );

    // Validation — mirrors the WinForms btnSave.
    if (!rows.length) return sendError(res, "Enter the Details", 400);
    if (!branchCode) return sendError(res, "Select the Branch", 400);

    const totalEmployees = rows.reduce((s, d) => s + toNum(d.NoOfEmployees ?? d.NoOfEmployee), 0);

    const code = isEdit ? toInt(req.params.code ?? b.MaintenanceEmpEngagedCode) : 0;
    if (isEdit && !code) return sendError(res, "Invalid code for update", 400);

    const pool = await getPool(req.headers.subdbname);
    tx = new sql.Transaction(pool);
    await tx.begin();

    const head = new sql.Request(tx);
    if (code) head.input("MaintenanceEmpEngagedCode", sql.Int, code);
    head.input("BranchCode", sql.Int, branchCode);
    head.input("EngagedDate", sql.DateTime, engagedDate);
    head.input("TotalEmployees", sql.Decimal(18, 2), totalEmployees);
    head.input("ServiceType", sql.NVarChar, serviceType);
    head.input("CompanyCode", sql.Int, companyCode);
    head.input("FYCode", sql.Int, fyCode);
    head.input("User", sql.Int, toInt(userId));
    head.input("Node", sql.Int, toInt(nodeCode));
    const engagedCode = await scalar(head, "sp_MaintenanceEmpEngaged_AddEdit");

    await new sql.Request(tx)
      .input("MaintenanceEmpEngagedCode", sql.Int, engagedCode)
      .execute("sp_MaintenanceEmpEngagedDetails_Delete");

    for (const d of rows) {
      await new sql.Request(tx)
        .input("MaintenanceEmpEngagedCode", sql.Int, engagedCode)
        .input("DepartmentCode", sql.Int, toInt(d.DepartmentCode))
        .input("MaintenanceDesignationCode", sql.Int, toInt(d.MaintenanceDesignationCode ?? d.DesignationCode))
        .input("Salary", sql.Decimal(18, 2), toNum(d.Salary))
        .input("NoOfEmployees", sql.Decimal(18, 2), toNum(d.NoOfEmployees ?? d.NoOfEmployee))
        .execute("sp_MaintenanceEmpEngagedDetails_Insert");
    }

    await tx.commit();
    return sendSuccess(
      res,
      { MaintenanceEmpEngagedCode: engagedCode },
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (tx) {
      try {
        await tx.rollback();
      } catch (_) {}
    }
    if (err.message && err.message.includes("FK_")) return sendError(res, "Please Check the Entry", 409);
    console.error("DB Error (EmpEngaged.saveOrUpdate):", err);
    return sendError(res, err);
  }
};

export const create = (req, res) => saveOrUpdate(req, res, false);
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /emp-engaged/delete/:code
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (!code) return sendError(res, "Invalid code", 400);
    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("MaintenanceEmpEngagedCode", sql.Int, code)
      .execute("sp_MaintenanceEmpEngaged_Delete");
    return sendSuccess(res, { MaintenanceEmpEngagedCode: code }, "The record is deleted");
  } catch (err) {
    if (err.message && err.message.includes("FK_")) return sendError(res, "You cannot delete this Engagement", 409);
    console.error("DB Error (EmpEngaged.remove):", err);
    return sendError(res, err);
  }
};
