// OE Production Loss report.
// Mirrors rptOELoss.rdlc — per count: machines, GPS (on-date / upto-date),
// standard & actual production and the average production per day.
//
// SP: sp_Prodn_OE_Loss (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt
} from '../cotton/_common.js';

// 8 columns.
const WIDTHS = ['*', 50, 60, 60, 64, 64, 64, 60];

const TITLE = 'OE PRODUCTION LOSS REPORT';
const FILE_NAME = 'OEProduction_Loss';

const HEADERS = [
  'Count', 'No M/C', 'Act GPS OnDate', 'Act GPS Upto',
  'STD Prdn OnDate', 'ACT Prdn OnDate', 'ACT Prdn Upto', 'Avg Prdn/Day'
];

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate }) {
  const body = [];
  const headStyle = { bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 8 };
  body.push(HEADERS.map((h) => ({ text: h, ...headStyle })));

  // Group by branch (header sub-row) preserving first-seen order.
  const branches = new Map();
  for (const r of rows) {
    const key = str(r, 'BranchCode') || str(r, 'BranchName');
    if (!branches.has(key)) branches.set(key, { name: str(r, 'BranchName'), rows: [] });
    branches.get(key).rows.push(r);
  }

  let gMc = 0, gStdOn = 0, gActOn = 0, gActUp = 0;
  let rowIdx = 0;
  for (const br of branches.values()) {
    if (branches.size > 1) {
      body.push([{ text: br.name, colSpan: 8, bold: true, color: colors.groupText, fillColor: colors.groupFill, fontSize: 8 }, {}, {}, {}, {}, {}, {}, {}]);
    }
    for (const r of br.rows) {
      const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;
      const cell = (text, align = 'right') => ({ text, alignment: align, fontSize: 7, fillColor: zebra });

      const mc = dec(r, 'NoOfMachine');
      const gpsOn = dec(r, 'OnDate_GPS');
      const gpsUp = dec(r, 'UpDate_GPS');
      const stdOn = dec(r, 'OnDate_STD_Prodn');
      const actOn = dec(r, 'OnDate_ACT_Prodn');
      const actUp = dec(r, 'UPTO_ACT_Prodn');
      const avgDay = dec(r, 'AVG_Prodn_Day');

      gMc += mc; gStdOn += stdOn; gActOn += actOn; gActUp += actUp;

      body.push([
        cell(str(r, 'CountName'), 'left'),
        cell(fmt(mc, 0)),
        cell(fmt(gpsOn, 2)),
        cell(fmt(gpsUp, 2)),
        cell(fmt(stdOn, 2)),
        cell(fmt(actOn, 2)),
        cell(fmt(actUp, 2)),
        cell(fmt(avgDay, 2)),
      ]);
      rowIdx++;
    }
  }

  const gStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 8 };
  body.push([
    { text: 'Grand Total', alignment: 'right', ...gStyle },
    { text: fmt(gMc, 0), alignment: 'right', ...gStyle },
    { text: '', ...gStyle }, { text: '', ...gStyle },
    { text: fmt(gStdOn, 2), alignment: 'right', ...gStyle },
    { text: fmt(gActOn, 2), alignment: 'right', ...gStyle },
    { text: fmt(gActUp, 2), alignment: 'right', ...gStyle },
    { text: '', ...gStyle },
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

export const oeLossReport = (req, res) =>
  runReport(req, res, { spName: 'sp_Prodn_OE_Loss', fileName: FILE_NAME, buildDocDefinition });
