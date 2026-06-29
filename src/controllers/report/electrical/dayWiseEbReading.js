// Electrical — Day Wise EB Reading reports.
// Mirrors (all read sp_EBDaysWise_Report):
//   rptEBReading_WithSolarReading.rdlc / rptEBReading.rdlc — daily EB/Gen/Solar
//       power reading + cost + power-cut hours, with a summary panel.
//   rptEBDailyUKGReport_DateWise.rdlc  — daily UKG (units / kg) report.
//   rptEBDailyUKGReport_MonthWise.rdlc — UKG grouped by month.
// Shares the cotton/_common PDF pipeline (logo + trend chart).

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy, chartFromRows, sql
} from '../cotton/_common.js';
import { getPool } from '../../../config/dynamicDB.js';

// ---- helpers ---------------------------------------------------------------
const headRow = (columns) =>
  columns.map((c) => ({ text: c.header, bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 8 }));
const zebraOf = (i) => (i % 2 === 1 ? colors.zebraFill : null);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Port of the WinForms Branch combo. sp_EBDaysWise_Report returns a company-wide
// per-date aggregate with NO BranchCode column, so the branch can't be narrowed
// in memory — the VB passed @BranchCode straight to the SP (only when a branch
// was picked). We mirror that: bind @BranchCode only when selected, keeping the
// default all-branches call byte-identical to before.
const ebDaysParams = (p, req) => {
  const params = {
    CompanyCode: { type: sql.Int, value: parseInt(p.CompanyCode) || 0 },
    FromDate: { type: sql.DateTime, value: p.FromDate ? new Date(p.FromDate) : null },
    ToDate: { type: sql.DateTime, value: p.ToDate ? new Date(p.ToDate) : null }
  };
  const branch = parseInt(req.query.BranchCode, 10) || 0;
  if (branch > 0) params.BranchCode = { type: sql.Int, value: branch };
  return params;
};

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}

// Flat detail table with a header row + (optional) Grand Total row.
function buildTable(rows, columns, { withTotal = true } = {}) {
  const widths = columns.map((c) => c.width);
  const body = [headRow(columns)];
  (rows || []).forEach((r, i) => {
    const z = zebraOf(i);
    body.push(columns.map((c) => ({ text: c.value(r, i), alignment: c.align || 'left', fontSize: 8, fillColor: z })));
  });
  if ((rows || []).length === 0) {
    body.push([{ text: 'No data for the selected period.', colSpan: columns.length, italics: true, fontSize: 8, color: '#888' }, ...Array(columns.length - 1).fill({})]);
  } else if (withTotal) {
    const firstSum = columns.findIndex((c) => c.sum);
    if (firstSum >= 0) {
      const cells = [{ text: 'Total', colSpan: firstSum, alignment: 'right', bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 }];
      for (let i = 1; i < firstSum; i++) cells.push({});
      for (let i = firstSum; i < columns.length; i++) {
        const c = columns[i];
        if (!c.sum) { cells.push({ text: '', fillColor: colors.grandFill }); continue; }
        const total = (rows || []).reduce((a, r) => a + c.num(r), 0);
        cells.push({ text: fmt(total, c.digits ?? 2), alignment: 'right', bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 });
      }
      body.push(cells);
    }
  }
  return { table: { headerRows: 1, widths, body }, layout: tableLayout() };
}

