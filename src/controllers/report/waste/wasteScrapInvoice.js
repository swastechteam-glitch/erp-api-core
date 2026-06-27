// Scrap Invoice Report (Scrap Sales Report) — Date Wise.
// Port of the WinForms rptWasteScrapInvoice screen +
// rptWasteScrapInvoiceDetails_DateWise_Group_Arun.rdlc. One SP
// (sp_ScrapInvoiceDetails_GetAll) returning item-level rows which we collapse to
// one line per Scrap Invoice (the invoice-level Total* columns are the same on
// every item row of an invoice), list ordered by date + invoice no, with a
// Grand Total. The Customer multi-select narrows the list in memory exactly like
// the VB DataResult.Select("CustomerCode IN (...)").
//
// SP: sp_ScrapInvoiceDetails_GetAll (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy
} from '../cotton/_common.js';

const TITLE = 'SCRAP SALES REPORT';
const FILE_NAME = 'ScrapInvoice_Report';

const csvSet = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const s = new Set(String(v).split(',').map((x) => x.trim()).filter(Boolean));
  return s.size ? s : null;
};

const headRow = (headers) =>
  headers.map((h) => ({
    text: h, bold: true, fillColor: colors.headerFill, color: colors.headerText,
    alignment: 'center', fontSize: 7.5
  }));
const td = (text, align = 'right', zebra = null) =>
  ({ text, alignment: align, fontSize: 7.5, fillColor: zebra });
const totalCell = (text, align = 'right') =>
  ({ text, alignment: align, bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 8 });
const zebraOf = (i) => (i % 2 === 1 ? colors.zebraFill : null);

// Numeric columns shown per invoice (label + the invoice-level Total* field).
const NUM = [
  { key: 'Qty', label: 'Qty', col: 'TotalQty', digits: 0 },
  { key: 'Basic', label: 'Basic Value', col: 'TotalGrossAmount', digits: 2 },
  { key: 'CGST', label: 'CGST', col: 'TotalCGSTAmount', digits: 2 },
  { key: 'SGST', label: 'SGST', col: 'TotalSGSTAmount', digits: 2 },
  { key: 'IGST', label: 'IGST', col: 'TotalIGSTAmount', digits: 2 },
  { key: 'TCS', label: 'TCS', col: 'TotalTCSAmount', digits: 2 },
  { key: 'RoundOff', label: 'R/Off', col: 'TotalRoundOff', digits: 2 },
  { key: 'NetAmount', label: 'Net Amount', col: 'TotalNetAmount', digits: 2 },
];
const NUM_WIDTHS = [40, 64, 52, 52, 52, 48, 38, 62];

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate, query }) {
  const cust = csvSet(query && query.CustomerCodes);
  const src = (rows || []).filter((r) => !cust || cust.has(String(r.CustomerCode)));

  // Collapse item-level rows -> one invoice (Total* are invoice-level).
  const byInv = new Map();
  for (const r of src) {
    const k = str(r, 'ScrapInvoiceCode');
    if (!byInv.has(k)) byInv.set(k, r);
  }
  const invoices = [...byInv.values()].sort((a, b) => {
    const d = new Date(a.ScrapInvoiceDate) - new Date(b.ScrapInvoiceDate);
    return d !== 0 ? d : dec(a, 'ScrapInvoiceNo') - dec(b, 'ScrapInvoiceNo');
  });

  const headers = ['S.No', 'Invoice No', 'Date', 'Customer Name', ...NUM.map((n) => n.label)];
  const widths = [26, 56, 56, '*', ...NUM_WIDTHS];
  const body = [headRow(headers)];

  const grand = {};
  invoices.forEach((inv, i) => {
    const z = zebraOf(i);
    body.push([
      td(String(i + 1), 'center', z),
      td(str(inv, 'strScrapInvoiceNo') || str(inv, 'ScrapInvoiceNo'), 'center', z),
      td(ddmmyyyy(inv.ScrapInvoiceDate), 'center', z),
      td(str(inv, 'CustomerName'), 'left', z),
      ...NUM.map((n) => {
        const v = dec(inv, n.col);
        grand[n.key] = (grand[n.key] || 0) + v;
        return td(fmt(v, n.digits), 'right', z);
      }),
    ]);
  });

  const tables = [];
  if (invoices.length === 0) {
    tables.push({ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] });
  } else {
    body.push([
      { ...totalCell('Grand Total', 'right'), colSpan: 4 }, {}, {}, {},
      ...NUM.map((n) => totalCell(fmt(grand[n.key] || 0, n.digits))),
    ]);
    tables.push({
      table: { headerRows: 1, dontBreakRows: false, keepWithHeaderRows: 1, widths, body },
      layout: tableLayout(),
    });
  }

  return buildPage({ companyName, companyLogo, title: TITLE, fromDate, toDate, tables });
}

export const wasteScrapInvoiceReport = (req, res) => {
  return runReport(req, res, {
    spName: 'sp_ScrapInvoiceDetails_GetAll',
    fileName: FILE_NAME,
    buildDocDefinition,
  });
};
