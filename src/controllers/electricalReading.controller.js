import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Electrical Reading Entry (port of WinForms frmElectricalReadingEntry — the big
// multi-tab reading screen). Each tab is its own header+detail document:
//
//   Department Wise   -> sp_DepartmentWiseConsumption_*      (preload)
//   Slot Wise         -> sp_SlotWiseReading_*                (preload)
//   Day Wise (EB)     -> sp_EBReadingDayWise_*               (manual add)
//   Solar Reading     -> sp_SolarReading_*                   (preload)
//   Genset Reading    -> sp_GeneratorReading_*               (manual add)
//   Compressor Reading-> sp_CompressorReading_*              (preload)
//   Power Failure     -> handled by /power-failure (frmEB_PowerFailure)
//
// Lookups are returned by GET /electrical-reading/options. Each tab has
// preload (where applicable), list, one (header+details), save and delete.
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};
const D = (v) => (v ? new Date(v) : null);
const cc = (req) => toInt(req.headers.companyCode);
const fy = (req) => toInt(req.headers.FYCode);
const usr = (req) => toInt(req.headers.userId);
const nod = (req) => toInt(req.headers.nodeCode);

const scalar = async (request, proc) => {
  const r = await request.execute(proc);
  const row = r.recordset?.[0];
  return row ? toInt(Object.values(row)[0]) : 0;
};

// =========================================================================
// LOOKUPS
// =========================================================================
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = cc(req);
    const pool = await getPool(req.headers.subdbname);
    const q = (sqlText, inputs) => {
      const r = pool.request();
      (inputs || []).forEach(([n, t, v]) => r.input(n, t, v));
      return r.query(sqlText);
    };

    const [
      branches, ebMeters, departmentsSM, plants, shiftsDay, shiftsGeneral, shiftsAll,
      powerCategories, slots, solarLocations, generatorGroups, gensetMachines,
      compressorGroups, compressorMachines,
    ] = await Promise.all([
      q("SELECT BranchCode, BranchName FROM tbl_Branch WHERE CompanyCode=@C", [["C", sql.Int, companyCode]]),
      q("SELECT EBMeterCode, EBMeterName, ISNULL(MachineFactor,1) AS MachineFactor FROM tbl_EBMeterMaster WHERE CompanyCode=@C AND Status=1 ORDER BY EBMeterName", [["C", sql.Int, companyCode]]),
      q("SELECT DepartmentCode, DepartmentName FROM tbl_Department WHERE Status=1 AND StoresAndMaintenance=1 ORDER BY DepartmentName"),
      q("SELECT PlantCode, PlantName, ISNULL(MultipleFactor,1) AS MultipleFactor FROM vw_PlantMaster WHERE CompanyCode=@C AND Status=1 ORDER BY OrderNo", [["C", sql.Int, companyCode]]),
      q("SELECT ShiftCode, ShiftName FROM tbl_Shift WHERE CompanyCode=@C AND Status=1 AND ShiftName LIKE '%DAY%'", [["C", sql.Int, companyCode]]),
      q("SELECT ShiftCode, ShiftName FROM tbl_Shift WHERE CompanyCode=@C AND Status=1 AND ShiftName LIKE '%GENERAL%'", [["C", sql.Int, companyCode]]),
      q("SELECT ShiftCode, ShiftName FROM tbl_Shift WHERE CompanyCode=@C AND Status=1 ORDER BY ShiftName", [["C", sql.Int, companyCode]]),
      q("SELECT PowerCategoryCode, PowerCategoryName, ISNULL(MultipleFactor,1) AS MultipleFactor FROM tbl_PowerCategory WHERE CompanyCode=@C ORDER BY PowerCategoryName", [["C", sql.Int, companyCode]]),
      q("SELECT SlotCode, SlotName FROM tbl_Slot WHERE CompanyCode=@C AND Status=1", [["C", sql.Int, companyCode]]),
      q("SELECT SolarLocationCode, SolarLocationName, ISNULL(MF,1) AS MF, ISNULL(Rate,0) AS Rate FROM tbl_SolarLocation WHERE CompanyCode=@C AND Status=1", [["C", sql.Int, companyCode]]),
      q("SELECT GeneratorMachineGroupCode, GeneratorMachineGroupName FROM tbl_GeneratorMachineGroup WHERE CompanyCode=@C", [["C", sql.Int, companyCode]]),
      q("SELECT MachineCode, MachineName FROM tbl_Machine WHERE CompanyCode=@C AND MachineTypeCode=6 AND Status=1", [["C", sql.Int, companyCode]]),
      q("SELECT CompressorGroupMasterCode, CompressorGroupMasterName FROM tbl_CompressorGroupMaster WHERE CompanyCode=@C AND Status=1", [["C", sql.Int, companyCode]]),
      q("SELECT MachineCode, MachineName FROM tbl_Machine WHERE CompanyCode=@C AND MachineTypeCode=13 AND Status=1", [["C", sql.Int, companyCode]]),
    ]);

    return sendSuccess(res, {
      branches: branches.recordset,
      ebMeters: ebMeters.recordset,
      departments: departmentsSM.recordset,
      plants: plants.recordset,
      shiftsDay: shiftsDay.recordset,
      shiftsGeneral: shiftsGeneral.recordset,
      shiftsAll: shiftsAll.recordset,
      powerCategories: powerCategories.recordset,
      slots: slots.recordset,
      solarLocations: solarLocations.recordset,
      generatorGroups: generatorGroups.recordset,
      gensetMachines: gensetMachines.recordset,
      compressorGroups: compressorGroups.recordset,
      compressorMachines: compressorMachines.recordset,
    });
  } catch (err) {
    console.error("DB Error (ElectricalReading.getOptions):", err);
    return sendError(res, err);
  }
};

