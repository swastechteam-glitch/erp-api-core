import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";
import {
  getPurchaseModes,
  getPurchaseTypes,
  getTaxes,
  getSuppliers,
  getCompanyStateCode,
} from "../utils/masters.js";

// ---------------------------------------------------------------------------
// Inward / Purchase Order Received (port of the WinForms
// frmPurchaseOrderReceivedMultiPO entry + frmPurchaseOrderReceivedDetails list).
//
//   A GRN against approved-but-not-yet-received Purchase Orders: pick a supplier,
//   pull its pending PO lines, set Qty/Rate/Disc/Tax/PF/Other-Exp/TCS per line,
//   then save header + detail rows in ONE transaction.
//
//   - Options       : modes / types / taxes / cost-heads / departments /
//                     machines / employees / received-by / setting flags.
//   - Suppliers     : sp_PurchaseOrder_Pending (@CompanyCode, @Import) — only
//                     suppliers that have pending POs (Import-dependent).
//   - Pending lines : sp_PurchaseOrderDetails_Pending (@Import, @CompanyCode,
//                     @SupplierCode).
//   - Gate pendings : vw_GateEntryGoodsIn_Pendings (for the Gate Pass lookup).
//   - Next no       : sp_PurchaseOrderReceived_PurchaseOrderReceivedNo.
//   - List          : sp_PurchaseOrderReceived_GetAll (@FYCode, @CompanyCode).
//   - One           : sp_PurchaseOrderReceivedDetails_GetAll (header row0 + rows).
//   - Save          : sp_PurchaseOrderReceived_AddEdit (scalar -> code) ->
//                     [sp_PaymentDetails_Insert] -> sp_PurchaseOrderReceivedDetails_Delete
//                     -> loop sp_PurchaseOrderReceivedDetails_Insert.
//   - Delete        : sp_PurchaseOrderReceived_Delete.
//
//   All totals (Amount / Discount / PF / Other-Exp / GST CGST+SGST/IGST / TCS /
//   Net / Rounded-Off) are recomputed SERVER-SIDE — the client values are a
//   preview only. Mirrors the VB Cal_* / GridTotal math exactly.
//
// Company from req.headers.companyCode, FY from req.headers.FYCode; AddEdit also
// needs @User / @Node from req.headers.userId / nodeCode. SPs already exist in
// the DB and are reused as-is.
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};
const oneOf = (v) => (Array.isArray(v) ? (v.find((x) => x != null) ?? "") : v);
const r2 = (v) => Math.round((toNum(v) + Number.EPSILON) * 100) / 100;
const r3 = (v) => Math.round((toNum(v) + Number.EPSILON) * 1000) / 1000;
const r4 = (v) => Math.round((toNum(v) + Number.EPSILON) * 10000) / 10000;
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getFYCode = (req) => toInt(req.headers.FYCode);
const D = (v) => (v ? new Date(v) : null);
const str = (v) => (v ?? "").toString().trim();

const scalar = async (request, proc) => {
  const r = await request.execute(proc);
  const row = r.recordset?.[0];
  return row ? toInt(Object.values(row)[0]) : 0;
};

