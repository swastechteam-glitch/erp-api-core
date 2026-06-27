import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Simplex Machine Setting master
//   (port of WinForms frmSimplexMachineSetting / frmSimplexMachineSettingDetails)
//   Department / Machine / Mixing / Count dropdowns + Prodn.Conts / D.Speed /
//   Std.Hank / TPI / Spindle / Working Mins / Effi / Utilization + Status.
//   Target Prodn formula:
//     round((7.2 * DSpeed) / (TPI * StdHank) / 1000 * Spindle / 8 * (WorkingMins/60), 2)
//   - List   : EXEC sp_Prodn_Simplex_MachineSetting_GetAll  @CompanyCode
//   - Create : EXEC sp_Prodn_Simplex_MachineSetting_AddEdit (without @SPXMachineSettingCode)
//   - Update : EXEC sp_Prodn_Simplex_MachineSetting_AddEdit (with @SPXMachineSettingCode)
//   - Delete : EXEC sp_Prodn_Simplex_MachineSetting_Delete
// Company-scoped (CompanyCode from the JWT). AddEdit requires @User / @Node.
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

// VB Calc_TargetProdn for Simplex.
const calcTargetProdn = (dSpeed, tpi, stdHank, spindle, workingMins) =>
  tpi > 0 && stdHank > 0
    ? Math.round(((7.2 * dSpeed) / (tpi * stdHank) / 1000 * spindle / 8 * (workingMins / 60)) * 100) / 100
    : 0;

// GET /simplex-machine-setting/options  -> dropdown lookups
export const getSimplexMachineSettingOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);
    const companyCode = parseInt(req.headers.companyCode) || 0;

    const pool = await getPool(req.headers.subdbname);

    // Lock the Department to the company's existing simplex-setting department
    // (matches the VB Bind_Data; React auto-selects + disables it).
    const existingDept = await pool
      .request()
      .query(`Select TOP 1 DepartmentCode from tbl_Prodn_Simplex_MachineSetting Where CompanyCode = ${companyCode}`);
    const lockedDept = existingDept.recordset[0]?.DepartmentCode;
    const deptSql = lockedDept
      ? `Select DepartmentCode, DepartmentName_English from tbl_Department Where DepartmentCode = ${lockedDept} ORDER BY DepartmentName_English`
      : "Select DepartmentCode, DepartmentName_English from tbl_Department ORDER BY DepartmentName_English";

    // Machine dropdown: only machines of the locked department, AND only those
    // that don't already have a simplex setting. The machine of the record being
    // edited (?editCode) is kept available.
    const editCode = parseInt(req.query.editCode) || 0;
    const machineSql =
      "Select MachineCode, MachineName, MachineNo from vw_Machine Where CompanyCode = " + companyCode +
      (lockedDept ? ` AND DepartmentCode = ${lockedDept}` : "") +
      ` AND MachineCode NOT IN (Select MachineCode from tbl_Prodn_Simplex_MachineSetting` +
      ` Where CompanyCode = ${companyCode} AND SPXMachineSettingCode <> ${editCode})` +
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
    console.error("DB Error (getSimplexMachineSettingOptions):", err);
    return sendError(res, err);
  }
};

// GET /simplex-machine-setting/lists
export const getSimplexMachineSettingList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);
    const companyCode = parseInt(req.headers.companyCode) || 0;

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_Prodn_Simplex_MachineSetting_GetAll");

    const data = result.recordset.map((item) => ({
      ...item,
      id: item.SPXMachineSettingCode,
      StatusText: STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getSimplexMachineSettingList):", err);
    return sendError(res, err);
  }
};

