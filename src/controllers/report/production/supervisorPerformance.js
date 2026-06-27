// Supervisor Performance (detailed).
// Mirrors rptProduction_Supervior_OverAll.rdlc — three sections (Production /
// Spinning / Autoconer), each grouped by supervisor. The Production section
// lists one row per department (grouped by branch); Spinning & Autoconer list
// one row per count, each with a per-supervisor Total.
//
// Multi-SP report. Each SP takes (CompanyCode, FromDate, ToDate):
//   sp_Prodn_Production_All_Supervisor_Abstract
//   sp_Prodn_Production_All_Spinning_Supervisor_Abstract
//   sp_Prodn_Production_All_AutoConer_Supervisor_Abstract

import {
  runMultiReport, buildPage, tableLayout, colors,
  dec, str, fmt, applyRowFiltersToData
} from '../cotton/_common.js';

const TITLE = 'SUPERVISOR PERFORMANCE REPORT';
const FILE_NAME = 'SupervisorPerformance';

const headRow = (headers, fs = 8) =>
  headers.map((h) => ({
    text: h, bold: true, fillColor: colors.headerFill, color: colors.headerText,
    alignment: 'center', fontSize: fs
  }));
const td = (text, align = 'right', zebra = null, fs = 8) =>
  ({ text, alignment: align, fontSize: fs, fillColor: zebra });
const totalCell = (text, align = 'right') =>
  ({ text, alignment: align, bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 8 });
const supRow = (text, ncol) =>
  [{ text: `SUPERVISOR NAME : ${text}`, colSpan: ncol, bold: true, color: colors.groupText, fillColor: colors.groupFill, fontSize: 9 }, ...Array(ncol - 1).fill({})];
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
const avg = (list, f) => (list.length ? list.reduce((a, r) => a + dec(r, f), 0) / list.length : 0);
const sum = (list, f) => list.reduce((a, r) => a + dec(r, f), 0);

function section(title, widths, body) {
  return [
    { text: title, bold: true, fontSize: 9, color: colors.subText, fillColor: colors.subFill, margin: [0, 8, 0, 2] },
    { table: { headerRows: 1, dontBreakRows: false, keepWithHeaderRows: 1, widths, body }, layout: tableLayout() }
  ];
}

// ---- Production section — rows = department, grouped by supervisor. ----
function productionSection(rows) {
  const HEADERS = ['Department', 'Act Prodn', 'Target', 'Effi %', 'Util %', 'Waste Kgs', 'Waste %', 'Shifts', 'Avg/Shift'];
  const WIDTHS = ['*', 60, 60, 50, 50, 60, 50, 45, 60];
  const body = [headRow(HEADERS)];
  const bySup = groupBy(rows, (r) => str(r, 'SupervisorCode'));
  for (const list of bySup.values()) {
    body.push(supRow(str(list[0], 'SupervisorName'), HEADERS.length));
    list.forEach((r, i) => {
      const z = zebraOf(i);
      body.push([
        td(str(r, 'DepartmentName'), 'left', z),
        td(fmt(dec(r, 'TodayProdnKg'), 2), 'right', z),
        td(fmt(dec(r, 'TotTargetProd'), 2), 'right', z),
        td(fmt(dec(r, 'TodayEff'), 2), 'right', z),
        td(fmt(dec(r, 'TodayUt'), 2), 'right', z),
        td(fmt(dec(r, 'Wastekg'), 2), 'right', z),
        td(fmt(dec(r, 'WastePer'), 2), 'right', z),
        td(fmt(dec(r, 'NoOfShift'), 0), 'right', z),
        td(fmt(dec(r, 'AvgPrdnPerShift'), 2), 'right', z)
      ]);
    });
    body.push([
      totalCell('Total', 'right'),
      totalCell(fmt(sum(list, 'TodayProdnKg'), 2)), totalCell(fmt(sum(list, 'TotTargetProd'), 2)),
      totalCell(fmt(avg(list, 'TodayEff'), 2)), totalCell(fmt(avg(list, 'TodayUt'), 2)),
      totalCell(fmt(sum(list, 'Wastekg'), 2)), totalCell(fmt(avg(list, 'WastePer'), 2)),
      totalCell(fmt(sum(list, 'NoOfShift'), 0)), totalCell(fmt(avg(list, 'AvgPrdnPerShift'), 2))
    ]);
  }
  return section('PRODUCTION', WIDTHS, body);
}

