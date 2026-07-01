// reports/yarn/salesDayBookDetailsReport.js
// Sales DayBook Report (rptSalesDayBookDetails). A single report (no radios) +
// Company + Customer (multi) + Sales Type filters. Renders TWO RDLC tables:
//   • Invoice Details (sp_SalesDayBook) — grouped by InvoiceDate, one detail row
//     per invoice line, a per-date subtotal, and a grand total.
//   • Yarn Stock And Sales Order (sp_YarnStockAndSalesOrder) — a count-wise
//     stock/sales-order summary with totals.
// buildDocDefinition receives { daybook, stock }.
//
// Customer & Sales Type are applied as post-SP row filters (the VB does
// DataResult.Select("CustomerCode IN (..)") and "SalesType IN ('..')").

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
const amt = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
// Null-excluding mean — mirrors the RDLC AVG(Fields!Rate.Value).
const avg = (rows, col) => {
  let s = 0, c = 0;
  for (const r of rows) {
    const v = r ? r[col] : null;
    if (v === null || v === undefined || v === '') continue;
    const n = Number(v);
    if (!isNaN(n)) { s += n; c += 1; }
  }
  return c ? s / c : 0;
};

const COLORS = {
  headerFill: '#1A3C7B',
  headerText: '#FFFFFF',
  dateFill: '#E8F0FE',
  dateText: '#1A3C7B',
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
  paddingLeft: () => 2,
  paddingRight: () => 2,
  paddingTop: () => 2,
  paddingBottom: () => 2
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

const th = (text, align = 'center') => ({ text, bold: true, fillColor: COLORS.headerFill, color: COLORS.headerText, alignment: align, fontSize: 7.5 });
const sectionHead = (text) => ({ text, bold: true, fontSize: 11, color: COLORS.sectionText, margin: [0, 8, 0, 4] });

function buildReport(data, companyName, fromDate, toDate, companyLogo) {
  const daybook = Array.isArray(data?.daybook) ? data.daybook : [];
  const stock = Array.isArray(data?.stock) ? data.stock : [];
  const dateLine = `From Date : ${ddmmyyyy(fromDate)}          To Date : ${ddmmyyyy(toDate)}`;
  const content = [titleBlock(companyName, 'Sales DayBook', dateLine, companyLogo)];

  // ---------------- Invoice Details (sp_SalesDayBook) --------------------
  const IH = ['S.No', 'Inv No', 'Inv Date', 'Customer Name', 'Sales Type', 'Item', 'Qty', 'Weight', 'Rate', 'Basic Amt', 'Tax', 'Load Chg', 'TCS %', 'TCS Amt', 'RND', 'Net Amount'];
  const iAlign = (i) => (i === 3 || i === 4 || i === 5 ? 'left' : i >= 6 ? 'right' : 'center');
  const iBody = [IH.map((h, i) => th(h, iAlign(i)))];

  // Group by InvoiceDate (ascending), keeping insertion order within a day.
  const groups = new Map();
  for (const r of daybook.slice().sort((a, b) => isoDate(a.InvoiceDate).localeCompare(isoDate(b.InvoiceDate)))) {
    const k = isoDate(r.InvoiceDate);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }

  const gtotal = { qty: 0, wt: 0, basic: 0, tcs: 0, rnd: 0, net: 0 };
  for (const [, g] of groups) {
    let sub = { qty: 0, wt: 0, basic: 0, tcs: 0, rnd: 0, net: 0 };
    g.forEach((r, i) => {
      const zebra = i % 2 ? COLORS.zebraFill : null;
      const c = (t, al) => ({ text: t, alignment: al, fontSize: 7, fillColor: zebra });
      iBody.push([
        c(String(i + 1), 'center'),
        c(str(r, 'InvoiceNo'), 'center'),
        c(ddmmyyyy(r.InvoiceDate), 'center'),
        c(str(r, 'CustomerName'), 'left'),
        c(str(r, 'SalesType'), 'left'),
        c(str(r, 'CountType'), 'left'),
        c(n0(dec(r, 'Qty')), 'right'),
        c(amt(dec(r, 'Weight')), 'right'),
        c(amt(dec(r, 'Rate')), 'right'),
        c(amt(dec(r, 'Basic')), 'right'),
        c(str(r, 'Tax'), 'right'),
        c(amt(dec(r, 'LoadingCharges')), 'right'),
        c(amt(dec(r, 'TCSPer')), 'right'),
        c(amt(dec(r, 'TCSAmt')), 'right'),
        c(amt(dec(r, 'RoundOff')), 'right'),
        c(amt(dec(r, 'NetAmount')), 'right'),
      ]);
      sub.qty += dec(r, 'Qty'); sub.wt += dec(r, 'Weight'); sub.basic += dec(r, 'Basic');
      sub.tcs += dec(r, 'TCSAmt'); sub.rnd += dec(r, 'RoundOff'); sub.net += dec(r, 'NetAmount');
    });
    gtotal.qty += sub.qty; gtotal.wt += sub.wt; gtotal.basic += sub.basic;
    gtotal.tcs += sub.tcs; gtotal.rnd += sub.rnd; gtotal.net += sub.net;
    const sc = (t) => ({ text: t, bold: true, alignment: 'right', fillColor: COLORS.subFill, color: COLORS.subText, fontSize: 7 });
    const sblank = { text: '', fillColor: COLORS.subFill };
    iBody.push([
      { text: 'Total', colSpan: 6, bold: true, alignment: 'right', fillColor: COLORS.subFill, color: COLORS.subText, fontSize: 7 }, {}, {}, {}, {}, {},
      sc(n0(sub.qty)), sc(amt(sub.wt)), sc(amt(avg(g, 'Rate'))), sc(amt(sub.basic)), sblank, sblank, sblank, sc(amt(sub.tcs)), sc(amt(sub.rnd)), sc(amt(sub.net))
    ]);
  }
  const gc = (t) => ({ text: t, bold: true, alignment: 'right', fillColor: COLORS.grandFill, color: COLORS.grandText, fontSize: 7.5 });
  const gblank = { text: '', fillColor: COLORS.grandFill };
  iBody.push([
    { text: 'Grand Total', colSpan: 6, bold: true, alignment: 'right', fillColor: COLORS.grandFill, color: COLORS.grandText, fontSize: 7.5 }, {}, {}, {}, {}, {},
    gc(n0(gtotal.qty)), gc(amt(gtotal.wt)), gc(amt(avg(daybook, 'Rate'))), gc(amt(gtotal.basic)), gblank, gblank, gblank, gc(amt(gtotal.tcs)), gc(amt(gtotal.rnd)), gc(amt(gtotal.net))
  ]);

  content.push(sectionHead('Invoice Details'));
  content.push({
    table: { headerRows: 1, widths: [22, 34, 50, '*', 52, 55, 28, 46, 40, 56, 38, 44, 32, 44, 32, 56], body: iBody },
    layout
  });

  // ---------------- Yarn Stock And Sales Order (sp_YarnStockAndSalesOrder) --
  if (stock.length) {
    const SH = ['S.No', 'Count Name', 'Sales Order Qty', 'Inv Qty', 'SO Pending Qty', 'Live Stock', 'Need Qty', 'Excess Qty'];
    const sBody = [SH.map((h, i) => th(h, i === 1 ? 'left' : 'center'))];
    const t = { so: 0, inv: 0, pend: 0, live: 0, need: 0, excess: 0 };
    stock.forEach((r, i) => {
      const zebra = i % 2 ? COLORS.zebraFill : null;
      const c = (v, al) => ({ text: v, alignment: al, fontSize: 8, fillColor: zebra });
      const need = Math.max(dec(r, 'NeedQty'), 0);       // iif(NeedQty>0, NeedQty, 0)
      const excess = Math.abs(dec(r, 'ExcessQty'));      // iif(ExcessQty>=0, ExcessQty, -ExcessQty)
      sBody.push([
        c(String(i + 1), 'center'),
        c(str(r, 'CountType'), 'left'),
        c(n0(dec(r, 'SOQty')), 'right'),
        c(n0(dec(r, 'InvQty')), 'right'),
        c(n0(dec(r, 'SOPendQty')), 'right'),
        c(n0(dec(r, 'LiveQty')), 'right'),
        c(n0(need), 'right'),
        c(n0(excess), 'right'),
      ]);
      t.so += dec(r, 'SOQty'); t.inv += dec(r, 'InvQty'); t.pend += dec(r, 'SOPendQty');
      t.live += dec(r, 'LiveQty'); t.need += dec(r, 'NeedQty'); t.excess += dec(r, 'ExcessQty');
    });
    const fc = (v) => ({ text: v, bold: true, alignment: 'right', fillColor: COLORS.grandFill, color: COLORS.grandText, fontSize: 8 });
    sBody.push([
      { text: 'Total', colSpan: 2, bold: true, alignment: 'right', fillColor: COLORS.grandFill, color: COLORS.grandText, fontSize: 8 }, {},
      fc(n0(t.so)), fc(n0(t.inv)), fc(n0(t.pend)), fc(n0(t.live)),
      fc(n0(Math.max(t.need, 0))), fc(n0(Math.abs(t.excess)))
    ]);
    content.push(sectionHead('Yarn Stock And Sales Order'));
    content.push({ table: { headerRows: 1, widths: [40, '*', 90, 80, 95, 85, 85, 85], body: sBody }, layout });
  }

  return {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [18, 18, 18, 42],
    footer,
    content,
    defaultStyle: { font: 'Roboto', fontSize: 7.5, lineHeight: 1.1 }
  };
}

export const report = { buildDocDefinition: buildReport };

export default { report };
