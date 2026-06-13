// WeighBridge — Weighment reports.
// Mirrors (all read sp_WeighBridge_GetAll):
//   rptWeighmentDateWise.rdlc    — flat list sorted by weighment date.
//   rptWeighmentItemWise.rdlc    — grouped by material, per-group + grand total.
//   rptWeighmentVehicleWise.rdlc — grouped by vehicle, per-group + grand total.
// Columns: Wg.No, Date, Veh.Type, Vehicle No, Supplier, Material, Gross / Tare /
// Net weight (+ gross & tare weighment times). Shares the cotton/_common PDF
// pipeline (logo + trend chart).

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy, chartFromRows
} from '../cotton/_common.js';

const headRow = (cells) =>
  cells.map((t) => ({ text: t, bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 7 }));
const groupRowNode = (label, span) =>
  [{ text: label, colSpan: span, bold: true, color: colors.groupText, fillColor: colors.groupFill, fontSize: 9, margin: [2, 2, 0, 2] }, ...Array(span - 1).fill({})];
const zebraOf = (i) => (i % 2 === 1 ? colors.zebraFill : null);
const totalStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 8 };
const subStyle = { bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 8 };

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}

// Column dictionary. `sum` columns participate in subtotal / grand-total rows.
const COLS = [
  { header: 'S.No', width: 28, align: 'center', value: (r, i) => String(i) },
  { header: 'Wg.No', width: 44, align: 'center', value: (r) => fmt(dec(r, 'WeighmentNumber'), 0) },
  { header: 'Date', width: 60, align: 'center', value: (r) => ddmmyyyy(r.WeighmentDate) },
  { header: 'Veh.Type', width: 60, align: 'center', value: (r) => str(r, 'VehicleType') },
  { header: 'Vehicle No', width: 80, align: 'left', value: (r) => str(r, 'VehicleNumber') },
  { header: 'Supplier Name', width: '*', align: 'left', value: (r) => str(r, 'SupplierName') },
  { header: 'Material Name', width: '*', align: 'left', value: (r) => str(r, 'MaterialName') },
  { header: 'Gross Weight', width: 64, align: 'right', value: (r) => fmt(dec(r, 'GrossWeight'), 2), sum: 'GrossWeight' },
  { header: 'G.Time', width: 52, align: 'center', value: (r) => str(r, 'GrossWeighmentTime') },
  { header: 'Tare Weight', width: 64, align: 'right', value: (r) => fmt(dec(r, 'TareWeight'), 2), sum: 'TareWeight' },
  { header: 'T.Time', width: 52, align: 'center', value: (r) => str(r, 'TareWeighmentTime') },
  { header: 'Nett', width: 64, align: 'right', value: (r) => fmt(dec(r, 'NetWeight'), 2), sum: 'NetWeight' }
];
const WIDTHS = COLS.map((c) => c.width);
const SPAN = COLS.length;

// build a totals cell-row (label spanning up to the first sum column).
function totalsRow(label, rows, style) {
  const firstSum = COLS.findIndex((c) => c.sum);
  const cells = [{ text: label, colSpan: firstSum, alignment: 'right', ...style }];
  for (let i = 1; i < firstSum; i++) cells.push({});
  for (let i = firstSum; i < COLS.length; i++) {
    const c = COLS[i];
    cells.push(c.sum
      ? { text: fmt(rows.reduce((a, r) => a + dec(r, c.sum), 0), 2), alignment: 'right', ...style }
      : { text: '', ...style });
  }
  return cells;
}

const netChart = (rows, groupKeyFn, groupLabelFn, header) => chartFromRows(rows, {
  groupKey: groupKeyFn, groupLabel: groupLabelFn,
  valueFn: (r) => dec(r, 'NetWeight'), valueHeader: 'Net Weight', groupHeader: header, digits: 2
});

// ---- handlers --------------------------------------------------------------

