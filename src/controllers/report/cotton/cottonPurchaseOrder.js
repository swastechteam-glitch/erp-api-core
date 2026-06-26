// Cotton Purchase Order report — one controller, 5 grouping modes:
//   ?groupBy=date     (default) — grouped by PO date
//   ?groupBy=supplier            — grouped by SupplierName
//   ?groupBy=variety             — grouped by RawMaterialName  (a.k.a. Item)
//   ?groupBy=agent               — grouped by AgentName
//   ?groupBy=station             — grouped by StationName
//
// SP: sp_CottonPurchaseOrder_GetAll (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, buildGroupSummaryPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy, estimateLines, topPadFor
} from './_common.js';

// Per-mode configuration. groupKey decides the bucket, label is the row header.
// `summaryGroupHeader` / `summaryLabel` drive the new-page summary table.
const GROUP_CONFIGS = {
  date: {
    title: 'COTTON PURCHASE ORDER - DATE WISE',
    fileName: 'CottonPurchaseOrder_DateWise',
    summaryGroupHeader: 'Date',
    summaryLabel: (g) => ddmmyyyy(g[0].CPODate),
    groupKey: (r) => {
      const d = new Date(r.CPODate);
      return isNaN(d.getTime()) ? '0000-00-00' : d.toISOString().slice(0, 10);
    },
    groupLabel: (g) => 'Date : ' + ddmmyyyy(g[0].CPODate),
    sortFn: (a, b) => a[0].localeCompare(b[0])
  },
  supplier: {
    title: 'COTTON PURCHASE ORDER - SUPPLIER WISE',
    fileName: 'CottonPurchaseOrder_SupplierWise',
    summaryGroupHeader: 'Supplier Name',
    summaryLabel: (g) => str(g[0], 'SupplierName'),
    groupKey: (r) => str(r, 'SupplierName') || '(Unknown Supplier)',
    groupLabel: (g) => 'Supplier : ' + str(g[0], 'SupplierName'),
    sortFn: (a, b) => a[0].localeCompare(b[0])
  },
  variety: {
    title: 'COTTON PURCHASE ORDER - VARIETY WISE',
    fileName: 'CottonPurchaseOrder_VarietyWise',
    summaryGroupHeader: 'Variety',
    summaryLabel: (g) => str(g[0], 'RawMaterialName'),
    groupKey: (r) => str(r, 'RawMaterialName') || '(Unknown Variety)',
    groupLabel: (g) => 'Variety : ' + str(g[0], 'RawMaterialName'),
    sortFn: (a, b) => a[0].localeCompare(b[0])
  },
  agent: {
    title: 'COTTON PURCHASE ORDER - AGENT WISE',
    fileName: 'CottonPurchaseOrder_AgentWise',
    summaryGroupHeader: 'Agent Name',
    summaryLabel: (g) => str(g[0], 'AgentName'),
    groupKey: (r) => str(r, 'AgentName') || '(Unknown Agent)',
    groupLabel: (g) => 'Agent : ' + str(g[0], 'AgentName'),
    sortFn: (a, b) => a[0].localeCompare(b[0])
  },
  station: {
    title: 'COTTON PURCHASE ORDER - STATION WISE',
    fileName: 'CottonPurchaseOrder_StationWise',
    summaryGroupHeader: 'Station',
    summaryLabel: (g) => str(g[0], 'StationName'),
    groupKey: (r) => str(r, 'StationName') || '(Unknown Station)',
    groupLabel: (g) => 'Station : ' + str(g[0], 'StationName'),
    sortFn: (a, b) => a[0].localeCompare(b[0])
  }
};

