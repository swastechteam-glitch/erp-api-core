import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Carding Machine Setting master
//   (port of WinForms frmCardingMachineSetting / frmCardingMachineSettingDetails)
//   - Options: Department / Machine / Mixing Name / Count Name dropdowns
//   - List   : EXEC sp_Prodn_Carding_MachineSetting_GetAll  @CompanyCode
//   - Create : EXEC sp_Prodn_Carding_MachineSetting_AddEdit (without @CRDMachineSettingCode)
//   - Update : EXEC sp_Prodn_Carding_MachineSetting_AddEdit (with @CRDMachineSettingCode)
//   - Delete : EXEC sp_Prodn_Carding_MachineSetting_Delete
// Company-scoped (CompanyCode from the JWT). AddEdit requires @User / @Node.
// Target Prodn is computed server-side (matches the VB Calc_TargetProdn):
//   TargetProdn = round((DSpeed * WorkingMins) / (StdHank * 1693), 2)
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

const toBit = (v) => {
  if (v === true || v === 1 || v === "1") return 1;
  if (typeof v === "string" && v.trim().toUpperCase() === "ACTIVE") return 1;
  return 0;
};

const toNum = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const calcTargetProdn = (dSpeed, workingMins, stdHank) => {
  if (workingMins > 0 && stdHank > 0) {
    return Math.round(((dSpeed * workingMins) / (stdHank * 1693)) * 100) / 100;
  }
  return 0;
};

// GET /carding-machine-setting/options  -> dropdown lookups
export const getCardingMachineSettingOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);
    const companyCode = parseInt(req.headers.companyCode) || 0;

    const pool = await getPool(req.headers.subdbname);

    // Lock the Department to the company's existing carding-setting department
    // (matches the VB Bind_Data: once any setting exists, the dropdown shows only
    // that department, so the React side auto-selects + disables it).
    const existingDept = await pool
      .request()
      .query(`Select TOP 1 DepartmentCode from tbl_Prodn_Carding_MachineSetting Where CompanyCode = ${companyCode}`);
    const lockedDept = existingDept.recordset[0]?.DepartmentCode;
    const deptSql = lockedDept
      ? `Select DepartmentCode, DepartmentName_English from tbl_Department Where DepartmentCode = ${lockedDept} ORDER BY DepartmentName_English`
      : "Select DepartmentCode, DepartmentName_English from tbl_Department ORDER BY DepartmentName_English";

    // Machine dropdown: only machines of the locked department, AND only those
    // that don't already have a carding setting (each machine = one setting).
    // The machine of the record being edited (?editCode) is kept available so
    // the edit screen can still show / change it.
    const editCode = parseInt(req.query.editCode) || 0;
    const machineSql =
      "Select MachineCode, MachineName, MachineNo from vw_Machine Where CompanyCode = " + companyCode +
      (lockedDept ? ` AND DepartmentCode = ${lockedDept}` : "") +
      ` AND MachineCode NOT IN (Select MachineCode from tbl_Prodn_Carding_MachineSetting` +
      ` Where CompanyCode = ${companyCode} AND CRDMachineSettingCode <> ${editCode})` +
      " Order by MachineNo";
    const [departments, machines, mixings, counts] = await Promise.all([
      pool.request().query(deptSql),
      pool.request().query(machineSql),
      pool.request().query("Select MixingNameCode, MixingName from tbl_MixingName Order By MixingName"),
      pool.request().query("Select CountNameCode, CountName from tbl_CountName Order By CountName"),
    ]);

    return sendSuccess(res, {
      departments: departments.recordset.map((r) => ({ value: r.DepartmentCode, label: r.DepartmentName_English })),
      machines: machines.recordset.map((r) => ({ value: r.MachineCode, label: r.MachineName })),
      mixingNames: mixings.recordset.map((r) => ({ value: r.MixingNameCode, label: r.MixingName })),
      countNames: counts.recordset.map((r) => ({ value: r.CountNameCode, label: r.CountName })),
    });
  } catch (err) {
    console.error("DB Error (getCardingMachineSettingOptions):", err);
    return sendError(res, err);
  }
};

// GET /carding-machine-setting/lists  -> mirrors frmCardingMachineSettingDetails list
export const getCardingMachineSettingList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);
    const companyCode = parseInt(req.headers.companyCode) || 0;

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_Prodn_Carding_MachineSetting_GetAll");

    const data = result.recordset.map((item) => ({
      ...item,
      id: item.CRDMachineSettingCode,
      StatusText: STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getCardingMachineSettingList):", err);
    return sendError(res, err);
  }
};

