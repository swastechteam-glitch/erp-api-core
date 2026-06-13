// reports/yarn/salesOrderReport.js
// Four grouped Yarn Sales Order reports sharing one SP and one builder factory.
//   sp_SalesOrderDetails_GetAll (CompanyCode, FromDate, ToDate)
//
// Exports: dateWise, customerWise, agentWise, countWise
// Each exports { buildDocDefinition(rows, companyName, fromDate, toDate) }.
//
// Mirrors rptSalesOrderDetailsDateWise / *CustomerWise / *AgentWise /
// *CountWise.rdlc. Each variant groups detail rows by one dimension and emits
// a Sub Total row per group + a Grand Total row at the bottom.

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

// Title block with the company logo on the left (mirror spacer keeps it centred).
const LOGO_W = 80;
const titleWithLogo = (companyName, title, dateText, companyLogo) => ({
  columns: [
    companyLogo
      ? { image: companyLogo, fit: [70, 70], width: LOGO_W, alignment: 'left', margin: [4, 0, 0, 0] }
      : { text: '', width: LOGO_W },
    {
      width: '*',
      stack: [
        { text: companyName, alignment: 'center', fontSize: 16, bold: true, color: '#7B3F00', margin: [0, 0, 0, 6] },
        { text: title, alignment: 'center', fontSize: 12, bold: true, color: '#008000', margin: [0, 0, 0, 6] },
        { text: dateText, alignment: 'center', fontSize: 10, bold: true, margin: [0, 0, 0, 10] }
      ]
    },
    { text: '', width: LOGO_W }
  ]
});

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

    // Header row
    body.push(COLS.map(c => ({
      text: c.header, bold: true, fillColor: COLORS.headerFill,
      color: COLORS.headerText, alignment: 'center', fontSize: 8
    })));

    const totals = {};
    const groupSummaries = [];
    let sno = 1;

    for (const key of sortedKeys) {
      const group = groupsMap.get(key).slice().sort((a, b) => {
        const da = new Date(a.SODate).getTime() || 0;
        const db = new Date(b.SODate).getTime() || 0;
        if (da !== db) return da - db;
        return dec(a, 'SONo') - dec(b, 'SONo');
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

      // Sub Total row
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

    // Grand Total row
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

    return {
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [15, 20, 15, 45],

      footer: function (currentPage, pageCount) {
        return {
          margin: [0, 12, 0, 0],
          columns: [
            { text: 'Developed by Swas Technologies, Report Printed : ' + new Date().toLocaleString('en-GB'), fontSize: 7, margin: [15, 0, 0, 0] },
            { text: `Page ${currentPage} of ${pageCount}`, alignment: 'right', fontSize: 7, margin: [0, 0, 15, 0] }
          ]
        };
      },

      content: [
        ...summaryNodes,
        { ...titleWithLogo(companyName, config.title, `From Date : ${ddmmyyyy(fromDate)}    To Date : ${ddmmyyyy(toDate)}`, companyLogo), pageBreak: 'before' },
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
            hLineColor: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? COLORS.headerFill : COLORS.borderColor),
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

const cleanGroupLabel = (label) => {
  const idx = label.indexOf(' : ');
  return idx >= 0 ? label.slice(idx + 3).trim() : label;
};

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
    titleWithLogo(companyName, summaryTitle, `From Date : ${ddmmyyyy(fromDate)}    To Date : ${ddmmyyyy(toDate)}`, companyLogo),
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
        hLineColor: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? COLORS.headerFill : COLORS.borderColor),
        vLineColor: () => COLORS.borderColor,
        paddingLeft: () => 4,
        paddingRight: () => 4,
        paddingTop: () => 6,
        paddingBottom: () => 6
      }
    },
    ...buildTrendChart(groupSummaries, totalCols, { groupHeader })
  ];
}

// ---- per-cell helpers ----
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

// ============================================================================
// DATE WISE — grouped by SODate
// ============================================================================
const dateWiseConfig = {
  title: 'SALES ORDER DETAILS - DATE WISE',
  summaryGroupHeader: 'SO Date',
  subLabelSpan: 6,
  groupKey: (r) => isoDate(r.SODate) + '||' + ddmmyyyy(r.SODate),
  groupLabel: (first) => 'Date : ' + ddmmyyyy(first.SODate),
  columns: [
    { header: 'S.No', width: 24, cell: sn() },
    { header: 'SO Date', width: 55, cell: txt(r => ddmmyyyy(r.SODate), 'center') },
    { header: 'SO No', width: 50, cell: txt(r => str(r, 'SONo'), 'center') },
    { header: 'Customer', width: '*', cell: txt(r => str(r, 'Customer')) },
    { header: 'Sales Type', width: 65, cell: txt(r => str(r, 'SalesType')) },
    { header: 'Count', width: '*', cell: txt(r => str(r, 'CountName')) },
    { header: 'Qty', width: 40, cell: intNum(r => dec(r, 'Qty')), totalKey: 'qty', totalFmt: intFmt, totalFn: r => dec(r, 'Qty') },
    { header: 'Kgs', width: 55, cell: num(r => dec(r, 'Weight'), 3), totalKey: 'kgs', totalDigits: 3, totalFn: r => dec(r, 'Weight') },
    { header: 'Ex Mill Rate', width: 55, cell: num(r => dec(r, 'RateEx'), 0) },
    { header: 'Rate', width: 45, cell: num(r => dec(r, 'Rate'), 0) },
    { header: 'Delivery', width: '*', cell: txt(r => str(r, 'DelCustomer')) },
    { header: 'Agent', width: 80, cell: txt(r => str(r, 'AgentName')) }
  ]
};

