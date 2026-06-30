// =============================================================================
// Store ▸ Stock Ledger Report (port of WinForms rptStockLedger)
// =============================================================================
// One screen → THREE stored procedures by the legacy tbl_Reports.Type, each a
// hand-written pdfmake template in the shared convention
// (controllers/report/cotton/_common.js + renderGroupedReport). The legacy RDLCs
// (\Reports\StoreStock\*.rdlc) are NOT consumed at runtime.
//
//   Type "Details"            → sp_Stock_Statement        (8 layout variants)
//   Type "NonMoving(DeptWise)"→ sp_Store_NonMoving_Stock  (Days required)
//   Type "YearlyReport"       → sp_Store_YearWise_Report  (no @CompanyCode)
//
// Endpoints (1 per SP family) — the frontend report-type radios pick the right
// one via the ReportViewer per-type `authPath`; the 8 Details variants share
// /stock-ledger, chosen by ?groupBy=:
//   /store/reports/stock-ledger            sp_Stock_Statement ?groupBy=individual|
//      summary|deptledger|deptqtyvalue|categoryqtyvalue|rack|history|aging
//   /store/reports/stock-ledger-nonmoving  sp_Store_NonMoving_Stock
//   /store/reports/stock-ledger-yearly     sp_Store_YearWise_Report
//
// Like the legacy screen, the Department / Category / Item / Item-Type dropdowns
// are NOT passed to the SP: the SP returns the recordset for Company + dates,
// then we narrow it in-memory (DataTable.Select) on the code columns. The
// summary variants then AGGREGATE the (transaction-level) rows to item / category
// / department, reproducing the RDLC's Sum(...) grouping. NO SP is modified.
// Datetimes are local IST — never timezone-converted.
// =============================================================================

import {
  runReport,
  renderGroupedReport,
  fmt,
  ddmmyyyy,
  sql,
} from "../cotton/_common.js";
import { getPool } from "../../../config/dynamicDB.js";

// ---- duplicate-column-safe accessors ----------------------------------------
const firstVal = (v) => {
  if (!Array.isArray(v)) return v;
  for (const x of v) if (x !== null && x !== undefined && x !== "") return x;
  return v.length ? v[0] : null;
};
const gstr = (r, col) => {
  const v = firstVal(r[col]);
  return v === null || v === undefined ? "" : String(v);
};
const gstrAny = (r, cols) => {
  for (const c of cols) {
    const v = firstVal(r[c]);
    if (v !== null && v !== undefined && String(v) !== "") return String(v);
  }
  return "";
};
const gdec = (r, col) => {
  const v = firstVal(r[col]);
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};
const gdecAny = (r, cols) => {
  for (const c of cols) {
    const v = firstVal(r[c]);
    if (v !== null && v !== undefined && v !== "") {
      const n = Number(v);
      if (!isNaN(n)) return n;
    }
  }
  return 0;
};
const gint = (r, col) => {
  const n = parseInt(firstVal(r[col]));
  return isNaN(n) ? 0 : n;
};
const gdate = (r, col) => ddmmyyyy(firstVal(r[col]));
const kc = (r, col) => {
  const v = firstVal(r[col]);
  return v === null || v === undefined ? "" : String(v);
};
const rate = (val, qty) => (qty ? val / qty : 0);

// ---- in-memory post-SP filters ----------------------------------------------
const parseCodeSet = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const set = new Set(String(v).split(",").map((s) => s.trim()).filter((s) => s.length));
  return set.size ? set : null;
};
function applyFilters(rows, query = {}, specs = []) {
  if (!Array.isArray(rows) || rows.length === 0) return rows || [];
  const sample = rows[0];
  const active = [];
  for (const sp of specs) {
    const set = parseCodeSet(query[sp.param]);
    if (!set) continue;
    if (!Object.prototype.hasOwnProperty.call(sample, sp.col)) continue;
    active.push({ col: sp.col, set });
  }
  if (!active.length) return rows;
  return rows.filter((r) => active.every(({ col, set }) => set.has(String(firstVal(r[col])))));
}
// Details order: Department → Category → Item → Item Type (legacy .vb).
const DETAILS_SPECS = [
  { param: "DepartmentCode", col: "DepartmentCode" },
  { param: "ItemCategoryCode", col: "ItemCategoryCode" },
  { param: "ItemCode", col: "ItemCode" },
  { param: "ItemUsageTypeCode", col: "ItemUsageTypeCode" },
];
// NonMoving order: Item Type → Item → Department → Category (legacy .vb).
const NONMOVING_SPECS = [
  { param: "ItemUsageTypeCode", col: "ItemUsageTypeCode" },
  { param: "ItemCode", col: "ItemCode" },
  { param: "DepartmentCode", col: "DepartmentCode" },
  { param: "ItemCategoryCode", col: "ItemCategoryCode" },
];

