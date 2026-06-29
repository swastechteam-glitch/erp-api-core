// Electrical — Solar & Wind Mill Reading Statement reports (form rptSolarReading).
// Mirrors the four WinForms radios (each its own SP + RDLC):
//   Month Wise      — sp_SolarReading_MonthWise_GetAll → rptSolarReadingMonthWise.rdlc
//                     (Units pivoted: location rows × month(year) columns).
//   Solar Wise      — sp_SolarReading_GetAll → rptSolarReading_SolarWise.rdlc
//                     (Units pivoted: location rows × reading-date columns).
//   PER KW DateWise — sp_SolarReadingDetails_GetAll → rptSolarReading_SolarWise_PerKW.rdlc
//                     (per Solar Group: Date / Generation Kwh / KWH-per-KWP).
//   PER KW MonthWise— sp_SolarReadingDetails_GetAll → rptSolarReading_SolarWise_PerKW_MonthWise.rdlc
//                     (per Solar Group: Month-Year / Generation Kwh / KWH-per-KWP).
// The VB narrowed every recordset in memory by SolarGroupCode / SolarLocationCode.
// Shares the cotton/_common PDF pipeline (logo + trend chart).

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy, chartFromRows, sql
} from '../cotton/_common.js';
import { getPool } from '../../../config/dynamicDB.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const headRow = (cells) =>
  cells.map((t) => ({ text: t, bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 8 }));
const groupRowNode = (label, span) =>
  [{ text: label, colSpan: span, bold: true, color: colors.groupText, fillColor: colors.groupFill, fontSize: 9, margin: [2, 2, 0, 2] }, ...Array(span - 1).fill({})];
const zebraOf = (i) => (i % 2 === 1 ? colors.zebraFill : null);
const totalStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 };

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const r of rows || []) {
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}

// ---- functional filters (port of the WinForms DataTable.Select chain) -------
// Group / Location, camelCase query params, comma-separated codes. Each filter
// only applies to recordsets that actually expose the column (the month-wise SP
// has no SolarGroupCode, so the Group filter no-ops there — exactly like the VB).
const codeSet = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const s = new Set(String(v).split(',').map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n)));
  return s.size ? s : null;
};
const oneFilter = (rows, field, set) =>
  (!set || !rows.length || !(field in rows[0])) ? rows : rows.filter((r) => set.has(parseInt(r[field], 10)));
const filterRows = (rows, query = {}) => {
  let out = rows || [];
  out = oneFilter(out, 'SolarGroupCode', codeSet(query.solarGroupCode));
  out = oneFilter(out, 'SolarLocationCode', codeSet(query.solarLocationCode));
  return out;
};

// ---- SP param builders (match the VB signatures exactly) --------------------
// Detail / day-wise SPs take only @FromDate / @ToDate (no @CompanyCode).
const dateParams = (p) => ({
  FromDate: { type: sql.DateTime, value: p.FromDate ? new Date(p.FromDate) : null },
  ToDate: { type: sql.DateTime, value: p.ToDate ? new Date(p.ToDate) : null }
});
// Month-wise SP takes @MonthNoFrom/@MonthNoTo/@YearNoFrom/@YearNoTo; the VB fed
// the full From/To date into all four (the SP derives month/year internally).
const monthParams = (p) => {
  const from = p.FromDate ? new Date(p.FromDate) : null;
  const to = p.ToDate ? new Date(p.ToDate) : null;
  return {
    MonthNoFrom: { type: sql.DateTime, value: from },
    MonthNoTo: { type: sql.DateTime, value: to },
    YearNoFrom: { type: sql.DateTime, value: from },
    YearNoTo: { type: sql.DateTime, value: to }
  };
};

