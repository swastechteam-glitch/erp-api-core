import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Drawing Production Entry
//   (port of WinForms frmDrawingProduction_New / frmDrawingProduction_NewDetails)
//   Twin of Carding Production, with a per-row No.Of Delivery and Target Prodn =
//     NoOfDelivery * round((DSpeed * WorkingMins) / (StdHank * 1693), 2)
//   Parent + child transaction (a shift's production for every drawing machine,
//   plus a stoppage sub-grid). Company + FY scoped (from the JWT).
//
//   Header  : sp_Prodn_DrawingProdn_AddEdit         -> DRWProdnCode (ExecuteScalar)
//   Details : sp_Prodn_DrawingProdnDetails_Delete  + loop _Insert
//   Stoppage: sp_Prodn_DrawingStoppage_Delete       + loop _Insert
//   Employee: sp_Prodn_DrawingEmployee_Delete(@ShiftCode,@CompanyCode) + loop _Insert
//   No      : sp_Prodn_DrawingProdnNo  @CompanyCode,@FYCode
//   List    : vw_Prodn_DrawingProdn   (CompanyCode + FYCode)
//   Load    : sp_Prodn_DrawingProdnDetails_GetAll @CompanyCode,@DRWProdnCode,@ShiftCode
//             + vw_Prodn_DrawingStoppage
//   Delete  : sp_Prodn_DrawingProdn_Delete @DRWProdnCode
// All derived values computed SERVER-SIDE (client values are a preview).
// ---------------------------------------------------------------------------

const toInt = (v) => { const n = parseInt(v); return Number.isFinite(n) ? n : 0; };
const toNum = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const r3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;
const D = (v) => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; };

const scalar = async (request, proc) => {
  const r = await request.execute(proc);
  const row = r.recordset && r.recordset[0];
  return row ? Object.values(row)[0] : null;
};

// GET /drawing-production/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = toInt(req.headers.companyCode);
    const pool = await getPool(req.headers.subdbname);

    const [branches, shifts, employees, reasons] = await Promise.all([
      pool.request().query(`Select BranchCode, BranchName from tbl_Branch Where CompanyCode = ${companyCode} Order By BranchName`),
      pool.request().query(`select ShiftCode, ShiftName, WorkingMins from tbl_Shift where ShiftCode IN (1,2,3,5,6,7) AND CompanyCode = ${companyCode} Order by ShiftName`),
      pool.request().query(`Select EmployeeCode, str_EmployeeID from vw_Employee_New WHERE CompanyCode = ${companyCode} AND DOL IS NULL Order by EmployeeID`),
      pool.request().query(`Select StoppageReasonCode, StoppageReason, ShortName from tbl_StoppageReason ORDER BY StoppageReason`),
    ]);

    return sendSuccess(res, {
      branches: branches.recordset.map((b) => ({ value: b.BranchCode, label: b.BranchName })),
      shifts: shifts.recordset.map((s) => ({ value: s.ShiftCode, label: s.ShiftName, workingMins: toNum(s.WorkingMins) })),
      employees: employees.recordset.map((e) => ({ value: e.EmployeeCode, label: e.str_EmployeeID })),
      stoppageReasons: reasons.recordset.map((r) => ({ value: r.StoppageReasonCode, label: r.StoppageReason, shortName: r.ShortName })),
    });
  } catch (err) {
    console.error("DB Error (drawingProduction getOptions):", err);
    return sendError(res, err);
  }
};

// GET /drawing-production/machines?branchCode=
export const getMachines = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = toInt(req.headers.companyCode);
    const branchCode = toInt(req.query.branchCode);
    const pool = await getPool(req.headers.subdbname);

    let where = `Status = 1 AND CompanyCode = ${companyCode}`;
    if (branchCode) where += ` AND BranchCode = ${branchCode}`;
    const result = await pool
      .request()
      .query(`Select * from vw_Prodn_Drawing_MachineSetting Where ${where} Order by DRWMachineSettingCode`);

    const rows = result.recordset.map((m) => ({
      DRWMachineSettingCode: m.DRWMachineSettingCode,
      MachineCode: m.MachineCode,
      MachineNo: m.MachineNo,
      MachineName: m.MachineName,
      MixingNameCode: m.MixingNameCode,
      MixingName: m.MixingName,
      CountNameCode: m.CountNameCode,
      CountName: m.CountName,
      DSpeed: toNum(m.DSpeed),
      STDHank: toNum(m.STDHank),
      ProdnConts: toNum(m.ProdnConts),
      NoOfDelivery: toNum(m.NoOfDelivery),
      TargetProdn: toNum(m.TargetProdn),
    }));
    return sendSuccess(res, rows);
  } catch (err) {
    console.error("DB Error (drawingProduction getMachines):", err);
    return sendError(res, err);
  }
};

