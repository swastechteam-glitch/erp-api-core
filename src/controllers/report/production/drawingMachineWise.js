// Breaker Drawing Machine Wise (Upto-Date Detail) report.
// Mirrors rptDrawingMachineWiseDetails_report.rdlc — per-machine view of upto-date
// Production / Efficiency / Utilization broken out by shift, plus upto-date totals.
// Differs from the carding variant by an extra Speed (DSpeed) column.
//
// SP: sp_Prodn_Drawing_OverAll (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, buildGroupSummaryPage, tableLayout, colors,
  dec, str, fmt
} from '../cotton/_common.js';

// 19 columns matching the RDLC layout (M/C, Mixing, Spd + 16 metric cols).
const WIDTHS = [
  24, '*', 28,        // M/C, Mixing, Speed
  42, 42, 42, 42,     // Production (s1, s2, s3, Total)
  36, 36, 36, 36,     // Efficiency (s1, s2, s3, Avg)
  36, 36, 36, 36,     // Utilization (s1, s2, s3, Avg)
  42, 36, 36, 40      // Upto Date (Prdn, Eff, Ut, Index)
];

const TITLE = 'BREAKER DRAWING MACHINE WISE UPDATE PRODUCTION';
const FILE_NAME = 'DrawingProduction_MachineWise';

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate }) {
  const body = [];

  const headStyle = {
    bold: true, fillColor: colors.headerFill, color: colors.headerText,
    alignment: 'center', fontSize: 8
  };

  // Row 1: top-level groupings.
  body.push([
    { text: 'M/C', rowSpan: 2, ...headStyle },
    { text: 'Mixing', rowSpan: 2, ...headStyle },
    { text: 'Spd', rowSpan: 2, ...headStyle },
    { text: 'Production in (KG)', colSpan: 4, ...headStyle }, {}, {}, {},
    { text: 'Efficiency %', colSpan: 4, ...headStyle }, {}, {}, {},
    { text: 'Utilization', colSpan: 4, ...headStyle }, {}, {}, {},
    { text: 'Upto Date', colSpan: 4, ...headStyle }, {}, {}, {}
  ]);

  // Row 2: sub-headers.
  body.push([
    {}, {}, {},
    { text: 'Shift 1', ...headStyle },
    { text: 'Shift 2', ...headStyle },
    { text: 'Shift 3', ...headStyle },
    { text: 'Total', ...headStyle },
    { text: 'Shift 1', ...headStyle },
    { text: 'Shift 2', ...headStyle },
    { text: 'Shift 3', ...headStyle },
    { text: 'Avg', ...headStyle },
    { text: 'Shift 1', ...headStyle },
    { text: 'Shift 2', ...headStyle },
    { text: 'Shift 3', ...headStyle },
    { text: 'Avg', ...headStyle },
    { text: 'Prdn', ...headStyle },
    { text: 'Eff %', ...headStyle },
    { text: 'Ut %', ...headStyle },
    { text: 'Index', ...headStyle }
  ]);

  const sorted = [...rows].sort((a, b) => {
    const am = parseInt(a.MachineNo, 10);
    const bm = parseInt(b.MachineNo, 10);
    if (!isNaN(am) && !isNaN(bm)) return am - bm;
    return str(a, 'MachineNo').localeCompare(str(b, 'MachineNo'));
  });

  let sP1 = 0, sP2 = 0, sP3 = 0;
  let nRows = 0;
  let sEff1 = 0, sEff2 = 0, sEff3 = 0, sEffT = 0;
  let sUt1 = 0, sUt2 = 0, sUt3 = 0, sUtT = 0;
  let sUpProdn = 0, sUpEff = 0, sUpUt = 0, sUpIdx = 0;
  const groupSummaries = [];

  let rowIdx = 0;
  for (const r of sorted) {
    const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;
    const cell = (text, align = 'right') => ({
      text, alignment: align, fontSize: 7, fillColor: zebra
    });

    const speed = dec(r, 'DSpeed');
    const p1 = dec(r, 'UptoDateProdn1');
    const p2 = dec(r, 'UptoDateProdn2');
    const p3 = dec(r, 'UptoDateProdn3');
    const pTot = p1 + p2 + p3;

    const e1 = dec(r, 'UpToDateEff1');
    const e2 = dec(r, 'UpToDateEff2');
    const e3 = dec(r, 'UpToDateEff3');
    const eAvg = dec(r, 'TotalUpToDateEff');

    const u1 = dec(r, 'UpToDateUtil1');
    const u2 = dec(r, 'UpToDateUtil2');
    const u3 = dec(r, 'UpToDateUtil3');
    const uAvg = dec(r, 'TotalUpToDateUtil');

    const upProdn = dec(r, 'TotalUpToDateProdn');
    const upEff = dec(r, 'TotalUpToDateEff');
    const upUt = dec(r, 'TotalUpToDateUtil');
    const upIdx = dec(r, 'TotalUpToDateIndex');

    sP1 += p1; sP2 += p2; sP3 += p3;
    sEff1 += e1; sEff2 += e2; sEff3 += e3; sEffT += eAvg;
    sUt1 += u1; sUt2 += u2; sUt3 += u3; sUtT += uAvg;
    sUpProdn += upProdn;
    sUpEff += upEff; sUpUt += upUt; sUpIdx += upIdx;
    nRows++;

    body.push([
      cell(str(r, 'MachineNo'), 'center'),
      cell(str(r, 'ShortName'), 'left'),
      cell(fmt(speed, 0), 'right'),
      cell(fmt(p1, 2)),
      cell(fmt(p2, 2)),
      cell(fmt(p3, 2)),
      cell(fmt(pTot, 2)),
      cell(fmt(e1, 2)),
      cell(fmt(e2, 2)),
      cell(fmt(e3, 2)),
      cell(fmt(eAvg, 2)),
      cell(fmt(u1, 2)),
      cell(fmt(u2, 2)),
      cell(fmt(u3, 2)),
      cell(fmt(uAvg, 2)),
      cell(fmt(upProdn, 2)),
      cell(fmt(upEff, 2)),
      cell(fmt(upUt, 2)),
      cell(fmt(upIdx, 2))
    ]);
    groupSummaries.push({
      label: `${str(r, 'MachineNo')} - ${str(r, 'ShortName')}`,
      totals: { prdn: pTot, eff: eAvg, ut: uAvg, idx: upIdx }
    });
    rowIdx++;
  }

  const gStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 8 };
  const avg = (sum) => (nRows > 0 ? sum / nRows : 0);
  const sPTot = sP1 + sP2 + sP3;
  const finalIndex = (avg(sEffT) + avg(sUtT)) / 2;

  body.push([
    { text: 'Total', colSpan: 3, alignment: 'right', ...gStyle }, {}, {},
    { text: fmt(sP1, 2), alignment: 'right', ...gStyle },
    { text: fmt(sP2, 2), alignment: 'right', ...gStyle },
    { text: fmt(sP3, 2), alignment: 'right', ...gStyle },
    { text: fmt(sPTot, 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(sEff1), 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(sEff2), 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(sEff3), 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(sEffT), 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(sUt1), 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(sUt2), 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(sUt3), 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(sUtT), 2), alignment: 'right', ...gStyle },
    { text: fmt(sUpProdn, 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(sUpEff), 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(sUpUt), 2), alignment: 'right', ...gStyle },
    { text: fmt(finalIndex, 2), alignment: 'right', ...gStyle }
  ]);

  const summary = buildGroupSummaryPage({
    companyName, companyLogo, fromDate, toDate,
    title: 'BREAKER DRAWING MACHINE WISE - SUMMARY',
    groupHeader: 'M/C - Mixing',
    groupSummaries,
    grandTotals: { prdn: sPTot, eff: avg(sEffT), ut: avg(sUtT), idx: finalIndex },
    totalCols: [
      { header: 'Production', key: 'prdn' },
      { header: 'Eff %', key: 'eff' },
      { header: 'Util %', key: 'ut' },
      { header: 'Index', key: 'idx' }
    ]
  });

  return buildPage({
    companyName, companyLogo, title: TITLE, fromDate, toDate,
    summary,
    tables: [{
      table: { headerRows: 2, dontBreakRows: true, keepWithHeaderRows: 0, widths: WIDTHS, body },
      layout: tableLayout()
    }]
  });
}

export const drawingMachineWiseReport = (req, res) => {
  return runReport(req, res, {
    spName: 'sp_Prodn_Drawing_OverAll',
    fileName: FILE_NAME,
    buildDocDefinition
  });
};
