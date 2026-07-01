// =============================================================================
// Store ▸ Purchase Requisition Report (port of WinForms rptItemRequisitionDetails)
// =============================================================================
// One screen, seven report types. The five "Details" layouts all run the SAME
// SP (sp_ItemRequisitionDetails_GetAll) and differ only by grouping — exactly
// like the legacy RDLCs. Two "Pending" layouts use their own SPs.
//
//   groupBy=document  (flat, one row per requisition line)
//   groupBy=item      (grouped by ItemCode)
//   groupBy=department(grouped by DepartmentCode)
//   groupBy=category  (grouped by ItemCategoryCode)
//   groupBy=costhead  (grouped by CostHeadCode)
//   → endpoint /store/reports/purchase-requisition
//
//   Indent Pending    → /store/reports/purchase-requisition-pending      (sp_ItemRequisitionDetails_Pending, RequisitionType forced "I")
//   Requi.  Pending   → /store/reports/purchase-requisition-pending-req  (sp_PurchaseAdvice_PendingItemRequisition, CompanyCode ONLY)
//
// Mode toggle (Item Req. Purchase "R" / Indent Issue "I") drives @RequisitionType
// for the Details report. All SPs reused exactly — NO SP changes.
//
// Filters (Cost Head / Item Category / Department / Item UOM / Item / Employee)
// are applied in-memory AFTER the SP, mirroring the VB DataTable.Select(...).
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

// "R" (Item Req. / Purchase) is the default; "I" = Indent (Issue).
const reqType = (req) =>
  String(req?.query?.RequisitionType || "R").toUpperCase() === "I" ? "I" : "R";

