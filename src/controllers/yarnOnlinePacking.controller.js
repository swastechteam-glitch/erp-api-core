import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// On Line Packing (port of the WinForms frmYarnProductionEntry_OnLine).
// A rapid weigh-and-save screen: pick a "Count" (a fixing entry that carries
// supervisor/employee/production/packing/lot/cones + the weight parts), the
// weight is captured, and each save inserts ONE bag into tbl_YarnStock via
// sp_YarnStock_AddEdit (EntryType "A").
//
//   Counts    : GET /yarn-online-packing/counts?date=  (ensures the day's
//               fixing header exists, then returns sp_YarnProductionEntry_BindData
//               rows + box packings)
//   Next bag  : GET /yarn-online-packing/next-bag-no?...
//   List      : GET /yarn-online-packing/lists?date=  (last entries + count-wise + total)
//   Create    : POST /yarn-online-packing/create { ProductionDate, CountTypeCode,
//               Weight, BoxPackingCode }
//
// The scale connection (LAN/serial) and TSPL label printing in the VB are
// desktop-hardware concerns and are not performed here — the web client enters
// the weight manually. CompanyCode / FYCode / userId / nodeCode come from the JWT.
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};
const str = (v) => (v ?? "").toString().trim();
const D = (v) => (v ? new Date(v) : null);
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getFYCode = (req) => toInt(req.headers.FYCode);

// Auto-create the day's Yarn Fixing header if absent (YarnFixing_Insert).
const ensureFixing = async (pool, companyCode, fyCode, date) => {
  const exists = await pool
    .request()
    .input("CompanyCode", sql.Int, companyCode)
    .input("FYCode", sql.Int, fyCode)
    .input("FixingDate", sql.DateTime, date)
    .query(
      // Compare by date only (the day's header), matching the codebase
      // convention — a stored time component must not cause a false re-insert.
      "Select 1 from tbl_YarnFixing where CompanyCode=@CompanyCode AND FYCode=@FYCode AND CAST(FixingDate AS DATE) = CAST(@FixingDate AS DATE)"
    );
  if ((exists.recordset || []).length) return;
  await pool
    .request()
    .input("FixingDate", sql.DateTime, date)
    .input("CompanyCode", sql.Int, companyCode)
    .input("FYCode", sql.Int, fyCode)
    .execute("sp_YarnFixing_Insert_Auto");
};

// Fetch the day's fixing/count rows (each carries the full line detail).
const loadCounts = async (pool, companyCode, date) => {
  const rs = await pool
    .request()
    .input("CompanyCode", sql.Int, companyCode)
    .input("FixingDate", sql.DateTime, date)
    .execute("sp_YarnProductionEntry_BindData");
  return rs.recordset || [];
};

// GET /yarn-online-packing/counts?date=
export const getCounts = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const fyCode = getFYCode(req);
    const pool = await getPool(req.headers.subdbname);
    const date = D(req.query.date) || new Date();

    await ensureFixing(pool, companyCode, fyCode, date);
    const [countRows, boxRs] = await Promise.all([
      loadCounts(pool, companyCode, date),
      pool.request().execute("sp_BoxPacking_GetAll"),
    ]);

    const counts = countRows.map((r) => ({ ...r, value: r.CountTypeCode, label: r.ShortName ?? r.CountType }));
    const boxPackings = (boxRs.recordset || []).map((r) => ({ ...r, value: r.BoxPackingCode, label: r.BoxPackingName }));
    return sendSuccess(res, { counts, boxPackings });
  } catch (err) {
    console.error("DB Error (YarnOnlinePacking.getCounts):", err);
    return sendError(res, err);
  }
};

const readBagNoSetting = async (pool, companyCode) => {
  const r = await pool
    .request()
    .input("CompanyCode", sql.Int, companyCode)
    .query("Select YarnBagNoSetting from tbl_Setting WHERE CompanyCode = @CompanyCode");
  const v = r.recordset?.[0] ? Object.values(r.recordset[0])[0] : 0;
  return v === true || v === 1 || v === "1";
};

// Next bag no (online GetBagNo): setting off -> sp_YarnProduction_BagNo(@ProductionDate);
// setting on -> sp_YarnProduction_BagNo_GetbyBagSetting(@CompanyCode,@ProductionDate,@YarnBagNoGroupCode).
const generateBagNo = async (pool, { companyCode, date, bagNoSetting, yarnBagNoGroupCode, countTypeCode }) => {
  let r;
  if (!bagNoSetting) {
    r = await pool.request().input("ProductionDate", sql.DateTime, date).execute("sp_YarnProduction_BagNo");
  } else {
    if (toInt(countTypeCode) <= 0) return 0;
    r = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("ProductionDate", sql.DateTime, date)
      .input("YarnBagNoGroupCode", sql.Int, toInt(yarnBagNoGroupCode))
      .execute("sp_YarnProduction_BagNo_GetbyBagSetting");
  }
  return toInt(r.recordset?.[0] ? Object.values(r.recordset[0])[0] : 0);
};

