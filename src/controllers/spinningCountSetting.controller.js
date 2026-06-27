import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Spinning Count Setting master
//   (port of WinForms frmSpinningCountSetting / frmSpinningCountSettingDetails)
//   Department + Count dropdowns + GPS / Actual Count / Cone & Cheese Weight /
//   40s Conversion Value + 4 Ring-Frame spindle groups (No.Of Spindle + % each)
//   + Prodn.Conts (computed per group) + Std.Hank / TPI / Effi / Utilization /
//   Speed + Target Prodn (computed).
//
//   Prodn.Conts(N) = round((1 / (ActualCount * 2.2046)) * NoofSpindle(N) * (Per(N)/100), 2)
//   Target Prodn   = round((7.2 * Speed * Effi * Utilization)
//                          / ((ActualCount * TPI * 100 * 100) * 1000 / NoofSpindleType1), 2)
//
//   - List   : EXEC sp_Prodn_Spinning_CountSetting_GetAll
//   - Create : EXEC sp_Prodn_Spinning_CountSetting_AddEdit (without @spgCountSettingCode)
//   - Update : EXEC sp_Prodn_Spinning_CountSetting_AddEdit (with @spgCountSettingCode)
//   - Delete : EXEC sp_Prodn_Spinning_CountSetting_Delete   (@SpgCountSettingCode)
//
// Department auto-locks to the DB's existing Spinning Count Setting department
// (matches the VB Bind_Data); the Count dropdown excludes counts already set for
// that department. The VB does NOT pass a company param to these SPs (the desktop
// app is single-company per connection); subDBName already scopes the database,
// so we mirror that and pass no @CompanyCode. AddEdit requires @User / @Node.
// ---------------------------------------------------------------------------

const toNum = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// VB ProdnCons_Calc — per-group production constant.
const calcProdnConts = (actualCount, noofSpindle, per) =>
  actualCount > 0
    ? r2((1 / (actualCount * 2.2046)) * noofSpindle * (per / 100))
    : 0;

// VB GetActualHankProduction — Target Prodn.
const calcTargetProdn = (speed, effi, util, actualCount, tpi, noofSpindle1) =>
  actualCount > 0 && tpi > 0 && noofSpindle1 > 0
    ? r2((7.2 * speed * effi * util) / ((actualCount * tpi * 100 * 100) * 1000 / noofSpindle1))
    : 0;

// GET /spinning-count-setting/options  -> dropdown lookups
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);

    // Lock the Department to the existing Spinning Count Setting department
    // (matches VB Bind_Data; React auto-selects + disables it).
    const existingDept = await pool
      .request()
      .query("Select TOP 1 DepartmentCode from tbl_Prodn_Spinning_CountSetting");
    const lockedDept = existingDept.recordset[0]?.DepartmentCode;
    const deptSql = lockedDept
      ? `Select DepartmentCode, DepartmentName_English from tbl_Department Where DepartmentCode = ${lockedDept} ORDER BY DepartmentName_English`
      : "Select DepartmentCode, DepartmentName_English from tbl_Department ORDER BY DepartmentName_English";

    // Count dropdown: exclude counts already configured for the locked department
    // (matches the VB cmbDepartmentName_EditValueChanged filter). The count of the
    // record being edited (?editCode) is kept available.
    const editCode = parseInt(req.query.editCode) || 0;
    const countSql =
      "Select CountNameCode, CountName from tbl_CountName" +
      (lockedDept
        ? ` Where CountNameCode NOT IN (Select ISNULL(CountNameCode,0) from vw_Prodn_Spinning_CountSetting` +
          ` Where DepartmentCode = ${lockedDept} AND SpgCountSettingCode <> ${editCode})`
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
    console.error("DB Error (getOptions spinning-count-setting):", err);
    return sendError(res, err);
  }
};

// GET /spinning-count-setting/lists
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_Prodn_Spinning_CountSetting_GetAll");

    const data = result.recordset.map((item) => ({
      ...item,
      id: item.SpgCountSettingCode,
    }));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getList spinning-count-setting):", err);
    return sendError(res, err);
  }
};

