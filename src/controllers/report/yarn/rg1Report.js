// reports/yarn/rg1Report.js
// Yarn RG-1 Report (rptYarnRG1). Two report types + Company + a single Count
// filter (the VB passes @CountTypeCode straight to the SP):
//   dateWise  -> rptYarn_RG1.rdlc            (sp_Yarn_RG1) — flat daily register:
//                one row per RG1 date with Opening/Production/Purchase/Sales/
//                Closing (Bags + Kgs) + Lose Cones.
//   countWise -> rptYarn_RG1_CountWise.rdlc  (COMPOSITE of 3 SPs):
//                sp_Yarn_RG1_Count_WithoutDate (per-count packing register)
//                + sp_WasteStockStatus (waste stock) + sp_Cotton_Stock (cotton
//                stock, rendered compact by raw material).
//                buildDocDefinition receives { yarn, cotton, waste }.

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
  sectionText: '#7B3F00',
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

const th = (text, extra = {}) => ({ text, bold: true, fillColor: COLORS.headerFill, color: COLORS.headerText, alignment: 'center', fontSize: 8, ...extra });
const sectionHead = (text) => ({ text, bold: true, fontSize: 11, color: COLORS.sectionText, margin: [0, 8, 0, 4] });

// ===========================================================================
// DATE WISE — sp_Yarn_RG1 → rptYarn_RG1.rdlc
// ===========================================================================
function buildDateWise(rows, companyName, fromDate, toDate, companyLogo) {
  const dateLine = `From Date : ${ddmmyyyy(fromDate)}    To Date : ${ddmmyyyy(toDate)}`;
  // two-row grouped header (Opening/Production/Purchase/Sales/Closing span Bags+Kgs)
  const head1 = [
    { ...th('Date'), rowSpan: 2 },
    { ...th('Opening'), colSpan: 2 }, {},
    { ...th('Production'), colSpan: 2 }, {},
    { ...th('Purchase'), colSpan: 2 }, {},
    { ...th('Sales'), colSpan: 2 }, {},
    { ...th('Closing'), colSpan: 2 }, {},
    { ...th('Lose Cones'), rowSpan: 2 },
    { ...th('Lose Cone Kgs'), rowSpan: 2 },
  ];
  const head2 = [{}, th('Bags'), th('Kgs'), th('Bags'), th('Kgs'), th('Bags'), th('Kgs'), th('Bags'), th('Kgs'), th('Bags'), th('Kgs'), {}, {}];
  const body = [head1, head2];

  const sorted = rows.slice().sort((a, b) => isoDate(a.YarnRG1Date).localeCompare(isoDate(b.YarnRG1Date)));
  const tot = { pb: 0, pk: 0, ub: 0, uk: 0, sb: 0, sk: 0 };
  sorted.forEach((r, i) => {
    const zebra = i % 2 ? COLORS.zebraFill : null;
    const c = (t, al = 'right') => ({ text: t, alignment: al, fontSize: 8, fillColor: zebra });
    body.push([
      c(ddmmyyyy(r.YarnRG1Date), 'center'),
      c(n0(dec(r, 'OpeningBags'))), c(kg(dec(r, 'OpeningKgs'))),
      c(n0(dec(r, 'ProductionBags'))), c(kg(dec(r, 'ProductionKgs'))),
      c(n0(dec(r, 'PurchaseBags'))), c(kg(dec(r, 'PurchaseKgs'))),
      c(n0(dec(r, 'SalesBags'))), c(kg(dec(r, 'SalesKgs'))),
      c(n0(dec(r, 'ClosingBags'))), c(kg(dec(r, 'ClosingKgs'))),
      c(n0(dec(r, 'LoseConeCount'))), c(kg(dec(r, 'LoseConeKgs'))),
    ]);
    tot.pb += dec(r, 'ProductionBags'); tot.pk += dec(r, 'ProductionKgs');
    tot.ub += dec(r, 'PurchaseBags'); tot.uk += dec(r, 'PurchaseKgs');
    tot.sb += dec(r, 'SalesBags'); tot.sk += dec(r, 'SalesKgs');
  });
  const tc = (t) => ({ text: t, bold: true, alignment: 'right', fillColor: COLORS.grandFill, color: COLORS.grandText, fontSize: 8 });
  const blank = { text: '', fillColor: COLORS.grandFill };
  // Only flow columns (Production/Purchase/Sales) are totalled — matches the RDLC.
  body.push([
    { text: 'Total', bold: true, alignment: 'right', fillColor: COLORS.grandFill, color: COLORS.grandText, fontSize: 8 },
    blank, blank, tc(n0(tot.pb)), tc(kg(tot.pk)), tc(n0(tot.ub)), tc(kg(tot.uk)), tc(n0(tot.sb)), tc(kg(tot.sk)), blank, blank, blank, blank
  ]);

  return {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [18, 18, 18, 42],
    footer,
    content: [
      titleBlock(companyName, 'Yarn RG-1', dateLine, companyLogo),
      { table: { headerRows: 2, widths: [60, 40, 52, 40, 52, 40, 52, 40, 52, 40, 52, 45, 52], body }, layout }
    ],
    defaultStyle: { font: 'Roboto', fontSize: 8, lineHeight: 1.1 }
  };
}

