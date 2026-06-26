// Cotton Sales report — one controller, 6 grouping modes (mirrors the WinForms
// rptCottonSalesDetails radio buttons; each maps to a *Wise.rdlc):
//   ?groupBy=date     (default) — grouped by Cotton Sales Date
//   ?groupBy=customer            — grouped by Customer Name
//   ?groupBy=agent               — grouped by Agent Name
//   ?groupBy=variety             — grouped by Raw Material (Variety)
//   ?groupBy=milllot             — grouped by Mill Lot No
//   ?groupBy=invoice             — grouped by Invoice (Cotton Sales) No
// (The "Rate Wise" P&L variant has a different column layout and isn't covered.)
//
// Optional in-memory filters (comma-separated code lists):
//   ?customerCodes=1,2 &agentCodes=3 &rawMaterialCodes=4 &arrivalCodes=5 &salesCodes=6
//
// SP: sp_CottonSales_GetAll (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, buildGroupSummaryPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy, estimateLines, topPadFor
} from './_common.js';

const dayKey = (d) => {
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '0000-00-00' : dt.toISOString().slice(0, 10);
};
const alpha = (a, b) => a[0].localeCompare(b[0]);

const GROUP_CONFIGS = {
  date: {
    title: 'COTTON SALES - DATE WISE', summaryGroupHeader: 'Sales Date',
    groupKey: (r) => dayKey(r.CottonSalesDate),
    groupLabel: (g) => 'Date : ' + ddmmyyyy(g[0].CottonSalesDate),
    summaryLabel: (g) => ddmmyyyy(g[0].CottonSalesDate), sortFn: alpha
  },
  customer: {
    title: 'COTTON SALES - CUSTOMER WISE', summaryGroupHeader: 'Customer Name',
    groupKey: (r) => str(r, 'CustomerName') || '(Unknown Customer)',
    groupLabel: (g) => 'Customer : ' + str(g[0], 'CustomerName'),
    summaryLabel: (g) => str(g[0], 'CustomerName'), sortFn: alpha
  },
  agent: {
    title: 'COTTON SALES - AGENT WISE', summaryGroupHeader: 'Agent Name',
    groupKey: (r) => str(r, 'AgentName') || '(Unknown Agent)',
    groupLabel: (g) => 'Agent : ' + str(g[0], 'AgentName'),
    summaryLabel: (g) => str(g[0], 'AgentName'), sortFn: alpha
  },
  variety: {
    title: 'COTTON SALES - VARIETY WISE', summaryGroupHeader: 'Variety',
    groupKey: (r) => str(r, 'RawMaterialName') || '(Unknown Variety)',
    groupLabel: (g) => 'Variety : ' + str(g[0], 'RawMaterialName'),
    summaryLabel: (g) => str(g[0], 'RawMaterialName'), sortFn: alpha
  },
  milllot: {
    title: 'COTTON SALES - MILL LOT NO WISE', summaryGroupHeader: 'Mill Lot No',
    groupKey: (r) => str(r, 'MillLotNo') || '(Unknown Lot)',
    groupLabel: (g) => 'Mill Lot No : ' + str(g[0], 'MillLotNo'),
    summaryLabel: (g) => str(g[0], 'MillLotNo'), sortFn: alpha
  },
  invoice: {
    title: 'COTTON SALES - INVOICE NO WISE', summaryGroupHeader: 'Invoice No',
    groupKey: (r) => String(r.CottonSalesNo ?? '(Unknown)'),
    groupLabel: (g) => 'Invoice No : ' + str(g[0], 'CottonSalesNo'),
    summaryLabel: (g) => str(g[0], 'CottonSalesNo'),
    sortFn: (a, b) => (Number(a[0]) || 0) - (Number(b[0]) || 0)
  }
};

// 15 columns: S.No, Inv No, Inv Date, Customer, Variety, Agent, Bales, Rate,
//             Amount, Net Wt, CGST, SGST, IGST, Net Amount, Mill Lot
const WIDTHS = [18, 34, 48, '*', '*', '*', 34, 42, 56, 50, 46, 46, 46, 60, 50];
const HEADERS = [
  'S.No', 'Inv No', 'Inv Date', 'Customer Name', 'Variety', 'Agent Name', 'Bales',
  'Rate', 'Amount', 'Net Wt', 'CGST', 'SGST', 'IGST', 'Net Amount', 'Mill Lot No'
];
const CHARS_PER_LINE = { customer: 16, variety: 14, agent: 14, millLot: 12 };