// Generic helpers -----------------------------------------------------------
const preload = (proc) => async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, cc(req))
      .input("EntryDate", sql.Date, D(req.query.date) || new Date())
      .execute(proc);
    return sendSuccess(res, r.recordset || []);
  } catch (err) {
    console.error(`DB Error (preload ${proc}):`, err);
    return sendError(res, err);
  }
};

// list from a view filtered by company + FY (most tabs), newest first
const listView = (view, codeCol, withFy = true) => async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    let where = "CompanyCode=@C";
    const r = pool.request().input("C", sql.Int, cc(req));
    if (withFy) {
      where += " AND FYCode=@F";
      r.input("F", sql.Int, fy(req));
    }
    const data = await r.query(`SELECT * FROM ${view} WHERE ${where} ORDER BY ${codeCol} DESC`);
    return sendSuccess(res, (data.recordset || []).map((x) => ({ ...x, id: x[codeCol] })));
  } catch (err) {
    console.error(`DB Error (list ${view}):`, err);
    return sendError(res, err);
  }
};

const oneWithDetails = (view, codeCol, detailView, detailKey, withFy = true) => async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (!code) return sendError(res, "Invalid code", 400);
    const pool = await getPool(req.headers.subdbname);
    let where = `${codeCol}=@code AND CompanyCode=@C`;
    const hr = pool.request().input("code", sql.Int, code).input("C", sql.Int, cc(req));
    if (withFy) {
      where += " AND FYCode=@F";
      hr.input("F", sql.Int, fy(req));
    }
    const head = await hr.query(`SELECT * FROM ${view} WHERE ${where}`);
    const det = await pool.request().input("code", sql.Int, code).query(`SELECT * FROM ${detailView} WHERE ${detailKey}=@code`);
    return sendSuccess(res, { ...(head.recordset?.[0] || {}), details: det.recordset || [] });
  } catch (err) {
    console.error(`DB Error (one ${view}):`, err);
    return sendError(res, err);
  }
};

const remover = (proc, codeParam) => async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (!code) return sendError(res, "Invalid code", 400);
    const pool = await getPool(req.headers.subdbname);
    await pool.request().input(codeParam, sql.Int, code).execute(proc);
    return sendSuccess(res, { code }, "The record is deleted");
  } catch (err) {
    if (err.message && err.message.includes("FK_")) return sendError(res, "You cannot delete this record", 409);
    console.error(`DB Error (delete ${proc}):`, err);
    return sendError(res, err);
  }
};

