// Production Over All ▸ AutoConer Monitor Wise.
// Mirrors rptAutoConerProductionMoniterWise_Arun.rdlc — a per-monitor summary
// table plus per-monitor day-wise detail.
//
// SPs (CompanyCode/FromDate/ToDate):
//   sp_Prodn_AutoConer_MoniterWise_Summary  (summary, one row per monitor)
//   sp_Prodn_AutoConer_MoniterWiseDetails   (detail, per calendar date)

import {
  runMultiReport, buildPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy
} from '../cotton/_common.js';

const FILE_NAME = 'ProductionOverAll_AutoConerMonitor';
const TITLE = 'AUTOCONER MONITERWISE REPORT';

const WIDTHS = [28, '*', 52, 48, 48, 52, 44, 44, 44, 44, 44];
const HEADERS = ['S.No', 'Name', 'PRODN', 'EFF %', 'UTI %', 'WASTE %', 'RL', 'NC', '40S', '50S', '60S'];
const DET_WIDTHS = [70, 52, 48, 48, 52, 44, 44, 44, 44, 44];
const DET_HEADERS = ['Date', 'PRODN', 'EFF %', 'UTI %', 'WASTE %', 'RL', 'NC', '40S', '50S', '60S'];

const metricCells = (r, zebra, font) => {
  const cell = (text, align = 'right') => ({ text, alignment: align, fontSize: font, fillColor: zebra });
  return [
    cell(fmt(dec(r, 'Prodn_Auto'), 2)),
    cell(fmt(dec(r, 'Eff_Auto'), 2)),
    cell(fmt(dec(r, 'UTI_Auto'), 2)),
    cell(fmt(dec(r, 'Waste_Auto'), 2)),
    cell(fmt(dec(r, 'RL'), 2)),
    cell(fmt(dec(r, 'NC'), 0)),
    cell(fmt(dec(r, 'Prodn40s'), 2)),
    cell(fmt(dec(r, 'Prodn50s'), 2)),
    cell(fmt(dec(r, 'Prodn60s'), 2)),
  ];
};

function buildSummary(rows) {
  const body = [];
  const h = { bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 8 };
  body.push(HEADERS.map((t) => ({ text: t, ...h })));
  rows.forEach((r, i) => {
    const zebra = i % 2 === 1 ? colors.zebraFill : null;
    body.push([
      { text: String(i + 1), alignment: 'center', fontSize: 8, fillColor: zebra },
      { text: str(r, 'EmployeeName'), alignment: 'left', fontSize: 8, fillColor: zebra },
      ...metricCells(r, zebra, 8),
    ]);
  });
  return { table: { headerRows: 1, dontBreakRows: true, widths: WIDTHS, body }, layout: tableLayout(), margin: [0, 0, 0, 8] };
}

function buildDetail(rows) {
  // Group detail by monitor.
  const map = new Map();
  for (const r of rows) {
    const k = str(r, 'EmployeeCode');
    if (!map.has(k)) map.set(k, { name: str(r, 'EmployeeName'), rows: [] });
    map.get(k).rows.push(r);
  }
  const tables = [];
  for (const g of map.values()) {
    const body = [];
    const h = { bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 8 };
    body.push([{ text: g.name, colSpan: 10, bold: true, color: colors.groupText, fillColor: colors.groupFill, fontSize: 8 }, {}, {}, {}, {}, {}, {}, {}, {}, {}]);
    body.push(DET_HEADERS.map((t) => ({ text: t, ...h })));
    g.rows.forEach((r, i) => {
      const zebra = i % 2 === 1 ? colors.zebraFill : null;
      body.push([
        { text: ddmmyyyy(r.CalendarDate), alignment: 'center', fontSize: 8, fillColor: zebra },
        ...metricCells(r, zebra, 8),
      ]);
    });
    tables.push({ table: { headerRows: 2, dontBreakRows: true, widths: DET_WIDTHS, body }, layout: tableLayout(), margin: [0, 0, 0, 8] });
  }
  return tables;
}

function buildDocDefinition({ data, companyName, companyLogo, fromDate, toDate }) {
  const summary = data.summary || [];
  const detail = data.detail || [];
  const tables = [];

  tables.push({ text: 'SUMMARY', bold: true, fontSize: 11, color: colors.titleColor, margin: [0, 8, 0, 4] });
  tables.push(summary.length ? buildSummary(summary)
    : { text: 'No summary data for the selected period.', italics: true, margin: [0, 2, 0, 0] });

  if (detail.length) {
    tables.push({ text: 'DAY WISE DETAIL', bold: true, fontSize: 11, color: colors.titleColor, margin: [0, 8, 0, 4] });
    tables.push(...buildDetail(detail));
  }

  return buildPage({ companyName, companyLogo, title: TITLE, fromDate, toDate, tables });
}

export const prodnOverallAutoconerMonitorReport = (req, res) =>
  runMultiReport(req, res, {
    fileName: FILE_NAME,
    procs: [
      { key: 'summary', spName: 'sp_Prodn_AutoConer_MoniterWise_Summary' },
      { key: 'detail', spName: 'sp_Prodn_AutoConer_MoniterWiseDetails' },
    ],
    buildDocDefinition,
  });
