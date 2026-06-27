// Autoconer Machine Wise Summary (Day Wise) report.
// Mirrors rptAutoconerCountProductionDayWise_Arun.rdlc — one summary row per
// Machine + Count + Mixing (drum groups rolled up across the period). Run/Idle/
// Prodn/Waste/Stop are summed; Red/RCY/YJ/Waste%/Eff are averaged; UT averaged.
//
// SP: sp_Prodn_AutoconerProdnDetails_GetAll (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, buildGroupSummaryPage, tableLayout, colors,
  dec, str, fmt
} from '../cotton/_common.js';

// 15 columns.
const WIDTHS = [44, 90, '*', 50, 46, 56, 44, 36, 36, 50, 44, 48, 40, 40, 40];

const TITLE = 'AUTO CONER MACHINE WISE PRODUCTION REPORT';
const FILE_NAME = 'AutoconerProduction_MachineWiseSummary';

const HEADERS = [
  'M/C No', 'Count', 'Mixing', 'Run Drum', 'Idle Drum', 'ACT Prodn',
  'Red Light', 'RCY', 'YJ', 'Waste Kgs', 'Waste %', 'Stop Time', 'Eff %', 'UT %', 'Index'
];

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate }) {
  // Group by Machine + Count + Mixing.
  const groups = new Map();
  for (const r of rows) {
    const key = `${str(r, 'MachineCode')}|${str(r, 'CountNameCode')}|${str(r, 'MixingNameCode')}`;
    if (!groups.has(key)) groups.set(key, { rows: [], sort: dec(r, 'MachineSortOrderNo') });
    groups.get(key).rows.push(r);
  }
  const list = [...groups.values()].sort((a, b) => a.sort - b.sort);

  const body = [];
  const headStyle = { bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 7 };
  body.push(HEADERS.map((h) => ({ text: h, ...headStyle })));

  let tRun = 0, tIdle = 0, tProdn = 0, tWaste = 0, tStop = 0;
  let aRed = 0, aRcy = 0, aYj = 0, aWp = 0, aEff = 0, aUt = 0, aIdx = 0, g = 0;
  const groupSummaries = [];
  let rowIdx = 0;

  for (const grp of list) {
    const gr = grp.rows;
    const head = gr[0] || {};
    const sum = (col) => gr.reduce((s, r) => s + dec(r, col), 0);
    const avg = (col) => (gr.length ? sum(col) / gr.length : 0);

    const run = sum('WorkedDrum');
    const idle = sum('IdleDrum');
    const prodn = sum('ProdnKgs');
    const waste = sum('WasteKgs');
    const stop = sum('Stoppage');
    const red = avg('RedLight');
    const rcy = avg('RepeatedCycle');
    const yj = avg('YarnJoint');
    const wp = avg('WastePer');
    const eff = avg('ProdnEffi');
    const ut = avg('Utilisation');
    const idx = avg('Indexs');

    tRun += run; tIdle += idle; tProdn += prodn; tWaste += waste; tStop += stop;
    aRed += red; aRcy += rcy; aYj += yj; aWp += wp; aEff += eff; aUt += ut; aIdx += idx; g++;

    const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;
    const cell = (text, align = 'right') => ({ text, alignment: align, fontSize: 7, fillColor: zebra });
    body.push([
      cell(str(head, 'MachineNo'), 'center'),
      cell(str(head, 'ShortName') || str(head, 'CountName'), 'left'),
      cell(str(head, 'MixingName'), 'left'),
      cell(fmt(run, 0)),
      cell(fmt(idle, 0)),
      cell(fmt(prodn, 2)),
      cell(red > 0 ? fmt(red, 2) : '0.00'),
      cell(rcy > 0 ? fmt(rcy, 2) : '0.00'),
      cell(yj > 0 ? fmt(yj, 2) : '0.00'),
      cell(fmt(waste, 2)),
      cell(wp > 0 ? fmt(wp, 2) : '0.00'),
      cell(fmt(stop, 2)),
      cell(eff > 0 ? fmt(eff, 2) : '0.00'),
      cell(fmt(ut, 2)),
      cell(fmt(idx, 2)),
    ]);
    groupSummaries.push({ label: `${str(head, 'MachineNo')} - ${str(head, 'ShortName')}`, totals: { prodn, eff } });
    rowIdx++;
  }

  const gStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 8 };
  const gavg = (s) => (g > 0 ? s / g : 0);
  body.push([
    { text: 'TOTAL', colSpan: 3, alignment: 'right', ...gStyle }, {}, {},
    { text: fmt(tRun, 0), alignment: 'right', ...gStyle },
    { text: fmt(tIdle, 0), alignment: 'right', ...gStyle },
    { text: fmt(tProdn, 2), alignment: 'right', ...gStyle },
    { text: fmt(gavg(aRed), 2), alignment: 'right', ...gStyle },
    { text: fmt(gavg(aRcy), 2), alignment: 'right', ...gStyle },
    { text: fmt(gavg(aYj), 2), alignment: 'right', ...gStyle },
    { text: fmt(tWaste, 2), alignment: 'right', ...gStyle },
    { text: fmt(gavg(aWp), 2), alignment: 'right', ...gStyle },
    { text: fmt(tStop, 2), alignment: 'right', ...gStyle },
    { text: fmt(gavg(aEff), 2), alignment: 'right', ...gStyle },
    { text: fmt(gavg(aUt), 2), alignment: 'right', ...gStyle },
    { text: fmt(gavg(aIdx), 2), alignment: 'right', ...gStyle },
  ]);

  if (rows.length === 0) {
    return buildPage({ companyName, companyLogo, title: TITLE, fromDate, toDate,
      tables: [{ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] }] });
  }

  const summary = buildGroupSummaryPage({
    companyName, companyLogo, fromDate, toDate,
    title: 'AUTO CONER MACHINE WISE - SUMMARY',
    groupHeader: 'Machine / Count',
    groupSummaries,
    grandTotals: { prodn: tProdn, eff: gavg(aEff) },
    totalCols: [
      { header: 'Act Prodn', key: 'prodn', digits: 2 },
      { header: 'Eff %', key: 'eff', digits: 2 },
    ],
  });

  return buildPage({
    companyName, companyLogo, title: TITLE, fromDate, toDate,
    summary,
    tables: [{ table: { headerRows: 1, dontBreakRows: true, widths: WIDTHS, body }, layout: tableLayout() }],
  });
}

export const autoconerMachineWiseSummaryReport = (req, res) =>
  runReport(req, res, { spName: 'sp_Prodn_AutoconerProdnDetails_GetAll', fileName: FILE_NAME, buildDocDefinition });
