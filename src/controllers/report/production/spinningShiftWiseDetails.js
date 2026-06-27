// Spinning Shift Wise Details report.
// Mirrors rptSpinningProductionShiftWiseDetails_Arun.rdlc — like Shift Wise but
// with the extended machine-setting columns (speed / TPI / target & achieved GPS
// / target & achieved prodn / efficiency / utilisation / EB unit / SPG UKG),
// grouped per shift with a per-shift total row.
//
// SP: sp_Prodn_SpinningProdnDetails_GetAll (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy, chartFromRows
} from '../cotton/_common.js';

// 14 columns.
const WIDTHS = [34, '*', 42, 42, 40, 36, 44, 44, 46, 46, 38, 38, 40, 40];

const TITLE = 'SPINNING SHIFT WISE PRODUCTION REPORT (DETAILED)';
const FILE_NAME = 'SpinningProduction_ShiftWiseDetails';

const HEADERS = [
  'M/C No', 'Count', 'Allot Spdl', 'Wkd Spdl', 'Speed', 'TPI',
  'Tgt GPS', 'Ach GPS', 'Tgt Prdn', 'Ach Prdn', 'Eff %', 'UT %', 'Unit', 'SPG UKG'
];

function buildShiftTable(shiftRows) {
  const body = [];
  const headStyle = { bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 7 };
  body.push(HEADERS.map((h) => ({ text: h, ...headStyle })));

  let sAllot = 0, sWkd = 0, sTgtP = 0, sAchP = 0, sEff = 0, sUt = 0, sUnit = 0, sUkg = 0, n = 0;
  let rowIdx = 0;
  for (const r of shiftRows) {
    const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;
    const cell = (text, align = 'right') => ({ text, alignment: align, fontSize: 7, fillColor: zebra });

    const allot = dec(r, 'AllottedSpindle');
    const wkd = dec(r, 'WorkedSpindle');
    const speed = dec(r, 'DSpeed');
    const tpi = dec(r, 'TPI');
    const tgtGps = dec(r, 'TargetGPS');
    const achGps = dec(r, 'GmsSpl');
    const tgtP = dec(r, 'TargetProdn');
    const achP = dec(r, 'Prodn');
    const eff = dec(r, 'ProdnEffi');
    const ut = dec(r, 'Utilisation');
    const unit = dec(r, 'EBUnit');
    const ukg = dec(r, 'UKG');

    sAllot += allot; sWkd += wkd; sTgtP += tgtP; sAchP += achP;
    sEff += eff; sUt += ut; sUnit += unit; sUkg += ukg; n++;

    body.push([
      cell(str(r, 'MachineNo'), 'center'),
      cell(str(r, 'CountName') || str(r, 'ShortName'), 'left'),
      cell(fmt(allot, 0)),
      cell(fmt(wkd, 0)),
      cell(fmt(speed, 0)),
      cell(fmt(tpi, 2)),
      cell(fmt(tgtGps, 2)),
      cell(fmt(achGps, 2)),
      cell(fmt(tgtP, 2)),
      cell(fmt(achP, 2)),
      cell(fmt(eff, 2)),
      cell(fmt(ut, 2)),
      cell(fmt(unit, 0)),
      cell(fmt(ukg, 2)),
    ]);
    rowIdx++;
  }

  const gStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 7 };
  const avg = (s) => (n > 0 ? s / n : 0);
  body.push([
    { text: 'Total', colSpan: 2, alignment: 'right', ...gStyle }, {},
    { text: fmt(sAllot, 0), alignment: 'right', ...gStyle },
    { text: fmt(sWkd, 0), alignment: 'right', ...gStyle },
    { text: '', ...gStyle }, { text: '', ...gStyle }, { text: '', ...gStyle }, { text: '', ...gStyle },
    { text: fmt(sTgtP, 2), alignment: 'right', ...gStyle },
    { text: fmt(sAchP, 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(sEff), 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(sUt), 2), alignment: 'right', ...gStyle },
    { text: fmt(sUnit, 0), alignment: 'right', ...gStyle },
    { text: fmt(avg(sUkg), 2), alignment: 'right', ...gStyle },
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
          { text: `Date : ${ddmmyyyy(head.SpgProdnDate)}`, bold: true, fontSize: 8, fillColor: colors.subFill, color: colors.subText },
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

export const spinningShiftWiseDetailsReport = (req, res) =>
  runReport(req, res, { spName: 'sp_Prodn_SpinningProdnDetails_GetAll', fileName: FILE_NAME, buildDocDefinition });
