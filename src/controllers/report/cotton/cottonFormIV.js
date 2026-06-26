// Cotton Form IV — daily raw-material stock register (Opening / Receipt / Issue
// / Transfer / Reject / Closing), one row per day, sorted by date.
//   ?groupBy=bales   (default) — Bales With Kgs (full 17-column register)
//   ?groupBy=kgs               — Only Kgs (Kgs-only columns + summary block)
//
// Optional in-memory filter (comma-separated code list, mirrors the WinForms
// rptCottonFormIV "Raw Material Type" multi-select):
//   ?rawMaterialTypeCodes=1,2
//
// SP: sp_Cotton_FormIV (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, tableLayout, colors, dec, fmt, ddmmyyyy
} from './_common.js';

const codeSet = (query, key) => {
  const raw = String(query[key] || '').trim();
  if (!raw) return null;
  const s = new Set(raw.split(',').map((x) => x.trim()).filter(Boolean));
  return s.size ? s : null;
};

const dayKey = (d) => {
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? 0 : dt.getTime();
};

// Compact layout for the dense 17-column register — pdfmake ADDS cell padding
// on top of the column widths, so a 17-col table at the default 4pt side padding
// gains ~136pt and overruns the A4-landscape page (data gets cut off). Halving
// the horizontal padding to 2pt keeps the whole register inside the page.
const compactLayout = () => ({
  ...tableLayout(),
  paddingLeft: () => 2,
  paddingRight: () => 2,
  paddingTop: () => 4,
  paddingBottom: () => 4
});

// ── Bales With Kgs — 17 columns ────────────────────────────────────────────
// Widths sum to 664; + 17×4 padding + vlines ≈ 739pt, comfortably inside the
// 812pt usable width (A4 landscape, 15pt margins) so nothing is clipped.
const BALES_WIDTHS = [50, 30, 46, 30, 46, 30, 46, 30, 44, 44, 40, 30, 46, 30, 46, 30, 46];

function buildBalesTable(rows) {
  const hCell = (text, span) => ({
    text, bold: true, fillColor: colors.headerFill, color: colors.headerText,
    alignment: 'center', fontSize: 7.5, ...(span ? { colSpan: span } : {})
  });
  const body = [];
  // Two-row grouped header.
  body.push([
    { text: 'Date', rowSpan: 2, bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 7.5, margin: [0, 5, 0, 0] },
    hCell('Opening', 2), {},
    hCell('Receipt', 2), {},
    hCell('Unit Receipt', 2), {},
    hCell('Issue', 4), {}, {}, {},
    hCell('Transfer', 2), {},
    hCell('Reject / Sales', 2), {},
    hCell('Closing', 2), {}
  ]);
  body.push([
    {},
    hCell('Bales'), hCell('Kgs'),
    hCell('Bales'), hCell('Kgs'),
    hCell('Bales'), hCell('Kgs'),
    hCell('Bales'), hCell('Act Kgs'), hCell('Cur Kgs'), hCell('Diff'),
    hCell('Bales'), hCell('Kgs'),
    hCell('Bales'), hCell('Kgs'),
    hCell('Bales'), hCell('Kgs')
  ]);

  const T = {
    recB: 0, recK: 0, urB: 0, urK: 0, isB: 0, isA: 0, isC: 0,
    trB: 0, trK: 0, rjB: 0, rjK: 0
  };
  let rowIdx = 0;
  for (const r of rows) {
    const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;
    const c = (text, align = 'right') => ({ text, alignment: align, fontSize: 7.5, fillColor: zebra });

    const recB = dec(r, 'ReceiptBales'), recK = dec(r, 'ReceiptKgs');
    const urB = dec(r, 'UnitReceiptBales'), urK = dec(r, 'UnitReceiptKgs');
    const isB = dec(r, 'IssueBales'), isA = dec(r, 'IssueActualKgs'), isC = dec(r, 'IssueCurrentKgs');
    const trB = dec(r, 'TransBales'), trK = dec(r, 'TransKgs');
    const rjB = dec(r, 'RejectedBales'), rjK = dec(r, 'RejectedKgs');
    T.recB += recB; T.recK += recK; T.urB += urB; T.urK += urK;
    T.isB += isB; T.isA += isA; T.isC += isC; T.trB += trB; T.trK += trK; T.rjB += rjB; T.rjK += rjK;

    body.push([
      c(ddmmyyyy(r.CottonFormIVDate), 'center'),
      c(fmt(dec(r, 'OpBales'), 0)), c(fmt(dec(r, 'OPKgs'), 2)),
      c(fmt(recB, 0)), c(fmt(recK, 2)),
      c(fmt(urB, 0)), c(fmt(urK, 2)),
      c(fmt(isB, 0)), c(fmt(isA, 2)), c(fmt(isC, 2)), c(fmt(isC - isA, 3)),
      c(fmt(trB, 0)), c(fmt(trK, 2)),
      c(fmt(rjB, 0)), c(fmt(rjK, 2)),
      c(fmt(dec(r, 'ClosingBales'), 0)), c(fmt(dec(r, 'ClosingKgs'), 2))
    ]);
    rowIdx++;
  }

  const g = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 7.5 };
  const gc = (text, align = 'right') => ({ text, alignment: align, ...g });
  body.push([
    gc('Total', 'right'),
    gc(''), gc(''),
    gc(fmt(T.recB, 0)), gc(fmt(T.recK, 2)),
    gc(fmt(T.urB, 0)), gc(fmt(T.urK, 2)),
    gc(fmt(T.isB, 0)), gc(fmt(T.isA, 2)), gc(fmt(T.isC, 2)), gc(fmt(T.isC - T.isA, 3)),
    gc(fmt(T.trB, 0)), gc(fmt(T.trK, 2)),
    gc(fmt(T.rjB, 0)), gc(fmt(T.rjK, 2)),
    gc(''), gc('')
  ]);

  return { table: { headerRows: 2, dontBreakRows: true, widths: BALES_WIDTHS, body }, layout: compactLayout() };
}

