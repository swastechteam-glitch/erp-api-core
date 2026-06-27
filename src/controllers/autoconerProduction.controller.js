import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Autoconer Production Entry
//   (port of WinForms frmAutoconerProduction_New / frmAutoconerProductionDetails)
//   Header (No / Date / Branch / Shift / Supervisor / Monitor + NC Cone) and one
//   row per autoconer drum-group (loaded from vw_Prodn_Autoconer_MachineSettingDetails
//   for the branch). Master values (Speed / Cone Weight / Drum From-To / Target
//   Prodn) come from the machine setting; the user keys Employee / No.of Cones /
//   Waste / Idle Drum / Red Light / RCY / Cuts / Cfm / MIS. Derived columns mirror
//   the VB grid unbound expressions:
//     Run Drum  = DrumTo - DrumFrom + 1
//     Prodn     = round(NoofCones * ConeWeight, 2)
//     Effi      = TargetProdn>0 ? round(Prodn/TargetProdn*100, 2) : 0
//     UT        = round(100 - StopTime / (WorkingMins * RunDrum) * 100, 2)
//     Index     = round((Effi + UT) / 2, 2)
//     Waste %   = round(WasteKgs / (WasteKgs + Prodn) * 100, 2)
//   StopTime / Reason aggregate from the Stoppage grid per Machine + Count + Mixing.
//
//   Save is one transaction: header AddEdit (ExecuteScalar -> ACProdnCode) ->
//   details Delete + per-row Insert -> stoppage Delete + Insert -> employee
//   Delete(@ShiftCode,@CompanyCode) + per-row Insert. On CREATE it also runs the
//   setting-driven steps the VB does (machine-setting writeback, AutoLoad reset,
//   Direct count-prodn insert), gated by tbl_Setting flags.
//   UK_ violation -> "Already Exist the Shift Production".
// ---------------------------------------------------------------------------

const toInt = (v) => parseInt(v) || 0;
const toNum = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const D = (v) => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; };

const scalar = async (request, proc) => {
  const r = await request.execute(proc);
  const row = r.recordset && r.recordset[0];
  return row ? row[Object.keys(row)[0]] : undefined;
};

// Per-row server-authoritative compute (mirrors the BandedGridView unbound exprs).
const computeRow = (d, workingMins, stopTime) => {
  const drumFrom = toNum(d.DrumNoFrom);
  const drumTo = toNum(d.DrumNoTo);
  const runDrum = drumTo - drumFrom + 1 > 0 ? drumTo - drumFrom + 1 : 0;
  const noofCones = toNum(d.NoofCones);
  const coneWeight = toNum(d.ConeWeight);
  const targetProdn = toNum(d.TargetProdn);
  const wasteKgs = toNum(d.WasteKgs);

  const actProdn = r2(noofCones * coneWeight);
  const effi = targetProdn > 0 ? r2((actProdn / targetProdn) * 100) : 0;
  const denom = workingMins * runDrum;
  const ut = stopTime > 0 ? (denom > 0 ? r2(100 - (stopTime / denom) * 100) : 0) : 100;
  const index = r2((effi + ut) / 2);
  const wastePer = wasteKgs + actProdn > 0 ? r2((wasteKgs / (wasteKgs + actProdn)) * 100) : 0;
  const diff = r2(targetProdn - actProdn);

  return { drumFrom, drumTo, runDrum, noofCones, coneWeight, targetProdn, wasteKgs, actProdn, effi, ut, index, wastePer, diff };
};

