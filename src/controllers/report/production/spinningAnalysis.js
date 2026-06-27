// Spinning Analysis (Spinning Daily Performance / MD Report).
// Mirrors rptSpinningDailyReport.rdlc — a flat date-wise table of the daily
// spinning performance metrics (production, GPS, EBSH/EM, Rouge%, UKG, EB units,
// stop/doff times, stoppage count) with a totals footer: SUM for the quantity
// columns and AVG for the rate / percentage columns (matching the RDLC footer
// expressions). The RDLC title is
// "SPINNING DAILY PERFORMANCE - ANALYSIS REPORT : <From> TO <To>".
//
// SP: sp_Prodn_Spinning_MD_Report (CompanyCode, FromDate, ToDate)
//
// VB radio: optSpinningMDReport ("Spinning Analysis") in
// rptProductionOverAllReport_AllDepartment. The SP returns a company-wide
// per-date aggregate (no Branch/Count/Machine/Supervisor columns), so the shared
// left-rail filters are not applicable here — applyRowFilters is still invoked
// for consistency and simply no-ops because those code columns are absent.

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy, applyRowFilters
} from '../cotton/_common.js';

const TITLE = 'SPINNING DAILY PERFORMANCE - ANALYSIS REPORT';
const FILE_NAME = 'SpinningAnalysis';

const headRow = (headers, fs = 7) =>
  headers.map((h) => ({
    text: h, bold: true, fillColor: colors.headerFill, color: colors.headerText,
    alignment: 'center', fontSize: fs
  }));
const td = (text, align = 'right', zebra = null, fs = 7) =>
  ({ text, alignment: align, fontSize: fs, fillColor: zebra });
const totalCell = (text, align = 'right') =>
  ({ text, alignment: align, bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 7 });
const zebraOf = (i) => (i % 2 === 1 ? colors.zebraFill : null);

// Column spec mirroring the RDLC detail row + footer.
// agg: 'sum' for quantity columns, 'avg' for rate / percentage columns.
const COLS = [
  { header: 'KG', field: 'Prodn', digits: 2, agg: 'sum' },
  { header: 'GPS (Act)', field: 'GmsSpl', digits: 2, agg: 'avg' },
  { header: 'EBSH', field: 'EBSH', digits: 2, agg: 'avg' },
  { header: 'EM', field: 'EM', digits: 2, agg: 'avg' },
  { header: 'Rouge %', field: 'RougePer', digits: 2, agg: 'avg' },
  { header: 'UKG', field: 'UKG', digits: 2, agg: 'avg' },
  { header: 'EB Total', field: 'EB_Total', digits: 0, agg: 'sum' },
  { header: 'EB Start Up', field: 'EB_StartUp', digits: 0, agg: 'sum' },
  { header: 'MC Stop Time', field: 'MC_StopTime', digits: 0, agg: 'sum' },
  { header: 'Stoppage Time', field: 'TotalStopTime', digits: 0, agg: 'sum' },
  { header: 'Doff Time', field: 'NofDoffTime', digits: 0, agg: 'sum' },
  { header: 'No of Doff', field: 'NofDoff', digits: 0, agg: 'sum' },
  { header: 'Avg Doff Time', field: 'AvgDoff', digits: 2, agg: 'avg' },
  { header: 'No Of Stop', field: 'NoOfStop', digits: 0, agg: 'sum' }
];

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate, query }) {
  const data = applyRowFilters(rows, query);

  const headers = ['Date', ...COLS.map((c) => c.header), 'Remarks'];
  const widths = ['auto', ...COLS.map(() => 'auto'), '*'];
  const body = [headRow(headers)];

  // Detail rows in chronological order (RDLC renders in SP order; sort ascending
  // by date for a stable daily report regardless of SP ordering). Coerce to a
  // safe timestamp so an unparseable date can't scramble ordering with NaN.
  const ts = (d) => { const x = new Date(d).getTime(); return isNaN(x) ? 0 : x; };
  const sorted = [...data].sort((a, b) => ts(a.SpgProdnDate) - ts(b.SpgProdnDate));

  // Accumulate sums for every column; for AVG columns also count the non-null
  // cells so the average excludes NULLs exactly like the RDLC / SQL Avg().
  const totals = {}; const avgCnt = {};
  COLS.forEach((c) => { totals[c.field] = 0; if (c.agg === 'avg') avgCnt[c.field] = 0; });
  let n = 0;
  for (const r of sorted) {
    const z = zebraOf(n++);
    const cells = [td(ddmmyyyy(r.SpgProdnDate), 'center', z)];
    for (const c of COLS) {
      const raw = r[c.field];
      const v = dec(r, c.field);
      totals[c.field] += v;
      if (c.agg === 'avg' && raw !== null && raw !== undefined && raw !== '') avgCnt[c.field] += 1;
      cells.push(td(fmt(v, c.digits), 'right', z));
    }
    cells.push(td(str(r, 'Reason'), 'left', z));
    body.push(cells);
  }

  // Totals footer — SUM for quantity columns, AVG (NULL-excluding) for rate / % columns.
  const footer = [totalCell('Total', 'right')];
  for (const c of COLS) {
    const val = c.agg === 'avg' ? totals[c.field] / (avgCnt[c.field] || 1) : totals[c.field];
    footer.push(totalCell(fmt(val, c.digits)));
  }
  footer.push(totalCell(''));   // Remarks column carries no total
  body.push(footer);

  const tables = data.length
    ? [{ table: { headerRows: 1, dontBreakRows: false, keepWithHeaderRows: 1, widths, body }, layout: tableLayout() }]
    : [{ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] }];

  return buildPage({ companyName, companyLogo, title: TITLE, fromDate, toDate, tables });
}

export const spinningAnalysisReport = (req, res) =>
  runReport(req, res, { spName: 'sp_Prodn_Spinning_MD_Report', fileName: FILE_NAME, buildDocDefinition });
