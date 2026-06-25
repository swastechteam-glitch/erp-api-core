import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Cotton Sales / RawMaterial Sales (port of the WinForms frmCottonSales)
//   Sell cotton bales to a customer. Pick a Customer + Material Type + Tax
//   Type, then add lines: pick a Raw Material (loads its Mill Lots), a Mill Lot
//   (loads its in-stock bales), a Bale + Rate + current weight, add it; repeat.
//   Tax (CGST/SGST/IGST), all weight + amount totals and the per-row round-off
//   are computed SERVER-SIDE from the bale array (client values are preview
//   only), mirroring frmCottonSales.Tax_Calc / GridTotal / btnSave_Click.
//
//   - GET    /cotton-sales/options                 -> customers/materialTypes/taxTypes/rawMaterials
//   - GET    /cotton-sales/next-no?rawMaterialTypeCode= -> { no, strNo }
//   - GET    /cotton-sales/lot-stock?rawMaterialCode=   -> mill lots (sp_CottonIssue_LotStock)
//   - GET    /cotton-sales/bales-stock/:arrivalCode     -> in-stock bales of a lot
//   - GET    /cotton-sales/lists                   -> sp_CottonSales_GetAll (paginated)
//   - GET    /cotton-sales/list/:code              -> header + bale rows (for edit)
//   - POST   /cotton-sales/create                  -> AddEdit (+ details + gate pass)
//   - PUT    /cotton-sales/update/:code            -> AddEdit (+ details)
//   - DELETE /cotton-sales/delete/:code            -> sp_CottonSales_Delete
//
// Company from req.headers.companyCode, FY from req.headers.FYCode; AddEdit also
// needs @User / @Node from req.headers.userId / nodeCode. On a NEW sale the
// WinForms also writes a Gate Entry Goods-Out pass (GoodsTypeCode 2) — that is
// replicated inside the save transaction. The desktop serial scale, barcode
// capture, temp-table reload and Print are NOT ported (current weight is
// entered manually, defaulting to the bale's actual weight).
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

// GET /cotton-sales/options -> the four header/line dropdowns.
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);

    const [customers, rawMaterialTypes, taxTypes, rawMaterials] = await Promise.all([
      pool
        .request()
        .query(
          `Select CustomerCode, CustomerName, MobileNo, GSTINNo from tbl_Customer
            Where Status = 1 AND RawMaterial = 1 Order by CustomerName`,
        ),
      pool
        .request()
        .query("Select RawMaterialTypeCode, RawMaterialTypeName from tbl_RawMaterialType"),
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
    ]);

    return sendSuccess(res, {
      customers: (customers.recordset || []).map((r) => ({
        value: r.CustomerCode,
        label: r.CustomerName,
        CustomerName: r.CustomerName,
        MobileNo: r.MobileNo ?? "",
        GSTINNo: r.GSTINNo ?? "",
      })),
      rawMaterialTypes: (rawMaterialTypes.recordset || []).map((r) => ({
        value: r.RawMaterialTypeCode,
        label: r.RawMaterialTypeName,
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
        RawMaterialName: r.RawMaterialName,
      })),
    });
  } catch (err) {
    console.error("DB Error (CottonSales.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /cotton-sales/next-no?rawMaterialTypeCode= -> { no, strNo } for a new sale.
export const getNextNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const rawMaterialTypeCode = toInt(req.query.rawMaterialTypeCode);
    if (rawMaterialTypeCode <= 0) return sendSuccess(res, { no: 0, strNo: "" });

    const companyCode = getCompanyCode(req);
    const fyCode = getFYCode(req);
    const pool = await getPool(req.headers.subdbname);

    const [no, strNo] = await Promise.all([
      scalar(
        pool
          .request()
          .input("CompanyCode", sql.Int, companyCode)
          .input("FYCode", sql.Int, fyCode)
          .input("RawMaterialTypeCode", sql.Int, rawMaterialTypeCode),
        "sp_CottonSales_No",
      ),
      scalarStr(
        pool
          .request()
          .input("CompanyCode", sql.Int, companyCode)
          .input("FYCode", sql.Int, fyCode)
          .input("RawMaterialTypeCode", sql.Int, rawMaterialTypeCode),
        "sp_BIND_CottonSales_STRNo",
      ),
    ]);
    return sendSuccess(res, { no, strNo });
  } catch (err) {
    console.error("DB Error (CottonSales.getNextNo):", err);
    return sendError(res, err);
  }
};

