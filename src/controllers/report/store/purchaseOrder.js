// =============================================================================
// Store ▸ Purchase Order Report (port of WinForms rptPurchaseOrderDetails)
// =============================================================================
// One screen, ten report types — built in the shared pdfmake convention
// (controllers/report/cotton/_common.js), exactly like the Purchase Requisition
// Report sibling. The legacy RDLCs are NOT consumed; each grouping is a
// hand-written pdfmake template.
//
//   DETAILS  → sp_PurchaseOrderDetails_GetAll  (@FromDate,@ToDate,@CompanyCode)
//     groupBy=date     (grouped by PurchaseOrderDate)
//     groupBy=supplier (grouped by SupplierCode)
//     groupBy=item     (grouped by ItemCode)
//     groupBy=category (grouped by ItemCategoryCode)
//     groupBy=costhead (grouped by CostHeadCode)
//     groupBy=closure  (PO Closure — grouped by BranchCode)
//     → endpoint /store/reports/purchase-order
//
//   PENDING  → sp_RptPurchaseOrderDetailsPending (@FromDate,@ToDate,@CompanyCode,@Pending=1)
//     groupBy=date|supplier|item|category
//     → endpoint /store/reports/purchase-order-pending
//
// The legacy screen pulls the whole recordset then narrows it in-memory with
// DataTable.Select("Code IN (..)") from the left-rail combos and the PO-status
// radio. We reproduce that exactly: every filter is applied AFTER the SP, and
// the PO-status radio (All / Approve1/2/3 / Amended) applies ONLY to the Details
// report, never to Pending — matching the VB code. NO SP is modified.
// =============================================================================

import {
  runReport,
  buildPage,
  buildGroupSummaryPage,
  tableLayout,
  colors,
  dec,
  str,
  fmt,
  ddmmyyyy,
  estimateLines,
  topPadFor,
  sql,
} from "../cotton/_common.js";
import { getPool } from "../../../config/dynamicDB.js";

// ---------------------------------------------------------------------------
// In-memory row filtering — mirrors the WinForms DataTable.Select("X IN (..)").
// Each spec applies only to recordsets that actually expose its column (the
// Details and Pending recordsets share most, but not all, of these columns).
// ---------------------------------------------------------------------------
const FILTER_SPECS = [
  { param: "SupplierCode", col: "SupplierCode" },
  { param: "PurchaseModeCode", col: "PurchaseModeCode" },
  { param: "ItemRequisitionCode", col: "ItemRequisitionCode" },
  { param: "PurchaseOrderCode", col: "PurchaseOrderCode" },
  { param: "CostHeadCode", col: "CostHeadCode" },
  { param: "DepartmentCode", col: "DepartmentCode" },
  { param: "ItemGroupCode", col: "ItemGroupCode" },
  { param: "ItemCategoryCode", col: "ItemCategoryCode" },
  { param: "ItemCode", col: "ItemCode" },
  { param: "UsageTypeCode", col: "UsageTypeCode" },
  { param: "EmployeeCode", col: "EmployeeCode" },
];

const parseCodeSet = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const set = new Set(
    String(v)
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length)
  );
  return set.size ? set : null;
};

function applyPoFilters(rows, query = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return rows || [];
  const sample = rows[0];
  const active = [];
  for (const spec of FILTER_SPECS) {
    const set = parseCodeSet(query[spec.param]);
    if (!set) continue;
    if (!Object.prototype.hasOwnProperty.call(sample, spec.col)) continue;
    active.push({ col: spec.col, set });
  }
  if (!active.length) return rows;
  return rows.filter((r) => active.every(({ col, set }) => set.has(String(r[col]))));
}

// PO-status radio — single-select; Details only (the VB applies it inside the
// "Details" branch and never on Pending). ?approval=all|a1|a2|a3|amended.
const truthy = (v) => v === true || Number(v) === 1;
function applyApproval(rows, query = {}) {
  const a = String(query.approval || "all").toLowerCase();
  if (a === "a1") return rows.filter((r) => truthy(r.Approve1));
  if (a === "a2") return rows.filter((r) => truthy(r.Approve2));
  if (a === "a3") return rows.filter((r) => truthy(r.Approve3));
  if (a === "amended") return rows.filter((r) => truthy(r.Amendment));
  return rows; // "all" (or unknown) — no filter
}