// ---------------------------------------------------------------------------
// Server mirror of the VB totals math (Cal_* + GridTotal + RND_Calc).
//   header: { chkPFPer, PFPer, TotalPFAmount, TotalOtherExpenses,
//             TotalTCSAmount, OtherChargesWithoutTax, chkRND, RoundedOff }
//   Each detail carries its own CGSTPer / IGSTPer (the inward keeps the PO line's
//   GST split; SGSTPer mirrors CGSTPer), unlike the supplier-state split used on
//   the Purchase Order screen.
// ---------------------------------------------------------------------------
const computeInwardTotals = (details, header) => {
  const headerPFPer = toNum(header.PFPer);
  const totalPFAmount = toNum(header.TotalPFAmount);
  const totalOtherExpenses = toNum(header.TotalOtherExpenses);
  const totalTCSAmount = toNum(header.TotalTCSAmount);
  const otherChargesWithoutTax = toNum(header.OtherChargesWithoutTax);
  // VB ChkTax: when ON (the default) GST is charged on Gross (incl. Other-Exp);
  // when OFF, GST is charged on (Amount + P&F − Discount), excluding Other-Exp.
  // With-PO never sends ChkTax → stays ON → Gross base (unchanged).
  const chkTax = header.ChkTax !== false;

  // Pass 1: per-line Amount + Discount, and their totals (the distribution base).
  const base = details.map((d) => {
    const qty = toNum(d.Qty);
    const rate = toNum(d.Rate);
    const amount = r2(qty * rate);
    const discountPer = toNum(d.DiscountPer);
    const discountPerRate = toNum(d.DiscountPerRate);
    let discountAmount = 0;
    if (discountPer > 0) discountAmount = r2(amount * (discountPer / 100));
    else if (discountPerRate > 0) discountAmount = r2(discountPerRate * qty);
    return { qty, amount, discountAmount };
  });

  const totalAmount = r2(base.reduce((s, r) => s + r.amount, 0));
  const totalDiscountAmount = r2(base.reduce((s, r) => s + r.discountAmount, 0));
  const baseNet = totalAmount - totalDiscountAmount;

  let sumGross = 0;
  let sumCGST = 0;
  let sumSGST = 0;
  let sumIGST = 0;
  let sumPF = 0;
  let sumOther = 0;
  let sumTCS = 0;
  let sumNet = 0;

  // Pass 2: distribute PF / Other-Exp / TCS, then Gross -> GST -> Net per line.
  const rows = details.map((d, i) => {
    const b = base[i];

    // P&F: a P&F % applies per line; else a flat P&F amount is distributed by
    // taxable base (mirrors the Purchase Order-Direct model — no toggle).
    let pfAmount = 0;
    if (headerPFPer > 0)
      pfAmount = r3((b.amount - b.discountAmount) * (headerPFPer / 100));
    else if (totalPFAmount > 0 && baseNet !== 0)
      pfAmount = r3((totalPFAmount / baseNet) * (b.amount - b.discountAmount));

    const otherExpenses =
      totalOtherExpenses > 0 && totalAmount > 0
        ? r3((totalOtherExpenses / totalAmount) * b.amount)
        : 0;

    const grossAmount = r2(b.amount + pfAmount + otherExpenses - b.discountAmount);

    // GST base follows ChkTax (Net still rolls up from Gross either way).
    const taxBase = chkTax
      ? grossAmount
      : r2(b.amount + pfAmount - b.discountAmount);

    const cgstPer = toNum(d.CGSTPer);
    const igstPer = toNum(d.IGSTPer);
    const sgstPer = cgstPer; // VB: SGSTPer = CGSTPer
    const cgstAmount = r2(taxBase * (cgstPer / 100));
    const sgstAmount = r2(taxBase * (sgstPer / 100));
    const igstAmount = r2(taxBase * (igstPer / 100));

    const tcsAmount =
      totalTCSAmount > 0 && totalAmount > 0
        ? r4((totalTCSAmount / totalAmount) * b.amount)
        : 0;

    const netAmount = r2(
      grossAmount + cgstAmount + sgstAmount + igstAmount + tcsAmount,
    );

    sumGross += grossAmount;
    sumCGST += cgstAmount;
    sumSGST += sgstAmount;
    sumIGST += igstAmount;
    sumPF += pfAmount;
    sumOther += otherExpenses;
    sumTCS += tcsAmount;
    sumNet += netAmount;

    return {
      amount: b.amount,
      discountAmount: b.discountAmount,
      pfAmount: r3(pfAmount),
      otherExpenses: r3(otherExpenses),
      grossAmount,
      cgstPer,
      sgstPer,
      igstPer,
      cgstAmount,
      sgstAmount,
      igstAmount,
      tcsAmount: r4(tcsAmount),
      netAmount,
    };
  });

  const totalGrossAmount = r2(sumGross);
  const totalCGSTAmount = r2(sumCGST);
  const totalSGSTAmount = r2(sumSGST);
  const totalIGSTAmount = r2(sumIGST);
  const totalTaxAmount = r2(totalCGSTAmount + totalSGSTAmount + totalIGSTAmount);

  // Net rolls in Other-Charges-Without-Tax at the document level (VB GridTotal).
  const netBeforeRound = r2(sumNet + otherChargesWithoutTax);
  const autoRoundedOff = r2(Math.trunc(netBeforeRound + 0.5) - netBeforeRound);
  // Rounded-Off: auto unless the user typed a manual value (mirrors Direct — the
  // empty field means "auto"). No toggle.
  const totalRoundedOff =
    header.RoundedOff === "" || header.RoundedOff == null
      ? autoRoundedOff
      : toNum(header.RoundedOff);
  const totalNetAmount = r2(netBeforeRound + totalRoundedOff);
  const totalQty = r3(base.reduce((s, r) => s + r.qty, 0));

  // Header GST % saved by the VB: ((ΣGST − TotalOtherExp)/Taxable)*100 (else 0).
  const pct = (amt) =>
    amt > 0 && totalGrossAmount > 0
      ? r2(((amt - totalOtherExpenses) / totalGrossAmount) * 100)
      : 0;

  return {
    rows,
    totals: {
      totalQty,
      totalAmount,
      totalDiscountAmount,
      totalPFAmount: r2(sumPF),
      totalOtherExpenses: r2(sumOther),
      totalGrossAmount,
      totalCGSTAmount,
      totalCGSTPer: pct(totalCGSTAmount),
      totalSGSTAmount,
      totalSGSTPer: pct(totalSGSTAmount),
      totalIGSTAmount,
      totalIGSTPer: pct(totalIGSTAmount),
      totalTaxAmount,
      totalTCSAmount: r2(sumTCS),
      totalRoundedOff,
      totalNetAmount,
    },
  };
};

