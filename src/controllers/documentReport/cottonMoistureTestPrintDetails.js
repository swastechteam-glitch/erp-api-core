// Cotton — Moisture Test Print DETAILS (Document report).
// Given an ArrivalCode (from the moisture-test-print list), runs
// sp_CottonMoistureTestDetails_GetAll and renders a single-test print PDF
// mirroring rptCottonMoistureTest_Matrix.rdlc.
//
//   EXEC sp_CottonMoistureTestDetails_GetAll @ArrivalCode = <ArrivalCode>
//
// The SP returns one row per (test, bale). We lay out:
//   - an info block (Supplier / Mill Lot / No. of Bales / Vehicle / Tested Bales),
//   - a cross-tab matrix: rows = Bale No, columns = Test Date, cells = Moisture,
//   - a per-test summary table (Test No / Avg Moisture / Remarks / Inspected By).

import sql from 'mssql';
import { getPool } from '../../config/dynamicDB.js';
import { renderPdf, getCompanyInfo, str, dec, fmt, ddmmyyyy } from '../report/cotton/_common.js';

const BLUE = '#0000CC';
const MAROON = '#800000';
const GREEN = '#006400';
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

// Moisture/avg values print clean: drop trailing zeros but keep up to 2 dp.
const num = (v) => {
  const n = Number(v);
  if (!isFinite(n) || n === 0) return v === 0 || v === '0' ? '0' : '';
  return String(Math.round(n * 100) / 100);
};

function buildMatrix(rows) {
  // Columns = unique (TestCode, TestDate); rows = unique BaleNo.
  const colMap = new Map(); // key -> { code, date, label }
  for (const r of rows) {
    const code = dec(r, 'CottonMoistureTestCode');
    const date = r.CottonMoistureTestDate;
    const key = `${code}|${date}`;
    if (!colMap.has(key)) {
      colMap.set(key, { key, code, date, t: new Date(date).getTime() || 0, label: ddmmyyyy(date) });
    }
  }
  const cols = [...colMap.values()].sort((a, b) => a.t - b.t || a.code - b.code);

  const baleSet = new Set();
  const cell = new Map(); // `${bale}|${colKey}` -> Moisture
  for (const r of rows) {
    const bale = dec(r, 'BaleNo');
    baleSet.add(bale);
    const key = `${dec(r, 'CottonMoistureTestCode')}|${r.CottonMoistureTestDate}`;
    cell.set(`${bale}|${key}`, dec(r, 'Moisture'));
  }
  const bales = [...baleSet].sort((a, b) => a - b);

  const headRow = [
    { text: 'Bale No', bold: true, color: MAROON, alignment: 'center', fillColor: HEADER_FILL, fontSize: 8 },
    ...cols.map((c) => ({ text: c.label, bold: true, color: MAROON, alignment: 'center', fillColor: HEADER_FILL, fontSize: 8 })),
  ];
  const body = [headRow];
  for (const bale of bales) {
    body.push([
      { text: String(bale), alignment: 'center', fontSize: 8 },
      ...cols.map((c) => {
        const has = cell.has(`${bale}|${c.key}`);
        return { text: has ? num(cell.get(`${bale}|${c.key}`)) : '', alignment: 'center', fontSize: 8 };
      }),
    ]);
  }

  return {
    table: {
      headerRows: 1,
      widths: [50, ...cols.map(() => '*')],
      body,
    },
    layout: gridLayout,
    margin: [0, 0, 0, 12],
  };
}

