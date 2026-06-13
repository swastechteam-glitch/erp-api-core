// reports/store/grnBillPassing.js
// Store GRN Bill Passing reports sharing one SP and one builder factory.
//   sp_StoreGRNApproval_GetAll (CompanyCode, FromDate, ToDate)
//
// Exports: dateWise, supplierWise
// Each exports { buildDocDefinition(rows, companyName, fromDate, toDate, companyLogo) }.
//
// Mirrors:
//   rptStoreGRNBillPassingDetails_Arun.rdlc          -> dateWise     (grouped by Approval Date)
//   rptStoreGRNBillPassingDetailsSupplierWise.rdlc   -> supplierWise (grouped by Supplier)
//
// Each renders a leading summary page (one row per group: Net Amount + Payment +
// Net Total), then the grouped detail with a per-group Total and a Grand Total.
// Company logo on every title block; From / To date range.

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

// Numeric value of a column for a row — supports computed columns.
const val = (c, r) => (typeof c.compute === 'function' ? c.compute(r) : dec(r, c.key));

const cellText = (c, r, idx) => {
  if (c.kind === 'sno') return String(idx);
  if (c.kind === 'text') return str(r, c.key);
  if (c.kind === 'date') return ddmmyyyy(r[c.key]);
  const v = val(c, r);
  return (c.kind === 'num') ? fmt(v, 2) : intFmt(v);
};
const totalText = (c, v) => (c.kind === 'num') ? fmt(v, 2) : intFmt(v);

const headerCells = (headers, fs) =>
  headers.map(h => ({ text: h, bold: true, fillColor: COLORS.headerFill, color: COLORS.headerText, alignment: 'center', fontSize: fs }));

// Leading summary page — one row per group (Net Amount + Payment) + Net Total.
function buildSummaryPage({ COLS, rows, config, companyName, dateLine, companyLogo }) {
  const fs = config.fontSize;
  const totalCols = COLS.filter(c => c.total);
  const summaryCols = [
    { header: 'S.No', width: 36, align: 'center' },
    { header: config.summaryGroupHeader, width: '*', align: 'left' },
    ...totalCols.map(c => ({ header: c.header, width: config.summaryColWidth || 110, kind: c.kind }))
  ];
  const body = [headerCells(summaryCols, fs)];

  const groupsMap = new Map();
  for (const r of rows) {
    const k = config.groupKey(r);
    if (!groupsMap.has(k)) groupsMap.set(k, { label: config.groupLabel(r), rows: [] });
    groupsMap.get(k).rows.push(r);
  }
  const keys = [...groupsMap.keys()].sort(config.sortKeys || ((a, b) => a.localeCompare(b)));

  const grand = {};
  for (const c of totalCols) grand[c.key] = 0;

  let sno = 1;
  for (const key of keys) {
    const g = groupsMap.get(key);
    const sums = {};
    for (const c of totalCols) sums[c.key] = 0;
    for (const r of g.rows) for (const c of totalCols) sums[c.key] += val(c, r);
    const zebra = sno % 2 === 0 ? COLORS.zebraFill : null;
    const cells = [
      { text: String(sno), alignment: 'center', fontSize: fs, fillColor: zebra },
      { text: g.label, alignment: 'left', fontSize: fs, fillColor: zebra }
    ];
    for (const c of totalCols) {
      cells.push({ text: totalText(c, sums[c.key]), alignment: 'right', fontSize: fs, fillColor: zebra });
      grand[c.key] += sums[c.key];
    }
    body.push(cells);
    sno++;
  }

  const totalRow = [
    { text: 'Net Total :', colSpan: 2, alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: fs },
    {}
  ];
  for (const c of totalCols) totalRow.push({ text: totalText(c, grand[c.key]), alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: fs });
  body.push(totalRow);

  return [
    titleBlock(companyName, config.summaryTitle, dateLine, companyLogo),
    { table: { headerRows: 1, dontBreakRows: true, keepWithHeaderRows: 0, widths: summaryCols.map(c => c.width), body }, layout: baseLayout }
  ];
}

