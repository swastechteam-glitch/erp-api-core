// Autoconer Cumulative (Day Wise / Count Wise) Production report.
// Mirrors rptAutoconerCountProductionSheetDateWise_Arun.rdlc — one row per
// Mixing + Count + Cone-Weight with per-shift Cone/Prodn, a Total block
// (Cone / Cone Weight / Prodn / Drum) and average Red/RCY/YJ/Eff/UT/Index.
//
// SP: sp_Prodn_Autoconer_OverAll (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, chartFromRows
} from '../cotton/_common.js';

// 19 columns.
const WIDTHS = [24, 80, 70, 40, 40, 40, 40, 40, 40, 42, 42, 44, 42, 36, 36, 32, 34, 32, 34];

const TITLE = 'AUTOCONER DAY WISE / COUNT WISE PRODUCTION REPORT';
const FILE_NAME = 'AutoconerProduction_Cumulative';

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate }) {
  const body = [];
  const h = { bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 6 };

  // Row 1 — grouped headers.
  body.push([
    { text: 'S.No', rowSpan: 2, ...h },
    { text: 'Mixing', rowSpan: 2, ...h },
    { text: 'Count', rowSpan: 2, ...h },
    { text: 'I-Shift', colSpan: 2, ...h }, {},
    { text: 'II-Shift', colSpan: 2, ...h }, {},
    { text: 'III-Shift', colSpan: 2, ...h }, {},
    { text: 'Total', colSpan: 4, ...h }, {}, {}, {},
    { text: 'Red', rowSpan: 2, ...h },
    { text: 'RCY', rowSpan: 2, ...h },
    { text: 'YJ', rowSpan: 2, ...h },
    { text: 'Eff', rowSpan: 2, ...h },
    { text: 'UT', rowSpan: 2, ...h },
    { text: 'Index', rowSpan: 2, ...h },
  ]);
  // Row 2 — sub headers.
  body.push([
    {}, {}, {},
    { text: 'Cone', ...h }, { text: 'Prodn', ...h },
    { text: 'Cone', ...h }, { text: 'Prodn', ...h },
    { text: 'Cone', ...h }, { text: 'Prodn', ...h },
    { text: 'Cone', ...h }, { text: 'Cone Wt', ...h }, { text: 'Prodn', ...h }, { text: 'Drum', ...h },
    {}, {}, {}, {}, {}, {},
  ]);

  let c1 = 0, p1 = 0, c2 = 0, p2 = 0, c3 = 0, p3 = 0, tc = 0, tp = 0, td = 0;
  let aRed = 0, aRcy = 0, aYj = 0, aEff = 0, aUt = 0, aIdx = 0, n = 0;
  const groupSummaries = [];
  let rowIdx = 0;

  rows.forEach((r, i) => {
    const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;
    const cell = (text, align = 'right') => ({ text, alignment: align, fontSize: 6, fillColor: zebra });

    const cone1 = dec(r, 'UptoDateNoogCone1');
    const prodn1 = dec(r, 'UptoDateProdnKgs1');
    const cone2 = dec(r, 'UptoDateNoogCone2');
    const prodn2 = dec(r, 'UptoDateProdnKgs2');
    const cone3 = dec(r, 'UptoDateNoogCone3');
    const prodn3 = dec(r, 'UptoDateProdnKgs3');
    const totCone = dec(r, 'UptoDateAchivedNoOfCone');
    const coneWt = dec(r, 'ConeWeight');
    const totProdn = dec(r, 'UptoDateAchivedProdnKgs');
    const drum = dec(r, 'UptoDateAchivedProdnPerDrum');
    const red = dec(r, 'UpTodateRedLight');
    const rcy = dec(r, 'UpTodateRepeatedCycle');
    const yj = dec(r, 'UpTodateYarnJoint');
    const eff = dec(r, 'UpTodateEff');
    const ut = dec(r, 'UpTodateUtil');
    const idx = dec(r, 'UpTodateIndex');

    c1 += cone1; p1 += prodn1; c2 += cone2; p2 += prodn2; c3 += cone3; p3 += prodn3;
    tc += totCone; tp += totProdn; td += drum;
    aRed += red; aRcy += rcy; aYj += yj; aEff += eff; aUt += ut; aIdx += idx; n++;

    body.push([
      cell(String(i + 1), 'center'),
      cell(str(r, 'MixingName'), 'left'),
      cell(str(r, 'ShortName'), 'left'),
      cell(fmt(cone1, 0)),
      cell(fmt(prodn1, 2)),
      cell(fmt(cone2, 0)),
      cell(fmt(prodn2, 2)),
      cell(fmt(cone3, 0)),
      cell(fmt(prodn3, 2)),
      cell(fmt(totCone, 0)),
      cell(fmt(coneWt, 2)),
      cell(fmt(totProdn, 2)),
      cell(fmt(drum, 2)),
      cell(red > 0 ? fmt(red, 2) : '0.00'),
      cell(rcy > 0 ? fmt(rcy, 2) : '0.00'),
      cell(yj > 0 ? fmt(yj, 2) : '0.00'),
      cell(eff > 0 ? fmt(eff, 2) : '0.00'),
      cell(fmt(ut, 2)),
      cell(fmt(idx, 2)),
    ]);
    groupSummaries.push({ label: `${str(r, 'MixingName')} - ${str(r, 'ShortName')}`, totals: { prodn: totProdn } });
    rowIdx++;
  });

  const g = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 6 };
  const avg = (s) => (n > 0 ? s / n : 0);
  body.push([
    { text: 'TOTAL', colSpan: 3, alignment: 'right', ...g }, {}, {},
    { text: fmt(c1, 0), alignment: 'right', ...g },
    { text: fmt(p1, 2), alignment: 'right', ...g },
    { text: fmt(c2, 0), alignment: 'right', ...g },
    { text: fmt(p2, 2), alignment: 'right', ...g },
    { text: fmt(c3, 0), alignment: 'right', ...g },
    { text: fmt(p3, 2), alignment: 'right', ...g },
    { text: fmt(tc, 0), alignment: 'right', ...g },
    { text: '', ...g },
    { text: fmt(tp, 2), alignment: 'right', ...g },
    { text: fmt(td, 2), alignment: 'right', ...g },
    { text: fmt(avg(aRed), 2), alignment: 'right', ...g },
    { text: fmt(avg(aRcy), 2), alignment: 'right', ...g },
    { text: fmt(avg(aYj), 2), alignment: 'right', ...g },
    { text: fmt(avg(aEff), 2), alignment: 'right', ...g },
    { text: fmt(avg(aUt), 2), alignment: 'right', ...g },
    { text: fmt(avg(aIdx), 2), alignment: 'right', ...g },
  ]);

  if (rows.length === 0) {
    return buildPage({ companyName, companyLogo, title: TITLE, fromDate, toDate,
      tables: [{ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] }] });
  }

  const chart = chartFromRows(rows, {
    groupKey: (r) => `${str(r, 'MixingName')}|${str(r, 'ShortName')}`,
    groupLabel: (r) => str(r, 'ShortName') || str(r, 'MixingName'),
    valueFn: (r) => dec(r, 'UptoDateAchivedProdnKgs'), valueHeader: 'Total Prodn',
    groupHeader: 'Count', digits: 2,
  });

  return buildPage({
    companyName, companyLogo, title: TITLE, fromDate, toDate,
    tables: [...chart, { table: { headerRows: 2, dontBreakRows: true, widths: WIDTHS, body }, layout: tableLayout() }],
  });
}

export const autoconerCumulativeReport = (req, res) =>
  runReport(req, res, { spName: 'sp_Prodn_Autoconer_OverAll', fileName: FILE_NAME, buildDocDefinition });
