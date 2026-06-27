// Spinning vs Ultimo difference report.
// Mirrors rptSpinningvsUltimodata.rdlc — per machine: ERP production, machine
// (Ultimo) production and the difference.
//
// SP: sp_Prodn_Spinning_Ultimo_Difference (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt
} from '../cotton/_common.js';

const WIDTHS = ['*', 110, 110, 110];

const TITLE = 'SPINNING & ULTIMO DIFFERENCE';
const FILE_NAME = 'SpinningVsUltimo';

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate }) {
  const body = [];
  const headStyle = { bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 9 };
  body.push(['Machine Name', 'Prodn', 'M/C Prodn', 'Diff Prodn'].map((h) => ({ text: h, ...headStyle })));

  let sProdn = 0, sMc = 0, sDiff = 0;
  let rowIdx = 0;
  for (const r of rows) {
    const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;
    const cell = (text, align = 'right') => ({ text, alignment: align, fontSize: 8, fillColor: zebra });

    const prodn = dec(r, 'Prodn');
    const mc = dec(r, 'MCProdn');
    const diff = dec(r, 'Diff_Prodn');
    sProdn += prodn; sMc += mc; sDiff += diff;

    body.push([
      cell(str(r, 'MachineName'), 'left'),
      cell(fmt(prodn, 2)),
      cell(fmt(mc, 2)),
      cell(fmt(diff, 2)),
    ]);
    rowIdx++;
  }

  const gStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 };
  body.push([
    { text: 'Total', alignment: 'right', ...gStyle },
    { text: fmt(sProdn, 2), alignment: 'right', ...gStyle },
    { text: fmt(sMc, 2), alignment: 'right', ...gStyle },
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

export const spinningUltimoDifferenceReport = (req, res) =>
  runReport(req, res, { spName: 'sp_Prodn_Spinning_Ultimo_Difference', fileName: FILE_NAME, buildDocDefinition });