// GET /inward/options — the static lookups the entry header + item panel need.
// (Suppliers are Import-dependent -> /inward/suppliers; gate pendings are
// supplier-dependent -> /inward/gate-pendings.)
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    const [
      purchaseModes,
      purchaseTypes,
      taxes,
      allSuppliers,
      costHeads,
      departments,
      machines,
      employees,
      receivedBy,
      settingRow,
    ] = await Promise.all([
      getPurchaseModes(pool),
      getPurchaseTypes(pool),
      getTaxes(pool),
      getSuppliers(pool, { usage: "stores" }),
      pool
        .request()
        .query(
          "Select CostHeadName, CostHeadCode from tbl_CostHead Where Status = 1 and CostHeadCode > 0 Order by CostHeadName",
        ),
      pool
        .request()
        .query(
          "Select DepartmentName_English as DepartmentName, DepartmentCode from tbl_Department Where Status = 1 Order by DepartmentName_English",
        ),
      pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .query(
          "select MachineName, MachineCode, DepartmentCode from tbl_Machine where Status = 1 AND CompanyCode = @CompanyCode Order by MachineName",
        ),
      pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .execute("sp_Store_Employee_Load"),
      pool
        .request()
        .query(
          "Select PurchaseReceivedByCode, PurchaseReceivedBy from tbl_PurchaseReceivedby Order by PurchaseReceivedByCode",
        ),
      pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .query(
          "Select TOP 1 ISNULL(StoreGRN_WithGateEntry,0) AS StoreGRN_WithGateEntry, ISNULL(StoreGRN_withImage,0) AS StoreGRN_withImage, ISNULL(PurchaseOrderReceived_Auto_Approval,0) AS PurchaseOrderReceived_Auto_Approval, ISNULL(PurchaseOrderReceived_Auto_Receipt_Approval,0) AS PurchaseOrderReceived_Auto_Receipt_Approval, ISNULL(PurchaseOrderReceived_Auto_Store_Approval,0) AS PurchaseOrderReceived_Auto_Store_Approval from tbl_Setting Where CompanyCode = @CompanyCode",
        ),
    ]);

    const s = settingRow.recordset?.[0] || {};
    const flag = (v) => v === true || toInt(v) === 1;
    // Company State — drives the intra/inter-state GST split on the Direct
    // (Without-PO) manual item entry. Harmless extra field for the with-PO screen.
    const companyStateCode = await getCompanyStateCode(pool, companyCode);

    return sendSuccess(res, {
      purchaseModes,
      purchaseTypes,
      taxes,
      companyStateCode: toInt(companyStateCode),
      // Full supplier master — used in EDIT mode (and as a fallback). Add mode
      // uses /inward/suppliers (only suppliers with pending POs).
      allSuppliers,
      costHeads: (costHeads.recordset || []).map((c) => ({
        value: c.CostHeadCode,
        label: c.CostHeadName,
      })),
      departments: (departments.recordset || []).map((d) => ({
        value: d.DepartmentCode,
        label: d.DepartmentName,
      })),
      machines: (machines.recordset || []).map((m) => ({
        value: m.MachineCode,
        label: oneOf(m.MachineName),
        DepartmentCode: toInt(m.DepartmentCode),
      })),
      employees: (employees.recordset || []).map((e) => ({
        value: e.EmployeeCode,
        label: e.EmployeeName ?? e.str_EmployeeID ?? e.EmployeeID,
        EmployeeID: e.EmployeeID ?? e.str_EmployeeID ?? "",
      })),
      receivedBy: (receivedBy.recordset || []).map((rb) => ({
        value: rb.PurchaseReceivedByCode,
        label: rb.PurchaseReceivedBy,
      })),
      // Payment-No lookup source is not bound in the WinForms entry; left empty
      // (optional/secondary — save still honours a paymentCode if supplied).
      paymentNos: [],
      settingFlags: {
        StoreGRN_WithGateEntry: flag(s.StoreGRN_WithGateEntry),
        StoreGRN_withImage: flag(s.StoreGRN_withImage),
        PurchaseOrderReceived_Auto_Approval: flag(
          s.PurchaseOrderReceived_Auto_Approval,
        ),
        PurchaseOrderReceived_Auto_Receipt_Approval: flag(
          s.PurchaseOrderReceived_Auto_Receipt_Approval,
        ),
        PurchaseOrderReceived_Auto_Store_Approval: flag(
          s.PurchaseOrderReceived_Auto_Store_Approval,
        ),
      },
    });
  } catch (err) {
    console.error("DB Error (Inward.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /inward/suppliers?import=0|1 — suppliers that have pending POs (Import flag
// switches the list). Mirrors cmbSupplierName.RecordSource(sp_PurchaseOrder_Pending).
export const getInwardSuppliers = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("Import", sql.Int, toInt(req.query.import) ? 1 : 0)
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_PurchaseOrder_Pending");
    // One row per pending PO (so the multi-column dropdown can show PO No / PO
    // Date / Supplier / GST No). Selecting a row binds its SupplierCode.
    const data = (result.recordset || []).map((r, i) => ({
      id: i,
      value: toInt(r.SupplierCode),
      label: r.SupplierName ?? "",
      SupplierName: r.SupplierName ?? "",
      PurchaseOrderNo: r.PurchaseOrderNo ?? "",
      PurchaseOrderDate: r.PurchaseOrderDate ?? null,
      GSTNo: r.GSTNo ?? r.GstNo ?? "",
      StateCode: toInt(r.StateCode),
    }));
    return sendSuccess(res, data);
  } catch (err) {
    console.error("DB Error (Inward.getInwardSuppliers):", err);
    return sendError(res, err);
  }
};

// GET /inward/pending?supplierCode=&import=0|1 — pending PO lines for the chosen
// supplier (the picker source). Mirrors sp_PurchaseOrderDetails_Pending.
export const getPending = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const supplierCode = toInt(req.query.supplierCode);
    if (supplierCode <= 0) return sendSuccess(res, []);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("Import", sql.Int, toInt(req.query.import) ? 1 : 0)
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("SupplierCode", sql.Int, supplierCode)
      .execute("sp_PurchaseOrderDetails_Pending");

    const rows = (result.recordset || []).map((r, i) => ({
      id: `${toInt(r.PurchaseOrderCode)}-${toInt(r.ItemCode)}-${i}`,
      PurchaseOrderCode: toInt(r.PurchaseOrderCode),
      PurchaseOrderNo: r.PurchaseOrderNo ?? "",
      PurchaseOrderDate: r.PurchaseOrderDate,
      CostHeadCode: toInt(r.CostHeadCode),
      CostHeadName: r.CostHeadName ?? "",
      DepartmentCode: toInt(r.DepartmentCode),
      DepartmentName: r.DepartmentName ?? "",
      MachineCode: toInt(r.MachineCode),
      EmployeeCode: toInt(r.EmployeeCode),
      EmployeeName: r.EmployeeName ?? "",
      ItemCode: toInt(r.ItemCode),
      ItemID: r.ItemID ?? "",
      ItemName: r.ItemName ?? "",
      DrawingNo: r.DrawingNo ?? "",
      CatalogueNo: r.CatalogueNo ?? "",
      PartNumber: r.PartNumber ?? "",
      Reason: str(r.Reason),
      Qty: toNum(r.PendingQty),
      Rate: toNum(r.Rate),
      DiscountPer: toNum(r.DiscountPer),
      DiscountPerRate: toNum(r.DiscountAmount_PerQty),
      TaxCode: toInt(r.TaxCode),
      TaxName: r.TaxName ?? "",
      TaxPer: toNum(r.TaxPer),
      CGSTPer: toNum(r.CGSTPer),
      SGSTPer: toNum(r.SGSTPer),
      IGSTPer: toNum(r.IGSTPer),
      PFPer: toNum(r.PFPer),
      TCSAmount: toNum(r.TCSAmount),
    }));
    return sendSuccess(res, rows);
  } catch (err) {
    console.error("DB Error (Inward.getPending):", err);
    return sendError(res, err);
  }
};