function makeBuilder(config) {
  return function buildDocDefinition(rows, companyName, fromDate, toDate, companyLogo) {
    const COLS = config.columns;
    const colCount = COLS.length;
    const fs = config.fontSize;
    const firstTotal = COLS.findIndex(c => c.total);
    const dateLine = config.hideDateLine ? '' : `From : ${ddmmyyyy(fromDate)}    To : ${ddmmyyyy(toDate)}`;

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
      const sorted = g.rows.slice().sort((a, b) => dec(a, 'PurchaseOrderReceivedNo') - dec(b, 'PurchaseOrderReceivedNo'));
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

    const summaryNodes = config.summary === false
      ? []
      : buildSummaryPage({ COLS, rows, config, companyName, dateLine, companyLogo });
    const detailTitle = titleBlock(companyName, config.title, dateLine, companyLogo);
    if (summaryNodes.length) detailTitle.pageBreak = 'before';

    return {
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [12, 18, 12, 40],
      footer: baseFooter,
      content: [
        ...summaryNodes,
        detailTitle,
        { table: { headerRows: 1, dontBreakRows: true, keepWithHeaderRows: 0, widths: COLS.map(c => c.width), body }, layout: baseLayout }
      ],
      defaultStyle: { font: 'Roboto', fontSize: fs, lineHeight: 1.2 }
    };
  };
}

const netAmt = { key: 'TotalNetAmount', header: 'Net Amount', width: 70, align: 'right', kind: 'num', total: true };
const payment = { key: 'Amount', header: 'Payment', width: 70, align: 'right', kind: 'num', total: true };

// ============================================================================
// DATE WISE — grouped by Approval Date
// ============================================================================
const dateWiseConfig = {
  title: 'GRN BILL PASSING DETAILS - DATE WISE',
  summaryTitle: 'GRN BILL PASSING SUMMARY - DATE WISE',
  summaryGroupHeader: 'Approval Date',
  fontSize: 8,
  groupKey: (r) => isoDate(r.ApprovalDate),
  groupLabel: (r) => 'Approval Date : ' + ddmmyyyy(r.ApprovalDate),
  sortKeys: (a, b) => a.localeCompare(b),
  columns: [
    { header: 'S.No', width: 26, align: 'center', kind: 'sno' },
    { header: 'Inward No', width: 55, align: 'center', key: 'PurchaseOrderReceivedNo', kind: 'int' },
    { header: 'Inward Date', width: 60, align: 'center', key: 'PurchaseOrderReceivedDate', kind: 'date' },
    { header: 'Supplier Name', width: '*', align: 'left', key: 'SupplierName', kind: 'text' },
    { header: 'Invoice No', width: 70, align: 'center', key: 'InvoiceNo', kind: 'text' },
    { header: 'Invoice Date', width: 60, align: 'center', key: 'InvoiceDate', kind: 'date' },
    netAmt,
    { header: 'Cheque No', width: 55, align: 'center', key: 'ChequeNo', kind: 'text' },
    { header: 'Cheque Date', width: 60, align: 'center', key: 'ChequeDate', kind: 'date' },
    { header: 'Bank Name', width: '*', align: 'left', key: 'BankName', kind: 'text' },
    { header: 'Account No', width: 80, align: 'left', key: 'AccountNo', kind: 'text' },
    payment
  ]
};

