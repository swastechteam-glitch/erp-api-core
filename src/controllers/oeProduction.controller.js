import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// OE Production Entry
//   (port of WinForms frmOEProduction_New / frmOEProductionDetails_New)
//   OE-table twin of Spinning Production: header (No / Date / Branch / Shift /
//   Supervisor / Monitor + Adash Cops) and one row per OE frame (loaded from the
//   branch's OE frame settings, vw_Prodn_OE_FrameSetting). Master values (Actual
//   Count / TPI / Spindle / Speed / Spindle Constant / Std Effi / 40s Factor /
//   Target GPS) come from the frame setting; the user keys Employee / Hank / Waste
//   / EB & Doff details; the server recomputes every derived column from the OE
//   grid unbound expressions:
//     Prodn.Conts  = round(1/2.2046/ActualCount * NoOfSpindle * (StdEffi/100), 2)
//     Speed        = round(Hank * Prodn.Conts, 2)
//     Std Prodn    = round(TargetGPS * NoOfSpindle / 2, 2)        (OE: /2, not /1000)
//     Act Prodn    = round(MachineProduction + DiffProdn, 2)
//     Worked Spl.  = StopTime==WorkingMins ? 0 : round(NoOfSpindle - NoOfSpindle/WorkingMins*StopTime, 2)
//     GMS/SPL      = WorkedSpl==0 ? 0 : round(ActProdn / WorkedSpl * 2, 2)   (OE: *2, not *1000)
//     40s Value    = round(GMS/SPL * 40sFactor, 2)
//     UT           = round(100 - StopTime/WorkingMins*100, 2)
//     Effi         = (UT>0 && StdProdn>0) ? round(ActProdn/StdProdn*UT, 2) : 0   (OE form)
//     MPI          = round(40sValue * UT / 110, 2)
//     Diff         = round(StdProdn - ActProdn, 2)
//     Waste %      = round(WasteKgs/(WasteKgs+ActProdn)*100, 2)
//     TM           = round(TPI / sqrt(ActualCount), 2)
//   StopTime / Reason aggregate from the Stoppage grid per Machine + Count.
//
//   Save is one transaction: header AddEdit (ExecuteScalar -> SpgProdnCode) ->
//   details Delete + per-row Insert -> stoppage Delete + Insert -> employee
//   Delete(@SpgProdnCode,@CompanyCode) + per-row Insert; on CREATE it also runs
//   sp_Prodn_OE_FramSetting_Update per row (writes back the latest setting).
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

// Per-row server-authoritative compute (mirrors the OE BandedGridView unbound exprs).
const computeRow = (d, workingMins, stopTime) => {
  const actualCount = toNum(d.ActualCount);
  const noOfSpindle = toNum(d.AllottedSpindle ?? d.NoOfSpindle ?? d.ActualSpindle);
  const stdEffi = toNum(d.StdEffi ?? d.Effi);
  const targetGPS = toNum(d.TargetGPS ?? d.MachineGPS);
  const conv40sFactor = toNum(d.ConversionValue40s ?? d["40s_ConversionValue"]);
  const tpi = toNum(d.TPI);
  const hank = toNum(d.Hank);
  const wasteKgs = toNum(d.WasteKgs);
  const machineProduction = toNum(d.MachineProduction);
  const diffProdn = toNum(d.DiffProdn);

  const constant = actualCount > 0 ? r2((1 / 2.2046 / actualCount) * noOfSpindle * (stdEffi / 100)) : 0;
  const speed = r2(hank * constant);
  const stdProdn = r2((targetGPS * noOfSpindle) / 2); // OE: /2 (Kg/Day per shift), not /1000
  const actProdn = r2(machineProduction + diffProdn);
  const workedSpindle =
    stopTime === workingMins ? 0 : workingMins > 0 ? r2(noOfSpindle - (noOfSpindle / workingMins) * stopTime) : noOfSpindle;
  const gmsSpl = workedSpindle === 0 ? 0 : r2((actProdn / workedSpindle) * 2); // OE: *2, not *1000
  const conv40sValue = r2(gmsSpl * conv40sFactor);
  const ut = stopTime > 0 ? (workingMins > 0 ? r2(100 - (stopTime / workingMins) * 100) : 0) : 100;
  const effi = ut > 0 && stdProdn > 0 ? r2((actProdn / stdProdn) * ut) : 0; // OE: *UT
  const mpi = r2((conv40sValue * ut) / 110);
  const diff = r2(stdProdn - actProdn);
  const wastePer = wasteKgs + actProdn > 0 ? r2((wasteKgs / (wasteKgs + actProdn)) * 100) : 0;
  const tm = actualCount > 0 ? r2(tpi / Math.sqrt(actualCount)) : 0;

  return { actualCount, noOfSpindle, stdEffi, targetGPS, conv40sFactor, tpi, hank, wasteKgs,
    constant, speed, stdProdn, actProdn, workedSpindle, gmsSpl, conv40sValue, ut, effi, mpi, diff, wastePer, tm };
};

