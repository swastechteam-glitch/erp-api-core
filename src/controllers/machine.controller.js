import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Machine master (port of the WinForms frmMachine) — 3 tabs.
//   - List       : EXEC sp_Machine_GetAll @CompanyCode
//   - Read       : vw_Machine + vw_MachineDetails (specifications grid)
//   - Dropdowns  : departments, machine-types, machine-makes, branches,
//                  main-machines (filtered, optional ?departmentCode=)
//   - Save       : sp_Machine_AddEdit (scalar -> MachineCode) +
//                  sp_MachineDetails_Delete + sp_MachineDetails_Insert (per spec),
//                  in a transaction
//   - Delete     : EXEC sp_Machine_Delete @MachineCode @CompanyCode
// AddEdit needs @CompanyCode/@User/@Node from the auth token (headers).
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

const toBit = (v) => {
  if (v === true || v === 1 || v === "1") return 1;
  if (typeof v === "string" && v.trim().toUpperCase() === "ACTIVE") return 1;
  return 0;
};
const toDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

// GET /machine/lists  -> EXEC sp_Machine_GetAll @CompanyCode
export const getMachineList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const companyCode = parseInt(req.headers.companyCode);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_Machine_GetAll");

    const data = result.recordset
      .sort((a, b) => b.MachineCode - a.MachineCode)
      .map((item) => ({
        ...item,
        id: item.MachineCode,
        StatusText: STATUS_LABEL(item.Status),
      }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getMachineList):", err);
    return sendError(res, err);
  }
};

// GET /machine/list/:machineCode  -> single record (+ specifications)
export const getMachineById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.machineCode);
    if (!code) return sendError(res, "Invalid MachineCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const head = await pool
      .request()
      .input("MachineCode", sql.Int, code)
      .query("Select * from vw_Machine where MachineCode = @MachineCode");

    if (!head.recordset.length)
      return sendError(res, "Machine not found", 404);

    // Specifications grid (best-effort — view may be absent on some DBs).
    let specifications = [];
    try {
      const det = await pool
        .request()
        .input("MachineCode", sql.Int, code)
        .query(
          "Select * from vw_MachineDetails where MachineCode = @MachineCode"
        );
      specifications = det.recordset;
    } catch (detErr) {
      console.warn("vw_MachineDetails unavailable:", detErr.message);
    }

    const row = head.recordset[0];
    return sendSuccess(res, {
      ...row,
      StatusText: STATUS_LABEL(row.Status),
      specifications,
    });
  } catch (err) {
    console.error("DB Error (getMachineById):", err);
    return sendError(res, err);
  }
};

// -------- Dropdown sources ------------------------------------------------
const runDropdown = async (req, res, query, label) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().query(query);
    return sendSuccess(res, result.recordset);
  } catch (err) {
    console.error(`DB Error (${label}):`, err);
    return sendError(res, err);
  }
};

// GET /machine/departments
export const getDepartmentsDropdown = (req, res) =>
  runDropdown(
    req,
    res,
    "SELECT DepartmentCode, DepartmentName_English FROM tbl_Department Where Status = 1 Order by DepartmentName_English",
    "getDepartmentsDropdown"
  );

// GET /machine/machine-types
export const getMachineTypesDropdown = (req, res) =>
  runDropdown(
    req,
    res,
    "SELECT MachineTypeCode, MachineTypeName FROM tbl_MachineType Where Status = 1 Order by MachineTypeName",
    "getMachineTypesDropdown"
  );

// GET /machine/machine-makes
export const getMachineMakesDropdown = (req, res) =>
  runDropdown(
    req,
    res,
    "SELECT MachineMakeCode, MachineMakeName FROM tbl_MachineMake Where Status = 1 Order by MachineMakeName",
    "getMachineMakesDropdown"
  );

// GET /machine/branches
export const getBranchesDropdown = (req, res) =>
  runDropdown(
    req,
    res,
    "SELECT BranchCode, BranchName from tbl_Branch Order by BranchName",
    "getBranchesDropdown"
  );

// GET /machine/main-machines?departmentCode=  (motor mapping source)
export const getMainMachinesDropdown = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const departmentCode = parseInt(req.query.departmentCode) || 0;
    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    let query =
      "SELECT MachineCode, MachineName, DepartmentCode, BranchCode, MainMachineCode FROM vw_Machine Where Status = 1 AND MachineTypeName NOT LIKE '%MOTOR%'";
    if (departmentCode > 0) {
      request.input("DepartmentCode", sql.Int, departmentCode);
      query += " AND DepartmentCode = @DepartmentCode";
    }
    query += " order by MachineName";

    const result = await request.query(query);
    return sendSuccess(res, result.recordset);
  } catch (err) {
    console.error("DB Error (getMainMachinesDropdown):", err);
    return sendError(res, err);
  }
};

