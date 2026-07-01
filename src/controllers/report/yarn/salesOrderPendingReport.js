// reports/yarn/salesOrderPendingReport.js
// Yarn Sales Order Pending reports sharing one SP and one builder factory.
//   sp_Pending_InvoiceList_GetAll (CompanyCode, FromDate, ToDate)
//
// Exports: detailed, summary
// Each exports { buildDocDefinition(rows, companyName, fromDate, toDate, companyLogo) }.
//
// Mirrors:
//   rptSalesOrderPendingDetailed.rdlc          -> detailed
//       Grouped by Count Type. Two-level header with Order / Delivery / Pending
//       (Qty + Weight) blocks, per-group Total + Net Total footer.
//   rptSalesOrderPendingSummaryDetailed.rdlc   -> summary
//       Flat list (SO No / Date / Customer / Rate / Rate Ex / Count / Qty /
//       Del Qty / Pen Qty) with a single Total footer.
//
// Both title "Pending Sales Order Details As On <ToDate>" with the company logo.

import { chartFromRows } from '../cotton/_common.js';

const dec = (row, col) => {
  const v = row[col];
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};
const str = (row, col) => {
  const v = row[col];
  return (v === null || v === undefined) ? '' : String(v);
};
const fmt = (n, digits = 2) =>
  Number(n).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const intFmt = (n) =>
  Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const ddmmyyyy = (d) => {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yy = dt.getFullYear();
  return `${dd}/${mm}/${yy}`;
};

const COLORS = {
  headerFill: '#1A3C7B',
  headerText: '#FFFFFF',
  groupFill: '#E8F0FE',
  groupText: '#1A3C7B',
  zebraFill: '#FAFBFD',
  subFill: '#EEF2F7',
  subText: '#1A3C7B',
  grandFill: '#1A3C7B',
  grandText: '#FFFFFF',
  borderColor: '#D7DCE3'
};

const baseLayout = {
  hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0.4),
  vLineWidth: () => 0.4,
  hLineColor: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? COLORS.headerFill : COLORS.borderColor),
  vLineColor: () => COLORS.borderColor,
  paddingLeft: () => 3,
  paddingRight: () => 3,
  paddingTop: () => 4,
  paddingBottom: () => 4
};

const baseFooter = (currentPage, pageCount) => ({
  margin: [0, 12, 0, 0],
  columns: [
    { text: 'Report Printed : ' + new Date().toLocaleString('en-GB'), fontSize: 7, margin: [15, 0, 0, 0] },
    { text: `Page ${currentPage} of ${pageCount}`, alignment: 'right', fontSize: 7, margin: [0, 0, 15, 0] }
  ]
});

// Title block — logo on the left, company name (brown), report title (green),
// and the "As On" date line. The right spacer matches the logo column so the
// title text stays visually centered.
const titleBlock = (companyName, title, dateLine, logoDataUri) => {
  const LOGO_COL_WIDTH = 90;
  const logoCol = logoDataUri
    ? { image: logoDataUri, fit: [80, 80], width: LOGO_COL_WIDTH, alignment: 'left', margin: [4, 0, 0, 0] }
    : { text: '', width: LOGO_COL_WIDTH };
  const textCol = {
    width: '*',
    stack: [
      { text: companyName, alignment: 'center', fontSize: 16, bold: true, color: '#7B3F00', margin: [0, 0, 0, 6] },
      { text: title, alignment: 'center', fontSize: 12, bold: true, color: '#008000', margin: [0, 0, 0, 6] },
      { text: dateLine, alignment: 'center', fontSize: 10, bold: true }
    ]
  };
  return {
    columns: [logoCol, textCol, { text: '', width: LOGO_COL_WIDTH }],
    margin: [0, 0, 0, 10]
  };
};

// Per-cell text for a detail row.
const cellText = (c, r) => {
  if (c.kind === 'text') return str(r, c.key);
  if (c.kind === 'date') return ddmmyyyy(r[c.key]);
  const v = dec(r, c.key);
  if (c.blankZero && v === 0) return '';
  return (c.kind === 'kgs' || c.kind === 'rate') ? fmt(v, 2) : intFmt(v);
};
const totalText = (c, val) => (c.kind === 'kgs' || c.kind === 'rate') ? fmt(val, 2) : intFmt(val);

