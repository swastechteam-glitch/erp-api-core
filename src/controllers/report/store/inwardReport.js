// reports/inwardReport.js
// Five grouped Inward (PO Received) reports sharing one SP and one builder factory.
//   sp_RptPurchaseOrderReceivedDetails (CompanyCode, FromDate, ToDate)
//
// Exports: dateWise, supplierWise, itemWise, departmentWise, categoryWise
// Each exports { buildDocDefinition(rows, companyName, fromDate, toDate) }.

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

const ddmmyyyy = (d) => {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yy = dt.getFullYear();
  return `${dd}/${mm}/${yy}`;
};

const taxOf = (r) => dec(r, 'CGSTAmount') + dec(r, 'SGSTAmount') + dec(r, 'IGSTAmount');

const estimateLines = (text, charsPerLine) => {
  if (!text) return 1;
  const words = String(text).split(/\s+/).filter(Boolean);
  let lines = 1, len = 0;
  for (const w of words) {
    if (len === 0) len = w.length;
    else if (len + 1 + w.length <= charsPerLine) len += 1 + w.length;
    else { lines++; len = w.length; }
    while (len > charsPerLine) { lines++; len -= charsPerLine; }
  }
  return lines;
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

// Each config defines: title, groupKey/label, columns (header + how to render a row + col widths + which numeric totals to keep).
// Totals tracked across all reports: qty, amount, discount, otherExp, basic, tax, pfAmount, rounded, net.

function makeBuilder(config) {
  return function buildDocDefinition(rows, companyName, fromDate, toDate) {

    const groupsMap = new Map();
    for (const r of rows) {
      const k = config.groupKey(r);
      if (!groupsMap.has(k)) groupsMap.set(k, []);
      groupsMap.get(k).push(r);
    }
    const sortedKeys = [...groupsMap.keys()].sort((a, b) => {
      const an = a.split('||')[1] || '';
      const bn = b.split('||')[1] || '';
      return an.localeCompare(bn);
    });

    const body = [];
    const COLS = config.columns;
    const colCount = COLS.length;

    body.push(COLS.map(c => ({
      text: c.header, bold: true, fillColor: COLORS.headerFill,
      color: COLORS.headerText, alignment: 'center', fontSize: 8
    })));

    const totals = { qty: 0, amount: 0, discount: 0, otherExp: 0, basic: 0, tax: 0, pf: 0, rnd: 0, net: 0 };
    const groupSummaries = [];
    let sno = 1;

    for (const key of sortedKeys) {
      const group = groupsMap.get(key).slice().sort((a, b) => {
        const da = new Date(a.PurchaseOrderReceivedDate).getTime() || 0;
        const db = new Date(b.PurchaseOrderReceivedDate).getTime() || 0;
        return da - db;
      });
      const groupLabel = config.groupLabel(group[0], key);

      const blank = new Array(colCount - 1).fill({});
      body.push([
        { text: groupLabel, colSpan: colCount, bold: true, color: COLORS.groupText, fillColor: COLORS.groupFill, fontSize: 9, margin: [2, 2, 0, 2] },
        ...blank
      ]);

      const sub = { qty: 0, amount: 0, discount: 0, otherExp: 0, basic: 0, tax: 0, pf: 0, rnd: 0, net: 0 };

      let rowIdx = 0;
      for (const r of group) {
        sub.qty += dec(r, 'Qty');
        sub.amount += dec(r, 'Amount');
        sub.discount += dec(r, 'DiscountAmount');
        sub.otherExp += dec(r, 'OtherExpenses');
        sub.basic += dec(r, 'BasicValue');
        sub.tax += taxOf(r);
        sub.pf += dec(r, 'PFAmount');
        sub.rnd += dec(r, 'Roundedoff');
        sub.net += dec(r, 'NetAmount');

        const zebra = rowIdx % 2 === 1 ? COLORS.zebraFill : null;
        const ctx = { r, sno, zebra };
        body.push(COLS.map(c => c.cell(ctx)));
        sno++;
        rowIdx++;
      }

      // Sub-total row for the group
      const subRow = COLS.map((c, i) => {
        if (i === 0) {
          return { text: 'Sub Total', colSpan: config.subLabelSpan, alignment: 'right', bold: true, color: COLORS.subText, fillColor: COLORS.subFill, fontSize: 8 };
        }
        if (i > 0 && i < config.subLabelSpan) return {};
        const key = c.totalKey;
        if (!key) return { text: '', fillColor: COLORS.subFill };
        return { text: fmt(sub[key], c.totalDigits || 2), alignment: 'right', bold: true, color: COLORS.subText, fillColor: COLORS.subFill, fontSize: 8 };
      });
      body.push(subRow);

      groupSummaries.push({ label: cleanGroupLabel(groupLabel), sub });

      totals.qty += sub.qty;
      totals.amount += sub.amount;
      totals.discount += sub.discount;
      totals.otherExp += sub.otherExp;
      totals.basic += sub.basic;
      totals.tax += sub.tax;
      totals.pf += sub.pf;
      totals.rnd += sub.rnd;
      totals.net += sub.net;
    }

    const grandRow = COLS.map((c, i) => {
      if (i === 0) {
        return { text: 'Grand Total', colSpan: config.subLabelSpan, alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: 9 };
      }
      if (i > 0 && i < config.subLabelSpan) return {};
      const key = c.totalKey;
      if (!key) return { text: '', fillColor: COLORS.grandFill };
      return { text: fmt(totals[key], c.totalDigits || 2), alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: 9 };
    });
    body.push(grandRow);

    const summaryNodes = buildSummaryPage({ COLS, groupSummaries, totals, config, companyName, fromDate, toDate });

    return {
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [15, 20, 15, 45],

      footer: function (currentPage, pageCount) {
        return {
          margin: [0, 12, 0, 0],
          columns: [
            { text: 'Report Printed : ' + new Date().toLocaleString('en-GB'), fontSize: 7, margin: [15, 0, 0, 0] },
            { text: `Page ${currentPage} of ${pageCount}`, alignment: 'right', fontSize: 7, margin: [0, 0, 15, 0] }
          ]
        };
      },

      content: [
        ...summaryNodes,
        {
          stack: [
            { text: companyName, alignment: 'center', fontSize: 16, bold: true, color: '#7B3F00', margin: [0, 0, 0, 6] },
            { text: config.title, alignment: 'center', fontSize: 12, bold: true, color: '#008000', margin: [0, 0, 0, 6] },
            { text: `From : ${ddmmyyyy(fromDate)}    To : ${ddmmyyyy(toDate)}`, alignment: 'center', fontSize: 10, bold: true, margin: [0, 0, 0, 10] }
          ],
          pageBreak: 'before'
        },
        {
          table: {
            headerRows: 1,
            dontBreakRows: true,
            keepWithHeaderRows: 0,
            widths: COLS.map(c => c.width),
            body: body
          },
          layout: {
            hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0.4),
            vLineWidth: () => 0.4,
            hLineColor: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? '#1A3C7B' : COLORS.borderColor),
            vLineColor: () => COLORS.borderColor,
            paddingLeft: () => 4,
            paddingRight: () => 4,
            paddingTop: () => 6,
            paddingBottom: () => 6
          }
        }
      ],

      defaultStyle: { font: 'Roboto', fontSize: 8, lineHeight: 1.25 }
    };
  };
}