// 12 columns: S.No, PO No, PO Date, Ref No, Supplier, Agent, Station, Variety, Bales, Rate, Despatch, Remarks
const WIDTHS = [22, 40, 50, 50, '*', '*', 55, '*', 38, 42, '*', '*'];
const HEADERS = [
  'S.No', 'PO No', 'PO Date', 'Ref No', 'Supplier Name', 'Agent Name',
  'Station', 'Variety', 'Bales', 'Rate', 'Despatch', 'Remarks'
];
// Per-column chars-per-line for the wrap-line estimator (only the wider text cols matter).
const CHARS_PER_LINE = {
  supplier: 18, agent: 18, station: 18, variety: 18, despatch: 18, remarks: 18
};

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate, query }) {
  const groupBy = (query.groupBy || 'date').toLowerCase();
  const cfg = GROUP_CONFIGS[groupBy] || GROUP_CONFIGS.date;

  // Bucket rows by group key
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

  let gQty = 0;
  let sno = 1;
  const groupSummaries = [];

  for (const [, group] of sortedEntries) {
    // Group header row spanning all 12 cols
    body.push([
      {
        text: cfg.groupLabel(group), colSpan: 12, bold: true,
        color: colors.groupText, fillColor: colors.groupFill, fontSize: 9, margin: [2, 2, 0, 2]
      },
      {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}
    ]);

    let sQty = 0;
    let rowIdx = 0;

    for (const r of group) {
      const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;

      const supplier = str(r, 'SupplierName');
      const agent = str(r, 'AgentName');
      const station = str(r, 'StationName');
      const variety = str(r, 'RawMaterialName');
      const despatch = str(r, 'DespatchDetails');
      const remarks = str(r, 'Remarks');

      // Per-cell line counts -> max gives the row's effective height
      const lines = {
        supplier: estimateLines(supplier, CHARS_PER_LINE.supplier),
        agent: estimateLines(agent, CHARS_PER_LINE.agent),
        station: estimateLines(station, CHARS_PER_LINE.station),
        variety: estimateLines(variety, CHARS_PER_LINE.variety),
        despatch: estimateLines(despatch, CHARS_PER_LINE.despatch),
        remarks: estimateLines(remarks, CHARS_PER_LINE.remarks)
      };
      const maxLines = Math.max(1, ...Object.values(lines));

      // Short helper: build a cell with vertical-center top margin
      const cell = (text, align = 'left', cellLines = 1) => ({
        text, alignment: align, fontSize: 8, fillColor: zebra,
        margin: [0, topPadFor(maxLines, cellLines), 0, 0]
      });

      sQty += dec(r, 'Qty');

      body.push([
        cell(String(sno), 'center'),
        cell(String(r.CPONo ?? ''), 'center'),
        cell(ddmmyyyy(r.CPODate), 'center'),
        cell(str(r, 'RefNo'), 'center'),
        cell(supplier, 'left', lines.supplier),
        cell(agent, 'left', lines.agent),
        cell(station, 'left', lines.station),
        cell(variety, 'left', lines.variety),
        cell(fmt(dec(r, 'Qty'), 0), 'right'),
        cell(fmt(dec(r, 'Rate'), 0), 'right'),
        cell(despatch, 'left', lines.despatch),
        cell(remarks, 'left', lines.remarks)
      ]);
      sno++;
      rowIdx++;
    }

    // Group sub-total — Bales column gets the sum
    const subCellStyle = { bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 8 };
    body.push([
      { text: 'Sub Total', colSpan: 8, alignment: 'right', ...subCellStyle },
      {}, {}, {}, {}, {}, {}, {},
      { text: fmt(sQty, 0), alignment: 'right', ...subCellStyle },
      { text: '', fillColor: colors.subFill },
      { text: '', fillColor: colors.subFill },
      { text: '', fillColor: colors.subFill }
    ]);

    groupSummaries.push({
      label: cfg.summaryLabel(group),
      totals: { bales: sQty }
    });

    gQty += sQty;
  }

  const grandCellStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 };
  body.push([
    { text: 'Grand Total', colSpan: 8, alignment: 'right', ...grandCellStyle },
    {}, {}, {}, {}, {}, {}, {},
    { text: fmt(gQty, 0), alignment: 'right', ...grandCellStyle },
    { text: '', fillColor: colors.grandFill },
    { text: '', fillColor: colors.grandFill },
    { text: '', fillColor: colors.grandFill }
  ]);

  const summary = buildGroupSummaryPage({
    companyName, companyLogo, fromDate, toDate,
    title: cfg.title.replace(/COTTON PURCHASE ORDER/i, 'COTTON PURCHASE ORDER SUMMARY'),
    groupHeader: cfg.summaryGroupHeader,
    groupSummaries,
    grandTotals: { bales: gQty },
    totalCols: [{ header: 'Bales', key: 'bales', digits: 0 }]
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

export const cottonPurchaseOrderReport = (req, res) => {
  const groupBy = (req.query.groupBy || 'date').toLowerCase();
  const cfg = GROUP_CONFIGS[groupBy] || GROUP_CONFIGS.date;
  return runReport(req, res, {
    spName: 'sp_CottonPurchaseOrder_GetAll',
    fileName: cfg.fileName,
    buildDocDefinition
  });
};
