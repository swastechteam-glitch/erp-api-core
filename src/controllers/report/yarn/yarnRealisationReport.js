// reports/yarn/yarnRealisationReport.js
// Yarn Realisation Reports (rptProcessStock_Print) — three report types, each a
// self-contained pdfmake builder. Mirrors the WinForms radio panel:
//
//   processStock  -> rptProcessStock.rdlc            (ProcessStock, YR, Waste — one month)
//                    3 recordsets: departmentwise process stock + the Yarn
//                    Realisation statement (single row of label/value) + salable
//                    waste details. buildDocDefinition receives a COMPOSITE
//                    { processStock, realisation, saleableWaste }.
//   monthWise     -> rptYarnProcessStockYR.rdlc      (Yarn Realisation — month range)
//                    a Heading x Month pivot + a SUMMARY pivot. Composite
//                    { detail, summary }.
//   wasteAbstract -> rptWasteAbstract_MonthWise.rdlc (Waste Abstract — month range)
//                    a WasteItem x Month pivot (KGs + % per month) with a Total row.
//                    Single recordset (rows).
//
// Company logo/name come from getCompanyInfo in the controller; each title block
// is a { columns:[logo, stack, spacer] } so the shared addLogoToTitles leaves it
// alone.

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
// #0 (integer, thousands separated)
const n0 = (v) => Math.round(Number(v) || 0).toLocaleString('en-IN');
// #0.00 (always two decimals)
const n2 = (v) =>
  Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// up to two decimals, no forced trailing zeros (matrix cells show raw values)
const nRaw = (v) =>
  Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