// GET /carding-machine-setting/list/:crdMachineSettingCode  -> single record
export const getCardingMachineSettingById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);
    const companyCode = parseInt(req.headers.companyCode) || 0;

    const code = parseInt(req.params.crdMachineSettingCode);
    if (!code) return sendError(res, "Invalid CRDMachineSettingCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CRDMachineSettingCode", sql.Int, code)
      .input("CompanyCode", sql.Int, companyCode)
      .query(
        "SELECT * FROM vw_Prodn_Carding_MachineSetting " +
          "WHERE CRDMachineSettingCode = @CRDMachineSettingCode AND CompanyCode = @CompanyCode"
      );

    if (!result.recordset.length)
      return sendError(res, "Carding Machine Setting not found", 404);

    const row = result.recordset[0];
    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getCardingMachineSettingById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_Prodn_Carding_MachineSetting_AddEdit
const saveOrUpdate = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    const companyCode = parseInt(req.headers.companyCode) || 0;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const departmentCode = parseInt(body.DepartmentCode);
    const machineCode = parseInt(body.MachineCode);
    const mixingNameCode = parseInt(body.MixingNameCode);
    const countNameCode = parseInt(body.CountNameCode) || 0;
    const prodnConts = toNum(body.ProdnConts);
    const dSpeed = toNum(body.DSpeed);
    const stdHank = toNum(body.STDHank ?? body.StdHank);
    const workingMins = toNum(body.WorkingMins);
    const effi = toNum(body.Effi);
    const utilization = toNum(body.Utilization);

    // Validations mirror the VB btnSave_Click.
    if (!departmentCode) return sendError(res, "Select the Department Name", 400);
    if (!machineCode) return sendError(res, "Select the Machine Name", 400);
    if (!mixingNameCode) return sendError(res, "Select the Mixing Name", 400);
    if (prodnConts <= 0) return sendError(res, "Enter the Prodn Conts", 400);
    if (stdHank <= 0) return sendError(res, "Enter the Std Hank", 400);
    if (workingMins <= 0) return sendError(res, "Enter the Working Mins", 400);

    const targetProdn = calcTargetProdn(dSpeed, workingMins, stdHank);

    const code = isEdit
      ? parseInt(req.params.crdMachineSettingCode ?? body.CRDMachineSettingCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid CRDMachineSettingCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) request.input("CRDMachineSettingCode", sql.Int, code);
    request.input("DepartmentCode", sql.Int, departmentCode);
    request.input("MachineCode", sql.Int, machineCode);
    request.input("MixingNameCode", sql.Int, mixingNameCode);
    request.input("CountNameCode", sql.Int, countNameCode);
    request.input("ProdnConts", sql.Decimal(18, 4), prodnConts);
    request.input("DSpeed", sql.Decimal(18, 2), dSpeed);
    request.input("STDHank", sql.Decimal(18, 2), stdHank);
    request.input("WorkingMins", sql.Decimal(18, 2), workingMins);
    request.input("TargetProdn", sql.Decimal(18, 2), targetProdn);
    request.input("Effi", sql.Decimal(18, 2), effi);
    request.input("Utilization", sql.Decimal(18, 2), utilization);
    request.input("Status", sql.Bit, toBit(body.Status));
    request.input("CompanyCode", sql.Int, companyCode);

    await request.execute("sp_Prodn_Carding_MachineSetting_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (err.message && err.message.includes("UK_")) {
      return sendError(res, "Already exist this Machine setting", 409);
    }
    console.error("DB Error (saveOrUpdate carding-machine-setting):", err);
    return sendError(res, err);
  }
};

// POST /carding-machine-setting/create
export const createCardingMachineSetting = (req, res) => saveOrUpdate(req, res, false);

// PUT  /carding-machine-setting/update/:crdMachineSettingCode
export const updateCardingMachineSetting = (req, res) => saveOrUpdate(req, res, true);

// DELETE /carding-machine-setting/delete/:crdMachineSettingCode
export const deleteCardingMachineSetting = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.crdMachineSettingCode);
    if (!code) return sendError(res, "Invalid CRDMachineSettingCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("CRDMachineSettingCode", sql.Int, code)
      .execute("sp_Prodn_Carding_MachineSetting_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the Carding Machine Setting!", 409);
    }
    console.error("DB Error (deleteCardingMachineSetting):", err);
    return sendError(res, err);
  }
};
