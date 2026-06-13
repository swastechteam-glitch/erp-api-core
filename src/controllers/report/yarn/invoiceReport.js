// reports/yarn/invoiceReport.js
// Five Yarn Sales Invoice reports sharing one SP and one builder factory.
//   sp_InvoiceDetails_GetAll (CompanyCode, FromDate, ToDate)
//
// Exports: dateWise, customerWise, agentWise, countWise, avgRateCountWise
// Each exports { buildDocDefinition(rows, companyName, fromDate, toDate) }.
//
// Mirrors rptInvoiceDateWise / *CustomerWise / *AgentWise / *CountWise.rdlc
// (each "Sales Report" variant has the same wide column set, just a different
// grouping dimension) plus rptAvgRate_CountWise.rdlc which is a thin
// count-summary table (no per-invoice rows).

import { buildTrendChart } from '../cotton/_common.js';

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

// Tax = TNGST + CGST + SGST + IGST per row (RDLC computes it the same way).
const taxOf = (r) =>
  dec(r, 'TNGSTValue') + dec(r, 'Item_CGSTAmount') + dec(r, 'Item_SGSTAmount') + dec(r, 'Item_IGSTAmount');

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
  paddingTop: () => 5,
  paddingBottom: () => 5
};

const baseFooter = (currentPage, pageCount) => ({
  margin: [0, 12, 0, 0],
  columns: [
    { text: 'Report Printed : ' + new Date().toLocaleString('en-GB'), fontSize: 7, margin: [15, 0, 0, 0] },
    { text: `Page ${currentPage} of ${pageCount}`, alignment: 'right', fontSize: 7, margin: [0, 0, 15, 0] }
  ]
});

// Title block — logo on the left, centred company/title/date in the middle.
// Mirror spacer column on the right keeps the heading optically centred even
// when the logo is wider than expected.
const LOGO_COL_WIDTH = 80;
const titleBlock = (companyName, title, fromDate, toDate, companyLogo) => {
  const logoCol = companyLogo
    ? { image: companyLogo, fit: [70, 70], width: LOGO_COL_WIDTH, alignment: 'left', margin: [4, 0, 0, 0] }
    : { text: '', width: LOGO_COL_WIDTH };
  return {
    columns: [
      logoCol,
      {
        width: '*',
        stack: [
          { text: companyName, alignment: 'center', fontSize: 16, bold: true, color: '#7B3F00', margin: [0, 0, 0, 6] },
          { text: title, alignment: 'center', fontSize: 12, bold: true, color: '#008000', margin: [0, 0, 0, 6] },
          { text: `From Date : ${ddmmyyyy(fromDate)}    To Date : ${ddmmyyyy(toDate)}`, alignment: 'center', fontSize: 10, bold: true }
        ]
      },
      { text: '', width: LOGO_COL_WIDTH }
    ],
    margin: [0, 0, 0, 10]
  };
};

// Per-group summary table — one row per group, each totalled column,
// plus a Total footer row. Rendered on its own page before the detail.
function buildSummaryPage({ companyName, companyLogo, fromDate, toDate, title, groupHeader, groupSummaries, grandTotals, totalCols }) {
  const summaryTitle = (title || '').replace(/REPORT/gi, 'SUMMARY');
  const hdr = (text) => ({ text, bold: true, fillColor: COLORS.headerFill, color: COLORS.headerText, alignment: 'center', fontSize: 8 });

  const headerRow = [hdr('S.No'), hdr(groupHeader), ...totalCols.map(c => hdr(c.header))];

  const dataRows = groupSummaries.map((gs, i) => {
    const zebra = i % 2 === 1 ? COLORS.zebraFill : null;
    return [
      { text: String(i + 1), alignment: 'center', fontSize: 8, fillColor: zebra },
      { text: gs.label, alignment: 'left', fontSize: 8, fillColor: zebra },
      ...totalCols.map(c => ({
        text: c.totalFmt ? c.totalFmt(gs.totals[c.totalKey] || 0) : fmt(gs.totals[c.totalKey] || 0, c.totalDigits != null ? c.totalDigits : 2),
        alignment: 'right', fontSize: 8, fillColor: zebra
      }))
    ];
  });

  const totalRow = [
    { text: 'Total', colSpan: 2, alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: 9 },
    {},
    ...totalCols.map(c => ({
      text: c.totalFmt ? c.totalFmt(grandTotals[c.totalKey] || 0) : fmt(grandTotals[c.totalKey] || 0, c.totalDigits != null ? c.totalDigits : 2),
      alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: 9
    }))
  ];

  const widths = [30, '*', ...totalCols.map(() => 65)];

  return [
    titleBlock(companyName, summaryTitle, fromDate, toDate, companyLogo),
    {
      table: { headerRows: 1, dontBreakRows: true, widths, body: [headerRow, ...dataRows, totalRow] },
      layout: baseLayout
    },
    ...buildTrendChart(groupSummaries, totalCols, { groupHeader })
  ];
}

