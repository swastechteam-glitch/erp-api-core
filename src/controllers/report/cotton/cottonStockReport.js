// Cotton Stock report — one controller, mirroring the legacy WinForms Stock
// screen's report-type radios (rptCottonStock.vb). Every mode groups the same
// SP recordset by a different column; the layout is either the plain Bales/Kgs
// grid (buildPlainDoc) or the value grid (buildWithValueDoc).
//
//   ?groupBy=rawmaterial (default) — grouped by RawMaterialName, With-Value layout
//   ?groupBy=withvalue             — grouped by RawMaterialName, With-Value layout
//   ?groupBy=summaryvalue          — grouped by RawMaterialName, With-Value layout
//   ?groupBy=variety               — grouped by RawMaterialName, plain layout
//   ?groupBy=station               — grouped by StationName
//   ?groupBy=godown                — grouped by GodownName
//   ?groupBy=state                 — grouped by StateName
//   ?groupBy=quality               — grouped by QualityName / Grade
//   ?groupBy=marketcommittee       — grouped by MarketCommittee
//   ?groupBy=party                 — grouped by PartyName  (legacy "With Party")
//   ?groupBy=bale                  — grouped by Mill Lot No (legacy "Bale Wise")
//   ?groupBy=abstract              — grouped by RawMaterialName, plain layout
//
// SP: web_sp_Cotton_Stock (CompanyCode, FromDate, ToDate)
//
// COLUMN NAMES: the SP definition isn't in this repo, so the group keys for the
// newer modes (godown/state/quality/marketcommittee/party/bale) each probe a
// prioritised list of likely column names via `pick()` and fall back to an
// "(Unknown …)" bucket if none are present. Confirm the real columns with
// `GET /cotton/reports/stock?debug=1` and tighten the candidate lists below.

import {
  runReport, buildPage, buildGroupSummaryPage, tableLayout, colors,
  dec, str, fmt, estimateLines, topPadFor
} from './_common.js';

// Return the first non-empty candidate column on a row, else `fallback`.
const pick = (r, cols, fallback) => {
  for (const c of cols) {
    const v = r[c];
    if (v !== null && v !== undefined && String(v).trim() !== '') return String(v).trim();
  }
  return fallback;
};

const GROUP_CONFIGS = {
  variety: {
    title: 'COTTON STOCK - VARIETY WISE',
    fileName: 'CottonStock_VarietyWise',
    groupKey: (r) => str(r, 'RawMaterialName') || '(Unknown Variety)',
    labelHeader: 'Variety'
  },
  station: {
    title: 'COTTON STOCK - STATION WISE',
    fileName: 'CottonStock_StationWise',
    groupKey: (r) => str(r, 'StationName') || '(Unknown Station)',
    labelHeader: 'Station'
  },
  withvalue: {
    title: 'COTTON STOCK - WITH VALUE',
    fileName: 'CottonStock_WithValue',
    groupKey: (r) => str(r, 'RawMaterialName') || '(Unknown Variety)',
    labelHeader: 'Variety'
  },
  rawmaterial: {
    title: 'COTTON STOCK - RAW MATERIAL WISE',
    fileName: 'CottonStock_RawMaterialWise',
    groupKey: (r) => str(r, 'RawMaterialName') || '(Unknown Raw Material)',
    labelHeader: 'Raw Material'
  },
  godown: {
    title: 'COTTON STOCK - GODOWN WISE',
    fileName: 'CottonStock_GodownWise',
    groupKey: (r) => pick(r, ['GodownName', 'Godown', 'GodownCode'], '(Unknown Godown)'),
    labelHeader: 'Godown'
  },
  state: {
    title: 'COTTON STOCK - STATE WISE',
    fileName: 'CottonStock_StateWise',
    groupKey: (r) => pick(r, ['StateName', 'State', 'StateCode'], '(Unknown State)'),
    labelHeader: 'State'
  },
  quality: {
    title: 'COTTON STOCK - QUALITY WISE',
    fileName: 'CottonStock_QualityWise',
    groupKey: (r) => pick(r, ['QualityName', 'Quality', 'QualitySTDName', 'GradeName', 'Grade'], '(Unknown Quality)'),
    labelHeader: 'Quality'
  },
  marketcommittee: {
    title: 'COTTON STOCK - MARKET COMMITTEE WISE',
    fileName: 'CottonStock_MarketCommitteeWise',
    groupKey: (r) => pick(r, ['MarketCommittee', 'MarketCommitteeName', 'MarketCommiteeName'], '(Unknown Market Committee)'),
    labelHeader: 'Market Committee'
  },
  party: {
    title: 'COTTON STOCK - PARTY WISE',
    fileName: 'CottonStock_PartyWise',
    groupKey: (r) => pick(r, ['PartyName', 'Party', 'SupplierName', 'AccountName'], '(Unknown Party)'),
    labelHeader: 'Party'
  },
  bale: {
    title: 'COTTON STOCK - BALE WISE',
    fileName: 'CottonStock_BaleWise',
    groupKey: (r) => pick(r, ['MillLotNo', 'ArrivalNo', 'LotNo', 'ArrivalCode'], '(Unknown Lot)'),
    labelHeader: 'Mill Lot No'
  },
  abstract: {
    title: 'COTTON STOCK - ABSTRACT',
    fileName: 'CottonStock_Abstract',
    groupKey: (r) => str(r, 'RawMaterialName') || '(Unknown Raw Material)',
    labelHeader: 'Raw Material'
  },
  summaryvalue: {
    title: 'COTTON STOCK - SUMMARY VALUE',
    fileName: 'CottonStock_SummaryValue',
    groupKey: (r) => str(r, 'RawMaterialName') || '(Unknown Variety)',
    labelHeader: 'Variety'
  }
};

