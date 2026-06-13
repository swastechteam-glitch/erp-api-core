// Cotton Mixing Issue report — one controller, 4 modes:
//   ?groupBy=date     (default) — grouped by CottonIssueDate
//   ?groupBy=mixing            — grouped by CottonCountName  (Mixing Count Wise)
//   ?groupBy=item              — grouped by RawMaterialName  (Item / Variety Wise)
//   ?groupBy=station           — grouped by StationName      (newly added)
//
// SP: web_sp_CottonIssueDetails_GetAll (CompanyCode, FromDate, ToDate, IssueType='ISSUE')

import {
  runReport, buildPage, buildGroupSummaryPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy, estimateLines, topPadFor, sql
} from './_common.js';

const GROUP_CONFIGS = {
  date: {
    title: 'COTTON MIXING ISSUE - DATE WISE',
    fileName: 'CottonMixingIssue_DateWise',
    summaryGroupHeader: 'Date',
    summaryLabel: (g) => ddmmyyyy(g[0].CottonIssueDate),
    groupKey: (r) => {
      const d = new Date(r.CottonIssueDate);
      return isNaN(d.getTime()) ? '0000-00-00' : d.toISOString().slice(0, 10);
    },
    groupLabel: (g) => 'Date : ' + ddmmyyyy(g[0].CottonIssueDate),
    sortFn: (a, b) => a[0].localeCompare(b[0])
  },
  mixing: {
    title: 'COTTON MIXING ISSUE - MIXING COUNT WISE',
    fileName: 'CottonMixingIssue_MixingCountWise',
    summaryGroupHeader: 'Mixing Count',
    summaryLabel: (g) => str(g[0], 'CottonCountName'),
    groupKey: (r) => str(r, 'CottonCountName') || '(Unknown Mixing)',
    groupLabel: (g) => 'Mixing Count : ' + str(g[0], 'CottonCountName'),
    sortFn: (a, b) => a[0].localeCompare(b[0])
  },
  item: {
    title: 'COTTON MIXING ISSUE - ITEM WISE',
    fileName: 'CottonMixingIssue_ItemWise',
    summaryGroupHeader: 'Variety',
    summaryLabel: (g) => str(g[0], 'RawMaterialName'),
    groupKey: (r) => str(r, 'RawMaterialName') || '(Unknown Variety)',
    groupLabel: (g) => 'Variety : ' + str(g[0], 'RawMaterialName'),
    sortFn: (a, b) => a[0].localeCompare(b[0])
  },
  station: {
    title: 'COTTON MIXING ISSUE - STATION WISE',
    fileName: 'CottonMixingIssue_StationWise',
    summaryGroupHeader: 'Station',
    summaryLabel: (g) => str(g[0], 'StationName'),
    groupKey: (r) => str(r, 'StationName') || '(Unknown Station)',
    groupLabel: (g) => 'Station : ' + str(g[0], 'StationName'),
    sortFn: (a, b) => a[0].localeCompare(b[0])
  }
};

// 14 columns shared by every mode.
const WIDTHS = [22, 42, 48, 32, '*', '*', '*', '*', 42, 36, 36, 42, 42, 50];
const HEADERS = [
  'S.No', 'Mill Lot No', 'Issue Date', 'Bale No', 'Supplier', 'Station', 'Variety',
  'Mix Count', 'Gross Wt', 'Allow', 'Tare', 'Net Wt', 'Act Rate', 'Value'
];
const CHARS_PER_LINE = {
  millLot: 12, supplier: 14, station: 14, variety: 14, mixCount: 12
};

