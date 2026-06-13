// Cotton — Issue Mixing Requisition Print DETAILS (Document report).
// Given a CMIRequisitionCode, runs sp_CMIRequisitionDetails_GetAll and renders a
// single requisition print PDF mirroring rptCMIRequisitionPrint.rdlc.
//
//   EXEC sp_CMIRequisitionDetails_GetAll @CompanyCode = <c>, @CMIRequisitionCode = <r>
//
// Layout: header info (Date / No), a per-mill-lot detail table with a totals
// footer, a quality summary matrix (Max / Min / Range / Avg over 10 params),
// and the Prepared By / GM signature line.

import sql from 'mssql';
import { getPool } from '../../config/dynamicDB.js';
import { renderPdf, getCompanyInfo, str, dec, fmt, ddmmyyyy } from '../report/cotton/_common.js';

const BLUE = '#0000CC';
const MAROON = '#800000';
const HEADER_FILL = '#F2F2F2';
const BORDER = '#999999';

const gridLayout = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => BORDER,
  vLineColor: () => BORDER,
  paddingLeft: () => 3,
  paddingRight: () => 3,
  paddingTop: () => 3,
  paddingBottom: () => 3,
};

// Quality columns: display header -> SP field (note the digit-leading names).
const QUALITY_COLS = [
  { header: '2.5%', key: '25PerLen' },
  { header: '50%', key: '50PerLen' },
  { header: 'UR%', key: 'Uni' },
  { header: 'MIC', key: 'Mic' },
  { header: 'STR', key: 'Sth' },
  { header: 'FQI', key: 'FQI' },
  { header: 'TRASH', key: 'Trash' },
  { header: 'SFI', key: 'Sfi' },
  { header: 'MR', key: 'MR' },
  { header: 'MOIS', key: 'Moisture' },
];

// Trim to <=2 decimals, dropping trailing zeros; blank for no value.
const q = (n) => {
  if (n == null || Number.isNaN(n)) return '';
  return String(Math.round(n * 100) / 100);
};

// Non-null numeric values of a column across rows (RDLC aggregates skip nulls).
const colNums = (rows, key) =>
  rows
    .map((r) => r[key])
    .filter((v) => v !== null && v !== undefined && v !== '')
    .map(Number)
    .filter((v) => !Number.isNaN(v));

function buildDetailTable(rows) {
  const head = ['S.No', 'Mill Lot No', 'Supplier Name', 'Opg Bales', 'No Of Bales', 'Clg Bales'].map((t) => ({
    text: t, bold: true, fontSize: 8, alignment: 'center', fillColor: HEADER_FILL,
  }));
  const body = [head];
  rows.forEach((r, i) => {
    body.push([
      { text: String(i + 1), alignment: 'center', fontSize: 8 },
      { text: str(r, 'MillLotNo'), alignment: 'center', fontSize: 8 },
      { text: str(r, 'SupplierName'), fontSize: 8 },
      { text: fmt(dec(r, 'OpeningBales'), 0), alignment: 'center', fontSize: 8 },
      { text: fmt(dec(r, 'NoOfBales'), 0), alignment: 'center', fontSize: 8 },
      { text: fmt(dec(r, 'ClosingBales'), 0), alignment: 'center', fontSize: 8 },
    ]);
  });
  const sum = (k) => rows.reduce((a, r) => a + dec(r, k), 0);
  body.push([
    { text: 'Total', colSpan: 3, alignment: 'right', bold: true, fontSize: 8, fillColor: HEADER_FILL }, {}, {},
    { text: fmt(sum('OpeningBales'), 0), alignment: 'center', bold: true, fontSize: 8, fillColor: HEADER_FILL },
    { text: fmt(sum('NoOfBales'), 0), alignment: 'center', bold: true, fontSize: 8, fillColor: HEADER_FILL },
    { text: fmt(sum('ClosingBales'), 0), alignment: 'center', bold: true, fontSize: 8, fillColor: HEADER_FILL },
  ]);
  return {
    table: { headerRows: 1, widths: [32, 70, '*', 60, 65, 60], body },
    layout: gridLayout,
    margin: [0, 4, 0, 0],
  };
}

