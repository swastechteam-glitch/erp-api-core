import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Waste DC (port of the WinForms frmWasteDC / frmWasteDCDetails)
//   Two-weighment delivery-challan for waste bales. A header (DC No / Date /
//   Customer / Sales|Internal / Vehicle) plus N bale lines, each carrying a
//   First and Second weighment (Gross/Tare/Net) and their differences. The Add
//   screen and the Edit/Delete grid are merged into ONE React page.
//
//   - GET    /waste-dc/options                 -> customers/wasteItems/vehicles/settings
//   - GET    /waste-dc/next-dc-no               -> { dcNo } (sp_WasteDC_DCNo)
//   - GET    /waste-dc/available-bales          -> ?wasteItemCode&from&to (vw_Waste_CurStock not yet DC'd)
//   - GET    /waste-dc/bale                      -> ?wasteItemCode&baleNo (single bale lookup)
//   - GET    /waste-dc/lists                     -> sp_WasteDC_GetAll (?fromDate&toDate&customerCode&salesType, paginated)
//   - GET    /waste-dc/list/:wasteDCCode         -> header + detail bales
//   - POST   /waste-dc/create                    -> sp_WasteDC_AddEdit + details
//   - PUT    /waste-dc/update/:wasteDCCode        -> sp_WasteDC_AddEdit (with @WasteDCCode) + details
//   - DELETE /waste-dc/delete/:wasteDCCode        -> sp_WasteDC_Delete (blocked if billed)
//
// Company from req.headers.companyCode, FY from req.headers.FYCode; AddEdit also
// needs @User / @Node from req.headers.userId / nodeCode. The desktop serial
// scale (Connect/Disconnect), barcode entry, label/DC printing and the
// reload-from-temp (tbl_WasteDCDetails_Temp) feature are NOT ported. Inline
// vehicle creation (sp_Vehicle_Add_Auto) is NOT ported — pick an existing one.
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};
const round3 = (n) => Math.round((toNum(n) + Number.EPSILON) * 1000) / 1000;
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getFYCode = (req) => toInt(req.headers.FYCode);
const todayStr = () => new Date().toISOString().slice(0, 10);
const ymd = (v) => (v ? new Date(v).toISOString().slice(0, 10) : "");

// A setting flag is "on" when tbl_Setting has a row with that column = 1.
const settingOn = async (pool, column) => {
  const r = await pool
    .request()
    .query(`Select COUNT(*) AS cnt from tbl_Setting where ${column} = 1`);
  return (r.recordset?.[0]?.cnt ?? 0) > 0;
};

// GET /waste-dc/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);

    const [customers, wasteItems, vehicles] = await Promise.all([
      pool
        .request()
        .query(
          "Select CustomerCode, CustomerName, Address1, Address2, City from tbl_Customer " +
            "where Waste = 1 AND CustomerID IS NOT NULL AND Status = 1 order by CustomerName"
        ),
      pool
        .request()
        .query(
          "Select WasteItemCode, WasteItemName, Rate, BaleTareWeight, TareZeroAllowed " +
            "from tbl_WasteItem order by OrderNo"
        ),
      pool
        .request()
        .query(
          "Select VehicleCode, VehicleName, RegistrationNumber from vw_Vehicle " +
            "where VehicleTypeCode = 1 order by VehicleName"
        ),
    ]);

    const [rateEdit, loadFirstWt, manualEntry] = await Promise.all([
      settingOn(pool, "WasteDC_Rate_Edit"),
      settingOn(pool, "WasteDC_Load_FistWt"),
      settingOn(pool, "WasteDCManualEntry"),
    ]);

    return sendSuccess(res, {
      customers: customers.recordset.map((r) => ({
        value: r.CustomerCode,
        label: r.CustomerName,
        address: [r.Address1, r.Address2, r.City].filter(Boolean).join(", "),
      })),
      wasteItems: wasteItems.recordset.map((r) => ({
        value: r.WasteItemCode,
        label: r.WasteItemName,
        Rate: r.Rate ?? 0,
        BaleTareWeight: r.BaleTareWeight ?? 0,
      })),
      vehicles: vehicles.recordset.map((r) => ({
        value: r.VehicleCode,
        label: r.VehicleName,
      })),
      settings: { rateEdit, loadFirstWt, manualEntry },
    });
  } catch (err) {
    console.error("DB Error (getOptions WasteDC):", err);
    return sendError(res, err);
  }
};

// GET /waste-dc/next-dc-no  -> sp_WasteDC_DCNo @CompanyCode, @FyCode
export const getNextDCNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("FyCode", sql.Int, getFYCode(req))
      .execute("sp_WasteDC_DCNo");
    const row = r.recordset?.[0];
    const dcNo = row ? toInt(Object.values(row)[0]) : 0;
    return sendSuccess(res, { dcNo });
  } catch (err) {
    console.error("DB Error (getNextDCNo WasteDC):", err);
    return sendError(res, err);
  }
};

