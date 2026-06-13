// Yarn — Sales Invoice DETAILS / print (Document report).
// Given an InvoiceCode (from the sales-invoice list), runs the two invoice SPs
// and renders a GST tax-invoice PDF modelled on prnInvoiceGST_Export.rdlc.
//
//   EXEC web_sp_Invoice_GetByInvoiceCode       @InvoiceCode   -> header
//   EXEC web_sp_Invoice_GetByInvoiceCode_Multi @InvoiceCode   -> line items
//   (+ BranchCode/CompanyCode applied from headers)

import sql from 'mssql';
import { getPool } from '../../config/dynamicDB.js';
import { applyBranchCode } from '../../utils/common.js';
import { renderPdf, getCompanyInfo, str, dec, fmt, ddmmyyyy } from '../report/cotton/_common.js';

const BORDER = '#000000';
const HEAD_FILL = '#F2F2F2';

// ---- amount in words (Indian numbering) ----
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function twoDigits(n) {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
}
function threeDigits(n) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return (h ? ONES[h] + ' Hundred' + (r ? ' ' : '') : '') + (r ? twoDigits(r) : '');
}
function numberToWords(num) {
  num = Math.floor(Math.abs(Number(num) || 0));
  if (num === 0) return 'Zero';
  const crore = Math.floor(num / 10000000); num %= 10000000;
  const lakh = Math.floor(num / 100000); num %= 100000;
  const thousand = Math.floor(num / 1000); num %= 1000;
  const hundred = num;
  let parts = [];
  if (crore) parts.push(threeDigits(crore) + ' Crore');
  if (lakh) parts.push(threeDigits(lakh) + ' Lakh');
  if (thousand) parts.push(threeDigits(thousand) + ' Thousand');
  if (hundred) parts.push(threeDigits(hundred));
  return parts.join(' ').trim();
}
function rupeesInWords(amount) {
  const n = Number(amount) || 0;
  const rupees = Math.floor(n);
  const paise = Math.round((n - rupees) * 100);
  let s = 'Rupees ' + numberToWords(rupees);
  if (paise) s += ' and ' + twoDigits(paise) + ' Paise';
  return s + ' Only';
}

