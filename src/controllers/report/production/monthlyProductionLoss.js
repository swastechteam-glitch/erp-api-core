// Monthly Production Loss (Spinning).
// Mirrors rptMonthyProductionLoss_Spinning.rdlc — a single two-column table
// (Heading / Kgs) sorted by OrderNo. The RDLC title is
// "PACKING PRODN & 40s CONVERTED AND LOSS REPORT".
//
// SP: sp_Prodn_Spinning_prodnLoss_Monthly (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, applyRowFilters
} from '../cotton/_common.js';

const TITLE = 'PACKING PRODN & 40s CONVERTED AND LOSS REPORT';
const FILE_NAME = 'MonthlyProductionLoss_Spinning';

const WIDTHS = ['*', 160];
const HEADERS = ['Description', 'Kgs'];

function buildDocDefinition({ rows: rawRows, companyName, companyLogo, fromDate, toDate, query }) {
  const rows = applyRowFilters(rawRows, query);
  const headStyle = { bold: true, fillColor: colors.headerFill, color: colors.headerText, fontSize: 9 };
  const body = [[
    { text: HEADERS[0], ...headStyle, alignment: 'left' },
    { text: HEADERS[1], ...headStyle, alignment: 'center' }
  ]];

  // RDLC sorts the detail by OrderNo before rendering.
  const ordered = [...(rows || [])].sort((a, b) => dec(a, 'OrderNo') - dec(b, 'OrderNo'));

  ordered.forEach((r, i) => {
    const zebra = i % 2 === 1 ? colors.zebraFill : null;
    body.push([
      { text: str(r, 'Heading'), alignment: 'left', fontSize: 9, fillColor: zebra },
      { text: fmt(dec(r, 'Kgs'), 2), alignment: 'right', fontSize: 9, fillColor: zebra }
    ]);
  });

  if (ordered.length === 0) {
    return buildPage({
      companyName, companyLogo, title: TITLE, fromDate, toDate,
      tables: [{ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] }]
    });
  }

  return buildPage({
    companyName, companyLogo, title: TITLE, fromDate, toDate,
    tables: [{ table: { headerRows: 1, dontBreakRows: true, widths: WIDTHS, body }, layout: tableLayout() }]
  });
}

export const monthlyProductionLossReport = (req, res) =>
  runReport(req, res, { spName: 'sp_Prodn_Spinning_prodnLoss_Monthly', fileName: FILE_NAME, buildDocDefinition });
