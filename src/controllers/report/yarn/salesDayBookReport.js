// reports/yarn/salesDayBookReport.js
// Yarn Sales Day Book report.
//   sp_SalesDayBook (CompanyCode, FromDate, ToDate)
//
// Exports: dateWise
//   buildDocDefinition(rows, companyName, fromDate, toDate, companyLogo)
//
// Mirrors rptSalesDayBook.rdlc (table4 "Invoice Details"): invoice rows grouped
// by Invoice Date with a per-date Total and a bottom Grand Total. A leading
// date-wise summary page (one row per invoice date + Net Total) is rendered
// first. Company logo on every title block; From / To date range.
//
// Note: the RDLC also embeds a separate "Yarn Stock And Sales Order" table that
// is fed by a different SP (sp_YarnStockAndSalesOrder); it is out of scope here
// since this endpoint runs the single sp_SalesDayBook procedure.

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

const cellText = (c, r, idx) => {
  if (c.kind === 'sno') return String(idx);
  if (c.kind === 'text') return str(r, c.key);
  if (c.kind === 'date') return ddmmyyyy(r[c.key]);
  const v = dec(r, c.key);
  return (c.kind === 'num') ? fmt(v, 2) : intFmt(v);
};
const totalText = (c, val) => (c.kind === 'num') ? fmt(val, 2) : intFmt(val);

// Aggregate a set of rows over the total columns; returns sums + row count
// (count drives 'avg' columns such as Rate).
const aggregate = (rowsArr, totalCols) => {
  const sums = {};
  for (const c of totalCols) sums[c.key] = 0;
  for (const r of rowsArr) for (const c of totalCols) sums[c.key] += dec(r, c.key);
  return { sums, count: rowsArr.length };
};
const aggValue = (c, sums, count) => (c.agg === 'avg' ? (count > 0 ? sums[c.key] / count : 0) : sums[c.key]);

const headerCells = (columns, fs) =>
  columns.map(c => ({ text: c.header, bold: true, fillColor: COLORS.headerFill, color: COLORS.headerText, alignment: 'center', fontSize: fs }));

// Leading summary page — one row per invoice date with the aggregated totals + Net Total.
function buildSummaryPage({ COLS, rows, config, companyName, dateLine, companyLogo }) {
  const fs = config.fontSize;
  const totalCols = COLS.filter(c => c.total);
  const summaryCols = [
    { header: 'S.No', width: 32, align: 'center' },
    { header: 'Invoice Date', width: 70, align: 'center' },
    ...totalCols.map(c => ({ header: c.header, width: c.width, kind: c.kind }))
  ];
  const body = [headerCells(summaryCols, fs)];

  const groupsMap = new Map();
  for (const r of rows) {
    const k = isoDate(r.InvoiceDate);
    if (!groupsMap.has(k)) groupsMap.set(k, { label: ddmmyyyy(r.InvoiceDate), rows: [] });
    groupsMap.get(k).rows.push(r);
  }
  const keys = [...groupsMap.keys()].sort((a, b) => a.localeCompare(b));

  let sno = 1;
  for (const key of keys) {
    const g = groupsMap.get(key);
    const { sums, count } = aggregate(g.rows, totalCols);
    const zebra = sno % 2 === 0 ? COLORS.zebraFill : null;
    const cells = [
      { text: String(sno), alignment: 'center', fontSize: fs, fillColor: zebra },
      { text: g.label, alignment: 'center', fontSize: fs, fillColor: zebra }
    ];
    for (const c of totalCols) cells.push({ text: totalText(c, aggValue(c, sums, count)), alignment: 'right', fontSize: fs, fillColor: zebra });
    body.push(cells);
    sno++;
  }

  const grand = aggregate(rows, totalCols);
  const totalRow = [
    { text: 'Net Total :', colSpan: 2, alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: fs },
    {}
  ];
  for (const c of totalCols) totalRow.push({ text: totalText(c, aggValue(c, grand.sums, grand.count)), alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: fs });
  body.push(totalRow);

  return [
    titleBlock(companyName, config.summaryTitle, dateLine, companyLogo),
    {
      table: { headerRows: 1, dontBreakRows: true, keepWithHeaderRows: 0, widths: summaryCols.map(c => c.width), body },
      layout: baseLayout
    }
  ];
}

