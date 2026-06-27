import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Spinning Frame Setting master
//   (port of WinForms frmSpinningFrameSetting / frmSpinningFrameSettingDetails)
//   Department + Machine + Count + Mixing dropdowns + GPS / Actual Count /
//   40s Conversion Value / TPI / Speed / Effi / Utilization / Actual Spindle /
//   Spindle Constant + Std Prodn (computed) + Status.
//
//   Selecting a Count auto-fills Actual Count / 40s Value / Speed / TPI /
//   Std Hank / Effi / Utilization from the Spinning Count Setting (the React
//   form does this from the /options count list; the server stays authoritative
//   for Std Prodn).
//
//   Std Prodn = round((7.2 * Speed * Effi * Utilization)
//                     / ((ActualCount * TPI * 100 * 100) * 1000 / ActualSpindle), 2)
//
//   - List   : EXEC sp_Prodn_Spinning_FrameSetting_GetAll  @CompanyCode
//   - Create : EXEC sp_Prodn_Spinning_FrameSetting_AddEdit (without @spgFrameSettingCode)
//   - Update : EXEC sp_Prodn_Spinning_FrameSetting_AddEdit (with @spgFrameSettingCode)
//   - Delete : EXEC sp_Prodn_Spinning_FrameSetting_Delete   (@spgFrameSettingCode)
//
// Department auto-locks to the existing Spinning Count Setting department; the
// Machine dropdown shows that department's un-allotted machines (the edited
// record's own machine stays available). Company-scoped (CompanyCode from JWT).
// AddEdit requires @User / @Node.
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
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// VB GetActualHankProduction — Std Prodn (Target).
const calcStdProdn = (speed, effi, util, actualCount, tpi, actualSpindle) =>
  actualCount > 0 && tpi > 0 && actualSpindle > 0
    ? r2((7.2 * speed * effi * util) / ((actualCount * tpi * 100 * 100) * 1000 / actualSpindle))
    : 0;

// GET /spinning-frame-setting/options  -> dropdown lookups
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = parseInt(req.headers.companyCode) || 0;
    const editCode = parseInt(req.query.editCode) || 0;
    const pool = await getPool(req.headers.subdbname);

    // Lock the Department to the existing Spinning Count Setting department.
    const existingDept = await pool
      .request()
      .query("Select TOP 1 DepartmentCode from tbl_Prodn_Spinning_CountSetting");
    const lockedDept = existingDept.recordset[0]?.DepartmentCode;
    const deptSql = lockedDept
      ? `Select DepartmentCode, DepartmentName_English from tbl_Department Where Status = 1 AND DepartmentCode = ${lockedDept} ORDER BY DepartmentName_English`
      : "Select DepartmentCode, DepartmentName_English from tbl_Department Where Status = 1 ORDER BY DepartmentName_English";

    // Machine dropdown: department's machines that don't already have a frame
    // setting (the record being edited keeps its own machine available).
    const machineSql =
      "Select MachineCode, MachineName, MachineNo from vw_Machine Where CompanyCode = " + companyCode +
      " AND Status = 1" +
      (lockedDept ? ` AND DepartmentCode = ${lockedDept}` : "") +
      ` AND MachineCode NOT IN (Select MachineCode from tbl_Prodn_Spinning_FrameSetting` +
      ` Where CompanyCode = ${companyCode} AND SpgFrameSettingCode <> ${editCode})` +
      " Order by MachineNo";

    // Count dropdown carries the Count Setting values so the React form can
    // auto-fill Actual Count / 40s / Speed / TPI / Std Hank / Effi / Utilization.
    const countSql =
      "Select CountNameCode, CountName, ShortName, ActualCount, [40s_ConversionValue], " +
      "Speed, TPI, STDHank, Effi, Utilization from vw_Prodn_Spinning_CountSetting Order By CountName";

    const [departments, machines, mixings, counts] = await Promise.all([
      pool.request().query(deptSql),
      pool.request().query(machineSql),
      pool.request().query("Select MixingNameCode, MixingName from tbl_MixingName Where Status = 1 Order By MixingName"),
      pool.request().query(countSql),
    ]);

    return sendSuccess(res, {
      departments: departments.recordset.map((r) => ({ value: r.DepartmentCode, label: r.DepartmentName_English })),
      machines: machines.recordset.map((r) => ({ value: r.MachineCode, label: r.MachineName })),
      mixingNames: mixings.recordset.map((r) => ({ value: r.MixingNameCode, label: r.MixingName })),
      counts: counts.recordset.map((r) => ({
        value: r.CountNameCode,
        label: r.ShortName || r.CountName,
        actualCount: r.ActualCount,
        conv40s: r["40s_ConversionValue"],
        speed: r.Speed,
        tpi: r.TPI,
        stdHank: r.STDHank,
        effi: r.Effi,
        utilization: r.Utilization,
      })),
    });
  } catch (err) {
    console.error("DB Error (getOptions spinning-frame-setting):", err);
    return sendError(res, err);
  }
};

// GET /spinning-frame-setting/lists
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = parseInt(req.headers.companyCode) || 0;
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_Prodn_Spinning_FrameSetting_GetAll");

    const data = result.recordset.map((item) => ({
      ...item,
      id: item.SpgFrameSettingCode,
      StatusText: STATUS_LABEL(item.Status),
    }));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getList spinning-frame-setting):", err);
    return sendError(res, err);
  }
};

