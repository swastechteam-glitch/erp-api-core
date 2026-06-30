import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";
import { getCompanyStateCode } from "../utils/masters.js";

// ---------------------------------------------------------------------------
// Waste Invoice (port of the WinForms frmWasteInvoice / frmWasteInvoiceDetails)
//   GST tax invoice raised against a Waste DC. The desktop builds it in steps:
//   pick Tax Type -> Invoice No, pick a pending DC -> its items load, "View" an
//   item -> its bales load, choose 1st/2nd/WeighBridge net + round-off -> the
//   item is posted as an invoice line; Tax Type then drives CGST/SGST/IGST,
//   packing, market-committee cess, TCS, round-off and Net Amount. The Add
//   screen and the Edit/Delete grid are merged into ONE React page.
//
//   - GET    /waste-invoice/options              -> customers/vehicles/payModes/transporters/taxTypes/settings
//   - GET    /waste-invoice/next-invoice-no       -> ?wasteTaxTypeCode  { invoiceNo, strInvoiceNo }
//   - GET    /waste-invoice/pending-dc            -> pending Waste DCs (sp_WasteInvoice_GetPendingDC)
//   - GET    /waste-invoice/pending-weighbridge   -> pending weighments (sp_WasteInvoice_GetPendingWeighBridge)
//   - GET    /waste-invoice/dc-items              -> ?wasteDCCode (sp_WasteDCItem_Load_GetbyDC)
//   - GET    /waste-invoice/dc-item-bales         -> ?wasteDCCode&wasteItemCode (vw_WasteDCDetails)
//   - GET    /waste-invoice/lists                 -> sp_WasteInvoice_GetAll (?fromDate&toDate&customerCode, paginated)
//   - GET    /waste-invoice/list/:wasteInvoiceCode -> header + details
//   - POST   /waste-invoice/create                -> sp_WasteInvoice_AddEdit (+ bale & item details, DC rate update)
//   - PUT    /waste-invoice/update/:wasteInvoiceCode
//   - DELETE /waste-invoice/delete/:wasteInvoiceCode -> sp_WasteInvoice_Delete
//
// Tax math (CGST/SGST/IGST/packing/TCS/round-off) is computed on the React side
// exactly like the desktop Calc(), then persisted here as-is. The desktop voucher
// posting (Update_Voucher) is COMMENTED OUT in the original save, so it is NOT
// ported. Serial scale, barcode entry and inline vehicle creation are NOT ported.
// Company from req.headers.companyCode, FY from req.headers.FYCode, user context
// from req.headers.userId / nodeCode.
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};
const r2 = (n) => Math.round((toNum(n) + Number.EPSILON) * 100) / 100;
const r3 = (n) => Math.round((toNum(n) + Number.EPSILON) * 1000) / 1000;
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getFYCode = (req) => toInt(req.headers.FYCode);
const todayStr = () => new Date().toISOString().slice(0, 10);
const scalar = (r) => (r.recordset?.[0] ? Object.values(r.recordset[0])[0] : null);