const codeSet = (query, key) => {
  const raw = String(query[key] || '').trim();
  if (!raw) return null;
  const s = new Set(raw.split(',').map((x) => x.trim()).filter(Boolean));
  return s.size ? s : null;
};

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate, query }) {
  const groupBy = (query.groupBy || 'date').toLowerCase();
  const cfg = GROUP_CONFIGS[groupBy] || GROUP_CONFIGS.date;

  const sets = {
    CustomerCode: codeSet(query, 'customerCodes'),
    AgentCode: codeSet(query, 'agentCodes'),
    RawMaterialCode: codeSet(query, 'rawMaterialCodes'),
    ArrivalCode: codeSet(query, 'arrivalCodes'),
    CottonSalesCode: codeSet(query, 'salesCodes')
  };
  let data = rows;
  for (const [col, set] of Object.entries(sets)) {
    if (set) data = data.filter((r) => set.has(String(r[col])));
  }

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
    alignment: 'center', fontSize: 7.5
  })));

  const G = { bales: 0, amount: 0, net: 0, cgst: 0, sgst: 0, igst: 0, netAmt: 0 };
  let sno = 1;
  const groupSummaries = [];

  for (const [, group] of sortedEntries) {
    body.push([
      {
        text: cfg.groupLabel(group), colSpan: 15, bold: true,
        color: colors.groupText, fillColor: colors.groupFill, fontSize: 8.5, margin: [2, 2, 0, 2]
      },
      {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}
    ]);

    const S = { bales: 0, amount: 0, net: 0, cgst: 0, sgst: 0, igst: 0, netAmt: 0 };
    let rowIdx = 0;

    for (const r of group) {
      const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;

      const customer = str(r, 'CustomerName');
      const variety = str(r, 'RawMaterialName');
      const agent = str(r, 'AgentName');
      const millLot = str(r, 'MillLotNo');
      const lines = {
        customer: estimateLines(customer, CHARS_PER_LINE.customer),
        variety: estimateLines(variety, CHARS_PER_LINE.variety),
        agent: estimateLines(agent, CHARS_PER_LINE.agent),
        millLot: estimateLines(millLot, CHARS_PER_LINE.millLot)
      };
      const maxLines = Math.max(1, ...Object.values(lines));
      const cell = (text, align = 'left', cellLines = 1) => ({
        text, alignment: align, fontSize: 7.5, fillColor: zebra,
        margin: [0, topPadFor(maxLines, cellLines), 0, 0]
      });

      const bales = dec(r, 'TotalQty');
      const amount = dec(r, 'TotalAmount');
      const net = dec(r, 'TotalNetWeight');
      const cgst = dec(r, 'TotalCGSTAmount');
      const sgst = dec(r, 'TotalSGSTAmount');
      const igst = dec(r, 'TotalIGSTAmount');
      const netAmt = dec(r, 'TotalNetAmount');
      S.bales += bales; S.amount += amount; S.net += net;
      S.cgst += cgst; S.sgst += sgst; S.igst += igst; S.netAmt += netAmt;

      body.push([
        cell(String(sno), 'center'),
        cell(String(r.CottonSalesNo ?? ''), 'center'),
        cell(ddmmyyyy(r.CottonSalesDate), 'center'),
        cell(customer, 'left', lines.customer),
        cell(variety, 'left', lines.variety),
        cell(agent, 'left', lines.agent),
        cell(fmt(bales, 0), 'right'),
        cell(fmt(dec(r, 'SalesRate'), 2), 'right'),
        cell(fmt(amount, 2), 'right'),
        cell(fmt(net, 2), 'right'),
        cell(fmt(cgst, 2), 'right'),
        cell(fmt(sgst, 2), 'right'),
        cell(fmt(igst, 2), 'right'),
        cell(fmt(netAmt, 2), 'right'),
        cell(millLot, 'center', lines.millLot)
      ]);
      sno++;
      rowIdx++;
    }

    const sub = { bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 7.5 };
    const sCell = (v) => ({ text: fmt(v, 2), alignment: 'right', ...sub });
    body.push([
      { text: 'Sub Total', colSpan: 6, alignment: 'right', ...sub }, {}, {}, {}, {}, {},
      { text: fmt(S.bales, 0), alignment: 'right', ...sub },
      { text: '', fillColor: colors.subFill },
      sCell(S.amount), sCell(S.net), sCell(S.cgst), sCell(S.sgst), sCell(S.igst), sCell(S.netAmt),
      { text: '', fillColor: colors.subFill }
    ]);

    groupSummaries.push({ label: cfg.summaryLabel(group), totals: { bales: S.bales, amount: S.amount, net: S.netAmt } });
    for (const k of Object.keys(G)) G[k] += S[k];
  }

  const grand = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 8 };
  const gCell = (v) => ({ text: fmt(v, 2), alignment: 'right', ...grand });
  body.push([
    { text: 'Net Total', colSpan: 6, alignment: 'right', ...grand }, {}, {}, {}, {}, {},
    { text: fmt(G.bales, 0), alignment: 'right', ...grand },
    { text: '', fillColor: colors.grandFill },
    gCell(G.amount), gCell(G.net), gCell(G.cgst), gCell(G.sgst), gCell(G.igst), gCell(G.netAmt),
    { text: '', fillColor: colors.grandFill }
  ]);

  const summary = buildGroupSummaryPage({
    companyName, companyLogo, fromDate, toDate,
    title: cfg.title.replace('COTTON SALES', 'COTTON SALES SUMMARY'),
    groupHeader: cfg.summaryGroupHeader,
    groupSummaries,
    grandTotals: { bales: G.bales, amount: G.amount, net: G.netAmt },
    totalCols: [
      { header: 'Bales', key: 'bales', digits: 0 },
      { header: 'Amount', key: 'amount', digits: 2 },
      { header: 'Net Amount', key: 'net', digits: 2 }
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

export const cottonSalesReport = (req, res) => {
  const groupBy = (req.query.groupBy || 'date').toLowerCase();
  const cfg = GROUP_CONFIGS[groupBy] || GROUP_CONFIGS.date;
  return runReport(req, res, {
    spName: 'sp_CottonSales_GetAll',
    fileName: 'CottonSales_' + (cfg.title.split(' - ')[1] || 'DateWise').replace(/\s+/g, ''),
    buildDocDefinition
  });
};