// ---------------------------------------------------------------------------
// In-memory row filtering — mirrors the WinForms screen, which pulls the whole
// recordset then narrows it with DataTable.Select("Code IN (..)") from the
// left-rail combos. Each spec applies only to recordsets that expose its column.
// ---------------------------------------------------------------------------
const REQ_FILTER_SPECS = [
  { param: "CostHeadCode", col: "CostHeadCode" },
  { param: "ItemCategoryCode", col: "ItemCategoryCode" },
  { param: "DepartmentCode", col: "DepartmentCode" },
  { param: "ItemUomCode", col: "ItemUomCode" },
  { param: "ItemCode", col: "ItemCode" },
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
function applyReqFilters(rows, query = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return rows || [];
  const sample = rows[0];
  const active = [];
  for (const spec of REQ_FILTER_SPECS) {
    const set = parseCodeSet(query[spec.param]);
    if (!set) continue;
    if (!Object.prototype.hasOwnProperty.call(sample, spec.col)) continue;
    active.push({ col: spec.col, set });
  }
  if (!active.length) return rows;
  return rows.filter((r) => active.every(({ col, set }) => set.has(String(r[col]))));
}

// ---------------------------------------------------------------------------
// Details report — shared 12-column detail table.
// Columns: S.No, Req No, Req Date, Committed, Cost Head, Department, Employee,
//          Category, Item ID, Item Name, UOM, Qty
// ---------------------------------------------------------------------------
const D_HEADERS = [
  "S.No", "Req No", "Req Date", "Committed", "Cost Head", "Department",
  "Employee", "Category", "Item ID", "Item Name", "UOM", "Qty",
];
const D_WIDTHS = [22, 42, 48, 48, 70, 75, 80, 70, 50, "*", 40, 52];
const D_WRAP = { costhead: 16, dept: 16, emp: 17, cat: 16, item: 26 };

const headerRow = (headers) =>
  headers.map((t) => ({
    text: t, bold: true, fillColor: colors.headerFill, color: colors.headerText,
    alignment: "center", fontSize: 8,
  }));

function detailRow(r, sno, zebra) {
  const costhead = str(r, "CostHeadName");
  const dept = str(r, "DepartmentName");
  const emp = str(r, "EmployeeName");
  const cat = str(r, "ItemCategoryName");
  const item = str(r, "ItemName");
  const lines = {
    costhead: estimateLines(costhead, D_WRAP.costhead),
    dept: estimateLines(dept, D_WRAP.dept),
    emp: estimateLines(emp, D_WRAP.emp),
    cat: estimateLines(cat, D_WRAP.cat),
    item: estimateLines(item, D_WRAP.item),
  };
  const maxLines = Math.max(1, ...Object.values(lines));
  const cell = (text, align = "left", cellLines = 1) => ({
    text, alignment: align, fontSize: 8, fillColor: zebra,
    margin: [0, topPadFor(maxLines, cellLines), 0, 0],
  });
  return [
    cell(String(sno), "center"),
    cell(str(r, "strItemRequisitionNo"), "center"),
    cell(ddmmyyyy(r.ItemRequisitionDate), "center"),
    cell(ddmmyyyy(r.CommittedDate), "center"),
    cell(costhead, "left", lines.costhead),
    cell(dept, "left", lines.dept),
    cell(emp, "left", lines.emp),
    cell(cat, "left", lines.cat),
    cell(str(r, "ItemID"), "center"),
    cell(item, "left", lines.item),
    cell(str(r, "ItemUomName"), "center"),
    cell(fmt(dec(r, "Qty"), 3), "right"),
  ];
}

const GROUP_CONFIGS = {
  item: {
    title: "ITEM REQUISITION DETAILS - ITEM WISE",
    fileName: "PurchaseRequisition_ItemWise",
    summaryGroupHeader: "Item",
    groupKey: (r) => String(r.ItemCode ?? "0"),
    groupLabel: (g) => "Item : " + str(g[0], "ItemName") + (str(g[0], "ItemUomName") ? " - " + str(g[0], "ItemUomName") : ""),
    summaryLabel: (g) => str(g[0], "ItemName") + (str(g[0], "ItemUomName") ? " - " + str(g[0], "ItemUomName") : ""),
  },
  department: {
    title: "ITEM REQUISITION DETAILS - DEPARTMENT WISE",
    fileName: "PurchaseRequisition_DepartmentWise",
    summaryGroupHeader: "Department",
    groupKey: (r) => String(r.DepartmentCode ?? "0"),
    groupLabel: (g) => "Department : " + str(g[0], "DepartmentName"),
    summaryLabel: (g) => str(g[0], "DepartmentName"),
  },
  category: {
    title: "ITEM REQUISITION DETAILS - ITEM CATEGORY WISE",
    fileName: "PurchaseRequisition_CategoryWise",
    summaryGroupHeader: "Item Category",
    groupKey: (r) => String(r.ItemCategoryCode ?? "0"),
    groupLabel: (g) => "Category : " + str(g[0], "ItemCategoryName"),
    summaryLabel: (g) => str(g[0], "ItemCategoryName"),
  },
  costhead: {
    title: "ITEM REQUISITION DETAILS - COST HEAD WISE",
    fileName: "PurchaseRequisition_CostHeadWise",
    summaryGroupHeader: "Cost Head",
    groupKey: (r) => String(r.CostHeadCode ?? "0"),
    groupLabel: (g) => "Cost Head : " + str(g[0], "CostHeadName"),
    summaryLabel: (g) => str(g[0], "CostHeadName"),
  },
};

const NCOLS = D_HEADERS.length; // 12
const spanRow = (node) => [node, ...Array(NCOLS - 1).fill({})];

function buildGroupedDoc({ rows, companyName, companyLogo, fromDate, toDate, cfg }) {
  const groupsMap = new Map();
  for (const r of rows) {
    const k = cfg.groupKey(r);
    if (!groupsMap.has(k)) groupsMap.set(k, []);
    groupsMap.get(k).push(r);
  }
  const sorted = [...groupsMap.values()].sort((a, b) =>
    String(cfg.summaryLabel(a)).localeCompare(String(cfg.summaryLabel(b)))
  );

  const body = [headerRow(D_HEADERS)];
  let gQty = 0;
  let sno = 1;
  const groupSummaries = [];

  for (const group of sorted) {
    body.push(
      spanRow({
        text: cfg.groupLabel(group), colSpan: NCOLS, bold: true,
        color: colors.groupText, fillColor: colors.groupFill, fontSize: 9, margin: [2, 2, 0, 2],
      })
    );
    let sQty = 0;
    let idx = 0;
    for (const r of group) {
      body.push(detailRow(r, sno, idx % 2 === 1 ? colors.zebraFill : null));
      sQty += dec(r, "Qty");
      sno++;
      idx++;
    }
    const sub = { bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 8 };
    body.push([
      { text: "Sub Total", colSpan: NCOLS - 1, alignment: "right", ...sub },
      ...Array(NCOLS - 2).fill({}),
      { text: fmt(sQty, 3), alignment: "right", ...sub },
    ]);
    groupSummaries.push({ label: cfg.summaryLabel(group), totals: { qty: sQty } });
    gQty += sQty;
  }

  const grand = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 };
  body.push([
    { text: "Grand Total", colSpan: NCOLS - 1, alignment: "right", ...grand },
    ...Array(NCOLS - 2).fill({}),
    { text: fmt(gQty, 3), alignment: "right", ...grand },
  ]);

  const summary = buildGroupSummaryPage({
    companyName, companyLogo, fromDate, toDate,
    title: cfg.title.replace("DETAILS", "SUMMARY"),
    groupHeader: cfg.summaryGroupHeader,
    groupSummaries,
    grandTotals: { qty: gQty },
    totalCols: [{ header: "Qty", key: "qty", digits: 3 }],
  });

  return buildPage({
    companyName, companyLogo, title: cfg.title, fromDate, toDate,
    tables: [{ table: { headerRows: 1, dontBreakRows: true, widths: D_WIDTHS, body }, layout: tableLayout() }],
    summary,
  });
}

