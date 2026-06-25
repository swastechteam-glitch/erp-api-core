import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Cotton Sales Return / RawMaterial Sales Return (port of frmCottonSalesReturn)
//   Take back cotton bales sold to a customer. Pick the Customer, pick one of
//   that customer's Sales (loads its bale grid + tax), optionally drop bales
//   that are NOT being returned, pick an Arrival Type, then save. Mirrors
//   btnSave_Click:
//     sp_CottonSalesReturn_AddEdit -> CottonSalesReturnCode
//     sp_CottonSalesReturnDetails_Delete + loop sp_CottonSalesReturnDetails_AddEdit
//     (new only) the returned bales RE-ENTER STOCK as a fresh receipt:
//       sp_CottonArrival_AddEdit -> ArrivalCode
//       sp_CottonWeighment_AddEdit -> WeighmentCode (+ _Details_Delete + loop _AddEdit)
//
//   - GET    /cotton-sales-return/options              -> customers/taxTypes/rawMaterials/receiptTypes
//   - GET    /cotton-sales-return/next-no              -> { no } (sp_CottonSalesReturn_No)
//   - GET    /cotton-sales-return/sales?customerCode=  -> that customer's sales (dropdown)
//   - GET    /cotton-sales-return/sale/:cottonSalesCode-> the sale header + bale rows
//   - GET    /cotton-sales-return/lists                -> sp_CottonSalesReturn_GetAll (paginated)
//   - POST   /cotton-sales-return/create               -> AddEdit (+ details + arrival/weighment)
//   - DELETE /cotton-sales-return/delete/:code         -> sp_CottonSalesReturn_Delete
//
// Company from req.headers.companyCode, FY from req.headers.FYCode; AddEdit also
// needs @User / @Node from req.headers.userId / nodeCode. Season resolved as
// MAX(SeationCode) from tbl_CottonSeation (overridable via header seationcode).
// Edit is NOT implemented in the WinForms (its Edit handler is empty) — the API
// exposes only create / list / delete. Tax + all weight/amount totals + the
// round-off are computed SERVER-SIDE (client figures are preview only).
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};
const r2 = (v) => Math.round((toNum(v) + Number.EPSILON) * 100) / 100;
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getFYCode = (req) => toInt(req.headers.FYCode);
const D = (v) => (v ? new Date(v) : null);

const scalar = async (request, proc) => {
  const r = await request.execute(proc);
  const row = r.recordset?.[0];
  return row ? toInt(Object.values(row)[0]) : 0;
};
const scalarStr = async (request, proc) => {
  const r = await request.execute(proc);
  const row = r.recordset?.[0];
  return row ? (Object.values(row)[0] ?? "").toString() : "";
};

// Resolve the current cotton season (MAX SeationCode), overridable via header/body.
const resolveSeason = async (req, pool) => {
  const override = toInt(req.headers.seationcode ?? req.body?.SeationCode);
  if (override > 0) return override;
  try {
    const r = await pool.request().query("Select MAX(SeationCode) AS s from tbl_CottonSeation");
    return toInt(r.recordset?.[0]?.s) || 1;
  } catch {
    return 1;
  }
};

