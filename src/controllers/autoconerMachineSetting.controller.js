import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Autoconer Machine Setting (header + drum-group detail)
//   (port of WinForms frmAutoconerMachineSetting / frmAutoconerMachineSettingDetails)
//   Header: Department (locked) + Machine + Total Drum (= machine's drum capacity)
//   + Status. Detail: one row per drum group — Count / Mixing / Drum No From-To /
//   Allotted Drum (= To-From+1) / Cone Weight / Target Prodn / Speed. The sum of
//   the groups' Allotted Drum must equal the machine's available drum.
//
//   - List   : EXEC sp_Prodn_Autoconer_MachineSetting_GetAll @CompanyCode
//   - Create : EXEC sp_Prodn_Autoconer_MachineSetting_AddEdit (ExecuteScalar) ->
//              details Delete + per-row Insert  (one transaction)
//   - Update : same, with @ACMachineSettingCode
//   - Delete : EXEC sp_Prodn_Autoconer_MachineSetting_Delete @ACMachineSettingCode
//
// Department auto-locks to the Autoconer Count Setting department; the Machine
// dropdown shows that department's un-allotted machines (edited record keeps its
// own). Count dropdown carries Cone Weight + Speed from the count setting.
// Company-scoped (CompanyCode from the JWT). AddEdit requires @User / @Node.
// ---------------------------------------------------------------------------

const toInt = (v) => parseInt(v) || 0;
const toNum = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const scalar = async (request, proc) => {
  const r = await request.execute(proc);
  const row = r.recordset && r.recordset[0];
  return row ? row[Object.keys(row)[0]] : undefined;
};

const toBit = (v) => {
  if (v === true || v === 1 || v === "1") return 1;
  if (typeof v === "string" && v.trim().toUpperCase() === "ACTIVE") return 1;
  return 0;
};
const STATUS_LABEL = (s) => (s ? "ACTIVE" : "INACTIVE");

// GET /autoconer-machine-setting/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);

    const existingDept = await pool
      .request()
      .query("Select TOP 1 DepartmentCode from tbl_Prodn_Autoconer_CountSetting");
    const lockedDept = existingDept.recordset[0]?.DepartmentCode;
    const deptSql = lockedDept
      ? `Select DepartmentCode, DepartmentName_English from tbl_Department Where DepartmentCode = ${lockedDept} ORDER BY DepartmentName_English`
      : "Select DepartmentCode, DepartmentName_English from tbl_Department ORDER BY DepartmentName_English";

    const [departments, mixings, counts] = await Promise.all([
      pool.request().query(deptSql),
      pool.request().query("Select MixingNameCode, MixingName from tbl_MixingName Order By MixingName"),
      // Count Settings carry Cone Weight + Speed (auto-filled on count select).
      pool.request().query("Select CountNameCode, CountName, ShortName, ConeWeight, Speed from vw_Prodn_Autoconer_CountSetting Order By CountName"),
    ]);

    return sendSuccess(res, {
      departments: departments.recordset.map((r) => ({ value: r.DepartmentCode, label: r.DepartmentName_English })),
      mixingNames: mixings.recordset.map((r) => ({ value: r.MixingNameCode, label: r.MixingName })),
      counts: counts.recordset.map((r) => ({
        value: r.CountNameCode,
        label: r.CountName,
        coneWeight: r.ConeWeight,
        speed: r.Speed,
      })),
    });
  } catch (err) {
    console.error("DB Error (getOptions autoconer-machine-setting):", err);
    return sendError(res, err);
  }
};

