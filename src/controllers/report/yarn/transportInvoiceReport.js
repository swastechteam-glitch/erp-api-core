// reports/yarn/transportInvoiceReport.js
// Yarn Transport (Freight) Invoice reports sharing one SP and one builder factory.
//   sp_TransportInvoice_GetAll (CompanyCode, FromDate, ToDate)
//
// Exports: dateWise, transporterWise
// Each exports { buildDocDefinition(rows, companyName, fromDate, toDate, companyLogo) }.
//
// Mirrors:
//   rptTransportInvoiceDateWise.rdlc    -> dateWise        (detail grouped by Trans. Invoice Date)
//   rptTransportInvoiceTransport.rdlc   -> transporterWise (detail grouped by Transporter)
//
// Both modes share the same SP and the same numeric columns (Total Bag /
// Amount Per Bag / Total Weight / Amount Per Weight / Trans Amount). They differ
// only in the grouping dimension and which descriptive column is shown: the
// Date Wise variant shows the Transport Name (one date holds many transporters),
// the Transporter Wise variant shows the Trans. Invoice Date instead (the
// transporter is already the group header). Each renders the grouped detail with
// a per-group Total row and a closing Grand Total, exactly like the RDLCs — with
// the company logo + From / To date range on the title block.

const dec = (row, col) => {
  const v = row[col];
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};
const str = (row, col) => {
  const v = row[col];
  return (v === null || v === undefined) ? '' : String(v);
};
const fmt = (n, digits = 2) =>
  Number(n).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const intFmt = (n) =>
  Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const ddmmyyyy = (d) => {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yy = dt.getFullYear();
  return `${dd}/${mm}/${yy}`;
};
const isoDate = (d) => {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '0000-00-00';
  return dt.toISOString().slice(0, 10);
};

const COLORS = {
  headerFill: '#1A3C7B',
  headerText: '#FFFFFF',
  groupFill: '#E8F0FE',
  groupText: '#1A3C7B',
  zebraFill: '#FAFBFD',
  subFill: '#EEF2F7',
  subText: '#1A3C7B',
  grandFill: '#1A3C7B',
  grandText: '#FFFFFF',
  borderColor: '#D7DCE3'
};

const baseLayout = {
  hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0.4),
  vLineWidth: () => 0.4,
  hLineColor: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? COLORS.headerFill : COLORS.borderColor),
  vLineColor: () => COLORS.borderColor,
  paddingLeft: () => 4,
  paddingRight: () => 4,
  paddingTop: () => 5,
  paddingBottom: () => 5
};

const baseFooter = (currentPage, pageCount) => ({
  margin: [0, 12, 0, 0],
  columns: [
    { text: 'Developed by Swas Technologies, Report Printed : ' + new Date().toLocaleString('en-GB'), fontSize: 7, margin: [15, 0, 0, 0] },
    { text: `Page ${currentPage} of ${pageCount}`, alignment: 'right', fontSize: 7, margin: [0, 0, 15, 0] }
  ]
});

const titleBlock = (companyName, title, dateLine, logoDataUri) => {
  const LOGO_COL_WIDTH = 90;
  const logoCol = logoDataUri
    ? { image: logoDataUri, fit: [80, 80], width: LOGO_COL_WIDTH, alignment: 'left', margin: [4, 0, 0, 0] }
    : { text: '', width: LOGO_COL_WIDTH };
  const textCol = {
    width: '*',
    stack: [
      { text: companyName, alignment: 'center', fontSize: 16, bold: true, color: '#7B3F00', margin: [0, 0, 0, 6] },
      { text: title, alignment: 'center', fontSize: 12, bold: true, color: '#008000', margin: [0, 0, 0, 6] },
      { text: dateLine, alignment: 'center', fontSize: 10, bold: true }
    ]
  };
  return {
    columns: [logoCol, textCol, { text: '', width: LOGO_COL_WIDTH }],
    margin: [0, 0, 0, 10]
  };
};

