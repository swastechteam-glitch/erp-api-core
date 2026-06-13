// reports/yarn/productionReport.js
// Yarn Production reports (two-level aggregation: outer group -> per-count rows).
//   dateWise   : sp_BagProductionDetails_GetByRefDate (CompanyCode, FromDate, ToDate)
//   lotNoWise  : sp_YarnProduction_GetAll             (CompanyCode, FromDate, ToDate)
//   countWise  : sp_YarnProduction_GetAll             (CompanyCode, FromDate, ToDate)
//
// Each exports { buildDocDefinition(rows, companyName, fromDate, toDate, companyLogo) }.
//
// Mirrors:
//   rptProductionDateWise.rdlc    -> dateWise   (per Production Date -> per Count)
//   rptProductionLotNoWise.rdlc   -> lotNoWise  (per Lot No -> per Count Type)
//   rptProductionCountWise.rdlc   -> countWise  (per Production Date -> per Count Type, bags only)
//
// The RDLCs hide the per-bag detail rows and show only the aggregated count
// lines + group/grand totals, so these builders aggregate to that level. A
// leading count-wise summary page + the company logo are added on each.
// (rptProductionCountWise1.rdlc is an RDLC matrix/pivot — not reproduced here.)

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
  paddingLeft: () => 4,
  paddingRight: () => 4,
  paddingTop: () => 4,
  paddingBottom: () => 4
};