// Header rows for a column set — two-level when any column declares a `group`
// (consecutive columns sharing a group merge under it; ungrouped columns
// rowSpan both rows).
const buildColumnHeader = (columns, fs) => {
  const hdr = (text, extra = {}) => ({
    text, bold: true, fillColor: COLORS.headerFill, color: COLORS.headerText,
    alignment: 'center', fontSize: fs, ...extra
  });
  const hasGroups = columns.some(c => c.group);
  if (!hasGroups) return [columns.map(c => hdr(c.header))];
  const row1 = [];
  const row2 = [];
  let i = 0;
  while (i < columns.length) {
    const c = columns[i];
    if (c.group) {
      let j = i;
      while (j < columns.length && columns[j].group === c.group) j++;
      const span = j - i;
      row1.push(hdr(c.group, { colSpan: span }));
      for (let k = 1; k < span; k++) row1.push({});
      for (let k = i; k < j; k++) row2.push(hdr(columns[k].header));
      i = j;
    } else {
      row1.push(hdr(c.header, { rowSpan: 2 }));
      row2.push({});
      i++;
    }
  }
  return [row1, row2];
};

// Leading summary page — one row per Count Type with the aggregated total
// columns (Order / Delivery / Pending) + a Net Total. Rendered before detail.
function buildSummaryPage({ COLS, rows, config, companyName, toDate, companyLogo }) {
  const fs = config.fontSize;
  const totalCols = COLS.filter(c => c.total);
  const summaryCols = [
    { header: 'S.No', width: 32, align: 'center' },
    { header: config.summaryGroupHeader || 'Count Type', width: '*', align: 'left' },
    ...totalCols
  ];
  const headerRows = buildColumnHeader(summaryCols, fs);
  const hasGroups = summaryCols.some(c => c.group);
  const body = [...headerRows];

  const groupsMap = new Map();
  for (const r of rows) {
    const k = (r[config.groupKeyField] != null ? String(r[config.groupKeyField]) : '') + '||' + (str(r, config.groupLabelField) || '(Unknown)');
    if (!groupsMap.has(k)) groupsMap.set(k, { name: str(r, config.groupLabelField) || '(Unknown)', sums: {} });
    const g = groupsMap.get(k);
    for (const c of totalCols) g.sums[c.key] = (g.sums[c.key] || 0) + dec(r, c.key);
  }
  const keys = [...groupsMap.keys()].sort((a, b) => (a.split('||')[1] || '').localeCompare(b.split('||')[1] || ''));

  const grand = {};
  for (const c of totalCols) grand[c.key] = 0;

  let sno = 1;
  for (const key of keys) {
    const g = groupsMap.get(key);
    const zebra = sno % 2 === 0 ? COLORS.zebraFill : null;
    const cells = [
      { text: String(sno), alignment: 'center', fontSize: fs, fillColor: zebra },
      { text: g.name, alignment: 'left', fontSize: fs, fillColor: zebra }
    ];
    for (const c of totalCols) {
      cells.push({ text: totalText(c, g.sums[c.key] || 0), alignment: 'right', fontSize: fs, fillColor: zebra });
      grand[c.key] += g.sums[c.key] || 0;
    }
    body.push(cells);
    sno++;
  }

  const totalRow = [
    { text: 'Net Total :', colSpan: 2, alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: fs },
    {}
  ];
  for (const c of totalCols) totalRow.push({ text: totalText(c, grand[c.key] || 0), alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: fs });
  body.push(totalRow);

  return [
    titleBlock(companyName, config.summaryTitle, `As On : ${ddmmyyyy(toDate)}`, companyLogo),
    {
      table: {
        headerRows: hasGroups ? 2 : 1,
        dontBreakRows: true,
        keepWithHeaderRows: 0,
        widths: summaryCols.map(c => c.width),
        body
      },
      layout: baseLayout
    }
  ];
}