// ============================================================================
// CUSTOMER WISE — grouped by CustomerCode
// ============================================================================
const customerWiseConfig = {
  title: 'SALES ORDER DETAILS - CUSTOMER WISE',
  summaryGroupHeader: 'Customer Name',
  subLabelSpan: 5,
  groupKey: (r) => (str(r, 'Customer') || '(Unknown Customer)') + '||' + (r.CustomerCode != null ? String(r.CustomerCode) : ''),
  groupLabel: (first) => 'Customer : ' + (str(first, 'Customer') || '(Unknown Customer)'),
  columns: [
    { header: 'S.No', width: 24, cell: sn() },
    { header: 'DA No', width: 50, cell: txt(r => str(r, 'SONo'), 'center') },
    { header: 'Date', width: 55, cell: txt(r => ddmmyyyy(r.SODate), 'center') },
    { header: 'Sales Type', width: 70, cell: txt(r => str(r, 'SalesType')) },
    { header: 'Count', width: '*', cell: txt(r => str(r, 'CountName')) },
    { header: 'Qty', width: 40, cell: intNum(r => dec(r, 'Qty')), totalKey: 'qty', totalFmt: intFmt, totalFn: r => dec(r, 'Qty') },
    { header: 'Kgs', width: 55, cell: num(r => dec(r, 'Weight'), 3), totalKey: 'kgs', totalDigits: 3, totalFn: r => dec(r, 'Weight') },
    { header: 'Ex Mill Rate', width: 55, cell: num(r => dec(r, 'RateEx'), 0) },
    { header: 'Rate', width: 45, cell: num(r => dec(r, 'Rate'), 0) },
    { header: 'Delivery', width: '*', cell: txt(r => str(r, 'DelCustomer')) },
    { header: 'Agent', width: 80, cell: txt(r => str(r, 'AgentName')) }
  ]
};

// ============================================================================
// AGENT WISE — grouped by AgentCode
// ============================================================================
const agentWiseConfig = {
  title: 'SALES ORDER DETAILS - AGENT WISE',
  summaryGroupHeader: 'Agent Name',
  subLabelSpan: 6,
  groupKey: (r) => (str(r, 'AgentName') || '(No Agent)') + '||' + (r.AgentCode != null ? String(r.AgentCode) : ''),
  groupLabel: (first) => 'Agent : ' + (str(first, 'AgentName') || '(No Agent)'),
  columns: [
    { header: 'S.No', width: 24, cell: sn() },
    { header: 'DA No', width: 50, cell: txt(r => str(r, 'SONo'), 'center') },
    { header: 'Date', width: 55, cell: txt(r => ddmmyyyy(r.SODate), 'center') },
    { header: 'Customer', width: '*', cell: txt(r => str(r, 'Customer')) },
    { header: 'Sales Type', width: 70, cell: txt(r => str(r, 'SalesType')) },
    { header: 'Count', width: '*', cell: txt(r => str(r, 'CountName')) },
    { header: 'Qty', width: 40, cell: intNum(r => dec(r, 'Qty')), totalKey: 'qty', totalFmt: intFmt, totalFn: r => dec(r, 'Qty') },
    { header: 'Kgs', width: 55, cell: num(r => dec(r, 'Weight'), 3), totalKey: 'kgs', totalDigits: 3, totalFn: r => dec(r, 'Weight') },
    { header: 'Ex Mill Rate', width: 55, cell: num(r => dec(r, 'RateEx'), 0) },
    { header: 'Rate', width: 45, cell: num(r => dec(r, 'Rate'), 0) },
    { header: 'Delivery', width: '*', cell: txt(r => str(r, 'DelCustomer')) }
  ]
};

// ============================================================================
// COUNT WISE — grouped by CountTypeCode
// ============================================================================
const countWiseConfig = {
  title: 'SALES ORDER DETAILS - COUNT WISE',
  summaryGroupHeader: 'Count Type',
  subLabelSpan: 5,
  groupKey: (r) => (str(r, 'CountType') || '(Unknown Count)') + '||' + (r.CountTypeCode != null ? String(r.CountTypeCode) : ''),
  groupLabel: (first) => 'Count Type : ' + (str(first, 'CountType') || '(Unknown Count)'),
  columns: [
    { header: 'S.No', width: 24, cell: sn() },
    { header: 'DA No', width: 50, cell: txt(r => str(r, 'SONo'), 'center') },
    { header: 'Date', width: 55, cell: txt(r => ddmmyyyy(r.SODate), 'center') },
    { header: 'Customer', width: '*', cell: txt(r => str(r, 'Customer')) },
    { header: 'Sales Type', width: 70, cell: txt(r => str(r, 'SalesType')) },
    { header: 'Qty', width: 40, cell: intNum(r => dec(r, 'Qty')), totalKey: 'qty', totalFmt: intFmt, totalFn: r => dec(r, 'Qty') },
    { header: 'Kgs', width: 55, cell: num(r => dec(r, 'Weight'), 3), totalKey: 'kgs', totalDigits: 3, totalFn: r => dec(r, 'Weight') },
    { header: 'Ex Mill Rate', width: 55, cell: num(r => dec(r, 'RateEx'), 0) },
    { header: 'Rate', width: 45, cell: num(r => dec(r, 'Rate'), 0) },
    { header: 'Delivery', width: '*', cell: txt(r => str(r, 'DelCustomer')) },
    { header: 'Agent', width: 80, cell: txt(r => str(r, 'AgentName')) }
  ]
};

export const dateWise = { buildDocDefinition: makeBuilder(dateWiseConfig) };
export const customerWise = { buildDocDefinition: makeBuilder(customerWiseConfig) };
export const agentWise = { buildDocDefinition: makeBuilder(agentWiseConfig) };
export const countWise = { buildDocDefinition: makeBuilder(countWiseConfig) };

export default { dateWise, customerWise, agentWise, countWise };
