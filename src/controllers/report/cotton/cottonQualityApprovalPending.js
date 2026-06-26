// Cotton Quality Test Approval Pending report — flat list of quality-tested lots
// awaiting approval. No date range (the SP takes only @CompanyCode), single mode.
//
// Optional in-memory filters (comma-separated code lists, mirrors the WinForms
// rptCottonQualityApprovalPendings screen):
//   ?supplierCodes=1,2 &agentCodes=3,4 &stationCodes=5 &rawMaterialCodes=6,7
//
// SP: sp_CottonQualityTest_GetAll_ApprovalPending (CompanyCode)

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy, estimateLines, topPadFor, sql
} from './_common.js';

// 25 columns mirror the WinForms rptCottonQualityApprovalPendingDetails.rdlc.
const HEADERS = [
  'S.No', 'Mill Lot No', 'Arrival Date', 'Party Lot No', 'Supplier Name', 'Station',
  'Item Name', 'Agent Name', 'Qty', 'Candy Rate', '2.5 Len', '50 Len', 'Uni', 'S th',
  'Mic', 'SFI', 'Elong', 'FQI', 'MR', 'IFC', 'Moisture', 'Trash', 'Rd', '+b', 'Grade'
];
const WIDTHS = [
  16, 42, 42, 40, '*', '*', '*', '*', 28, 34, 28, 26, 24, 24,
  24, 24, 26, 26, 24, 24, 30, 26, 22, 22, 30
];
const CHARS_PER_LINE = {
  millLot: 10, partyLot: 10, supplier: 13, station: 12, item: 12, agent: 12
};

// Numeric quality metric columns (after Qty + Candy Rate), each averaged in the
// footer. Order matches HEADERS positions 11..24.
const METRICS = [
  'ID25PerLen', 'ID50PerLen', 'Uni', 'Sth', 'Mic', 'Sfi', 'Elong', 'FQI',
  'MR', 'IFC', 'Moisture', 'Trash', 'Rd', 'PlusB'
];

const codeSet = (query, key) => {
  const raw = String(query[key] || '').trim();
  if (!raw) return null;
  const s = new Set(raw.split(',').map((x) => x.trim()).filter(Boolean));
  return s.size ? s : null;
};

function buildDocDefinition({ rows, companyName, companyLogo, query }) {
  const supSet = codeSet(query, 'supplierCodes');
  const agSet = codeSet(query, 'agentCodes');
  const stSet = codeSet(query, 'stationCodes');
  const rmSet = codeSet(query, 'rawMaterialCodes');
  let data = rows;
  if (supSet) data = data.filter((r) => supSet.has(String(r.SupplierCode)));
  if (agSet) data = data.filter((r) => agSet.has(String(r.AgentCode)));
  if (stSet) data = data.filter((r) => stSet.has(String(r.StationCode)));
  if (rmSet) data = data.filter((r) => rmSet.has(String(r.RawMaterialCode)));
  data = [...data].sort((a, b) => str(a, 'MillLotNo').localeCompare(str(b, 'MillLotNo')));

  const body = [];
  body.push(HEADERS.map(t => ({
    text: t, bold: true, fillColor: colors.headerFill, color: colors.headerText,
    alignment: 'center', fontSize: 7
  })));

  let gQty = 0, gCandy = 0;
  const mSums = METRICS.map(() => 0);
  let sno = 1;

  for (const r of data) {
    const zebra = sno % 2 === 0 ? colors.zebraFill : null;

    const millLot = str(r, 'MillLotNo');
    const partyLot = str(r, 'PartyLotNo');
    const supplier = str(r, 'SupplierName');
    const station = str(r, 'StationName');
    const item = str(r, 'RawMaterialName');
    const agent = str(r, 'AgentName');

    const lines = {
      millLot: estimateLines(millLot, CHARS_PER_LINE.millLot),
      partyLot: estimateLines(partyLot, CHARS_PER_LINE.partyLot),
      supplier: estimateLines(supplier, CHARS_PER_LINE.supplier),
      station: estimateLines(station, CHARS_PER_LINE.station),
      item: estimateLines(item, CHARS_PER_LINE.item),
      agent: estimateLines(agent, CHARS_PER_LINE.agent)
    };
    const maxLines = Math.max(1, ...Object.values(lines));

    const cell = (text, align = 'left', cellLines = 1) => ({
      text, alignment: align, fontSize: 7, fillColor: zebra,
      margin: [0, topPadFor(maxLines, cellLines), 0, 0]
    });

    const qty = dec(r, 'Qty');
    const candy = dec(r, 'CandyRate');
    gQty += qty;
    gCandy += candy;

    const metricCells = METRICS.map((f, i) => {
      const v = dec(r, f);
      mSums[i] += v;
      return cell(fmt(v, 2), 'right');
    });

    body.push([
      cell(String(sno), 'center'),
      cell(millLot, 'left', lines.millLot),
      cell(ddmmyyyy(r.ArrivalDate), 'center'),
      cell(partyLot, 'center', lines.partyLot),
      cell(supplier, 'left', lines.supplier),
      cell(station, 'left', lines.station),
      cell(item, 'left', lines.item),
      cell(agent, 'left', lines.agent),
      cell(fmt(qty, 0), 'right'),
      cell(fmt(candy, 0), 'right'),
      ...metricCells,
      cell(str(r, 'Grade'), 'center')
    ]);
    sno++;
  }

  const n = data.length || 1;
  const grand = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 7 };
  const gCell = (text, align = 'right') => ({ text, alignment: align, ...grand });
  body.push([
    { text: 'Total', colSpan: 8, alignment: 'right', ...grand },
    {}, {}, {}, {}, {}, {}, {},
    gCell(fmt(gQty, 0)),
    gCell(fmt(gCandy / n, 0)),
    ...mSums.map((s) => gCell(fmt(s / n, 2))),
    { text: '', fillColor: colors.grandFill }
  ]);

  return buildPage({
    companyName,
    companyLogo,
    title: 'COTTON QUALITY APPROVAL PENDING',
    // SP ignores dates; show the range only if the UI sent one.
    fromDate: query.FromDate || '',
    toDate: query.ToDate || '',
    tables: [{
      table: { headerRows: 1, dontBreakRows: true, keepWithHeaderRows: 0, widths: WIDTHS, body },
      layout: tableLayout()
    }],
    summary: []
  });
}

export const cottonQualityApprovalPendingReport = (req, res) =>
  runReport(req, res, {
    spName: 'sp_CottonQualityTest_GetAll_ApprovalPending',
    fileName: 'CottonQualityApprovalPending',
    buildDocDefinition,
    // SP takes only @CompanyCode (no FromDate/ToDate).
    spParams: (p) => ({
      CompanyCode: { type: sql.Int, value: parseInt(p.CompanyCode) || 0 }
    })
  });