function buildDocumentWiseDoc({ rows, companyName, companyLogo, fromDate, toDate }) {
  const sorted = [...rows].sort((a, b) => {
    const an = Number(a.ItemRequisitionNo) || 0;
    const bn = Number(b.ItemRequisitionNo) || 0;
    return an - bn;
  });
  const body = [headerRow(D_HEADERS)];
  let gQty = 0;
  sorted.forEach((r, i) => {
    body.push(detailRow(r, i + 1, i % 2 === 1 ? colors.zebraFill : null));
    gQty += dec(r, "Qty");
  });
  const grand = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 };
  body.push([
    { text: "Grand Total", colSpan: NCOLS - 1, alignment: "right", ...grand },
    ...Array(NCOLS - 2).fill({}),
    { text: fmt(gQty, 3), alignment: "right", ...grand },
  ]);
  return buildPage({
    companyName, companyLogo, title: "ITEM REQUISITION DETAILS - DOCUMENT WISE", fromDate, toDate,
    tables: [{ table: { headerRows: 1, dontBreakRows: true, widths: D_WIDTHS, body }, layout: tableLayout() }],
  });
}

// ---------------------------------------------------------------------------
// Pending report — shared 8-column flat table (Indent Pending / Requi. Pending).
// ---------------------------------------------------------------------------
const P_HEADERS = ["S.No", "Req No", "Req Date", "Department", "Category", "Item ID", "Item Name", "Pending Qty"];
const P_WIDTHS = [26, 60, 64, "*", "*", 56, "*", 70];
const P_WRAP = { dept: 22, cat: 22, item: 30 };

function buildPendingDoc({ rows, companyName, companyLogo, fromDate, toDate, title }) {
  const body = [headerRow(P_HEADERS)];
  let gQty = 0;
  rows.forEach((r, i) => {
    const zebra = i % 2 === 1 ? colors.zebraFill : null;
    const dept = str(r, "DepartmentName");
    const cat = str(r, "ItemCategoryName");
    const item = str(r, "ItemName");
    const lines = {
      dept: estimateLines(dept, P_WRAP.dept),
      cat: estimateLines(cat, P_WRAP.cat),
      item: estimateLines(item, P_WRAP.item),
    };
    const maxLines = Math.max(1, ...Object.values(lines));
    const cell = (text, align = "left", cellLines = 1) => ({
      text, alignment: align, fontSize: 8, fillColor: zebra,
      margin: [0, topPadFor(maxLines, cellLines), 0, 0],
    });
    const pend = dec(r, "PendQty");
    gQty += pend;
    body.push([
      cell(String(i + 1), "center"),
      cell(str(r, "strItemRequisitionNo"), "center"),
      cell(ddmmyyyy(r.ItemRequisitionDate), "center"),
      cell(dept, "left", lines.dept),
      cell(cat, "left", lines.cat),
      cell(str(r, "ItemID"), "center"),
      cell(item, "left", lines.item),
      cell(fmt(pend, 3), "right"),
    ]);
  });
  const grand = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 };
  body.push([
    { text: "Total", colSpan: P_HEADERS.length - 1, alignment: "right", ...grand },
    ...Array(P_HEADERS.length - 2).fill({}),
    { text: fmt(gQty, 3), alignment: "right", ...grand },
  ]);
  return buildPage({
    companyName, companyLogo, title, fromDate, toDate,
    tables: [{ table: { headerRows: 1, dontBreakRows: true, widths: P_WIDTHS, body }, layout: tableLayout() }],
  });
}

// ---- handlers --------------------------------------------------------------

