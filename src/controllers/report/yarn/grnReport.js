// reports/yarn/grnReport.js
// Grouped Yarn GRN reports sharing one SP and one builder factory.
//   sp_YarnGRN_GetAll (CompanyCode, FromDate, ToDate)
//
// Exports: dateWise
// Each exports { buildDocDefinition(rows, companyName, fromDate, toDate, companyLogo) }.
//
// Mirrors rptYanGRNDateWise.rdlc — detail rows grouped by GRN date with a Sub
// Total per group and a Grand Total at the bottom, plus a leading summary page
// (one row per group) and the company logo on every title block.

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
  paddingLeft: () => 4,
  paddingRight: () => 4,
  paddingTop: () => 5,
  paddingBottom: () => 5
};

const baseFooter = (currentPage, pageCount) => ({
  margin: [0, 12, 0, 0],
  columns: [
    { text: 'Developed by Swas Technologies, Report Printed : ' + new Date().toLocaleString('en-GB'), fontSize: 7, margin: [15, 0, 0, 0] },
    { text: `Page ${currentPage} of ${pageCount}`, alignment: 'right', fontSize: 7, margin: [0, 0, 15, 0] }
  ]
});

// First-page / summary title block — logo on the left, company name (brown),
// report title (green), date range bold. The right column is an empty spacer
// matching the logo column width so the title text stays visually centered.
const titleBlock = (companyName, title, fromDate, toDate, logoDataUri) => {
  const LOGO_COL_WIDTH = 90;
  const logoCol = logoDataUri
    ? { image: logoDataUri, fit: [80, 80], width: LOGO_COL_WIDTH, alignment: 'left', margin: [4, 0, 0, 0] }
    : { text: '', width: LOGO_COL_WIDTH };
  const textCol = {
    width: '*',
    stack: [
      { text: companyName, alignment: 'center', fontSize: 16, bold: true, color: '#7B3F00', margin: [0, 0, 0, 6] },
      { text: title, alignment: 'center', fontSize: 12, bold: true, color: '#008000', margin: [0, 0, 0, 6] },
      { text: `From Date : ${ddmmyyyy(fromDate)}    To Date : ${ddmmyyyy(toDate)}`, alignment: 'center', fontSize: 10, bold: true }
    ]
  };
  return {
    columns: [logoCol, textCol, { text: '', width: LOGO_COL_WIDTH }],
    margin: [0, 0, 0, 10]
  };
};

const cleanGroupLabel = (label) => {
  const idx = label.indexOf(' : ');
  return idx >= 0 ? label.slice(idx + 3).trim() : label;
};

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
      color: COLORS.headerText, alignment: 'center', fontSize: 8
    })));

    const totals = {};
    const groupSummaries = [];
    let sno = 1;

    for (const key of sortedKeys) {
      const group = groupsMap.get(key).slice().sort((a, b) => {
        const da = new Date(a.YarnGRNDate).getTime() || 0;
        const db = new Date(b.YarnGRNDate).getTime() || 0;
        if (da !== db) return da - db;
        return dec(a, 'YarnGRNNo') - dec(b, 'YarnGRNNo');
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
          return { text: 'Sub Total', colSpan: config.subLabelSpan, alignment: 'right', bold: true, color: COLORS.subText, fillColor: COLORS.subFill, fontSize: 8 };
        }
        if (i > 0 && i < config.subLabelSpan) return {};
        const tkey = c.totalKey;
        if (!tkey) return { text: '', fillColor: COLORS.subFill };
        return { text: c.totalFmt ? c.totalFmt(sub[tkey] || 0) : fmt(sub[tkey] || 0, c.totalDigits || 2), alignment: 'right', bold: true, color: COLORS.subText, fillColor: COLORS.subFill, fontSize: 8 };
      });
      body.push(subRow);

      groupSummaries.push({ label: cleanGroupLabel(groupLabel), sub });

      for (const k of Object.keys(sub)) {
        totals[k] = (totals[k] || 0) + sub[k];
      }
    }

    // Grand Total
    const grandRow = COLS.map((c, i) => {
      if (i === 0) {
        return { text: 'Grand Total', colSpan: config.subLabelSpan, alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: 9 };
      }
      if (i > 0 && i < config.subLabelSpan) return {};
      const tkey = c.totalKey;
      if (!tkey) return { text: '', fillColor: COLORS.grandFill };
      return { text: c.totalFmt ? c.totalFmt(totals[tkey] || 0) : fmt(totals[tkey] || 0, c.totalDigits || 2), alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: 9 };
    });
    body.push(grandRow);

    const summaryNodes = buildSummaryPage({ COLS, groupSummaries, totals, config, companyName, fromDate, toDate, companyLogo });

    const detailTitle = titleBlock(companyName, config.title, fromDate, toDate, companyLogo);
    detailTitle.pageBreak = 'before';

    return {
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [15, 20, 15, 45],
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
      defaultStyle: { font: 'Roboto', fontSize: 8, lineHeight: 1.25 }
    };
  };
}

