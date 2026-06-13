// Cotton Arrival report — one controller, 4 grouping modes:
//   ?groupBy=date     (default) — grouped by ArrivalDate
//   ?groupBy=supplier            — grouped by SupplierName
//   ?groupBy=variety             — grouped by RawMaterialName  (a.k.a. Item Wise)
//   ?groupBy=agent               — grouped by AgentName
//
// SP: sp_CottonArrival_GetAll (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, buildGroupSummaryPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy, estimateLines, topPadFor
} from './_common.js';

const GROUP_CONFIGS = {
  date: {
    title: 'COTTON ARRIVAL - DATE WISE',
    fileName: 'CottonArrival_DateWise',
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
    title: 'COTTON ARRIVAL - SUPPLIER WISE',
    fileName: 'CottonArrival_SupplierWise',
    summaryGroupHeader: 'Supplier Name',
    summaryLabel: (g) => str(g[0], 'SupplierName'),
    groupKey: (r) => str(r, 'SupplierName') || '(Unknown Supplier)',
    groupLabel: (g) => 'Supplier : ' + str(g[0], 'SupplierName'),
    sortFn: (a, b) => a[0].localeCompare(b[0])
  },
  variety: {
    title: 'COTTON ARRIVAL - VARIETY WISE',
    fileName: 'CottonArrival_VarietyWise',
    summaryGroupHeader: 'Variety',
    summaryLabel: (g) => str(g[0], 'RawMaterialName'),
    groupKey: (r) => str(r, 'RawMaterialName') || '(Unknown Variety)',
    groupLabel: (g) => 'Variety : ' + str(g[0], 'RawMaterialName'),
    sortFn: (a, b) => a[0].localeCompare(b[0])
  },
  agent: {
    title: 'COTTON ARRIVAL - AGENT WISE',
    fileName: 'CottonArrival_AgentWise',
    summaryGroupHeader: 'Agent Name',
    summaryLabel: (g) => str(g[0], 'AgentName'),
    groupKey: (r) => str(r, 'AgentName') || '(Unknown Agent)',
    groupLabel: (g) => 'Agent : ' + str(g[0], 'AgentName'),
    sortFn: (a, b) => a[0].localeCompare(b[0])
  }
};

