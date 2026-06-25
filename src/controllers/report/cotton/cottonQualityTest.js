// Cotton Quality Test report — one controller, 3 grouping modes:
//   ?groupBy=date     (default) — grouped by CQTDate
//   ?groupBy=supplier            — grouped by SupplierName
//   ?groupBy=variety             — grouped by RawMaterialName
//
// SP: sp_CottonQualityTestDetails_GetAll (CompanyCode, FromDate, ToDate, ArrivalCode=0)
//     returns one row per (test, parameter); we list ONE line per test (deduped
//     by ArrivalCode) — Mill Lot / Test Date / Supplier / Variety / Station /
//     Bales / Grade / Rate.

import {
  runReport, buildPage, buildGroupSummaryPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy, sql
} from './_common.js';

const GROUP_CONFIGS = {
  date: {
    title: 'COTTON QUALITY TEST - DATE WISE',
    fileName: 'CottonQualityTest_DateWise',
    summaryGroupHeader: 'Date',
    summaryLabel: (g) => ddmmyyyy(g[0].CQTDate),
    groupKey: (r) => {
      const d = new Date(r.CQTDate);
      return isNaN(d.getTime()) ? '0000-00-00' : d.toISOString().slice(0, 10);
    },
    groupLabel: (g) => 'Date : ' + ddmmyyyy(g[0].CQTDate),
    sortFn: (a, b) => a[0].localeCompare(b[0])
  },
  supplier: {
    title: 'COTTON QUALITY TEST - SUPPLIER WISE',
    fileName: 'CottonQualityTest_SupplierWise',
    summaryGroupHeader: 'Supplier Name',
    summaryLabel: (g) => str(g[0], 'SupplierName'),
    groupKey: (r) => str(r, 'SupplierName') || '(Unknown Supplier)',
    groupLabel: (g) => 'Supplier : ' + str(g[0], 'SupplierName'),
    sortFn: (a, b) => a[0].localeCompare(b[0])
  },
  variety: {
    title: 'COTTON QUALITY TEST - VARIETY WISE',
    fileName: 'CottonQualityTest_VarietyWise',
    summaryGroupHeader: 'Variety',
    summaryLabel: (g) => str(g[0], 'RawMaterialName'),
    groupKey: (r) => str(r, 'RawMaterialName') || '(Unknown Variety)',
    groupLabel: (g) => 'Variety : ' + str(g[0], 'RawMaterialName'),
    sortFn: (a, b) => a[0].localeCompare(b[0])
  }
};

// 9 columns: S.No, Mill Lot No, Test Date, Supplier, Variety, Station, Bales, Grade, Rate
const WIDTHS = [26, 70, 60, '*', '*', '*', 44, 60, 60];
const HEADERS = [
  'S.No', 'Mill Lot No', 'Test Date', 'Supplier Name', 'Variety',
  'Station', 'Bales', 'Grade', 'Rate'
];

