import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Purchase Order (port of the WinForms frmPurchaseOrder / frmPurchaseAdviceDetails).
//   A stores purchase-order transaction built from pending item requisitions:
//   pick header (Supplier / Purchase Type / Mode / Despatch / Transporter ...),
//   pull pending requisition lines, set Qty/Rate/Discount per line, then save.
//
//   - Options : purchase modes / types / suppliers / despatch / transporters /
//               currencies / taxes + the company's StateCode (for GST split).
//   - Pending : sp_PurchaseAdvice_PendingItemRequisition (the requisition picker).
//   - Next no : sp_PurchaseOrder_PurchaseOrderNo.
//   - List    : sp_PurchaseOrder_GetAll (@Direct = 0).
//   - One     : sp_PurchaseOrderDetails_GetAll (header row0 + detail rows).
//   - Save    : sp_PurchaseOrder_AddEdit (ExecuteScalar -> code) then
//               sp_PurchaseOrderDetails_Edit_Delete + loop sp_PurchaseOrderDetails_Insert,
//               then the PO approval-stage updates per tbl_Setting flags.
//   - Delete  : blocked when approved or already received, else sp_PurchaseOrder_Delete.
//
//   GST / PF / Other-Expense / TCS distribution and all totals are recomputed
//   SERVER-SIDE (the client values are only a preview) — mirrors the VB math.
//
// Company from req.headers.companyCode, FY from req.headers.FYCode; AddEdit also
// needs @User / @Node from req.headers.userId / nodeCode.
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
const r3 = (v) => Math.round((toNum(v) + Number.EPSILON) * 1000) / 1000;
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getFYCode = (req) => toInt(req.headers.FYCode);
const D = (v) => (v ? new Date(v) : null);

const scalar = async (request, proc) => {
  const r = await request.execute(proc);
  const row = r.recordset?.[0];
  return row ? toInt(Object.values(row)[0]) : 0;
};

// GET /purchase-order/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    const [modes, types, suppliers, despatch, transporters, currencies, taxes, company] =
      await Promise.all([
        pool.request().query("SELECT PurchaseModeCode, PurchaseMode from tbl_PurchaseMode Order by PurchaseMode"),
        pool.request().query("SELECT PurchaseTypeCode, PurchaseType from tbl_PurchaseType Order by PurchaseType"),
        pool
          .request()
          .query("Select SupplierCode, SupplierName, StateCode, GSTNo from tbl_Supplier where Status = 1 AND Stores = 1 Order By SupplierName"),
        pool.request().execute("sp_ModeOfDespatch_GetAll"),
        pool.request().execute("sp_Transporter_GetAll"),
        pool.request().query("Select CurrencyCode, CurrencyName, ShortName from tbl_Currency"),
        pool.request().query("Select TaxCode, TaxName, Tax from tbl_Tax ORDER BY TaxName"),
        pool.request().input("CompanyCode", sql.Int, companyCode).query("Select StateCode from tbl_Company Where CompanyCode = @CompanyCode"),
      ]);

    return sendSuccess(res, {
      purchaseModes: modes.recordset.map((r) => ({ value: r.PurchaseModeCode, label: r.PurchaseMode })),
      purchaseTypes: types.recordset.map((r) => ({ value: r.PurchaseTypeCode, label: r.PurchaseType })),
      suppliers: suppliers.recordset.map((r) => ({
        value: r.SupplierCode,
        label: r.SupplierName,
        StateCode: toInt(r.StateCode),
        GSTNo: r.GSTNo ?? "",
      })),
      modesOfDespatch: despatch.recordset.map((r) => ({ value: r.ModeOfDespatchCode, label: r.ModeOfDespatchName })),
      transporters: transporters.recordset.map((r) => ({ value: r.TransporterCode, label: r.TransporterName })),
      currencies: currencies.recordset.map((r) => ({ value: r.CurrencyCode, label: r.ShortName ?? r.CurrencyName })),
      taxes: taxes.recordset.map((r) => ({ value: r.TaxCode, label: r.TaxName, tax: toNum(r.Tax) })),
      companyStateCode: toInt(company.recordset?.[0]?.StateCode),
    });
  } catch (err) {
    console.error("DB Error (PurchaseOrder.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /purchase-order/next-no
export const getNextNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const no = await scalar(
      pool.request().input("CompanyCode", sql.Int, getCompanyCode(req)).input("FYCode", sql.Int, getFYCode(req)),
      "sp_PurchaseOrder_PurchaseOrderNo"
    );
    return sendSuccess(res, { no });
  } catch (err) {
    console.error("DB Error (PurchaseOrder.getNextNo):", err);
    return sendError(res, err);
  }
};

