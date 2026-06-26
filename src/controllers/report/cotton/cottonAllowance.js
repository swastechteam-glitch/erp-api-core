// Cotton Allowance report — one controller, 5 grouping modes:
//   ?groupBy=date         (default) — grouped by CottonAllowanceDate
//   ?groupBy=supplier                — grouped by SupplierName
//   ?groupBy=agent                   — grouped by AgentName
//   ?groupBy=rawmaterial             — grouped by RawMaterialName (Raw Material Wise)
//   ?groupBy=milllot                 — grouped by MillLotNo
//
// Optional in-memory filters (comma-separated code lists, mirrors the WinForms
// rptCottonAllowanceDetails screen which filters the fetched rows by code):
//   ?supplierCodes=1,2  &agentCodes=3,4  &rawMaterialCodes=5,6
//
// SP: sp_CottonAllowance_GetAll (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, buildGroupSummaryPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy, estimateLines, topPadFor
} from './_common.js';

const GROUP_CONFIGS = {
  date: {
    title: 'COTTON ALLOWANCE - DATE WISE',
    fileName: 'CottonAllowance_DateWise',
    summaryGroupHeader: 'Date',
    summaryLabel: (g) => ddmmyyyy(g[0].CottonAllowanceDate),
    groupKey: (r) => {
      const d = new Date(r.CottonAllowanceDate);
      return isNaN(d.getTime()) ? '0000-00-00' : d.toISOString().slice(0, 10);
    },
    groupLabel: (g) => 'Date : ' + ddmmyyyy(g[0].CottonAllowanceDate),
    sortFn: (a, b) => a[0].localeCompare(b[0])
  },
  supplier: {
    title: 'COTTON ALLOWANCE - SUPPLIER WISE',
    fileName: 'CottonAllowance_SupplierWise',
    summaryGroupHeader: 'Supplier Name',
    summaryLabel: (g) => str(g[0], 'SupplierName'),
    groupKey: (r) => str(r, 'SupplierName') || '(Unknown Supplier)',
    groupLabel: (g) => 'Supplier : ' + str(g[0], 'SupplierName'),
    sortFn: (a, b) => a[0].localeCompare(b[0])
  },
  agent: {
    title: 'COTTON ALLOWANCE - AGENT WISE',
    fileName: 'CottonAllowance_AgentWise',
    summaryGroupHeader: 'Agent Name',
    summaryLabel: (g) => str(g[0], 'AgentName'),
    groupKey: (r) => str(r, 'AgentName') || '(Unknown Agent)',
    groupLabel: (g) => 'Agent : ' + str(g[0], 'AgentName'),
    sortFn: (a, b) => a[0].localeCompare(b[0])
  },
  rawmaterial: {
    title: 'COTTON ALLOWANCE - RAW MATERIAL WISE',
    fileName: 'CottonAllowance_RawMaterialWise',
    summaryGroupHeader: 'Raw Material',
    summaryLabel: (g) => str(g[0], 'RawMaterialName'),
    groupKey: (r) => str(r, 'RawMaterialName') || '(Unknown Raw Material)',
    groupLabel: (g) => 'Raw Material : ' + str(g[0], 'RawMaterialName'),
    sortFn: (a, b) => a[0].localeCompare(b[0])
  },
  milllot: {
    title: 'COTTON ALLOWANCE - MILL LOT NO WISE',
    fileName: 'CottonAllowance_MillLotWise',
    summaryGroupHeader: 'Mill Lot No',
    summaryLabel: (g) => str(g[0], 'MillLotNo'),
    groupKey: (r) => str(r, 'MillLotNo') || '(Unknown Lot)',
    groupLabel: (g) => 'Mill Lot No : ' + str(g[0], 'MillLotNo'),
    sortFn: (a, b) => a[0].localeCompare(b[0])
  }
};

// 14 columns: S.No, Allow No, Allow Date, Mill Lot No, Supplier, Agent,
//             Station, Variety, Qty, Rate, Candy Rate, Allo Kgs, CN No, CN Amount
const WIDTHS = [20, 34, 46, 42, '*', '*', '*', '*', 34, 42, 46, 40, 44, 52];
const HEADERS = [
  'S.No', 'Allow No', 'Allow Date', 'Mill Lot No', 'Supplier Name', 'Agent Name',
  'Station', 'Variety', 'Qty', 'Rate', 'Candy Rate', 'Allo Kgs', 'CN No', 'CN Amount'
];
const CHARS_PER_LINE = {
  millLot: 11, supplier: 16, agent: 16, station: 14, variety: 14, cnNo: 12
};