// ── Only Kgs — 7 columns + summary block ───────────────────────────────────
const KGS_WIDTHS = [70, '*', '*', '*', '*', '*', '*'];
const KGS_HEADERS = ['Date', 'Opening Kgs', 'Receipt Kgs', 'Total', 'Issue Kgs', 'Rejected Kgs', 'Closing Kgs'];

function buildKgsTables(rows) {
  const body = [];
  body.push(KGS_HEADERS.map(t => ({
    text: t, bold: true, fillColor: colors.headerFill, color: colors.headerText,
    alignment: 'center', fontSize: 8
  })));

  let recK = 0, isA = 0, rjK = 0;
  let rowIdx = 0;
  for (const r of rows) {
    const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;
    const op = dec(r, 'OPKgs'), rec = dec(r, 'ReceiptKgs'), iss = dec(r, 'IssueActualKgs'),
      rej = dec(r, 'RejectedKgs'), clo = dec(r, 'ClosingKgs');
    recK += rec; isA += iss; rjK += rej;
    const c = (text, align = 'right') => ({ text, alignment: align, fontSize: 8, fillColor: zebra });
    body.push([
      c(ddmmyyyy(r.CottonFormIVDate), 'center'),
      c(fmt(op, 2)), c(fmt(rec, 2)), c(fmt(op + rec, 2)),
      c(fmt(iss, 2)), c(fmt(rej, 2)), c(fmt(clo, 2))
    ]);
    rowIdx++;
  }

  const openBal = rows.length ? dec(rows[0], 'OPKgs') : 0;
  const closeBal = rows.length ? dec(rows[rows.length - 1], 'ClosingKgs') : 0;
  const summaryRows = [
    ['Opening Balance', openBal],
    ['Receipt', recK],
    ['Total', openBal + recK],
    ['Issues', isA],
    ['Rejection', rjK],
    ['Closing Balance', closeBal]
  ];
  const sl = { bold: true, fontSize: 9, fillColor: colors.subFill, color: colors.subText };
  const summaryBody = summaryRows.map(([label, val]) => [
    { text: label, ...sl, alignment: 'left', margin: [2, 1, 0, 1] },
    { text: ':', ...sl, alignment: 'center' },
    { text: fmt(val, 2), ...sl, alignment: 'right', color: colors.grandText }
  ]);

  return [
    { table: { headerRows: 1, dontBreakRows: true, widths: KGS_WIDTHS, body }, layout: tableLayout() },
    { text: 'Summary  (All Quantity in KG)', bold: true, fontSize: 10, color: colors.headerFill, margin: [0, 14, 0, 4] },
    { table: { widths: [140, 10, 110], body: summaryBody }, layout: tableLayout() }
  ];
}

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate, query }) {
  const groupBy = (query.groupBy || 'bales').toLowerCase();

  const typeSet = codeSet(query, 'rawMaterialTypeCodes');
  let data = typeSet ? rows.filter((r) => typeSet.has(String(r.RawMaterialTypeCode))) : rows;
  data = [...data].sort((a, b) => dayKey(a.CottonFormIVDate) - dayKey(b.CottonFormIVDate));

  const tables = groupBy === 'kgs' ? buildKgsTables(data) : [buildBalesTable(data)];
  const title = groupBy === 'kgs'
    ? 'COTTON FORM IV - ACCOUNT OF RAW MATERIALS (Only Kgs)'
    : 'COTTON FORM IV - DAILY STOCK REGISTER (Bales With Kgs)';

  return buildPage({ companyName, companyLogo, title, fromDate, toDate, tables });
}

export const cottonFormIVReport = (req, res) =>
  runReport(req, res, {
    spName: 'sp_Cotton_FormIV',
    fileName: 'CottonFormIV',
    buildDocDefinition
  });
