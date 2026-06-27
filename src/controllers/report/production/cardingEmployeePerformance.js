// Carding Employee Performance report.
// Mirrors rptCardingEmployeePerformance.rdlc — one row per employee with
// Production (Kg) / Efficiency (%) / Utilisation (%), a footer with the
// employee count + total production + average efficiency / utilisation.
//
// SP: sp_Prodn_Carding_EmployeePerformance (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, chartFromRows
} from '../cotton/_common.js';

const WIDTHS = [40, 90, '*', 110, 110, 110];

const TITLE = 'CARDING EMPLOYEE PERFORMANCES REPORT';
const FILE_NAME = 'CardingProduction_EmployeePerformance';

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate }) {
  const body = [];
  const headStyle = { bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 8 };
  body.push(['S.No', 'Employee ID', 'Employee Name', 'Production (Kg)', 'Efficiency (%)', 'Utilisation (%)'].map((h) => ({ text: h, ...headStyle })));

  let sProdn = 0, sEff = 0, sUtil = 0, n = 0;
  rows.forEach((r, i) => {
    const zebra = i % 2 === 1 ? colors.zebraFill : null;
    const cell = (text, align = 'right') => ({ text, alignment: align, fontSize: 8, fillColor: zebra });

    const prodn = dec(r, 'Prodn');
    const eff = dec(r, 'ProdnEffi');
    const util = dec(r, 'Utilisation');

    sProdn += prodn; sEff += eff; sUtil += util; n++;

    body.push([
      cell(String(i + 1), 'center'),
      cell(str(r, 'EmployeeID'), 'left'),
      cell(str(r, 'EmployeeName'), 'left'),
      cell(fmt(prodn, 2)),
      cell(fmt(eff, 2)),
      cell(fmt(util, 2)),
    ]);
  });

  const gStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 8 };
  const avg = (s) => (n > 0 ? s / n : 0);
  body.push([
    { text: `Total No.of Employee : ${n}`, colSpan: 3, alignment: 'left', ...gStyle }, {}, {},
    { text: fmt(sProdn, 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(sEff), 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(sUtil), 2), alignment: 'right', ...gStyle },
  ]);

  if (rows.length === 0) {
    return buildPage({ companyName, companyLogo, title: TITLE, fromDate, toDate,
      tables: [{ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] }] });
  }

  const chart = chartFromRows(rows, {
    groupKey: (r) => str(r, 'EmployeeCode') || str(r, 'EmployeeID'),
    groupLabel: (r) => str(r, 'EmployeeName'),
    valueFn: (r) => dec(r, 'Prodn'), valueHeader: 'Production',
    groupHeader: 'Employee', digits: 2,
  });

  return buildPage({
    companyName, companyLogo, title: TITLE, fromDate, toDate,
    tables: [...chart, { table: { headerRows: 1, dontBreakRows: true, widths: WIDTHS, body }, layout: tableLayout() }],
  });
}

export const cardingEmployeePerformanceReport = (req, res) =>
  runReport(req, res, { spName: 'sp_Prodn_Carding_EmployeePerformance', fileName: FILE_NAME, buildDocDefinition });
