// Store — Purchase Order DETAILS / print (Document report).
// Given a PurchaseOrderCode (from the purchase-order list), runs the PO SPs and
// renders a Purchase Order PDF modelled on rptPurchaseOrderWithRate.rdlc.
//
//   EXEC web_sp_PurchaseOrder_GetAll        @PurchaseOrderCode  -> header
//   EXEC web_sp_PurchaseOrderDetails_GetAll @PurchaseOrderCode  -> line items
//   (+ BranchCode/CompanyCode applied from headers)

import sql from 'mssql';
import { getPool } from '../../config/dynamicDB.js';
import { applyBranchCode } from '../../utils/common.js';
import { renderPdf, getCompanyInfo, str, dec, fmt, ddmmyyyy } from '../report/cotton/_common.js';

const BORDER = '#9A9A9A';
const HEAD_FILL = '#F2F2F2';
const MAROON = '#800000';
const BLUE = '#0000CC';

function buildDocDefinition(header, items, company) {
  const h = header || {};

  // ---- supplier (To) ----
  const supplierBlock = {
    width: '*',
    stack: [
      { text: 'To :', bold: true, fontSize: 9 },
      { text: str(h, 'SupplierName'), bold: true, fontSize: 9 },
      { text: str(h, 'Address1'), fontSize: 9 },
      { text: [str(h, 'Address2'), str(h, 'City'), str(h, 'PinCode')].filter(Boolean).join('  '), fontSize: 9 },
      { text: str(h, 'GstNo') ? 'GST No: ' + str(h, 'GstNo') : '', fontSize: 9 },
      {
        text: [
          str(h, 'MainMobileNo') ? 'Ph: ' + str(h, 'MainMobileNo') : '',
          str(h, 'MailID') ? 'Mail: ' + str(h, 'MailID') : '',
        ].filter(Boolean).join('   '),
        fontSize: 9,
      },
    ],
  };

  // ---- line items ----
  const head = ['S.No', 'Item Name', 'Qty', 'UOM', 'Rate', 'GST%', 'Disc Amt', 'Amount'].map((t) => ({
    text: t, bold: true, fontSize: 8, alignment: 'center', fillColor: HEAD_FILL,
  }));
  const body = [head];
  let sno = 0;
  items.forEach((r) => {
    sno += 1;
    const gstPct = dec(r, 'CGSTPer') + dec(r, 'SGSTPer') + dec(r, 'IGSTPer');
    const lineAmt = dec(r, 'Amount') - dec(r, 'DiscountAmount');
    const itemName = [str(r, 'ItemName'), str(r, 'CatalogueNo'), str(r, 'DrawingNo')]
      .filter((x) => x && x !== '-').join(' - ');
    body.push([
      { text: String(sno), fontSize: 8, alignment: 'center' },
      { text: itemName, fontSize: 8 },
      { text: fmt(dec(r, 'Qty'), 2), fontSize: 8, alignment: 'right' },
      { text: str(r, 'ItemUomName'), fontSize: 8, alignment: 'center' },
      { text: fmt(dec(r, 'Rate'), 2), fontSize: 8, alignment: 'right' },
      { text: fmt(gstPct, 2) + '%', fontSize: 8, alignment: 'right' },
      { text: fmt(dec(r, 'DiscountAmount'), 2), fontSize: 8, alignment: 'right' },
      { text: fmt(lineAmt, 2), fontSize: 8, alignment: 'right' },
    ]);
  });

  // ---- totals (PO header fields) ----
  const totalsRows = [
    ['Sub Total', dec(h, 'TotalGrossAmount')],
    [`CGST ${fmt(dec(h, 'CGSTPer'), 2)}%`, dec(h, 'TotalCGSTAmount')],
    [`SGST ${fmt(dec(h, 'SGSTPer'), 2)}%`, dec(h, 'TotalSGSTAmount')],
    [`IGST ${fmt(dec(h, 'IGSTPer'), 2)}%`, dec(h, 'TotalIGSTAmount')],
    ['Other Expenses', dec(h, 'TotalOtherExpenses')],
    ['Packing & Forward', dec(h, 'TotalPFAmount')],
    ['Rounded Off', dec(h, 'TotalRoundedOff')],
  ];
  const totalsBody = totalsRows.map(([k, v]) => [
    { text: k, fontSize: 8 },
    { text: fmt(v, 2), fontSize: 8, alignment: 'right' },
  ]);
  totalsBody.push([
    { text: 'Net Amount', bold: true, fontSize: 9, fillColor: HEAD_FILL },
    { text: fmt(dec(h, 'TotalNetAmount'), 2), bold: true, fontSize: 9, alignment: 'right', fillColor: HEAD_FILL },
  ]);

  // ---- terms ----
  const kv = (label, value) => ({
    columns: [
      { width: 110, text: label, bold: true, fontSize: 8 },
      { width: 'auto', text: ':', fontSize: 8 },
      { width: '*', text: ' ' + value, fontSize: 8 },
    ],
    margin: [0, 1, 0, 1],
  });

  return {
    pageSize: 'A4',
    pageMargins: [30, 26, 30, 34],
    footer: (cp, pc) => ({
      margin: [30, 8, 30, 0],
      columns: [
        { text: '*** PLEASE MENTION OUR PURCHASE ORDER NUMBER IN YOUR INVOICE.', fontSize: 7, bold: true },
        { text: `Page ${cp} of ${pc}`, alignment: 'right', fontSize: 7, color: '#555' },
      ],
    }),
    content: [
      // header: logo + company name + PURCHASE ORDER
      {
        columns: [
          company.logo ? { image: company.logo, fit: [55, 55], width: 65 } : { text: '', width: 65 },
          {
            width: '*',
            stack: [
              { text: company.name || '', color: MAROON, bold: true, fontSize: 14, alignment: 'center' },
              { text: 'PURCHASE ORDER', color: BLUE, bold: true, fontSize: 13, alignment: 'center', margin: [0, 2, 0, 0] },
            ],
          },
          { text: '', width: 65 },
        ],
      },
      { canvas: [{ type: 'line', x1: 0, y1: 8, x2: 535, y2: 8, lineWidth: 1 }] },
      // PO No / Date / Ref
      {
        columns: [
          supplierBlock,
          {
            width: 180,
            stack: [
              { text: 'P.O No. : ' + str(h, 'PurchaseOrderNo'), bold: true, color: '#006400', fontSize: 10 },
              { text: 'Date     : ' + ddmmyyyy(h.PurchaseOrderDate), bold: true, color: '#006400', fontSize: 10, margin: [0, 2, 0, 0] },
              { text: str(h, 'RefNo') ? 'Ref No.  : ' + str(h, 'RefNo') : '', fontSize: 9, margin: [0, 2, 0, 0] },
            ],
          },
        ],
        margin: [0, 6, 0, 6],
      },
      { text: 'Dear Sir,', bold: true, fontSize: 9 },
      { text: 'With reference to your quotation we have pleasure in placing your order for supply of the following materials.', fontSize: 8, margin: [0, 2, 0, 6] },
      // items
      {
        table: { headerRows: 1, widths: [24, '*', 50, 36, 55, 36, 55, 65], body },
        layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => BORDER, vLineColor: () => BORDER },
      },
      // totals (right aligned)
      {
        columns: [
          { width: '*', text: '' },
          {
            width: 220,
            table: { widths: ['*', 80], body: totalsBody },
            layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => BORDER, vLineColor: () => BORDER },
            margin: [0, 6, 0, 0],
          },
        ],
      },
      // terms
      {
        columns: [
          { width: '*', stack: [
            kv('Delivery', ddmmyyyy(h.DeliveryDate)),
            kv('Warranty', str(h, 'Warrenty')),
            kv('Mode of Despatch', str(h, 'ModeOfDespatchName')),
            kv('Transporter Name', str(h, 'TransporterName')),
          ] },
          { width: '*', stack: [
            kv('Payment Terms', str(h, 'PurchaseMode')),
            kv('Special Terms', str(h, 'SpecialTerms')),
          ] },
        ],
        margin: [0, 10, 0, 0],
      },
      // signatures
      {
        columns: [
          { text: 'STORES', bold: true, fontSize: 9, alignment: 'center', margin: [0, 40, 0, 0] },
          { text: 'G.M', bold: true, fontSize: 9, alignment: 'center', margin: [0, 40, 0, 0] },
          { text: 'M.D', bold: true, fontSize: 9, alignment: 'center', margin: [0, 40, 0, 0] },
        ],
      },
    ],
    defaultStyle: { font: 'Roboto', fontSize: 9 },
  };
}

