// Production HoneyBee Report.
// Mirrors rptProductionHoneyBeeReport.rdlc — a composite landscape report
// stacking the per-department machine "Breaks" tables (Carding / Breaker Drawing
// / Unilap / Comber / Finisher Drawing / Simplex), the AutoConer cuts, the
// spinning production-loss abstract, the department count-group abstract and the
// spinning stoppage reasons.
//
// Multi-SP report. Each SP takes (CompanyCode, FromDate, ToDate).
//
// NOTE: the RDLC also renders two small EB matrices (Humidification plant kWh
// and Spinning EBSH/EM). Those are intentionally omitted here pending their SP
// shapes; add `sp_Prodn_HumidificationPlant_Shiftwise` /
// `sp_Prodn_SpinningProdnDetails_GetAll` panels when needed.

import {
  runMultiReport, buildPage, tableLayout, colors,
  dec, str, fmt, applyRowFiltersToData
} from '../cotton/_common.js';

const TITLE = 'PRODUCTION HONEYBEE REPORT';
const FILE_NAME = 'ProductionHoneyBee';

const headRow = (headers, fs = 7) =>
  headers.map((h) => ({
    text: h, bold: true, fillColor: colors.headerFill, color: colors.headerText,
    alignment: 'center', fontSize: fs
  }));
const td = (text, align = 'center', zebra = null, fs = 7) =>
  ({ text, alignment: align, fontSize: fs, fillColor: zebra });
const totalCell = (text, align = 'center') =>
  ({ text, alignment: align, bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 7 });
const branchCell = (text, ncol) =>
  [{ text, colSpan: ncol, bold: true, color: colors.groupText, fillColor: colors.groupFill, fontSize: 8 }, ...Array(ncol - 1).fill({})];
const zebraOf = (i) => (i % 2 === 1 ? colors.zebraFill : null);

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}
const sum = (list, f) => list.reduce((a, r) => a + dec(r, f), 0);
const avg = (list, f) => (list.length ? sum(list, f) / list.length : 0);

function section(title, widths, body) {
  return [
    { text: title, bold: true, fontSize: 9, color: colors.subText, fillColor: colors.subFill, margin: [0, 8, 0, 2] },
    { table: { headerRows: 2, dontBreakRows: false, keepWithHeaderRows: 2, widths, body }, layout: tableLayout() }
  ];
}

// ---- Per-department machine "Breaks" table (Shift 1/2/3 × Prodn/Effi/Breaks/UKG). ----
// 14 columns: MC Name, Tar.Prodn, then 3 shifts of (Prodn, Effi, Breaks, UKG).
function breaksSection(rows, label) {
  const WIDTHS = ['*', 46, 42, 36, 40, 42, 42, 36, 40, 42, 42, 36, 40, 42];
  const top = [
    { text: label, bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 8, colSpan: 2 }, {},
    { text: 'Shift 1', bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 8, colSpan: 4 }, {}, {}, {},
    { text: 'Shift 2', bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 8, colSpan: 4 }, {}, {}, {},
    { text: 'Shift 3', bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 8, colSpan: 4 }, {}, {}, {}
  ];
  const sub = headRow(['MC Name', 'Tar.Prodn',
    'Prodn', 'Effi', 'Breaks', 'UKG', 'Prodn', 'Effi', 'Breaks', 'UKG', 'Prodn', 'Effi', 'Breaks', 'UKG']);
  const body = [top, sub];

  const branches = groupBy(rows, (r) => str(r, 'BranchCode') || str(r, 'BranchName'));
  for (const list of branches.values()) {
    if (branches.size > 1) body.push(branchCell(str(list[0], 'BranchName'), 14));
    list.forEach((r, i) => {
      const z = zebraOf(i);
      body.push([
        td(str(r, 'MachineName'), 'left', z),
        td(fmt(dec(r, 'TargetProdn'), 0), 'center', z),
        td(fmt(dec(r, 'Prodn1'), 0), 'center', z), td(fmt(dec(r, 'Eff1'), 0), 'center', z), td(fmt(dec(r, 'Breaks1'), 0), 'center', z), td(fmt(dec(r, 'UKG1'), 3), 'center', z),
        td(fmt(dec(r, 'Prodn2'), 0), 'center', z), td(fmt(dec(r, 'Eff2'), 0), 'center', z), td(fmt(dec(r, 'Breaks2'), 0), 'center', z), td(fmt(dec(r, 'UKG2'), 3), 'center', z),
        td(fmt(dec(r, 'Prodn3'), 0), 'center', z), td(fmt(dec(r, 'Eff3'), 0), 'center', z), td(fmt(dec(r, 'Breaks3'), 0), 'center', z), td(fmt(dec(r, 'UKG3'), 3), 'center', z)
      ]);
    });
    body.push([
      totalCell('Sub Total', 'right'), totalCell(fmt(sum(list, 'TargetProdn'), 0)),
      totalCell(fmt(sum(list, 'Prodn1'), 0)), totalCell(fmt(avg(list, 'Eff1'), 0)), totalCell(fmt(sum(list, 'Breaks1'), 0)), totalCell(fmt(avg(list, 'UKG1'), 3)),
      totalCell(fmt(sum(list, 'Prodn2'), 0)), totalCell(fmt(avg(list, 'Eff2'), 0)), totalCell(fmt(sum(list, 'Breaks2'), 0)), totalCell(fmt(avg(list, 'UKG2'), 3)),
      totalCell(fmt(sum(list, 'Prodn3'), 0)), totalCell(fmt(avg(list, 'Eff3'), 0)), totalCell(fmt(sum(list, 'Breaks3'), 0)), totalCell(fmt(avg(list, 'UKG3'), 3))
    ]);
  }
  return section(`${label} — BREAKS`, WIDTHS, body);
}