function aggregate(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    let g = map.get(k);
    if (!g) {
      g = {
        label: k,
        OpBales: 0, OPKgs: 0, OPValue: 0,
        ReceiptBales: 0, ReceiptKgs: 0, ReceiptValue: 0,
        UnitReceiptBales: 0, UnitReceiptKgs: 0,
        IssueBales: 0, IssueKgs: 0, IssueKgs2: 0, IssueValue: 0,
        TransBales: 0, TransKgs: 0,
        RejectBales: 0, RejectKgs: 0,
        SalesBales: 0, SalesKgs: 0, SalesValue: 0,
        ActSalesKgs: 0, ActSalesValue: 0,
        ClosingBales: 0, ClosingKgs: 0, ClosingValue: 0,
        CandyRateSum: 0, CandyRateCount: 0
      };
      map.set(k, g);
    }
    g.OpBales += dec(r, 'OpBales');
    g.OPKgs += dec(r, 'OPKgs');
    g.OPValue += dec(r, 'OPValue');
    g.ReceiptBales += dec(r, 'ReceiptBales');
    g.ReceiptKgs += dec(r, 'ReceiptKgs');
    g.ReceiptValue += dec(r, 'ReceiptValue');
    g.UnitReceiptBales += dec(r, 'UnitReceiptBales');
    g.UnitReceiptKgs += dec(r, 'UnitReceiptKgs');
    g.IssueBales += dec(r, 'IssueBales');
    g.IssueKgs += dec(r, 'IssueKgs');
    g.IssueKgs2 += dec(r, 'IssueKgs2');
    g.IssueValue += dec(r, 'IssueValue');
    g.TransBales += dec(r, 'TransBales');
    g.TransKgs += dec(r, 'TransKgs');
    g.RejectBales += dec(r, 'RejectBales');
    g.RejectKgs += dec(r, 'RejectKgs');
    g.SalesBales += dec(r, 'SalesBales');
    g.SalesKgs += dec(r, 'SalesKgs');
    g.SalesValue += dec(r, 'SalesValue');
    g.ActSalesKgs += dec(r, 'ActSalesKgs');
    g.ActSalesValue += dec(r, 'ActSalesValue');
    g.ClosingBales += dec(r, 'ClosingBales');
    g.ClosingKgs += dec(r, 'ClosingKgs');
    g.ClosingValue += dec(r, 'ClosingValue');
    const cr = dec(r, 'CandyRate');
    if (cr > 0) { g.CandyRateSum += cr; g.CandyRateCount++; }
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}

