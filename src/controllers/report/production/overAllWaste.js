// Production Waste OverAll — Production Waste Abstract.
// Mirrors 04rptWasteOverAll.rdlc — one SP (sp_Production_OverAll_Waste_Abstract)
// grouped by GroupName, each group with a Total row, plus a Grand Total.
//
// SP: sp_Production_OverAll_Waste_Abstract (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, chartFromRows
} from '../cotton/_common.js';

const TITLE = 'PRODUCTION WASTE OVERALL REPORT';
const FILE_NAME = 'ProductionOverAll_Waste';

const headRow = (headers, fs = 8) =>
  headers.map((h) => ({
    text: h, bold: true, fillColor: colors.headerFill, color: colors.headerText,
    alignment: 'center', fontSize: fs
  }));
const td = (text, align = 'right', zebra = null, fs = 8) =>
  ({ text, alignment: align, fontSize: fs, fillColor: zebra });
const totalCell = (text, align = 'right') =>
  ({ text, alignment: align, bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 8 });
const zebraOf = (i) => (i % 2 === 1 ? colors.zebraFill : null);

function section(title, widths, body) {
  return [
    { text: title, bold: true, fontSize: 9, color: colors.subText, fillColor: colors.subFill, margin: [0, 8, 0, 2] },
    { table: { headerRows: 1, dontBreakRows: false, keepWithHeaderRows: 1, widths, body }, layout: tableLayout() }
  ];
}

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate }) {
  const headers = ['S.No', 'Department', 'Production', 'Waste KGS', 'Waste %'];
  const widths = [40, '*', 100, 100, 80];
  const tables = [];

  const groups = groupBy(rows || [], (r) => str(r, 'GroupName'));
  let gKg = 0, gPer = 0;

  for (const [gname, list] of groups.entries()) {
    list.sort((a, b) => dec(a, 'OrderNo') - dec(b, 'OrderNo'));
    const body = [headRow(headers)];
    let i = 0, sKg = 0, sPer = 0;
    for (const r of list) {
      const z = zebraOf(i);
      body.push([
        td(String(i + 1), 'center', z),
        td(str(r, 'DepartmentName'), 'left', z),
        td(fmt(dec(r, 'PrdnKgs'), 2), 'right', z),
        td(fmt(dec(r, 'WasteKgs'), 2), 'right', z),
        td(fmt(dec(r, 'WastePer'), 2), 'right', z)
      ]);
      sKg += dec(r, 'WasteKgs'); sPer += dec(r, 'WastePer'); i++;
    }
    gKg += sKg; gPer += sPer;
    body.push([
      { ...totalCell('Total', 'right'), colSpan: 3 }, {}, {},
      totalCell(fmt(sKg, 2)), totalCell(fmt(sPer, 2))
    ]);
    for (const n of section(gname || 'Waste', widths, body)) tables.push(n);
  }

  if (!tables.length) {
    tables.push({ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] });
  } else {
    tables.push({
      margin: [0, 6, 0, 0],
      table: {
        widths,
        body: [[
          { ...totalCell('Grand Total', 'right'), colSpan: 3 }, {}, {},
          totalCell(fmt(gKg, 2)), totalCell(fmt(gPer, 2))
        ]]
      },
      layout: tableLayout()
    });
  }

  const chart = chartFromRows(rows, {
    groupKey: (r) => str(r, 'DepartmentName') || str(r, 'GroupName'),
    groupLabel: (r) => str(r, 'DepartmentName') || str(r, 'GroupName'),
    valueFn: (r) => dec(r, 'WasteKgs'), valueHeader: 'Waste KGS',
    groupHeader: 'Department', digits: 2
  });

  return buildPage({ companyName, companyLogo, title: TITLE, fromDate, toDate, tables: [...chart, ...tables] });
}

export const overAllWasteReport = (req, res) => {
  return runReport(req, res, {
    spName: 'sp_Production_OverAll_Waste_Abstract',
    fileName: FILE_NAME,
    buildDocDefinition
  });
};
