import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Production Download From Machine
//   (port of WinForms frmProductionDataDownload)
//
//   Date / Shift / Branch + a checklist of process modules (Carding, Comber,
//   Drawing, Finisher Drawing, Simplex, UniLap, Spinning). For each ticked
//   module the original "Download" button:
//     1. checks whether that module's production already exists for the
//        Date + Shift + Branch (and, in the UI, asks "Redownload?"),
//     2. runs the module's Delete proc (@DelDate,@ShiftCode,@BranchCode),
//     3. runs the master Download proc, then the Details Download proc.
//
//   Each module is independent — a failure in one is reported but does not
//   abort the others (mirrors the per-module Try/Catch in VB). No transaction.
// ---------------------------------------------------------------------------

const toInt = (v) => parseInt(v) || 0;
const D = (v) => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; };

// key -> { label, table, dateCol, del, master, details }
const MODULES = {
  carding: {
    label: "Carding", table: "tbl_Prodn_CardingProdn", dateCol: "CRDProdnDate",
    del: "sp_Honeybey_Carding_Delete", master: "sp_HoneyBee_Carding_Download", details: "sp_HoneyBee_CardingDetails_Download",
  },
  comber: {
    label: "Comber", table: "tbl_Prodn_ComberProdn", dateCol: "CBRProdnDate",
    del: "sp_Honeybey_Comber_Delete", master: "sp_HoneyBee_Comber_Download", details: "sp_HoneyBee_ComberDetails_Download",
  },
  drawing: {
    label: "Drawing", table: "tbl_Prodn_DrawingProdn", dateCol: "DRWProdnDate",
    del: "sp_Honeybey_Drawing_Delete", master: "sp_HoneyBee_Drawing_Download", details: "sp_HoneyBee_DrawingDetails_Download",
  },
  finisherDrawing: {
    label: "Finisher Drawing", table: "tbl_Prodn_FinisherDrawingProdn", dateCol: "FDRWProdnDate",
    del: "sp_Honeybey_FinisherDrawing_Delete", master: "sp_HoneyBee_FinisherDrawing_Download", details: "sp_HoneyBee_FinisherDrawingDetails_Download",
  },
  simplex: {
    label: "Simplex", table: "tbl_Prodn_SimplexProdn", dateCol: "SPXProdnDate",
    del: "sp_Honeybey_Simplex_Delete", master: "sp_HoneyBee_Simplex_Download", details: "sp_HoneyBee_SimplexDetails_Download",
  },
  unilap: {
    label: "UniLap", table: "tbl_Prodn_UniLapProdn", dateCol: "UNIProdnDate",
    del: "sp_Honeybey_UniLap_Delete", master: "sp_HoneyBee_UniLap_Download", details: "sp_HoneyBee_UniLapDetails_Download",
  },
  spinning: {
    label: "Spinning", table: "tbl_Prodn_SpinningProdn", dateCol: "SpgProdnDate",
    del: "sp_EL_Spinning_Delete", master: "sp_EL_Spinning_Download", details: "sp_EL_SpinningDetails_Download",
  },
};

// GET /production-data-download/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = toInt(req.headers.companyCode);
    const pool = await getPool(req.headers.subdbname);

    const [shifts, branches] = await Promise.all([
      pool.request().query(`Select ShiftName, ShiftCode from tbl_Shift Where Status = 1 AND CompanyCode = ${companyCode} Order By ShiftCode`),
      pool.request().query("Select BranchCode, BranchName from tbl_Branch Order By BranchName"),
    ]);

    return sendSuccess(res, {
      shifts: shifts.recordset.map((r) => ({ value: r.ShiftCode, label: r.ShiftName })),
      branches: branches.recordset.map((r) => ({ value: r.BranchCode, label: r.BranchName })),
    });
  } catch (err) {
    console.error("DB Error (getOptions production-data-download):", err);
    return sendError(res, err);
  }
};

// Existence per module for the chosen Date + Shift + Branch.
// POST /production-data-download/check  { date, shiftCode, branchCode, modules:[] }
export const check = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const body = req.body || {};
    const date = D(body.date);
    const shiftCode = toInt(body.shiftCode);
    const branchCode = toInt(body.branchCode);
    const keys = Array.isArray(body.modules) ? body.modules.filter((k) => MODULES[k]) : [];

    if (!date) return sendError(res, "Select the Date", 400);
    if (!shiftCode) return sendError(res, "Select the Shift", 400);
    if (branchCode <= 0) return sendError(res, "Select the Branch", 400);

    const pool = await getPool(req.headers.subdbname);
    const out = {};
    for (const k of keys) {
      const m = MODULES[k];
      const r = await pool
        .request()
        .input("Dt", sql.DateTime, date)
        .input("ShiftCode", sql.Int, shiftCode)
        .input("BranchCode", sql.Int, branchCode)
        .query(`Select count(*) as Cnt from ${m.table} where ${m.dateCol} = @Dt AND ShiftCode = @ShiftCode AND BranchCode = @BranchCode`);
      out[k] = { exists: toInt(r.recordset?.[0]?.Cnt) > 0 };
    }
    return sendSuccess(res, out);
  } catch (err) {
    console.error("DB Error (check production-data-download):", err);
    return sendError(res, err);
  }
};

// Run Delete + master Download + Details Download for each requested module.
// POST /production-data-download/download  { date, shiftCode, branchCode, modules:[] }
export const download = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const body = req.body || {};
    const date = D(body.date);
    const shiftCode = toInt(body.shiftCode);
    const branchCode = toInt(body.branchCode);
    const keys = Array.isArray(body.modules) ? body.modules.filter((k) => MODULES[k]) : [];

    if (!date) return sendError(res, "Select the Date", 400);
    if (!shiftCode) return sendError(res, "Select the Shift", 400);
    if (branchCode <= 0) return sendError(res, "Select the Branch", 400);
    if (!keys.length) return sendError(res, "Select at least one option from the checkboxes", 400);

    const pool = await getPool(req.headers.subdbname);
    const results = [];

    for (const k of keys) {
      const m = MODULES[k];
      try {
        // 1. Delete existing rows for this Date + Shift + Branch.
        await pool
          .request()
          .input("DelDate", sql.DateTime, date)
          .input("ShiftCode", sql.Int, shiftCode)
          .input("BranchCode", sql.Int, branchCode)
          .execute(m.del);

        // 2. Master download, 3. Details download (both parameterless in VB).
        await pool.request().execute(m.master);
        await pool.request().execute(m.details);

        results.push({ key: k, label: m.label, ok: true, message: `${m.label} Prodn Download Completed` });
      } catch (e) {
        console.error(`Download failed (${k}):`, e);
        results.push({ key: k, label: m.label, ok: false, message: `${m.label}: ${e.message}` });
      }
    }

    const allOk = results.every((r) => r.ok);
    return sendSuccess(res, results, allOk ? "Download Completed" : "Download finished with some errors");
  } catch (err) {
    console.error("DB Error (download production-data-download):", err);
    return sendError(res, err);
  }
};