// ============================================================================
// Generic builder — used by the four "Sales Report" variants
// ============================================================================
function makeBuilder(config) {
  return function buildDocDefinition(rows, companyName, fromDate, toDate, companyLogo) {

    const groupsMap = new Map();
    for (const r of rows) {
      const k = config.groupKey(r);
      if (!groupsMap.has(k)) groupsMap.set(k, []);
      groupsMap.get(k).push(r);
    }
    const sortedKeys = [...groupsMap.keys()].sort((a, b) => {
      const an = a.split('||')[0] || '';
      const bn = b.split('||')[0] || '';
      return an.localeCompare(bn);
    });

    const COLS = config.columns;
    const colCount = COLS.length;
    const body = [];

    body.push(COLS.map(c => ({
      text: c.header, bold: true, fillColor: COLORS.headerFill,
      color: COLORS.headerText, alignment: 'center', fontSize: 7
    })));

    const totals = {};
    const groupSummaries = [];
    let sno = 1;

    for (const key of sortedKeys) {
      const group = groupsMap.get(key).slice().sort((a, b) => {
        const da = new Date(a.BillDate).getTime() || 0;
        const db = new Date(b.BillDate).getTime() || 0;
        if (da !== db) return da - db;
        return dec(a, 'BillNo') - dec(b, 'BillNo');
      });
      const groupLabel = config.groupLabel(group[0], key);

      const blank = new Array(colCount - 1).fill({});
      body.push([
        { text: groupLabel, colSpan: colCount, bold: true, color: COLORS.groupText, fillColor: COLORS.groupFill, fontSize: 9, margin: [2, 2, 0, 2] },
        ...blank
      ]);

      const sub = {};

      let rowIdx = 0;
      for (const r of group) {
        for (const c of COLS) {
          if (c.totalKey && typeof c.totalFn === 'function') {
            sub[c.totalKey] = (sub[c.totalKey] || 0) + c.totalFn(r);
          }
        }

        const zebra = rowIdx % 2 === 1 ? COLORS.zebraFill : null;
        const ctx = { r, sno, zebra };
        body.push(COLS.map(c => c.cell(ctx)));
        sno++;
        rowIdx++;
      }

      // Sub Total
      const subRow = COLS.map((c, i) => {
        if (i === 0) {
          return { text: 'Sub Total', colSpan: config.subLabelSpan, alignment: 'right', bold: true, color: COLORS.subText, fillColor: COLORS.subFill, fontSize: 7 };
        }
        if (i > 0 && i < config.subLabelSpan) return {};
        const tkey = c.totalKey;
        if (!tkey) return { text: '', fillColor: COLORS.subFill };
        return { text: c.totalFmt ? c.totalFmt(sub[tkey] || 0) : fmt(sub[tkey] || 0, c.totalDigits || 2), alignment: 'right', bold: true, color: COLORS.subText, fillColor: COLORS.subFill, fontSize: 7 };
      });
      body.push(subRow);

      groupSummaries.push({ label: stripPrefix(groupLabel), totals: sub });

      for (const k of Object.keys(sub)) {
        totals[k] = (totals[k] || 0) + sub[k];
      }
    }

    // Grand Total
    const grandRow = COLS.map((c, i) => {
      if (i === 0) {
        return { text: 'Grand Total', colSpan: config.subLabelSpan, alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: 8 };
      }
      if (i > 0 && i < config.subLabelSpan) return {};
      const tkey = c.totalKey;
      if (!tkey) return { text: '', fillColor: COLORS.grandFill };
      return { text: c.totalFmt ? c.totalFmt(totals[tkey] || 0) : fmt(totals[tkey] || 0, c.totalDigits || 2), alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: 8 };
    });
    body.push(grandRow);

    // Build the summary page from collected group totals.
    const totalCols = COLS.filter(c => c.totalKey);
    const summaryNodes = buildSummaryPage({
      companyName, companyLogo, fromDate, toDate,
      title: config.title,
      groupHeader: config.summaryGroupHeader || 'Group',
      groupSummaries,
      grandTotals: totals,
      totalCols
    });

    // Detail title with pageBreak so it lands on a new page after summary.
    const detailTitle = titleBlock(companyName, config.title, fromDate, toDate, companyLogo);
    detailTitle.pageBreak = 'before';

    return {
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [12, 18, 12, 40],
      footer: baseFooter,
      content: [
        ...summaryNodes,
        detailTitle,
        {
          table: {
            headerRows: 1,
            dontBreakRows: true,
            keepWithHeaderRows: 0,
            widths: COLS.map(c => c.width),
            body: body
          },
          layout: baseLayout
        }
      ],
      defaultStyle: { font: 'Roboto', fontSize: 7, lineHeight: 1.2 }
    };
  };
}

