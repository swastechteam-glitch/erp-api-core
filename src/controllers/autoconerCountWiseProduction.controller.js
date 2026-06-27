import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// AutoConer Count Wise Production Entry
//   (port of WinForms frmAutoConerCountWiseProduction / frmAutoconerCountwiseProductionDetails)
//
//   Count-wise roll-up of the Autoconer Production for a Date + Shift. The user
//   picks Date + Shift; the grid is auto-loaded (NOT typed machine-by-machine):
//     - dup check against tbl_Prodn_AutoconerCountProdn (already entered?)
//     - header autofill (Supervisor / Monitor + the 6 carried totals) from the
//       parent tbl_Prodn_AutoconerProdn for the same Date + Shift
//     - count-wise rows from sp_Prodn_AutoconerProdn_GetCountProduction
//   In the grid the user only edits No.Of Cone + Cone Weight; the rest is loaded.
//   Derived per-row columns mirror the VB grid unbound expressions:
//     Act Prodn   = NoofCone * ConeWeight
//     Prodn/Drum  = RunDrum>0 ? round(ActProdn / RunDrum, 2) : 0
//   Header Waste % = round(TotalWasteKgs / TotalProdn * 100, 2) (Waste Kgs typed).
//
//   Save is one transaction: header AddEdit (ExecuteScalar -> ACCountProdnCode)
//   -> details Delete -> per-row Insert. The 6 carried totals (Red Light / RCY /
//   Yarn Joint / Util / Effi / Index) are re-read SERVER-SIDE from the parent
//   Autoconer Production so they are not trusted from the client.
//   UK_ violation -> "Already exist the Count Production".
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

// Per-row server-authoritative compute (mirrors the grid unbound expressions).
const computeRow = (d) => {
  const runDrum = toNum(d.RunDrum);
  const noofCone = toNum(d.NoofCone);
  const coneWeight = toNum(d.ConeWeight);
  const wasteKgs = toNum(d.WasteKgs);
  const actProdn = r2(noofCone * coneWeight);
  const prodnDrum = runDrum > 0 ? r2(actProdn / runDrum) : 0;
  const wastePer = wasteKgs + actProdn > 0 ? r2((wasteKgs / (wasteKgs + actProdn)) * 100) : 0;
  return {
    runDrum, noofCone, coneWeight, wasteKgs, actProdn, prodnDrum, wastePer,
    stopTime: toNum(d.Stoppage), redLight: toNum(d.RedLight), repeatedCycle: toNum(d.RepeatedCycle),
    yarnJoint: toNum(d.YarnJoint), effi: toNum(d.ProdnEffi), ut: toNum(d.Utilisation),
    index: toNum(d.Indexs), countNameCode: toInt(d.CountNameCode), mixingNameCode: toInt(d.MixingNameCode),
    idleDrum: toNum(d.IdleDrum),
  };
};

// GET /autoconer-count-wise-production/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = toInt(req.headers.companyCode);
    const pool = await getPool(req.headers.subdbname);

    const [branches, shifts, employees, counts, mixings] = await Promise.all([
      pool.request().query(`Select BranchCode, BranchName from tbl_Branch Where CompanyCode = ${companyCode} Order By BranchName`),
      pool.request().query("Select ShiftNo, ShiftName, ShiftCode, WorkingMins from tbl_Shift Where ShiftCode IN (2,3,4) Order by ShiftName"),
      pool.request().query(`Select EmployeeCode, str_EmployeeID from vw_Employee_New Where CompanyCode = ${companyCode} AND DOL IS NULL Order by str_EmployeeID`),
      pool.request().query("select CountNameCode, CountName, ShortName, ConeWeight from vw_Prodn_Spinning_CountSetting"),
      pool.request().query("select MixingNameCode, MixingName, ShortName from tbl_MixingName Order By MixingName"),
    ]);

    return sendSuccess(res, {
      branches: branches.recordset.map((r) => ({ value: r.BranchCode, label: r.BranchName })),
      shifts: shifts.recordset.map((r) => ({ value: r.ShiftCode, label: String(r.ShiftNo ?? r.ShiftName), workingMins: r.WorkingMins })),
      employees: employees.recordset.map((r) => ({ value: r.EmployeeCode, label: r.str_EmployeeID })),
      countNames: counts.recordset.map((r) => ({ value: r.CountNameCode, label: r.ShortName || r.CountName, coneWeight: r.ConeWeight })),
      mixingNames: mixings.recordset.map((r) => ({ value: r.MixingNameCode, label: r.MixingName })),
    });
  } catch (err) {
    console.error("DB Error (getOptions autoconer-count-wise-production):", err);
    return sendError(res, err);
  }
};