// GET /oe-production/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = toInt(req.headers.companyCode);
    const pool = await getPool(req.headers.subdbname);

    const [branches, shifts, employees, reasons, counts] = await Promise.all([
      pool.request().query(`Select BranchCode, BranchName from tbl_Branch Where CompanyCode = ${companyCode} Order By BranchName`),
      pool.request().query(`Select ShiftCode, ShiftName, WorkingMins from tbl_Shift Where CompanyCode = ${companyCode} AND ShiftCode IN (1,2,3,5,6,7) Order by ShiftName`),
      pool.request().query(`Select EmployeeCode, str_EmployeeID from vw_Employee_New Where CompanyCode = ${companyCode} AND DOL IS NULL Order by EmployeeID`),
      pool.request().query("Select StoppageReasonCode, StoppageReason, ShortName from tbl_StoppageReason ORDER BY StoppageReason"),
      pool.request().query("Select CountNameCode, CountName, ShortName from tbl_CountName Order By CountName"),
    ]);

    return sendSuccess(res, {
      branches: branches.recordset.map((r) => ({ value: r.BranchCode, label: r.BranchName })),
      shifts: shifts.recordset.map((r) => ({ value: r.ShiftCode, label: r.ShiftName, workingMins: r.WorkingMins })),
      employees: employees.recordset.map((r) => ({ value: r.EmployeeCode, label: r.str_EmployeeID })),
      stoppageReasons: reasons.recordset.map((r) => ({ value: r.StoppageReasonCode, label: r.StoppageReason, shortName: r.ShortName })),
      countNames: counts.recordset.map((r) => ({ value: r.CountNameCode, label: r.ShortName || r.CountName })),
    });
  } catch (err) {
    console.error("DB Error (getOptions oe-production):", err);
    return sendError(res, err);
  }
};

// GET /oe-production/machines?branchCode=
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
        "Select * from vw_Prodn_OE_FrameSetting Where Status = 1 AND CompanyCode = " +
          companyCode + " AND BranchCode = " + branchCode + " order by MachineSortOrderNo"
      );

    const machines = result.recordset.map((m) => ({
      SpgFrameSettingCode: m.SpgFrameSettingCode,
      MachineCode: m.MachineCode,
      MachineName: m.MachineName,
      MachineNo: m.MachineNo,
      MachineSortOrderNo: m.MachineSortOrderNo,
      MixingNameCode: m.MixingNameCode,
      MixingName: m.MixingName,
      CountNameCode: m.CountNameCode,
      CountName: m.ShortName ?? m.CountName,
      ConversionValue40s: m["40s_ConversionValue"],
      ActualSpindle: m.ActualSpindle,
      ActualCount: m.ActualCount,
      Speed: m.Speed,
      TPI: m.TPI,
      SpindleConstant: m.SpindleConstant,
      StdEffi: m.Effi,
      TargetGPS: m.MachineGPS,
    }));
    return sendSuccess(res, machines);
  } catch (err) {
    console.error("DB Error (getMachines oe-production):", err);
    return sendError(res, err);
  }
};

