// Production Over All ▸ Date Wise — all-department daily summary.
// Mirrors rptProductionDayWise_AllDepartment.rdlc: one section per department
// (Carding / Breaker Drawing / Unilap / Comber / Finisher Drawing / Simplex),
// each row = machine with per-shift production, total, eff/util/index.
//
// SPs (each CompanyCode/FromDate/ToDate): sp_Prodn_<Dept>_OverAll.

import {
  runMultiReport, buildPage, tableLayout, colors,
  dec, str, fmt
} from '../cotton/_common.js';

const FILE_NAME = 'ProductionOverAll_DayWise';
const TITLE = 'PRODUCTION DEPARTMENT — DAY WISE';

const WIDTHS = [44, '*', 56, 56, 56, 60, 52, 52, 52];
const HEADERS = ['M/C No', 'Mixing', 'I Shift', 'II Shift', 'III Shift', 'Total', 'EFF %', 'UT %', 'INDEX'];

// Department render order + their SP result keys.
const DEPTS = [
  { key: 'carding', title: 'CARDING PRODUCTION' },
  { key: 'drawing', title: 'BREAKER DRAWING PRODUCTION' },
  { key: 'unilap', title: 'UNILAP PRODUCTION' },
  { key: 'comber', title: 'COMBER PRODUCTION' },
  { key: 'finisherDrawing', title: 'FINISHER DRAWING PRODUCTION' },
  { key: 'simplex', title: 'SIMPLEX PRODUCTION' },
];

function buildDeptTable(title, rows) {
  const body = [];
  const h = { bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 8 };
  // Section title row spanning all columns.
  body.push([{ text: title, colSpan: 9, bold: true, color: colors.groupText, fillColor: colors.groupFill, fontSize: 9, alignment: 'center' }, {}, {}, {}, {}, {}, {}, {}, {}]);
  body.push(HEADERS.map((t) => ({ text: t, ...h })));

  let s1 = 0, s2 = 0, s3 = 0, st = 0, ne = 0, eSum = 0, uSum = 0, iSum = 0, rowIdx = 0;
  rows.forEach((r) => {
    const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;
    const cell = (text, align = 'right') => ({ text, alignment: align, fontSize: 8, fillColor: zebra });
    const p1 = dec(r, 'ToDayProdn1'), p2 = dec(r, 'ToDayProdn2'), p3 = dec(r, 'ToDayProdn3'), tot = dec(r, 'TotalProdn');
    const eff = dec(r, 'TotalEff'), uti = dec(r, 'TotalUtil'), idx = dec(r, 'TotalIndex');
    s1 += p1; s2 += p2; s3 += p3; st += tot; eSum += eff; uSum += uti; iSum += idx; ne++;
    body.push([
      cell(str(r, 'MachineNo'), 'center'),
      cell(str(r, 'ShortName') || str(r, 'MixingName'), 'left'),
      cell(fmt(p1, 2)), cell(fmt(p2, 2)), cell(fmt(p3, 2)), cell(fmt(tot, 2)),
      cell(fmt(eff, 2)), cell(fmt(uti, 2)), cell(fmt(idx, 2)),
    ]);
    rowIdx++;
  });

  const g = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 };
  const avg = (sum) => (ne ? sum / ne : 0);
  body.push([
    { text: 'TOTAL', colSpan: 2, alignment: 'right', ...g }, {},
    { text: fmt(s1, 2), alignment: 'right', ...g },
    { text: fmt(s2, 2), alignment: 'right', ...g },
    { text: fmt(s3, 2), alignment: 'right', ...g },
    { text: fmt(st, 2), alignment: 'right', ...g },
    { text: fmt(avg(eSum), 2), alignment: 'right', ...g },
    { text: fmt(avg(uSum), 2), alignment: 'right', ...g },
    { text: fmt(avg(iSum), 2), alignment: 'right', ...g },
  ]);

  return { table: { headerRows: 2, dontBreakRows: true, widths: WIDTHS, body }, layout: tableLayout(), margin: [0, 0, 0, 8] };
}

function buildDocDefinition({ data, companyName, companyLogo, fromDate, toDate }) {
  const tables = [];
  for (const d of DEPTS) {
    const rows = data[d.key] || [];
    if (rows.length) tables.push(buildDeptTable(d.title, rows));
  }
  if (!tables.length) {
    tables.push({ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] });
  }
  return buildPage({ companyName, companyLogo, title: TITLE, fromDate, toDate, tables });
}

export const prodnOverallDateWiseReport = (req, res) =>
  runMultiReport(req, res, {
    fileName: FILE_NAME,
    procs: [
      { key: 'carding', spName: 'sp_Prodn_Carding_OverAll' },
      { key: 'drawing', spName: 'sp_Prodn_Drawing_OverAll' },
      { key: 'unilap', spName: 'sp_Prodn_Unilap_OverAll' },
      { key: 'comber', spName: 'sp_Prodn_Comber_OverAll' },
      { key: 'finisherDrawing', spName: 'sp_Prodn_FinisherDrawing_OverAll' },
      { key: 'simplex', spName: 'sp_Prodn_Simplex_OverAll' },
    ],
    buildDocDefinition,
  });
