// Waste Invoice (Waste Sales) Report — unified, port of the WinForms
// rptWasteInvoiceAgentWise screen. One SP (sp_WasteInvoiceDetails_GetAll) drives
// every layout; the requested layout arrives as ?groupBy=:
//
//   agent | agent-detailed | date | date-detailed |
//   customer | customer-detailed | item | item-rate
//
// The "-detailed" variants add the per-item bale lines under each invoice (the
// VB "With Details" / "(Detailed)" reports). Functional filters mirror the VB
// in-memory DataResult.Select("... IN (...)"):
//   ?CustomerCodes=..  ?WasteTaxTypeCodes=..  ?WasteItemCodes=..
//
// SP: sp_WasteInvoiceDetails_GetAll (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy
} from '../cotton/_common.js';
import { buildInvoiceDoc, aggregateInvoices, groupBy } from './_wasteInvoiceCommon.js';

const csvSet = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const s = new Set(String(v).split(',').map((x) => x.trim()).filter(Boolean));
  return s.size ? s : null;
};

// Filter the raw item-level rows by the chosen Customer / Tax Type / Waste Item.
function applyFilters(rows, query = {}) {
  const cust = csvSet(query.CustomerCodes);
  const tax = csvSet(query.WasteTaxTypeCodes);
  const item = csvSet(query.WasteItemCodes);
  if (!cust && !tax && !item) return rows || [];
  return (rows || []).filter((r) => {
    if (cust && !cust.has(String(dec(r, 'CustomerCode')))) return false;
    if (tax && !tax.has(String(dec(r, 'WasteTaxTypeCode')))) return false;
    if (item && !item.has(String(dec(r, 'WasteItemCode')))) return false;
    return true;
  });
}

// ---- shared cell helpers (for the detailed / item / item-rate builders) ----
const headRow = (headers, fs = 7.5) =>
  headers.map((h) => ({
    text: h, bold: true, fillColor: colors.headerFill, color: colors.headerText,
    alignment: 'center', fontSize: fs
  }));
const td = (text, align = 'right', zebra = null, fs = 7.5) =>
  ({ text, alignment: align, fontSize: fs, fillColor: zebra });
const subCell = (text, align = 'right') =>
  ({ text, alignment: align, bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 7.5 });
const totalCell = (text, align = 'right') =>
  ({ text, alignment: align, bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 8 });
const zebraOf = (i) => (i % 2 === 1 ? colors.zebraFill : null);

// Invoice-level numeric columns (summary rows), in display order.
const NUM = [
  { key: 'Qty', label: 'Qty', digits: 0 },
  { key: 'BillingWeight', label: 'Billing Wt', digits: 3 },
  { key: 'Basic', label: 'Basic Value', digits: 2 },
  { key: 'CGST', label: 'CGST', digits: 2 },
  { key: 'SGST', label: 'SGST', digits: 2 },
  { key: 'IGST', label: 'IGST', digits: 2 },
  { key: 'TCS', label: 'TCS', digits: 2 },
  { key: 'RoundOff', label: 'R/Off', digits: 2 },
  { key: 'NetAmount', label: 'Net Amount', digits: 2 }
];
const NUM_WIDTHS = [26, 46, 50, 42, 42, 42, 40, 34, 52];

// ---------------------------------------------------------------------------
// Detailed grouped report (Agent / Date / Customer wise + bale detail).
// Each invoice prints its summary row, then one indented line per waste item
// showing item / qty / weight / rate / amount / bale numbers.
// ---------------------------------------------------------------------------
function buildDetailedDoc({ invoices, companyName, companyLogo, fromDate, toDate, title, groupKey, groupTitle, sortKeys, lead }) {
  const headers = ['S.No', 'Invoice No', lead.label, ...NUM.map((n) => n.label)];
  const widths = [24, 46, '*', ...NUM_WIDTHS];
  const colCount = headers.length;
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
        td(lead.value(inv), lead.align || 'left', z),
        ...NUM.map((n) => {
          sub[n.key] = (sub[n.key] || 0) + inv[n.key];
          return td(fmt(inv[n.key], n.digits), 'right', z);
        })
      ]);
      // item detail lines for this invoice
      for (const it of inv._items || []) {
        const line =
          `   • ${str(it, 'WasteItemName') || '-'}  |  Qty ${fmt(dec(it, 'Qty'), 0)}` +
          `  |  Wt ${fmt(dec(it, 'SalesWeight') || dec(it, 'Weight'), 3)}` +
          `  |  Rate ${fmt(dec(it, 'Rate'), 2)}  |  Amt ${fmt(dec(it, 'Amount'), 2)}` +
          (str(it, 'BaleNoStr') ? `  |  Bale ${str(it, 'BaleNoStr')}` : '');
        body.push([
          { text: line, colSpan: colCount, fontSize: 7, color: colors.subText, fillColor: '#fbfbfe' },
          ...Array(colCount - 1).fill({})
        ]);
      }
      i++;
    }
    body.push([
      { ...subCell('Total', 'right'), colSpan: 3 }, {}, {},
      ...NUM.map((n) => {
        grand[n.key] = (grand[n.key] || 0) + (sub[n.key] || 0);
        return subCell(fmt(sub[n.key] || 0, n.digits));
      })
    ]);
    tables.push(
      { text: groupTitle(list[0]), bold: true, fontSize: 9, color: colors.subText, fillColor: colors.subFill, margin: [0, 8, 0, 2] },
      { table: { headerRows: 1, widths, body }, layout: tableLayout() }
    );
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

