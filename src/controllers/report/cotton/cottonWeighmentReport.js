// Cotton Weighment report — one controller, 6 modes:
//   ?groupBy=date     (default) — grouped by ArrivalDate
//   ?groupBy=supplier            — grouped by SupplierName
//   ?groupBy=variety             — grouped by RawMaterialName (Item Wise)
//   ?groupBy=agent               — grouped by AgentName
//   ?groupBy=station             — grouped by StationName
//   ?groupBy=withvalue           — grouped by SupplierName, adds Value + Act Rate cols
//
// SP: sp_CottonWeighment_GetAll (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, buildGroupSummaryPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy, estimateLines, topPadFor
} from './_common.js';

// ---- grouped variants (date / supplier / variety / agent / station) ----
const GROUPED_CONFIGS = {
  date: {
    title: 'COTTON WEIGHMENT - DATE WISE',
    fileName: 'CottonWeighment_DateWise',
    summaryGroupHeader: 'Date',
    summaryLabel: (g) => ddmmyyyy(g[0].ArrivalDate),
    groupKey: (r) => {
      const d = new Date(r.ArrivalDate);
      return isNaN(d.getTime()) ? '0000-00-00' : d.toISOString().slice(0, 10);
    },
    groupLabel: (g) => 'Date : ' + ddmmyyyy(g[0].ArrivalDate),
    sortFn: (a, b) => a[0].localeCompare(b[0])
  },
  supplier: {
    title: 'COTTON WEIGHMENT - SUPPLIER WISE',
    fileName: 'CottonWeighment_SupplierWise',
    summaryGroupHeader: 'Supplier Name',
    summaryLabel: (g) => str(g[0], 'SupplierName'),
    groupKey: (r) => str(r, 'SupplierName') || '(Unknown Supplier)',
    groupLabel: (g) => 'Supplier : ' + str(g[0], 'SupplierName'),
    sortFn: (a, b) => a[0].localeCompare(b[0])
  },
  variety: {
    title: 'COTTON WEIGHMENT - VARIETY WISE',
    fileName: 'CottonWeighment_VarietyWise',
    summaryGroupHeader: 'Variety',
    summaryLabel: (g) => str(g[0], 'RawMaterialName'),
    groupKey: (r) => str(r, 'RawMaterialName') || '(Unknown Variety)',
    groupLabel: (g) => 'Variety : ' + str(g[0], 'RawMaterialName'),
    sortFn: (a, b) => a[0].localeCompare(b[0])
  },
  agent: {
    title: 'COTTON WEIGHMENT - AGENT WISE',
    fileName: 'CottonWeighment_AgentWise',
    summaryGroupHeader: 'Agent Name',
    summaryLabel: (g) => str(g[0], 'AgentName'),
    groupKey: (r) => str(r, 'AgentName') || '(Unknown Agent)',
    groupLabel: (g) => 'Agent : ' + str(g[0], 'AgentName'),
    sortFn: (a, b) => a[0].localeCompare(b[0])
  },
  station: {
    title: 'COTTON WEIGHMENT - STATION WISE',
    fileName: 'CottonWeighment_StationWise',
    summaryGroupHeader: 'Station',
    summaryLabel: (g) => str(g[0], 'StationName'),
    groupKey: (r) => str(r, 'StationName') || '(Unknown Station)',
    groupLabel: (g) => 'Station : ' + str(g[0], 'StationName'),
    sortFn: (a, b) => a[0].localeCompare(b[0])
  }
};

// 17 columns shared by every grouped variant.
const GROUPED_WIDTHS = [20, 38, 44, 44, '*', '*', '*', '*', 30, 38, 40, 40, 40, 40, 40, 40, 36];
const GROUPED_HEADERS = [
  'S.No', 'Mill Lot No', 'Arr Date', 'Weigh Date', 'Supplier Name', 'Agent Name',
  'Station', 'Variety', 'Bales', 'Rate/Kg',
  'P-Gross', 'P-Tare', 'P-Net', 'M-Gross', 'M-Tare', 'M-Net', 'Diff'
];
const GROUPED_CHARS_PER_LINE = {
  millLot: 12, supplier: 14, agent: 14, station: 14, variety: 14
};

