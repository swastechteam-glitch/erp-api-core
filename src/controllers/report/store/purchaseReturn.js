// =============================================================================
// Store ▸ Purchase Return Report (port of WinForms rptPurchaseReturnDetails)
// =============================================================================
// Read-only report in the shared pdfmake convention (controllers/report/cotton/
// _common.js) — same as the Inward / GRN Without Issue siblings. Replaces the
// old self-contained builder (its dateWise/supplierWise modules + the legacy
// pdfReport surface were removed when this screen was ported).
//
// ONE stored procedure, THREE report types (all share the SP; only the layout
// differs):
//
//   sp_PurchaseReturnDetails_GetAll  @FromDate, @ToDate, [@CompanyCode>0]
//     ?groupBy=supplier | returndate | returnno
//     → endpoint /store/reports/purchase-return
//
// Like the legacy screen, the NINE dropdowns are NOT passed to the SP: the SP
// returns the full recordset for Company + date range, then we narrow it
// in-memory with IN(...) on the code columns (DataTable.Select), in this order:
//   CostHeadCode → ItemCategoryCode → DepartmentCode → ItemCode → SupplierCode →
//   PurchaseModeCode → PurchaseOrderReceivedCode → PurchaseReturnCode → UsageTypeCode
// None of the lookups are company-dependent. NO SP is modified. Datetimes are
// local IST — never timezone-converted.
//
// Field names + Tax = CGST+SGST+IGST come from the original RDLC port; the exact
// per-type column SELECTION/grouping is a sensible first pass (confirm vs RDLC).
// Reads unwrap node-mssql duplicate-column arrays (see the GRN report).
// =============================================================================

import {
  runReport,
  buildPage,
  tableLayout,
  colors,
  fmt,
  ddmmyyyy,
  estimateLines,
  topPadFor,
  sql,
} from "../cotton/_common.js";
import { getPool } from "../../../config/dynamicDB.js";

// ---- field access (unwrap duplicate-column arrays) -------------------------
const firstVal = (v) => {
  if (!Array.isArray(v)) return v;
  for (const x of v) if (x !== null && x !== undefined && x !== "") return x;
  return v.length ? v[0] : null;
};
const sCell = (r, col) => {
  const v = firstVal(r[col]);
  return v === null || v === undefined ? "" : String(v);
};
const nCell = (r, col) => {
  const v = firstVal(r[col]);
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};
const dCell = (r, col) => ddmmyyyy(firstVal(r[col]));
const taxOf = (r) => nCell(r, "CGSTAmount") + nCell(r, "SGSTAmount") + nCell(r, "IGSTAmount");
const dateKey = (r) => {
  const d = new Date(firstVal(r.PurchaseReturnDate));
  return isNaN(d.getTime()) ? "9999-99-99" : d.toISOString().slice(0, 10);
};

// ---- in-memory post-SP filters (STEP 3 order) ------------------------------
const RETURN_SPECS = [
  { param: "CostHeadCode", col: "CostHeadCode" },
  { param: "ItemCategoryCode", col: "ItemCategoryCode" },
  { param: "DepartmentCode", col: "DepartmentCode" },
  { param: "ItemCode", col: "ItemCode" },
  { param: "SupplierCode", col: "SupplierCode" },
  { param: "PurchaseModeCode", col: "PurchaseModeCode" },
  { param: "PurchaseOrderReceivedCode", col: "PurchaseOrderReceivedCode" },
  { param: "PurchaseReturnCode", col: "PurchaseReturnCode" },
  { param: "UsageTypeCode", col: "UsageTypeCode" },
];

const parseCodeSet = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const set = new Set(String(v).split(",").map((s) => s.trim()).filter((s) => s.length));
  return set.size ? set : null;
};