// GET /purchase-order/pending  -> pending item requisition lines (the picker grid)
export const getPending = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_PurchaseAdvice_PendingItemRequisition");
    const recs = result.recordset || [];

    // Per-item tax (TaxCode / TaxName / Tax) — batch from vw_Item for the items present.
    const itemCodes = [...new Set(recs.map((r) => toInt(r.ItemCode)).filter((c) => c > 0))];
    const taxByItem = {};
    if (itemCodes.length) {
      const tx = await pool
        .request()
        .query(`Select ItemCode, TaxCode, TaxName, Tax from vw_Item where ItemCode in (${itemCodes.join(",")})`);
      for (const t of tx.recordset || []) {
        taxByItem[toInt(t.ItemCode)] = { TaxCode: toInt(t.TaxCode), TaxName: t.TaxName ?? "", Tax: toNum(t.Tax) };
      }
    }

    const rows = recs.map((r, i) => {
      const it = taxByItem[toInt(r.ItemCode)] || { TaxCode: 0, TaxName: "", Tax: 0 };
      return {
        id: `${toInt(r.ItemRequisitionCode)}-${toInt(r.ItemCode)}-${i}`,
        ItemRequisitionCode: toInt(r.ItemRequisitionCode),
        ItemRequisitionNo: r.ItemRequisitionNo ?? "",
        ItemRequisitionDate: r.ItemRequisitionDate,
        CostHeadCode: toInt(r.CostHeadCode),
        CostHeadName: r.CostHeadName ?? "",
        DepartmentCode: toInt(r.DepartmentCode),
        DepartmentName: r.DepartmentName ?? "",
        EmployeeCode: toInt(r.EmployeeCode),
        EmployeeName: r.EmployeeName ?? "",
        MachineCode: toInt(r.MachineCode),
        MachineName: r.MachineName ?? "",
        ItemCode: toInt(r.ItemCode),
        ItemName: r.ItemName ?? "",
        ItemID: r.ItemID ?? "",
        DrawingNo: r.DrawingNo ?? "",
        CatalogueNo: r.CatalogueNo ?? "",
        PartNumber: r.PartNumber ?? "",
        Reason: (r.Remarks1 ?? "").toString().trim(),
        CommittedDate: r.CommittedDate,
        Qty: toNum(r.PendQty),
        Rate: toNum(r.Rate),
        LastPurRate: toNum(r.LastPurRate),
        LastPurDate: r.LastPurDate ?? null,
        LastPurSupplier: r.SupplierName ?? "",
        TaxCode: it.TaxCode,
        TaxName: it.TaxName,
        Tax: it.Tax,
      };
    });
    return sendPaginated(res, rows, { page: req.query.page, pageSize: req.query.pageSize || 1000 });
  } catch (err) {
    console.error("DB Error (PurchaseOrder.getPending):", err);
    return sendError(res, err);
  }
};

// GET /purchase-order/lists
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("Direct", sql.Int, 0)
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("FYCode", sql.Int, getFYCode(req))
      .execute("sp_PurchaseOrder_GetAll");
    const data = (result.recordset || [])
      .map((r) => ({ ...r, id: r.PurchaseOrderCode }))
      .sort((a, b) => Number(b.PurchaseOrderCode) - Number(a.PurchaseOrderCode));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (PurchaseOrder.getList):", err);
    return sendError(res, err);
  }
};