// Pivot: one row per location, one column per (sorted) date/month, each cell the
// summed Units, plus a per-row Total and a Grand Total row.
function buildPivot(rows, { colKeyFn, colLabelFn, colSortFn, rowHeader }) {
  const colMap = new Map(); // key -> { label, sortV }
  for (const r of rows || []) {
    const k = colKeyFn(r);
    if (k === null || k === undefined || k === '') continue;
    if (!colMap.has(k)) colMap.set(k, { label: String(colLabelFn(r) || ''), sortV: colSortFn(r) });
  }
  const cols = [...colMap.entries()].sort((a, b) => (a[1].sortV > b[1].sortV ? 1 : a[1].sortV < b[1].sortV ? -1 : 0));

  const rowMap = new Map(); // location -> { byCol, total }
  for (const r of rows || []) {
    const loc = str(r, 'SolarLocationName');
    if (!rowMap.has(loc)) rowMap.set(loc, { byCol: {}, total: 0 });
    const v = dec(r, 'Units');
    const ck = colKeyFn(r);
    rowMap.get(loc).byCol[ck] = (rowMap.get(loc).byCol[ck] || 0) + v;
    rowMap.get(loc).total += v;
  }
  const locs = [...rowMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const body = [headRow([rowHeader, ...cols.map((c) => c[1].label), 'Total'])];
  const colTotals = cols.map(() => 0);
  let grand = 0;
  locs.forEach(([loc, row], i) => {
    const z = zebraOf(i);
    const cells = [{ text: loc, fontSize: 8, fillColor: z }];
    cols.forEach(([ck], ci) => {
      const v = row.byCol[ck] || 0;
      colTotals[ci] += v;
      cells.push({ text: v ? fmt(v, 2) : '', alignment: 'right', fontSize: 8, fillColor: z });
    });
    grand += row.total;
    cells.push({ text: fmt(row.total, 2), alignment: 'right', bold: true, fontSize: 8, fillColor: z });
    body.push(cells);
  });

  if (locs.length === 0) {
    body.push([{ text: 'No data for the selected period.', colSpan: cols.length + 2, italics: true, fontSize: 8, color: '#888' }, ...Array(cols.length + 1).fill({})]);
  } else {
    const tot = [{ text: 'Grand Total', ...totalStyle }];
    colTotals.forEach((v) => tot.push({ text: fmt(v, 2), alignment: 'right', ...totalStyle }));
    tot.push({ text: fmt(grand, 2), alignment: 'right', ...totalStyle });
    body.push(tot);
  }

  return { table: { headerRows: 1, widths: [110, ...cols.map(() => '*'), 70], body }, layout: tableLayout() };
}

const locationChart = (rows, header) => chartFromRows(rows, {
  groupKey: (r) => str(r, 'SolarLocationName'),
  groupLabel: (r) => `Location : ${str(r, 'SolarLocationName')}`,
  valueFn: (r) => dec(r, 'Units'),
  valueHeader: 'Units', groupHeader: header, digits: 2
});

// PER KW grouped table — one block per Solar Group, a row per period with
// Generation (Sum Units) and KWH/KWP(DC) = Sum(Units) / Sum(KWP).
function buildPerKw(rows, { periodHeader, periodKey, periodLabel, periodSort }) {
  const cols = [periodHeader, 'Generation in Kwh', 'KWH/KWP(DC)'];
  const span = cols.length;
  const body = [headRow(cols)];
  const groups = [...groupBy(rows, (r) => str(r, 'SolarGroupName')).entries()]
    .sort((a, b) => a[0].localeCompare(b[0]));

  let gUnits = 0;
  for (const [grp, gRows] of groups) {
    body.push(groupRowNode(grp || '(Group)', span));
    const periods = [...groupBy(gRows, periodKey).entries()]
      .sort((a, b) => periodSort(a[1][0]) - periodSort(b[1][0]));
    periods.forEach(([, pRows], i) => {
      const z = zebraOf(i);
      const units = pRows.reduce((a, r) => a + dec(r, 'Units'), 0);
      const kwp = pRows.reduce((a, r) => a + dec(r, 'KWP'), 0);
      gUnits += units;
      body.push([
        { text: periodLabel(pRows[0]), fontSize: 8, fillColor: z },
        { text: fmt(units, 2), alignment: 'right', fontSize: 8, fillColor: z },
        { text: kwp ? fmt(units / kwp, 2) : '', alignment: 'right', fontSize: 8, fillColor: z }
      ]);
    });
  }
  if ((rows || []).length === 0) {
    body.push([{ text: 'No data for the selected period.', colSpan: span, italics: true, fontSize: 8, color: '#888' }, ...Array(span - 1).fill({})]);
  } else {
    body.push([
      { text: 'Grand Total', alignment: 'right', ...totalStyle },
      { text: fmt(gUnits, 2), alignment: 'right', ...totalStyle },
      { text: '', ...totalStyle }
    ]);
  }
  return { table: { headerRows: 1, widths: ['*', '*', '*'], body }, layout: tableLayout() };
}

// ---- handlers --------------------------------------------------------------

// Solar Wise — location rows × reading-date columns (Units).
export const solarDateWise = (req, res) => runReport(req, res, {
  spName: 'sp_SolarReading_GetAll',
  fileName: 'SolarReading_SolarWise',
  spParams: dateParams,
  buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate, query }) => {
    const list = filterRows(rows, query);
    const pivot = buildPivot(list, {
      colKeyFn: (r) => ddmmyyyy(r.SolarReadingDate),
      colLabelFn: (r) => ddmmyyyy(r.SolarReadingDate),
      colSortFn: (r) => new Date(r.SolarReadingDate).getTime() || 0,
      rowHeader: 'Location'
    });
    return buildPage({ companyName, companyLogo, title: 'SOLAR READING REPORT - SOLAR WISE', fromDate, toDate, tables: [...locationChart(list, 'Location'), pivot] });
  }
});