// GET /spinning-frame-setting/list/:spgFrameSettingCode
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = parseInt(req.headers.companyCode) || 0;
    const code = parseInt(req.params.spgFrameSettingCode);
    if (!code) return sendError(res, "Invalid SpgFrameSettingCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("SpgFrameSettingCode", sql.Int, code)
      .input("CompanyCode", sql.Int, companyCode)
      .query(
        "SELECT * FROM vw_Prodn_Spinning_FrameSetting " +
          "WHERE SpgFrameSettingCode = @SpgFrameSettingCode AND CompanyCode = @CompanyCode"
      );

    if (!result.recordset.length)
      return sendError(res, "Spinning Frame Setting not found", 404);

    const row = result.recordset[0];
    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getById spinning-frame-setting):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_Prodn_Spinning_FrameSetting_AddEdit
const saveOrUpdate = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    const companyCode = parseInt(req.headers.companyCode) || 0;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const departmentCode = parseInt(body.DepartmentCode);
    const machineCode = parseInt(body.MachineCode);
    const countNameCode = parseInt(body.CountNameCode) || 0;
    const mixingNameCode = parseInt(body.MixingNameCode) || 0;
    const actualCount = toNum(body.ActualCount);
    const conversionValue40s = toNum(body["40s_ConversionValue"] ?? body.ConversionValue40s);
    const prodnConts = toNum(body.ProdnConts);
    const tpi = toNum(body.TPI);
    const speed = toNum(body.Speed);
    const actualSpindle = toNum(body.ActualSpindle);
    const actualHank = toNum(body.ActualHank);
    const allottedHank = toNum(body.AllottedHank ?? body.STDHank); // hidden "Std Hank"
    const doffLossPer = toNum(body.DoffLossPer);
    const effi = toNum(body.Effi);
    const utilization = toNum(body.Utilization);
    const spindleConstant = toNum(body.SpindleConstant);
    const machineGPS = toNum(body.MachineGPS);

    const stdProdn = calcStdProdn(speed, effi, utilization, actualCount, tpi, actualSpindle);

    // Validations mirror the VB btnSSave_Click.
    if (!departmentCode) return sendError(res, "Select the Department Name", 400);
    if (!machineCode) return sendError(res, "Select the Machine Name", 400);
    if (!countNameCode) return sendError(res, "Select the Count Name", 400);
    if (actualCount <= 0) return sendError(res, "Enter the Actual Count", 400);
    if (conversionValue40s <= 0) return sendError(res, "Enter the 40s Convert. Value", 400);
    if (stdProdn <= 0) return sendError(res, "Enter the Target Prodn", 400);
    if (speed <= 0) return sendError(res, "Enter the Speed", 400);
    if (tpi <= 0) return sendError(res, "Enter the TPI", 400);

    const code = isEdit
      ? parseInt(req.params.spgFrameSettingCode ?? body.SpgFrameSettingCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid SpgFrameSettingCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) request.input("spgFrameSettingCode", sql.Int, code);

    request.input("DepartmentCode", sql.Int, departmentCode);
    request.input("MachineCode", sql.Int, machineCode);
    request.input("CountNameCode", sql.Int, countNameCode);
    request.input("MixingNameCode", sql.Int, mixingNameCode);
    request.input("ActualCount", sql.Decimal(18, 3), actualCount);
    request.input("40s_ConversionValue", sql.Decimal(18, 4), conversionValue40s);
    request.input("ProdnConts", sql.Decimal(18, 3), prodnConts);
    request.input("TPI", sql.Decimal(18, 2), tpi);
    request.input("Speed", sql.Decimal(18, 2), speed);
    request.input("ActualSpindle", sql.Decimal(18, 2), actualSpindle);
    request.input("AllottedSpindle", sql.Decimal(18, 2), actualSpindle); // VB sends ActualSpindle
    request.input("ActualHank", sql.Decimal(18, 2), actualHank);
    request.input("AllottedHank", sql.Decimal(18, 2), allottedHank);
    request.input("StdProdn", sql.Decimal(18, 2), stdProdn);
    request.input("DoffLossPer", sql.Decimal(18, 2), doffLossPer);
    request.input("Status", sql.Bit, toBit(body.Status));
    request.input("Effi", sql.Decimal(18, 2), effi);
    request.input("Utilization", sql.Decimal(18, 2), utilization);
    request.input("SpindleConstant", sql.Decimal(18, 2), spindleConstant);
    request.input("MachineGPS", sql.Int, machineGPS);
    request.input("CompanyCode", sql.Int, companyCode);

    await request.execute("sp_Prodn_Spinning_FrameSetting_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (err.message && err.message.includes("UK_")) {
      return sendError(res, "Already exist this Frame setting", 409);
    }
    console.error("DB Error (saveOrUpdate spinning-frame-setting):", err);
    return sendError(res, err);
  }
};

// POST /spinning-frame-setting/create
export const create = (req, res) => saveOrUpdate(req, res, false);

// PUT  /spinning-frame-setting/update/:spgFrameSettingCode
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /spinning-frame-setting/delete/:spgFrameSettingCode
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = parseInt(req.params.spgFrameSettingCode);
    if (!code) return sendError(res, "Invalid SpgFrameSettingCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("spgFrameSettingCode", sql.Int, code)
      .execute("sp_Prodn_Spinning_FrameSetting_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("REFERENCE") || err.message.includes("FK_"))) {
      return sendError(res, "You can not delete the Spinning Frame Setting!", 409);
    }
    console.error("DB Error (remove spinning-frame-setting):", err);
    return sendError(res, err);
  }
};
