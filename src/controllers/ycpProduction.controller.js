import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// YCP Production Entry
//   (port of WinForms frmYCPProduction / frmYCPProductionDetails)
//
//   Free-entry shift production: header (No / Date / Shift / Supervisor /
//   Monitor + cosmetic Branch) and one typed row per lot — the user picks Lot
//   Name (Count) + Mixing + Employee and keys No.of Cones + Cone Weight. The
//   only derived column mirrors the VB grid unbound expression:
//     Prodn = NoOfCones * ConeWeight
//   Footer totals (Total No.of Cones / Total Prodn) are summed server-side.
//
//   Save is one transaction: header AddEdit (ExecuteScalar -> YCPProdnCode) ->
//   details Delete -> per-row Insert (ONLY rows that carry an Employee, mirroring
//   the VB `If grEmployeeCode > 0`). Branch is shown on the screen but the VB
//   save does NOT persist it, so it is intentionally not sent to the proc.
//   UK_ violation -> "Already Exist the YCP Prodn".
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

// GET /ycp-production/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = toInt(req.headers.companyCode);
    const pool = await getPool(req.headers.subdbname);

    const [branches, shifts, employees, counts, mixings] = await Promise.all([
      pool.request().query(`Select BranchCode, BranchName from tbl_Branch Where CompanyCode = ${companyCode} Order By BranchName`),
      pool.request().query("select ShiftNo, ShiftName, ShiftCode, WorkingMins from tbl_Shift where ShiftCode in (2,3,4) Order by ShiftName"),
      pool.request().query(`select EmployeeCode, str_EmployeeID from vw_Employee_New where CompanyCode = ${companyCode} Order by str_EmployeeID`),
      pool.request().query("select CountName, ShortName, CountNameCode from tbl_CountName Order By CountName"),
      pool.request().query("select MixingName, ShortName, MixingNameCode from tbl_MixingName Order By MixingName"),
    ]);

    return sendSuccess(res, {
      branches: branches.recordset.map((r) => ({ value: r.BranchCode, label: r.BranchName })),
      shifts: shifts.recordset.map((r) => ({ value: r.ShiftCode, label: r.ShiftName, workingMins: r.WorkingMins })),
      employees: employees.recordset.map((r) => ({ value: r.EmployeeCode, label: r.str_EmployeeID })),
      countNames: counts.recordset.map((r) => ({ value: r.CountNameCode, label: r.CountName, shortName: r.ShortName })),
      mixingNames: mixings.recordset.map((r) => ({ value: r.MixingNameCode, label: r.MixingName })),
    });
  } catch (err) {
    console.error("DB Error (getOptions ycp-production):", err);
    return sendError(res, err);
  }
};

// GET /ycp-production/next-no
export const getNextNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const fyCode = toInt(req.headers.FYCode);
    const pool = await getPool(req.headers.subdbname);
    const no = await scalar(pool.request().input("FYCode", sql.Int, fyCode), "sp_Prodn_YCPProdnNo");
    return sendSuccess(res, { no });
  } catch (err) {
    console.error("DB Error (getNextNo ycp-production):", err);
    return sendError(res, err);
  }
};

// GET /ycp-production/lists
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = toInt(req.headers.companyCode);
    const fyCode = toInt(req.headers.FYCode);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .query(`SELECT * FROM vw_Prodn_YCPProdn WHERE CompanyCode = ${companyCode} AND FYCode = ${fyCode} ORDER BY YCPProdnNo DESC`);
    const data = result.recordset.map((item) => ({ ...item, id: item.YCPProdnCode }));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getList ycp-production):", err);
    return sendError(res, err);
  }
};

