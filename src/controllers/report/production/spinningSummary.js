// Spinning Day Wise (Count Wise) Production Summary report.
// Mirrors 02rptSpinningProductionDayWise.rdlc — production grouped by count + mixing.
//
// SP: sp_Prodn_SpinningProdnDetails_GetAll (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, titleBlock, tableLayout, colors,
  dec, str, fmt, chartFromRows
} from '../cotton/_common.js';

// 11 columns
const WIDTHS = [56, '*', 40, 56, 56, 48, 52, 44, 44, 44, 44];

const TITLE = 'SPINNING DAY WISE PRODUCTION REPORT';
const FILE_NAME = 'SpinningProduction_Summary';

const HEADERS = [
  'Count', 'Mix Name', 'No.M/C', 'Wkd Spdl', 'Act Prdn', 'GPSS',
  'Waste Kg', 'Waste %', 'Eff %', 'UT %', 'MPI'
];

// Aggregate spinning detail rows by Count + Mixing for the count/day-wise views.
export function aggregateByCountMixing(rows) {
  const groups = new Map();
  for (const r of rows) {
    const key = `${str(r, 'CountName')}||${str(r, 'MixingName')}`;
    const g = groups.get(key) || {
      count: str(r, 'CountName'),
      mix: str(r, 'MixingName'),
      mc: 0, wkdSpdl: 0, prodn: 0,
      gpsSum: 0, wasteKg: 0, wastePerSum: 0, effSum: 0, utSum: 0, mpiSum: 0, n: 0
    };
    g.mc += 1;
    g.wkdSpdl += dec(r, 'WorkedSpindle');
    g.prodn += dec(r, 'Prodn');
    g.gpsSum += dec(r, 'GmsSpl');
    g.wasteKg += dec(r, 'WasteKgs');
    g.wastePerSum += dec(r, 'WastePer');
    g.effSum += dec(r, 'ProdnEffi');
    g.utSum += dec(r, 'Utilisation');
    g.mpiSum += dec(r, 'MPI');
    g.n += 1;
    groups.set(key, g);
  }
  return [...groups.values()];
}

export function buildCountMixingDoc({ rows, companyName, companyLogo, fromDate, toDate, title }) {
  const body = [];

  const headStyle = {
    bold: true, fillColor: colors.headerFill, color: colors.headerText,
    alignment: 'center', fontSize: 8
  };
  body.push(HEADERS.map((h) => ({ text: h, ...headStyle })));

  const groups = aggregateByCountMixing(rows)
    .sort((a, b) => a.count.localeCompare(b.count) || a.mix.localeCompare(b.mix));

  let sMc = 0, sWkd = 0, sProdn = 0, sWasteKg = 0;
  let sGps = 0, sWastePer = 0, sEff = 0, sUt = 0, sMpi = 0, nGroups = 0;

  let rowIdx = 0;
  for (const g of groups) {
    const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;
    const cell = (text, align = 'right') => ({ text, alignment: align, fontSize: 7, fillColor: zebra });
    const avg = (sum) => (g.n > 0 ? sum / g.n : 0);

    sMc += g.mc; sWkd += g.wkdSpdl; sProdn += g.prodn; sWasteKg += g.wasteKg;
    sGps += avg(g.gpsSum); sWastePer += avg(g.wastePerSum); sEff += avg(g.effSum);
    sUt += avg(g.utSum); sMpi += avg(g.mpiSum); nGroups++;

    body.push([
      cell(g.count, 'center'),
      cell(g.mix, 'left'),
      cell(fmt(g.mc, 0)),
      cell(fmt(g.wkdSpdl, 0)),
      cell(fmt(g.prodn, 2)),
      cell(fmt(avg(g.gpsSum), 2)),
      cell(fmt(g.wasteKg, 2)),
      cell(fmt(avg(g.wastePerSum), 2)),
      cell(fmt(avg(g.effSum), 2)),
      cell(fmt(avg(g.utSum), 2)),
      cell(fmt(avg(g.mpiSum), 2))
    ]);
    rowIdx++;
  }

  const gStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 8 };
  const gAvg = (sum) => (nGroups > 0 ? sum / nGroups : 0);
  body.push([
    { text: 'Total', colSpan: 2, alignment: 'right', ...gStyle }, {},
    { text: fmt(sMc, 0), alignment: 'right', ...gStyle },
    { text: fmt(sWkd, 0), alignment: 'right', ...gStyle },
    { text: fmt(sProdn, 2), alignment: 'right', ...gStyle },
    { text: fmt(gAvg(sGps), 2), alignment: 'right', ...gStyle },
    { text: fmt(sWasteKg, 2), alignment: 'right', ...gStyle },
    { text: fmt(gAvg(sWastePer), 2), alignment: 'right', ...gStyle },
    { text: fmt(gAvg(sEff), 2), alignment: 'right', ...gStyle },
    { text: fmt(gAvg(sUt), 2), alignment: 'right', ...gStyle },
    { text: fmt(gAvg(sMpi), 2), alignment: 'right', ...gStyle }
  ]);

  // ----- Key production totals (rendered on the first page) -----
  const sHeadStyle = { bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 9 };
  const sValStyle = { alignment: 'center', fontSize: 10, margin: [0, 2, 0, 2] };
  const summaryHeaders = ['Worked Spindles', 'Actual Prodn (Kg)', 'Avg Eff %', 'Avg UT %', 'Waste Kg', 'Avg Waste %'];
  const summaryValues = [
    fmt(sWkd, 0), fmt(sProdn, 2), fmt(gAvg(sEff), 2), fmt(gAvg(sUt), 2), fmt(sWasteKg, 2), fmt(gAvg(sWastePer), 2)
  ];
  const summary = [
    titleBlock(companyName, title, fromDate, toDate, companyLogo),
    { text: 'PRODUCTION SUMMARY', bold: true, fontSize: 11, color: colors.titleColor, alignment: 'center', margin: [0, 4, 0, 6] },
    {
      table: {
        headerRows: 1,
        widths: summaryHeaders.map(() => '*'),
        body: [
          summaryHeaders.map((h) => ({ text: h, ...sHeadStyle })),
          summaryValues.map((v) => ({ text: v, ...sValStyle }))
        ]
      },
      layout: tableLayout()
    }
  ];

  summary.push(...chartFromRows(rows, {
    groupKey: (r) => str(r, 'CountName'), groupLabel: (r) => str(r, 'CountName'),
    valueFn: (r) => dec(r, 'Prodn'), valueHeader: 'Actual Prdn', groupHeader: 'Count', digits: 2
  }));

  return buildPage({
    companyName, companyLogo, title, fromDate, toDate, summary,
    tables: [{
      table: { headerRows: 1, dontBreakRows: true, keepWithHeaderRows: 0, widths: WIDTHS, body },
      layout: tableLayout()
    }]
  });
}

export const spinningProductionSummaryReport = (req, res) => {
  return runReport(req, res, {
    spName: 'sp_Prodn_SpinningProdnDetails_GetAll',
    fileName: FILE_NAME,
    buildDocDefinition: (ctx) => buildCountMixingDoc({ ...ctx, title: TITLE })
  });
};