// GET /autoconer-production/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = toInt(req.headers.companyCode);
    const pool = await getPool(req.headers.subdbname);

    const [branches, shifts, employees, reasons, counts, mixings] = await Promise.all([
      pool.request().query(`Select BranchCode, BranchName from tbl_Branch Where CompanyCode = ${companyCode} Order By BranchName`),
      pool.request().query("Select ShiftCode, ShiftName, WorkingMins from tbl_Shift Where ShiftCode IN (1,2,3) Order by ShiftName"),
      pool.request().query(`Select EmployeeCode, str_EmployeeID from vw_Employee_New Where CompanyCode = ${companyCode} AND DOL IS NULL Order by str_EmployeeID`),
      pool.request().query("Select StoppageReasonCode, StoppageReason, ShortName from tbl_StoppageReason ORDER BY StoppageReason"),
      pool.request().query("Select CountNameCode, CountName, ShortName, ConeWeight from vw_Prodn_Spinning_CountSetting"),
      pool.request().query("Select MixingNameCode, MixingName from tbl_MixingName Order By MixingName"),
    ]);

    return sendSuccess(res, {
      branches: branches.recordset.map((r) => ({ value: r.BranchCode, label: r.BranchName })),
      shifts: shifts.recordset.map((r) => ({ value: r.ShiftCode, label: r.ShiftName, workingMins: r.WorkingMins })),
      employees: employees.recordset.map((r) => ({ value: r.EmployeeCode, label: r.str_EmployeeID })),
      stoppageReasons: reasons.recordset.map((r) => ({ value: r.StoppageReasonCode, label: r.StoppageReason, shortName: r.ShortName })),
      countNames: counts.recordset.map((r) => ({ value: r.CountNameCode, label: r.ShortName || r.CountName, coneWeight: r.ConeWeight })),
      mixingNames: mixings.recordset.map((r) => ({ value: r.MixingNameCode, label: r.MixingName })),
    });
  } catch (err) {
    console.error("DB Error (getOptions autoconer-production):", err);
    return sendError(res, err);
  }
};

// GET /autoconer-production/machines?branchCode=
export const getMachines = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = toInt(req.headers.companyCode);
    const branchCode = toInt(req.query.branchCode);
    if (!branchCode) return sendSuccess(res, []);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .query(
        "select * from vw_Prodn_Autoconer_MachineSettingDetails Where CompanyCode = " +
          companyCode + " AND BranchCode = " + branchCode + " order by ACMachineSettingCode"
      );

    const machines = result.recordset.map((m) => ({
      ACMachineSettingCode: m.ACMachineSettingCode,
      MachineCode: m.MachineCode,
      MachineName: m.MachineName,
      MachineNo: m.MachineNo,
      MachineSortOrderNo: m.MachineSortOrderNo,
      MixingNameCode: m.MixingNameCode,
      MixingName: m.MixingName,
      CountNameCode: m.CountNameCode,
      CountName: m.ShortName ?? m.CountName,
      Speed: m.Speed,
      ConeWeight: m.ConeWeight,
      DrumNoFrom: m.DrumNoFrom,
      DrumNoTo: m.DrumNoTo,
      TargetProdn: m.TargetProdn,
    }));
    return sendSuccess(res, machines);
  } catch (err) {
    console.error("DB Error (getMachines autoconer-production):", err);
    return sendError(res, err);
  }
};

// GET /autoconer-production/next-no
export const getNextNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = toInt(req.headers.companyCode);
    const fyCode = toInt(req.headers.FYCode);
    const pool = await getPool(req.headers.subdbname);
    const no = await scalar(
      pool.request().input("CompanyCode", sql.Int, companyCode).input("FYCode", sql.Int, fyCode),
      "sp_Prodn_AutoconerProdnNo"
    );
    return sendSuccess(res, { no });
  } catch (err) {
    console.error("DB Error (getNextNo autoconer-production):", err);
    return sendError(res, err);
  }
};

// GET /autoconer-production/exists?date=&shiftCode=&branchCode=
export const checkExisting = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = toInt(req.headers.companyCode);
    const date = D(req.query.date);
    const shiftCode = toInt(req.query.shiftCode);
    const branchCode = toInt(req.query.branchCode);
    if (!date || !shiftCode || !branchCode) return sendSuccess(res, { exists: false });

    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("ACProdnDate", sql.DateTime, date)
      .input("ShiftCode", sql.Int, shiftCode)
      .input("BranchCode", sql.Int, branchCode)
      .query(
        "SELECT COUNT(*) AS Cnt FROM vw_Prodn_AutoconerProdn " +
          "WHERE CompanyCode = @CompanyCode AND CAST(ACProdnDate AS DATE) = CAST(@ACProdnDate AS DATE) " +
          "AND ShiftCode = @ShiftCode AND BranchCode = @BranchCode"
      );
    return sendSuccess(res, { exists: (r.recordset[0]?.Cnt || 0) > 0 });
  } catch (err) {
    console.error("DB Error (checkExisting autoconer-production):", err);
    return sendError(res, err);
  }
};

