// =============================================================================
// Store ▸ Issue / Store Issue Report (port of WinForms rptIssueDetails)
// =============================================================================
// The most complex Stores report. ONE screen routes to SIX stored procedures by
// the legacy tbl_Reports.Type, each re-implemented here as a hand-written
// pdfmake template in the shared convention (controllers/report/cotton/_common.js).
// The RDLCs (\Reports\StoreIssue\*.rdlc) are NOT consumed at runtime.
//
//   Type "Details"              → sp_IssueDetails_GetAll        (8 layout variants)
//   Type "StockInward"          → sp_Stock_Statement           (no @BranchCode)
//   Type "StockWithConsumption" → sp_StockUnitWiseConsumption
//   Type "YearWise"             → sp_Issue_YearWise
//   Type "MonthWiseStock"       → sp_Issue_MonthWise_Report
//   else (summary/CategoryWise) → sp_Issue_GetAll              (no @BranchCode)
//
// Endpoints (1 per SP family) — the frontend report-type radios pick the right
// one via the ReportViewer per-type `authPath`, and the Details variants share
// /issue selected by ?groupBy=:
//   /store/reports/issue                 (Details: issueno|item|date|machine|
//                                          costhead|department|deptcost|category)
//   /store/reports/issue-stock-inward    (StockInward)
//   /store/reports/issue-stock-consumption (StockWithConsumption)
//   /store/reports/issue-year-wise       (YearWise)
//   /store/reports/issue-month-wise      (MonthWiseStock)
//   /store/reports/issue-summary         (else / IssueNo Wise Summary)
//
// Branch is a SINGLE-select that is sent to the SP as @BranchCode (conditional,
// only when > 0) — NOT an in-memory filter. The other left-rail multi-selects
// narrow the returned rows in-memory (mirroring the VB DataTable.Select chain).
// The Details filter order is exactly:
//   ItemGroupCode → CostHeadCode → DepartmentCode → ItemCode → ItemCategoryCode
//   → EmployeeCode → MachineCode → IssueCode.
// No SP is modified. Datetimes are local IST — never timezone-converted.
// =============================================================================

import {
  runReport,
  renderGroupedReport, // shared grouped-report renderer (enforces the hide-grouped-column rule)
  ddmmyyyy,
  sql,
} from "../cotton/_common.js";
import { getPool } from "../../../config/dynamicDB.js";

// ---- duplicate-column-safe accessors ----------------------------------------
// Some of these SPs SELECT duplicate column names; node-mssql collapses those
// into an ARRAY. Unwrap to the first meaningful element (the RDLC binds to the
// first, non-suffixed occurrence) before using any field.
const firstVal = (v) => {
  if (!Array.isArray(v)) return v;
  for (const x of v) if (x !== null && x !== undefined && x !== "") return x;
  return v.length ? v[0] : null;
};
const gstr = (r, col) => {
  const v = firstVal(r[col]);
  return v === null || v === undefined ? "" : String(v);
};
const gdec = (r, col) => {
  const v = firstVal(r[col]);
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};
const gdate = (r, col) => ddmmyyyy(firstVal(r[col]));
// First column that yields a non-empty value (datasets vary by SP).
const gstrAny = (r, cols) => {
  for (const c of cols) {
    const v = firstVal(r[c]);
    if (v !== null && v !== undefined && String(v) !== "") return String(v);
  }
  return "";
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
// Group key (stringified code) — '' for null/undefined.
const kc = (r, col) => {
  const v = firstVal(r[col]);
  return v === null || v === undefined ? "" : String(v);
};
const deptName = (r) =>
  gstrAny(r, ["DepartmentName", "DepartmentName_English"]);

// Issue Details row math. Issue Qty/Amount = actually issued. Return Qty/Amount
// = issue material returned against the issue. Con. (consumed) = Issue − Return.
// The sp_IssueDetails_GetAll dataset has ReturnQty but NO return-amount column,
// so Return Amount = ReturnQty × Rate and the Con. amounts derive from it.
const issueQty = (r) => gdec(r, "Qty");
const issueRate = (r) => gdec(r, "Rate");
const issueAmt = (r) => gdec(r, "NetAmount");
const returnQty = (r) => gdec(r, "ReturnQty");
const returnAmt = (r) => returnQty(r) * issueRate(r);

// ---- in-memory post-SP filters (mirror the VB DataTable.Select chain) -------
const parseCodeSet = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const set = new Set(
    String(v).split(",").map((s) => s.trim()).filter((s) => s.length)
  );
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
  return rows.filter((r) =>
    active.every(({ col, set }) => set.has(String(firstVal(r[col]))))
  );
}

