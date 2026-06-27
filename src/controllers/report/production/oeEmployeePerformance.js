// OE Employee Performance report.
// Mirrors 06rptOEEmployeePerformance.rdlc — one row per employee/date with
// production, waste %, EM and grade; grouped by employee.
//
// SP: sp_Prodn_OE_EmployeePerformance (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, buildGroupSummaryPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy
} from '../cotton/_common.js';

// 7 columns: Date, Emp ID, Emp Name, Prodn, Waste %, EM, Grade
const WIDTHS = [70, 72, '*', 80, 64, 64, 70];

const TITLE = 'OE EMPLOYEE PERFORMANCES REPORT';
const FILE_NAME = 'OEProduction_EmployeePerformance';

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
    { text: 'Waste %', ...headStyle },
    { text: 'EM', ...headStyle },
    { text: 'Grade', ...headStyle }
  ]);

  // Sort by employee then date, matching the RDLC grouping.
  const sorted = [...rows].sort((a, b) => {
    const nameCmp = str(a, 'EmployeeName').localeCompare(str(b, 'EmployeeName'));
    if (nameCmp !== 0) return nameCmp;
    return new Date(a.SPGDate) - new Date(b.SPGDate);
  });

  let sProdn = 0, sWaste = 0, sEm = 0, nRows = 0;
  const empMap = new Map();

  let rowIdx = 0;
  for (const r of sorted) {
    const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;
    const cell = (text, align = 'right') => ({
      text, alignment: align, fontSize: 8, fillColor: zebra
    });

    const prodn = dec(r, 'Prodn');
    const waste = dec(r, 'WastePer');
    const em = dec(r, 'EM');
    const grade = str(r, 'GradeName') || '-';

    sProdn += prodn; sWaste += waste; sEm += em; nRows++;

    const key = str(r, 'EmployeeCode') || str(r, 'EmployeeID');
    const agg = empMap.get(key) || {
      label: `${str(r, 'EmployeeID')} - ${str(r, 'EmployeeName')}`,
      prodn: 0, waste: 0, em: 0, n: 0
    };
    agg.prodn += prodn; agg.waste += waste; agg.em += em; agg.n++;
    empMap.set(key, agg);

    body.push([
      cell(ddmmyyyy(r.SPGDate), 'center'),
      cell(str(r, 'EmployeeID'), 'center'),
      cell(str(r, 'EmployeeName'), 'left'),
      cell(fmt(prodn, 2)),
      cell(fmt(waste, 2)),
      cell(fmt(em, 2)),
      cell(grade, 'center')
    ]);
    rowIdx++;
  }

  const gStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 };
  const avg = (sum) => (nRows > 0 ? sum / nRows : 0);
  body.push([
    { text: `Total No.of Employee : ${empMap.size}`, colSpan: 3, alignment: 'right', ...gStyle }, {}, {},
    { text: fmt(sProdn, 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(sWaste), 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(sEm), 2), alignment: 'right', ...gStyle },
    { text: '', ...gStyle }
  ]);

  const groupSummaries = [...empMap.values()].map((e) => ({
    label: e.label,
    totals: {
      prodn: e.prodn,
      waste: e.n > 0 ? e.waste / e.n : 0,
      em: e.n > 0 ? e.em / e.n : 0
    }
  }));

  const summary = buildGroupSummaryPage({
    companyName, companyLogo, fromDate, toDate,
    title: 'OE EMPLOYEE PERFORMANCE - SUMMARY',
    groupHeader: 'Employee',
    groupSummaries,
    grandTotals: { prodn: sProdn, waste: avg(sWaste), em: avg(sEm) },
    totalCols: [
      { header: 'Production', key: 'prodn' },
      { header: 'Waste %', key: 'waste' },
      { header: 'EM', key: 'em' }
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

export const oeEmployeePerformanceReport = (req, res) => {
  return runReport(req, res, {
    spName: 'sp_Prodn_OE_EmployeePerformance',
    fileName: FILE_NAME,
    buildDocDefinition
  });
};