// Summary page — one row per group (subtotals) plus a grand Total row, rendered
// FIRST (before the detail pages). Mirrors the Yarn Purchase Order summary page.
function buildSummaryPage({ COLS, groupSummaries, totals, config, companyName, fromDate, toDate, companyLogo }) {
  const totalCols = COLS.filter(c => c.totalKey);
  const summaryTitle = config.summaryTitle || (config.title + ' - SUMMARY');
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
        text: c.totalFmt ? c.totalFmt(gs.sub[c.totalKey] || 0) : fmt(gs.sub[c.totalKey] || 0, c.totalDigits != null ? c.totalDigits : 2),
        alignment: 'right', fontSize: 8, fillColor: zebra
      }))
    ];
  });

  const totalRow = [
    { text: 'Total', colSpan: 2, alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: 9 },
    {},
    ...totalCols.map(c => ({
      text: c.totalFmt ? c.totalFmt(totals[c.totalKey] || 0) : fmt(totals[c.totalKey] || 0, c.totalDigits != null ? c.totalDigits : 2),
      alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: 9
    }))
  ];

  const widths = [30, '*', ...totalCols.map(() => 70)];

  return [
    titleBlock(companyName, summaryTitle, fromDate, toDate, companyLogo),
    {
      table: {
        headerRows: 1,
        dontBreakRows: true,
        keepWithHeaderRows: 0,
        widths,
        body: [headerRow, ...dataRows, totalRow]
      },
      layout: baseLayout
    },
    ...buildTrendChart(groupSummaries, totalCols, { groupHeader })
  ];
}

// ---- cell helpers ----
const txt = (val, align = 'left') => (ctx) => ({
  text: String(val(ctx.r) ?? ''), alignment: align, fontSize: 8, fillColor: ctx.zebra
});
const intNum = (getVal) => (ctx) => ({
  text: intFmt(getVal(ctx.r)), alignment: 'right', fontSize: 8, fillColor: ctx.zebra
});
const sn = () => (ctx) => ({
  text: String(ctx.sno), alignment: 'center', fontSize: 8, fillColor: ctx.zebra
});

// Shared totals (all weights / qty formatted as integers, matching the RDLC "#0")
const totalColsBase = {
  qty: { totalKey: 'qty', totalFmt: intFmt, totalFn: r => dec(r, 'TotalQty') },
  grossWt: { totalKey: 'grossWt', totalFmt: intFmt, totalFn: r => dec(r, 'TotalGrossWt') },
  tareWt: { totalKey: 'tareWt', totalFmt: intFmt, totalFn: r => dec(r, 'TotalTareWt') },
  netWt: { totalKey: 'netWt', totalFmt: intFmt, totalFn: r => dec(r, 'TotalNetWt') }
};

// ============================================================================
// DATE WISE — grouped by YarnGRNDate
// ============================================================================
const dateWiseConfig = {
  title: 'YARN GRN DETAILS - DATE WISE',
  summaryTitle: 'YARN GRN SUMMARY - DATE WISE',
  summaryGroupHeader: 'GRN Date',
  subLabelSpan: 9,
  groupKey: (r) => isoDate(r.YarnGRNDate) + '||' + ddmmyyyy(r.YarnGRNDate),
  groupLabel: (first) => 'Date : ' + ddmmyyyy(first.YarnGRNDate),
  columns: [
    { header: 'S.No', width: 26, cell: sn() },
    { header: 'Y.GRN No', width: 50, cell: txt(r => str(r, 'YarnGRNNo'), 'center') },
    { header: 'Y.Pur Ord.No', width: 55, cell: txt(r => str(r, 'YarnPurchaseOrderNo'), 'center') },
    { header: 'Y.Pur Ord.Date', width: 60, cell: txt(r => ddmmyyyy(r.YarnPurchaseOrderDate), 'center') },
    { header: 'Goods In Pass No', width: 60, cell: txt(r => str(r, 'GoodsPassnumber'), 'center') },
    { header: 'Supplier', width: '*', cell: txt(r => str(r, 'SupplierName')) },
    { header: 'Employee', width: '*', cell: txt(r => str(r, 'EmployeeName')) },
    { header: 'Yarn Prod.Type', width: 70, cell: txt(r => str(r, 'YarnProductionType')) },
    { header: 'Yarn Packing Type', width: 70, cell: txt(r => str(r, 'YarnPackingType')) },
    { header: 'Total Qty', width: 50, cell: intNum(r => dec(r, 'TotalQty')), ...totalColsBase.qty },
    { header: 'Tot.Gross.Wt', width: 60, cell: intNum(r => dec(r, 'TotalGrossWt')), ...totalColsBase.grossWt },
    { header: 'Tot.Tare.Wt', width: 60, cell: intNum(r => dec(r, 'TotalTareWt')), ...totalColsBase.tareWt },
    { header: 'Tot.Net.Wt', width: 60, cell: intNum(r => dec(r, 'TotalNetWt')), ...totalColsBase.netWt },
    { header: 'Remarks', width: '*', cell: txt(r => str(r, 'Remarks')) }
  ]
};

export const dateWise = { buildDocDefinition: makeBuilder(dateWiseConfig) };

export default { dateWise };
