import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Yarn Production Add (port of the WinForms frmYarnProductionAdd — Yarn
// Production ▸ Packing Manual Entry). A transaction screen: each Save inserts
// ONE bag (or N bags via "bulk posting") into tbl_YarnStock through
// sp_YarnStock_AddEdit, and the right-side grid lists already-saved rows.
//
//   Lookups : GET /yarn-production/options?date=   (all header dropdowns)
//             GET /yarn-production/employees?date=  (supervisor + employee by date)
//             GET /yarn-production/next-bag-no?...   (auto bag number)
//   List    : GET /yarn-production/lists?fromDate=&toDate=&countTypeCode=&
//                 lotNoCode=&opening=&countWise=
//   Create  : POST /yarn-production/create          (sp_YarnStock_AddEdit, C_/E_;
//                 supports noOfBags > 1 — sequential bag numbers)
//   Update  : PUT  /yarn-production/update/:productionNo
//
// Bag No allocation mirrors the VB exactly: it depends on the tbl_Setting flag
// YarnBagNoSetting for the company —
//   off : sp_YarnProduction_BagNo(@CompanyCode,@ProductionDate,@BagNoGroupCode)
//         where BagNoGroupCode comes from the Production Type row.
//   on  : sp_YarnProduction_BagNo_GetbyBagSetting(@CompanyCode,@ProductionDate,
//         @YarnBagNoGroupCode) where YarnBagNoGroupCode comes from the Count Type.
// Duplicate guard likewise switches between sp_BagNoCheck and
// sp_BagNoCheck_With_Count. CompanyCode / FYCode / userId / nodeCode come from
// the JWT (req.headers, set by authMiddleware).
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

// Read the single scalar a proc/query SELECTs (next no / new code / flag).
const scalar = async (request, procOrNull, query) => {
  const r = procOrNull ? await request.execute(procOrNull) : await request.query(query);
  const row = r.recordset?.[0];
  return row ? Object.values(row)[0] : null;
};

// Shape a recordset into [{ value, label, ...row }] for a dropdown.
const opt = (rs, valueKey, labelKey) =>
  (rs.recordset || []).map((r) => ({ ...r, value: r[valueKey], label: r[labelKey] }));

// --- Employee/Supervisor list (date-dependent attendance source) -------------
const loadEmployees = async (pool, companyCode, date) => {
  const rs = await pool
    .request()
    .input("CompanyCode", sql.Int, companyCode)
    .input("AttenDate", sql.DateTime, date)
    .execute("sp_YarnProduction_GetbyEmployee");
  // cmbSupervisor/cmbEmployee: value EmployeeCode, label str_EmployeeID.
  return opt(rs, "EmployeeCode", "str_EmployeeID");
};

// GET /yarn-production/options?date= — every header dropdown in one round-trip.
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);
    const date = D(req.query.date) || new Date();

    const [employees, productionTypes, packingTypes, countTypes, lotNos, boxPackings, bagColours, tipColours] =
      await Promise.all([
        loadEmployees(pool, companyCode, date),
        // Production Type — only 1,2,4,7 (cmbProductionType RecordSource).
        pool.request().query(
          "Select YarnProductionTypeCode, YarnProductionType, BagNoGroupCode FROM tbl_YarnProductionType WHERE YarnProductionTypeCode IN (1,2,4,7) Order by YarnProductionType"
        ),
        pool.request().query("Select YarnPackingTypeCode, YarnPackingType from tbl_YarnPackingType Order by YarnPackingType"),
        pool.request().input("Status", sql.Bit, 1).execute("sp_CountType_GetAll"),
        pool.request().input("Status", sql.Bit, 1).execute("sp_LotNo_GetAll"),
        pool.request().execute("sp_BoxPacking_GetAll"),
        pool.request().execute("sp_BagColour_GetAll"),
        pool.request().execute("sp_TipColour_GetAll"),
      ]);

    return sendSuccess(res, {
      // Same source feeds both Supervisor and Employee (matches the VB).
      supervisors: employees,
      employees,
      productionTypes: opt(productionTypes, "YarnProductionTypeCode", "YarnProductionType"),
      packingTypes: opt(packingTypes, "YarnPackingTypeCode", "YarnPackingType"),
      // Count Type rows carry StdWeight / AllowanceExcessWt / TareWeight /
      // DeliveryWeight / Weight_Tolerance_Min|Max / TipColourCode / BagColourCode
      // / YarnBagNoGroupCode — the form reads them on change (kept by spread).
      countTypes: opt(countTypes, "CountTypeCode", "ShortName"),
      lotNos: opt(lotNos, "LotNoCode", "LotNo"),
      boxPackings: opt(boxPackings, "BoxPackingCode", "BoxPackingName"),
      bagColours: opt(bagColours, "BagColourCode", "BagColour"),
      tipColours: opt(tipColours, "TipColourCode", "TipColour"),
    });
  } catch (err) {
    console.error("DB Error (YarnProduction.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /yarn-production/employees?date= — refresh supervisor/employee on date change.
export const getEmployeesByDate = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const date = D(req.query.date) || new Date();
    const employees = await loadEmployees(pool, getCompanyCode(req), date);
    return sendSuccess(res, { supervisors: employees, employees });
  } catch (err) {
    console.error("DB Error (YarnProduction.getEmployeesByDate):", err);
    return sendError(res, err);
  }
};

