// Production Over All ▸ Shift Incharge Wise.
// Mirrors rptPrepartoryProductionShiftInchagreWise_Arun.rdlc summary — one row
// per shift incharge (employee) with averaged 40sCON / UT / W% / MPI / AT.TIME /
// TFO UT / A.COPS.
//
// SP: sp_Preparatory_ShiftInchargeWise_Report (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt
} from '../cotton/_common.js';

const FILE_NAME = 'ProductionOverAll_ShiftIncharge';
const TITLE = 'SHIFT INCHARGE WISE SUMMARY REPORT';

const WIDTHS = [28, '*', 64, 56, 56, 56, 64, 64, 64];
const HEADERS = ['S.No', 'Name', '40sCON', 'UT', 'W %', 'MPI', 'AT.TIME', 'TFO UT', 'A.COPS'];

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate }) {
  // Aggregate per shift incharge.
  const map = new Map();
  for (const r of rows) {
    const k = str(r, 'EmployeeCode');
    if (!map.has(k)) map.set(k, { name: str(r, 'EmployeeName'), n: 0, acc: {} });
    const g = map.get(k); g.n++;
    ['Con40_SPG', 'UTI_SPG', 'Waste', 'MPI', 'ATTTime', 'TFO_UT', 'COPS']
      .forEach((c) => { g.acc[c] = (g.acc[c] || 0) + dec(r, c); });
  }

  const body = [];
  const h = { bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 8 };
  body.push(HEADERS.map((t) => ({ text: t, ...h })));

  let i = 0;
  for (const g of map.values()) {
    const zebra = i % 2 === 1 ? colors.zebraFill : null;
    const cell = (text, align = 'right') => ({ text, alignment: align, fontSize: 8, fillColor: zebra });
    const avg = (c) => (g.n ? g.acc[c] / g.n : 0);
    body.push([
      cell(String(i + 1), 'center'),
      cell(g.name, 'left'),
      cell(fmt(avg('Con40_SPG'), 2)),
      cell(fmt(avg('UTI_SPG'), 2)),
      cell(fmt(avg('Waste'), 2)),
      cell(fmt(avg('MPI'), 2)),
      cell(fmt(avg('ATTTime'), 2)),
      cell(fmt(avg('TFO_UT'), 2)),
      cell(fmt(avg('COPS'), 2)),
    ]);
    i++;
  }

  if (!map.size) {
    return buildPage({ companyName, companyLogo, title: TITLE, fromDate, toDate,
      tables: [{ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] }] });
  }

  return buildPage({
    companyName, companyLogo, title: TITLE, fromDate, toDate,
    tables: [{ table: { headerRows: 1, dontBreakRows: true, widths: WIDTHS, body }, layout: tableLayout() }],
  });
}

export const prodnOverallShiftInchargeReport = (req, res) =>
  runReport(req, res, { spName: 'sp_Preparatory_ShiftInchargeWise_Report', fileName: FILE_NAME, buildDocDefinition });
