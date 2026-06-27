import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Purchase Return (port of the WinForms frmPurchaseReturn). DIRECT ENTRY ONLY —
// there is no list/edit screen; the user only adds a new return.
//
//   Returns goods to a supplier against an existing GRN (Inward). Cascade:
//     Supplier -> GRN No -> Item -> (stock + inward qty + already-returned qty),
//   enter the return Qty, add the line; tax/rate/discount carry from the GRN line.
//
//   - Suppliers : tbl_Supplier limited to those that have a GRN (tbl_PurchaseOrderReceived).
//   - GRNs      : tbl_PurchaseOrderReceived for the supplier whose items still have stock.
//   - Items     : vw_PurchaseOrderReceivedDetails for that GRN whose items have stock.
//   - Stock     : sp_Stock_Statement (closing) + tbl_Item current stock + Σ already-returned.
//   - Next no   : sp_PurchaseReturn_BindNo.
//   - Save      : sp_PurchaseReturn_AddEdit (scalar -> code) ->
//                 sp_PurchaseReturnDetails_Delete -> loop sp_PurchaseReturnDetails_Insert
//                 -> commit -> sp_Stock_Statement @CurStock=1 (stock recalc).
//
//   Totals mirror the VB Grid_total: Taxable = Gross + P&F; GST on (Gross + P&F);
//   Net = Taxable + Tax + Rounded-Off. TCS / Other-Expenses / Other-Charges are
//   carried per-row from the GRN line but DO NOT enter the Net (the VB disables
//   them). Recomputed SERVER-SIDE — the client grid only previews.
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
const str = (v) => (v ?? "").toString().trim();
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getFYCode = (req) => toInt(req.headers.FYCode);
const D = (v) => (v ? new Date(v) : null);
const todayStr = () => new Date().toISOString().slice(0, 10);

const scalar = async (request, proc) => {
  const r = await request.execute(proc);
  const row = r.recordset?.[0];
  return row ? toInt(Object.values(row)[0]) : 0;
};

// Company 1 uses the primary UOM stock columns; every other company uses U2.
const stockCols = (companyCode) =>
  companyCode === 1
    ? { qty: "CurStockQty", value: "CurStockValue" }
    : { qty: "CurStockQtyU2", value: "CurStockValueU2" };

// Current closing stock for one item (sp_Stock_Statement Closing sum) — the
// authority for the return-qty checks.
const getClosingStock = async (pool, companyCode, itemCode) => {
  const today = todayStr();
  const r = await pool
    .request()
    .input("CompanyCode", sql.Int, companyCode)
    .input("FromDate", sql.NVarChar, today)
    .input("ToDate", sql.NVarChar, today)
    .input("ItemCode", sql.Int, itemCode)
    .execute("sp_Stock_Statement");
  return (r.recordset || []).reduce((s, x) => s + toNum(x.Closing), 0);
};