function buildGroupedDoc({ rows, companyName, companyLogo, fromDate, toDate, cfg }) {
  const groupsMap = new Map();
  for (const r of rows) {
    const k = cfg.groupKey(r);
    if (!groupsMap.has(k)) groupsMap.set(k, []);
    groupsMap.get(k).push(r);
  }
  const sortedEntries = [...groupsMap.entries()].sort(cfg.sortFn);

  const body = [];
  body.push(GROUPED_HEADERS.map(t => ({
    text: t, bold: true, fillColor: colors.headerFill, color: colors.headerText,
    alignment: 'center', fontSize: 8
  })));

  let gBales = 0, gPG = 0, gPT = 0, gPN = 0, gMG = 0, gMT = 0, gMN = 0;
  let sno = 1;
  const groupSummaries = [];

  for (const [, group] of sortedEntries) {
    body.push([
      {
        text: cfg.groupLabel(group), colSpan: 17, bold: true,
        color: colors.groupText, fillColor: colors.groupFill, fontSize: 9, margin: [2, 2, 0, 2]
      },
      {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}
    ]);

    let sBales = 0, sPG = 0, sPT = 0, sPN = 0, sMG = 0, sMT = 0, sMN = 0;
    let rowIdx = 0;

    for (const r of group) {
      const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;

      const millLot = str(r, 'MillLotNo');
      const supplier = str(r, 'SupplierName');
      const agent = str(r, 'AgentName');
      const station = str(r, 'StationName');
      const variety = str(r, 'RawMaterialName');

      const lines = {
        millLot: estimateLines(millLot, GROUPED_CHARS_PER_LINE.millLot),
        supplier: estimateLines(supplier, GROUPED_CHARS_PER_LINE.supplier),
        agent: estimateLines(agent, GROUPED_CHARS_PER_LINE.agent),
        station: estimateLines(station, GROUPED_CHARS_PER_LINE.station),
        variety: estimateLines(variety, GROUPED_CHARS_PER_LINE.variety)
      };
      const maxLines = Math.max(1, ...Object.values(lines));

      const cell = (text, align = 'left', cellLines = 1) => ({
        text, alignment: align, fontSize: 7.5, fillColor: zebra,
        margin: [0, topPadFor(maxLines, cellLines), 0, 0]
      });

      const bales = dec(r, 'NoofBales');
      const pg = dec(r, 'PartyGrossWeight');
      const pt = dec(r, 'PartyTareWeight');
      const pn = dec(r, 'PartyNetWeight');
      const mg = dec(r, 'TotalGrossWeight');
      const mt = dec(r, 'TotalTareWeight');
      const mn = dec(r, 'TotalNetWeight');
      const diff = pn - mn;

      sBales += bales; sPG += pg; sPT += pt; sPN += pn;
      sMG += mg; sMT += mt; sMN += mn;

      body.push([
        cell(String(sno), 'center'),
        cell(millLot, 'center', lines.millLot),
        cell(ddmmyyyy(r.ArrivalDate), 'center'),
        cell(ddmmyyyy(r.WeighmentDate), 'center'),
        cell(supplier, 'left', lines.supplier),
        cell(agent, 'left', lines.agent),
        cell(station, 'left', lines.station),
        cell(variety, 'left', lines.variety),
        cell(fmt(bales, 0), 'right'),
        cell(fmt(dec(r, 'Rate'), 2), 'right'),
        cell(fmt(pg, 0), 'right'),
        cell(fmt(pt, 0), 'right'),
        cell(fmt(pn, 0), 'right'),
        cell(fmt(mg, 0), 'right'),
        cell(fmt(mt, 0), 'right'),
        cell(fmt(mn, 0), 'right'),
        cell(fmt(diff, 0), 'right')
      ]);
      sno++;
      rowIdx++;
    }

    const subStyle = { bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 8 };
    body.push([
      { text: 'Sub Total', colSpan: 8, alignment: 'right', ...subStyle },
      {}, {}, {}, {}, {}, {}, {},
      { text: fmt(sBales, 0), alignment: 'right', ...subStyle },
      { text: '', fillColor: colors.subFill },
      { text: fmt(sPG, 0), alignment: 'right', ...subStyle },
      { text: fmt(sPT, 0), alignment: 'right', ...subStyle },
      { text: fmt(sPN, 0), alignment: 'right', ...subStyle },
      { text: fmt(sMG, 0), alignment: 'right', ...subStyle },
      { text: fmt(sMT, 0), alignment: 'right', ...subStyle },
      { text: fmt(sMN, 0), alignment: 'right', ...subStyle },
      { text: fmt(sPN - sMN, 0), alignment: 'right', ...subStyle }
    ]);

    groupSummaries.push({
      label: cfg.summaryLabel(group),
      totals: { bales: sBales, pGross: sPG, pTare: sPT, pNet: sPN, mGross: sMG, mTare: sMT, mNet: sMN, diff: sPN - sMN }
    });

    gBales += sBales; gPG += sPG; gPT += sPT; gPN += sPN;
    gMG += sMG; gMT += sMT; gMN += sMN;
  }

  const gStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 };
  body.push([
    { text: 'Grand Total', colSpan: 8, alignment: 'right', ...gStyle },
    {}, {}, {}, {}, {}, {}, {},
    { text: fmt(gBales, 0), alignment: 'right', ...gStyle },
    { text: '', fillColor: colors.grandFill },
    { text: fmt(gPG, 0), alignment: 'right', ...gStyle },
    { text: fmt(gPT, 0), alignment: 'right', ...gStyle },
    { text: fmt(gPN, 0), alignment: 'right', ...gStyle },
    { text: fmt(gMG, 0), alignment: 'right', ...gStyle },
    { text: fmt(gMT, 0), alignment: 'right', ...gStyle },
    { text: fmt(gMN, 0), alignment: 'right', ...gStyle },
    { text: fmt(gPN - gMN, 0), alignment: 'right', ...gStyle }
  ]);

  const summary = buildGroupSummaryPage({
    companyName, companyLogo, fromDate, toDate,
    title: cfg.title.replace(/COTTON WEIGHMENT/i, 'COTTON WEIGHMENT SUMMARY'),
    groupHeader: cfg.summaryGroupHeader,
    groupSummaries,
    grandTotals: { bales: gBales, pGross: gPG, pTare: gPT, pNet: gPN, mGross: gMG, mTare: gMT, mNet: gMN, diff: gPN - gMN },
    totalCols: [
      { header: 'Bales', key: 'bales', digits: 0 },
      { header: 'P-Gross', key: 'pGross', digits: 0 },
      { header: 'P-Tare', key: 'pTare', digits: 0 },
      { header: 'P-Net', key: 'pNet', digits: 0 },
      { header: 'M-Gross', key: 'mGross', digits: 0 },
      { header: 'M-Tare', key: 'mTare', digits: 0 },
      { header: 'M-Net', key: 'mNet', digits: 0 },
      { header: 'Diff', key: 'diff', digits: 0 }
    ]
  });

  return buildPage({
    companyName, companyLogo, title: cfg.title, fromDate, toDate,
    tables: [{
      table: { headerRows: 1, dontBreakRows: true, keepWithHeaderRows: 0, widths: GROUPED_WIDTHS, body },
      layout: tableLayout()
    }],
    summary
  });
}

