import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Yarn Gate Pass — View / Print (port of WinForms frmYarnGatePassPrint).
// The desktop form lists gate passes, then renders the selected one as an RDLC
// report with a "Gate Pass" / "DC" (summary) mode that swaps the template. Here
// the list is browsable and View returns the printable gate-pass data (HTML).
//
//   List   : GET /yarn-gate-pass/lists
//   Report : GET /yarn-gate-pass/report/:gatePassNo
//
// CompanyCode / FYCode come from the JWT (Company is fixed, as in the VB).
// There is no add/edit/delete in this form — it is a report/print screen.
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getFYCode = (req) => toInt(req.headers.FYCode);
const getUserId = (req) => toInt(req.headers.userId);
const getNodeCode = (req) => toInt(req.headers.nodeCode);

// Map a recordset to { ...row, value, label } option shape.
const opt = (rs, valueKey, labelKey) =>
  (rs?.recordset || []).map((r) => ({ ...r, value: r[valueKey], label: r[labelKey] }));

// Run a query but never throw — entry-form lookups degrade to [] when the
// underlying proc/table names differ from this DB (they are INFERRED below; the
// frmGatePass entry VB was not provided). Returns the fallback on any error.
const safe = async (fn, fallback) => {
  try {
    return await fn();
  } catch (e) {
    console.warn("YarnGatePass entry lookup skipped:", e?.message);
    return fallback;
  }
};

// GET /yarn-gate-pass/lists — gate passes for the current company + FY.
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const rs = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("FYCode", sql.Int, getFYCode(req))
      .execute("sp_YarnGatePass_View");
    return sendSuccess(res, rs.recordset || []);
  } catch (err) {
    console.error("DB Error (YarnGatePass.getList):", err);
    return sendError(res, err);
  }
};

// GET /yarn-gate-pass/report/:gatePassNo — data for the printable gate pass.
// Both "Gate Pass" and "DC" modes use the same proc (only the RDLC layout
// differs); the frontend chooses the presentation.
export const getReport = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const companyCode = getCompanyCode(req);
    const gatePassNo = toInt(req.params.gatePassNo);
    if (gatePassNo <= 0) return sendError(res, "Invalid GatePassNo", 400);

    const [print, company] = await Promise.all([
      pool.request().input("CompanyCode", sql.Int, companyCode).input("GatePassNo", sql.Int, gatePassNo).execute("sp_YarnGatePass_Print"),
      pool.request().input("CompanyCode", sql.Int, companyCode).execute("sp_Company_GetAll"),
    ]);

    const details = print.recordset || [];
    return sendSuccess(res, {
      header: details[0] || {},
      details,
      company: company.recordset?.[0] || {},
    });
  } catch (err) {
    console.error("DB Error (YarnGatePass.getReport):", err);
    return sendError(res, err);
  }
};

// ===========================================================================
// Gate Pass ENTRY (the frmGatePass form — weigh-bridge gate-pass creation).
// NOTE: the entry form's VB was not supplied, so the lookups/save below use
// INFERRED proc/table names and degrade gracefully (empty selects rather than
// a crash) until they are confirmed. The list/report above remain faithful.
// ===========================================================================

// GET /yarn-gate-pass/options — vehicles, weigh-bridge slips, next gate pass no.
export const getEntryOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const companyCode = getCompanyCode(req);
    const fyCode = getFYCode(req);

    const vehicles = await safe(
      () => pool.request().query("Select VehicleCode, VehicleName from tbl_Vehicle Order By VehicleName").then((r) => opt(r, "VehicleCode", "VehicleName")),
      []
    );
    const weighBridges = await safe(
      () =>
        pool
          .request()
          .input("CompanyCode", sql.Int, companyCode)
          .query("Select WeighCode, WeighBridgeNo, NetWeight from tbl_WeighBridge Where CompanyCode = @CompanyCode Order By WeighCode DESC")
          .then((r) => opt(r, "WeighCode", "WeighBridgeNo")),
      []
    );
    const nextNo = await safe(
      () =>
        pool
          .request()
          .input("CompanyCode", sql.Int, companyCode)
          .input("FYCode", sql.Int, fyCode)
          .query("Select ISNULL(MAX(GatePassNo),0)+1 AS NextNo from tbl_YarnGatePass Where CompanyCode = @CompanyCode AND FYCode = @FYCode")
          .then((r) => r.recordset?.[0]?.NextNo ?? 1),
      1
    );

    return sendSuccess(res, { vehicles, weighBridges, nextNo, companyCode });
  } catch (err) {
    console.error("DB Error (YarnGatePass.getEntryOptions):", err);
    return sendError(res, err);
  }
};