// GET /autoconer-machine-setting/machines?editCode=
export const getMachines = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = toInt(req.headers.companyCode);
    const editCode = toInt(req.query.editCode);
    const pool = await getPool(req.headers.subdbname);

    const existingDept = await pool
      .request()
      .query("Select TOP 1 DepartmentCode from tbl_Prodn_Autoconer_CountSetting");
    const lockedDept = existingDept.recordset[0]?.DepartmentCode;

    const machineSql =
      "Select MachineCode, MachineName, MachineNo, NoOfSpindles from vw_Machine Where CompanyCode = " + companyCode +
      " AND Status = 1" +
      (lockedDept ? ` AND DepartmentCode = ${lockedDept}` : "") +
      ` AND MachineCode NOT IN (Select MachineCode from tbl_Prodn_Autoconer_MachineSetting` +
      ` Where CompanyCode = ${companyCode} AND ACMachineSettingCode <> ${editCode})` +
      " Order by MachineNo";

    const result = await pool.request().query(machineSql);
    return sendSuccess(
      res,
      result.recordset.map((r) => ({ value: r.MachineCode, label: r.MachineName, availableDrum: r.NoOfSpindles }))
    );
  } catch (err) {
    console.error("DB Error (getMachines autoconer-machine-setting):", err);
    return sendError(res, err);
  }
};

// GET /autoconer-machine-setting/lists
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = toInt(req.headers.companyCode);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_Prodn_Autoconer_MachineSetting_GetAll");
    const data = result.recordset.map((item) => ({ ...item, id: item.ACMachineSettingCode, StatusText: STATUS_LABEL(item.Status) }));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getList autoconer-machine-setting):", err);
    return sendError(res, err);
  }
};

// GET /autoconer-machine-setting/list/:code
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = toInt(req.headers.companyCode);
    const code = toInt(req.params.code);
    if (!code) return sendError(res, "Invalid ACMachineSettingCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const headerRes = await pool
      .request()
      .input("ACMachineSettingCode", sql.Int, code)
      .input("CompanyCode", sql.Int, companyCode)
      .query("SELECT * FROM vw_Prodn_Autoconer_MachineSetting WHERE ACMachineSettingCode = @ACMachineSettingCode AND CompanyCode = @CompanyCode");
    if (!headerRes.recordset.length) return sendError(res, "Autoconer Machine Setting not found", 404);
    const h = headerRes.recordset[0];

    const detRes = await pool
      .request()
      .input("ACMachineSettingCode", sql.Int, code)
      .input("CompanyCode", sql.Int, companyCode)
      .query("SELECT * FROM vw_Prodn_Autoconer_MachineSettingDetails WHERE ACMachineSettingCode = @ACMachineSettingCode AND CompanyCode = @CompanyCode");

    const details = detRes.recordset.map((d) => ({
      GroupNo: d.GroupNo, DrumNoFrom: d.DrumNoFrom, DrumNoTo: d.DrumNoTo, AllottedDrum: d.AllottedDrum,
      CountNameCode: d.CountNameCode, CountName: d.CountName, ConeWeight: d.ConeWeight,
      TargetProdn: d.TargetProdn, Speed: d.Speed, MixingNameCode: d.MixingNameCode, MixingName: d.MixingName,
    }));
    // On edit the available drum equals the saved total (VB sets it from details).
    const availableDrum = detRes.recordset[0]?.TotalAllottedDrum ?? h.TotalAllottedDrum ?? 0;

    return sendSuccess(res, {
      header: {
        ACMachineSettingCode: h.ACMachineSettingCode, DepartmentCode: h.DepartmentCode,
        MachineCode: h.MachineCode, MachineName: h.MachineName, Status: h.Status,
        AvailableDrum: availableDrum,
      },
      details,
    });
  } catch (err) {
    console.error("DB Error (getById autoconer-machine-setting):", err);
    return sendError(res, err);
  }
};