// GET /inward/gate-pendings?supplierCode= — Gate Pass lookup (vw_GateEntryGoodsIn_Pendings).
export const getGatePendings = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("SupplierCode", sql.Int, toInt(req.query.supplierCode))
      .query(
        "Select GoodsInPassCode, strGoodsPassNumber, GateInDate from vw_GateEntryGoodsIn_Pendings where CompanyCode = @CompanyCode AND SupplierCode = @SupplierCode",
      );
    const data = (result.recordset || []).map((r) => ({
      value: toInt(r.GoodsInPassCode),
      label: r.strGoodsPassNumber ?? "",
      GateInDate: r.GateInDate,
    }));
    return sendSuccess(res, data);
  } catch (err) {
    console.error("DB Error (Inward.getGatePendings):", err);
    return sendError(res, err);
  }
};

// GET /inward/next-no — sp_PurchaseOrderReceived_PurchaseOrderReceivedNo.
export const getNextNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const no = await scalar(
      pool
        .request()
        .input("CompanyCode", sql.Int, getCompanyCode(req))
        .input("FYCode", sql.Int, getFYCode(req)),
      "sp_PurchaseOrderReceived_PurchaseOrderReceivedNo",
    );
    return sendSuccess(res, { no });
  } catch (err) {
    console.error("DB Error (Inward.getNextNo):", err);
    return sendError(res, err);
  }
};

// GET /inward/lists — sp_PurchaseOrderReceived_GetAll, newest first, paginated +
// optional supplier filter.
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("FYCode", sql.Int, getFYCode(req))
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_PurchaseOrderReceived_GetAll");

    const supplierCode = toInt(req.query.supplierCode);
    let data = (result.recordset || []).map((r) => ({
      ...r,
      id: toInt(r.PurchaseOrderReceivedCode),
    }));
    if (supplierCode > 0)
      data = data.filter((r) => toInt(r.SupplierCode) === supplierCode);
    data.sort(
      (a, b) =>
        toInt(b.PurchaseOrderReceivedNo) - toInt(a.PurchaseOrderReceivedNo),
    );
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (Inward.getList):", err);
    return sendError(res, err);
  }
};