function applyFilters(rows, query = {}, specs = RETURN_SPECS) {
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

// ---- table -----------------------------------------------------------------
const headerRow = (headers) =>
  headers.map((t) => ({
    text: t, bold: true, fillColor: colors.headerFill, color: colors.headerText,
    alignment: "center", fontSize: 8,
  }));

// Column catalogue. Numeric cols carry `num` (decimals) + optional `total` key;
// `wrap` marks text cols that wrap (drives row vertical-centering). Exactly ONE
// `*` (Item Name) per config fills the A4-landscape page (single-* = no clip).
const C = {
  sno: { header: "S.No", width: 22, align: "center", get: (r, sno) => String(sno) },
  retNo: { header: "Return No", width: 48, align: "center", get: (r) => sCell(r, "PurchaseReturnNo") },
  retDt: { header: "Return Date", width: 56, align: "center", get: (r) => dCell(r, "PurchaseReturnDate") },
  supp: { header: "Supplier", width: 96, align: "left", wrap: 18, get: (r) => sCell(r, "SupplierName") },
  costHead: { header: "Cost Head", width: 56, align: "left", wrap: 11, get: (r) => sCell(r, "CostHeadName") },
  item: { header: "Item Name", width: "*", align: "left", wrap: 30, get: (r) => sCell(r, "ItemName") },
  uom: { header: "UOM", width: 34, align: "center", get: (r) => sCell(r, "ItemUomName") },
  qty: { header: "Qty", width: 50, align: "right", num: 3, total: "qty", get: (r) => nCell(r, "Qty") },
  rate: { header: "Rate", width: 46, align: "right", num: 2, get: (r) => nCell(r, "Rate") },
  amount: { header: "Amount", width: 58, align: "right", num: 2, total: "amount", get: (r) => nCell(r, "Amount") },
  disc: { header: "Disc", width: 48, align: "right", num: 2, total: "disc", get: (r) => nCell(r, "DiscountAmount") },
  tax: { header: "Tax", width: 52, align: "right", num: 2, total: "tax", get: (r) => taxOf(r) },
  net: { header: "Net Amount", width: 62, align: "right", num: 2, total: "net", get: (r) => nCell(r, "NetAmount") },
};

function detailRow(cols, r, sno, zebra) {
  let maxLines = 1;
  const cellLines = cols.map((c) => {
    if (!c.wrap) return 1;
    const l = estimateLines(String(c.get(r, sno) ?? ""), c.wrap);
    if (l > maxLines) maxLines = l;
    return l;
  });
  return cols.map((c, idx) => {
    const v = c.get(r, sno);
    const text = c.num != null ? fmt(typeof v === "number" ? v : Number(v) || 0, c.num) : String(v ?? "");
    return {
      text, alignment: c.align || "left", fontSize: 8, fillColor: zebra,
      margin: [0, topPadFor(maxLines, cellLines[idx]), 0, 0],
    };
  });
}

function groupHeaderRow(cols, label) {
  return [
    { text: label, colSpan: cols.length, color: colors.groupText, fillColor: colors.groupFill, bold: true, fontSize: 9, margin: [2, 2, 0, 2] },
    ...Array(cols.length - 1).fill({}),
  ];
}

// Sub/Grand row: label spans the leading columns up to the first total column,
// then a total or blank per remaining column.
function totalRow(cols, totals, label, style) {
  const firstTotalIdx = cols.findIndex((c) => c.total);
  const row = [{ text: label, colSpan: firstTotalIdx, alignment: "right", ...style }];
  for (let k = 1; k < firstTotalIdx; k++) row.push({});
  for (let k = firstTotalIdx; k < cols.length; k++) {
    const c = cols[k];
    row.push(c.total ? { text: fmt(totals[c.total] || 0, c.num ?? 2), alignment: "right", ...style } : { text: "", ...style });
  }
  return row;
}

function buildGroupedDoc({ rows, companyName, companyLogo, fromDate, toDate, cfg }) {
  const totalKeys = cfg.cols.filter((c) => c.total).map((c) => c.total);
  const zero = () => Object.fromEntries(totalKeys.map((k) => [k, 0]));
  const addInto = (acc, r) => {
    for (const c of cfg.cols) if (c.total) acc[c.total] += Number(c.get(r)) || 0;
  };

  const body = [headerRow(cfg.cols.map((c) => c.header))];

  const groups = new Map();
  for (const r of rows) {
    const k = String(cfg.groupKey(r) ?? "");
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  let entries = [...groups.values()];
  if (cfg.sortKey) entries.sort((a, b) => String(cfg.sortKey(a)).localeCompare(String(cfg.sortKey(b))));

  const subStyle = { bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 8 };
  const grandStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 };
  const grand = zero();
  let sno = 0;

  for (const g of entries) {
    body.push(groupHeaderRow(cfg.cols, cfg.groupLabel(g)));
    const sub = zero();
    for (const r of g) {
      sno++;
      body.push(detailRow(cfg.cols, r, sno, sno % 2 ? colors.zebraFill : null));
      addInto(sub, r);
    }
    for (const k of totalKeys) grand[k] += sub[k];
    body.push(totalRow(cfg.cols, sub, "Sub Total", subStyle));
  }
  body.push(totalRow(cfg.cols, grand, "Grand Total", grandStyle));

  return buildPage({
    companyName, companyLogo, title: cfg.title, fromDate, toDate,
    tables: [{ table: { headerRows: 1, dontBreakRows: true, widths: cfg.cols.map((c) => c.width), body }, layout: tableLayout() }],
  });
}

// Per-report-type config (grouping + columns). Item/money block uses real RDLC
// field names; per-type column selection is a sensible first pass.
const RETURN_CONFIGS = {
  supplier: {
    title: "PURCHASE RETURN - SUPPLIER WISE",
    fileName: "PurchaseReturn_SupplierWise",
    groupKey: (r) => sCell(r, "SupplierCode"),
    sortKey: (g) => sCell(g[0], "SupplierName").toLowerCase(),
    groupLabel: (g) => "Supplier : " + sCell(g[0], "SupplierName"),
    cols: [C.sno, C.retNo, C.retDt, C.costHead, C.item, C.uom, C.qty, C.rate, C.amount, C.disc, C.tax, C.net],
  },
  returndate: {
    title: "PURCHASE RETURN - DATE WISE",
    fileName: "PurchaseReturn_DateWise",
    groupKey: (r) => dateKey(r),
    sortKey: (g) => dateKey(g[0]),
    groupLabel: (g) => "Return Date : " + dCell(g[0], "PurchaseReturnDate"),
    cols: [C.sno, C.retNo, C.supp, C.costHead, C.item, C.uom, C.qty, C.rate, C.amount, C.disc, C.tax, C.net],
  },
  returnno: {
    title: "PURCHASE RETURN - RETURN NO WISE",
    fileName: "PurchaseReturn_ReturnNoWise",
    groupKey: (r) => sCell(r, "PurchaseReturnCode"),
    sortKey: (g) => sCell(g[0], "PurchaseReturnNo"),
    groupLabel: (g) =>
      "Return No : " + sCell(g[0], "PurchaseReturnNo") + "   (" + dCell(g[0], "PurchaseReturnDate") + ")   -   " + sCell(g[0], "SupplierName"),
    cols: [C.sno, C.costHead, C.item, C.uom, C.qty, C.rate, C.amount, C.disc, C.tax, C.net],
  },
};

// ---- handlers ---------------------------------------------------------------
export const purchaseReturnReport = (req, res) => {
  const groupBy = String(req.query.groupBy || "supplier").toLowerCase();
  const cfg = RETURN_CONFIGS[groupBy] || RETURN_CONFIGS.supplier;
  return runReport(req, res, {
    spName: "sp_PurchaseReturnDetails_GetAll",
    fileName: cfg.fileName,
    spParams: (p) => {
      const cc = parseInt(p.CompanyCode) || 0;
      const o = {
        FromDate: { type: sql.DateTime, value: p.FromDate ? new Date(p.FromDate) : null },
        ToDate: { type: sql.DateTime, value: p.ToDate ? new Date(p.ToDate) : null },
      };
      if (cc > 0) o.CompanyCode = { type: sql.Int, value: cc }; // sent only when > 0
      return o;
    },
    buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate, query }) =>
      buildGroupedDoc({
        rows: applyFilters(rows, query, RETURN_SPECS),
        companyName, companyLogo, fromDate, toDate, cfg,
      }),
  });
};

