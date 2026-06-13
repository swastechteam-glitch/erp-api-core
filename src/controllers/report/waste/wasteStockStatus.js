// Waste Stock With Value.
// Mirrors rptWasteStockStatus.rdlc — stock rows grouped by Waste Item Group,
// each group with a Total row, plus a Grand Total. Columns are Opening /
// Production / Sales / Closing (Bale + Weight each) and a Closing Value.
//
// SP: sp_WasteStockStatus (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt
} from '../cotton/_common.js';

const TITLE = 'WASTE STOCK WITH VALUE';
const FILE_NAME = 'WasteStock_WithValue';

// Numeric columns, in display order.
const NUM = [
  { key: 'OpQty', label: 'Op Bale', digits: 0 },
  { key: 'OpWeight', label: 'Op Weight', digits: 3 },
  { key: 'ProQty', label: 'Pro Bale', digits: 0 },
  { key: 'ProWeight', label: 'Pro Weight', digits: 3 },
  { key: 'SalQty', label: 'Sal Bale', digits: 0 },
  { key: 'SalWeight', label: 'Sal Weight', digits: 3 },
  { key: 'ClQty', label: 'Cl Bale', digits: 0 },
  { key: 'ClWeight', label: 'Cl Weight', digits: 3 },
  { key: 'ClosingValue', label: 'Value', digits: 2 }
];
const NUM_WIDTHS = [40, 56, 40, 56, 40, 56, 40, 56, 66];

const headRow = (headers) =>
  headers.map((h) => ({
    text: h, bold: true, fillColor: colors.headerFill, color: colors.headerText,
    alignment: 'center', fontSize: 8
  }));
const td = (text, align = 'right', zebra = null) =>
  ({ text, alignment: align, fontSize: 8, fillColor: zebra });
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
  const headers = ['S.No', 'Item Name', ...NUM.map((n) => n.label)];
  const widths = [28, '*', ...NUM_WIDTHS];
  const tables = [];

  const groups = groupBy(rows || [], (r) => str(r, 'WasteItemGroupName') || '(No Group)');
  const keys = [...groups.keys()].sort((a, b) => a.localeCompare(b));
  const grand = {};

  for (const key of keys) {
    const list = groups.get(key);
    list.sort((a, b) => str(a, 'WasteItemName').localeCompare(str(b, 'WasteItemName')));

    const body = [headRow(headers)];
    const sub = {};
    let i = 0;
    for (const r of list) {
      const z = zebraOf(i);
      body.push([
        td(String(i + 1), 'center', z),
        td(str(r, 'WasteItemName'), 'left', z),
        ...NUM.map((n) => {
          const v = dec(r, n.key);
          sub[n.key] = (sub[n.key] || 0) + v;
          return td(fmt(v, n.digits), 'right', z);
        })
      ]);
      i++;
    }
    body.push([
      { ...totalCell('Total', 'right'), colSpan: 2 }, {},
      ...NUM.map((n) => {
        grand[n.key] = (grand[n.key] || 0) + (sub[n.key] || 0);
        return totalCell(fmt(sub[n.key] || 0, n.digits));
      })
    ]);

    for (const node of section(key, widths, body)) tables.push(node);
  }

  if (!tables.length) {
    tables.push({ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] });
  } else {
    tables.push({
      margin: [0, 6, 0, 0],
      table: {
        widths,
        body: [[
          { ...totalCell('Grand Total', 'right'), colSpan: 2 }, {},
          ...NUM.map((n) => totalCell(fmt(grand[n.key] || 0, n.digits)))
        ]]
      },
      layout: tableLayout()
    });
  }

  return buildPage({ companyName, companyLogo, title: TITLE, fromDate, toDate, tables });
}

export const wasteStockStatusReport = (req, res) => {
  return runReport(req, res, {
    spName: 'sp_WasteStockStatus',
    fileName: FILE_NAME,
    buildDocDefinition
  });
};
