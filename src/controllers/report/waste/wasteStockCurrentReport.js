// =============================================================================
// Waste ▸ Waste Stock Report ▸ Stock Current Status  (WinForms rptWasteStock)
// =============================================================================
// The desktop "Group By" combo, ported as one endpoint keyed on ?groupBy=:
//
//   GET /waste/reports/stock/current?groupBy=abstract|abstract-weight|bale|item|datewise
//     abstract        -> sp_WasteStock_Abstract       (rptWasteStockAbstract.rdlc)
//     abstract-weight -> sp_WasteAbstract_Stock        (rptWasteStock_AbstratWithWeight.rdlc)
//     bale            -> sp_WasteStock_Current          (rptWasteStockBaleNoWise.rdlc)
//     item            -> sp_WasteStock_Current          (rptWasteStockItemWise.rdlc)
//     datewise        -> sp_WasteStockStatus_DateWise   (rptWasteStockStatusDateWise.rdlc)
//
// Each variant runs its own stored proc with the right params: abstract / bale /
// item take CompanyCode only; datewise takes CompanyCode + FromDate + ToDate
// (mirrors the VB btnView_Click branch).
//
// Functional filters mirror the VB DataResult.Select("... IN (...)") in-memory:
//   SupervisorCodes -> SupervisorCode   (Supervisor multi-select)
//   WasteItemCodes  -> WasteItemCode     (Waste Item multi-select)
// (Supervisor is only applied when the recordset actually carries the column —
// it does not exist for the abstract-weight / datewise procs, exactly as in VB.)
// =============================================================================

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy, sql
} from '../cotton/_common.js';

// --- in-memory CSV filters ---------------------------------------------------
const csvSet = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const set = new Set(String(v).split(',').map((x) => x.trim()).filter((x) => x !== ''));
  return set.size ? set : null;
};
const hasCol = (rows, col) => rows.length > 0 && Object.prototype.hasOwnProperty.call(rows[0], col);

function applyFilters(rows, query = {}) {
  let out = rows || [];
  const sups = csvSet(query.SupervisorCodes);
  const items = csvSet(query.WasteItemCodes);
  if (items && hasCol(out, 'WasteItemCode')) {
    out = out.filter((r) => items.has(String(dec(r, 'WasteItemCode'))));
  }
  if (sups && hasCol(out, 'SupervisorCode')) {
    out = out.filter((r) => sups.has(String(dec(r, 'SupervisorCode'))));
  }
  return out;
}

// --- shared cell helpers -----------------------------------------------------
const H = (hs) => hs.map((t) => ({ text: t, bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 8 }));
const C = (t, a = 'right', z = null) => ({ text: t, alignment: a, fontSize: 8, fillColor: z });
const T = (t, a = 'right') => ({ text: t, alignment: a, bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 8 });
const zof = (i) => (i % 2 === 1 ? colors.zebraFill : null);
const sectionTitle = (t) => ({ text: t, bold: true, fontSize: 9, color: colors.subText, fillColor: colors.subFill, margin: [0, 8, 0, 2] });
const noData = [{ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] }];

function groupByKey(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}

