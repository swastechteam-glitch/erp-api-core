// Cotton — Bill Passing Print DETAILS (Document report).
// Given an ArrivalCode, runs the two procs the .rdlc binds and renders a single
// bill-passing sheet mirroring rptCottonBillPassingPrint.rdlc.
//
//   EXEC sp_CottonPayment_BillPassing_Load    @ArrivalCode = <a>
//   EXEC sp_CottonQualityTestDetails_GetAll   @ArrivalCode = <a>
//
// Sections: purchase-details header, quality-test matrix (parameters x tests),
// allowance summary + weight block, rate/candy block, authorized signature.

import sql from 'mssql';
import { getPool } from '../../config/dynamicDB.js';
import { renderPdf, getCompanyInfo, str, dec, fmt, ddmmyyyy } from '../report/cotton/_common.js';

const BLUE = '#0000CC';
const MAROON = '#800000';
const RED = '#CC0000';
const HEAD = '#F2F2F2';
const BORDER = '#9A9A9A';

const grid = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => BORDER,
  vLineColor: () => BORDER,
  paddingLeft: () => 3,
  paddingRight: () => 3,
  paddingTop: () => 2,
  paddingBottom: () => 2,
};

const f0 = (v) => fmt(Number(v) || 0, 0);
const f2 = (v) => fmt(Number(v) || 0, 2);
const numTrim = (v) => {
  if (v == null || v === '' || Number.isNaN(Number(v))) return '';
  return String(Math.round(Number(v) * 100) / 100);
};

const H = (t, opts = {}) => ({ text: t, bold: true, fontSize: 7.5, alignment: 'center', fillColor: HEAD, ...opts });
const C = (t, opts = {}) => ({ text: t == null ? '' : String(t), fontSize: 7.5, alignment: 'center', ...opts });

// ── Purchase details header block (table1) ──────────────────────────────────
function buildPurchaseDetails(m) {
  const labelRow = (arr) => arr.map((t) => H(t));
  const valueRow = (arr) => arr.map((t) => C(t));
  const body = [
    [{ text: `COTTON PURCHASE DETAILS : ${str(m, 'SupplierName')}`, colSpan: 7, bold: true, fontSize: 8, fillColor: HEAD }, {}, {}, {}, {}, {}, {}],
    labelRow(['Date Of Booking', 'Agent', 'Station', 'Candy Rate', 'Mill Lot No', 'Party Lot No', 'Bill No / Date']),
    valueRow([
      ddmmyyyy(m.CPODate), str(m, 'AgentName'), str(m, 'StationName'), f0(dec(m, 'CandyRate')),
      str(m, 'MillLotNo'), str(m, 'PartyLotNo'),
      `${str(m, 'PartyBillDCNo')} - ${ddmmyyyy(m.PartyBillDCDate)}`,
    ]),
    labelRow(['PO No', 'No Of Bales', 'Received Date', 'Received Bales', 'Moisture %', 'Trash %', 'Vehicle No']),
    valueRow([
      str(m, 'CPONo'), f0(dec(m, 'CPOQty')), ddmmyyyy(m.ArrivalDate), f0(dec(m, 'Qty')),
      f2(dec(m, 'PO_Moisture')), f2(dec(m, 'PO_Trash')), str(m, 'VehicleNo'),
    ]),
  ];
  return { table: { widths: Array(7).fill('*'), body }, layout: grid, margin: [0, 0, 0, 8] };
}

// ── Quality-test matrix (parameters x tests) ────────────────────────────────
function buildQualityMatrix(rows) {
  const cols = [];
  const seen = new Set();
  for (const r of rows) {
    const cqt = dec(r, 'CQTNo');
    const rem = str(r, 'Remarks');
    const key = `${cqt}||${rem}`;
    if (!seen.has(key)) {
      seen.add(key);
      cols.push({ key, label: rem ? `${cqt}-${rem}` : String(cqt) });
    }
  }
  const params = new Map();
  for (const r of rows) {
    const name = str(r, 'CQTParameterName');
    if (!name) continue;
    if (!params.has(name)) {
      params.set(name, { name, from: r.CQTParameterFrom, to: r.CQTParameterTo, order: dec(r, 'OrderNo'), cells: new Map() });
    }
    const p = params.get(name);
    const o = dec(r, 'OrderNo');
    if (o && o < p.order) p.order = o;
    p.cells.set(`${dec(r, 'CQTNo')}||${str(r, 'Remarks')}`, r.TestResult);
  }
  const list = [...params.values()].sort((a, b) => a.order - b.order);

  const head = [H('Name', { alignment: 'left' }), H('PO From'), H('PO To'), ...cols.map((c) => H(c.label))];
  const body = [head];
  if (list.length === 0) {
    body.push([{ text: 'No quality test details', colSpan: 3 + cols.length, alignment: 'center', fontSize: 7.5, color: '#888' }, ...Array(2 + cols.length).fill({})]);
  } else {
    for (const p of list) {
      body.push([
        { text: p.name, fontSize: 7.5, bold: true },
        C(numTrim(p.from)), C(numTrim(p.to)),
        ...cols.map((c) => C(numTrim(p.cells.get(c.key) != null ? Math.round(Number(p.cells.get(c.key)) * 100) / 100 : ''))),
      ]);
    }
  }
  return { table: { headerRows: 1, widths: [88, 34, 34, ...cols.map(() => '*')], body }, layout: grid };
}

