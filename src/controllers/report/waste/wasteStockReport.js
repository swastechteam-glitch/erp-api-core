// =============================================================================
// Waste ▸ Waste Stock Report   (WinForms rptWasteStock "Waste Stock Report")
// =============================================================================
// One endpoint serving the three desktop radios, all backed by ONE stored proc
// (sp_WasteStockStatus, params CompanyCode / FromDate / ToDate):
//
//   GET /waste/reports/stock/report?variant=status|weight|rate
//     status  -> "Stock Status"  : rptWasteStockStatus.rdlc  (qty+weight+VALUE)
//     weight  -> "With Weight"   : rptWasteStockStatus_WithoutValue.rdlc (qty+weight)
//     rate    -> "Rate Per KG"   : WasteRatePerKgReport.rdlc  (Op/Pro/Sal/Tr/Cl
//                                   weight + value + avg rate summary)
//
// Functional filters mirror the VB DataResult.Select("... IN (...)") in-memory:
//   WasteItemGroupCodes  -> WasteItemGroupCode   (W. Item Group multi-select)
//   WasteItemCodes       -> WasteItemCode         (Waste Item multi-select)
//
// Options for those filters come from GET /waste/reports/stock/options.
// =============================================================================

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, sql
} from '../cotton/_common.js';
import { getPool } from '../../../config/dynamicDB.js';

// --- in-memory CSV filter (mirrors DataResult.Select("X IN (...)")) ----------
const csvSet = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const set = new Set(
    String(v).split(',').map((x) => x.trim()).filter((x) => x !== '')
  );
  return set.size ? set : null;
};

function applyFilters(rows, query = {}) {
  const groups = csvSet(query.WasteItemGroupCodes);
  const items = csvSet(query.WasteItemCodes);
  if (!groups && !items) return rows || [];
  return (rows || []).filter((r) => {
    if (groups && !groups.has(String(dec(r, 'WasteItemGroupCode')))) return false;
    if (items && !items.has(String(dec(r, 'WasteItemCode')))) return false;
    return true;
  });
}

// --- shared cell helpers -----------------------------------------------------
const headRow = (headers) =>
  headers.map((h) => ({
    text: h, bold: true, fillColor: colors.headerFill, color: colors.headerText,
    alignment: 'center', fontSize: 8
  }));
const td = (text, align = 'right', zebra = null) =>
  ({ text, alignment: align, fontSize: 8, fillColor: zebra });
const totalCell = (text, align = 'right') =>
  ({ text, alignment: align, bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 8 });
const zebraOf = (i) => (i % 2 === 1 ? colors.zebraFill : null);

function section(title, widths, body) {
  return [
    { text: title, bold: true, fontSize: 9, color: colors.subText, fillColor: colors.subFill, margin: [0, 8, 0, 2] },
    { table: { headerRows: 1, dontBreakRows: false, keepWithHeaderRows: 1, widths, body }, layout: tableLayout() }
  ];
}

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
// status / weight — grouped item stock, optionally with a closing Value column
// =============================================================================
const NUM_BASE = [
  { key: 'OpQty', label: 'Op Bale', digits: 0 },
  { key: 'OpWeight', label: 'Op Weight', digits: 3 },
  { key: 'ProQty', label: 'Pro Bale', digits: 0 },
  { key: 'ProWeight', label: 'Pro Weight', digits: 3 },
  { key: 'SalQty', label: 'Sal Bale', digits: 0 },
  { key: 'SalWeight', label: 'Sal Weight', digits: 3 },
  { key: 'ClQty', label: 'Cl Bale', digits: 0 },
  { key: 'ClWeight', label: 'Cl Weight', digits: 3 }
];
const NUM_BASE_WIDTHS = [40, 56, 40, 56, 40, 56, 40, 56];
const VALUE_COL = { key: 'ClosingValue', label: 'Value', digits: 2 };

function buildGroupedStock({ rows, companyName, companyLogo, fromDate, toDate, withValue }) {
  const NUM = withValue ? [...NUM_BASE, VALUE_COL] : NUM_BASE;
  const NUM_WIDTHS = withValue ? [...NUM_BASE_WIDTHS, 66] : NUM_BASE_WIDTHS;
  const title = withValue ? 'WASTE STOCK WITH VALUE' : 'WASTE STOCK';

  const headers = ['S.No', 'Item Name', ...NUM.map((n) => n.label)];
  const widths = [28, '*', ...NUM_WIDTHS];
  const tables = [];

  const groups = groupByKey(rows, (r) => str(r, 'WasteItemGroupName') || '(No Group)');
  const keys = [...groups.keys()].sort((a, b) => a.localeCompare(b));
  const grand = {};

  for (const key of keys) {
    const list = groups.get(key);
    list.sort((a, b) => str(a, 'WasteItemName').localeCompare(str(b, 'WasteItemName')));

    const body = [headRow(headers)];
    const sub = {};
    let i = 0;
    for (const r of list) {
      const z = zebraOf(i);
      body.push([
        td(String(i + 1), 'center', z),
        td(str(r, 'WasteItemName'), 'left', z),
        ...NUM.map((n) => {
          const v = dec(r, n.key);
          sub[n.key] = (sub[n.key] || 0) + v;
          return td(fmt(v, n.digits), 'right', z);
        })
      ]);
      i++;
    }
    body.push([
      { ...totalCell('Total', 'right'), colSpan: 2 }, {},
      ...NUM.map((n) => {
        grand[n.key] = (grand[n.key] || 0) + (sub[n.key] || 0);
        return totalCell(fmt(sub[n.key] || 0, n.digits));
      })
    ]);

    for (const node of section(key, widths, body)) tables.push(node);
  }

  if (!tables.length) {
    tables.push({ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] });
  } else {
    tables.push({
      margin: [0, 6, 0, 0],
      table: {
        widths,
        body: [[
          { ...totalCell('Grand Total', 'right'), colSpan: 2 }, {},
          ...NUM.map((n) => totalCell(fmt(grand[n.key] || 0, n.digits)))
        ]]
      },
      layout: tableLayout()
    });
  }

  return buildPage({ companyName, companyLogo, title, fromDate, toDate, tables });
}

