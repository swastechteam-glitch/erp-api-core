// Waste Production — Item Wise Abstract (matrix / pivot).
// Mirrors rptWasteProductionItemAbstract.rdlc — one SP (sp_WasteProduction_GetAll)
// pivoted as a matrix: rows = WasteProductionDate, columns = Waste Item
// (ordered by OrderNo), each cell showing Bags (= bale count) and Weight
// (= Sum of GrossWeight). A per-date row Total and a column Total row close it.
//
// SP: sp_WasteProduction_GetAll (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy
} from '../cotton/_common.js';
import { applyWasteFilters } from './_wasteFilters.js';

const TITLE = 'WASTE PRODUCTION - ITEM WISE ABSTRACT';
const FILE_NAME = 'WasteProduction_ItemAbstract';

const hdr = (text, opts = {}) =>
  ({ text, bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 7.5, ...opts });
const cell = (text, align = 'right', zebra = null) =>
  ({ text, alignment: align, fontSize: 7.5, fillColor: zebra });
const totalCell = (text, align = 'right') =>
  ({ text, alignment: align, bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 7.5 });

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate, query }) {
  rows = applyWasteFilters(rows, query);
  const list = rows || [];

  // ---- distinct Waste Item columns, ordered by OrderNo then name ----
  const itemMap = new Map(); // shortName -> { name, order }
  for (const r of list) {
    const key = str(r, 'ShortName') || str(r, 'WasteItemName');
    if (!itemMap.has(key)) {
      itemMap.set(key, {
        name: str(r, 'ShortName') || str(r, 'WasteItemName') || '-',
        order: dec(r, 'OrderNo'),
      });
    }
  }
  const items = [...itemMap.entries()]
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name));

  // ---- distinct dates (rows), ascending ----
  const dateSet = new Map(); // dateKey -> Date
  for (const r of list) {
    const k = str(r, 'WasteProductionDate');
    if (!dateSet.has(k)) dateSet.set(k, new Date(k));
  }
  const dateKeys = [...dateSet.keys()].sort((a, b) => new Date(a) - new Date(b));

  // ---- accumulate cells[date][item] = { bags, weight } ----
  const acc = new Map(); // dateKey -> Map(itemKey -> {bags, weight})
  for (const r of list) {
    const dk = str(r, 'WasteProductionDate');
    const ik = str(r, 'ShortName') || str(r, 'WasteItemName');
    if (!acc.has(dk)) acc.set(dk, new Map());
    const row = acc.get(dk);
    if (!row.has(ik)) row.set(ik, { bags: 0, weight: 0 });
    const c = row.get(ik);
    c.bags += 1;
    c.weight += dec(r, 'GrossWeight');
  }

  const tables = [];
  if (items.length === 0 || dateKeys.length === 0) {
    tables.push({ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] });
    return buildPage({ companyName, companyLogo, title: TITLE, fromDate, toDate, tables });
  }

  // ---- header (2 rows): Date | <item> (Bags|Weight)… | Total (Bags|Weight) ----
  const headerRow1 = [hdr('Date', { rowSpan: 2, alignment: 'center' })];
  const headerRow2 = [{}];
  for (const it of items) {
    headerRow1.push(hdr(it.name, { colSpan: 2 }), {});
    headerRow2.push(hdr('Bags'), hdr('Weight'));
  }
  headerRow1.push(hdr('Total', { colSpan: 2 }), {});
  headerRow2.push(hdr('Bags'), hdr('Weight'));

  const widths = [60, ...items.flatMap(() => [34, 50]), 34, 50];

  const body = [headerRow1, headerRow2];

  // column totals
  const colTot = new Map(items.map((it) => [it.key, { bags: 0, weight: 0 }]));
  let grandBags = 0, grandWeight = 0;

  dateKeys.forEach((dk, ri) => {
    const z = ri % 2 === 1 ? colors.zebraFill : null;
    const row = [cell(ddmmyyyy(dk), 'center', z)];
    const dayMap = acc.get(dk) || new Map();
    let rBags = 0, rWeight = 0;
    for (const it of items) {
      const c = dayMap.get(it.key) || { bags: 0, weight: 0 };
      row.push(cell(c.bags ? String(c.bags) : '-', 'right', z));
      row.push(cell(c.weight ? fmt(c.weight, 3) : '-', 'right', z));
      const t = colTot.get(it.key); t.bags += c.bags; t.weight += c.weight;
      rBags += c.bags; rWeight += c.weight;
    }
    row.push(cell(String(rBags), 'right', z));
    row.push(cell(fmt(rWeight, 3), 'right', z));
    grandBags += rBags; grandWeight += rWeight;
    body.push(row);
  });

  // total row
  const totRow = [totalCell('Total', 'center')];
  for (const it of items) {
    const t = colTot.get(it.key);
    totRow.push(totalCell(String(t.bags)));
    totRow.push(totalCell(fmt(t.weight, 3)));
  }
  totRow.push(totalCell(String(grandBags)));
  totRow.push(totalCell(fmt(grandWeight, 3)));
  body.push(totRow);

  tables.push({
    table: { headerRows: 2, dontBreakRows: false, keepWithHeaderRows: 2, widths, body },
    layout: tableLayout()
  });

  return buildPage({ companyName, companyLogo, title: TITLE, fromDate, toDate, tables });
}

export const wasteProductionItemAbstractReport = (req, res) => {
  return runReport(req, res, {
    spName: 'sp_WasteProduction_GetAll',
    fileName: FILE_NAME,
    buildDocDefinition
  });
};