const cellText = (c, r, idx) => {
  if (c.kind === 'sno') return String(idx);
  if (c.kind === 'text') return str(r, c.key);
  if (c.kind === 'date') return ddmmyyyy(r[c.key]);
  const v = dec(r, c.key);
  return (c.kind === 'num') ? fmt(v, 2) : intFmt(v);
};
const totalText = (c, val) => (c.kind === 'num') ? fmt(val, 2) : intFmt(val);

const headerCells = (columns, fs) =>
  columns.map(c => ({ text: c.header, bold: true, fillColor: COLORS.headerFill, color: COLORS.headerText, alignment: 'center', fontSize: fs }));

function makeBuilder(config) {
  return function buildDocDefinition(rows, companyName, fromDate, toDate, companyLogo) {
    const COLS = config.columns;
    const colCount = COLS.length;
    const fs = config.fontSize;
    const firstTotal = COLS.findIndex(c => c.total);
    const dateLine = `From Date : ${ddmmyyyy(fromDate)}    To Date : ${ddmmyyyy(toDate)}`;

    const body = [headerCells(COLS, fs)];

    const dataRow = (r, idx, zebra) =>
      COLS.map(c => ({ text: cellText(c, r, idx), alignment: c.align || 'left', fontSize: fs, fillColor: zebra }));

    // "Total" / "Grand Total" row — the label spans up to the first numeric
    // column (matches the RDLC group/grand footer ColSpan = 5), then each
    // totalled column shows its sum.
    const totalsRow = (label, totals, fill, color) => {
      const row = [{ text: label, colSpan: firstTotal, alignment: 'right', bold: true, color, fillColor: fill, fontSize: fs }];
      for (let k = 1; k < firstTotal; k++) row.push({});
      for (let i = firstTotal; i < COLS.length; i++) {
        const c = COLS[i];
        row.push(c.total
          ? { text: totalText(c, totals[c.key] || 0), alignment: 'right', bold: true, color, fillColor: fill, fontSize: fs }
          : { text: '', fillColor: fill });
      }
      return row;
    };

    const groupsMap = new Map();
    for (const r of rows) {
      const k = config.groupKey(r);
      if (!groupsMap.has(k)) groupsMap.set(k, { label: config.groupLabel(r), rows: [] });
      groupsMap.get(k).rows.push(r);
    }
    const keys = [...groupsMap.keys()].sort(config.sortKeys || ((a, b) => a.localeCompare(b)));

    const grand = {};
    for (const c of COLS) if (c.total) grand[c.key] = 0;

    for (const key of keys) {
      const g = groupsMap.get(key);
      const ghr = [{ text: g.label, colSpan: colCount, bold: true, color: COLORS.groupText, fillColor: COLORS.groupFill, fontSize: fs + 1, margin: [2, 2, 0, 2] }];
      for (let i = 1; i < colCount; i++) ghr.push({});
      body.push(ghr);

      const sub = {};
      for (const c of COLS) if (c.total) sub[c.key] = 0;
      const sorted = g.rows.slice().sort((a, b) => dec(a, 'TransInvoiceNo') - dec(b, 'TransInvoiceNo'));
      let idx = 1;
      for (const r of sorted) {
        body.push(dataRow(r, idx, idx % 2 === 0 ? COLORS.zebraFill : null));
        for (const c of COLS) if (c.total) sub[c.key] += dec(r, c.key);
        idx++;
      }
      body.push(totalsRow('Total', sub, COLORS.subFill, COLORS.subText));
      for (const c of COLS) if (c.total) grand[c.key] += sub[c.key];
    }
    body.push(totalsRow('Grand Total', grand, COLORS.grandFill, COLORS.grandText));

    return {
      pageSize: 'A4',
      pageOrientation: 'portrait',
      pageMargins: [18, 20, 18, 45],
      footer: baseFooter,
      content: [
        titleBlock(companyName, config.title, dateLine, companyLogo),
        {
          table: { headerRows: 1, dontBreakRows: true, keepWithHeaderRows: 0, widths: COLS.map(c => c.width), body },
          layout: baseLayout
        }
      ],
      defaultStyle: { font: 'Roboto', fontSize: fs, lineHeight: 1.2 }
    };
  };
}

