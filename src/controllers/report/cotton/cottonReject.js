// Cotton Reject / Sales report — lots rejected back to the supplier or sold,
// grouped by the Reject/Sales flag (REJECT first, then SALES) with per-group
// weight sub-totals. Date range + CompanyCode.
//
// Report type maps to the Reject/Sales selector (the WinForms All/Reject/Sales
// radios) via ?groupBy=all|reject|sales:
//   all    (default) — both reject + sales lots
//   reject           — RejectSales = 1 only
//   sales            — RejectSales <> 1 only
//
// SP: sp_CottonReject_GetAll (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy, estimateLines, topPadFor
} from './_common.js';

// 12 columns: S.No, Reject/Sales Date, Mill Lot No, Party Lot No, Bales,
//             Supplier, Bill No, Variety, Gross Wt, Tare Wt, Net Wt, Transporter
const WIDTHS = [22, 50, 60, 56, 34, '*', 70, '*', 56, 56, 56, '*'];
const HEADERS = [
  'S.No', 'Reject / Sales Date', 'Mill Lot No', 'Party Lot No', 'Bales',
  'Supplier Name', 'Bill No', 'Variety', 'Gross Wt', 'Tare Wt', 'Net Wt', 'Transporter'
];
const CHARS_PER_LINE = {
  millLot: 12, partyLot: 12, supplier: 18, billNo: 14, variety: 16, transporter: 18
};

// Estimate wrapped line count for a multi-line (\n separated) string.
const multiLines = (text, cpl) =>
  String(text || '').split('\n').reduce((n, seg) => n + estimateLines(seg, cpl), 0) || 1;