// Details report (Document / Item / Department / Category / Cost Head Wise).
export const purchaseRequisitionReport = (req, res) => {
  const groupBy = String(req.query.groupBy || "document").toLowerCase();
  const cfg = GROUP_CONFIGS[groupBy];
  const fileName = cfg ? cfg.fileName : "PurchaseRequisition_DocumentWise";
  return runReport(req, res, {
    spName: "sp_ItemRequisitionDetails_GetAll",
    fileName,
    spParams: (p) => ({
      FromDate: { type: sql.DateTime, value: p.FromDate ? new Date(p.FromDate) : null },
      ToDate: { type: sql.DateTime, value: p.ToDate ? new Date(p.ToDate) : null },
      CompanyCode: { type: sql.Int, value: parseInt(p.CompanyCode) || 0 },
      RequisitionType: { type: sql.NVarChar, value: reqType(req) },
    }),
    buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate, query }) => {
      const filtered = applyReqFilters(rows, query);
      if (cfg) return buildGroupedDoc({ rows: filtered, companyName, companyLogo, fromDate, toDate, cfg });
      return buildDocumentWiseDoc({ rows: filtered, companyName, companyLogo, fromDate, toDate });
    },
  });
};

// Indent Pending — RequisitionType forced "I" (matches the VB optIssueIndent).
export const purchaseRequisitionPendingReport = (req, res) =>
  runReport(req, res, {
    spName: "sp_ItemRequisitionDetails_Pending",
    fileName: "PurchaseRequisition_IndentPending",
    spParams: (p) => ({
      FromDate: { type: sql.DateTime, value: p.FromDate ? new Date(p.FromDate) : null },
      ToDate: { type: sql.DateTime, value: p.ToDate ? new Date(p.ToDate) : null },
      CompanyCode: { type: sql.Int, value: parseInt(p.CompanyCode) || 0 },
      RequisitionType: { type: sql.NVarChar, value: "I" },
    }),
    buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate, query }) =>
      buildPendingDoc({
        rows: applyReqFilters(rows, query), companyName, companyLogo, fromDate, toDate,
        title: "ITEM INDENT PENDING DETAILS",
      }),
  });

// Requi. Pending — sp_PurchaseAdvice_PendingItemRequisition takes @CompanyCode
// ONLY (no dates / no RequisitionType), exactly like the VB.
export const purchaseRequisitionPendingReqReport = (req, res) =>
  runReport(req, res, {
    spName: "sp_PurchaseAdvice_PendingItemRequisition",
    fileName: "PurchaseRequisition_RequiPending",
    spParams: (p) => ({
      CompanyCode: { type: sql.Int, value: parseInt(p.CompanyCode) || 0 },
    }),
    buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate, query }) =>
      buildPendingDoc({
        rows: applyReqFilters(rows, query), companyName, companyLogo, fromDate, toDate,
        title: "ITEM REQUISITION PENDING DETAILS",
      }),
  });

// ---- filter option lists ---------------------------------------------------
// One endpoint feeding the left-rail filter dropdowns. Lookups mirror the VB
// Bind_Data() sources. SQL 2008 safe (plain selects). Company comes from the
// viewer's built-in Company filter, so it is not returned here.
export const purchaseRequisitionReportOptions = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type("text/plain").send("Missing subDBName header");
    const pool = await getPool(subDbName);
    const q = (text) => pool.request().query(text).then((r) => r.recordset || []);
    const [costHeads, itemCategories, departments, itemUoms, items, employees] = await Promise.all([
      q("SELECT CostHeadCode, CostHeadName FROM tbl_CostHead ORDER BY CostHeadName"),
      q("SELECT ItemCategoryCode, ItemCategoryName FROM tbl_ItemCategory ORDER BY ItemCategoryName"),
      q("SELECT DepartmentCode, DepartmentName FROM tbl_Department WHERE Status = 1 ORDER BY DepartmentName"),
      q("SELECT ItemUomCode, ItemUomName FROM tbl_ItemUom ORDER BY ItemUomName"),
      q("SELECT ItemCode, ItemName FROM tbl_Item WHERE Status = 1 ORDER BY ItemName"),
      q("SELECT DISTINCT EmployeeCode, EmployeeName FROM vw_Employee_New WHERE EmployeeName IS NOT NULL ORDER BY EmployeeName"),
    ]);
    const map = (rows, codeKey, nameKey) =>
      rows.map((r) => ({ value: r[codeKey], label: r[nameKey] }));
    return res.json({
      costHeads: map(costHeads, "CostHeadCode", "CostHeadName"),
      itemCategories: map(itemCategories, "ItemCategoryCode", "ItemCategoryName"),
      departments: map(departments, "DepartmentCode", "DepartmentName"),
      itemUoms: map(itemUoms, "ItemUomCode", "ItemUomName"),
      items: map(items, "ItemCode", "ItemName"),
      employees: map(employees, "EmployeeCode", "EmployeeName"),
    });
  } catch (err) {
    console.error("purchaseRequisitionReportOptions:", err);
    return res.status(500).type("text/plain").send("ERROR: " + err.message);
  }
};