// Strip the "Label : " prefix from a group label string to get the bare value.
const cleanGroupLabel = (label) => {
  const idx = label.indexOf(' : ');
  return idx >= 0 ? label.slice(idx + 3).trim() : label;
};

// Build the summary page nodes: title + per-group aggregated totals table.
// Renders on a new page. The summary table has one row per group with each
// totalled column from the detail table, plus a Total footer row.
function buildSummaryPage({ COLS, groupSummaries, totals, config, companyName, fromDate, toDate }) {
  const totalCols = COLS.filter(c => c.totalKey);
  const summaryTitle = (config.title || '').replace(/DETAILS/gi, 'SUMMARY');
  const groupHeader = config.summaryGroupHeader || 'Group';

  const hdrCell = (text) => ({ text, bold: true, fillColor: COLORS.headerFill, color: COLORS.headerText, alignment: 'center', fontSize: 8 });

  const headerRow = [
    hdrCell('S.No'),
    hdrCell(groupHeader),
    ...totalCols.map(c => hdrCell(c.header))
  ];

  const dataRows = groupSummaries.map((gs, i) => {
    const zebra = i % 2 === 1 ? COLORS.zebraFill : null;
    return [
      { text: String(i + 1), alignment: 'center', fontSize: 8, fillColor: zebra },
      { text: gs.label, alignment: 'left', fontSize: 8, fillColor: zebra },
      ...totalCols.map(c => ({
        text: fmt(gs.sub[c.totalKey] || 0, c.totalDigits != null ? c.totalDigits : 2),
        alignment: 'right', fontSize: 8, fillColor: zebra
      }))
    ];
  });

  const totalRow = [
    { text: 'Total', colSpan: 2, alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: 9 },
    {},
    ...totalCols.map(c => ({
      text: fmt(totals[c.totalKey] || 0, c.totalDigits != null ? c.totalDigits : 2),
      alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: 9
    }))
  ];

  const widths = [30, '*', ...totalCols.map(() => 70)];

  // Summary now renders FIRST — no pageBreak on the title (the detail title
  // block downstream gets the pageBreak instead).
  return [
    {
      stack: [
        { text: companyName, alignment: 'center', fontSize: 16, bold: true, color: '#7B3F00', margin: [0, 0, 0, 6] },
        { text: summaryTitle, alignment: 'center', fontSize: 12, bold: true, color: '#008000', margin: [0, 0, 0, 6] },
        { text: `From : ${ddmmyyyy(fromDate)}    To : ${ddmmyyyy(toDate)}`, alignment: 'center', fontSize: 10, bold: true, margin: [0, 0, 0, 10] }
      ]
    },
    {
      table: {
        headerRows: 1,
        dontBreakRows: true,
        keepWithHeaderRows: 0,
        widths,
        body: [headerRow, ...dataRows, totalRow]
      },
      layout: {
        hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0.4),
        vLineWidth: () => 0.4,
        hLineColor: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? '#1A3C7B' : COLORS.borderColor),
        vLineColor: () => COLORS.borderColor,
        paddingLeft: () => 4,
        paddingRight: () => 4,
        paddingTop: () => 6,
        paddingBottom: () => 6
      }
    }
  ];
}

