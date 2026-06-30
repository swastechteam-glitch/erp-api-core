// =============================================================================
// Store ▸ Inward Report (port of WinForms rptPurchaseOrderReceivedDetails)
// =============================================================================
// One screen, many report types — built in the shared pdfmake convention
// (controllers/report/cotton/_common.js), exactly like the Purchase Order /
// Purchase Requisition Report siblings. The legacy RDLCs are NOT consumed; each
// grouping is a hand-written pdfmake template.
//
// TWO stored procedures (the report type's *kind* decides which one runs, from
// tbl_Reports — never from a checkbox):
//
//   DETAILS  → sp_RptPurchaseOrderReceivedDetails
//       @InwardDateBased, @Pending, [@CompanyCode>0], @FromDate, @ToDate,
//       @WithImage=0, [@Paid]   (@Paid OMITTED when payment = All)
//     groupBy = inward | supplier | item | category | costhead | department | po
//               | rateanalysis | grn | groupabstract | groupitemabstract | monthitem
//     → endpoint /store/reports/inward
//
//   ABSTRACT → sp_RptPurchaseOrderReceived
//       @FromDate, @ToDate, [@CompanyCode>0], @InwardDateBased, @Pending, [@Paid]
//     groupBy = inwardwise | invoicewise | supplierabstract
//     → endpoint /store/reports/inward-abstract
//
// Like the legacy screen, the multi-select dropdowns are NOT passed to the SP:
// the SP returns the full recordset for Company + date range + flags, then we
// narrow it in-memory with IN(...) on the code columns (DataTable.Select). The
// detail filters chain on the Details rows; only Supplier / Inward No apply to
// the Abstract rows (the abstract recordset exposes only those codes). NO SP is
// modified. Datetimes are local IST — never timezone-converted.
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
// Each spec applies only to recordsets that actually expose its column.
// ---------------------------------------------------------------------------
const DETAILS_SPECS = [
  { param: "CostHeadCode", col: "CostHeadCode" },
  { param: "ItemCategoryCode", col: "ItemCategoryCode" },
  { param: "DepartmentCode", col: "DepartmentCode" },
  { param: "ItemCode", col: "ItemCode" },
  { param: "SupplierCode", col: "SupplierCode" },
  { param: "PurchaseOrderCode", col: "PurchaseOrderCode" },
  { param: "PurchaseOrderReceivedCode", col: "PurchaseOrderReceivedCode" },
];
const ABSTRACT_SPECS = [
  { param: "SupplierCode", col: "SupplierCode" },
  { param: "PurchaseOrderReceivedCode", col: "PurchaseOrderReceivedCode" },
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

function applyFilters(rows, query = {}, specs = DETAILS_SPECS) {
  if (!Array.isArray(rows) || rows.length === 0) return rows || [];
  const sample = rows[0];
  const active = [];
  for (const spec of specs) {
    const set = parseCodeSet(query[spec.param]);
    if (!set) continue;
    if (!Object.prototype.hasOwnProperty.call(sample, spec.col)) continue;
    active.push({ col: spec.col, set });
  }
  if (!active.length) return rows;
  return rows.filter((r) => active.every(({ col, set }) => set.has(String(r[col]))));
}

// ---- value helpers ---------------------------------------------------------
const gstOf = (r) => dec(r, "CGSTAmount") + dec(r, "SGSTAmount") + dec(r, "IGSTAmount");
// Detail rounding column is RoundedItem on most layouts, Roundedoff on a few.
const rndOf = (r) =>
  Object.prototype.hasOwnProperty.call(r, "RoundedItem")
    ? dec(r, "RoundedItem")
    : dec(r, "Roundedoff");

const dateKey = (d) => {
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "0000-00-00" : dt.toISOString().slice(0, 10);
};
const monthOrder = (d) => {
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "9999-99" : dt.toISOString().slice(0, 7);
};

const headerRow = (headers) =>
  headers.map((t) => ({
    text: t, bold: true, fillColor: colors.headerFill, color: colors.headerText,
    alignment: "center", fontSize: 8,
  }));

// Shared SP flags read from the query (set by the ReportViewer mode groups).
function commonFlags(req) {
  const q = req.query || {};
  const inward = String(q.InwardDateBased) === "0" ? 0 : 1; // default Inward Based
  const pending = String(q.Pending) === "1" ? 1 : 0;
  const paid = q.Paid === "0" || q.Paid === "1" ? parseInt(q.Paid) : null; // null = All -> omit
  return { inward, pending, paid };
}

// =============================================================================
// DETAILS — standard shared table (Inward / Supplier / Item / Category /
// Cost Head / Department / PO Wise). GST = CGST+SGST+IGST, P & F = PFAmount.
// The grouping column lives in the group header, so one 14-col table serves all.
// =============================================================================
const ID_HEADERS = [
  "S.No", "Inward No", "Date", "Supplier Name", "Item Name", "Qty", "Rate",
  "Amount", "Disc", "Other", "GST", "P & F", "RND", "Net Amount",
];
// One flexible (*) column — Item Name; Supplier fixed (wraps internally). Fixed
// widths + one * fill the A4-landscape page exactly (same single-* pattern as
// the Purchase Order Report, which avoids the two-* right-edge clipping).
const ID_WIDTHS = [20, 40, 44, 86, "*", 36, 44, 52, 44, 42, 48, 42, 30, 54];
const ID_NCOLS = ID_HEADERS.length; // 14
const ID_WRAP = { supplier: 16, item: 24 };
const ID_TOTAL_COLS = [
  { header: "Amount", key: "amount" },
  { header: "Disc", key: "disc" },
  { header: "Other", key: "other" },
  { header: "GST", key: "gst" },
  { header: "P & F", key: "pf" },
  { header: "RND", key: "rnd" },
  { header: "Net Amount", key: "net" },
];

function detailsRow(r, sno, zebra) {
  const supplier = str(r, "SupplierName");
  const item = str(r, "ItemName");
  const sL = estimateLines(supplier, ID_WRAP.supplier);
  const iL = estimateLines(item, ID_WRAP.item);
  const maxLines = Math.max(1, sL, iL);
  const cell = (text, align = "left", cellLines = 1) => ({
    text, alignment: align, fontSize: 8, fillColor: zebra,
    margin: [0, topPadFor(maxLines, cellLines), 0, 0],
  });
  return [
    cell(String(sno), "center"),
    cell(str(r, "PurchaseOrderReceivedNo"), "center"),
    cell(ddmmyyyy(r.PurchaseOrderReceivedDate), "center"),
    cell(supplier, "left", sL),
    cell(item, "left", iL),
    cell(fmt(dec(r, "Qty"), 3), "right"),
    cell(fmt(dec(r, "Rate"), 2), "right"),
    cell(fmt(dec(r, "Amount"), 2), "right"),
    cell(fmt(dec(r, "DiscountAmount"), 2), "right"),
    cell(fmt(dec(r, "OtherExpenses"), 2), "right"),
    cell(fmt(gstOf(r), 2), "right"),
    cell(fmt(dec(r, "PFAmount"), 2), "right"),
    cell(fmt(rndOf(r), 2), "right"),
    cell(fmt(dec(r, "NetAmount"), 2), "right"),
  ];
}

function accDetails(group) {
  const t = { amount: 0, disc: 0, other: 0, gst: 0, pf: 0, rnd: 0, net: 0 };
  for (const r of group) {
    t.amount += dec(r, "Amount");
    t.disc += dec(r, "DiscountAmount");
    t.other += dec(r, "OtherExpenses");
    t.gst += gstOf(r);
    t.pf += dec(r, "PFAmount");
    t.rnd += rndOf(r);
    t.net += dec(r, "NetAmount");
  }
  return t;
}

// Sub/Grand row: label spans S.No..Rate (7 cells), then the 7 money totals.
function detailsTotalRow(label, t, style) {
  return [
    { text: label, colSpan: 7, alignment: "right", ...style },
    {}, {}, {}, {}, {}, {},
    ...ID_TOTAL_COLS.map((c) => ({ text: fmt(t[c.key]), alignment: "right", ...style })),
  ];
}

const DETAILS_CONFIGS = {
  inward: {
    title: "INWARD DETAILS",
    summaryTitle: "INWARD SUMMARY",
    fileName: "Inward_Details",
    summaryGroupHeader: "Inward No",
    groupKey: (r) => String(r.PurchaseOrderReceivedCode ?? "0"),
    sortKey: (k, g) => monthOrder(g[0].PurchaseOrderReceivedDate) + "|" + str(g[0], "PurchaseOrderReceivedNo"),
    groupLabel: (g) =>
      "Inward No : " + str(g[0], "PurchaseOrderReceivedNo") + "  (" + ddmmyyyy(g[0].PurchaseOrderReceivedDate) + ")",
    summaryLabel: (g) =>
      str(g[0], "PurchaseOrderReceivedNo") + " - " + ddmmyyyy(g[0].PurchaseOrderReceivedDate),
  },
  supplier: {
    title: "INWARD DETAILS - SUPPLIER WISE",
    summaryTitle: "INWARD SUMMARY - SUPPLIER WISE",
    fileName: "Inward_SupplierWise",
    summaryGroupHeader: "Supplier Name",
    groupKey: (r) => String(r.SupplierCode ?? "0"),
    groupLabel: (g) => "Supplier : " + str(g[0], "SupplierName"),
    summaryLabel: (g) => str(g[0], "SupplierName"),
  },
  item: {
    title: "INWARD DETAILS - ITEM WISE",
    summaryTitle: "INWARD SUMMARY - ITEM WISE",
    fileName: "Inward_ItemWise",
    summaryGroupHeader: "Item",
    groupKey: (r) => String(r.ItemCode ?? "0"),
    groupLabel: (g) => "Item : " + str(g[0], "ItemName"),
    summaryLabel: (g) => str(g[0], "ItemName"),
  },
  category: {
    title: "INWARD DETAILS - CATEGORY WISE",
    summaryTitle: "INWARD SUMMARY - CATEGORY WISE",
    fileName: "Inward_CategoryWise",
    summaryGroupHeader: "Item Category",
    groupKey: (r) => String(r.ItemCategoryCode ?? "0"),
    groupLabel: (g) => "Category : " + str(g[0], "ItemCategoryName"),
    summaryLabel: (g) => str(g[0], "ItemCategoryName"),
  },
  costhead: {
    title: "INWARD DETAILS - COST HEAD WISE",
    summaryTitle: "INWARD SUMMARY - COST HEAD WISE",
    fileName: "Inward_CostHeadWise",
    summaryGroupHeader: "Cost Head",
    groupKey: (r) => String(r.CostHeadCode ?? "0"),
    groupLabel: (g) => "Cost Head : " + str(g[0], "CostHeadName"),
    summaryLabel: (g) => str(g[0], "CostHeadName"),
  },
  department: {
    title: "INWARD DETAILS - DEPARTMENT WISE",
    summaryTitle: "INWARD SUMMARY - DEPARTMENT WISE",
    fileName: "Inward_DepartmentWise",
    summaryGroupHeader: "Department",
    groupKey: (r) => String(r.DepartmentCode ?? "0"),
    groupLabel: (g) => "Department : " + str(g[0], "DepartmentName"),
    summaryLabel: (g) => str(g[0], "DepartmentName"),
  },
  po: {
    title: "INWARD DETAILS - PURCHASE ORDER WISE",
    summaryTitle: "INWARD SUMMARY - PURCHASE ORDER WISE",
    fileName: "Inward_POWise",
    summaryGroupHeader: "PO No",
    groupKey: (r) => String(r.PurchaseOrderCode ?? "0"),
    groupLabel: (g) => "PO No : " + str(g[0], "PurchaseOrderNo"),
    summaryLabel: (g) => str(g[0], "PurchaseOrderNo"),
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

  const body = [headerRow(ID_HEADERS)];
  let sno = 1;
  const grand = { amount: 0, disc: 0, other: 0, gst: 0, pf: 0, rnd: 0, net: 0 };
  const groupSummaries = [];

  for (const [, group] of entries) {
    body.push([
      {
        text: cfg.groupLabel(group), colSpan: ID_NCOLS, bold: true,
        color: colors.groupText, fillColor: colors.groupFill, fontSize: 9, margin: [2, 2, 0, 2],
      },
      ...Array(ID_NCOLS - 1).fill({}),
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
    totalCols: ID_TOTAL_COLS,
  });

  return buildPage({
    companyName, companyLogo, title: cfg.title, fromDate, toDate,
    tables: [{ table: { headerRows: 1, dontBreakRows: true, widths: ID_WIDTHS, body }, layout: tableLayout() }],
    summary,
  });
}

// =============================================================================
// ABSTRACT (SP-B sp_RptPurchaseOrderReceived) — GRN-header totals grouped by
// supplier. One unified layout serves the three abstract types (Inward Wise /
// Supplier Invoice Wise / Supplier Wise Abstract), differing only by title.
// =============================================================================
const AB_HEADERS = [
  "S.No", "Inward No", "Date", "Invoice No", "Inv Date", "Supplier Name",
  "Qty", "Amount", "Disc", "Other", "Gross", "Tax", "P & F", "RND", "Net Amount",
];
const AB_WIDTHS = [18, 38, 42, 56, 42, "*", 38, 50, 44, 42, 50, 46, 42, 28, 52];
const AB_NCOLS = AB_HEADERS.length; // 15
const AB_WRAP = { supplier: 18 };
const AB_TOTAL_COLS = [
  { header: "Total Qty", key: "qty", digits: 3 },
  { header: "Gross", key: "gross" },
  { header: "Tax", key: "tax" },
  { header: "Net Amount", key: "net" },
];

function abstractRow(r, sno, zebra) {
  const supplier = str(r, "SupplierName");
  const sL = estimateLines(supplier, AB_WRAP.supplier);
  const maxLines = Math.max(1, sL);
  const cell = (text, align = "left", cellLines = 1) => ({
    text, alignment: align, fontSize: 8, fillColor: zebra,
    margin: [0, topPadFor(maxLines, cellLines), 0, 0],
  });
  return [
    cell(String(sno), "center"),
    cell(str(r, "PurchaseOrderReceivedNo"), "center"),
    cell(ddmmyyyy(r.PurchaseOrderReceivedDate), "center"),
    cell(str(r, "InvoiceNo"), "center"),
    cell(r.InvoiceNo ? ddmmyyyy(r.InvoiceDate) : "", "center"),
    cell(supplier, "left", sL),
    cell(fmt(dec(r, "TotalQty"), 3), "right"),
    cell(fmt(dec(r, "TotalAmount"), 2), "right"),
    cell(fmt(dec(r, "TotalDiscountAmount"), 2), "right"),
    cell(fmt(dec(r, "TotalOtherExpenses"), 2), "right"),
    cell(fmt(dec(r, "TotalGrossAmount"), 2), "right"),
    cell(fmt(dec(r, "TotalTaxAmount"), 2), "right"),
    cell(fmt(dec(r, "TotalPFAmount"), 2), "right"),
    cell(fmt(dec(r, "TotalRoundedOff"), 2), "right"),
    cell(fmt(dec(r, "TotalNetAmount"), 2), "right"),
  ];
}

function accAbstract(group) {
  const t = { qty: 0, amount: 0, disc: 0, other: 0, gross: 0, tax: 0, pf: 0, rnd: 0, net: 0 };
  for (const r of group) {
    t.qty += dec(r, "TotalQty");
    t.amount += dec(r, "TotalAmount");
    t.disc += dec(r, "TotalDiscountAmount");
    t.other += dec(r, "TotalOtherExpenses");
    t.gross += dec(r, "TotalGrossAmount");
    t.tax += dec(r, "TotalTaxAmount");
    t.pf += dec(r, "TotalPFAmount");
    t.rnd += dec(r, "TotalRoundedOff");
    t.net += dec(r, "TotalNetAmount");
  }
  return t;
}

// Label spans S.No..Supplier (6 cells), then 9 numeric totals.
function abstractTotalRow(label, t, style) {
  return [
    { text: label, colSpan: 6, alignment: "right", ...style },
    {}, {}, {}, {}, {},
    { text: fmt(t.qty, 3), alignment: "right", ...style },
    { text: fmt(t.amount), alignment: "right", ...style },
    { text: fmt(t.disc), alignment: "right", ...style },
    { text: fmt(t.other), alignment: "right", ...style },
    { text: fmt(t.gross), alignment: "right", ...style },
    { text: fmt(t.tax), alignment: "right", ...style },
    { text: fmt(t.pf), alignment: "right", ...style },
    { text: fmt(t.rnd), alignment: "right", ...style },
    { text: fmt(t.net), alignment: "right", ...style },
  ];
}

const ABSTRACT_CONFIGS = {
  inwardwise: { title: "INWARD - SUPPLIER WISE", summaryTitle: "INWARD SUMMARY - SUPPLIER WISE", fileName: "Inward_InwardWise" },
  invoicewise: { title: "INWARD - SUPPLIER INVOICE WISE", summaryTitle: "INWARD SUMMARY - SUPPLIER INVOICE WISE", fileName: "Inward_InvoiceWise" },
  supplierabstract: { title: "INWARD SUMMARY - SUPPLIER WISE", summaryTitle: "INWARD SUMMARY - SUPPLIER WISE", fileName: "Inward_SupplierAbstract" },
};

function buildAbstractDoc({ rows, companyName, companyLogo, fromDate, toDate, cfg }) {
  const groupsMap = new Map();
  for (const r of rows) {
    const k = String(r.SupplierCode ?? "0");
    if (!groupsMap.has(k)) groupsMap.set(k, []);
    groupsMap.get(k).push(r);
  }
  const entries = [...groupsMap.entries()].sort((a, b) =>
    str(a[1][0], "SupplierName").toLowerCase().localeCompare(str(b[1][0], "SupplierName").toLowerCase())
  );

  const body = [headerRow(AB_HEADERS)];
  let sno = 1;
  const grand = { qty: 0, amount: 0, disc: 0, other: 0, gross: 0, tax: 0, pf: 0, rnd: 0, net: 0 };
  const groupSummaries = [];

  for (const [, group] of entries) {
    body.push([
      {
        text: "Supplier : " + str(group[0], "SupplierName"), colSpan: AB_NCOLS, bold: true,
        color: colors.groupText, fillColor: colors.groupFill, fontSize: 9, margin: [2, 2, 0, 2],
      },
      ...Array(AB_NCOLS - 1).fill({}),
    ]);
    let idx = 0;
    for (const r of group) {
      body.push(abstractRow(r, sno, idx % 2 === 1 ? colors.zebraFill : null));
      sno++;
      idx++;
    }
    const totals = accAbstract(group);
    body.push(abstractTotalRow("Sub Total", totals, {
      bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 8,
    }));
    groupSummaries.push({ label: str(group[0], "SupplierName"), totals });
    for (const k of Object.keys(grand)) grand[k] += totals[k];
  }

  body.push(abstractTotalRow("Grand Total", grand, {
    bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9,
  }));

  const summary = buildGroupSummaryPage({
    companyName, companyLogo, fromDate, toDate,
    title: cfg.summaryTitle,
    groupHeader: "Supplier Name",
    groupSummaries,
    grandTotals: grand,
    totalCols: AB_TOTAL_COLS,
  });

  return buildPage({
    companyName, companyLogo, title: cfg.title, fromDate, toDate,
    tables: [{ table: { headerRows: 1, dontBreakRows: true, widths: AB_WIDTHS, body }, layout: tableLayout() }],
    summary,
  });
}

// =============================================================================
// SPECIALISED DETAILS layouts
// =============================================================================

// Rate Analysis — per item, the suppliers / rates / dates (sorted by date).
function buildRateAnalysisDoc({ rows, companyName, companyLogo, fromDate, toDate }) {
  const groupsMap = new Map();
  for (const r of rows) {
    const k = String(r.ItemCode ?? "0");
    if (!groupsMap.has(k)) groupsMap.set(k, []);
    groupsMap.get(k).push(r);
  }
  const entries = [...groupsMap.entries()].sort((a, b) =>
    str(a[1][0], "ItemName").toLowerCase().localeCompare(str(b[1][0], "ItemName").toLowerCase())
  );

  const HEAD = ["S.No", "Supplier Name", "Rate", "Purchase Date"];
  const body = [headerRow(HEAD)];
  for (const [, group] of entries) {
    body.push([
      { text: "Item : " + str(group[0], "ItemName"), colSpan: 4, bold: true, color: colors.groupText, fillColor: colors.groupFill, fontSize: 9, margin: [2, 2, 0, 2] },
      {}, {}, {},
    ]);
    const sorted = [...group].sort((x, y) => dateKey(x.PurchaseOrderReceivedDate).localeCompare(dateKey(y.PurchaseOrderReceivedDate)));
    sorted.forEach((r, i) => {
      const zebra = i % 2 === 1 ? colors.zebraFill : null;
      body.push([
        { text: String(i + 1), alignment: "center", fontSize: 8, fillColor: zebra },
        { text: str(r, "SupplierName"), alignment: "left", fontSize: 8, fillColor: zebra },
        { text: fmt(dec(r, "Rate"), 2), alignment: "right", fontSize: 8, fillColor: zebra },
        { text: ddmmyyyy(r.PurchaseOrderReceivedDate), alignment: "center", fontSize: 8, fillColor: zebra },
      ]);
    });
  }
  return buildPage({
    companyName, companyLogo, title: "RATE ANALYSIS", fromDate, toDate,
    tables: [{ table: { headerRows: 1, dontBreakRows: true, widths: [34, "*", 110, 130], body }, layout: tableLayout() }],
  });
}

// Goods Received Note — register grouped per GRN; item lines (no money totals).
function buildGrnNoteDoc({ rows, companyName, companyLogo, fromDate, toDate }) {
  const groupsMap = new Map();
  for (const r of rows) {
    const k = String(r.PurchaseOrderReceivedCode ?? "0");
    if (!groupsMap.has(k)) groupsMap.set(k, []);
    groupsMap.get(k).push(r);
  }
  const entries = [...groupsMap.entries()].sort((a, b) =>
    str(a[1][0], "PurchaseOrderReceivedNo").localeCompare(str(b[1][0], "PurchaseOrderReceivedNo"))
  );

  const HEAD = ["S.No", "PO No", "PO Date", "Invoice No", "Inv Date", "Item Name", "UOM", "Qty", "Remarks"];
  const WID = [22, 44, 50, 60, 50, "*", 48, 56, 140];
  const body = [headerRow(HEAD)];
  for (const [, group] of entries) {
    const g0 = group[0];
    body.push([
      {
        text:
          "GRN No : " + str(g0, "PurchaseOrderReceivedNo") +
          "   Date : " + ddmmyyyy(g0.PurchaseOrderReceivedDate) +
          "   Supplier : " + str(g0, "SupplierName"),
        colSpan: HEAD.length, bold: true, color: colors.groupText, fillColor: colors.groupFill, fontSize: 9, margin: [2, 2, 0, 2],
      },
      ...Array(HEAD.length - 1).fill({}),
    ]);
    group.forEach((r, i) => {
      const zebra = i % 2 === 1 ? colors.zebraFill : null;
      const cell = (text, align = "left") => ({ text, alignment: align, fontSize: 8, fillColor: zebra });
      body.push([
        cell(String(i + 1), "center"),
        cell(str(r, "PurchaseOrderNo"), "center"),
        cell(ddmmyyyy(r.PurchaseOrderDate), "center"),
        cell(str(r, "InvoiceNo"), "center"),
        cell(r.InvoiceNo ? ddmmyyyy(r.InvoiceDate) : "", "center"),
        cell(str(r, "ItemName"), "left"),
        cell(str(r, "ItemUOMName"), "center"),
        cell(fmt(dec(r, "Qty"), 3), "right"),
        cell(str(r, "Remarks"), "left"),
      ]);
    });
  }
  return buildPage({
    companyName, companyLogo, title: "GOODS RECEIPT NOTE", fromDate, toDate,
    tables: [{ table: { headerRows: 1, dontBreakRows: true, widths: WID, body }, layout: tableLayout() }],
  });
}

// Group Wise Abstract — Item Group → value (sum of GrossAmount). + summary chart.
function buildGroupAbstractDoc({ rows, companyName, companyLogo, fromDate, toDate }) {
  const map = new Map();
  for (const r of rows) {
    const k = String(r.ItemGroupCode ?? "0");
    if (!map.has(k)) map.set(k, { name: str(r, "ItemGroupName"), value: 0 });
    map.get(k).value += dec(r, "GrossAmount");
  }
  const groups = [...map.values()].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  const grand = groups.reduce((s, g) => s + g.value, 0);

  const body = [headerRow(["S.No", "Description", "Value"])];
  groups.forEach((g, i) => {
    const zebra = i % 2 === 1 ? colors.zebraFill : null;
    body.push([
      { text: String(i + 1), alignment: "center", fontSize: 8, fillColor: zebra },
      { text: g.name, alignment: "left", fontSize: 8, fillColor: zebra },
      { text: fmt(g.value), alignment: "right", fontSize: 8, fillColor: zebra },
    ]);
  });
  body.push([
    { text: "Total", colSpan: 2, alignment: "right", bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 },
    {},
    { text: fmt(grand), alignment: "right", bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 },
  ]);
  return buildPage({
    companyName, companyLogo, title: "MAJOR GROUP WISE PURCHASE", fromDate, toDate,
    tables: [{ table: { headerRows: 1, dontBreakRows: true, widths: [40, "*", 140], body }, layout: tableLayout() }],
  });
}

// Group And Item Wise Abstract — Item Group → items (Qty, Value, Avg Rate).
function buildGroupItemAbstractDoc({ rows, companyName, companyLogo, fromDate, toDate }) {
  const groups = new Map();
  for (const r of rows) {
    const gk = String(r.ItemGroupCode ?? "0");
    if (!groups.has(gk)) groups.set(gk, { name: str(r, "ItemGroupName"), items: new Map() });
    const items = groups.get(gk).items;
    const ik = String(r.ItemCode ?? "0");
    if (!items.has(ik)) items.set(ik, { id: str(r, "ItemID"), name: str(r, "ItemName"), qty: 0, value: 0 });
    const it = items.get(ik);
    it.qty += dec(r, "Qty");
    it.value += dec(r, "GrossAmount");
  }
  const entries = [...groups.values()].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

  const HEAD = ["S.No", "Item ID", "Item Name", "Qty", "Value", "Avg Rate"];
  const WID = [34, 90, "*", 80, 110, 90];
  const body = [headerRow(HEAD)];
  let grandQty = 0, grandVal = 0;
  for (const grp of entries) {
    body.push([
      { text: grp.name, colSpan: HEAD.length, bold: true, color: colors.groupText, fillColor: colors.groupFill, fontSize: 9, margin: [2, 2, 0, 2] },
      ...Array(HEAD.length - 1).fill({}),
    ]);
    const items = [...grp.items.values()].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    let gQty = 0, gVal = 0;
    items.forEach((it, i) => {
      const zebra = i % 2 === 1 ? colors.zebraFill : null;
      const avg = it.qty ? it.value / it.qty : 0;
      gQty += it.qty; gVal += it.value;
      body.push([
        { text: String(i + 1), alignment: "center", fontSize: 8, fillColor: zebra },
        { text: it.id, alignment: "left", fontSize: 8, fillColor: zebra },
        { text: it.name, alignment: "left", fontSize: 8, fillColor: zebra },
        { text: fmt(it.qty, 3), alignment: "right", fontSize: 8, fillColor: zebra },
        { text: fmt(it.value), alignment: "right", fontSize: 8, fillColor: zebra },
        { text: fmt(avg), alignment: "right", fontSize: 8, fillColor: zebra },
      ]);
    });
    body.push([
      { text: "Total", colSpan: 3, alignment: "right", bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 8 },
      {}, {},
      { text: fmt(gQty, 3), alignment: "right", bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 8 },
      { text: fmt(gVal), alignment: "right", bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 8 },
      { text: "", fillColor: colors.subFill },
    ]);
    grandQty += gQty; grandVal += gVal;
  }
  body.push([
    { text: "Grand Total", colSpan: 3, alignment: "right", bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 },
    {}, {},
    { text: fmt(grandQty, 3), alignment: "right", bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 },
    { text: fmt(grandVal), alignment: "right", bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 },
    { text: "", fillColor: colors.grandFill },
  ]);
  return buildPage({
    companyName, companyLogo, title: "MAJOR GROUP & ITEM WISE PURCHASE", fromDate, toDate,
    tables: [{ table: { headerRows: 1, dontBreakRows: true, widths: WID, body }, layout: tableLayout() }],
  });
}

// Month Wise Item Report — matrix Item (rows) x MonthYear (cols), Qty + Amount.
// A4-landscape only fits a handful of month columns (each month = Qty + Amt),
// so cap the visible months and note the truncation.
const MONTH_CAP = 6; // keep the matrix within landscape width (~811pt)
function buildMonthItemDoc({ rows, companyName, companyLogo, fromDate, toDate }) {
  // distinct months, chronological
  const monthMap = new Map();
  for (const r of rows) {
    const label = str(r, "MonthYear") || ddmmyyyy(r.PurchaseOrderReceivedDate);
    if (!label) continue;
    if (!monthMap.has(label)) monthMap.set(label, monthOrder(r.PurchaseOrderReceivedDate));
  }
  let months = [...monthMap.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([label]) => label);
  const truncated = months.length > MONTH_CAP;
  if (truncated) months = months.slice(0, MONTH_CAP);
  const monthIdx = new Map(months.map((m, i) => [m, i]));

  // item rows
  const items = new Map();
  for (const r of rows) {
    const label = str(r, "MonthYear") || ddmmyyyy(r.PurchaseOrderReceivedDate);
    if (!monthIdx.has(label)) continue;
    const ik = String(r.ItemCode ?? "0");
    if (!items.has(ik)) items.set(ik, { name: str(r, "ItemName"), cells: months.map(() => ({ qty: 0, amt: 0 })), tQty: 0, tAmt: 0 });
    const it = items.get(ik);
    const ci = monthIdx.get(label);
    it.cells[ci].qty += dec(r, "Qty");
    it.cells[ci].amt += dec(r, "Amount");
    it.tQty += dec(r, "Qty");
    it.tAmt += dec(r, "Amount");
  }
  const itemList = [...items.values()].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

  const NUM = (text, style = {}) => ({ text, alignment: "right", fontSize: 7, ...style });
  // header row 1: Item (rowSpan 2) + each month (colSpan 2) + Total (colSpan 2)
  const h1 = [{ text: "Item Name", rowSpan: 2, bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: "center", fontSize: 7, margin: [0, 6, 0, 0] }];
  for (const m of months) {
    h1.push({ text: m, colSpan: 2, bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: "center", fontSize: 7 }, {});
  }
  h1.push({ text: "Total", colSpan: 2, bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: "center", fontSize: 7 }, {});
  // header row 2: placeholder for Item rowSpan + Qty/Amt per month + Qty/Amt total
  const h2 = [{}];
  const sub = (t) => ({ text: t, bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: "center", fontSize: 7 });
  for (let i = 0; i < months.length; i++) h2.push(sub("Qty"), sub("Amt"));
  h2.push(sub("Qty"), sub("Amt"));

  const body = [h1, h2];
  const colTotals = months.map(() => ({ qty: 0, amt: 0 }));
  let gQty = 0, gAmt = 0;
  itemList.forEach((it, i) => {
    const zebra = i % 2 === 1 ? colors.zebraFill : null;
    const row = [{ text: it.name, alignment: "left", fontSize: 7, fillColor: zebra }];
    it.cells.forEach((c, ci) => {
      row.push(NUM(c.qty ? fmt(c.qty, 3) : "", { fillColor: zebra }), NUM(c.amt ? fmt(c.amt) : "", { fillColor: zebra }));
      colTotals[ci].qty += c.qty;
      colTotals[ci].amt += c.amt;
    });
    row.push(NUM(fmt(it.tQty, 3), { fillColor: zebra, bold: true }), NUM(fmt(it.tAmt), { fillColor: zebra, bold: true }));
    body.push(row);
    gQty += it.tQty; gAmt += it.tAmt;
  });
  // totals row
  const totalRow = [{ text: "Total", alignment: "right", bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 7 }];
  colTotals.forEach((c) => {
    totalRow.push(
      NUM(fmt(c.qty, 3), { bold: true, color: colors.grandText, fillColor: colors.grandFill }),
      NUM(fmt(c.amt), { bold: true, color: colors.grandText, fillColor: colors.grandFill })
    );
  });
  totalRow.push(
    NUM(fmt(gQty, 3), { bold: true, color: colors.grandText, fillColor: colors.grandFill }),
    NUM(fmt(gAmt), { bold: true, color: colors.grandText, fillColor: colors.grandFill })
  );
  body.push(totalRow);

  const widths = ["*", ...months.flatMap(() => [30, 44]), 34, 48];
  const tables = [{ table: { headerRows: 2, dontBreakRows: true, widths, body }, layout: tableLayout() }];
  if (truncated) {
    tables.push({
      text: `Showing first ${MONTH_CAP} months of the selected range — narrow the date range to see the rest.`,
      italics: true, fontSize: 8, color: "#b91c1c", margin: [0, 8, 0, 0],
    });
  }
  return buildPage({
    companyName, companyLogo, title: "INWARD - ITEM WISE (MONTH WISE) ABSTRACT", fromDate, toDate, tables,
  });
}

// ---- builder dispatch (Details SP) -----------------------------------------
const DETAILS_SPECIAL = {
  rateanalysis: { fileName: "Inward_RateAnalysis", build: buildRateAnalysisDoc },
  grn: { fileName: "Inward_GoodsReceiptNote", build: buildGrnNoteDoc },
  groupabstract: { fileName: "Inward_GroupAbstract", build: buildGroupAbstractDoc },
  groupitemabstract: { fileName: "Inward_GroupItemAbstract", build: buildGroupItemAbstractDoc },
  monthitem: { fileName: "Inward_MonthWiseItem", build: buildMonthItemDoc },
};

// =============================================================================
// Handlers
// =============================================================================

// Details — sp_RptPurchaseOrderReceivedDetails. groupBy selects the layout.
export const inwardReport = (req, res) => {
  const groupBy = String(req.query.groupBy || "inward").toLowerCase();
  const special = DETAILS_SPECIAL[groupBy];
  const cfg = DETAILS_CONFIGS[groupBy];
  const fileName = special ? special.fileName : (cfg || DETAILS_CONFIGS.inward).fileName;

  return runReport(req, res, {
    spName: "sp_RptPurchaseOrderReceivedDetails",
    fileName,
    spParams: (p, r) => {
      const { inward, pending, paid } = commonFlags(r);
      const cc = parseInt(p.CompanyCode) || 0;
      const o = {
        InwardDateBased: { type: sql.Int, value: inward },
        Pending: { type: sql.Int, value: pending },
        FromDate: { type: sql.DateTime, value: p.FromDate ? new Date(p.FromDate) : null },
        ToDate: { type: sql.DateTime, value: p.ToDate ? new Date(p.ToDate) : null },
        WithImage: { type: sql.Int, value: 0 },
      };
      if (cc > 0) o.CompanyCode = { type: sql.Int, value: cc };
      if (paid !== null) o.Paid = { type: sql.Int, value: paid };
      return o;
    },
    buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate, query }) => {
      const filtered = applyFilters(rows, query, DETAILS_SPECS);
      if (special) return special.build({ rows: filtered, companyName, companyLogo, fromDate, toDate });
      return buildDetailsDoc({
        rows: filtered, companyName, companyLogo, fromDate, toDate,
        cfg: cfg || DETAILS_CONFIGS.inward,
      });
    },
  });
};

// Abstract — sp_RptPurchaseOrderReceived. groupBy = inwardwise|invoicewise|supplierabstract.
export const inwardAbstractReport = (req, res) => {
  const groupBy = String(req.query.groupBy || "supplierabstract").toLowerCase();
  const cfg = ABSTRACT_CONFIGS[groupBy] || ABSTRACT_CONFIGS.supplierabstract;
  return runReport(req, res, {
    spName: "sp_RptPurchaseOrderReceived",
    fileName: cfg.fileName,
    spParams: (p, r) => {
      const { inward, pending, paid } = commonFlags(r);
      const cc = parseInt(p.CompanyCode) || 0;
      const o = {
        FromDate: { type: sql.DateTime, value: p.FromDate ? new Date(p.FromDate) : null },
        ToDate: { type: sql.DateTime, value: p.ToDate ? new Date(p.ToDate) : null },
        InwardDateBased: { type: sql.Int, value: inward },
        Pending: { type: sql.Int, value: pending },
      };
      if (cc > 0) o.CompanyCode = { type: sql.Int, value: cc };
      if (paid !== null) o.Paid = { type: sql.Int, value: paid };
      return o;
    },
    buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate, query }) =>
      buildAbstractDoc({ rows: applyFilters(rows, query, ABSTRACT_SPECS), companyName, companyLogo, fromDate, toDate, cfg }),
  });
};