// ---- aggregation (transaction rows → item/category/department) ---------------
// sp_Stock_Statement returns transaction-level rows; the summary RDLCs Sum(...)
// them within a group. We reproduce that by summing the numeric fields and
// keeping the first row's text fields. Reads unwrap duplicate-column arrays.
const SUM_FIELDS = [
  "OpnQty", "OpnValue", "InQty", "InValue", "PurInward", "PurInwardValue",
  "ProdnInward", "ProdnInwardValue", "InwRtnQty", "InwRtnValue", "Outward",
  "OutwardValue", "IssueReturnQty", "IssueReturnValue", "InwAdjQty", "InwAdjValue",
  "RecAdjQty", "RecAdjValue", "Closing", "ClosingValue", "Inward", "InwardValue",
];
const KEEP_FIELDS = [
  "ItemCode", "ItemID", "ItemName", "PartNumber", "ItemCategoryCode",
  "ItemCategoryName", "DepartmentCode", "DepartmentName", "DepartmentName_English",
  "ItemGroupCode", "ItemGroupName", "ItemUsageTypeCode", "ItemUsageTypeName",
  "RackNo", "SupplierName", "ItemUomName", "LastPurDate", "LastPurRate", "AgingDays",
];
function aggregate(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    let g = map.get(k);
    if (!g) {
      g = {};
      for (const f of KEEP_FIELDS) g[f] = firstVal(r[f]);
      for (const f of SUM_FIELDS) g[f] = 0;
      map.set(k, g);
    }
    for (const f of SUM_FIELDS) g[f] += gdec(r, f);
  }
  return [...map.values()];
}

