// Autoconer Count Wise / Shift Wise Production report.
// Mirrors rptAutoconerCountProductionShiftWise_Arun.rdlc — grouped per shift
// with a per-shift header band (Date / Shift / SIC / MON), one row per count +
// mixing, and a per-shift total row.
//
// SP: sp_Prodn_AutoconerCountProdnDetails_GetAll (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy, chartFromRows
} from '../cotton/_common.js';

// 14 columns.
const WIDTHS = [30, '*', 90, 50, 52, 50, 52, 52, 44, 38, 38, 40, 40, 40];

const TITLE = 'AUTO CONER COUNT WISE / SHIFT WISE PRODUCTION REPORT';
const FILE_NAME = 'AutoconerProduction_CountWise';

const HEADERS = [
  'S.No', 'Count', 'Mixing', 'No.Of Drum', 'Cone Weight', 'No Of Cone',
  'ACT Prodn', 'Prodn / Drum', 'Red Light', 'RCY', 'YJ', 'Eff %', 'UT %', 'Index'
];

function buildShiftTable(shiftRows) {
  const body = [];
  const headStyle = { bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 7 };
  body.push(HEADERS.map((h) => ({ text: h, ...headStyle })));

  let sDrum = 0, sCw = 0, sCone = 0, sProdn = 0, sPpd = 0;
  let aRed = 0, aRcy = 0, aYj = 0, aEff = 0, aUt = 0, aIdx = 0, n = 0;
  let rowIdx = 0;
  shiftRows.forEach((r, i) => {
    const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;
    const cell = (text, align = 'right') => ({ text, alignment: align, fontSize: 7, fillColor: zebra });

    const drum = dec(r, 'WorkedDrum');
    const cw = dec(r, 'Coneweight');
    const cone = dec(r, 'NoOfCone');
    const prodn = dec(r, 'ProdnKgs');
    const ppd = dec(r, 'ProdnPerDrum');
    const red = dec(r, 'RedLight');
    const rcy = dec(r, 'RepeatedCycle');
    const yj = dec(r, 'YarnJoint');
    const eff = dec(r, 'ProdnEffi');
    const ut = dec(r, 'Utilisation');
    const idx = dec(r, 'Indexs');

    sDrum += drum; sCw += cw; sCone += cone; sProdn += prodn; sPpd += ppd;
    aRed += red; aRcy += rcy; aYj += yj; aEff += eff; aUt += ut; aIdx += idx; n++;

    body.push([
      cell(String(i + 1), 'center'),
      cell(str(r, 'ShortName') || str(r, 'CountName'), 'left'),
      cell(str(r, 'MixingName'), 'left'),
      cell(fmt(drum, 2)),
      cell(fmt(cw, 2)),
      cell(fmt(cone, 2)),
      cell(fmt(prodn, 2)),
      cell(fmt(ppd, 2)),
      cell(red > 0 ? fmt(red, 2) : '0.00'),
      cell(rcy > 0 ? fmt(rcy, 2) : '0.00'),
      cell(yj > 0 ? fmt(yj, 2) : '0.00'),
      cell(eff > 0 ? fmt(eff, 2) : '0.00'),
      cell(ut > 0 ? fmt(ut, 2) : '0.00'),
      cell(idx > 0 ? fmt(idx, 2) : '0.00'),
    ]);
    rowIdx++;
  });

  const gStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 7 };
  const avg = (s) => (n > 0 ? s / n : 0);
  body.push([
    { text: 'TOTAL', colSpan: 3, alignment: 'right', ...gStyle }, {}, {},
    { text: fmt(sDrum, 2), alignment: 'right', ...gStyle },
    { text: fmt(sCw, 2), alignment: 'right', ...gStyle },
    { text: fmt(sCone, 2), alignment: 'right', ...gStyle },
    { text: fmt(sProdn, 2), alignment: 'right', ...gStyle },
    { text: fmt(sPpd, 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(aRed), 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(aRcy), 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(aYj), 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(aEff), 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(aUt), 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(aIdx), 2), alignment: 'right', ...gStyle },
  ]);

  return { table: { headerRows: 1, dontBreakRows: true, keepWithHeaderRows: 0, widths: WIDTHS, body }, layout: tableLayout() };
}

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate }) {
  const groups = new Map();
  for (const r of rows) {
    const key = str(r, 'ShiftCode') || str(r, 'ShiftNo');
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
          { text: `Date : ${ddmmyyyy(head.ACCountProdnDate)}`, bold: true, fontSize: 8, fillColor: colors.subFill, color: colors.subText },
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
    valueFn: (r) => dec(r, 'ProdnKgs'), valueHeader: 'Actual Prodn',
    groupHeader: 'Count', digits: 2,
  });

  return buildPage({ companyName, companyLogo, title: TITLE, fromDate, toDate, tables: [...chart, ...tables] });
}

export const autoconerCountWiseReport = (req, res) =>
  runReport(req, res, { spName: 'sp_Prodn_AutoconerCountProdnDetails_GetAll', fileName: FILE_NAME, buildDocDefinition });