// -------- Save (create / update) -----------------------------------------
const saveOrUpdateMachine = async (req, res, isEdit) => {
  let transaction;
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    const companyCode = req.headers.companyCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);
    if (!companyCode)
      return sendError(res, "Missing company context (companyCode)", 400);

    const b = req.body || {};
    const machineName = (b.MachineName || "").trim();
    const departmentCode = parseInt(b.DepartmentCode);
    const machineTypeCode = parseInt(b.MachineTypeCode);
    const machineMakeCode = parseInt(b.MachineMakeCode);
    const branchCode = parseInt(b.BranchCode);
    const machineSortOrder = (b.MachineSortOrderNo ?? b.MachineSortOrder ?? "")
      .toString()
      .trim();

    // Validation mirrors btnSave_Click.
    if (!machineName) return sendError(res, "Enter the Machine Name", 400);
    if (!departmentCode || departmentCode <= 0)
      return sendError(res, "Select the Department", 400);
    if (!machineTypeCode || machineTypeCode <= 0)
      return sendError(res, "Select the Machine Type", 400);
    if (!machineMakeCode || machineMakeCode <= 0)
      return sendError(res, "Select the Machine Make", 400);
    if (!branchCode || branchCode <= 0)
      return sendError(res, "Select the Branch", 400);
    if (!machineSortOrder)
      return sendError(res, "Enter the Machine Sort Order", 400);

    const code = isEdit
      ? parseInt(req.params.machineCode ?? b.MachineCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid MachineCode for update", 400);

    // Normalise specifications -> array of strings.
    const specs = Array.isArray(b.specifications || b.Specifications)
      ? (b.specifications || b.Specifications)
          .map((s) => (typeof s === "string" ? s : s?.Spcification || s?.Specification || ""))
          .map((s) => (s || "").trim())
          .filter(Boolean)
      : [];

    const pool = await getPool(req.headers.subdbname);
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // 1) sp_Machine_AddEdit -> MachineCode (ExecuteScalar in VB).
    const reqM = new sql.Request(transaction);
    if (isEdit) reqM.input("MachineCode", sql.Int, code);
    reqM.input("MachineName", sql.NVarChar, machineName);
    reqM.input("MachineNo", sql.NVarChar, (b.MachineNo || "").toString().trim());
    reqM.input("MachineTypeCode", sql.Int, machineTypeCode);
    reqM.input("MachineMakeCode", sql.Int, machineMakeCode);
    reqM.input("MachineModel", sql.NVarChar, (b.MachineModel || "").trim());
    reqM.input("MachineSerialNo", sql.NVarChar, (b.MachineSerialNo || "").trim());
    reqM.input("ManufactureYear", sql.NVarChar, (b.ManufactureYear || "").toString().trim());
    reqM.input("BaseUnit", sql.Decimal(18, 2), parseFloat(b.BaseUnit) || 0);
    reqM.input("StandardUnits", sql.Decimal(18, 2), parseFloat(b.StandardUnits) || 0);
    reqM.input("DepartmentCode", sql.Int, departmentCode);
    reqM.input("NoOfSpindles", sql.Int, parseInt(b.NoOfSpindles) || 0);
    reqM.input("CommissioningCompanyName", sql.NVarChar, (b.CommissioningCompanyName || "").trim());
    reqM.input("ErrectorName", sql.NVarChar, (b.ErrectorName || "").trim());
    reqM.input("Address", sql.NVarChar, (b.Address || "").trim());
    reqM.input("ContactNo", sql.NVarChar, (b.ContactNo || "").toString().trim());
    reqM.input("DateOfInstallationFrom", sql.DateTime, toDate(b.DateOfInstallationFrom));
    reqM.input("DateOfInstallationTo", sql.DateTime, toDate(b.DateOfInstallationTo));
    reqM.input("DateOfCommissioning", sql.DateTime, toDate(b.DateOfCommissioning));
    reqM.input("MachineSortOrderNo", sql.Int, parseInt(machineSortOrder) || 0);
    reqM.input("BranchCode", sql.Int, branchCode);
    reqM.input("Line", sql.NVarChar, (b.Line || "").toString().trim());
    reqM.input("CompanyCode", sql.Int, parseInt(companyCode));
    reqM.input("User", sql.Int, parseInt(userId));
    reqM.input("Node", sql.Int, parseInt(nodeCode));
    reqM.input("Speed", sql.NVarChar, (b.Speed || "").toString().trim());
    const mainMachineCode = parseInt(b.MainMachineCode);
    if (mainMachineCode > 0)
      reqM.input("MainMachineCode", sql.Int, mainMachineCode);
    reqM.input("Status", sql.Bit, toBit(b.Status));

    const addEditResult = await reqM.execute("sp_Machine_AddEdit");
    const scalarRow = addEditResult.recordset && addEditResult.recordset[0];
    const newMachineCode = isEdit
      ? code
      : scalarRow
      ? Object.values(scalarRow)[0]
      : null;

    // 2) refresh specifications.
    if (newMachineCode && specs.length) {
      await new sql.Request(transaction)
        .input("MachineCode", sql.Int, parseInt(newMachineCode))
        .execute("sp_MachineDetails_Delete");

      for (const spec of specs) {
        await new sql.Request(transaction)
          .input("MachineCode", sql.Int, parseInt(newMachineCode))
          .input("Spcification", sql.NVarChar, spec)
          .execute("sp_MachineDetails_Insert");
      }
    }

    await transaction.commit();

    return sendSuccess(
      res,
      { MachineCode: newMachineCode },
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (_) {
        /* ignore */
      }
    }
    if (err.message && err.message.includes("UK_tbl_Machine")) {
      return sendError(res, "Machine Name Already Exists!", 409);
    }
    console.error("DB Error (saveOrUpdateMachine):", err);
    return sendError(res, err);
  }
};

// POST /machine/create        -> create
export const createMachine = (req, res) => saveOrUpdateMachine(req, res, false);

// PUT  /machine/update/:code  -> update
export const updateMachine = (req, res) => saveOrUpdateMachine(req, res, true);

// DELETE /machine/delete/:machineCode -> EXEC sp_Machine_Delete
export const deleteMachine = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.machineCode);
    if (!code) return sendError(res, "Invalid MachineCode", 400);

    const companyCode = parseInt(req.headers.companyCode);
    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("MachineCode", sql.Int, code)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_Machine_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the Machine!", 409);
    }
    console.error("DB Error (deleteMachine):", err);
    return sendError(res, err);
  }
};