// Details family — full filter chain, in the exact legacy order.
const DETAIL_SPECS = [
  { param: "ItemGroupCode", col: "ItemGroupCode" },
  { param: "CostHeadCode", col: "CostHeadCode" },
  { param: "DepartmentCode", col: "DepartmentCode" },
  { param: "ItemCode", col: "ItemCode" },
  { param: "ItemCategoryCode", col: "ItemCategoryCode" },
  { param: "EmployeeCode", col: "EmployeeCode" },
  { param: "MachineCode", col: "MachineCode" },
  { param: "IssueCode", col: "IssueCode" },
];
const ITEMGROUP_SPECS = [{ param: "ItemGroupCode", col: "ItemGroupCode" }];
const DEPARTMENT_SPECS = [{ param: "DepartmentCode", col: "DepartmentCode" }];
const ISSUE_SPECS = [{ param: "IssueCode", col: "IssueCode" }];

// ---- column catalogue -------------------------------------------------------
// Each column: { key, header, width, align, get(row)->string|number, num?, wrap? }
// `num` (digit count) marks a numeric column (formatted + summable). One column
// per config is promoted to the flexible `*` width (starKey).
const C = {
  sno: { key: "sno", header: "S.No", width: 24, align: "center", serial: true, get: () => "" },
  issueNo: { key: "issueNo", header: "Issue No", width: 50, align: "center", get: (r) => gstr(r, "IssueNo") },
  issueDt: { key: "issueDt", header: "Issue Date", width: 56, align: "center", get: (r) => gdate(r, "IssueDate") },
  dept: { key: "dept", header: "Department", width: 78, align: "left", wrap: 22, get: (r) => deptName(r) },
  costHead: { key: "costHead", header: "Cost Head", width: 74, align: "left", wrap: 20, get: (r) => gstr(r, "CostHeadName") },
  machine: { key: "machine", header: "Machine", width: 66, align: "left", wrap: 18, get: (r) => gstrAny(r, ["MachineName", "MachineNo"]) },
  category: { key: "category", header: "Category", width: 70, align: "left", wrap: 20, get: (r) => gstr(r, "ItemCategoryName") },
  employee: { key: "employee", header: "Issued To", width: 70, align: "left", wrap: 20, get: (r) => gstr(r, "EmployeeName") },
  itemGroup: { key: "itemGroup", header: "Item Group", width: 90, align: "left", wrap: 24, get: (r) => gstr(r, "ItemGroupName") },
  itemCode: { key: "itemCode", header: "Item Code", width: 62, align: "left", wrap: 16, get: (r) => gstrAny(r, ["ItemID", "ItemCode"]) },
  item: { key: "item", header: "Item Name", width: "*", align: "left", wrap: 40, get: (r) => gstr(r, "ItemName") },
  uom: { key: "uom", header: "UOM", width: 34, align: "center", get: (r) => gstr(r, "ItemUomName") },
  qty: { key: "qty", header: "Qty", width: 50, align: "right", num: 3, get: (r) => gdec(r, "Qty") },
  rate: { key: "rate", header: "Rate", width: 50, align: "right", num: 2, get: (r) => gdec(r, "Rate") },
  amount: { key: "amount", header: "Amount", width: 62, align: "right", num: 2, get: (r) => gdecAny(r, ["Amount", "NetAmount", "TotalAmount", "Value"]) },
  branch: { key: "branch", header: "Branch", width: "*", align: "left", wrap: 36, get: (r) => gstr(r, "BranchName") },
  monthYear: { key: "monthYear", header: "Month", width: 70, align: "center", get: (r) => gstr(r, "MonthYear") },
  year: { key: "year", header: "Year", width: 60, align: "center", get: (r) => gstrAny(r, ["Year", "MonthYear"]) },
  // Stock statement (Inward With Issue) numeric columns.
  inwardQty: { key: "inwardQty", header: "Inward Qty", width: 58, align: "right", num: 3, get: (r) => gdec(r, "Inward") },
  inwardVal: { key: "inwardVal", header: "Inward Value", width: 64, align: "right", num: 2, get: (r) => gdec(r, "InwardValue") },
  issRetQty: { key: "issRetQty", header: "Iss/Ret Qty", width: 58, align: "right", num: 3, get: (r) => gdec(r, "IssueReturnQty") },
  issRetVal: { key: "issRetVal", header: "Iss/Ret Value", width: 64, align: "right", num: 2, get: (r) => gdec(r, "IssueReturnValue") },
  closeQty: { key: "closeQty", header: "Closing Qty", width: 58, align: "right", num: 3, get: (r) => gdec(r, "Closing") },
  closeVal: { key: "closeVal", header: "Closing Value", width: 64, align: "right", num: 2, get: (r) => gdec(r, "ClosingValue") },
  // Stock-unit-wise consumption (no RDLC was provided — coalesced columns).
  consQty: { key: "consQty", header: "Qty", width: 56, align: "right", num: 3, get: (r) => gdecAny(r, ["Qty", "ConsumptionQty", "IssueQty"]) },
  consVal: { key: "consVal", header: "Value", width: 64, align: "right", num: 2, get: (r) => gdecAny(r, ["Amount", "Value", "ConsumptionValue"]) },

  // --- Issue Details grid (sp_IssueDetails_GetAll): the full 19-column layout
  // matching rptIssueDetails.rdlc (dense = 7pt + tight padding so it fits A4
  // landscape). Issue / Return / Con. blocks per the row math above.
  dSno: { key: "dSno", header: "S.No", width: 16, align: "center", serial: true, get: () => "" },
  dDate: { key: "dDate", header: "Date", width: 32, align: "center", wrap: 6, get: (r) => gdate(r, "IssueDate") },
  dDept: { key: "dDept", header: "Department", width: 44, align: "left", wrap: 11, get: (r) => deptName(r) },
  dCostHead: { key: "dCostHead", header: "Cost Head", width: 42, align: "left", wrap: 10, get: (r) => gstr(r, "CostHeadName") },
  dItemId: { key: "dItemId", header: "Item ID", width: 38, align: "left", wrap: 9, get: (r) => gstrAny(r, ["ItemID", "ItemCode"]) },
  dItem: { key: "dItem", header: "Item Name", width: "*", align: "left", wrap: 22, get: (r) => gstr(r, "ItemName") },
  dMachine: { key: "dMachine", header: "Machine", width: 42, align: "left", wrap: 10, get: (r) => gstrAny(r, ["MachineName", "MachineNo"]) },
  dRequire: { key: "dRequire", header: "Require", width: 44, align: "left", wrap: 11, get: (r) => gstr(r, "EmployeeName") },
  // Decimals match rptIssueDetails.rdlc: all qty 4dp, RND 2dp, all money 4dp.
  // (Oth.Exp dropped per request.)
  dIssQty: { key: "dIssQty", header: "Issue Qty", width: 34, align: "right", num: 4, get: issueQty },
  dAvgRate: { key: "dAvgRate", header: "Avg Rate", width: 40, align: "right", num: 4, get: issueRate },
  dGrossAmt: { key: "dGrossAmt", header: "Amount", width: 46, align: "right", num: 4, get: (r) => gdec(r, "Amount") },
  dRnd: { key: "dRnd", header: "RND", width: 26, align: "right", num: 2, get: (r) => gdec(r, "RoundedOff") },
  dIssAmt: { key: "dIssAmt", header: "Issue Amt", width: 46, align: "right", num: 4, get: issueAmt },
  dRetQty: { key: "dRetQty", header: "Ret.Qty", width: 34, align: "right", num: 4, get: returnQty },
  dRetAmt: { key: "dRetAmt", header: "Ret.Amt", width: 44, align: "right", num: 4, get: returnAmt },
  dConQty: { key: "dConQty", header: "Con.Qty", width: 34, align: "right", num: 4, get: (r) => issueQty(r) - returnQty(r) },
  dConAmt: { key: "dConAmt", header: "Con.Amt", width: 46, align: "right", num: 4, get: (r) => issueAmt(r) - returnAmt(r) },
  dReason: { key: "dReason", header: "Reason", width: 38, align: "left", wrap: 10, get: (r) => gstr(r, "Reason") },
};

