// Shared builder for the Waste Invoice (Waste Sales) reports.
// Both rptWasteInvoiceDateWise.rdlc and rptWasteInvoiceCustomerWise.rdlc are
// driven by the same SP (sp_WasteInvoiceDetails_GetAll) which returns
// item-level rows. We collapse those to one line per invoice, then group by
// either Date or Customer. Per-invoice amount columns (Basic/CGST/SGST/IGST)
// are summed across the invoice's item rows; weights/qty/net are invoice-level
// (same on every row) so we take the first.

import {
  buildPage, tableLayout, colors, dec, str, fmt, ddmmyyyy
} from '../cotton/_common.js';

export function groupBy(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}

// Collapse item-level rows -> one object per WasteInvoiceCode.
export function aggregateInvoices(rows) {
  const byInv = groupBy(rows, (r) => str(r, 'WasteInvoiceCode'));
  const out = [];
  for (const [, list] of byInv.entries()) {
    const f = list[0];
    const sum = (col) => list.reduce((s, r) => s + dec(r, col), 0);
    out.push({
      WasteInvoiceDate: f.WasteInvoiceDate,
      InvoiceNo: str(f, 'WasteInvoiceNostr') || str(f, 'WasteInvoiceNo'),
      InvoiceNoNum: dec(f, 'WasteInvoiceNo'),
      CustomerCode: dec(f, 'CustomerCode'),
      CustomerName: str(f, 'CustomerName'),
      AgentCode: dec(f, 'AgentCode'),
      AgentName: str(f, 'AgentName'),
      Qty: dec(f, 'TotalQty'),
      FirstWeight: dec(f, 'TotalFirstWeight'),
      SecondWeight: dec(f, 'TotalSecondWeight'),
      WBWeight: dec(f, 'TotalWeighBridgeWt'),
      BillingWeight: dec(f, 'TotalSalesWeight'),
      Basic: sum('Amount'),
      CGST: sum('CGST'),
      SGST: sum('SGST'),
      IGST: sum('IGST'),
      TCS: dec(f, 'TCSAmount'),
      RoundOff: dec(f, 'RoundedOff'),
      NetAmount: dec(f, 'NetAmount'),
      // raw item-level rows of this invoice (used by the "Detailed" reports).
      _items: list
    });
  }
  return out;
}

// Numeric columns, in display order.
const NUM = [
  { key: 'Qty', label: 'Qty', digits: 0 },
  { key: 'FirstWeight', label: 'First Wt', digits: 3 },
  { key: 'SecondWeight', label: 'Second Wt', digits: 3 },
  { key: 'WBWeight', label: 'W.B Wt', digits: 3 },
  { key: 'BillingWeight', label: 'Billing Wt', digits: 3 },
  { key: 'Basic', label: 'Basic Value', digits: 2 },
  { key: 'CGST', label: 'CGST', digits: 2 },
  { key: 'SGST', label: 'SGST', digits: 2 },
  { key: 'IGST', label: 'IGST', digits: 2 },
  { key: 'TCS', label: 'TCS', digits: 2 },
  { key: 'RoundOff', label: 'R/Off', digits: 2 },
  { key: 'NetAmount', label: 'Net Amount', digits: 2 }
];
const NUM_WIDTHS = [26, 42, 42, 42, 42, 48, 40, 40, 40, 38, 34, 50];

const headRow = (headers) =>
  headers.map((h) => ({
    text: h, bold: true, fillColor: colors.headerFill, color: colors.headerText,
    alignment: 'center', fontSize: 7
  }));
const td = (text, align = 'right', zebra = null) =>
  ({ text, alignment: align, fontSize: 7, fillColor: zebra });
const subCell = (text, align = 'right') =>
  ({ text, alignment: align, bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 7 });
const totalCell = (text, align = 'right') =>
  ({ text, alignment: align, bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 7 });
const zebraOf = (i) => (i % 2 === 1 ? colors.zebraFill : null);

function section(title, widths, body) {
  return [
    { text: title, bold: true, fontSize: 9, color: colors.subText, fillColor: colors.subFill, margin: [0, 8, 0, 2] },
    { table: { headerRows: 1, dontBreakRows: false, keepWithHeaderRows: 1, widths, body }, layout: tableLayout() }
  ];
}

// leadCol: { label, value(inv), align? } — the third column (Customer or Date).
// groupKey(inv) -> grouping key; groupTitle(inv) -> section heading; sortKeys(a,b).
export function buildInvoiceDoc({
  rows, companyName, companyLogo, fromDate, toDate,
  title, groupKey, groupTitle, sortKeys, leadCol
}) {
  const invoices = aggregateInvoices(rows || []);
  const headers = ['S.No', 'Invoice No', leadCol.label, ...NUM.map((n) => n.label)];
  const widths = [24, 46, '*', ...NUM_WIDTHS];
  const tables = [];

  const groups = groupBy(invoices, groupKey);
  const keys = [...groups.keys()].sort(sortKeys);
  const grand = {};

  for (const key of keys) {
    const list = groups.get(key);
    const body = [headRow(headers)];
    const sub = {};
    let i = 0;
    for (const inv of list) {
      const z = zebraOf(i);
      body.push([
        td(String(i + 1), 'center', z),
        td(inv.InvoiceNo, 'center', z),
        td(leadCol.value(inv), leadCol.align || 'left', z),
        ...NUM.map((n) => {
          sub[n.key] = (sub[n.key] || 0) + inv[n.key];
          return td(fmt(inv[n.key], n.digits), 'right', z);
        })
      ]);
      i++;
    }
    body.push([
      { ...subCell('Total', 'right'), colSpan: 3 }, {}, {},
      ...NUM.map((n) => {
        grand[n.key] = (grand[n.key] || 0) + (sub[n.key] || 0);
        return subCell(fmt(sub[n.key] || 0, n.digits));
      })
    ]);
    for (const node of section(groupTitle(list[0]), widths, body)) tables.push(node);
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
          ...NUM.map((n) => totalCell(fmt(grand[n.key] || 0, n.digits)))
        ]]
      },
      layout: tableLayout()
    });
  }

  return buildPage({ companyName, companyLogo, title, fromDate, toDate, tables });
}

export { ddmmyyyy };