// GET /waste-invoice/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);

    const [customers, payModes, transporters, taxTypes, wasteItems] = await Promise.all([
      pool.request().query(
        "Select CustomerCode, CustomerName, Address1, Address2, City, District, GSTINNo, PANNo, StateCode " +
          "from tbl_Customer where Waste = 1 order by CustomerName"
      ),
      pool.request().query("Select PayModeCode, PayModeName from tbl_PayMode"),
      pool.request().query("Select TransporterCode, TransporterName from tbl_Transporter order by TransporterName"),
      pool.request().execute("sp_WasteTaxType_GetAll"),
      pool.request().query(
        "Select WasteItemCode, WasteItemName, Rate, BaleTareWeight from tbl_WasteItem order by OrderNo"
      ),
    ]);

    // Vehicles — use the SAME source as the Waste DC (vw_Vehicle, delivery type
    // VehicleTypeCode = 1) so every vehicle that can be saved on a DC is also
    // present here and pre-fills/displays when an invoice is raised against that
    // DC. (sp_Vehicle_GetAll returns a different/active-only set, so a DC vehicle
    // could be missing and the dropdown would show blank.) Falls back to
    // sp_Vehicle_GetAll only if the view is unavailable.
    let vehicles = [];
    try {
      const v = await pool.request().query(
        "Select VehicleCode, VehicleName, RegistrationNumber from vw_Vehicle " +
          "where VehicleTypeCode = 1 order by VehicleName"
      );
      vehicles = v.recordset.map((x) => ({
        value: x.VehicleCode, label: x.VehicleName, RegistrationNumber: x.RegistrationNumber,
      }));
    } catch (e) {
      console.warn("WasteInvoice options: vw_Vehicle failed, falling back to sp_Vehicle_GetAll", e.message);
      try {
        const v = await pool.request().input("Status", sql.Int, 1).execute("sp_Vehicle_GetAll");
        vehicles = v.recordset.map((x) => ({ value: x.VehicleCode, label: x.VehicleName }));
      } catch (e2) {
        console.warn("WasteInvoice options: sp_Vehicle_GetAll fallback failed", e2.message);
      }
    }

    // Settings flags used by the desktop Calc()/save.
    const settingRow = await pool.request().query("Select TOP 1 * from tbl_Setting");
    const s = settingRow.recordset?.[0] || {};

    // Seller's own state — drives the GST inter/intra-state split (CGST+SGST
    // when the customer is in the same state, else IGST). Mirrors inward.
    const companyStateCode = await getCompanyStateCode(pool, getCompanyCode(req));

    const cust = customers.recordset.map((c) => ({
      value: c.CustomerCode,
      label: c.CustomerName,
      Address1: c.Address1, Address2: c.Address2, City: c.City, District: c.District,
      GSTINNo: c.GSTINNo, PANNo: c.PANNo, StateCode: toInt(c.StateCode),
    }));

    return sendSuccess(res, {
      customers: cust,
      deliveryCustomers: cust,
      companyStateCode,
      payModes: payModes.recordset.map((p) => ({ value: p.PayModeCode, label: p.PayModeName })),
      transporters: transporters.recordset.map((t) => ({ value: t.TransporterCode, label: t.TransporterName })),
      taxTypes: taxTypes.recordset.map((t) => ({
        value: t.WasteTaxTypeCode,
        label: t.WasteTaxTypeName,
        CGSTPer: toNum(t.CGSTPer), SGSTPer: toNum(t.SGSTPer), IGSTPer: toNum(t.IGSTPer),
        PackingCharges: toNum(t.PackingCharges), PackingChargesPerKG: toNum(t.PackingChargesPerKG),
        MarketCommitteeCess: toNum(t.MarketCommitteeCess),
        InvoiceType: t.InvoiceType, InvoicePrefix: t.InvoicePrefix,
      })),
      wasteItems: wasteItems.recordset.map((w) => ({
        value: w.WasteItemCode, label: w.WasteItemName, Rate: toNum(w.Rate), BaleTareWeight: toNum(w.BaleTareWeight),
      })),
      settings: {
        // "B" = packing per bale, else per-KG (tbl_Setting.WastePackingCharge).
        packingChargeMode: s.WastePackingCharge ?? "B",
        rateChange: !!s.WasteDCRateChange,
        autoTCS: !!s.WasteInvoice_Auto_TCS,
        tcsBeforeTax: !!s.TCS_BeforTax,
        weightRND: !!s.Waste_Invoice_Weight_RND,
      },
    });
  } catch (err) {
    console.error("DB Error (getOptions WasteInvoice):", err);
    return sendError(res, err);
  }
};

// GET /waste-invoice/next-invoice-no?wasteTaxTypeCode=&invoiceType=
export const getNextInvoiceNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const taxTypeCode = toInt(req.query.wasteTaxTypeCode);
    const invoiceType = toInt(req.query.invoiceType);
    if (taxTypeCode <= 0) return sendSuccess(res, { invoiceNo: "", strInvoiceNo: "" });

    const noRes = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("FyCode", sql.Int, getFYCode(req))
      .input("InvoiceType", sql.Int, invoiceType)
      .execute("sp_WasteInvoice_BillNo");
    const invoiceNo = toInt(scalar(noRes));

    const prefixRes = await pool
      .request()
      .input("WasteTaxTypeCode", sql.Int, taxTypeCode)
      .query("Select InvoicePrefix from tbl_WasteTaxType where WasteTaxTypeCode = @WasteTaxTypeCode");
    const prefix = scalar(prefixRes) || "";

    return sendSuccess(res, { invoiceNo, strInvoiceNo: `${prefix}-${invoiceNo}` });
  } catch (err) {
    console.error("DB Error (getNextInvoiceNo WasteInvoice):", err);
    return sendError(res, err);
  }
};

