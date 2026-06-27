// Spinning vs Simplex difference report.
// Mirrors rptSimplexvsSpinning.rdlc — per date / count: Simplex production,
// Spinning production and the difference.
//
// SP: sp_Prodn_Spinning_Simplex (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy
} from '../cotton/_common.js';

const WIDTHS = [80, '*', 90, 90, 90];

const TITLE = 'SPINNING VS SIMPLEX DIFFERENCE';
const FILE_NAME = 'SpinningVsSimplex';

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate }) {
  const body = [];
  const headStyle = { bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 9 };
  body.push(['Date', 'Count', 'Simplex', 'Spinning', 'Diff'].map((h) => ({ text: h, ...headStyle })));

  let sSpx = 0, sSpg = 0, sDiff = 0;
  let rowIdx = 0;
  for (const r of rows) {
    const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;
    const cell = (text, align = 'right') => ({ text, alignment: align, fontSize: 8, fillColor: zebra });

    const spx = dec(r, 'SimplexProdn');
    const spg = dec(r, 'SpinningProdn');
    const diff = dec(r, 'DiffProdn');
    sSpx += spx; sSpg += spg; sDiff += diff;

    body.push([
      cell(ddmmyyyy(r.ProdnDate), 'center'),
      cell(str(r, 'CountName'), 'left'),
      cell(fmt(spx, 2)),
      cell(fmt(spg, 2)),
      cell(fmt(diff, 2)),
    ]);
    rowIdx++;
  }

  const gStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 };
  body.push([
    { text: 'Total', colSpan: 2, alignment: 'right', ...gStyle }, {},
    { text: fmt(sSpx, 2), alignment: 'right', ...gStyle },
    { text: fmt(sSpg, 2), alignment: 'right', ...gStyle },
    { text: fmt(sDiff, 2), alignment: 'right', ...gStyle },
  ]);

  if (rows.length === 0) {
    return buildPage({ companyName, companyLogo, title: TITLE, fromDate, toDate,
      tables: [{ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] }] });
  }

  return buildPage({
    companyName, companyLogo, title: TITLE, fromDate, toDate,
    tables: [{ table: { headerRows: 1, dontBreakRows: true, widths: WIDTHS, body }, layout: tableLayout() }],
  });
}

export const spinningVsSimplexReport = (req, res) =>
  runReport(req, res, { spName: 'sp_Prodn_Spinning_Simplex', fileName: FILE_NAME, buildDocDefinition });
