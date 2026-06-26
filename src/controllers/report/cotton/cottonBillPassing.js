// Cotton Bill Passing report — passed bills with their payment details.
//   ?groupBy=date     (default) — grouped by Bill Passing Date
//   ?groupBy=supplier            — grouped by Supplier Name (per-supplier total)
//
// Optional in-memory filters (comma-separated code lists, mirrors the WinForms
// rptCottonBillPassing screen):
//   ?supplierCodes=1,2 &paymentCodes=3,4 &arrivalCodes=5,6  (arrivalCodes = Mill Lot)
//
// SP: sp_Cotton_BillPassing_GetAll (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, buildGroupSummaryPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy, estimateLines, topPadFor
} from './_common.js';

const GROUP_CONFIGS = {
  date: {
    title: 'COTTON BILL PASSING - DATE WISE',
    summaryGroupHeader: 'Bill Passing Date',
    summaryLabel: (g) => ddmmyyyy(g[0].BillPassingDate),
    groupKey: (r) => {
      const d = new Date(r.BillPassingDate);
      return isNaN(d.getTime()) ? '0000-00-00' : d.toISOString().slice(0, 10);
    },
    groupLabel: (g) => 'Date : ' + ddmmyyyy(g[0].BillPassingDate),
    sortFn: (a, b) => a[0].localeCompare(b[0])
  },
  supplier: {
    title: 'COTTON BILL PASSING - SUPPLIER WISE',
    summaryGroupHeader: 'Supplier Name',
    summaryLabel: (g) => str(g[0], 'SupplierName'),
    groupKey: (r) => str(r, 'SupplierName') || '(Unknown Supplier)',
    groupLabel: (g) => 'Supplier : ' + str(g[0], 'SupplierName'),
    sortFn: (a, b) => a[0].localeCompare(b[0])
  }
};

// 14 columns: S.No, Bill Pass Date, Arrival Date, Mill Lot No, Party Lot No,
//             Supplier, Agent, Payment No, Payment Date, Cheque No, Cheque Date,
//             Bank Name, Account No, Payment Amount
const WIDTHS = [18, 50, 50, 56, 52, '*', '*', 40, 50, 56, 50, '*', 70, 60];
const HEADERS = [
  'S.No', 'Bill Pass Date', 'Arrival Date', 'Mill Lot No', 'Party Lot No',
  'Supplier Name', 'Agent Name', 'Pay No', 'Pay Date', 'Cheque No', 'Cheque Date',
  'Bank Name', 'Account No', 'Pay Amount'
];
const CHARS_PER_LINE = {
  millLot: 12, partyLot: 12, supplier: 16, agent: 16, cheque: 12, bank: 14, account: 14
};

const codeSet = (query, key) => {
  const raw = String(query[key] || '').trim();
  if (!raw) return null;
  const s = new Set(raw.split(',').map((x) => x.trim()).filter(Boolean));
  return s.size ? s : null;
};

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate, query }) {
  const groupBy = (query.groupBy || 'date').toLowerCase();
  const cfg = GROUP_CONFIGS[groupBy] || GROUP_CONFIGS.date;

  const supSet = codeSet(query, 'supplierCodes');
  const paySet = codeSet(query, 'paymentCodes');
  const arrSet = codeSet(query, 'arrivalCodes');
  let data = rows;
  if (supSet) data = data.filter((r) => supSet.has(String(r.SupplierCode)));
  if (paySet) data = data.filter((r) => paySet.has(String(r.PaymentCode)));
  if (arrSet) data = data.filter((r) => arrSet.has(String(r.ArrivalCode)));

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

  let gAmt = 0;
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

    let sAmt = 0;
    let rowIdx = 0;

    for (const r of group) {
      const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;

      const millLot = str(r, 'MillLotNo');
      const partyLot = str(r, 'PartyLotNo');
      const supplier = str(r, 'SupplierName');
      const agent = str(r, 'AgentName');
      const cheque = str(r, 'ChequeNo');
      const bank = str(r, 'BankName');
      const account = str(r, 'AccountNo');

      const lines = {
        millLot: estimateLines(millLot, CHARS_PER_LINE.millLot),
        partyLot: estimateLines(partyLot, CHARS_PER_LINE.partyLot),
        supplier: estimateLines(supplier, CHARS_PER_LINE.supplier),
        agent: estimateLines(agent, CHARS_PER_LINE.agent),
        cheque: estimateLines(cheque, CHARS_PER_LINE.cheque),
        bank: estimateLines(bank, CHARS_PER_LINE.bank),
        account: estimateLines(account, CHARS_PER_LINE.account)
      };
      const maxLines = Math.max(1, ...Object.values(lines));

      const cell = (text, align = 'left', cellLines = 1) => ({
        text, alignment: align, fontSize: 8, fillColor: zebra,
        margin: [0, topPadFor(maxLines, cellLines), 0, 0]
      });

      const amt = dec(r, 'PaymentAmount');
      sAmt += amt;

      body.push([
        cell(String(sno), 'center'),
        cell(ddmmyyyy(r.BillPassingDate), 'center'),
        cell(ddmmyyyy(r.ArrivalDate), 'center'),
        cell(millLot, 'center', lines.millLot),
        cell(partyLot, 'center', lines.partyLot),
        cell(supplier, 'left', lines.supplier),
        cell(agent, 'left', lines.agent),
        cell(String(r.PaymentNo ?? ''), 'center'),
        cell(ddmmyyyy(r.PaymentDate), 'center'),
        cell(cheque, 'center', lines.cheque),
        cell(ddmmyyyy(r.ChequeDate), 'center'),
        cell(bank, 'left', lines.bank),
        cell(account, 'left', lines.account),
        cell(fmt(amt, 2), 'right')
      ]);
      sno++;
      rowIdx++;
    }

    const sub = { bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 8 };
    body.push([
      { text: 'Sub Total', colSpan: 13, alignment: 'right', ...sub },
      {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {},
      { text: fmt(sAmt, 2), alignment: 'right', ...sub }
    ]);

    groupSummaries.push({ label: cfg.summaryLabel(group), totals: { amount: sAmt } });
    gAmt += sAmt;
  }

  const grand = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 };
  body.push([
    { text: 'Net Total', colSpan: 13, alignment: 'right', ...grand },
    {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {},
    { text: fmt(gAmt, 2), alignment: 'right', ...grand }
  ]);

  const summary = buildGroupSummaryPage({
    companyName, companyLogo, fromDate, toDate,
    title: cfg.title.replace('COTTON BILL PASSING', 'COTTON BILL PASSING SUMMARY'),
    groupHeader: cfg.summaryGroupHeader,
    groupSummaries,
    grandTotals: { amount: gAmt },
    totalCols: [{ header: 'Payment Amount', key: 'amount', digits: 2 }]
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

export const cottonBillPassingReport = (req, res) =>
  runReport(req, res, {
    spName: 'sp_Cotton_BillPassing_GetAll',
    fileName: 'CottonBillPassing',
    buildDocDefinition
  });