// ---------------------------------------------------------------------------
// Server mirror of the VB Grid_total. Each row carries Rate / DiscountAmount /
// CGSTPer / SGSTPer / IGSTPer from the GRN line; only Qty is user-entered.
// ---------------------------------------------------------------------------
const computeReturnTotals = (rows, header) => {
  const headerPFPer = toNum(header.PFPer);
  const totalPFAmount = toNum(header.TotalPFAmount);

  const base = rows.map((d) => {
    const qty = toNum(d.Qty);
    const rate = toNum(d.Rate);
    const amount = r2(qty * rate);
    const discountAmount = r2(d.DiscountAmount); // carried from the GRN line
    return { qty, amount, discountAmount, grossAmount: r2(amount - discountAmount) };
  });
  const totalBasic = r2(base.reduce((s, r) => s + r.amount, 0));
  const totalDisc = r2(base.reduce((s, r) => s + r.discountAmount, 0));
  const baseNet = totalBasic - totalDisc;

  let sumPF = 0, sumTaxable = 0, sumCGST = 0, sumSGST = 0, sumIGST = 0;
  const computed = rows.map((d, i) => {
    const b = base[i];
    // P&F: a header % applies per line; else a flat amount is distributed by the
    // (basic − discount) base (mirrors Purchase Order-Direct — no toggle).
    let pf = 0;
    if (headerPFPer > 0)
      pf = r2((b.amount - b.discountAmount) * (headerPFPer / 100));
    else if (totalPFAmount > 0 && baseNet !== 0)
      pf = r2((totalPFAmount / baseNet) * (b.amount - b.discountAmount));
    const taxBase = r2(b.grossAmount + pf); // VB: GST on (Gross + P&F)
    const cgstPer = toNum(d.CGSTPer);
    const sgstPer = toNum(d.SGSTPer);
    const igstPer = toNum(d.IGSTPer);
    let cgst = 0, sgst = 0, igst = 0;
    if (cgstPer > 0) {
      cgst = r2(taxBase * (cgstPer / 100));
      sgst = r2(taxBase * (sgstPer / 100));
    } else if (igstPer > 0) {
      igst = r2(taxBase * (igstPer / 100));
    }
    sumPF += pf; sumTaxable += taxBase; sumCGST += cgst; sumSGST += sgst; sumIGST += igst;
    return {
      amount: b.amount, discountAmount: b.discountAmount, grossAmount: b.grossAmount,
      pfPer: headerPFPer > 0 ? headerPFPer : 0, pfAmount: pf,
      cgstPer, sgstPer, igstPer, cgstAmount: cgst, sgstAmount: sgst, igstAmount: igst,
      taxPer: r2(cgstPer + sgstPer + igstPer),
      taxAmount: r2(cgst + sgst + igst),
    };
  });
  const totalPF = r2(sumPF);
  const totalTaxable = r2(sumTaxable);
  const totalCGST = r2(sumCGST), totalSGST = r2(sumSGST), totalIGST = r2(sumIGST);
  const totalTax = r2(totalCGST + totalSGST + totalIGST);
  const netBeforeRound = r2(totalTaxable + totalTax);
  const autoRoundedOff = r2(Math.trunc(netBeforeRound + 0.5) - netBeforeRound);
  const totalRoundedOff =
    header.RoundedOff === "" || header.RoundedOff == null
      ? autoRoundedOff
      : toNum(header.RoundedOff);
  const totalNetAmount = r2(netBeforeRound + totalRoundedOff);

  const detail = computed.map((c) => {
    const roundedOff =
      totalRoundedOff > 0 && totalTaxable !== 0
        ? r2((totalRoundedOff / totalTaxable) * c.amount)
        : 0;
    const netAmount = r2(
      c.grossAmount + c.pfAmount + c.cgstAmount + c.sgstAmount + c.igstAmount + roundedOff,
    );
    return { ...c, roundedOff, netAmount };
  });
  const pct = (amt) => (amt > 0 && totalTaxable > 0 ? r2((amt / totalTaxable) * 100) : 0);

  return {
    rows: detail,
    totals: {
      totalQty: r3(base.reduce((s, r) => s + r.qty, 0)),
      totalBasic, totalDisc, totalPF, totalTaxable,
      totalCGST, totalCGSTPer: pct(totalCGST),
      totalSGST, totalSGSTPer: pct(totalSGST),
      totalIGST, totalIGSTPer: pct(totalIGST),
      totalTax, autoRoundedOff, totalRoundedOff, totalNetAmount,
    },
  };
};

// GET /purchase-return/next-no
export const getNextNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const no = await scalar(
      pool
        .request()
        .input("CompanyCode", sql.Int, getCompanyCode(req))
        .input("FYCode", sql.Int, getFYCode(req)),
      "sp_PurchaseReturn_BindNo",
    );
    return sendSuccess(res, { no });
  } catch (err) {
    console.error("DB Error (PurchaseReturn.getNextNo):", err);
    return sendError(res, err);
  }
};

// GET /purchase-return/suppliers — only suppliers that have a GRN (the VB query).
export const getReturnSuppliers = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .query(
        "SELECT SupplierName, SupplierCode FROM tbl_Supplier WHERE SupplierCode IN (SELECT SupplierCode FROM tbl_PurchaseOrderReceived WHERE CompanyCode = @CompanyCode) ORDER BY SupplierName",
      );
    const data = (result.recordset || []).map((r) => ({
      value: toInt(r.SupplierCode),
      label: r.SupplierName ?? "",
    }));
    return sendSuccess(res, data);
  } catch (err) {
    console.error("DB Error (PurchaseReturn.getReturnSuppliers):", err);
    return sendError(res, err);
  }
};