// GET /waste-invoice/pending-dc
export const getPendingDC = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("FYCode", sql.Int, getFYCode(req))
      .execute("sp_WasteInvoice_GetPendingDC");
    return sendSuccess(
      res,
      result.recordset.map((d) => ({
        value: d.WasteDCCode,
        label: d.strDCNo,
        CustomerCode: d.CustomerCode ?? 0,
        VehicleCode: d.VehicleCode ?? 0,
        SalesType: (d.SalesType || "").trim(),
      }))
    );
  } catch (err) {
    console.error("DB Error (getPendingDC WasteInvoice):", err);
    return sendError(res, err);
  }
};

// GET /waste-invoice/pending-weighbridge
export const getPendingWeighBridge = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("FYCode", sql.Int, getFYCode(req))
      .execute("sp_WasteInvoice_GetPendingWeighBridge");
    return sendSuccess(
      res,
      result.recordset.map((w) => ({
        value: w.WeighCode,
        label: w.str_WeighmentNo,
        NetWeight: toNum(w.NetWeight),
      }))
    );
  } catch (err) {
    console.error("DB Error (getPendingWeighBridge WasteInvoice):", err);
    return sendError(res, err);
  }
};

// GET /waste-invoice/dc-items?wasteDCCode=
export const getDCItems = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const wasteDCCode = toInt(req.query.wasteDCCode);
    if (wasteDCCode <= 0) return sendError(res, "Select the DC No", 400);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("WasteDCCode", sql.Int, wasteDCCode)
      .execute("sp_WasteDCItem_Load_GetbyDC");
    return sendSuccess(
      res,
      result.recordset.map((it) => ({
        WasteItemCode: it.WasteItemCode,
        WasteItemName: it.WasteItemName,
        Qty: toNum(it.Qty),
        Rate: toNum(it.Rate),
      }))
    );
  } catch (err) {
    console.error("DB Error (getDCItems WasteInvoice):", err);
    return sendError(res, err);
  }
};

// GET /waste-invoice/dc-item-bales?wasteDCCode=&wasteItemCode=
export const getDCItemBales = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const wasteDCCode = toInt(req.query.wasteDCCode);
    const wasteItemCode = toInt(req.query.wasteItemCode);
    if (wasteDCCode <= 0 || wasteItemCode <= 0)
      return sendError(res, "Missing DC / item", 400);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("WasteDCCode", sql.Int, wasteDCCode)
      .input("WasteItemCode", sql.Int, wasteItemCode)
      .query(
        "Select BaleNo, FirstNetWeight, SecondNetWeight, WasteBaleCode, DifferenceWeight, " +
          "WasteItemCode, WasteItemName, Rate from vw_WasteDCDetails " +
          "where CompanyCode = @CompanyCode AND WasteDCCode = @WasteDCCode AND WasteItemCode = @WasteItemCode"
      );
    return sendSuccess(
      res,
      result.recordset.map((b) => ({
        BaleNo: toNum(b.BaleNo),
        FirstWeight: toNum(b.FirstNetWeight),
        SecondWeight: toNum(b.SecondNetWeight),
        WasteBaleCode: toInt(b.WasteBaleCode),
        DifferenceWeight: toNum(b.DifferenceWeight),
        WasteItemCode: toInt(b.WasteItemCode),
        WasteItemName: b.WasteItemName,
        Rate: toNum(b.Rate),
      }))
    );
  } catch (err) {
    console.error("DB Error (getDCItemBales WasteInvoice):", err);
    return sendError(res, err);
  }
};

// GET /waste-invoice/lists  (sp_WasteInvoice_GetAll, filtered + paginated)
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("FYCode", sql.Int, getFYCode(req))
      .execute("sp_WasteInvoice_GetAll");

    const fromDate = req.query.fromDate ? new Date(req.query.fromDate) : null;
    const toDate = req.query.toDate ? new Date(req.query.toDate) : null;
    const customerCode = toInt(req.query.customerCode);

    let data = result.recordset.map((r) => ({ ...r, id: r.WasteInvoiceCode }));
    data = data.filter((r) => {
      if (fromDate && r.WasteInvoiceDate && new Date(r.WasteInvoiceDate) < fromDate) return false;
      if (toDate && r.WasteInvoiceDate && new Date(r.WasteInvoiceDate) > toDate) return false;
      if (customerCode > 0 && toInt(r.CustomerCode) !== customerCode) return false;
      return true;
    });
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getList WasteInvoice):", err);
    return sendError(res, err);
  }
};

