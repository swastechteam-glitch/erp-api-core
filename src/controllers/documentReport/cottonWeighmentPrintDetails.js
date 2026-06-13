// Cotton — Weighment Slip Print DETAILS (Document report).
// Given a WeighmentCode, runs the two procs the .rdlc binds and renders a
// single weighment slip mirroring rptCottonWeighmentSlip.rdlc.
//
//   EXEC sp_CottonWeighment_GetAll  @CompanyCode = <c>, @WeighmentCode = <w>
//   EXEC sp_CottonWeighment_Abstract @CompanyCode = <c>, @WeighmentCode = <w>
//
// The GetAll proc gives the slip header (First) + weight totals (Sum); the
// Abstract proc gives the per-bale Bale No / Gross Wt grid (5 column pairs).

import sql from 'mssql';
import { getPool } from '../../config/dynamicDB.js';
import { renderPdf, getCompanyInfo, str, dec, fmt, ddmmyyyy } from '../report/cotton/_common.js';

const BLUE = '#0000CC';
const MAROON = '#800000';
const HEADER_FILL = '#F2F2F2';
const BORDER = '#999999';

const kvLayout = {
  hLineWidth: () => 0,
  vLineWidth: () => 0,
  paddingLeft: () => 1,
  paddingRight: () => 3,
  paddingTop: () => 1.5,
  paddingBottom: () => 1.5,
};
// Bale grid: outer frame + header underline only — no inner cell borders.
const baleGridLayout = {
  hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0),
  vLineWidth: (i, node) => (i === 0 || i === node.table.widths.length ? 0.8 : 0),
  hLineColor: () => '#333333',
  vLineColor: () => '#333333',
  paddingLeft: () => 3,
  paddingRight: () => 3,
  paddingTop: () => 2.5,
  paddingBottom: () => 2.5,
};

// Roomier key/value layout for the weight summary section.
const summaryKvLayout = {
  hLineWidth: () => 0,
  vLineWidth: () => 0,
  paddingLeft: () => 1,
  paddingRight: () => 3,
  paddingTop: () => 6,
  paddingBottom: () => 6,
};

const sumBy = (rows, col) => rows.reduce((a, r) => a + dec(r, col), 0);

// Key/value table: [label, ':', value] rows, no borders.
function kvTable(pairs, labelWidth, layout = kvLayout) {
  return {
    table: {
      widths: [labelWidth, 6, '*'],
      body: pairs.map(([k, v]) => [
        { text: k, fontSize: 8, bold: true },
        { text: ':', fontSize: 8, bold: true },
        { text: v == null ? '' : String(v), fontSize: 8 },
      ]),
    },
    layout,
  };
}

function buildBaleGrid(abstract) {
  // 5 column pairs (Bale No / Gr Wt) per row, mirroring the rdlc abstract table.
  const head = [];
  for (let i = 0; i < 5; i++) {
    head.push({ text: 'Bale No', bold: true, fontSize: 8, alignment: 'center', fillColor: HEADER_FILL });
    head.push({ text: 'Gr Wt', bold: true, fontSize: 8, alignment: 'center', fillColor: HEADER_FILL });
  }
  const body = [head];
  const cell = (b, g) => {
    const bn = dec({ b }, 'b');
    return [
      { text: bn ? String(Math.round(bn)) : '', fontSize: 8, alignment: 'right' },
      { text: dec({ g }, 'g') ? fmt(dec({ g }, 'g'), 1) : '', fontSize: 8, alignment: 'right' },
    ];
  };
  for (const r of abstract) {
    body.push([
      ...cell(r.B1, r.G1),
      ...cell(r.B2, r.G2),
      ...cell(r.B3, r.G3),
      ...cell(r.B4, r.G4),
      ...cell(r.B5, r.G5),
    ]);
  }
  if (abstract.length === 0) {
    body.push([{ text: 'No bale details', colSpan: 10, alignment: 'center', fontSize: 8, color: '#888' }, {}, {}, {}, {}, {}, {}, {}, {}, {}]);
  }
  return {
    table: { headerRows: 1, widths: Array(10).fill('*'), body },
    layout: baleGridLayout,
    margin: [0, 10, 0, 0],
  };
}