// GET /purchase-return/grns?supplierCode= — GRNs for the supplier whose items
// still have stock (Load_GRN). Returns GRN No (label) + code + date.
export const getGRNs = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const supplierCode = toInt(req.query.supplierCode);
    if (supplierCode <= 0) return sendSuccess(res, []);
    const companyCode = getCompanyCode(req);
    const col = stockCols(companyCode).qty;
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("SupplierCode", sql.Int, supplierCode)
      .query(
        `SELECT PurchaseOrderReceivedCode, PurchaseOrderReceivedNo, PurchaseOrderReceivedDate
         FROM tbl_PurchaseOrderReceived
         WHERE CompanyCode = @CompanyCode AND SupplierCode = @SupplierCode
           AND PurchaseOrderReceivedCode IN (
             SELECT DISTINCT d.PurchaseOrderReceivedCode
             FROM vw_PurchaseOrderReceivedDetails d
             INNER JOIN tbl_Item i ON i.ItemCode = d.ItemCode
             WHERE d.CompanyCode = @CompanyCode AND d.SupplierCode = @SupplierCode
               AND ISNULL(i.${col}, 0) > 0 )
         ORDER BY PurchaseOrderReceivedNo DESC, PurchaseOrderReceivedDate DESC`,
      );
    const data = (result.recordset || []).map((r) => ({
      value: toInt(r.PurchaseOrderReceivedCode),
      label: r.PurchaseOrderReceivedNo == null ? "" : String(r.PurchaseOrderReceivedNo),
      PurchaseOrderReceivedNo: r.PurchaseOrderReceivedNo == null ? "" : String(r.PurchaseOrderReceivedNo),
      PurchaseOrderReceivedDate: r.PurchaseOrderReceivedDate ?? null,
    }));
    return sendSuccess(res, data);
  } catch (err) {
    console.error("DB Error (PurchaseReturn.getGRNs):", err);
    return sendError(res, err);
  }
};

// GET /purchase-return/items?supplierCode=&grnCode= — the GRN's lines whose items
// have stock (Load_Item). Each carries the codes/rate/disc/tax for the entry row.
export const getReturnItems = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const supplierCode = toInt(req.query.supplierCode);
    const grnCode = toInt(req.query.grnCode);
    if (supplierCode <= 0 || grnCode <= 0) return sendSuccess(res, []);
    const companyCode = getCompanyCode(req);
    const col = stockCols(companyCode).qty;
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("SupplierCode", sql.Int, supplierCode)
      .input("GRNCode", sql.Int, grnCode)
      .query(
        `SELECT * FROM vw_PurchaseOrderReceivedDetails
         WHERE CompanyCode = @CompanyCode AND SupplierCode = @SupplierCode
           AND PurchaseOrderReceivedCode = @GRNCode
           AND ItemCode IN ( SELECT ItemCode FROM tbl_Item WHERE ISNULL(${col}, 0) > 0 )`,
      );
    const rows = (result.recordset || []).map((r, i) => ({
      id: `${grnCode}-${toInt(r.ItemCode)}-${i}`,
      value: toInt(r.ItemCode),
      label: r.ItemName ?? "",
      PurchaseOrderReceivedCode: toInt(r.PurchaseOrderReceivedCode),
      PurchaseOrderReceivedNo: r.PurchaseOrderReceivedNo ?? "",
      PurchaseOrderReceivedDate: r.PurchaseOrderReceivedDate ?? null,
      CostHeadCode: toInt(r.CostHeadCode),
      CostHeadName: r.CostHeadName ?? "",
      DepartmentCode: toInt(r.DepartmentCode),
      DepartmentName: r.DepartmentName ?? "",
      MachineCode: toInt(r.MachineCode),
      EmployeeCode: toInt(r.EmployeeCode),
      EmployeeID: r.EmployeeID ?? "",
      EmployeeName: r.EmployeeName ?? "",
      ItemCode: toInt(r.ItemCode),
      ItemID: r.ItemID ?? "",
      ItemName: r.ItemName ?? "",
      // GRN inward qty for this line — the cap (with already-returned) on returns.
      InwQty: toNum(r.Qty),
      Rate: toNum(r.Rate),
      DiscountPer: toNum(r.DiscountPer),
      DiscountPerRate: toNum(r.DiscountAmount_PerQty),
      DiscountAmount: toNum(r.DiscountAmount),
      CGSTPer: toNum(r.CGSTPer),
      SGSTPer: toNum(r.SGSTPer),
      IGSTPer: toNum(r.IGSTPer),
      TaxCode: toInt(r.TaxCode),
      TaxName: r.TaxName ?? "",
      TCSAmount: toNum(r.TCSAmount),
      OtherExpenses: toNum(r.OtherExpenses),
      Reason: str(r.Reason),
    }));
    return sendSuccess(res, rows);
  } catch (err) {
    console.error("DB Error (PurchaseReturn.getReturnItems):", err);
    return sendError(res, err);
  }
};