// GET /waste-dc/available-bales?wasteItemCode=&from=&to=
//   vw_Waste_CurStock bales for the item not already on a saved DC.
export const getAvailableBales = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const wasteItemCode = toInt(req.query.wasteItemCode);
    if (wasteItemCode <= 0) return sendError(res, "Select the Item", 400);

    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("WasteItemCode", sql.Int, wasteItemCode)
      .input("FromBale", sql.Int, toInt(req.query.from))
      .input("ToBale", sql.Int, toInt(req.query.to))
      .query(
        `Select s.WasteBaleCode, s.BaleNo, s.GrossWeight, s.TareWeight, s.NetWeight,
                s.WasteItemCode
           from vw_Waste_CurStock s
          where s.CompanyCode = @CompanyCode AND s.WasteItemCode = @WasteItemCode
            and (@FromBale = 0 OR s.BaleNo >= @FromBale)
            and (@ToBale = 0 OR s.BaleNo <= @ToBale)
            and s.WasteBaleCode NOT IN (Select WasteBaleCode from tbl_WasteDCDetails)
          order by s.BaleNo`
      );

    return sendSuccess(
      res,
      result.recordset.map((r) => ({ ...r, id: r.WasteBaleCode }))
    );
  } catch (err) {
    console.error("DB Error (getAvailableBales WasteDC):", err);
    return sendError(res, err);
  }
};

// GET /waste-dc/bale?wasteItemCode=&baleNo=  -> single bale weights (manual entry)
export const getBale = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const wasteItemCode = toInt(req.query.wasteItemCode);
    const baleNo = toInt(req.query.baleNo);
    if (wasteItemCode <= 0) return sendError(res, "Select the Item", 400);
    if (baleNo <= 0) return sendError(res, "Enter the Bale No", 400);

    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("WasteItemCode", sql.Int, wasteItemCode)
      .input("BaleNo", sql.Int, baleNo)
      .query(
        "Select WasteBaleCode, BaleNo, GrossWeight, TareWeight, NetWeight, WasteItemCode " +
          "from vw_Waste_CurStock where CompanyCode = @CompanyCode AND BaleNo = @BaleNo AND WasteItemCode = @WasteItemCode"
      );
    const row = r.recordset?.[0];
    if (!row) return sendError(res, "Enter the Invalid Bale No", 404);
    // Guard: a bale already on a saved DC can't be issued again.
    const dup = await pool
      .request()
      .input("WasteBaleCode", sql.Int, toInt(row.WasteBaleCode))
      .query("Select 1 from tbl_WasteDCDetails where WasteBaleCode = @WasteBaleCode");
    if (dup.recordset.length) return sendError(res, "Bale already issued on a DC", 409);
    return sendSuccess(res, row);
  } catch (err) {
    console.error("DB Error (getBale WasteDC):", err);
    return sendError(res, err);
  }
};

// GET /waste-dc/lists  -> sp_WasteDC_GetAll (filtered + paginated in JS)
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);

    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_WasteDC_GetAll");

    const fromDate = req.query.fromDate ? new Date(req.query.fromDate) : null;
    const toDate = req.query.toDate ? new Date(req.query.toDate) : null;
    const customerCode = toInt(req.query.customerCode);
    const salesType = (req.query.salesType || "").toUpperCase(); // S | I | ""

    let data = result.recordset.map((r) => ({ ...r, id: r.WasteDCCode }));
    data = data.filter((r) => {
      if (fromDate && r.WasteDCDate && new Date(r.WasteDCDate) < fromDate) return false;
      if (toDate && r.WasteDCDate && new Date(r.WasteDCDate) > toDate) return false;
      if (customerCode > 0 && toInt(r.CustomerCode) !== customerCode) return false;
      if (salesType && r.SalesType && String(r.SalesType).toUpperCase() !== salesType) return false;
      return true;
    });

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getList WasteDC):", err);
    return sendError(res, err);
  }
};