// GET /waste-invoice/list/:wasteInvoiceCode  -> header (from GetAll) + details
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.wasteInvoiceCode);
    if (!code) return sendError(res, "Invalid WasteInvoiceCode", 400);
    const pool = await getPool(req.headers.subdbname);

    const head = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("FYCode", sql.Int, getFYCode(req))
      .execute("sp_WasteInvoice_GetAll");
    const header = head.recordset.find((r) => Number(r.WasteInvoiceCode) === code);
    if (!header) return sendError(res, "Waste Invoice not found", 404);

    // Item lines + bale lines (table names per the insert SPs).
    const [items, bales] = await Promise.all([
      pool.request().input("Code", sql.Int, code).query(
        "Select d.WasteItemCode, d.Qty, d.Weight, d.RoundOffWeight, d.SalesWeight, d.Rate, d.Amount, " +
          "d.WeighCode, d.WBGrossWeight, d.WBTareWeight, d.WBNetWeight, i.WasteItemName " +
          "from tbl_WasteInvoiceDetails d left join tbl_WasteItem i on i.WasteItemCode = d.WasteItemCode " +
          "where d.WasteInvoiceCode = @Code"
      ),
      pool.request().input("Code", sql.Int, code).query(
        "Select WasteItemCode, WasteBaleCode, BaleNo, FirstWeight, SecondWeight, WeighBridgeWt, SalesWeight " +
          "from tbl_WasteInvoice_BaleDetails where WasteInvoiceCode = @Code"
      ),
    ]);

    return sendSuccess(res, { ...header, items: items.recordset, bales: bales.recordset });
  } catch (err) {
    console.error("DB Error (getById WasteInvoice):", err);
    return sendError(res, err);
  }
};

const validateInvoice = (body) => {
  if (!body.WasteInvoiceDate || Number.isNaN(new Date(body.WasteInvoiceDate).getTime()))
    return "Invalid Invoice Date";
  if (toInt(body.CustomerCode) <= 0) return "Select the Customer Name";
  if (toInt(body.DeliveryCustomerCode) <= 0) return "Select the Delivery Customer Name";
  if (toInt(body.PayModeCode) <= 0) return "Select the Pay Mode";
  if (toInt(body.VehicleCode) <= 0) return "Select the Vehicle";
  if (toInt(body.WasteTaxTypeCode) <= 0) return "Select the Tax Type";
  if (toInt(body.WasteDCCode) <= 0) return "Select the DC No";
  if (!Array.isArray(body.items) || body.items.length === 0) return "Enter the Item";
  return null;
};

