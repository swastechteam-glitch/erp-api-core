// YCP Shift Wise Production report.
// Mirrors rpYCPProductionShiftWise_Arun.rdlc — grouped per shift + date with a
// header band (Date / Shift / SIC / MON), one row per Count + Mixing line, and a
// per-group total row.
//
// SP: sp_Prodn_YCPProdnDetails_GetAll (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy, chartFromRows
} from '../cotton/_common.js';

// 6 columns.
const WIDTHS = [36, '*', 130, 90, 90, 110];

const TITLE = 'YCP SHIFT WISE PRODUCTION REPORT';
const FILE_NAME = 'YCPProduction_ShiftWise';

const HEADERS = ['S.No', 'Count', 'Mixing', 'Cone Weight', 'No of Cones', 'Total Prodn'];

function buildShiftTable(shiftRows) {
  const body = [];
  const headStyle = { bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 8 };
  body.push(HEADERS.map((h) => ({ text: h, ...headStyle })));

  let sCones = 0, sProdn = 0;
  let rowIdx = 0;
  shiftRows.forEach((r, i) => {
    const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;
    const cell = (text, align = 'right') => ({ text, alignment: align, fontSize: 8, fillColor: zebra });

    const cones = dec(r, 'NoOfCones');
    const prodn = dec(r, 'ProdnKGS');
    sCones += cones; sProdn += prodn;

    body.push([
      cell(String(i + 1), 'center'),
      cell(str(r, 'ShortName') || str(r, 'CountName'), 'left'),
      cell(str(r, 'MixingName'), 'left'),
      cell(fmt(dec(r, 'ConeWeight'), 2)),
      cell(fmt(cones, 0)),
      cell(fmt(prodn, 2)),
    ]);
    rowIdx++;
  });

  const gStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 };
  body.push([
    { text: 'TOTAL', colSpan: 4, alignment: 'right', ...gStyle }, {}, {}, {},
    { text: fmt(sCones, 0), alignment: 'right', ...gStyle },
    { text: fmt(sProdn, 2), alignment: 'right', ...gStyle },
  ]);

  return { table: { headerRows: 1, dontBreakRows: true, keepWithHeaderRows: 0, widths: WIDTHS, body }, layout: tableLayout() };
}

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate }) {
  // Group by Shift + Production Date (matches the rdlc grouping).
  const groups = new Map();
  for (const r of rows) {
    const key = `${str(r, 'ShiftCode')}|${str(r, 'YCPProdnDate')}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  const tables = [];
  for (const shiftRows of groups.values()) {
    const head = shiftRows[0] || {};
    tables.push({
      margin: [0, 8, 0, 2],
      table: {
        widths: ['auto', '*', '*', '*'],
        body: [[
          { text: `Date : ${ddmmyyyy(head.YCPProdnDate)}`, bold: true, fontSize: 8, fillColor: colors.subFill, color: colors.subText },
          { text: `Shift - ${str(head, 'ShiftNo') || str(head, 'ShiftName')}`, bold: true, fontSize: 8, fillColor: colors.subFill, color: colors.subText },
          { text: `SIC - ${str(head, 'SupervisorName')}`, bold: true, fontSize: 8, fillColor: colors.subFill, color: colors.subText },
          { text: `MON - ${str(head, 'MaistryName')}`, bold: true, fontSize: 8, fillColor: colors.subFill, color: colors.subText },
        ]],
      },
      layout: 'noBorders',
    });
    tables.push(buildShiftTable(shiftRows));
  }

  if (!tables.length) {
    return buildPage({ companyName, companyLogo, title: TITLE, fromDate, toDate,
      tables: [{ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] }] });
  }

  const chart = chartFromRows(rows, {
    groupKey: (r) => str(r, 'CountNameCode') || str(r, 'ShortName'),
    groupLabel: (r) => str(r, 'ShortName') || str(r, 'CountName'),
    valueFn: (r) => dec(r, 'ProdnKGS'), valueHeader: 'Production',
    groupHeader: 'Count', digits: 2,
  });

  return buildPage({ companyName, companyLogo, title: TITLE, fromDate, toDate, tables: [...chart, ...tables] });
}

export const ycpShiftWiseReport = (req, res) =>
  runReport(req, res, { spName: 'sp_Prodn_YCPProdnDetails_GetAll', fileName: FILE_NAME, buildDocDefinition });