// Strip the "Date : " / "Customer : " / etc. prefix off a group label so the
// summary table column reads cleanly.
const stripPrefix = (label) => {
  const idx = label.indexOf(' : ');
  return idx >= 0 ? label.slice(idx + 3).trim() : label;
};

// ---- per-cell helpers ----
const txt = (val, align = 'left') => (ctx) => ({
  text: String(val(ctx.r) ?? ''), alignment: align, fontSize: 7, fillColor: ctx.zebra
});
const num = (getVal, digits = 2) => (ctx) => ({
  text: fmt(getVal(ctx.r), digits), alignment: 'right', fontSize: 7, fillColor: ctx.zebra
});
const intNum = (getVal) => (ctx) => ({
  text: intFmt(getVal(ctx.r)), alignment: 'right', fontSize: 7, fillColor: ctx.zebra
});
const sn = () => (ctx) => ({
  text: String(ctx.sno), alignment: 'center', fontSize: 7, fillColor: ctx.zebra
});

// Shared totals declarations across all four variants:
//   qty, weight, basic, tax, freight, tcsTaxable, tcsAmt, roundOff, netAmount
const totalColsBase = {
  qty: { totalKey: 'qty', totalFmt: intFmt, totalFn: r => dec(r, 'Qty') },
  weight: { totalKey: 'weight', totalDigits: 3, totalFn: r => dec(r, 'Weight') },
  basic: { totalKey: 'basic', totalFn: r => dec(r, 'BasicAmount') },
  tax: { totalKey: 'tax', totalFn: r => taxOf(r) },
  freight: { totalKey: 'freight', totalFn: r => dec(r, 'Item_FreightAmount') },
  tcsTaxable: { totalKey: 'tcsTaxable', totalFn: r => dec(r, 'TCSTaxableAmount') },
  tcsAmt: { totalKey: 'tcsAmt', totalFn: r => dec(r, 'Item_TSCAmount') },
  roundOff: { totalKey: 'roundOff', totalFn: r => dec(r, 'RoundOff') },
  netAmount: { totalKey: 'netAmount', totalFn: r => dec(r, 'Item_NetAmount') }
};

// ============================================================================
// DATE WISE — grouped by BillDate
// ============================================================================
const dateWiseConfig = {
  title: 'SALES REPORT - DATE WISE',
  summaryGroupHeader: 'Bill Date',
  subLabelSpan: 7,
  groupKey: (r) => isoDate(r.BillDate) + '||' + ddmmyyyy(r.BillDate),
  groupLabel: (first) => 'Date : ' + ddmmyyyy(first.BillDate),
  columns: [
    { header: 'S.No', width: 22, cell: sn() },
    { header: 'SO No', width: 42, cell: txt(r => str(r, 'SONo'), 'center') },
    { header: 'SO Date', width: 50, cell: txt(r => ddmmyyyy(r.SODate), 'center') },
    { header: 'Inv. No', width: 42, cell: txt(r => str(r, 'strInvoiceNo'), 'center') },
    { header: 'Customer', width: '*', cell: txt(r => str(r, 'CustomerName')) },
    { header: 'Sales Type', width: 55, cell: txt(r => str(r, 'SalesType')) },
    { header: 'Count', width: 42, cell: txt(r => str(r, 'Count'), 'center') },
    { header: 'Bags', width: 30, cell: intNum(r => dec(r, 'Qty')), ...totalColsBase.qty },
    { header: 'Weight', width: 48, cell: num(r => dec(r, 'Weight'), 3), ...totalColsBase.weight },
    { header: 'Rate', width: 40, cell: num(r => dec(r, 'RateEx'), 2) },
    { header: 'Basic', width: 55, cell: num(r => dec(r, 'BasicAmount')), ...totalColsBase.basic },
    { header: 'Tax', width: 50, cell: num(r => taxOf(r)), ...totalColsBase.tax },
    { header: 'Fright', width: 40, cell: num(r => dec(r, 'Item_FreightAmount')), ...totalColsBase.freight },
    { header: 'TCS Tax Amt', width: 50, cell: num(r => dec(r, 'TCSTaxableAmount')), ...totalColsBase.tcsTaxable },
    { header: 'TCS %', width: 30, cell: num(r => dec(r, 'TCSPer'), 2) },
    { header: 'TCS Amt', width: 40, cell: num(r => dec(r, 'Item_TSCAmount')), ...totalColsBase.tcsAmt },
    { header: 'RND', width: 28, cell: num(r => dec(r, 'RoundOff')), ...totalColsBase.roundOff },
    { header: 'Net Amount', width: 60, cell: num(r => dec(r, 'Item_NetAmount')), ...totalColsBase.netAmount }
  ]
};