// GET /yarn-online-packing/next-bag-no?productionDate=&yarnBagNoGroupCode=&countTypeCode=
export const getNextBagNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const companyCode = getCompanyCode(req);
    const bagNoSetting = await readBagNoSetting(pool, companyCode);
    const bagNo = await generateBagNo(pool, {
      companyCode,
      date: D(req.query.productionDate) || new Date(),
      bagNoSetting,
      yarnBagNoGroupCode: req.query.yarnBagNoGroupCode,
      countTypeCode: req.query.countTypeCode,
    });
    return sendSuccess(res, { bagNo });
  } catch (err) {
    console.error("DB Error (YarnOnlinePacking.getNextBagNo):", err);
    return sendError(res, err);
  }
};

// GET /yarn-online-packing/lists?date= — last entries + count-wise + total qty.
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const companyCode = getCompanyCode(req);
    const date = D(req.query.date) || new Date();

    const [lastRs, countRs] = await Promise.all([
      pool
        .request()
        .input("ProductionDate", sql.DateTime, date)
        .input("CompanyCode", sql.Int, companyCode)
        .input("Opening", sql.Bit, 0)
        .execute("sp_YarnStock_GetByProductionDate"),
      pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("FromDate", sql.DateTime, date)
        .input("ToDate", sql.DateTime, date)
        .execute("sp_YarnStock_CountWise"),
    ]);

    const lastEntries = lastRs.recordset || [];
    const countWise = countRs.recordset || [];
    const totalQty = countWise.reduce((sum, r) => sum + toNum(r.Bags), 0);
    return sendSuccess(res, { lastEntries, countWise, totalQty });
  } catch (err) {
    console.error("DB Error (YarnOnlinePacking.getList):", err);
    return sendError(res, err);
  }
};