export const storePurchaseOrderDetails = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) {
      return res.status(400).type('text/plain').send('Missing subDBName header');
    }

    const PurchaseOrderCode = parseInt(req.query.PurchaseOrderCode) || 0;
    const CompanyCode = parseInt(req.query.CompanyCode) || 0;

    const pool = await getPool(subDbName);

    const r1 = pool.request();
    applyBranchCode(r1, req.headers);
    r1.input('PurchaseOrderCode', sql.Int, PurchaseOrderCode);
    const mainRes = await r1.execute('web_sp_PurchaseOrder_GetAll');

    const r2 = pool.request();
    applyBranchCode(r2, req.headers);
    r2.input('PurchaseOrderCode', sql.Int, PurchaseOrderCode);
    const detailRes = await r2.execute('web_sp_PurchaseOrderDetails_GetAll');

    const items = detailRes.recordset || [];
    // Header: prefer the dedicated header SP, fall back to the first line row
    // (the detail SP repeats PO/supplier/total fields on every row).
    const header = mainRes?.recordsets?.[0]?.[0] || mainRes?.recordset?.[0] || items[0] || {};

    if (req.query.debug === '1') {
      return res.type('text/plain').send(
        `PurchaseOrderCode=${PurchaseOrderCode}\nitems=${items.length}\n\nheader:\n` +
        JSON.stringify(header, null, 2).slice(0, 2000) +
        `\n\nfirst item:\n` + JSON.stringify(items[0] || {}, null, 2)
      );
    }

    // getCompanyInfo returns { name, logo } — enough for the print header.
    // (Address/GSTIN in the PO detail belong to the SUPPLIER, not the buyer
    // company, so we don't surface them as company fields.)
    const company = await getCompanyInfo(pool, CompanyCode);

    const docDef = buildDocDefinition(header, items, company);
    const pdfBuffer = await renderPdf(docDef);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="PurchaseOrder_${PurchaseOrderCode}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('storePurchaseOrderDetails:', err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
};