// GET /purchase-order/list/:code -> header + detail rows
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = parseInt(req.params.code);
    if (!code) return sendError(res, "Invalid PurchaseOrderCode", 400);
    const pool = await getPool(req.headers.subdbname);

    const det = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("PurchaseOrderCode", sql.Int, code)
      .execute("sp_PurchaseOrderDetails_GetAll");
    const recs = det.recordset || [];
    if (!recs.length) return sendError(res, "Purchase Order not found", 404);

    const h = recs[0];
    return sendSuccess(res, {
      PurchaseOrderCode: toInt(h.PurchaseOrderCode),
      PurchaseOrderNo: toInt(h.PurchaseOrderNo),
      PurchaseOrderDate: h.PurchaseOrderDate,
      DeliveryDate: h.DeliveryDate,
      PurchaseModeCode: toInt(h.PurchaseModeCode),
      PurchaseTypeCode: toInt(h.PurchaseTypeCode),
      SupplierCode: toInt(h.SupplierCode),
      ModeOfDespatchCode: toInt(h.ModeOfDespatchCode),
      TransporterCode: toInt(h.TransporterCode),
      CurrencyCode: toInt(h.CurrencyCode),
      Import: toInt(h.Import) === 1,
      RefNo: (h.RefNo ?? "").toString().trim(),
      Warrenty: (h.Warrenty ?? "").toString().trim(),
      SpecialTerms: (h.SpecialTerms ?? "").toString().trim(),
      ChequeNo: (h.ChequeNo ?? "").toString().trim(),
      PFPer: toNum(h.TotalPFPer),
      TotalPFAmount: toNum(h.TotalPFAmount),
      TotalOtherExpenses: toNum(h.TotalOtherExpenses),
      TotalTCSAmount: toNum(h.TotalTCSAmount),
      Remarks: (h.Remarks ?? "").toString().trim(),
      details: recs.map((r) => ({
        ItemRequisitionCode: toInt(r.ItemRequisitionCode),
        ItemRequisitionNo: r.ItemRequisitionNo ?? "",
        CostHeadCode: toInt(r.CostHeadCode),
        CostHeadName: r.CostHeadName ?? "",
        DepartmentCode: toInt(r.DepartmentCode),
        DepartmentName: r.DepartmentName ?? "",
        MachineCode: toInt(r.MachineCode),
        MachineName: r.MachineName ?? "",
        EmployeeCode: toInt(r.EmployeeCode),
        EmployeeName: r.EmployeeName ?? "",
        ItemCode: toInt(r.ItemCode),
        ItemName: r.ItemName ?? "",
        ItemID: r.ItemID ?? "",
        PartNumber: r.PartNumber ?? "",
        DrawingNo: r.DrawingNo ?? "",
        CatalogueNo: r.CatalogueNo ?? "",
        ItemUomCode: toInt(r.ItemUomCode),
        ItemUomName: r.ItemUomName ?? "",
        Qty: toNum(r.Qty),
        Rate: toNum(r.Rate),
        DiscountPer: toNum(r.DiscountPer),
        DiscountPerRate: toNum(r.DiscountPerRate),
        TaxCode: toInt(r.TaxCode),
        TaxName: r.TaxName ?? "",
        Tax: toNum(r.CGSTPer) + toNum(r.SGSTPer) + toNum(r.IGSTPer),
        CGSTPer: toNum(r.CGSTPer),
        SGSTPer: toNum(r.SGSTPer),
        IGSTPer: toNum(r.IGSTPer),
        Reason: (r.Reason ?? "").toString().trim(),
        CommittedDate: r.CommittedDate,
      })),
    });
  } catch (err) {
    console.error("DB Error (PurchaseOrder.getById):", err);
    return sendError(res, err);
  }
};