// ============================================================================
// CUSTOMER WISE — grouped by CustomerCode
// ============================================================================
const customerWiseConfig = {
  title: 'SALES REPORT - CUSTOMER WISE',
  summaryGroupHeader: 'Customer Name',
  subLabelSpan: 6,
  groupKey: (r) => (str(r, 'CustomerName') || '(Unknown Customer)') + '||' + (r.CustomerCode != null ? String(r.CustomerCode) : ''),
  groupLabel: (first) => 'Customer : ' + (str(first, 'CustomerName') || '(Unknown Customer)'),
  columns: [
    { header: 'S.No', width: 22, cell: sn() },
    { header: 'SO No', width: 42, cell: txt(r => str(r, 'SONo'), 'center') },
    { header: 'SO Date', width: 50, cell: txt(r => ddmmyyyy(r.SODate), 'center') },
    { header: 'Inv. No', width: 42, cell: txt(r => str(r, 'strInvoiceNo'), 'center') },
    { header: 'Inv. Date', width: 50, cell: txt(r => ddmmyyyy(r.BillDate), 'center') },
    { header: 'Sales Type', width: 55, cell: txt(r => str(r, 'SalesType')) },
    { header: 'Count', width: 45, cell: txt(r => str(r, 'Count'), 'center') },
    { header: 'Bags', width: 30, cell: intNum(r => dec(r, 'Qty')), ...totalColsBase.qty },
    { header: 'Weight', width: 48, cell: num(r => dec(r, 'Weight'), 3), ...totalColsBase.weight },
    { header: 'Rate', width: 42, cell: num(r => dec(r, 'RateEx'), 2) },
    { header: 'Basic', width: 55, cell: num(r => dec(r, 'BasicAmount')), ...totalColsBase.basic },
    { header: 'Tax', width: 50, cell: num(r => taxOf(r)), ...totalColsBase.tax },
    { header: 'Fright', width: 40, cell: num(r => dec(r, 'Item_FreightAmount')), ...totalColsBase.freight },
    { header: 'TCS Tax Amt', width: 50, cell: num(r => dec(r, 'TCSTaxableAmount')), ...totalColsBase.tcsTaxable },
    { header: 'TCS %', width: 30, cell: num(r => dec(r, 'TCSPer'), 2) },
    { header: 'TCS Amt', width: 40, cell: num(r => dec(r, 'Item_TSCAmount')), ...totalColsBase.tcsAmt },
    { header: 'RND', width: 28, cell: num(r => dec(r, 'RoundOff')), ...totalColsBase.roundOff },
    { header: 'Net Amount', width: 60, cell: num(r => dec(r, 'Item_NetAmount')), ...totalColsBase.netAmount }
  ]
};