// GET /cotton-sales/lot-stock?rawMaterialCode= -> the Mill Lot No dropdown.
export const getLotStock = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const request = pool.request().input("CompanyCode", sql.Int, getCompanyCode(req));
    const rawMaterialCode = toInt(req.query.rawMaterialCode);
    if (rawMaterialCode > 0) request.input("RawMaterialCode", sql.Int, rawMaterialCode);

    const r = await request.execute("sp_CottonIssue_LotStock");
    const lots = (r.recordset || []).map((x) => ({
      value: x.ArrivalCode,
      label: x.MillLotNo,
      ...x,
    }));
    return sendSuccess(res, { lots });
  } catch (err) {
    console.error("DB Error (CottonSales.getLotStock):", err);
    return sendError(res, err);
  }
};

// GET /cotton-sales/bales-stock/:arrivalCode -> in-stock bales of a lot.
export const getBalesStock = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const arrivalCode = parseInt(req.params.arrivalCode);
    if (!arrivalCode) return sendError(res, "Invalid ArrivalCode", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("Entry", sql.Int, 1)
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("ArrivalCode", sql.Int, arrivalCode)
      .execute("sp_CottonIssue_BalesStock");
    const bales = (r.recordset || []).map((x) => ({
      value: x.WeighmentDetailsCode,
      label: x.strBaleNo ?? x.BaleNo,
      WeighmentDetailsCode: toInt(x.WeighmentDetailsCode),
      BaleNo: x.BaleNo,
      MillLotNo: (x.MillLotNo || "").toString().trim(),
      GrossWeight: toNum(x.GrossWeight),
      TareWeight: toNum(x.TareWeight),
      WeighmentCode: toInt(x.WeighmentCode),
      ArrivalCode: toInt(x.ArrivalCode) || arrivalCode,
    }));
    return sendSuccess(res, { bales });
  } catch (err) {
    console.error("DB Error (CottonSales.getBalesStock):", err);
    return sendError(res, err);
  }
};

// GET /cotton-sales/lists -> all sales (paginated).
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_CottonSales_GetAll");
    const data = (result.recordset || [])
      .map((r) => ({ ...r, id: r.CottonSalesCode }))
      .sort((a, b) => Number(b.CottonSalesCode) - Number(a.CottonSalesCode));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (CottonSales.getList):", err);
    return sendError(res, err);
  }
};

// GET /cotton-sales/list/:code -> header + bale rows (for edit).
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = parseInt(req.params.code);
    if (!code) return sendError(res, "Invalid CottonSalesCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("CottonSalesCode", sql.Int, code)
      .execute("sp_CottonSalesDetails_GetAll");
    const rows = result.recordset || [];
    if (!rows.length) return sendError(res, "Cotton Sales not found", 404);

    const h = rows[0];
    const header = {
      CottonSalesCode: toInt(h.CottonSalesCode),
      CottonSalesNo: toInt(h.CottonSalesNo),
      strCottonSalesNo: (h.strCottonSalesNo || "").toString().trim(),
      CottonSalesDate: h.CottonSalesDate,
      CustomerCode: toInt(h.CustomerCode),
      RawMaterialTypeCode: toInt(h.RawMaterialTypeCode),
      TaxTypeCode: toInt(h.TaxTypeCode),
      VehicleNo: (h.VehicleNo || "").toString().trim(),
      Remarks: (h.Remarks || "").toString().trim(),
      TotalRoundedOff: toNum(h.TotalRoundedOff),
      TotalNetAmount: toNum(h.TotalNetAmount),
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
    console.error("DB Error (CottonSales.getById):", err);
    return sendError(res, err);
  }
};

// Compute every header total + per-row tax/round-off from the bale array.
// Mirrors Tax_Calc + GridTotal: amounts trusted from server, not the client.
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

  // Per-row round-off + tax split (sp_CottonSalesDetails_AddEdit inputs).
  const detailRows = rows.map((r) => ({
    ...r,
    RND: roundedOff > 0 && totalTaxable > 0 ? r2((roundedOff / totalTaxable) * r.Amount) : 0,
    CGSTAmount: r2((r.GrossAmount * cgstPer) / 100),
    SGSTAmount: r2((r.GrossAmount * sgstPer) / 100),
    IGSTAmount: r2((r.GrossAmount * igstPer) / 100),
    NetAmount: r2(
      r.GrossAmount +
        (r.GrossAmount * cgstPer) / 100 +
        (r.GrossAmount * sgstPer) / 100 +
        (r.GrossAmount * igstPer) / 100,
    ),
  }));

  return {
    cgstPer,
    sgstPer,
    igstPer,
    cgstAmt,
    sgstAmt,
    igstAmt,
    totalBasic,
    totalTaxAmount,
    totalTaxable,
    roundedOff,
    totalNetAmount,
    totalQty,
    totalActual,
    totalCurrent,
    totalTare,
    totalNet,
    detailRows,
  };
};

