// Simplex Production Summary (Date Wise) report.
// Mirrors 02rptSimplexProductionDayWise.rdlc — one row per machine, shows
// today's per-shift production + today's totals + upto-date totals.
//
// SP: sp_Prodn_Simplex_OverAll (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, buildGroupSummaryPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy
} from '../cotton/_common.js';

// 13 columns
const WIDTHS = [34, '*', 44, 44, 44, 52, 38, 38, 38, 52, 38, 38, 44];

const TITLE = 'SIMPLEX PRODUCTION DAY REPORT - MACHINE WISE';
const FILE_NAME = 'SimplexProduction_Summary';

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate }) {
  const body = [];

  // Row 1 — top-level groups
  const headStyle = {
    bold: true, fillColor: colors.headerFill, color: colors.headerText,
    alignment: 'center', fontSize: 8
  };
  body.push([
    { text: 'M/C.No', rowSpan: 2, ...headStyle },
    { text: 'Mixing', rowSpan: 2, ...headStyle },
    { text: `TODAY (${ddmmyyyy(toDate)})`, colSpan: 7, ...headStyle },
    {}, {}, {}, {}, {}, {},
    { text: 'UP TO DATE', colSpan: 4, ...headStyle },
    {}, {}, {}
  ]);

  // Row 2 — sub-headers
  body.push([
    {}, {},
    { text: 'I Shift', ...headStyle },
    { text: 'II Shift', ...headStyle },
    { text: 'III Shift', ...headStyle },
    { text: 'Total', ...headStyle },
    { text: 'EFF %', ...headStyle },
    { text: 'UT %', ...headStyle },
    { text: 'INDEX', ...headStyle },
    { text: 'Prdn', ...headStyle },
    { text: 'Eff %', ...headStyle },
    { text: 'Ut %', ...headStyle },
    { text: 'Index', ...headStyle }
  ]);

  // Sort by machine number (string-natural).
  const sorted = [...rows].sort((a, b) => {
    const am = parseInt(a.strMachineNo ?? a.MachineNo, 10);
    const bm = parseInt(b.strMachineNo ?? b.MachineNo, 10);
    if (!isNaN(am) && !isNaN(bm)) return am - bm;
    return str(a, 'MachineNo').localeCompare(str(b, 'MachineNo'));
  });

  let sToday1 = 0, sToday2 = 0, sToday3 = 0, sTotalProdn = 0;
  let sUpProdn = 0;
  let nRows = 0, sEffSum = 0, sUtilSum = 0, sIndexSum = 0;
  let sUpEffSum = 0, sUpUtilSum = 0, sUpIndexSum = 0;
  const groupSummaries = [];

  let rowIdx = 0;
  for (const r of sorted) {
    const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;
    const cell = (text, align = 'right') => ({
      text, alignment: align, fontSize: 8, fillColor: zebra
    });

    const t1 = dec(r, 'ToDayProdn1');
    const t2 = dec(r, 'ToDayProdn2');
    const t3 = dec(r, 'ToDayProdn3');
    const tTot = dec(r, 'TotalProdn');
    const tEff = dec(r, 'TotalEff');
    const tUt = dec(r, 'TotalUtil');
    const tIdx = dec(r, 'TotalIndex');
    const uProdn = dec(r, 'TotalUpToDateProdn');
    const uEff = dec(r, 'TotalUpToDateEff');
    const uUt = dec(r, 'TotalUpToDateUtil');
    const uIdx = dec(r, 'TotalUpToDateIndex');

    sToday1 += t1; sToday2 += t2; sToday3 += t3; sTotalProdn += tTot;
    sUpProdn += uProdn;
    sEffSum += tEff; sUtilSum += tUt; sIndexSum += tIdx;
    sUpEffSum += uEff; sUpUtilSum += uUt; sUpIndexSum += uIdx;
    nRows++;

    body.push([
      cell(str(r, 'MachineNo'), 'center'),
      cell(str(r, 'ShortName'), 'left'),
      cell(fmt(t1, 2)),
      cell(fmt(t2, 2)),
      cell(fmt(t3, 2)),
      cell(fmt(tTot, 2)),
      cell(fmt(tEff, 2)),
      cell(fmt(tUt, 2)),
      cell(fmt(tIdx, 2)),
      cell(fmt(uProdn, 2)),
      cell(fmt(uEff, 2)),
      cell(fmt(uUt, 2)),
      cell(fmt(uIdx, 2))
    ]);
    groupSummaries.push({
      label: `${str(r, 'MachineNo')} - ${str(r, 'ShortName')}`,
      totals: { today: tTot, eff: tEff, ut: tUt, upto: uProdn }
    });
    rowIdx++;
  }

  const gStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 };
  const avg = (sum) => (nRows > 0 ? sum / nRows : 0);
  body.push([
    { text: 'Total', colSpan: 2, alignment: 'right', ...gStyle }, {},
    { text: fmt(sToday1, 2), alignment: 'right', ...gStyle },
    { text: fmt(sToday2, 2), alignment: 'right', ...gStyle },
    { text: fmt(sToday3, 2), alignment: 'right', ...gStyle },
    { text: fmt(sTotalProdn, 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(sEffSum), 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(sUtilSum), 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(sIndexSum), 2), alignment: 'right', ...gStyle },
    { text: fmt(sUpProdn, 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(sUpEffSum), 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(sUpUtilSum), 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(sUpIndexSum), 2), alignment: 'right', ...gStyle }
  ]);

  const summary = buildGroupSummaryPage({
    companyName, companyLogo, fromDate, toDate,
    title: 'SIMPLEX PRODUCTION DAY REPORT - SUMMARY',
    groupHeader: 'M/C - Mixing',
    groupSummaries,
    grandTotals: { today: sTotalProdn, eff: avg(sEffSum), ut: avg(sUtilSum), upto: sUpProdn },
    totalCols: [
      { header: "Today's Prdn", key: 'today' },
      { header: 'Eff %', key: 'eff' },
      { header: 'Util %', key: 'ut' },
      { header: 'UpToDate Prdn', key: 'upto' }
    ]
  });

  return buildPage({
    companyName, companyLogo, title: TITLE, fromDate, toDate,
    summary,
    tables: [{
      table: { headerRows: 2, dontBreakRows: true, keepWithHeaderRows: 0, widths: WIDTHS, body },
      layout: tableLayout()
    }]
  });
}

export const simplexProductionSummaryReport = (req, res) => {
  return runReport(req, res, {
    spName: 'sp_Prodn_Simplex_OverAll',
    fileName: FILE_NAME,
    buildDocDefinition
  });
};