// POST /yarn-online-packing/create — save one bag (SaveRecords, EntryType "A").
export const create = async (req, res) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const companyCode = getCompanyCode(req);
    const fyCode = getFYCode(req);
    if (companyCode <= 0) return sendError(res, "Select the Company", 400);

    const b = req.body || {};
    const date = D(b.ProductionDate);
    if (!date) return sendError(res, "Invalid Date", 400);
    const countTypeCode = toInt(b.CountTypeCode);
    if (countTypeCode <= 0) return sendError(res, "Select the Count Type", 400);
    const weight = toNum(b.Weight); // raw weight captured (scale / manual)
    const boxPackingCode = toInt(b.BoxPackingCode);
    if (boxPackingCode <= 0) return sendError(res, "Select Box Packing", 400);

    const pool = await getPool(req.headers.subdbname);

    // Re-derive every saved field from the authoritative count (fixing) row.
    const counts = await loadCounts(pool, companyCode, date);
    const c = counts.find((r) => toInt(r.CountTypeCode) === countTypeCode);
    if (!c) return sendError(res, "Count Type not found for this date", 400);

    if (toInt(c.ConeCount) <= 0) return sendError(res, "No. of Cones should not be zero", 400);

    // Tolerance (production type <> 2): weight within Std ± [tolMin, tolMax],
    // where Std = StdWeight + AllowanceExcessWt + ConeTipWeight + ConeCoverWeight.
    const stdTol =
      toNum(c.StdWeight) + toNum(c.AllowanceExcessWt) + toNum(c.ConeTipWeight) + toNum(c.ConeCoverWeight);
    if (toInt(c.YarnProductionTypeCode) !== 2) {
      const tolMin = toNum(c.Weight_Tolerance_Min);
      const tolMax = toNum(c.Weight_Tolerance_Max);
      if (weight < stdTol - tolMin) return sendError(res, `Low Standard Weight on ${tolMin} Grams Tolerance`, 400);
      if (weight > stdTol + tolMax) return sendError(res, `Higher than Standard Weight on ${tolMax} Grams Tolerance`, 400);
    }

    // Weights (SaveRecords): Gross = weight + BagBox + Sutlee; Tare = count Tare;
    // Net = Gross - Tare.
    const grossWeight = weight + toNum(c.BagBoxWeight) + toNum(c.SutleeStrapWeight);
    const tareWeight = toNum(c.TareWeight);
    const netWeight = grossWeight - tareWeight;
    if (netWeight <= 0) return sendError(res, "Net Weight should not be zero", 400);
    if (grossWeight <= 0) return sendError(res, "Gross Weight should not be zero", 400);
    if (netWeight > grossWeight) return sendError(res, "Net Weight should not be greater than Gross Weight", 400);

    const bagNoSetting = await readBagNoSetting(pool, companyCode);
    const yarnBagNoGroupCode = toInt(c.YarnBagNoGroupCode);
    const bagNo = await generateBagNo(pool, {
      companyCode, date, bagNoSetting, yarnBagNoGroupCode, countTypeCode,
    });
    if (bagNo <= 0) return sendError(res, "Bag No could not be generated", 400);

    // Duplicate bag guard (sp_BagNoCheck).
    const dup = await pool
      .request()
      .input("BagNo", sql.Int, bagNo)
      .input("FYCode", sql.Int, fyCode)
      .input("CompanyCode", sql.Int, companyCode)
      .input("YarnProductionTypeCode", sql.Int, toInt(c.YarnProductionTypeCode))
      .input("YarnBagNoGroupCode", sql.Int, yarnBagNoGroupCode)
      .execute("sp_BagNoCheck");
    if ((dup.recordset || []).length) return sendError(res, "Already Exist the BagNo", 409);

    tx = new sql.Transaction(pool);
    await tx.begin();
    const head = new sql.Request(tx);
    head.input("C_User", sql.Int, toInt(userId));
    head.input("C_Node", sql.Int, toInt(nodeCode));
    head.input("ProductionDate", sql.DateTime, date);
    head.input("SupervisorCode", sql.Int, toInt(c.SupervisorCode));
    head.input("EmployeeCode", sql.Int, toInt(c.EmployeeCode));
    head.input("BagNo", sql.Int, bagNo);
    head.input("LotNoCode", sql.Int, toInt(c.LotNoCode));
    head.input("CountTypeCode", sql.Int, countTypeCode);
    head.input("YarnProductionTypeCode", sql.Int, toInt(c.YarnProductionTypeCode));
    head.input("YarnPackingTypeCode", sql.Int, toInt(c.YarnPackingTypeCode));
    head.input("TrallyWeight", sql.Decimal(18, 3), 0);
    head.input("GrossWeight", sql.Decimal(18, 3), grossWeight);
    head.input("TareWeight", sql.Decimal(18, 3), tareWeight);
    head.input("NetWeight", sql.Decimal(18, 3), netWeight);
    head.input("StdWeight", sql.Decimal(18, 3), stdTol);
    head.input("DeliveryWeight", sql.Decimal(18, 3), toNum(c.DeliveryWeight));
    head.input("ConeCount", sql.Int, toInt(c.ConeCount));
    head.input("CompanyCode", sql.Int, companyCode);
    head.input("YarnType", sql.NVarChar, str(c.YarnProductionType).slice(0, 1));
    head.input("EntryType", sql.NVarChar, "A");
    if (yarnBagNoGroupCode > 0) head.input("YarnBagNoGroupCode", sql.Int, yarnBagNoGroupCode);
    head.input("BoxPackingCode", sql.Int, boxPackingCode);
    head.input("BagColourCode", sql.Int, toInt(c.BagColourCode));
    head.input("TipColourCode", sql.Int, toInt(c.TipColourCode));
    await head.execute("sp_YarnStock_AddEdit");
    await tx.commit();

    return sendSuccess(res, { BagNo: bagNo, GrossWeight: grossWeight, NetWeight: netWeight }, "The record is saved", 201);
  } catch (err) {
    if (tx) { try { await tx.rollback(); } catch (_) {} }
    if (err.message && err.message.includes("PK_YarnStock_BagNo"))
      return sendError(res, "Already exist the BagNo", 409);
    console.error("DB Error (YarnOnlinePacking.create):", err);
    return sendError(res, err);
  }
};

