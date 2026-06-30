import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Yarn Invoice (Full) — port of WinForms frmFullInvoice ("InvoiceAdd MultiCount
// SingleScreen Entry"). List existing invoices; Add opens the full entry form:
//   Customer → pending Sales Order → Lot → bag selection → line grid,
//   GST/TCS/round-off totals, transport + delivery details, then Save.
//
//   Options     : GET  /yarn-invoice-full/options
//   Pending SOs : GET  /yarn-invoice-full/pending-so?customerCode=
//   Credit      : GET  /yarn-invoice-full/credit?customerCode=&customerName=
//   Lot stock   : GET  /yarn-invoice-full/lot-stock?countTypeCode=
//   Lot bags    : GET  /yarn-invoice-full/lot-bags?lotNoCode=&countTypeCode=
//   Next no     : GET  /yarn-invoice-full/next-no?taxTypeCode=&salesTypeCode=
//   List        : GET  /yarn-invoice-full/lists
//   Create      : POST /yarn-invoice-full/create
//   Delete      : DELETE /yarn-invoice-full/:invoiceCode
//
// CompanyCode / FYCode / userId / nodeCode come from the JWT headers.
//
// Faithful simplifications vs the desktop form (both intentional):
//   * the desktop tbl_tempInvoicePacking session table is NOT used — the
//     selected bags are posted directly in the create payload;
//   * Update_Voucher (accounting voucher) is omitted — it is commented out in
//     the VB save path too.
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};
const str = (v) => (v == null ? "" : String(v));
const D = (v) => (v ? new Date(v) : null);
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getFYCode = (req) => toInt(req.headers.FYCode);
const getUserId = (req) => toInt(req.headers.userId);
const getNodeCode = (req) => toInt(req.headers.nodeCode);

const opt = (rs, valueKey, labelKey) =>
  (rs?.recordset || []).map((r) => ({ ...r, value: r[valueKey], label: r[labelKey] }));

// Run a query but degrade to a fallback instead of throwing (used for the
// option lookups so one missing proc/view doesn't blank the whole form).
const safe = async (fn, fallback) => {
  try {
    return await fn();
  } catch (e) {
    console.warn("InvoiceFull lookup skipped:", e?.message);
    return fallback;
  }
};