// ---- Variety / Station Wise (no value cols) ----
const PLAIN_WIDTHS = [22, '*', 36, 48, 36, 48, 36, 48, 36, 48, 48, 36, 48];
const PLAIN_HEADERS_TOP = [
  'S.No', 'LABEL',
  'Opening', '',
  'Receipt', '',
  'Issue', '',
  'Transfer', '',
  'Sales',
  'Closing', ''
];
const PLAIN_HEADERS_BOT = [
  '', '',
  'Bales', 'Kgs',
  'Bales', 'Kgs',
  'Bales', 'Kgs',
  'Bales', 'Kgs',
  'Kgs',
  'Bales', 'Kgs'
];

function buildPlainDoc({ rows, companyName, companyLogo, fromDate, toDate, cfg }) {
  const groups = aggregate(rows, cfg.groupKey);

  const body = [];
  const headFill = { fillColor: colors.headerFill, color: colors.headerText, bold: true, fontSize: 8, alignment: 'center' };

  // Two-row header (group cells via colSpan)
  body.push([
    { text: 'S.No', ...headFill, rowSpan: 2 },
    { text: cfg.labelHeader, ...headFill, rowSpan: 2 },
    { text: 'Opening', colSpan: 2, ...headFill }, {},
    { text: 'Receipt', colSpan: 2, ...headFill }, {},
    { text: 'Issue', colSpan: 2, ...headFill }, {},
    { text: 'Transfer', colSpan: 2, ...headFill }, {},
    { text: 'Sales (Kgs)', ...headFill, rowSpan: 2 },
    { text: 'Closing', colSpan: 2, ...headFill }, {}
  ]);
  body.push([
    {}, {},
    { text: 'Bales', ...headFill }, { text: 'Kgs', ...headFill },
    { text: 'Bales', ...headFill }, { text: 'Kgs', ...headFill },
    { text: 'Bales', ...headFill }, { text: 'Kgs', ...headFill },
    { text: 'Bales', ...headFill }, { text: 'Kgs', ...headFill },
    {},
    { text: 'Bales', ...headFill }, { text: 'Kgs', ...headFill }
  ]);

  let tOp = 0, tOpK = 0, tRc = 0, tRcK = 0, tIs = 0, tIsK = 0;
  let tTr = 0, tTrK = 0, tSk = 0, tCb = 0, tCk = 0;
  let sno = 1;
  const groupSummaries = [];

  for (const g of groups) {
    const zebra = sno % 2 === 0 ? colors.zebraFill : null;
    const lines = estimateLines(g.label, 28);
    const cell = (text, align = 'right') => ({
      text, alignment: align, fontSize: 7.5, fillColor: zebra,
      margin: [0, topPadFor(lines, 1), 0, 0]
    });
    const labelCell = {
      text: g.label, alignment: 'left', fontSize: 7.5, fillColor: zebra
    };

    body.push([
      cell(String(sno), 'center'),
      labelCell,
      cell(fmt(g.OpBales, 0)),
      cell(fmt(g.OPKgs, 2)),
      cell(fmt(g.ReceiptBales, 0)),
      cell(fmt(g.ReceiptKgs, 2)),
      cell(fmt(g.IssueBales, 0)),
      cell(fmt(g.IssueKgs, 2)),
      cell(fmt(g.TransBales, 0)),
      cell(fmt(g.TransKgs, 2)),
      cell(fmt(g.SalesKgs, 2)),
      cell(fmt(g.ClosingBales, 0)),
      cell(fmt(g.ClosingKgs, 2))
    ]);

    tOp += g.OpBales; tOpK += g.OPKgs;
    tRc += g.ReceiptBales; tRcK += g.ReceiptKgs;
    tIs += g.IssueBales; tIsK += g.IssueKgs;
    tTr += g.TransBales; tTrK += g.TransKgs;
    tSk += g.SalesKgs;
    tCb += g.ClosingBales; tCk += g.ClosingKgs;

    groupSummaries.push({
      label: g.label,
      totals: {
        opBales: g.OpBales, opKgs: g.OPKgs,
        rcBales: g.ReceiptBales, rcKgs: g.ReceiptKgs,
        isBales: g.IssueBales, isKgs: g.IssueKgs,
        clBales: g.ClosingBales, clKgs: g.ClosingKgs
      }
    });

    sno++;
  }

  const gStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 };
  body.push([
    { text: 'Grand Total', colSpan: 2, alignment: 'right', ...gStyle }, {},
    { text: fmt(tOp, 0), alignment: 'right', ...gStyle },
    { text: fmt(tOpK, 2), alignment: 'right', ...gStyle },
    { text: fmt(tRc, 0), alignment: 'right', ...gStyle },
    { text: fmt(tRcK, 2), alignment: 'right', ...gStyle },
    { text: fmt(tIs, 0), alignment: 'right', ...gStyle },
    { text: fmt(tIsK, 2), alignment: 'right', ...gStyle },
    { text: fmt(tTr, 0), alignment: 'right', ...gStyle },
    { text: fmt(tTrK, 2), alignment: 'right', ...gStyle },
    { text: fmt(tSk, 2), alignment: 'right', ...gStyle },
    { text: fmt(tCb, 0), alignment: 'right', ...gStyle },
    { text: fmt(tCk, 2), alignment: 'right', ...gStyle }
  ]);

  const summary = buildGroupSummaryPage({
    companyName, companyLogo, fromDate, toDate,
    title: cfg.title.replace(/COTTON STOCK/i, 'COTTON STOCK SUMMARY'),
    groupHeader: cfg.labelHeader,
    groupSummaries,
    grandTotals: {
      opBales: tOp, opKgs: tOpK,
      rcBales: tRc, rcKgs: tRcK,
      isBales: tIs, isKgs: tIsK,
      clBales: tCb, clKgs: tCk
    },
    totalCols: [
      { header: 'Op Bales', key: 'opBales', digits: 0 },
      { header: 'Op Kgs', key: 'opKgs', digits: 2 },
      { header: 'Rc Bales', key: 'rcBales', digits: 0 },
      { header: 'Rc Kgs', key: 'rcKgs', digits: 2 },
      { header: 'Is Bales', key: 'isBales', digits: 0 },
      { header: 'Is Kgs', key: 'isKgs', digits: 2 },
      { header: 'Cl Bales', key: 'clBales', digits: 0 },
      { header: 'Cl Kgs', key: 'clKgs', digits: 2 }
    ]
  });

  return buildPage({
    companyName, companyLogo, title: cfg.title, fromDate, toDate,
    tables: [{
      table: { headerRows: 2, dontBreakRows: true, keepWithHeaderRows: 0, widths: PLAIN_WIDTHS, body },
      layout: tableLayout()
    }],
    summary
  });
}