// Helper cell builders
const txt = (val, align = 'left') => (ctx) => ({
  text: String(val(ctx.r) ?? ''), alignment: align, fontSize: 8, fillColor: ctx.zebra
});
const num = (getVal, digits = 2) => (ctx) => ({
  text: fmt(getVal(ctx.r), digits), alignment: 'right', fontSize: 8, fillColor: ctx.zebra
});
const sn = () => (ctx) => ({
  text: String(ctx.sno), alignment: 'center', fontSize: 8, fillColor: ctx.zebra
});

// ============================================================================
// DATE WISE — grouped by PurchaseOrderReceivedDate — title "INWARD DETAILS - DATE WISE"
// ============================================================================
const dateWiseConfig = {
  title: 'INWARD DETAILS - DATE WISE',
  summaryGroupHeader: 'Inward No / Date',
  subLabelSpan: 7,
  groupKey: (r) => {
    const dt = new Date(r.PurchaseOrderReceivedDate);
    const iso = isNaN(dt.getTime()) ? '0000-00-00' : dt.toISOString().slice(0, 10);
    return iso + '||' + ddmmyyyy(r.PurchaseOrderReceivedDate);
  },
  groupLabel: (first) => 'Date : ' + ddmmyyyy(first.PurchaseOrderReceivedDate),
  columns: [
    { header: 'S.No', width: 22, cell: sn() },
    { header: 'Date', width: 50, cell: txt(r => ddmmyyyy(r.PurchaseOrderReceivedDate), 'center') },
    { header: 'PO No', width: 42, cell: txt(r => str(r, 'PurchaseOrderNo'), 'center') },
    { header: 'Invoice', width: 60, cell: txt(r => str(r, 'InvoiceNo'), 'center') },
    { header: 'Item Name', width: '*', cell: txt(r => str(r, 'ItemName'), 'left') },
    { header: 'UOM', width: 36, cell: txt(r => str(r, 'ItemUOMName'), 'center') },
    { header: 'Qty', width: 50, cell: num(r => dec(r, 'Qty'), 3), totalKey: 'qty', totalDigits: 3 },
    { header: 'Rate', width: 50, cell: num(r => dec(r, 'Rate')) },
    { header: 'Amount', width: 60, cell: num(r => dec(r, 'Amount')), totalKey: 'amount' },
    { header: 'Discount', width: 50, cell: num(r => dec(r, 'DiscountAmount')), totalKey: 'discount' },
    { header: 'Tax', width: 50, cell: num(r => taxOf(r)), totalKey: 'tax' },
    { header: 'P&F Amt', width: 50, cell: num(r => dec(r, 'PFAmount')), totalKey: 'pf' },
    { header: 'Net Amt', width: 60, cell: num(r => dec(r, 'NetAmount')), totalKey: 'net' }
  ]
};