// Read the company's YarnBagNoSetting flag (tbl_Setting).
const readBagNoSetting = async (pool, companyCode) => {
  const v = await scalar(
    pool.request().input("CompanyCode", sql.Int, companyCode),
    null,
    "Select YarnBagNoSetting from tbl_Setting WHERE CompanyCode = @CompanyCode"
  );
  return v === true || v === 1 || v === "1";
};

// Allocate the next Bag No on a fresh request (GetBagNo in the VB).
const generateBagNo = async (
  pool,
  { companyCode, productionDate, bagNoSetting, bagNoGroupCode, yarnBagNoGroupCode, countTypeCode }
) => {
  if (!bagNoSetting) {
    return toInt(
      await scalar(
        pool
          .request()
          .input("CompanyCode", sql.Int, companyCode)
          .input("ProductionDate", sql.DateTime, productionDate)
          .input("BagNoGroupCode", sql.Int, toInt(bagNoGroupCode)),
        "sp_YarnProduction_BagNo"
      )
    );
  }
  if (toInt(countTypeCode) <= 0) return 0;
  return toInt(
    await scalar(
      pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("ProductionDate", sql.DateTime, productionDate)
        .input("YarnBagNoGroupCode", sql.Int, toInt(yarnBagNoGroupCode)),
      "sp_YarnProduction_BagNo_GetbyBagSetting"
    )
  );
};

// GET /yarn-production/next-bag-no?productionDate=&bagNoGroupCode=&
//     yarnBagNoGroupCode=&countTypeCode=
export const getNextBagNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const companyCode = getCompanyCode(req);
    const bagNoSetting = await readBagNoSetting(pool, companyCode);
    const bagNo = await generateBagNo(pool, {
      companyCode,
      productionDate: D(req.query.productionDate) || new Date(),
      bagNoSetting,
      bagNoGroupCode: req.query.bagNoGroupCode,
      yarnBagNoGroupCode: req.query.yarnBagNoGroupCode,
      countTypeCode: req.query.countTypeCode,
    });
    return sendSuccess(res, { bagNo });
  } catch (err) {
    console.error("DB Error (YarnProduction.getNextBagNo):", err);
    return sendError(res, err);
  }
};

// Duplicate-bag guard (sp_BagNoCheck / sp_BagNoCheck_With_Count).
const bagNoExists = async (
  pool,
  { bagNo, fyCode, companyCode, productionTypeCode, yarnBagNoGroupCode, countTypeCode, bagNoSetting }
) => {
  let rs;
  if (!bagNoSetting) {
    rs = await pool
      .request()
      .input("BagNo", sql.Int, bagNo)
      .input("FYCode", sql.Int, fyCode)
      .input("CompanyCode", sql.Int, companyCode)
      .input("YarnProductionTypeCode", sql.Int, toInt(productionTypeCode))
      .input("YarnBagNoGroupCode", sql.Int, toInt(yarnBagNoGroupCode))
      .execute("sp_BagNoCheck");
  } else {
    rs = await pool
      .request()
      .input("BagNo", sql.Int, bagNo)
      .input("CounttypeCode", sql.Int, toInt(countTypeCode))
      .input("FYCode", sql.Int, fyCode)
      .input("CompanyCode", sql.Int, companyCode)
      .input("YarnProductionTypeCode", sql.Int, toInt(productionTypeCode))
      .execute("sp_BagNoCheck_With_Count");
  }
  return (rs.recordset || []).length > 0;
};

// GET /yarn-production/lists — saved rows for the right-side grid (btnView).
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const companyCode = getCompanyCode(req);
    const opening = toInt(req.query.opening) === 1;
    const countWise = toInt(req.query.countWise) === 1;
    const countTypeCode = toInt(req.query.countTypeCode);
    const lotNoCode = toInt(req.query.lotNoCode);
    const proc = countWise ? "sp_YarnStock_CountWise" : "sp_YarnStock_GetByProductionDate";

    const request = pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("CountTypeCode", sql.Int, countTypeCode > 0 ? countTypeCode : null)
      .input("LotNoCode", sql.Int, lotNoCode > 0 ? lotNoCode : null)
      .input("Opening", sql.Bit, opening ? 1 : 0);
    if (!opening) {
      request
        .input("FromDate", sql.DateTime, D(req.query.fromDate) || new Date())
        .input("ToDate", sql.DateTime, D(req.query.toDate) || new Date());
    }

    const result = await request.execute(proc);
    const data = (result.recordset || []).map((r) => ({ ...r, id: toInt(r.ProductionNo) }));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (YarnProduction.getList):", err);
    return sendError(res, err);
  }
};