// GET /drawing-production/next-no
export const getNextNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const no = await scalar(
      pool.request().input("CompanyCode", sql.Int, toInt(req.headers.companyCode)).input("FYCode", sql.Int, toInt(req.headers.FYCode)),
      "sp_Prodn_DrawingProdnNo"
    );
    return sendSuccess(res, { no: toInt(no) });
  } catch (err) {
    console.error("DB Error (drawingProduction getNextNo):", err);
    return sendError(res, err);
  }
};

// GET /drawing-production/exists?date=&shiftCode=&branchCode=
export const checkExisting = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("ShiftCode", sql.Int, toInt(req.query.shiftCode))
      .input("DRWProdnDate", sql.DateTime, D(req.query.date) || new Date())
      .input("CompanyCode", sql.Int, toInt(req.headers.companyCode))
      .input("BranchCode", sql.Int, toInt(req.query.branchCode))
      .query(
        "SELECT DRWProdnCode FROM tbl_Prodn_DrawingProdn WHERE ShiftCode = @ShiftCode " +
          "AND DRWProdnDate = @DRWProdnDate AND CompanyCode = @CompanyCode AND BranchCode = @BranchCode"
      );
    return sendSuccess(res, { exists: result.recordset.length > 0 });
  } catch (err) {
    console.error("DB Error (drawingProduction checkExisting):", err);
    return sendError(res, err);
  }
};

// GET /drawing-production/lists
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = toInt(req.headers.companyCode);
    const fyCode = toInt(req.headers.FYCode);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .query(`select * from vw_Prodn_DrawingProdn Where CompanyCode = ${companyCode} AND FYCode = ${fyCode} ORDER BY DRWProdnDate DESC, ShiftNo DESC`);
    const data = result.recordset.map((row) => ({ ...row, id: row.DRWProdnCode }));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (drawingProduction getList):", err);
    return sendError(res, err);
  }
};

// GET /drawing-production/list/:code?shiftCode=
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    const shiftCode = toInt(req.query.shiftCode);
    const companyCode = toInt(req.headers.companyCode);
    if (!code) return sendError(res, "Invalid DRWProdnCode", 400);
    const pool = await getPool(req.headers.subdbname);

    const det = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("DRWProdnCode", sql.Int, code)
      .input("ShiftCode", sql.Int, shiftCode)
      .execute("sp_Prodn_DrawingProdnDetails_GetAll");

    if (!det.recordset.length) return sendError(res, "Drawing Production not found", 404);
    const h = det.recordset[0];

    const stop = await pool.request().query(`select * from vw_Prodn_DrawingStoppage where DRWProdnCode = ${code}`);

    return sendSuccess(res, {
      header: {
        DRWProdnCode: h.DRWProdnCode,
        DRWProdnNo: h.DRWProdnNo,
        DRWProdnDate: h.DRWProdnDate,
        BranchCode: h.BranchCode,
        ShiftCode: h.ShiftCode,
        SupervisorCode: h.SupervisorCode,
        MaistryCode: h.MaistryCode,
        TotalWasteKgs: h.TotalWasteKgs,
        QANC: h.QANC,
        ShiftNC: h.ShiftNC,
      },
      details: det.recordset.map((d) => ({
        DRWMachineSettingCode: d.DRWMachineSettingCode,
        MachineCode: d.MachineCode,
        MachineName: d.MachineName,
        MixingNameCode: d.MixingNameCode,
        MixingName: d.MixingName,
        CountNameCode: d.CountNameCode,
        CountName: d.CountName,
        EmployeeCode: d.EmployeeCode,
        EmployeeID: d.EmployeeId ?? d.EmployeeID,
        STDHank: toNum(d.STDHank),
        DSpeed: toNum(d.DSpeed),
        NoOfDelivery: toNum(d.NoOfDelivery),
        ProdnConts: toNum(d.ProdnConts),
        Prodn: toNum(d.Prodn),
        Hank: toNum(d.Hank),
        Energy: toNum(d.Energy),
        SliverBreak: toNum(d.SliverBreak),
        Stoppage: toNum(d.Stoppage),
        Reason: d.StoppageReason,
      })),
      stoppages: stop.recordset.map((s) => ({
        MachineCode: s.MachineCode,
        MachineNo: s.MachineNo,
        StoppageReasonCode: s.StoppageReasonCode,
        StoppageReason: s.StoppageReason,
        ShortName: s.ShortName,
        Minutes: toNum(s.Hrs),
      })),
    });
  } catch (err) {
    console.error("DB Error (drawingProduction getById):", err);
    return sendError(res, err);
  }
};