// Core transactional header+details save.
const saveDoc = async (req, res, cfg) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    if (!usr(req) || !nod(req)) return sendError(res, "Missing user context", 400);
    if (!cc(req)) return sendError(res, "Missing company context", 400);
    const b = req.body || {};
    const rows = Array.isArray(b.details) ? b.details : [];
    if (!rows.length) return sendError(res, "Enter the Details", 400);
    const editCode = toInt(b[cfg.codeField]);

    const pool = await getPool(req.headers.subdbname);
    tx = new sql.Transaction(pool);
    await tx.begin();

    const head = new sql.Request(tx);
    if (editCode) head.input(cfg.codeField, sql.Int, editCode);
    cfg.headerInputs(head, b, req);
    const code = await scalar(head, cfg.headerProc);

    await new sql.Request(tx).input(cfg.codeField, sql.Int, code).execute(cfg.detailDeleteProc);

    let sno = 0;
    for (const row of rows) {
      sno += 1;
      const r = new sql.Request(tx).input(cfg.codeField, sql.Int, code);
      cfg.detailInputs(r, row, sno);
      await r.execute(cfg.detailInsertProc);
    }

    await tx.commit();
    return sendSuccess(res, { [cfg.codeField]: code }, editCode ? "The record is updated" : "The record is saved", editCode ? 200 : 201);
  } catch (err) {
    if (tx) {
      try {
        await tx.rollback();
      } catch (_) {}
    }
    if (err.message && err.message.includes("FK_")) return sendError(res, "Please Check the Entry", 409);
    console.error("DB Error (saveDoc):", err);
    return sendError(res, err);
  }
};

// =========================================================================
// DEPARTMENT WISE
// =========================================================================
export const deptPreload = preload("sp_DepartmentwiseConsumption_PreLoad");
export const deptList = listView("vw_DepartmentwiseConsumption", "DWCCode");
// Department-wise screen meta: the last saved reading date (so the entry date
// can default to the next day and be bounded) and the financial-year end date
// (the maximum selectable date). Mirrors the WinForms dtpDWLasteDate /
// FYMaxDate setup. FYEnd is decoded from the JWT by the auth middleware.
export const deptMeta = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("C", sql.Int, cc(req))
      .query("SELECT MAX(DWCDate) AS LastEntryDate FROM tbl_DepartmentwiseConsumption WHERE CompanyCode=@C");
    return sendSuccess(res, {
      lastEntryDate: r.recordset?.[0]?.LastEntryDate || null,
      fyMaxDate: req.headers.FYEnd || null,
    });
  } catch (err) {
    console.error("DB Error (deptMeta):", err);
    return sendError(res, err);
  }
};
export const deptOne = oneWithDetails("vw_DepartmentwiseConsumption", "DWCCode", "vw_DepartmentwiseConsumptionDetails", "DWCCode");
export const deptDelete = remover("sp_DepartmentwiseConsumption_Delete", "DWCCode");
export const deptSave = (req, res) =>
  saveDoc(req, res, {
    codeField: "DWCCode",
    headerProc: "sp_DepartmentWiseConsumption_AddEdit",
    detailDeleteProc: "sp_DepartmentWiseConsumptionDetails_Delete",
    detailInsertProc: "sp_DepartmentWiseConsumptionDetails_Insert",
    headerInputs: (r, b, req) => {
      r.input("DWCDate", sql.DateTime, D(b.DWCDate) || new Date());
      r.input("DepartmentCode", sql.Int, toInt(b.DepartmentCode));
      r.input("EBMeterCode", sql.Int, toInt(b.EBMeterCode));
      r.input("ShiftCode", sql.Int, toInt(b.ShiftCode));
      r.input("BranchCode", sql.Int, toInt(b.BranchCode));
      r.input("TotalClosing", sql.Decimal(18, 3), toNum(b.TotalClosing));
      r.input("FYCode", sql.Int, fy(req));
      r.input("User", sql.Int, usr(req));
      r.input("Node", sql.Int, nod(req));
      r.input("CompanyCode", sql.Int, cc(req));
    },
    detailInputs: (r, row, sno) => {
      r.input("SNo", sql.Int, sno);
      r.input("PlantCode", sql.Int, toInt(row.PlantCode));
      r.input("PreReading", sql.Decimal(18, 3), toNum(row.PreReading));
      r.input("CurrentReading", sql.Decimal(18, 3), toNum(row.CurrentReading));
      r.input("Difference", sql.Decimal(18, 3), toNum(row.Difference));
    },
  });