// ---- grouping levels --------------------------------------------------------
// `colKey` = the column key(s) shown in the group HEADER and therefore dropped
// from the detail rows by renderGroupedReport (the strict common rule). Omit it
// when no column corresponds to the grouped field (e.g. grouping by Issue No
// while no Issue-No column exists in the grid).
const lvl = (key, label, totalLabel, sort, colKey) => ({ key, label, totalLabel, sort, colKey });

// ---- Details family configs (sp_IssueDetails_GetAll, by ?groupBy=) ----------
// Every Details variant shares the SAME column grid (Date · Dept · Cost Head ·
// Item ID · Item Name · Machine · Require · Issue Qty · Avg Rate · Amount · RND
// · Issue Amt · Ret.Qty · Ret.Amt · Con.Qty · Con.Amt · Reason) — only the
// grouping differs. Each level's `colKey` names the grouped field's column,
// which renderGroupedReport then DROPS from the rows (it's in the group header)
// — so Date Wise shows no Date column, Department Wise no Department column, etc.
// Totals mirror the RDLC: everything from Amount onward (Issue Qty / Avg Rate
// are not summed). dense = 7pt + tight padding to fit A4 landscape (Item Name,
// or the next text column when Item Name is the grouped field, takes the star).
const DETAIL_COLS = [
  C.dSno, C.dDate, C.dDept, C.dCostHead, C.dItemId, C.dItem, C.dMachine, C.dRequire,
  C.dIssQty, C.dAvgRate, C.dGrossAmt, C.dRnd, C.dIssAmt,
  C.dRetQty, C.dRetAmt, C.dConQty, C.dConAmt, C.dReason,
];
const DETAIL_TOTALS = [
  "dGrossAmt", "dRnd", "dIssAmt", "dRetQty", "dRetAmt", "dConQty", "dConAmt",
];
const detailCfg = (title, levels) => ({
  title, cols: DETAIL_COLS, starKey: "dItem", dense: true, totalKeys: DETAIL_TOTALS, levels,
});
const DETAIL_CONFIGS = {
  issueno: detailCfg("Issue Details - Issue No Wise", [
    lvl(
      (r) => kc(r, "IssueCode"),
      (s) => `Issue No : ${gstr(s, "IssueNo")}    Date : ${gdate(s, "IssueDate")}`,
      (s) => `Total for Issue ${gstr(s, "IssueNo")}`,
      (r) => gstr(r, "IssueNo")
    ),
  ]),
  date: detailCfg("Issue Details - Date Wise", [
    lvl(
      (r) => gdate(r, "IssueDate"),
      (s) => `Date : ${gdate(s, "IssueDate")}`,
      () => "Total for Date",
      (r) => new Date(firstVal(r.IssueDate)).getTime() || 0,
      "dDate"
    ),
  ]),
  item: detailCfg("Issue Details - Item Wise", [
    lvl(
      (r) => kc(r, "ItemCode"),
      (s) => `Item : ${gstrAny(s, ["ItemID", "ItemCode"])} - ${gstr(s, "ItemName")}`,
      (s) => `Total for ${gstr(s, "ItemName")}`,
      (r) => gstr(r, "ItemName"),
      ["dItemId", "dItem"]
    ),
  ]),
  machine: detailCfg("Issue Details (Consumption) - Machine Wise", [
    lvl(
      (r) => kc(r, "MachineCode"),
      (s) => `Machine : ${gstrAny(s, ["MachineName", "MachineNo"])}`,
      (s) => `Total for ${gstrAny(s, ["MachineName", "MachineNo"])}`,
      (r) => gstrAny(r, ["MachineName", "MachineNo"]),
      "dMachine"
    ),
  ]),
  costhead: detailCfg("Issue Details - Cost Head Wise", [
    lvl(
      (r) => kc(r, "CostHeadCode"),
      (s) => `Cost Head : ${gstr(s, "CostHeadName")}`,
      (s) => `Total for ${gstr(s, "CostHeadName")}`,
      (r) => gstr(r, "CostHeadName"),
      "dCostHead"
    ),
  ]),
  department: detailCfg("Issue Details - Department Wise", [
    lvl(
      (r) => kc(r, "DepartmentCode"),
      (s) => `Department : ${deptName(s)}`,
      (s) => `Total for ${deptName(s)}`,
      (r) => deptName(r),
      "dDept"
    ),
  ]),
  deptcost: detailCfg("Issue Details - Department With Cost Wise", [
    lvl(
      (r) => kc(r, "DepartmentCode"),
      (s) => `Department : ${deptName(s)}`,
      (s) => `Total for ${deptName(s)}`,
      (r) => deptName(r),
      "dDept"
    ),
    lvl(
      (r) => kc(r, "CostHeadCode"),
      (s) => `Cost Head : ${gstr(s, "CostHeadName")}`,
      (s) => `Sub Total : ${gstr(s, "CostHeadName")}`,
      (r) => gstr(r, "CostHeadName"),
      "dCostHead"
    ),
  ]),
  category: detailCfg("Issue Details - Category With Item Wise", [
    lvl(
      (r) => kc(r, "ItemCategoryCode"),
      (s) => `Category : ${gstr(s, "ItemCategoryName")}`,
      (s) => `Total for ${gstr(s, "ItemCategoryName")}`,
      (r) => gstr(r, "ItemCategoryName")
    ),
  ]),
};