// ---- filter option lists ----------------------------------------------------
// Mirrors the VB Bind_Data() lookups. ALL company-INDEPENDENT (Inw. No /
// Pur.Return No load every record). Each degrades to [] on its own error.
export const purchaseReturnReportOptions = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type("text/plain").send("Missing subDBName header");
    const pool = await getPool(subDbName);

    const q = (text) => pool.request().query(text).then((r) => r.recordset || []).catch(() => []);

    const [costHeads, departments, itemCategories, items, suppliers, purchaseModes, usageTypes, inwards, returns] =
      await Promise.all([
        q("SELECT CostHeadName, CostHeadCode FROM tbl_CostHead ORDER BY CostHeadName"),
        q("SELECT DepartmentName, DepartmentCode FROM tbl_Department ORDER BY DepartmentName"),
        q("SELECT ItemCategoryName, ItemCategoryCode FROM tbl_ItemCategory ORDER BY ItemCategoryName"),
        q("SELECT ItemID, ItemName, ItemCode FROM tbl_Item ORDER BY ItemID"),
        q("SELECT SupplierName, SupplierCode FROM tbl_Supplier ORDER BY SupplierName"),
        q("SELECT PurchaseMode, PurchaseModeCode FROM tbl_PurchaseMode"),
        q("SELECT UsageTypeCode, UsageTypeName FROM tbl_UsageType"),
        q("SELECT PurchaseOrderReceivedNo, PurchaseOrderReceivedDate, PurchaseOrderReceivedCode FROM tbl_PurchaseOrderReceived ORDER BY PurchaseOrderReceivedNo DESC, PurchaseOrderReceivedDate DESC"),
        q("SELECT PurchaseReturnNo, PurchaseReturnDate, PurchaseReturnCode FROM tbl_PurchaseReturn ORDER BY PurchaseReturnNo DESC, PurchaseReturnDate DESC"),
      ]);

    const map = (rows, nameKey, codeKey) => rows.map((r) => ({ value: r[codeKey], label: r[nameKey] }));

    return res.json({
      costHeads: map(costHeads, "CostHeadName", "CostHeadCode"),
      departments: map(departments, "DepartmentName", "DepartmentCode"),
      itemCategories: map(itemCategories, "ItemCategoryName", "ItemCategoryCode"),
      items: map(items, "ItemName", "ItemCode"),
      suppliers: map(suppliers, "SupplierName", "SupplierCode"),
      purchaseModes: map(purchaseModes, "PurchaseMode", "PurchaseModeCode"),
      usageTypes: map(usageTypes, "UsageTypeName", "UsageTypeCode"),
      inwards: inwards.map((r) => ({
        value: r.PurchaseOrderReceivedCode,
        label: String(r.PurchaseOrderReceivedNo) + " - " + ddmmyyyy(r.PurchaseOrderReceivedDate),
      })),
      returns: returns.map((r) => ({
        value: r.PurchaseReturnCode,
        label: String(r.PurchaseReturnNo) + " - " + ddmmyyyy(r.PurchaseReturnDate),
      })),
    });
  } catch (err) {
    console.error("purchaseReturnReportOptions:", err);
    return res.status(500).type("text/plain").send("ERROR: " + err.message);
  }
};
