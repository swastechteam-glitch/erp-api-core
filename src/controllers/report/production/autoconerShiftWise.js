// Autoconer Shift Wise Production report.
// Mirrors rptAutoconerProductionShiftWise_Arun.rdlc — grouped per shift with a
// per-shift header band (Date / Shift / SIC / MON) and a per-shift total row.
// One detail row per drum-group machine setting.
//
// SP: sp_Prodn_AutoconerProdnDetails_GetAll (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy, chartFromRows
} from '../cotton/_common.js';

// 18 columns.
const WIDTHS = [30, '*', 60, 34, 38, 60, 36, 34, 40, 34, 30, 30, 38, 34, 34, 32, 32, 32];

const TITLE = 'AUTO CONER SHIFT WISE PRODUCTION REPORT';
const FILE_NAME = 'AutoconerProduction_ShiftWise';

const HEADERS = [
  'M/C No', 'Count', 'Mixing', 'Speed', 'Wkg Min', 'No.Of Drum', 'Run Drum',
  'Idle Drum', 'ACT Prodn', 'Red Light', 'RCY', 'YJ', 'Waste Kgs', 'Waste %',
  'Stop Time', 'Eff %', 'UT %', 'Index'
];

function buildShiftTable(shiftRows) {
  const body = [];
  const headStyle = { bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 6 };
  body.push(HEADERS.map((h) => ({ text: h, ...headStyle })));

  let sRun = 0, sIdle = 0, sProdn = 0, sWaste = 0, sStop = 0;
  let aRed = 0, aRcy = 0, aYj = 0, aWp = 0, aEff = 0, aUt = 0, n = 0;
  let rowIdx = 0;
  for (const r of shiftRows) {
    const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;
    const cell = (text, align = 'right') => ({ text, alignment: align, fontSize: 6, fillColor: zebra });

    const run = dec(r, 'WorkedDrum');
    const idle = dec(r, 'IdleDrum');
    const prodn = dec(r, 'ProdnKgs');
    const red = dec(r, 'RedLight');
    const rcy = dec(r, 'RepeatedCycle');
    const yj = dec(r, 'YarnJoint');
    const waste = dec(r, 'WasteKgs');
    const wp = dec(r, 'WastePer');
    const stop = dec(r, 'Stoppage');
    const eff = dec(r, 'ProdnEffi');
    const ut = dec(r, 'Utilisation');

    sRun += run; sIdle += idle; sProdn += prodn; sWaste += waste; sStop += stop;
    aRed += red; aRcy += rcy; aYj += yj; aWp += wp; aEff += eff; aUt += ut; n++;

    const drumRange = `${str(r, 'DrumNoFrom')} - ${str(r, 'DrumNoTo')}`;
    body.push([
      cell(str(r, 'MachineNo'), 'center'),
      cell(str(r, 'ShortName') || str(r, 'CountName'), 'left'),
      cell(str(r, 'MixingName'), 'left'),
      cell(fmt(dec(r, 'DSpeed'), 0)),
      cell(fmt(dec(r, 'ActualWorkingMins'), 0)),
      cell(drumRange, 'center'),
      cell(fmt(run, 0)),
      cell(fmt(idle, 0)),
      cell(fmt(prodn, 2)),
      cell(red > 0 ? fmt(red, 2) : '0.00'),
      cell(rcy > 0 ? fmt(rcy, 2) : '0.00'),
      cell(yj > 0 ? fmt(yj, 2) : '0.00'),
      cell(fmt(waste, 2)),
      cell(wp > 0 ? fmt(wp, 2) : '0.00'),
      cell(fmt(stop, 2)),
      cell(eff > 0 ? fmt(eff, 2) : '0.00'),
      cell(fmt(ut, 2)),
      cell(fmt(dec(r, 'Indexs'), 2)),
    ]);
    rowIdx++;
  }

  const gStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 6 };
  const avg = (s) => (n > 0 ? s / n : 0);
  body.push([
    { text: 'TOTAL', colSpan: 6, alignment: 'right', ...gStyle }, {}, {}, {}, {}, {},
    { text: fmt(sRun, 0), alignment: 'right', ...gStyle },
    { text: fmt(sIdle, 0), alignment: 'right', ...gStyle },
    { text: fmt(sProdn, 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(aRed), 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(aRcy), 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(aYj), 2), alignment: 'right', ...gStyle },
    { text: fmt(sWaste, 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(aWp), 2), alignment: 'right', ...gStyle },
    { text: fmt(sStop, 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(aEff), 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(aUt), 2), alignment: 'right', ...gStyle },
    { text: '', ...gStyle },
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
          { text: `Date : ${ddmmyyyy(head.ACProdnDate)}`, bold: true, fontSize: 8, fillColor: colors.subFill, color: colors.subText },
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
    groupKey: (r) => str(r, 'ShiftCode') || str(r, 'ShiftNo'),
    groupLabel: (r) => 'Shift ' + (str(r, 'ShiftNo') || str(r, 'ShiftName')),
    valueFn: (r) => dec(r, 'ProdnKgs'), valueHeader: 'Actual Prodn',
    groupHeader: 'Shift', digits: 2,
  });

  return buildPage({ companyName, companyLogo, title: TITLE, fromDate, toDate, tables: [...chart, ...tables] });
}

export const autoconerShiftWiseReport = (req, res) =>
  runReport(req, res, { spName: 'sp_Prodn_AutoconerProdnDetails_GetAll', fileName: FILE_NAME, buildDocDefinition });