// Date Wise — flat list with a single grand total.
export const weighmentDateWise = (req, res) => runReport(req, res, {
  spName: 'sp_WeighBridge_GetAll',
  fileName: 'Weighment_DateWise',
  buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate }) => {
    const list = (rows || []).slice().sort((a, b) =>
      (new Date(a.WeighmentDate) - new Date(b.WeighmentDate)) || (dec(a, 'WeighmentNumber') - dec(b, 'WeighmentNumber')));
    const body = [headRow(COLS.map((c) => c.header))];
    list.forEach((r, i) => {
      const z = zebraOf(i);
      body.push(COLS.map((c) => ({ text: c.value(r, i + 1), alignment: c.align || 'left', fontSize: 7, fillColor: z })));
    });
    if (list.length === 0) {
      body.push([{ text: 'No weighments for the selected period.', colSpan: SPAN, italics: true, fontSize: 8, color: '#888' }, ...Array(SPAN - 1).fill({})]);
    } else {
      body.push(totalsRow('Total', list, totalStyle));
    }
    const table = { table: { headerRows: 1, widths: WIDTHS, body }, layout: tableLayout() };
    const chart = netChart(list, (r) => ddmmyyyy(r.WeighmentDate), (r) => `Date : ${ddmmyyyy(r.WeighmentDate)}`, 'Date');
    return buildPage({ companyName, companyLogo, title: 'WEIGHMENT REPORT - DATE WISE', fromDate, toDate, tables: [...chart, table] });
  }
});

// Grouped variants (item / vehicle) share one builder.
function groupedWeighment({ title, fileName, groupKeyFn, groupLabelFn, chartHeader }) {
  return (req, res) => runReport(req, res, {
    spName: 'sp_WeighBridge_GetAll',
    fileName,
    buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate }) => {
      const groups = [...groupBy(rows || [], groupKeyFn).entries()]
        .sort((a, b) => groupLabelFn(a[1][0]).localeCompare(groupLabelFn(b[1][0])));
      const body = [headRow(COLS.map((c) => c.header))];
      let sno = 0;
      for (const [, gRows] of groups) {
        gRows.sort((a, b) => new Date(a.WeighmentDate) - new Date(b.WeighmentDate));
        body.push(groupRowNode(groupLabelFn(gRows[0]), SPAN));
        gRows.forEach((r) => {
          sno++;
          const z = zebraOf(sno);
          body.push(COLS.map((c) => ({ text: c.value(r, sno), alignment: c.align || 'left', fontSize: 7, fillColor: z })));
        });
        body.push(totalsRow('Sub Total', gRows, subStyle));
      }
      if ((rows || []).length === 0) {
        body.push([{ text: 'No weighments for the selected period.', colSpan: SPAN, italics: true, fontSize: 8, color: '#888' }, ...Array(SPAN - 1).fill({})]);
      } else {
        body.push(totalsRow('Grand Total', rows, totalStyle));
      }
      const table = { table: { headerRows: 1, widths: WIDTHS, body }, layout: tableLayout() };
      const chart = netChart(rows, groupKeyFn, groupLabelFn, chartHeader);
      return buildPage({ companyName, companyLogo, title, fromDate, toDate, tables: [...chart, table] });
    }
  });
}

// Item Wise — grouped by material.
export const weighmentItemWise = groupedWeighment({
  title: 'WEIGHMENT REPORT - ITEM WISE',
  fileName: 'Weighment_ItemWise',
  groupKeyFn: (r) => str(r, 'MaterialName') || str(r, 'ItemName'),
  groupLabelFn: (r) => str(r, 'MaterialName') || str(r, 'ItemName') || '(No Material)',
  chartHeader: 'Material'
});

// Vehicle Wise — grouped by vehicle number.
export const weighmentVehicleWise = groupedWeighment({
  title: 'WEIGHMENT REPORT - VEHICLE WISE',
  fileName: 'Weighment_VehicleWise',
  groupKeyFn: (r) => str(r, 'VehicleNumber'),
  groupLabelFn: (r) => str(r, 'VehicleNumber') || '(No Vehicle)',
  chartHeader: 'Vehicle'
});
