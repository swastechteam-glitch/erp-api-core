// reports/yarn/internalTransferReport.js
// Yarn Internal Transfer Report (rptYarnInternalTransfer). Two radio report
// types + Company + Count Type + Bag No filters (both applied as post-SP row
// filters, exactly like the VB's DataResult.Select("... IN (..)")):
//   detail   -> Report 1 (default) -> sp_YarnIntenalTransfer_GetAll ->
//               rptYarnInternalTransfer.rdlc: a flat transfer register
//               (S.No | Date | Count Type | Bag No | Gross | Tare | Net) with
//               weight totals.
//   dateWise -> Report 2 -> sp_YarnTransfer_Report ->
//               rptYarnIntenalTransferStrBag1.rdlc: "Transfer Stock (Date Wise)"
//               grouped by Count Type, one row per Count+Lot+Date showing the
//               bag-no string (BagNoStr) + Total Packs (sum StockQty), with
//               per-count subtotals + grand total.

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
const kg = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n0 = (v) => Math.round(Number(v) || 0).toLocaleString('en-IN');
const ddmmyyyy = (d) => {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${dt.getFullYear()}`;
};
const isoDate = (d) => {
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '' : dt.toISOString().slice(0, 10);
};

const COLORS = {
  headerFill: '#1A3C7B',
  headerText: '#FFFFFF',
  groupFill: '#E8F0FE',
  groupText: '#1A3C7B',
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
  paddingLeft: () => 3,
  paddingRight: () => 3,
  paddingTop: () => 3,
  paddingBottom: () => 3
};

const footer = (currentPage, pageCount) => ({
  margin: [0, 10, 0, 0],
  columns: [
    { text: 'Developed by Swas Technologies, Report Printed : ' + new Date().toLocaleString('en-GB'), fontSize: 7, margin: [15, 0, 0, 0] },
    { text: `Page No: ${currentPage} of ${pageCount}`, alignment: 'right', fontSize: 7, margin: [0, 0, 15, 0] }
  ]
});

const titleBlock = (companyName, title, dateLine, logoDataUri) => {
  const LOGO_W = 80;
  const logoCol = logoDataUri
    ? { image: logoDataUri, fit: [70, 70], width: LOGO_W, alignment: 'left', margin: [4, 0, 0, 0] }
    : { text: '', width: LOGO_W };
  const stack = [
    { text: companyName, alignment: 'center', fontSize: 14, bold: true, color: '#000080' },
    { text: title, alignment: 'center', fontSize: 12, bold: true, color: '#B22222', margin: [0, 3, 0, 0] }
  ];
  if (dateLine) stack.push({ text: dateLine, alignment: 'center', fontSize: 9, bold: true, color: '#006400', margin: [0, 3, 0, 0] });
  return { columns: [logoCol, { width: '*', stack }, { text: '', width: LOGO_W }], margin: [0, 0, 0, 10] };
};

const th = (text, extra = {}) => ({ text, bold: true, fillColor: COLORS.headerFill, color: COLORS.headerText, alignment: 'center', fontSize: 9, ...extra });

// ===========================================================================
// REPORT 1 (detail) — sp_YarnIntenalTransfer_GetAll -> rptYarnInternalTransfer
// ===========================================================================
function buildDetail(rows, companyName, fromDate, toDate, companyLogo) {
  const dateLine = `From Date : ${ddmmyyyy(fromDate)}          To Date : ${ddmmyyyy(toDate)}`;
  const head = ['S.No', 'Yarn Transfer Date', 'Count Type', 'Bag No', 'Gross Wt', 'Tare Wt', 'Net Wt'];
  const body = [head.map((h, i) => th(h, { alignment: i === 2 ? 'left' : 'center' }))];

  const sorted = rows.slice().sort((a, b) => {
    const d = isoDate(a.YarnITDate).localeCompare(isoDate(b.YarnITDate));
    return d !== 0 ? d : str(a, 'CountType').localeCompare(str(b, 'CountType'));
  });
  let g = 0, t = 0, n = 0;
  sorted.forEach((r, i) => {
    const zebra = i % 2 ? COLORS.zebraFill : null;
    const c = (txt, al) => ({ text: txt, alignment: al, fontSize: 8, fillColor: zebra });
    body.push([
      c(String(i + 1), 'center'),
      c(ddmmyyyy(r.YarnITDate), 'center'),
      c(str(r, 'CountType'), 'left'),
      c(n0(dec(r, 'BagNo')), 'right'),
      c(kg(dec(r, 'GrossWeight')), 'right'),
      c(kg(dec(r, 'TareWeight')), 'right'),
      c(kg(dec(r, 'NetWeight')), 'right'),
    ]);
    g += dec(r, 'GrossWeight'); t += dec(r, 'TareWeight'); n += dec(r, 'NetWeight');
  });
  const blank = { text: '', fillColor: COLORS.grandFill };
  const tc = (txt) => ({ text: txt, bold: true, alignment: 'right', fillColor: COLORS.grandFill, color: COLORS.grandText, fontSize: 8 });
  body.push([blank, blank, blank, { text: 'Total', bold: true, alignment: 'right', fillColor: COLORS.grandFill, color: COLORS.grandText, fontSize: 8 }, tc(kg(g)), tc(kg(t)), tc(kg(n))]);

  return {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [18, 18, 18, 42],
    footer,
    content: [
      titleBlock(companyName, 'Yarn Internal Transfer', dateLine, companyLogo),
      { table: { headerRows: 1, widths: [40, 90, '*', 70, 80, 80, 80], body }, layout }
    ],
    defaultStyle: { font: 'Roboto', fontSize: 8, lineHeight: 1.1 }
  };
}

// ===========================================================================
// REPORT 2 (dateWise) — sp_YarnTransfer_Report -> rptYarnIntenalTransferStrBag1
// ===========================================================================
function buildDateWise(rows, companyName, fromDate, toDate, companyLogo) {
  const dateLine = `As On : ${ddmmyyyy(fromDate)}`;
  const head = ['Count Code', 'Lot No', 'Transfer Date', 'Pack No', 'Total Packs'];
  const body = [head.map((h, i) => th(h, { alignment: i >= 3 ? (i === 4 ? 'center' : 'left') : (i === 1 ? 'center' : 'left') }))];

  // Collapse to distinct Count+Lot+Date combos (mirrors table1_Group1), summing
  // StockQty and keeping the concatenated bag string.
  const combos = new Map();
  for (const r of rows) {
    const key = str(r, 'CountTypeCode') + '|' + str(r, 'LotNoCode') + '|' + isoDate(r.YarnITDate);
    if (!combos.has(key)) {
      combos.set(key, {
        CountTypeCode: str(r, 'CountTypeCode'),
        CountType: str(r, 'CountType') || str(r, 'CountName'),
        LotNo: str(r, 'LotNo'),
        date: r.YarnITDate,
        BagNoStr: str(r, 'BagNoStr'),
        StockQty: 0
      });
    }
    const c = combos.get(key);
    c.StockQty += dec(r, 'StockQty');
    if (!c.BagNoStr) c.BagNoStr = str(r, 'BagNoStr');
  }

  // Group the combos by Count Type.
  const groups = new Map();
  for (const c of combos.values()) {
    if (!groups.has(c.CountTypeCode)) groups.set(c.CountTypeCode, []);
    groups.get(c.CountTypeCode).push(c);
  }
  const orderedGroups = [...groups.values()].sort((a, b) => str(a[0], 'CountType').localeCompare(str(b[0], 'CountType')));

  let grand = 0;
  for (const g of orderedGroups) {
    g.sort((a, b) => {
      const l = a.LotNo.localeCompare(b.LotNo);
      return l !== 0 ? l : isoDate(a.date).localeCompare(isoDate(b.date));
    });
    let gt = 0;
    g.forEach((c, i) => {
      const zebra = i % 2 ? COLORS.zebraFill : null;
      body.push([
        { text: i === 0 ? c.CountType : '', fontSize: 8, fillColor: zebra },
        { text: c.LotNo, alignment: 'center', fontSize: 8, fillColor: zebra },
        { text: ddmmyyyy(c.date), alignment: 'center', fontSize: 8, fillColor: zebra },
        { text: c.BagNoStr, fontSize: 8, fillColor: zebra },
        { text: n0(c.StockQty), alignment: 'right', fontSize: 8, fillColor: zebra },
      ]);
      gt += c.StockQty;
    });
    grand += gt;
    body.push([
      { text: (str(g[0], 'CountType') || 'Count') + ' - Total', colSpan: 4, bold: true, alignment: 'right', fillColor: COLORS.subFill, color: COLORS.subText, fontSize: 8 }, {}, {}, {},
      { text: n0(gt), bold: true, alignment: 'right', fillColor: COLORS.subFill, color: COLORS.subText, fontSize: 8 }
    ]);
  }
  body.push([
    { text: 'Grand Total', colSpan: 4, bold: true, alignment: 'right', fillColor: COLORS.grandFill, color: COLORS.grandText, fontSize: 8 }, {}, {}, {},
    { text: n0(grand), bold: true, alignment: 'right', fillColor: COLORS.grandFill, color: COLORS.grandText, fontSize: 8 }
  ]);

  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: [24, 20, 24, 42],
    footer,
    content: [
      titleBlock(companyName, 'Transfer Stock - (Date Wise)', dateLine, companyLogo),
      { table: { headerRows: 1, widths: [95, 70, 72, '*', 60], body }, layout }
    ],
    defaultStyle: { font: 'Roboto', fontSize: 8, lineHeight: 1.1 }
  };
}

export const detail = { buildDocDefinition: buildDetail };
export const dateWise = { buildDocDefinition: buildDateWise };

export default { detail, dateWise };
