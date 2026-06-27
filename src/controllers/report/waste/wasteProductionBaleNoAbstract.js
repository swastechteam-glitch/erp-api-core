// Waste Production — Bale No Abstract.
// Mirrors rptWasteProductionAbstractNew.rdlc — one SP
// (sp_WasteProduction_Abstract) grouped by Waste Item, listing the bale-number
// strings for that item with a per-item bale Total and a Grand Total.
// This is the VB "BaleNoAbstract" report type (which only honours the Item
// filter — its SP has no Supervisor/Employee columns).
//
// SP: sp_WasteProduction_Abstract (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, tableLayout, colors,
  dec, str
} from '../cotton/_common.js';
import { applyWasteFilters } from './_wasteFilters.js';

const TITLE = 'WASTE PRODUCTION - BALE NO ABSTRACT';
const FILE_NAME = 'WasteProduction_BaleNoAbstract';

const headRow = (headers, fs = 8) =>
  headers.map((h) => ({
    text: h, bold: true, fillColor: colors.headerFill, color: colors.headerText,
    alignment: 'center', fontSize: fs
  }));
const td = (text, align = 'left', zebra = null, fs = 8) =>
  ({ text, alignment: align, fontSize: fs, fillColor: zebra });
const totalCell = (text, align = 'right') =>
  ({ text, alignment: align, bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 8 });
const zebraOf = (i) => (i % 2 === 1 ? colors.zebraFill : null);

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
  const headers = ['S.No', 'Bale No(s)', 'Bale Count'];
  const widths = [40, '*', 110];

  const body = [headRow(headers)];
  const byItem = groupBy(rows || [], (r) => str(r, 'WasteItemCode'));

  // Order item groups by their display name.
  const itemKeys = [...byItem.keys()].sort((a, b) => {
    const an = str(byItem.get(a)[0], 'WasteItemName') || str(byItem.get(a)[0], 'WasteItem');
    const bn = str(byItem.get(b)[0], 'WasteItemName') || str(byItem.get(b)[0], 'WasteItem');
    return an.localeCompare(bn);
  });

  let grandCount = 0;

  for (const ik of itemKeys) {
    const list = byItem.get(ik);
    const itemName = str(list[0], 'WasteItemName') || str(list[0], 'WasteItem') || '-';
    // Waste Item header row spanning all columns.
    body.push([
      { text: itemName, colSpan: 3, bold: true, color: colors.groupText, fillColor: colors.groupFill, fontSize: 8 },
      {}, {}
    ]);
    let i = 0, itemCount = 0;
    for (const r of list) {
      const z = zebraOf(i);
      const cnt = dec(r, 'BaleCount');
      body.push([
        td(String(i + 1), 'center', z),
        td(str(r, 'BaleNo'), 'left', z),
        td(String(cnt), 'right', z)
      ]);
      itemCount += cnt; i++;
    }
    body.push([
      { ...totalCell('Total :', 'right'), colSpan: 2 }, {},
      totalCell(String(itemCount))
    ]);
    grandCount += itemCount;
  }

  const tables = [];
  if (body.length <= 1) {
    tables.push({ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] });
  } else {
    body.push([
      { text: 'GRAND TOTAL :', colSpan: 2, alignment: 'right', bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 },
      {},
      { text: String(grandCount), alignment: 'right', bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 }
    ]);
    tables.push({
      table: { headerRows: 1, dontBreakRows: false, keepWithHeaderRows: 1, widths, body },
      layout: tableLayout()
    });
  }

  return buildPage({ companyName, companyLogo, title: TITLE, fromDate, toDate, tables });
}

export const wasteProductionBaleNoAbstractReport = (req, res) => {
  return runReport(req, res, {
    spName: 'sp_WasteProduction_Abstract',
    fileName: FILE_NAME,
    buildDocDefinition
  });
};
