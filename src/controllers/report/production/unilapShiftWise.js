// Uni Lap Production Shift Wise report.
// Mirrors rptUnilapProductionShiftWise_Arun.rdlc — detail rows grouped per
// shift, each shift block headed by Date / Shift / SIC / MON, per-shift totals.
//
// SP: sp_Prodn_UnilapProdnDetails_GetAll (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy, chartFromRows
} from '../cotton/_common.js';

const WIDTHS = [38, '*', 56, 54, 56, 56, 54, 46, 46, 46];

const TITLE = 'UNILAP PRODUCTION - SHIFT WISE';
const FILE_NAME = 'UnilapProduction_ShiftWise';

const HEADERS = ['M/C No', 'Mixing', 'Working Mins', 'Speed (MPM)', 'STD Prodn', 'ACT Prodn', 'Stop Time', 'Eff %', 'UT %', 'Index'];

function buildShiftTable(shiftRows) {
  const body = [];
  const headStyle = { bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 8 };
  body.push(HEADERS.map((h) => ({ text: h, ...headStyle })));

  let sTgt = 0, sAct = 0, sStop = 0, sEff = 0, sUtil = 0, n = 0;
  let rowIdx = 0;
  for (const r of shiftRows) {
    const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;
    const cell = (text, align = 'right') => ({ text, alignment: align, fontSize: 8, fillColor: zebra });

    const wrkMin = dec(r, 'ActualWorkingMins');
    const speed = dec(r, 'DSpeed');
    const tgt = dec(r, 'TargetProdn');
    const act = dec(r, 'Prodn');
    const stop = dec(r, 'Stoppage');
    const eff = dec(r, 'ProdnEffi');
    const util = dec(r, 'Utilisation');
    const idx = dec(r, 'Indexs');

    sTgt += tgt; sAct += act; sStop += stop; sEff += eff; sUtil += util; n++;

    body.push([
      cell(str(r, 'MachineNo'), 'center'),
      cell(str(r, 'MixingName'), 'left'),
      cell(fmt(wrkMin, 0)),
      cell(fmt(speed, 0)),
      cell(fmt(tgt, 2)),
      cell(fmt(act, 2)),
      cell(fmt(stop, 2)),
      cell(eff > 0 ? fmt(eff, 2) : '0.00'),
      cell(fmt(util, 2)),
      cell(fmt(idx, 2)),
    ]);
    rowIdx++;
  }

  const gStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 8 };
  const avg = (s) => (n > 0 ? s / n : 0);
  body.push([
    { text: 'Total', colSpan: 4, alignment: 'right', ...gStyle }, {}, {}, {},
    { text: fmt(sTgt, 2), alignment: 'right', ...gStyle },
    { text: fmt(sAct, 2), alignment: 'right', ...gStyle },
    { text: fmt(sStop, 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(sEff), 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(sUtil), 2), alignment: 'right', ...gStyle },
    { text: fmt((avg(sEff) + avg(sUtil)) / 2, 2), alignment: 'right', ...gStyle },
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
          { text: `Date : ${ddmmyyyy(head.UNIProdnDate)}`, bold: true, fontSize: 8, fillColor: colors.subFill, color: colors.subText },
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
    valueFn: (r) => dec(r, 'Prodn'), valueHeader: 'Actual Prdn',
    groupHeader: 'Shift', digits: 2,
  });

  return buildPage({ companyName, companyLogo, title: TITLE, fromDate, toDate, tables: [...chart, ...tables] });
}

export const unilapShiftWiseReport = (req, res) =>
  runReport(req, res, { spName: 'sp_Prodn_UnilapProdnDetails_GetAll', fileName: FILE_NAME, buildDocDefinition });