// GET /spinning-count-setting/list/:spgCountSettingCode
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = parseInt(req.params.spgCountSettingCode);
    if (!code) return sendError(res, "Invalid SpgCountSettingCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("SpgCountSettingCode", sql.Int, code)
      .query("SELECT * FROM vw_Prodn_Spinning_CountSetting WHERE SpgCountSettingCode = @SpgCountSettingCode");

    if (!result.recordset.length)
      return sendError(res, "Spinning Count Setting not found", 404);

    return sendSuccess(res, result.recordset[0]);
  } catch (err) {
    console.error("DB Error (getById spinning-count-setting):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_Prodn_Spinning_CountSetting_AddEdit
const saveOrUpdate = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const departmentCode = parseInt(body.DepartmentCode);
    const countNameCode = parseInt(body.CountNameCode) || 0;
    const actualCount = toNum(body.ActualCount);
    const conversionValue40s = toNum(body["40s_ConversionValue"] ?? body.ConversionValue40s);
    const coneWeight = toNum(body.ConeWeight);
    const cheeseWeight = toNum(body.CheeseWeight);
    const machineGPS = toNum(body.MachineGPS);
    const stdHank = toNum(body.STDHank ?? body.StdHank);
    const tpi = toNum(body.TPI);
    const speed = toNum(body.Speed);
    const effi = toNum(body.Effi);
    const utilization = toNum(body.Utilization);

    const noof1 = toNum(body.NoofSpindleType1);
    const noof2 = toNum(body.NoofSpindleType2);
    const noof3 = toNum(body.NoofSpindleType3);
    const noof4 = toNum(body.NoofSpindleType4);
    const per1 = toNum(body.PerType1);
    const per2 = toNum(body.PerType2);
    const per3 = toNum(body.PerType3);
    const per4 = toNum(body.PerType4);

    // Server-authoritative computes (mirror the VB ProdnCons_Calc / Target).
    const prodn1 = calcProdnConts(actualCount, noof1, per1);
    const prodn2 = calcProdnConts(actualCount, noof2, per2);
    const prodn3 = calcProdnConts(actualCount, noof3, per3);
    const prodn4 = calcProdnConts(actualCount, noof4, per4);
    const targetProdn = calcTargetProdn(speed, effi, utilization, actualCount, tpi, noof1);

    // Validations mirror the VB btnSSave_Click.
    if (!departmentCode) return sendError(res, "Select the Department Name", 400);
    if (!countNameCode) return sendError(res, "Select the Count Name", 400);
    if (actualCount <= 0) return sendError(res, "Enter the Actual Count", 400);
    if (conversionValue40s <= 0) return sendError(res, "Enter the 40s Convert. Value", 400);
    if (coneWeight <= 0) return sendError(res, "Enter the Cone Weight Value", 400);
    if (prodn1 + prodn2 + prodn3 + prodn4 <= 0) return sendError(res, "Enter the Prodn Contr. Value", 400);
    if (targetProdn <= 0) return sendError(res, "Enter the Target Prodn", 400);
    if (speed <= 0) return sendError(res, "Enter the Speed", 400);
    if (tpi <= 0) return sendError(res, "Enter the TPI", 400);
    if (machineGPS <= 0) return sendError(res, "Enter the GPS", 400);

    const code = isEdit
      ? parseInt(req.params.spgCountSettingCode ?? body.SpgCountSettingCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid SpgCountSettingCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) request.input("spgCountSettingCode", sql.Int, code);

    request.input("DepartmentCode", sql.Int, departmentCode);
    request.input("CountNameCode", sql.Int, countNameCode);
    request.input("ActualCount", sql.Decimal(18, 2), actualCount);
    request.input("40s_ConversionValue", sql.Decimal(18, 4), conversionValue40s);

    request.input("NoofSpindleType1", sql.Int, noof1);
    request.input("PerType1", sql.Int, per1);
    request.input("ProdnContsType1", sql.Decimal(18, 2), prodn1);
    request.input("NoofSpindleType2", sql.Int, noof2);
    request.input("PerType2", sql.Int, per2);
    request.input("ProdnContsType2", sql.Decimal(18, 2), prodn2);
    request.input("NoofSpindleType3", sql.Int, noof3);
    request.input("PerType3", sql.Int, per3);
    request.input("ProdnContsType3", sql.Decimal(18, 2), prodn3);
    request.input("NoofSpindleType4", sql.Int, noof4);
    request.input("PerType4", sql.Int, per4);
    request.input("ProdnContsType4", sql.Decimal(18, 2), prodn4);

    request.input("TargetProdn", sql.Decimal(18, 2), targetProdn);
    request.input("Speed", sql.Decimal(18, 2), speed);
    request.input("TPI", sql.Decimal(18, 2), tpi);
    request.input("STDHank", sql.Decimal(18, 2), stdHank);
    request.input("Effi", sql.Decimal(18, 2), effi);
    request.input("Utilization", sql.Decimal(18, 2), utilization);
    request.input("ConeWeight", sql.Decimal(18, 3), coneWeight);
    request.input("CheeseWeight", sql.Decimal(18, 3), cheeseWeight);
    request.input("MachineGPS", sql.Int, machineGPS);

    await request.execute("sp_Prodn_Spinning_CountSetting_AddEdit");

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
    console.error("DB Error (saveOrUpdate spinning-count-setting):", err);
    return sendError(res, err);
  }
};

// POST /spinning-count-setting/create
export const create = (req, res) => saveOrUpdate(req, res, false);

// PUT  /spinning-count-setting/update/:spgCountSettingCode
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /spinning-count-setting/delete/:spgCountSettingCode
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = parseInt(req.params.spgCountSettingCode);
    if (!code) return sendError(res, "Invalid SpgCountSettingCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("SpgCountSettingCode", sql.Int, code)
      .execute("sp_Prodn_Spinning_CountSetting_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("REFERENCE") || err.message.includes("FK_"))) {
      return sendError(res, "You can not delete the Spinning Count Setting!", 409);
    }
    console.error("DB Error (remove spinning-count-setting):", err);
    return sendError(res, err);
  }
};