// =============================================================================
// ABSTRACT — sp_WasteStock_Abstract: bale numbers grouped by ShortName, each
// group totalling its bale count.
// =============================================================================
function buildAbstract({ rows, companyName, companyLogo, fromDate, toDate }) {
  const tables = [];
  const groups = groupByKey(rows, (r) => str(r, 'ShortName') || str(r, 'WasteItemName') || '(No Group)');
  const keys = [...groups.keys()].sort((a, b) => a.localeCompare(b));
  let grandBales = 0;

  for (const key of keys) {
    const list = groups.get(key);
    const body = [H(['S.No', 'Bale No', 'Bales'])];
    let bales = 0;
    list.forEach((r, i) => {
      const z = zof(i);
      const cnt = dec(r, 'BaleCount') || 1;
      bales += cnt;
      body.push([C(String(i + 1), 'center', z), C(str(r, 'BaleNo'), 'left', z), C(fmt(cnt, 0), 'right', z)]);
    });
    grandBales += bales;
    body.push([{ ...T('Total', 'right'), colSpan: 2 }, {}, T(fmt(bales, 0))]);
    tables.push(sectionTitle(key));
    tables.push({ table: { headerRows: 1, widths: [28, '*', 70], body }, layout: tableLayout() });
  }

  if (!tables.length) return buildPage({ companyName, companyLogo, title: 'BALE ABSTRACT', fromDate, toDate, tables: noData });
  tables.push({
    margin: [0, 6, 0, 0],
    table: { widths: [28, '*', 70], body: [[{ ...T('Grand Total', 'right'), colSpan: 2 }, {}, T(fmt(grandBales, 0))]] },
    layout: tableLayout()
  });
  return buildPage({ companyName, companyLogo, title: 'BALE ABSTRACT', fromDate, toDate, tables });
}

// =============================================================================
// ABSTRACT WITH WEIGHT — sp_WasteAbstract_Stock: 4 (S.No / Bale No / Weight)
// column groups per item, plus per-item Total Bales / Total Kgs.
// =============================================================================
function buildAbstractWeight({ rows, companyName, companyLogo, fromDate, toDate }) {
  const tables = [];
  const groups = groupByKey(rows, (r) => str(r, 'WasteItemName') || '(No Item)');
  const head = H(['S.No', 'Bale No', 'Weight', 'S.No', 'Bale No', 'Weight', 'S.No', 'Bale No', 'Weight', 'S.No', 'Bale No', 'Weight']);
  const widths = [26, 44, 56, 26, 44, 56, 26, 44, 56, 26, 44, 56];

  for (const key of [...groups.keys()].sort((a, b) => a.localeCompare(b))) {
    const list = groups.get(key);
    const body = [head];
    let bales = 0, kgs = 0;
    list.forEach((r, i) => {
      const z = zof(i);
      bales += dec(r, 'TotalBales');
      kgs += dec(r, 'TotalKgs');
      body.push([
        C(str(r, 'SNo1'), 'center', z), C(str(r, 'BaleNo1'), 'right', z), C(r.BaleNo1W != null ? fmt(dec(r, 'BaleNo1W'), 3) : '', 'right', z),
        C(str(r, 'SNo2'), 'center', z), C(str(r, 'BaleNo2'), 'right', z), C(r.BaleNo2W != null ? fmt(dec(r, 'BaleNo2W'), 3) : '', 'right', z),
        C(str(r, 'SNo3'), 'center', z), C(str(r, 'BaleNo3'), 'right', z), C(r.BaleNo3W != null ? fmt(dec(r, 'BaleNo3W'), 3) : '', 'right', z),
        C(str(r, 'SNo4'), 'center', z), C(str(r, 'BaleNo4'), 'right', z), C(r.BaleNo4W != null ? fmt(dec(r, 'BaleNo4W'), 3) : '', 'right', z),
      ]);
    });
    body.push([
      { ...T('Total Bales : ' + fmt(bales, 0), 'right'), colSpan: 9 }, {}, {}, {}, {}, {}, {}, {}, {},
      { ...T('Kgs : ' + fmt(kgs, 3), 'right'), colSpan: 3 }, {}, {},
    ]);
    tables.push(sectionTitle(key));
    tables.push({ table: { headerRows: 1, widths, body }, layout: tableLayout() });
  }

  return buildPage({ companyName, companyLogo, title: 'BALE ABSTRACT WITH WEIGHT', fromDate, toDate, tables: tables.length ? tables : noData });
}