// GET /simplex-machine-setting/list/:spxMachineSettingCode
export const getSimplexMachineSettingById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);
    const companyCode = parseInt(req.headers.companyCode) || 0;

    const code = parseInt(req.params.spxMachineSettingCode);
    if (!code) return sendError(res, "Invalid SPXMachineSettingCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("SPXMachineSettingCode", sql.Int, code)
      .input("CompanyCode", sql.Int, companyCode)
      .query(
        "SELECT * FROM vw_Prodn_Simplex_MachineSetting " +
          "WHERE SPXMachineSettingCode = @SPXMachineSettingCode AND CompanyCode = @CompanyCode"
      );

    if (!result.recordset.length)
      return sendError(res, "Simplex Machine Setting not found", 404);

    const row = result.recordset[0];
    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getSimplexMachineSettingById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_Prodn_Simplex_MachineSetting_AddEdit
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
    const tpi = toNum(body.TPI);
    const spindles = toNum(body.Spindles ?? body.Spindle);
    const workingMins = toNum(body.WorkingMins);
    const effi = toNum(body.Effi);
    const utilization = toNum(body.Utilization);

    // Validations mirror the VB btnSave_Click.
    if (!departmentCode) return sendError(res, "Select the Department Name", 400);
    if (!machineCode) return sendError(res, "Select the Machine Name", 400);
    if (!mixingNameCode) return sendError(res, "Select the Mixing Name", 400);
    if (!countNameCode) return sendError(res, "Select the Count Name", 400);
    if (prodnConts <= 0) return sendError(res, "Enter the Prodn Conts", 400);
    if (stdHank <= 0) return sendError(res, "Enter the Std Hank", 400);
    if (tpi <= 0) return sendError(res, "Enter the TPI", 400);
    if (spindles <= 0) return sendError(res, "Enter the Spindle", 400);
    if (workingMins <= 0) return sendError(res, "Enter the Working Mins", 400);

    const targetProdn = calcTargetProdn(dSpeed, tpi, stdHank, spindles, workingMins);

    const code = isEdit
      ? parseInt(req.params.spxMachineSettingCode ?? body.SPXMachineSettingCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid SPXMachineSettingCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    if (isEdit) request.input("SPXMachineSettingCode", sql.Int, code);
    request.input("DepartmentCode", sql.Int, departmentCode);
    request.input("MachineCode", sql.Int, machineCode);
    request.input("MixingNameCode", sql.Int, mixingNameCode);
    request.input("CountNameCode", sql.Int, countNameCode);
    request.input("ProdnConts", sql.Decimal(18, 4), prodnConts);
    request.input("DSpeed", sql.Decimal(18, 2), dSpeed);
    request.input("STDHank", sql.Decimal(18, 2), stdHank);
    request.input("TPI", sql.Decimal(18, 2), tpi);
    request.input("Spindles", sql.Decimal(18, 2), spindles);
    request.input("WorkingMins", sql.Decimal(18, 2), workingMins);
    request.input("TargetProdn", sql.Decimal(18, 2), targetProdn);
    request.input("Utilization", sql.Decimal(18, 2), utilization);
    request.input("Effi", sql.Decimal(18, 2), effi);
    request.input("Status", sql.Bit, toBit(body.Status));
    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    request.input("CompanyCode", sql.Int, companyCode);

    await request.execute("sp_Prodn_Simplex_MachineSetting_AddEdit");

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
    console.error("DB Error (saveOrUpdate simplex-machine-setting):", err);
    return sendError(res, err);
  }
};

// POST /simplex-machine-setting/create
export const createSimplexMachineSetting = (req, res) => saveOrUpdate(req, res, false);

// PUT  /simplex-machine-setting/update/:spxMachineSettingCode
export const updateSimplexMachineSetting = (req, res) => saveOrUpdate(req, res, true);

// DELETE /simplex-machine-setting/delete/:spxMachineSettingCode
export const deleteSimplexMachineSetting = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.spxMachineSettingCode);
    if (!code) return sendError(res, "Invalid SPXMachineSettingCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("SPXMachineSettingCode", sql.Int, code)
      .execute("sp_Prodn_Simplex_MachineSetting_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the Simplex Machine Setting!", 409);
    }
    console.error("DB Error (deleteSimplexMachineSetting):", err);
    return sendError(res, err);
  }
};
