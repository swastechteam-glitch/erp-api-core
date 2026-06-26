// Cotton Purchase Order Approval Pending report — flat list of POs awaiting
// approval. No date range (the SP takes only @CompanyCode), single mode.
//
// Optional in-memory filters (comma-separated code lists, mirrors the WinForms
// rptCottonPurchaseOrderApprovalPendings screen):
//   ?supplierCodes=1,2  &agentCodes=3,4
//
// SP: sp_CottonPurchaseOrderApproval_Pendings (CompanyCode)

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy, estimateLines, topPadFor, sql
} from './_common.js';

// 12 columns: S.No, PO No, PO Date, Ref No, Supplier, Agent, Station, Item,
//             No Of Bales, Rate/Candy, Despatch Details, Remarks
const WIDTHS = [22, 38, 50, 48, '*', '*', '*', '*', 40, 48, '*', '*'];
const HEADERS = [
  'S.No', 'PO No', 'PO Date', 'Ref No', 'Supplier Name', 'Agent Name',
  'Station', 'Item Name', 'No Of Bales', 'Rate/Candy', 'Despatch Details', 'Remarks'
];
const CHARS_PER_LINE = {
  ref: 12, supplier: 16, agent: 16, station: 14, item: 14, despatch: 16, remarks: 16
};

const codeSet = (query, key) => {
  const raw = String(query[key] || '').trim();
  if (!raw) return null;
  const s = new Set(raw.split(',').map((x) => x.trim()).filter(Boolean));
  return s.size ? s : null;
};

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate, query }) {
  const supSet = codeSet(query, 'supplierCodes');
  const agSet = codeSet(query, 'agentCodes');
  let data = rows;
  if (supSet) data = data.filter((r) => supSet.has(String(r.SupplierCode)));
  if (agSet) data = data.filter((r) => agSet.has(String(r.AgentCode)));
  data = [...data].sort((a, b) => (Number(a.CPONo) || 0) - (Number(b.CPONo) || 0));

  const body = [];
  body.push(HEADERS.map(t => ({
    text: t, bold: true, fillColor: colors.headerFill, color: colors.headerText,
    alignment: 'center', fontSize: 8
  })));

  let gQty = 0;
  let sno = 1;
  for (const r of data) {
    const zebra = sno % 2 === 0 ? colors.zebraFill : null;

    const ref = str(r, 'RefNo');
    const supplier = str(r, 'SupplierName');
    const agent = str(r, 'AgentName');
    const station = str(r, 'StationName');
    const item = str(r, 'RawMaterialName');
    const despatch = str(r, 'DespatchDetails');
    const remarks = str(r, 'Remarks');

    const lines = {
      ref: estimateLines(ref, CHARS_PER_LINE.ref),
      supplier: estimateLines(supplier, CHARS_PER_LINE.supplier),
      agent: estimateLines(agent, CHARS_PER_LINE.agent),
      station: estimateLines(station, CHARS_PER_LINE.station),
      item: estimateLines(item, CHARS_PER_LINE.item),
      despatch: estimateLines(despatch, CHARS_PER_LINE.despatch),
      remarks: estimateLines(remarks, CHARS_PER_LINE.remarks)
    };
    const maxLines = Math.max(1, ...Object.values(lines));

    const cell = (text, align = 'left', cellLines = 1) => ({
      text, alignment: align, fontSize: 8, fillColor: zebra,
      margin: [0, topPadFor(maxLines, cellLines), 0, 0]
    });

    const qty = dec(r, 'Qty');
    gQty += qty;

    body.push([
      cell(String(sno), 'center'),
      cell(String(r.CPONo ?? ''), 'center'),
      cell(ddmmyyyy(r.CPODate), 'center'),
      cell(ref, 'left', lines.ref),
      cell(supplier, 'left', lines.supplier),
      cell(agent, 'left', lines.agent),
      cell(station, 'left', lines.station),
      cell(item, 'left', lines.item),
      cell(fmt(qty, 0), 'right'),
      cell(fmt(dec(r, 'Rate'), 0), 'right'),
      cell(despatch, 'left', lines.despatch),
      cell(remarks, 'left', lines.remarks)
    ]);
    sno++;
  }

  const grand = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 };
  body.push([
    { text: 'Total', colSpan: 8, alignment: 'right', ...grand },
    {}, {}, {}, {}, {}, {}, {},
    { text: fmt(gQty, 0), alignment: 'right', ...grand },
    { text: '', fillColor: colors.grandFill },
    { text: '', fillColor: colors.grandFill },
    { text: '', fillColor: colors.grandFill }
  ]);

  return buildPage({
    companyName,
    companyLogo,
    title: 'COTTON PURCHASE ORDER APPROVAL PENDING',
    // Show the period only if the UI sent one (this report's SP ignores dates
    // for filtering, but the header reflects the range the user picked). Read
    // the raw query values so we don't fall back to today's date.
    fromDate: query.FromDate || '',
    toDate: query.ToDate || '',
    tables: [{
      table: { headerRows: 1, dontBreakRows: true, keepWithHeaderRows: 0, widths: WIDTHS, body },
      layout: tableLayout()
    }],
    summary: []
  });
}

export const cottonPurchaseOrderApprovalPendingReport = (req, res) =>
  runReport(req, res, {
    spName: 'sp_CottonPurchaseOrderApproval_Pendings',
    fileName: 'CottonPurchaseOrderApprovalPending',
    buildDocDefinition,
    // SP takes only @CompanyCode (no FromDate/ToDate).
    spParams: (p) => ({
      CompanyCode: { type: sql.Int, value: parseInt(p.CompanyCode) || 0 }
    })
  });