// GET /inward/list/:code — header + detail rows for the edit screen.
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = parseInt(req.params.code);
    if (!code) return sendError(res, "Invalid PurchaseOrderReceivedCode", 400);
    const pool = await getPool(req.headers.subdbname);

    const det = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("PurchaseOrderReceivedCode", sql.Int, code)
      .execute("sp_PurchaseOrderReceivedDetails_GetAll");
    const recs = det.recordset || [];
    if (!recs.length) return sendError(res, "Inward not found", 404);
    const h = recs[0];

    return sendSuccess(res, {
      PurchaseOrderReceivedCode: toInt(h.PurchaseOrderReceivedCode),
      PurchaseOrderReceivedNo: toInt(h.PurchaseOrderReceivedNo),
      PurchaseOrderReceivedDate: h.PurchaseOrderReceivedDate,
      SupplierCode: toInt(h.SupplierCode),
      SupplierName: h.SupplierName ?? "",
      PurchaseModeCode: toInt(h.PurchaseModeCode),
      PurchaseTypeCode: toInt(h.PurchaseTypeCode),
      PurchaseReceivedByCode: toInt(h.PurchaseReceivedByCode),
      InvoiceNo: str(h.InvoiceNo),
      InvoiceDate: h.InvoiceDate,
      DCNo: str(h.DCNo),
      DCDate: h.DCDate,
      ChequeNo: str(h.ChequeNo),
      GatePassNo: str(h.GatePassNo),
      GoodsInPassCode: toInt(h.GoodsInPassCode),
      TotalPFPer: toNum(h.TotalPFPer),
      TotalPFAmount: toNum(h.TotalPFAmount),
      TotalOtherExpenses: toNum(h.TotalOtherExpenses),
      TotalTCSAmount: toNum(h.TotalTCSAmount),
      OtherChargesWithoutTax: toNum(h.OtherChargesWithoutTax),
      TotalRoundedOff: toNum(h.TotalRoundedOff),
      TotalNetAmount: toNum(h.TotalNetAmount),
      Remarks: str(h.Remarks),
      details: recs.map((r) => ({
        PurchaseOrderCode: toInt(r.PurchaseOrderCode),
        PurchaseOrderNo: r.PurchaseOrderNo ?? "",
        PurchaseOrderDate: r.PurchaseOrderDate,
        CostHeadCode: toInt(r.CostHeadCode),
        CostHeadName: r.CostHeadName ?? "",
        DepartmentCode: toInt(r.DepartmentCode),
        DepartmentName: r.DepartmentName ?? "",
        MachineCode: toInt(r.MachineCode),
        EmployeeCode: toInt(r.EmployeeCode),
        EmployeeName: r.EmployeeName ?? "",
        ItemCode: toInt(r.ItemCode),
        ItemID: r.ItemID ?? "",
        ItemName: r.ItemName ?? "",
        PartNumber: r.PartNumber ?? "",
        Reason: str(r.Reason),
        Qty: toNum(r.Qty),
        Rate: toNum(r.Rate),
        DiscountPer: toNum(r.DiscountPer),
        DiscountPerRate: toNum(r.DiscountPerRate),
        TaxCode: toInt(r.TaxCode),
        TaxName: r.TaxName ?? "",
        TaxPer: toNum(r.TaxPer),
        CGSTPer: toNum(r.CGSTPer),
        SGSTPer: toNum(r.SGSTPer),
        IGSTPer: toNum(r.IGSTPer),
        PFPer: toNum(r.PFPer),
        TCSAmount: toNum(r.TCSAmount),
      })),
    });
  } catch (err) {
    console.error("DB Error (Inward.getById):", err);
    return sendError(res, err);
  }
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
    // Validation 1 + 12: a single company must be selected.
    if (companyCode <= 0)
      return sendError(
        res,
        "You are logged into a group of companies — select a single company",
        400,
      );
    const code = isEdit ? parseInt(req.params.code) : 0;
    const b = req.body || {};

    // --- Header validations (mirror btnSave_Click, in order) ---
    if (!D(b.PurchaseOrderReceivedDate))
      return sendError(res, "Inward Date is required", 400);
    if (toInt(b.SupplierCode) <= 0)
      return sendError(res, "Select the Supplier Name", 400);
    if (toInt(b.PurchaseReceivedByCode) <= 0)
      return sendError(res, "Select the Received By", 400);
    // The required text field (VB txtGatePassNo, UI label "Ref No.") -> @GatePassNo.
    if (str(b.GatePassNo).length <= 0)
      return sendError(res, "Enter the Ref No", 400);
    if (toInt(b.PurchaseModeCode) <= 0)
      return sendError(res, "Select the Purchase Mode", 400);
    if (toInt(b.PurchaseTypeCode) <= 0)
      return sendError(res, "Select the Purchase Type", 400);

    const poDate = D(b.PurchaseOrderReceivedDate);
    const invoiceDate = D(b.InvoiceDate);
    const dcDate = D(b.DCDate);
    if (str(b.InvoiceNo) && invoiceDate && invoiceDate < poDate)
      return sendError(
        res,
        "Please ensure that the Invoice Date is not Earlier than the Inward Date",
        400,
      );
    if (str(b.DCNo) && dcDate && dcDate < poDate)
      return sendError(
        res,
        "Please ensure that the DC Date is not Earlier than the Inward Date",
        400,
      );

    const details = Array.isArray(b.details) ? b.details : [];
    const totalAmountPreview = details.reduce(
      (s, d) => s + toNum(d.Qty) * toNum(d.Rate),
      0,
    );
    if (r2(totalAmountPreview) === 0)
      return sendError(res, "Amount Cannot be Empty", 400);
    for (const d of details) {
      if (toNum(d.Rate) <= 0) return sendError(res, "Enter the Rate", 400);
    }

    // Compute totals server-side (the client values are a preview only).
    const { rows, totals } = computeInwardTotals(details, b);

    // Validation 12: rounded-off must be <= 1 (a rounding remainder).
    if (totals.totalRoundedOff > 1)
      return sendError(res, "Check the Rounded Off", 400);

    // Validation 13: Party Bill Value must equal the Net Amount.
    if (r2(b.PartyBillValue) !== r2(totals.totalNetAmount))
      return sendError(
        res,
        "Check the GRN Net Amount AND Party Bill Value",
        400,
      );

    const pool = await getPool(req.headers.subdbname);

    // Read the GRN-with-gate-entry flag for this company.
    const withGateEntryRes = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .query(
        "Select TOP 1 ISNULL(StoreGRN_WithGateEntry,0) AS f from tbl_Setting Where CompanyCode = @CompanyCode",
      );
    const withGateEntry =
      toInt(withGateEntryRes.recordset?.[0]?.f) === 1 ||
      withGateEntryRes.recordset?.[0]?.f === true;

    // Validation 14: with gate entry -> pass selected + at least one item matches.
    if (withGateEntry) {
      if (toInt(b.GoodsInPassCode) <= 0)
        return sendError(res, "Select the Gate Pass No", 400);
      const gateItems = await pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("GoodsInPassCode", sql.Int, toInt(b.GoodsInPassCode))
        .query(
          "select ItemCode from tbl_GateEntryGoodsInDetails where CompanyCode = @CompanyCode AND GoodsInpassCode = @GoodsInPassCode",
        );
      const gateSet = new Set(
        (gateItems.recordset || []).map((g) => toInt(g.ItemCode)),
      );
      const matches =
        gateSet.size === 0 ||
        details.some((d) => gateSet.has(toInt(d.ItemCode)));
      if (!matches) return sendError(res, "Mismatch the Gate Pass No", 400);
    }

    // Validation 15: DC No OR Invoice No required.
    if (str(b.DCNo).length <= 0 && str(b.InvoiceNo).length <= 0)
      return sendError(res, "Enter the DC No (OR) Invoice No", 400);

    // Validation 16: new-entry-only duplicate checks (Invoice / DC / Gate Pass).
    if (!isEdit) {
      if (str(b.InvoiceNo)) {
        const dup = await pool
          .request()
          .input("CompanyCode", sql.Int, companyCode)
          .input("FYCode", sql.Int, fyCode)
          .input("SupplierCode", sql.Int, toInt(b.SupplierCode))
          .input("InvoiceNo", sql.NVarChar(100), str(b.InvoiceNo))
          .query(
            "Select InvoiceNo from tbl_PurchaseOrderReceived where CompanyCode = @CompanyCode AND FYCode = @FYCode AND SupplierCode = @SupplierCode AND InvoiceNo = @InvoiceNo",
          );
        if ((dup.recordset || []).length)
          return sendError(
            res,
            "Already Entered the Invoice No In Previous Entry",
            400,
          );
      }
      if (str(b.DCNo)) {
        const dup = await pool
          .request()
          .input("CompanyCode", sql.Int, companyCode)
          .input("FYCode", sql.Int, fyCode)
          .input("SupplierCode", sql.Int, toInt(b.SupplierCode))
          .input("DCNo", sql.NVarChar(100), str(b.DCNo))
          .query(
            "Select DCNo from tbl_PurchaseOrderReceived where CompanyCode = @CompanyCode AND FYCode = @FYCode AND SupplierCode = @SupplierCode AND DCNo = @DCNo",
          );
        if ((dup.recordset || []).length)
          return sendError(
            res,
            "Already Entered the DC No In Previous Entry",
            400,
          );
      }
      if (str(b.GatePassNo)) {
        const dup = await pool
          .request()
          .input("CompanyCode", sql.Int, companyCode)
          .input("GatePassNo", sql.NVarChar(100), str(b.GatePassNo))
          .query(
            "Select GatePassNo from tbl_PurchaseOrderReceived where CompanyCode = @CompanyCode AND GatePassNo = @GatePassNo",
          );
        if ((dup.recordset || []).length)
          return sendError(
            res,
            "Already Entered this Gate Pass No In Previous Entry",
            400,
          );
      }
    }

    // Validation 17: Total Qty > 0 and Net > 0.
    if (totals.totalQty <= 0) return sendError(res, "Drop the Item", 400);
    if (totals.totalNetAmount <= 0)
      return sendError(res, "Check the Net Amount", 400);

    // Auto-approval settings (global flags, mirror the VB existence checks).
    const [qcRes, receiptRes, storeRes] = await Promise.all([
      pool
        .request()
        .query(
          "Select TOP 1 1 AS f from tbl_Setting Where PurchaseOrderReceived_Auto_Approval = 1",
        ),
      pool
        .request()
        .query(
          "Select TOP 1 1 AS f from tbl_Setting Where PurchaseOrderReceived_Auto_Receipt_Approval = 1",
        ),
      pool
        .request()
        .query(
          "Select TOP 1 1 AS f from tbl_Setting Where PurchaseOrderReceived_Auto_Store_Approval = 1",
        ),
    ]);
    const autoQC = (qcRes.recordset || []).length > 0;
    const autoReceipt = (receiptRes.recordset || []).length > 0;
    const autoStore = (storeRes.recordset || []).length > 0;
    const now = new Date();

    // Inward number: edit keeps it; new generates it.
    const porNo = isEdit
      ? toInt(b.PurchaseOrderReceivedNo)
      : await scalar(
          pool
            .request()
            .input("CompanyCode", sql.Int, companyCode)
            .input("FYCode", sql.Int, fyCode),
          "sp_PurchaseOrderReceived_PurchaseOrderReceivedNo",
        );

    tx = new sql.Transaction(pool);
    await tx.begin();

    // --- 1) Header (sp_PurchaseOrderReceived_AddEdit -> scalar code) ---
    const head = new sql.Request(tx);
    if (isEdit && code)
      head.input("PurchaseOrderReceivedCode", sql.Int, code);
    head.input("PurchaseOrderReceivedDate", sql.DateTime, poDate);
    head.input("PurchaseOrderReceivedNo", sql.Int, porNo);
    head.input("PurchaseModeCode", sql.Int, toInt(b.PurchaseModeCode));
    head.input("PurchaseTypeCode", sql.Int, toInt(b.PurchaseTypeCode));
    head.input(
      "PurchaseReceivedByCode",
      sql.Int,
      toInt(b.PurchaseReceivedByCode),
    );
    if (str(b.DCNo)) head.input("DCNo", sql.NVarChar(100), str(b.DCNo));
    if (str(b.GatePassNo))
      head.input("GatePassNo", sql.NVarChar(100), str(b.GatePassNo));
    if (str(b.DCNo) && dcDate) head.input("DCDate", sql.DateTime, dcDate);
    if (str(b.InvoiceNo))
      head.input("InvoiceNo", sql.NVarChar(100), str(b.InvoiceNo));
    if (str(b.InvoiceNo) && invoiceDate)
      head.input("InvoiceDate", sql.DateTime, invoiceDate);
    head.input("SupplierCode", sql.Int, toInt(b.SupplierCode));
    if (toInt(b.GoodsInPassCode) > 0)
      head.input("GoodsInPassCode", sql.Int, toInt(b.GoodsInPassCode));
    head.input("TotalQty", sql.Decimal(18, 3), totals.totalQty);
    head.input("TotalAmount", sql.Decimal(18, 2), totals.totalAmount);
    head.input("TotalDiscountper", sql.Decimal(18, 2), 0);
    head.input(
      "TotalDiscountAmount",
      sql.Decimal(18, 2),
      totals.totalDiscountAmount,
    );
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
    head.input(
      "TotalOtherExpenses",
      sql.Decimal(18, 2),
      totals.totalOtherExpenses,
    );
    head.input("TotalRoundedOff", sql.Decimal(18, 2), totals.totalRoundedOff);
    head.input("TotalNetAmount", sql.Decimal(18, 2), totals.totalNetAmount);
    head.input("Remarks", sql.NVarChar(sql.MAX), str(b.Remarks));
    head.input("TotalTCSAmount", sql.Decimal(18, 2), totals.totalTCSAmount);
    head.input(
      "OtherChargesWithoutTax",
      sql.Decimal(18, 2),
      toNum(b.OtherChargesWithoutTax),
    );
    head.input("FYCode", sql.Int, fyCode);
    head.input("CompanyCode", sql.Int, companyCode);
    head.input("User", sql.Int, toInt(userId));
    head.input("Node", sql.Int, toInt(nodeCode));
    if (autoQC) {
      head.input("QCApproval", sql.Int, 1);
      head.input("QCApproval_Date", sql.DateTime, now);
      head.input("QCApproval_USER", sql.Int, toInt(userId));
      head.input("QCApproval_Node", sql.Int, toInt(nodeCode));
    }
    if (autoReceipt) {
      head.input("ReceiptApproval", sql.Int, 1);
      head.input("ReceiptApproval_Date", sql.DateTime, now);
      head.input("ReceiptApproval_USER", sql.Int, toInt(userId));
      head.input("ReceiptApproval_Node", sql.Int, toInt(nodeCode));
    }
    if (autoStore) {
      head.input("StoreApproval", sql.Int, 1);
      head.input("StoreApproval_Date", sql.DateTime, now);
      head.input("StoreApproval_USER", sql.Int, toInt(userId));
      head.input("StoreApproval_Node", sql.Int, toInt(nodeCode));
    }
    const porCode = await scalar(head, "sp_PurchaseOrderReceived_AddEdit");
    if (!porCode) throw new Error("Inward header save returned no code");

    // --- 2) Payment (optional) ---
    if (toInt(b.PaymentCode) > 0) {
      const advance = toNum(b.AdvanceAmount);
      const amount =
        totals.totalNetAmount > advance ? advance : totals.totalNetAmount;
      await new sql.Request(tx)
        .input("PaymentCode", sql.Int, toInt(b.PaymentCode))
        .input("RefType1", sql.NVarChar(50), "STORES")
        .input("RefCode", sql.Int, porCode)
        .input("Amount", sql.Decimal(18, 2), r2(amount))
        .input("AdjustmentAmount", sql.Decimal(18, 2), 0)
        .input("CompanyCode", sql.Int, companyCode)
        .execute("sp_PaymentDetails_Insert");
    }

    // --- 3) Clear existing detail rows ---
    await new sql.Request(tx)
      .input("PurchaseOrderReceivedCode", sql.Int, porCode)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_PurchaseOrderReceivedDetails_Delete");

    // --- 4) Insert detail rows ---
    let sno = 0;
    for (let i = 0; i < details.length; i += 1) {
      const d = details[i];
      const c = rows[i];
      sno += 1;
      const reqd = new sql.Request(tx);
      reqd.input("PurchaseOrderReceivedCode", sql.Int, porCode);
      reqd.input("SNo", sql.Int, sno);
      reqd.input("PurchaseOrderCode", sql.Int, toInt(d.PurchaseOrderCode));
      reqd.input("CostHeadCode", sql.Int, toInt(d.CostHeadCode));
      reqd.input("DepartmentCode", sql.Int, toInt(d.DepartmentCode));
      reqd.input("MachineCode", sql.Int, toInt(d.MachineCode));
      reqd.input("EmployeeCode", sql.Int, toInt(d.EmployeeCode));
      reqd.input("TaxCode", sql.Int, toInt(d.TaxCode));
      reqd.input("ItemCode", sql.Int, toInt(d.ItemCode));
      reqd.input("Qty", sql.Decimal(18, 3), toNum(d.Qty));
      reqd.input("Rate", sql.Decimal(18, 2), toNum(d.Rate));
      reqd.input("Amount", sql.Decimal(18, 2), c.amount);
      reqd.input("DiscountPer", sql.Decimal(18, 2), toNum(d.DiscountPer));
      reqd.input("DiscountAmount", sql.Decimal(18, 2), c.discountAmount);
      reqd.input("GrossAmount", sql.Decimal(18, 2), c.grossAmount);
      reqd.input("TaxPer", sql.Decimal(18, 2), toNum(d.TaxPer));
      reqd.input(
        "TaxAmount",
        sql.Decimal(18, 2),
        r2(c.cgstAmount + c.sgstAmount + c.igstAmount),
      );
      reqd.input("CSTPer", sql.Decimal(18, 2), 0);
      reqd.input("CSTAmount", sql.Decimal(18, 2), 0);
      reqd.input("CGSTPer", sql.Decimal(18, 2), c.cgstPer);
      reqd.input("CGSTAmount", sql.Decimal(18, 2), c.cgstAmount);
      reqd.input("SGSTPer", sql.Decimal(18, 2), c.sgstPer);
      reqd.input("SGSTAmount", sql.Decimal(18, 2), c.sgstAmount);
      reqd.input("IGSTPer", sql.Decimal(18, 2), c.igstPer);
      reqd.input("IGSTAmount", sql.Decimal(18, 2), c.igstAmount);
      reqd.input("PFPer", sql.Decimal(18, 2), toNum(d.PFPer));
      reqd.input("PFAmount", sql.Decimal(18, 3), c.pfAmount);
      reqd.input("OtherExpenses", sql.Decimal(18, 3), c.otherExpenses);
      reqd.input("RoundedOff", sql.Decimal(18, 2), 0);
      reqd.input("NetAmount", sql.Decimal(18, 2), c.netAmount);
      if (str(d.Reason))
        reqd.input("Reason", sql.NVarChar(sql.MAX), str(d.Reason));
      // Per-item goods image (base64 data URL -> binary), only when present.
      const img = d.GoodsImage;
      if (typeof img === "string" && img.startsWith("data:")) {
        const base64 = img.slice(img.indexOf(",") + 1);
        reqd.input("GoodsImage", sql.Image, Buffer.from(base64, "base64"));
      }
      reqd.input("CompanyCode", sql.Int, companyCode);
      reqd.input("TCSAmount", sql.Decimal(18, 2), c.tcsAmount);
      if (toInt(b.PaymentCode) > 0)
        reqd.input("PaymentCode", sql.Int, toInt(b.PaymentCode));
      await reqd.execute("sp_PurchaseOrderReceivedDetails_Insert");
    }

    // --- 5) Without-PO: mark this requisition's items received. Additive — the
    // with-PO screen never sends ItemRequisitionCode, so this is skipped there.
    const reqCode = toInt(b.ItemRequisitionCode);
    if (reqCode > 0) {
      const seenItems = new Set();
      for (const d of details) {
        const itemCode = toInt(d.ItemCode);
        if (itemCode <= 0 || seenItems.has(itemCode)) continue;
        seenItems.add(itemCode);
        await new sql.Request(tx)
          .input("ItemRequisitionCode", sql.Int, reqCode)
          .input("ItemCode", sql.Int, itemCode)
          .execute("sp_PurchaseOrderReceived_UpdateItemRequisition");
      }
    }

    await tx.commit();

    // Best-effort heartbeat (mirrors the VB tbl_lulu insert; never blocks save).
    try {
      await pool
        .request()
        .query("INSERT INTO tbl_lulu(luluDate) VALUES(GETDATE())");
    } catch {
      /* ignore */
    }

    return sendSuccess(
      res,
      { PurchaseOrderReceivedCode: porCode, PurchaseOrderReceivedNo: porNo },
      isEdit ? "The record is Updated" : "The record is Saved",
    );
  } catch (err) {
    if (tx) {
      try {
        await tx.rollback();
      } catch {
        /* ignore */
      }
    }
    const msg = err?.message || "";
    if (msg.includes("UK_PurchaseOrderReceivedDetailsName"))
      return sendError(
        res,
        "Already exist the Purchase Order Received Details Name",
        409,
      );
    console.error("DB Error (Inward.saveOrUpdate):", err);
    return sendError(res, err);
  }
};