// ---- With Value variant (grouped by Supplier, money columns) ----
const WV_WIDTHS = [20, 40, 46, '*', '*', 32, 42, 44, 44, 44, 60, 44, 44, 44, 44, 44, 60, 36];
const WV_HEADERS = [
  'S.No', 'Mill Lot No', 'Arr Date', 'Supplier Name', 'Variety', 'Bales', 'Rate/Kg',
  'P-Gross', 'P-Tare', 'P-Net', 'Value',
  'M-Gross', 'M-Allow', 'M-Samp', 'M-Tare', 'M-Net', 'Act Value', 'Diff'
];
const WV_CHARS_PER_LINE = { millLot: 12, supplier: 16, variety: 14 };

function buildWithValueDoc({ rows, companyName, companyLogo, fromDate, toDate }) {
  const cfg = {
    title: 'COTTON WEIGHMENT - WITH VALUE',
    groupKey: (r) => str(r, 'SupplierName') || '(Unknown Supplier)',
    groupLabel: (g) => 'Supplier : ' + str(g[0], 'SupplierName'),
    summaryGroupHeader: 'Supplier Name',
    summaryLabel: (g) => str(g[0], 'SupplierName')
  };

  const groupsMap = new Map();
  for (const r of rows) {
    const k = cfg.groupKey(r);
    if (!groupsMap.has(k)) groupsMap.set(k, []);
    groupsMap.get(k).push(r);
  }
  const sortedEntries = [...groupsMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const body = [];
  body.push(WV_HEADERS.map(t => ({
    text: t, bold: true, fillColor: colors.headerFill, color: colors.headerText,
    alignment: 'center', fontSize: 8
  })));

  let gBales = 0, gPG = 0, gPT = 0, gPN = 0, gVal = 0;
  let gMG = 0, gMA = 0, gMS = 0, gMT = 0, gMN = 0;
  let sno = 1;
  const groupSummaries = [];

  for (const [, group] of sortedEntries) {
    body.push([
      {
        text: cfg.groupLabel(group), colSpan: 18, bold: true,
        color: colors.groupText, fillColor: colors.groupFill, fontSize: 9, margin: [2, 2, 0, 2]
      },
      {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}
    ]);

    let sBales = 0, sPG = 0, sPT = 0, sPN = 0, sVal = 0;
    let sMG = 0, sMA = 0, sMS = 0, sMT = 0, sMN = 0;
    let rowIdx = 0;

    for (const r of group) {
      const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;

      const millLot = str(r, 'MillLotNo');
      const supplier = str(r, 'SupplierName');
      const variety = str(r, 'RawMaterialName');

      const lines = {
        millLot: estimateLines(millLot, WV_CHARS_PER_LINE.millLot),
        supplier: estimateLines(supplier, WV_CHARS_PER_LINE.supplier),
        variety: estimateLines(variety, WV_CHARS_PER_LINE.variety)
      };
      const maxLines = Math.max(1, ...Object.values(lines));

      const cell = (text, align = 'left', cellLines = 1) => ({
        text, alignment: align, fontSize: 7.5, fillColor: zebra,
        margin: [0, topPadFor(maxLines, cellLines), 0, 0]
      });

      const bales = dec(r, 'NoofBales');
      const pg = dec(r, 'PartyGrossWeight');
      const pt = dec(r, 'PartyTareWeight');
      const pn = dec(r, 'PartyNetWeight');
      const val = dec(r, 'NetAmount');
      const mg = dec(r, 'TotalGrossWeight');
      const ma = dec(r, 'TotalAllowance');
      const ms = dec(r, 'TotalSamplesWeight');
      const mt = dec(r, 'TotalTareWeight');
      const mn = dec(r, 'TotalNetWeight');
      const actRate = mn > 0 ? val / mn : 0;
      const actValue = actRate * mn;
      const diff = pn - mn;

      sBales += bales; sPG += pg; sPT += pt; sPN += pn; sVal += val;
      sMG += mg; sMA += ma; sMS += ms; sMT += mt; sMN += mn;

      body.push([
        cell(String(sno), 'center'),
        cell(millLot, 'center', lines.millLot),
        cell(ddmmyyyy(r.ArrivalDate), 'center'),
        cell(supplier, 'left', lines.supplier),
        cell(variety, 'left', lines.variety),
        cell(fmt(bales, 0), 'right'),
        cell(fmt(dec(r, 'Rate'), 2), 'right'),
        cell(fmt(pg, 0), 'right'),
        cell(fmt(pt, 0), 'right'),
        cell(fmt(pn, 0), 'right'),
        cell(fmt(val, 2), 'right'),
        cell(fmt(mg, 0), 'right'),
        cell(fmt(ma, 0), 'right'),
        cell(fmt(ms, 0), 'right'),
        cell(fmt(mt, 0), 'right'),
        cell(fmt(mn, 0), 'right'),
        cell(fmt(actValue, 2), 'right'),
        cell(fmt(diff, 0), 'right')
      ]);
      sno++;
      rowIdx++;
    }

    const subStyle = { bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 8 };
    const sActRate = sMN > 0 ? sVal / sMN : 0;
    body.push([
      { text: 'Sub Total', colSpan: 5, alignment: 'right', ...subStyle },
      {}, {}, {}, {},
      { text: fmt(sBales, 0), alignment: 'right', ...subStyle },
      { text: '', fillColor: colors.subFill },
      { text: fmt(sPG, 0), alignment: 'right', ...subStyle },
      { text: fmt(sPT, 0), alignment: 'right', ...subStyle },
      { text: fmt(sPN, 0), alignment: 'right', ...subStyle },
      { text: fmt(sVal, 2), alignment: 'right', ...subStyle },
      { text: fmt(sMG, 0), alignment: 'right', ...subStyle },
      { text: fmt(sMA, 0), alignment: 'right', ...subStyle },
      { text: fmt(sMS, 0), alignment: 'right', ...subStyle },
      { text: fmt(sMT, 0), alignment: 'right', ...subStyle },
      { text: fmt(sMN, 0), alignment: 'right', ...subStyle },
      { text: fmt(sActRate * sMN, 2), alignment: 'right', ...subStyle },
      { text: fmt(sPN - sMN, 0), alignment: 'right', ...subStyle }
    ]);

    groupSummaries.push({
      label: cfg.summaryLabel(group),
      totals: {
        bales: sBales, pNet: sPN, value: sVal,
        mNet: sMN, actValue: sActRate * sMN, diff: sPN - sMN
      }
    });

    gBales += sBales; gPG += sPG; gPT += sPT; gPN += sPN; gVal += sVal;
    gMG += sMG; gMA += sMA; gMS += sMS; gMT += sMT; gMN += sMN;
  }

  const gStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 };
  const gActRate = gMN > 0 ? gVal / gMN : 0;
  body.push([
    { text: 'Grand Total', colSpan: 5, alignment: 'right', ...gStyle },
    {}, {}, {}, {},
    { text: fmt(gBales, 0), alignment: 'right', ...gStyle },
    { text: '', fillColor: colors.grandFill },
    { text: fmt(gPG, 0), alignment: 'right', ...gStyle },
    { text: fmt(gPT, 0), alignment: 'right', ...gStyle },
    { text: fmt(gPN, 0), alignment: 'right', ...gStyle },
    { text: fmt(gVal, 2), alignment: 'right', ...gStyle },
    { text: fmt(gMG, 0), alignment: 'right', ...gStyle },
    { text: fmt(gMA, 0), alignment: 'right', ...gStyle },
    { text: fmt(gMS, 0), alignment: 'right', ...gStyle },
    { text: fmt(gMT, 0), alignment: 'right', ...gStyle },
    { text: fmt(gMN, 0), alignment: 'right', ...gStyle },
    { text: fmt(gActRate * gMN, 2), alignment: 'right', ...gStyle },
    { text: fmt(gPN - gMN, 0), alignment: 'right', ...gStyle }
  ]);

  const summary = buildGroupSummaryPage({
    companyName, companyLogo, fromDate, toDate,
    title: cfg.title.replace(/COTTON WEIGHMENT/i, 'COTTON WEIGHMENT SUMMARY'),
    groupHeader: cfg.summaryGroupHeader,
    groupSummaries,
    grandTotals: {
      bales: gBales, pNet: gPN, value: gVal,
      mNet: gMN, actValue: gActRate * gMN, diff: gPN - gMN
    },
    totalCols: [
      { header: 'Bales', key: 'bales', digits: 0 },
      { header: 'P-Net', key: 'pNet', digits: 0 },
      { header: 'Value', key: 'value', digits: 2 },
      { header: 'M-Net', key: 'mNet', digits: 0 },
      { header: 'Act Value', key: 'actValue', digits: 2 },
      { header: 'Diff', key: 'diff', digits: 0 }
    ]
  });

  return buildPage({
    companyName, companyLogo, title: cfg.title, fromDate, toDate,
    tables: [{
      table: { headerRows: 1, dontBreakRows: true, keepWithHeaderRows: 0, widths: WV_WIDTHS, body },
      layout: tableLayout()
    }],
    summary
  });
}

// ---- dispatcher ----
function pickMode(query) {
  const raw = (query.groupBy || 'date').toLowerCase();
  if (raw === 'withvalue' || raw === 'with-value' || raw === 'value') return 'withvalue';
  if (GROUPED_CONFIGS[raw]) return raw;
  return 'date';
}

function buildDocDefinition(ctx) {
  const mode = pickMode(ctx.query);
  if (mode === 'withvalue') return buildWithValueDoc(ctx);
  return buildGroupedDoc({ ...ctx, cfg: GROUPED_CONFIGS[mode] });
}

export const cottonWeighmentReportHandler = (req, res) => {
  const mode = pickMode(req.query);
  const fileName = mode === 'withvalue'
    ? 'CottonWeighment_WithValue'
    : GROUPED_CONFIGS[mode].fileName;
  return runReport(req, res, {
    spName: 'sp_CottonWeighment_GetAll',
    fileName,
    buildDocDefinition
  });
};