// Two-column summary panel (Description / Value) derived from the day rows.
// `solar` toggles the Solar line + whether solar units count toward the totals
// (mirrors the With Solar / Without Solar RDLC variants).
function buildSummary(rows, { solar = true } = {}) {
  const days = rows.length;
  const sum = (col) => rows.reduce((a, r) => a + dec(r, col), 0);
  const ebKwh = sum('EBKWH'), genKwh = sum('GENKWH'), solarKwh = sum('SolarKWH');
  const ebCost = sum('EBCost'), powerCut = sum('EBPowerCutHr'), genHr = sum('GENPowerHr');
  const actProd = sum('ActProduction'), convProd = sum('ConvertedProduction'), tfo = sum('TFOUnits');
  const totalUnits = solar ? ebKwh + solarKwh : ebKwh;
  const available = days * 24;
  const rowsData = [
    ['Total Hours Available', fmt(available, 0)],
    ['Total Power Cut Hours', fmt(powerCut, 2)],
    ['Total Running on Power', fmt(available - powerCut, 2)],
    ['Total Running on Genset', fmt(genHr, 2)],
    ['Total Running on Machine', fmt(available - powerCut + genHr, 2)],
    ['EB Consumption (KWH)', fmt(ebKwh, 2)],
    ['Genset Consumption (KWH)', fmt(genKwh, 2)],
    ...(solar ? [['Solar Consumption (KWH)', fmt(solarKwh, 2)]] : []),
    ['Total Power Consumption (KWH)', fmt(totalUnits, 2)],
    ['Avg Consumption / Day', fmt(days ? totalUnits / days : 0, 2)],
    ['Avg Unit Cost / Day', fmt(ebKwh ? ebCost / ebKwh : 0, 2)],
    ['Actual Production', fmt(actProd, 2)],
    ['Converted Production', fmt(convProd, 2)],
    ['Actual UKG', fmt(actProd ? (totalUnits - tfo) / actProd : 0, 2)],
    ['40s Converted UKG', fmt(convProd ? (totalUnits - tfo) / convProd : 0, 2)]
  ];
  const body = [[
    { text: 'Summary', colSpan: 2, bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 9, margin: [2, 2, 0, 2] }, {}
  ]];
  rowsData.forEach(([k, v], i) => {
    const z = zebraOf(i);
    body.push([
      { text: k, fontSize: 8, fillColor: z },
      { text: v, alignment: 'right', fontSize: 8, fillColor: z }
    ]);
  });
  return { table: { widths: ['*', 90], body }, layout: tableLayout(), margin: [0, 0, 0, 8] };
}

// Reading detail columns, with/without the Solar column. The per-row Total
// follows the RDLC: EB+Solar when solar, else EB only.
const readingColsFor = (solar) => [
  { header: 'Date', width: 58, align: 'center', value: (r) => ddmmyyyy(r.EBDate) },
  { header: 'EB', width: '*', align: 'right', value: (r) => fmt(dec(r, 'EBKWH'), 2), sum: true, num: (r) => dec(r, 'EBKWH') },
  { header: 'Genset', width: '*', align: 'right', value: (r) => fmt(dec(r, 'GENKWH'), 2), sum: true, num: (r) => dec(r, 'GENKWH') },
  ...(solar ? [{ header: 'Solar', width: '*', align: 'right', value: (r) => fmt(dec(r, 'SolarKWH'), 2), sum: true, num: (r) => dec(r, 'SolarKWH') }] : []),
  { header: 'Total KWH', width: '*', align: 'right', value: (r) => fmt(solar ? total2(r) : dec(r, 'EBKWH'), 2), sum: true, num: (r) => (solar ? total2(r) : dec(r, 'EBKWH')) },
  { header: 'MD', width: 46, align: 'right', value: (r) => fmt(dec(r, 'MD'), 2) },
  { header: 'PF', width: 46, align: 'right', value: (r) => fmt(dec(r, 'PeakDemd'), 2) },
  { header: 'EB Cost', width: '*', align: 'right', value: (r) => fmt(dec(r, 'EBCost'), 2), sum: true, num: (r) => dec(r, 'EBCost') },
  { header: 'Gen Cost', width: '*', align: 'right', value: (r) => fmt(dec(r, 'GENCost'), 2), sum: true, num: (r) => dec(r, 'GENCost') },
  { header: 'Total Cost', width: '*', align: 'right', value: (r) => fmt(dec(r, 'EBCost') + dec(r, 'GENCost'), 2), sum: true, num: (r) => dec(r, 'EBCost') + dec(r, 'GENCost') },
  { header: 'P.Cut Hr', width: 50, align: 'right', value: (r) => fmt(dec(r, 'EBPowerCutHr'), 2), sum: true, num: (r) => dec(r, 'EBPowerCutHr') }
];

// ---- column dictionaries ---------------------------------------------------
const total2 = (r) => dec(r, 'EBKWH') + dec(r, 'SolarKWH');

