// reports/yarn/gatePassReport.js
// Yarn Gate Pass Report (rptYarnGatePass). One report type ("Date Wise") over
// sp_YarnGatePass_GetAll (CompanyCode + FromDate + ToDate). The VB screen filters
// the rows by the selected Vehicle in JS. Mirrors rptYarnGatePass.rdlc's fields
// (Gate Pass No / Date / Vehicle / Driver header + per-count line items) but as a
// DATE-WISE list across every gate pass in the range: one block per gate pass,
// sorted by date, with a per-gatepass total Qty and a grand total.

const dec = (row, col) => {
  if (!row) return 0;
  const v = row[col];
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};
const str = (row, col) => {
  const v = row ? row[col] : null;
  return (v === null || v === undefined) ? '' : String(v);
};
const intFmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const ddmmyyyy = (d) => {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${dt.getFullYear()}`;
};
const isoDate = (d) => {
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '' : dt.toISOString().slice(0, 10);
};

const COLORS = {
  headerFill: '#1A3C7B',
  headerText: '#FFFFFF',
  groupFill: '#E8F0FE',
  groupText: '#1A3C7B',
  subFill: '#EEF2F7',
  subText: '#1A3C7B',
  grandFill: '#1A3C7B',
  grandText: '#FFFFFF',
  zebraFill: '#FAFBFD',
  borderColor: '#C9CFD8'
};

const layout = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => COLORS.borderColor,
  vLineColor: () => COLORS.borderColor,
  paddingLeft: () => 4,
  paddingRight: () => 4,
  paddingTop: () => 3,
  paddingBottom: () => 3
};

const footer = (currentPage, pageCount) => ({
  margin: [0, 10, 0, 0],
  columns: [
    { text: 'Developed by Swas Technologies, Report Printed : ' + new Date().toLocaleString('en-GB'), fontSize: 7, margin: [15, 0, 0, 0] },
    { text: `${currentPage} / ${pageCount}`, alignment: 'right', fontSize: 7, margin: [0, 0, 15, 0] }
  ]
});

const titleBlock = (companyName, title, dateLine, logoDataUri) => {
  const LOGO_W = 80;
  const logoCol = logoDataUri
    ? { image: logoDataUri, fit: [70, 70], width: LOGO_W, alignment: 'left', margin: [4, 0, 0, 0] }
    : { text: '', width: LOGO_W };
  return {
    columns: [
      logoCol,
      { width: '*', stack: [
        { text: companyName, alignment: 'center', fontSize: 14, bold: true, color: '#000080' },
        { text: title, alignment: 'center', fontSize: 12, bold: true, color: '#7B3F00', margin: [0, 3, 0, 0] },
        { text: dateLine, alignment: 'center', fontSize: 9, bold: true, margin: [0, 3, 0, 0] }
      ] },
      { text: '', width: LOGO_W }
    ],
    margin: [0, 0, 0, 10]
  };
};

const th = (text, extra = {}) => ({ text, bold: true, fillColor: COLORS.headerFill, color: COLORS.headerText, alignment: 'center', fontSize: 9, ...extra });

function buildDateWise(rows, companyName, fromDate, toDate, companyLogo) {
  const COLS = 4; // S.No | Count Type | Name of the Delivery | Qty
  const dateLine = `From : ${ddmmyyyy(fromDate)}   To : ${ddmmyyyy(toDate)}`;
  const body = [[th('S.No'), th('Count Type', { alignment: 'left' }), th('Name of the Delivery', { alignment: 'left' }), th('Qty')]];

  // group by gate pass (fall back to a synthetic key if GatePassNo is absent),
  // ordered by gate-pass date then number.
  const groups = new Map();
  for (const r of rows) {
    const key = str(r, 'GatePassNo') || (str(r, 'InvoiceNo') + '|' + str(r, 'BillNo'));
    if (!groups.has(key)) groups.set(key, { row0: r, rows: [] });
    groups.get(key).rows.push(r);
  }
  const keys = [...groups.keys()].sort((a, b) => {
    const ga = groups.get(a).row0, gb = groups.get(b).row0;
    const da = isoDate(ga.GatePassDate || ga.BillDate), db_ = isoDate(gb.GatePassDate || gb.BillDate);
    if (da !== db_) return da.localeCompare(db_);
    return dec(ga, 'GatePassNo') - dec(gb, 'GatePassNo');
  });

  let grand = 0;
  for (const key of keys) {
    const g = groups.get(key);
    const r0 = g.row0;
    const head = [
      'Gate Pass No : ' + (str(r0, 'GatePassNo') || '-'),
      'Date : ' + (ddmmyyyy(r0.GatePassDate) || ddmmyyyy(r0.BillDate) || '-'),
      'Vehicle : ' + (str(r0, 'VehicleName') || '-'),
      'Driver : ' + (str(r0, 'DriverName') || '-')
    ].join('     ');
    body.push([{ text: head, colSpan: COLS, bold: true, color: COLORS.groupText, fillColor: COLORS.groupFill, margin: [2, 2, 0, 2] }, {}, {}, {}]);

    let sub = 0;
    g.rows.forEach((r, i) => {
      const zebra = i % 2 ? COLORS.zebraFill : null;
      body.push([
        { text: String(i + 1), alignment: 'center', fontSize: 9, fillColor: zebra },
        { text: str(r, 'CountType') || str(r, 'CountName'), fontSize: 9, fillColor: zebra },
        { text: str(r, 'CustomerName') || str(r, 'DeliveryCustomer'), fontSize: 9, fillColor: zebra },
        { text: intFmt(dec(r, 'Qty')), alignment: 'right', fontSize: 9, fillColor: zebra }
      ]);
      sub += dec(r, 'Qty');
    });
    body.push([
      { text: 'Total', colSpan: 3, bold: true, alignment: 'right', fillColor: COLORS.subFill, color: COLORS.subText }, {}, {},
      { text: intFmt(sub), bold: true, alignment: 'right', fillColor: COLORS.subFill, color: COLORS.subText }
    ]);
    grand += sub;
  }
  body.push([
    { text: 'Grand Total', colSpan: 3, bold: true, alignment: 'right', fillColor: COLORS.grandFill, color: COLORS.grandText }, {}, {},
    { text: intFmt(grand), bold: true, alignment: 'right', fillColor: COLORS.grandFill, color: COLORS.grandText }
  ]);

  return {
    pageSize: 'A4',
    pageMargins: [24, 20, 24, 42],
    footer,
    content: [
      titleBlock(companyName, 'Yarn Gate Pass Report - Date Wise', dateLine, companyLogo),
      { table: { headerRows: 1, widths: [32, '*', '*', 55], body }, layout }
    ],
    defaultStyle: { font: 'Roboto', fontSize: 9, lineHeight: 1.15 }
  };
}

export const dateWise = { buildDocDefinition: buildDateWise };

export default { dateWise };