// ---------------------------------------------------------------------------
// Item Wise — item-level rows grouped by Waste Item (invoice / customer / qty /
// weight / rate / amount), per-item totals + grand total.
// ---------------------------------------------------------------------------
function buildItemWise({ rows, companyName, companyLogo, fromDate, toDate, title }) {
  const headers = ['S.No', 'Invoice No', 'Date', 'Customer Name', 'Qty', 'Weight', 'Rate', 'Amount'];
  const widths = [26, 56, 56, '*', 44, 64, 56, 70];
  const tables = [];

  const groups = groupBy(rows || [], (r) => str(r, 'WasteItemName') || '(No Item)');
  const keys = [...groups.keys()].sort((a, b) => a.localeCompare(b));
  const grand = { qty: 0, wt: 0, amt: 0 };

  for (const key of keys) {
    const list = groups.get(key);
    const body = [headRow(headers)];
    let i = 0, sQty = 0, sWt = 0, sAmt = 0;
    for (const r of list) {
      const z = zebraOf(i);
      const wt = dec(r, 'SalesWeight') || dec(r, 'Weight');
      body.push([
        td(String(i + 1), 'center', z),
        td(str(r, 'WasteInvoiceNostr') || str(r, 'WasteInvoiceNo'), 'center', z),
        td(ddmmyyyy(r.WasteInvoiceDate), 'center', z),
        td(str(r, 'CustomerName'), 'left', z),
        td(fmt(dec(r, 'Qty'), 0), 'right', z),
        td(fmt(wt, 3), 'right', z),
        td(fmt(dec(r, 'Rate'), 2), 'right', z),
        td(fmt(dec(r, 'Amount'), 2), 'right', z)
      ]);
      sQty += dec(r, 'Qty'); sWt += wt; sAmt += dec(r, 'Amount'); i++;
    }
    body.push([
      { ...subCell('Total', 'right'), colSpan: 4 }, {}, {}, {},
      subCell(fmt(sQty, 0)), subCell(fmt(sWt, 3)), subCell(''), subCell(fmt(sAmt, 2))
    ]);
    grand.qty += sQty; grand.wt += sWt; grand.amt += sAmt;
    tables.push(
      { text: key, bold: true, fontSize: 9, color: colors.subText, fillColor: colors.subFill, margin: [0, 8, 0, 2] },
      { table: { headerRows: 1, widths, body }, layout: tableLayout() }
    );
  }

  if (!tables.length) {
    tables.push({ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] });
  } else {
    tables.push({
      margin: [0, 6, 0, 0],
      table: {
        widths,
        body: [[
          { ...totalCell('Grand Total', 'right'), colSpan: 4 }, {}, {}, {},
          totalCell(fmt(grand.qty, 0)), totalCell(fmt(grand.wt, 3)), totalCell(''), totalCell(fmt(grand.amt, 2))
        ]]
      },
      layout: tableLayout()
    });
  }
  return buildPage({ companyName, companyLogo, title, fromDate, toDate, tables });
}