// ---- per-row computation (mirrors the VB Calc_* + TargetProdn_Update) --------
function computeDetails(rawRows, stoppages, workingMins, totalWasteKgs) {
  const stopByMc = new Map();
  for (const s of stoppages || []) {
    const mc = toInt(s.MachineCode);
    if (!stopByMc.has(mc)) stopByMc.set(mc, { mins: 0, reasons: [] });
    const o = stopByMc.get(mc);
    o.mins += toNum(s.Minutes);
    if (s.ShortName) o.reasons.push(s.ShortName);
  }

  const rows = rawRows.map((d) => {
    const prodn = toNum(d.Prodn);
    const dSpeed = toNum(d.DSpeed);
    const stdHank = toNum(d.STDHank);
    const noOfDelivery = toNum(d.NoOfDelivery) || 1;
    const energy = toNum(d.Energy);
    const st = stopByMc.get(toInt(d.MachineCode)) || { mins: 0, reasons: [] };
    const stoppage = st.mins;
    const base = workingMins > 0 && stdHank > 0 ? r2((dSpeed * workingMins) / (stdHank * 1693)) : 0;
    const targetProdn = r2(base * noOfDelivery);
    const diff = r2(targetProdn - prodn);
    const util = stoppage > 0 ? r2(100 - (stoppage / workingMins) * 100) : 100;
    let effi = prodn > 0 && targetProdn > 0 ? r2((prodn / targetProdn) * 100) : 0;
    if (!Number.isFinite(effi)) effi = 0;
    const index = effi + util > 0 ? r2((effi + util) / 2) : 0;
    const ukg = prodn > 0 ? r3(energy / prodn) : 0;
    return {
      ...d, prodn, dSpeed, stdHank, noOfDelivery, energy, stoppage, targetProdn, diff, util, effi, index, ukg,
      reason: st.reasons.join(","), workingMins,
    };
  });

  const totalProdn = rows.reduce((a, r) => a + r.prodn, 0);
  for (const r of rows) {
    r.wasteKgs = totalWasteKgs > 0 && totalProdn > 0 && r.prodn > 0 ? r2((totalWasteKgs / totalProdn) * r.prodn) : 0;
    r.wastePer = r.wasteKgs > 0 ? r2((r.wasteKgs / (r.wasteKgs + r.prodn)) * 100) : 0;
  }

  const sum = (f) => rows.reduce((a, r) => a + f(r), 0);
  const avg = (f) => (rows.length ? r2(sum(f) / rows.length) : 0);
  // Effi% (and Waste%) averaged over producing rows only; Util% over all rows.
  const sel = rows.filter((r) => r.prodn > 0);
  const selAvg = (f) => (sel.length ? r2(sel.reduce((a, r) => a + f(r), 0) / sel.length) : 0);
  const totals = {
    targetProdn: r2(sum((r) => r.targetProdn)),
    prodn: r2(totalProdn),
    diff: r2(sum((r) => r.diff)),
    stoppage: r2(sum((r) => r.stoppage)),
    workingMins: r2(sum((r) => r.workingMins)),
    wasteKgs: r2(sum((r) => r.wasteKgs)),
    wastePer: selAvg((r) => r.wastePer),
    util: avg((r) => r.util),
    effi: selAvg((r) => r.effi),
    hank: r2(sum((r) => toNum(r.Hank))),
  };
  totals.index = r2((totals.util + totals.effi) / 2);
  return { rows, totals };
}

