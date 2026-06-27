// Production Over All ▸ Spinning Monitor Wise.
// Mirrors rptSpinningProductionMoniterWise_Arun.rdlc — a per-monitor summary
// table plus per-monitor day-wise detail.
//
// SPs (CompanyCode/FromDate/ToDate):
//   sp_Prodn_Spinning_MoniterWise_Summary  (summary, one row per monitor)
//   sp_Prodn_Spinning_MoniterWiseDetails   (detail, per calendar date)

import {
  runMultiReport, buildPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy
} from '../cotton/_common.js';

const FILE_NAME = 'ProductionOverAll_SpinningMonitor';
const TITLE = 'SPINNING MONITERWISE REPORT';

const WIDTHS = [28, '*', 58, 58, 56, 60, 56, 64, 60];
const HEADERS = ['S.No', 'Name', 'PRODN', '40sCON', 'UTI %', 'WASTE %', 'MPI', 'ATT.TIME', 'A.COPS'];
const DET_WIDTHS = [76, 58, 58, 56, 60, 56, 64, 60];
const DET_HEADERS = ['Date', 'PRODN', '40sCON', 'UTI %', 'WASTE %', 'MPI', 'ATT.TIME', 'A.COPS'];

const metricCells = (r, zebra, font) => {
  const cell = (text) => ({ text, alignment: 'right', fontSize: font, fillColor: zebra });
  return [
    cell(fmt(dec(r, 'Prodn_SPG'), 2)),
    cell(fmt(dec(r, 'Converstion40s'), 2)),
    cell(fmt(dec(r, 'UTI_SPG'), 2)),
    cell(fmt(dec(r, 'Waste_SPG'), 2)),
    cell(fmt(dec(r, 'MPI'), 2)),
    cell(fmt(dec(r, 'AttTime'), 2)),
    cell(fmt(dec(r, 'AdashCops'), 2)),
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
    body.push([{ text: g.name, colSpan: 8, bold: true, color: colors.groupText, fillColor: colors.groupFill, fontSize: 8 }, {}, {}, {}, {}, {}, {}, {}]);
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

export const prodnOverallSpinningMonitorReport = (req, res) =>
  runMultiReport(req, res, {
    fileName: FILE_NAME,
    procs: [
      { key: 'summary', spName: 'sp_Prodn_Spinning_MoniterWise_Summary' },
      { key: 'detail', spName: 'sp_Prodn_Spinning_MoniterWiseDetails' },
    ],
    buildDocDefinition,
  });
