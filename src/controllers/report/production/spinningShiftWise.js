// Spinning Shift Wise Production report.
// Mirrors 01rptSpinningProductionShiftWise.rdlc — detail rows grouped per shift,
// each shift block headed by date / shift / supervisor (SIC) / maistry (MON),
// with a per-shift total row.
//
// SP: sp_Prodn_SpinningProdnDetails_GetAll (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy, chartFromRows
} from '../cotton/_common.js';

// 11 columns.
const WIDTHS = [40, 56, 52, 56, 48, 52, 44, 44, 44, 44, 52];

const TITLE = 'SPINNING SHIFT WISE PRODUCTION REPORT';
const FILE_NAME = 'SpinningProduction_ShiftWise';

const HEADERS = [
  'M/C No', 'Count', 'Wkd Spdl', 'Act Prdn', 'GPSS', 'Waste Kg',
  'Waste %', 'Eff %', 'UT %', 'MPI', 'Att Time'
];

function buildShiftTable(shiftRows) {
  const body = [];

  const headStyle = {
    bold: true, fillColor: colors.headerFill, color: colors.headerText,
    alignment: 'center', fontSize: 7
  };
  body.push(HEADERS.map((h) => ({ text: h, ...headStyle })));

  let sWkd = 0, sProdn = 0, sGps = 0, sWasteKg = 0, sWastePer = 0;
  let sEff = 0, sUt = 0, sMpi = 0, sAtt = 0, n = 0;

  let rowIdx = 0;
  for (const r of shiftRows) {
    const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;
    const cell = (text, align = 'right') => ({
      text, alignment: align, fontSize: 7, fillColor: zebra
    });

    const wkd = dec(r, 'WorkedSpindle');
    const prodn = dec(r, 'Prodn');
    const gps = dec(r, 'GmsSpl');
    const wasteKg = dec(r, 'WasteKgs');
    const wastePer = dec(r, 'WastePer');
    const eff = dec(r, 'ProdnEffi');
    const ut = dec(r, 'Utilisation');
    const mpi = dec(r, 'MPI');
    const att = dec(r, 'ActualWorkingMins');

    sWkd += wkd; sProdn += prodn; sGps += gps; sWasteKg += wasteKg;
    sWastePer += wastePer; sEff += eff; sUt += ut; sMpi += mpi; sAtt += att;
    n++;

    body.push([
      cell(str(r, 'MachineNo'), 'center'),
      cell(str(r, 'CountName'), 'left'),
      cell(fmt(wkd, 0)),
      cell(fmt(prodn, 2)),
      cell(fmt(gps, 2)),
      cell(fmt(wasteKg, 2)),
      cell(fmt(wastePer, 2)),
      cell(fmt(eff, 2)),
      cell(fmt(ut, 2)),
      cell(fmt(mpi, 2)),
      cell(fmt(att, 2))
    ]);
    rowIdx++;
  }

  const gStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 7 };
  const avg = (sum) => (n > 0 ? sum / n : 0);
  body.push([
    { text: 'Total', colSpan: 2, alignment: 'right', ...gStyle }, {},
    { text: fmt(sWkd, 0), alignment: 'right', ...gStyle },
    { text: fmt(sProdn, 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(sGps), 2), alignment: 'right', ...gStyle },
    { text: fmt(sWasteKg, 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(sWastePer), 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(sEff), 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(sUt), 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(sMpi), 2), alignment: 'right', ...gStyle },
    { text: fmt(sAtt, 2), alignment: 'right', ...gStyle }
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
    const dateTxt = ddmmyyyy(head.SpgProdnDate);
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

export const spinningShiftWiseReport = (req, res) => {
  return runReport(req, res, {
    spName: 'sp_Prodn_SpinningProdnDetails_GetAll',
    fileName: FILE_NAME,
    buildDocDefinition
  });
};