// ---------------------------------------------------------------------------
// Item Rate Wise — one row per Waste Item: total qty, total weight, average
// rate, total amount (a flat summary of the desktop item×month rate matrix).
// ---------------------------------------------------------------------------
function buildItemRate({ rows, companyName, companyLogo, fromDate, toDate, title }) {
  const headers = ['S.No', 'Waste Item', 'Total Qty', 'Total Weight', 'Avg Rate', 'Total Amount'];
  const widths = [30, '*', 70, 90, 80, 100];

  const groups = groupBy(rows || [], (r) => str(r, 'WasteItemName') || '(No Item)');
  const keys = [...groups.keys()].sort((a, b) => a.localeCompare(b));
  const body = [headRow(headers, 8)];
  let gQty = 0, gWt = 0, gAmt = 0, i = 0;

  for (const key of keys) {
    const list = groups.get(key);
    const z = zebraOf(i);
    let qty = 0, wt = 0, amt = 0, rateSum = 0, rateN = 0;
    for (const r of list) {
      qty += dec(r, 'Qty'); wt += dec(r, 'SalesWeight') || dec(r, 'Weight'); amt += dec(r, 'Amount');
      const rt = dec(r, 'Rate'); if (rt) { rateSum += rt; rateN += 1; }
    }
    const avg = rateN ? rateSum / rateN : 0;
    body.push([
      td(String(i + 1), 'center', z, 8),
      td(key, 'left', z, 8),
      td(fmt(qty, 0), 'right', z, 8),
      td(fmt(wt, 3), 'right', z, 8),
      td(fmt(avg, 2), 'right', z, 8),
      td(fmt(amt, 2), 'right', z, 8)
    ]);
    gQty += qty; gWt += wt; gAmt += amt; i++;
  }

  const tables = [];
  if (body.length <= 1) {
    tables.push({ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] });
  } else {
    body.push([
      { ...totalCell('Grand Total', 'right'), colSpan: 2 }, {},
      totalCell(fmt(gQty, 0)), totalCell(fmt(gWt, 3)), totalCell(''), totalCell(fmt(gAmt, 2))
    ]);
    tables.push({ table: { headerRows: 1, widths, body }, layout: tableLayout() });
  }
  return buildPage({ companyName, companyLogo, title, fromDate, toDate, tables });
}

// ---- grouping presets for the summary (non-detailed) date/customer/agent ----
const GROUPED = {
  date: {
    title: 'WASTE SALES REPORT - DATE WISE',
    groupKey: (inv) => (inv.WasteInvoiceDate ? new Date(inv.WasteInvoiceDate).toISOString().slice(0, 10) : ''),
    groupTitle: (inv) => `Date : ${ddmmyyyy(inv.WasteInvoiceDate)}`,
    sortKeys: (a, b) => new Date(a) - new Date(b),
    lead: { label: 'Customer Name', value: (inv) => inv.CustomerName, align: 'left' }
  },
  customer: {
    title: 'WASTE SALES REPORT - CUSTOMER WISE',
    groupKey: (inv) => inv.CustomerCode || inv.CustomerName || '',
    groupTitle: (inv) => inv.CustomerName || '(No Customer)',
    sortKeys: (a, b) => String(a).localeCompare(String(b)),
    lead: { label: 'Date', value: (inv) => ddmmyyyy(inv.WasteInvoiceDate), align: 'center' }
  },
  agent: {
    title: 'WASTE SALES REPORT - AGENT WISE',
    groupKey: (inv) => inv.AgentCode || inv.AgentName || '',
    groupTitle: (inv) => inv.AgentName || '(No Agent)',
    sortKeys: (a, b) => String(a).localeCompare(String(b)),
    lead: { label: 'Customer Name', value: (inv) => inv.CustomerName, align: 'left' }
  }
};

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate, query }) {
  const raw = applyFilters(rows, query);
  const gb = String((query && query.groupBy) || 'date').toLowerCase();
  const detailed = gb.endsWith('-detailed');
  const base = detailed ? gb.slice(0, -'-detailed'.length) : gb;

  if (base === 'item') {
    return buildItemWise({ rows: raw, companyName, companyLogo, fromDate, toDate, title: 'WASTE SALES REPORT - ITEM WISE' });
  }
  if (base === 'item-rate') {
    return buildItemRate({ rows: raw, companyName, companyLogo, fromDate, toDate, title: 'WASTE SALES REPORT - ITEM RATE WISE' });
  }

  const cfg = GROUPED[base] || GROUPED.date;
  const invoices = aggregateInvoices(raw);

  if (detailed) {
    return buildDetailedDoc({
      invoices, companyName, companyLogo, fromDate, toDate,
      title: `${cfg.title} (DETAILED)`,
      groupKey: cfg.groupKey, groupTitle: cfg.groupTitle, sortKeys: cfg.sortKeys, lead: cfg.lead
    });
  }
  // summary grouped table (reuses the shared invoice doc builder)
  return buildInvoiceDoc({
    rows: raw, companyName, companyLogo, fromDate, toDate,
    title: cfg.title,
    groupKey: cfg.groupKey,
    groupTitle: cfg.groupTitle,
    sortKeys: cfg.sortKeys,
    leadCol: { label: cfg.lead.label, value: cfg.lead.value, align: cfg.lead.align }
  });
}

export const wasteInvoiceReport = (req, res) => {
  return runReport(req, res, {
    spName: 'sp_WasteInvoiceDetails_GetAll',
    fileName: 'WasteInvoice_Report',
    buildDocDefinition
  });
};