// ---- column catalogue -------------------------------------------------------
const C = {
  sno: { key: "sno", header: "S.No", width: 24, align: "center", serial: true, get: () => "" },

  // -- Individual Ledger (raw transaction rows: Receipt/P.Rtn/Issue/I.Rtn/Closing,
  //    rate = value / qty per cell). dense 17-column landscape grid.
  date: { key: "date", header: "Date", width: 38, align: "center", get: (r) => gdate(r, "StockDate") },
  particular: { key: "particular", header: "Particular", width: "*", align: "left", wrap: 30, get: (r) => gstr(r, "Description") },
  recQty: { key: "recQty", header: "Rec.Qty", width: 34, align: "right", num: 3, get: (r) => gdec(r, "Inward") },
  recRate: { key: "recRate", header: "Rec.Rate", width: 36, align: "right", num: 2, get: (r) => rate(gdec(r, "InwardValue"), gdec(r, "Inward")) },
  recVal: { key: "recVal", header: "Rec.Value", width: 46, align: "right", num: 2, get: (r) => gdec(r, "InwardValue") },
  prQty: { key: "prQty", header: "P.Rtn Qty", width: 34, align: "right", num: 3, get: (r) => gdec(r, "InwRtnQty") },
  prRate: { key: "prRate", header: "P.Rtn Rate", width: 36, align: "right", num: 2, get: (r) => rate(gdec(r, "InwRtnValue"), gdec(r, "InwRtnQty")) },
  prVal: { key: "prVal", header: "P.Rtn Val", width: 46, align: "right", num: 2, get: (r) => gdec(r, "InwRtnValue") },
  isQty: { key: "isQty", header: "Iss.Qty", width: 34, align: "right", num: 3, get: (r) => gdec(r, "Outward") },
  isRate: { key: "isRate", header: "Iss.Rate", width: 36, align: "right", num: 2, get: (r) => rate(gdec(r, "OutwardValue"), gdec(r, "Outward")) },
  isVal: { key: "isVal", header: "Iss.Value", width: 46, align: "right", num: 2, get: (r) => gdec(r, "OutwardValue") },
  irQty: { key: "irQty", header: "I.Rtn Qty", width: 34, align: "right", num: 3, get: (r) => gdec(r, "IssueReturnQty") },
  irRate: { key: "irRate", header: "I.Rtn Rate", width: 36, align: "right", num: 2, get: (r) => rate(gdec(r, "IssueReturnValue"), gdec(r, "IssueReturnQty")) },
  irVal: { key: "irVal", header: "I.Rtn Val", width: 46, align: "right", num: 2, get: (r) => gdec(r, "IssueReturnValue") },
  clQty: { key: "clQty", header: "Cls.Qty", width: 34, align: "right", num: 3, get: (r) => gdec(r, "Closing") },
  clVal: { key: "clVal", header: "Cls.Value", width: 48, align: "right", num: 2, get: (r) => gdec(r, "ClosingValue") },

  // -- shared text columns
  category: { key: "category", header: "Category", width: "*", align: "left", wrap: 26, get: (r) => gstr(r, "ItemCategoryName") },
  dept: { key: "dept", header: "Department", width: "*", align: "left", wrap: 26, get: (r) => gstr(r, "DepartmentName") },
  itemName: { key: "itemName", header: "Item Name", width: "*", align: "left", wrap: 34, get: (r) => gstr(r, "ItemName") },
  itemId: { key: "itemId", header: "Item ID", width: 60, align: "left", wrap: 14, get: (r) => gstrAny(r, ["ItemID", "ItemCode"]) },
  partNo: { key: "partNo", header: "Part No", width: 64, align: "left", wrap: 16, get: (r) => gstr(r, "PartNumber") },
  rack: { key: "rack", header: "Rack", width: 50, align: "left", wrap: 12, get: (r) => gstr(r, "RackNo") },
  supplier: { key: "supplier", header: "Supplier", width: 80, align: "left", wrap: 20, get: (r) => gstr(r, "SupplierName") },
  lastPur: { key: "lastPur", header: "Last Pur.", width: 50, align: "center", get: (r) => gdate(r, "LastPurDate") },
  aging: { key: "aging", header: "Days", width: 34, align: "right", num: 0, get: (r) => gint(r, "AgingDays") },

  // -- aggregated value/qty columns
  opnQty: { key: "opnQty", header: "Opn Qty", width: 48, align: "right", num: 3, get: (r) => gdec(r, "OpnQty") },
  opnVal: { key: "opnVal", header: "Opn Value", width: 60, align: "right", num: 2, get: (r) => gdec(r, "OpnValue") },
  recQ: { key: "recQ", header: "Rec Qty", width: 48, align: "right", num: 3, get: (r) => gdecAny(r, ["PurInward", "InQty", "Inward"]) },
  recV: { key: "recV", header: "Rec Value", width: 60, align: "right", num: 2, get: (r) => gdecAny(r, ["PurInwardValue", "InValue", "InwardValue"]) },
  prV: { key: "prV", header: "Pur.Rtn Val", width: 58, align: "right", num: 2, get: (r) => gdec(r, "InwRtnValue") },
  issQ: { key: "issQ", header: "Iss Qty", width: 48, align: "right", num: 3, get: (r) => gdec(r, "Outward") },
  issV: { key: "issV", header: "Iss Value", width: 60, align: "right", num: 2, get: (r) => gdec(r, "OutwardValue") },
  irV: { key: "irV", header: "Iss.Rtn Val", width: 58, align: "right", num: 2, get: (r) => gdec(r, "IssueReturnValue") },
  addV: { key: "addV", header: "Add Val", width: 52, align: "right", num: 2, get: (r) => gdec(r, "InwAdjValue") },
  lessV: { key: "lessV", header: "Less Val", width: 52, align: "right", num: 2, get: (r) => gdec(r, "RecAdjValue") },
  totV: { key: "totV", header: "Total Val", width: 62, align: "right", num: 2, get: (r) => gdec(r, "OpnValue") + gdecAny(r, ["PurInwardValue", "InValue"]) - gdec(r, "InwRtnValue") },
  clQ: { key: "clQ", header: "Cls Qty", width: 48, align: "right", num: 3, get: (r) => gdec(r, "Closing") },
  clV: { key: "clV", header: "Cls Value", width: 60, align: "right", num: 2, get: (r) => gdec(r, "ClosingValue") },

  // -- yearly
  month: { key: "month", header: "Month", width: "*", align: "left", get: (r) => gstr(r, "MName") },
  yOpn: { key: "yOpn", header: "Opening (INR)", width: 90, align: "right", num: 2, get: (r) => gdec(r, "TotalOpening") },
  yPur: { key: "yPur", header: "Purchase (INR)", width: 90, align: "right", num: 2, get: (r) => gdec(r, "TotalPurchase") },
  yTot: { key: "yTot", header: "Total (INR)", width: 90, align: "right", num: 2, get: (r) => gdec(r, "TotalOpening") + gdec(r, "TotalPurchase") },
  yIss: { key: "yIss", header: "Issue (INR)", width: 90, align: "right", num: 2, get: (r) => gdec(r, "TotalIssue") },
  yCls: { key: "yCls", header: "Closing (INR)", width: 90, align: "right", num: 2, get: (r) => gdec(r, "TotalClosing") },
};

