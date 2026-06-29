import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Yarn Production Fixing (port of the WinForms frmYarnProductionFixing — Yarn
// Production ▸ Packing ▸ Yarn Fixing). A master-DETAIL transaction: the user
// composes N "fixing" lines and Save writes one header (sp_YarnFixing_Add →
// FixingCode) + a row per line (sp_YarnFixingDetails_Add), all in one tx.
//
//   Lookups   : GET /yarn-fixing/options?date=   (all dropdowns)
//               GET /yarn-fixing/employees?date= (supervisor/employee by date)
//   Prev entry: GET /yarn-fixing/prev-entry?date= (that day's saved lines)
//   Create    : POST /yarn-fixing/create  { FixingDate, details:[...] }
//
// Count Type rows carry the weights/tolerances/colours the form reads on change
// (Weight_Tolerance_Min/Max, TipColourCode, BagColourCode, ConeTipWeight,
// ConeCoverWeight, BagBoxWeight, SutleeStrapWeight, YarnWeight, StdWeight,
// AllowanceExcessWt). On add the VB also writes a typed tolerance back to
// tbl_CountType — we replicate that per line at save time.
// CompanyCode / userId / nodeCode come from the JWT (req.headers).
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
const getCompanyCode = (req) => toInt(req.headers.companyCode);

const opt = (rs, valueKey, labelKey) =>
  (rs.recordset || []).map((r) => ({ ...r, value: r[valueKey], label: r[labelKey] }));

const loadEmployees = async (pool, companyCode, date) => {
  const rs = await pool
    .request()
    .input("CompanyCode", sql.Int, companyCode)
    .input("AttenDate", sql.DateTime, date)
    .execute("sp_YarnProduction_GetbyEmployee");
  return opt(rs, "EmployeeCode", "str_EmployeeID");
};

// GET /yarn-fixing/options?date= — every dropdown the line panel needs.
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);
    const date = D(req.query.date) || new Date();

    const [employees, productionTypes, packingTypes, countTypes, lotNos, tipColours, bagColours, boxPackings] =
      await Promise.all([
        loadEmployees(pool, companyCode, date),
        pool.request().query(
          "Select YarnProductionTypeCode, YarnProductionType from tbl_YarnProductionType WHERE YarnProductionTypeCode IN (1,2,4,7) Order by YarnProductionType"
        ),
        pool.request().query("Select YarnPackingTypeCode, YarnPackingType from tbl_YarnPackingType Order by YarnPackingType"),
        pool.request().input("Status", sql.Bit, 1).execute("sp_CountType_GetAll"),
        pool.request().input("Status", sql.Bit, 1).execute("sp_LotNo_GetAll"),
        pool.request().execute("sp_TipColour_GetAll"),
        pool.request().execute("sp_BagColour_GetAll"),
        pool.request().execute("sp_BoxPacking_GetAll"),
      ]);

    return sendSuccess(res, {
      supervisors: employees,
      employees,
      productionTypes: opt(productionTypes, "YarnProductionTypeCode", "YarnProductionType"),
      packingTypes: opt(packingTypes, "YarnPackingTypeCode", "YarnPackingType"),
      countTypes: opt(countTypes, "CountTypeCode", "ShortName"),
      lotNos: opt(lotNos, "LotNoCode", "LotNo"),
      tipColours: opt(tipColours, "TipColourCode", "TipColour"),
      bagColours: opt(bagColours, "BagColourCode", "BagColour"),
      boxPackings: opt(boxPackings, "BoxPackingCode", "BoxPackingName"),
    });
  } catch (err) {
    console.error("DB Error (YarnFixing.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /yarn-fixing/employees?date= — refresh supervisor/employee on date change.
export const getEmployeesByDate = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const employees = await loadEmployees(pool, getCompanyCode(req), D(req.query.date) || new Date());
    return sendSuccess(res, { supervisors: employees, employees });
  } catch (err) {
    console.error("DB Error (YarnFixing.getEmployeesByDate):", err);
    return sendError(res, err);
  }
};

// GET /yarn-fixing/prev-entry?date= — reload that day's saved lines (Load_PrevEntry).
export const getPrevEntry = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const rs = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("FixingDate", sql.DateTime, D(req.query.date) || new Date())
      .execute("sp_YarnProductionEntry_BindData");
    return sendSuccess(res, rs.recordset || []);
  } catch (err) {
    console.error("DB Error (YarnFixing.getPrevEntry):", err);
    return sendError(res, err);
  }
};