// Parse a comma-separated code list query param into a Set of strings (or null).
const codeSet = (query, key) => {
  const raw = String(query[key] || '').trim();
  if (!raw) return null;
  const s = new Set(raw.split(',').map((x) => x.trim()).filter(Boolean));
  return s.size ? s : null;
};

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate, query }) {
  const groupBy = (query.groupBy || 'date').toLowerCase();
  const cfg = GROUP_CONFIGS[groupBy] || GROUP_CONFIGS.date;

  // ---- in-memory filters (mirror the WinForms code-list filtering) ----
  const supSet = codeSet(query, 'supplierCodes');
  const agSet = codeSet(query, 'agentCodes');
  const rmSet = codeSet(query, 'rawMaterialCodes');
  let data = rows;
  if (supSet) data = data.filter((r) => supSet.has(String(r.SupplierCode)));
  if (agSet) data = data.filter((r) => agSet.has(String(r.AgentCode)));
  if (rmSet) data = data.filter((r) => rmSet.has(String(r.RawMaterialCode)));

  const groupsMap = new Map();
  for (const r of data) {
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

  let gQty = 0, gAllo = 0, gCn = 0;
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

    let sQty = 0, sAllo = 0, sCn = 0;
    let rowIdx = 0;

    for (const r of group) {
      const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;

      const millLot = str(r, 'MillLotNo');
      const supplier = str(r, 'SupplierName');
      const agent = str(r, 'AgentName');
      const station = str(r, 'StationName');
      const variety = str(r, 'RawMaterialName');
      const cnNo = str(r, 'CreditNoteNo');

      const lines = {
        millLot: estimateLines(millLot, CHARS_PER_LINE.millLot),
        supplier: estimateLines(supplier, CHARS_PER_LINE.supplier),
        agent: estimateLines(agent, CHARS_PER_LINE.agent),
        station: estimateLines(station, CHARS_PER_LINE.station),
        variety: estimateLines(variety, CHARS_PER_LINE.variety),
        cnNo: estimateLines(cnNo, CHARS_PER_LINE.cnNo)
      };
      const maxLines = Math.max(1, ...Object.values(lines));

      const cell = (text, align = 'left', cellLines = 1) => ({
        text, alignment: align, fontSize: 8, fillColor: zebra,
        margin: [0, topPadFor(maxLines, cellLines), 0, 0]
      });

      const qty = dec(r, 'Qty');
      const allo = dec(r, 'AllowanceKgs');
      const cnAmt = dec(r, 'CreditNoteAmount');
      sQty += qty; sAllo += allo; sCn += cnAmt;

      body.push([
        cell(String(sno), 'center'),
        cell(String(r.CottonAllowanceNo ?? ''), 'center'),
        cell(ddmmyyyy(r.CottonAllowanceDate), 'center'),
        cell(millLot, 'center', lines.millLot),
        cell(supplier, 'left', lines.supplier),
        cell(agent, 'left', lines.agent),
        cell(station, 'left', lines.station),
        cell(variety, 'left', lines.variety),
        cell(fmt(qty, 0), 'right'),
        cell(fmt(dec(r, 'Rate'), 2), 'right'),
        cell(fmt(dec(r, 'CandyRate'), 0), 'right'),
        cell(fmt(allo, 2), 'right'),
        cell(cnNo, 'center', lines.cnNo),
        cell(fmt(cnAmt, 2), 'right')
      ]);
      sno++;
      rowIdx++;
    }

    // Group sub-total — Qty / Allo Kgs / CN Amount
    const subCellStyle = { bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 8 };
    body.push([
      { text: 'Sub Total', colSpan: 8, alignment: 'right', ...subCellStyle },
      {}, {}, {}, {}, {}, {}, {},
      { text: fmt(sQty, 0), alignment: 'right', ...subCellStyle },
      { text: '', fillColor: colors.subFill },
      { text: '', fillColor: colors.subFill },
      { text: fmt(sAllo, 2), alignment: 'right', ...subCellStyle },
      { text: '', fillColor: colors.subFill },
      { text: fmt(sCn, 2), alignment: 'right', ...subCellStyle }
    ]);

    groupSummaries.push({
      label: cfg.summaryLabel(group),
      totals: { qty: sQty, allo: sAllo, cn: sCn }
    });

    gQty += sQty; gAllo += sAllo; gCn += sCn;
  }

  const grandCellStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 };
  body.push([
    { text: 'Grand Total', colSpan: 8, alignment: 'right', ...grandCellStyle },
    {}, {}, {}, {}, {}, {}, {},
    { text: fmt(gQty, 0), alignment: 'right', ...grandCellStyle },
    { text: '', fillColor: colors.grandFill },
    { text: '', fillColor: colors.grandFill },
    { text: fmt(gAllo, 2), alignment: 'right', ...grandCellStyle },
    { text: '', fillColor: colors.grandFill },
    { text: fmt(gCn, 2), alignment: 'right', ...grandCellStyle }
  ]);

  const summary = buildGroupSummaryPage({
    companyName, companyLogo, fromDate, toDate,
    title: cfg.title.replace(/COTTON ALLOWANCE/i, 'COTTON ALLOWANCE SUMMARY'),
    groupHeader: cfg.summaryGroupHeader,
    groupSummaries,
    grandTotals: { qty: gQty, allo: gAllo, cn: gCn },
    totalCols: [
      { header: 'Qty', key: 'qty', digits: 0 },
      { header: 'Allo Kgs', key: 'allo', digits: 2 },
      { header: 'CN Amount', key: 'cn', digits: 2 }
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

export const cottonAllowanceReport = (req, res) => {
  const groupBy = (req.query.groupBy || 'date').toLowerCase();
  const cfg = GROUP_CONFIGS[groupBy] || GROUP_CONFIGS.date;
  return runReport(req, res, {
    spName: 'sp_CottonAllowance_GetAll',
    fileName: cfg.fileName,
    buildDocDefinition
  });
};