// GET /autoconer-count-wise-production/next-no
export const getNextNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = toInt(req.headers.companyCode);
    const fyCode = toInt(req.headers.FYCode);
    const pool = await getPool(req.headers.subdbname);
    const no = await scalar(
      pool.request().input("CompanyCode", sql.Int, companyCode).input("FYCode", sql.Int, fyCode),
      "sp_Prodn_AutoconerCountProdnNo"
    );
    return sendSuccess(res, { no });
  } catch (err) {
    console.error("DB Error (getNextNo autoconer-count-wise-production):", err);
    return sendError(res, err);
  }
};

// GET /autoconer-count-wise-production/load?date=&shiftCode=
//   Mirrors the VB GridLoad: dup check + parent-header autofill + count-wise rows.
export const loadCountProduction = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = toInt(req.headers.companyCode);
    const date = D(req.query.date);
    const shiftCode = toInt(req.query.shiftCode);
    if (!date || !shiftCode) return sendSuccess(res, { exists: false, header: null, rows: [] });

    const pool = await getPool(req.headers.subdbname);

    // Already saved this Count Production for the Date + Shift?
    const dup = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("ShiftCode", sql.Int, shiftCode)
      .input("ACCountProdnDate", sql.DateTime, date)
      .query(
        "select ShiftCode from tbl_Prodn_AutoconerCountProdn " +
          "where CompanyCode = @CompanyCode AND ShiftCode = @ShiftCode " +
          "AND CAST(ACCountProdnDate AS DATE) = CAST(@ACCountProdnDate AS DATE)"
      );
    if ((dup.recordset || []).length > 0) {
      return sendSuccess(res, { exists: true, header: null, rows: [] });
    }

    // Parent Autoconer Production header autofill (Supervisor / Monitor + 6 totals).
    const parent = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("ShiftCode", sql.Int, shiftCode)
      .input("ACProdnDate", sql.DateTime, date)
      .query(
        "select ShiftCode, SupervisorCode, MaistryCode, TotalRedLight, TotalRepeatedCycle, " +
          "TotalYarnJoint, TotalUtilisation, TotalEffi, TotalIndex from tbl_Prodn_AutoconerProdn " +
          "where CompanyCode = @CompanyCode AND ShiftCode = @ShiftCode " +
          "AND CAST(ACProdnDate AS DATE) = CAST(@ACProdnDate AS DATE)"
      );
    const p = parent.recordset && parent.recordset[0];
    const header = p
      ? {
          SupervisorCode: p.SupervisorCode, MaistryCode: p.MaistryCode,
          TotalRedLight: p.TotalRedLight, TotalRepeatedCycle: p.TotalRepeatedCycle,
          TotalYarnJoint: p.TotalYarnJoint, TotalUtilisation: p.TotalUtilisation,
          TotalEffi: p.TotalEffi, TotalIndex: p.TotalIndex,
        }
      : null;

    // Count-wise rows (one per Mixing + Count).
    const rowsRes = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("ShiftCode", sql.Int, shiftCode)
      .input("ACProdnDate", sql.DateTime, date)
      .execute("sp_Prodn_AutoconerProdn_GetCountProduction");

    const rows = (rowsRes.recordset || []).map((g) => ({
      MixingNameCode: g.MixingNameCode, MixingName: g.MixingName,
      CountNameCode: g.CountNameCode, CountName: g.ShortName ?? g.CountName,
      RunDrum: toNum(g.NoofDrum), Stoppage: toNum(g.Stoppage),
      ConeWeight: toNum(g.ConeWeight), NoofCone: toNum(g.NoofCones),
      RedLight: toNum(g.RedLight), RepeatedCycle: toNum(g.RepeatedCycle),
      YarnJoint: toNum(g.YarnJoint), ProdnEffi: toNum(g.ProdnEffi),
      Utilisation: toNum(g.Utilisation), Indexs: toNum(g.Indexs),
      IdleDrum: 0, WasteKgs: 0,
    }));

    return sendSuccess(res, { exists: false, header, rows });
  } catch (err) {
    console.error("DB Error (loadCountProduction autoconer-count-wise-production):", err);
    return sendError(res, err);
  }
};