function buildSummaryTable(rows) {
  // One row per test (group by CottonMoistureTestCode), first row's header fields.
  const seen = new Map();
  for (const r of rows) {
    const code = dec(r, 'CottonMoistureTestCode');
    if (!seen.has(code)) seen.set(code, r);
  }
  const head = ['Test No', 'Avg Moisture', 'Remarks', 'Inspected By'].map((t) => ({
    text: t, bold: true, alignment: 'center', fillColor: HEADER_FILL, fontSize: 8,
  }));
  const body = [head];
  for (const r of seen.values()) {
    body.push([
      { text: str(r, 'CottonMoistureTestNo'), alignment: 'center', fontSize: 9 },
      { text: num(dec(r, 'TotalAvgMoisture')), alignment: 'center', fontSize: 9 },
      { text: str(r, 'Remarks'), fontSize: 9 },
      { text: str(r, 'EmployeeName'), fontSize: 9 },
    ]);
  }
  return {
    table: { headerRows: 1, widths: [60, 90, '*', '*'], body },
    layout: gridLayout,
  };
}

function buildDocDefinition(rows, company) {
  const r = rows[0] || {};

  // ---- header: logo + company + title ----
  const headerCols = {
    columns: [
      company.logo ? { image: company.logo, fit: [50, 50], width: 60 } : { text: '', width: 60 },
      {
        width: '*',
        stack: [
          { text: company.name || '', color: BLUE, bold: true, fontSize: 13, alignment: 'center' },
          { text: 'COTTON MOISTURE TEST', color: MAROON, bold: true, fontSize: 12, alignment: 'center', margin: [0, 4, 0, 0] },
        ],
      },
      { text: '', width: 60 },
    ],
  };

  // ---- info block ----
  const infoRows = [
    ['Supplier Name', str(r, 'SupplierName')],
    ['Mill Lot No', str(r, 'MillLotNo')],
    ['No. Of Bales', fmt(dec(r, 'Qty'), 0)],
    ['Vehicle No', str(r, 'VehicleNo')],
    ['Tested Bales', String(rows.length)],
  ];
  const infoTable = {
    table: {
      widths: [110, '*'],
      body: infoRows.map(([k, v]) => [
        { text: k, color: GREEN, bold: true, fontSize: 9 },
        { text: v, fontSize: 9 },
      ]),
    },
    layout: gridLayout,
    margin: [0, 10, 0, 12],
  };

  return {
    pageSize: 'A4',
    pageMargins: [36, 28, 36, 38],
    footer: (currentPage, pageCount) => ({
      margin: [36, 8, 36, 0],
      columns: [
        { text: `Report Printed : ${new Date().toLocaleString('en-GB')}`, fontSize: 7, color: '#404040' },
        { text: `${currentPage}/${pageCount}`, alignment: 'right', fontSize: 8, bold: true, color: '#404040' },
      ],
    }),
    content: [
      headerCols,
      { canvas: [{ type: 'line', x1: 0, y1: 6, x2: 523, y2: 6, lineWidth: 1, lineColor: '#C0C0C0' }], margin: [0, 2, 0, 0] },
      infoTable,
      buildMatrix(rows),
      buildSummaryTable(rows),
    ],
    defaultStyle: { font: 'Roboto', fontSize: 9 },
  };
}

export const cottonMoistureTestPrintDetails = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) {
      return res.status(400).type('text/plain').send('Missing subDBName header');
    }

    const ArrivalCode = parseInt(req.query.ArrivalCode) || 0;
    const CompanyCode = parseInt(req.query.CompanyCode) || 0;

    const pool = await getPool(subDbName);
    const request = pool.request();
    request.input('ArrivalCode', sql.Int, ArrivalCode);
    const result = await request.execute('sp_CottonMoistureTestDetails_GetAll');
    const rows = result.recordset || [];

    if (req.query.debug === '1') {
      return res.type('text/plain').send(
        `ArrivalCode=${ArrivalCode}\nrows=${rows.length}\n` +
          JSON.stringify(rows.slice(0, 3), null, 2)
      );
    }

    const company = await getCompanyInfo(pool, CompanyCode);
    const docDef = buildDocDefinition(rows, company);
    const pdfBuffer = await renderPdf(docDef);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="CottonMoistureTestPrint_${ArrivalCode}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('cottonMoistureTestPrintDetails:', err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
};