export const create = (req, res) => saveOrUpdate(req, res, false);
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /inward/delete/:code — sp_PurchaseOrderReceived_Delete.
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = parseInt(req.params.code);
    if (!code) return sendError(res, "Invalid PurchaseOrderReceivedCode", 400);
    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("PurchaseOrderReceivedCode", sql.Int, code)
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("UserCode", sql.Int, toInt(req.headers.userId))
      .input("NodeCode", sql.Int, toInt(req.headers.nodeCode))
      .execute("sp_PurchaseOrderReceived_Delete");
    return sendSuccess(res, null, "The record is Deleted");
  } catch (err) {
    // FK constraint -> friendly message (mirror the VB ex.Message.Contains("FK_")).
    if ((err?.message || "").includes("FK_"))
      return sendError(res, "You cannot delete the Inward!", 409);
    console.error("DB Error (Inward.remove):", err);
    return sendError(res, err);
  }
};

// ===========================================================================
// Inward Direct (Without PO) — additive lookups for frmInwardWithOutPO_New.
// The with-PO paths above are untouched. The save is the SHARED saveOrUpdate:
// it already accepts @PurchaseOrderCode = 0 per row, honours an optional ChkTax
// tax-base switch (computeInwardTotals) and runs the requisition-update step.
// ===========================================================================

