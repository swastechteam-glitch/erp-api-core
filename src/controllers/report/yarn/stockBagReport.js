// reports/yarn/stockBagReport.js
// Yarn Stock — "Stock Bag No Abstract" (rptStock_BagStockDetails). One screen,
// five report types. Four run sp_YarnStock_Current, one runs sp_Stock_Abstract;
// both SPs take only @CompanyCode (the VB's date pickers are disabled, so dates
// are never sent). Each type differs only in grouping/layout:
//   bagNoWise        -> rptStockBagNoWise.rdlc              (by Count → bags)
//   lotNoWise        -> rptStockLotNoWise.rdlc              (by Lot → bags)
//   countLotSummary  -> rptStockCountWise.rdlc              (by Count → per-Lot bag counts)
//   abstract         -> rptStockAbstract.rdlc (sp_Stock_Abstract, by Count → Lot → bag nos)
//   productionDate   -> rptStockProductionDateBagNoWise.rdlc(by Count → Lot+Date rows)
//
// Company / Count / LotNo filters mirror the VB: Count + LotNo are applied in JS
// (DataResult.Select("CountTypeCode IN (..)") / "LotNoCode IN (..)").

const dec = (row, col) => {
  if (!row) return 0;
  const v = row[col];
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};
const str = (row, col) => {
  const v = row ? row[col] : null;
  return (v === null || v === undefined) ? '' : String(v);
};
const nWt = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n0 = (v) => Math.round(Number(v) || 0).toLocaleString('en-IN');
const ddmmyyyy = (d) => {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${dt.getFullYear()}`;
};

const COLORS = {
  headerFill: '#1A3C7B',
  headerText: '#FFFFFF',
  groupFill: '#E8F0FE',
  groupText: '#1A3C7B',
  lotText: '#C0392B',
  subFill: '#EEF2F7',
  subText: '#1A3C7B',
  grandFill: '#1A3C7B',
  grandText: '#FFFFFF',
  zebraFill: '#FAFBFD',
  borderColor: '#C9CFD8'
};

const layout = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => COLORS.borderColor,
  vLineColor: () => COLORS.borderColor,
  paddingLeft: () => 4,
  paddingRight: () => 4,
  paddingTop: () => 3,
  paddingBottom: () => 3
};

const footer = (currentPage, pageCount) => ({
  margin: [0, 10, 0, 0],
  columns: [
    { text: 'Developed by Swas Technologies, Report Printed : ' + new Date().toLocaleString('en-GB'), fontSize: 7, margin: [15, 0, 0, 0] },
    { text: `${currentPage} / ${pageCount}`, alignment: 'right', fontSize: 7, margin: [0, 0, 15, 0] }
  ]
});

const titleBlock = (companyName, title, logoDataUri) => {
  const LOGO_W = 80;
  const logoCol = logoDataUri
    ? { image: logoDataUri, fit: [70, 70], width: LOGO_W, alignment: 'left', margin: [4, 0, 0, 0] }
    : { text: '', width: LOGO_W };
  return {
    columns: [
      logoCol,
      { width: '*', stack: [
        { text: companyName, alignment: 'center', fontSize: 14, bold: true, color: '#000080' },
        { text: title, alignment: 'center', fontSize: 12, bold: true, color: '#7B3F00', margin: [0, 3, 0, 0] }
      ] },
      { text: '', width: LOGO_W }
    ],
    margin: [0, 0, 0, 10]
  };
};

const th = (text, extra = {}) => ({ text, bold: true, fillColor: COLORS.headerFill, color: COLORS.headerText, alignment: 'center', fontSize: 8, ...extra });
const emptyCells = (n) => Array.from({ length: n }, () => ({}));

// insertion-ordered grouping
function groupBy(rows, keyFn) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}

const A4 = (content) => ({
  pageSize: 'A4',
  pageMargins: [24, 20, 24, 42],
  footer,
  content,
  defaultStyle: { font: 'Roboto', fontSize: 8, lineHeight: 1.15 }
});

// ===========================================================================
// BAG NO WISE — group by Count, list each bag. rptStockBagNoWise.rdlc
// ===========================================================================
function buildBagNoWise(rows, companyName, fromDate, toDate, companyLogo) {
  const COLS = 7; // S.No | Bag No | Lot No | G.Wt | T.Wt | N.Wt | Wt Diff
  const body = [[th('S.No'), th('Bag No'), th('Lot No', { alignment: 'left' }), th('G. Weight'), th('T. Weight'), th('N. Weight'), th('Wt Diff')]];
  const groups = groupBy(rows, (r) => str(r, 'CountType') || '(Unknown)');
  const gTot = { bags: 0, g: 0, t: 0, n: 0, d: 0 };
  for (const [count, grows] of groups) {
    body.push([{ text: 'Count : ' + count, colSpan: COLS, bold: true, color: COLORS.groupText, fillColor: COLORS.groupFill, margin: [2, 2, 0, 2] }, ...emptyCells(COLS - 1)]);
    const s = { g: 0, t: 0, n: 0, d: 0 };
    grows.forEach((r, i) => {
      const zebra = i % 2 ? COLORS.zebraFill : null;
      body.push([
        { text: String(i + 1), alignment: 'center', fillColor: zebra },
        { text: str(r, 'BagNo'), alignment: 'center', fillColor: zebra },
        { text: str(r, 'LotNo'), fillColor: zebra },
        { text: nWt(dec(r, 'GrossWeight')), alignment: 'right', fillColor: zebra },
        { text: nWt(dec(r, 'TareWeight')), alignment: 'right', fillColor: zebra },
        { text: nWt(dec(r, 'NetWeight')), alignment: 'right', fillColor: zebra },
        { text: nWt(dec(r, 'WeightDiff')), alignment: 'right', fillColor: zebra }
      ]);
      s.g += dec(r, 'GrossWeight'); s.t += dec(r, 'TareWeight'); s.n += dec(r, 'NetWeight'); s.d += dec(r, 'WeightDiff');
    });
    const totCell = (txt) => ({ text: txt, bold: true, alignment: 'right', fillColor: COLORS.subFill, color: COLORS.subText });
    body.push([
      { text: `Total : ${grows.length} Bag(s)`, colSpan: 3, bold: true, alignment: 'right', fillColor: COLORS.subFill, color: COLORS.subText }, {}, {},
      totCell(nWt(s.g)), totCell(nWt(s.t)), totCell(nWt(s.n)), totCell(nWt(s.d))
    ]);
    gTot.bags += grows.length; gTot.g += s.g; gTot.t += s.t; gTot.n += s.n; gTot.d += s.d;
  }
  const gCell = (txt) => ({ text: txt, bold: true, alignment: 'right', fillColor: COLORS.grandFill, color: COLORS.grandText });
  body.push([
    { text: `Grand Total : ${gTot.bags} Bag(s)`, colSpan: 3, bold: true, alignment: 'right', fillColor: COLORS.grandFill, color: COLORS.grandText }, {}, {},
    gCell(nWt(gTot.g)), gCell(nWt(gTot.t)), gCell(nWt(gTot.n)), gCell(nWt(gTot.d))
  ]);
  return A4([
    titleBlock(companyName, 'Yarn Stock - (BagNo Wise)', companyLogo),
    { table: { headerRows: 1, widths: [30, 55, '*', 62, 62, 62, 62], body }, layout }
  ]);
}

// ===========================================================================
// LOT NO WISE — group by Lot, list each bag. rptStockLotNoWise.rdlc
// ===========================================================================
function buildLotNoWise(rows, companyName, fromDate, toDate, companyLogo) {
  const COLS = 8; // S.No | Lot No | Count | Bag No | G | T | N | Diff
  const body = [[th('S.No'), th('Lot No', { alignment: 'left' }), th('Count', { alignment: 'left' }), th('Bag No'), th('G. Weight'), th('T. Weight'), th('N. Weight'), th('Wt Diff')]];
  const groups = groupBy(rows, (r) => str(r, 'LotNo') || '(Unknown)');
  const gTot = { bags: 0, g: 0, t: 0, n: 0, d: 0 };
  for (const [lot, grows] of groups) {
    body.push([{ text: 'Lot No : ' + lot, colSpan: COLS, bold: true, color: COLORS.lotText, fillColor: COLORS.groupFill, margin: [2, 2, 0, 2] }, ...emptyCells(COLS - 1)]);
    const s = { g: 0, t: 0, n: 0, d: 0 };
    grows.forEach((r, i) => {
      const zebra = i % 2 ? COLORS.zebraFill : null;
      body.push([
        { text: String(i + 1), alignment: 'center', fillColor: zebra },
        { text: str(r, 'LotNo'), fillColor: zebra },
        { text: str(r, 'ShortName') || str(r, 'CountType'), fillColor: zebra },
        { text: str(r, 'BagNo'), alignment: 'center', fillColor: zebra },
        { text: nWt(dec(r, 'GrossWeight')), alignment: 'right', fillColor: zebra },
        { text: nWt(dec(r, 'TareWeight')), alignment: 'right', fillColor: zebra },
        { text: nWt(dec(r, 'NetWeight')), alignment: 'right', fillColor: zebra },
        { text: nWt(dec(r, 'WeightDiff')), alignment: 'right', fillColor: zebra }
      ]);
      s.g += dec(r, 'GrossWeight'); s.t += dec(r, 'TareWeight'); s.n += dec(r, 'NetWeight'); s.d += dec(r, 'WeightDiff');
    });
    const tc = (txt) => ({ text: txt, bold: true, alignment: 'right', fillColor: COLORS.subFill, color: COLORS.subText });
    body.push([
      { text: 'Total', colSpan: 3, bold: true, alignment: 'right', fillColor: COLORS.subFill, color: COLORS.subText }, {}, {},
      { text: String(grows.length), bold: true, alignment: 'center', fillColor: COLORS.subFill, color: COLORS.subText },
      tc(nWt(s.g)), tc(nWt(s.t)), tc(nWt(s.n)), tc(nWt(s.d))
    ]);
    gTot.bags += grows.length; gTot.g += s.g; gTot.t += s.t; gTot.n += s.n; gTot.d += s.d;
  }
  const gc = (txt) => ({ text: txt, bold: true, alignment: 'right', fillColor: COLORS.grandFill, color: COLORS.grandText });
  body.push([
    { text: 'Grand Total', colSpan: 3, bold: true, alignment: 'right', fillColor: COLORS.grandFill, color: COLORS.grandText }, {}, {},
    { text: String(gTot.bags), bold: true, alignment: 'center', fillColor: COLORS.grandFill, color: COLORS.grandText },
    gc(nWt(gTot.g)), gc(nWt(gTot.t)), gc(nWt(gTot.n)), gc(nWt(gTot.d))
  ]);
  return A4([
    titleBlock(companyName, 'Yarn Stock - (Lot No Wise)', companyLogo),
    { table: { headerRows: 1, widths: [30, '*', '*', 50, 60, 60, 60, 60], body }, layout }
  ]);
}

// ===========================================================================
// COUNT LOT WISE SUMMARY — one row per (Count, Lot) with bag count.
// rptStockCountWise.rdlc
// ===========================================================================
function buildCountLotSummary(rows, companyName, fromDate, toDate, companyLogo) {
  const body = [[th('S.No'), th('Count Type', { alignment: 'left' }), th('Lot No', { alignment: 'left' }), th('Bags')]];
  const counts = groupBy(rows, (r) => str(r, 'CountType') || '(Unknown)');
  let sno = 0, grand = 0;
  for (const [count, crows] of counts) {
    const lots = groupBy(crows, (r) => str(r, 'LotNo') || '(Unknown)');
    let sub = 0;
    for (const [lot, lrows] of lots) {
      sno += 1;
      const zebra = sno % 2 ? COLORS.zebraFill : null;
      body.push([
        { text: String(sno), alignment: 'center', fillColor: zebra },
        { text: count, fillColor: zebra },
        { text: lot, fillColor: zebra },
        { text: String(lrows.length), alignment: 'right', fillColor: zebra }
      ]);
      sub += lrows.length;
    }
    body.push([
      { text: count + ' - Total', colSpan: 3, bold: true, alignment: 'right', fillColor: COLORS.subFill, color: COLORS.subText }, {}, {},
      { text: String(sub), bold: true, alignment: 'right', fillColor: COLORS.subFill, color: COLORS.subText }
    ]);
    grand += sub;
  }
  body.push([
    { text: 'Grand Total', colSpan: 3, bold: true, alignment: 'right', fillColor: COLORS.grandFill, color: COLORS.grandText }, {}, {},
    { text: String(grand), bold: true, alignment: 'right', fillColor: COLORS.grandFill, color: COLORS.grandText }
  ]);
  return A4([
    titleBlock(companyName, 'Yarn Stock - (Count Wise)', companyLogo),
    { table: { headerRows: 1, widths: [30, '*', 200, 60], body }, layout }
  ]);
}

// ===========================================================================
// ABSTRACT — Count → Lot → bag nos, with per-Lot / per-Count / net totals.
// sp_Stock_Abstract → rptStockAbstract.rdlc
// ===========================================================================
function buildAbstract(rows, companyName, fromDate, toDate, companyLogo) {
  const COLS = 3;
  const body = [];
  const counts = groupBy(rows, (r) => str(r, 'ShortName') || str(r, 'CountType') || '(Unknown)');
  let net = 0;
  for (const [count, crows] of counts) {
    body.push([{ text: 'COUNT : ' + count, colSpan: COLS, bold: true, color: '#0033A0', fillColor: COLORS.groupFill, margin: [2, 2, 0, 2] }, {}, {}]);
    const lots = groupBy(crows, (r) => str(r, 'LotNo') || '(Unknown)');
    let countTot = 0;
    for (const [lot, lrows] of lots) {
      body.push([{ text: lot, colSpan: COLS, bold: true, color: COLORS.lotText, margin: [8, 1, 0, 1] }, {}, {}]);
      let lotTot = 0;
      lrows.forEach((r, i) => {
        body.push([{ text: str(r, 'BagNo'), colSpan: COLS, margin: [16, 0, 0, 0], fillColor: i % 2 ? COLORS.zebraFill : null }, {}, {}]);
        lotTot += dec(r, 'BagCount');
      });
      body.push([
        { text: lot + '  - TOTAL :', colSpan: 2, bold: true, alignment: 'right', color: COLORS.lotText, fillColor: COLORS.subFill }, {},
        { text: n0(lotTot), bold: true, color: COLORS.lotText, fillColor: COLORS.subFill }
      ]);
      countTot += lotTot;
    }
    body.push([
      { text: count + ' - TOTAL :', colSpan: 2, bold: true, alignment: 'right', color: '#0033A0', fillColor: COLORS.groupFill }, {},
      { text: n0(countTot), bold: true, color: '#0033A0', fillColor: COLORS.groupFill }
    ]);
    net += countTot;
  }
  body.push([
    { text: 'NET TOTAL :', colSpan: 2, bold: true, alignment: 'right', fillColor: COLORS.grandFill, color: COLORS.grandText }, {},
    { text: n0(net), bold: true, fillColor: COLORS.grandFill, color: COLORS.grandText }
  ]);
  return A4([
    titleBlock(companyName, 'Bag Abstract', companyLogo),
    { table: { headerRows: 0, widths: [70, 140, '*'], body }, layout }
  ]);
}

// ===========================================================================
// PRODUCTION DATE WISE — Count → (Lot + Prodn Date) rows.
// rptStockProductionDateBagNoWise.rdlc
// ===========================================================================
function buildProductionDate(rows, companyName, fromDate, toDate, companyLogo) {
  const COLS = 6; // Count | Lot No | Packing | Packed Date | Pack No | Total Packs
  const body = [[th('Count Code', { alignment: 'left' }), th('Lot No', { alignment: 'left' }), th('Packing', { alignment: 'left' }), th('Packed Date'), th('Pack No', { alignment: 'left' }), th('Total Packs')]];
  const counts = groupBy(rows, (r) => str(r, 'CountTypeCode') + '||' + (str(r, 'ShortName') || str(r, 'CountType')));
  let grand = 0;
  for (const [, crows] of counts) {
    const sub = groupBy(crows, (r) => str(r, 'LotNoCode') + '||' + str(r, 'ProductionDate'));
    let countTot = 0;
    let idx = 0;
    for (const [, srows] of sub) {
      const r0 = srows[0];
      const packs = srows.reduce((a, r) => a + (dec(r, 'StockQty') || 1), 0);
      const zebra = idx % 2 ? COLORS.zebraFill : null; idx += 1;
      body.push([
        { text: str(r0, 'ShortName') || str(r0, 'CountType'), fillColor: zebra },
        { text: str(r0, 'LotNo'), fillColor: zebra },
        { text: str(r0, 'BoxPackingName'), fillColor: zebra },
        { text: ddmmyyyy(r0.ProductionDate), alignment: 'center', fillColor: zebra },
        { text: str(r0, 'BagNoStr'), fillColor: zebra },
        { text: n0(packs), alignment: 'right', fillColor: zebra }
      ]);
      countTot += packs;
    }
    body.push([
      { text: (str(crows[0], 'ShortName') || str(crows[0], 'CountType')) + ' - Total', colSpan: 5, bold: true, alignment: 'right', fillColor: COLORS.subFill, color: COLORS.subText }, {}, {}, {}, {},
      { text: n0(countTot), bold: true, alignment: 'right', fillColor: COLORS.subFill, color: COLORS.subText }
    ]);
    grand += countTot;
  }
  body.push([
    { text: 'Grand Total', colSpan: 5, bold: true, alignment: 'right', fillColor: COLORS.grandFill, color: COLORS.grandText }, {}, {}, {}, {},
    { text: n0(grand), bold: true, alignment: 'right', fillColor: COLORS.grandFill, color: COLORS.grandText }
  ]);
  return A4([
    titleBlock(companyName, 'Yarn Stock - (Production Date Wise)', companyLogo),
    { table: { headerRows: 1, widths: ['*', '*', 90, 65, '*', 60], body }, layout }
  ]);
}

export const bagNoWise = { buildDocDefinition: buildBagNoWise };
export const lotNoWise = { buildDocDefinition: buildLotNoWise };
export const countLotSummary = { buildDocDefinition: buildCountLotSummary };
export const abstract = { buildDocDefinition: buildAbstract };
export const productionDate = { buildDocDefinition: buildProductionDate };

export default { bagNoWise, lotNoWise, countLotSummary, abstract, productionDate };