// ============================================================================
// SUPPLIER WISE — grouped by Supplier
// ============================================================================
const supplierWiseConfig = {
  title: 'GRN BILL PASSING DETAILS - SUPPLIER WISE',
  summaryTitle: 'GRN BILL PASSING SUMMARY - SUPPLIER WISE',
  summaryGroupHeader: 'Supplier Name',
  fontSize: 8,
  groupKey: (r) => (r.SupplierCode != null ? String(r.SupplierCode) : '') + '||' + (str(r, 'SupplierName') || '(Unknown)'),
  groupLabel: (r) => str(r, 'SupplierName') || '(Unknown)',
  sortKeys: (a, b) => (a.split('||')[1] || '').localeCompare(b.split('||')[1] || ''),
  columns: [
    { header: 'S.No', width: 26, align: 'center', kind: 'sno' },
    { header: 'Approval Date', width: 60, align: 'center', key: 'ApprovalDate', kind: 'date' },
    { header: 'Inward No', width: 50, align: 'center', key: 'PurchaseOrderReceivedNo', kind: 'int' },
    { header: 'Inward Date', width: 60, align: 'center', key: 'PurchaseOrderReceivedDate', kind: 'date' },
    { header: 'Gate Pass No', width: 55, align: 'center', key: 'GatePassNo', kind: 'int' },
    { header: 'Invoice No', width: 65, align: 'center', key: 'InvoiceNo', kind: 'text' },
    { header: 'Invoice Date', width: 60, align: 'center', key: 'InvoiceDate', kind: 'date' },
    { header: 'Supplier Name', width: '*', align: 'left', key: 'SupplierName', kind: 'text' },
    netAmt,
    { header: 'Cheque No', width: 52, align: 'center', key: 'ChequeNo', kind: 'text' },
    { header: 'Cheque Date', width: 60, align: 'center', key: 'ChequeDate', kind: 'date' },
    { header: 'Bank Name', width: '*', align: 'left', key: 'BankName', kind: 'text' },
    { header: 'Account No', width: 75, align: 'left', key: 'AccountNo', kind: 'text' },
    payment
  ]
};

// ============================================================================
// GRN APPROVAL PENDING — sp_StoreGRNApproval_Pending, grouped by Supplier.
// A pending list (no leading summary page) with a per-supplier Total + Grand Total.
// ============================================================================
const pendingConfig = {
  title: 'GRN APPROVAL PENDING',
  summary: false,
  hideDateLine: true,
  fontSize: 7,
  groupKey: (r) => (r.SupplierCode != null ? String(r.SupplierCode) : '') + '||' + (str(r, 'SupplierName') || '(Unknown)'),
  groupLabel: (r) => str(r, 'SupplierName') || '(Unknown)',
  sortKeys: (a, b) => (a.split('||')[1] || '').localeCompare(b.split('||')[1] || ''),
  columns: [
    { header: 'S.No', width: 24, align: 'center', kind: 'sno' },
    { header: 'Inward No', width: 48, align: 'center', key: 'PurchaseOrderReceivedNo', kind: 'int' },
    { header: 'Inward Date', width: 55, align: 'center', key: 'PurchaseOrderReceivedDate', kind: 'date' },
    { header: 'DC No', width: 50, align: 'center', key: 'DCNo', kind: 'text' },
    { header: 'DC Date', width: 55, align: 'center', key: 'DCDate', kind: 'date' },
    { header: 'Invoice No', width: 55, align: 'center', key: 'InvoiceNo', kind: 'text' },
    { header: 'Invoice Date', width: 55, align: 'center', key: 'InvoiceDate', kind: 'date' },
    { header: 'Supplier Name', width: '*', align: 'left', key: 'SupplierName', kind: 'text' },
    { header: 'Total Qty', width: 45, align: 'right', key: 'TotalQty', kind: 'num', total: true },
    { header: 'Total Amount', width: 60, align: 'right', key: 'TotalAmount', kind: 'num', total: true },
    { header: 'Discount', width: 50, align: 'right', key: 'TotalDiscountAmount', kind: 'num', total: true },
    { header: 'Other Chrg', width: 50, align: 'right', key: 'TotalOtherExpenses', kind: 'num', total: true },
    { header: 'Gross Amount', width: 62, align: 'right', kind: 'num', total: true, key: 'GrossAmount', compute: (r) => dec(r, 'TotalGrossAmount') + dec(r, 'TotalOtherExpenses') },
    { header: 'Tax Amount', width: 55, align: 'right', key: 'TotalTaxAmount', kind: 'num', total: true },
    { header: 'PF Amount', width: 50, align: 'right', key: 'TotalPFAmount', kind: 'num', total: true },
    { header: 'Net Amount', width: 62, align: 'right', key: 'TotalNetAmount', kind: 'num', total: true }
  ]
};

export const dateWise = { buildDocDefinition: makeBuilder(dateWiseConfig) };
export const supplierWise = { buildDocDefinition: makeBuilder(supplierWiseConfig) };
export const pending = { buildDocDefinition: makeBuilder(pendingConfig) };

export default { dateWise, supplierWise, pending };
