// Cotton — GRN Print DETAILS (Document report).
// Given an ArrivalCode (from the grn-print list), runs sp_CottonArrival_GetAll
// and renders a single-GRN print PDF mirroring rptCottonGRNDetails.rdlc.
//
//   EXEC sp_CottonArrival_GetAll @CompanyCode = <CompanyCode>, @ArrivalCode = <ArrivalCode>
//
// The SP returns the arrival header (plus quality/weighment fields) — we take
// the first row, lay out the GRN detail key/value table, the attached-document
// checklist grid, and the signature line, matching the .rdlc.

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
  paddingLeft: () => 4,
  paddingRight: () => 4,
  paddingTop: () => 3,
  paddingBottom: () => 3,
};

function buildDocDefinition(rows, company) {
  const r = rows[0] || {};

  // ---- header: GRN No / Date / Gate Entry No box (right of the title) ----
  const grnNo = str(r, 'MillLotNo').slice(-3);
  const headerBox = {
    table: {
      widths: ['auto', '*'],
      body: [
        [{ text: 'GRN No.', fontSize: 8 }, { text: grnNo, fontSize: 8, bold: true }],
        [{ text: 'Date.', fontSize: 8 }, { text: ddmmyyyy(r.ArrivalDate), fontSize: 8, bold: true }],
        [{ text: 'Gate Entry No', fontSize: 8 }, { text: str(r, 'GateEntryNo'), fontSize: 8, bold: true }],
      ],
    },
    layout: gridLayout,
  };

  const headerCols = {
    columns: [
      company.logo ? { image: company.logo, fit: [50, 50], width: 60 } : { text: '', width: 60 },
      {
        width: '*',
        stack: [
          { text: 'COTTON GRN DETAILS', bold: true, fontSize: 11, alignment: 'center' },
          { text: company.name || '', color: BLUE, bold: true, fontSize: 14, alignment: 'center', margin: [0, 4, 0, 0] },
        ],
      },
      { width: 150, stack: [headerBox] },
    ],
    columnGap: 8,
  };

  // ---- main GRN detail key/value table ----
  const payType = dec(r, 'PaymentType') === 0 ? 'SPOT' : 'FOR';
  const freightVal = dec(r, 'Freight');
  const freight =
    freightVal === 0 ? 'PARTY PAID' : fmt(Math.abs(freightVal), 2);

  const detailRows = [
    ['PURCHASE ORDER NO / DATE', `${str(r, 'CPONo')} Dt.: ${ddmmyyyy(r.CPODate)}`],
    ['Mill Lot No', str(r, 'MillLotNo')],
    ['Supplier Name', str(r, 'SupplierName')],
    ['Station Name', str(r, 'StationName')],
    ['RawMaterial Name', str(r, 'RawMaterialName')],
    ['Qty', fmt(dec(r, 'Qty'), 0)],
    ['Party Lot No', str(r, 'PartyLotNo')],
    ['Gate Entry No / Date', `${str(r, 'GateEntryNo')} - ${ddmmyyyy(r.GateEntryDate)}`],
    ['Arrival Date', ddmmyyyy(r.ArrivalDate)],
    ['LR NO / Date', `${str(r, 'LRNo')} - ${ddmmyyyy(r.LRDate)} - ${str(r, 'VehicleNo')}`],
    ['Transporter Name', str(r, 'TransporterName')],
    ['Party DC No / Date', `${str(r, 'PartyBillDCNo')} - ${ddmmyyyy(r.PartyBillDCDate)}`],
    ['Party Gross Weight', fmt(dec(r, 'PartyGrossWeight'), 2)],
    ['WeighBridge Weight', fmt(dec(r, 'NetWeight_WeighBridge'), 2)],
    ['Freight', freight],
    ['Candy Rate', `${fmt(dec(r, 'CandyRate'), 0)} / ${payType}`],
    ['Moisture', ''],
  ];

  const detailTable = {
    table: {
      widths: [22, 150, '*'],
      body: detailRows.map(([label, value], i) => [
        { text: String(i + 1), alignment: 'center', fontSize: 9 },
        { text: label, fontSize: 9 },
        { text: value, fontSize: 8, bold: true },
      ]),
    },
    layout: gridLayout,
  };

  // ---- attached-document checklist grid (mirrors the .rdlc footer table) ----
  const checkHead = ['S.No', 'Description', 'No', 'Date', 'Original', 'Duplicate', 'Total', 'Notes'].map((t) => ({
    text: t, bold: true, fontSize: 8, alignment: 'center', fillColor: HEADER_FILL,
  }));
  const checkRows = [
    { desc: 'Gate Pass', date: ddmmyyyy(r.GateEntryDate) },
    { desc: 'GRN', date: ddmmyyyy(r.ArrivalDate) },
    { desc: 'Invoice No', date: ddmmyyyy(r.PartyBillDCDate) },
    { desc: 'Party Name', wide: str(r, 'SupplierName') },
    { desc: 'LR', wide: str(r, 'LRNo') },
    { desc: 'TDS' },
    { desc: 'Insurance' },
    { desc: 'Mill Weigh Bridge' },
  ];
  const checkBody = [checkHead];
  checkRows.forEach((c, i) => {
    if (c.wide != null) {
      checkBody.push([
        { text: String(i + 1), alignment: 'center', fontSize: 8 },
        { text: c.desc, fontSize: 8 },
        { text: c.wide, colSpan: 4, fontSize: 8 }, {}, {}, {},
        { text: '', fontSize: 8 },
        { text: '', fontSize: 8 },
      ]);
    } else {
      checkBody.push([
        { text: String(i + 1), alignment: 'center', fontSize: 8 },
        { text: c.desc, fontSize: 8 },
        { text: '', fontSize: 8 },
        { text: c.date || '', alignment: 'center', fontSize: 8 },
        { text: '', fontSize: 8 },
        { text: '', fontSize: 8 },
        { text: '', fontSize: 8 },
        { text: '', fontSize: 8 },
      ]);
    }
  });
  const checklistTable = {
    table: {
      headerRows: 1,
      widths: [26, '*', 40, 60, 45, 45, 35, 45],
      body: checkBody,
    },
    layout: gridLayout,
    margin: [0, 12, 0, 0],
  };

  // ---- signatures ----
  const signatures = {
    columns: [
      { text: 'COTTON INCHARGE', bold: true, alignment: 'center' },
      { text: 'OM', bold: true, alignment: 'center' },
      { text: 'FM', bold: true, alignment: 'center' },
      { text: 'GM', bold: true, alignment: 'center' },
    ],
    margin: [0, 40, 0, 0],
  };

  return {
    pageSize: 'A4',
    pageMargins: [36, 28, 36, 38],
    footer: (currentPage, pageCount) => ({
      margin: [36, 8, 36, 0],
      columns: [
        {
          text: `Developed by Swas Technologies , Report Printed : ${new Date().toLocaleString('en-GB')}`,
          fontSize: 7, italics: true, color: MAROON,
        },
        { text: `${currentPage}/${pageCount}`, alignment: 'right', fontSize: 7, color: MAROON },
      ],
    }),
    content: [
      headerCols,
      { canvas: [{ type: 'line', x1: 0, y1: 6, x2: 523, y2: 6, lineWidth: 1 }], margin: [0, 2, 0, 8] },
      detailTable,
      checklistTable,
      signatures,
    ],
    defaultStyle: { font: 'Roboto', fontSize: 9 },
  };
}

export const cottonGrnPrintDetails = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) {
      return res.status(400).type('text/plain').send('Missing subDBName header');
    }

    const ArrivalCode = parseInt(req.query.ArrivalCode) || 0;
    const CompanyCode = parseInt(req.query.CompanyCode) || 0;

    const pool = await getPool(subDbName);
    const request = pool.request();
    request.input('CompanyCode', sql.Int, CompanyCode);
    request.input('ArrivalCode', sql.Int, ArrivalCode);
    const result = await request.execute('sp_CottonArrival_GetAll');
    const rows = result.recordset || [];

    if (req.query.debug === '1') {
      return res.type('text/plain').send(
        `ArrivalCode=${ArrivalCode}\nCompanyCode=${CompanyCode}\nrows=${rows.length}\n` +
          JSON.stringify(rows.slice(0, 2), null, 2)
      );
    }

    const company = await getCompanyInfo(pool, CompanyCode);
    const docDef = buildDocDefinition(rows, company);
    const pdfBuffer = await renderPdf(docDef);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="CottonGRNPrint_${ArrivalCode}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('cottonGrnPrintDetails:', err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
};