// ============================================================================
// AGENT WISE — grouped by AgentCode
// ============================================================================
const agentWiseConfig = {
  title: 'SALES REPORT - AGENT WISE',
  summaryGroupHeader: 'Agent Name',
  subLabelSpan: 7,
  groupKey: (r) => (str(r, 'AgentName') || '(No Agent)') + '||' + (r.AgentCode != null ? String(r.AgentCode) : ''),
  groupLabel: (first) => 'Agent : ' + (str(first, 'AgentName') || '(No Agent)'),
  columns: [
    { header: 'S.No', width: 22, cell: sn() },
    { header: 'SO No', width: 42, cell: txt(r => str(r, 'SONo'), 'center') },
    { header: 'SO Date', width: 50, cell: txt(r => ddmmyyyy(r.SODate), 'center') },
    { header: 'Inv. No', width: 42, cell: txt(r => str(r, 'strInvoiceNo'), 'center') },
    { header: 'Inv. Date', width: 50, cell: txt(r => ddmmyyyy(r.BillDate), 'center') },
    { header: 'Customer', width: '*', cell: txt(r => str(r, 'CustomerName')) },
    { header: 'Sales Type', width: 55, cell: txt(r => str(r, 'SalesType')) },
    { header: 'Count', width: 42, cell: txt(r => str(r, 'Count'), 'center') },
    { header: 'Bags', width: 30, cell: intNum(r => dec(r, 'Qty')), ...totalColsBase.qty },
    { header: 'Weight', width: 48, cell: num(r => dec(r, 'Weight'), 3), ...totalColsBase.weight },
    { header: 'Rate', width: 40, cell: num(r => dec(r, 'RateEx'), 2) },
    { header: 'Basic', width: 55, cell: num(r => dec(r, 'BasicAmount')), ...totalColsBase.basic },
    { header: 'Tax', width: 50, cell: num(r => taxOf(r)), ...totalColsBase.tax },
    { header: 'Fright', width: 40, cell: num(r => dec(r, 'Item_FreightAmount')), ...totalColsBase.freight },
    { header: 'TCS Tax Amt', width: 50, cell: num(r => dec(r, 'TCSTaxableAmount')), ...totalColsBase.tcsTaxable },
    { header: 'TCS %', width: 28, cell: num(r => dec(r, 'TCSPer'), 2) },
    { header: 'TCS Amt', width: 40, cell: num(r => dec(r, 'Item_TSCAmount')), ...totalColsBase.tcsAmt },
    { header: 'Net Amount', width: 60, cell: num(r => dec(r, 'Item_NetAmount')), ...totalColsBase.netAmount }
  ]
};

// ============================================================================
// COUNT WISE — grouped by CountTypeCode
// ============================================================================
const countWiseConfig = {
  title: 'SALES REPORT - COUNT WISE',
  summaryGroupHeader: 'Count Type',
  subLabelSpan: 7,
  groupKey: (r) => (str(r, 'CountType') || '(Unknown Count)') + '||' + (r.CountTypeCode != null ? String(r.CountTypeCode) : ''),
  groupLabel: (first) => 'Count Type : ' + (str(first, 'CountType') || '(Unknown Count)'),
  columns: [
    { header: 'S.No', width: 22, cell: sn() },
    { header: 'SO No', width: 42, cell: txt(r => str(r, 'SONo'), 'center') },
    { header: 'SO Date', width: 50, cell: txt(r => ddmmyyyy(r.SODate), 'center') },
    { header: 'Inv. No', width: 42, cell: txt(r => str(r, 'strInvoiceNo'), 'center') },
    { header: 'Inv. Date', width: 50, cell: txt(r => ddmmyyyy(r.BillDate), 'center') },
    { header: 'Customer', width: '*', cell: txt(r => str(r, 'CustomerName')) },
    { header: 'Sales Type', width: 55, cell: txt(r => str(r, 'SalesType')) },
    { header: 'Bags', width: 30, cell: intNum(r => dec(r, 'Qty')), ...totalColsBase.qty },
    { header: 'Weight', width: 48, cell: num(r => dec(r, 'Weight'), 3), ...totalColsBase.weight },
    { header: 'Rate', width: 40, cell: num(r => dec(r, 'RateEx'), 2) },
    { header: 'Basic', width: 55, cell: num(r => dec(r, 'BasicAmount')), ...totalColsBase.basic },
    { header: 'Tax', width: 50, cell: num(r => taxOf(r)), ...totalColsBase.tax },
    { header: 'Fright', width: 40, cell: num(r => dec(r, 'Item_FreightAmount')), ...totalColsBase.freight },
    { header: 'TCS Tax Amt', width: 50, cell: num(r => dec(r, 'TCSTaxableAmount')), ...totalColsBase.tcsTaxable },
    { header: 'TCS %', width: 28, cell: num(r => dec(r, 'TCSPer'), 2) },
    { header: 'TCS Amt', width: 40, cell: num(r => dec(r, 'Item_TSCAmount')), ...totalColsBase.tcsAmt },
    { header: 'RND', width: 28, cell: num(r => dec(r, 'RoundOff')), ...totalColsBase.roundOff },
    { header: 'Net Amount', width: 60, cell: num(r => dec(r, 'Item_NetAmount')), ...totalColsBase.netAmount }
  ]
};