// ============================================================================
// SUPPLIER WISE — grouped by SupplierCode
// ============================================================================
const supplierWiseConfig = {
  title: 'INWARD DETAILS - SUPPLIER WISE',
  summaryGroupHeader: 'Supplier Name',
  subLabelSpan: 7,
  groupKey: (r) => (r.SupplierCode != null ? String(r.SupplierCode) : '') + '||' + (str(r, 'SupplierName') || '(Unknown Supplier)'),
  groupLabel: (first, key) => 'Supplier : ' + (key.split('||')[1] || '(Unknown Supplier)'),
  columns: [
    { header: 'S.No', width: 22, cell: sn() },
    { header: 'Inward No', width: 50, cell: txt(r => str(r, 'PurchaseOrderReceivedNo'), 'center') },
    { header: 'Date', width: 50, cell: txt(r => ddmmyyyy(r.PurchaseOrderReceivedDate), 'center') },
    { header: 'Invoice', width: 55, cell: txt(r => str(r, 'InvoiceNo'), 'center') },
    { header: 'Cost Head', width: '*', cell: txt(r => str(r, 'CostHeadName'), 'left') },
    { header: 'Item Name', width: '*', cell: txt(r => str(r, 'ItemName'), 'left') },
    { header: 'UOM', width: 36, cell: txt(r => str(r, 'ItemUOMName'), 'center') },
    { header: 'Qty', width: 50, cell: num(r => dec(r, 'Qty'), 3), totalKey: 'qty', totalDigits: 3 },
    { header: 'Rate', width: 50, cell: num(r => dec(r, 'Rate')) },
    { header: 'Amount', width: 55, cell: num(r => dec(r, 'Amount')), totalKey: 'amount' },
    { header: 'Discount', width: 48, cell: num(r => dec(r, 'DiscountAmount')), totalKey: 'discount' },
    { header: 'Tax', width: 48, cell: num(r => taxOf(r)), totalKey: 'tax' },
    { header: 'P&F Amt', width: 48, cell: num(r => dec(r, 'PFAmount')), totalKey: 'pf' },
    { header: 'Net Amt', width: 60, cell: num(r => dec(r, 'NetAmount')), totalKey: 'net' }
  ]
};

// ============================================================================
// ITEM WISE — grouped by ItemCode
// ============================================================================
const itemWiseConfig = {
  title: 'INWARD DETAILS - ITEM WISE',
  summaryGroupHeader: 'Item Name',
  subLabelSpan: 7,
  groupKey: (r) => (r.ItemCode != null ? String(r.ItemCode) : '') + '||' + (str(r, 'ItemName') || '(Unknown Item)'),
  groupLabel: (first) => 'Item : ' + str(first, 'ItemName') + '     UOM : ' + str(first, 'ItemUOMName'),
  columns: [
    { header: 'S.No', width: 22, cell: sn() },
    { header: 'Inward No', width: 50, cell: txt(r => str(r, 'PurchaseOrderReceivedNo'), 'center') },
    { header: 'Date', width: 50, cell: txt(r => ddmmyyyy(r.PurchaseOrderReceivedDate), 'center') },
    { header: 'Invoice', width: 55, cell: txt(r => str(r, 'InvoiceNo'), 'center') },
    { header: 'Supplier Name', width: '*', cell: txt(r => str(r, 'SupplierName'), 'left') },
    { header: 'Cost Head', width: '*', cell: txt(r => str(r, 'CostHeadName'), 'left') },
    { header: 'UOM', width: 36, cell: txt(r => str(r, 'ItemUOMName'), 'center') },
    { header: 'Qty', width: 50, cell: num(r => dec(r, 'Qty'), 3), totalKey: 'qty', totalDigits: 3 },
    { header: 'Rate', width: 50, cell: num(r => dec(r, 'Rate')) },
    { header: 'Amount', width: 55, cell: num(r => dec(r, 'Amount')), totalKey: 'amount' },
    { header: 'Discount', width: 48, cell: num(r => dec(r, 'DiscountAmount')), totalKey: 'discount' },
    { header: 'Tax', width: 48, cell: num(r => taxOf(r)), totalKey: 'tax' },
    { header: 'P&F Amt', width: 48, cell: num(r => dec(r, 'PFAmount')), totalKey: 'pf' },
    { header: 'Net Amt', width: 60, cell: num(r => dec(r, 'NetAmount')), totalKey: 'net' }
  ]
};