// =========================================================================
// SLOT WISE
// =========================================================================
export const slotPreload = preload("sp_SlotWiseReading_PreLoad");
export const slotList = listView("vw_SlotWiseReading", "SWRCode");
// Slot-wise screen meta: last saved reading date (next-day default + bound) and
// financial-year end (max selectable). Mirrors the WinForms dtpSWLasteDate setup.
export const slotMeta = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("C", sql.Int, cc(req))
      .query("SELECT MAX(SWRDate) AS LastEntryDate FROM tbl_SlotWiseReading WHERE CompanyCode=@C");
    return sendSuccess(res, {
      lastEntryDate: r.recordset?.[0]?.LastEntryDate || null,
      fyMaxDate: req.headers.FYEnd || null,
    });
  } catch (err) {
    console.error("DB Error (slotMeta):", err);
    return sendError(res, err);
  }
};
export const slotOne = oneWithDetails("vw_SlotWiseReading", "SWRCode", "vw_SlotWiseReadingDetails", "SWRCode");
export const slotDelete = remover("sp_SlotWiseReading_Delete", "SWRCode");
export const slotSave = (req, res) =>
  saveDoc(req, res, {
    codeField: "SWRCode",
    headerProc: "sp_SlotWiseReading_AddEdit",
    detailDeleteProc: "sp_SlotWiseReadingDetails_Delete",
    detailInsertProc: "sp_SlotWiseReadingDetails_Insert",
    headerInputs: (r, b, req) => {
      r.input("SWRDate", sql.DateTime, D(b.SWRDate) || new Date());
      r.input("ShiftCode", sql.Int, toInt(b.ShiftCode));
      r.input("BranchCode", sql.Int, toInt(b.BranchCode));
      r.input("PowerCategoryCode", sql.Int, toInt(b.PowerCategoryCode));
      r.input("FYCode", sql.Int, fy(req));
      r.input("TotalClosing", sql.Decimal(18, 3), toNum(b.TotalClosing));
      r.input("User", sql.Int, usr(req));
      r.input("Node", sql.Int, nod(req));
      r.input("CompanyCode", sql.Int, cc(req));
    },
    detailInputs: (r, row, sno) => {
      r.input("SlotCode", sql.Int, toInt(row.SlotCode));
      r.input("PreviousReading", sql.Decimal(18, 3), toNum(row.PreviousReading));
      r.input("CurrentReading", sql.Decimal(18, 3), toNum(row.CurrentReading));
      r.input("Difference", sql.Decimal(18, 3), toNum(row.Difference));
      r.input("SNo", sql.Int, sno);
    },
  });

// =========================================================================
// DAY WISE (EB Reading Day Wise)
// =========================================================================
export const dayList = listView("vw_EBReadingDayWise", "EBReadingDayWiseCode");
export const dayOne = oneWithDetails("vw_EBReadingDayWise", "EBReadingDayWiseCode", "vw_EBReadingDayWiseDetails", "EBReadingDayWiseCode");
export const dayDelete = remover("sp_EBReadingDayWise_Delete", "EBReadingDayWiseCode");
export const daySave = (req, res) =>
  saveDoc(req, res, {
    codeField: "EBReadingDayWiseCode",
    headerProc: "sp_EBReadingDayWise_AddEdit",
    detailDeleteProc: "sp_EBReadingDayWiseDetails_Delete",
    detailInsertProc: "sp_EBReadingDayWiseDetails_Insert",
    headerInputs: (r, b, req) => {
      r.input("EBReadingDayWiseDate", sql.DateTime, D(b.EBReadingDayWiseDate) || new Date());
      r.input("ShiftCode", sql.Int, toInt(b.ShiftCode));
      r.input("BranchCode", sql.Int, toInt(b.BranchCode));
      r.input("EBMeterCode", sql.Int, toInt(b.EBMeterCode));
      r.input("TotalKWHClosing", sql.Decimal(18, 3), toNum(b.TotalKWHClosing));
      r.input("TotalKVAHClosing", sql.Decimal(18, 3), toNum(b.TotalKVAHClosing));
      r.input("FYCode", sql.Int, fy(req));
      r.input("CompanyCode", sql.Int, cc(req));
      r.input("User", sql.Int, usr(req));
      r.input("Node", sql.Int, nod(req));
    },
    detailInputs: (r, row, sno) => {
      r.input("EBMeterCode", sql.Int, toInt(row.EBMeterCode));
      r.input("KWHPreviousReading", sql.Decimal(18, 3), toNum(row.KWHPreviousReading));
      r.input("KWHCurrentReading", sql.Decimal(18, 3), toNum(row.KWHCurrentReading));
      r.input("KWHDifferenceReading", sql.Decimal(18, 3), toNum(row.KWHDifference));
      r.input("MD", sql.Decimal(18, 3), toNum(row.MD));
      r.input("HZ", sql.Decimal(18, 3), toNum(row.HZ));
      r.input("KVAHPreviousReading", sql.Decimal(18, 3), toNum(row.KVAHPreviousReading));
      r.input("KVAHCurrentReading", sql.Decimal(18, 3), toNum(row.KVAHCurrentReading));
      r.input("KVAHDifferenceReading", sql.Decimal(18, 3), toNum(row.KVAHDifference));
      r.input("PF", sql.Decimal(18, 3), toNum(row.PF));
      r.input("PeakDem", sql.Decimal(18, 3), toNum(row.PeakDem));
      r.input("SNo", sql.Int, sno);
    },
  });