// ---- non-Details configs ----------------------------------------------------
const STOCK_INWARD_CFG = {
  title: "Purchase Register With Issue Details (Consolidated)",
  cols: [C.sno, C.itemCode, C.item, C.uom, C.inwardQty, C.inwardVal, C.issRetQty, C.issRetVal, C.closeQty, C.closeVal],
  starKey: "item",
  levels: [
    lvl(
      (r) => kc(r, "ItemGroupCode"),
      (s) => `Item Group : ${gstr(s, "ItemGroupName")}`,
      (s) => `Total for ${gstr(s, "ItemGroupName")}`,
      (r) => gstr(r, "ItemGroupName")
    ),
  ],
  totalKeys: ["inwardQty", "inwardVal", "issRetQty", "issRetVal", "closeQty", "closeVal"],
};
const STOCK_CONSUMPTION_CFG = {
  title: "Stock Unit Wise Consumption",
  cols: [C.sno, C.itemCode, C.item, C.uom, C.consQty, C.consVal],
  starKey: "item",
  levels: [
    lvl(
      (r) => kc(r, "ItemGroupCode"),
      (s) => `Item Group : ${gstr(s, "ItemGroupName")}`,
      (s) => `Total for ${gstr(s, "ItemGroupName")}`,
      (r) => gstr(r, "ItemGroupName")
    ),
  ],
  totalKeys: ["consQty", "consVal"],
};
const YEAR_WISE_CFG = {
  title: "Issue Details - Year Wise",
  cols: [C.sno, C.machine, C.amount],
  starKey: "machine",
  levels: [
    lvl(
      (r) => gstrAny(r, ["Year", "MonthYear"]),
      (s) => `Year : ${gstrAny(s, ["Year", "MonthYear"])}`,
      (s) => `Total for ${gstrAny(s, ["Year", "MonthYear"])}`,
      (r) => gstrAny(r, ["Year", "MonthYear"])
    ),
  ],
  totalKeys: ["amount"],
};
const MONTH_WISE_CFG = {
  title: "Issue Month Wise (Machine Wise Costing)",
  cols: [C.sno, C.machine, C.itemGroup, C.amount],
  starKey: "machine",
  levels: [
    lvl(
      (r) => gstr(r, "MonthYear"),
      (s) => `Month : ${gstr(s, "MonthYear")}`,
      (s) => `Total for ${gstr(s, "MonthYear")}`,
      (r) => gstr(r, "MonthYear")
    ),
  ],
  totalKeys: ["amount"],
};
const SUMMARY_CFG = {
  title: "Issue - IssueNo Wise (Summary)",
  cols: [C.sno, C.issueNo, C.issueDt, C.branch, C.amount],
  starKey: "branch",
  levels: [],
  totalKeys: ["amount"],
};