// Net Wt per RDLC: CurrentWt - (Allowance + TareWeight + SampleWeight)
function netWt(r) {
  return dec(r, 'CurrentWt') - (dec(r, 'Allowance') + dec(r, 'TareWeight') + dec(r, 'SampleWeight'));
}

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate, query }) {
  const groupBy = (query.groupBy || 'date').toLowerCase();
  const cfg = GROUP_CONFIGS[groupBy] || GROUP_CONFIGS.date;

  const groupsMap = new Map();
  for (const r of rows) {
    const k = cfg.groupKey(r);
    if (!groupsMap.has(k)) groupsMap.set(k, []);
    groupsMap.get(k).push(r);
  }
  const sortedEntries = [...groupsMap.entries()].sort(cfg.sortFn);

  const body = [];
  body.push(HEADERS.map(t => ({
    text: t, bold: true, fillColor: colors.headerFill, color: colors.headerText,
    alignment: 'center', fontSize: 8
  })));

  let gBales = 0, gGross = 0, gAllow = 0, gTare = 0, gNet = 0, gValue = 0;
  let sno = 1;
  const groupSummaries = [];

  for (const [, group] of sortedEntries) {
    body.push([
      {
        text: cfg.groupLabel(group), colSpan: 14, bold: true,
        color: colors.groupText, fillColor: colors.groupFill, fontSize: 9, margin: [2, 2, 0, 2]
      },
      {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}
    ]);

    let sBales = 0, sGross = 0, sAllow = 0, sTare = 0, sNet = 0, sValue = 0;
    let sRateSum = 0, sRateCount = 0;
    let rowIdx = 0;

    for (const r of group) {
      const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;

      const millLot = str(r, 'MillLotNo');
      const supplier = str(r, 'SupplierName');
      const station = str(r, 'StationName');
      const variety = str(r, 'RawMaterialName');
      const mixCount = str(r, 'CottonCountName');

      const lines = {
        millLot: estimateLines(millLot, CHARS_PER_LINE.millLot),
        supplier: estimateLines(supplier, CHARS_PER_LINE.supplier),
        station: estimateLines(station, CHARS_PER_LINE.station),
        variety: estimateLines(variety, CHARS_PER_LINE.variety),
        mixCount: estimateLines(mixCount, CHARS_PER_LINE.mixCount)
      };
      const maxLines = Math.max(1, ...Object.values(lines));

      const cell = (text, align = 'left', cellLines = 1) => ({
        text, alignment: align, fontSize: 7.5, fillColor: zebra,
        margin: [0, topPadFor(maxLines, cellLines), 0, 0]
      });

      const gross = dec(r, 'GrossWeight');
      const allow = dec(r, 'Allowance');
      const tare = dec(r, 'TareWeight');
      const net = netWt(r);
      const value = dec(r, 'ActValue');
      const rate = dec(r, 'ActRateKgs');

      sBales += 1;
      sGross += gross;
      sAllow += allow;
      sTare += tare;
      sNet += net;
      sValue += value;
      if (rate > 0) { sRateSum += rate; sRateCount++; }

      body.push([
        cell(String(sno), 'center'),
        cell(millLot, 'center', lines.millLot),
        cell(ddmmyyyy(r.CottonIssueDate), 'center'),
        cell(String(r.BaleNo ?? ''), 'right'),
        cell(supplier, 'left', lines.supplier),
        cell(station, 'left', lines.station),
        cell(variety, 'left', lines.variety),
        cell(mixCount, 'left', lines.mixCount),
        cell(fmt(gross, 2), 'right'),
        cell(fmt(allow, 2), 'right'),
        cell(fmt(tare, 2), 'right'),
        cell(fmt(net, 2), 'right'),
        cell(fmt(rate, 2), 'right'),
        cell(fmt(value, 2), 'right')
      ]);
      sno++;
      rowIdx++;
    }

    const subStyle = { bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 8 };
    const sAvgRate = sRateCount > 0 ? sRateSum / sRateCount : 0;
    body.push([
      { text: 'Sub Total', colSpan: 8, alignment: 'right', ...subStyle },
      {}, {}, {}, {}, {}, {}, {},
      { text: fmt(sGross, 2), alignment: 'right', ...subStyle },
      { text: fmt(sAllow, 2), alignment: 'right', ...subStyle },
      { text: fmt(sTare, 2), alignment: 'right', ...subStyle },
      { text: fmt(sNet, 2), alignment: 'right', ...subStyle },
      { text: fmt(sAvgRate, 2), alignment: 'right', ...subStyle },
      { text: fmt(sValue, 2), alignment: 'right', ...subStyle }
    ]);

    groupSummaries.push({
      label: cfg.summaryLabel(group),
      totals: { bales: sBales, gross: sGross, allow: sAllow, tare: sTare, net: sNet, rate: sAvgRate, value: sValue }
    });

    gBales += sBales;
    gGross += sGross;
    gAllow += sAllow;
    gTare += sTare;
    gNet += sNet;
    gValue += sValue;
  }

  // Grand total — average rate across all rows
  let totalRateSum = 0, totalRateCount = 0;
  for (const r of rows) {
    const rt = dec(r, 'ActRateKgs');
    if (rt > 0) { totalRateSum += rt; totalRateCount++; }
  }
  const gAvgRate = totalRateCount > 0 ? totalRateSum / totalRateCount : 0;

  const gStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 };
  body.push([
    { text: `Grand Total (${gBales} Bales)`, colSpan: 8, alignment: 'right', ...gStyle },
    {}, {}, {}, {}, {}, {}, {},
    { text: fmt(gGross, 2), alignment: 'right', ...gStyle },
    { text: fmt(gAllow, 2), alignment: 'right', ...gStyle },
    { text: fmt(gTare, 2), alignment: 'right', ...gStyle },
    { text: fmt(gNet, 2), alignment: 'right', ...gStyle },
    { text: fmt(gAvgRate, 2), alignment: 'right', ...gStyle },
    { text: fmt(gValue, 2), alignment: 'right', ...gStyle }
  ]);

  const summary = buildGroupSummaryPage({
    companyName, companyLogo, fromDate, toDate,
    title: cfg.title.replace(/COTTON MIXING ISSUE/i, 'COTTON MIXING ISSUE SUMMARY'),
    groupHeader: cfg.summaryGroupHeader,
    groupSummaries,
    grandTotals: { bales: gBales, gross: gGross, allow: gAllow, tare: gTare, net: gNet, rate: gAvgRate, value: gValue },
    totalCols: [
      { header: 'Bales', key: 'bales', digits: 0 },
      { header: 'Gross Wt', key: 'gross', digits: 2 },
      { header: 'Allow', key: 'allow', digits: 2 },
      { header: 'Tare', key: 'tare', digits: 2 },
      { header: 'Net Wt', key: 'net', digits: 2 },
      { header: 'Act Rate', key: 'rate', digits: 2 },
      { header: 'Value', key: 'value', digits: 2 }
    ]
  });

  return buildPage({
    companyName, companyLogo, title: cfg.title, fromDate, toDate,
    tables: [{
      table: { headerRows: 1, dontBreakRows: true, keepWithHeaderRows: 0, widths: WIDTHS, body },
      layout: tableLayout()
    }],
    summary
  });
}

export const cottonMixingIssueReport = (req, res) => {
  const groupBy = (req.query.groupBy || 'date').toLowerCase();
  const cfg = GROUP_CONFIGS[groupBy] || GROUP_CONFIGS.date;
  return runReport(req, res, {
    spName: 'web_sp_CottonIssueDetails_GetAll',
    fileName: cfg.fileName,
    buildDocDefinition,
    spParams: (p) => ({
      CompanyCode: { type: sql.Int, value: parseInt(p.CompanyCode) || 0 },
      FromDate: { type: sql.DateTime, value: p.FromDate ? new Date(p.FromDate) : null },
      ToDate: { type: sql.DateTime, value: p.ToDate ? new Date(p.ToDate) : null },
      IssueType: { type: sql.NVarChar(5), value: 'ISSUE' }
    })
  });
};