// GET /yarn-invoice-full/options — every dropdown the entry form needs.
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const companyCode = getCompanyCode(req);

    const customers = await safe(
      () =>
        pool
          .request()
          .input("CompanyCode", sql.Int, companyCode)
          .execute("sp_Pending_InvoiceList_GetAll_Customer")
          .then((r) => opt(r, "CustomerCode", "CustomerName")),
      []
    );
    const deliveryCustomers = await safe(
      () =>
        pool
          .request()
          .query("Select CustomerID,CustomerName,CustomerCode,Address1,Address2,City,District,PANNo,CustomerNameInTally,Distance FROM vw_Customer where Status = 1 Order by CustomerName")
          .then((r) => opt(r, "CustomerCode", "CustomerName")),
      []
    );
    const taxTypes = await safe(
      () =>
        pool
          .request()
          .query("Select TaxName,TaxType,TaxTypeCode,SalesTypeCode,InvoiceHeadingName,InvoiceNoPrefix,CGST,SGST,IGST,CGST_HeadCode,SGST_HeadCode,IGST_HeadCode,Insurance_HeadCode,Frieght_HeadCode,Fabric_HeadCode,Packing_HeadCode,TNGST_HeadCode,Insurance,BED,AED,CESS,TNGST,Surcharge,Freight,FabricCharge from tbl_TaxType where Status=1 Order by TaxName")
          .then((r) => opt(r, "TaxTypeCode", "TaxType")),
      []
    );
    const vehicles = await safe(
      () =>
        pool
          .request()
          .query("Select VehicleName,RegistrationNumber,RegistrationDate,VehicleCode,UsageTypeCode from vw_Vehicle Order by VehicleName")
          .then((r) => opt(r, "VehicleCode", "VehicleName")),
      []
    );
    const drivers = await safe(
      () =>
        pool
          .request()
          .input("CompanyCode", sql.Int, companyCode)
          .execute("sp_Invoice_LoadDriver")
          .then((r) => opt(r, "DriverCode", "DriverName")),
      []
    );
    const transporters = await safe(
      () =>
        pool
          .request()
          .query("Select TransporterName,TransporterCode from tbl_Transporter Order by TransporterName")
          .then((r) => opt(r, "TransporterCode", "TransporterName")),
      []
    );
    const insuranceModes = await safe(
      () =>
        pool
          .request()
          .query("SELECT InsuranceType,InsuranceTypeCode FROM tbl_Insurancetype")
          .then((r) => opt(r, "InsuranceTypeCode", "InsuranceType")),
      []
    );
    const companies = await safe(
      () =>
        pool
          .request()
          .input("CompanyCode", sql.Int, companyCode)
          .query("Select CompanyName,ShortName,CompanyCode,Address1,Address2,City,District,PhoneNo,PANNo from tbl_Company where CompanyCode = @CompanyCode")
          .then((r) => opt(r, "CompanyCode", "ShortName")),
      []
    );
    // Settings that toggle UI behaviour (TCS on, lot-coded SO, allotted packing).
    const settings = await safe(
      () =>
        pool
          .request()
          .query("Select (Select Count(*) from tbl_Setting Where YarnInvoice_WithTCS=1) AS WithTCS, (Select Count(*) from tbl_Setting Where SalesOrderWithLotCode=1) AS WithLot, (Select Count(*) from tbl_Setting Where Invoice_Allotted=0) AS Allotted")
          .then((r) => r.recordset?.[0] || {}),
      {}
    );

    return sendSuccess(res, {
      customers,
      deliveryCustomers,
      taxTypes,
      vehicles,
      drivers,
      transporters,
      insuranceModes,
      companies,
      settings,
      companyCode,
    });
  } catch (err) {
    console.error("DB Error (InvoiceFull.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /yarn-invoice-full/pending-so?customerCode= — pending sales orders for a
// customer; each row carries the rate/commission/delivery/tax data the form needs.
export const getPendingSO = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const customerCode = toInt(req.query.customerCode);
    const rs = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("CustomerCode", sql.Int, customerCode)
      .execute("sp_Pending_InvoiceList_GetAll");
    return sendSuccess(res, opt(rs, "SOCode", "strSONoCount"));
  } catch (err) {
    console.error("DB Error (InvoiceFull.getPendingSO):", err);
    return sendError(res, err);
  }
};

// GET /yarn-invoice-full/credit?customerCode=&customerName= — credit check.
export const getCredit = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const companyCode = getCompanyCode(req);
    const customerCode = toInt(req.query.customerCode);
    const customerName = str(req.query.customerName).trim();
    const today = new Date();

    const ledger = await safe(
      () =>
        pool
          .request()
          .input("FromDate", sql.DateTime, today)
          .input("ToDate", sql.DateTime, today)
          .input("CustomerCode", sql.Int, customerCode)
          .execute("sp_CustomerLedger_Detailed")
          .then((r) => r.recordset || []),
      []
    );
    const unitTotal = ledger.reduce((s, row) => s + toNum(row.ClosingAmount), 0);

    const cust = await safe(
      () =>
        pool
          .request()
          .input("CustomerCode", sql.Int, customerCode)
          .query("Select CreditLimit, PANNo from tbl_Customer where CustomerCode = @CustomerCode")
          .then((r) => r.recordset?.[0] || {}),
      {}
    );
    const creditLimit = toNum(cust.CreditLimit);

    const despatchPending = await safe(
      () =>
        pool
          .request()
          .input("CompanyCode", sql.Int, companyCode)
          .input("CustomerName", sql.NVarChar(255), customerName)
          .execute("sp_Invoice_Despatch_Pending")
          .then((r) => toNum(r.recordset?.[0]?.PendingAmount)),
      0
    );

    const turnOver = await safe(
      () =>
        pool
          .request()
          .input("PANNo", sql.NVarChar(50), str(cust.PANNo))
          .execute("sp_Customer_TurnOver")
          .then((r) => toNum(Object.values(r.recordset?.[0] || {})[0])),
      0
    );

    const curBill = 0; // current invoice net is not computed at credit-check time
    const total = unitTotal + curBill + despatchPending;
    const available = creditLimit - total;

    return sendSuccess(res, {
      unitTotal,
      creditLimit,
      despatchPending,
      curBill,
      total,
      available,
      turnOver,
      exceeds: available < 0,
    });
  } catch (err) {
    console.error("DB Error (InvoiceFull.getCredit):", err);
    return sendError(res, err);
  }
};