// GET /waste-dc/list/:wasteDCCode  -> header (from GetAll) + detail bales
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.wasteDCCode);
    if (!code) return sendError(res, "Invalid WasteDCCode", 400);
    const pool = await getPool(req.headers.subdbname);

    const head = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_WasteDC_GetAll");
    const header = head.recordset.find((r) => Number(r.WasteDCCode) === code);
    if (!header) return sendError(res, "Waste DC not found", 404);

    const det = await pool
      .request()
      .input("Code", sql.Int, code)
      .query(
        `Select d.WasteItemCode, d.WasteBaleCode, d.BaleNo, d.Rate,
                d.FirstGrossWeight, d.FirstTareWeight, d.FirstNetWeight,
                d.SecondGrossWeight, d.SecondTareWeight, d.SecondNetWeight,
                d.DifferenceWeight, i.WasteItemName
           from tbl_WasteDCDetails d
           left join tbl_WasteItem i on i.WasteItemCode = d.WasteItemCode
          where d.WasteDCCode = @Code
          order by d.BaleNo`
      );

    return sendSuccess(res, { ...header, details: det.recordset });
  } catch (err) {
    console.error("DB Error (getById WasteDC):", err);
    return sendError(res, err);
  }
};

// Compute header totals from the bale lines (mirrors BalesGridTotal).
const totalsOf = (bales) => {
  const t = {
    TotalQty: bales.length,
    TotalFirstGrossWeight: 0, TotalFirstTareWeight: 0, TotalFirstNetWeight: 0,
    TotalSecondGrossWeight: 0, TotalSecondTareWeight: 0, TotalSecondNetWeight: 0,
  };
  for (const b of bales) {
    t.TotalFirstGrossWeight += toNum(b.FirstGrossWeight);
    t.TotalFirstTareWeight += toNum(b.FirstTareWeight);
    t.TotalFirstNetWeight += toNum(b.FirstNetWeight);
    t.TotalSecondGrossWeight += toNum(b.SecondGrossWeight);
    t.TotalSecondTareWeight += toNum(b.SecondTareWeight);
    t.TotalSecondNetWeight += toNum(b.SecondNetWeight);
  }
  t.TotalDifferenceWeight = round3(t.TotalSecondNetWeight - t.TotalFirstNetWeight);
  for (const k of Object.keys(t)) t[k] = k === "TotalQty" ? t[k] : round3(t[k]);
  return t;
};

const validateDC = (body) => {
  if (!body.WasteDCDate || Number.isNaN(new Date(body.WasteDCDate).getTime()))
    return "Invalid DC Date";
  if (toInt(body.CustomerCode) <= 0) return "Select the Customer Name";
  if (!Array.isArray(body.bales) || body.bales.length === 0) return "Enter the Item";
  return null;
};

// Insert all detail bales (inside the open transaction) via sp_WasteDCDetails_Insert.
const insertDetails = async (tx, wasteDCCode, companyCode, bales) => {
  for (const b of bales) {
    await new sql.Request(tx)
      .input("WasteDCCode", sql.Int, wasteDCCode)
      .input("WasteItemCode", sql.Int, toInt(b.WasteItemCode))
      .input("WasteBaleCode", sql.Int, toInt(b.WasteBaleCode))
      .input("BaleNo", sql.Int, toInt(b.BaleNo))
      .input("Rate", sql.Decimal(18, 2), round3(b.Rate))
      .input("FirstGrossWeight", sql.Decimal(18, 3), round3(b.FirstGrossWeight))
      .input("FirstTareWeight", sql.Decimal(18, 3), round3(b.FirstTareWeight))
      .input("FirstNetWeight", sql.Decimal(18, 3), round3(b.FirstNetWeight))
      .input("SecondGrossWeight", sql.Decimal(18, 3), round3(b.SecondGrossWeight))
      .input("SecondTareWeight", sql.Decimal(18, 3), round3(b.SecondTareWeight))
      .input("SecondNetWeight", sql.Decimal(18, 3), round3(b.SecondNetWeight))
      .input("DifferenceWeight", sql.Decimal(18, 3), round3(toNum(b.SecondNetWeight) - toNum(b.FirstNetWeight)))
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_WasteDCDetails_Insert");
  }
};