function buildDocDefinition(header, items, company) {
  const h = header || {};
  const companyName = str(h, 'CompanyName') || company.name || '';
  const gstin = str(h, 'CompanyGSTINNo') || str(h, 'GSTINNo');
  const addr = [str(h, 'Address1'), str(h, 'Address2'), str(h, 'City')].filter(Boolean).join(', ');

  const billName = str(h, 'CustomerName');
  const billAddr = [str(h, 'CustomerAddress1'), str(h, 'CustomerAddress2'), str(h, 'CustomerCity')].filter(Boolean).join(', ');
  const shipName = str(h, 'DeliveryCustomer') || billName;
  const shipAddr = [str(h, 'DeliveryAddress1'), str(h, 'DeliveryAddress2'), str(h, 'DeliveryCity')].filter(Boolean).join(', ') || billAddr;

  // ---- line items ----
  const itemHead = ['S.No', 'Product Description', 'HSN', 'Weight', 'Rate', 'Taxable Value', 'GST%', 'GST Amt', 'Total'].map((t) => ({
    text: t, bold: true, fontSize: 8, alignment: 'center', fillColor: HEAD_FILL,
  }));
  const body = [itemHead];

  let tWeight = 0, tTaxable = 0, tTax = 0, tTotal = 0;
  items.forEach((r, i) => {
    const weight = dec(r, 'Weight');
    const taxable = dec(r, 'BasicValue') + dec(r, 'InvOtherChargesAmount') + dec(r, 'LoadingChargesAmt') + dec(r, 'Insurance');
    const taxPct = dec(r, 'CGST') + dec(r, 'SGST') + dec(r, 'IGST');
    const taxVal = dec(r, 'CGSTValue') + dec(r, 'SGSTValue') + dec(r, 'IGSTValue');
    const total = taxable + taxVal;
    tWeight += weight; tTaxable += taxable; tTax += taxVal; tTotal += total;

    body.push([
      { text: String(i + 1), fontSize: 8, alignment: 'center' },
      { text: str(r, 'Description') || str(r, 'CountName'), fontSize: 8 },
      { text: str(r, 'HSNCode'), fontSize: 8, alignment: 'center' },
      { text: fmt(weight, 2), fontSize: 8, alignment: 'right' },
      { text: fmt(dec(r, 'Rate'), 2), fontSize: 8, alignment: 'right' },
      { text: fmt(taxable, 2), fontSize: 8, alignment: 'right' },
      { text: fmt(taxPct, 2) + '%', fontSize: 8, alignment: 'right' },
      { text: fmt(taxVal, 2), fontSize: 8, alignment: 'right' },
      { text: fmt(total, 2), fontSize: 8, alignment: 'right' },
    ]);
  });

  const totStyle = { bold: true, fontSize: 8, fillColor: HEAD_FILL };
  body.push([
    { text: 'TOTAL', colSpan: 3, alignment: 'right', ...totStyle }, {}, {},
    { text: fmt(tWeight, 2), alignment: 'right', ...totStyle },
    { text: '', ...totStyle },
    { text: fmt(tTaxable, 2), alignment: 'right', ...totStyle },
    { text: '', ...totStyle },
    { text: fmt(tTax, 2), alignment: 'right', ...totStyle },
    { text: fmt(tTotal, 2), alignment: 'right', ...totStyle },
  ]);

  const netAmount = dec(h, 'NetAmount') || tTotal;

  const partyBox = (title, name, address, extra) => ({
    width: '*',
    margin: [0, 0, 6, 0],
    table: {
      widths: ['*'],
      body: [
        [{ text: title, bold: true, fontSize: 8, alignment: 'center', fillColor: HEAD_FILL }],
        [{ text: [{ text: 'NAME : ', bold: true }, { text: name }], fontSize: 8, margin: [0, 2, 0, 2] }],
        [{ text: [{ text: 'ADDRESS : ', bold: true }, { text: address }], fontSize: 8, margin: [0, 0, 0, 2] }],
        [{ text: extra, fontSize: 8, margin: [0, 0, 0, 2] }],
      ],
    },
    layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => BORDER, vLineColor: () => BORDER },
  });

  return {
    pageSize: 'A4',
    pageMargins: [28, 24, 28, 36],
    footer: (cp, pc) => ({
      margin: [28, 8, 28, 0],
      columns: [
        { text: 'Certified that particulars given above are true and correct', fontSize: 7, italics: true },
        { text: `${cp}/${pc}`, alignment: 'right', fontSize: 7 },
      ],
    }),
    content: [
      // ---- company / title header ----
      {
        table: {
          widths: ['*'],
          body: [
            [{ text: companyName, bold: true, fontSize: 14, alignment: 'center' }],
            [{ text: addr, fontSize: 8, alignment: 'center' }],
            [{ text: gstin ? 'GSTIN : ' + gstin : '', bold: true, fontSize: 10, alignment: 'center' }],
            [{ text: 'EXPORT TAX INVOICE', bold: true, fontSize: 13, alignment: 'center', fillColor: HEAD_FILL }],
          ],
        },
        layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => BORDER, vLineColor: () => BORDER },
        margin: [0, 0, 0, 6],
      },
      // ---- invoice meta ----
      {
        columns: [
          { width: '*', text: [{ text: 'Invoice No : ', bold: true }, { text: str(h, 'strBillNo') || str(h, 'strInvoiceNo') || str(h, 'BillNo') }], fontSize: 9 },
          { width: '*', text: [{ text: 'Invoice Date : ', bold: true }, { text: ddmmyyyy(h.BillDate || h.InvoiceDate) }], fontSize: 9 },
          { width: '*', text: [{ text: 'Place of Supply : ', bold: true }, { text: str(h, 'PlaceofSupply') }], fontSize: 9 },
        ],
        margin: [0, 0, 0, 6],
      },
      // ---- bill to / ship to ----
      {
        columns: [
          partyBox('BILL TO PARTY', billName, billAddr, 'GSTIN : ' + (str(h, 'CustomerGSTINNo') || '')),
          partyBox('SHIP TO PARTY', shipName, shipAddr, 'GSTIN : ' + (str(h, 'DeliveryGSTINNo') || str(h, 'CustomerGSTINNo') || '')),
        ],
        margin: [0, 0, 0, 6],
      },
      // ---- items ----
      {
        table: { headerRows: 1, widths: [22, '*', 45, 45, 45, 60, 32, 50, 55], body },
        layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => BORDER, vLineColor: () => BORDER },
      },
      // ---- totals + words ----
      {
        columns: [
          { width: '*', stack: [
            { text: 'Total Invoice Amount in Words :', bold: true, fontSize: 9, margin: [0, 8, 0, 2] },
            { text: rupeesInWords(netAmount), fontSize: 9 },
          ] },
          { width: 200, table: {
            widths: ['*', 70],
            body: [
              [{ text: 'Taxable Amount', fontSize: 8, bold: true }, { text: fmt(tTaxable, 2), fontSize: 8, alignment: 'right' }],
              [{ text: 'Total Tax', fontSize: 8, bold: true }, { text: fmt(tTax, 2), fontSize: 8, alignment: 'right' }],
              [{ text: 'NET AMOUNT', fontSize: 9, bold: true, fillColor: HEAD_FILL }, { text: fmt(netAmount, 2), fontSize: 9, bold: true, alignment: 'right', fillColor: HEAD_FILL }],
            ],
          }, layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => BORDER, vLineColor: () => BORDER }, margin: [0, 8, 0, 0] },
        ],
      },
      // ---- bank + signature ----
      {
        columns: [
          { width: '*', stack: [
            { text: 'BANK DETAILS', bold: true, fontSize: 8, margin: [0, 14, 0, 2] },
            { text: 'Bank A/C : ' + str(h, 'CompanyBankACNo'), fontSize: 8 },
            { text: 'Bank IFSC : ' + str(h, 'CompanyBankIFSCCode'), fontSize: 8 },
            { text: 'Bank : ' + str(h, 'CompanyBankName'), fontSize: 8 },
          ] },
          { width: 200, stack: [
            { text: 'For ' + companyName, bold: true, fontSize: 9, alignment: 'center', margin: [0, 14, 0, 36] },
            { text: 'Authorised Signatory', fontSize: 8, alignment: 'center' },
          ] },
        ],
      },
    ],
    defaultStyle: { font: 'Roboto', fontSize: 9 },
  };
}

