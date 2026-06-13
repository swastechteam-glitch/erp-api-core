// Cotton Purchase Order Pending report — one controller, 5 grouping modes:
//   ?groupBy=date     (default) — grouped by CPODate
//   ?groupBy=supplier            — grouped by SupplierName
//   ?groupBy=variety             — grouped by RawMaterialName
//   ?groupBy=agent               — grouped by AgentName
//   ?groupBy=station             — grouped by StationName
//
// SP: sp_CottonPurchaseOrder_PendingDetails (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, buildGroupSummaryPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy, estimateLines, topPadFor
} from './_common.js';

const GROUP_CONFIGS = {
  date: {
    title: 'COTTON PURCHASE ORDER PENDING - DATE WISE',
    fileName: 'CottonPurchaseOrderPending_DateWise',
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
    title: 'COTTON PURCHASE ORDER PENDING - SUPPLIER WISE',
    fileName: 'CottonPurchaseOrderPending_SupplierWise',
    summaryGroupHeader: 'Supplier Name',
    summaryLabel: (g) => str(g[0], 'SupplierName'),
    groupKey: (r) => str(r, 'SupplierName') || '(Unknown Supplier)',
    groupLabel: (g) => 'Supplier : ' + str(g[0], 'SupplierName'),
    sortFn: (a, b) => a[0].localeCompare(b[0])
  },
  variety: {
    title: 'COTTON PURCHASE ORDER PENDING - VARIETY WISE',
    fileName: 'CottonPurchaseOrderPending_VarietyWise',
    summaryGroupHeader: 'Variety',
    summaryLabel: (g) => str(g[0], 'RawMaterialName'),
    groupKey: (r) => str(r, 'RawMaterialName') || '(Unknown Variety)',
    groupLabel: (g) => 'Variety : ' + str(g[0], 'RawMaterialName'),
    sortFn: (a, b) => a[0].localeCompare(b[0])
  },
  agent: {
    title: 'COTTON PURCHASE ORDER PENDING - AGENT WISE',
    fileName: 'CottonPurchaseOrderPending_AgentWise',
    summaryGroupHeader: 'Agent Name',
    summaryLabel: (g) => str(g[0], 'AgentName'),
    groupKey: (r) => str(r, 'AgentName') || '(Unknown Agent)',
    groupLabel: (g) => 'Agent : ' + str(g[0], 'AgentName'),
    sortFn: (a, b) => a[0].localeCompare(b[0])
  },
  station: {
    title: 'COTTON PURCHASE ORDER PENDING - STATION WISE',
    fileName: 'CottonPurchaseOrderPending_StationWise',
    summaryGroupHeader: 'Station',
    summaryLabel: (g) => str(g[0], 'StationName'),
    groupKey: (r) => str(r, 'StationName') || '(Unknown Station)',
    groupLabel: (g) => 'Station : ' + str(g[0], 'StationName'),
    sortFn: (a, b) => a[0].localeCompare(b[0])
  }
};

// 13 columns: S.No, PO No, PO Date, Ref No, Supplier, Agent, Station,
//             Variety, Order Qty, Recv Qty, Pend Qty, Rate, Payment Type
const WIDTHS = [22, 38, 48, 45, '*', '*', '*', '*', 38, 42, 42, 38, 55];
const HEADERS = [
  'S.No', 'PO No', 'PO Date', 'Ref No', 'Supplier Name', 'Agent Name',
  'Station', 'Variety', 'Order Qty', 'Recv Qty', 'Pend Qty', 'Rate', 'Payment Type'
];
const CHARS_PER_LINE = {
  supplier: 16, agent: 16, station: 16, variety: 16, payment: 12
};