// GET /cotton-sales-return/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);

    const [customers, taxTypes, rawMaterials, receiptTypes] = await Promise.all([
      pool
        .request()
        .query(
          `Select CustomerCode, CustomerName, MobileNo, GSTINNo from tbl_Customer
            Where Status = 1 AND RawMaterial = 1 Order by CustomerName`,
        ),
      pool
        .request()
        .query(
          `Select TaxTypeCode, TaxType, CGST, SGST, IGST from tbl_TaxType
            Where Status = 1 Order by TaxType`,
        ),
      pool
        .request()
        .query(
          "Select RawMaterialCode, RawMaterialName from tbl_Rawmaterial Where Status = 1 order by RawMaterialName",
        ),
      pool
        .request()
        .query(
          "Select CottonArrivalTypeCode, CottonArrivalTypeName from tbl_CottonArrivalType Where Status = 1",
        ),
    ]);

    return sendSuccess(res, {
      customers: (customers.recordset || []).map((r) => ({
        value: r.CustomerCode,
        label: r.CustomerName,
        GSTINNo: r.GSTINNo ?? "",
      })),
      taxTypes: (taxTypes.recordset || []).map((r) => ({
        value: r.TaxTypeCode,
        label: r.TaxType,
        CGST: toNum(r.CGST),
        SGST: toNum(r.SGST),
        IGST: toNum(r.IGST),
      })),
      rawMaterials: (rawMaterials.recordset || []).map((r) => ({
        value: r.RawMaterialCode,
        label: r.RawMaterialName,
      })),
      receiptTypes: (receiptTypes.recordset || []).map((r) => ({
        // @ReceiptType saves the NAME (matches cotton-arrival).
        value: r.CottonArrivalTypeName,
        label: r.CottonArrivalTypeName,
        CottonArrivalTypeCode: r.CottonArrivalTypeCode,
      })),
    });
  } catch (err) {
    console.error("DB Error (CottonSalesReturn.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /cotton-sales-return/next-no
export const getNextNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const no = await scalar(
      pool
        .request()
        .input("CompanyCode", sql.Int, getCompanyCode(req))
        .input("FYCode", sql.Int, getFYCode(req)),
      "sp_CottonSalesReturn_No",
    );
    return sendSuccess(res, { no });
  } catch (err) {
    console.error("DB Error (CottonSalesReturn.getNextNo):", err);
    return sendError(res, err);
  }
};

// GET /cotton-sales-return/sales?customerCode= -> a customer's sales (Sales No dropdown).
export const getSales = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const customerCode = toInt(req.query.customerCode);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CustomerCode", sql.Int, customerCode)
      .query(
        `Select CottonSalesCode, CONVERT(varchar, CottonSalesNo) as strCottonSalesNo
           from vw_CottonSales Where CustomerCode = @CustomerCode`,
      );
    const sales = (r.recordset || []).map((x) => ({
      value: x.CottonSalesCode,
      label: x.strCottonSalesNo,
    }));
    return sendSuccess(res, { sales });
  } catch (err) {
    console.error("DB Error (CottonSalesReturn.getSales):", err);
    return sendError(res, err);
  }
};

// GET /cotton-sales-return/sale/:cottonSalesCode -> the sale's header + bale rows.
export const getSaleDetail = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = parseInt(req.params.cottonSalesCode);
    if (!code) return sendError(res, "Invalid CottonSalesCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("CottonSalesCode", sql.Int, code)
      .execute("sp_CottonSalesDetails_GetAll");
    const rows = result.recordset || [];
    if (!rows.length) return sendError(res, "Sale not found", 404);

    const h = rows[0];
    const header = {
      CottonSalesCode: toInt(h.CottonSalesCode),
      CustomerCode: toInt(h.CustomerCode),
      TaxTypeCode: toInt(h.TaxTypeCode),
      VehicleNo: (h.VehicleNo || "").toString().trim(),
      Remarks: (h.Remarks || "").toString().trim(),
    };
    const details = rows.map((r) => ({
      RawMaterialCode: toInt(r.RawMaterialCode),
      RawMaterialName: (r.RawMaterialName || "").toString().trim(),
      MillLotNo: (r.MillLotNo || "").toString().trim(),
      BaleNo: r.BaleNo,
      Rate: toNum(r.Rate),
      ActualWeight: toNum(r.ActualWeight),
      CurrentWeight: toNum(r.CurrentWeight),
      TareWeight: toNum(r.TareWeight),
      NetWeight: toNum(r.NetWeight),
      Difference: toNum(r.CurrentWeight) - toNum(r.ActualWeight),
      Amount: toNum(r.Amount),
      GrossAmount: toNum(r.GrossAmount),
      WeighmentDetailsCode: toInt(r.WeighmentDetailsCode),
      WeighmentCode: toInt(r.WeighmentCode),
      ArrivalCode: toInt(r.ArrivalCode),
    }));
    return sendSuccess(res, { ...header, details });
  } catch (err) {
    console.error("DB Error (CottonSalesReturn.getSaleDetail):", err);
    return sendError(res, err);
  }
};

// GET /cotton-sales-return/lists
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_CottonSalesReturn_GetAll");
    const data = (result.recordset || [])
      .map((r) => ({ ...r, id: r.CottonSalesReturnCode }))
      .sort((a, b) => Number(b.CottonSalesReturnCode) - Number(a.CottonSalesReturnCode));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (CottonSalesReturn.getList):", err);
    return sendError(res, err);
  }
};

