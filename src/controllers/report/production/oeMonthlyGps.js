// OE Monthly GPS report.
// Mirrors rptOEMonthlyGPS.rdlc — per count (grouped by branch): production,
// standard / actual GPS, GPS with power-cut, GPS efficiency and 40s conversions.
//
// SP: sp_Prodn_OE_MonthlyGPS (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt
} from '../cotton/_common.js';

// 8 columns.
const WIDTHS = ['*', 70, 56, 56, 64, 56, 70, 56];

const TITLE = 'OE MONTHLY GPS';
const FILE_NAME = 'OEProduction_MonthlyGPS';

const HEADERS = [
  'Count', 'Ultimo Prodn', 'STD GPS', 'Act GPS', 'GPS w/ PowerCut',
  'GPS Eff %', '40 Conv KG', '40s GPS'
];

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate }) {
  const body = [];
  const headStyle = { bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 8 };
  body.push(HEADERS.map((h) => ({ text: h, ...headStyle })));

  const branches = new Map();
  for (const r of rows) {
    const key = str(r, 'BranchCode') || str(r, 'BranchName');
    if (!branches.has(key)) branches.set(key, { name: str(r, 'BranchName'), rows: [] });
    branches.get(key).rows.push(r);
  }

  let gProdn = 0, gConv = 0;
  let rowIdx = 0;
  for (const br of branches.values()) {
    if (branches.size > 1) {
      body.push([{ text: br.name, colSpan: 8, bold: true, color: colors.groupText, fillColor: colors.groupFill, fontSize: 8 }, {}, {}, {}, {}, {}, {}, {}]);
    }
    for (const r of br.rows) {
      const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;
      const cell = (text, align = 'right') => ({ text, alignment: align, fontSize: 7, fillColor: zebra });

      const prodn = dec(r, 'ActProdn');
      const conv = dec(r, 'KG40sConverted');
      gProdn += prodn; gConv += conv;

      body.push([
        cell(str(r, 'CountName'), 'left'),
        cell(fmt(prodn, 2)),
        cell(fmt(dec(r, 'StdGPS'), 2)),
        cell(fmt(dec(r, 'ActGPS'), 2)),
        cell(fmt(dec(r, 'GPSwithPF'), 2)),
        cell(fmt(dec(r, 'GPSEffi'), 2)),
        cell(fmt(conv, 2)),
        cell(fmt(dec(r, 'GPS40CovertedGPS'), 2)),
      ]);
      rowIdx++;
    }
  }

  const gStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 8 };
  body.push([
    { text: 'Over All', alignment: 'right', ...gStyle },
    { text: fmt(gProdn, 2), alignment: 'right', ...gStyle },
    { text: '', ...gStyle }, { text: '', ...gStyle }, { text: '', ...gStyle }, { text: '', ...gStyle },
    { text: fmt(gConv, 2), alignment: 'right', ...gStyle },
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

export const oeMonthlyGpsReport = (req, res) =>
  runReport(req, res, { spName: 'sp_Prodn_OE_MonthlyGPS', fileName: FILE_NAME, buildDocDefinition });