// ---- With Value ----
const WV_WIDTHS = [22, '*', 32, 44, 50, 32, 44, 50, 44, 50, 44, 50, 44, 50];

function buildWithValueDoc({ rows, companyName, companyLogo, fromDate, toDate, cfg }) {
  const groups = aggregate(rows, cfg.groupKey);

  const body = [];
  const headFill = { fillColor: colors.headerFill, color: colors.headerText, bold: true, fontSize: 8, alignment: 'center' };

  body.push([
    { text: 'S.No', ...headFill, rowSpan: 2 },
    { text: cfg.labelHeader, ...headFill, rowSpan: 2 },
    { text: 'Opening', colSpan: 3, ...headFill }, {}, {},
    { text: 'Receipt', colSpan: 3, ...headFill }, {}, {},
    { text: 'Issue', colSpan: 2, ...headFill }, {},
    { text: 'Sales', colSpan: 2, ...headFill }, {},
    { text: 'Closing', colSpan: 2, ...headFill }, {}
  ]);
  body.push([
    {}, {},
    { text: 'Bales', ...headFill }, { text: 'Kgs', ...headFill }, { text: 'Value', ...headFill },
    { text: 'Bales', ...headFill }, { text: 'Kgs', ...headFill }, { text: 'Value', ...headFill },
    { text: 'Kgs', ...headFill }, { text: 'Value', ...headFill },
    { text: 'Kgs', ...headFill }, { text: 'Value', ...headFill },
    { text: 'Bales', ...headFill }, { text: 'Kgs', ...headFill }
  ]);

  let tOp = 0, tOpK = 0, tOpV = 0;
  let tRc = 0, tRcK = 0, tRcV = 0;
  let tIsK = 0, tIsV = 0;
  let tSk = 0, tSv = 0;
  let tCb = 0, tCk = 0, tCv = 0;
  let sno = 1;
  const groupSummaries = [];

  for (const g of groups) {
    const zebra = sno % 2 === 0 ? colors.zebraFill : null;
    const lines = estimateLines(g.label, 24);
    const cell = (text, align = 'right') => ({
      text, alignment: align, fontSize: 7.5, fillColor: zebra,
      margin: [0, topPadFor(lines, 1), 0, 0]
    });

    body.push([
      cell(String(sno), 'center'),
      { text: g.label, alignment: 'left', fontSize: 7.5, fillColor: zebra },
      cell(fmt(g.OpBales, 0)),
      cell(fmt(g.OPKgs, 2)),
      cell(fmt(g.OPValue, 2)),
      cell(fmt(g.ReceiptBales, 0)),
      cell(fmt(g.ReceiptKgs, 2)),
      cell(fmt(g.ReceiptValue, 2)),
      cell(fmt(g.IssueKgs, 2)),
      cell(fmt(g.IssueValue, 2)),
      cell(fmt(g.SalesKgs, 2)),
      cell(fmt(g.SalesValue, 2)),
      cell(fmt(g.ClosingBales, 0)),
      cell(fmt(g.ClosingKgs, 2))
    ]);

    tOp += g.OpBales; tOpK += g.OPKgs; tOpV += g.OPValue;
    tRc += g.ReceiptBales; tRcK += g.ReceiptKgs; tRcV += g.ReceiptValue;
    tIsK += g.IssueKgs; tIsV += g.IssueValue;
    tSk += g.SalesKgs; tSv += g.SalesValue;
    tCb += g.ClosingBales; tCk += g.ClosingKgs; tCv += g.ClosingValue;

    groupSummaries.push({
      label: g.label,
      totals: {
        opBales: g.OpBales, opKgs: g.OPKgs, opValue: g.OPValue,
        rcBales: g.ReceiptBales, rcKgs: g.ReceiptKgs, rcValue: g.ReceiptValue,
        isKgs: g.IssueKgs, isValue: g.IssueValue,
        clBales: g.ClosingBales, clKgs: g.ClosingKgs, clValue: g.ClosingValue
      }
    });

    sno++;
  }

  const gStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 };
  body.push([
    { text: 'Grand Total', colSpan: 2, alignment: 'right', ...gStyle }, {},
    { text: fmt(tOp, 0), alignment: 'right', ...gStyle },
    { text: fmt(tOpK, 2), alignment: 'right', ...gStyle },
    { text: fmt(tOpV, 2), alignment: 'right', ...gStyle },
    { text: fmt(tRc, 0), alignment: 'right', ...gStyle },
    { text: fmt(tRcK, 2), alignment: 'right', ...gStyle },
    { text: fmt(tRcV, 2), alignment: 'right', ...gStyle },
    { text: fmt(tIsK, 2), alignment: 'right', ...gStyle },
    { text: fmt(tIsV, 2), alignment: 'right', ...gStyle },
    { text: fmt(tSk, 2), alignment: 'right', ...gStyle },
    { text: fmt(tSv, 2), alignment: 'right', ...gStyle },
    { text: fmt(tCb, 0), alignment: 'right', ...gStyle },
    { text: fmt(tCk, 2), alignment: 'right', ...gStyle }
  ]);

  // Closing Value as a separate summary row (avoids over-wide table)
  body.push([
    { text: 'Total Closing Value', colSpan: 13, alignment: 'right', ...gStyle }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {},
    { text: fmt(tCv, 2), alignment: 'right', ...gStyle }
  ]);

  const summary = buildGroupSummaryPage({
    companyName, companyLogo, fromDate, toDate,
    title: cfg.title.replace(/COTTON STOCK/i, 'COTTON STOCK SUMMARY'),
    groupHeader: cfg.labelHeader,
    groupSummaries,
    grandTotals: {
      opBales: tOp, opKgs: tOpK, opValue: tOpV,
      rcBales: tRc, rcKgs: tRcK, rcValue: tRcV,
      isKgs: tIsK, isValue: tIsV,
      clBales: tCb, clKgs: tCk, clValue: tCv
    },
    totalCols: [
      { header: 'Op Bales', key: 'opBales', digits: 0 },
      { header: 'Op Kgs', key: 'opKgs', digits: 2 },
      { header: 'Op Value', key: 'opValue', digits: 2 },
      { header: 'Rc Bales', key: 'rcBales', digits: 0 },
      { header: 'Rc Kgs', key: 'rcKgs', digits: 2 },
      { header: 'Rc Value', key: 'rcValue', digits: 2 },
      { header: 'Is Kgs', key: 'isKgs', digits: 2 },
      { header: 'Is Value', key: 'isValue', digits: 2 },
      { header: 'Cl Bales', key: 'clBales', digits: 0 },
      { header: 'Cl Kgs', key: 'clKgs', digits: 2 },
      { header: 'Cl Value', key: 'clValue', digits: 2 }
    ]
  });

  return buildPage({
    companyName, companyLogo, title: cfg.title, fromDate, toDate,
    tables: [{
      table: { headerRows: 2, dontBreakRows: true, keepWithHeaderRows: 0, widths: WV_WIDTHS, body },
      layout: tableLayout()
    }],
    summary
  });
}