const dateKey = (d) => {
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "0000-00-00" : dt.toISOString().slice(0, 10);
};

const headerRow = (headers) =>
  headers.map((t) => ({
    text: t, bold: true, fillColor: colors.headerFill, color: colors.headerText,
    alignment: "center", fontSize: 8,
  }));

// ---------------------------------------------------------------------------
// DETAILS report — shared 14-column detail table. GST = CGST+SGST+IGST and
// P & F = PFAmount are consolidated (one column each) for landscape fit, as in
// the RDLC's detail (table1).
// ---------------------------------------------------------------------------
const DT_HEADERS = [
  "S.No", "Order No", "Date", "Supplier Name", "Item Name", "Qty", "Rate",
  "Amount", "Discount", "P & F", "Other Exp", "GST", "RND", "Net Amount",
];
// Only ONE flexible (*) column — Item Name. Supplier is a fixed width and wraps
// internally. Two * text columns can let a long token push the table past the
// page width (right-edge clipping); the Purchase Requisition Report uses the
// same single-* pattern. Total fixed + one * fills the A4-landscape page exactly.
const DT_WIDTHS = [20, 34, 42, 86, "*", 36, 44, 52, 46, 42, 44, 50, 30, 54];
const DT_NCOLS = DT_HEADERS.length; // 14
const DT_WRAP = { supplier: 16, item: 24 };
const DT_TOTAL_COLS = [
  { header: "Amount", key: "amount" },
  { header: "Discount", key: "discount" },
  { header: "P & F", key: "pf" },
  { header: "Other Exp", key: "other" },
  { header: "GST", key: "gst" },
  { header: "RND", key: "rnd" },
  { header: "Net Amount", key: "net" },
];

const gstOf = (r) => dec(r, "CGSTAmount") + dec(r, "SGSTAmount") + dec(r, "IGSTAmount");

function detailsRow(r, sno, zebra) {
  const supplier = str(r, "SupplierName");
  const item = str(r, "ItemName");
  const sL = estimateLines(supplier, DT_WRAP.supplier);
  const iL = estimateLines(item, DT_WRAP.item);
  const maxLines = Math.max(1, sL, iL);
  const cell = (text, align = "left", cellLines = 1) => ({
    text, alignment: align, fontSize: 8, fillColor: zebra,
    margin: [0, topPadFor(maxLines, cellLines), 0, 0],
  });
  return [
    cell(String(sno), "center"),
    cell(str(r, "PurchaseOrderNo"), "center"),
    cell(ddmmyyyy(r.PurchaseOrderDate), "center"),
    cell(supplier, "left", sL),
    cell(item, "left", iL),
    cell(fmt(dec(r, "Qty"), 3), "right"),
    cell(fmt(dec(r, "Rate"), 2), "right"),
    cell(fmt(dec(r, "Amount"), 2), "right"),
    cell(fmt(dec(r, "DiscountAmount"), 2), "right"),
    cell(fmt(dec(r, "PFAmount"), 2), "right"),
    cell(fmt(dec(r, "OtherExpenses"), 2), "right"),
    cell(fmt(gstOf(r), 2), "right"),
    cell(fmt(dec(r, "RoundedOff"), 2), "right"),
    cell(fmt(dec(r, "NetAmount"), 2), "right"),
  ];
}

function accDetails(group) {
  const t = { amount: 0, discount: 0, pf: 0, other: 0, gst: 0, rnd: 0, net: 0 };
  for (const r of group) {
    t.amount += dec(r, "Amount");
    t.discount += dec(r, "DiscountAmount");
    t.pf += dec(r, "PFAmount");
    t.other += dec(r, "OtherExpenses");
    t.gst += gstOf(r);
    t.rnd += dec(r, "RoundedOff");
    t.net += dec(r, "NetAmount");
  }
  return t;
}