// Recompute every per-row amount + the header totals, mirroring the VB math.
// `supplierLocal` = supplier StateCode === company StateCode (CGST/SGST) else IGST.
// `taxByCode` maps TaxCode -> tax % (from tbl_Tax). Header carries PFPer / TotalPFAmount
// / TotalOtherExpenses / TotalTCSAmount.
const computeTotals = (details, header, supplierLocal, taxByCode) => {
  const pfPer = toNum(header.PFPer);
  const totalPFAmount = toNum(header.TotalPFAmount);
  const totalOtherExpenses = toNum(header.TotalOtherExpenses);
  const totalTCSAmount = toNum(header.TotalTCSAmount);

  // Pass 1 — Amount + DiscountAmount.
  const rows = details.map((d) => {
    const qty = toNum(d.Qty);
    const rate = toNum(d.Rate);
    const amount = r2(qty * rate);
    const discountPer = toNum(d.DiscountPer);
    const discountPerRate = toNum(d.DiscountPerRate);
    let discountAmount = 0;
    if (discountPer > 0) discountAmount = r2(amount * (discountPer / 100));
    else if (discountPerRate > 0) discountAmount = r2(discountPerRate * qty);
    return { ...d, qty, rate, amount, discountPer, discountPerRate, discountAmount };
  });

  const totalAmount = r2(rows.reduce((s, r) => s + r.amount, 0));
  const totalDiscountAmount = r2(rows.reduce((s, r) => s + r.discountAmount, 0));
  const baseNet = totalAmount - totalDiscountAmount;

  // Pass 2 — distributed PF / Other Expenses / GST / TCS / Net.
  let sumGross = 0,
    sumCGST = 0,
    sumSGST = 0,
    sumIGST = 0,
    sumPF = 0,
    sumNet = 0;

  const computed = rows.map((r) => {
    let pfAmount = 0;
    if (pfPer > 0) pfAmount = r3((r.amount - r.discountAmount) * (pfPer / 100));
    else if (totalPFAmount > 0 && baseNet > 0)
      pfAmount = r3((totalPFAmount / baseNet) * (r.amount - r.discountAmount));

    const otherExpenses =
      totalOtherExpenses > 0 && totalAmount > 0 ? r3((totalOtherExpenses / totalAmount) * r.amount) : 0;

    const grossAmount = r2(r.amount + pfAmount + otherExpenses - r.discountAmount);

    const tax = toNum(taxByCode[r.TaxCode]);
    const cgstPer = supplierLocal ? tax / 2 : 0;
    const sgstPer = cgstPer;
    const igstPer = supplierLocal ? 0 : tax;
    const cgstAmount = r2(grossAmount * (cgstPer / 100));
    const sgstAmount = r2(grossAmount * (sgstPer / 100));
    const igstAmount = r2(grossAmount * (igstPer / 100));

    const tcsAmount =
      totalTCSAmount !== 0 && totalAmount > 0 ? Math.round((totalTCSAmount / totalAmount) * r.amount * 10000) / 10000 : 0;

    const netAmount = r2(grossAmount + cgstAmount + sgstAmount + igstAmount + tcsAmount);

    sumGross += grossAmount;
    sumCGST += cgstAmount;
    sumSGST += sgstAmount;
    sumIGST += igstAmount;
    sumPF += pfAmount;
    sumNet += netAmount;

    return {
      ...r,
      pfPer: pfPer > 0 ? pfPer : 0,
      pfAmount,
      otherExpenses,
      grossAmount,
      cgstPer,
      sgstPer,
      igstPer,
      cgstAmount,
      sgstAmount,
      igstAmount,
      tcsAmount,
      netAmount,
    };
  });

  const totalGrossAmount = r2(sumGross);
  const totalCGSTAmount = r2(sumCGST);
  const totalSGSTAmount = r2(sumSGST);
  const totalIGSTAmount = r2(sumIGST);
  const totalPFAmountCalc = r3(sumPF);
  const totalTaxAmount = r2(totalCGSTAmount + totalSGSTAmount + totalIGSTAmount);
  const net = r2(sumNet);
  const totalRoundedOff = r2(Math.trunc(net + 0.5) - net);
  const totalNetAmount = r2(net + totalRoundedOff);
  const totalQty = r3(rows.reduce((s, r) => s + r.qty, 0));

  return {
    rows: computed,
    totals: {
      totalQty,
      totalAmount,
      totalDiscountAmount,
      totalGrossAmount,
      totalPFAmount: totalPFAmountCalc,
      totalOtherExpenses,
      totalCGSTAmount,
      totalSGSTAmount,
      totalIGSTAmount,
      totalTCSAmount,
      totalTaxAmount,
      totalRoundedOff,
      totalNetAmount,
      totalCGSTPer: totalGrossAmount > 0 ? r2((totalCGSTAmount / totalGrossAmount) * 100) : 0,
      totalSGSTPer: totalGrossAmount > 0 ? r2((totalSGSTAmount / totalGrossAmount) * 100) : 0,
      totalIGSTPer: totalGrossAmount > 0 ? r2((totalIGSTAmount / totalGrossAmount) * 100) : 0,
    },
  };
};