// ---- create / update -------------------------------------------------------
const saveOrUpdate = async (req, res, isEdit) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    const companyCode = toInt(req.headers.companyCode);
    const fyCode = toInt(req.headers.FYCode);
    if (!userId || !nodeCode) return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const b = req.body || {};
    const branchCode = toInt(b.BranchCode);
    const shiftCode = toInt(b.ShiftCode);
    const supervisorCode = toInt(b.SupervisorCode);
    const maistryCode = toInt(b.MaistryCode);
    const details = Array.isArray(b.details) ? b.details : [];
    const stoppages = Array.isArray(b.stoppages) ? b.stoppages : [];
    const totalWasteKgs = toNum(b.TotalWasteKgs);

    if (!branchCode) return sendError(res, "Select the Branch Name", 400);
    if (!shiftCode) return sendError(res, "Select the Shift Name", 400);
    if (!supervisorCode) return sendError(res, "Select the Supervisor Name", 400);
    if (!maistryCode) return sendError(res, "Select the Maistry Name", 400);
    if (!details.length) return sendError(res, "No machine rows to save", 400);

    const code = isEdit ? toInt(req.params.code ?? b.DRWProdnCode) : null;
    if (isEdit && !code) return sendError(res, "Invalid DRWProdnCode for update", 400);

    const pool = await getPool(req.headers.subdbname);

    const shiftRow = await pool
      .request()
      .input("ShiftCode", sql.Int, shiftCode)
      .input("CompanyCode", sql.Int, companyCode)
      .query("SELECT WorkingMins FROM tbl_Shift WHERE ShiftCode = @ShiftCode AND CompanyCode = @CompanyCode");
    const workingMins = toNum(shiftRow.recordset[0]?.WorkingMins);

    if (!isEdit) {
      const dup = await pool
        .request()
        .input("ShiftCode", sql.Int, shiftCode)
        .input("DRWProdnDate", sql.DateTime, D(b.DRWProdnDate) || new Date())
        .input("CompanyCode", sql.Int, companyCode)
        .input("BranchCode", sql.Int, branchCode)
        .query(
          "SELECT DRWProdnCode FROM tbl_Prodn_DrawingProdn WHERE ShiftCode=@ShiftCode AND DRWProdnDate=@DRWProdnDate AND CompanyCode=@CompanyCode AND BranchCode=@BranchCode"
        );
      if (dup.recordset.length) return sendError(res, "Production Entry already exists for this date, shift, and branch", 409);
    }

    const { rows, totals } = computeDetails(details, stoppages, workingMins, totalWasteKgs);

    for (const r of rows) {
      if (r.prodn <= 0 && r.stoppage <= 0)
        return sendError(res, `Enter the Production / Stoppage for Machine ${r.MachineName || r.MachineCode}`, 400);
      if (toInt(r.EmployeeCode) <= 0 && r.stoppage <= 0)
        return sendError(res, `Select the Employee for Machine ${r.MachineName || r.MachineCode}`, 400);
    }

    const drwProdnNo = isEdit
      ? toInt(b.DRWProdnNo)
      : toInt(await scalar(pool.request().input("CompanyCode", sql.Int, companyCode).input("FYCode", sql.Int, fyCode), "sp_Prodn_DrawingProdnNo"));

    tx = new sql.Transaction(pool);
    await tx.begin();

    const head = new sql.Request(tx);
    if (isEdit && code) head.input("DRWProdnCode", sql.Int, code);
    head.input("DRWProdnNo", sql.Int, drwProdnNo);
    head.input("DRWProdnDate", sql.DateTime, D(b.DRWProdnDate) || new Date());
    head.input("BranchCode", sql.Int, branchCode);
    head.input("ShiftCode", sql.Int, shiftCode);
    head.input("SupervisorCode", sql.Int, supervisorCode);
    head.input("MaistryCode", sql.Int, maistryCode);
    head.input("TotalActualHank", sql.Decimal(18, 3), totals.hank);
    head.input("TotalHank", sql.Decimal(18, 3), totals.hank);
    head.input("TotalWasteKgs", sql.Decimal(18, 3), totalWasteKgs);
    head.input("QANC", sql.Decimal(18, 3), toNum(b.QANC));
    head.input("ShiftNC", sql.Decimal(18, 3), toNum(b.ShiftNC));
    head.input("TotalWastePer", sql.Decimal(18, 3), totals.wastePer);
    head.input("TotalTargetProdn", sql.Decimal(18, 3), totals.targetProdn);
    head.input("TotalProdn", sql.Decimal(18, 3), totals.prodn);
    head.input("TotalDiff", sql.Decimal(18, 3), totals.diff);
    head.input("TotalStoppage", sql.Decimal(18, 3), totals.stoppage);
    head.input("TotalActualWorkingMins", sql.Decimal(18, 3), totals.workingMins);
    head.input("TotalUtilisation", sql.Decimal(18, 3), totals.util);
    head.input("TotalEffi", sql.Decimal(18, 3), totals.effi);
    head.input("TotalIndex", sql.Decimal(18, 3), totals.index);
    head.input("CompanyCode", sql.Int, companyCode);
    head.input("FYCode", sql.Int, fyCode);
    head.input("User", sql.Int, parseInt(userId));
    head.input("Node", sql.Int, parseInt(nodeCode));
    const drwProdnCode = toInt(await scalar(head, "sp_Prodn_DrawingProdn_AddEdit"));

    await new sql.Request(tx).input("DRWProdnCode", sql.Int, drwProdnCode).execute("sp_Prodn_DrawingProdnDetails_Delete");

    let sno = 0;
    for (const r of rows) {
      sno += 1;
      await new sql.Request(tx)
        .input("DRWProdnCode", sql.Int, drwProdnCode)
        .input("SNo", sql.Int, sno)
        .input("MachineCode", sql.Int, toInt(r.MachineCode))
        .input("EmployeeCode", sql.Int, toInt(r.EmployeeCode))
        .input("MixingNameCode", sql.Int, toInt(r.MixingNameCode))
        .input("STDHank", sql.Decimal(18, 3), r.stdHank)
        .input("DSpeed", sql.Decimal(18, 3), r.dSpeed)
        .input("NoOfDelivery", sql.Decimal(18, 2), r.noOfDelivery)
        .input("ProdnConts", sql.Decimal(18, 4), toNum(r.ProdnConts))
        .input("ActualWorkingMins", sql.Decimal(18, 3), r.workingMins)
        .input("Hank", sql.Decimal(18, 3), toNum(r.Hank))
        .input("TargetProdn", sql.Decimal(18, 3), r.targetProdn)
        .input("Prodn", sql.Decimal(18, 3), r.prodn)
        .input("WasteKgs", sql.Decimal(18, 3), r.wasteKgs)
        .input("WastePer", sql.Decimal(18, 3), r.wastePer)
        .input("Diff", sql.Decimal(18, 3), r.diff)
        .input("Stoppage", sql.Decimal(18, 3), r.stoppage)
        .input("Utilisation", sql.Decimal(18, 3), r.util)
        .input("ProdnEffi", sql.Decimal(18, 3), r.effi)
        .input("Indexs", sql.Decimal(18, 3), r.index)
        .input("CountNameCode", sql.Int, toInt(r.CountNameCode))
        .input("DRWMachineSettingCode", sql.Int, toInt(r.DRWMachineSettingCode))
        .input("StoppageReason", sql.NVarChar, r.reason || "")
        .input("Energy", sql.Decimal(18, 3), r.energy)
        .input("UKG", sql.Decimal(18, 3), r.ukg)
        .input("SliverBreak", sql.Decimal(18, 3), toNum(r.SliverBreak))
        .execute("sp_Prodn_DrawingProdnDetails_Insert");
    }

    await new sql.Request(tx).input("DRWProdnCode", sql.Int, drwProdnCode).execute("sp_Prodn_DrawingStoppage_Delete");
    for (const s of stoppages) {
      await new sql.Request(tx)
        .input("DRWProdnCode", sql.Int, drwProdnCode)
        .input("MachineCode", sql.Int, toInt(s.MachineCode))
        .input("StoppageReasonCode", sql.Int, toInt(s.StoppageReasonCode))
        .input("Hrs", sql.Decimal(18, 3), toNum(s.Minutes))
        .execute("sp_Prodn_DrawingStoppage_Insert");
    }

    await new sql.Request(tx)
      .input("ShiftCode", sql.Int, shiftCode)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_Prodn_DrawingEmployee_Delete");
    for (const r of rows) {
      await new sql.Request(tx)
        .input("ShiftCode", sql.Int, shiftCode)
        .input("CompanyCode", sql.Int, companyCode)
        .input("MachineCode", sql.Int, toInt(r.MachineCode))
        .input("EmployeeCode", sql.Int, toInt(r.EmployeeCode))
        .execute("sp_Prodn_DrawingEmployee_Insert");
    }

    await tx.commit();
    return sendSuccess(
      res,
      { DRWProdnCode: drwProdnCode },
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (tx) { try { await tx.rollback(); } catch (_) {} }
    if (err.message && err.message.includes("UK_")) {
      return sendError(res, "Already Exist the Production", 409);
    }
    console.error("DB Error (saveOrUpdate drawingProduction):", err);
    return sendError(res, err);
  }
};

export const create = (req, res) => saveOrUpdate(req, res, false);
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /drawing-production/delete/:code
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (!code) return sendError(res, "Invalid DRWProdnCode", 400);
    const pool = await getPool(req.headers.subdbname);
    await pool.request().input("DRWProdnCode", sql.Int, code).execute("sp_Prodn_DrawingProdn_Delete");
    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("REFERENCE") || err.message.includes("FK_"))) {
      return sendError(res, "You can not delete this Drawing Production!", 409);
    }
    console.error("DB Error (drawingProduction remove):", err);
    return sendError(res, err);
  }
};
