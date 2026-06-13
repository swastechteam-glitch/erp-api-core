// Cotton — Purchase Order Print DETAILS (Document report).
// Given a CPOCode (from the po-print list), runs sp_CottonPurchaseOrderDetails_GetAll
// and renders a single-PO print PDF mirroring rptCottonPurchaseOrderPrint.rdlc.
//
//   EXEC sp_CottonPurchaseOrderDetails_GetAll @CPOCode = <CPOCode>
//
// The SP returns one row per cotton-quality parameter, with the PO header
// fields repeated on every row — we take the header from the first row and
// list the quality parameters in the right-hand table.

import sql from 'mssql';
import { getPool } from '../../config/dynamicDB.js';
import { renderPdf, getCompanyInfo, str, dec, fmt, ddmmyyyy } from '../report/cotton/_common.js';

const MAROON = '#800000';
const BLUE = '#0000CC';
const HEADER_FILL = '#F2F2F2';

const PAY_MODE = { 0: 'IMMEDIATE', 1: 'CREDIT', 2: 'ADVANCE PAYMENT' };

// Build a "value unit" string only when the numeric part is non-zero (matches
// the RDLC `iif(val(x)<>0, x & " " & unit, "")` cells).
const valUnit = (row, numCol, unitCol) =>
  dec(row, numCol) !== 0 ? `${fmt(dec(row, numCol), 2)} ${str(row, unitCol)}`.trim() : '';