function buildQualityTable(rows) {
  const stats = QUALITY_COLS.map((c) => {
    const nums = colNums(rows, c.key);
    if (!nums.length) return { max: null, min: null, avg: null };
    const max = Math.max(...nums);
    const min = Math.min(...nums);
    const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
    return { max, min, avg };
  });

  const head = [{ text: '', fillColor: HEADER_FILL }, ...QUALITY_COLS.map((c) => ({
    text: c.header, bold: true, fontSize: 8, alignment: 'center', fillColor: HEADER_FILL,
  }))];
  const rowFor = (label, pick) => [
    { text: label, bold: true, fontSize: 8 },
    ...stats.map((s) => ({ text: q(pick(s)), alignment: 'center', fontSize: 8 })),
  ];

  const body = [
    head,
    rowFor('Maximum', (s) => s.max),
    rowFor('Minimum', (s) => s.min),
    rowFor('Range', (s) => (s.max == null ? null : s.max - s.min)),
    rowFor('Avg', (s) => (s.avg == null ? null : Math.round(s.avg * 100) / 100)),
  ];

  return {
    table: { headerRows: 1, widths: [52, ...Array(QUALITY_COLS.length).fill('*')], body },
    layout: gridLayout,
    margin: [0, 14, 0, 0],
  };
}

function buildDocDefinition(rows, company) {
  const r = rows[0] || {};

  return {
    pageSize: 'A4',
    pageMargins: [28, 24, 28, 34],
    footer: (currentPage, pageCount) => ({
      margin: [28, 8, 28, 0],
      columns: [
        { text: `Report Printed : ${new Date().toLocaleString('en-GB')}`, fontSize: 7 },
        { text: `${currentPage}/${pageCount}`, alignment: 'right', fontSize: 8, bold: true, italics: true, color: MAROON },
      ],
    }),
    content: [
      // header
      {
        columns: [
          company.logo ? { image: company.logo, fit: [48, 48], width: 58 } : { text: '', width: 58 },
          {
            width: '*',
            stack: [
              { text: company.name || '', color: BLUE, bold: true, fontSize: 14, alignment: 'center' },
              { text: 'Cotton Issue Mixing Requisition', color: MAROON, bold: true, fontSize: 12, alignment: 'center', margin: [0, 3, 0, 0] },
            ],
          },
          { text: '', width: 58 },
        ],
      },
      { canvas: [{ type: 'line', x1: 0, y1: 6, x2: 539, y2: 6, lineWidth: 1 }], margin: [0, 2, 0, 8] },
      // requisition date / no
      {
        columns: [
          { width: '*', text: [{ text: 'Issue Requisition Date  : ', bold: true }, { text: ddmmyyyy(r.CMIRequisitionDate) }] },
          { width: 'auto', text: [{ text: 'Issue Requisition No  : ', bold: true }, { text: str(r, 'CMIRequisitionNo') }] },
        ],
        margin: [0, 0, 0, 6],
      },
      // detail table
      buildDetailTable(rows),
      // quality summary
      buildQualityTable(rows),
      // signatures
      {
        columns: [
          { text: 'Prepared By', bold: true, alignment: 'center' },
          { text: 'GM', bold: true, alignment: 'center' },
        ],
        margin: [0, 40, 0, 0],
      },
    ],
    defaultStyle: { font: 'Roboto', fontSize: 9 },
  };
}

export const cottonMixingRequisitionPrintDetails = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) {
      return res.status(400).type('text/plain').send('Missing subDBName header');
    }

    const CMIRequisitionCode = parseInt(req.query.CMIRequisitionCode) || 0;
    const CompanyCode = parseInt(req.query.CompanyCode) || 0;

    const pool = await getPool(subDbName);
    const request = pool.request();
    request.input('CompanyCode', sql.Int, CompanyCode);
    request.input('CMIRequisitionCode', sql.Int, CMIRequisitionCode);
    const result = await request.execute('sp_CMIRequisitionDetails_GetAll');
    const rows = result.recordset || [];

    if (req.query.debug === '1') {
      return res.type('text/plain').send(
        `CMIRequisitionCode=${CMIRequisitionCode}\nrows=${rows.length}\n` +
          JSON.stringify(rows.slice(0, 2), null, 2)
      );
    }

    const company = await getCompanyInfo(pool, CompanyCode);
    const docDef = buildDocDefinition(rows, company);
    const pdfBuffer = await renderPdf(docDef);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="CottonMixingRequisition_${CMIRequisitionCode}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('cottonMixingRequisitionPrintDetails:', err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
};
