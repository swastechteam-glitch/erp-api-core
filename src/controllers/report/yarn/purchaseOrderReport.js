// reports/yarn/purchaseOrderReport.js
// Three grouped Yarn Purchase Order reports sharing one SP and one builder factory.
//   sp_YarnPurchaseOrderDetails_GetAll (CompanyCode, FromDate, ToDate)
//
// Exports: dateWise, supplierWise, countWise
// Each exports { buildDocDefinition(rows, companyName, fromDate, toDate) }.
//
// Mirrors rptYarnPurchaseOrderDateWiseDetails / *SupplierWiseDetails /
// *CountWiseDetails.rdlc. Each variant has the same wide column set (PO/PO Date
// /Supplier/Count Type/Std Wgt/Del Wgt/Weight/Qty/Rate/Rate Ex/Amount), just a
// different grouping dimension.

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
    { text: 'Report Printed : ' + new Date().toLocaleString('en-GB'), fontSize: 7, margin: [15, 0, 0, 0] },
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
        const da = new Date(a.YarnPurchaseOrderDate).getTime() || 0;
        const db = new Date(b.YarnPurchaseOrderDate).getTime() || 0;
        if (da !== db) return da - db;
        return dec(a, 'YarnPurchaseOrderNo') - dec(b, 'YarnPurchaseOrderNo');
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
// FIRST (before the detail pages). Mirrors the Yarn Sales Order summary page.
function buildSummaryPage({ COLS, groupSummaries, totals, config, companyName, fromDate, toDate, companyLogo }) {
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
const num = (getVal, digits = 2) => (ctx) => ({
  text: fmt(getVal(ctx.r), digits), alignment: 'right', fontSize: 8, fillColor: ctx.zebra
});
const intNum = (getVal) => (ctx) => ({
  text: intFmt(getVal(ctx.r)), alignment: 'right', fontSize: 8, fillColor: ctx.zebra
});
const sn = () => (ctx) => ({
  text: String(ctx.sno), alignment: 'center', fontSize: 8, fillColor: ctx.zebra
});

// Shared totals used across the three variants
const totalColsBase = {
  stdWgt: { totalKey: 'stdWgt', totalFmt: intFmt, totalFn: r => dec(r, 'StdWeight') },
  delWgt: { totalKey: 'delWgt', totalFmt: intFmt, totalFn: r => dec(r, 'DeliveryWeight') },
  weight: { totalKey: 'weight', totalFmt: intFmt, totalFn: r => dec(r, 'Weight') },
  qty: { totalKey: 'qty', totalFmt: intFmt, totalFn: r => dec(r, 'Qty') },
  amount: { totalKey: 'amount', totalFmt: intFmt, totalFn: r => dec(r, 'Amount') }
};

// ============================================================================
// DATE WISE — grouped by YarnPurchaseOrderDate
// ============================================================================
const dateWiseConfig = {
  title: 'YARN PURCHASE ORDER DETAILS - DATE WISE',
  summaryGroupHeader: 'PO Date',
  subLabelSpan: 6,
  groupKey: (r) => isoDate(r.YarnPurchaseOrderDate) + '||' + ddmmyyyy(r.YarnPurchaseOrderDate),
  groupLabel: (first) => 'Date : ' + ddmmyyyy(first.YarnPurchaseOrderDate),
  columns: [
    { header: 'S.No', width: 26, cell: sn() },
    { header: 'Yarn PO No', width: 55, cell: txt(r => str(r, 'YarnPurchaseOrderNo'), 'center') },
    { header: 'PO No', width: 55, cell: txt(r => str(r, 'PONo'), 'center') },
    { header: 'PO Date', width: 55, cell: txt(r => ddmmyyyy(r.PODate), 'center') },
    { header: 'Supplier', width: '*', cell: txt(r => str(r, 'SupplierName')) },
    { header: 'Count Type', width: '*', cell: txt(r => str(r, 'CountName')) },
    { header: 'Std Wgt', width: 55, cell: intNum(r => dec(r, 'StdWeight')), ...totalColsBase.stdWgt },
    { header: 'Del Wgt', width: 55, cell: intNum(r => dec(r, 'DeliveryWeight')), ...totalColsBase.delWgt },
    { header: 'Weight', width: 55, cell: intNum(r => dec(r, 'Weight')), ...totalColsBase.weight },
    { header: 'Qty', width: 42, cell: intNum(r => dec(r, 'Qty')), ...totalColsBase.qty },
    { header: 'Rate', width: 45, cell: num(r => dec(r, 'Rate'), 0) },
    { header: 'Rate Ex', width: 50, cell: num(r => dec(r, 'RateEx'), 0) },
    { header: 'Amount', width: 70, cell: intNum(r => dec(r, 'Amount')), ...totalColsBase.amount }
  ]
};

// ============================================================================
// SUPPLIER WISE — grouped by SupplierCode
// ============================================================================
const supplierWiseConfig = {
  title: 'YARN PURCHASE ORDER DETAILS - SUPPLIER WISE',
  summaryGroupHeader: 'Supplier Name',
  subLabelSpan: 6,
  groupKey: (r) => (str(r, 'SupplierName') || '(Unknown Supplier)') + '||' + (r.SupplierCode != null ? String(r.SupplierCode) : ''),
  groupLabel: (first) => 'Supplier : ' + (str(first, 'SupplierName') || '(Unknown Supplier)'),
  columns: [
    { header: 'S.No', width: 26, cell: sn() },
    { header: 'Yarn PO No', width: 55, cell: txt(r => str(r, 'YarnPurchaseOrderNo'), 'center') },
    { header: 'Yarn PO Date', width: 60, cell: txt(r => ddmmyyyy(r.YarnPurchaseOrderDate), 'center') },
    { header: 'PO No', width: 55, cell: txt(r => str(r, 'PONo'), 'center') },
    { header: 'PO Date', width: 55, cell: txt(r => ddmmyyyy(r.PODate), 'center') },
    { header: 'Count Type', width: '*', cell: txt(r => str(r, 'CountName')) },
    { header: 'Std Wgt', width: 55, cell: intNum(r => dec(r, 'StdWeight')), ...totalColsBase.stdWgt },
    { header: 'Del Wgt', width: 55, cell: intNum(r => dec(r, 'DeliveryWeight')), ...totalColsBase.delWgt },
    { header: 'Weight', width: 55, cell: intNum(r => dec(r, 'Weight')), ...totalColsBase.weight },
    { header: 'Qty', width: 42, cell: intNum(r => dec(r, 'Qty')), ...totalColsBase.qty },
    { header: 'Rate', width: 45, cell: num(r => dec(r, 'Rate'), 0) },
    { header: 'Rate Ex', width: 50, cell: num(r => dec(r, 'RateEx'), 0) },
    { header: 'Amount', width: 70, cell: intNum(r => dec(r, 'Amount')), ...totalColsBase.amount }
  ]
};

// ============================================================================
// COUNT WISE — grouped by CountTypeCode
// ============================================================================
const countWiseConfig = {
  title: 'YARN PURCHASE ORDER DETAILS - COUNT WISE',
  summaryGroupHeader: 'Count Type',
  subLabelSpan: 6,
  groupKey: (r) => (str(r, 'CountName') || '(Unknown Count)') + '||' + (r.CountTypeCode != null ? String(r.CountTypeCode) : ''),
  groupLabel: (first) => 'Count : ' + (str(first, 'CountName') || '(Unknown Count)'),
  columns: [
    { header: 'S.No', width: 26, cell: sn() },
    { header: 'Yarn PO No', width: 55, cell: txt(r => str(r, 'YarnPurchaseOrderNo'), 'center') },
    { header: 'Yarn PO Date', width: 60, cell: txt(r => ddmmyyyy(r.YarnPurchaseOrderDate), 'center') },
    { header: 'PO No', width: 55, cell: txt(r => str(r, 'PONo'), 'center') },
    { header: 'PO Date', width: 55, cell: txt(r => ddmmyyyy(r.PODate), 'center') },
    { header: 'Supplier', width: '*', cell: txt(r => str(r, 'SupplierName')) },
    { header: 'Std Wgt', width: 55, cell: intNum(r => dec(r, 'StdWeight')), ...totalColsBase.stdWgt },
    { header: 'Del Wgt', width: 55, cell: intNum(r => dec(r, 'DeliveryWeight')), ...totalColsBase.delWgt },
    { header: 'Weight', width: 55, cell: intNum(r => dec(r, 'Weight')), ...totalColsBase.weight },
    { header: 'Qty', width: 42, cell: intNum(r => dec(r, 'Qty')), ...totalColsBase.qty },
    { header: 'Rate', width: 45, cell: num(r => dec(r, 'Rate'), 0) },
    { header: 'Rate Ex', width: 50, cell: num(r => dec(r, 'RateEx'), 0) },
    { header: 'Amount', width: 70, cell: intNum(r => dec(r, 'Amount')), ...totalColsBase.amount }
  ]
};

// ============================================================================
// SUMMARY VARIANTS — one row per PO (sp_YarnPurchaseOrder_GetAll /
// sp_YarnPurchaseOrder_GetAll_Pending). These carry per-PO TotalQty / TotalWeight
// instead of detail lines. Mirror rptYanPurchaseOrderDateWise /
// rptYarnPurchaseOrderSupplierWise / rptYanPurchaseOrderApprovalDateWise /
// rptYanPurchaseOrderApprovalPendingDateWise.
// ============================================================================
const summaryTotals = {
  qty: { totalKey: 'qty', totalFmt: intFmt, totalFn: r => dec(r, 'TotalQty') },
  weight: { totalKey: 'weight', totalFmt: intFmt, totalFn: r => dec(r, 'TotalWeight') },
};

// DATE WISE (summary) — grouped by YarnPurchaseOrderDate
const summaryDateWiseConfig = {
  title: 'YARN PURCHASE ORDER - DATE WISE',
  summaryGroupHeader: 'PO Date',
  subLabelSpan: 5,
  groupKey: (r) => isoDate(r.YarnPurchaseOrderDate) + '||' + ddmmyyyy(r.YarnPurchaseOrderDate),
  groupLabel: (first) => 'Date : ' + ddmmyyyy(first.YarnPurchaseOrderDate),
  columns: [
    { header: 'S.No', width: 30, cell: sn() },
    { header: 'Yarn PO No', width: 75, cell: txt(r => str(r, 'YarnPurchaseOrderNo'), 'center') },
    { header: 'PO No', width: 90, cell: txt(r => str(r, 'PONo'), 'center') },
    { header: 'PO Date', width: 80, cell: txt(r => ddmmyyyy(r.PODate), 'center') },
    { header: 'Supplier', width: '*', cell: txt(r => str(r, 'SupplierName')) },
    { header: 'Total Qty', width: 80, cell: intNum(r => dec(r, 'TotalQty')), ...summaryTotals.qty },
    { header: 'Total Weight', width: 90, cell: intNum(r => dec(r, 'TotalWeight')), ...summaryTotals.weight }
  ]
};

// SUPPLIER WISE (summary) — grouped by SupplierCode
const summarySupplierWiseConfig = {
  title: 'YARN PURCHASE ORDER - SUPPLIER WISE',
  summaryGroupHeader: 'Supplier Name',
  subLabelSpan: 5,
  groupKey: (r) => (str(r, 'SupplierName') || '(Unknown Supplier)') + '||' + (r.SupplierCode != null ? String(r.SupplierCode) : ''),
  groupLabel: (first) => 'Supplier : ' + (str(first, 'SupplierName') || '(Unknown Supplier)'),
  columns: [
    { header: 'S.No', width: 30, cell: sn() },
    { header: 'Yarn PO No', width: 75, cell: txt(r => str(r, 'YarnPurchaseOrderNo'), 'center') },
    { header: 'Yarn PO Date', width: 80, cell: txt(r => ddmmyyyy(r.YarnPurchaseOrderDate), 'center') },
    { header: 'PO No', width: 90, cell: txt(r => str(r, 'PONo'), 'center') },
    { header: 'PO Date', width: 80, cell: txt(r => ddmmyyyy(r.PODate), 'center') },
    { header: 'Total Qty', width: 80, cell: intNum(r => dec(r, 'TotalQty')), ...summaryTotals.qty },
    { header: 'Total Weight', width: 90, cell: intNum(r => dec(r, 'TotalWeight')), ...summaryTotals.weight }
  ]
};

// APPROVAL (summary) — grouped by ApprovalDate, with approval user / node / date.
// Mirrors rptYanPurchaseOrderApprovalDateWise (sp_YarnPurchaseOrder_GetAll @Approval=1).
const approvalDateWiseConfig = {
  title: 'YARN PURCHASE ORDER APPROVAL - DATE WISE',
  summaryGroupHeader: 'Approval Date',
  subLabelSpan: 6,
  groupKey: (r) => isoDate(r.ApprovalDate) + '||' + ddmmyyyy(r.ApprovalDate),
  groupLabel: (first) => 'Approval Date : ' + (ddmmyyyy(first.ApprovalDate) || '-'),
  columns: [
    { header: 'S.No', width: 26, cell: sn() },
    { header: 'Yarn PO No', width: 60, cell: txt(r => str(r, 'YarnPurchaseOrderNo'), 'center') },
    { header: 'Yarn PO Date', width: 65, cell: txt(r => ddmmyyyy(r.YarnPurchaseOrderDate), 'center') },
    { header: 'PO No', width: 65, cell: txt(r => str(r, 'PONo'), 'center') },
    { header: 'PO Date', width: 65, cell: txt(r => ddmmyyyy(r.PODate), 'center') },
    { header: 'Supplier', width: '*', cell: txt(r => str(r, 'SupplierName')) },
    { header: 'Total Qty', width: 55, cell: intNum(r => dec(r, 'TotalQty')), ...summaryTotals.qty },
    { header: 'Total Weight', width: 60, cell: intNum(r => dec(r, 'TotalWeight')), ...summaryTotals.weight },
    { header: 'Approval User', width: 75, cell: txt(r => str(r, 'UName')) },
    { header: 'Approval Node', width: 70, cell: txt(r => str(r, 'NodeName')) },
    { header: 'Approval Date', width: 70, cell: txt(r => ddmmyyyy(r.ApprovalDate), 'center') }
  ]
};

// APPROVAL PENDING (summary) — grouped by YarnPurchaseOrderDate (pending rows have
// no ApprovalDate). Mirrors rptYanPurchaseOrderApprovalPendingDateWise
// (sp_YarnPurchaseOrder_GetAll_Pending @Approval=0).
const pendingDateWiseConfig = {
  title: 'YARN PURCHASE ORDER APPROVAL PENDING - DATE WISE',
  summaryGroupHeader: 'PO Date',
  subLabelSpan: 6,
  groupKey: (r) => isoDate(r.YarnPurchaseOrderDate) + '||' + ddmmyyyy(r.YarnPurchaseOrderDate),
  groupLabel: (first) => 'Date : ' + ddmmyyyy(first.YarnPurchaseOrderDate),
  columns: [
    { header: 'S.No', width: 30, cell: sn() },
    { header: 'Yarn PO No', width: 70, cell: txt(r => str(r, 'YarnPurchaseOrderNo'), 'center') },
    { header: 'Yarn PO Date', width: 75, cell: txt(r => ddmmyyyy(r.YarnPurchaseOrderDate), 'center') },
    { header: 'PO No', width: 85, cell: txt(r => str(r, 'PONo'), 'center') },
    { header: 'PO Date', width: 75, cell: txt(r => ddmmyyyy(r.PODate), 'center') },
    { header: 'Supplier', width: '*', cell: txt(r => str(r, 'SupplierName')) },
    { header: 'Total Qty', width: 80, cell: intNum(r => dec(r, 'TotalQty')), ...summaryTotals.qty },
    { header: 'Total Weight', width: 90, cell: intNum(r => dec(r, 'TotalWeight')), ...summaryTotals.weight }
  ]
};

export const dateWise = { buildDocDefinition: makeBuilder(dateWiseConfig) };
export const supplierWise = { buildDocDefinition: makeBuilder(supplierWiseConfig) };
export const countWise = { buildDocDefinition: makeBuilder(countWiseConfig) };
export const summaryDateWise = { buildDocDefinition: makeBuilder(summaryDateWiseConfig) };
export const summarySupplierWise = { buildDocDefinition: makeBuilder(summarySupplierWiseConfig) };
export const approvalDateWise = { buildDocDefinition: makeBuilder(approvalDateWiseConfig) };
export const pendingDateWise = { buildDocDefinition: makeBuilder(pendingDateWiseConfig) };

export default {
  dateWise, supplierWise, countWise,
  summaryDateWise, summarySupplierWise, approvalDateWise, pendingDateWise
};