// ---- filter option lists ---------------------------------------------------
// One endpoint feeding the left-rail dropdowns. Lookups mirror the VB
// Bind_Data() sources (master selects for Cost Head / Department / Item
// Category / Item / Supplier; company-scoped selects for Pur.Order No / Inward
// No). Company comes from the viewer's built-in Company filter (?CompanyCode=).
// FYCode is intentionally not applied (matching the Purchase Order Report
// sibling, which scopes PO/Inward lists by CompanyCode only). Each lookup
// degrades to [] on its own error. SQL 2008 safe. NO SP is modified.
export const inwardReportOptions = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type("text/plain").send("Missing subDBName header");
    const pool = await getPool(subDbName);
    // 0 / absent → "All Company" (the viewer's no-selection state): the PO No /
    // Inward No lists then span every company (no CompanyCode predicate, no bind).
    const companyCode = parseInt(req.query.CompanyCode) || 0;
    const where = companyCode ? " WHERE CompanyCode = @CompanyCode" : "";

    const q = (text) => pool.request().query(text).then((r) => r.recordset || []).catch(() => []);
    const scoped = (text) => {
      const r = pool.request();
      if (companyCode) r.input("CompanyCode", sql.Int, companyCode);
      return r.query(text).then((x) => x.recordset || []).catch(() => []);
    };

    const [costHeads, departments, itemCategories, items, suppliers, purchaseOrders, inwards] =
      await Promise.all([
        q("SELECT CostHeadName, CostHeadCode FROM tbl_CostHead ORDER BY CostHeadName"),
        q("SELECT DepartmentName, DepartmentCode FROM tbl_Department WHERE Status = 1 ORDER BY DepartmentName"),
        q("SELECT ItemCategoryName, ItemCategoryCode FROM tbl_ItemCategory ORDER BY ItemCategoryName"),
        q("SELECT ItemName, ItemCode FROM tbl_Item WHERE Status = 1 ORDER BY ItemName"),
        q("SELECT SupplierName, SupplierCode FROM tbl_Supplier ORDER BY SupplierName"),
        scoped(
          "SELECT CONVERT(varchar, PurchaseOrderNo) + ' - ' + CONVERT(varchar, PurchaseOrderDate, 103) AS strPurchaseOrderNo, " +
          "PurchaseOrderCode FROM tbl_PurchaseOrder" + where + " ORDER BY PurchaseOrderNo DESC"
        ),
        scoped(
          "SELECT CONVERT(varchar, PurchaseOrderReceivedNo) + ' - ' + CONVERT(varchar, PurchaseOrderReceivedDate, 103) AS strPurchaseOrderReceivedNo, " +
          "PurchaseOrderReceivedCode FROM tbl_PurchaseOrderReceived" + where + " ORDER BY PurchaseOrderReceivedNo DESC"
        ),
      ]);

    const map = (rows, nameKey, codeKey) => rows.map((r) => ({ value: r[codeKey], label: r[nameKey] }));

    return res.json({
      suppliers: map(suppliers, "SupplierName", "SupplierCode"),
      purchaseOrders: map(purchaseOrders, "strPurchaseOrderNo", "PurchaseOrderCode"),
      inwards: map(inwards, "strPurchaseOrderReceivedNo", "PurchaseOrderReceivedCode"),
      costHeads: map(costHeads, "CostHeadName", "CostHeadCode"),
      departments: map(departments, "DepartmentName", "DepartmentCode"),
      itemCategories: map(itemCategories, "ItemCategoryName", "ItemCategoryCode"),
      items: map(items, "ItemName", "ItemCode"),
    });
  } catch (err) {
    console.error("inwardReportOptions:", err);
    return res.status(500).type("text/plain").send("ERROR: " + err.message);
  }
};