function makeBuilder(config) {
  return function buildDocDefinition(rows, companyName, fromDate, toDate, companyLogo) {
    const COLS = config.columns;
    const colCount = COLS.length;
    const fs = config.fontSize;
    const totalCols = COLS.filter(c => c.total);
    const firstTotal = COLS.findIndex(c => c.total);
    const dateLine = `From Date : ${ddmmyyyy(fromDate)}    To Date : ${ddmmyyyy(toDate)}`;

    const body = [headerCells(COLS, fs)];

    const dataRow = (r, idx, zebra) =>
      COLS.map(c => ({ text: cellText(c, r, idx), alignment: c.align || 'left', fontSize: fs, fillColor: zebra }));

    const totalsRow = (label, sums, count, fill, color) => {
      const row = [{ text: label, colSpan: firstTotal, alignment: 'right', bold: true, color, fillColor: fill, fontSize: fs }];
      for (let k = 1; k < firstTotal; k++) row.push({});
      for (let i = firstTotal; i < COLS.length; i++) {
        const c = COLS[i];
        row.push(c.total
          ? { text: totalText(c, aggValue(c, sums, count)), alignment: 'right', bold: true, color, fillColor: fill, fontSize: fs }
          : { text: '', fillColor: fill });
      }
      return row;
    };

    const groupsMap = new Map();
    for (const r of rows) {
      const k = isoDate(r.InvoiceDate);
      if (!groupsMap.has(k)) groupsMap.set(k, { label: ddmmyyyy(r.InvoiceDate), rows: [] });
      groupsMap.get(k).rows.push(r);
    }
    const keys = [...groupsMap.keys()].sort((a, b) => a.localeCompare(b));

    for (const key of keys) {
      const g = groupsMap.get(key);
      if (config.showGroupHeader) {
        const ghr = [{ text: 'Date : ' + g.label, colSpan: colCount, bold: true, color: COLORS.groupText, fillColor: COLORS.groupFill, fontSize: fs + 1, margin: [2, 2, 0, 2] }];
        for (let i = 1; i < colCount; i++) ghr.push({});
        body.push(ghr);
      }
      const sorted = g.rows.slice().sort((a, b) => dec(a, 'InvoiceNo') - dec(b, 'InvoiceNo'));
      let idx = 1;
      for (const r of sorted) {
        body.push(dataRow(r, idx, idx % 2 === 0 ? COLORS.zebraFill : null));
        idx++;
      }
      const { sums, count } = aggregate(g.rows, totalCols);
      body.push(totalsRow('Total', sums, count, COLORS.subFill, COLORS.subText));
    }
    const grand = aggregate(rows, totalCols);
    body.push(totalsRow('Grand Total', grand.sums, grand.count, COLORS.grandFill, COLORS.grandText));

    const summaryNodes = buildSummaryPage({ COLS, rows, config, companyName, dateLine, companyLogo });
    const detailTitle = titleBlock(companyName, config.title, dateLine, companyLogo);
    detailTitle.pageBreak = 'before';

    return {
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [12, 18, 12, 40],
      footer: baseFooter,
      content: [
        ...summaryNodes,
        ...chartFromRows(rows, {
          groupKey: (r) => isoDate(r.InvoiceDate), groupLabel: (r) => ddmmyyyy(r.InvoiceDate),
          valueFn: (r) => dec(r, 'NetAmount'), valueHeader: 'Net Amount',
          groupHeader: 'Invoice Date', digits: 2
        }),
        detailTitle,
        {
          table: { headerRows: 1, dontBreakRows: true, keepWithHeaderRows: 0, widths: COLS.map(c => c.width), body },
          layout: baseLayout
        }
      ],
      defaultStyle: { font: 'Roboto', fontSize: fs, lineHeight: 1.15 }
    };
  };
}

// ============================================================================
// DATE WISE — invoice rows grouped by Invoice Date
// ============================================================================
const dateWiseConfig = {
  title: 'YARN SALES DAY BOOK',
  summaryTitle: 'YARN SALES DAY BOOK SUMMARY - DATE WISE',
  fontSize: 7,
  showGroupHeader: true,
  columns: [
    { header: 'S.No', width: 24, align: 'center', kind: 'sno' },
    { header: 'Invoice No', width: 48, align: 'center', key: 'InvoiceNo', kind: 'int' },
    { header: 'Invoice Date', width: 55, align: 'center', key: 'InvoiceDate', kind: 'date' },
    { header: 'Customer Name', width: '*', align: 'left', key: 'CustomerName', kind: 'text' },
    { header: 'Sales Type', width: 62, align: 'left', key: 'SalesType', kind: 'text' },
    { header: 'Item', width: 70, align: 'left', key: 'CountType', kind: 'text' },
    { header: 'Qty', width: 38, align: 'right', key: 'Qty', kind: 'int', total: true, agg: 'sum' },
    { header: 'Weight', width: 52, align: 'right', key: 'Weight', kind: 'num', total: true, agg: 'sum' },
    { header: 'Rate', width: 48, align: 'right', key: 'Rate', kind: 'num', total: true, agg: 'avg' },
    { header: 'Basic Amount', width: 68, align: 'right', key: 'Basic', kind: 'num', total: true, agg: 'sum' },
    { header: 'Tax', width: 48, align: 'left', key: 'Tax', kind: 'text' },
    { header: 'Loading', width: 48, align: 'right', key: 'LoadingCharges', kind: 'num' },
    { header: 'TCS %', width: 38, align: 'right', key: 'TCSPer', kind: 'num' },
    { header: 'TCS Amt', width: 48, align: 'right', key: 'TCSAmt', kind: 'num', total: true, agg: 'sum' },
    { header: 'RND', width: 42, align: 'right', key: 'RoundOff', kind: 'num', total: true, agg: 'sum' },
    { header: 'Net Amount', width: 70, align: 'right', key: 'NetAmount', kind: 'num', total: true, agg: 'sum' }
  ]
};

export const dateWise = { buildDocDefinition: makeBuilder(dateWiseConfig) };

export default { dateWise };