// Sub Total / Grand Total row: label spans S.No..Rate (7 cells), then the 7
// money totals under Amount..Net.
function detailsTotalRow(label, t, style) {
  return [
    { text: label, colSpan: 7, alignment: "right", ...style },
    {}, {}, {}, {}, {}, {},
    ...DT_TOTAL_COLS.map((c) => ({ text: fmt(t[c.key]), alignment: "right", ...style })),
  ];
}

const DETAILS_CONFIGS = {
  date: {
    title: "PURCHASE ORDER DETAILS - DATE WISE",
    summaryTitle: "PURCHASE ORDER SUMMARY - DATE WISE",
    fileName: "PurchaseOrder_DateWise",
    summaryGroupHeader: "Date",
    groupKey: (r) => dateKey(r.PurchaseOrderDate),
    sortKey: (k) => k, // ISO key sorts chronologically
    groupLabel: (g) => "Date : " + ddmmyyyy(g[0].PurchaseOrderDate),
    summaryLabel: (g) => ddmmyyyy(g[0].PurchaseOrderDate),
  },
  supplier: {
    title: "PURCHASE ORDER DETAILS - SUPPLIER WISE",
    summaryTitle: "PURCHASE ORDER SUMMARY - SUPPLIER WISE",
    fileName: "PurchaseOrder_SupplierWise",
    summaryGroupHeader: "Supplier Name",
    groupKey: (r) => String(r.SupplierCode ?? "0"),
    groupLabel: (g) => "Supplier : " + str(g[0], "SupplierName"),
    summaryLabel: (g) => str(g[0], "SupplierName"),
  },
  item: {
    title: "PURCHASE ORDER DETAILS - ITEM WISE",
    summaryTitle: "PURCHASE ORDER SUMMARY - ITEM WISE",
    fileName: "PurchaseOrder_ItemWise",
    summaryGroupHeader: "Item",
    groupKey: (r) => String(r.ItemCode ?? "0"),
    groupLabel: (g) =>
      "Item : " + str(g[0], "ItemName") + (str(g[0], "ItemUomName") ? " - " + str(g[0], "ItemUomName") : ""),
    summaryLabel: (g) =>
      str(g[0], "ItemName") + (str(g[0], "ItemUomName") ? " - " + str(g[0], "ItemUomName") : ""),
  },
  category: {
    title: "PURCHASE ORDER DETAILS - CATEGORY WISE",
    summaryTitle: "PURCHASE ORDER SUMMARY - CATEGORY WISE",
    fileName: "PurchaseOrder_CategoryWise",
    summaryGroupHeader: "Item Category",
    groupKey: (r) => String(r.ItemCategoryCode ?? "0"),
    groupLabel: (g) => "Category : " + str(g[0], "ItemCategoryName"),
    summaryLabel: (g) => str(g[0], "ItemCategoryName"),
  },
  costhead: {
    title: "PURCHASE ORDER DETAILS - COST HEAD WISE",
    summaryTitle: "PURCHASE ORDER SUMMARY - COST HEAD WISE",
    fileName: "PurchaseOrder_CostHeadWise",
    summaryGroupHeader: "Cost Head",
    groupKey: (r) => String(r.CostHeadCode ?? "0"),
    groupLabel: (g) => "Cost Head : " + str(g[0], "CostHeadName"),
    summaryLabel: (g) => str(g[0], "CostHeadName"),
  },
  closure: {
    title: "PURCHASE ORDER - PO CLOSURE",
    summaryTitle: "PO CLOSURE - SUMMARY",
    fileName: "PurchaseOrder_Closure",
    summaryGroupHeader: "Branch",
    groupKey: (r) => String(r.BranchCode ?? "0"),
    groupLabel: (g) => "Branch : " + (str(g[0], "BranchName") || "-"),
    summaryLabel: (g) => str(g[0], "BranchName") || "(No Branch)",
  },
};