// Shared numeric/total columns (Bags & Weight as integers; amounts to 2 dp),
// matching the sibling Agent Commission report's column kinds.
const totalBags = { key: 'TotalBags', header: 'Total Bag', width: 60, align: 'right', kind: 'int', total: true };
const amtPerBag = { key: 'AmountPerBag', header: 'Amount Per Bag', width: 75, align: 'right', kind: 'num', total: true };
const totalWeight = { key: 'TotalWeight', header: 'Total Weight', width: 65, align: 'right', kind: 'int', total: true };
const amtPerWeight = { key: 'AmountPerWeight', header: 'Amount Per Weight', width: 80, align: 'right', kind: 'num', total: true };
const transAmount = { key: 'TransAmount', header: 'Trans Amount', width: 78, align: 'right', kind: 'num', total: true };

// ============================================================================
// DATE WISE — detail grouped by Trans. Invoice Date (rptTransportInvoiceDateWise)
//   Columns: S.No | Trans.Inv No | Trans.Bill No | Trans.Bill Date |
//            Transport Name | Total Bag | Amount Per Bag | Total Weight |
//            Amount Per Weight | Trans Amount
// ============================================================================
const dateWiseConfig = {
  title: 'TRANS INVOICE DETAILS',
  fontSize: 8,
  groupKey: (r) => isoDate(r.TransInvoiceDate),
  groupLabel: (r) => ddmmyyyy(r.TransInvoiceDate),
  sortKeys: (a, b) => a.localeCompare(b),
  columns: [
    { header: 'S.No', width: 28, align: 'center', kind: 'sno' },
    { header: 'Trans.Inv No', width: 60, align: 'center', key: 'TransInvoiceNo', kind: 'int' },
    { header: 'Trans.Bill No', width: 60, align: 'center', key: 'TransporterBillNo', kind: 'int' },
    { header: 'Trans.Bill Date', width: 70, align: 'center', key: 'TransporterBillDate', kind: 'date' },
    { header: 'Transport Name', width: '*', align: 'left', key: 'TransporterName', kind: 'text' },
    totalBags, amtPerBag, totalWeight, amtPerWeight, transAmount
  ]
};

// ============================================================================
// TRANSPORTER WISE — detail grouped by Transporter (rptTransportInvoiceTransport)
//   Columns: S.No | Trans.Inv No | Trans.Inv Date | Trans.Bill No |
//            Trans.Bill Date | Total Bag | Amount Per Bag | Total Weight |
//            Amount Per Weight | Trans Amount
// ============================================================================
const transporterWiseConfig = {
  title: 'TRANS INVOICE TRANSPORT WISE',
  fontSize: 8,
  groupKey: (r) => (r.TransporterCode != null ? String(r.TransporterCode) : '') + '||' + (str(r, 'TransporterName') || '(Unknown)'),
  groupLabel: (r) => str(r, 'TransporterName') || '(Unknown)',
  sortKeys: (a, b) => (a.split('||')[1] || '').localeCompare(b.split('||')[1] || ''),
  columns: [
    { header: 'S.No', width: 28, align: 'center', kind: 'sno' },
    { header: 'Trans.Inv No', width: 60, align: 'center', key: 'TransInvoiceNo', kind: 'int' },
    { header: 'Trans.Inv Date', width: 70, align: 'center', key: 'TransInvoiceDate', kind: 'date' },
    { header: 'Trans.Bill No', width: 60, align: 'center', key: 'TransporterBillNo', kind: 'int' },
    { header: 'Trans.Bill Date', width: 70, align: 'center', key: 'TransporterBillDate', kind: 'date' },
    totalBags, amtPerBag, totalWeight, amtPerWeight, transAmount
  ]
};

export const dateWise = { buildDocDefinition: makeBuilder(dateWiseConfig) };
export const transporterWise = { buildDocDefinition: makeBuilder(transporterWiseConfig) };

export default { dateWise, transporterWise };