// GET /autoconer-count-wise-production/lists
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = toInt(req.headers.companyCode);
    const fyCode = toInt(req.headers.FYCode);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .query(`SELECT * FROM vw_Prodn_AutoconerCountProdn WHERE CompanyCode = ${companyCode} AND FYCode = ${fyCode} ORDER BY ACCountProdnNo DESC`);
    const data = result.recordset.map((item) => ({ ...item, id: item.ACCountProdnCode }));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getList autoconer-count-wise-production):", err);
    return sendError(res, err);
  }
};

// GET /autoconer-count-wise-production/list/:code?shiftCode=
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = toInt(req.headers.companyCode);
    const code = toInt(req.params.code);
    const shiftCode = toInt(req.query.shiftCode);
    if (!code) return sendError(res, "Invalid ACCountProdnCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const detResult = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("ACCountProdnCode", sql.Int, code)
      .input("ShiftCode", sql.Int, shiftCode)
      .execute("sp_Prodn_AutoconerCountProdnDetails_GetAll");
    const rows = detResult.recordset || [];
    if (!rows.length) return sendError(res, "AutoConer Count Production not found", 404);

    const h = rows[0];
    const header = {
      ACCountProdnCode: h.ACCountProdnCode, ACCountProdnNo: h.ACCountProdnNo, ACCountProdnDate: h.ACCountProdnDate,
      BranchCode: h.BranchCode, ShiftCode: h.ShiftCode, SupervisorCode: h.SupervisorCode, MaistryCode: h.MaistryCode,
      TotalRedLight: h.TotalRedLight, TotalRepeatedCycle: h.TotalRepeatedCycle, TotalYarnJoint: h.TotalYarnJoint,
      TotalUtilisation: h.TotalUtilisation, TotalEffi: h.TotalEffi, TotalIndex: h.TotalIndex,
      TotalWasteKgs: h.TotalWasteKgs, TotalWastePer: h.TotalWastePer,
    };

    const details = rows.map((d) => ({
      MixingNameCode: d.MixingNameCode, MixingName: d.MixingName,
      CountNameCode: d.CountNameCode, CountName: d.CountName,
      RunDrum: toNum(d.WorkedDrum), Stoppage: toNum(d.Stoppage),
      ConeWeight: toNum(d.Coneweight), NoofCone: toNum(d.NoOfCone),
      RedLight: toNum(d.RedLight), RepeatedCycle: toNum(d.RepeatedCycle),
      YarnJoint: toNum(d.YarnJoint), ProdnEffi: toNum(d.ProdnEffi),
      Utilisation: toNum(d.Utilisation), Indexs: toNum(d.Indexs),
      IdleDrum: toNum(d.IdleDrum), WasteKgs: toNum(d.WasteKgs),
    }));

    return sendSuccess(res, { header, details });
  } catch (err) {
    console.error("DB Error (getById autoconer-count-wise-production):", err);
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
    const acCountProdnDate = D(body.ACCountProdnDate);
    const totalWasteKgs = toNum(body.TotalWasteKgs);
    const details = Array.isArray(body.details) ? body.details : [];

    if (branchCode <= 0) return sendError(res, "Select the Branch Name", 400);
    if (!shiftCode) return sendError(res, "Select the Shift Name", 400);
    if (!supervisorCode) return sendError(res, "Select the Supervisor Name", 400);
    if (!maistryCode) return sendError(res, "Select the Maistry Name", 400);
    if (totalWasteKgs <= 0) return sendError(res, "Enter the WasteKg", 400);
    if (!details.length) return sendError(res, "No count rows to save", 400);

    const editCode = isEdit ? toInt(req.params.code) : 0;
    if (isEdit && !editCode) return sendError(res, "Invalid ACCountProdnCode for update", 400);

    const computed = details.map((d) => ({ d, c: computeRow(d) }));

    // Row-derived totals.
    const sum = (f) => computed.reduce((a, x) => a + f(x), 0);
    const totalWorkedDrum = r2(sum((x) => x.c.runDrum));
    const totalNoofCone = r2(sum((x) => x.c.noofCone));
    const totalProdn = r2(sum((x) => x.c.actProdn));
    const totalConeWeight = r2(sum((x) => x.c.coneWeight));
    const totalProdnPerDrum = r2(sum((x) => x.c.prodnDrum));
    const totalStoppage = r2(sum((x) => x.c.stopTime));
    const totalIdleDrum = r2(sum((x) => x.c.idleDrum));
    const totalWastePer = totalProdn > 0 ? r2((totalWasteKgs / totalProdn) * 100) : 0;

    const pool = await getPool(req.headers.subdbname);

    // The 6 carried totals (Red Light / RCY / Yarn Joint / Util / Effi / Index)
    // come from the parent Autoconer Production — re-read server-side, not trusted.
    let carried = {
      TotalRedLight: toNum(body.TotalRedLight), TotalRepeatedCycle: toNum(body.TotalRepeatedCycle),
      TotalYarnJoint: toNum(body.TotalYarnJoint), TotalUtilisation: toNum(body.TotalUtilisation),
      TotalEffi: toNum(body.TotalEffi), TotalIndex: toNum(body.TotalIndex),
    };
    try {
      const parent = await pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("ShiftCode", sql.Int, shiftCode)
        .input("ACProdnDate", sql.DateTime, acCountProdnDate)
        .query(
          "select TotalRedLight, TotalRepeatedCycle, TotalYarnJoint, TotalUtilisation, TotalEffi, TotalIndex " +
            "from tbl_Prodn_AutoconerProdn where CompanyCode = @CompanyCode AND ShiftCode = @ShiftCode " +
            "AND CAST(ACProdnDate AS DATE) = CAST(@ACProdnDate AS DATE)"
        );
      const p = parent.recordset && parent.recordset[0];
      if (p) {
        carried = {
          TotalRedLight: toNum(p.TotalRedLight), TotalRepeatedCycle: toNum(p.TotalRepeatedCycle),
          TotalYarnJoint: toNum(p.TotalYarnJoint), TotalUtilisation: toNum(p.TotalUtilisation),
          TotalEffi: toNum(p.TotalEffi), TotalIndex: toNum(p.TotalIndex),
        };
      }
    } catch (_) { /* keep client values as fallback */ }

    tx = new sql.Transaction(pool);
    await tx.begin();

    // Header AddEdit -> ACCountProdnCode
    const hReq = new sql.Request(tx);
    if (isEdit) hReq.input("ACCountProdnCode", sql.Int, editCode);
    hReq.input("ACCountProdnNo", sql.Int, toInt(body.ACCountProdnNo));
    hReq.input("ACCountProdnDate", sql.DateTime, acCountProdnDate);
    hReq.input("BranchCode", sql.Int, branchCode);
    hReq.input("ShiftCode", sql.Int, shiftCode);
    hReq.input("SupervisorCode", sql.Int, supervisorCode);
    hReq.input("MaistryCode", sql.Int, maistryCode);
    hReq.input("TotalAllottedDrum", sql.Decimal(18, 2), totalWorkedDrum);
    hReq.input("TotalWorkedDrum", sql.Decimal(18, 2), totalWorkedDrum);
    hReq.input("TotalWasteKgs", sql.Decimal(18, 2), totalWasteKgs);
    hReq.input("TotalWastePer", sql.Decimal(18, 2), totalWastePer);
    hReq.input("TotalNoofCone", sql.Decimal(18, 2), totalNoofCone);
    hReq.input("TotalProdnKgs", sql.Decimal(18, 2), totalProdn);
    hReq.input("TotalTargetProdnKgs", sql.Decimal(18, 2), 0);
    hReq.input("TotalDiff", sql.Decimal(18, 2), 0);
    hReq.input("TotalStoppage", sql.Decimal(18, 2), totalStoppage);
    hReq.input("TotalUtilisation", sql.Decimal(18, 2), carried.TotalUtilisation);
    hReq.input("TotalEffi", sql.Decimal(18, 2), carried.TotalEffi);
    hReq.input("TotalConeweight", sql.Decimal(18, 2), totalConeWeight);
    hReq.input("TotalProdnPerDrum", sql.Decimal(18, 2), totalProdnPerDrum);
    hReq.input("FYCode", sql.Int, fyCode);
    hReq.input("TotalDSpeed", sql.Decimal(18, 2), 0);
    hReq.input("TotalIdleDrum", sql.Decimal(18, 2), totalIdleDrum);
    hReq.input("TotalRedLight", sql.Decimal(18, 2), carried.TotalRedLight);
    hReq.input("TotalRepeatedCycle", sql.Decimal(18, 2), carried.TotalRepeatedCycle);
    hReq.input("TotalYarnJoint", sql.Decimal(18, 2), carried.TotalYarnJoint);
    hReq.input("TotalActualWorkingMins", sql.Decimal(18, 2), 0);
    hReq.input("TotalIndex", sql.Decimal(18, 2), carried.TotalIndex);
    hReq.input("CompanyCode", sql.Int, companyCode);
    hReq.input("User", sql.Int, userId);
    hReq.input("Node", sql.Int, nodeCode);
    const acCountProdnCode = await scalar(hReq, "sp_Prodn_AutoconerCountProdn_AddEdit");
    if (!acCountProdnCode) throw new Error("Header save returned no ACCountProdnCode");

    // Details: delete then per-row insert.
    await new sql.Request(tx)
      .input("ACCountProdnCode", sql.Int, acCountProdnCode)
      .execute("sp_Prodn_AutoconerCountProdnDetails_Delete");

    let sno = 0;
    for (const { d, c } of computed) {
      sno += 1;
      const dr = new sql.Request(tx);
      dr.input("ACCountProdnCode", sql.Int, acCountProdnCode);
      dr.input("SNo", sql.Int, sno);
      dr.input("WorkedDrum", sql.Decimal(18, 2), c.runDrum);
      dr.input("ProdnKgs", sql.Decimal(18, 2), c.actProdn);
      dr.input("TargetProdnKgs", sql.Decimal(18, 2), 0);
      dr.input("Diff", sql.Decimal(18, 2), 0);
      dr.input("WasteKgs", sql.Decimal(18, 3), c.wasteKgs);
      dr.input("WastePer", sql.Decimal(18, 2), c.wastePer);
      dr.input("Stoppage", sql.Decimal(18, 2), c.stopTime);
      dr.input("Utilisation", sql.Decimal(18, 2), c.ut);
      dr.input("ProdnEffi", sql.Decimal(18, 2), c.effi);
      dr.input("CountNameCode", sql.Int, c.countNameCode);
      dr.input("MixingNameCode", sql.Int, c.mixingNameCode);
      dr.input("RedLight", sql.Decimal(18, 2), c.redLight);
      dr.input("IdleDrum", sql.Decimal(18, 2), c.idleDrum);
      dr.input("RepeatedCycle", sql.Decimal(18, 2), c.repeatedCycle);
      dr.input("YarnJoint", sql.Decimal(18, 2), c.yarnJoint);
      dr.input("Indexs", sql.Decimal(18, 2), c.index);
      dr.input("NoOfCone", sql.Decimal(18, 2), c.noofCone);
      dr.input("Coneweight", sql.Decimal(18, 3), c.coneWeight);
      dr.input("ProdnPerDrum", sql.Decimal(18, 2), c.prodnDrum);
      await dr.execute("sp_Prodn_AutoconerCountProdnDetails_Insert");
    }

    await tx.commit();
    return sendSuccess(
      res,
      { ACCountProdnCode: acCountProdnCode },
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (tx) { try { await tx.rollback(); } catch (_) {} }
    if (err.message && err.message.includes("UK_")) {
      return sendError(res, "Already exist the Count Production", 409);
    }
    console.error("DB Error (saveOrUpdate autoconer-count-wise-production):", err);
    return sendError(res, err);
  }
};

// POST /autoconer-count-wise-production/create
export const create = (req, res) => saveOrUpdate(req, res, false);
// PUT  /autoconer-count-wise-production/update/:code
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /autoconer-count-wise-production/delete/:code
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = toInt(req.headers.companyCode);
    const code = toInt(req.params.code);
    if (!code) return sendError(res, "Invalid ACCountProdnCode", 400);
    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("ACCountProdnCode", sql.Int, code)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_AutoconerCountProdnDetails_Delete");
    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("REFERENCE") || err.message.includes("FK_"))) {
      return sendError(res, "You can not delete the AutoconerCount!", 409);
    }
    console.error("DB Error (remove autoconer-count-wise-production):", err);
    return sendError(res, err);
  }
};