function makeBuilder(config) {
  return function buildDocDefinition(rows, companyName, fromDate, toDate, companyLogo) {
    const COLS = config.columns;
    const colCount = COLS.length;
    const fs = config.fontSize;

    const hasGroups = COLS.some(c => c.group);
    const body = [...buildColumnHeader(COLS, fs)];

    const firstTotal = COLS.findIndex(c => c.total);
    const dataCell = (c, r, zebra) => ({ text: cellText(c, r), alignment: c.align || 'left', fontSize: fs, fillColor: zebra });

    let sno = 0; // (kept for parity; row identity is the SO No)
    const addDetailRow = (r, zebra) => {
      body.push(COLS.map(c => dataCell(c, r, zebra)));
      sno++;
    };

    const totalsRow = (label, totals, fill, color) => {
      const row = [{ text: label, colSpan: firstTotal, alignment: 'right', bold: true, color, fillColor: fill, fontSize: fs }];
      for (let k = 1; k < firstTotal; k++) row.push({});
      for (let i = firstTotal; i < COLS.length; i++) {
        const c = COLS[i];
        if (c.total) row.push({ text: totalText(c, totals[c.key] || 0), alignment: 'right', bold: true, color, fillColor: fill, fontSize: fs });
        else row.push({ text: '', fillColor: fill });
      }
      return row;
    };

    const grandTotals = {};
    for (const c of COLS) if (c.total) grandTotals[c.key] = 0;

    const sortRows = (arr) => arr.slice().sort((a, b) => dec(a, 'SOCode') - dec(b, 'SOCode'));

    if (config.grouped) {
      const groupsMap = new Map();
      for (const r of rows) {
        const k = (r[config.groupKeyField] != null ? String(r[config.groupKeyField]) : '') + '||' + (str(r, config.groupLabelField) || '(Unknown)');
        if (!groupsMap.has(k)) groupsMap.set(k, []);
        groupsMap.get(k).push(r);
      }
      const keys = [...groupsMap.keys()].sort((a, b) => (a.split('||')[1] || '').localeCompare(b.split('||')[1] || ''));
      for (const key of keys) {
        const groupName = key.split('||')[1] || '(Unknown)';
        const ghr = [{ text: groupName, colSpan: colCount, bold: true, color: COLORS.groupText, fillColor: COLORS.groupFill, fontSize: fs + 1, margin: [2, 2, 0, 2] }];
        for (let i = 1; i < colCount; i++) ghr.push({});
        body.push(ghr);

        const sub = {};
        for (const c of COLS) if (c.total) sub[c.key] = 0;
        let idx = 0;
        for (const r of sortRows(groupsMap.get(key))) {
          addDetailRow(r, idx % 2 === 1 ? COLORS.zebraFill : null);
          for (const c of COLS) if (c.total) sub[c.key] += dec(r, c.key);
          idx++;
        }
        body.push(totalsRow('Total :', sub, COLORS.subFill, COLORS.subText));
        for (const c of COLS) if (c.total) grandTotals[c.key] += sub[c.key];
      }
      body.push(totalsRow('Net Total :', grandTotals, COLORS.grandFill, COLORS.grandText));
    } else {
      let idx = 0;
      for (const r of sortRows(rows)) {
        addDetailRow(r, idx % 2 === 1 ? COLORS.zebraFill : null);
        for (const c of COLS) if (c.total) grandTotals[c.key] += dec(r, c.key);
        idx++;
      }
      body.push(totalsRow('Total :', grandTotals, COLORS.grandFill, COLORS.grandText));
    }

    const dateLine = `As On : ${ddmmyyyy(toDate)}`;

    const summaryNodes = config.summary
      ? buildSummaryPage({ COLS, rows, config, companyName, toDate, companyLogo })
      : [];

    const detailTitle = titleBlock(companyName, config.title, dateLine, companyLogo);
    if (summaryNodes.length) detailTitle.pageBreak = 'before';

    return {
      pageSize: 'A4',
      pageOrientation: config.pageOrientation,
      pageMargins: [15, 20, 15, 45],
      footer: baseFooter,
      content: [
        ...summaryNodes,
        ...(config.summary ? chartFromRows(rows, {
          groupKey: (r) => r[config.groupKeyField], groupLabel: (r) => str(r, config.groupLabelField),
          valueFn: (r) => dec(r, 'PendingWeight'), valueHeader: 'Pending Wt',
          groupHeader: config.summaryGroupHeader || 'Count Type', digits: 2
        }) : []),
        detailTitle,
        {
          table: {
            headerRows: hasGroups ? 2 : 1,
            dontBreakRows: true,
            keepWithHeaderRows: 0,
            widths: COLS.map(c => c.width),
            body
          },
          layout: baseLayout
        }
      ],
      defaultStyle: { font: 'Roboto', fontSize: fs, lineHeight: 1.2 }
    };
  };
}