// Shared field validation (mirrors btnSave_Click's ordered guards).
const validateEntry = (b) => {
  if (!D(b.ProductionDate)) return "Invalid Ref. Date";
  if (toInt(b.SupervisorCode) <= 0) return "Select the Supervisor";
  if (toInt(b.PackingTypeCode) <= 0) return "Select the PackingType";
  if (toInt(b.ProductionTypeCode) <= 0) return "Select the Production Type";
  if (toInt(b.EmployeeCode) <= 0) return "Select the P-Employee";
  if (toInt(b.LotNoCode) <= 0) return "Select the Lot No";
  if (toInt(b.CountTypeCode) <= 0) return "Select the Count Type";
  if (toNum(b.GrossWeight) <= 0) return "Gross Weight should not be zero";
  if (toNum(b.NetWeight) > toNum(b.GrossWeight))
    return "Net Weight should not be greater than Gross Weight";
  if (toNum(b.NetWeight) <= 0) return "Net Weight should not be zero";
  if (toInt(b.ConeCount) <= 0) return "No. of Cones should not be zero";
  if (toInt(b.BoxPackingCode) <= 0) return "Select Box Packing";
  if (toInt(b.BagColourCode) <= 0) return "Select the Bag Colour";
  if (toInt(b.TipColourCode) <= 0) return "Select the Tip Colour";
  if (toNum(b.DeliveryWeight) <= 0) return "Check the Delivery Weight";
  return null;
};

// Net-weight tolerance guard (prod type <> 2) — re-derives the trusted Std +
// tolerance from the count-type master rather than the client payload, so a
// direct API call can't bypass the rule the form enforces. Returns an error
// string or null. (The VB enforces this in the UI only; this is defence-in-depth.)
const checkTolerance = async (pool, b) => {
  if (toInt(b.ProductionTypeCode) === 2) return null;
  const ctCode = toInt(b.CountTypeCode);
  if (ctCode <= 0) return null;
  const rs = await pool.request().input("Status", sql.Bit, 1).execute("sp_CountType_GetAll");
  const row = (rs.recordset || []).find((r) => toInt(r.CountTypeCode) === ctCode);
  if (!row) return null;
  const std = toNum(row.StdWeight) + toNum(row.AllowanceExcessWt);
  const net = toNum(b.NetWeight);
  const tolMin = toNum(row.Weight_Tolerance_Min);
  const tolMax = toNum(row.Weight_Tolerance_Max);
  if (net < std - tolMin) return `Low Standard Weight on ${tolMin}`;
  if (net > std + tolMax) return `Higher than Standard Weight on ${tolMax}`;
  return null;
};

// Bind every sp_YarnStock_AddEdit field (excluding the create/edit key block).
const bindStockFields = (request, b, { companyCode, fyCode, bagNo }) => {
  request.input("ProductionDate", sql.DateTime, D(b.ProductionDate));
  request.input("Opening", sql.Bit, b.Opening ? 1 : 0);
  request.input("SupervisorCode", sql.Int, toInt(b.SupervisorCode));
  request.input("EmployeeCode", sql.Int, toInt(b.EmployeeCode));
  request.input("YarnProductionTypeCode", sql.Int, toInt(b.ProductionTypeCode));
  request.input("YarnPackingTypeCode", sql.Int, toInt(b.PackingTypeCode));
  request.input("YarnBagNoGroupCode", sql.Int, toInt(b.YarnBagNoGroupCode));
  request.input("BagNo", sql.Int, bagNo);
  request.input("LotNoCode", sql.Int, toInt(b.LotNoCode));
  request.input("CountTypeCode", sql.Int, toInt(b.CountTypeCode));
  request.input("GrossWeight", sql.Decimal(18, 3), toNum(b.GrossWeight));
  request.input("TareWeight", sql.Decimal(18, 3), toNum(b.TareWeight));
  request.input("NetWeight", sql.Decimal(18, 3), toNum(b.NetWeight));
  request.input("TrallyWeight", sql.Decimal(18, 3), 0);
  request.input("StdWeight", sql.Decimal(18, 3), toNum(b.StdWeight));
  request.input("DeliveryWeight", sql.Decimal(18, 3), toNum(b.DeliveryWeight));
  request.input("ConeCount", sql.Int, toInt(b.ConeCount));
  // YarnType = first char of the Production Type name (Mid(...,1,1) in the VB).
  request.input("YarnType", sql.NVarChar, str(b.YarnType).slice(0, 1));
  request.input("EntryType", sql.NVarChar, "M");
  request.input("CompanyCode", sql.Int, companyCode);
  request.input("BoxPackingCode", sql.Int, toInt(b.BoxPackingCode));
  request.input("BagColourCode", sql.Int, toInt(b.BagColourCode));
  request.input("TipColourCode", sql.Int, toInt(b.TipColourCode));
};