// ============================================================================
// AVG RATE COUNT WISE — one-row-per-count summary table.
//   Columns: SNo | Count Name | Bags | KGS | Amount | Avg. Rate
//   Avg Rate = sum(BasicAmount) / sum(Weight) per count
// ============================================================================
function buildAvgRateCountWise(rows, companyName, fromDate, toDate, companyLogo) {
  const groupsMap = new Map();
  for (const r of rows) {
    const k = (r.CountTypeCode != null ? String(r.CountTypeCode) : '') + '||' + (str(r, 'CountType') || '(Unknown)');
    if (!groupsMap.has(k)) groupsMap.set(k, []);
    groupsMap.get(k).push(r);
  }
  const sortedKeys = [...groupsMap.keys()].sort((a, b) => {
    const an = a.split('||')[1] || '';
    const bn = b.split('||')[1] || '';
    return an.localeCompare(bn);
  });

  const hdr = (text) => ({ text, bold: true, fillColor: COLORS.headerFill, color: COLORS.headerText, alignment: 'center', fontSize: 9 });

  const body = [
    [hdr('S.No'), hdr('Count Name'), hdr('Bags'), hdr('KGS'), hdr('Amount'), hdr('Avg. Rate')]
  ];

  let totQty = 0, totWeight = 0, totBasic = 0;
  let sno = 1;

  for (const key of sortedKeys) {
    const group = groupsMap.get(key);
    let qty = 0, weight = 0, basic = 0;
    for (const r of group) {
      qty += dec(r, 'Qty');
      weight += dec(r, 'Weight');
      basic += dec(r, 'BasicAmount');
    }
    const avgRate = weight > 0 ? basic / weight : 0;

    const zebra = sno % 2 === 0 ? COLORS.zebraFill : null;
    body.push([
      { text: String(sno), alignment: 'center', fontSize: 9, fillColor: zebra },
      { text: str(group[0], 'CountType'), alignment: 'left', fontSize: 9, fillColor: zebra },
      { text: intFmt(qty), alignment: 'right', fontSize: 9, fillColor: zebra },
      { text: fmt(weight, 3), alignment: 'right', fontSize: 9, fillColor: zebra },
      { text: fmt(basic, 2), alignment: 'right', fontSize: 9, fillColor: zebra },
      { text: fmt(avgRate, 2), alignment: 'right', fontSize: 9, fillColor: zebra }
    ]);

    totQty += qty;
    totWeight += weight;
    totBasic += basic;
    sno++;
  }

  const grandAvg = totWeight > 0 ? totBasic / totWeight : 0;
  body.push([
    { text: 'Total', colSpan: 2, alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: 10 },
    {},
    { text: intFmt(totQty), alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: 10 },
    { text: fmt(totWeight, 3), alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: 10 },
    { text: fmt(totBasic, 2), alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: 10 },
    { text: fmt(grandAvg, 2), alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: 10 }
  ]);

  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: [20, 20, 20, 40],
    footer: baseFooter,
    content: [
      titleBlock(companyName, 'COUNT WISE SALES SUMMARY', fromDate, toDate, companyLogo),
      {
        table: {
          headerRows: 1,
          dontBreakRows: true,
          keepWithHeaderRows: 0,
          widths: [40, '*', 70, 80, 90, 70],
          body
        },
        layout: baseLayout
      }
    ],
    defaultStyle: { font: 'Roboto', fontSize: 9, lineHeight: 1.25 }
  };
}

export const dateWise = { buildDocDefinition: makeBuilder(dateWiseConfig) };
export const customerWise = { buildDocDefinition: makeBuilder(customerWiseConfig) };
export const agentWise = { buildDocDefinition: makeBuilder(agentWiseConfig) };
export const countWise = { buildDocDefinition: makeBuilder(countWiseConfig) };
export const avgRateCountWise = { buildDocDefinition: buildAvgRateCountWise };

export default { dateWise, customerWise, agentWise, countWise, avgRateCountWise };
