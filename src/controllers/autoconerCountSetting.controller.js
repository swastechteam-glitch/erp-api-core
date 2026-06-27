import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Autoconer Count Setting master
//   (port of WinForms frmAutoconerCountSetting / frmAutoconerCountSettingDetails)
//   Department + Count dropdowns + Cone Weight / Actual Count / Working Mins /
//   Std Effi / Utilization / Speed (Tare Weight kept hidden).
//   - List   : EXEC sp_Prodn_Autoconer_CountSetting_GetAll
//   - Create : EXEC sp_Prodn_Autoconer_CountSetting_AddEdit (without @ACCountSettingCode)
//   - Update : EXEC sp_Prodn_Autoconer_CountSetting_AddEdit (with @ACCountSettingCode)
//   - Delete : EXEC sp_Prodn_AutoConer_CountSetting_Delete  (@ACCountSettingCode)
//
// Department auto-locks to the DB's existing Autoconer Count Setting department;
// the Count dropdown excludes counts already set for that department. The VB does
// NOT pass a company param (single-company per connection); subDBName scopes the
// database, so we mirror that. AddEdit requires @User / @Node.
// ---------------------------------------------------------------------------

const toNum = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

// GET /autoconer-count-setting/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);

    const existingDept = await pool
      .request()
      .query("Select TOP 1 DepartmentCode from tbl_Prodn_Autoconer_CountSetting");
    const lockedDept = existingDept.recordset[0]?.DepartmentCode;
    const deptSql = lockedDept
      ? `Select DepartmentCode, DepartmentName_English from tbl_Department Where Status = 1 AND DepartmentCode = ${lockedDept} ORDER BY DepartmentName_English`
      : "Select DepartmentCode, DepartmentName_English from tbl_Department Where Status = 1 ORDER BY DepartmentName_English";

    const editCode = parseInt(req.query.editCode) || 0;
    const countSql =
      "Select CountNameCode, CountName from tbl_CountName" +
      (lockedDept
        ? ` Where CountNameCode NOT IN (Select ISNULL(CountNameCode,0) from vw_Prodn_Autoconer_CountSetting` +
          ` Where DepartmentCode = ${lockedDept} AND ACCountSettingCode <> ${editCode})`
        : "") +
      " Order By CountName";

    const [departments, counts] = await Promise.all([
      pool.request().query(deptSql),
      pool.request().query(countSql),
    ]);

    return sendSuccess(res, {
      departments: departments.recordset.map((r) => ({ value: r.DepartmentCode, label: r.DepartmentName_English })),
      countNames: counts.recordset.map((r) => ({ value: r.CountNameCode, label: r.CountName })),
    });
  } catch (err) {
    console.error("DB Error (getOptions autoconer-count-setting):", err);
    return sendError(res, err);
  }
};

// GET /autoconer-count-setting/lists
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_Prodn_Autoconer_CountSetting_GetAll");
    const data = result.recordset.map((item) => ({ ...item, id: item.ACCountSettingCode }));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getList autoconer-count-setting):", err);
    return sendError(res, err);
  }
};

// GET /autoconer-count-setting/list/:acCountSettingCode
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = parseInt(req.params.acCountSettingCode);
    if (!code) return sendError(res, "Invalid ACCountSettingCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("ACCountSettingCode", sql.Int, code)
      .query("SELECT * FROM vw_Prodn_Autoconer_CountSetting WHERE ACCountSettingCode = @ACCountSettingCode");

    if (!result.recordset.length) return sendError(res, "Autoconer Count Setting not found", 404);
    return sendSuccess(res, result.recordset[0]);
  } catch (err) {
    console.error("DB Error (getById autoconer-count-setting):", err);
    return sendError(res, err);
  }
};

// Shared add/edit -> EXEC sp_Prodn_Autoconer_CountSetting_AddEdit
const saveOrUpdate = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode) return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const departmentCode = parseInt(body.DepartmentCode);
    const countNameCode = parseInt(body.CountNameCode) || 0;
    const coneWeight = toNum(body.ConeWeight);
    const tareWeight = toNum(body.TareWeight);
    const actualCount = toNum(body.ActualCount);
    const workingMins = toNum(body.WorkingMins);
    const stdEffi = toNum(body.StdEffi);
    const speed = toNum(body.Speed);
    const utilization = toNum(body.Utilization);

    // Validations mirror the VB btnSSave_Click.
    if (!departmentCode) return sendError(res, "Select the Department Name", 400);
    if (!countNameCode) return sendError(res, "Select the Count Name", 400);
    if (coneWeight <= 0) return sendError(res, "Enter the Cone Weight", 400);
    if (stdEffi <= 0) return sendError(res, "Enter the Effi", 400);
    if (actualCount <= 0) return sendError(res, "Enter the Actual Count", 400);
    if (utilization <= 0) return sendError(res, "Enter the Utilization", 400);
    if (workingMins <= 0) return sendError(res, "Enter the Working Mins", 400);
    if (speed <= 0) return sendError(res, "Enter the Speed", 400);

    const code = isEdit ? parseInt(req.params.acCountSettingCode ?? body.ACCountSettingCode) : null;
    if (isEdit && !code) return sendError(res, "Invalid ACCountSettingCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();
    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) request.input("ACCountSettingCode", sql.Int, code);
    request.input("DepartmentCode", sql.Int, departmentCode);
    request.input("CountNameCode", sql.Int, countNameCode);
    request.input("ConeWeight", sql.Decimal(18, 2), coneWeight);
    request.input("TareWeight", sql.Decimal(18, 2), tareWeight);
    request.input("ActualCount", sql.Decimal(18, 2), actualCount);
    request.input("WorkingMins", sql.Decimal(18, 2), workingMins);
    request.input("StdEffi", sql.Decimal(18, 2), stdEffi);
    request.input("Speed", sql.Decimal(18, 2), speed);
    request.input("Utilization", sql.Decimal(18, 2), utilization);

    await request.execute("sp_Prodn_Autoconer_CountSetting_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (err.message && err.message.includes("UK_")) {
      return sendError(res, "Already exist this Count setting", 409);
    }
    console.error("DB Error (saveOrUpdate autoconer-count-setting):", err);
    return sendError(res, err);
  }
};

// POST /autoconer-count-setting/create
export const create = (req, res) => saveOrUpdate(req, res, false);
// PUT  /autoconer-count-setting/update/:acCountSettingCode
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /autoconer-count-setting/delete/:acCountSettingCode
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = parseInt(req.params.acCountSettingCode);
    if (!code) return sendError(res, "Invalid ACCountSettingCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool.request().input("ACCountSettingCode", sql.Int, code).execute("sp_Prodn_AutoConer_CountSetting_Delete");
    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("REFERENCE") || err.message.includes("FK_"))) {
      return sendError(res, "You can not delete the Autoconer Count Setting!", 409);
    }
    console.error("DB Error (remove autoconer-count-setting):", err);
    return sendError(res, err);
  }
};