// ============================================================================
// DEPARTMENT WISE — grouped by DepartmentCode
// ============================================================================
const departmentWiseConfig = {
  title: 'INWARD DETAILS - DEPARTMENT WISE',
  summaryGroupHeader: 'Department',
  subLabelSpan: 7,
  groupKey: (r) => (r.DepartmentCode != null ? String(r.DepartmentCode) : '') + '||' + (str(r, 'DepartmentName') || '(Unknown Department)'),
  groupLabel: (first, key) => 'Department : ' + (key.split('||')[1] || '(Unknown Department)'),
  columns: [
    { header: 'S.No', width: 22, cell: sn() },
    { header: 'Inward No', width: 50, cell: txt(r => str(r, 'PurchaseOrderReceivedNo'), 'center') },
    { header: 'Date', width: 50, cell: txt(r => ddmmyyyy(r.PurchaseOrderReceivedDate), 'center') },
    { header: 'Invoice', width: 55, cell: txt(r => str(r, 'InvoiceNo'), 'center') },
    { header: 'Supplier Name', width: '*', cell: txt(r => str(r, 'SupplierName'), 'left') },
    { header: 'Item Name', width: '*', cell: txt(r => str(r, 'ItemName'), 'left') },
    { header: 'UOM', width: 36, cell: txt(r => str(r, 'ItemUOMName'), 'center') },
    { header: 'Qty', width: 50, cell: num(r => dec(r, 'Qty'), 3), totalKey: 'qty', totalDigits: 3 },
    { header: 'Rate', width: 50, cell: num(r => dec(r, 'Rate')) },
    { header: 'Amount', width: 55, cell: num(r => dec(r, 'Amount')), totalKey: 'amount' },
    { header: 'Discount', width: 48, cell: num(r => dec(r, 'DiscountAmount')), totalKey: 'discount' },
    { header: 'Tax', width: 48, cell: num(r => taxOf(r)), totalKey: 'tax' },
    { header: 'P&F Amt', width: 48, cell: num(r => dec(r, 'PFAmount')), totalKey: 'pf' },
    { header: 'Net Amt', width: 60, cell: num(r => dec(r, 'NetAmount')), totalKey: 'net' }
  ]
};

// ============================================================================
// CATEGORY WISE — grouped by ItemCategoryCode
// ============================================================================
const categoryWiseConfig = {
  title: 'INWARD DETAILS - CATEGORY WISE',
  summaryGroupHeader: 'Category',
  subLabelSpan: 7,
  groupKey: (r) => (r.ItemCategoryCode != null ? String(r.ItemCategoryCode) : '') + '||' + (str(r, 'ItemCategoryName') || '(Unknown Category)'),
  groupLabel: (first, key) => 'Category : ' + (key.split('||')[1] || '(Unknown Category)'),
  columns: [
    { header: 'S.No', width: 22, cell: sn() },
    { header: 'Inward No', width: 50, cell: txt(r => str(r, 'PurchaseOrderReceivedNo'), 'center') },
    { header: 'Date', width: 50, cell: txt(r => ddmmyyyy(r.PurchaseOrderReceivedDate), 'center') },
    { header: 'Invoice', width: 55, cell: txt(r => str(r, 'InvoiceNo'), 'center') },
    { header: 'Supplier Name', width: '*', cell: txt(r => str(r, 'SupplierName'), 'left') },
    { header: 'Item Name', width: '*', cell: txt(r => str(r, 'ItemName'), 'left') },
    { header: 'UOM', width: 36, cell: txt(r => str(r, 'ItemUOMName'), 'center') },
    { header: 'Qty', width: 50, cell: num(r => dec(r, 'Qty'), 3), totalKey: 'qty', totalDigits: 3 },
    { header: 'Rate', width: 50, cell: num(r => dec(r, 'Rate')) },
    { header: 'Amount', width: 55, cell: num(r => dec(r, 'Amount')), totalKey: 'amount' },
    { header: 'Discount', width: 48, cell: num(r => dec(r, 'DiscountAmount')), totalKey: 'discount' },
    { header: 'Tax', width: 48, cell: num(r => taxOf(r)), totalKey: 'tax' },
    { header: 'P&F Amt', width: 48, cell: num(r => dec(r, 'PFAmount')), totalKey: 'pf' },
    { header: 'Net Amt', width: 60, cell: num(r => dec(r, 'NetAmount')), totalKey: 'net' }
  ]
};

export const dateWise = { buildDocDefinition: makeBuilder(dateWiseConfig) };
export const supplierWise = { buildDocDefinition: makeBuilder(supplierWiseConfig) };
export const itemWise = { buildDocDefinition: makeBuilder(itemWiseConfig) };
export const departmentWise = { buildDocDefinition: makeBuilder(departmentWiseConfig) };
export const categoryWise = { buildDocDefinition: makeBuilder(categoryWiseConfig) };

export default { dateWise, supplierWise, itemWise, departmentWise, categoryWise };
