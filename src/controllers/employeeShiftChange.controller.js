import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Employee Shift Group Change (port of the WinForms frmEmployeeShiftGroupChange)
//
//   A per-employee transaction screen, NOT a CRUD master: pick an Employee, see
//   their shift-group-change history, then log a new change. Saving runs
//   sp_Employee_ShiftGroup_Update; when "Permanent Change" (chkMasterUpdate) is
//   ticked the desktop also writes the new values back onto tbl_Employee. Both
//   run inside one transaction here (the desktop did the master update right
//   after the commit — we fold it into the same transaction for safety).
//
//   Lookups (all company-scoped where the desktop scoped them):
//     employees    vw_Employee_New (carries the employee's CURRENT shift group /
//                  shift / dept / designation / batch so the form auto-fills)
//     shiftGroups  tbl_ShiftGroup (+ Rotation, used for the permanent update)
//     departments  tbl_Department  (Status = 1)
//     designations tbl_Designation (Status = 1)
//     batches      tbl_EmployeeBatch (Status = 1, order SerialNo)
//     shifts       tbl_Shift filtered by CompanyCode + ShiftGroupCode (dependent)
//     history      vw_Employee_ShiftGroup_Change for one employee
//
//   user / node read from the auth token; company from req.headers.companyCode.
//
//   Endpoints
//     GET  /options                    all lookups (incl. employees w/ current values)
//     GET  /shifts/:shiftGroupCode     shifts for a shift group
//     GET  /history/:employeeCode      that employee's change history
//     POST /save                       sp_Employee_ShiftGroup_Update (+optional master update)
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const ymd = (v) => {
  if (!v) return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
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

// GET /employee-shift-change/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    const [shiftGroups, departments, designations, batches, employees] = await Promise.all([
      pool
        .request()
        .query("Select ShiftGroupCode, ShiftGroupName, Rotation from tbl_ShiftGroup Order by ShiftGroupName"),
      pool
        .request()
        .query(
          "Select DepartmentCode, DepartmentName_English from tbl_Department where Status = 1 Order by DepartmentName_English"
        ),
      pool
        .request()
        .query("Select DesignationCode, DesignationName from tbl_Designation where Status = 1 Order by DesignationName"),
      pool
        .request()
        .query("SELECT EmployeeBatchCode, EmployeeBatchName FROM tbl_EmployeeBatch WHERE Status = 1 ORDER BY SerialNo"),
      pool
        .request()
        .input("CompanyCode", sql.Int, cc)
        .query(
          "Select EmployeeCode, EmployeeName, ShiftGroupCode, ShiftCode, str_EmployeeID, DepartmentCode, DesignationCode, EmployeeBatchCode from vw_Employee_New where CompanyCode = @CompanyCode Order By EmployeeID"
        ),
    ]);

    return sendSuccess(res, {
      shiftGroups: (shiftGroups.recordset || []).map((x) => ({
        value: toInt(pick(x, "ShiftGroupCode")),
        label: pick(x, "ShiftGroupName") ?? "",
        Rotation: toInt(pick(x, "Rotation")),
      })),
      departments: (departments.recordset || []).map((x) => ({
        value: toInt(pick(x, "DepartmentCode")),
        label: pick(x, "DepartmentName_English", "DepartmentName") ?? "",
      })),
      designations: (designations.recordset || []).map((x) => ({
        value: toInt(pick(x, "DesignationCode")),
        label: pick(x, "DesignationName") ?? "",
      })),
      batches: (batches.recordset || []).map((x) => ({
        value: toInt(pick(x, "EmployeeBatchCode")),
        label: pick(x, "EmployeeBatchName") ?? "",
      })),
      employees: (employees.recordset || []).map((x) => ({
        value: toInt(pick(x, "EmployeeCode")),
        label: pick(x, "str_EmployeeID") ?? "",
        EmployeeName: (pick(x, "EmployeeName") ?? "").toString().trim(),
        ShiftGroupCode: toInt(pick(x, "ShiftGroupCode")),
        ShiftCode: toInt(pick(x, "ShiftCode")),
        DepartmentCode: toInt(pick(x, "DepartmentCode")),
        DesignationCode: toInt(pick(x, "DesignationCode")),
        EmployeeBatchCode: toInt(pick(x, "EmployeeBatchCode")),
      })),
    });
  } catch (err) {
    console.error("DB Error (EmployeeShiftChange.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /employee-shift-change/shifts/:shiftGroupCode  -> shifts for the chosen group
export const getShifts = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const shiftGroupCode = toInt(req.params.shiftGroupCode);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, cc)
      .input("ShiftGroupCode", sql.Int, shiftGroupCode)
      .query(
        "SELECT ShiftCode, ShiftName FROM tbl_Shift Where CompanyCode = @CompanyCode AND ShiftGroupCode = @ShiftGroupCode Order by ShiftName"
      );
    return sendSuccess(
      res,
      (r.recordset || []).map((x) => ({
        value: toInt(pick(x, "ShiftCode")),
        label: pick(x, "ShiftName") ?? "",
      }))
    );
  } catch (err) {
    console.error("DB Error (EmployeeShiftChange.getShifts):", err);
    return sendError(res, err);
  }
};

