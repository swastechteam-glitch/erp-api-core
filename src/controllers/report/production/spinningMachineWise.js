// Spinning Machine Wise Production report.
// Mirrors 03rptSpinningProductionMachineWise.rdlc — one row per machine with
// spindle / production / efficiency / waste / run-time aggregates.
//
// SP: sp_Prodn_SpinningProdnDetails_GetAll (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, chartFromRows
} from '../cotton/_common.js';

// 10 columns
const WIDTHS = ['*', 60, 60, 48, 60, 60, 48, 56, 48, 56];

const TITLE = 'SPINNING MACHINE WISE PRODUCTION';
const FILE_NAME = 'SpinningProduction_MachineWise';

const HEADERS = [
  'M/C Name', 'Allot Spdl', 'Wkd Spdl', 'Util %', 'Tgt Prdn',
  'Act Prdn', 'Eff %', 'Waste Kg', 'Waste %', 'Run Time'
];

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate }) {
  const body = [];

  const headStyle = {
    bold: true, fillColor: colors.headerFill, color: colors.headerText,
    alignment: 'center', fontSize: 8
  };
  body.push(HEADERS.map((h) => ({ text: h, ...headStyle })));

  // Group by machine.
  const groups = new Map();
  for (const r of rows) {
    const key = str(r, 'MachineCode') || str(r, 'MachineName');
    const g = groups.get(key) || {
      name: str(r, 'MachineName') || str(r, 'MachineNo'),
      sortNo: dec(r, 'MachineSortOrderNo'),
      allot: 0, wkd: 0, utSum: 0, tgt: 0, prodn: 0, effSum: 0,
      wasteKg: 0, wastePerSum: 0, runMins: 0, n: 0
    };
    g.allot += dec(r, 'AllottedSpindle');
    g.wkd += dec(r, 'WorkedSpindle');
    g.utSum += dec(r, 'Utilisation');
    g.tgt += dec(r, 'TargetProdn');
    g.prodn += dec(r, 'Prodn');
    g.effSum += dec(r, 'ProdnEffi');
    g.wasteKg += dec(r, 'WasteKgs');
    g.wastePerSum += dec(r, 'WastePer');
    g.runMins += dec(r, 'ActualWorkingMins');
    g.n += 1;
    groups.set(key, g);
  }

  const list = [...groups.values()].sort((a, b) =>
    (a.sortNo - b.sortNo) || a.name.localeCompare(b.name));

  let sAllot = 0, sWkd = 0, sUt = 0, sTgt = 0, sProdn = 0, sEff = 0;
  let sWasteKg = 0, sWastePer = 0, sRun = 0, nGroups = 0;

  let rowIdx = 0;
  for (const g of list) {
    const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;
    const cell = (text, align = 'right') => ({ text, alignment: align, fontSize: 7, fillColor: zebra });
    const avg = (sum) => (g.n > 0 ? sum / g.n : 0);

    sAllot += g.allot; sWkd += g.wkd; sUt += avg(g.utSum); sTgt += g.tgt;
    sProdn += g.prodn; sEff += avg(g.effSum); sWasteKg += g.wasteKg;
    sWastePer += avg(g.wastePerSum); sRun += g.runMins; nGroups++;

    body.push([
      cell(g.name, 'left'),
      cell(fmt(g.allot, 0)),
      cell(fmt(g.wkd, 0)),
      cell(fmt(avg(g.utSum), 2)),
      cell(fmt(g.tgt, 2)),
      cell(fmt(g.prodn, 2)),
      cell(fmt(avg(g.effSum), 2)),
      cell(fmt(g.wasteKg, 2)),
      cell(fmt(avg(g.wastePerSum), 2)),
      cell(fmt(g.runMins, 2))
    ]);
    rowIdx++;
  }

  const gStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 8 };
  const gAvg = (sum) => (nGroups > 0 ? sum / nGroups : 0);
  body.push([
    { text: 'Total', alignment: 'right', ...gStyle },
    { text: fmt(sAllot, 0), alignment: 'right', ...gStyle },
    { text: fmt(sWkd, 0), alignment: 'right', ...gStyle },
    { text: fmt(gAvg(sUt), 2), alignment: 'right', ...gStyle },
    { text: fmt(sTgt, 2), alignment: 'right', ...gStyle },
    { text: fmt(sProdn, 2), alignment: 'right', ...gStyle },
    { text: fmt(gAvg(sEff), 2), alignment: 'right', ...gStyle },
    { text: fmt(sWasteKg, 2), alignment: 'right', ...gStyle },
    { text: fmt(gAvg(sWastePer), 2), alignment: 'right', ...gStyle },
    { text: fmt(sRun, 2), alignment: 'right', ...gStyle }
  ]);

  const chart = chartFromRows(rows, {
    groupKey: (r) => str(r, 'MachineCode') || str(r, 'MachineName'),
    groupLabel: (r) => str(r, 'MachineName') || str(r, 'MachineNo'),
    valueFn: (r) => dec(r, 'Prodn'), valueHeader: 'Actual Prdn',
    groupHeader: 'Machine', digits: 2
  });

  return buildPage({
    companyName, companyLogo, title: TITLE, fromDate, toDate,
    tables: [...chart, {
      table: { headerRows: 1, dontBreakRows: true, keepWithHeaderRows: 0, widths: WIDTHS, body },
      layout: tableLayout()
    }]
  });
}

export const spinningMachineWiseReport = (req, res) => {
  return runReport(req, res, {
    spName: 'sp_Prodn_SpinningProdnDetails_GetAll',
    fileName: FILE_NAME,
    buildDocDefinition
  });
};