// GET /yarn-invoice-full/lot-stock?countTypeCode= — lots in stock for a count.
export const getLotStock = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const rs = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("CountTypeCode", sql.Int, toInt(req.query.countTypeCode))
      .execute("sp_CurStock_LotNo_GetBy_CountTypeCode");
    return sendSuccess(res, opt(rs, "LotNoCode", "LotNo"));
  } catch (err) {
    console.error("DB Error (InvoiceFull.getLotStock):", err);
    return sendError(res, err);
  }
};

// GET /yarn-invoice-full/lot-bags?lotNoCode=&countTypeCode= — bags in a lot.
export const getLotBags = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const rs = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("LotNoCode", sql.Int, toInt(req.query.lotNoCode))
      .input("CountTypeCode", sql.Int, toInt(req.query.countTypeCode))
      .execute("sp_BagNo_GetByLotNo");
    // Only bags with a real BagCode are selectable (mirrors the VB list build).
    const bags = (rs.recordset || []).filter((b) => toInt(b.BagCode) > 0);
    return sendSuccess(res, bags);
  } catch (err) {
    console.error("DB Error (InvoiceFull.getLotBags):", err);
    return sendError(res, err);
  }
};

// GET /yarn-invoice-full/next-no?taxTypeCode=&salesTypeCode= — invoice + bill no.
export const getNextNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const companyCode = getCompanyCode(req);
    const fyCode = getFYCode(req);
    const taxTypeCode = toInt(req.query.taxTypeCode);
    const salesTypeCode = toInt(req.query.salesTypeCode);

    // NOT wrapped in safe(): invoice/bill numbering must NOT silently degrade to
    // a blank number — a numbering proc failure surfaces as an error so the
    // client never persists an invoice with number 0/blank.
    const scalar = (proc) =>
      pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("FYCode", sql.Int, fyCode)
        .input("SalesTypeCode", sql.Int, salesTypeCode)
        .input("TaxTypeCode", sql.Int, taxTypeCode)
        .execute(proc)
        .then((r) => Object.values(r.recordset?.[0] || {})[0] ?? "");

    const [invNo, strInvoiceNo, billNo, strBillNo] = await Promise.all([
      scalar("sp_Invoice_InvoiceNo"),
      scalar("sp_Invoice_strInvoiceNo"),
      scalar("sp_Invoice_BillNo"),
      scalar("sp_Invoice_strBillNo"),
    ]);

    return sendSuccess(res, { invNo, strInvoiceNo, billNo, strBillNo });
  } catch (err) {
    console.error("DB Error (InvoiceFull.getNextNo):", err);
    return sendError(res, err);
  }
};

// GET /yarn-invoice-full/lists — existing invoices for the company + FY.
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const rs = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("FYCode", sql.Int, getFYCode(req))
      .query("Select * from vw_Invoice Where CompanyCode = @CompanyCode AND FyCode = @FYCode Order By InvoiceCode DESC");
    return sendSuccess(res, rs.recordset || []);
  } catch (err) {
    console.error("DB Error (InvoiceFull.getList):", err);
    return sendError(res, err);
  }
};