const TYPE_TITLES = {
  all: 'COTTON REJECT / SALES DETAILS',
  reject: 'COTTON REJECT DETAILS',
  sales: 'COTTON SALES DETAILS'
};

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate, query }) {
  const mode = String(query.groupBy || 'all').toLowerCase();
  let data = rows;
  if (mode === 'reject') data = data.filter((r) => Number(r.RejectSales) === 1);
  else if (mode === 'sales') data = data.filter((r) => Number(r.RejectSales) !== 1);

  // group by Reject/Sales flag — REJECT (1) first, then SALES.
  const groupsMap = new Map();
  for (const r of data) {
    const k = Number(r.RejectSales) === 1 ? 'REJECT' : 'SALES';
    if (!groupsMap.has(k)) groupsMap.set(k, []);
    groupsMap.get(k).push(r);
  }
  const order = { REJECT: 0, SALES: 1 };
  const sortedEntries = [...groupsMap.entries()].sort((a, b) => order[a[0]] - order[b[0]]);
  // within a group, sort by date then reject no
  for (const [, g] of sortedEntries) {
    g.sort((a, b) => {
      const da = new Date(a.CottonRejectDate).getTime() || 0;
      const db = new Date(b.CottonRejectDate).getTime() || 0;
      return da - db || (Number(a.CottonRejectNo) || 0) - (Number(b.CottonRejectNo) || 0);
    });
  }

  const body = [];
  body.push(HEADERS.map(t => ({
    text: t, bold: true, fillColor: colors.headerFill, color: colors.headerText,
    alignment: 'center', fontSize: 8
  })));

  let gBales = 0, gGross = 0, gTare = 0, gNet = 0;
  let sno = 1;

  for (const [label, group] of sortedEntries) {
    body.push([
      {
        text: label, colSpan: 12, bold: true,
        color: colors.groupText, fillColor: colors.groupFill, fontSize: 9, margin: [2, 2, 0, 2]
      },
      {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}
    ]);

    let sBales = 0, sGross = 0, sTare = 0, sNet = 0;
    let rowIdx = 0;

    for (const r of group) {
      const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;

      const millLot = str(r, 'MillLotNo');
      const partyLot = str(r, 'PartyLotNo');
      const supplier = str(r, 'SupplierName');
      const variety = str(r, 'RawMaterialName');
      const billDate = ddmmyyyy(r.PartyBillDCDate);
      const billNo = [str(r, 'PartyBillDCNo'), billDate].filter(Boolean).join('\n');
      const transporter = [
        str(r, 'TransporterName'),
        [str(r, 'LRNo'), ddmmyyyy(r.LRDate), str(r, 'VehicleNo')].filter(Boolean).join(' / ')
      ].filter(Boolean).join('\n');

      const lines = {
        millLot: estimateLines(millLot, CHARS_PER_LINE.millLot),
        partyLot: estimateLines(partyLot, CHARS_PER_LINE.partyLot),
        supplier: estimateLines(supplier, CHARS_PER_LINE.supplier),
        billNo: multiLines(billNo, CHARS_PER_LINE.billNo),
        variety: estimateLines(variety, CHARS_PER_LINE.variety),
        transporter: multiLines(transporter, CHARS_PER_LINE.transporter)
      };
      const maxLines = Math.max(1, ...Object.values(lines));

      const cell = (text, align = 'left', cellLines = 1) => ({
        text, alignment: align, fontSize: 8, fillColor: zebra,
        margin: [0, topPadFor(maxLines, cellLines), 0, 0]
      });

      const bales = dec(r, 'NoOfBales');
      const gross = dec(r, 'TotalGrossWeight');
      const tare = dec(r, 'TotalTareWeight');
      const net = dec(r, 'TotalNetWeight');
      sBales += bales; sGross += gross; sTare += tare; sNet += net;

      body.push([
        cell(String(sno), 'center'),
        cell(ddmmyyyy(r.CottonRejectDate), 'center'),
        cell(millLot, 'left', lines.millLot),
        cell(partyLot, 'center', lines.partyLot),
        cell(fmt(bales, 0), 'right'),
        cell(supplier, 'left', lines.supplier),
        cell(billNo, 'left', lines.billNo),
        cell(variety, 'left', lines.variety),
        cell(fmt(gross, 3), 'right'),
        cell(fmt(tare, 3), 'right'),
        cell(fmt(net, 3), 'right'),
        cell(transporter, 'left', lines.transporter)
      ]);
      sno++;
      rowIdx++;
    }

    const sub = { bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 8 };
    body.push([
      { text: label + ' Total', colSpan: 4, alignment: 'right', ...sub }, {}, {}, {},
      { text: fmt(sBales, 0), alignment: 'right', ...sub },
      { text: '', colSpan: 3, fillColor: colors.subFill }, {}, {},
      { text: fmt(sGross, 3), alignment: 'right', ...sub },
      { text: fmt(sTare, 3), alignment: 'right', ...sub },
      { text: fmt(sNet, 3), alignment: 'right', ...sub },
      { text: '', fillColor: colors.subFill }
    ]);

    gBales += sBales; gGross += sGross; gTare += sTare; gNet += sNet;
  }

  const grand = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 };
  body.push([
    { text: 'Net Total', colSpan: 4, alignment: 'right', ...grand }, {}, {}, {},
    { text: fmt(gBales, 0), alignment: 'right', ...grand },
    { text: '', colSpan: 3, fillColor: colors.grandFill }, {}, {},
    { text: fmt(gGross, 3), alignment: 'right', ...grand },
    { text: fmt(gTare, 3), alignment: 'right', ...grand },
    { text: fmt(gNet, 3), alignment: 'right', ...grand },
    { text: '', fillColor: colors.grandFill }
  ]);

  return buildPage({
    companyName,
    companyLogo,
    title: TYPE_TITLES[mode] || TYPE_TITLES.all,
    fromDate,
    toDate,
    tables: [{
      table: { headerRows: 1, dontBreakRows: true, keepWithHeaderRows: 0, widths: WIDTHS, body },
      layout: tableLayout()
    }],
    summary: []
  });
}

export const cottonRejectReport = (req, res) =>
  runReport(req, res, {
    spName: 'sp_CottonReject_GetAll',
    fileName: 'CottonRejectDetails',
    buildDocDefinition
  });