function buildDocDefinition(weigh, abstract, company) {
  const r = weigh[0] || {};
  const a0 = abstract[0] || {};

  const candyRate = dec(r, 'CandyRate');
  const leftPairs = [
    ['Supplier', str(r, 'SupplierName')],
    ['Variety', str(r, 'RawMaterialName')],
    ['Supplier Lot No.', str(r, 'PartyLotNo')],
    ['Rate / Candy', candyRate ? fmt(candyRate, 0) : ''],
    ['Rate / Quintal', candyRate ? fmt(candyRate * 0.2812, 2) : ''],
    ['Tare Weight / Bale', dec(a0, 'T1') ? fmt(dec(a0, 'T1'), 2) : ''],
    ['Agent', str(r, 'AgentName')],
    ['P.R.No.', str(r, 'PRONo')],
    ['Supplied By', str(r, 'SupplierName')],
  ];
  const rightPairs = [
    ['Mill Lot No.', str(r, 'MillLotNo')],
    ['Date of Reciept', ddmmyyyy(r.ArrivalDate)],
    ['Date of Weighment', ddmmyyyy(r.WeighmentDate)],
    ['No.of Bales', fmt(sumBy(weigh, 'NoofBales'), 0)],
    ['Lorry Freight', str(r, 'FreightAmount')],
    ['Station', str(r, 'StationName')],
    ['Lorry No.', str(r, 'VehicleNo')],
    ['Freight Basis', str(r, 'CottonPaymentTypeName')],
  ];

  // ---- weight summary (two groups) ----
  const grossWt = sumBy(weigh, 'TotalGrossWeight');
  const tareWt = sumBy(weigh, 'TotalTareWeight');
  const netWt = sumBy(weigh, 'TotalNetWeight');
  const invoiceWt = sumBy(weigh, 'PartyNetWeight');
  const shortage = netWt - invoiceWt;
  const summaryLeft = [
    ['Gross Weight', fmt(grossWt, 3)],
    ['Tare Weight', fmt(tareWt, 3)],
    ['Net Weight', fmt(netWt, 3)],
  ];
  const summaryRight = [
    ['Invoice Weight', fmt(invoiceWt, 3)],
    ['Actual Weight', fmt(netWt, 3)],
    ['Shortage', fmt(shortage, 3)],
  ];

  return {
    pageSize: 'A4',
    pageMargins: [28, 24, 28, 28],
    content: [
      // header
      {
        columns: [
          company.logo ? { image: company.logo, fit: [42, 42], width: 50 } : { text: '', width: 50 },
          {
            width: '*',
            stack: [
              { text: company.name || '', color: BLUE, bold: true, fontSize: 13, alignment: 'center' },
              { text: 'Cotton Weight List', color: MAROON, bold: true, fontSize: 11, alignment: 'center', margin: [0, 2, 0, 0] },
            ],
          },
          { text: '', width: 50 },
        ],
      },
      { canvas: [{ type: 'line', x1: 0, y1: 4, x2: 539, y2: 4, lineWidth: 1 }], margin: [0, 2, 0, 8] },
      // info block (two columns)
      {
        columns: [
          { width: '52%', stack: [kvTable(leftPairs, 88)] },
          { width: '4%', text: '' },
          { width: '44%', stack: [kvTable(rightPairs, 78)] },
        ],
      },
      // per-bale grid
      buildBaleGrid(abstract),
      // weight summary
      {
        columns: [
          { width: '50%', stack: [kvTable(summaryLeft, 82, summaryKvLayout)] },
          { width: '50%', stack: [kvTable(summaryRight, 82, summaryKvLayout)] },
        ],
        margin: [0, 28, 0, 0],
      },
      // signatures
      {
        columns: [
          { text: 'C.I.', bold: true, alignment: 'center' },
          { text: 'O.M.', bold: true, alignment: 'center' },
          { text: 'Q.M.', bold: true, alignment: 'center' },
          { text: 'F.M.', bold: true, alignment: 'center' },
          { text: 'G.M.', bold: true, alignment: 'center' },
        ],
        margin: [0, 44, 0, 0],
      },
    ],
    defaultStyle: { font: 'Roboto', fontSize: 8 },
  };
}

export const cottonWeighmentPrintDetails = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) {
      return res.status(400).type('text/plain').send('Missing subDBName header');
    }

    const WeighmentCode = parseInt(req.query.WeighmentCode) || 0;
    const CompanyCode = parseInt(req.query.CompanyCode) || 0;

    const pool = await getPool(subDbName);

    const getAllReq = pool.request();
    getAllReq.input('CompanyCode', sql.Int, CompanyCode);
    getAllReq.input('WeighmentCode', sql.Int, WeighmentCode);
    const weigh = (await getAllReq.execute('sp_CottonWeighment_GetAll')).recordset || [];

    const absReq = pool.request();
    absReq.input('CompanyCode', sql.Int, CompanyCode);
    absReq.input('WeighmentCode', sql.Int, WeighmentCode);
    const abstract = (await absReq.execute('sp_CottonWeighment_Abstract')).recordset || [];

    if (req.query.debug === '1') {
      return res.type('text/plain').send(
        `WeighmentCode=${WeighmentCode}\nweigh=${weigh.length}\nabstract=${abstract.length}\n` +
          'weigh[0]=' + JSON.stringify(weigh[0] || {}, null, 2) + '\n' +
          'abstract[0]=' + JSON.stringify(abstract[0] || {}, null, 2)
      );
    }

    const company = await getCompanyInfo(pool, CompanyCode);
    const docDef = buildDocDefinition(weigh, abstract, company);
    const pdfBuffer = await renderPdf(docDef);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="CottonWeighmentSlip_${WeighmentCode}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('cottonWeighmentPrintDetails:', err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
};