// ============================================================================
// DETAILED — grouped by Count Type, Order / Delivery / Pending (Qty + Weight)
// ============================================================================
const detailedConfig = {
  title: 'PENDING SALES ORDER DETAILS',
  summary: true,
  summaryTitle: 'PENDING SALES ORDER SUMMARY - COUNT TYPE WISE',
  summaryGroupHeader: 'Count Type',
  pageOrientation: 'landscape',
  fontSize: 8,
  grouped: true,
  groupKeyField: 'CountTypeCode',
  groupLabelField: 'CountType',
  columns: [
    { key: 'SONo', header: 'SO No', width: 50, align: 'center', kind: 'int' },
    { key: 'SODate', header: 'SO Date', width: 55, align: 'center', kind: 'date' },
    { key: 'PONo', header: 'PO No', width: 50, align: 'center', kind: 'text' },
    { key: 'PODate', header: 'PO Date', width: 55, align: 'center', kind: 'date' },
    { key: 'CustomerName', header: 'Customer Name', width: '*', align: 'left', kind: 'text' },
    { key: 'AgentName', header: 'Agent Name', width: '*', align: 'left', kind: 'text' },
    { key: 'Rate', header: 'Rate', width: 45, align: 'right', kind: 'rate' },
    { key: 'RateEx', header: 'Rate Ex.', width: 50, align: 'right', kind: 'rate' },
    { key: 'Qty', header: 'Qty', group: 'Order', width: 42, align: 'right', kind: 'int', total: true },
    { key: 'Weight', header: 'Weight', group: 'Order', width: 52, align: 'right', kind: 'kgs', total: true },
    { key: 'DelQty', header: 'Qty', group: 'Delivery', width: 42, align: 'right', kind: 'int', total: true, blankZero: true },
    { key: 'DeliveredWeight', header: 'Weight', group: 'Delivery', width: 52, align: 'right', kind: 'kgs', total: true, blankZero: true },
    { key: 'PenQty', header: 'Qty', group: 'Pending', width: 42, align: 'right', kind: 'int', total: true },
    { key: 'PendingWeight', header: 'Weight', group: 'Pending', width: 52, align: 'right', kind: 'kgs', total: true },
    { key: 'CreditDays', header: 'Credit Days', width: 45, align: 'right', kind: 'int' }
  ]
};

// ============================================================================
// SUMMARY — flat list with a single Total footer
// ============================================================================
const summaryConfig = {
  title: 'PENDING SALES ORDER DETAILS',
  summary: true,
  summaryTitle: 'PENDING SALES ORDER SUMMARY - COUNT TYPE WISE',
  summaryGroupHeader: 'Count Type',
  groupKeyField: 'CountTypeCode',
  groupLabelField: 'CountType',
  pageOrientation: 'portrait',
  fontSize: 8,
  grouped: false,
  columns: [
    { key: 'SONo', header: 'SO No', width: 55, align: 'center', kind: 'int' },
    { key: 'SODate', header: 'SO Date', width: 60, align: 'center', kind: 'date' },
    { key: 'CustomerName', header: 'Customer', width: '*', align: 'left', kind: 'text' },
    { key: 'Rate', header: 'Rate', width: 48, align: 'right', kind: 'rate' },
    { key: 'RateEx', header: 'Rate Ex.', width: 50, align: 'right', kind: 'rate' },
    { key: 'CountType', header: 'Count', width: '*', align: 'left', kind: 'text' },
    { key: 'Qty', header: 'Qty', width: 45, align: 'right', kind: 'int', total: true },
    { key: 'DelQty', header: 'Del. Qty', width: 50, align: 'right', kind: 'int', total: true },
    { key: 'PenQty', header: 'Pen. Qty', width: 50, align: 'right', kind: 'int', total: true }
  ]
};