// sp_WasteInvoice_AddEdit (returns the new WasteInvoiceCode) inside the tx.
const addEditHeader = async (tx, req, { code, body }) => {
  const rq = new sql.Request(tx);
  if (code) rq.input("WasteInvoiceCode", sql.Int, code);
  rq.input("WasteInvoiceNo", sql.Int, toInt(body.WasteInvoiceNo));
  rq.input("WasteInvoiceNostr", sql.NVarChar, String(body.WasteInvoiceNostr || ""));
  rq.input("WasteInvoiceDate", sql.DateTime, new Date(body.WasteInvoiceDate));
  rq.input("WasteDCCode", sql.Int, toInt(body.WasteDCCode));
  rq.input("CustomerCode", sql.Int, toInt(body.CustomerCode));
  rq.input("DeliveryCustomerCode", sql.Int, toInt(body.DeliveryCustomerCode));
  rq.input("PayModeCode", sql.Int, toInt(body.PayModeCode));
  rq.input("WasteTaxTypeCode", sql.Int, toInt(body.WasteTaxTypeCode));
  rq.input("VehicleCode", sql.Int, toInt(body.VehicleCode));
  rq.input("TotalQty", sql.Decimal(18, 3), r3(body.TotalQty));
  rq.input("TotalFirstWeight", sql.Decimal(18, 3), r3(body.TotalFirstWeight));
  rq.input("TotalSecondWeight", sql.Decimal(18, 3), r3(body.TotalSecondWeight));
  rq.input("TotalWeighBridgeWt", sql.Decimal(18, 3), r3(body.TotalWeighBridgeWt));
  rq.input("TotalRoundoffWeight", sql.Decimal(18, 3), r3(body.TotalRoundoffWeight));
  rq.input("TotalSalesWeight", sql.Decimal(18, 3), r3(body.TotalSalesWeight));
  rq.input("TotalWeighBridgeGrossWt", sql.Decimal(18, 3), r3(body.TotalWeighBridgeGrossWt));
  rq.input("TotalWeighBridgeTareWt", sql.Decimal(18, 3), r3(body.TotalWeighBridgeTareWt));
  rq.input("BasicValue", sql.Decimal(18, 2), r2(body.BasicValue));
  rq.input("MarketCommittee", sql.Decimal(18, 2), r2(body.MarketCommittee));
  rq.input("OtherCharges", sql.Decimal(18, 2), r2(body.OtherCharges));
  rq.input("PackingCharges", sql.Decimal(18, 2), r2(body.PackingCharges));
  rq.input("Vat", sql.Decimal(18, 2), r2(body.TotalTaxAmount));
  rq.input("CGST", sql.Decimal(18, 2), r2(body.CGSTAmount));
  rq.input("SGST", sql.Decimal(18, 2), r2(body.SGSTAmount));
  rq.input("IGST", sql.Decimal(18, 2), r2(body.IGSTAmount));
  rq.input("TCSTaxableAmount", sql.Decimal(18, 2), r2(body.TCSTaxableAmount));
  rq.input("TCSPer", sql.Decimal(18, 2), r2(body.TCSPer));
  rq.input("TCSAmount", sql.Decimal(18, 2), r2(body.TCSAmount));
  rq.input("RoundedOff", sql.Decimal(18, 2), r2(body.RoundedOff));
  rq.input("NetAmount", sql.Decimal(18, 2), r2(body.NetAmount));
  rq.input("MarketCommitteeFixed", sql.Decimal(18, 2), r2(body.MarketCommitteeFixed));
  rq.input("PackingChargesFixed", sql.Decimal(18, 2), r2(body.PackingChargesFixed));
  rq.input("VatFixed", sql.Decimal(18, 2), 0);
  rq.input("CGSTFixed", sql.Decimal(18, 2), r2(body.CGSTPer));
  rq.input("SGSTFixed", sql.Decimal(18, 2), r2(body.SGSTPer));
  rq.input("IGSTFixed", sql.Decimal(18, 2), r2(body.IGSTPer));
  rq.input("PermitNo", sql.NVarChar, String(body.PermitNo || ""));
  rq.input("DeliveryDetails", sql.NVarChar, String(body.DeliveryDetails || ""));
  rq.input("InvoiceType", sql.Int, toInt(body.InvoiceType));
  rq.input("FYCode", sql.Int, getFYCode(req));
  rq.input("CompanyCode", sql.Int, getCompanyCode(req));
  rq.input("TransporterCode", sql.Int, toInt(body.TransporterCode));
  rq.input("User", sql.Int, toInt(req.headers.userId));
  rq.input("Node", sql.Int, toInt(req.headers.nodeCode));
  const r = await rq.execute("sp_WasteInvoice_AddEdit");
  return toInt(scalar(r)) || code || 0;
};