// Compute header totals + per-row tax/round-off from the returned bales.
// Mirrors Tax_Calc + GridTotal. NOTE: per-row NetAmount = Amount (the return
// proc stores the basic line amount, NOT gross+tax — matches the WinForms).
const computeTotals = (details, tax) => {
  const cgstPer = toNum(tax.CGST);
  const sgstPer = toNum(tax.SGST);
  const igstPer = toNum(tax.IGST);

  const rows = details.map((d) => {
    const rate = toNum(d.Rate);
    const actual = toNum(d.ActualWeight);
    const current = toNum(d.CurrentWeight);
    const tare = toNum(d.TareWeight);
    const net = current - tare;
    const amount = net * rate;
    return {
      ...d,
      ActualWeight: actual,
      CurrentWeight: current,
      TareWeight: tare,
      NetWeight: net,
      Difference: current - actual,
      Qty: 1,
      Rate: rate,
      Amount: amount,
      GrossAmount: amount,
    };
  });

  const totalBasic = rows.reduce((s, r) => s + r.GrossAmount, 0);
  const cgstAmt = cgstPer > 0 ? r2((totalBasic * cgstPer) / 100) : 0;
  const sgstAmt = sgstPer > 0 ? r2((totalBasic * sgstPer) / 100) : 0;
  const igstAmt = igstPer > 0 ? r2((totalBasic * igstPer) / 100) : 0;
  const totalTaxAmount = cgstAmt + sgstAmt + igstAmt;
  const totalTaxable = totalBasic;

  const preRoundNet = totalTaxable + totalTaxAmount;
  const roundedOff = r2(Math.trunc(preRoundNet + 0.5) - preRoundNet);
  const totalNetAmount = r2(preRoundNet + roundedOff);

  const totalQty = rows.length;
  const totalActual = rows.reduce((s, r) => s + r.ActualWeight, 0);
  const totalCurrent = rows.reduce((s, r) => s + r.CurrentWeight, 0);
  const totalTare = rows.reduce((s, r) => s + r.TareWeight, 0);
  const totalNet = rows.reduce((s, r) => s + r.NetWeight, 0);

  const detailRows = rows.map((r) => ({
    ...r,
    RND: roundedOff > 0 && totalTaxable > 0 ? r2((roundedOff / totalTaxable) * r.Amount) : 0,
    CGSTAmount: r2((r.GrossAmount * cgstPer) / 100),
    SGSTAmount: r2((r.GrossAmount * sgstPer) / 100),
    IGSTAmount: r2((r.GrossAmount * igstPer) / 100),
    NetAmount: r2(r.Amount),
  }));

  return {
    cgstPer, sgstPer, igstPer, cgstAmt, sgstAmt, igstAmt,
    totalBasic, totalTaxAmount, totalTaxable, roundedOff, totalNetAmount,
    totalQty, totalActual, totalCurrent, totalTare, totalNet, detailRows,
  };
};