function buildDetailsDoc({ rows, companyName, companyLogo, fromDate, toDate, cfg }) {
  const groupsMap = new Map();
  for (const r of rows) {
    const k = cfg.groupKey(r);
    if (!groupsMap.has(k)) groupsMap.set(k, []);
    groupsMap.get(k).push(r);
  }
  const sortVal = cfg.sortKey || ((k, g) => String(cfg.summaryLabel(g)).toLowerCase());
  const entries = [...groupsMap.entries()].sort((a, b) =>
    String(sortVal(a[0], a[1])).localeCompare(String(sortVal(b[0], b[1])))
  );

  const body = [headerRow(DT_HEADERS)];
  let sno = 1;
  const grand = { amount: 0, discount: 0, pf: 0, other: 0, gst: 0, rnd: 0, net: 0 };
  const groupSummaries = [];

  for (const [, group] of entries) {
    body.push([
      {
        text: cfg.groupLabel(group), colSpan: DT_NCOLS, bold: true,
        color: colors.groupText, fillColor: colors.groupFill, fontSize: 9, margin: [2, 2, 0, 2],
      },
      ...Array(DT_NCOLS - 1).fill({}),
    ]);
    let idx = 0;
    for (const r of group) {
      body.push(detailsRow(r, sno, idx % 2 === 1 ? colors.zebraFill : null));
      sno++;
      idx++;
    }
    const totals = accDetails(group);
    body.push(detailsTotalRow("Sub Total", totals, {
      bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 8,
    }));
    groupSummaries.push({ label: cfg.summaryLabel(group), totals });
    for (const k of Object.keys(grand)) grand[k] += totals[k];
  }

  body.push(detailsTotalRow("Grand Total", grand, {
    bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9,
  }));

  const summary = buildGroupSummaryPage({
    companyName, companyLogo, fromDate, toDate,
    title: cfg.summaryTitle,
    groupHeader: cfg.summaryGroupHeader,
    groupSummaries,
    grandTotals: grand,
    totalCols: DT_TOTAL_COLS,
  });

  return buildPage({
    companyName, companyLogo, title: cfg.title, fromDate, toDate,
    tables: [{ table: { headerRows: 1, dontBreakRows: true, widths: DT_WIDTHS, body }, layout: tableLayout() }],
    summary,
  });
}

// ---------------------------------------------------------------------------
// PENDING report — shared 11-column flat table (Order/Received/Pending qty).
// ---------------------------------------------------------------------------
const PD_HEADERS = [
  "S.No", "Order No", "Date", "Supplier Name", "Item Name", "UOM",
  "Order Qty", "Recv Qty", "Pend Qty", "Rate", "Pend Amount",
];
// Single flexible (*) column (Item Name); Supplier fixed — same as Details, to
// avoid the two-* right-edge overflow.
const PD_WIDTHS = [22, 42, 46, 140, "*", 40, 52, 52, 52, 46, 60];
const PD_NCOLS = PD_HEADERS.length; // 11
const PD_WRAP = { supplier: 26, item: 32 };
const PD_TOTAL_COLS = [
  { header: "Order Qty", key: "po", digits: 3 },
  { header: "Received Qty", key: "recv", digits: 3 },
  { header: "Pending Qty", key: "pend", digits: 3 },
  { header: "Pending Amount", key: "amount" },
];

function pendingRow(r, sno, zebra) {
  const supplier = str(r, "SupplierName");
  const item = str(r, "ItemName");
  const sL = estimateLines(supplier, PD_WRAP.supplier);
  const iL = estimateLines(item, PD_WRAP.item);
  const maxLines = Math.max(1, sL, iL);
  const cell = (text, align = "left", cellLines = 1) => ({
    text, alignment: align, fontSize: 8, fillColor: zebra,
    margin: [0, topPadFor(maxLines, cellLines), 0, 0],
  });
  return [
    cell(String(sno), "center"),
    cell(str(r, "PurchaseOrderNo"), "center"),
    cell(ddmmyyyy(r.PurchaseOrderDate), "center"),
    cell(supplier, "left", sL),
    cell(item, "left", iL),
    cell(str(r, "ItemUomName"), "center"),
    cell(fmt(dec(r, "POQty"), 3), "right"),
    cell(fmt(dec(r, "PORQty"), 3), "right"),
    cell(fmt(dec(r, "PendingQty"), 3), "right"),
    cell(fmt(dec(r, "Rate"), 2), "right"),
    cell(fmt(dec(r, "PendingAmount"), 2), "right"),
  ];
}