const baseFooter = (currentPage, pageCount) => ({
  margin: [0, 12, 0, 0],
  columns: [
    { text: 'Developed by Swas Technologies, Report Printed : ' + new Date().toLocaleString('en-GB'), fontSize: 7, margin: [15, 0, 0, 0] },
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

// Aggregate a set of rows over the agg columns.
const aggregate = (rowsArr, aggCols) => {
  const sums = {};
  for (const c of aggCols) if (c.key) sums[c.key] = 0;
  for (const r of rowsArr) for (const c of aggCols) if (c.key) sums[c.key] += dec(r, c.key);
  return { sums, count: rowsArr.length };
};
const aggText = (c, sums, count) => {
  if (c.kind === 'count') return intFmt(count);
  if (c.kind === 'avg') return fmt(count > 0 ? (sums[c.key] / count) : 0, c.digits != null ? c.digits : 3);
  return fmt(sums[c.key] || 0, c.digits != null ? c.digits : 2);
};

const headerCells = (headers, fs) =>
  headers.map(h => ({ text: h, bold: true, fillColor: COLORS.headerFill, color: COLORS.headerText, alignment: 'center', fontSize: fs }));

// Leading summary page — one row per Count (across all dates/lots) + Net Total.
function buildSummaryPage({ config, rows, companyName, dateLine, companyLogo }) {
  const fs = config.fontSize;
  const aggCols = config.aggCols;
  const headers = ['S.No', config.summaryGroupHeader, ...aggCols.map(c => c.header)];
  const widths = [30, '*', ...aggCols.map(c => c.width)];
  const body = [headerCells(headers, fs)];

  const groupsMap = new Map();
  for (const r of rows) {
    const k = config.summaryKey(r);
    if (!groupsMap.has(k)) groupsMap.set(k, { label: config.summaryLabel(r), rows: [] });
    groupsMap.get(k).rows.push(r);
  }
  const keys = [...groupsMap.keys()].sort((a, b) => a.localeCompare(b));

  let sno = 1;
  for (const key of keys) {
    const g = groupsMap.get(key);
    const { sums, count } = aggregate(g.rows, aggCols);
    const zebra = sno % 2 === 0 ? COLORS.zebraFill : null;
    const cells = [
      { text: String(sno), alignment: 'center', fontSize: fs, fillColor: zebra },
      { text: g.label, alignment: 'left', fontSize: fs, fillColor: zebra }
    ];
    for (const c of aggCols) cells.push({ text: aggText(c, sums, count), alignment: 'right', fontSize: fs, fillColor: zebra });
    body.push(cells);
    sno++;
  }

  const grand = aggregate(rows, aggCols);
  const totalRow = [
    { text: 'Net Total :', colSpan: 2, alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: fs },
    {}
  ];
  for (const c of aggCols) totalRow.push({ text: aggText(c, grand.sums, grand.count), alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: fs });
  body.push(totalRow);

  return [
    titleBlock(companyName, config.summaryTitle, dateLine, companyLogo),
    { table: { headerRows: 1, dontBreakRows: true, keepWithHeaderRows: 0, widths, body }, layout: baseLayout }
  ];
}

function makeBuilder(config) {
  return function buildDocDefinition(rows, companyName, fromDate, toDate, companyLogo) {
    const fs = config.fontSize;
    const aggCols = config.aggCols;
    const headers = ['S.No', config.innerHeader, ...aggCols.map(c => c.header)];
    const widths = [config.snoWidth || 30, '*', ...aggCols.map(c => c.width)];
    const colCount = headers.length;
    const dateLine = `From Date : ${ddmmyyyy(fromDate)}    To Date : ${ddmmyyyy(toDate)}`;

    const body = [headerCells(headers, fs)];

    const aggRow = (label, sums, count, fill, color, leadSpan, bold) => {
      const row = [{ text: label, colSpan: leadSpan, alignment: 'right', bold, color, fillColor: fill, fontSize: fs }];
      for (let k = 1; k < leadSpan; k++) row.push({});
      for (const c of aggCols) row.push({ text: aggText(c, sums, count), alignment: 'right', bold, color, fillColor: fill, fontSize: fs });
      return row;
    };

    // outer groups
    const outerMap = new Map();
    for (const r of rows) {
      const k = config.outerKey(r);
      if (!outerMap.has(k)) outerMap.set(k, { label: config.outerLabel(r), rows: [] });
      outerMap.get(k).rows.push(r);
    }
    const outerKeys = [...outerMap.keys()].sort((a, b) => a.localeCompare(b));

    for (const ok of outerKeys) {
      const outer = outerMap.get(ok);
      const ghr = [{ text: outer.label, colSpan: colCount, bold: true, color: COLORS.groupText, fillColor: COLORS.groupFill, fontSize: fs + 1, margin: [2, 2, 0, 2] }];
      for (let i = 1; i < colCount; i++) ghr.push({});
      body.push(ghr);

      // inner groups (per count)
      const innerMap = new Map();
      for (const r of outer.rows) {
        const ik = config.innerKey(r);
        if (!innerMap.has(ik)) innerMap.set(ik, { label: config.innerLabel(r), rows: [] });
        innerMap.get(ik).rows.push(r);
      }
      const innerKeys = [...innerMap.keys()].sort((a, b) => a.localeCompare(b));

      let sno = 1;
      for (const ik of innerKeys) {
        const inner = innerMap.get(ik);
        const { sums, count } = aggregate(inner.rows, aggCols);
        const zebra = sno % 2 === 0 ? COLORS.zebraFill : null;
        const cells = [
          { text: String(sno), alignment: 'center', fontSize: fs, fillColor: zebra },
          { text: inner.label, alignment: 'left', fontSize: fs, fillColor: zebra }
        ];
        for (const c of aggCols) cells.push({ text: aggText(c, sums, count), alignment: 'right', fontSize: fs, fillColor: zebra });
        body.push(cells);
        sno++;
      }

      const sub = aggregate(outer.rows, aggCols);
      body.push(aggRow('Total :', sub.sums, sub.count, COLORS.subFill, COLORS.subText, 2, true));
    }

    const grand = aggregate(rows, aggCols);
    body.push(aggRow('Grand Total :', grand.sums, grand.count, COLORS.grandFill, COLORS.grandText, 2, true));

    const summaryNodes = buildSummaryPage({ config, rows, companyName, dateLine, companyLogo });
    const detailTitle = titleBlock(companyName, config.title, dateLine, companyLogo);
    detailTitle.pageBreak = 'before';

    return {
      pageSize: 'A4',
      pageOrientation: 'portrait',
      pageMargins: [20, 20, 20, 40],
      footer: baseFooter,
      content: [
        ...summaryNodes,
        ...chartFromRows(rows, {
          groupKey: config.summaryKey, groupLabel: config.summaryLabel,
          valueFn: (r) => dec(r, 'NetWeight'), valueHeader: 'Net Wt',
          groupHeader: config.summaryGroupHeader, digits: 2
        }),
        detailTitle,
        { table: { headerRows: 1, dontBreakRows: true, keepWithHeaderRows: 0, widths, body }, layout: baseLayout }
      ],
      defaultStyle: { font: 'Roboto', fontSize: fs, lineHeight: 1.2 }
    };
  };
}

// ---- aggregate column sets ----
const weightCols = [
  { header: 'No. Of Bags', kind: 'count', width: 55 },
  { header: 'Del. Weight', key: 'DeliveryWeight', kind: 'sum', width: 62 },
  { header: 'Gross Wt', key: 'GrossWeight', kind: 'sum', width: 62 },
  { header: 'Tare Wt', key: 'TareWeight', kind: 'sum', width: 55 },
  { header: 'Net Wt', key: 'NetWeight', kind: 'sum', width: 62 },
  { header: 'Weight Diff', key: 'WeightDiff', kind: 'sum', width: 58 }
];
const dateWeightCols = [...weightCols, { header: 'Avg', key: 'WeightDiff', kind: 'avg', digits: 3, width: 48 }];

// ============================================================================
// DATE WISE — per Production Date -> per Count (sp_BagProductionDetails_GetByRefDate)
// ============================================================================
const dateWiseConfig = {
  title: 'YARN PRODUCTION - DATE WISE',
  summaryTitle: 'YARN PRODUCTION SUMMARY - COUNT WISE',
  fontSize: 8,
  innerHeader: 'Count',
  summaryGroupHeader: 'Count',
  outerKey: (r) => isoDate(r.ProductionDate),
  outerLabel: (r) => 'Date : ' + ddmmyyyy(r.ProductionDate),
  innerKey: (r) => (r.CountTypeCode != null ? String(r.CountTypeCode) : '') + '||' + (str(r, 'ShortName') || str(r, 'CountName')),
  innerLabel: (r) => str(r, 'ShortName') || str(r, 'CountName'),
  summaryKey: (r) => (r.CountTypeCode != null ? String(r.CountTypeCode) : '') + '||' + (str(r, 'ShortName') || str(r, 'CountName')),
  summaryLabel: (r) => str(r, 'ShortName') || str(r, 'CountName'),
  aggCols: dateWeightCols
};

// ============================================================================
// LOT NO WISE — per Lot No -> per Count Type (sp_YarnProduction_GetAll)
// ============================================================================
const lotNoWiseConfig = {
  title: 'YARN PRODUCTION - LOT NO WISE',
  summaryTitle: 'YARN PRODUCTION SUMMARY - COUNT WISE',
  fontSize: 8,
  innerHeader: 'Count Type',
  summaryGroupHeader: 'Count Type',
  outerKey: (r) => str(r, 'LotNo') || '(No Lot)',
  outerLabel: (r) => 'Lot No : ' + (str(r, 'LotNo') || '(No Lot)'),
  innerKey: (r) => str(r, 'CountType') || str(r, 'CountName') || '(Unknown)',
  innerLabel: (r) => str(r, 'CountType') || str(r, 'CountName') || '(Unknown)',
  summaryKey: (r) => str(r, 'CountType') || str(r, 'CountName') || '(Unknown)',
  summaryLabel: (r) => str(r, 'CountType') || str(r, 'CountName') || '(Unknown)',
  aggCols: weightCols
};

// ============================================================================
// COUNT WISE — per Production Date -> per Count Type, bags only (sp_YarnProduction_GetAll)
// ============================================================================
const countWiseConfig = {
  title: 'YARN PRODUCTION - COUNT WISE',
  summaryTitle: 'YARN PRODUCTION SUMMARY - COUNT WISE',
  fontSize: 8,
  snoWidth: 40,
  innerHeader: 'Count Type',
  summaryGroupHeader: 'Count Type',
  outerKey: (r) => isoDate(r.ProductionDate),
  outerLabel: (r) => 'Date : ' + ddmmyyyy(r.ProductionDate),
  innerKey: (r) => str(r, 'CountType') || str(r, 'CountName') || '(Unknown)',
  innerLabel: (r) => str(r, 'CountType') || str(r, 'CountName') || '(Unknown)',
  summaryKey: (r) => str(r, 'CountType') || str(r, 'CountName') || '(Unknown)',
  summaryLabel: (r) => str(r, 'CountType') || str(r, 'CountName') || '(Unknown)',
  aggCols: [{ header: 'No. of Bags', kind: 'count', width: 90 }]
};

export const dateWise = { buildDocDefinition: makeBuilder(dateWiseConfig) };
export const lotNoWise = { buildDocDefinition: makeBuilder(lotNoWiseConfig) };
export const countWise = { buildDocDefinition: makeBuilder(countWiseConfig) };

export default { dateWise, lotNoWise, countWise };