// POST /yarn-invoice-full/create — save the invoice (header + details + print + bags).
export const create = async (req, res) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const companyCode = getCompanyCode(req);
    const fyCode = getFYCode(req);
    const userId = getUserId(req);
    const nodeCode = getNodeCode(req);
    const b = req.body || {};
    const details = Array.isArray(b.details) ? b.details : [];
    const packing = Array.isArray(b.packing) ? b.packing : [];
    const withoutPacking = !!b.withoutPacking;

    // --- Server-side guards (mirror the VB validations) -------------------
    if (toInt(b.CustomerCode) <= 0) return sendError(res, "Select the Customer", 400);
    if (toInt(b.TaxTypeCode) <= 0) return sendError(res, "Select the Tax Type", 400);
    if (toInt(b.DeliveryCode) <= 0) return sendError(res, "Select the Delivery Customer", 400);
    if (toNum(b.BasicValue) <= 0) return sendError(res, "Check the Basic Amount", 400);
    if (toNum(b.NetAmount) <= 0) return sendError(res, "Check the Net Amount", 400);
    if (details.length === 0) return sendError(res, "Check the Details in Grid", 400);
    if (!withoutPacking && packing.length === 0) return sendError(res, "Check the Details in Grid", 400);
    if (toInt(b.VehicleCode) <= 0) return sendError(res, "Select the Vehicle", 400);
    if (toInt(b.TransporterCode) <= 0) return sendError(res, "Select the Transporter", 400);
    // Faithful to the VB btnSave guards + numbering integrity:
    if (toInt(b.BillNo) <= 0) return sendError(res, "Invalid Bill No", 400);
    if (!str(b.strInvoiceNo).trim()) return sendError(res, "Invoice numbering failed — reopen the Sales Order and retry", 400);
    if (!str(b.PlaceofSupply).trim()) return sendError(res, "Enter the Place of Supply", 400);
    if (toNum(b.DeliveryDistance) <= 0) return sendError(res, "Please Enter the Delivery Distance", 400);

    tx = new sql.Transaction(pool);
    await tx.begin();

    // 1) Header -> InvoiceCode (ExecuteScalar in the VB).
    const head = await new sql.Request(tx)
      .input("InvoiceDate", sql.DateTime, D(b.InvoiceDate) || new Date())
      .input("InvoiceNo", sql.Int, toInt(b.InvNo))
      .input("strInvoiceNo", sql.NVarChar(50), str(b.strInvoiceNo).trim())
      .input("PerKg", sql.Decimal(18, 2), 0)
      .input("OtherChargesAmount", sql.Decimal(18, 2), 0)
      .input("Freight", sql.Decimal(18, 2), toNum(b.FreightAmount))
      .input("FreightAmount", sql.Decimal(18, 2), toNum(b.FreightAmount))
      .input("CGST", sql.Decimal(18, 3), toNum(b.CGST))
      .input("SGST", sql.Decimal(18, 3), toNum(b.SGST))
      .input("IGST", sql.Decimal(18, 3), toNum(b.IGST))
      .input("Insurance", sql.Decimal(18, 2), toNum(b.InsuranceValue))
      .input("BED", sql.Decimal(18, 2), 0)
      .input("AED", sql.Decimal(18, 2), 0)
      .input("CESS", sql.Decimal(18, 2), 0)
      .input("TNGST", sql.Decimal(18, 2), 0)
      .input("Surcharge", sql.Decimal(18, 2), 0)
      .input("TotalQty", sql.Decimal(18, 2), toNum(b.TotalQty))
      .input("TotalWeight", sql.Decimal(18, 3), toNum(b.TotalWeight))
      .input("TotalLessWeight", sql.Decimal(18, 3), toNum(b.TotalLessWeight))
      .input("DeliveryCode", sql.Int, toInt(b.DeliveryCode))
      .input("SalesTypeCode", sql.Int, toInt(b.SalesTypeCode))
      .input("TaxTypeCode", sql.Int, toInt(b.TaxTypeCode))
      .input("FreightValue", sql.Decimal(18, 2), toNum(b.FreightAmount))
      .input("BasicValue", sql.Decimal(18, 2), toNum(b.BasicValue))
      .input("TradeDiscount", sql.Decimal(18, 2), toNum(b.TradeDiscount))
      .input("InsuranceValue", sql.Decimal(18, 2), toNum(b.InsuranceValue))
      .input("CGSTValue", sql.Decimal(18, 2), toNum(b.CGSTValue))
      .input("SGSTValue", sql.Decimal(18, 2), toNum(b.SGSTValue))
      .input("IGSTValue", sql.Decimal(18, 2), toNum(b.IGSTValue))
      .input("TCSTaxableAmount", sql.Decimal(18, 2), toNum(b.TCSTaxableAmount))
      .input("TCSPer", sql.Decimal(18, 3), toNum(b.TCSPer))
      .input("TCSAmount", sql.Decimal(18, 2), toNum(b.TCSAmount))
      .input("RoundOff", sql.Decimal(18, 2), toNum(b.RoundOff))
      .input("NetAmount", sql.Decimal(18, 2), toNum(b.NetAmount))
      .input("TurnOver", sql.Decimal(18, 2), toNum(b.TurnOver))
      .input("CompanyCode", sql.Int, companyCode)
      .input("CustomerCode", sql.Int, toInt(b.CustomerCode))
      .input("C_User", sql.Int, userId)
      .input("C_Node", sql.Int, nodeCode)
      .execute("sp_Invoice_Insert");

    const headRow = head.recordset?.[0];
    const invoiceCode = headRow ? toInt(Object.values(headRow)[0]) : 0;
    if (invoiceCode <= 0) {
      await tx.rollback().catch(() => {});
      return sendError(res, "Invoice header save did not return a valid InvoiceCode", 500);
    }

    // 2) Detail rows.
    for (const d of details) {
      await new sql.Request(tx)
        .input("InvoiceCode", sql.Int, invoiceCode)
        .input("SOCode", sql.Int, toInt(d.SOCode))
        .input("SODNo", sql.Int, toInt(d.SODNo))
        .input("CustomerCode", sql.Int, toInt(d.CustomerCode))
        .input("CountTypeCode", sql.Int, toInt(d.CountTypeCode))
        .input("LotNoCode", sql.Int, toInt(d.LotNoCode))
        .input("Qty", sql.Decimal(18, 2), toNum(d.Qty))
        .input("Rate", sql.Decimal(18, 2), toNum(d.Rate))
        .input("RateEx", sql.Decimal(18, 6), toNum(d.RateEx))
        .input("Weight", sql.Decimal(18, 3), toNum(d.Weight))
        .input("BasicAmount", sql.Decimal(18, 2), toNum(d.BasicAmount))
        .input("Description", sql.NVarChar(250), str(d.Description).trim())
        .input("CommissionType", sql.Int, toInt(d.CommissionType))
        .input("CommissionTypeName", sql.NVarChar(100), str(d.CommissionTypeName).trim())
        .input("CommissionPer", sql.Decimal(18, 2), toNum(d.CommissionPer))
        .input("CommissionRs", sql.Decimal(18, 2), toNum(d.CommissionRs))
        .execute("sp_InvoiceDetails_Insert");
    }

    // 3) Print / despatch detail (transport + bill).
    const printReq = new sql.Request(tx)
      .input("InvoiceCode", sql.Int, invoiceCode)
      .input("BillDate", sql.DateTime, D(b.BillDate) || new Date())
      .input("BillNo", sql.Int, toInt(b.BillNo))
      .input("strBillNo", sql.NVarChar(50), str(b.strBillNo).trim())
      .input("VehicleCode", sql.Int, toInt(b.VehicleCode))
      .input("DriverCode", sql.Int, toInt(b.DriverCode))
      .input("DriverName", sql.NVarChar(150), str(b.DriverName).trim())
      .input("DeliveryCode", sql.Int, toInt(b.DeliveryCode))
      .input("CustomerCode", sql.Int, toInt(b.CustomerCode))
      .input("FYCode", sql.Int, fyCode)
      .input("Remarks", sql.NVarChar(500), str(b.Remarks).trim())
      .input("DeliveryDistance", sql.Decimal(18, 2), toNum(b.DeliveryDistance))
      .input("AR4No", sql.NVarChar(50), str(b.ARNo).trim())
      .input("ContainerNo", sql.NVarChar(50), str(b.ContainerNo).trim())
      .input("FreightStr", sql.NVarChar(50), str(b.FreightStr).trim())
      .input("DCNo", sql.NVarChar(50), str(b.DCNo).trim())
      .input("TransporterCode", sql.Int, toInt(b.TransporterCode))
      .input("Transporter", sql.NVarChar(150), str(b.Transporter).trim())
      .input("GCNo", sql.NVarChar(50), str(b.GCNo).trim())
      .input("RemovalDate", sql.DateTime, new Date())
      .input("PrintingDate", sql.DateTime, new Date())
      .input("PrintingUser", sql.Int, userId)
      .input("DateofSupply", sql.DateTime, D(b.DateofSupply) || new Date())
      .input("PlaceofSupply", sql.NVarChar(150), str(b.PlaceofSupply).trim())
      .input("CompanyCode", sql.Int, companyCode)
      .input("FIRLotNo", sql.NVarChar(50), str(b.FIRLotNo).trim());

    // Optional dated/flagged fields — only when supplied (mirrors the VB checks).
    if (toInt(b.SalesTypeCode) === 2 && str(b.FormXXNo).trim()) {
      printReq.input("FormXXNo", sql.NVarChar(50), str(b.FormXXNo).trim());
      if (b.FormXXDate) printReq.input("FormXXDate", sql.DateTime, D(b.FormXXDate));
    }
    if (b.ARDate) printReq.input("AR4Date", sql.DateTime, D(b.ARDate));
    if (b.DCDate) printReq.input("DCDate", sql.DateTime, D(b.DCDate));
    if (b.GCDate) printReq.input("GCDate", sql.DateTime, D(b.GCDate));
    if (toInt(b.InsuranceTypeCode) > 0) printReq.input("InsuranceTypeCode", sql.Int, toInt(b.InsuranceTypeCode));
    if (toInt(b.InsuranceEntryCode) > 0) printReq.input("InsuranceEntryCode", sql.Int, toInt(b.InsuranceEntryCode));

    await printReq.execute("sp_InvoicePrint_Insert");

    // 4) Packing bags (unless "without packing").
    if (!withoutPacking) {
      for (const p of packing) {
        await new sql.Request(tx)
          .input("InvoiceCode", sql.Int, invoiceCode)
          .input("BagNo", sql.Int, toInt(p.BagNo))
          .input("BagCode", sql.Int, toInt(p.BagCode))
          .input("CountTypeCode", sql.Int, toInt(p.CountTypeCode))
          .input("SOCode", sql.Int, toInt(p.SOCode))
          .input("SODNo", sql.Int, toInt(p.SODNo))
          .input("CompanyCode", sql.Int, companyCode)
          .execute("sp_PackingBag_Insert");
      }
    }

    await tx.commit();
    return sendSuccess(res, { InvoiceCode: invoiceCode, BillNo: toInt(b.BillNo), strBillNo: str(b.strBillNo).trim() });
  } catch (err) {
    if (tx) await tx.rollback().catch(() => {});
    console.error("DB Error (InvoiceFull.create):", err);
    return sendError(res, err);
  }
};

// DELETE /yarn-invoice-full/:invoiceCode — remove an invoice (sp_Invoice_Delete).
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const invoiceCode = toInt(req.params.invoiceCode);
    if (invoiceCode <= 0) return sendError(res, "Invalid InvoiceCode", 400);
    await pool
      .request()
      .input("InvoiceCode", sql.Int, invoiceCode)
      .input("Del_User", sql.Int, getUserId(req))
      .input("Del_Node", sql.Int, getNodeCode(req))
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_Invoice_Delete");
    return sendSuccess(res, { deleted: invoiceCode });
  } catch (err) {
    console.error("DB Error (InvoiceFull.remove):", err);
    // FK-guard friendly message (invoice referenced elsewhere).
    const msg = str(err?.message);
    if (/REFERENCE|conflict|FK_/i.test(msg)) {
      return sendError(res, "This invoice is already used elsewhere and cannot be deleted.", 409);
    }
    return sendError(res, err);
  }
};
