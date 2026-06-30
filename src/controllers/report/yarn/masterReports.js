// reports/yarn/masterReports.js
// Flat Yarn MASTER list reports (no date range) — one builder factory shared by
// Count Name / Count Type / Lot No / Other Charges / Sales Type / Tax Type /
// Tip Colour. Mirrors the rptCountName-family RDLCs: a titled table with S.No +
// the master's columns + Status, with the company logo on the title block.
//
// Each export is { buildDocDefinition(rows, companyName, fromDate, toDate, logo) }
// — runMasterReport (pdfReport.controller.js) passes null for the dates since the
// master sp_*_GetAll procs take no date params, only an optional @Status.

const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};
const fmt = (n, d = 2) =>
  toNum(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
const pick = (r, keys) => {
  for (const k of keys) {
    const v = r?.[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return '';
};
const statusText = (v) =>
  v === true || v === 1 || v === '1'
    ? 'ACTIVE'
    : v === false || v === 0 || v === '0'
    ? 'INACTIVE'
    : String(v ?? '');
const yesNo = (v) => (v === true || v === 1 || v === '1' ? 'YES' : 'NO');

const COLORS = {
  headerFill: '#1A3C7B',
  headerText: '#FFFFFF',
  zebraFill: '#FAFBFD',
  borderColor: '#D7DCE3',
};

const baseLayout = {
  hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0.4),
  vLineWidth: () => 0.4,
  hLineColor: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? COLORS.headerFill : COLORS.borderColor),
  vLineColor: () => COLORS.borderColor,
  paddingLeft: () => 4,
  paddingRight: () => 4,
  paddingTop: () => 4,
  paddingBottom: () => 4,
};

const baseFooter = (currentPage, pageCount) => ({
  margin: [0, 12, 0, 0],
  columns: [
    { text: 'Developed by Swas Technologies, Report Printed : ' + new Date().toLocaleString('en-GB'), fontSize: 7, margin: [15, 0, 0, 0] },
    { text: `Page ${currentPage} of ${pageCount}`, alignment: 'right', fontSize: 7, margin: [0, 0, 15, 0] },
  ],
});

// Title block — logo on the left, company name (brown) + report title (green).
// Uses `columns` (not a bare `stack`) so addLogoToTitles leaves it untouched.
const titleBlock = (companyName, title, logoDataUri) => {
  const W = 90;
  const logoCol = logoDataUri
    ? { image: logoDataUri, fit: [80, 80], width: W, alignment: 'left', margin: [4, 0, 0, 0] }
    : { text: '', width: W };
  return {
    columns: [
      logoCol,
      {
        width: '*',
        stack: [
          { text: companyName, alignment: 'center', fontSize: 16, bold: true, color: '#7B3F00', margin: [0, 0, 0, 6] },
          { text: title, alignment: 'center', fontSize: 12, bold: true, color: '#008000' },
        ],
      },
      { text: '', width: W },
    ],
    margin: [0, 0, 0, 10],
  };
};

function makeMasterReport(title, columns, orientation = 'portrait') {
  return function buildDocDefinition(rows, companyName, _fromDate, _toDate, companyLogo) {
    const body = [];
    body.push(
      columns.map((c) => ({
        text: c.header, bold: true, fillColor: COLORS.headerFill,
        color: COLORS.headerText, alignment: c.align || 'left', fontSize: 8,
      }))
    );

    let sno = 1;
    for (const r of rows || []) {
      const zebra = sno % 2 === 0 ? COLORS.zebraFill : null;
      body.push(
        columns.map((c) => ({
          text: String(c.value(r, sno) ?? ''), alignment: c.align || 'left', fontSize: 8, fillColor: zebra,
        }))
      );
      sno++;
    }
    if (!(rows || []).length) {
      body.push([
        { text: 'No records found', colSpan: columns.length, alignment: 'center', italics: true, fontSize: 9, margin: [0, 6, 0, 6] },
        ...new Array(columns.length - 1).fill({}),
      ]);
    }

    return {
      pageSize: 'A4',
      pageOrientation: orientation,
      pageMargins: [15, 20, 15, 45],
      footer: baseFooter,
      content: [
        titleBlock(companyName, title, companyLogo),
        {
          table: { headerRows: 1, widths: columns.map((c) => c.width), body },
          layout: baseLayout,
        },
      ],
      defaultStyle: { font: 'Roboto', fontSize: 8, lineHeight: 1.2 },
    };
  };
}

const snoCol = { header: 'S.No', width: 34, align: 'center', value: (_r, i) => i };

export const countName = {
  buildDocDefinition: makeMasterReport('COUNT NAME DETAILS', [
    snoCol,
    { header: 'Count Name', width: '*', value: (r) => pick(r, ['CountName']) },
    { header: 'Status', width: 100, align: 'center', value: (r) => statusText(r.Status) },
  ]),
};

export const countType = {
  buildDocDefinition: makeMasterReport('COUNT TYPE DETAILS', [
    snoCol,
    { header: 'Count Name', width: '*', value: (r) => pick(r, ['CountName']) },
    { header: 'Count Type', width: '*', value: (r) => pick(r, ['CountType', 'ShortName']) },
    { header: 'Std Wgt', width: 65, align: 'right', value: (r) => fmt(r.StdWeight, 3) },
    { header: 'Delivery Wgt', width: 75, align: 'right', value: (r) => fmt(r.DeliveryWeight, 3) },
    { header: 'Status', width: 70, align: 'center', value: (r) => statusText(r.Status) },
  ]),
};

export const lotNo = {
  buildDocDefinition: makeMasterReport('LOTNO DETAILS', [
    snoCol,
    { header: 'Lot No', width: '*', value: (r) => pick(r, ['LotNo']) },
    { header: 'Status', width: 100, align: 'center', value: (r) => statusText(r.Status) },
  ]),
};

export const otherCharges = {
  buildDocDefinition: makeMasterReport('OTHER CHARGES DETAILS', [
    snoCol,
    { header: 'Other Charges', width: '*', value: (r) => pick(r, ['OtherCharges']) },
    { header: 'Per Kg', width: 70, align: 'center', value: (r) => yesNo(pick(r, ['PerKg', 'perKg', 'PerBag'])) },
    { header: 'Amount', width: 90, align: 'right', value: (r) => fmt(r.Amount, 2) },
    { header: 'Status', width: 80, align: 'center', value: (r) => statusText(r.Status) },
  ]),
};

export const salesType = {
  buildDocDefinition: makeMasterReport('SALESTYPE DETAILS', [
    snoCol,
    { header: 'Sales Type', width: '*', value: (r) => pick(r, ['SalesType']) },
    { header: 'Status', width: 100, align: 'center', value: (r) => statusText(r.Status) },
  ]),
};

export const taxType = {
  buildDocDefinition: makeMasterReport(
    'TAXTYPE DETAILS',
    [
      snoCol,
      { header: 'Tax Type', width: '*', value: (r) => pick(r, ['TaxType']) },
      { header: 'BED', width: 55, align: 'right', value: (r) => fmt(r.BED, 2) },
      { header: 'AED', width: 55, align: 'right', value: (r) => fmt(r.AED, 2) },
      { header: 'CESS', width: 55, align: 'right', value: (r) => fmt(r.CESS, 2) },
      { header: 'TNGST', width: 60, align: 'right', value: (r) => fmt(r.TNGST, 2) },
      { header: 'Surcharge', width: 65, align: 'right', value: (r) => fmt(r.Surcharge, 2) },
      { header: 'Freight', width: 60, align: 'right', value: (r) => fmt(pick(r, ['Fright', 'Freight']), 2) },
      { header: 'Fabric Charge', width: 75, align: 'right', value: (r) => fmt(r.FabricCharge, 2) },
      { header: 'Status', width: 65, align: 'center', value: (r) => statusText(r.Status) },
    ],
    'landscape'
  ),
};

export const tipColour = {
  buildDocDefinition: makeMasterReport('TIP COLOUR DETAILS', [
    snoCol,
    { header: 'Tip Colour', width: '*', value: (r) => pick(r, ['TipColour']) },
    { header: 'Status', width: 100, align: 'center', value: (r) => statusText(r.Status) },
  ]),
};

export default { countName, countType, lotNo, otherCharges, salesType, taxType, tipColour };