// =============================================================================
// BALE NO WISE — sp_WasteStock_Current: bale lines grouped by item, with G/T/N
// weights and per-item + grand totals.
// =============================================================================
function buildBaleNo({ rows, companyName, companyLogo, fromDate, toDate }) {
  const tables = [];
  const widths = [30, '*', 80, 80, 80];
  const headers = ['S.No', 'Bale No', 'G. Weight', 'T. Weight', 'N. Weight'];
  const groups = groupByKey(rows, (r) => str(r, 'WasteItemName') || '(No Item)');
  const grand = { GrossWeight: 0, TareWeight: 0, NetWeight: 0, bales: 0 };

  for (const key of [...groups.keys()].sort((a, b) => a.localeCompare(b))) {
    const list = groups.get(key);
    const body = [H(headers)];
    const sub = { GrossWeight: 0, TareWeight: 0, NetWeight: 0 };
    list.forEach((r, i) => {
      const z = zof(i);
      sub.GrossWeight += dec(r, 'GrossWeight');
      sub.TareWeight += dec(r, 'TareWeight');
      sub.NetWeight += dec(r, 'NetWeight');
      body.push([
        C(String(i + 1), 'center', z), C(str(r, 'BaleNo'), 'right', z),
        C(fmt(dec(r, 'GrossWeight'), 3), 'right', z), C(fmt(dec(r, 'TareWeight'), 3), 'right', z), C(fmt(dec(r, 'NetWeight'), 3), 'right', z),
      ]);
    });
    grand.bales += list.length;
    grand.GrossWeight += sub.GrossWeight; grand.TareWeight += sub.TareWeight; grand.NetWeight += sub.NetWeight;
    body.push([{ ...T(`Total (${list.length})`, 'right'), colSpan: 2 }, {}, T(fmt(sub.GrossWeight, 3)), T(fmt(sub.TareWeight, 3)), T(fmt(sub.NetWeight, 3))]);
    tables.push(sectionTitle(`${key}   —   ${list.length} bale(s)`));
    tables.push({ table: { headerRows: 1, widths, body }, layout: tableLayout() });
  }

  if (!tables.length) return buildPage({ companyName, companyLogo, title: 'WASTE STOCK - BALE NO WISE', fromDate, toDate, tables: noData });
  tables.push({
    margin: [0, 6, 0, 0],
    table: { widths, body: [[{ ...T(`Grand Total (${grand.bales})`, 'right'), colSpan: 2 }, {}, T(fmt(grand.GrossWeight, 3)), T(fmt(grand.TareWeight, 3)), T(fmt(grand.NetWeight, 3))]] },
    layout: tableLayout()
  });
  return buildPage({ companyName, companyLogo, title: 'WASTE STOCK - BALE NO WISE', fromDate, toDate, tables });
}

// =============================================================================
// ITEM WISE — sp_WasteStock_Current: one summary row per item (bale count +
// net weight) with a grand total.
// =============================================================================
function buildItem({ rows, companyName, companyLogo, fromDate, toDate }) {
  const widths = [30, '*', 90, 110];
  const body = [H(['S.No', 'Waste Item Name', 'Bales', 'Net Weight'])];
  const groups = groupByKey(rows, (r) => str(r, 'WasteItemName') || '(No Item)');
  const keys = [...groups.keys()].sort((a, b) => a.localeCompare(b));
  let gBales = 0, gWt = 0, i = 0;
  for (const key of keys) {
    const list = groups.get(key);
    const wt = list.reduce((a, r) => a + dec(r, 'NetWeight'), 0);
    gBales += list.length; gWt += wt;
    const z = zof(i);
    body.push([C(String(i + 1), 'center', z), C(key, 'left', z), C(fmt(list.length, 0), 'right', z), C(fmt(wt, 3), 'right', z)]);
    i++;
  }
  if (!keys.length) return buildPage({ companyName, companyLogo, title: 'WASTE STOCK - ITEM WISE', fromDate, toDate, tables: noData });
  body.push([{ ...T('Total', 'right'), colSpan: 2 }, {}, T(fmt(gBales, 0)), T(fmt(gWt, 3))]);
  return buildPage({
    companyName, companyLogo, title: 'WASTE STOCK - ITEM WISE', fromDate, toDate,
    tables: [{ table: { headerRows: 1, widths, body }, layout: tableLayout() }]
  });
}