// =========================================================================
// SOLAR READING
// =========================================================================
export const solarPreload = preload("sp_SolarReading_PreLoad");
export const solarDelete = remover("sp_SolarReading_Delete", "SolarReadingCode");
export const solarList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool.request().input("CompanyCode", sql.Int, cc(req)).execute("sp_SolarReading_GetAll");
    return sendSuccess(res, (r.recordset || []).map((x) => ({ ...x, id: x.SolarReadingCode })));
  } catch (err) {
    console.error("DB Error (solarList):", err);
    return sendError(res, err);
  }
};
export const solarOne = oneWithDetails("vw_SolarReading", "SolarReadingCode", "vw_SolarReadingDetails", "SolarReadingCode", false);
export const solarSave = (req, res) =>
  saveDoc(req, res, {
    codeField: "SolarReadingCode",
    headerProc: "sp_SolarReading_AddEdit",
    detailDeleteProc: "sp_SolarReadingDetails_Delete",
    detailInsertProc: "sp_SolarReadingDetails_Insert",
    headerInputs: (r, b, req) => {
      r.input("SolarReadingDate", sql.DateTime, D(b.SolarReadingDate) || new Date());
      r.input("FYCode", sql.Int, fy(req));
      r.input("User", sql.Int, usr(req));
      r.input("Node", sql.Int, nod(req));
      r.input("CompanyCode", sql.Int, cc(req));
      r.input("TotalUnits", sql.Decimal(18, 3), toNum(b.TotalUnits));
      r.input("TotalAmount", sql.Decimal(18, 3), toNum(b.TotalAmount));
      r.input("Remarks", sql.NVarChar, (b.Remarks || "").toString().trim());
    },
    detailInputs: (r, row) => {
      r.input("SolarLocationCode", sql.Int, toInt(row.SolarLocationCode));
      r.input("OpeningValue", sql.Decimal(18, 3), toNum(row.PreviousReading));
      r.input("ReadingValue", sql.Decimal(18, 3), toNum(row.CurrentReading));
      r.input("MF", sql.Decimal(18, 3), toNum(row.MF));
      r.input("Units", sql.Decimal(18, 3), toNum(row.Units));
      r.input("Rate", sql.Decimal(18, 3), toNum(row.Rate));
      r.input("Amount", sql.Decimal(18, 3), toNum(row.Amount));
    },
  });

// =========================================================================
// GENSET READING
// =========================================================================
export const gensetList = listView("vw_GeneratorReading", "GRCode");
export const gensetOne = oneWithDetails("vw_GeneratorReading", "GRCode", "vw_GeneratorReadingDetails", "GRCode");
export const gensetDelete = remover("sp_GeneratorReading_Delete", "GRCode");
export const gensetSave = (req, res) =>
  saveDoc(req, res, {
    codeField: "GRCode",
    headerProc: "sp_GeneratorReading_AddEdit",
    detailDeleteProc: "sp_GeneratorReadingDetails_Delete",
    detailInsertProc: "sp_GeneratorReadingDetails_Insert",
    headerInputs: (r, b, req) => {
      r.input("GRDate", sql.DateTime, D(b.GRDate) || new Date());
      r.input("GeneratorMachineGroupCode", sql.Int, toInt(b.GeneratorMachineGroupCode));
      r.input("ShiftCode", sql.Int, toInt(b.ShiftCode));
      r.input("BranchCode", sql.Int, toInt(b.BranchCode));
      r.input("CompanyCode", sql.Int, cc(req));
      r.input("TotalClosing", sql.Decimal(18, 3), toNum(b.TotalClosing));
      r.input("FYCode", sql.Int, fy(req));
      r.input("User", sql.Int, usr(req));
      r.input("Node", sql.Int, nod(req));
    },
    detailInputs: (r, row, sno) => {
      r.input("MachineCode", sql.Int, toInt(row.MachineCode));
      r.input("WaterTemperature", sql.Decimal(18, 3), toNum(row.WaterTemperature));
      r.input("OilPressure", sql.Decimal(18, 3), toNum(row.OilPressure));
      r.input("Voltage", sql.Decimal(18, 3), toNum(row.Voltage));
      r.input("AMPS", sql.Decimal(18, 3), toNum(row.AMPS));
      r.input("Power", sql.Decimal(18, 3), toNum(row.Power));
      r.input("KWH", sql.Decimal(18, 3), toNum(row.KWH));
      r.input("PreviousReading", sql.Decimal(18, 3), toNum(row.PreviousReading));
      r.input("CurrentReading", sql.Decimal(18, 3), toNum(row.CurrentReading));
      r.input("Difference", sql.Decimal(18, 3), toNum(row.Difference));
      r.input("Diesel", sql.Decimal(18, 3), toNum(row.Diesel));
      r.input("UPI", sql.Decimal(18, 3), toNum(row.UPI));
      r.input("RunHours", sql.Decimal(18, 3), toNum(row.RunHours));
      r.input("OpenRunHours", sql.Decimal(18, 3), toNum(row.OpenRunHours));
      r.input("CurrentRunHours", sql.Decimal(18, 3), toNum(row.CurrentRunHours));
      r.input("CostPerUnit", sql.Decimal(18, 3), toNum(row.CostPerUnit));
      r.input("SNo", sql.Int, sno);
    },
  });