export const yarnSalesInvoiceDetails = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) {
      return res.status(400).type('text/plain').send('Missing subDBName header');
    }

    const InvoiceCode = parseInt(req.query.InvoiceCode) || 0;
    const CompanyCode = parseInt(req.query.CompanyCode) || 0;

    const pool = await getPool(subDbName);

    const r1 = pool.request();
    applyBranchCode(r1, req.headers);
    r1.input('InvoiceCode', sql.Int, InvoiceCode);
    const mainRes = await r1.execute('web_sp_Invoice_GetByInvoiceCode');

    const r2 = pool.request();
    applyBranchCode(r2, req.headers);
    r2.input('InvoiceCode', sql.Int, InvoiceCode);
    const multiRes = await r2.execute('web_sp_Invoice_GetByInvoiceCode_Multi');

    const header = mainRes?.recordsets?.[0]?.[0] || mainRes?.recordset?.[0] || {};
    const items = multiRes.recordset || [];

    if (req.query.debug === '1') {
      return res.type('text/plain').send(
        `InvoiceCode=${InvoiceCode}\nitems=${items.length}\n\nheader:\n` +
        JSON.stringify(header, null, 2).slice(0, 2000) +
        `\n\nfirst item:\n` + JSON.stringify(items[0] || {}, null, 2)
      );
    }

    const company = await getCompanyInfo(pool, CompanyCode);
    const docDef = buildDocDefinition(header, items, company);
    const pdfBuffer = await renderPdf(docDef);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="YarnSalesInvoice_${InvoiceCode}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('yarnSalesInvoiceDetails:', err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
};