// ---- AutoConer cuts (Shift 1/2/3 cuts per machine). ----
function autoconerCutsSection(rows) {
  const WIDTHS = ['*', 70, 70, 70];
  const body = [headRow(['Machine', 'Shift 1', 'Shift 2', 'Shift 3'])];
  const branches = groupBy(rows, (r) => str(r, 'BranchName'));
  for (const list of branches.values()) {
    if (branches.size > 1) body.push(branchCell(str(list[0], 'BranchName'), 4));
    list.forEach((r, i) => {
      const z = zebraOf(i);
      body.push([
        td(str(r, 'MachineName'), 'left', z),
        td(fmt(dec(r, 'Cuts1'), 0), 'center', z),
        td(fmt(dec(r, 'Cuts2'), 0), 'center', z),
        td(fmt(dec(r, 'Cuts3'), 0), 'center', z)
      ]);
    });
  }
  return [
    { text: 'AUTOCONER CUTS', bold: true, fontSize: 9, color: colors.subText, fillColor: colors.subFill, margin: [0, 8, 0, 2] },
    { table: { headerRows: 1, dontBreakRows: false, keepWithHeaderRows: 1, widths: WIDTHS, body }, layout: tableLayout() }
  ];
}

// ---- Spinning production-loss abstract. ----
function spinningLossSection(rows) {
  const WIDTHS = ['*', 55, 60, 65, 60, 70, 70, 60];
  const HEADERS = ['Count', 'No Of RF', 'STD GPS', 'GPS With PF', 'Act GPS', 'STD Prodn', 'ACT Prodn', 'Prodn loss'];
  const body = [headRow(HEADERS)];
  rows.forEach((r, i) => {
    const z = zebraOf(i);
    body.push([
      td(str(r, 'CountName'), 'left', z),
      td(fmt(dec(r, 'NoOfMachine'), 0), 'center', z),
      td(fmt(dec(r, 'OnDate_STD_GPS'), 2), 'center', z),
      td(fmt(dec(r, 'OnDate_STD_GPS_PF'), 2), 'center', z),
      td(fmt(dec(r, 'OnDate_GPS'), 2), 'center', z),
      td(fmt(dec(r, 'OnDate_STD_Prodn'), 0), 'center', z),
      td(fmt(dec(r, 'OnDate_ACT_Prodn'), 0), 'center', z),
      td(fmt(dec(r, 'OnDate_STD_Prodn') - dec(r, 'OnDate_ACT_Prodn'), 0), 'center', z)
    ]);
  });
  body.push([
    totalCell('Grand Total', 'left'),
    totalCell(fmt(sum(rows, 'NoOfMachine'), 0)),
    totalCell(fmt(avg(rows, 'OnDate_STD_GPS'), 2)),
    totalCell(fmt(avg(rows, 'OnDate_STD_GPS_PF'), 2)),
    totalCell(fmt(avg(rows, 'OnDate_GPS'), 2)),
    totalCell(fmt(sum(rows, 'OnDate_STD_Prodn'), 0)),
    totalCell(fmt(sum(rows, 'OnDate_ACT_Prodn'), 0)),
    totalCell(fmt(sum(rows, 'OnDate_STD_Prodn') - sum(rows, 'OnDate_ACT_Prodn'), 0))
  ]);
  return [
    { text: 'SPINNING PRODUCTION LOSS', bold: true, fontSize: 9, color: colors.subText, fillColor: colors.subFill, margin: [0, 8, 0, 2] },
    { table: { headerRows: 1, dontBreakRows: false, keepWithHeaderRows: 1, widths: WIDTHS, body }, layout: tableLayout() }
  ];
}