const lvl = (key, label, totalLabel, sort, colKey) => ({ key, label, totalLabel, sort, colKey });

// ---- report configs ---------------------------------------------------------
// `aggBy` (optional) = a key fn; when set the (transaction) rows are aggregated
// to that level before rendering. `presort` orders flat (level-less) reports.
const DETAIL_CONFIGS = {
  individual: {
    title: "Individual Stock Ledger", dense: true, starKey: "particular",
    cols: [C.sno, C.date, C.particular, C.recQty, C.recRate, C.recVal, C.prQty, C.prRate, C.prVal, C.isQty, C.isRate, C.isVal, C.irQty, C.irRate, C.irVal, C.clQty, C.clVal],
    levels: [
      lvl(
        (r) => kc(r, "ItemCode"),
        (s) => `Item : ${gstrAny(s, ["ItemID", "ItemCode"])} - ${gstr(s, "ItemName")}   |  Cat: ${gstr(s, "ItemCategoryName")}  |  UOM: ${gstr(s, "ItemUomName")}  |  Last Pur: ${gdate(s, "LastPurDate")} @ ${fmt(gdec(s, "LastPurRate"), 2)}  |  Supplier: ${gstr(s, "SupplierName")}`,
        (s) => `Total : ${gstr(s, "ItemName")}`,
        (r) => gstr(r, "ItemName")
      ),
    ],
    totalKeys: ["recQty", "recVal", "prQty", "prVal", "isQty", "isVal", "irQty", "irVal"],
  },
  summary: {
    title: "Ledger Abstract", aggBy: (r) => kc(r, "ItemCategoryCode"), starKey: "category",
    cols: [C.sno, C.category, C.opnVal, C.recV, C.prV, C.issV, C.irV, C.addV, C.lessV, C.clV],
    levels: [
      lvl((r) => kc(r, "ItemGroupCode"), (s) => `Item Group : ${gstr(s, "ItemGroupName")}`, (s) => `Total : ${gstr(s, "ItemGroupName")}`, (r) => gstr(r, "ItemGroupName")),
    ],
    totalKeys: ["opnVal", "recV", "prV", "issV", "irV", "addV", "lessV", "clV"],
  },
  deptledger: {
    title: "Group Ledger - Department Wise (Value)", aggBy: (r) => kc(r, "DepartmentCode"), starKey: "dept",
    cols: [C.sno, C.dept, C.opnVal, C.recV, C.prV, C.totV, C.issV, C.irV, C.clV],
    levels: [],
    presort: (a, b) => gstr(a, "DepartmentName").localeCompare(gstr(b, "DepartmentName")),
    totalKeys: ["opnVal", "recV", "prV", "totV", "issV", "irV", "clV"],
  },
  deptqtyvalue: {
    title: "Department Wise Stock Statement With Value", aggBy: (r) => kc(r, "ItemCode"), starKey: "itemName",
    cols: [C.sno, C.itemName, C.opnQty, C.opnVal, C.recQ, C.recV, C.issQ, C.issV, C.clQ, C.clV],
    levels: [
      lvl((r) => kc(r, "DepartmentCode"), (s) => `Department : ${gstr(s, "DepartmentName")}`, (s) => `Total : ${gstr(s, "DepartmentName")}`, (r) => gstr(r, "DepartmentName")),
    ],
    totalKeys: ["opnQty", "opnVal", "recQ", "recV", "issQ", "issV", "clQ", "clV"],
  },
  categoryqtyvalue: {
    title: "Category Wise Stock Statement With Value", aggBy: (r) => kc(r, "ItemCode"), starKey: "itemName",
    cols: [C.sno, C.itemName, C.opnQty, C.opnVal, C.recQ, C.recV, C.issQ, C.issV, C.clQ, C.clV],
    levels: [
      lvl((r) => kc(r, "ItemCategoryCode"), (s) => `Category : ${gstr(s, "ItemCategoryName")}`, (s) => `Total : ${gstr(s, "ItemCategoryName")}`, (r) => gstr(r, "ItemCategoryName")),
    ],
    totalKeys: ["opnQty", "opnVal", "recQ", "recV", "issQ", "issV", "clQ", "clV"],
  },
  rack: {
    title: "Stock Report - Rack No Wise", aggBy: (r) => kc(r, "ItemCode"), starKey: "itemName",
    cols: [C.sno, C.itemId, C.itemName, C.partNo, C.clQ, C.clV],
    levels: [
      lvl((r) => kc(r, "ItemCategoryCode"), (s) => `Category : ${gstr(s, "ItemCategoryName")}`, (s) => `Total : ${gstr(s, "ItemCategoryName")}`, (r) => gstr(r, "ItemCategoryName")),
      lvl((r) => kc(r, "RackNo"), (s) => `Rack No : ${gstr(s, "RackNo")}`, (s) => `Sub Total : ${gstr(s, "RackNo")}`, (r) => gstr(r, "RackNo")),
    ],
    totalKeys: ["clQ", "clV"],
  },
  history: {
    title: "Closing Stock With Last Purchase Date Wise", aggBy: (r) => kc(r, "ItemCode"), starKey: "itemName",
    cols: [C.sno, C.lastPur, C.supplier, C.itemId, C.itemName, C.clQ, C.clV, C.aging],
    levels: [
      lvl((r) => kc(r, "ItemGroupCode"), (s) => `Item Group : ${gstr(s, "ItemGroupName")}`, (s) => `Total : ${gstr(s, "ItemGroupName")}`, (r) => gstr(r, "ItemGroupName")),
      lvl((r) => kc(r, "ItemCategoryCode"), (s) => `Category : ${gstr(s, "ItemCategoryName")}`, (s) => `Sub Total : ${gstr(s, "ItemCategoryName")}`, (r) => gstr(r, "ItemCategoryName")),
    ],
    totalKeys: ["clQ", "clV"],
  },
  aging: {
    title: "Aging Report", aggBy: (r) => kc(r, "ItemCode"), starKey: "itemName",
    cols: [C.sno, C.category, C.itemId, C.itemName, C.clQ, C.clV, C.aging, C.lastPur, C.rack, C.supplier],
    levels: [
      lvl((r) => kc(r, "ItemGroupCode"), (s) => `Item Group : ${gstr(s, "ItemGroupName")}`, (s) => `Total : ${gstr(s, "ItemGroupName")}`, (r) => gstr(r, "ItemGroupName")),
    ],
    totalKeys: ["clQ", "clV"],
  },
};