const readingCols = [
  { header: 'Date', width: 58, align: 'center', value: (r) => ddmmyyyy(r.EBDate) },
  { header: 'EB', width: '*', align: 'right', value: (r) => fmt(dec(r, 'EBKWH'), 2), sum: true, num: (r) => dec(r, 'EBKWH') },
  { header: 'Genset', width: '*', align: 'right', value: (r) => fmt(dec(r, 'GENKWH'), 2), sum: true, num: (r) => dec(r, 'GENKWH') },
  { header: 'Solar', width: '*', align: 'right', value: (r) => fmt(dec(r, 'SolarKWH'), 2), sum: true, num: (r) => dec(r, 'SolarKWH') },
  { header: 'Total KWH', width: '*', align: 'right', value: (r) => fmt(total2(r), 2), sum: true, num: (r) => total2(r) },
  { header: 'MD', width: 50, align: 'right', value: (r) => fmt(dec(r, 'MD'), 2) },
  { header: 'PF', width: 50, align: 'right', value: (r) => fmt(dec(r, 'PeakDemd'), 2) },
  { header: 'EB Cost', width: '*', align: 'right', value: (r) => fmt(dec(r, 'EBCost'), 2), sum: true, num: (r) => dec(r, 'EBCost') },
  { header: 'Gen Cost', width: '*', align: 'right', value: (r) => fmt(dec(r, 'GENCost'), 2), sum: true, num: (r) => dec(r, 'GENCost') },
  { header: 'Total Cost', width: '*', align: 'right', value: (r) => fmt(dec(r, 'EBCost') + dec(r, 'GENCost'), 2), sum: true, num: (r) => dec(r, 'EBCost') + dec(r, 'GENCost') },
  { header: 'P.Cut Hr', width: 54, align: 'right', value: (r) => fmt(dec(r, 'EBPowerCutHr'), 2), sum: true, num: (r) => dec(r, 'EBPowerCutHr') }
];

const ukgDayCols = [
  { header: 'Date', width: 70, align: 'center', value: (r) => ddmmyyyy(r.EBDate) },
  { header: 'Total Units', width: '*', align: 'right', value: (r) => fmt(total2(r), 0), sum: true, num: (r) => total2(r), digits: 0 },
  { header: 'Act.Prodn', width: '*', align: 'right', value: (r) => fmt(dec(r, 'ActProduction'), 0), sum: true, num: (r) => dec(r, 'ActProduction'), digits: 0 },
  { header: 'UKG', width: 70, align: 'right', value: (r) => (dec(r, 'ActProduction') ? fmt(total2(r) / dec(r, 'ActProduction'), 2) : '') },
  { header: 'No Of Power Cut', width: 90, align: 'center', value: (r) => fmt(dec(r, 'NoOfPowerCut'), 0), sum: true, num: (r) => dec(r, 'NoOfPowerCut'), digits: 0 },
  { header: 'Power Cut (Min)', width: 90, align: 'right', value: (r) => fmt(dec(r, 'EBPowerCutHr') * 60, 0), sum: true, num: (r) => dec(r, 'EBPowerCutHr') * 60, digits: 0 }
];

// ---- handlers --------------------------------------------------------------

// Date Wise — daily EB/Gen/Solar reading with summary panel + trend chart.
export const dayWiseReadingDateWise = (req, res) => runReport(req, res, {
  spName: 'sp_EBDaysWise_Report',
  fileName: 'DayWiseEBReading_DateWise',
  spParams: ebDaysParams,
  buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate }) => {
    const chart = chartFromRows(rows, {
      groupKey: (r) => ddmmyyyy(r.EBDate),
      groupLabel: (r) => `Date : ${ddmmyyyy(r.EBDate)}`,
      valueFn: (r) => total2(r),
      valueHeader: 'Total Units (KWH)', groupHeader: 'Date', digits: 2
    });
    return buildPage({
      companyName, companyLogo, title: 'DAY WISE EB READING', fromDate, toDate,
      tables: [...chart, buildSummary(rows || []), buildTable(rows, readingCols)]
    });
  }
});