const saveOrUpdate = async (req, res, isEdit) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = toInt(req.headers.companyCode);
    const userId = toInt(req.headers.userId);
    const nodeCode = toInt(req.headers.nodeCode);

    const body = req.body || {};
    const departmentCode = toInt(body.DepartmentCode);
    const machineCode = toInt(body.MachineCode);
    const availableDrum = toNum(body.AvailableDrum);
    const details = Array.isArray(body.details) ? body.details : [];

    if (!departmentCode) return sendError(res, "Select the Department Name", 400);
    if (!machineCode) return sendError(res, "Select the Machine Name", 400);

    const totalDrum = r2(details.reduce((a, d) => a + toNum(d.AllottedDrum), 0));
    const totalTarget = r2(details.reduce((a, d) => a + toNum(d.TargetProdn), 0));
    if (totalDrum <= 0) return sendError(res, "Enter the Drum No From", 400);
    if (totalDrum !== r2(availableDrum)) return sendError(res, "Please Check the Drum Allocation", 400);

    const editCode = isEdit ? toInt(req.params.code) : 0;
    if (isEdit && !editCode) return sendError(res, "Invalid ACMachineSettingCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    tx = new sql.Transaction(pool);
    await tx.begin();

    const hReq = new sql.Request(tx);
    hReq.input("User", sql.Int, userId);
    hReq.input("Node", sql.Int, nodeCode);
    if (isEdit) hReq.input("ACMachineSettingCode", sql.Int, editCode);
    hReq.input("DepartmentCode", sql.Int, departmentCode);
    hReq.input("MachineCode", sql.Int, machineCode);
    hReq.input("TotalAllottedDrum", sql.Decimal(18, 2), totalDrum);
    hReq.input("TotalTargetProdn", sql.Decimal(18, 2), totalTarget);
    hReq.input("Status", sql.Bit, toBit(body.Status));
    hReq.input("CompanyCode", sql.Int, companyCode);
    const acMachineSettingCode = await scalar(hReq, "sp_Prodn_Autoconer_MachineSetting_AddEdit");
    if (!acMachineSettingCode) throw new Error("Header save returned no ACMachineSettingCode");

    await new sql.Request(tx)
      .input("ACMachineSettingCode", sql.Int, acMachineSettingCode)
      .execute("sp_Prodn_AutoconerMachineSettingDetails_Delete");

    let g = 0;
    for (const d of details) {
      g += 1;
      const dr = new sql.Request(tx);
      dr.input("ACMachineSettingCode", sql.Int, acMachineSettingCode);
      dr.input("GroupNo", sql.VarChar(50), d.GroupNo || `G${g}`);
      dr.input("DrumNoFrom", sql.Decimal(18, 2), toNum(d.DrumNoFrom));
      dr.input("DrumNoTo", sql.Decimal(18, 2), toNum(d.DrumNoTo));
      dr.input("AllottedDrum", sql.Decimal(18, 2), toNum(d.AllottedDrum));
      dr.input("CountNameCode", sql.Int, toInt(d.CountNameCode));
      dr.input("ConeWeight", sql.Decimal(18, 3), toNum(d.ConeWeight));
      dr.input("TargetProdn", sql.Decimal(18, 3), toNum(d.TargetProdn));
      dr.input("Speed", sql.Decimal(18, 3), toNum(d.Speed));
      dr.input("MixingNameCode", sql.Int, toInt(d.MixingNameCode));
      await dr.execute("sp_Prodn_AutoconerMachineSettingDetails_Insert");
    }

    await tx.commit();
    return sendSuccess(res, { ACMachineSettingCode: acMachineSettingCode }, isEdit ? "The record is updated" : "The record is saved", isEdit ? 200 : 201);
  } catch (err) {
    if (tx) { try { await tx.rollback(); } catch (_) {} }
    if (err.message && err.message.includes("UK_")) {
      return sendError(res, "Already exist this Machine setting", 409);
    }
    console.error("DB Error (saveOrUpdate autoconer-machine-setting):", err);
    return sendError(res, err);
  }
};

// POST /autoconer-machine-setting/create
export const create = (req, res) => saveOrUpdate(req, res, false);
// PUT  /autoconer-machine-setting/update/:code
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /autoconer-machine-setting/delete/:code
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (!code) return sendError(res, "Invalid ACMachineSettingCode", 400);
    const pool = await getPool(req.headers.subdbname);
    await pool.request().input("ACMachineSettingCode", sql.Int, code).execute("sp_Prodn_Autoconer_MachineSetting_Delete");
    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("REFERENCE") || err.message.includes("FK_"))) {
      return sendError(res, "You can not delete the Autoconer Machine Setting!", 409);
    }
    console.error("DB Error (remove autoconer-machine-setting):", err);
    return sendError(res, err);
  }
};