const NONMOVING_CFG = {
  title: "Aging Report - Department Wise (Non Moving)", aggBy: (r) => kc(r, "ItemCode"), starKey: "itemName",
  cols: [C.sno, C.category, C.itemId, C.itemName, C.clQ, C.clV, C.aging, C.lastPur, C.rack, C.supplier],
  levels: [
    lvl((r) => kc(r, "DepartmentCode"), (s) => `Department : ${gstr(s, "DepartmentName")}`, (s) => `Total : ${gstr(s, "DepartmentName")}`, (r) => gstr(r, "DepartmentName")),
  ],
  totalKeys: ["clQ", "clV"],
};

const YEARLY_CFG = {
  title: "Store Yearly Report", starKey: "month",
  cols: [C.sno, C.month, C.yOpn, C.yPur, C.yTot, C.yIss, C.yCls],
  levels: [],
  presort: (a, b) => (gint(a, "Year") - gint(b, "Year")) || (gint(a, "MNo") - gint(b, "MNo")),
  totalKeys: ["yPur", "yIss"],
};

// ---- SP parameter builders --------------------------------------------------
const dateRange = (p) => ({
  FromDate: { type: sql.DateTime, value: p.FromDate ? new Date(p.FromDate) : null },
  ToDate: { type: sql.DateTime, value: p.ToDate ? new Date(p.ToDate) : null },
});
const paramsDetails = (p) => {
  const o = dateRange(p);
  const cc = parseInt(p.CompanyCode) || 0;
  if (cc > 0) o.CompanyCode = { type: sql.Int, value: cc };
  return o;
};
const paramsNonMoving = (p, req) => {
  const o = dateRange(p);
  const cc = parseInt(p.CompanyCode) || 0;
  if (cc > 0) o.CompanyCode = { type: sql.Int, value: cc };
  o.Days = { type: sql.Int, value: parseInt(req.query.Days) || 0 }; // always
  const v = parseFloat(req.query.Value) || 0;
  if (v > 0) o.Value = { type: sql.Float, value: v }; // sent only when > 0
  return o;
};
const paramsYearly = (p) => dateRange(p); // NO @CompanyCode

