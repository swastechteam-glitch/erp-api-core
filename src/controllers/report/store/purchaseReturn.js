// reports/store/purchaseReturn.js
// Store Purchase Return Details reports.
//   sp_PurchaseReturnDetails_GetAll (CompanyCode, FromDate, ToDate)
//
// Exports: dateWise, supplierWise
// Each exports { buildDocDefinition(rows, companyName, fromDate, toDate, companyLogo) }.
//
// Mirrors:
//   rptPurchaseReturnDetailsDateWise.rdlc       -> dateWise     (grouped by Purchase Return Date)
//   rptPurchaseReturnDetailsSupplierWise.rdlc   -> supplierWise (grouped by Supplier)
//
// Item-level detail grouped by date / supplier with a per-group Total and a
// bottom Grand Total. Tax Amt = CGST + SGST + IGST (computed). Company logo +
// From / To date range. (No leading summary page — matches the RDLCs.)

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
const isoDate = (d) => {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '0000-00-00';
  return dt.toISOString().slice(0, 10);
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
  paddingLeft: () => 2,
  paddingRight: () => 2,
  paddingTop: () => 3,
  paddingBottom: () => 3
};

const baseFooter = (currentPage, pageCount) => ({
  margin: [0, 12, 0, 0],
  columns: [
    { text: 'Report Printed : ' + new Date().toLocaleString('en-GB'), fontSize: 7, margin: [15, 0, 0, 0] },
    { text: `Page ${currentPage} of ${pageCount}`, alignment: 'right', fontSize: 7, margin: [0, 0, 15, 0] }
  ]
});

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

const val = (c, r) => (typeof c.compute === 'function' ? c.compute(r) : dec(r, c.key));

const cellText = (c, r, idx) => {
  if (c.kind === 'sno') return String(idx);
  if (c.kind === 'text') return str(r, c.key);
  if (c.kind === 'date') return ddmmyyyy(r[c.key]);
  const v = val(c, r);
  if (c.kind === 'qty') return fmt(v, 3);
  return (c.kind === 'num') ? fmt(v, 2) : intFmt(v);
};
const totalText = (c, v) => (c.kind === 'qty') ? fmt(v, 3) : (c.kind === 'num') ? fmt(v, 2) : intFmt(v);

const headerCells = (headers, fs) =>
  headers.map(h => ({ text: h, bold: true, fillColor: COLORS.headerFill, color: COLORS.headerText, alignment: 'center', fontSize: fs }));

function makeBuilder(config) {
  return function buildDocDefinition(rows, companyName, fromDate, toDate, companyLogo) {
    const COLS = config.columns;
    const colCount = COLS.length;
    const fs = config.fontSize;
    const firstTotal = COLS.findIndex(c => c.total);
    const sortField = config.sortField || 'PurchaseReturnNo';
    const dateLine = `From : ${ddmmyyyy(fromDate)}    To : ${ddmmyyyy(toDate)}`;

    const body = [headerCells(COLS.map(c => c.header), fs)];

    const dataRow = (r, idx, zebra) =>
      COLS.map(c => ({ text: cellText(c, r, idx), alignment: c.align || 'left', fontSize: fs, fillColor: zebra }));

    const totalsRow = (label, totals, fill, color) => {
      const row = [{ text: label, colSpan: firstTotal, alignment: 'right', bold: true, color, fillColor: fill, fontSize: fs }];
      for (let k = 1; k < firstTotal; k++) row.push({});
      for (let i = firstTotal; i < COLS.length; i++) {
        const c = COLS[i];
        row.push(c.total
          ? { text: totalText(c, totals[c.key] || 0), alignment: 'right', bold: true, color, fillColor: fill, fontSize: fs }
          : { text: '', fillColor: fill });
      }
      return row;
    };

    const groupsMap = new Map();
    for (const r of rows) {
      const k = config.groupKey(r);
      if (!groupsMap.has(k)) groupsMap.set(k, { label: config.groupLabel(r), rows: [] });
      groupsMap.get(k).rows.push(r);
    }
    const keys = [...groupsMap.keys()].sort(config.sortKeys || ((a, b) => a.localeCompare(b)));

    const grand = {};
    for (const c of COLS) if (c.total) grand[c.key] = 0;

    for (const key of keys) {
      const g = groupsMap.get(key);
      const ghr = [{ text: g.label, colSpan: colCount, bold: true, color: COLORS.groupText, fillColor: COLORS.groupFill, fontSize: fs + 1, margin: [2, 2, 0, 2] }];
      for (let i = 1; i < colCount; i++) ghr.push({});
      body.push(ghr);

      const sub = {};
      for (const c of COLS) if (c.total) sub[c.key] = 0;
      const sorted = g.rows.slice().sort((a, b) => dec(a, sortField) - dec(b, sortField));
      let idx = 1;
      for (const r of sorted) {
        body.push(dataRow(r, idx, idx % 2 === 0 ? COLORS.zebraFill : null));
        for (const c of COLS) if (c.total) sub[c.key] += val(c, r);
        idx++;
      }
      body.push(totalsRow('Total', sub, COLORS.subFill, COLORS.subText));
      for (const c of COLS) if (c.total) grand[c.key] += sub[c.key];
    }
    body.push(totalsRow('Grand Total', grand, COLORS.grandFill, COLORS.grandText));

    return {
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [10, 16, 10, 36],
      footer: baseFooter,
      content: [
        titleBlock(companyName, config.title, dateLine, companyLogo),
        { table: { headerRows: 1, dontBreakRows: true, keepWithHeaderRows: 0, widths: COLS.map(c => c.width), body }, layout: baseLayout }
      ],
      defaultStyle: { font: 'Roboto', fontSize: fs, lineHeight: 1.15 }
    };
  };
}