// GET /yarn-gate-pass/bills?vehicleCode= — bills available for a gate pass.
// INFERRED: pending (not yet gate-passed) invoices for the chosen vehicle.
export const getBills = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const companyCode = getCompanyCode(req);
    const fyCode = getFYCode(req);
    const vehicleCode = toInt(req.query.vehicleCode);

    const bills = await safe(
      () => {
        const request = pool
          .request()
          .input("CompanyCode", sql.Int, companyCode)
          .input("FYCode", sql.Int, fyCode);
        let where = "Where CompanyCode = @CompanyCode AND FyCode = @FYCode";
        if (vehicleCode > 0) {
          request.input("VehicleCode", sql.Int, vehicleCode);
          where += " AND VehicleCode = @VehicleCode";
        }
        return request.query(`SELECT * FROM vw_Invoice ${where}`).then((r) => r.recordset || []);
      },
      []
    );

    return sendSuccess(res, bills);
  } catch (err) {
    console.error("DB Error (YarnGatePass.getBills):", err);
    return sendError(res, err);
  }
};

// POST /yarn-gate-pass/create — save a gate pass (header + selected bills).
// INFERRED save (sp_YarnGatePass_Add + per-bill detail). On a proc/param
// mismatch the SQL error is surfaced verbatim so the exact signature is clear.
export const create = async (req, res) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const companyCode = getCompanyCode(req);
    const fyCode = getFYCode(req);
    const b = req.body || {};
    const bills = Array.isArray(b.bills) ? b.bills : [];

    if (toInt(b.VehicleCode) <= 0) return sendError(res, "Select the Vehicle", 400);
    if (bills.length === 0) return sendError(res, "No bills selected for the gate pass", 400);

    tx = new sql.Transaction(pool);
    await tx.begin();

    // Header → returns the new GatePassCode.
    const head = await new sql.Request(tx)
      .input("CompanyCode", sql.Int, companyCode)
      .input("FYCode", sql.Int, fyCode)
      .input("GatePassNo", sql.Int, toInt(b.GatePassNo))
      .input("GatePassDate", sql.DateTime, b.GatePassDate ? new Date(b.GatePassDate) : new Date())
      .input("VehicleCode", sql.Int, toInt(b.VehicleCode))
      .input("WeighCode", sql.Int, toInt(b.WeighBridgeCode))
      .input("WeighBridgeNetWeight", sql.Decimal(18, 3), toNum(b.WeighBridgeNetWeight))
      .input("TotalGrossWeight", sql.Decimal(18, 3), toNum(b.TotalGrossWeight))
      .input("UserCode", sql.Int, getUserId(req))
      .input("NodeCode", sql.Int, getNodeCode(req))
      .execute("sp_YarnGatePass_Add");

    // Name-agnostic scalar extract (repo standard) + fast-fail guard: if the
    // header proc did not return a usable code, roll back rather than commit
    // detail rows pinned to GatePassCode 0.
    const headRow = head.recordset?.[0];
    const gatePassCode = headRow ? toInt(Object.values(headRow)[0]) : 0;
    if (gatePassCode <= 0) {
      await tx.rollback().catch(() => {});
      return sendError(res, "Gate pass header save did not return a valid GatePassCode", 500);
    }

    // Detail rows — one per selected bill/invoice.
    for (const bill of bills) {
      await new sql.Request(tx)
        .input("CompanyCode", sql.Int, companyCode)
        .input("GatePassCode", sql.Int, toInt(gatePassCode))
        .input("InvoiceCode", sql.Int, toInt(bill.InvoiceCode ?? bill.BillCode ?? bill.value))
        .execute("sp_YarnGatePassDetails_Add");
    }

    await tx.commit();
    return sendSuccess(res, { GatePassCode: gatePassCode, GatePassNo: toInt(b.GatePassNo) });
  } catch (err) {
    if (tx) await tx.rollback().catch(() => {});
    console.error("DB Error (YarnGatePass.create):", err);
    return sendError(res, err);
  }
};