// ============================================================================
// PENDING — matrix pivot: rows = each Sales Order (SO No / Date / Customer),
// columns = Count, cell = Sum(Pending Qty). Mirrors rptSalesOrderPending.rdlc.
// ============================================================================
const pending = {
  buildDocDefinition(rows, companyName, fromDate, toDate, companyLogo) {
    const fs = 8;
    const countKey = (r) => str(r, 'Count') || str(r, 'CountType') || '(Unknown)';
    const counts = [...new Set((rows || []).map(countKey))].sort((a, b) => a.localeCompare(b));

    // Group by Sales Order.
    const map = new Map();
    for (const r of rows || []) {
      const k = String(r.SOCode ?? r.SONo ?? '');
      if (!map.has(k)) map.set(k, { SONo: str(r, 'SONo'), SODate: r.SODate, Customer: str(r, 'CustomerName'), cells: {} });
      const g = map.get(k);
      const ck = countKey(r);
      g.cells[ck] = (g.cells[ck] || 0) + dec(r, 'PenQty');
    }
    const keys = [...map.keys()].sort((a, b) => {
      const da = new Date(map.get(a).SODate).getTime() || 0;
      const db = new Date(map.get(b).SODate).getTime() || 0;
      if (da !== db) return da - db;
      return dec({ x: map.get(a).SONo }, 'x') - dec({ x: map.get(b).SONo }, 'x');
    });

    const hdr = (text, extra = {}) => ({ text, bold: true, fillColor: COLORS.headerFill, color: COLORS.headerText, alignment: 'center', fontSize: fs, ...extra });
    const headers = ['S.No', 'SO No', 'SO Date', 'Customer', ...counts, 'Total'];
    const widths = [28, 50, 55, '*', ...counts.map(() => 45), 50];
    const body = [headers.map((h) => hdr(h))];

    const colTotals = {};
    counts.forEach((c) => (colTotals[c] = 0));
    let grand = 0;
    let sno = 1;
    for (const k of keys) {
      const g = map.get(k);
      const zebra = sno % 2 === 0 ? COLORS.zebraFill : null;
      let rowTotal = 0;
      const cells = [
        { text: String(sno), alignment: 'center', fontSize: fs, fillColor: zebra },
        { text: g.SONo, alignment: 'center', fontSize: fs, fillColor: zebra },
        { text: ddmmyyyy(g.SODate), alignment: 'center', fontSize: fs, fillColor: zebra },
        { text: g.Customer, alignment: 'left', fontSize: fs, fillColor: zebra },
      ];
      for (const c of counts) {
        const v = g.cells[c] || 0;
        rowTotal += v;
        colTotals[c] += v;
        cells.push({ text: v ? intFmt(v) : '', alignment: 'right', fontSize: fs, fillColor: zebra });
      }
      grand += rowTotal;
      cells.push({ text: intFmt(rowTotal), alignment: 'right', bold: true, fontSize: fs, fillColor: zebra });
      body.push(cells);
      sno++;
    }
    if (!keys.length) {
      body.push([{ text: 'No records found', colSpan: headers.length, alignment: 'center', italics: true, fontSize: 9, margin: [0, 6, 0, 6] }, ...new Array(headers.length - 1).fill({})]);
    } else {
      const totalRow = [{ text: 'Total', colSpan: 4, alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: fs }, {}, {}, {}];
      for (const c of counts) totalRow.push({ text: intFmt(colTotals[c]), alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: fs });
      totalRow.push({ text: intFmt(grand), alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: fs });
      body.push(totalRow);
    }

    return {
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [15, 20, 15, 45],
      footer: baseFooter,
      content: [
        titleBlock(companyName, 'PENDING ORDER DETAILS', `As On : ${ddmmyyyy(toDate)}`, companyLogo),
        { table: { headerRows: 1, dontBreakRows: true, keepWithHeaderRows: 0, widths, body }, layout: baseLayout },
      ],
      defaultStyle: { font: 'Roboto', fontSize: fs, lineHeight: 1.2 },
    };
  },
};

export const detailed = { buildDocDefinition: makeBuilder(detailedConfig) };
export const summary = { buildDocDefinition: makeBuilder(summaryConfig) };
export { pending };

export default { detailed, summary, pending };
