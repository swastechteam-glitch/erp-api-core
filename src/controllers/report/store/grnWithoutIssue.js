// =============================================================================
// Store ▸ GRN Item Without Issue Report (port of WinForms rptGRNWithoutIssue)
// =============================================================================
// Read-only report in the shared pdfmake convention
// (controllers/report/cotton/_common.js) — same as the Inward / Purchase Order
// Report siblings. The legacy RDLC (rptItemGRNWithoutIssue.rdlc) is NOT consumed
// at runtime; it's re-implemented here as a hand-written pdfmake template.
//
// ONE stored procedure, ONE report type, a FLAT table (no grouping):
//
//   sp_GRN_WithoutIssue_Item  @FromDate, @ToDate, [@CompanyCode>0]
//     → endpoint /store/reports/grn-without-issue
//
// Like the legacy screen, the Department / Category / Item dropdowns are NOT
// passed to the SP: the SP returns the full recordset for Company + date range,
// then we narrow it in-memory with IN(...) on the code columns (DataTable.Select),
// in the order DepartmentCode → ItemCategoryCode → ItemCode. Those master lists
// are company-INDEPENDENT. NO SP is modified. Datetimes are local IST — never
// timezone-converted.
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

// sp_GRN_WithoutIssue_Item returns SEVERAL duplicate column names (ItemID,
// ItemName, ItemUomName, PurchaseOrderReceivedDate, Qty, Rate, NetAmount, …) —
// the legacy .NET dataset deduped them to ItemID/ItemID1 etc. node-mssql instead
// collapses duplicate columns into an ARRAY of values, so reading them raw gives
// "CDSPAP0380,CDSPAP0380" (Array→String), NaN→0, or an invalid date. The RDLC
// binds to the FIRST (non-suffixed) occurrence, so unwrap to the first
// meaningful element before using any field.
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

// ---- in-memory post-SP filters (mirror the VB DataTable.Select chain) -------
const GRN_SPECS = [
  { param: "DepartmentCode", col: "DepartmentCode" },
  { param: "ItemCategoryCode", col: "ItemCategoryCode" },
  { param: "ItemCode", col: "ItemCode" },
];

const parseCodeSet = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const set = new Set(
    String(v).split(",").map((s) => s.trim()).filter((s) => s.length)
  );
  return set.size ? set : null;
};

function applyFilters(rows, query = {}, specs = GRN_SPECS) {
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

// Flat 9-column table — matches rptItemGRNWithoutIssue.rdlc exactly (which is an
// A4 PORTRAIT report). One * column (Item Description) absorbs the remainder so
// the table fills the portrait page; the other text columns are fixed and wrap
// internally (single-* = no clipping). Portrait usable width ≈ 565.3pt
// (595.28 − 30 margins); fixed cols (328) + 9×8pt padding + borders leave the
// star ≈ 161pt for the description.
const GR_HEAD = [
  "S.No", "GRN No", "GRN Date", "Item Code", "Item Description", "UOM", "Qty", "Rate", "Value",
];
const GR_WIDTHS = [20, 38, 50, 58, "*", 30, 42, 38, 52];
const GR_WRAP = { code: 14, item: 38 };

function grnRow(r, sno, zebra) {
  const code = gstr(r, "ItemID");
  const item = gstr(r, "ItemName");
  const cL = estimateLines(code, GR_WRAP.code);
  const iL = estimateLines(item, GR_WRAP.item);
  const maxLines = Math.max(1, cL, iL);
  const cell = (text, align = "left", cellLines = 1) => ({
    text, alignment: align, fontSize: 8, fillColor: zebra,
    margin: [0, topPadFor(maxLines, cellLines), 0, 0],
  });
  return [
    cell(String(sno), "center"),
    cell(gstr(r, "PurchaseOrderReceivedNo"), "center"),
    cell(gdate(r, "PurchaseOrderReceivedDate"), "center"),
    cell(code, "left", cL),
    cell(item, "left", iL),
    cell(gstr(r, "ItemUomName"), "center"),
    cell(fmt(gdec(r, "Qty"), 3), "right"),
    cell(fmt(gdec(r, "Rate"), 2), "right"),
    cell(fmt(gdec(r, "NetAmount"), 2), "right"),
  ];
}

// Footer: "Total" spans S.No..UOM (6 cols), then Σ Qty, a blank under Rate, Σ Value.
function grnTotalRow(t) {
  const style = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 };
  return [
    { text: "Total", colSpan: 6, alignment: "right", ...style },
    {}, {}, {}, {}, {},
    { text: fmt(t.qty, 3), alignment: "right", ...style },
    { text: "", ...style },
    { text: fmt(t.net, 2), alignment: "right", ...style },
  ];
}

function buildGrnWithoutIssueDoc({ rows, companyName, companyLogo, fromDate, toDate }) {
  const body = [headerRow(GR_HEAD)];
  let qty = 0, net = 0;
  rows.forEach((r, i) => {
    body.push(grnRow(r, i + 1, i % 2 ? colors.zebraFill : null));
    qty += gdec(r, "Qty");
    net += gdec(r, "NetAmount");
  });
  body.push(grnTotalRow({ qty, net }));

  return buildPage({
    companyName,
    companyLogo,
    title: "GRN Register-WithOut Issue",
    fromDate,
    toDate,
    orientation: "portrait", // mirrors the portrait RDLC
    tables: [
      { table: { headerRows: 1, dontBreakRows: true, widths: GR_WIDTHS, body }, layout: tableLayout() },
    ],
  });
}

// ---- handlers ---------------------------------------------------------------
export const grnWithoutIssueReport = (req, res) =>
  runReport(req, res, {
    spName: "sp_GRN_WithoutIssue_Item",
    fileName: "GRN_WithoutIssue",
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
      buildGrnWithoutIssueDoc({
        rows: applyFilters(rows, query, GRN_SPECS),
        companyName, companyLogo, fromDate, toDate,
      }),
  });

// ---- filter option lists ----------------------------------------------------
// Mirrors the VB Bind_Data() lookups. Department / Category / Item are company-
// INDEPENDENT (no CompanyCode scope). Each degrades to [] on its own error.
export const grnWithoutIssueOptions = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type("text/plain").send("Missing subDBName header");
    const pool = await getPool(subDbName);

    const q = (text) => pool.request().query(text).then((r) => r.recordset || []).catch(() => []);

    const [departments, itemCategories, items] = await Promise.all([
      q("SELECT DepartmentName_English, DepartmentCode FROM tbl_Department ORDER BY DepartmentName_English"),
      q("SELECT ItemCategoryName, ItemCategoryCode FROM tbl_ItemCategory ORDER BY ItemCategoryName"),
      q("SELECT ItemCode, ItemName, PartNumber FROM tbl_Item"),
    ]);

    const map = (rows, nameKey, codeKey) => rows.map((r) => ({ value: r[codeKey], label: r[nameKey] }));

    return res.json({
      departments: map(departments, "DepartmentName_English", "DepartmentCode"),
      itemCategories: map(itemCategories, "ItemCategoryName", "ItemCategoryCode"),
      items: map(items, "ItemName", "ItemCode"),
    });
  } catch (err) {
    console.error("grnWithoutIssueOptions:", err);
    return res.status(500).type("text/plain").send("ERROR: " + err.message);
  }
};