// GET /purchase-return/item-stock?itemCode=&grnCode= — current stock (closing +
// tbl_Item current) and the already-returned qty for one GRN line.
export const getItemStock = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const itemCode = toInt(req.query.itemCode);
    const grnCode = toInt(req.query.grnCode);
    if (itemCode <= 0) return sendSuccess(res, { closing: 0, returnedQty: 0 });
    const companyCode = getCompanyCode(req);
    const cols = stockCols(companyCode);
    const pool = await getPool(req.headers.subdbname);
    const today = todayStr();
    const [stockRes, itemRes, rtnRes] = await Promise.all([
      pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("FromDate", sql.NVarChar, today)
        .input("ToDate", sql.NVarChar, today)
        .input("ItemCode", sql.Int, itemCode)
        .execute("sp_Stock_Statement"),
      pool
        .request()
        .input("ItemCode", sql.Int, itemCode)
        .query(
          `SELECT TOP 1 ISNULL(${cols.qty}, 0) AS CurStockQty, ISNULL(${cols.value}, 0) AS CurStockValue FROM tbl_Item WHERE ItemCode = @ItemCode`,
        ),
      pool
        .request()
        .input("GRNCode", sql.Int, grnCode)
        .input("ItemCode", sql.Int, itemCode)
        .query(
          "SELECT ISNULL(SUM(Qty),0) AS RtnQty FROM tbl_PurchaseReturnDetails WHERE PurchaseOrderReceivedCode = @GRNCode AND ItemCode = @ItemCode",
        ),
    ]);
    let closing = 0;
    let closingValue = 0;
    for (const r of stockRes.recordset || []) {
      closing += toNum(r.Closing);
      closingValue += toNum(r.ClosingValue);
    }
    const it = itemRes.recordset?.[0] || {};
    const curStockQty = toNum(it.CurStockQty);
    const curStockValue = toNum(it.CurStockValue);
    return sendSuccess(res, {
      closing: r3(closing),
      closingValue: r2(closingValue),
      stockRate: closing !== 0 ? Math.round((closingValue / closing) * 1e7) / 1e7 : 0,
      curStockQty,
      curStockValue,
      curStockRate: curStockQty !== 0 ? Math.round((curStockValue / curStockQty) * 1e7) / 1e7 : 0,
      returnedQty: toNum(rtnRes.recordset?.[0]?.RtnQty),
    });
  } catch (err) {
    console.error("DB Error (PurchaseReturn.getItemStock):", err);
    return sendError(res, err);
  }
};