const saveOrUpdate = async (req, res, isEdit) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const companyCode = getCompanyCode(req);
    const fyCode = getFYCode(req);
    const code = isEdit ? parseInt(req.params.code) : 0;
    const b = req.body || {};

    const customerCode = toInt(b.CustomerCode);
    const rawMaterialTypeCode = toInt(b.RawMaterialTypeCode);
    const taxTypeCode = toInt(b.TaxTypeCode);
    if (customerCode <= 0) return sendError(res, "Select the Customer Name", 400);
    if (rawMaterialTypeCode <= 0) return sendError(res, "Select the RawMaterial Type Name", 400);
    if (taxTypeCode <= 0) return sendError(res, "Select The Tax Type", 400);

    const details = (Array.isArray(b.details) ? b.details : []).filter(
      (d) => toInt(d.WeighmentDetailsCode) > 0,
    );
    if (!details.length) return sendError(res, "Enter the Details", 400);
    for (const d of details) {
      if (toInt(d.WeighmentCode) <= 0 || toInt(d.ArrivalCode) <= 0)
        return sendError(res, "Please check the entry", 400);
    }

    const pool = await getPool(req.headers.subdbname);

    // Resolve the Tax Type's CGST/SGST/IGST server-side (don't trust client).
    const taxRes = await pool
      .request()
      .input("TaxTypeCode", sql.Int, taxTypeCode)
      .query("Select CGST, SGST, IGST from tbl_TaxType Where TaxTypeCode = @TaxTypeCode");
    const tax = taxRes.recordset?.[0] || { CGST: 0, SGST: 0, IGST: 0 };

    const t = computeTotals(details, tax);

    // Sales number: keep the existing one on edit, else allocate a new one.
    let salesNo = toInt(b.CottonSalesNo);
    let strSalesNo = (b.strCottonSalesNo || "").toString().trim();
    if (!isEdit) {
      salesNo = await scalar(
        pool
          .request()
          .input("CompanyCode", sql.Int, companyCode)
          .input("FYCode", sql.Int, fyCode)
          .input("RawMaterialTypeCode", sql.Int, rawMaterialTypeCode),
        "sp_CottonSales_No",
      );
      strSalesNo = await scalarStr(
        pool
          .request()
          .input("CompanyCode", sql.Int, companyCode)
          .input("FYCode", sql.Int, fyCode)
          .input("RawMaterialTypeCode", sql.Int, rawMaterialTypeCode),
        "sp_BIND_CottonSales_STRNo",
      );
    }

    // Customer details for the gate pass (matches cmbCustomerName.ColData).
    const custRes = await pool
      .request()
      .input("CustomerCode", sql.Int, customerCode)
      .query(
        "Select CustomerName, MobileNo from tbl_Customer Where CustomerCode = @CustomerCode",
      );
    const cust = custRes.recordset?.[0] || {};

    const salesDate = D(b.CottonSalesDate) || new Date();
    const vehicleNo = (b.VehicleNo || "").toString().trim();
    const remarks = (b.Remarks || "").toString().trim();

    tx = new sql.Transaction(pool);
    await tx.begin();

    // ---- header: sp_CottonSales_AddEdit -> CottonSalesCode -----------------
    const head = new sql.Request(tx);
    if (isEdit && code) head.input("CottonSalesCode", sql.Int, code);
    head.input("CottonSalesDate", sql.DateTime, salesDate);
    head.input("CottonSalesNo", sql.Int, salesNo);
    head.input("CustomerCode", sql.Int, customerCode);
    head.input("RawMatrialTypeCode", sql.Int, rawMaterialTypeCode);
    head.input("strCottonSalesNo", sql.NVarChar, strSalesNo);
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
    const cottonSalesCode = await scalar(head, "sp_CottonSales_AddEdit");

    // ---- detail rows -------------------------------------------------------
    await new sql.Request(tx)
      .input("CottonSalesCode", sql.Int, cottonSalesCode)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_CottonSalesDetails_Delete");

    for (const d of t.detailRows) {
      await new sql.Request(tx)
        .input("CottonSalesCode", sql.Int, cottonSalesCode)
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
        .execute("sp_CottonSalesDetails_AddEdit");
    }

    // ---- Gate Entry Goods-Out pass (new sale only, GoodsTypeCode 2) --------
    if (!isEdit) {
      const goodsPassNumber = await scalar(
        new sql.Request(tx)
          .input("CompanyCode", sql.Int, companyCode)
          .input("FYCode", sql.Int, fyCode)
          .input("GoodsTypeCode", sql.Int, 2),
        "sp_GateEntryGoodsOut_BindNo",
      );

      const goodsHead = new sql.Request(tx);
      goodsHead.input("Goodspassnumber", sql.Int, goodsPassNumber);
      goodsHead.input("VehicleNo", sql.NVarChar, vehicleNo);
      goodsHead.input("MobileNumber", sql.NVarChar, (cust.MobileNo || "").toString().trim());
      goodsHead.input("CompanyName", sql.NVarChar, (cust.CustomerName || "").toString().trim());
      goodsHead.input("CustomerCode", sql.Int, customerCode);
      goodsHead.input("InvoiceNumber", sql.NVarChar, strSalesNo);
      goodsHead.input("GoodsTypeCode", sql.Int, 2);
      goodsHead.input("TransGoodsTypeCode", sql.Int, 3);
      goodsHead.input("Reason", sql.NVarChar, ` Sales Invoice No.${strSalesNo}`);
      goodsHead.input("MaterialTypeCode", sql.Int, 2);
      goodsHead.input("StoreOutDate", sql.DateTime, salesDate);
      goodsHead.input("StoreOuttime", sql.DateTime, salesDate);
      goodsHead.input("Cancel", sql.Int, 0);
      goodsHead.input("CancelReason", sql.NVarChar, "");
      goodsHead.input("RefCode", sql.Int, 0);
      goodsHead.input("RefNo", sql.NVarChar, "");
      goodsHead.input("CompanyCode", sql.Int, companyCode);
      goodsHead.input("FYCode", sql.Int, fyCode);
      goodsHead.input("user", sql.Int, parseInt(userId));
      goodsHead.input("Node", sql.Int, parseInt(nodeCode));
      const goodsOutCode = await scalar(goodsHead, "sp_GateEntryGoodsOut_AddEdit");

      await new sql.Request(tx)
        .input("GoodsOutPassCode", sql.Int, goodsOutCode)
        .input("CompanyCode", sql.Int, companyCode)
        .execute("sp_GateEntryGoodsOutDetails_Delete");

      const first = t.detailRows[0] || {};
      await new sql.Request(tx)
        .input("GoodsOutPassCode", sql.Int, goodsOutCode)
        .input("ItemName", sql.NVarChar, (first.RawMaterialName || "").toString().trim())
        .input("OutQty", sql.Decimal(18, 3), t.totalQty)
        .input("ItemCode", sql.Int, 0)
        .input("ItemUOMCode", sql.Int, 1)
        .input("CountNameCode", sql.Int, 0)
        .input("RawMaterialCode", sql.Int, toInt(first.RawMaterialCode))
        .input("WasteItemCode", sql.Int, 0)
        .input("GoodsImage", sql.VarBinary, null)
        .input("CompanyCode", sql.Int, companyCode)
        .execute("sp_GateEntryGoodsOutDetails_Insert");
    }

    // ---- clear the WinForms temp tables (harmless cleanup) -----------------
    await new sql.Request(tx)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_CottonSalesDetails_Temp_Delete");
    await new sql.Request(tx)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_CottonSales_Temp_Delete");

    await tx.commit();
    return sendSuccess(
      res,
      { CottonSalesCode: cottonSalesCode },
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201,
    );
  } catch (err) {
    if (tx) {
      try {
        await tx.rollback();
      } catch (_) {}
    }
    if (err.message && err.message.includes("UK_CottonSalesDetailsName")) {
      return sendError(res, "Already exist the CottonSalesDetails Name", 409);
    }
    console.error("DB Error (saveOrUpdateCottonSales):", err);
    return sendError(res, err);
  }
};

export const create = (req, res) => saveOrUpdate(req, res, false);
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /cotton-sales/delete/:code
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = parseInt(req.params.code);
    if (!code) return sendError(res, "Invalid CottonSalesCode", 400);
    const userId = req.headers.userId;
    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("CottonSalesCode", sql.Int, code)
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("User", sql.Int, parseInt(userId) || 0)
      .execute("sp_CottonSales_Delete");
    return sendSuccess(res, { CottonSalesCode: code }, "The record is deleted");
  } catch (err) {
    if (err.number === 547) {
      return sendError(res, "This record is in use and can not be deleted", 409);
    }
    console.error("DB Error (CottonSales.remove):", err);
    return sendError(res, err);
  }
};