// PUT /yarn-online-packing/update/:productionNo — edit one saved bag.
// Same re-derivation as create, but the edit key block (ProductionNo/E_User/
// E_Node) is bound and the Bag No is kept as saved (never regenerated).
export const update = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const companyCode = getCompanyCode(req);
    const fyCode = getFYCode(req);
    const productionNo = toInt(req.params.productionNo);
    if (productionNo <= 0) return sendError(res, "Invalid ProductionNo", 400);

    const b = req.body || {};
    const date = D(b.ProductionDate);
    if (!date) return sendError(res, "Invalid Date", 400);
    const countTypeCode = toInt(b.CountTypeCode);
    if (countTypeCode <= 0) return sendError(res, "Select the Count Type", 400);
    const weight = toNum(b.Weight);
    const boxPackingCode = toInt(b.BoxPackingCode);
    if (boxPackingCode <= 0) return sendError(res, "Select Box Packing", 400);
    const bagNo = toInt(b.BagNo);
    if (bagNo <= 0) return sendError(res, "Bag No should not be empty", 400);

    const pool = await getPool(req.headers.subdbname);
    const counts = await loadCounts(pool, companyCode, date);
    const c = counts.find((r) => toInt(r.CountTypeCode) === countTypeCode);
    if (!c) return sendError(res, "Count Type not found for this date", 400);
    if (toInt(c.ConeCount) <= 0) return sendError(res, "No. of Cones should not be zero", 400);

    const stdTol =
      toNum(c.StdWeight) + toNum(c.AllowanceExcessWt) + toNum(c.ConeTipWeight) + toNum(c.ConeCoverWeight);
    if (toInt(c.YarnProductionTypeCode) !== 2) {
      const tolMin = toNum(c.Weight_Tolerance_Min);
      const tolMax = toNum(c.Weight_Tolerance_Max);
      if (weight < stdTol - tolMin) return sendError(res, `Low Standard Weight on ${tolMin} Grams Tolerance`, 400);
      if (weight > stdTol + tolMax) return sendError(res, `Higher than Standard Weight on ${tolMax} Grams Tolerance`, 400);
    }
    const grossWeight = weight + toNum(c.BagBoxWeight) + toNum(c.SutleeStrapWeight);
    const tareWeight = toNum(c.TareWeight);
    const netWeight = grossWeight - tareWeight;
    if (netWeight <= 0) return sendError(res, "Net Weight should not be zero", 400);
    if (grossWeight <= 0) return sendError(res, "Gross Weight should not be zero", 400);
    if (netWeight > grossWeight) return sendError(res, "Net Weight should not be greater than Gross Weight", 400);

    const yarnBagNoGroupCode = toInt(c.YarnBagNoGroupCode);
    const head = pool.request();
    head.input("ProductionNo", sql.Int, productionNo);
    head.input("E_User", sql.Int, toInt(userId));
    head.input("E_Node", sql.Int, toInt(nodeCode));
    head.input("FYCode", sql.Int, fyCode);
    head.input("ProductionDate", sql.DateTime, date);
    head.input("SupervisorCode", sql.Int, toInt(c.SupervisorCode));
    head.input("EmployeeCode", sql.Int, toInt(c.EmployeeCode));
    head.input("BagNo", sql.Int, bagNo);
    head.input("LotNoCode", sql.Int, toInt(c.LotNoCode));
    head.input("CountTypeCode", sql.Int, countTypeCode);
    head.input("YarnProductionTypeCode", sql.Int, toInt(c.YarnProductionTypeCode));
    head.input("YarnPackingTypeCode", sql.Int, toInt(c.YarnPackingTypeCode));
    head.input("TrallyWeight", sql.Decimal(18, 3), 0);
    head.input("GrossWeight", sql.Decimal(18, 3), grossWeight);
    head.input("TareWeight", sql.Decimal(18, 3), tareWeight);
    head.input("NetWeight", sql.Decimal(18, 3), netWeight);
    head.input("StdWeight", sql.Decimal(18, 3), stdTol);
    head.input("DeliveryWeight", sql.Decimal(18, 3), toNum(c.DeliveryWeight));
    head.input("ConeCount", sql.Int, toInt(c.ConeCount));
    head.input("CompanyCode", sql.Int, companyCode);
    head.input("YarnType", sql.NVarChar, str(c.YarnProductionType).slice(0, 1));
    head.input("EntryType", sql.NVarChar, "A");
    if (yarnBagNoGroupCode > 0) head.input("YarnBagNoGroupCode", sql.Int, yarnBagNoGroupCode);
    head.input("BoxPackingCode", sql.Int, boxPackingCode);
    head.input("BagColourCode", sql.Int, toInt(c.BagColourCode));
    head.input("TipColourCode", sql.Int, toInt(c.TipColourCode));
    await head.execute("sp_YarnStock_AddEdit");

    return sendSuccess(res, { ProductionNo: productionNo, BagNo: bagNo }, "The record is updated");
  } catch (err) {
    if (err.message && err.message.includes("PK_YarnStock_BagNo"))
      return sendError(res, "Already exist the BagNo", 409);
    console.error("DB Error (YarnOnlinePacking.update):", err);
    return sendError(res, err);
  }
};

// DELETE /yarn-online-packing/:productionNo — remove one saved bag.
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const productionNo = toInt(req.params.productionNo);
    if (productionNo <= 0) return sendError(res, "Invalid ProductionNo", 400);
    const pool = await getPool(req.headers.subdbname);
    await pool.request().input("ProductionNo", sql.Int, productionNo).execute("sp_YarnStock_Delete");
    return sendSuccess(res, { ProductionNo: productionNo }, "The record is deleted");
  } catch (err) {
    console.error("DB Error (YarnOnlinePacking.remove):", err);
    return sendError(res, err);
  }
};