// GET /oe-production/next-no
export const getNextNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = toInt(req.headers.companyCode);
    const fyCode = toInt(req.headers.FYCode);
    const pool = await getPool(req.headers.subdbname);
    const no = await scalar(
      pool.request().input("CompanyCode", sql.Int, companyCode).input("FYCode", sql.Int, fyCode),
      "sp_Prodn_OEProdnNo"
    );
    return sendSuccess(res, { no });
  } catch (err) {
    console.error("DB Error (getNextNo oe-production):", err);
    return sendError(res, err);
  }
};

// GET /oe-production/exists?date=&shiftCode=&branchCode=
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
      .input("SpgProdnDate", sql.DateTime, date)
      .input("ShiftCode", sql.Int, shiftCode)
      .input("BranchCode", sql.Int, branchCode)
      .query(
        "SELECT COUNT(*) AS Cnt FROM vw_Prodn_OEProdn " +
          "WHERE CompanyCode = @CompanyCode AND CAST(SpgProdnDate AS DATE) = CAST(@SpgProdnDate AS DATE) " +
          "AND ShiftCode = @ShiftCode AND BranchCode = @BranchCode"
      );
    return sendSuccess(res, { exists: (r.recordset[0]?.Cnt || 0) > 0 });
  } catch (err) {
    console.error("DB Error (checkExisting oe-production):", err);
    return sendError(res, err);
  }
};

// GET /oe-production/lists
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = toInt(req.headers.companyCode);
    const fyCode = toInt(req.headers.FYCode);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .query(`SELECT * FROM vw_Prodn_OEProdn WHERE CompanyCode = ${companyCode} AND FYCode = ${fyCode} ORDER BY SpgProdnNo DESC`);
    const data = result.recordset.map((item) => ({ ...item, id: item.SpgProdnCode }));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getList oe-production):", err);
    return sendError(res, err);
  }
};