// =============================================================================
// rate — Waste Rate / KG summary (Op / Pro / Total / Sales / Transfer / Closing)
// columns: Weight (KG) | Value | Avg Rate. Value = weight * avg StockRate.
// =============================================================================
function buildRatePerKg({ rows, companyName, companyLogo, fromDate, toDate }) {
  const sum = (key) => rows.reduce((a, r) => a + dec(r, key), 0);
  const rates = rows.map((r) => dec(r, 'StockRate')).filter((n) => n > 0);
  const avgRate = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;

  const op = sum('OpWeight');
  const pro = sum('ProWeight');
  const sal = sum('SalWeight');
  const tr = sum('TransferWeight');
  const cl = sum('ClWeight');
  const total = op + pro;

  const headers = ['Particulars', 'Weight (KG)', 'Value', 'Avg Rate'];
  const row = (label, wt, { bold = false, showRate = true } = {}) => {
    const cell = (text, align) => ({
      text, alignment: align, fontSize: 9, bold,
      color: bold ? colors.grandText : undefined,
      fillColor: bold ? colors.grandFill : null
    });
    return [
      cell(label, 'left'),
      cell(fmt(wt, 3), 'right'),
      cell(fmt(wt * avgRate, 2), 'right'),
      cell(showRate ? fmt(avgRate, 2) : '', 'right')
    ];
  };

  const body = [
    headRow(headers),
    row('Opening', op),
    row('Production', pro),
    row('Total (Op + Pro)', total, { bold: true }),
    row('Sales', sal),
    row('Transfer', tr),
    row('Closing', cl, { bold: true })
  ];

  const tables = [{
    table: { headerRows: 1, widths: ['*', 120, 120, 90], body },
    layout: tableLayout()
  }];

  return buildPage({ companyName, companyLogo, title: 'WASTE RATE / KG', fromDate, toDate, tables });
}

// --- dispatcher --------------------------------------------------------------
function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate, query }) {
  const raw = applyFilters(rows, query);
  // ReportViewer sends the selected radio as `groupBy`; accept `variant` too.
  const variant = String((query && (query.groupBy || query.variant)) || 'status').toLowerCase();

  if (variant === 'rate') {
    return buildRatePerKg({ rows: raw, companyName, companyLogo, fromDate, toDate });
  }
  // status (with value) is the default; weight drops the Value column.
  return buildGroupedStock({
    rows: raw, companyName, companyLogo, fromDate, toDate,
    withValue: variant !== 'weight'
  });
}

export const wasteStockReport = (req, res) =>
  runReport(req, res, {
    spName: 'sp_WasteStockStatus',
    fileName: 'WasteStock_Report',
    buildDocDefinition
  });

// GET /waste/reports/stock/options — lookups for the Waste Stock report filters.
// Returns W. Item Group + Waste Item (Stock Report leaf) and Supervisor (Stock
// Current Status leaf) so both screens can share one options endpoint.
export const wasteStockOptions = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).json({ success: false, message: 'Missing subDBName header' });
    const pool = await getPool(subDbName);

    const [groups, items] = await Promise.all([
      pool.request().query(
        'SELECT WasteItemGroupCode, WasteItemGroupName FROM tbl_WasteItemGroup WHERE Status = 1 ORDER BY WasteItemGroupName'
      ),
      pool.request().query(
        'SELECT WasteItemCode, WasteItemName FROM tbl_WasteItem ORDER BY OrderNo'
      ),
    ]);

    // Supervisors (sp_Supervisor_GetAll @CompanyCode, @Status) — optional; a
    // failure here must not sink the group/item lookups.
    let supervisors = [];
    try {
      const sup = await pool.request()
        .input('CompanyCode', sql.Int, parseInt(req.query.CompanyCode) || 0)
        .input('Status', sql.Int, 1)
        .execute('sp_Supervisor_GetAll');
      supervisors = (sup.recordset || []).map((s) => ({ value: s.SupervisorCode, label: s.SupervisorName }));
    } catch (e) {
      console.warn('wasteStockOptions: sp_Supervisor_GetAll failed', e.message);
    }

    return res.json({
      success: true,
      data: {
        wasteItemGroups: groups.recordset.map((g) => ({ value: g.WasteItemGroupCode, label: g.WasteItemGroupName })),
        wasteItems: items.recordset.map((w) => ({ value: w.WasteItemCode, label: w.WasteItemName })),
        supervisors,
      },
    });
  } catch (err) {
    console.error('DB Error (wasteStockOptions):', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