// Month Wise — location rows × month(year) columns (Units).
export const solarMonthWise = (req, res) => runReport(req, res, {
  spName: 'sp_SolarReading_MonthWise_GetAll',
  fileName: 'SolarReading_MonthWise',
  spParams: monthParams,
  buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate, query }) => {
    const list = filterRows(rows, query);
    const pivot = buildPivot(list, {
      colKeyFn: (r) => `${dec(r, 'YearNo')}-${String(dec(r, 'MonthNo')).padStart(2, '0')}`,
      colLabelFn: (r) => `${MONTHS[(dec(r, 'MonthNo') || 1) - 1] || ''} (${dec(r, 'YearNo')})`,
      colSortFn: (r) => dec(r, 'YearNo') * 100 + dec(r, 'MonthNo'),
      rowHeader: 'Location'
    });
    return buildPage({ companyName, companyLogo, title: 'SOLAR READING - MONTH WISE', fromDate, toDate, tables: [...locationChart(list, 'Location'), pivot] });
  }
});

// PER KW Date Wise — per Solar Group, a row per date (Generation / KWH-per-KWP).
export const solarPerKwDateWise = (req, res) => runReport(req, res, {
  spName: 'sp_SolarReadingDetails_GetAll',
  fileName: 'SolarReading_PerKW_DateWise',
  spParams: dateParams,
  buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate, query }) => {
    const list = filterRows(rows, query);
    const table = buildPerKw(list, {
      periodHeader: 'Date',
      periodKey: (r) => ddmmyyyy(r.SolarReadingDate),
      periodLabel: (r) => ddmmyyyy(r.SolarReadingDate),
      periodSort: (r) => new Date(r.SolarReadingDate).getTime() || 0
    });
    const chart = chartFromRows(list, {
      groupKey: (r) => ddmmyyyy(r.SolarReadingDate), groupLabel: (r) => `Date : ${ddmmyyyy(r.SolarReadingDate)}`,
      valueFn: (r) => dec(r, 'Units'), valueHeader: 'Generation (KWH)', groupHeader: 'Date', digits: 2
    });
    return buildPage({ companyName, companyLogo, title: 'SOLAR READING - PER KW DATE WISE', fromDate, toDate, tables: [...chart, table] });
  }
});

// PER KW Month Wise — per Solar Group, a row per month-year.
export const solarPerKwMonthWise = (req, res) => runReport(req, res, {
  spName: 'sp_SolarReadingDetails_GetAll',
  fileName: 'SolarReading_PerKW_MonthWise',
  spParams: dateParams,
  buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate, query }) => {
    const list = filterRows(rows, query);
    const mkey = (r) => { const d = new Date(r.SolarReadingDate); return `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`; };
    const mlabel = (r) => { const d = new Date(r.SolarReadingDate); return `${MONTHS[d.getMonth()] || ''} - ${d.getFullYear()}`; };
    const table = buildPerKw(list, {
      periodHeader: 'Month',
      periodKey: mkey,
      periodLabel: mlabel,
      periodSort: (r) => new Date(r.SolarReadingDate).getTime() || 0
    });
    const chart = chartFromRows(list, {
      groupKey: mkey, groupLabel: mlabel,
      valueFn: (r) => dec(r, 'Units'), valueHeader: 'Generation (KWH)', groupHeader: 'Month', digits: 2
    });
    return buildPage({ companyName, companyLogo, title: 'SOLAR READING - PER KW MONTH WISE', fromDate, toDate, tables: [...chart, table] });
  }
});

// GET /electrical/reports/solar-reading/options — filter dropdowns
// (Group Name / Location Name). Mirrors the WinForms Bind_Data combos.
export const solarReadingOptions = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type('text/plain').send('Missing subDBName header');
    const pool = await getPool(subDbName);
    const [solarGroups, solarLocations] = await Promise.all([
      pool.request().query('SELECT SolarGroupCode AS value, SolarGroupName AS label FROM tbl_SolarGroup WHERE Status = 1 ORDER BY SolarGroupName'),
      pool.request().query('SELECT SolarLocationCode AS value, SolarLocationName AS label FROM tbl_SolarLocation WHERE Status = 1 ORDER BY SolarLocationName')
    ]);
    res.json({ success: true, data: { solarGroups: solarGroups.recordset, solarLocations: solarLocations.recordset } });
  } catch (err) {
    console.error('Report Error (solarReadingOptions):', err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
};
