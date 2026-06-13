// Simplex Employee Performance report.
// Mirrors 05rptSimplexEmployeePerformance.rdlc — one row per employee/date with
// production, efficiency, utilisation, index and grade; grouped by employee.
//
// SP: sp_Prodn_Simplex_EmployeePerformance (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, buildGroupSummaryPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy
} from '../cotton/_common.js';

// 8 columns: Date, Emp ID, Emp Name, Prodn, Eff %, Util %, Index %, Grade
const WIDTHS = [70, 70, '*', 80, 64, 64, 64, 70];

const TITLE = 'SIMPLEX EMPLOYEE PERFORMANCES REPORT';
const FILE_NAME = 'SimplexProduction_EmployeePerformance';

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate }) {
  const body = [];

  const headStyle = {
    bold: true, fillColor: colors.headerFill, color: colors.headerText,
    alignment: 'center', fontSize: 8
  };
  body.push([
    { text: 'Date', ...headStyle },
    { text: 'Employee ID', ...headStyle },
    { text: 'Employee Name', ...headStyle },
    { text: 'Production (Kg)', ...headStyle },
    { text: 'Efficiency %', ...headStyle },
    { text: 'Utilisation %', ...headStyle },
    { text: 'Index %', ...headStyle },
    { text: 'Grade', ...headStyle }
  ]);

  // Sort by employee then date, matching the RDLC grouping.
  const sorted = [...rows].sort((a, b) => {
    const nameCmp = str(a, 'EmployeeName').localeCompare(str(b, 'EmployeeName'));
    if (nameCmp !== 0) return nameCmp;
    return new Date(a.SPXDate) - new Date(b.SPXDate);
  });

  let sProdn = 0, sEff = 0, sUtil = 0, sIndex = 0, nRows = 0;
  // Per-employee aggregation for the summary page.
  const empMap = new Map();

  let rowIdx = 0;
  for (const r of sorted) {
    const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;
    const cell = (text, align = 'right') => ({
      text, alignment: align, fontSize: 8, fillColor: zebra
    });

    const prodn = dec(r, 'Prodn');
    const eff = dec(r, 'ProdnEffi');
    const util = dec(r, 'Utilisation');
    const idx = dec(r, 'Indexs');
    const grade = str(r, 'GradeName') || '-';

    sProdn += prodn; sEff += eff; sUtil += util; sIndex += idx; nRows++;

    const key = str(r, 'EmployeeCode') || str(r, 'EmployeeID');
    const agg = empMap.get(key) || {
      label: `${str(r, 'EmployeeID')} - ${str(r, 'EmployeeName')}`,
      prodn: 0, eff: 0, util: 0, idx: 0, n: 0
    };
    agg.prodn += prodn; agg.eff += eff; agg.util += util; agg.idx += idx; agg.n++;
    empMap.set(key, agg);

    body.push([
      cell(ddmmyyyy(r.SPXDate), 'center'),
      cell(str(r, 'EmployeeID'), 'center'),
      cell(str(r, 'EmployeeName'), 'left'),
      cell(fmt(prodn, 2)),
      cell(fmt(eff, 2)),
      cell(fmt(util, 2)),
      cell(fmt(idx, 2)),
      cell(grade, 'center')
    ]);
    rowIdx++;
  }

  const gStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 };
  const avg = (sum) => (nRows > 0 ? sum / nRows : 0);
  body.push([
    { text: `Total No.of Employee : ${empMap.size}`, colSpan: 3, alignment: 'right', ...gStyle }, {}, {},
    { text: fmt(sProdn, 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(sEff), 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(sUtil), 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(sIndex), 2), alignment: 'right', ...gStyle },
    { text: '', ...gStyle }
  ]);

  const groupSummaries = [...empMap.values()].map((e) => ({
    label: e.label,
    totals: {
      prodn: e.prodn,
      eff: e.n > 0 ? e.eff / e.n : 0,
      util: e.n > 0 ? e.util / e.n : 0,
      idx: e.n > 0 ? e.idx / e.n : 0
    }
  }));

  const summary = buildGroupSummaryPage({
    companyName, companyLogo, fromDate, toDate,
    title: 'SIMPLEX EMPLOYEE PERFORMANCE - SUMMARY',
    groupHeader: 'Employee',
    groupSummaries,
    grandTotals: { prodn: sProdn, eff: avg(sEff), util: avg(sUtil), idx: avg(sIndex) },
    totalCols: [
      { header: 'Production', key: 'prodn' },
      { header: 'Eff %', key: 'eff' },
      { header: 'Util %', key: 'util' },
      { header: 'Index', key: 'idx' }
    ]
  });

  return buildPage({
    companyName, companyLogo, title: TITLE, fromDate, toDate,
    summary,
    tables: [{
      table: { headerRows: 1, dontBreakRows: true, keepWithHeaderRows: 0, widths: WIDTHS, body },
      layout: tableLayout()
    }]
  });
}

export const simplexEmployeePerformanceReport = (req, res) => {
  return runReport(req, res, {
    spName: 'sp_Prodn_Simplex_EmployeePerformance',
    fileName: FILE_NAME,
    buildDocDefinition
  });
};