// Build the "Payment Type" column text. Prefer SP-provided CottonPaymentTypeName;
// fall back to deriving from PaymentType / PayMode codes (matches the RDLC IIF logic).
function paymentTypeLabel(r) {
  const direct = str(r, 'CottonPaymentTypeName').trim();
  if (direct) return direct;
  const pt = dec(r, 'PaymentType') === 1 ? 'Mill' : 'Spot';
  const pm = dec(r, 'PayMode') === 0 ? 'Cash' : 'Credit';
  return `${pt} / ${pm}`;
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

  let gOrder = 0, gRecv = 0, gPend = 0;
  let sno = 1;
  const groupSummaries = [];

  for (const [, group] of sortedEntries) {
    // Group header row spanning all 13 cols
    body.push([
      {
        text: cfg.groupLabel(group), colSpan: 13, bold: true,
        color: colors.groupText, fillColor: colors.groupFill, fontSize: 9, margin: [2, 2, 0, 2]
      },
      {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}
    ]);

    let sOrder = 0, sRecv = 0, sPend = 0;
    let rowIdx = 0;

    for (const r of group) {
      const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;

      const supplier = str(r, 'SupplierName');
      const agent = str(r, 'AgentName');
      const station = str(r, 'StationName');
      const variety = str(r, 'RawMaterialName');
      const payment = paymentTypeLabel(r);

      const lines = {
        supplier: estimateLines(supplier, CHARS_PER_LINE.supplier),
        agent: estimateLines(agent, CHARS_PER_LINE.agent),
        station: estimateLines(station, CHARS_PER_LINE.station),
        variety: estimateLines(variety, CHARS_PER_LINE.variety),
        payment: estimateLines(payment, CHARS_PER_LINE.payment)
      };
      const maxLines = Math.max(1, ...Object.values(lines));

      const cell = (text, align = 'left', cellLines = 1) => ({
        text, alignment: align, fontSize: 8, fillColor: zebra,
        margin: [0, topPadFor(maxLines, cellLines), 0, 0]
      });

      const orderQty = dec(r, 'OrderQty');
      const recvQty = dec(r, 'PurQty');
      const pendQty = dec(r, 'PendingQty');
      sOrder += orderQty;
      sRecv += recvQty;
      sPend += pendQty;

      body.push([
        cell(String(sno), 'center'),
        cell(String(r.CPONo ?? ''), 'center'),
        cell(ddmmyyyy(r.CPODate), 'center'),
        cell(str(r, 'RefNo'), 'center'),
        cell(supplier, 'left', lines.supplier),
        cell(agent, 'left', lines.agent),
        cell(station, 'left', lines.station),
        cell(variety, 'left', lines.variety),
        cell(fmt(orderQty, 0), 'right'),
        cell(fmt(recvQty, 0), 'right'),
        cell(fmt(pendQty, 0), 'right'),
        cell(fmt(dec(r, 'Rate'), 0), 'right'),
        cell(payment, 'left', lines.payment)
      ]);
      sno++;
      rowIdx++;
    }

    // Group sub-total
    const subCellStyle = { bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 8 };
    body.push([
      { text: 'Sub Total', colSpan: 8, alignment: 'right', ...subCellStyle },
      {}, {}, {}, {}, {}, {}, {},
      { text: fmt(sOrder, 0), alignment: 'right', ...subCellStyle },
      { text: fmt(sRecv, 0), alignment: 'right', ...subCellStyle },
      { text: fmt(sPend, 0), alignment: 'right', ...subCellStyle },
      { text: '', fillColor: colors.subFill },
      { text: '', fillColor: colors.subFill }
    ]);

    groupSummaries.push({
      label: cfg.summaryLabel(group),
      totals: { orderQty: sOrder, recvQty: sRecv, pendQty: sPend }
    });

    gOrder += sOrder;
    gRecv += sRecv;
    gPend += sPend;
  }

  // Grand total
  const grandCellStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 };
  body.push([
    { text: 'Grand Total', colSpan: 8, alignment: 'right', ...grandCellStyle },
    {}, {}, {}, {}, {}, {}, {},
    { text: fmt(gOrder, 0), alignment: 'right', ...grandCellStyle },
    { text: fmt(gRecv, 0), alignment: 'right', ...grandCellStyle },
    { text: fmt(gPend, 0), alignment: 'right', ...grandCellStyle },
    { text: '', fillColor: colors.grandFill },
    { text: '', fillColor: colors.grandFill }
  ]);

  const summary = buildGroupSummaryPage({
    companyName, companyLogo, fromDate, toDate,
    title: cfg.title.replace(/COTTON PURCHASE ORDER PENDING/i, 'COTTON PURCHASE ORDER PENDING SUMMARY'),
    groupHeader: cfg.summaryGroupHeader,
    groupSummaries,
    grandTotals: { orderQty: gOrder, recvQty: gRecv, pendQty: gPend },
    totalCols: [
      { header: 'Order Qty', key: 'orderQty', digits: 0 },
      { header: 'Recv Qty', key: 'recvQty', digits: 0 },
      { header: 'Pend Qty', key: 'pendQty', digits: 0 }
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

export const cottonPurchaseOrderPendingReport = (req, res) => {
  const groupBy = (req.query.groupBy || 'date').toLowerCase();
  const cfg = GROUP_CONFIGS[groupBy] || GROUP_CONFIGS.date;
  return runReport(req, res, {
    spName: 'sp_CottonPurchaseOrder_PendingDetails',
    fileName: cfg.fileName,
    buildDocDefinition
  });
};