function accPending(group) {
  const t = { po: 0, recv: 0, pend: 0, amount: 0 };
  for (const r of group) {
    t.po += dec(r, "POQty");
    t.recv += dec(r, "PORQty");
    t.pend += dec(r, "PendingQty");
    t.amount += dec(r, "PendingAmount");
  }
  return t;
}

// Sub/Grand row: label spans S.No..UOM (6 cells), then Order/Recv/Pend qty, a
// blank under Rate, then Pending Amount.
function pendingTotalRow(label, t, style) {
  return [
    { text: label, colSpan: 6, alignment: "right", ...style },
    {}, {}, {}, {}, {},
    { text: fmt(t.po, 3), alignment: "right", ...style },
    { text: fmt(t.recv, 3), alignment: "right", ...style },
    { text: fmt(t.pend, 3), alignment: "right", ...style },
    { text: "", ...style },
    { text: fmt(t.amount, 2), alignment: "right", ...style },
  ];
}

const PENDING_CONFIGS = {
  date: {
    title: "INWARD PENDING - DATE WISE",
    summaryTitle: "INWARD PENDING SUMMARY - DATE WISE",
    fileName: "PurchaseOrderPending_DateWise",
    summaryGroupHeader: "Date",
    groupKey: (r) => dateKey(r.PurchaseOrderDate),
    sortKey: (k) => k,
    groupLabel: (g) => "Date : " + ddmmyyyy(g[0].PurchaseOrderDate),
    summaryLabel: (g) => ddmmyyyy(g[0].PurchaseOrderDate),
  },
  supplier: {
    title: "INWARD PENDING - SUPPLIER WISE",
    summaryTitle: "INWARD PENDING SUMMARY - SUPPLIER WISE",
    fileName: "PurchaseOrderPending_SupplierWise",
    summaryGroupHeader: "Supplier Name",
    groupKey: (r) => String(r.SupplierCode ?? "0"),
    groupLabel: (g) => "Supplier : " + str(g[0], "SupplierName"),
    summaryLabel: (g) => str(g[0], "SupplierName"),
  },
  item: {
    title: "INWARD PENDING - ITEM WISE",
    summaryTitle: "INWARD PENDING SUMMARY - ITEM WISE",
    fileName: "PurchaseOrderPending_ItemWise",
    summaryGroupHeader: "Item",
    groupKey: (r) => String(r.ItemCode ?? "0"),
    groupLabel: (g) =>
      "Item : " + str(g[0], "ItemName") + (str(g[0], "ItemUomName") ? " - " + str(g[0], "ItemUomName") : ""),
    summaryLabel: (g) =>
      str(g[0], "ItemName") + (str(g[0], "ItemUomName") ? " - " + str(g[0], "ItemUomName") : ""),
  },
  category: {
    title: "INWARD PENDING - CATEGORY WISE",
    summaryTitle: "INWARD PENDING SUMMARY - CATEGORY WISE",
    fileName: "PurchaseOrderPending_CategoryWise",
    summaryGroupHeader: "Item Category",
    groupKey: (r) => String(r.ItemCategoryCode ?? "0"),
    groupLabel: (g) => "Category : " + str(g[0], "ItemCategoryName"),
    summaryLabel: (g) => str(g[0], "ItemCategoryName"),
  },
};