// GET /ycp-production/list/:code?shiftCode=
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    const shiftCode = toInt(req.query.shiftCode);
    if (!code) return sendError(res, "Invalid YCPProdnCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const detResult = await pool
      .request()
      .input("YCPProdnCode", sql.Int, code)
      .input("ShiftCode", sql.Int, shiftCode)
      .execute("sp_Prodn_YCPProdnDetails_GetAll");
    const rows = detResult.recordset || [];
    if (!rows.length) return sendError(res, "YCP Production not found", 404);

    const h = rows[0];
    const header = {
      YCPProdnCode: h.YCPProdnCode, YCPProdnNo: h.YCPProdnNo, YCPProdnDate: h.YCPProdnDate,
      ShiftCode: h.ShiftCode, SupervisorCode: h.SupervisorCode, MaistryCode: h.MaistryCode,
    };

    const details = rows.map((d) => ({
      CountNameCode: d.CountNameCode, CountName: d.CountName,
      MixingNameCode: d.MixingNameCode, MixingName: d.MixingName,
      EmployeeCode: d.EmployeeCode, EmployeeID: d.str_EmployeeID ?? d.EmployeeID,
      NoOfCones: toNum(d.NoOfCones), ConeWeight: toNum(d.ConeWeight), ProdnKGS: toNum(d.ProdnKGS),
    }));

    return sendSuccess(res, { header, details });
  } catch (err) {
    console.error("DB Error (getById ycp-production):", err);
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
    const shiftCode = toInt(body.ShiftCode);
    const supervisorCode = toInt(body.SupervisorCode);
    const maistryCode = toInt(body.MaistryCode);
    const ycpProdnDate = D(body.YCPProdnDate);
    const details = Array.isArray(body.details) ? body.details : [];

    if (!shiftCode) return sendError(res, "Select the Shift Name", 400);
    if (!supervisorCode) return sendError(res, "Select the Supervisor Name", 400);
    if (!maistryCode) return sendError(res, "Select the Maistry Name", 400);

    // Only rows with an Employee are persisted (VB `If grEmployeeCode > 0`).
    const computed = details
      .filter((d) => toInt(d.EmployeeCode) > 0)
      .map((d) => {
        const noofCones = toNum(d.NoOfCones);
        const coneWeight = toNum(d.ConeWeight);
        return {
          employeeCode: toInt(d.EmployeeCode),
          countNameCode: toInt(d.CountNameCode),
          mixingNameCode: toInt(d.MixingNameCode),
          noofCones, coneWeight, prodn: r2(noofCones * coneWeight),
        };
      });
    if (!computed.length) return sendError(res, "No YCP production rows to save", 400);

    const totalNoOfCones = r2(computed.reduce((a, r) => a + r.noofCones, 0));
    const totalProdn = r2(computed.reduce((a, r) => a + r.prodn, 0));

    const editCode = isEdit ? toInt(req.params.code) : 0;
    if (isEdit && !editCode) return sendError(res, "Invalid YCPProdnCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    tx = new sql.Transaction(pool);
    await tx.begin();

    // Header AddEdit -> YCPProdnCode
    const hReq = new sql.Request(tx);
    if (isEdit) hReq.input("YCPProdnCode", sql.Int, editCode);
    hReq.input("YCPProdnNo", sql.Int, toInt(body.YCPProdnNo));
    hReq.input("YCPProdnDate", sql.DateTime, ycpProdnDate);
    hReq.input("ShiftCode", sql.Int, shiftCode);
    hReq.input("SupervisorCode", sql.Int, supervisorCode);
    hReq.input("MaistryCode", sql.Int, maistryCode);
    hReq.input("TotalProdn", sql.Decimal(18, 2), totalProdn);
    hReq.input("TotalNoOfCones", sql.Decimal(18, 2), totalNoOfCones);
    hReq.input("CompanyCode", sql.Int, companyCode);
    hReq.input("FYCode", sql.Int, fyCode);
    hReq.input("User", sql.Int, userId);
    hReq.input("Node", sql.Int, nodeCode);
    const ycpProdnCode = await scalar(hReq, "sp_Prodn_YCPProdn_AddEdit");
    if (!ycpProdnCode) throw new Error("Header save returned no YCPProdnCode");

    // Details: delete then per-row insert.
    await new sql.Request(tx).input("YCPProdnCode", sql.Int, ycpProdnCode).execute("sp_Prodn_YCPProdnDetails_Delete");

    for (const c of computed) {
      const dr = new sql.Request(tx);
      dr.input("YCPProdnCode", sql.Int, ycpProdnCode);
      dr.input("EmployeeCode", sql.Int, c.employeeCode);
      dr.input("ProdnKGS", sql.Decimal(18, 2), c.prodn);
      dr.input("ConeWeight", sql.Decimal(18, 3), c.coneWeight);
      dr.input("NoOfCones", sql.Decimal(18, 2), c.noofCones);
      dr.input("CountNameCode", sql.Int, c.countNameCode);
      dr.input("MixingNameCode", sql.Int, c.mixingNameCode);
      await dr.execute("sp_Prodn_YCPProdnDetails_Insert");
    }

    await tx.commit();
    return sendSuccess(res, { YCPProdnCode: ycpProdnCode }, isEdit ? "The record is updated" : "The record is saved", isEdit ? 200 : 201);
  } catch (err) {
    if (tx) { try { await tx.rollback(); } catch (_) {} }
    if (err.message && err.message.includes("UK_")) {
      return sendError(res, "Already Exist the YCP Prodn", 409);
    }
    console.error("DB Error (saveOrUpdate ycp-production):", err);
    return sendError(res, err);
  }
};

// POST /ycp-production/create
export const create = (req, res) => saveOrUpdate(req, res, false);
// PUT  /ycp-production/update/:code
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /ycp-production/delete/:code
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (!code) return sendError(res, "Invalid YCPProdnCode", 400);
    const pool = await getPool(req.headers.subdbname);
    // VB proc param is literally named @CRDProdnCode but receives the YCPProdnCode.
    await pool.request().input("CRDProdnCode", sql.Int, code).execute("sp_Prodn_YCPProdn_Delete");
    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("REFERENCE") || err.message.includes("FK_"))) {
      return sendError(res, "You can not delete the YCP Production!", 409);
    }
    console.error("DB Error (remove ycp-production):", err);
    return sendError(res, err);
  }
};
