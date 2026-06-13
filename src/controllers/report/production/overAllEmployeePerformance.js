// Employee Performance OverAll.
// Mirrors 06rptProductionEmployeePerfomanceSummary.rdlc — one section per
// department, grouped by employee. Most sections show Prod/Eff/Util; Spinning
// shows Prod/Waste%/EM instead.
//
// Multi-SP report (runMultiReport). Each SP takes (CompanyCode, FromDate, ToDate).

import {
  runMultiReport, buildPage, tableLayout, colors,
  dec, str, fmt
} from '../cotton/_common.js';

const TITLE = 'EMPLOYEE PERFORMANCE OVERALL REPORT';
const FILE_NAME = 'ProductionOverAll_EmployeePerformance';

const headRow = (headers, fs = 8) =>
  headers.map((h) => ({
    text: h, bold: true, fillColor: colors.headerFill, color: colors.headerText,
    alignment: 'center', fontSize: fs
  }));
const td = (text, align = 'right', zebra = null, fs = 8) =>
  ({ text, alignment: align, fontSize: fs, fillColor: zebra });
const totalCell = (text, align = 'right') =>
  ({ text, alignment: align, bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 8 });
const zebraOf = (i) => (i % 2 === 1 ? colors.zebraFill : null);

function section(title, widths, body) {
  return [
    { text: title, bold: true, fontSize: 9, color: colors.subText, fillColor: colors.subFill, margin: [0, 8, 0, 2] },
    { table: { headerRows: 1, dontBreakRows: false, keepWithHeaderRows: 1, widths, body }, layout: tableLayout() }
  ];
}

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}

const avgAll = (rows, f) => (rows.length ? rows.reduce((a, r) => a + dec(r, f), 0) / rows.length : 0);
const sumAll = (rows, f) => rows.reduce((a, r) => a + dec(r, f), 0);

function empSection(rows, title, spinning) {
  const headers = spinning
    ? ['Agent', 'Emp ID', 'Employee Name', 'Prod (Kg)', 'Waste %', 'EM', 'Grade']
    : ['Agent', 'Emp ID', 'Employee Name', 'Prod (Kg)', 'Eff %', 'Util %', 'Grade'];
  const widths = [95, 60, '*', 70, 55, 55, 60];
  const body = [headRow(headers)];

  const groups = groupBy(rows, (r) => str(r, 'EmployeeCode'));
  let i = 0;
  for (const list of groups.values()) {
    const z = zebraOf(i++);
    const first = list[0];
    const prod = sumAll(list, 'Prodn');
    const c2 = spinning ? avgAll(list, 'WastePer') : avgAll(list, 'ProdnEffi');
    const c3 = spinning ? avgAll(list, 'EM') : avgAll(list, 'Utilisation');
    const grade = str(first, 'GradeName') || '-';
    body.push([
      td(str(first, 'AgentName'), 'left', z),
      td(str(first, 'EmployeeID'), 'center', z),
      td(str(first, 'EmployeeName'), 'left', z),
      td(fmt(prod, 2), 'right', z),
      td(fmt(c2, 2), 'right', z),
      td(fmt(c3, 2), 'right', z),
      td(grade, 'center', z)
    ]);
  }

  const tProd = sumAll(rows, 'Prodn');
  const tC2 = spinning ? avgAll(rows, 'WastePer') : avgAll(rows, 'ProdnEffi');
  const tC3 = spinning ? avgAll(rows, 'EM') : avgAll(rows, 'Utilisation');
  body.push([
    { ...totalCell('Total No.of Shift : ' + rows.length, 'right'), colSpan: 3 }, {}, {},
    totalCell(fmt(tProd, 2)), totalCell(fmt(tC2, 2)), totalCell(fmt(tC3, 2)), totalCell('')
  ]);
  return section(title, widths, body);
}

function buildDocDefinition({ data, companyName, companyLogo, fromDate, toDate }) {
  const d = data || {};
  const order = [
    ['carding', 'CARDING', false],
    ['drawing', 'BREAKER DRAWING', false],
    ['unilap', 'UNILAP', false],
    ['comber', 'COMBER', false],
    ['finisherDrawing', 'FINISHER DRAWING', false],
    ['simplex', 'SIMPLEX', false],
    ['spinning', 'SPINNING', true]
  ];
  const tables = [];
  for (const [key, label, spinning] of order) {
    if ((d[key] || []).length) for (const n of empSection(d[key], label, spinning)) tables.push(n);
  }
  if (!tables.length) {
    tables.push({ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] });
  }
  return buildPage({ companyName, companyLogo, title: TITLE, fromDate, toDate, tables });
}

export const overAllEmployeePerformanceReport = (req, res) => {
  return runMultiReport(req, res, {
    fileName: FILE_NAME,
    buildDocDefinition,
    procs: [
      { key: 'carding', spName: 'sp_Prodn_Carding_EmployeePerformance' },
      { key: 'drawing', spName: 'sp_Prodn_Drawing_EmployeePerformance' },
      { key: 'unilap', spName: 'sp_Prodn_Unilap_EmployeePerformance' },
      { key: 'comber', spName: 'sp_Prodn_Comber_EmployeePerformance' },
      { key: 'finisherDrawing', spName: 'sp_Prodn_FinisherDrawing_EmployeePerformance' },
      { key: 'simplex', spName: 'sp_Prodn_Simplex_EmployeePerformance' },
      { key: 'spinning', spName: 'sp_Prodn_Spinning_EmployeePerformance' }
    ]
  });
};