// ---- SP parameter builders --------------------------------------------------
const dateRange = (p) => ({
  FromDate: { type: sql.DateTime, value: p.FromDate ? new Date(p.FromDate) : null },
  ToDate: { type: sql.DateTime, value: p.ToDate ? new Date(p.ToDate) : null },
});
// FromDate, ToDate, @BranchCode (cond), @CompanyCode (cond).
const paramsWithBranch = (p, req) => {
  const o = dateRange(p);
  const bc = parseInt(req.query.BranchCode) || 0;
  if (bc > 0) o.BranchCode = { type: sql.Int, value: bc };
  const cc = parseInt(p.CompanyCode) || 0;
  if (cc > 0) o.CompanyCode = { type: sql.Int, value: cc };
  return o;
};
// FromDate, ToDate, @CompanyCode (cond) — NO @BranchCode (sp_Stock_Statement,
// sp_Issue_GetAll take no branch in the legacy code).
const paramsNoBranch = (p) => {
  const o = dateRange(p);
  const cc = parseInt(p.CompanyCode) || 0;
  if (cc > 0) o.CompanyCode = { type: sql.Int, value: cc };
  return o;
};

const makeDoc = (cfg, specs) => ({ rows, companyName, companyLogo, fromDate, toDate, query }) =>
  renderGroupedReport({
    rows: applyFilters(rows, query, specs),
    cfg, companyName, companyLogo, fromDate, toDate,
  });