// Keep one line per TEST (the SP returns one row per parameter).
function dedupeByTest(rows) {
  const seen = new Map();
  for (const r of rows) {
    const k = r.ArrivalCode ?? `${str(r, 'MillLotNo')}|${str(r, 'CQTDate')}`;
    if (!seen.has(k)) seen.set(k, r);
  }
  return [...seen.values()];
}

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate, query }) {
  const groupBy = (query.groupBy || 'date').toLowerCase();
  const cfg = GROUP_CONFIGS[groupBy] || GROUP_CONFIGS.date;

  const tests = dedupeByTest(rows);

  const groupsMap = new Map();
  for (const r of tests) {
    const k = cfg.groupKey(r);
    if (!groupsMap.has(k)) groupsMap.set(k, []);
    groupsMap.get(k).push(r);
  }
  const sortedEntries = [...groupsMap.entries()].sort(cfg.sortFn);

  const body = [];
  body.push(HEADERS.map((t) => ({
    text: t, bold: true, fillColor: colors.headerFill, color: colors.headerText,
    alignment: 'center', fontSize: 8
  })));

  let gBales = 0, gCount = 0;
  let sno = 1;
  const groupSummaries = [];

  for (const [, group] of sortedEntries) {
    body.push([
      {
        text: cfg.groupLabel(group), colSpan: 9, bold: true,
        color: colors.groupText, fillColor: colors.groupFill, fontSize: 9, margin: [2, 2, 0, 2]
      },
      {}, {}, {}, {}, {}, {}, {}, {}
    ]);

    let sBales = 0;
    let rowIdx = 0;
    for (const r of group) {
      const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;
      const bales = dec(r, 'Qty');
      sBales += bales;
      const cell = (text, align = 'left') => ({ text, alignment: align, fontSize: 8, fillColor: zebra });
      body.push([
        cell(String(sno), 'center'),
        cell(str(r, 'MillLotNo'), 'center'),
        cell(ddmmyyyy(r.CQTDate), 'center'),
        cell(str(r, 'SupplierName')),
        cell(str(r, 'RawMaterialName')),
        cell(str(r, 'StationName')),
        cell(fmt(bales, 0), 'right'),
        cell(str(r, 'Grade'), 'center'),
        cell(fmt(dec(r, 'CandyRate'), 0), 'right')
      ]);
      sno++;
      rowIdx++;
    }

    const subCellStyle = { bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 8 };
    body.push([
      { text: `Sub Total (${group.length})`, colSpan: 6, alignment: 'right', ...subCellStyle },
      {}, {}, {}, {}, {},
      { text: fmt(sBales, 0), alignment: 'right', ...subCellStyle },
      { text: '', fillColor: colors.subFill },
      { text: '', fillColor: colors.subFill }
    ]);

    groupSummaries.push({ label: cfg.summaryLabel(group), totals: { tests: group.length, bales: sBales } });
    gBales += sBales;
    gCount += group.length;
  }

  const grandCellStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 };
  body.push([
    { text: `Grand Total (${gCount})`, colSpan: 6, alignment: 'right', ...grandCellStyle },
    {}, {}, {}, {}, {},
    { text: fmt(gBales, 0), alignment: 'right', ...grandCellStyle },
    { text: '', fillColor: colors.grandFill },
    { text: '', fillColor: colors.grandFill }
  ]);

  const summary = buildGroupSummaryPage({
    companyName, companyLogo, fromDate, toDate,
    title: cfg.title.replace(/COTTON QUALITY TEST/i, 'COTTON QUALITY TEST SUMMARY'),
    groupHeader: cfg.summaryGroupHeader,
    groupSummaries,
    grandTotals: { tests: gCount, bales: gBales },
    totalCols: [
      { header: 'Tests', key: 'tests', digits: 0 },
      { header: 'Bales', key: 'bales', digits: 0 }
    ]
  });

  return buildPage({
    companyName,
    companyLogo,
    title: cfg.title,
    fromDate,
    toDate,
    tables: [{
      table: { headerRows: 1, dontBreakRows: true, keepWithHeaderRows: 0, widths: WIDTHS, body },
      layout: tableLayout()
    }],
    summary
  });
}

export const cottonQualityTestReport = (req, res) => {
  const groupBy = (req.query.groupBy || 'date').toLowerCase();
  const cfg = GROUP_CONFIGS[groupBy] || GROUP_CONFIGS.date;
  return runReport(req, res, {
    spName: 'sp_CottonQualityTestDetails_GetAll',
    fileName: cfg.fileName,
    buildDocDefinition,
    // The slip SP takes a date range + a 0 ArrivalCode to return every test.
    spParams: (p) => ({
      CompanyCode: { type: sql.Int, value: parseInt(p.CompanyCode) || 0 },
      FromDate: { type: sql.DateTime, value: p.FromDate ? new Date(p.FromDate) : null },
      ToDate: { type: sql.DateTime, value: p.ToDate ? new Date(p.ToDate) : null },
      ArrivalCode: { type: sql.Int, value: 0 }
    })
  });
};
