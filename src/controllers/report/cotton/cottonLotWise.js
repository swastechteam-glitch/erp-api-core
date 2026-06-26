// Cotton Lot Wise report ("Stock Card") — one block per arrived lot: an info
// header (Mill Lot / Supplier / Variety / Bales / Station) followed by that
// lot's daily stock movement table (Op / Receipt / Issue / Transfer / Reject /
// Sales / Closing in Bales + Kgs).
//
// No date range. Optional lot range via ?fromLot=<ArrivalCode>&toLot=<ArrivalCode>
// (0/0 = all lots for the company, the WinForms "--ALL--" default).
//
// SP: sp_Cotton_Stock_BalesWiseLotWar (FromLot, ToLot, CompanyCode)

import {
  runReport, buildPage, tableLayout, colors, dec, str, fmt, ddmmyyyy, sql
} from './_common.js';

// 15 movement columns.
const WIDTHS = [48, 40, 54, 42, 54, 54, 48, 44, 50, 44, 50, 44, 50, 46, 54];
const HEADERS = [
  'Date', 'Op Bales', 'Op Kgs', 'Issue Bales', 'Issue Kgs', 'Issue Kgs2', 'Diff',
  'Trans Bales', 'Trans Kgs', 'Reject Bales', 'Reject Kgs', 'Sales Bales', 'Sales Kgs',
  'Closing Bales', 'Closing Kgs'
];

const bales = (v) => fmt(v, 0);
const kgs = (v) => fmt(v, 2);
// Blank a zero value (mirrors the WinForms iif(<>0, value, "")).
const bz = (v, fn) => (Number(v) === 0 ? '' : fn(v));

function buildDocDefinition({ rows, companyName, companyLogo }) {
  // group rows by ArrivalCode (one stock card per lot)
  const groupsMap = new Map();
  for (const r of rows) {
    const k = String(r.ArrivalCode);
    if (!groupsMap.has(k)) groupsMap.set(k, []);
    groupsMap.get(k).push(r);
  }
  // order lots by Mill Lot No
  const sortedEntries = [...groupsMap.entries()].sort((a, b) =>
    str(a[1][0], 'MillLotNo').localeCompare(str(b[1][0], 'MillLotNo')));

  const lbl = (t) => ({ text: t, bold: true, fontSize: 9, color: colors.companyColor });
  const val = (t) => ({ text: ': ' + (t ?? ''), fontSize: 9, bold: true });

  const content = [];

  sortedEntries.forEach(([, group], gi) => {
    const head = group[0];

    // lot info block
    content.push({
      table: {
        widths: [78, '*', 70, '*'],
        body: [
          [lbl('Mill Lot No'), val(str(head, 'MillLotNo')), lbl('Receipt Date'), val(ddmmyyyy(head.ArrivalDate))],
          [lbl('Supplier'), val(str(head, 'SupplierName')), lbl('Variety'), val(str(head, 'RawMaterialName'))],
          [lbl('No. Of Bales'), val(fmt(dec(head, 'Qty'), 0)), lbl('Station'), val(str(head, 'StationName'))]
        ]
      },
      layout: 'noBorders',
      margin: [0, gi === 0 ? 4 : 12, 0, 4],
      pageBreak: gi === 0 ? undefined : 'before'
    });

    // movement table
    const body = [];
    body.push(HEADERS.map(t => ({
      text: t, bold: true, fillColor: colors.headerFill, color: colors.headerText,
      alignment: 'center', fontSize: 7.5
    })));

    const movements = [...group].sort((a, b) =>
      (new Date(a.TransDate).getTime() || 0) - (new Date(b.TransDate).getTime() || 0));

    movements.forEach((r, i) => {
      const zebra = i % 2 === 1 ? colors.zebraFill : null;
      const cell = (text, align = 'right') => ({ text, alignment: align, fontSize: 7.5, fillColor: zebra });
      const diff = Math.round((dec(r, 'IssueKgs2') - dec(r, 'IssueKgs')) * 1000) / 1000;
      body.push([
        cell(ddmmyyyy(r.TransDate), 'center'),
        cell(bales(dec(r, 'OpBales'))),
        cell(kgs(dec(r, 'OPKgs'))),
        cell(bales(dec(r, 'IssueBales'))),
        cell(kgs(dec(r, 'IssueKgs'))),
        cell(kgs(dec(r, 'IssueKgs2'))),
        cell(diff === 0 ? '' : fmt(diff, 3)),
        cell(bz(dec(r, 'TransBales'), bales)),
        cell(bz(dec(r, 'TransKgs'), kgs)),
        cell(bz(dec(r, 'RejectBales'), bales)),
        cell(bz(dec(r, 'RejectKgs'), kgs)),
        cell(bz(dec(r, 'SalesBales'), bales)),
        cell(bz(dec(r, 'SalesKgs'), kgs)),
        cell(bz(dec(r, 'ClosingBales'), bales)),
        cell(bz(dec(r, 'ClosingKgs'), kgs))
      ]);
    });

    content.push({
      table: { headerRows: 1, dontBreakRows: true, keepWithHeaderRows: 1, widths: WIDTHS, body },
      layout: tableLayout()
    });
  });

  if (content.length === 0) {
    content.push({ text: 'No stock movements found for the selected lot range.', fontSize: 10, margin: [0, 20, 0, 0] });
  }

  return buildPage({
    companyName,
    companyLogo,
    title: 'COTTON STOCK CARD - LOT WISE',
    fromDate: '',
    toDate: '',
    tables: content,
    summary: []
  });
}

export const cottonLotWiseReport = (req, res) =>
  runReport(req, res, {
    spName: 'sp_Cotton_Stock_BalesWiseLotWar',
    fileName: 'CottonLotWise_StockCard',
    buildDocDefinition,
    // SP takes @FromLot / @ToLot (ArrivalCode range, 0 = all) + @CompanyCode.
    spParams: (p, req) => ({
      FromLot: { type: sql.Int, value: parseInt(req.query.fromLot) || 0 },
      ToLot: { type: sql.Int, value: parseInt(req.query.toLot) || 0 },
      CompanyCode: { type: sql.Int, value: parseInt(p.CompanyCode) || 0 }
    })
  });