// ---- handlers ---------------------------------------------------------------
// Details — sp_IssueDetails_GetAll, layout chosen by ?groupBy=.
export const issueReport = (req, res) => {
  const cfg = DETAIL_CONFIGS[String(req.query.groupBy || "issueno")] || DETAIL_CONFIGS.issueno;
  return runReport(req, res, {
    spName: "sp_IssueDetails_GetAll",
    fileName: "IssueDetails",
    spParams: paramsWithBranch,
    buildDocDefinition: makeDoc(cfg, DETAIL_SPECS),
  });
};

// StockInward — sp_Stock_Statement (no @BranchCode).
export const issueStockInwardReport = (req, res) =>
  runReport(req, res, {
    spName: "sp_Stock_Statement",
    fileName: "IssueInwardWithIssue",
    spParams: paramsNoBranch,
    buildDocDefinition: makeDoc(STOCK_INWARD_CFG, ITEMGROUP_SPECS),
  });

// StockWithConsumption — sp_StockUnitWiseConsumption.
export const issueStockConsumptionReport = (req, res) =>
  runReport(req, res, {
    spName: "sp_StockUnitWiseConsumption",
    fileName: "IssueStockConsumption",
    spParams: paramsWithBranch,
    buildDocDefinition: makeDoc(STOCK_CONSUMPTION_CFG, ITEMGROUP_SPECS),
  });

// YearWise — sp_Issue_YearWise.
export const issueYearWiseReport = (req, res) =>
  runReport(req, res, {
    spName: "sp_Issue_YearWise",
    fileName: "IssueYearWise",
    spParams: paramsWithBranch,
    buildDocDefinition: makeDoc(YEAR_WISE_CFG, []),
  });