// GET /oe-production/list/:code?shiftCode=
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = toInt(req.headers.companyCode);
    const code = toInt(req.params.code);
    const shiftCode = toInt(req.query.shiftCode);
    if (!code) return sendError(res, "Invalid SpgProdnCode", 400);

    const pool = await getPool(req.headers.subdbname);

    const detResult = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("SpgProdnCode", sql.Int, code)
      .input("ShiftCode", sql.Int, shiftCode)
      .execute("sp_Prodn_OEProdnDetails_GetAll");
    const rows = detResult.recordset || [];
    if (!rows.length) return sendError(res, "OE Production not found", 404);

    const h = rows[0];
    const header = {
      SpgProdnCode: h.SpgProdnCode, SpgProdnNo: h.SpgProdnNo, SpgProdnDate: h.SpgProdnDate,
      BranchCode: h.BranchCode, ShiftCode: h.ShiftCode, SupervisorCode: h.SupervisorCode,
      MaistryCode: h.MaistryCode, AdashCops: h.AdashCops, ActualWorkingMins: h.ActualWorkingMins,
    };

    const details = rows.map((d) => ({
      SpgFrameSettingCode: d.SpgFrameSettingCode, MachineCode: d.MachineCode, MachineName: d.MachineNo,
      MixingNameCode: d.MixingNameCode, MixingName: d.MixingName, CountNameCode: d.CountNameCode,
      CountName: d.CountName, EmployeeCode: d.EmployeeCode, EmployeeID: d.str_EmployeeID,
      ActualCount: d.ActualCount, TPI: d.TPI, AllottedSpindle: d.AllottedSpindle,
      SpindleConstant: d.SpindleConstant, StdEffi: d.StdEff, TargetGPS: d.TargetGPS,
      ConversionValue40s: d["40sConversionFactor"], Hank: d.Hank, WasteKgs: d.WasteKgs,
      EndBreakMins: d.EndBreakMins, NofDoff: d.NofDoff, DoffTime: d.NofDoffTime,
      MachineProduction: d.MachineProduction, DiffProdn: d.DiffProdn, UltimoSpeed: d.UltimoSpeed,
      CopContent: d.CpoContent, EBStartup: d.EB_StartUp, EBTotal: d.EB_Total, EBSH: d.EBSH, EM: d.EM,
      MachineStopTime: d.MC_StopTime, TotalStopTime: d.TotalStopTime, NoOfStop: d.NoOfStop,
      RougePer: d.RougePer, EBUnit: d.EBUnit, UKG: d.UKG, AlloSpindleGPS: d.AlloSpindleGPS,
      WorkingMins: d.ActualWorkingMins,
    }));

    const stopResult = await pool
      .request()
      .query(`select * from vw_Prodn_OEStoppage where CompanyCode = ${companyCode} AND SpgProdnCode = ${code}`);
    const stoppages = (stopResult.recordset || []).map((s) => ({
      MachineCode: s.MachineCode, MachineName: s.MachineNo, CountNameCode: s.CountNameCode, CountName: s.CountName,
      StoppageReasonCode: s.StoppageReasonCode, ShortName: s.ShortName, Minutes: s.Hrs,
    }));

    return sendSuccess(res, { header, details, stoppages });
  } catch (err) {
    console.error("DB Error (getById oe-production):", err);
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
    const spgProdnDate = D(body.SpgProdnDate);
    const adashCops = toNum(body.AdashCops);
    const workingMins = toNum(body.WorkingMins);
    const details = Array.isArray(body.details) ? body.details : [];
    const stoppages = Array.isArray(body.stoppages) ? body.stoppages : [];

    if (!branchCode) return sendError(res, "Select the Branch Name", 400);
    if (!shiftCode) return sendError(res, "Select the Shift Name", 400);
    if (!supervisorCode) return sendError(res, "Select the Supervisor Name", 400);
    if (!maistryCode) return sendError(res, "Select the Maistry Name", 400);
    if (!details.length) return sendError(res, "No machine rows to save", 400);

    const editCode = isEdit ? toInt(req.params.code) : 0;
    if (isEdit && !editCode) return sendError(res, "Invalid SpgProdnCode for update", 400);

    // Aggregate stoppage minutes / reason per Machine + Count (VB Stoppage_Update).
    const stopByKey = new Map();
    for (const s of stoppages) {
      const k = `${toInt(s.MachineCode)}|${toInt(s.CountNameCode)}`;
      if (!stopByKey.has(k)) stopByKey.set(k, { mins: 0, reasons: [] });
      const o = stopByKey.get(k);
      o.mins += toNum(s.Minutes);
      if (s.ShortName) o.reasons.push(s.ShortName);
    }

    const computed = details.map((d) => {
      const stop = stopByKey.get(`${toInt(d.MachineCode)}|${toInt(d.CountNameCode)}`) || { mins: 0, reasons: [] };
      const c = computeRow(d, workingMins, r2(stop.mins));
      return { d, c, stopTime: r2(stop.mins), reason: stop.reasons.join(",") };
    });

    // Totals (VB footer conventions).
    const sum = (f) => computed.reduce((a, x) => a + f(x), 0);
    const producing = computed.filter((x) => x.c.hank > 0);
    const selAvg = (f) => (producing.length ? r2(producing.reduce((a, x) => a + f(x), 0) / producing.length) : 0);
    const avgAll = (f) => (computed.length ? r2(sum(f) / computed.length) : 0);

    const totalProdn = r2(sum((x) => x.c.actProdn));
    const totalSTDProdn = r2(sum((x) => x.c.stdProdn));
    const totalUtil = avgAll((x) => x.c.ut);
    const totalEffi = selAvg((x) => x.c.effi);
    const totals = {
      TotalActualHank: r2(sum((x) => x.c.hank)),
      TotalHank: avgAll((x) => x.c.hank),
      TotalWasteKgs: r2(sum((x) => x.c.wasteKgs)),
      TotalWastePer: selAvg((x) => x.c.wastePer),
      TotalTargetProdn: totalSTDProdn,
      TotalProdn: totalProdn,
      TotalDiff: r2(sum((x) => x.c.diff)),
      TotalStoppage: r2(sum((x) => x.stopTime)),
      TotalAllottedSpindle: r2(sum((x) => x.c.noOfSpindle)),
      TotalWorkedSpindle: r2(sum((x) => x.c.workedSpindle)),
      TotalUtilisation: totalUtil,
      TotalEffi: totalEffi,
      Total40sConversionKgs: selAvg((x) => x.c.conv40sValue),
      Total40sConversionGps: selAvg((x) => x.c.gmsSpl),
      TotalMPI: r2((totalUtil + totalEffi) / 2),
      TotalDSpeed: r2(sum((x) => x.c.speed)),
      TotalTPI: avgAll((x) => x.c.tpi),
    };

    const pool = await getPool(req.headers.subdbname);
    tx = new sql.Transaction(pool);
    await tx.begin();

    // Header AddEdit -> SpgProdnCode
    const hReq = new sql.Request(tx);
    if (isEdit) hReq.input("SpgProdnCode", sql.Int, editCode);
    hReq.input("SpgProdnNo", sql.Int, toInt(body.SpgProdnNo));
    hReq.input("SpgProdnDate", sql.DateTime, spgProdnDate);
    hReq.input("BranchCode", sql.Int, branchCode);
    hReq.input("ShiftCode", sql.Int, shiftCode);
    hReq.input("SupervisorCode", sql.Int, supervisorCode);
    hReq.input("MaistryCode", sql.Int, maistryCode);
    hReq.input("TotalActualHank", sql.Decimal(18, 2), totals.TotalActualHank);
    hReq.input("TotalHank", sql.Decimal(18, 2), totals.TotalHank);
    hReq.input("TotalWasteKgs", sql.Decimal(18, 2), totals.TotalWasteKgs);
    hReq.input("TotalWastePer", sql.Decimal(18, 2), totals.TotalWastePer);
    hReq.input("TotalTargetProdn", sql.Decimal(18, 2), totals.TotalTargetProdn);
    hReq.input("TotalProdn", sql.Decimal(18, 2), totals.TotalProdn);
    hReq.input("TotalDiff", sql.Decimal(18, 2), totals.TotalDiff);
    hReq.input("TotalStoppage", sql.Decimal(18, 2), totals.TotalStoppage);
    hReq.input("TotalAllottedSpindle", sql.Decimal(18, 2), totals.TotalAllottedSpindle);
    hReq.input("TotalWorkedSpindle", sql.Decimal(18, 2), totals.TotalWorkedSpindle);
    hReq.input("TotalUtilisation", sql.Decimal(18, 2), totals.TotalUtilisation);
    hReq.input("TotalEffi", sql.Decimal(18, 2), totals.TotalEffi);
    hReq.input("Total40sConversionKgs", sql.Decimal(18, 2), totals.Total40sConversionKgs);
    hReq.input("Total40sConversionGps", sql.Decimal(18, 2), totals.Total40sConversionGps);
    hReq.input("TotalMPI", sql.Decimal(18, 2), totals.TotalMPI);
    hReq.input("TotalDSpeed", sql.Decimal(18, 2), totals.TotalDSpeed);
    hReq.input("TotalTPI", sql.Decimal(18, 2), totals.TotalTPI);
    hReq.input("AdashCops", sql.Decimal(18, 2), adashCops);
    hReq.input("CompanyCode", sql.Int, companyCode);
    hReq.input("FYCode", sql.Int, fyCode);
    hReq.input("User", sql.Int, userId);
    hReq.input("Node", sql.Int, nodeCode);
    const spgProdnCode = await scalar(hReq, "sp_Prodn_OEProdn_AddEdit");
    if (!spgProdnCode) throw new Error("Header save returned no SpgProdnCode");

    // Details: delete then per-row insert.
    await new sql.Request(tx).input("SpgProdnCode", sql.Int, spgProdnCode).execute("sp_Prodn_OEProdnDetails_Delete");

    let sno = 0;
    for (const { d, c, stopTime, reason } of computed) {
      sno += 1;
      const dr = new sql.Request(tx);
      dr.input("SpgProdnCode", sql.Int, spgProdnCode);
      dr.input("SNo", sql.Int, sno);
      dr.input("MachineCode", sql.Int, toInt(d.MachineCode));
      dr.input("EmployeeCode", sql.Int, toInt(d.EmployeeCode));
      dr.input("CountNameCode", sql.Int, toInt(d.CountNameCode));
      dr.input("ActualHank", sql.Decimal(18, 3), c.hank);
      dr.input("Hank", sql.Decimal(18, 3), c.hank);
      dr.input("WasteKgs", sql.Decimal(18, 3), c.wasteKgs);
      dr.input("WastePer", sql.Decimal(18, 2), c.wastePer);
      dr.input("TargetProdn", sql.Decimal(18, 2), c.stdProdn);
      dr.input("Prodn", sql.Decimal(18, 2), c.actProdn);
      dr.input("Diff", sql.Decimal(18, 2), c.diff);
      dr.input("Stoppage", sql.Decimal(18, 2), stopTime);
      dr.input("AllottedSpindle", sql.Decimal(18, 2), c.noOfSpindle);
      dr.input("WorkedSpindle", sql.Decimal(18, 2), c.workedSpindle);
      dr.input("Utilisation", sql.Decimal(18, 2), c.ut);
      dr.input("ProdnEffi", sql.Decimal(18, 2), c.effi);
      dr.input("ProdnConts", sql.Decimal(18, 3), c.constant);
      dr.input("SpgFrameSettingCode", sql.Int, toInt(d.SpgFrameSettingCode));
      dr.input("StoppageReason", sql.VarChar(sql.MAX), reason || "");
      dr.input("40s_ConversionValue", sql.Decimal(18, 2), c.conv40sValue);
      dr.input("40sConversionKgs", sql.Decimal(18, 3), c.conv40sFactor);
      dr.input("40sConversionGps", sql.Decimal(18, 2), c.gmsSpl);
      dr.input("ActualCount", sql.Decimal(18, 2), c.actualCount);
      dr.input("MixingNameCode", sql.Int, toInt(d.MixingNameCode));
      dr.input("EndBreakMins", sql.Decimal(18, 2), toNum(d.EndBreakMins));
      dr.input("GmsSpl", sql.Decimal(18, 2), c.gmsSpl);
      dr.input("SpindleConstant", sql.Decimal(18, 2), toNum(d.SpindleConstant));
      dr.input("40sConversionFactor", sql.Decimal(18, 3), c.conv40sFactor);
      dr.input("ActualWorkingMins", sql.Decimal(18, 2), workingMins);
      dr.input("DSpeed", sql.Decimal(18, 2), c.speed);
      dr.input("TPI", sql.Decimal(18, 2), c.tpi);
      dr.input("MPI", sql.Decimal(18, 2), c.mpi);
      dr.input("Constant", sql.Decimal(18, 3), c.constant);
      dr.input("EBUnit", sql.Decimal(18, 2), toNum(d.EBUnit));
      dr.input("UKG", sql.Decimal(18, 2), toNum(d.UKG));
      dr.input("TM", sql.Decimal(18, 2), c.tm);
      dr.input("TargetGPS", sql.Decimal(18, 2), c.targetGPS);
      dr.input("AlloSpindleGPS", sql.Decimal(18, 2), toNum(d.AlloSpindleGPS));
      dr.input("NofDoff", sql.Decimal(18, 2), toNum(d.NofDoff));
      dr.input("NofDoffTime", sql.Decimal(18, 2), toNum(d.DoffTime));
      dr.input("CpoContent", sql.Decimal(18, 2), toNum(d.CopContent));
      dr.input("MachineProduction", sql.Decimal(18, 2), toNum(d.MachineProduction));
      dr.input("EB_StartUp", sql.Decimal(18, 2), toNum(d.EBStartup));
      dr.input("EB_Total", sql.Decimal(18, 2), toNum(d.EBTotal));
      dr.input("EBSH", sql.Decimal(18, 2), toNum(d.EBSH));
      dr.input("EM", sql.Decimal(18, 2), toNum(d.EM));
      dr.input("MC_StopTime", sql.Decimal(18, 2), toNum(d.MachineStopTime));
      dr.input("TotalStopTime", sql.Decimal(18, 2), toNum(d.TotalStopTime));
      dr.input("NoOfStop", sql.Decimal(18, 2), toNum(d.NoOfStop));
      dr.input("UltimoSpeed", sql.Decimal(18, 2), toNum(d.UltimoSpeed));
      dr.input("RougePer", sql.Decimal(18, 2), toNum(d.RougePer));
      dr.input("DiffProdn", sql.Decimal(18, 2), toNum(d.DiffProdn));
      await dr.execute("sp_Prodn_OEProdnDetails_Insert");
    }

    // Stoppage: delete then insert.
    await new sql.Request(tx).input("SpgProdnCode", sql.Int, spgProdnCode).execute("sp_Prodn_OEStoppage_Delete");
    for (const s of stoppages) {
      const sr = new sql.Request(tx);
      sr.input("SpgProdnCode", sql.Int, spgProdnCode);
      sr.input("MachineCode", sql.Int, toInt(s.MachineCode));
      sr.input("StoppageReasonCode", sql.Int, toInt(s.StoppageReasonCode));
      sr.input("Hrs", sql.Decimal(18, 2), toNum(s.Minutes));
      sr.input("CountNameCode", sql.Int, toInt(s.CountNameCode));
      await sr.execute("sp_Prodn_OEStoppage_Insert");
    }

    // Shift employee rebuild.
    await new sql.Request(tx)
      .input("SpgProdnCode", sql.Int, spgProdnCode)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_Prodn_OEEmployee_Delete");
    for (const { d } of computed) {
      const er = new sql.Request(tx);
      er.input("SpgProdnCode", sql.Int, spgProdnCode);
      er.input("ShiftCode", sql.Int, shiftCode);
      er.input("CompanyCode", sql.Int, companyCode);
      er.input("MachineCode", sql.Int, toInt(d.MachineCode));
      er.input("EmployeeCode", sql.Int, toInt(d.EmployeeCode));
      await er.execute("sp_Prodn_OEEmployee_Insert");
    }

    // On CREATE only: write the latest values back to the frame setting (VB).
    if (!isEdit) {
      for (const { d, c } of computed) {
        const ur = new sql.Request(tx);
        ur.input("MachineCode", sql.Int, toInt(d.MachineCode));
        ur.input("CountNameCode", sql.Int, toInt(d.CountNameCode));
        ur.input("ActualCount", sql.Decimal(18, 2), c.actualCount);
        ur.input("Constant", sql.Decimal(18, 3), c.constant);
        ur.input("40s_ConversionValue", sql.Decimal(18, 3), c.conv40sFactor);
        ur.input("TPI", sql.Decimal(18, 2), c.tpi);
        ur.input("DSpeed", sql.Decimal(18, 2), c.speed);
        ur.input("Hank", sql.Decimal(18, 3), c.hank);
        ur.input("SpindleConstant", sql.Decimal(18, 2), toNum(d.SpindleConstant));
        ur.input("CompanyCode", sql.Int, companyCode);
        await ur.execute("sp_Prodn_OE_FramSetting_Update");
      }
    }

    await tx.commit();
    return sendSuccess(res, { SpgProdnCode: spgProdnCode }, isEdit ? "The record is updated" : "The record is saved", isEdit ? 200 : 201);
  } catch (err) {
    if (tx) { try { await tx.rollback(); } catch (_) {} }
    if (err.message && err.message.includes("UK_")) {
      return sendError(res, "Already Exist the Shift Production", 409);
    }
    console.error("DB Error (saveOrUpdate oe-production):", err);
    return sendError(res, err);
  }
};

// POST /oe-production/create
export const create = (req, res) => saveOrUpdate(req, res, false);
// PUT  /oe-production/update/:code
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /oe-production/delete/:code
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (!code) return sendError(res, "Invalid SpgProdnCode", 400);
    const pool = await getPool(req.headers.subdbname);
    await pool.request().input("SpgProdnCode", sql.Int, code).execute("sp_Prodn_OEProdn_Delete");
    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("REFERENCE") || err.message.includes("FK_"))) {
      return sendError(res, "You can not delete the OE Production!", 409);
    }
    console.error("DB Error (remove oe-production):", err);
    return sendError(res, err);
  }
};
