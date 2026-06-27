// YCP Day Wise Production report.
// Mirrors rptYCPProductionDayWise_Arun.rdlc — one row per Count + Mixing with
// per-shift No.Of Cones (1/2/3/Total) and Prodn in Kgs (1/2/3/Total), plus a
// grand-total row.
//
// SP: sp_Prodn_YCP_OverAll (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, chartFromRows
} from '../cotton/_common.js';

// 12 columns.
const WIDTHS = [28, '*', 110, 56, 50, 50, 50, 56, 56, 56, 56, 62];

const TITLE = 'YCP DAY WISE PRODUCTION REPORT';
const FILE_NAME = 'YCPProduction_DayWise';

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate }) {
  const body = [];
  const h = { bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 8 };

  // Row 1 — grouped headers.
  body.push([
    { text: 'S.No', rowSpan: 2, ...h },
    { text: 'Count', rowSpan: 2, ...h },
    { text: 'Mixing', rowSpan: 2, ...h },
    { text: 'Cone Weight', rowSpan: 2, ...h },
    { text: 'No of Cones', colSpan: 4, ...h }, {}, {}, {},
    { text: 'Prodn In Kgs', colSpan: 4, ...h }, {}, {}, {},
  ]);
  // Row 2 — sub headers.
  body.push([
    {}, {}, {}, {},
    { text: '1', ...h }, { text: '2', ...h }, { text: '3', ...h }, { text: 'Total', ...h },
    { text: '1', ...h }, { text: '2', ...h }, { text: '3', ...h }, { text: 'Total', ...h },
  ]);

  let c1 = 0, c2 = 0, c3 = 0, ct = 0, p1 = 0, p2 = 0, p3 = 0, pt = 0;
  let rowIdx = 0;

  rows.forEach((r, i) => {
    const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;
    const cell = (text, align = 'right') => ({ text, alignment: align, fontSize: 8, fillColor: zebra });

    const cone1 = dec(r, 'UpToDateNoOfCone1');
    const cone2 = dec(r, 'UpToDateNoOfCone2');
    const cone3 = dec(r, 'UpToDateNoOfCone3');
    const coneT = dec(r, 'TotalUpToDateNoOfCone');
    const prodn1 = dec(r, 'UptoDateProdn1');
    const prodn2 = dec(r, 'UptoDateProdn2');
    const prodn3 = dec(r, 'UptoDateProdn3');
    const prodnT = dec(r, 'TotalUpToDateProdn');

    c1 += cone1; c2 += cone2; c3 += cone3; ct += coneT;
    p1 += prodn1; p2 += prodn2; p3 += prodn3; pt += prodnT;

    body.push([
      cell(String(i + 1), 'center'),
      cell(str(r, 'CountName') || str(r, 'ShortName'), 'left'),
      cell(str(r, 'MixingName'), 'left'),
      cell(fmt(dec(r, 'ConeWeight'), 2)),
      cell(fmt(cone1, 0)),
      cell(fmt(cone2, 0)),
      cell(fmt(cone3, 0)),
      cell(fmt(coneT, 0)),
      cell(fmt(prodn1, 2)),
      cell(fmt(prodn2, 2)),
      cell(fmt(prodn3, 2)),
      cell(fmt(prodnT, 2)),
    ]);
    rowIdx++;
  });

  const g = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 };
  body.push([
    { text: 'TOTAL', colSpan: 4, alignment: 'right', ...g }, {}, {}, {},
    { text: fmt(c1, 0), alignment: 'right', ...g },
    { text: fmt(c2, 0), alignment: 'right', ...g },
    { text: fmt(c3, 0), alignment: 'right', ...g },
    { text: fmt(ct, 0), alignment: 'right', ...g },
    { text: fmt(p1, 2), alignment: 'right', ...g },
    { text: fmt(p2, 2), alignment: 'right', ...g },
    { text: fmt(p3, 2), alignment: 'right', ...g },
    { text: fmt(pt, 2), alignment: 'right', ...g },
  ]);

  if (rows.length === 0) {
    return buildPage({ companyName, companyLogo, title: TITLE, fromDate, toDate,
      tables: [{ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] }] });
  }

  const chart = chartFromRows(rows, {
    groupKey: (r) => `${str(r, 'CountNameCode')}|${str(r, 'MixingNameCode')}`,
    groupLabel: (r) => str(r, 'CountName') || str(r, 'ShortName'),
    valueFn: (r) => dec(r, 'TotalUpToDateProdn'), valueHeader: 'Total Prodn',
    groupHeader: 'Count', digits: 2,
  });

  return buildPage({
    companyName, companyLogo, title: TITLE, fromDate, toDate,
    tables: [...chart, { table: { headerRows: 2, dontBreakRows: true, widths: WIDTHS, body }, layout: tableLayout() }],
  });
}

export const ycpDayWiseReport = (req, res) =>
  runReport(req, res, { spName: 'sp_Prodn_YCP_OverAll', fileName: FILE_NAME, buildDocDefinition });