// GET /inward/direct/requisitions — open requisitions for the Without-PO picker
// (sp_PurchaseOrderReceived_WithoutPO_GetItemRequisition).
export const getDirectRequisitions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_PurchaseOrderReceived_WithoutPO_GetItemRequisition");
    const data = (result.recordset || []).map((r) => ({
      value: toInt(r.ItemRequisitionCode),
      label: r.strIRNo ?? r.ItemRequisitionNo ?? "",
    }));
    return sendSuccess(res, data);
  } catch (err) {
    console.error("DB Error (Inward.getDirectRequisitions):", err);
    return sendError(res, err);
  }
};

// GET /inward/direct/requisition-items?requisitionCode= — a requisition's pending
// items (sp_PurchaseAdvice_PendingItemRequisition @CompanyCode,@ItemRequisitionCode).
// Cost-head/dept/machine/employee/item/qty are pre-filled; Rate/amounts start 0
// for the user to enter on the received list.
export const getDirectRequisitionItems = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const requisitionCode = toInt(req.query.requisitionCode);
    if (requisitionCode <= 0) return sendSuccess(res, []);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("ItemRequisitionCode", sql.Int, requisitionCode)
      .execute("sp_PurchaseAdvice_PendingItemRequisition");
    const rows = (result.recordset || []).map((r, i) => ({
      id: `req-${requisitionCode}-${toInt(r.ItemCode)}-${i}`,
      ItemRequisitionCode: requisitionCode,
      PurchaseOrderCode: 0,
      CostHeadCode: toInt(r.CostHeadCode),
      CostHeadName: r.CostHeadName ?? "",
      DepartmentCode: toInt(r.DepartmentCode),
      DepartmentName: r.DepartmentName ?? "",
      MachineCode: toInt(r.MachineCode),
      EmployeeCode: toInt(r.EmployeeCode),
      EmployeeName: r.EmployeeName ?? "",
      ItemCode: toInt(r.ItemCode),
      ItemID: r.ItemID ?? "",
      ItemName: r.ItemName ?? "",
      ItemCategoryName: r.ItemCategoryName ?? "",
      TaxCode: toInt(r.TaxCode),
      TaxPer: toNum(r.TaxPer),
      Qty: toNum(r.ReqQty ?? r.PendingQty ?? r.Qty),
      Rate: 0,
      DiscountPer: 0,
      DiscountPerRate: 0,
      CGSTPer: 0,
      SGSTPer: 0,
      IGSTPer: 0,
      PFPer: 0,
      Reason: "",
    }));
    return sendSuccess(res, rows);
  } catch (err) {
    console.error("DB Error (Inward.getDirectRequisitionItems):", err);
    return sendError(res, err);
  }
};