// GET /autoconer-production/lists
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = toInt(req.headers.companyCode);
    const fyCode = toInt(req.headers.FYCode);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .query(`SELECT * FROM vw_Prodn_AutoconerProdn WHERE CompanyCode = ${companyCode} AND FYCode = ${fyCode} ORDER BY ACProdnNo DESC`);
    const data = result.recordset.map((item) => ({ ...item, id: item.ACProdnCode }));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getList autoconer-production):", err);
    return sendError(res, err);
  }
};

// GET /autoconer-production/list/:code?shiftCode=
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = toInt(req.headers.companyCode);
    const code = toInt(req.params.code);
    const shiftCode = toInt(req.query.shiftCode);
    if (!code) return sendError(res, "Invalid ACProdnCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const detResult = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("ACProdnCode", sql.Int, code)
      .input("ShiftCode", sql.Int, shiftCode)
      .execute("sp_Prodn_AutoconerProdnDetails_GetAll");
    const rows = detResult.recordset || [];
    if (!rows.length) return sendError(res, "Autoconer Production not found", 404);

    const h = rows[0];
    const header = {
      ACProdnCode: h.ACProdnCode, ACProdnNo: h.ACProdnNo, ACProdnDate: h.ACProdnDate,
      BranchCode: h.BranchCode, ShiftCode: h.ShiftCode, SupervisorCode: h.SupervisorCode,
      MaistryCode: h.MaistryCode, NCCone: h.NCCone, ActualWorkingMins: h.ActualWorkingMins,
    };

    const details = rows.map((d) => ({
      ACMachineSettingCode: d.ACMachineSettingCode, MachineCode: d.MachineCode, MachineName: d.MachineName,
      MixingNameCode: d.MixingNameCode, MixingName: d.MixingName, CountNameCode: d.CountNameCode, CountName: d.CountName,
      EmployeeCode: d.EmployeeCode, EmployeeID: d.str_EmployeeID, Speed: d.DSpeed, ConeWeight: d.ConeWeight,
      DrumNoFrom: d.DrumNoFrom, DrumNoTo: d.DrumNoTo, TargetProdn: d.TargetProdnKgs, NoofCones: d.NoofCones,
      WasteKgs: d.WasteKgs, IdleDrum: d.IdleDrum, RedLight: d.RedLight, RepeatedCycle: d.RepeatedCycle,
      YarnJoint: d.YarnJoint, DAS: d.DAS, MIS: d.MIS, WorkingMins: d.ActualWorkingMins,
    }));

    const stopResult = await pool
      .request()
      .query(`select * from vw_Prodn_AutoconerStoppage where CompanyCode = ${companyCode} AND ACProdnCode = ${code}`);
    const stoppages = (stopResult.recordset || []).map((s) => ({
      MachineCode: s.MachineCode, MachineName: s.MachineNo, CountNameCode: s.CountNameCode, CountName: s.CountShortName,
      MixingNameCode: s.MixingNameCode, MixingName: s.MixingName, StoppageReasonCode: s.StoppageReasonCode,
      ShortName: s.ShortName, DrumFrom: s.DrumFrom, DrumTo: s.DrumTo, AllottedDrum: s.AllotedDrum,
      Minutes: s.Minutes, TotalMinutes: s.Hrs,
    }));

    return sendSuccess(res, { header, details, stoppages });
  } catch (err) {
    console.error("DB Error (getById autoconer-production):", err);
    return sendError(res, err);
  }
};