function buildPendingDoc({ rows, companyName, companyLogo, fromDate, toDate, cfg }) {
  const groupsMap = new Map();
  for (const r of rows) {
    const k = cfg.groupKey(r);
    if (!groupsMap.has(k)) groupsMap.set(k, []);
    groupsMap.get(k).push(r);
  }
  const sortVal = cfg.sortKey || ((k, g) => String(cfg.summaryLabel(g)).toLowerCase());
  const entries = [...groupsMap.entries()].sort((a, b) =>
    String(sortVal(a[0], a[1])).localeCompare(String(sortVal(b[0], b[1])))
  );

  const body = [headerRow(PD_HEADERS)];
  let sno = 1;
  const grand = { po: 0, recv: 0, pend: 0, amount: 0 };
  const groupSummaries = [];

  for (const [, group] of entries) {
    body.push([
      {
        text: cfg.groupLabel(group), colSpan: PD_NCOLS, bold: true,
        color: colors.groupText, fillColor: colors.groupFill, fontSize: 9, margin: [2, 2, 0, 2],
      },
      ...Array(PD_NCOLS - 1).fill({}),
    ]);
    let idx = 0;
    for (const r of group) {
      body.push(pendingRow(r, sno, idx % 2 === 1 ? colors.zebraFill : null));
      sno++;
      idx++;
    }
    const totals = accPending(group);
    body.push(pendingTotalRow("Sub Total", totals, {
      bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 8,
    }));
    groupSummaries.push({ label: cfg.summaryLabel(group), totals });
    for (const k of Object.keys(grand)) grand[k] += totals[k];
  }

  body.push(pendingTotalRow("Grand Total", grand, {
    bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9,
  }));

  const summary = buildGroupSummaryPage({
    companyName, companyLogo, fromDate, toDate,
    title: cfg.summaryTitle,
    groupHeader: cfg.summaryGroupHeader,
    groupSummaries,
    grandTotals: grand,
    totalCols: PD_TOTAL_COLS,
  });

  return buildPage({
    companyName, companyLogo, title: cfg.title, fromDate, toDate,
    tables: [{ table: { headerRows: 1, dontBreakRows: true, widths: PD_WIDTHS, body }, layout: tableLayout() }],
    summary,
  });
}

// ---- handlers --------------------------------------------------------------

// Details (Date / Supplier / Item / Category / Cost Head / PO Closure).
export const purchaseOrderReport = (req, res) => {
  const groupBy = String(req.query.groupBy || "date").toLowerCase();
  const cfg = DETAILS_CONFIGS[groupBy] || DETAILS_CONFIGS.date;
  return runReport(req, res, {
    spName: "sp_PurchaseOrderDetails_GetAll",
    fileName: cfg.fileName,
    spParams: (p) => ({
      FromDate: { type: sql.DateTime, value: p.FromDate ? new Date(p.FromDate) : null },
      ToDate: { type: sql.DateTime, value: p.ToDate ? new Date(p.ToDate) : null },
      CompanyCode: { type: sql.Int, value: parseInt(p.CompanyCode) || 0 },
    }),
    buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate, query }) => {
      const filtered = applyApproval(applyPoFilters(rows, query), query);
      return buildDetailsDoc({ rows: filtered, companyName, companyLogo, fromDate, toDate, cfg });
    },
  });
};

// Pending (Date / Supplier / Item / Category) — @Pending forced to 1, exactly
// like the VB. The PO-status radio is intentionally NOT applied here.
export const purchaseOrderPendingReport = (req, res) => {
  const groupBy = String(req.query.groupBy || "date").toLowerCase();
  const cfg = PENDING_CONFIGS[groupBy] || PENDING_CONFIGS.date;
  return runReport(req, res, {
    spName: "sp_RptPurchaseOrderDetailsPending",
    fileName: cfg.fileName,
    spParams: (p) => ({
      FromDate: { type: sql.DateTime, value: p.FromDate ? new Date(p.FromDate) : null },
      ToDate: { type: sql.DateTime, value: p.ToDate ? new Date(p.ToDate) : null },
      CompanyCode: { type: sql.Int, value: parseInt(p.CompanyCode) || 0 },
      Pending: { type: sql.Int, value: 1 },
    }),
    buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate, query }) =>
      buildPendingDoc({ rows: applyPoFilters(rows, query), companyName, companyLogo, fromDate, toDate, cfg }),
  });
};