// =============================================================================
// DATE WISE — sp_WasteStockStatus_DateWise: per-day opening/production/sales/
// closing kgs grouped by item, with a production+sales total per item.
// =============================================================================
function buildDateWise({ rows, companyName, companyLogo, fromDate, toDate }) {
  const tables = [];
  const widths = [26, 64, 60, 64, 60, 60, 64, '*', 64];
  const headers = ['S.No', 'Date', 'Op Kgs', 'Pro Kgs', 'Total Kgs', 'Sal Kgs', 'Cl Kgs', 'Inv No', 'Inv Date'];
  const groups = groupByKey(rows, (r) => str(r, 'WasteItemName') || '(No Item)');

  for (const key of [...groups.keys()].sort((a, b) => a.localeCompare(b))) {
    const list = groups.get(key);
    list.sort((a, b) => new Date(a.StockDate) - new Date(b.StockDate));
    const body = [H(headers)];
    let pro = 0, sal = 0;
    list.forEach((r, i) => {
      const z = zof(i);
      pro += dec(r, 'ProductionKgs'); sal += dec(r, 'SalesKgs');
      body.push([
        C(String(i + 1), 'center', z), C(ddmmyyyy(r.StockDate), 'center', z),
        C(fmt(dec(r, 'OPKgs'), 3), 'right', z), C(fmt(dec(r, 'ProductionKgs'), 3), 'right', z), C(fmt(dec(r, 'TotalKgs'), 3), 'right', z),
        C(fmt(dec(r, 'SalesKgs'), 3), 'right', z), C(fmt(dec(r, 'ClosingKgs'), 3), 'right', z),
        C(str(r, 'WasteInvoiceNo'), 'left', z), C(r.WasteInvoiceDate ? ddmmyyyy(r.WasteInvoiceDate) : '', 'center', z),
      ]);
    });
    body.push([
      { ...T('Total', 'right'), colSpan: 3 }, {}, {}, T(fmt(pro, 3)), {}, T(fmt(sal, 3)), {}, {}, {},
    ]);
    tables.push(sectionTitle(key));
    tables.push({ table: { headerRows: 1, widths, body }, layout: tableLayout() });
  }

  return buildPage({ companyName, companyLogo, title: 'WASTE STOCK STATUS - DATE WISE', fromDate, toDate, tables: tables.length ? tables : noData });
}

// --- variant registry --------------------------------------------------------
const companyOnly = (p) => ({ CompanyCode: { type: sql.Int, value: parseInt(p.CompanyCode) || 0 } });
const withDates = (p) => ({
  CompanyCode: { type: sql.Int, value: parseInt(p.CompanyCode) || 0 },
  FromDate: { type: sql.DateTime, value: p.FromDate ? new Date(p.FromDate) : null },
  ToDate: { type: sql.DateTime, value: p.ToDate ? new Date(p.ToDate) : null },
});

const VARIANTS = {
  abstract: { spName: 'sp_WasteStock_Abstract', spParams: companyOnly, build: buildAbstract },
  'abstract-weight': { spName: 'sp_WasteAbstract_Stock', spParams: companyOnly, build: buildAbstractWeight },
  bale: { spName: 'sp_WasteStock_Current', spParams: companyOnly, build: buildBaleNo },
  item: { spName: 'sp_WasteStock_Current', spParams: companyOnly, build: buildItem },
  datewise: { spName: 'sp_WasteStockStatus_DateWise', spParams: withDates, build: buildDateWise },
};

export const wasteStockCurrentReport = (req, res) => {
  const gb = String((req.query && req.query.groupBy) || 'abstract').toLowerCase();
  const cfg = VARIANTS[gb] || VARIANTS.abstract;
  return runReport(req, res, {
    spName: cfg.spName,
    fileName: 'WasteStock_Current_' + gb,
    spParams: cfg.spParams,
    buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate, query }) =>
      cfg.build({ rows: applyFilters(rows, query), companyName, companyLogo, fromDate, toDate }),
  });
};