// ── Allowance summary (table2) ──────────────────────────────────────────────
function buildAllowance(m) {
  const moistureKg = dec(m, 'MoistureKg');
  const trashKg = dec(m, 'TrashKg');
  const wShort = dec(m, 'WeightShortage');
  const mdKg = dec(m, 'MD_Allow_Kg');
  const mdAmt = (dec(m, 'CandyRate') * 0.2812) * (mdKg / 100);
  const taxAmt = dec(m, 'CGSTAmount') + dec(m, 'SGSTAmount') + dec(m, 'IGSTAmount');

  const head = [H('Particulars', { alignment: 'left' }), H('Value'), H('Allow'), H('Amount')];
  const L = (t) => ({ text: t, bold: true, fontSize: 7.5 });
  const rows = [
    [L('Approval Wt'), C(f0(dec(m, 'ApprovalWeight'))), C(''), C('')],
    [L('W.Shortage Kgs'), C(f0(wShort)), C(''), C('')],
    [L('Moisture %'), C(f2(dec(m, 'Moisture'))), C(f2(dec(m, 'AllowanceMoisture'))), C(f0(moistureKg))],
    [L('Trash %'), C(f2(dec(m, 'Trash'))), C(f2(dec(m, 'AllowanceTrash'))), C(f0(trashKg))],
    [L('Actual Wt Diff'), C(f0(wShort + moistureKg + trashKg)), C(''), C('')],
    [{ text: 'MD Allow Kgs', bold: true, fontSize: 7.5, color: RED }, C(f0(mdKg), { color: RED }), C(''), C(f2(mdAmt), { color: RED })],
    [L('Total Wt Diff'), C(f0(dec(m, 'TotalDifferenceKG'))), C(''), C(f2(dec(m, 'DifferenceKgAmount')))],
    [L('Q.Allowance Rs'), C(f2(dec(m, 'QualityAllowanceRate'))), C(''), C(f2(dec(m, 'QualityAllownceAmount')))],
    [L('Allow.Tax Amt'), C(''), C(''), C(f2(taxAmt))],
    [L('Total Allow.Amt'), C(''), C(''), C(f2(dec(m, 'TotalAllowanceNetAmount')))],
    [L('Approval Amt'), C(''), C(''), C(f2(dec(m, 'Approval_Amount')))],
  ];
  return { table: { headerRows: 1, widths: [88, '*', '*', '*'], body: [head, ...rows] }, layout: grid };
}

// ── Weight block (table4) ───────────────────────────────────────────────────
function buildWeight(m) {
  const partyNet = dec(m, 'PartyNetWeight');
  const head1 = [{ text: 'WEIGHT', colSpan: 5, bold: true, fontSize: 8, alignment: 'center', fillColor: HEAD }, {}, {}, {}, {}];
  const head2 = [H(''), H('Gross'), H('Tare'), H('Net'), H('Diff')];
  const row = (label, g, t, n, d) => [{ text: label, bold: true, fontSize: 7.5 }, C(f0(g)), C(f0(t)), C(f0(n)), C(d === '' ? '' : f0(d))];
  const body = [
    head1, head2,
    row('Party Net Wt', dec(m, 'PartyGrossWeight'), dec(m, 'PartyTareWeight'), partyNet, ''),
    row('Mill Net Wt', dec(m, 'InduvalGrossWt'), dec(m, 'InduvalTareWt'), dec(m, 'InduvalWt'), dec(m, 'InduvalWt') - partyNet),
    row('OutSide WB Wt', dec(m, 'OutSideWeighBridgeGrossWt'), dec(m, 'OutSideWeighBridgeTareWt'), dec(m, 'OutSideWeighBridgeWt'), dec(m, 'OutSideWeighBridgeWt') - partyNet),
    row('Mill WB Wt', dec(m, 'WeighBridgeGrossWt'), dec(m, 'WeighBridgeTareWt'), dec(m, 'WeighBridgeWt'), dec(m, 'WeighBridgeWt') - partyNet),
  ];
  return { table: { headerRows: 2, widths: [70, '*', '*', '*', '*'], body }, layout: grid };
}