// Daily UKG — Date Wise.
export const ukgDateWise = (req, res) => runReport(req, res, {
  spName: 'sp_EBDaysWise_Report',
  fileName: 'DailyUKGReport_DateWise',
  spParams: ebDaysParams,
  buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate }) => {
    const chart = chartFromRows(rows, {
      groupKey: (r) => ddmmyyyy(r.EBDate),
      groupLabel: (r) => `Date : ${ddmmyyyy(r.EBDate)}`,
      valueFn: (r) => total2(r),
      valueHeader: 'Total Units', groupHeader: 'Date', digits: 0
    });
    return buildPage({
      companyName, companyLogo, title: 'DAILY UKG REPORT - DATE WISE', fromDate, toDate,
      tables: [...chart, buildTable(rows, ukgDayCols)]
    });
  }
});

// Daily UKG — Month Wise (one row per month).
export const ukgMonthWise = (req, res) => runReport(req, res, {
  spName: 'sp_EBDaysWise_Report',
  fileName: 'DailyUKGReport_MonthWise',
  spParams: ebDaysParams,
  buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate }) => {
    // Roll the daily rows up to one synthetic row per month.
    const groups = groupBy(rows || [], (r) => new Date(r.EBDate).getMonth());
    const monthRows = [...groups.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([m, gRows]) => {
        const sum = (col) => gRows.reduce((a, r) => a + dec(r, col), 0);
        return {
          MonthName: MONTHS[m] || '',
          TotalUnits: sum('EBKWH') + sum('SolarKWH'),
          ActProduction: sum('ActProduction'),
          NoOfPowerCut: sum('NoOfPowerCut'),
          PowerCutHr: sum('EBPowerCutHr')
        };
      });
    const cols = [
      { header: 'Month', width: '*', value: (r) => r.MonthName },
      { header: 'Total Units', width: '*', align: 'right', value: (r) => fmt(r.TotalUnits, 0), sum: true, num: (r) => r.TotalUnits, digits: 0 },
      { header: 'Act.Prodn', width: '*', align: 'right', value: (r) => fmt(r.ActProduction, 0), sum: true, num: (r) => r.ActProduction, digits: 0 },
      { header: 'UKG', width: 70, align: 'right', value: (r) => (r.ActProduction ? fmt(r.TotalUnits / r.ActProduction, 2) : '') },
      { header: 'No Of Power Cut', width: 90, align: 'center', value: (r) => fmt(r.NoOfPowerCut, 0), sum: true, num: (r) => r.NoOfPowerCut, digits: 0 },
      { header: 'Power Cut Hr', width: 90, align: 'right', value: (r) => fmt(r.PowerCutHr, 0), sum: true, num: (r) => r.PowerCutHr, digits: 0 }
    ];
    const chart = chartFromRows(monthRows, {
      groupKey: (r) => r.MonthName, groupLabel: (r) => r.MonthName,
      valueFn: (r) => r.TotalUnits, valueHeader: 'Total Units', groupHeader: 'Month', digits: 0
    });
    return buildPage({
      companyName, companyLogo, title: 'UKG REPORT - MONTH WISE', fromDate, toDate,
      tables: [...chart, buildTable(monthRows, cols)]
    });
  }
});

// ---- EB Reading Report variants (form rptEBReadingMonthlyReport) ------------
// Shared builder for the "Monthly Power Report" — a daily reading detail table
// plus the summary panel. `solar` picks the With Solar / Without Solar layout.
const buildEbReading = (solar) => ({ rows, companyName, companyLogo, fromDate, toDate }) => {
  const list = (rows || []).slice().sort((a, b) => new Date(a.EBDate) - new Date(b.EBDate));
  const chart = chartFromRows(list, {
    groupKey: (r) => ddmmyyyy(r.EBDate),
    groupLabel: (r) => `Date : ${ddmmyyyy(r.EBDate)}`,
    valueFn: (r) => (solar ? total2(r) : dec(r, 'EBKWH')),
    valueHeader: 'Total Units (KWH)', groupHeader: 'Date', digits: 2
  });
  return buildPage({
    companyName, companyLogo,
    title: solar ? 'MONTHLY POWER REPORT - WITH SOLAR' : 'MONTHLY POWER REPORT - WITHOUT SOLAR',
    fromDate, toDate,
    tables: [...chart, buildSummary(list, { solar }), buildTable(list, readingColsFor(solar))]
  });
};

