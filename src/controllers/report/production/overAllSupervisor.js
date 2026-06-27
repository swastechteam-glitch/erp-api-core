// Supervisor Efficiency Summary OverAll.
// Mirrors 07rptProductionSupervisorSummaryReport.rdlc — three sections
// (Production / Spinning / Autoconer), each grouped by supervisor with a Total.
//
// Multi-SP report (runMultiReport). Each SP takes (CompanyCode, FromDate, ToDate).

import {
  runMultiReport, buildPage, tableLayout, colors,
  dec, str, fmt, applyRowFiltersToData
} from '../cotton/_common.js';

const TITLE = 'SUPERVISOR EFFICIENCY SUMMARY REPORT';
const FILE_NAME = 'ProductionOverAll_Supervisor';

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

// `f` maps the per-section field names: { prod, tgt, eff, ut, waste, wper }.
function supSection(rows, title, f) {
  const headers = ['Supervisor', 'Prod Kgs', 'Tar Kgs', 'Eff %', 'Util %', 'Waste Kgs', 'Waste %'];
  const widths = ['*', 70, 70, 55, 55, 70, 60];
  const body = [headRow(headers)];

  const groups = groupBy(rows, (r) => str(r, 'SupervisorCode'));
  let i = 0, gP = 0, gT = 0, gW = 0;
  for (const list of groups.values()) {
    const z = zebraOf(i++);
    const sum = (k) => list.reduce((a, r) => a + dec(r, k), 0);
    const avg = (k) => (list.length ? sum(k) / list.length : 0);
    const p = sum(f.prod), t = sum(f.tgt), w = sum(f.waste);
    gP += p; gT += t; gW += w;
    body.push([
      td(str(list[0], 'SupervisorName'), 'left', z),
      td(fmt(p, 2), 'right', z),
      td(fmt(t, 2), 'right', z),
      td(fmt(avg(f.eff), 2), 'right', z),
      td(fmt(avg(f.ut), 2), 'right', z),
      td(fmt(w, 2), 'right', z),
      td(fmt(avg(f.wper), 2), 'right', z)
    ]);
  }
  const avgAll = (k) => (rows.length ? rows.reduce((a, r) => a + dec(r, k), 0) / rows.length : 0);
  body.push([
    totalCell('Total', 'right'),
    totalCell(fmt(gP, 2)), totalCell(fmt(gT, 2)),
    totalCell(fmt(avgAll(f.eff), 2)), totalCell(fmt(avgAll(f.ut), 2)),
    totalCell(fmt(gW, 2)), totalCell(fmt(avgAll(f.wper), 2))
  ]);
  return section(title, widths, body);
}

// general supervisor abstract (preparatory) uses Today* field names.
const GENERAL = { prod: 'TodayProdnKg', tgt: 'TotTargetProd', eff: 'TodayEff', ut: 'TodayUt', waste: 'Wastekg', wper: 'WastePer' };
// spinning / autoconer abstracts use Total*/Toatl* field names.
const SPG_AC = { prod: 'TotalProdnKg', tgt: 'TotTargetProd', eff: 'ToatlEffi', ut: 'ToatlUT', waste: 'TotalWaste', wper: 'ToatlWastePer' };

function buildDocDefinition({ data, companyName, companyLogo, fromDate, toDate, query }) {
  const d = applyRowFiltersToData(data, query);
  const tables = [];
  if ((d.general || []).length) for (const n of supSection(d.general, 'Production', GENERAL)) tables.push(n);
  if ((d.spinning || []).length) for (const n of supSection(d.spinning, 'Spinning', SPG_AC)) tables.push(n);
  if ((d.autoconer || []).length) for (const n of supSection(d.autoconer, 'Autoconer', SPG_AC)) tables.push(n);
  if (!tables.length) {
    tables.push({ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] });
  }
  return buildPage({ companyName, companyLogo, title: TITLE, fromDate, toDate, tables });
}

export const overAllSupervisorReport = (req, res) => {
  return runMultiReport(req, res, {
    fileName: FILE_NAME,
    buildDocDefinition,
    procs: [
      { key: 'general', spName: 'sp_Prodn_Production_All_Supervisor_Abstract' },
      { key: 'spinning', spName: 'sp_Prodn_Production_All_Spinning_Supervisor_Abstract' },
      { key: 'autoconer', spName: 'sp_Prodn_Production_All_AutoConer_Supervisor_Abstract' }
    ]
  });
};