// GET /employee-shift-change/history/:employeeCode  -> the employee's change history
export const getHistory = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const employeeCode = toInt(req.params.employeeCode);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("EmployeeCode", sql.Int, employeeCode)
      .query(
        "Select * from vw_Employee_ShiftGroup_Change where EmployeeCode = @EmployeeCode Order by ShiftGroupChangeDate DESC"
      );
    const data = (r.recordset || []).map((row, i) => ({
      id: i + 1,
      ShiftGroupChangeDate: ymd(pick(row, "ShiftGroupChangeDate")),
      ShiftGroupName: pick(row, "ShiftGroupName") ?? "",
      ShiftName: pick(row, "ShiftName") ?? "",
      DepartmentName: pick(row, "DepartmentName_English", "DepartmentName") ?? "",
      DesignationName: pick(row, "DesignationName") ?? "",
      EmployeeBatchName: pick(row, "EmployeeBatchName") ?? "",
      // codes for repopulating the form on "Edit"
      ShiftGroupCode: toInt(pick(row, "ShiftGroupCode")),
      ShiftCode: toInt(pick(row, "ShiftCode")),
      DepartmentCode: toInt(pick(row, "DepartmentCode")),
      DesignationCode: toInt(pick(row, "DesignationCode")),
      EmployeeBatchCode: toInt(pick(row, "EmployeeBatchCode")),
    }));
    return sendSuccess(res, data);
  } catch (err) {
    console.error("DB Error (EmployeeShiftChange.getHistory):", err);
    return sendError(res, err);
  }
};

// POST /employee-shift-change/save  -> sp_Employee_ShiftGroup_Update (+ optional master update)
export const save = async (req, res) => {
  let transaction;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const companyCode = getCompanyCode(req);
    if (companyCode <= 0)
      return sendError(res, "You are logged in to a group of companies; switch to a single company.", 400);

    const b = req.body || {};
    const employeeCode = toInt(b.EmployeeCode);
    const shiftGroupCode = toInt(b.ShiftGroupCode);
    const shiftCode = toInt(b.ShiftCode);
    const departmentCode = toInt(b.DepartmentCode);
    const designationCode = toInt(b.DesignationCode);
    const employeeBatchCode = toInt(b.EmployeeBatchCode);
    const permanent =
      b.PermanentChange === true || b.PermanentChange === 1 || b.PermanentChange === "1";

    // ---- validation (port of btnSave_Click, same order / messages) ----------
    if (employeeCode <= 0) return sendError(res, "Select the Employee ID", 400);
    if (shiftGroupCode <= 0) return sendError(res, "Select the Shift Group", 400);
    if (shiftCode <= 0) return sendError(res, "Select the Shift Name", 400);
    if (departmentCode <= 0) return sendError(res, "Select the Department", 400);
    if (designationCode <= 0) return sendError(res, "Select the Designation", 400);
    if (employeeBatchCode <= 0) return sendError(res, "Select the Batch", 400);

    const pool = await getPool(req.headers.subdbname);

    transaction = pool.transaction();
    await transaction.begin();

    await transaction
      .request()
      .input("EmployeeCode", sql.Int, employeeCode)
      .input("ShiftGroupCode", sql.Int, shiftGroupCode)
      .input("ShiftCode", sql.Int, shiftCode)
      .input("ShiftGroupChangeDate", sql.VarChar(10), ymd(b.ShiftGroupChangeDate))
      .input("DepartmentCode", sql.Int, departmentCode)
      .input("DesignationCode", sql.Int, designationCode)
      .input("EmployeeBatchCode", sql.Int, employeeBatchCode)
      .input("User", sql.Int, parseInt(userId))
      .input("Node", sql.Int, parseInt(nodeCode))
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_Employee_ShiftGroup_Update");

    // Permanent Change -> push the new values onto tbl_Employee (ShiftType comes
    // from the chosen shift group's Rotation, exactly like the desktop).
    if (permanent) {
      const sg = await transaction
        .request()
        .input("ShiftGroupCode", sql.Int, shiftGroupCode)
        .query("Select Rotation from tbl_ShiftGroup where ShiftGroupCode = @ShiftGroupCode");
      const rotation = sg.recordset?.[0] ? toInt(pick(sg.recordset[0], "Rotation")) : 0;

      await transaction
        .request()
        .input("Rotation", sql.Int, rotation)
        .input("ShiftGroupCode", sql.Int, shiftGroupCode)
        .input("ShiftCode", sql.Int, shiftCode)
        .input("DepartmentCode", sql.Int, departmentCode)
        .input("DesignationCode", sql.Int, designationCode)
        .input("EmployeeBatchCode", sql.Int, employeeBatchCode)
        .input("EmployeeCode", sql.Int, employeeCode)
        .query(
          "Update tbl_Employee Set ShiftType = @Rotation, ShiftGroupCode = @ShiftGroupCode, ShiftCode = @ShiftCode, DepartmentCode = @DepartmentCode, DesignationCode = @DesignationCode, EmployeeBatchCode = @EmployeeBatchCode Where EmployeeCode = @EmployeeCode"
        );
    }

    await transaction.commit();
    return sendSuccess(res, null, "The record is saved...", 201);
  } catch (err) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch {
        /* ignore */
      }
    }
    console.error("DB Error (EmployeeShiftChange.save):", err);
    return sendError(res, err);
  }
};