// POST /purchase-return/create — header + detail rows in ONE transaction, then a
// stock recalc (mirrors the VB save + UpdateCurrentStock).
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
    if (companyCode <= 0)
      return sendError(
        res,
        "You are logged into a group of companies — select a single company",
        400,
      );

    const b = req.body || {};
    if (!D(b.PurchaseReturnDate))
      return sendError(res, "Return Date is required", 400);
    if (toInt(b.SupplierCode) <= 0)
      return sendError(res, "Select the Supplier Name", 400);

    const rows = Array.isArray(b.details) ? b.details : [];
    if (!rows.length) return sendError(res, "Drop the Item", 400);

    const pool = await getPool(req.headers.subdbname);

    // Re-check stock at save: cumulative return qty per item must not exceed the
    // current closing stock (VB btnSave loop -> "Please Check the Issue Qty").
    const qtyByItem = {};
    for (const d of rows) {
      const ic = toInt(d.ItemCode);
      qtyByItem[ic] = (qtyByItem[ic] || 0) + toNum(d.Qty);
    }
    for (const ic of Object.keys(qtyByItem)) {
      const closing = await getClosingStock(pool, companyCode, toInt(ic));
      if (qtyByItem[ic] > closing)
        return sendError(res, "Please Check the Issue Qty", 400);
    }

    const { rows: calc, totals } = computeReturnTotals(rows, b);

    if (totals.totalRoundedOff > 1)
      return sendError(res, "Check the Rounded Off", 400);
    if (totals.totalQty <= 0) return sendError(res, "Drop the Item", 400);
    if (totals.totalNetAmount <= 0)
      return sendError(res, "Check the Net Amount", 400);

    // New return number + duplicate guard.
    let porNo = await scalar(
      pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("FYCode", sql.Int, fyCode),
      "sp_PurchaseReturn_BindNo",
    );
    const dup = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("FYCode", sql.Int, fyCode)
      .input("PurchaseReturnNo", sql.Int, porNo)
      .query(
        "SELECT PurchaseReturnNo FROM tbl_PurchaseReturn WHERE CompanyCode = @CompanyCode AND PurchaseReturnNo = @PurchaseReturnNo AND FYCode = @FYCode",
      );
    if ((dup.recordset || []).length)
      porNo = await scalar(
        pool
          .request()
          .input("CompanyCode", sql.Int, companyCode)
          .input("FYCode", sql.Int, fyCode),
        "sp_PurchaseReturn_BindNo",
      );

    tx = new sql.Transaction(pool);
    await tx.begin();

    // --- 1) Header ---
    const head = new sql.Request(tx);
    head.input("PurchaseReturnDate", sql.DateTime, D(b.PurchaseReturnDate));
    head.input("PurchaseReturnNo", sql.Int, porNo);
    head.input("SupplierCode", sql.Int, toInt(b.SupplierCode));
    head.input("TotalQty", sql.Decimal(18, 3), totals.totalQty);
    head.input("TotalAmount", sql.Decimal(18, 2), totals.totalBasic);
    head.input("TotalDiscountper", sql.Decimal(18, 2), 0);
    head.input("TotalDiscountAmount", sql.Decimal(18, 2), totals.totalDisc);
    head.input("TotalGrossAmount", sql.Decimal(18, 2), totals.totalTaxable);
    head.input("TotalTaxPer", sql.Decimal(18, 2), 0);
    head.input("TotalTaxAmount", sql.Decimal(18, 2), totals.totalTax);
    head.input("TotalCSTPer", sql.Decimal(18, 2), 0);
    head.input("TotalCSTAmount", sql.Decimal(18, 2), 0);
    head.input("TotalPFPer", sql.Decimal(18, 2), toNum(b.PFPer));
    head.input("TotalPFAmount", sql.Decimal(18, 2), totals.totalPF);
    head.input("TotalCGSTAmount", sql.Decimal(18, 2), totals.totalCGST);
    head.input("TotalCGSTPer", sql.Decimal(18, 2), totals.totalCGSTPer);
    head.input("TotalSGSTAmount", sql.Decimal(18, 2), totals.totalSGST);
    head.input("TotalSGSTPer", sql.Decimal(18, 2), totals.totalSGSTPer);
    head.input("TotalIGSTAmount", sql.Decimal(18, 2), totals.totalIGST);
    head.input("TotalIGSTPer", sql.Decimal(18, 2), totals.totalIGSTPer);
    head.input("TotalOtherExpenses", sql.Decimal(18, 2), 0);
    head.input("TotalRoundedOff", sql.Decimal(18, 2), totals.totalRoundedOff);
    head.input("TotalNetAmount", sql.Decimal(18, 2), totals.totalNetAmount);
    head.input("Remarks", sql.NVarChar(sql.MAX), str(b.Remarks));
    head.input("TotalTCSAmount", sql.Decimal(18, 2), 0);
    head.input("OtherChargesWithoutTax", sql.Decimal(18, 2), 0);
    head.input("FYCode", sql.Int, fyCode);
    head.input("CompanyCode", sql.Int, companyCode);
    head.input("User", sql.Int, toInt(userId));
    head.input("Node", sql.Int, toInt(nodeCode));
    const prCode = await scalar(head, "sp_PurchaseReturn_AddEdit");
    if (!prCode) throw new Error("Purchase Return header save returned no code");

    // --- 2) Clear existing detail rows ---
    await new sql.Request(tx)
      .input("PurchaseReturnCode", sql.Int, prCode)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_PurchaseReturnDetails_Delete");

    // --- 3) Insert detail rows ---
    for (let i = 0; i < rows.length; i += 1) {
      const d = rows[i];
      const c = calc[i];
      const reqd = new sql.Request(tx);
      reqd.input("PurchaseReturnCode", sql.Int, prCode);
      reqd.input("SNo", sql.Int, i + 1);
      reqd.input("CostHeadCode", sql.Int, toInt(d.CostHeadCode));
      reqd.input("DepartmentCode", sql.Int, toInt(d.DepartmentCode));
      reqd.input("PurchaseOrderReceivedCode", sql.Int, toInt(d.PurchaseOrderReceivedCode));
      reqd.input("EmployeeCode", sql.Int, toInt(d.EmployeeCode));
      reqd.input("MachineCode", sql.Int, toInt(d.MachineCode));
      reqd.input("ItemCode", sql.Int, toInt(d.ItemCode));
      reqd.input("Qty", sql.Decimal(18, 3), toNum(d.Qty));
      reqd.input("Rate", sql.Decimal(18, 2), toNum(d.Rate));
      reqd.input("Amount", sql.Decimal(18, 2), c.amount);
      reqd.input("DiscountPer", sql.Decimal(18, 2), toNum(d.DiscountPer));
      reqd.input("DiscountAmount", sql.Decimal(18, 2), c.discountAmount);
      reqd.input("GrossAmount", sql.Decimal(18, 2), c.grossAmount);
      reqd.input("TaxPer", sql.Decimal(18, 2), c.taxPer);
      reqd.input("TaxAmount", sql.Decimal(18, 2), c.taxAmount);
      reqd.input("CSTPer", sql.Decimal(18, 2), 0);
      reqd.input("CSTAmount", sql.Decimal(18, 2), 0);
      reqd.input("CGSTPer", sql.Decimal(18, 2), c.cgstPer);
      reqd.input("CGSTAmount", sql.Decimal(18, 2), c.cgstAmount);
      reqd.input("SGSTPer", sql.Decimal(18, 2), c.sgstPer);
      reqd.input("SGSTAmount", sql.Decimal(18, 2), c.sgstAmount);
      reqd.input("IGSTPer", sql.Decimal(18, 2), c.igstPer);
      reqd.input("IGSTAmount", sql.Decimal(18, 2), c.igstAmount);
      reqd.input("PFPer", sql.Decimal(18, 2), c.pfPer);
      reqd.input("PFAmount", sql.Decimal(18, 3), c.pfAmount);
      reqd.input("OtherExpenses", sql.Decimal(18, 3), toNum(d.OtherExpenses));
      reqd.input("RoundedOff", sql.Decimal(18, 2), c.roundedOff);
      reqd.input("NetAmount", sql.Decimal(18, 2), c.netAmount);
      reqd.input("Reason", sql.NVarChar(sql.MAX), str(d.Reason));
      reqd.input("Stock", sql.Decimal(18, 3), toNum(d.Stock));
      reqd.input("StockRate", sql.Decimal(18, 7), toNum(d.StockRate));
      reqd.input("StockValue", sql.Decimal(18, 2), toNum(d.StockValue));
      const img = d.GoodsImage;
      if (typeof img === "string" && img.startsWith("data:")) {
        const base64 = img.slice(img.indexOf(",") + 1);
        reqd.input("GoodsImage", sql.Image, Buffer.from(base64, "base64"));
      }
      reqd.input("CompanyCode", sql.Int, companyCode);
      reqd.input("TCSAmount", sql.Decimal(18, 2), toNum(d.TCSAmount));
      await reqd.execute("sp_PurchaseReturnDetails_Insert");
    }

    await tx.commit();

    // --- 4) Stock recalc (VB UpdateCurrentStock) — the return must reduce stock.
    try {
      const today = todayStr();
      await pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("FromDate", sql.NVarChar, today)
        .input("ToDate", sql.NVarChar, today)
        .input("CurStock", sql.Int, 1)
        .execute("sp_Stock_Statement");
    } catch {
      /* recalc is best-effort */
    }

    return sendSuccess(
      res,
      { PurchaseReturnCode: prCode, PurchaseReturnNo: porNo },
      "The record is Saved",
    );
  } catch (err) {
    if (tx) {
      try {
        await tx.rollback();
      } catch {
        /* ignore */
      }
    }
    if ((err?.message || "").includes("UK_"))
      return sendError(res, "Already exists this Purchase Return Details", 409);
    console.error("DB Error (PurchaseReturn.create):", err);
    return sendError(res, err);
  }
};