// POST /yarn-production/create — insert 1..noOfBags rows (sequential bag nos).
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
    if (companyCode <= 0) return sendError(res, "Select a single company", 400);

    const b = req.body || {};
    const vErr = validateEntry(b);
    if (vErr) return sendError(res, vErr, 400);

    const noOfBags = Math.max(1, toInt(b.NoOfBags) || 1);
    const pool = await getPool(req.headers.subdbname);

    const tolErr = await checkTolerance(pool, b);
    if (tolErr) return sendError(res, tolErr, 400);

    const bagNoSetting = await readBagNoSetting(pool, companyCode);
    const productionDate = D(b.ProductionDate);

    tx = new sql.Transaction(pool);
    await tx.begin();

    const savedBagNos = [];
    for (let i = 0; i < noOfBags; i++) {
      // Allocate the next Bag No (re-reads inside the tx, so it sees this loop's
      // own inserts → sequential numbers, exactly like GetBagNo() in the VB).
      const bagNo = await generateBagNo(new sql.Request(tx), {
        companyCode,
        productionDate,
        bagNoSetting,
        bagNoGroupCode: b.BagNoGroupCode,
        yarnBagNoGroupCode: b.YarnBagNoGroupCode,
        countTypeCode: b.CountTypeCode,
      });
      if (bagNo <= 0) {
        await tx.rollback();
        return sendError(res, "Bag No could not be generated", 400);
      }

      const dup = await bagNoExists(new sql.Request(tx), {
        bagNo,
        fyCode,
        companyCode,
        productionTypeCode: b.ProductionTypeCode,
        yarnBagNoGroupCode: b.YarnBagNoGroupCode,
        countTypeCode: b.CountTypeCode,
        bagNoSetting,
      });
      if (dup) {
        await tx.rollback();
        return sendError(res, "Already Exist the BagNo", 409);
      }

      const head = new sql.Request(tx);
      head.input("C_User", sql.Int, toInt(userId));
      head.input("C_Node", sql.Int, toInt(nodeCode));
      head.input("FYCode", sql.Int, fyCode);
      bindStockFields(head, b, { companyCode, fyCode, bagNo });
      await head.execute("sp_YarnStock_AddEdit");
      savedBagNos.push(bagNo);
    }

    await tx.commit();
    return sendSuccess(
      res,
      { bagNos: savedBagNos, count: savedBagNos.length },
      "The record is saved",
      201
    );
  } catch (err) {
    if (tx) {
      try {
        await tx.rollback();
      } catch (_) {}
    }
    if (err.message && (err.message.includes("PK_YarnStock_BagNo") || err.message.includes("BagNo")))
      return sendError(res, "Already exist the BagNo", 409);
    console.error("DB Error (YarnProduction.create):", err);
    return sendError(res, err);
  }
};

// PUT /yarn-production/update/:productionNo — edit one saved bag.
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
    const vErr = validateEntry(b);
    if (vErr) return sendError(res, vErr, 400);

    // On edit the Bag No is kept as saved (the VB never regenerates it).
    const bagNo = toInt(b.BagNo);
    if (bagNo <= 0) return sendError(res, "Bag No should not be empty", 400);

    const pool = await getPool(req.headers.subdbname);

    const tolErr = await checkTolerance(pool, b);
    if (tolErr) return sendError(res, tolErr, 400);

    const head = pool.request();
    head.input("ProductionNo", sql.Int, productionNo);
    head.input("E_User", sql.Int, toInt(userId));
    head.input("E_Node", sql.Int, toInt(nodeCode));
    head.input("FYCode", sql.Int, fyCode);
    bindStockFields(head, b, { companyCode, fyCode, bagNo });
    await head.execute("sp_YarnStock_AddEdit");

    return sendSuccess(res, { ProductionNo: productionNo, BagNo: bagNo }, "The record is updated");
  } catch (err) {
    if (err.message && err.message.includes("PK_YarnStock_BagNo"))
      return sendError(res, "Already exist the BagNo", 409);
    console.error("DB Error (YarnProduction.update):", err);
    return sendError(res, err);
  }
};