// =========================================================================
// COMPRESSOR READING
// =========================================================================
export const compressorPreload = preload("sp_CompressorReading_PreLoad");
export const compressorList = listView("vw_CompressorReading", "CompressorReadingCode");
export const compressorOne = oneWithDetails("vw_CompressorReading", "CompressorReadingCode", "vw_CompressorReadingDetails", "CompressorReadingCode");
export const compressorDelete = remover("sp_CompressorReading_Delete", "CompressorReadingCode");
export const compressorSave = (req, res) =>
  saveDoc(req, res, {
    codeField: "CompressorReadingCode",
    headerProc: "sp_CompressorReading_AddEdit",
    detailDeleteProc: "sp_CompressorReadingDetails_Delete",
    detailInsertProc: "sp_CompressorReadingDetails_Insert",
    headerInputs: (r, b, req) => {
      r.input("CompressorReadingDate", sql.DateTime, D(b.CompressorReadingDate) || new Date());
      r.input("ShiftCode", sql.Int, toInt(b.ShiftCode));
      r.input("BranchCode", sql.Int, toInt(b.BranchCode));
      r.input("CompressorGroupMasterCode", sql.Int, toInt(b.CompressorGroupMasterCode));
      r.input("FYCode", sql.Int, fy(req));
      r.input("TotalRunClosing", sql.Decimal(18, 3), toNum(b.TotalRunClosing));
      r.input("Remarks", sql.NVarChar, (b.Remarks || "").toString().trim());
      r.input("User", sql.Int, usr(req));
      r.input("Node", sql.Int, nod(req));
      r.input("CompanyCode", sql.Int, cc(req));
    },
    detailInputs: (r, row, sno) => {
      r.input("MachineCode", sql.Int, toInt(row.MachineCode));
      r.input("RunPreviousReading", sql.Decimal(18, 3), toNum(row.RunPreviousReading));
      r.input("RunCurrentReading", sql.Decimal(18, 3), toNum(row.RunCurrentReading));
      r.input("RunDifference", sql.Decimal(18, 3), toNum(row.RunDifference));
      r.input("OilPressor", sql.Decimal(18, 3), toNum(row.OilPressor));
      r.input("RadiotorTemperature", sql.Decimal(18, 3), toNum(row.RadiotorTemperature));
      r.input("TankAirPressor", sql.Decimal(18, 3), toNum(row.TankAirPressor));
      r.input("DeltaPressor", sql.Decimal(18, 3), toNum(row.DeltaPressor));
      r.input("CFM", sql.Decimal(18, 3), toNum(row.CFM));
      r.input("KWHPrevious", sql.Decimal(18, 3), toNum(row.KWHPrevious));
      r.input("KWHCurrent", sql.Decimal(18, 3), toNum(row.KWHCurrent));
      r.input("KWHDifference", sql.Decimal(18, 3), toNum(row.KWHDifference));
      r.input("AirTemperature", sql.Decimal(18, 3), toNum(row.AirTemperature));
      r.input("DuePoint", sql.Decimal(18, 3), toNum(row.DuePoint));
      r.input("HighPressor", sql.Decimal(18, 3), toNum(row.HighPressor));
      r.input("LowPressor", sql.Decimal(18, 3), toNum(row.LowPressor));
      r.input("OutLetTemperature", sql.Decimal(18, 3), toNum(row.OutLetTemperature));
      r.input("SNo", sql.Int, sno);
    },
  });