const saveOrUpdate = async (req, res, isEdit) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode) return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const companyCode = getCompanyCode(req);
    const fyCode = getFYCode(req);
    if (companyCode <= 0) return sendError(res, "You are logged into a group of companies — select a single company", 400);
    const code = isEdit ? parseInt(req.params.code) : 0;
    const b = req.body || {};

    // Header validations (mirror btnSave_Click).
    if (toInt(b.PurchaseTypeCode) <= 0) return sendError(res, "Select the Purchase Type", 400);
    if (toInt(b.PurchaseModeCode) <= 0) return sendError(res, "Select the Purchase Mode", 400);
    if (toInt(b.SupplierCode) <= 0) return sendError(res, "Select the Supplier Name", 400);
    if (toInt(b.ModeOfDespatchCode) <= 0) return sendError(res, "Select the Mode Of Despatch", 400);
    if (toInt(b.TransporterCode) <= 0) return sendError(res, "Select the Transporter", 400);

    const details = (Array.isArray(b.details) ? b.details : []).filter((d) => toNum(d.Qty) > 0);
    if (!details.length) return sendError(res, "Add at least one item", 400);
    for (const d of details) {
      if (toNum(d.Rate) <= 0) return sendError(res, "Enter the Rate for every item", 400);
    }
    // Duplicate Item + Machine + Reason guard.
    const seen = new Set();
    for (const d of details) {
      const key = `${toInt(d.ItemCode)}|${toInt(d.MachineCode)}|${(d.Reason || "").toString().trim().toLowerCase()}`;
      if (seen.has(key)) return sendError(res, "Duplicate Item Name, Machine and Reason found!", 400);
      seen.add(key);
    }

    const pool = await getPool(req.headers.subdbname);

    // Supplier vs company state -> local (CGST/SGST) or other-state (IGST).
    const [supState, compState, taxRows] = await Promise.all([
      pool.request().input("SupplierCode", sql.Int, toInt(b.SupplierCode)).query("Select StateCode from tbl_Supplier Where SupplierCode = @SupplierCode"),
      pool.request().input("CompanyCode", sql.Int, companyCode).query("Select StateCode from tbl_Company Where CompanyCode = @CompanyCode"),
      pool.request().query("Select TaxCode, Tax from tbl_Tax"),
    ]);
    const supplierLocal = toInt(supState.recordset?.[0]?.StateCode) === toInt(compState.recordset?.[0]?.StateCode);
    const taxByCode = {};
    for (const t of taxRows.recordset || []) taxByCode[toInt(t.TaxCode)] = toNum(t.Tax);

    const { rows, totals } = computeTotals(details, b, supplierLocal, taxByCode);

    if (totals.totalNetAmount <= 0) return sendError(res, "Net Amount cannot be negative or zero", 400);
    if (totals.totalRoundedOff > 1) return sendError(res, "Check the Rounded Off", 400);

    const poDate = D(b.PurchaseOrderDate) || new Date();
    const deliveryDate = D(b.DeliveryDate) || poDate;

    const poNo = isEdit
      ? toInt(b.PurchaseOrderNo)
      : await scalar(
          pool.request().input("CompanyCode", sql.Int, companyCode).input("FYCode", sql.Int, fyCode),
          "sp_PurchaseOrder_PurchaseOrderNo"
        );

    tx = new sql.Transaction(pool);
    await tx.begin();

    const head = new sql.Request(tx);
    if (isEdit && code) head.input("PurchaseOrderCode", sql.Int, code);
    head.input("PurchaseOrderDate", sql.DateTime, poDate);
    head.input("PurchaseOrderNo", sql.Int, poNo);
    head.input("Import", sql.Int, b.Import ? 1 : 0);
    head.input("CurrencyCode", sql.Int, toInt(b.CurrencyCode) || 1);
    head.input("PurchaseModeCode", sql.Int, toInt(b.PurchaseModeCode));
    head.input("PurchaseTypeCode", sql.Int, toInt(b.PurchaseTypeCode));
    head.input("SupplierCode", sql.Int, toInt(b.SupplierCode));
    head.input("TotalQty", sql.Decimal(18, 3), totals.totalQty);
    head.input("TotalAmount", sql.Decimal(18, 2), totals.totalAmount);
    head.input("TotalDiscountper", sql.Decimal(18, 2), 0);
    head.input("TotalDiscountAmount", sql.Decimal(18, 2), totals.totalDiscountAmount);
    head.input("TotalGrossAmount", sql.Decimal(18, 2), totals.totalGrossAmount);
    head.input("TotalTaxPer", sql.Decimal(18, 2), 0);
    head.input("TotalTaxAmount", sql.Decimal(18, 2), totals.totalTaxAmount);
    head.input("TotalCSTPer", sql.Decimal(18, 2), 0);
    head.input("TotalCSTAmount", sql.Decimal(18, 2), 0);
    head.input("TotalPFPer", sql.Decimal(18, 2), toNum(b.PFPer));
    head.input("TotalPFAmount", sql.Decimal(18, 2), totals.totalPFAmount);
    head.input("TotalCGSTAmount", sql.Decimal(18, 2), totals.totalCGSTAmount);
    head.input("TotalCGSTPer", sql.Decimal(18, 2), totals.totalCGSTPer);
    head.input("TotalSGSTAmount", sql.Decimal(18, 2), totals.totalSGSTAmount);
    head.input("TotalSGSTPer", sql.Decimal(18, 2), totals.totalSGSTPer);
    head.input("TotalIGSTAmount", sql.Decimal(18, 2), totals.totalIGSTAmount);
    head.input("TotalIGSTPer", sql.Decimal(18, 2), totals.totalIGSTPer);
    head.input("TotalOtherExpenses", sql.Decimal(18, 2), totals.totalOtherExpenses);
    head.input("TotalTCSAmount", sql.Decimal(18, 2), totals.totalTCSAmount);
    head.input("TotalRoundedOff", sql.Decimal(18, 2), totals.totalRoundedOff);
    head.input("TotalNetAmount", sql.Decimal(18, 2), totals.totalNetAmount);
    head.input("Remarks", sql.NVarChar, (b.Remarks || "").toString().trim());
    head.input("RefNo", sql.NVarChar, (b.RefNo || "").toString().trim());
    head.input("FYCode", sql.Int, fyCode);
    head.input("CompanyCode", sql.Int, companyCode);
    head.input("User", sql.Int, parseInt(userId));
    head.input("Node", sql.Int, parseInt(nodeCode));
    head.input("ChequeNo", sql.NVarChar, (b.ChequeNo || "").toString().trim());
    head.input("ModeOfDespatchCode", sql.Int, toInt(b.ModeOfDespatchCode));
    head.input("TransporterCode", sql.Int, toInt(b.TransporterCode));
    head.input("SpecialTerms", sql.NVarChar, (b.SpecialTerms || "").toString().trim());
    head.input("Warrenty", sql.NVarChar, (b.Warrenty || "").toString().trim());
    head.input("DeliveryDate", sql.DateTime, deliveryDate);
    if (toInt(b.PaymentCode) > 0) head.input("PaymentCode", sql.Int, toInt(b.PaymentCode));
    const purchaseOrderCode = await scalar(head, "sp_PurchaseOrder_AddEdit");

    await new sql.Request(tx)
      .input("PurchaseOrderCode", sql.Int, purchaseOrderCode)
      .execute("sp_PurchaseOrderDetails_Edit_Delete");

    let sno = 0;
    for (const r of rows) {
      sno += 1;
      await new sql.Request(tx)
        .input("PurchaseOrderCode", sql.Int, purchaseOrderCode)
        .input("SNo", sql.Int, sno)
        .input("ItemRequisitionCode", sql.Int, toInt(r.ItemRequisitionCode))
        .input("CostHeadCode", sql.Int, toInt(r.CostHeadCode))
        .input("DepartmentCode", sql.Int, toInt(r.DepartmentCode))
        .input("EmployeeCode", sql.Int, toInt(r.EmployeeCode))
        .input("ItemCode", sql.Int, toInt(r.ItemCode))
        .input("Qty", sql.Decimal(18, 3), r.qty)
        .input("Rate", sql.Decimal(18, 4), r.rate)
        .input("Amount", sql.Decimal(18, 2), r.amount)
        .input("DiscountPer", sql.Decimal(18, 2), r.discountPer)
        .input("DiscountPerRate", sql.Decimal(18, 2), r.discountPerRate)
        .input("DiscountAmount", sql.Decimal(18, 2), r.discountAmount)
        .input("GrossAmount", sql.Decimal(18, 2), r.grossAmount)
        .input("TaxPer", sql.Decimal(18, 2), 0)
        .input("TaxAmount", sql.Decimal(18, 2), 0)
        .input("CSTPer", sql.Decimal(18, 2), 0)
        .input("CSTAmount", sql.Decimal(18, 2), 0)
        .input("CGSTPer", sql.Decimal(18, 2), r.cgstPer)
        .input("CGSTAmount", sql.Decimal(18, 2), r.cgstAmount)
        .input("SGSTPer", sql.Decimal(18, 2), r.sgstPer)
        .input("SGSTAmount", sql.Decimal(18, 2), r.sgstAmount)
        .input("IGSTPer", sql.Decimal(18, 2), r.igstPer)
        .input("IGSTAmount", sql.Decimal(18, 2), r.igstAmount)
        .input("OtherExpenses", sql.Decimal(18, 2), r.otherExpenses)
        .input("RoundedOff", sql.Decimal(18, 2), 0)
        .input("NetAmount", sql.Decimal(18, 2), r.netAmount)
        .input("Reason", sql.NVarChar, (r.Reason || "").toString().trim())
        .input("CompanyCode", sql.Int, companyCode)
        .input("PFPer", sql.Decimal(18, 2), r.pfPer)
        .input("PFAmount", sql.Decimal(18, 3), r.pfAmount)
        .input("TCSAmount", sql.Decimal(18, 4), r.tcsAmount)
        .input("TaxCode", sql.Int, toInt(r.TaxCode))
        .input("AdvancePer", sql.Decimal(18, 2), 0)
        .input("MachineCode", sql.Int, toInt(r.MachineCode))
        .execute("sp_PurchaseOrderDetails_Insert");
    }

    // Auto-approval stages per tbl_Setting (SettingCode = 1).
    const setting = await new sql.Request(tx).query("Select * from tbl_Setting Where SettingCode = 1");
    const s = setting.recordset?.[0] || {};
    const runApproval = async (proc) =>
      new sql.Request(tx)
        .input("PurchaseOrderCode", sql.Int, purchaseOrderCode)
        .input("UserCode", sql.Int, parseInt(userId))
        .input("NodeCode", sql.Int, parseInt(userId))
        .input("RejectReason", sql.NVarChar, "")
        .execute(proc);
    if (s.PO_Approval_1 === true || toInt(s.PO_Approval_1) === 1) await runApproval("sp_PurchaseOrder_Approval_1_Update");
    if (s.PO_Approval_2 === true || toInt(s.PO_Approval_2) === 1) await runApproval("sp_PurchaseOrder_Approval_2_Update");
    if (s.PO_Approval_3 === true || toInt(s.PO_Approval_3) === 1) await runApproval("sp_PurchaseOrder_Approval_3_Update");

    await tx.commit();
    return sendSuccess(
      res,
      { PurchaseOrderCode: purchaseOrderCode, PurchaseOrderNo: poNo },
      isEdit ? `The record is updated - Purchase Order No : ${poNo}` : `The record is saved - Purchase Order No : ${poNo}`,
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (tx) {
      try {
        await tx.rollback();
      } catch (_) {}
    }
    if (err.message && err.message.includes("UK_"))
      return sendError(res, "This Purchase Order already exists", 409);
    console.error("DB Error (saveOrUpdatePurchaseOrder):", err);
    return sendError(res, err);
  }
};

