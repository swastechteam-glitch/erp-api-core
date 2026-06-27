import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Maintenance Buffing (port of WinForms frmMaintenanceBuffing / ...Details)
//
// Single-table header-only entry (Mechanical only): Buffing Date, Branch,
// Department, Machine, Dia Name, Dia, Duration. When Machine + Dia are both
// chosen the screen shows the Last Buffing Date for that pair (reference only).
//
//   Lookups : branches / departments / dias / machines
//   LastDate: sp_MaintenanceBuffing_LastDate (@MachineCode, @DiaCode)
//   List    : sp_MaintenanceBuffing_GetAll
//   One     : header (from GetAll, by BuffingCode)
//   Save    : sp_MaintenanceBuffing_AddEdit          (ExecuteNonQuery)
//   Delete  : sp_MaintenanceBuffing_Delete
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

// =========================================================================
// LOOKUPS
// =========================================================================

// GET /maintenance-buffing/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    const [branches, departments, dias] = await Promise.all([
      pool.request().input("CompanyCode", sql.Int, companyCode)
        .query("SELECT BranchCode, BranchName FROM tbl_Branch WHERE CompanyCode = @CompanyCode ORDER BY BranchName"),
      pool.request().query("SELECT DepartmentCode, DepartmentName FROM tbl_Department ORDER BY DepartmentName"),
      pool.request().query("SELECT DiaCode, DiaName FROM tbl_Dia"),
    ]);

    return sendSuccess(res, {
      branches: branches.recordset,
      departments: departments.recordset,
      dias: dias.recordset,
    });
  } catch (err) {
    console.error("DB Error (MaintenanceBuffing.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /maintenance-buffing/machines?branchCode=&departmentCode=
export const getMachines = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const branchCode = toInt(req.query.branchCode);
    const departmentCode = toInt(req.query.departmentCode);

    let where = "Status = 1 AND MachineTypeCode = 1 AND CompanyCode = @CompanyCode";
    if (branchCode) where += " AND BranchCode = @BranchCode";
    if (departmentCode) where += " AND DepartmentCode = @DepartmentCode";

    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("BranchCode", sql.Int, branchCode)
      .input("DepartmentCode", sql.Int, departmentCode)
      .query(`SELECT MachineCode, MachineName, BranchCode, DepartmentCode FROM tbl_Machine WHERE ${where} ORDER BY MachineName`);
    return sendSuccess(res, r.recordset);
  } catch (err) {
    console.error("DB Error (MaintenanceBuffing.getMachines):", err);
    return sendError(res, err);
  }
};

// GET /maintenance-buffing/last-date?machineCode=&diaCode=
export const getLastDate = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const machineCode = toInt(req.query.machineCode);
    const diaCode = toInt(req.query.diaCode);
    if (!machineCode || !diaCode) return sendSuccess(res, { buffingDate: null });
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("MachineCode", sql.Int, machineCode)
      .input("DiaCode", sql.Int, diaCode)
      .execute("sp_MaintenanceBuffing_LastDate");
    return sendSuccess(res, { buffingDate: r.recordset?.[0]?.BuffingDate || null });
  } catch (err) {
    console.error("DB Error (MaintenanceBuffing.getLastDate):", err);
    return sendError(res, err);
  }
};

// =========================================================================
// LIST / ONE
// =========================================================================

// GET /maintenance-buffing/lists
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_MaintenanceBuffing_GetAll");
    const data = (r.recordset || [])
      .sort((a, b) => b.BuffingCode - a.BuffingCode)
      .map((x) => ({ ...x, id: x.BuffingCode }));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (MaintenanceBuffing.getList):", err);
    return sendError(res, err);
  }
};

// GET /maintenance-buffing/list/:code
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (!code) return sendError(res, "Invalid code", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_MaintenanceBuffing_GetAll");
    const row = (r.recordset || []).find((x) => x.BuffingCode === code);
    if (!row) return sendError(res, "Buffing not found", 404);
    return sendSuccess(res, row);
  } catch (err) {
    console.error("DB Error (MaintenanceBuffing.getById):", err);
    return sendError(res, err);
  }
};

// =========================================================================
// SAVE
// =========================================================================
const saveOrUpdate = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode) return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const b = req.body || {};
    const branchCode = toInt(b.BranchCode);
    const departmentCode = toInt(b.DepartmentCode);
    const machineCode = toInt(b.MachineCode);
    const diaCode = toInt(b.DiaCode);
    const dia = toNum(b.Dia);
    const duration = toNum(b.Duration);
    const buffingDate = D(b.BuffingDate) || new Date();

    // Validation — mirrors the WinForms btnSave_Click.
    if (!branchCode) return sendError(res, "Select the Branch Name", 400);
    if (!departmentCode) return sendError(res, "Select the Department Name", 400);
    if (!machineCode) return sendError(res, "Select the Machine Name", 400);
    if (!diaCode) return sendError(res, "Select the Dia Name", 400);
    if (dia <= 0) return sendError(res, "Please Check the Dia", 400);
    if (duration <= 0) return sendError(res, "Please Check the Duration Days", 400);

    const code = isEdit ? toInt(req.params.code ?? b.BuffingCode) : 0;
    if (isEdit && !code) return sendError(res, "Invalid code for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool
      .request()
      .input("BuffingDate", sql.DateTime, buffingDate)
      .input("MachineCode", sql.Int, machineCode)
      .input("BranchCode", sql.Int, branchCode)
      .input("DepartmentCode", sql.Int, departmentCode)
      .input("DiaCode", sql.Int, diaCode)
      .input("Dia", sql.NVarChar, (b.Dia ?? "").toString().trim())
      .input("Duration", sql.Decimal(18, 0), duration)
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("User", sql.Int, toInt(userId))
      .input("Node", sql.Int, toInt(nodeCode));
    if (code) request.input("BuffingCode", sql.Int, code);

    await request.execute("sp_MaintenanceBuffing_AddEdit");
    return sendSuccess(
      res,
      { BuffingCode: code || null },
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    console.error("DB Error (MaintenanceBuffing.saveOrUpdate):", err);
    return sendError(res, err);
  }
};

export const create = (req, res) => saveOrUpdate(req, res, false);
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /maintenance-buffing/delete/:code
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (!code) return sendError(res, "Invalid code", 400);
    const pool = await getPool(req.headers.subdbname);
    await pool.request().input("BuffingCode", sql.Int, code).execute("sp_MaintenanceBuffing_Delete");
    return sendSuccess(res, { BuffingCode: code }, "The record is deleted");
  } catch (err) {
    if (err.message && err.message.includes("FK_")) return sendError(res, "You cannot delete this Buffing", 409);
    console.error("DB Error (MaintenanceBuffing.remove):", err);
    return sendError(res, err);
  }
};
