// Waste Production — Item Wise.
// Mirrors rptWasteProductionItemWise.rdlc — one SP
// (sp_WasteProduction_GetAll) grouped by Waste Item, each item listing its
// bale details (with date) and an item Total, plus a Grand Total at the end.
//
// SP: sp_WasteProduction_GetAll (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy
} from '../cotton/_common.js';
import { applyWasteFilters } from './_wasteFilters.js';

const TITLE = 'WASTE PRODUCTION - ITEM WISE';
const FILE_NAME = 'WasteProduction_ItemWise';

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

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate, query }) {
  rows = applyWasteFilters(rows, query);
  const headers = ['S.No', 'Date', 'Bale No', 'Gross Weight', 'Tare Weight', 'Net Weight'];
  const widths = [40, 110, '*', 110, 110, 110];
  const tables = [];

  const byItem = groupBy(rows || [], (r) => str(r, 'WasteItemName'));
  const itemKeys = [...byItem.keys()].sort((a, b) => a.localeCompare(b));

  let gGross = 0, gTare = 0, gNet = 0, gBales = 0;

  for (const itemName of itemKeys) {
    const list = byItem.get(itemName);
    list.sort((a, b) => new Date(str(a, 'WasteProductionDate')) - new Date(str(b, 'WasteProductionDate')));

    const body = [headRow(headers)];
    let i = 0, iGross = 0, iTare = 0, iNet = 0;
    for (const r of list) {
      const z = zebraOf(i);
      body.push([
        td(String(i + 1), 'center', z),
        td(ddmmyyyy(str(r, 'WasteProductionDate')), 'center', z),
        td(str(r, 'BaleNo'), 'center', z),
        td(fmt(dec(r, 'GrossWeight'), 3), 'right', z),
        td(fmt(dec(r, 'TareWeight'), 3), 'right', z),
        td(fmt(dec(r, 'NetWeight'), 3), 'right', z)
      ]);
      iGross += dec(r, 'GrossWeight'); iTare += dec(r, 'TareWeight'); iNet += dec(r, 'NetWeight'); i++;
    }
    body.push([
      { ...totalCell(`Total : ${i} Bales`, 'right'), colSpan: 3 }, {}, {},
      totalCell(fmt(iGross, 3)), totalCell(fmt(iTare, 3)), totalCell(fmt(iNet, 3))
    ]);
    gGross += iGross; gTare += iTare; gNet += iNet; gBales += i;

    for (const n of section(itemName || 'Waste Item', widths, body)) tables.push(n);
  }

  if (!tables.length) {
    tables.push({ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] });
  } else {
    tables.push({
      margin: [0, 6, 0, 0],
      table: {
        widths,
        body: [[
          { ...totalCell(`Grand Total : ${gBales} Bales`, 'right'), colSpan: 3 }, {}, {},
          totalCell(fmt(gGross, 3)), totalCell(fmt(gTare, 3)), totalCell(fmt(gNet, 3))
        ]]
      },
      layout: tableLayout()
    });
  }

  return buildPage({ companyName, companyLogo, title: TITLE, fromDate, toDate, tables });
}

export const wasteProductionItemWiseReport = (req, res) => {
  return runReport(req, res, {
    spName: 'sp_WasteProduction_GetAll',
    fileName: FILE_NAME,
    buildDocDefinition
  });
};