// shared columns
const itemCols = [
  { header: 'Cost Head', width: 65, align: 'left', key: 'CostHeadName', kind: 'text' },
  { header: 'Item Name', width: '*', align: 'left', key: 'ItemName', kind: 'text' },
  { header: 'UOM', width: 40, align: 'center', key: 'ItemUomName', kind: 'text' },
  { header: 'Qty', width: 46, align: 'right', key: 'Qty', kind: 'qty' },
  { header: 'Rate', width: 46, align: 'right', key: 'Rate', kind: 'num' },
  { header: 'Amount', width: 58, align: 'right', key: 'Amount', kind: 'num', total: true },
  { header: 'Disc.', width: 46, align: 'right', key: 'DiscountAmount', kind: 'num', total: true },
  { header: 'P&F Amt', width: 44, align: 'right', key: 'PFAmount', kind: 'num', total: true },
  { header: 'Other Chrg', width: 50, align: 'right', key: 'OtherExpenses', kind: 'num', total: true },
  { header: 'Gross Amt', width: 58, align: 'right', key: 'GrossAmount', kind: 'num', total: true },
  { header: 'Tax Amt', width: 52, align: 'right', kind: 'num', total: true, key: 'TaxAmt', compute: (r) => dec(r, 'CGSTAmount') + dec(r, 'SGSTAmount') + dec(r, 'IGSTAmount') },
  { header: 'Net Amount', width: 62, align: 'right', key: 'NetAmount', kind: 'num', total: true }
];

// ============================================================================
// DATE WISE — grouped by Purchase Return Date
// ============================================================================
const dateWiseConfig = {
  title: 'PURCHASE RETURN DETAILS - DATE WISE',
  fontSize: 7,
  groupKey: (r) => isoDate(r.PurchaseReturnDate),
  groupLabel: (r) => 'Return Date : ' + ddmmyyyy(r.PurchaseReturnDate),
  sortKeys: (a, b) => a.localeCompare(b),
  columns: [
    { header: 'S.No', width: 24, align: 'center', kind: 'sno' },
    { header: 'Return No', width: 46, align: 'center', key: 'PurchaseReturnNo', kind: 'int' },
    { header: 'Inw. No', width: 46, align: 'center', key: 'PurchaseOrderReceivedNo', kind: 'int' },
    { header: 'Inw. Date', width: 52, align: 'center', key: 'PurchaseOrderReceivedDate', kind: 'date' },
    { header: 'Supplier', width: '*', align: 'left', key: 'SupplierName', kind: 'text' },
    ...itemCols
  ]
};

// ============================================================================
// SUPPLIER WISE — grouped by Supplier
// ============================================================================
const supplierWiseConfig = {
  title: 'PURCHASE RETURN DETAILS - SUPPLIER WISE',
  fontSize: 7,
  groupKey: (r) => (r.SupplierCode != null ? String(r.SupplierCode) : '') + '||' + (str(r, 'SupplierName') || '(Unknown)'),
  groupLabel: (r) => str(r, 'SupplierName') || '(Unknown)',
  sortKeys: (a, b) => (a.split('||')[1] || '').localeCompare(b.split('||')[1] || ''),
  columns: [
    { header: 'S.No', width: 24, align: 'center', kind: 'sno' },
    { header: 'Return No', width: 46, align: 'center', key: 'PurchaseReturnNo', kind: 'int' },
    { header: 'Return Date', width: 52, align: 'center', key: 'PurchaseReturnDate', kind: 'date' },
    { header: 'Inw. No', width: 46, align: 'center', key: 'PurchaseOrderReceivedNo', kind: 'int' },
    { header: 'Inw. Date', width: 52, align: 'center', key: 'PurchaseOrderReceivedDate', kind: 'date' },
    ...itemCols
  ]
};

export const dateWise = { buildDocDefinition: makeBuilder(dateWiseConfig) };
export const supplierWise = { buildDocDefinition: makeBuilder(supplierWiseConfig) };

export default { dateWise, supplierWise };