// GET /inward/direct/items — item master for the manual-entry Item dropdown
// (sp_Item_GetbyItemName). Carries TaxCode / PurchaseCost / Category for the
// on-select autofill the VB does.
export const getDirectItems = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("Stock", sql.Int, 0)
      .input("Status", sql.Int, 1)
      .execute("sp_Item_GetbyItemName");
    const data = (result.recordset || []).map((r) => ({
      value: toInt(r.ItemCode),
      label: r.ItemName ?? "",
      ItemID: r.ItemID ?? "",
      PartNumber: r.PartNumber ?? "",
      TaxCode: toInt(r.TaxCode),
      TaxPer: toNum(r.Tax ?? r.TaxPer),
      PurchaseCost: toNum(r.PurchaseCost),
      ItemCategoryName: r.ItemCategoryName ?? "",
    }));
    return sendSuccess(res, data);
  } catch (err) {
    console.error("DB Error (Inward.getDirectItems):", err);
    return sendError(res, err);
  }
};

// GET /inward/direct/stock?itemCode= — current closing stock + purchase cost /
// category for an item (sp_Stock_Statement + vw_Item), shown beside the Item
// field and used to default the Rate, exactly as the VB does on Item-Enter.
export const getDirectStock = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const itemCode = toInt(req.query.itemCode);
    if (itemCode <= 0) return sendSuccess(res, { closing: 0 });
    const pool = await getPool(req.headers.subdbname);
    const companyCode = getCompanyCode(req);
    const todayStr = new Date().toISOString().slice(0, 10);
    const [stockRes, itemRes] = await Promise.all([
      pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("FromDate", sql.NVarChar, todayStr)
        .input("ToDate", sql.NVarChar, todayStr)
        .input("ItemCode", sql.Int, itemCode)
        .execute("sp_Stock_Statement"),
      pool
        .request()
        .input("ItemCode", sql.Int, itemCode)
        .query(
          "Select TOP 1 PurchaseCost, ItemCategoryName from vw_Item where ItemCode = @ItemCode",
        ),
    ]);
    let closing = 0;
    let closingValue = 0;
    for (const r of stockRes.recordset || []) {
      closing += toNum(r.Closing);
      closingValue += toNum(r.ClosingValue);
    }
    const it = itemRes.recordset?.[0] || {};
    return sendSuccess(res, {
      closing: r3(closing),
      closingValue: r2(closingValue),
      purchaseCost: toNum(it.PurchaseCost),
      itemCategoryName: it.ItemCategoryName ?? "",
    });
  } catch (err) {
    console.error("DB Error (Inward.getDirectStock):", err);
    return sendError(res, err);
  }
};