// rows → filter → (aggregate) → (presort) → grouped pdfmake doc.
const makeDoc = (cfg, specs) => ({ rows, companyName, companyLogo, fromDate, toDate, query }) => {
  let data = applyFilters(rows, query, specs);
  if (cfg.aggBy) data = aggregate(data, cfg.aggBy);
  if (cfg.presort) data = [...data].sort(cfg.presort);
  return renderGroupedReport({ rows: data, cfg, companyName, companyLogo, fromDate, toDate });
};

// ---- handlers ---------------------------------------------------------------
export const stockLedgerReport = (req, res) => {
  const cfg = DETAIL_CONFIGS[String(req.query.groupBy || "individual")] || DETAIL_CONFIGS.individual;
  return runReport(req, res, {
    spName: "sp_Stock_Statement",
    fileName: "StockLedger",
    spParams: paramsDetails,
    buildDocDefinition: makeDoc(cfg, DETAILS_SPECS),
  });
};
export const stockLedgerNonMovingReport = (req, res) =>
  runReport(req, res, {
    spName: "sp_Store_NonMoving_Stock",
    fileName: "StockLedger_NonMoving",
    spParams: paramsNonMoving,
    buildDocDefinition: makeDoc(NONMOVING_CFG, NONMOVING_SPECS),
  });
export const stockLedgerYearlyReport = (req, res) =>
  runReport(req, res, {
    spName: "sp_Store_YearWise_Report",
    fileName: "StockLedger_Yearly",
    spParams: paramsYearly,
    buildDocDefinition: makeDoc(YEARLY_CFG, []),
  });

// ---- filter option lists ----------------------------------------------------
// Mirrors the VB Bind_Data() lookups verbatim. ALL company-INDEPENDENT (static).
// Each degrades to [] on its own error.
export const stockLedgerOptions = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type("text/plain").send("Missing subDBName header");
    const pool = await getPool(subDbName);
    const q = (text) => pool.request().query(text).then((r) => r.recordset || []).catch(() => []);

    const [itemCategories, itemTypes, departments, items] = await Promise.all([
      q("SELECT ItemCategoryCode, ItemCategoryName FROM tbl_ItemCategory ORDER BY ItemCategoryName"),
      q("SELECT ItemUsageTypeName, ItemUsageTypeCode FROM tbl_ItemUsageType"),
      q("SELECT DepartmentName, ShortName, OrderNo, DepartmentCode FROM tbl_Department ORDER BY DepartmentName"),
      q("SELECT ItemID, ItemName, PartNumber, DrawingNo, CatalogueNo, ItemCode FROM tbl_Item WHERE Status = 1 ORDER BY ItemName"),
    ]);

    const map = (rows, nameKey, codeKey) => rows.map((r) => ({ value: r[codeKey], label: r[nameKey] }));

    return res.json({
      departments: map(departments, "DepartmentName", "DepartmentCode"),
      itemCategories: map(itemCategories, "ItemCategoryName", "ItemCategoryCode"),
      items: map(items, "ItemName", "ItemCode"),
      itemTypes: map(itemTypes, "ItemUsageTypeName", "ItemUsageTypeCode"),
    });
  } catch (err) {
    console.error("stockLedgerOptions:", err);
    return res.status(500).type("text/plain").send("ERROR: " + err.message);
  }
};