// ---- Department count-group abstract (STD vs Act prodn). ----
function countGroupSection(rows) {
  const WIDTHS = ['*', 90, 90, 90];
  const body = [headRow(['Department', 'Count Group', 'STD Prodn', 'Act Prodn'])];
  rows.forEach((r, i) => {
    const z = zebraOf(i);
    body.push([
      td(str(r, 'DepartmentName'), 'left', z),
      td(str(r, 'CountGroup'), 'left', z),
      td(fmt(dec(r, 'STDProdn'), 0), 'center', z),
      td(fmt(dec(r, 'ActProdn'), 0), 'center', z)
    ]);
  });
  body.push([
    { ...totalCell('Total', 'right'), colSpan: 2 }, {},
    totalCell(fmt(sum(rows, 'STDProdn'), 0)), totalCell(fmt(sum(rows, 'ActProdn'), 0))
  ]);
  return [
    { text: 'COUNT GROUP ABSTRACT', bold: true, fontSize: 9, color: colors.subText, fillColor: colors.subFill, margin: [0, 8, 0, 2] },
    { table: { headerRows: 1, dontBreakRows: false, keepWithHeaderRows: 1, widths: WIDTHS, body }, layout: tableLayout() }
  ];
}

// ---- Spinning stoppage reasons. ----
function stoppageReasonSection(rows) {
  const body = [headRow(['Stoppage Reason'])];
  rows.forEach((r, i) => body.push([td(str(r, 'Reason'), 'left', zebraOf(i))]));
  return [
    { text: 'STOPPAGE', bold: true, fontSize: 9, color: colors.subText, fillColor: colors.subFill, margin: [0, 8, 0, 2] },
    { table: { headerRows: 1, dontBreakRows: false, keepWithHeaderRows: 1, widths: ['*'], body }, layout: tableLayout() }
  ];
}

function buildDocDefinition({ data, companyName, companyLogo, fromDate, toDate, query }) {
  const d = applyRowFiltersToData(data, query);
  const tables = [];
  const depts = [
    ['carding', 'CARDING'],
    ['drawing', 'BREAKER DRAWING'],
    ['unilap', 'UNILAP'],
    ['comber', 'COMBER'],
    ['finisherDrawing', 'FINISHER DRAWING'],
    ['simplex', 'SIMPLEX']
  ];
  for (const [key, label] of depts) {
    if ((d[key] || []).length) for (const n of breaksSection(d[key], label)) tables.push(n);
  }
  if ((d.autoconerCuts || []).length) for (const n of autoconerCutsSection(d.autoconerCuts)) tables.push(n);
  if ((d.spinningLoss || []).length) for (const n of spinningLossSection(d.spinningLoss)) tables.push(n);
  if ((d.countGroup || []).length) for (const n of countGroupSection(d.countGroup)) tables.push(n);
  if ((d.stoppage || []).length) for (const n of stoppageReasonSection(d.stoppage)) tables.push(n);

  if (!tables.length) {
    tables.push({ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] });
  }
  return buildPage({ companyName, companyLogo, title: TITLE, fromDate, toDate, tables });
}

export const honeyBeeReport = (req, res) => {
  return runMultiReport(req, res, {
    fileName: FILE_NAME,
    buildDocDefinition,
    procs: [
      { key: 'carding', spName: 'sp_Prodn_Carding_Breaks' },
      { key: 'drawing', spName: 'sp_Prodn_Drawing_Breaks' },
      { key: 'unilap', spName: 'sp_Prodn_Unilap_Breaks' },
      { key: 'comber', spName: 'sp_Prodn_Comber_Breaks' },
      { key: 'finisherDrawing', spName: 'sp_Prodn_FinisherDrawing_Breaks' },
      { key: 'simplex', spName: 'sp_Prodn_Simplex_Breaks' },
      { key: 'autoconerCuts', spName: 'sp_Prodn_Autoconer_Cuts' },
      { key: 'spinningLoss', spName: 'sp_Prodn_Spinning_Loss' },
      { key: 'countGroup', spName: 'sp_Prodn_CountGroup' },
      { key: 'stoppage', spName: 'sp_SpgDateReason_GetAll' }
    ]
  });
};
