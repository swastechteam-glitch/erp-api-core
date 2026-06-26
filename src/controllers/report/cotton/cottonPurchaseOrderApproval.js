// Cotton Purchase Order Approval report — approved POs grouped by Approval Date
// (single "Date Wise" mode). Date range + CompanyCode.
//
// Optional in-memory filters (comma-separated code lists, mirrors the WinForms
// rptCottonPurchaseOrderApprovalDateWise screen):
//   ?supplierCodes=1,2  &agentCodes=3,4
//
// SP: sp_CottonPurchaseOrderApproval_GetAll (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, buildGroupSummaryPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy, estimateLines, topPadFor
} from './_common.js';

// 12 columns: S.No, PO No, PO Date, Ref No, Supplier, Agent, Station, Item,
//             No Of Bales, Rate/Candy, Appr. User, Appr. Date
const WIDTHS = [20, 36, 48, 46, '*', '*', '*', '*', 38, 46, '*', 56];
const HEADERS = [
  'S.No', 'PO No', 'PO Date', 'Ref No', 'Supplier Name', 'Agent Name',
  'Station', 'Item Name', 'No Of Bales', 'Rate/Candy', 'Appr. User', 'Appr. Date'
];
const CHARS_PER_LINE = {
  ref: 12, supplier: 16, agent: 16, station: 14, item: 14, user: 12
};

const codeSet = (query, key) => {
  const raw = String(query[key] || '').trim();
  if (!raw) return null;
  const s = new Set(raw.split(',').map((x) => x.trim()).filter(Boolean));
  return s.size ? s : null;
};

const dayKey = (d) => {
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '0000-00-00' : dt.toISOString().slice(0, 10);
};

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate, query }) {
  const supSet = codeSet(query, 'supplierCodes');
  const agSet = codeSet(query, 'agentCodes');
  let data = rows;
  if (supSet) data = data.filter((r) => supSet.has(String(r.SupplierCode)));
  if (agSet) data = data.filter((r) => agSet.has(String(r.AgentCode)));

  // group by Approval Date
  const groupsMap = new Map();
  for (const r of data) {
    const k = dayKey(r.ApprovalDate);
    if (!groupsMap.has(k)) groupsMap.set(k, []);
    groupsMap.get(k).push(r);
  }
  const sortedEntries = [...groupsMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const body = [];
  body.push(HEADERS.map(t => ({
    text: t, bold: true, fillColor: colors.headerFill, color: colors.headerText,
    alignment: 'center', fontSize: 8
  })));

  let gQty = 0;
  let sno = 1;
  const groupSummaries = [];

  for (const [, group] of sortedEntries) {
    body.push([
      {
        text: 'App. Date : ' + ddmmyyyy(group[0].ApprovalDate), colSpan: 12, bold: true,
        color: colors.groupText, fillColor: colors.groupFill, fontSize: 9, margin: [2, 2, 0, 2]
      },
      {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}
    ]);

    let sQty = 0;
    let rowIdx = 0;

    for (const r of group) {
      const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;

      const ref = str(r, 'RefNo');
      const supplier = str(r, 'SupplierName');
      const agent = str(r, 'AgentName');
      const station = str(r, 'StationName');
      const item = str(r, 'RawMaterialName');
      const user = str(r, 'UName');

      const lines = {
        ref: estimateLines(ref, CHARS_PER_LINE.ref),
        supplier: estimateLines(supplier, CHARS_PER_LINE.supplier),
        agent: estimateLines(agent, CHARS_PER_LINE.agent),
        station: estimateLines(station, CHARS_PER_LINE.station),
        item: estimateLines(item, CHARS_PER_LINE.item),
        user: estimateLines(user, CHARS_PER_LINE.user)
      };
      const maxLines = Math.max(1, ...Object.values(lines));

      const cell = (text, align = 'left', cellLines = 1) => ({
        text, alignment: align, fontSize: 8, fillColor: zebra,
        margin: [0, topPadFor(maxLines, cellLines), 0, 0]
      });

      const qty = dec(r, 'Qty');
      sQty += qty;

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
        cell(user, 'left', lines.user),
        cell(ddmmyyyy(r.ApprovalDate), 'center')
      ]);
      sno++;
      rowIdx++;
    }

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
      label: ddmmyyyy(group[0].ApprovalDate),
      totals: { qty: sQty }
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
    title: 'COTTON PURCHASE ORDER APPROVAL SUMMARY - DATE WISE',
    groupHeader: 'Approval Date',
    groupSummaries,
    grandTotals: { qty: gQty },
    totalCols: [{ header: 'No Of Bales', key: 'qty', digits: 0 }]
  });

  return buildPage({
    companyName,
    companyLogo,
    title: 'COTTON PURCHASE ORDER APPROVAL - DATE WISE',
    fromDate,
    toDate,
    tables: [{
      table: { headerRows: 1, dontBreakRows: true, keepWithHeaderRows: 0, widths: WIDTHS, body },
      layout: tableLayout()
    }],
    summary
  });
}

export const cottonPurchaseOrderApprovalReport = (req, res) =>
  runReport(req, res, {
    spName: 'sp_CottonPurchaseOrderApproval_GetAll',
    fileName: 'CottonPurchaseOrderApproval_DateWise',
    buildDocDefinition
  });