// With Solar — EB + Solar power reading + cost + power-cut, with summary.
export const ebReadingWithSolar = (req, res) => runReport(req, res, {
  spName: 'sp_EBDaysWise_Report',
  fileName: 'EBReading_WithSolar',
  spParams: ebDaysParams,
  buildDocDefinition: buildEbReading(true)
});

// Without Solar — same report, EB/Genset only (no solar units).
export const ebReadingWithoutSolar = (req, res) => runReport(req, res, {
  spName: 'sp_EBDaysWise_Report',
  fileName: 'EBReading_WithoutSolar',
  spParams: ebDaysParams,
  buildDocDefinition: buildEbReading(false)
});

// Yearly UKG — UKG rolled up per (financial) year. Groups by the SP's FYear
// when present, else by the calendar year of EBDate.
export const ukgYearWise = (req, res) => runReport(req, res, {
  spName: 'sp_EBDaysWise_Report',
  fileName: 'DailyUKGReport_YearWise',
  spParams: ebDaysParams,
  buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate }) => {
    const yearOf = (r) => (str(r, 'FYear') || String(new Date(r.EBDate).getFullYear()));
    const groups = groupBy(rows || [], yearOf);
    const yearRows = [...groups.entries()]
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      .map(([year, gRows]) => {
        const sum = (col) => gRows.reduce((a, r) => a + dec(r, col), 0);
        return {
          Year: year,
          TotalUnits: sum('EBKWH') + sum('SolarKWH'),
          ActProduction: sum('ActProduction'),
          NoOfPowerCut: sum('NoOfPowerCut'),
          PowerCutHr: sum('EBPowerCutHr')
        };
      });
    const cols = [
      { header: 'Year', width: '*', value: (r) => r.Year },
      { header: 'Total Units', width: '*', align: 'right', value: (r) => fmt(r.TotalUnits, 0), sum: true, num: (r) => r.TotalUnits, digits: 0 },
      { header: 'Act.Prodn', width: '*', align: 'right', value: (r) => fmt(r.ActProduction, 0), sum: true, num: (r) => r.ActProduction, digits: 0 },
      { header: 'UKG', width: 70, align: 'right', value: (r) => (r.ActProduction ? fmt(r.TotalUnits / r.ActProduction, 2) : '') },
      { header: 'No Of Power Cut', width: 90, align: 'center', value: (r) => fmt(r.NoOfPowerCut, 0), sum: true, num: (r) => r.NoOfPowerCut, digits: 0 },
      { header: 'Power Cut Hr', width: 90, align: 'right', value: (r) => fmt(r.PowerCutHr, 0), sum: true, num: (r) => r.PowerCutHr, digits: 0 }
    ];
    const chart = chartFromRows(yearRows, {
      groupKey: (r) => r.Year, groupLabel: (r) => r.Year,
      valueFn: (r) => r.TotalUnits, valueHeader: 'Total Units', groupHeader: 'Year', digits: 0
    });
    return buildPage({
      companyName, companyLogo, title: 'UKG REPORT - YEAR WISE', fromDate, toDate,
      tables: [...chart, buildTable(yearRows, cols)]
    });
  }
});

// GET /electrical/reports/day-wise-eb-reading/options — Branch filter dropdown.
// Mirrors the WinForms cmbBranch bind (all branches, ordered by name).
export const dayWiseEbReadingOptions = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type('text/plain').send('Missing subDBName header');
    const pool = await getPool(subDbName);
    const branches = await pool.request()
      .query('SELECT BranchCode AS value, BranchName AS label FROM tbl_Branch ORDER BY BranchName');
    res.json({ success: true, data: { branches: branches.recordset } });
  } catch (err) {
    console.error('Report Error (dayWiseEbReadingOptions):', err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
};