// POST /yarn-fixing/create — header + detail rows in one transaction (btnSave).
export const create = async (req, res) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const companyCode = getCompanyCode(req);
    if (companyCode <= 0) return sendError(res, "Select the Company", 400);

    const body = req.body || {};
    const fixingDate = D(body.FixingDate);
    if (!fixingDate) return sendError(res, "Invalid Ref. Date", 400);

    const details = Array.isArray(body.details) ? body.details : [];
    if (!details.length) return sendError(res, "Enter the Yarn Fixing Details", 400);

    // Per-line validation (mirrors btnAdd_Click) + duplicate Count+Lot guard.
    const seen = new Set();
    for (const d of details) {
      if (toInt(d.SupervisorCode) <= 0) return sendError(res, "Select the Supervisor", 400);
      if (toInt(d.EmployeeCode) <= 0) return sendError(res, "Select the P-Employee", 400);
      if (toInt(d.PackingTypeCode) <= 0) return sendError(res, "Select the Packing Type", 400);
      if (toInt(d.ProductionTypeCode) <= 0) return sendError(res, "Select the Production Type", 400);
      if (toInt(d.LotNoCode) <= 0) return sendError(res, "Select the Lot No", 400);
      if (toInt(d.CountTypeCode) <= 0) return sendError(res, "Select the Count Type", 400);
      if (toInt(d.TipColourCode) <= 0) return sendError(res, "Select the Tip Colour", 400);
      if (toInt(d.BoxPackingCode) <= 0) return sendError(res, "Select the Box Packing", 400);
      if (toInt(d.ConeCount) <= 0) return sendError(res, "Enter the No. of Cones", 400);
      const key = `${toInt(d.CountTypeCode)}|${toInt(d.LotNoCode)}`;
      if (seen.has(key)) return sendError(res, "Already exist the Count", 400);
      seen.add(key);
    }

    const pool = await getPool(req.headers.subdbname);
    tx = new sql.Transaction(pool);
    await tx.begin();

    // Header → returns the new FixingCode (ExecuteScalar in the VB).
    const head = new sql.Request(tx);
    head.input("FixingDate", sql.DateTime, fixingDate);
    head.input("CompanyCode", sql.Int, companyCode);
    head.input("C_User", sql.Int, toInt(userId));
    head.input("C_Node", sql.Int, toInt(nodeCode));
    const headRes = await head.execute("sp_YarnFixing_Add");
    const fixingCode = toInt(Object.values(headRes.recordset?.[0] || {})[0]);

    // Detail rows + the tbl_CountType tolerance write-back the VB does on add.
    for (const d of details) {
      const line = new sql.Request(tx);
      // FixingCode is a Long (Int64) in the VB — bind as BigInt to be safe.
      line.input("FixingCode", sql.BigInt, fixingCode);
      line.input("SupervisorCode", sql.Int, toInt(d.SupervisorCode));
      line.input("EmployeeCode", sql.Int, toInt(d.EmployeeCode));
      line.input("YarnProductionTypeCode", sql.Int, toInt(d.ProductionTypeCode));
      line.input("YarnPackingTypeCode", sql.Int, toInt(d.PackingTypeCode));
      line.input("LotNoCode", sql.Int, toInt(d.LotNoCode));
      line.input("ConeCount", sql.Int, toInt(d.ConeCount));
      line.input("CountTypeCode", sql.Int, toInt(d.CountTypeCode));
      line.input("TareWeight", sql.Decimal(18, 3), toNum(d.TareWeight));
      line.input("CompanyCode", sql.Int, companyCode);
      line.input("TipColourCode", sql.Int, toInt(d.TipColourCode));
      line.input("BoxPackingCode", sql.Int, toInt(d.BoxPackingCode));
      await line.execute("sp_YarnFixingDetails_Add");

      // Persist a typed tolerance back onto the count-type master (btnAdd side effect).
      const tolMin = toNum(d.Tolerence_Min);
      const tolMax = toNum(d.Tolerence_Max);
      if (tolMin > 0) {
        await new sql.Request(tx)
          .input("Min", sql.Decimal(18, 3), tolMin)
          .input("Code", sql.Int, toInt(d.CountTypeCode))
          .query("Update tbl_CountType Set Weight_Tolerance_Min = @Min Where CountTypeCode = @Code");
      }
      if (tolMax > 0) {
        await new sql.Request(tx)
          .input("Max", sql.Decimal(18, 3), tolMax)
          .input("Code", sql.Int, toInt(d.CountTypeCode))
          .query("Update tbl_CountType Set Weight_Tolerance_Max = @Max Where CountTypeCode = @Code");
      }
    }

    await tx.commit();
    return sendSuccess(res, { FixingCode: fixingCode, count: details.length }, "The record(s) are saved", 201);
  } catch (err) {
    if (tx) {
      try {
        await tx.rollback();
      } catch (_) {}
    }
    console.error("DB Error (YarnFixing.create):", err);
    return sendError(res, err);
  }
};