// ---- dispatcher ----
// Normalise the groupBy param (strip separators/case) and map it to a mode key.
// Unknown values fall back to 'rawmaterial' — the current UI default.
const MODE_ALIASES = {
  withvalue: 'withvalue', value: 'withvalue',
  summaryvalue: 'summaryvalue',
  station: 'station',
  rawmaterial: 'rawmaterial', rm: 'rawmaterial',
  variety: 'variety', item: 'variety',
  godown: 'godown',
  state: 'state',
  quality: 'quality',
  marketcommittee: 'marketcommittee',
  party: 'party', withparty: 'party',
  bale: 'bale',
  abstract: 'abstract'
};

function pickMode(query) {
  const raw = String(query.groupBy || 'rawmaterial').toLowerCase().replace(/[-_\s]/g, '');
  return MODE_ALIASES[raw] || 'rawmaterial';
}

// Parse a comma-separated code list query param into a Set of strings (or null).
const codeSet = (query, key) => {
  const raw = String((query || {})[key] || '').trim();
  if (!raw) return null;
  const s = new Set(raw.split(',').map((x) => x.trim()).filter(Boolean));
  return s.size ? s : null;
};

function buildDocDefinition(ctx) {
  const mode = pickMode(ctx.query);
  const cfg = GROUP_CONFIGS[mode];

  // In-memory filters — mirror rptCottonStock.vb, which narrows the fetched rows
  // by the chosen code lists: Mill Lot No (ArrivalCode), Item (RawMaterialCode)
  // and RawMaterial Type (RawMaterialTypeCode). An absent param = no filter.
  const arrSet = codeSet(ctx.query, 'arrivalCodes');
  const rmSet = codeSet(ctx.query, 'rawMaterialCodes');
  const rmtSet = codeSet(ctx.query, 'rawMaterialTypeCodes');
  let rows = ctx.rows || [];
  if (arrSet) rows = rows.filter((r) => arrSet.has(String(r.ArrivalCode)));
  if (rmSet) rows = rows.filter((r) => rmSet.has(String(r.RawMaterialCode)));
  if (rmtSet) rows = rows.filter((r) => rmtSet.has(String(r.RawMaterialTypeCode)));
  const filtered = { ...ctx, rows };

  // Value layouts (With Value / Raw Material / Summary Value) share the With-Value
  // column grid; every other mode uses the plain Bales/Kgs grid.
  const VALUE_MODES = new Set(['withvalue', 'rawmaterial', 'summaryvalue']);
  if (VALUE_MODES.has(mode)) return buildWithValueDoc({ ...filtered, cfg });
  return buildPlainDoc({ ...filtered, cfg });
}

export const cottonStockReportHandler = (req, res) => {
  const mode = pickMode(req.query);
  const cfg = GROUP_CONFIGS[mode];
  return runReport(req, res, {
    spName: 'web_sp_Cotton_Stock',
    fileName: cfg.fileName,
    buildDocDefinition
  });
};