// ── Rate / candy block (table3) ─────────────────────────────────────────────
function buildRateCandy(m) {
  const freight = dec(m, 'Freight');
  const qty = dec(m, 'Qty');
  const head = [H('', { alignment: 'left' }), H('Frieght / Candy'), H('Candy'), H('Fright Per Bale')];
  const val = [
    { text: `Rate/Candy : ${str(m, 'CottonPaymentTypeName')}`, bold: true, fontSize: 7.5 },
    C(f2(freight / 355.6)), C(f0(dec(m, 'CandyRate'))), C(qty ? f2(freight / qty) : ''),
  ];
  return { table: { widths: ['*', '*', '*', '*'], body: [head, val] }, layout: grid };
}

function buildDocDefinition(load, quality, company) {
  const m = load[0] || {};
  return {
    pageSize: 'A4',
    pageMargins: [22, 20, 22, 30],
    footer: (currentPage, pageCount) => ({
      margin: [22, 6, 22, 0],
      columns: [
        { text: `Report Printed : ${new Date().toLocaleString('en-GB')}`, fontSize: 7 },
        { text: `Page No: ${currentPage} of ${pageCount}`, alignment: 'right', fontSize: 7.5, bold: true, italics: true, color: '#8B0000' },
      ],
    }),
    content: [
      // header — logo vertically centered against the (spaced) two-line title
      {
        columns: [
          company.logo
            ? { image: company.logo, fit: [50, 50], width: 60, margin: [0, 6, 0, 0] }
            : { text: '', width: 60 },
          {
            width: '*',
            stack: [
              { text: company.name || '', color: MAROON, bold: true, fontSize: 13, alignment: 'center', margin: [0, 0, 0, 8] },
              { text: 'COTTON BILL PASSING', color: BLUE, bold: true, fontSize: 12, alignment: 'center' },
            ],
            margin: [0, 4, 0, 0],
          },
          { text: '', width: 60 },
        ],
      },
      { canvas: [{ type: 'line', x1: 0, y1: 6, x2: 551, y2: 6, lineWidth: 1 }], margin: [0, 6, 0, 8] },
      buildPurchaseDetails(m),
      // quality matrix — full width (can have many test columns; avoids overlap)
      buildQualityMatrix(quality),
      // allowance summary (left) + weight block (right)
      {
        columns: [
          { width: '48%', stack: [buildAllowance(m)] },
          { width: '4%', text: '' },
          { width: '48%', stack: [buildWeight(m)] },
        ],
        margin: [0, 10, 0, 0],
      },
      // rate/candy (left) + authorized signature (right)
      {
        columns: [
          { width: '60%', stack: [buildRateCandy(m)] },
          { width: '40%', text: 'Authorized Signature', bold: true, alignment: 'center', margin: [0, 28, 0, 0] },
        ],
        margin: [0, 10, 0, 0],
      },
    ],
    defaultStyle: { font: 'Roboto', fontSize: 8 },
  };
}

export const cottonBillPassingPrintDetails = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) {
      return res.status(400).type('text/plain').send('Missing subDBName header');
    }

    const ArrivalCode = parseInt(req.query.ArrivalCode) || 0;
    const CompanyCode = parseInt(req.query.CompanyCode) || 0;

    const pool = await getPool(subDbName);

    const loadReq = pool.request();
    loadReq.input('ArrivalCode', sql.Int, ArrivalCode);
    const load = (await loadReq.execute('sp_CottonPayment_BillPassing_Load')).recordset || [];

    const qtReq = pool.request();
    qtReq.input('ArrivalCode', sql.Int, ArrivalCode);
    const quality = (await qtReq.execute('sp_CottonQualityTestDetails_GetAll')).recordset || [];

    if (req.query.debug === '1') {
      return res.type('text/plain').send(
        `ArrivalCode=${ArrivalCode}\nload=${load.length}\nquality=${quality.length}\n` +
          'load[0]=' + JSON.stringify(load[0] || {}, null, 2) + '\n' +
          'quality[0]=' + JSON.stringify(quality[0] || {}, null, 2)
      );
    }

    const company = await getCompanyInfo(pool, CompanyCode);
    const docDef = buildDocDefinition(load, quality, company);
    const pdfBuffer = await renderPdf(docDef);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="CottonBillPassing_${ArrivalCode}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('cottonBillPassingPrintDetails:', err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
};