const saveOrUpdate = async (req, res, isEdit) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = toInt(req.headers.companyCode);
    const fyCode = toInt(req.headers.FYCode);
    const userId = toInt(req.headers.userId);
    const nodeCode = toInt(req.headers.nodeCode);

    const body = req.body || {};
    const branchCode = toInt(body.BranchCode);
    const shiftCode = toInt(body.ShiftCode);
    const supervisorCode = toInt(body.SupervisorCode);
    const maistryCode = toInt(body.MaistryCode);
    const acProdnDate = D(body.ACProdnDate);
    const ncCone = toNum(body.NCCone);
    const workingMins = toNum(body.WorkingMins);
    const details = Array.isArray(body.details) ? body.details : [];
    const stoppages = Array.isArray(body.stoppages) ? body.stoppages : [];

    if (!shiftCode) return sendError(res, "Select the Shift Name", 400);
    if (!supervisorCode) return sendError(res, "Select the Supervisor Name", 400);
    if (!maistryCode) return sendError(res, "Select the Maistry Name", 400);
    if (!details.length) return sendError(res, "No machine rows to save", 400);

    const editCode = isEdit ? toInt(req.params.code) : 0;
    if (isEdit && !editCode) return sendError(res, "Invalid ACProdnCode for update", 400);

    // Aggregate stoppage minutes / reason per Machine + Count + Mixing (VB Stoppage_Update).
    const stopByKey = new Map();
    for (const s of stoppages) {
      const k = `${toInt(s.MachineCode)}|${toInt(s.CountNameCode)}|${toInt(s.MixingNameCode)}`;
      if (!stopByKey.has(k)) stopByKey.set(k, { mins: 0, reasons: [] });
      const o = stopByKey.get(k);
      o.mins += toNum(s.TotalMinutes);
      if (s.ShortName) o.reasons.push(s.ShortName);
    }

    const computed = details.map((d) => {
      const stop = stopByKey.get(`${toInt(d.MachineCode)}|${toInt(d.CountNameCode)}|${toInt(d.MixingNameCode)}`) || { mins: 0, reasons: [] };
      const c = computeRow(d, workingMins, r2(stop.mins));
      return { d, c, stopTime: r2(stop.mins), reason: stop.reasons.join(",") };
    });

    // Totals (VB footer conventions).
    const sum = (f) => computed.reduce((a, x) => a + f(x), 0);
    const producing = computed.filter((x) => x.c.actProdn > 0);
    const selAvg = (f) => (producing.length ? r2(producing.reduce((a, x) => a + f(x), 0) / producing.length) : 0);

    const totalWorkedDrum = r2(sum((x) => x.c.runDrum));
    const totalStoppage = r2(sum((x) => x.stopTime));
    const denom = workingMins * totalWorkedDrum;
    const totalUtil = denom > 0 ? r2(100 - (totalStoppage / denom) * 100) : 0;
    const totalEffi = selAvg((x) => x.c.effi);
    const totals = {
      TotalAllottedDrum: totalWorkedDrum,
      TotalWorkedDrum: totalWorkedDrum,
      TotalWasteKgs: r2(sum((x) => x.c.wasteKgs)),
      TotalWastePer: selAvg((x) => x.c.wastePer),
      TotalNoofCones: r2(sum((x) => x.c.noofCones)),
      TotalProdnKgs: r2(sum((x) => x.c.actProdn)),
      TotalTargetProdnKgs: r2(sum((x) => x.c.targetProdn)),
      TotalDiff: r2(sum((x) => x.c.diff)),
      TotalStoppage: totalStoppage,
      TotalUtilisation: totalUtil,
      TotalEffi: totalEffi,
      TotalDSpeed: r2(sum((x) => toNum(x.d.Speed))),
      TotalIdleDrum: r2(sum((x) => toNum(x.d.IdleDrum))),
      TotalRedLight: r2(sum((x) => toNum(x.d.RedLight))),
      TotalRepeatedCycle: r2(sum((x) => toNum(x.d.RepeatedCycle))),
      TotalYarnJoint: r2(sum((x) => toNum(x.d.YarnJoint))),
      TotalActualWorkingMins: r2(sum(() => workingMins)),
      TotalIndex: r2((totalUtil + totalEffi) / 2),
    };

    const pool = await getPool(req.headers.subdbname);

    // Setting flags (drive the VB conditional steps on create).
    let autoLoad = false, direct = false;
    try {
      const s1 = await pool.request().query("SELECT TOP 1 1 AS F FROM tbl_Setting WHERE AutoConer_AutoLoad = 1");
      autoLoad = s1.recordset.length > 0;
    } catch (_) {}
    try {
      const s2 = await pool.request().query("SELECT TOP 1 1 AS F FROM tbl_Setting WHERE AutoConer_CountProdn_Direct = 1");
      direct = s2.recordset.length > 0;
    } catch (_) {}

    tx = new sql.Transaction(pool);
    await tx.begin();

    // Header AddEdit -> ACProdnCode
    const hReq = new sql.Request(tx);
    if (isEdit) hReq.input("ACProdnCode", sql.Int, editCode);
    hReq.input("ACProdnNo", sql.Int, toInt(body.ACProdnNo));
    hReq.input("ACProdnDate", sql.DateTime, acProdnDate);
    hReq.input("BranchCode", sql.Int, branchCode);
    hReq.input("ShiftCode", sql.Int, shiftCode);
    hReq.input("SupervisorCode", sql.Int, supervisorCode);
    hReq.input("MaistryCode", sql.Int, maistryCode);
    hReq.input("TotalAllottedDrum", sql.Decimal(18, 2), totals.TotalAllottedDrum);
    hReq.input("TotalWorkedDrum", sql.Decimal(18, 2), totals.TotalWorkedDrum);
    hReq.input("TotalWasteKgs", sql.Decimal(18, 2), totals.TotalWasteKgs);
    hReq.input("TotalWastePer", sql.Decimal(18, 2), totals.TotalWastePer);
    hReq.input("TotalNoofCones", sql.Decimal(18, 2), totals.TotalNoofCones);
    hReq.input("TotalProdnKgs", sql.Decimal(18, 2), totals.TotalProdnKgs);
    hReq.input("TotalTargetProdnKgs", sql.Decimal(18, 2), totals.TotalTargetProdnKgs);
    hReq.input("TotalDiff", sql.Decimal(18, 2), totals.TotalDiff);
    hReq.input("TotalStoppage", sql.Decimal(18, 2), totals.TotalStoppage);
    hReq.input("TotalUtilisation", sql.Decimal(18, 2), totals.TotalUtilisation);
    hReq.input("TotalEffi", sql.Decimal(18, 2), totals.TotalEffi);
    hReq.input("FYCode", sql.Int, fyCode);
    hReq.input("TotalDSpeed", sql.Decimal(18, 2), totals.TotalDSpeed);
    hReq.input("NCCone", sql.Decimal(18, 2), ncCone);
    hReq.input("TotalIdleDrum", sql.Decimal(18, 2), totals.TotalIdleDrum);
    hReq.input("TotalRedLight", sql.Decimal(18, 2), totals.TotalRedLight);
    hReq.input("TotalRepeatedCycle", sql.Decimal(18, 2), totals.TotalRepeatedCycle);
    hReq.input("TotalYarnJoint", sql.Decimal(18, 2), totals.TotalYarnJoint);
    hReq.input("TotalActualWorkingMins", sql.Decimal(18, 2), totals.TotalActualWorkingMins);
    hReq.input("TotalIndex", sql.Decimal(18, 2), totals.TotalIndex);
    hReq.input("CompanyCode", sql.Int, companyCode);
    hReq.input("User", sql.Int, userId);
    hReq.input("Node", sql.Int, nodeCode);
    const acProdnCode = await scalar(hReq, "sp_Prodn_AutoconerProdn_AddEdit");
    if (!acProdnCode) throw new Error("Header save returned no ACProdnCode");

    // Details: delete then per-row insert.
    await new sql.Request(tx).input("ACProdnCode", sql.Int, acProdnCode).execute("sp_Prodn_AutoconerProdnDetails_Delete");

    // On CREATE: AutoLoad resets all machine-setting details (VB).
    if (!isEdit && autoLoad) {
      await new sql.Request(tx).execute("sp_Prodn_AutoconerMachineSettingDetails_DeleteAll");
    }
    // On CREATE without AutoLoad: clear each machine setting's details (VB loop).
    if (!isEdit && !autoLoad) {
      for (const { d } of computed) {
        await new sql.Request(tx)
          .input("ACMachineSettingCode", sql.Int, toInt(d.ACMachineSettingCode))
          .execute("sp_Prodn_AutoconerMachineSettingDetails_Delete");
      }
    }

    let sno = 0;
    for (const { d, c, stopTime, reason } of computed) {
      sno += 1;
      const dr = new sql.Request(tx);
      dr.input("ACProdnCode", sql.Int, acProdnCode);
      dr.input("SNo", sql.Int, sno);
      dr.input("MachineCode", sql.Int, toInt(d.MachineCode));
      dr.input("EmployeeCode", sql.Int, toInt(d.EmployeeCode));
      dr.input("CountNameCode", sql.Int, toInt(d.CountNameCode));
      dr.input("GroupNo", sql.Int, toInt(d.MixingNameCode)); // VB passes MixingCode as GroupNo
      dr.input("DrumNoFrom", sql.Decimal(18, 2), c.drumFrom);
      dr.input("DrumNoTo", sql.Decimal(18, 2), c.drumTo);
      dr.input("AllottedDrum", sql.Decimal(18, 2), c.runDrum);
      dr.input("WorkedDrum", sql.Decimal(18, 2), c.runDrum);
      dr.input("NoofCones", sql.Decimal(18, 2), c.noofCones);
      dr.input("ConeWeight", sql.Decimal(18, 3), c.coneWeight);
      dr.input("ProdnKgs", sql.Decimal(18, 2), c.actProdn);
      dr.input("TargetProdnKgs", sql.Decimal(18, 2), c.targetProdn);
      dr.input("Diff", sql.Decimal(18, 2), c.diff);
      dr.input("WasteKgs", sql.Decimal(18, 3), c.wasteKgs);
      dr.input("WastePer", sql.Decimal(18, 2), c.wastePer);
      dr.input("Stoppage", sql.Decimal(18, 2), stopTime);
      dr.input("Utilisation", sql.Decimal(18, 2), c.ut);
      dr.input("ProdnEffi", sql.Decimal(18, 2), c.effi);
      dr.input("ACMachineSettingCode", sql.Int, toInt(d.ACMachineSettingCode));
      dr.input("StoppageReason", sql.VarChar(sql.MAX), reason || "");
      dr.input("MixingNameCode", sql.Int, toInt(d.MixingNameCode));
      dr.input("ActualWorkingMins", sql.Decimal(18, 2), workingMins);
      dr.input("DSpeed", sql.Decimal(18, 2), toNum(d.Speed));
      dr.input("RedLight", sql.Decimal(18, 2), toNum(d.RedLight));
      dr.input("IdleDrum", sql.Decimal(18, 2), toNum(d.IdleDrum));
      dr.input("RepeatedCycle", sql.Decimal(18, 2), toNum(d.RepeatedCycle));
      dr.input("YarnJoint", sql.Decimal(18, 2), toNum(d.YarnJoint));
      dr.input("Indexs", sql.Decimal(18, 2), c.index);
      dr.input("DAS", sql.Decimal(18, 2), toNum(d.DAS));
      dr.input("MIS", sql.Decimal(18, 2), toNum(d.MIS));
      await dr.execute("sp_Prodn_AutoconerProdnDetails_Insert");

      // On CREATE: write the latest values back to the machine setting count (VB).
      if (!isEdit) {
        const ur = new sql.Request(tx);
        ur.input("MachineCode", sql.Int, toInt(d.MachineCode));
        ur.input("DrumNoFrom", sql.Decimal(18, 2), c.drumFrom);
        ur.input("DrumNoTo", sql.Decimal(18, 2), c.drumTo);
        ur.input("AllottedDrum", sql.Decimal(18, 2), c.runDrum);
        ur.input("CountNameCode", sql.Int, toInt(d.CountNameCode));
        ur.input("ConeWeight", sql.Decimal(18, 3), c.coneWeight);
        ur.input("MixingNameCode", sql.Int, toInt(d.MixingNameCode));
        ur.input("Speed", sql.Decimal(18, 2), toNum(d.Speed));
        ur.input("ActualWorkingMins", sql.Decimal(18, 2), workingMins);
        ur.input("CompanyCode", sql.Int, companyCode);
        await ur.execute("sp_Prodn_Autoconer_MachineSettingCount_Update");
      }
    }

    // Stoppage: delete then insert.
    await new sql.Request(tx).input("ACProdnCode", sql.Int, acProdnCode).execute("sp_Prodn_AutoconerStoppage_Delete");
    for (const s of stoppages) {
      const sr = new sql.Request(tx);
      sr.input("ACProdnCode", sql.Int, acProdnCode);
      sr.input("MachineCode", sql.Int, toInt(s.MachineCode));
      sr.input("StoppageReasonCode", sql.Int, toInt(s.StoppageReasonCode));
      sr.input("Hrs", sql.Decimal(18, 2), toNum(s.TotalMinutes));
      sr.input("DrumFrom", sql.Decimal(18, 2), toNum(s.DrumFrom));
      sr.input("DrumTo", sql.Decimal(18, 2), toNum(s.DrumTo));
      sr.input("AllotedDrum", sql.Decimal(18, 2), toNum(s.AllottedDrum));
      sr.input("CountNameCode", sql.Int, toInt(s.CountNameCode));
      sr.input("MixingNameCode", sql.Int, toInt(s.MixingNameCode));
      sr.input("Minutes", sql.Decimal(18, 2), toNum(s.Minutes));
      await sr.execute("sp_Prodn_AutoconerStoppage_Insert");
    }

    // Shift employee rebuild (keyed by shift, VB).
    await new sql.Request(tx)
      .input("ShiftCode", sql.Int, shiftCode)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_Prodn_AutoconerEmployee_Delete");
    for (const { d } of computed) {
      const er = new sql.Request(tx);
      er.input("ShiftCode", sql.Int, shiftCode);
      er.input("MachineCode", sql.Int, toInt(d.MachineCode));
      er.input("EmployeeCode", sql.Int, toInt(d.EmployeeCode));
      er.input("CompanyCode", sql.Int, companyCode);
      await er.execute("sp_Prodn_AutoconerEmployee_Insert");
    }

    // Direct count-prodn generation (VB, when the setting is on).
    if (direct) {
      await new sql.Request(tx).execute("sp_Prodn_AutoconerCountProdn_DirectInsert");
      await new sql.Request(tx).execute("sp_Prodn_AutoconerCountProdnDetails_DirectInsert");
    }

    await tx.commit();
    return sendSuccess(res, { ACProdnCode: acProdnCode }, isEdit ? "The record is updated" : "The record is saved", isEdit ? 200 : 201);
  } catch (err) {
    if (tx) { try { await tx.rollback(); } catch (_) {} }
    if (err.message && err.message.includes("UK_")) {
      return sendError(res, "Already Exist the Shift Production", 409);
    }
    console.error("DB Error (saveOrUpdate autoconer-production):", err);
    return sendError(res, err);
  }
};

// POST /autoconer-production/create
export const create = (req, res) => saveOrUpdate(req, res, false);
// PUT  /autoconer-production/update/:code
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /autoconer-production/delete/:code
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = toInt(req.headers.companyCode);
    const code = toInt(req.params.code);
    if (!code) return sendError(res, "Invalid ACProdnCode", 400);
    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("ACProdnCode", sql.Int, code)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_AutoconerProdnDetails_Delete");
    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("REFERENCE") || err.message.includes("FK_"))) {
      return sendError(res, "You can not delete the Autoconer!", 409);
    }
    console.error("DB Error (remove autoconer-production):", err);
    return sendError(res, err);
  }
};