// ---- filter option lists ---------------------------------------------------
// One endpoint feeding the left-rail dropdowns. Lookups mirror the VB
// Bind_Data() sources (PO-specific lookup SPs for Supplier/Department/Category/
// Item/Employee; plain master selects for Cost Head/Purchase Mode/Usage Type/
// Item Group; company-scoped views for Requisition No / Pur.Order No). Company
// comes from the viewer's built-in Company filter (passed as ?CompanyCode=).
// Each lookup degrades to [] on its own error so one missing SP/table can't
// sink the whole options call. SQL 2008 safe. NO SP is modified.
export const purchaseOrderReportOptions = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type("text/plain").send("Missing subDBName header");
    const pool = await getPool(subDbName);
    const companyCode = parseInt(req.query.CompanyCode) || 0;

    const q = (text) => pool.request().query(text).then((r) => r.recordset || []).catch(() => []);
    const exec = (spName) => pool.request().execute(spName).then((r) => r.recordset || []).catch(() => []);
    const scoped = (text) =>
      companyCode
        ? pool.request().input("CompanyCode", sql.Int, companyCode).query(text)
            .then((r) => r.recordset || []).catch(() => [])
        : Promise.resolve([]);

    const [
      costHeads, purchaseModes, usageTypes, itemGroups,
      suppliers, departments, itemCategories, items, employees,
      requisitions, purchaseOrders,
    ] = await Promise.all([
      q("SELECT CostHeadCode, CostHeadName FROM tbl_CostHead ORDER BY CostHeadName"),
      q("SELECT PurchaseModeCode, PurchaseMode FROM tbl_PurchaseMode ORDER BY PurchaseMode"),
      q("SELECT UsageTypeCode, UsageTypeName FROM tbl_UsageType ORDER BY UsageTypeName"),
      q("SELECT ItemGroupCode, ItemGroupName FROM tbl_ItemGroup ORDER BY ItemGroupName"),
      exec("sp_PurchaseOrder_Report_GetbySupplier"),
      exec("sp_PurchaseOrder_Report_GetbyDepartment"),
      exec("sp_PurchaseOrder_Report_GetbyItemCategory"),
      exec("sp_PurchaseOrder_Report_GetbyItem"),
      exec("sp_PurchaseOrder_Report_GetbyEmployee"),
      scoped(
        "SELECT strItemRequisitionNo, ItemRequisitionCode FROM vw_ItemRequisitionNo_WithDepartment " +
        "WHERE CompanyCode = @CompanyCode ORDER BY strItemRequisitionNo"
      ),
      scoped(
        "SELECT CONVERT(varchar, PurchaseOrderNo) + ' - ' + CONVERT(varchar, PurchaseOrderDate, 103) AS strPurchaseOrderNo, " +
        "PurchaseOrderCode FROM tbl_PurchaseOrder WHERE CompanyCode = @CompanyCode ORDER BY PurchaseOrderNo DESC"
      ),
    ]);

    const map = (rows, codeKey, nameKey) =>
      rows.map((r) => ({ value: r[codeKey], label: r[nameKey] }));

    return res.json({
      suppliers: map(suppliers, "SupplierCode", "SupplierName"),
      purchaseModes: map(purchaseModes, "PurchaseModeCode", "PurchaseMode"),
      requisitions: map(requisitions, "ItemRequisitionCode", "strItemRequisitionNo"),
      purchaseOrders: map(purchaseOrders, "PurchaseOrderCode", "strPurchaseOrderNo"),
      costHeads: map(costHeads, "CostHeadCode", "CostHeadName"),
      departments: map(departments, "DepartmentCode", "DepartmentName"),
      itemGroups: map(itemGroups, "ItemGroupCode", "ItemGroupName"),
      itemCategories: map(itemCategories, "ItemCategoryCode", "ItemCategoryName"),
      items: map(items, "ItemCode", "ItemName"),
      usageTypes: map(usageTypes, "UsageTypeCode", "UsageTypeName"),
      employees: map(employees, "EmployeeCode", "EmployeeName"),
    });
  } catch (err) {
    console.error("purchaseOrderReportOptions:", err);
    return res.status(500).type("text/plain").send("ERROR: " + err.message);
  }
};