// 15 columns: S.No, Mill Lot No, Arrival Date, CPO No, Supplier, Agent, Station,
//             Variety, Bales, Rate/Candy, Gross Wt, Tare Wt, Net Wt, LRNo, Transporter
const WIDTHS = [22, 40, 48, 35, '*', '*', '*', '*', 34, 42, 48, 44, 48, 42, '*'];
const HEADERS = [
  'S.No', 'Mill Lot No', 'Arrival Date', 'CPO No', 'Supplier Name', 'Agent Name',
  'Station', 'Variety', 'Bales', 'Rate/Candy', 'Gross Wt', 'Tare Wt', 'Net Wt',
  'LR No', 'Transporter'
];
const CHARS_PER_LINE = {
  millLot: 12, supplier: 14, agent: 14, station: 14, variety: 14, lrNo: 12, transporter: 14
};

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

  let gBales = 0, gGross = 0, gTare = 0, gNet = 0;
  let sno = 1;
  const groupSummaries = [];

  for (const [, group] of sortedEntries) {
    // Group header row spanning all 15 cols
    body.push([
      {
        text: cfg.groupLabel(group), colSpan: 15, bold: true,
        color: colors.groupText, fillColor: colors.groupFill, fontSize: 9, margin: [2, 2, 0, 2]
      },
      {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}
    ]);

    let sBales = 0, sGross = 0, sTare = 0, sNet = 0;
    let rowIdx = 0;

    for (const r of group) {
      const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;

      const millLot = str(r, 'MillLotNo');
      const supplier = str(r, 'SupplierName');
      const agent = str(r, 'AgentName');
      const station = str(r, 'StationName');
      const variety = str(r, 'RawMaterialName');
      const lrNo = str(r, 'LRNo');
      const transporter = str(r, 'TransporterName');

      const lines = {
        millLot: estimateLines(millLot, CHARS_PER_LINE.millLot),
        supplier: estimateLines(supplier, CHARS_PER_LINE.supplier),
        agent: estimateLines(agent, CHARS_PER_LINE.agent),
        station: estimateLines(station, CHARS_PER_LINE.station),
        variety: estimateLines(variety, CHARS_PER_LINE.variety),
        lrNo: estimateLines(lrNo, CHARS_PER_LINE.lrNo),
        transporter: estimateLines(transporter, CHARS_PER_LINE.transporter)
      };
      const maxLines = Math.max(1, ...Object.values(lines));

      const cell = (text, align = 'left', cellLines = 1) => ({
        text, alignment: align, fontSize: 8, fillColor: zebra,
        margin: [0, topPadFor(maxLines, cellLines), 0, 0]
      });

      const bales = dec(r, 'Qty');
      const gross = dec(r, 'PartyGrossWeight');
      const tare = dec(r, 'PartyTareWeight');
      const net = dec(r, 'PartyNetWeight');
      sBales += bales;
      sGross += gross;
      sTare += tare;
      sNet += net;

      body.push([
        cell(String(sno), 'center'),
        cell(millLot, 'center', lines.millLot),
        cell(ddmmyyyy(r.ArrivalDate), 'center'),
        cell(String(r.CPONo ?? ''), 'center'),
        cell(supplier, 'left', lines.supplier),
        cell(agent, 'left', lines.agent),
        cell(station, 'left', lines.station),
        cell(variety, 'left', lines.variety),
        cell(fmt(bales, 0), 'right'),
        cell(fmt(dec(r, 'CandyRate'), 0), 'right'),
        cell(fmt(gross, 2), 'right'),
        cell(fmt(tare, 2), 'right'),
        cell(fmt(net, 2), 'right'),
        cell(lrNo, 'center', lines.lrNo),
        cell(transporter, 'left', lines.transporter)
      ]);
      sno++;
      rowIdx++;
    }

    // Group sub-total — sums Bales / Gross / Tare / Net
    const subCellStyle = { bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 8 };
    body.push([
      { text: 'Sub Total', colSpan: 8, alignment: 'right', ...subCellStyle },
      {}, {}, {}, {}, {}, {}, {},
      { text: fmt(sBales, 0), alignment: 'right', ...subCellStyle },
      { text: '', fillColor: colors.subFill },
      { text: fmt(sGross, 2), alignment: 'right', ...subCellStyle },
      { text: fmt(sTare, 2), alignment: 'right', ...subCellStyle },
      { text: fmt(sNet, 2), alignment: 'right', ...subCellStyle },
      { text: '', fillColor: colors.subFill },
      { text: '', fillColor: colors.subFill }
    ]);

    groupSummaries.push({
      label: cfg.summaryLabel(group),
      totals: { bales: sBales, gross: sGross, tare: sTare, net: sNet }
    });

    gBales += sBales;
    gGross += sGross;
    gTare += sTare;
    gNet += sNet;
  }

  const grandCellStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 };
  body.push([
    { text: 'Grand Total', colSpan: 8, alignment: 'right', ...grandCellStyle },
    {}, {}, {}, {}, {}, {}, {},
    { text: fmt(gBales, 0), alignment: 'right', ...grandCellStyle },
    { text: '', fillColor: colors.grandFill },
    { text: fmt(gGross, 2), alignment: 'right', ...grandCellStyle },
    { text: fmt(gTare, 2), alignment: 'right', ...grandCellStyle },
    { text: fmt(gNet, 2), alignment: 'right', ...grandCellStyle },
    { text: '', fillColor: colors.grandFill },
    { text: '', fillColor: colors.grandFill }
  ]);

  const summary = buildGroupSummaryPage({
    companyName, companyLogo, fromDate, toDate,
    title: cfg.title.replace(/COTTON ARRIVAL/i, 'COTTON ARRIVAL SUMMARY'),
    groupHeader: cfg.summaryGroupHeader,
    groupSummaries,
    grandTotals: { bales: gBales, gross: gGross, tare: gTare, net: gNet },
    totalCols: [
      { header: 'Bales', key: 'bales', digits: 0 },
      { header: 'Gross Wt', key: 'gross', digits: 2 },
      { header: 'Tare Wt', key: 'tare', digits: 2 },
      { header: 'Net Wt', key: 'net', digits: 2 }
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

export const cottonArrivalReport = (req, res) => {
  const groupBy = (req.query.groupBy || 'date').toLowerCase();
  const cfg = GROUP_CONFIGS[groupBy] || GROUP_CONFIGS.date;
  return runReport(req, res, {
    spName: 'sp_CottonArrival_GetAll',
    fileName: cfg.fileName,
    buildDocDefinition
  });
};
