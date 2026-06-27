// Spinning Machine Wise Summary (Day) report.
// Mirrors rptSpinningMachineWiseDetails_report.rdlc — one row per machine with
// per-shift on-date production, total + upto-date production, and utilisation /
// waste % totals.
//
// SP: sp_Prodn_Spinning_OverAll (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, chartFromRows
} from '../cotton/_common.js';

// 10 columns.
const WIDTHS = [50, 56, 56, 56, 60, 64, 50, 56, 50, 56];

const TITLE = 'SPINNING PRODUCTION DETAILS (MACHINE WISE)';
const FILE_NAME = 'SpinningProduction_MachineWiseSummary';

const HEADERS = [
  'M/C', 'Shift 1', 'Shift 2', 'Shift 3', 'Total Prdn', 'Upto Prdn',
  'Util %', 'Upto Util %', 'Waste %', 'Upto Waste %'
];

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate }) {
  const body = [];
  const headStyle = { bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 8 };
  body.push(HEADERS.map((h) => ({ text: h, ...headStyle })));

  let s1 = 0, s2 = 0, s3 = 0, sTot = 0, sUpto = 0, sUt = 0, sUUt = 0, sWp = 0, sUWp = 0, n = 0;

  let rowIdx = 0;
  for (const r of rows) {
    const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;
    const cell = (text, align = 'right') => ({ text, alignment: align, fontSize: 7, fillColor: zebra });

    const v1 = dec(r, 'ToDayProdn1');
    const v2 = dec(r, 'ToDayProdn2');
    const v3 = dec(r, 'ToDayProdn3');
    const tot = dec(r, 'TotalProdn');
    const upto = dec(r, 'TotalUpToDateProdn');
    const ut = dec(r, 'TotalUtil');
    const uut = dec(r, 'TotalUpToDateUtil');
    const wp = dec(r, 'TotalWastePer');
    const uwp = dec(r, 'TotalUpToDateWastePer');

    s1 += v1; s2 += v2; s3 += v3; sTot += tot; sUpto += upto;
    sUt += ut; sUUt += uut; sWp += wp; sUWp += uwp; n++;

    body.push([
      cell(str(r, 'MachineNo'), 'center'),
      cell(fmt(v1, 1)),
      cell(fmt(v2, 1)),
      cell(fmt(v3, 1)),
      cell(fmt(tot, 1)),
      cell(fmt(upto, 1)),
      cell(fmt(ut, 2)),
      cell(fmt(uut, 2)),
      cell(fmt(wp, 2)),
      cell(fmt(uwp, 2)),
    ]);
    rowIdx++;
  }

  const gStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 8 };
  const avg = (s) => (n > 0 ? s / n : 0);
  body.push([
    { text: 'Total', alignment: 'right', ...gStyle },
    { text: fmt(s1, 1), alignment: 'right', ...gStyle },
    { text: fmt(s2, 1), alignment: 'right', ...gStyle },
    { text: fmt(s3, 1), alignment: 'right', ...gStyle },
    { text: fmt(sTot, 1), alignment: 'right', ...gStyle },
    { text: fmt(sUpto, 1), alignment: 'right', ...gStyle },
    { text: fmt(avg(sUt), 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(sUUt), 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(sWp), 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(sUWp), 2), alignment: 'right', ...gStyle },
  ]);

  if (rows.length === 0) {
    return buildPage({ companyName, companyLogo, title: TITLE, fromDate, toDate,
      tables: [{ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] }] });
  }

  const chart = chartFromRows(rows, {
    groupKey: (r) => str(r, 'MachineNo'),
    groupLabel: (r) => 'M/C ' + str(r, 'MachineNo'),
    valueFn: (r) => dec(r, 'TotalUpToDateProdn'), valueHeader: 'Upto Date Prdn',
    groupHeader: 'Machine', digits: 1,
  });

  return buildPage({
    companyName, companyLogo, title: TITLE, fromDate, toDate,
    tables: [...chart, { table: { headerRows: 1, dontBreakRows: true, widths: WIDTHS, body }, layout: tableLayout() }],
  });
}

export const spinningOverAllMachineWiseReport = (req, res) =>
  runReport(req, res, { spName: 'sp_Prodn_Spinning_OverAll', fileName: FILE_NAME, buildDocDefinition });