const insertDetails = async (tx, req, wicode, body) => {
  const companyCode = getCompanyCode(req);
  // Bale-level details (Grid2).
  for (const b of body.bales || []) {
    await new sql.Request(tx)
      .input("WasteInvoiceCode", sql.Int, wicode)
      .input("WasteItemCode", sql.Int, toInt(b.WasteItemCode))
      .input("WasteBaleCode", sql.Int, toInt(b.WasteBaleCode))
      .input("BaleNo", sql.Int, toInt(b.BaleNo))
      .input("FirstWeight", sql.Decimal(18, 3), r3(b.FirstWeight))
      .input("SecondWeight", sql.Decimal(18, 3), r3(b.SecondWeight))
      .input("WeighBridgeWt", sql.Decimal(18, 3), r3(b.WeighBridgeWt))
      .input("SalesWeight", sql.Decimal(18, 3), r3(b.SalesWeight))
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_WasteInvoice_BaleDetails_INSERT");
  }
  // Item-level lines (Grid) + push the chosen rate back onto the DC.
  for (const it of body.items || []) {
    await new sql.Request(tx)
      .input("WasteInvoiceCode", sql.Int, wicode)
      .input("WasteItemCode", sql.Int, toInt(it.WasteItemCode))
      .input("Qty", sql.Decimal(18, 3), r3(it.Qty))
      .input("Weight", sql.Decimal(18, 3), r3(it.Weight))
      .input("RoundOffWeight", sql.Decimal(18, 3), r3(it.RoundOffWeight))
      .input("SalesWeight", sql.Decimal(18, 3), r3(it.SalesWeight))
      .input("Rate", sql.Decimal(18, 2), r2(it.Rate))
      .input("Amount", sql.Decimal(18, 2), r2(it.Amount))
      .input("WeighCode", sql.Int, toInt(it.WeighCode))
      .input("WBGrossWeight", sql.Decimal(18, 3), r3(it.WBGrossWeight))
      .input("WBTareWeight", sql.Decimal(18, 3), r3(it.WBTareWeight))
      .input("WBNetWeight", sql.Decimal(18, 3), r3(it.WeighBridgeWt))
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_WasteInvoiceDetails_Insert");

    await new sql.Request(tx)
      .input("WasteItemCode", sql.Int, toInt(it.WasteItemCode))
      .input("Rate", sql.Decimal(18, 2), r2(it.Rate))
      .input("WasteDCCode", sql.Int, toInt(body.WasteDCCode))
      .execute("sp_WasteDC_Rate_Update");
  }
};

// POST /waste-invoice/create
export const createWasteInvoice = async (req, res) => {
  const body = req.body || {};
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    if (!req.headers.userId || !req.headers.nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);
    const err = validateInvoice(body);
    if (err) return sendError(res, err, 400);

    const pool = await getPool(req.headers.subdbname);
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const wicode = await addEditHeader(tx, req, { code: null, body });
      await new sql.Request(tx)
        .input("WasteInvoiceCode", sql.Int, wicode)
        .input("CompanyCode", sql.Int, getCompanyCode(req))
        .execute("sp_WasteInvoiceDetails_Delete");
      await insertDetails(tx, req, wicode, body);
      await tx.commit();
      return sendSuccess(res, { WasteInvoiceCode: wicode }, "The record is saved", 201);
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  } catch (err) {
    console.error("DB Error (createWasteInvoice):", err);
    return sendError(res, err);
  }
};

// PUT /waste-invoice/update/:wasteInvoiceCode
export const updateWasteInvoice = async (req, res) => {
  const body = req.body || {};
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    if (!req.headers.userId || !req.headers.nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);
    const code = toInt(req.params.wasteInvoiceCode);
    if (!code) return sendError(res, "Invalid WasteInvoiceCode", 400);
    const err = validateInvoice(body);
    if (err) return sendError(res, err, 400);

    const pool = await getPool(req.headers.subdbname);
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const wicode = await addEditHeader(tx, req, { code, body });
      await new sql.Request(tx)
        .input("WasteInvoiceCode", sql.Int, wicode)
        .input("CompanyCode", sql.Int, getCompanyCode(req))
        .execute("sp_WasteInvoiceDetails_Delete");
      await insertDetails(tx, req, wicode, body);
      await tx.commit();
      return sendSuccess(res, { WasteInvoiceCode: wicode }, "The record is updated", 200);
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  } catch (err) {
    console.error("DB Error (updateWasteInvoice):", err);
    return sendError(res, err);
  }
};

// DELETE /waste-invoice/delete/:wasteInvoiceCode
export const deleteWasteInvoice = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.wasteInvoiceCode);
    if (!code) return sendError(res, "Invalid WasteInvoiceCode", 400);
    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("WasteInvoiceCode", sql.Int, code)
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("Del_User", sql.Int, toInt(req.headers.userId))
      .input("Del_Node", sql.Int, toInt(req.headers.nodeCode))
      .execute("sp_WasteInvoice_Delete");
    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("REFERENCE") || err.message.includes("FK_")))
      return sendError(res, "You can not delete the Waste Invoice!", 409);
    console.error("DB Error (deleteWasteInvoice):", err);
    return sendError(res, err);
  }
};
