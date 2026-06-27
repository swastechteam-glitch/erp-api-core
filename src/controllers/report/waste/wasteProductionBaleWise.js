// Waste Production — Bale Wise.
// Mirrors rptWasteProductionBaleNoWise.rdlc — one SP (sp_WasteProduction_GetAll)
// grouped by WasteProductionDate, each date sub-grouped by Waste Item listing
// every bale (Bale No, Gross/Tare/Net), an item Total, a Date Total and a final
// Grand Total. This is the VB "Detailed" report type.
//
// SP: sp_WasteProduction_GetAll (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy
} from '../cotton/_common.js';
import { applyWasteFilters } from './_wasteFilters.js';

const TITLE = 'WASTE PRODUCTION - BALE WISE';
const FILE_NAME = 'WasteProduction_BaleWise';

const headRow = (headers, fs = 8) =>
  headers.map((h) => ({
    text: h, bold: true, fillColor: colors.headerFill, color: colors.headerText,
    alignment: 'center', fontSize: fs
  }));
const td = (text, align = 'right', zebra = null, fs = 8) =>
  ({ text, alignment: align, fontSize: fs, fillColor: zebra });
const subCell = (text, align = 'right') =>
  ({ text, alignment: align, bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 8 });
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
  const headers = ['S.No', 'Bale No', 'Gross Weight', 'Tare Weight', 'Net Weight'];
  const widths = [40, '*', 120, 120, 120];
  const tables = [];

  const byDate = groupBy(rows || [], (r) => str(r, 'WasteProductionDate'));
  const dateKeys = [...byDate.keys()].sort((a, b) => new Date(a) - new Date(b));

  let gGross = 0, gTare = 0, gNet = 0, gBales = 0;

  for (const dk of dateKeys) {
    const list = byDate.get(dk);
    const body = [headRow(headers)];

    const byItem = groupBy(list, (r) => str(r, 'WasteItemName'));
    let dGross = 0, dTare = 0, dNet = 0, dBales = 0;

    for (const [itemName, items] of byItem.entries()) {
      body.push([
        { text: itemName || '-', colSpan: 5, bold: true, color: colors.groupText, fillColor: colors.groupFill, fontSize: 8 },
        {}, {}, {}, {}
      ]);
      let i = 0, iGross = 0, iTare = 0, iNet = 0;
      for (const r of items) {
        const z = zebraOf(i);
        body.push([
          td(String(i + 1), 'center', z),
          td(str(r, 'BaleNo'), 'center', z),
          td(fmt(dec(r, 'GrossWeight'), 3), 'right', z),
          td(fmt(dec(r, 'TareWeight'), 3), 'right', z),
          td(fmt(dec(r, 'NetWeight'), 3), 'right', z)
        ]);
        iGross += dec(r, 'GrossWeight'); iTare += dec(r, 'TareWeight'); iNet += dec(r, 'NetWeight'); i++;
      }
      body.push([
        { ...subCell(`Total : ${i} Bales`, 'right'), colSpan: 2 }, {},
        subCell(fmt(iGross, 3)), subCell(fmt(iTare, 3)), subCell(fmt(iNet, 3))
      ]);
      dGross += iGross; dTare += iTare; dNet += iNet; dBales += i;
    }

    body.push([
      { ...totalCell(`Date Total : ${dBales} Bales`, 'right'), colSpan: 2 }, {},
      totalCell(fmt(dGross, 3)), totalCell(fmt(dTare, 3)), totalCell(fmt(dNet, 3))
    ]);
    gGross += dGross; gTare += dTare; gNet += dNet; gBales += dBales;

    for (const n of section(ddmmyyyy(dk), widths, body)) tables.push(n);
  }

  if (!tables.length) {
    tables.push({ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] });
  } else {
    tables.push({
      margin: [0, 6, 0, 0],
      table: {
        widths,
        body: [[
          { ...totalCell(`Grand Total : ${gBales} Bales`, 'right'), colSpan: 2 }, {},
          totalCell(fmt(gGross, 3)), totalCell(fmt(gTare, 3)), totalCell(fmt(gNet, 3))
        ]]
      },
      layout: tableLayout()
    });
  }

  return buildPage({ companyName, companyLogo, title: TITLE, fromDate, toDate, tables });
}

export const wasteProductionBaleWiseReport = (req, res) => {
  return runReport(req, res, {
    spName: 'sp_WasteProduction_GetAll',
    fileName: FILE_NAME,
    buildDocDefinition
  });
};
