// Electrical — Solar Reading reports.
// Mirrors:
//   rptSolarReading_SolarWise.rdlc  (sp_SolarReading_DayWise_GetAll)   — Units
//       pivoted with location as rows and reading date as columns.
//   rptSolarReadingMonthWise.rdlc   (sp_SolarReading_MonthWise_GetAll) — Units
//       pivoted with location as rows and month (year) as columns.
// Shares the cotton/_common PDF pipeline (logo + trend chart).

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy, chartFromRows
} from '../cotton/_common.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const headRow = (cells) =>
  cells.map((t) => ({ text: t, bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 8 }));
const zebraOf = (i) => (i % 2 === 1 ? colors.zebraFill : null);

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
    const tot = [{ text: 'Grand Total', bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 }];
    colTotals.forEach((v) => tot.push({ text: fmt(v, 2), alignment: 'right', bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 }));
    tot.push({ text: fmt(grand, 2), alignment: 'right', bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 });
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

// ---- handlers --------------------------------------------------------------

// Date Wise — location rows × reading-date columns.
export const solarDateWise = (req, res) => runReport(req, res, {
  spName: 'sp_SolarReading_DayWise_GetAll',
  fileName: 'SolarReading_DateWise',
  buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate }) => {
    const pivot = buildPivot(rows, {
      colKeyFn: (r) => ddmmyyyy(r.SolarReadingDate),
      colLabelFn: (r) => ddmmyyyy(r.SolarReadingDate),
      colSortFn: (r) => new Date(r.SolarReadingDate).getTime() || 0,
      rowHeader: 'Location'
    });
    return buildPage({ companyName, companyLogo, title: 'SOLAR READING REPORT - DATE WISE', fromDate, toDate, tables: [...locationChart(rows, 'Location'), pivot] });
  }
});

// Month Wise — location rows × month(year) columns.
export const solarMonthWise = (req, res) => runReport(req, res, {
  spName: 'sp_SolarReading_MonthWise_GetAll',
  fileName: 'SolarReading_MonthWise',
  buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate }) => {
    const pivot = buildPivot(rows, {
      colKeyFn: (r) => `${dec(r, 'YearNo')}-${String(dec(r, 'MonthNo')).padStart(2, '0')}`,
      colLabelFn: (r) => `${MONTHS[(dec(r, 'MonthNo') || 1) - 1] || ''} (${dec(r, 'YearNo')})`,
      colSortFn: (r) => dec(r, 'YearNo') * 100 + dec(r, 'MonthNo'),
      rowHeader: 'Location'
    });
    return buildPage({ companyName, companyLogo, title: 'SOLAR READING - MONTH WISE', fromDate, toDate, tables: [...locationChart(rows, 'Location'), pivot] });
  }
});