// Run sp_WasteDC_AddEdit (returns the WasteDCCode) inside the transaction.
const addEditHeader = async (tx, req, { code, dcNo, body, totals }) => {
  const request = new sql.Request(tx);
  if (code) request.input("WasteDCCode", sql.Int, code);
  request.input("WasteDCNo", sql.Int, toInt(dcNo));
  request.input("WasteDCDate", sql.DateTime, new Date(body.WasteDCDate));
  request.input("CustomerCode", sql.Int, toInt(body.CustomerCode));
  request.input("TotalQty", sql.Int, totals.TotalQty);
  request.input("TotalFirstGrossWeight", sql.Decimal(18, 3), totals.TotalFirstGrossWeight);
  request.input("TotalFirstTareWeight", sql.Decimal(18, 3), totals.TotalFirstTareWeight);
  request.input("TotalFirstNetWeight", sql.Decimal(18, 3), totals.TotalFirstNetWeight);
  request.input("TotalSecondGrossWeight", sql.Decimal(18, 3), totals.TotalSecondGrossWeight);
  request.input("TotalSecondTareWeight", sql.Decimal(18, 3), totals.TotalSecondTareWeight);
  request.input("TotalSecondNetWeight", sql.Decimal(18, 3), totals.TotalSecondNetWeight);
  request.input("TotalDifferenceWeight", sql.Decimal(18, 3), totals.TotalDifferenceWeight);
  request.input("SalesType", sql.NVarChar, body.SalesType === "I" ? "I" : "S");
  request.input("CompanyCode", sql.Int, getCompanyCode(req));
  request.input("FYCode", sql.Int, getFYCode(req));
  request.input("User", sql.Int, toInt(req.headers.userId));
  request.input("Node", sql.Int, toInt(req.headers.nodeCode));
  request.input("VehicleCode", sql.Int, toInt(body.VehicleCode));
  const r = await request.execute("sp_WasteDC_AddEdit");
  const row = r.recordset?.[0];
  return row ? toInt(Object.values(row)[0]) : code || 0;
};

// POST /waste-dc/create
export const createWasteDC = async (req, res) => {
  const body = req.body || {};
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    if (!req.headers.userId || !req.headers.nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);
    const err = validateDC(body);
    if (err) return sendError(res, err, 400);

    const pool = await getPool(req.headers.subdbname);
    const companyCode = getCompanyCode(req);
    const totals = totalsOf(body.bales);

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      // Fresh DC No inside the tx.
      const noRes = await new sql.Request(tx)
        .input("CompanyCode", sql.Int, companyCode)
        .input("FyCode", sql.Int, getFYCode(req))
        .execute("sp_WasteDC_DCNo");
      const dcNo = noRes.recordset?.[0] ? toInt(Object.values(noRes.recordset[0])[0]) : toInt(body.WasteDCNo);

      const wasteDCCode = await addEditHeader(tx, req, { code: null, dcNo, body, totals });
      await new sql.Request(tx)
        .input("WasteDCCode", sql.Int, wasteDCCode)
        .input("CompanyCode", sql.Int, companyCode)
        .execute("sp_WasteDCDetails_Delete");
      await insertDetails(tx, wasteDCCode, companyCode, body.bales);
      await tx.commit();
      return sendSuccess(res, { WasteDCCode: wasteDCCode, WasteDCNo: dcNo }, "The record is saved", 201);
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  } catch (err) {
    console.error("DB Error (createWasteDC):", err);
    return sendError(res, err);
  }
};

// PUT /waste-dc/update/:wasteDCCode
export const updateWasteDC = async (req, res) => {
  const body = req.body || {};
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    if (!req.headers.userId || !req.headers.nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);
    const code = toInt(req.params.wasteDCCode);
    if (!code) return sendError(res, "Invalid WasteDCCode", 400);
    const err = validateDC(body);
    if (err) return sendError(res, err, 400);

    const pool = await getPool(req.headers.subdbname);
    const companyCode = getCompanyCode(req);
    const totals = totalsOf(body.bales);

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const wasteDCCode = await addEditHeader(tx, req, {
        code,
        dcNo: toInt(body.WasteDCNo),
        body,
        totals,
      });
      await new sql.Request(tx)
        .input("WasteDCCode", sql.Int, wasteDCCode)
        .input("CompanyCode", sql.Int, companyCode)
        .execute("sp_WasteDCDetails_Delete");
      await insertDetails(tx, wasteDCCode, companyCode, body.bales);
      await tx.commit();
      return sendSuccess(res, { WasteDCCode: wasteDCCode }, "The record is updated", 200);
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  } catch (err) {
    console.error("DB Error (updateWasteDC):", err);
    return sendError(res, err);
  }
};

// DELETE /waste-dc/delete/:wasteDCCode  (blocked once billed into a Waste Invoice)
export const deleteWasteDC = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.wasteDCCode);
    if (!code) return sendError(res, "Invalid WasteDCCode", 400);
    const pool = await getPool(req.headers.subdbname);

    const billed = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("WasteDCCode", sql.Int, code)
      .query("Select 1 from tbl_WasteInvoice where CompanyCode = @CompanyCode AND WasteDCCode = @WasteDCCode");
    if (billed.recordset.length)
      return sendError(res, "Waste DC Generated to Waste Invoice, do not Delete", 409);

    await pool.request().input("WasteDCCode", sql.Int, code).execute("sp_WasteDC_Delete");
    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("REFERENCE") || err.message.includes("FK_")))
      return sendError(res, "You can not delete the Waste DC!", 409);
    console.error("DB Error (deleteWasteDC):", err);
    return sendError(res, err);
  }
};
