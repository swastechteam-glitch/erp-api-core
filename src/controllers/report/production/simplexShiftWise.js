// Simplex Production Shift Wise Details report.
// Mirrors 01rptSimplexProductionShiftWise.rdlc — detail rows grouped per shift,
// each shift block headed by date / shift / supervisor (SIC) / maistry (MON),
// with a per-shift total row. (17 columns — like Comber but without Sliver Break.)
//
// SP: sp_Prodn_SimplexProdnDetails_GetAll (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy, chartFromRows
} from '../cotton/_common.js';

// 17 columns.
const WIDTHS = [28, 52, 40, 40, 40, 38, 44, 44, 36, 36, 36, 40, 40, 38, 36, 44, 40];

const TITLE = 'SIMPLEX PRODUCTION - SHIFT WISE DETAILS';
const FILE_NAME = 'SimplexProduction_ShiftWise';

const HEADERS = [
  'M/C No', 'Emp ID', 'Tgt Hank', 'Act Hank', 'Wrk Min', 'Speed',
  'Tgt Prdn', 'Act Prdn', 'Stop', 'Eff %', 'UT %', 'Energy',
  'UKG', 'Crl Brk', 'DL Brk', 'Waste Kg', 'Waste %'
];

function buildShiftTable(shiftRows) {
  const body = [];

  const headStyle = {
    bold: true, fillColor: colors.headerFill, color: colors.headerText,
    alignment: 'center', fontSize: 7
  };
  body.push(HEADERS.map((h) => ({ text: h, ...headStyle })));

  let sTgtPrdn = 0, sActPrdn = 0, sStop = 0, sEff = 0, sUtil = 0;
  let sEnergy = 0, sUkg = 0, sCrl = 0, sDl = 0, sWasteKg = 0, sWastePer = 0;
  let n = 0;

  let rowIdx = 0;
  for (const r of shiftRows) {
    const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;
    const cell = (text, align = 'right') => ({
      text, alignment: align, fontSize: 7, fillColor: zebra
    });

    const tgtHank = dec(r, 'STDHank');
    const actHank = dec(r, 'Hank');
    const wrkMin = dec(r, 'ActualWorkingMins');
    const speed = dec(r, 'DSpeed');
    const tgtPrdn = dec(r, 'TargetProdn');
    const actPrdn = dec(r, 'Prodn');
    const stop = dec(r, 'Stoppage');
    const eff = dec(r, 'ProdnEffi');
    const util = dec(r, 'Utilisation');
    const energy = dec(r, 'Energy');
    const ukg = dec(r, 'UKG');
    const crl = dec(r, 'CreelBreak');
    const dl = dec(r, 'DraftBreak');
    const wasteKg = dec(r, 'WasteKgs');
    const wastePer = dec(r, 'WastePer');

    sTgtPrdn += tgtPrdn; sActPrdn += actPrdn; sStop += stop; sEff += eff; sUtil += util;
    sEnergy += energy; sUkg += ukg; sCrl += crl; sDl += dl;
    sWasteKg += wasteKg; sWastePer += wastePer;
    n++;

    body.push([
      cell(str(r, 'MachineNo'), 'center'),
      cell(str(r, 'EmployeeID'), 'center'),
      cell(fmt(tgtHank, 2)),
      cell(fmt(actHank, 2)),
      cell(fmt(wrkMin, 0)),
      cell(fmt(speed, 0)),
      cell(fmt(tgtPrdn, 2)),
      cell(fmt(actPrdn, 2)),
      cell(fmt(stop, 0)),
      cell(fmt(eff, 2)),
      cell(fmt(util, 2)),
      cell(fmt(energy, 0)),
      cell(fmt(ukg, 2)),
      cell(fmt(crl, 0)),
      cell(fmt(dl, 0)),
      cell(fmt(wasteKg, 2)),
      cell(fmt(wastePer, 2))
    ]);
    rowIdx++;
  }

  const gStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 7 };
  const avg = (sum) => (n > 0 ? sum / n : 0);
  body.push([
    { text: 'Total', colSpan: 6, alignment: 'right', ...gStyle }, {}, {}, {}, {}, {},
    { text: fmt(sTgtPrdn, 2), alignment: 'right', ...gStyle },
    { text: fmt(sActPrdn, 2), alignment: 'right', ...gStyle },
    { text: fmt(sStop, 0), alignment: 'right', ...gStyle },
    { text: fmt(avg(sEff), 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(sUtil), 2), alignment: 'right', ...gStyle },
    { text: fmt(sEnergy, 0), alignment: 'right', ...gStyle },
    { text: fmt(avg(sUkg), 2), alignment: 'right', ...gStyle },
    { text: fmt(sCrl, 0), alignment: 'right', ...gStyle },
    { text: fmt(sDl, 0), alignment: 'right', ...gStyle },
    { text: fmt(sWasteKg, 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(sWastePer), 2), alignment: 'right', ...gStyle }
  ]);

  return {
    table: { headerRows: 1, dontBreakRows: true, keepWithHeaderRows: 0, widths: WIDTHS, body },
    layout: tableLayout()
  };
}

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate }) {
  // Group by shift (ShiftCode), preserving first-seen order.
  const groups = new Map();
  for (const r of rows) {
    const key = str(r, 'ShiftCode') || str(r, 'ShiftNo');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  const tables = [];
  for (const shiftRows of groups.values()) {
    const head = shiftRows[0] || {};
    const dateTxt = ddmmyyyy(head.SpxProdnDate);
    const shiftNo = str(head, 'ShiftNo') || str(head, 'ShiftName');
    const sic = str(head, 'SupervisorName');
    const mon = str(head, 'MaistryName');

    tables.push({
      margin: [0, 8, 0, 2],
      table: {
        widths: ['auto', '*', '*', '*'],
        body: [[
          { text: `Date : ${dateTxt}`, bold: true, fontSize: 8, fillColor: colors.subFill, color: colors.subText },
          { text: `Shift - ${shiftNo}`, bold: true, fontSize: 8, fillColor: colors.subFill, color: colors.subText },
          { text: `SIC - ${sic}`, bold: true, fontSize: 8, fillColor: colors.subFill, color: colors.subText },
          { text: `MON - ${mon}`, bold: true, fontSize: 8, fillColor: colors.subFill, color: colors.subText }
        ]]
      },
      layout: 'noBorders'
    });
    tables.push(buildShiftTable(shiftRows));
  }

  const chart = chartFromRows(rows, {
    groupKey: (r) => str(r, 'ShiftCode') || str(r, 'ShiftNo'),
    groupLabel: (r) => 'Shift ' + (str(r, 'ShiftNo') || str(r, 'ShiftName')),
    valueFn: (r) => dec(r, 'Prodn'), valueHeader: 'Actual Prdn',
    groupHeader: 'Shift', digits: 2
  });

  return buildPage({
    companyName, companyLogo, title: TITLE, fromDate, toDate,
    tables: [...chart, ...tables]
  });
}

export const simplexShiftWiseReport = (req, res) => {
  return runReport(req, res, {
    spName: 'sp_Prodn_SimplexProdnDetails_GetAll',
    fileName: FILE_NAME,
    buildDocDefinition
  });
};