function buildDocDefinition(rows, company) {
  const r = rows[0] || {};

  const payType = dec(r, 'PaymentType') === 0 ? 'SPOT' : 'FMD';
  const payMode = PAY_MODE[dec(r, 'PayMode')] || '';
  const optNum = (col) => (dec(r, col) ? String(dec(r, col)) : '');

  // ---- left: PO detail key/value table ----
  const detailRows = [
    ['Supplier', str(r, 'SupplierName')],
    ['Agent', str(r, 'AgentName')],
    ['Station', str(r, 'StationName')],
    ['State', str(r, 'StateName')],
    ['Variety', str(r, 'RawMaterialName')],
    ['Pay Type', payType],
    ['Pay Mode', payMode],
    ['Payment Days', optNum('PaymentDays')],
    ['Delivery Days', optNum('DeliveryDays')],
    ['No of Bales', fmt(dec(r, 'Qty'), 0)],
    ['Rate', fmt(dec(r, 'Rate'), 0)],
  ];
  const detailTable = {
    table: {
      widths: [78, 6, '*'],
      body: detailRows.map(([k, v]) => [
        { text: k, fontSize: 9 },
        { text: ':', fontSize: 9 },
        { text: v, fontSize: 9, bold: true },
      ]),
    },
    layout: 'noBorders',
  };

  // ---- right: cotton quality details table ----
  const qrows = rows
    .filter((x) => dec(x, 'FromParameter') + dec(x, 'ToParameter') !== 0)
    .sort((a, b) => dec(a, 'OrderNo') - dec(b, 'OrderNo'));

  const qHead = ['Parameter Name', 'STD From', 'STD To', 'Party From', 'Party To'].map((t) => ({
    text: t, bold: true, fontSize: 8, alignment: 'center', fillColor: HEADER_FILL,
  }));
  const qBody = [qHead];
  if (qrows.length === 0) {
    qBody.push([{ text: 'No quality details', colSpan: 5, alignment: 'center', fontSize: 8, color: '#888' }, {}, {}, {}, {}]);
  } else {
    for (const q of qrows) {
      qBody.push([
        { text: str(q, 'CQTParameterName'), fontSize: 8 },
        { text: valUnit(q, 'FromParameter', 'From1'), fontSize: 8, alignment: 'center' },
        { text: valUnit(q, 'ToParameter', 'To1'), fontSize: 8, alignment: 'center' },
        { text: valUnit(q, 'PartyFrom', 'PartyFrom1'), fontSize: 8, alignment: 'center' },
        { text: valUnit(q, 'PartyTo', 'PartyTo1'), fontSize: 8, alignment: 'center' },
      ]);
    }
  }
  const qualityBlock = {
    stack: [
      { text: 'COTTON QUALITY DETAILS', bold: true, color: MAROON, alignment: 'center', fillColor: HEADER_FILL, fontSize: 9, margin: [0, 0, 0, 0] },
      { table: { headerRows: 2, widths: ['*', 40, 40, 40, 40], body: qBody }, layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => '#999', vLineColor: () => '#999' } },
    ],
  };

  // ---- header (logo + company name + title) ----
  const headerCols = {
    columns: [
      company.logo ? { image: company.logo, fit: [55, 55], width: 70 } : { text: '', width: 70 },
      {
        width: '*',
        stack: [
          { text: company.name || '', color: BLUE, bold: true, fontSize: 14, alignment: 'center' },
          { text: 'COTTON PURCHASE ORDER', color: MAROON, bold: true, fontSize: 12, alignment: 'center', margin: [0, 4, 0, 0] },
        ],
      },
      { text: '', width: 70 },
    ],
  };

  return {
    pageSize: 'A4',
    pageMargins: [36, 28, 36, 38],
    footer: (currentPage, pageCount) => ({
      margin: [36, 8, 36, 0],
      columns: [
        { text: 'Developed by Swas Technologies', fontSize: 7, italics: true, color: MAROON },
        { text: `${currentPage}/${pageCount}`, alignment: 'right', fontSize: 7, color: MAROON },
      ],
    }),
    content: [
      headerCols,
      { canvas: [{ type: 'line', x1: 0, y1: 4, x2: 523, y2: 4, lineWidth: 1 }] },
      {
        columns: [
          { width: '*', text: [{ text: 'Order No  ', bold: true }, { text: ': ' + str(r, 'CPONo'), bold: true }] },
          { width: 'auto', text: [{ text: 'Date  ', bold: true }, { text: ': ' + ddmmyyyy(r.CPODate), bold: true }] },
        ],
        margin: [0, 8, 0, 2],
      },
      { text: [{ text: 'Ref No  ', bold: true }, { text: ': ' + str(r, 'RefNo'), bold: true }], margin: [0, 0, 0, 8] },
      {
        columns: [
          { width: '47%', stack: [detailTable] },
          { width: '6%', text: '' },
          { width: '47%', stack: [qualityBlock] },
        ],
      },
      { text: [{ text: 'Remarks  ', bold: true }, { text: ': ' + str(r, 'Remarks') }], margin: [0, 18, 0, 0] },
      {
        columns: [
          { text: 'Prepared by', bold: true, alignment: 'center' },
          { text: 'Approved by', bold: true, alignment: 'center' },
        ],
        margin: [0, 42, 0, 0],
      },
    ],
    defaultStyle: { font: 'Roboto', fontSize: 9 },
  };
}

export const cottonPoPrintDetails = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) {
      return res.status(400).type('text/plain').send('Missing subDBName header');
    }

    const CPOCode = parseInt(req.query.CPOCode) || 0;
    const CompanyCode = parseInt(req.query.CompanyCode) || 0;

    const pool = await getPool(subDbName);
    const request = pool.request();
    request.input('CPOCode', sql.Int, CPOCode);
    const result = await request.execute('sp_CottonPurchaseOrderDetails_GetAll');
    const rows = result.recordset || [];

    if (req.query.debug === '1') {
      return res.type('text/plain').send(
        `CPOCode=${CPOCode}\nrows=${rows.length}\n` + JSON.stringify(rows.slice(0, 2), null, 2)
      );
    }

    const company = await getCompanyInfo(pool, CompanyCode);
    const docDef = buildDocDefinition(rows, company);
    const pdfBuffer = await renderPdf(docDef);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="CottonPurchaseOrderPrint_${CPOCode}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('cottonPoPrintDetails:', err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
};