export const create = (req, res) => saveOrUpdate(req, res, false);
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /purchase-order/delete/:code
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = parseInt(req.params.code);
    if (!code) return sendError(res, "Invalid PurchaseOrderCode", 400);
    const pool = await getPool(req.headers.subdbname);

    const approved = await pool
      .request()
      .input("PurchaseOrderCode", sql.Int, code)
      .query("Select Top 1 Approve1 from vw_PurchaseOrderDetails where PurchaseOrderCode = @PurchaseOrderCode");
    if (approved.recordset.length && toInt(approved.recordset[0].Approve1) === 1)
      return sendError(res, "This Order is Already Approved, do not Delete", 409);

    const received = await pool
      .request()
      .input("PurchaseOrderCode", sql.Int, code)
      .query("Select Top 1 PurchaseOrderReceivedCode from vw_PurchaseOrderReceivedDetails where PurchaseOrderCode = @PurchaseOrderCode");
    if (received.recordset.length)
      return sendError(res, "This Order Generate to Inward, do not Delete", 409);

    await pool
      .request()
      .input("PurchaseOrderCode", sql.Int, code)
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_PurchaseOrder_Delete");
    return sendSuccess(res, { PurchaseOrderCode: code }, "The record is deleted");
  } catch (err) {
    if (err.message && err.message.includes("FK_"))
      return sendError(res, "You can not delete the Purchase Order", 409);
    console.error("DB Error (PurchaseOrder.remove):", err);
    return sendError(res, err);
  }
};