// POST /cotton-sales-return/create
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
    const b = req.body || {};

    const customerCode = toInt(b.CustomerCode);
    const cottonSalesCode = toInt(b.CottonSalesCode);
    const taxTypeCode = toInt(b.TaxTypeCode);
    if (customerCode <= 0) return sendError(res, "Select the Customer Name", 400);
    if (taxTypeCode <= 0) return sendError(res, "Select The Tax Type", 400);

    const details = (Array.isArray(b.details) ? b.details : []).filter(
      (d) => toInt(d.WeighmentDetailsCode) > 0,
    );
    if (!details.length) return sendError(res, "Enter the Details", 400);

    const pool = await getPool(req.headers.subdbname);

    // Tax (server-side), return number, season + the new receipt's mill-lot/weighment no.
    const taxRes = await pool
      .request()
      .input("TaxTypeCode", sql.Int, taxTypeCode)
      .query("Select CGST, SGST, IGST from tbl_TaxType Where TaxTypeCode = @TaxTypeCode");
    const tax = taxRes.recordset?.[0] || { CGST: 0, SGST: 0, IGST: 0 };
    const t = computeTotals(details, tax);

    const returnNo = await scalar(
      pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("FYCode", sql.Int, fyCode),
      "sp_CottonSalesReturn_No",
    );

    const receiptType = (b.ReceiptType || "").toString().trim() || "PARTY";
    const seationCode = await resolveSeason(req, pool);

    const newMillLotNo = await scalarStr(
      pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("ReceiptType", sql.NVarChar, receiptType)
        .input("FYCode", sql.Int, fyCode),
      "sp_CottonArrival_MillLotNo",
    );
    const weighmentNo = await scalar(
      pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("FYCode", sql.Int, fyCode),
      "sp_CottonWeighment_No",
    );

    // Does this DB require weighment stock approval?
    const setRes = await pool
      .request()
      .query("Select Top 1 1 as f from tbl_Setting WHERE CottonWeighmentApproval = 1");
    const stockApproval = (setRes.recordset || []).length > 0 ? 1 : 0;

    const returnDate = D(b.CottonSalesReturnDate) || new Date();
    const vehicleNo = (b.VehicleNo || "").toString().trim();
    const remarks = (b.Remarks || "").toString().trim();
    const firstRow = t.detailRows[0] || {};

    tx = new sql.Transaction(pool);
    await tx.begin();

    // ---- header: sp_CottonSalesReturn_AddEdit -> CottonSalesReturnCode -----
    const head = new sql.Request(tx);
    head.input("CottonSalesReturnDate", sql.DateTime, returnDate);
    head.input("CottonSalesReturnNo", sql.Int, returnNo);
    head.input("CustomerCode", sql.Int, customerCode);
    head.input("CottonSalesCode", sql.Int, cottonSalesCode);
    head.input("TaxTypeCode", sql.Int, taxTypeCode);
    head.input("TotalQty", sql.Decimal(18, 3), t.totalQty);
    head.input("TotalAmount", sql.Decimal(18, 2), t.totalTaxable);
    head.input("TotalActualWeight", sql.Decimal(18, 3), t.totalActual);
    head.input("TotalCurrentWeight", sql.Decimal(18, 3), t.totalCurrent);
    head.input("TotalTareWeight", sql.Decimal(18, 3), t.totalTare);
    head.input("TotalNetWeight", sql.Decimal(18, 3), t.totalNet);
    head.input("TotalGrossAmount", sql.Decimal(18, 2), t.totalBasic);
    head.input("TotalTaxPer", sql.Decimal(18, 2), 0);
    head.input("TotalTaxAmount", sql.Decimal(18, 2), t.totalTaxAmount);
    head.input("TotalCSTPer", sql.Decimal(18, 2), 0);
    head.input("TotalCSTAmount", sql.Decimal(18, 2), 0);
    head.input("TotalCGSTPer", sql.Decimal(18, 2), t.cgstPer);
    head.input("TotalCGSTAmount", sql.Decimal(18, 2), t.cgstAmt);
    head.input("TotalSGSTPer", sql.Decimal(18, 2), t.sgstPer);
    head.input("TotalSGSTAmount", sql.Decimal(18, 2), t.sgstAmt);
    head.input("TotalIGSTPer", sql.Decimal(18, 2), t.igstPer);
    head.input("TotalIGSTAmount", sql.Decimal(18, 2), t.igstAmt);
    head.input("TotalOtherExpenses", sql.Decimal(18, 2), 0);
    head.input("TotalRoundedOff", sql.Decimal(18, 2), t.roundedOff);
    head.input("TotalNetAmount", sql.Decimal(18, 2), t.totalNetAmount);
    head.input("Remarks", sql.NVarChar, remarks);
    head.input("FYCode", sql.Int, fyCode);
    head.input("CompanyCode", sql.Int, companyCode);
    head.input("User", sql.Int, parseInt(userId));
    head.input("Node", sql.Int, parseInt(nodeCode));
    head.input("VehicleNo", sql.NVarChar, vehicleNo);
    const returnCode = await scalar(head, "sp_CottonSalesReturn_AddEdit");

    // ---- return detail rows ------------------------------------------------
    await new sql.Request(tx)
      .input("CottonSalesReturnCode", sql.Int, returnCode)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_CottonSalesReturnDetails_Delete");

    for (const d of t.detailRows) {
      await new sql.Request(tx)
        .input("CottonSalesReturnCode", sql.Int, returnCode)
        .input("TaxTypeCode", sql.Int, taxTypeCode)
        .input("BaleNo", sql.NVarChar, (d.BaleNo ?? "").toString())
        .input("RawMaterialCode", sql.Int, toInt(d.RawMaterialCode))
        .input("Qty", sql.Decimal(18, 3), toNum(d.Qty))
        .input("Rate", sql.Decimal(18, 3), toNum(d.Rate))
        .input("Amount", sql.Decimal(18, 2), r2(d.Amount))
        .input("GrossAmount", sql.Decimal(18, 2), r2(d.GrossAmount))
        .input("CGSTPer", sql.Decimal(18, 2), t.cgstPer)
        .input("CGSTAmount", sql.Decimal(18, 2), d.CGSTAmount)
        .input("SGSTPer", sql.Decimal(18, 2), t.sgstPer)
        .input("SGSTAmount", sql.Decimal(18, 2), d.SGSTAmount)
        .input("IGSTPer", sql.Decimal(18, 2), t.igstPer)
        .input("IGSTAmount", sql.Decimal(18, 2), d.IGSTAmount)
        .input("CurrentWeight", sql.Decimal(18, 3), toNum(d.CurrentWeight))
        .input("TareWeight", sql.Decimal(18, 3), toNum(d.TareWeight))
        .input("NetWeight", sql.Decimal(18, 3), toNum(d.NetWeight))
        .input("ActualWeight", sql.Decimal(18, 3), toNum(d.ActualWeight))
        .input("RoundedOff", sql.Decimal(18, 2), d.RND)
        .input("NetAmount", sql.Decimal(18, 2), d.NetAmount)
        .input("WeighmentDetailsCode", sql.Int, toInt(d.WeighmentDetailsCode))
        .input("WeighmentCode", sql.Int, toInt(d.WeighmentCode))
        .input("ArrivalCode", sql.Int, toInt(d.ArrivalCode))
        .input("CompanyCode", sql.Int, companyCode)
        .execute("sp_CottonSalesReturnDetails_AddEdit");
    }

    // ---- returned bales RE-ENTER STOCK: new Arrival + Weighment ------------
    const arr = new sql.Request(tx);
    arr.input("MillLotNo", sql.NVarChar, newMillLotNo);
    arr.input("ArrivalDate", sql.DateTime, returnDate);
    arr.input("SupplierCode", sql.Int, 0);
    arr.input("AgentCode", sql.Int, 0);
    arr.input("StationCode", sql.Int, 1);
    arr.input("PaymentType", sql.Int, 1);
    arr.input("PayMode", sql.Int, 1);
    arr.input("PaymentDays", sql.Int, 0);
    arr.input("RawMaterialCode", sql.Int, toInt(firstRow.RawMaterialCode));
    arr.input("PackingTypeCode", sql.Int, 1);
    arr.input("Qty", sql.Decimal(18, 3), t.totalQty);
    arr.input("CottonPackingMaterialCode", sql.Int, 1);
    arr.input("MixingCount", sql.Int, 0);
    arr.input("CandyRate", sql.Decimal(18, 3), toNum(firstRow.Rate));
    arr.input("Rate", sql.Decimal(18, 3), toNum(firstRow.Rate));
    arr.input("PartyGrossWeight", sql.Decimal(18, 3), t.totalCurrent);
    arr.input("PartyTareWeight", sql.Decimal(18, 3), t.totalTare);
    arr.input("PartyNetWeight", sql.Decimal(18, 3), t.totalNet);
    arr.input("GrossAmount", sql.Decimal(18, 2), t.totalBasic);
    arr.input("PartyLotNo", sql.NVarChar, "");
    arr.input("WayBillNo", sql.NVarChar, "");
    arr.input("TransporterCode", sql.Int, 1);
    arr.input("VehicleNo", sql.NVarChar, "");
    arr.input("TotalExpenses", sql.Decimal(18, 2), 0);
    arr.input("RoundOff", sql.Decimal(18, 2), 0);
    arr.input("NetAmount", sql.Decimal(18, 2), t.totalNetAmount);
    arr.input("Remarks", sql.NVarChar, "SALES RETURN");
    arr.input("ReceiptType", sql.NVarChar, receiptType);
    arr.input("SeationCode", sql.Int, seationCode);
    arr.input("FYCode", sql.Int, fyCode);
    arr.input("CompanyCode", sql.Int, companyCode);
    arr.input("User", sql.Int, parseInt(userId));
    arr.input("Node", sql.Int, parseInt(nodeCode));
    const arrivalCode = await scalar(arr, "sp_CottonArrival_AddEdit");

    const wh = new sql.Request(tx);
    wh.input("WeighmentNo", sql.Int, weighmentNo);
    wh.input("WeighmentDate", sql.DateTime, returnDate);
    wh.input("ArrivalCode", sql.Int, arrivalCode);
    wh.input("NoofBales", sql.Decimal(18, 3), t.totalQty);
    wh.input("TotalGrossWeight", sql.Decimal(18, 3), t.totalCurrent);
    wh.input("TotalAllowance", sql.Decimal(18, 3), 0);
    wh.input("TotalSamplesWeight", sql.Decimal(18, 3), 0);
    wh.input("TotalTareWeight", sql.Decimal(18, 3), t.totalTare);
    wh.input("TotalNetWeight", sql.Decimal(18, 3), t.totalNet);
    wh.input("WeighBridgeGrossWt", sql.Decimal(18, 3), t.totalCurrent);
    wh.input("WeighBridgeTareWt", sql.Decimal(18, 3), t.totalTare);
    wh.input("WeighBridgeNetWt", sql.Decimal(18, 3), t.totalNet);
    wh.input("GodownCode", sql.Int, 1);
    wh.input("FYCode", sql.Int, fyCode);
    wh.input("CompanyCode", sql.Int, companyCode);
    wh.input("User", sql.Int, parseInt(userId));
    wh.input("Node", sql.Int, parseInt(nodeCode));
    if (stockApproval) wh.input("StockApproval", sql.Int, 1);
    const weighmentCode = await scalar(wh, "sp_CottonWeighment_AddEdit");

    await new sql.Request(tx)
      .input("WeighmentCode", sql.Int, weighmentCode)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_CottonWeighmentDetails_Delete");

    let sno = 0;
    for (const d of t.detailRows) {
      sno += 1;
      const baleNo = toInt(d.BaleNo);
      const barCode = `${newMillLotNo}${String(baleNo).padStart(3, "0")}`;
      await new sql.Request(tx)
        .input("WeighmentCode", sql.Int, weighmentCode)
        .input("SNo", sql.Int, sno)
        .input("BaleNo", sql.NVarChar, baleNo.toString())
        .input("GrossWeight", sql.Decimal(18, 3), toNum(d.CurrentWeight))
        .input("Allowance", sql.Decimal(18, 3), 0)
        .input("SampleWeight", sql.Decimal(18, 3), 0)
        .input("TareWeight", sql.Decimal(18, 3), toNum(d.TareWeight))
        .input("NetWeight", sql.Decimal(18, 3), toNum(d.NetWeight))
        .input("BarCode", sql.NVarChar, barCode)
        .input("CompanyCode", sql.Int, companyCode)
        .execute("sp_CottonWeighmentDetails_AddEdit");
    }

    await tx.commit();
    return sendSuccess(
      res,
      { CottonSalesReturnCode: returnCode },
      "The record is saved",
      201,
    );
  } catch (err) {
    if (tx) {
      try {
        await tx.rollback();
      } catch (_) {}
    }
    if (err.message && err.message.includes("UK_CottonSalesReturnDetailsName")) {
      return sendError(res, "Already exist the CottonSalesReturnDetails Name", 409);
    }
    console.error("DB Error (CottonSalesReturn.create):", err);
    return sendError(res, err);
  }
};

// DELETE /cotton-sales-return/delete/:code
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = parseInt(req.params.code);
    if (!code) return sendError(res, "Invalid CottonSalesReturnCode", 400);
    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("CottonSalesReturnCode", sql.Int, code)
      .execute("sp_CottonSalesReturn_Delete");
    return sendSuccess(res, { CottonSalesReturnCode: code }, "The record is deleted");
  } catch (err) {
    if (err.number === 547) {
      return sendError(res, "This record is in use and can not be deleted", 409);
    }
    console.error("DB Error (CottonSalesReturn.remove):", err);
    return sendError(res, err);
  }
};