// MonthWiseStock — sp_Issue_MonthWise_Report (filter DepartmentCode).
export const issueMonthWiseReport = (req, res) =>
  runReport(req, res, {
    spName: "sp_Issue_MonthWise_Report",
    fileName: "IssueMonthWise",
    spParams: paramsWithBranch,
    buildDocDefinition: makeDoc(MONTH_WISE_CFG, DEPARTMENT_SPECS),
  });

// else / IssueNo Wise Summary — sp_Issue_GetAll (no @BranchCode, filter IssueCode).
export const issueSummaryReport = (req, res) =>
  runReport(req, res, {
    spName: "sp_Issue_GetAll",
    fileName: "IssueSummary",
    spParams: paramsNoBranch,
    buildDocDefinition: makeDoc(SUMMARY_CFG, ISSUE_SPECS),
  });

// ---- filter option lists ----------------------------------------------------
// One endpoint → every left-rail lookup. Company-scoped lists (Branch / Machine
// / Employee / Issue No) honour ?CompanyCode= and reload on a company switch
// (mirroring cmbCompany_EditValueChanged). Master lists (Item Group / Cost Head
// / Department / Category / Item) are company-independent. Each degrades to []
// on its own error.
export const issueReportOptions = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type("text/plain").send("Missing subDBName header");
    const pool = await getPool(subDbName);
    const cc = parseInt(req.query.CompanyCode) || 0;

    const run = (text, scoped = false) => {
      const r = pool.request();
      if (scoped) r.input("CompanyCode", sql.Int, cc);
      return r.query(text).then((x) => x.recordset || []).catch(() => []);
    };

    const [
      itemGroups, costHeads, departments, itemCategories, items,
      employees, machines, branches, issues,
    ] = await Promise.all([
      run("SELECT ItemGroupName, ItemGroupCode FROM tbl_ItemGroup ORDER BY ItemGroupName"),
      run("SELECT CostHeadName, CostHeadCode FROM tbl_CostHead ORDER BY CostHeadName"),
      run("SELECT DepartmentName_English, DepartmentCode FROM tbl_Department ORDER BY DepartmentName_English"),
      run("SELECT ItemCategoryName, ItemCategoryCode FROM tbl_ItemCategory ORDER BY ItemCategoryName"),
      run("SELECT ItemCode, ItemName, PartNumber FROM tbl_Item"),
      run("SELECT EmployeeCode, EmployeeName FROM tbl_Employee WHERE (@CompanyCode = 0 OR CompanyCode = @CompanyCode) ORDER BY EmployeeName", true),
      run("SELECT MachineCode, MachineName FROM tbl_Machine WHERE (@CompanyCode = 0 OR CompanyCode = @CompanyCode) ORDER BY MachineName", true),
      run("SELECT BranchCode, BranchName FROM tbl_Branch WHERE (@CompanyCode = 0 OR CompanyCode = @CompanyCode) ORDER BY BranchName", true),
      run("SELECT TOP 5000 IssueCode, IssueNo FROM tbl_Issue WHERE (@CompanyCode = 0 OR CompanyCode = @CompanyCode) ORDER BY IssueCode DESC", true),
    ]);

    const map = (rows, nameKey, codeKey) =>
      rows.map((r) => ({ value: r[codeKey], label: r[nameKey] }));

    return res.json({
      itemGroups: map(itemGroups, "ItemGroupName", "ItemGroupCode"),
      costHeads: map(costHeads, "CostHeadName", "CostHeadCode"),
      departments: map(departments, "DepartmentName_English", "DepartmentCode"),
      itemCategories: map(itemCategories, "ItemCategoryName", "ItemCategoryCode"),
      items: map(items, "ItemName", "ItemCode"),
      employees: map(employees, "EmployeeName", "EmployeeCode"),
      machines: map(machines, "MachineName", "MachineCode"),
      branches: map(branches, "BranchName", "BranchCode"),
      issues: map(issues, "IssueNo", "IssueCode"),
    });
  } catch (err) {
    console.error("issueReportOptions:", err);
    return res.status(500).type("text/plain").send("ERROR: " + err.message);
  }
};