// ===========================================================================
// COUNT WISE — composite of 3 SPs → rptYarn_RG1_CountWise.rdlc
// ===========================================================================
function groupBy(rows, keyFn) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}

function buildCountWise(data, companyName, fromDate, toDate, companyLogo) {
  const yarn = Array.isArray(data?.yarn) ? data.yarn : [];
  const cotton = Array.isArray(data?.cotton) ? data.cotton : [];
  const waste = Array.isArray(data?.waste) ? data.waste : [];
  const dateLine = `From Date : ${ddmmyyyy(fromDate)}    To Date : ${ddmmyyyy(toDate)}`;
  const content = [titleBlock(companyName, 'Yarn RG-1 (Count Wise)', dateLine, companyLogo)];

  // --- Table A: Yarn RG1 count-wise packing register ---
  const YH = ['Count', 'Op Cones', 'Op Bags', 'Prod Cones', 'Prod Bags', 'Prod Kgs', 'Todt Kgs', 'Upto Bag Kgs', '40s Todt', '40s Updt', 'Sales Bags', 'Return Bags', 'Lose Cones', 'Closing Bags'];
  const yBody = [YH.map((h, i) => th(h, { alignment: i === 0 ? 'left' : 'center' }))];
  const yGroups = groupBy(yarn, (r) => str(r, 'CountTypeCode') || str(r, 'CountType'));
  const yt = Array(13).fill(0);
  let yi = 0;
  for (const [, g] of yGroups) {
    const f = g[0];
    const sum = (c) => g.reduce((a, r) => a + dec(r, c), 0);
    const last = (c) => dec(g[g.length - 1], c);
    const maxv = (c) => g.reduce((a, r) => Math.max(a, dec(r, c)), 0);
    const vals = [
      dec(f, 'OpeningCones'), dec(f, 'OpeningBags'), sum('ProductionCones'), sum('ProductionBags'), sum('ProductionKgs'),
      maxv('UptoDateKgs'), maxv('UptoDateBagKgs'), sum('Conversion40sConeKG'), maxv('Conversion40sUpToKgs'),
      sum('SalesBags'), sum('ReturnBags'), last('LoseConeCount'), last('ClosingBags'),
    ];
    const zebra = yi % 2 ? COLORS.zebraFill : null; yi += 1;
    yBody.push([
      { text: str(f, 'ShortName') || str(f, 'CountType'), fontSize: 8, fillColor: zebra },
      ...vals.map((v, i) => ({ text: (i === 4 || i === 5 || i === 6 || i === 8) ? kg(v) : n0(v), alignment: 'right', fontSize: 8, fillColor: zebra }))
    ]);
    vals.forEach((v, i) => { yt[i] += v; });
  }
  yBody.push([
    { text: 'Total', bold: true, alignment: 'right', fillColor: COLORS.grandFill, color: COLORS.grandText, fontSize: 8 },
    ...yt.map((v, i) => ({ text: (i === 4 || i === 5 || i === 6 || i === 8) ? kg(v) : n0(v), bold: true, alignment: 'right', fillColor: COLORS.grandFill, color: COLORS.grandText, fontSize: 8 }))
  ]);
  content.push(sectionHead('Packing'));
  content.push({ table: { headerRows: 1, widths: ['*', 45, 45, 48, 48, 55, 55, 60, 48, 48, 48, 48, 45, 50], body: yBody }, layout });

  // --- Table B: Waste Stock (grouped by Waste Item Group) ---
  if (waste.length) {
    const WH = ['S.No', 'Item Name', 'Op Qty', 'Op Wt', 'Pro Qty', 'Pro Wt', 'Sal Qty', 'Sal Wt', 'Cl Qty', 'Cl Wt'];
    const wBody = [WH.map((h, i) => th(h, { alignment: i === 1 ? 'left' : 'center' }))];
    const wGroups = groupBy(waste, (r) => str(r, 'WasteItemGroupCode') + '||' + str(r, 'WasteItemGroupName'));
    let sno = 0;
    const gt = Array(8).fill(0);
    for (const [, g] of wGroups) {
      wBody.push([{ text: str(g[0], 'WasteItemGroupName'), colSpan: 10, bold: true, color: COLORS.groupText, fillColor: COLORS.groupFill, margin: [2, 1, 0, 1] }, {}, {}, {}, {}, {}, {}, {}, {}, {}]);
      const st = Array(8).fill(0);
      for (const r of g) {
        sno += 1;
        const cols = [dec(r, 'OpQty'), dec(r, 'OpWeight'), dec(r, 'ProQty'), dec(r, 'ProWeight'), dec(r, 'SalQty'), dec(r, 'SalWeight'), dec(r, 'ClQty'), dec(r, 'ClWeight')];
        wBody.push([
          { text: String(sno), alignment: 'center', fontSize: 8 },
          { text: str(r, 'WasteItemName'), fontSize: 8 },
          ...cols.map((v, i) => ({ text: i % 2 ? kg(v) : n0(v), alignment: 'right', fontSize: 8 }))
        ]);
        cols.forEach((v, i) => { st[i] += v; gt[i] += v; });
      }
      wBody.push([
        { text: str(g[0], 'WasteItemGroupName') + ' - Total', colSpan: 2, bold: true, alignment: 'right', fillColor: COLORS.subFill, color: COLORS.subText, fontSize: 8 }, {},
        ...st.map((v, i) => ({ text: i % 2 ? kg(v) : n0(v), bold: true, alignment: 'right', fillColor: COLORS.subFill, color: COLORS.subText, fontSize: 8 }))
      ]);
    }
    wBody.push([
      { text: 'Grand Total', colSpan: 2, bold: true, alignment: 'right', fillColor: COLORS.grandFill, color: COLORS.grandText, fontSize: 8 }, {},
      ...gt.map((v, i) => ({ text: i % 2 ? kg(v) : n0(v), bold: true, alignment: 'right', fillColor: COLORS.grandFill, color: COLORS.grandText, fontSize: 8 }))
    ]);
    content.push(sectionHead('Waste Stock Report'));
    content.push({ table: { headerRows: 1, widths: [32, '*', 45, 55, 45, 55, 45, 55, 45, 55], body: wBody }, layout });
  }

  // --- Table C: Cotton Stock (compact, by Raw Material) ---
  if (cotton.length) {
    const CH = ['Variety', 'Op Bales', 'Op Kgs', 'Rcpt Bales', 'Rcpt Kgs', 'Issue Bales', 'Issue Kgs', 'Sales Bales', 'Sales Kgs', 'Cl Bales', 'Cl Kgs'];
    const cBody = [CH.map((h, i) => th(h, { alignment: i === 0 ? 'left' : 'center' }))];
    const cGroups = groupBy(cotton, (r) => str(r, 'RawMaterialCode') + '||' + str(r, 'RawMaterialName'));
    const gt = Array(10).fill(0);
    let ci = 0;
    for (const [, g] of cGroups) {
      const sum = (c) => g.reduce((a, r) => a + dec(r, c), 0);
      const cols = [sum('OpBales'), sum('OPKgs'), sum('ReceiptBales'), sum('ReceiptKgs'), sum('IssueBales'), sum('IssueKgs'), sum('SalesBales'), sum('SalesKgs'), sum('ClosingBales'), sum('ClosingKgs')];
      const zebra = ci % 2 ? COLORS.zebraFill : null; ci += 1;
      cBody.push([
        { text: str(g[0], 'RawMaterialName'), fontSize: 8, fillColor: zebra },
        ...cols.map((v, i) => ({ text: i % 2 ? kg(v) : n0(v), alignment: 'right', fontSize: 8, fillColor: zebra }))
      ]);
      cols.forEach((v, i) => { gt[i] += v; });
    }
    cBody.push([
      { text: 'Total', bold: true, alignment: 'right', fillColor: COLORS.grandFill, color: COLORS.grandText, fontSize: 8 },
      ...gt.map((v, i) => ({ text: i % 2 ? kg(v) : n0(v), bold: true, alignment: 'right', fillColor: COLORS.grandFill, color: COLORS.grandText, fontSize: 8 }))
    ]);
    content.push(sectionHead('Cotton Stock Report'));
    content.push({ table: { headerRows: 1, widths: ['*', 48, 60, 48, 60, 48, 60, 48, 60, 48, 60], body: cBody }, layout });
  }

  return {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [18, 18, 18, 42],
    footer,
    content,
    defaultStyle: { font: 'Roboto', fontSize: 8, lineHeight: 1.1 }
  };
}

export const dateWise = { buildDocDefinition: buildDateWise };
export const countWise = { buildDocDefinition: buildCountWise };

export default { dateWise, countWise };