// ---- Spinning section — rows = count, grouped by supervisor (extra GPS cols). ----
function spinningSection(rows) {
  const HEADERS = ['Count', 'Act Prodn', 'Target', 'Effi %', 'Util %', 'Waste Kgs', 'Waste %', 'GPS', "40's GPS", 'Avg/Shift', 'Idle Spdl'];
  const WIDTHS = ['*', 55, 55, 45, 45, 55, 45, 45, 50, 55, 55];
  const body = [headRow(HEADERS)];
  const bySup = groupBy(rows, (r) => str(r, 'SupervisorCode'));
  for (const list of bySup.values()) {
    body.push(supRow(str(list[0], 'SupervisorName'), HEADERS.length));
    list.forEach((r, i) => {
      const z = zebraOf(i);
      body.push([
        td(str(r, 'CountName'), 'left', z),
        td(fmt(dec(r, 'TotalProdnKg'), 2), 'right', z),
        td(fmt(dec(r, 'TotTargetProd'), 2), 'right', z),
        td(fmt(dec(r, 'ToatlEffi'), 2), 'right', z),
        td(fmt(dec(r, 'ToatlUT'), 2), 'right', z),
        td(fmt(dec(r, 'TotalWaste'), 2), 'right', z),
        td(fmt(dec(r, 'ToatlWastePer'), 2), 'right', z),
        td(fmt(dec(r, 'AvgGPS'), 2), 'right', z),
        td(fmt(dec(r, 'Avg40sGPS'), 2), 'right', z),
        td(fmt(dec(r, 'AvgPrdnPerShift'), 2), 'right', z),
        td(fmt(dec(r, 'TotalIdleSpg'), 2), 'right', z)
      ]);
    });
    body.push([
      totalCell('Total', 'right'),
      totalCell(fmt(sum(list, 'TotalProdnKg'), 2)), totalCell(fmt(sum(list, 'TotTargetProd'), 2)),
      totalCell(fmt(avg(list, 'ToatlEffi'), 2)), totalCell(fmt(avg(list, 'ToatlUT'), 2)),
      totalCell(fmt(sum(list, 'TotalWaste'), 2)), totalCell(fmt(avg(list, 'ToatlWastePer'), 2)),
      totalCell(fmt(avg(list, 'AvgGPS'), 2)), totalCell(fmt(avg(list, 'Avg40sGPS'), 2)),
      totalCell(fmt(avg(list, 'AvgPrdnPerShift'), 2)), totalCell(fmt(sum(list, 'TotalIdleSpg'), 2))
    ]);
  }
  return section('SPINNING', WIDTHS, body);
}

// ---- Autoconer section — rows = count, grouped by supervisor. ----
function autoconerSection(rows) {
  const HEADERS = ['Count', 'Act Prodn', 'Target', 'Effi %', 'Util %', 'Waste Kgs', 'Waste %', 'Shifts', 'Avg/Shift'];
  const WIDTHS = ['*', 60, 60, 50, 50, 60, 50, 45, 60];
  const body = [headRow(HEADERS)];
  const bySup = groupBy(rows, (r) => str(r, 'SupervisorCode'));
  for (const list of bySup.values()) {
    body.push(supRow(str(list[0], 'SupervisorName'), HEADERS.length));
    list.forEach((r, i) => {
      const z = zebraOf(i);
      body.push([
        td(str(r, 'CountName'), 'left', z),
        td(fmt(dec(r, 'TotalProdnKg'), 2), 'right', z),
        td(fmt(dec(r, 'TotTargetProd'), 2), 'right', z),
        td(fmt(dec(r, 'ToatlEffi'), 2), 'right', z),
        td(fmt(dec(r, 'ToatlUT'), 2), 'right', z),
        td(fmt(dec(r, 'TotalWaste'), 2), 'right', z),
        td(fmt(dec(r, 'ToatlWastePer'), 2), 'right', z),
        td(fmt(dec(r, 'NoOfShift'), 0), 'right', z),
        td(fmt(dec(r, 'AvgPrdnPerShift'), 2), 'right', z)
      ]);
    });
    body.push([
      totalCell('Total', 'right'),
      totalCell(fmt(sum(list, 'TotalProdnKg'), 2)), totalCell(fmt(sum(list, 'TotTargetProd'), 2)),
      totalCell(fmt(avg(list, 'ToatlEffi'), 2)), totalCell(fmt(avg(list, 'ToatlUT'), 2)),
      totalCell(fmt(sum(list, 'TotalWaste'), 2)), totalCell(fmt(avg(list, 'ToatlWastePer'), 2)),
      totalCell(fmt(sum(list, 'NoOfShift'), 0)), totalCell(fmt(avg(list, 'AvgPrdnPerShift'), 2))
    ]);
  }
  return section('AUTOCONER', WIDTHS, body);
}

function buildDocDefinition({ data, companyName, companyLogo, fromDate, toDate, query }) {
  const d = applyRowFiltersToData(data, query);
  const tables = [];
  if ((d.production || []).length) for (const n of productionSection(d.production)) tables.push(n);
  if ((d.spinning || []).length) for (const n of spinningSection(d.spinning)) tables.push(n);
  if ((d.autoconer || []).length) for (const n of autoconerSection(d.autoconer)) tables.push(n);
  if (!tables.length) {
    tables.push({ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] });
  }
  return buildPage({ companyName, companyLogo, title: TITLE, fromDate, toDate, tables });
}

export const supervisorPerformanceReport = (req, res) => {
  return runMultiReport(req, res, {
    fileName: FILE_NAME,
    buildDocDefinition,
    procs: [
      { key: 'production', spName: 'sp_Prodn_Production_All_Supervisor_Abstract' },
      { key: 'spinning', spName: 'sp_Prodn_Production_All_Spinning_Supervisor_Abstract' },
      { key: 'autoconer', spName: 'sp_Prodn_Production_All_AutoConer_Supervisor_Abstract' }
    ]
  });
};