const ddmmyyyy = (d) => {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${dt.getFullYear()}`;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthName = (m) => MONTHS[(Number(m) || 0) - 1] || String(m ?? '');

const COLORS = {
  headerFill: '#1A3C7B',
  headerText: '#FFFFFF',
  subFill: '#EEF2F7',
  subText: '#1A3C7B',
  zebraFill: '#FAFBFD',
  borderColor: '#C9CFD8',
  gain: '#0B7A2F',
  loss: '#C0392B'
};

const layout = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => COLORS.borderColor,
  vLineColor: () => COLORS.borderColor,
  paddingLeft: () => 4,
  paddingRight: () => 4,
  paddingTop: () => 4,
  paddingBottom: () => 4
};

const footer = (currentPage, pageCount) => ({
  margin: [0, 10, 0, 0],
  columns: [
    { text: 'Report Printed : ' + new Date().toLocaleString('en-GB'), fontSize: 7, margin: [15, 0, 0, 0] },
    { text: `${currentPage} / ${pageCount}`, alignment: 'right', fontSize: 7, margin: [0, 0, 15, 0] }
  ]
});

// columns:[logo, {stack}, spacer] — self-contained title with the company logo.
const titleBlock = (companyName, title, subLine, logoDataUri, pageBreak) => {
  const LOGO_W = 80;
  const logoCol = logoDataUri
    ? { image: logoDataUri, fit: [70, 70], width: LOGO_W, alignment: 'left', margin: [4, 0, 0, 0] }
    : { text: '', width: LOGO_W };
  const stack = [
    { text: companyName, alignment: 'center', fontSize: 14, bold: true, color: '#0033A0', margin: [0, 0, 0, 4] },
    { text: title, alignment: 'center', fontSize: 12, bold: true, color: '#7B3F00' }
  ];
  if (subLine) stack.push({ text: subLine, alignment: 'center', fontSize: 9, bold: true, margin: [0, 3, 0, 0] });
  const node = { columns: [logoCol, { width: '*', stack }, { text: '', width: LOGO_W }], margin: [0, 0, 0, 10] };
  if (pageBreak) node.pageBreak = pageBreak;
  return node;
};

const th = (text, extra = {}) => ({
  text, bold: true, fillColor: COLORS.headerFill, color: COLORS.headerText,
  alignment: 'center', fontSize: 9, ...extra
});

// ===========================================================================
// PROCESS STOCK, YR, WASTE (one month) — rptProcessStock.rdlc
// ===========================================================================
function buildProcessStock(data, companyName, fromDate, toDate, companyLogo) {
  const processStock = Array.isArray(data?.processStock) ? data.processStock : [];
  const realisation = (data?.realisation && data.realisation[0]) || data?.realisation || null;
  const saleableWaste = Array.isArray(data?.saleableWaste) ? data.saleableWaste : [];

  // Header month/year come from the realisation row (SP-derived), else fromDate.
  const fd = new Date(fromDate);
  const mNo = realisation && realisation.MonthNo != null ? Number(realisation.MonthNo) : (fd.getMonth() + 1);
  const yNo = realisation && realisation.YearNo != null ? Number(realisation.YearNo) : fd.getFullYear();
  const monthLine = `YARN REALISATION FOR THE MONTH OF ${(monthName(mNo) || '').toUpperCase()} ${yNo}`;

  // --- DEPARTMENTWISE STOCK ---
  const deptSorted = processStock.slice().sort((a, b) => str(a, 'DepartmentName').localeCompare(str(b, 'DepartmentName')));
  const deptBody = [[th('DEPARTMENTWISE STOCK', { alignment: 'left' }), th('VALUES')]];
  let deptTotal = 0;
  deptSorted.forEach((r, i) => {
    const zebra = i % 2 ? COLORS.zebraFill : null;
    deptBody.push([
      { text: str(r, 'DepartmentName'), fontSize: 9, fillColor: zebra },
      { text: n0(dec(r, 'ProcessStock_Kgs')), alignment: 'center', fontSize: 9, fillColor: zebra }
    ]);
    deptTotal += dec(r, 'ProcessStock_Kgs');
  });
  deptBody.push([
    { text: 'Total', bold: true, alignment: 'right', fillColor: COLORS.subFill, color: COLORS.subText, fontSize: 9 },
    { text: n0(deptTotal), bold: true, alignment: 'center', fillColor: COLORS.subFill, color: COLORS.subText, fontSize: 9 }
  ]);

  // --- YARN REALISATION STATEMENT (label / value) ---
  const stmtBody = [[th('YARN REALISATION STATEMENT', { alignment: 'left' }), th('VALUES')]];
  const line = (label, value, opts = {}) => {
    stmtBody.push([
      { text: label, fontSize: 9, bold: !!opts.bold },
      { text: value, alignment: 'center', fontSize: 9, bold: !!opts.bold, color: opts.color }
    ]);
  };
  // plain kg / % rows (bold ones mirror the RDLC bold "Over All" + % lines)
  line('Opening Stock', n0(dec(realisation, 'OpeningStock')));
  line('Mixing Issues', n0(dec(realisation, 'MixingIssues')));
  line('Closing Stock', n0(dec(realisation, 'ClosingStock')));
  line('Cotton Consumption Carded', n0(dec(realisation, 'CottonConsumption_Carded')));
  line('Cotton Consumption Combed', n0(dec(realisation, 'CottonConsumption_Combed')));
  line('Cotton Consumption Over All', n0(dec(realisation, 'CottonConsumption')), { bold: true });
  line('Packed Production Carded', n0(dec(realisation, 'Carded_YarnKgs')));
  line('Packed Production Combed', n0(dec(realisation, 'Combed_YarnKgs')));
  line('Packed Production Over All', n0(dec(realisation, 'PackedProduction')), { bold: true });
  line('Yarn Realisation Carded %', n2(dec(realisation, 'YarnRealisation_Carded_YR')), { bold: true });
  line('Yarn Realisation Combed %', n2(dec(realisation, 'YarnRealisation_Combed_YR')), { bold: true });
  line('Yarn Realisation Over All %', n2(dec(realisation, 'YarnRealisationPer')), { bold: true });
  line('Waste Kgs - Carded', n0(dec(realisation, 'WasteProduction_Carded')));
  line('Waste Kgs - Combed', n0(dec(realisation, 'ComberNoilsProduction')));
  line('Waste % Carded', n2(dec(realisation, 'WastePer_Carded')));
  line('Waste % Combed', n2(dec(realisation, 'WastePer_Comber')));
  line('Waste Kgs Over All', n0(dec(realisation, 'WasteProduction')), { bold: true });
  line('Waste Over All %', n2(dec(realisation, 'WastePer')), { bold: true });
  line('I.V LOSS Kgs', n0(dec(realisation, 'InvisibleGainKgs')));
  line('Invisible Loss %', n2(dec(realisation, 'InvisbleGainPer')), { bold: true });
  // comparison rows — signed text + gain/loss colour (mirrors the RDLC iif's)
  const cmp = (label, field, opts = {}) => {
    const v = dec(realisation, field);
    const pct = opts.noPct ? '' : '%';
    const text = v < 0 ? `${nRaw(Math.abs(v))}${pct} Decreased` : `${nRaw(v)}${pct} Increased`;
    // YR up (>=0) is good→green; waste/loss up (>=0) is bad→red.
    const good = opts.upIsGood ? v >= 0 : v < 0;
    line(label, text, { bold: true, color: good ? COLORS.gain : COLORS.loss });
  };
  cmp('Yarn Realisation % Comparison', 'PerviousYR', { upIsGood: true });
  cmp('Waste Produced Comparison', 'PerWasteProduction', { noPct: true });
  cmp('Waste % Comparison', 'PerviousWastePer');
  cmp('Invisible Loss % Comparison', 'PerviousIVLoss');

  // --- SALABLE WASTE DETAILS (page 2) ---
  const wasteBody = [[th('SALABLE WASTE DETAILS', { alignment: 'left' }), th('KGS'), th('%')]];
  let wNet = 0, wCon = 0;
  saleableWaste.forEach((r, i) => {
    const zebra = i % 2 ? COLORS.zebraFill : null;
    wasteBody.push([
      { text: str(r, 'WasteItemName'), fontSize: 9, fillColor: zebra },
      { text: n0(dec(r, 'NetWeight')), alignment: 'right', fontSize: 9, fillColor: zebra },
      { text: n2(dec(r, 'CottonConsumption')), alignment: 'right', bold: true, fontSize: 9, fillColor: zebra }
    ]);
    wNet += dec(r, 'NetWeight');
    wCon += dec(r, 'CottonConsumption');
  });
  wasteBody.push([
    { text: 'Total', bold: true, alignment: 'right', fillColor: COLORS.subFill, color: COLORS.subText, fontSize: 9 },
    { text: n0(wNet), bold: true, alignment: 'right', fillColor: COLORS.subFill, color: COLORS.subText, fontSize: 9 },
    { text: n2(wCon), bold: true, alignment: 'right', fillColor: COLORS.subFill, color: COLORS.subText, fontSize: 9 }
  ]);

  const sign = (t) => ({ text: t, alignment: 'center', bold: true, fontSize: 10, margin: [0, 30, 0, 0] });

  return {
    pageSize: 'A4',
    pageMargins: [24, 20, 24, 42],
    footer,
    content: [
      titleBlock(companyName, monthLine, '', companyLogo),
      { table: { headerRows: 1, widths: ['*', 160], body: deptBody }, layout },
      { text: '', margin: [0, 8, 0, 0] },
      { table: { headerRows: 1, widths: ['*', 160], body: stmtBody }, layout },
      // page 2 — salable waste + signatures
      { text: '', pageBreak: 'before', margin: [0, 0, 0, 0] },
      titleBlock(companyName, monthLine, '', companyLogo),
      { table: { headerRows: 1, widths: ['*', 120, 120], body: wasteBody }, layout },
      { columns: [sign('SM'), sign('FM'), sign('GM'), sign('MD')] }
    ],
    defaultStyle: { font: 'Roboto', fontSize: 9, lineHeight: 1.15 }
  };
}

// ===========================================================================
// Generic Heading x (Year,Month) pivot used by the month-wise YR report.
// rows: [{ headingKey, headingLabel, order, y, m, value }]
// ===========================================================================
function pivotByMonth(rows, { headingField, valueField, orderField, monthField, yearField, onlyPositiveOrder }) {
  const cols = new Map();      // "y-m" -> { y, m, label }
  const heads = new Map();     // headingLabel -> { order, cells: Map("y-m"->sum) }
  for (const r of rows) {
    const order = dec(r, orderField);
    if (onlyPositiveOrder && !(order > 0)) continue;
    const y = dec(r, yearField), m = dec(r, monthField);
    const ck = `${y}-${m}`;
    if (!cols.has(ck)) cols.set(ck, { y, m, label: `${monthName(m)} - ${y}` });
    const hLabel = str(r, headingField);
    if (!heads.has(hLabel)) heads.set(hLabel, { order, cells: new Map() });
    const h = heads.get(hLabel);
    h.cells.set(ck, (h.cells.get(ck) || 0) + dec(r, valueField));
  }
  const colList = [...cols.values()].sort((a, b) => (a.y - b.y) || (a.m - b.m));
  const headList = [...heads.entries()]
    .map(([label, v]) => ({ label, order: v.order, cells: v.cells }))
    .sort((a, b) => a.order - b.order);
  return { colList, headList };
}

function buildMonthWise(data, companyName, fromDate, toDate, companyLogo) {
  const detail = Array.isArray(data?.detail) ? data.detail : [];
  const summary = Array.isArray(data?.summary) ? data.summary : [];

  const { colList, headList } = pivotByMonth(detail, {
    headingField: 'Heading', valueField: 'DataValue', orderField: 'OrderNo',
    monthField: 'M', yearField: 'Y', onlyPositiveOrder: true
  });

  const body = [[th('YARN REALISATION', { alignment: 'left' }), ...colList.map((c) => th(c.label))]];
  headList.forEach((h, i) => {
    const zebra = i % 2 ? COLORS.zebraFill : null;
    body.push([
      { text: h.label, fontSize: 9, fillColor: zebra },
      ...colList.map((c) => ({
        text: nRaw(h.cells.get(`${c.y}-${c.m}`) || 0),
        alignment: 'center', fontSize: 9, fillColor: zebra
      }))
    ]);
  });

  // SUMMARY (single-column) — page 2
  const sumRows = summary.slice().sort((a, b) => dec(a, 'OrderNo') - dec(b, 'OrderNo'));
  const sumBody = [[th('YARN REALISATION SUMMARY', { alignment: 'left' }), th('SUMMARY')]];
  sumRows.forEach((r, i) => {
    const zebra = i % 2 ? COLORS.zebraFill : null;
    sumBody.push([
      { text: str(r, 'Heading'), fontSize: 9, fillColor: zebra },
      { text: nRaw(dec(r, 'DataValue')), alignment: 'center', fontSize: 9, fillColor: zebra }
    ]);
  });

  const content = [
    titleBlock(companyName, 'YARN REALISATION REPORT', '', companyLogo),
    { table: { headerRows: 1, widths: [140, ...colList.map(() => '*')], body }, layout }
  ];
  if (sumRows.length) {
    content.push(titleBlock(companyName, 'YARN REALISATION SUMMARY REPORT', '', companyLogo, 'before'));
    content.push({ table: { headerRows: 1, widths: ['*', 160], body: sumBody }, layout });
  }

  return {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [20, 20, 20, 42],
    footer,
    content,
    defaultStyle: { font: 'Roboto', fontSize: 9, lineHeight: 1.15 }
  };
}

// ===========================================================================
// WASTE ABSTRACT (WasteItem x Month, KGs + %) — rptWasteAbstract_MonthWise.rdlc
// ===========================================================================
function buildWasteAbstract(rows, companyName, fromDate, toDate, companyLogo) {
  const data = Array.isArray(rows) ? rows : [];
  const cols = new Map();   // "y-m" -> {y,m,label}
  const items = new Map();  // itemName -> { kgs: Map, con: Map }
  for (const r of data) {
    const y = dec(r, 'YearNo'), m = dec(r, 'MonthNo');
    const ck = `${y}-${m}`;
    if (!cols.has(ck)) cols.set(ck, { y, m, label: `${monthName(m)} - ${y}` });
    const name = str(r, 'WasteItemName');
    if (!items.has(name)) items.set(name, { kgs: new Map(), con: new Map() });
    const it = items.get(name);
    it.kgs.set(ck, (it.kgs.get(ck) || 0) + dec(r, 'NetWeight'));
    it.con.set(ck, (it.con.get(ck) || 0) + dec(r, 'CottonConsumption'));
  }
  const colList = [...cols.values()].sort((a, b) => (a.y - b.y) || (a.m - b.m));
  const itemList = [...items.entries()].map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const first = data[0] || {};
  const rangeLine = `Waste Abstract Form : ${ddmmyyyy(first.FromDate) || ddmmyyyy(fromDate)}   To : ${ddmmyyyy(first.ToDate) || ddmmyyyy(toDate)}`;

  // two-row header: corner "Item Name" (rowSpan 2) + each month (colSpan 2) then KGs/% pairs
  const headRow1 = [{ ...th('Item Name', { alignment: 'left' }), rowSpan: 2 }];
  const headRow2 = [{ text: '', border: [false, false, false, false] }];
  colList.forEach((c) => {
    headRow1.push({ ...th(c.label), colSpan: 2 }, {});
    headRow2.push(th('KGs'), th('%'));
  });
  const body = [headRow1, headRow2];

  const totKgs = new Map(), totCon = new Map();
  itemList.forEach((it, i) => {
    const zebra = i % 2 ? COLORS.zebraFill : null;
    const row = [{ text: it.name, fontSize: 8, fillColor: zebra }];
    colList.forEach((c) => {
      const ck = `${c.y}-${c.m}`;
      const kg = it.kgs.get(ck) || 0, cn = it.con.get(ck) || 0;
      row.push(
        { text: n0(kg), alignment: 'center', fontSize: 8, fillColor: zebra },
        { text: n2(cn), alignment: 'center', fontSize: 8, fillColor: zebra }
      );
      totKgs.set(ck, (totKgs.get(ck) || 0) + kg);
      totCon.set(ck, (totCon.get(ck) || 0) + cn);
    });
    body.push(row);
  });
  // Total row
  const totRow = [{ text: 'Total', bold: true, alignment: 'right', fillColor: COLORS.subFill, color: COLORS.subText, fontSize: 8 }];
  colList.forEach((c) => {
    const ck = `${c.y}-${c.m}`;
    totRow.push(
      { text: n0(totKgs.get(ck) || 0), bold: true, alignment: 'center', fillColor: COLORS.subFill, color: COLORS.subText, fontSize: 8 },
      { text: n2(totCon.get(ck) || 0), bold: true, alignment: 'center', fillColor: COLORS.subFill, color: COLORS.subText, fontSize: 8 }
    );
  });
  body.push(totRow);

  const widths = ['*', ...colList.flatMap(() => [50, 45])];

  return {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [20, 20, 20, 42],
    footer,
    content: [
      titleBlock(companyName, 'WASTE ABSTRACT REPORT', rangeLine, companyLogo),
      { table: { headerRows: 2, widths, body }, layout }
    ],
    defaultStyle: { font: 'Roboto', fontSize: 8, lineHeight: 1.1 }
  };
}

export const processStock = { buildDocDefinition: buildProcessStock };
export const monthWise = { buildDocDefinition: buildMonthWise };
export const wasteAbstract = { buildDocDefinition: buildWasteAbstract };

export default { processStock, monthWise, wasteAbstract };
