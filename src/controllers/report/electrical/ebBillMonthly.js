// Electrical — EB Bill Monthly report.
// Mirrors rptEBBill.rdlc (sp_EBMonth_AS_Per_EB): EB bill particulars with a
// Total + C1..C5 columns, ordered by OrderNo. Values <= 0 render blank.
// Shares the cotton/_common PDF pipeline (logo + trend chart).

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, chartFromRows
} from '../cotton/_common.js';

const headRow = (cells) =>
  cells.map((t) => ({ text: t, bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 8 }));
const zebraOf = (i) => (i % 2 === 1 ? colors.zebraFill : null);
const blankIfZero = (v) => (v > 0 ? fmt(v, 2) : '');

export const ebBillDateWise = (req, res) => runReport(req, res, {
  spName: 'sp_EBMonth_AS_Per_EB',
  fileName: 'EBBillMonthly',
  buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate }) => {
    const list = (rows || []).slice().sort((a, b) => {
      const o = dec(a, 'OrderNo') - dec(b, 'OrderNo');
      return o || str(a, 'Particular').localeCompare(str(b, 'Particular'));
    });

    const cols = [
      { header: 'Particular', width: '*', align: 'left', value: (r) => str(r, 'Particular') },
      { header: 'Total', width: 80, align: 'right', value: (r) => blankIfZero(dec(r, 'Total')) },
      { header: 'C1', width: 64, align: 'right', value: (r) => blankIfZero(dec(r, 'C1')) },
      { header: 'C2', width: 64, align: 'right', value: (r) => blankIfZero(dec(r, 'C2')) },
      { header: 'C3', width: 64, align: 'right', value: (r) => blankIfZero(dec(r, 'C3')) },
      { header: 'C4', width: 64, align: 'right', value: (r) => blankIfZero(dec(r, 'C4')) },
      { header: 'C5', width: 64, align: 'right', value: (r) => blankIfZero(dec(r, 'C5')) }
    ];

    const body = [headRow(cols.map((c) => c.header))];
    list.forEach((r, i) => {
      const z = zebraOf(i);
      body.push(cols.map((c) => ({ text: c.value(r), alignment: c.align || 'left', fontSize: 8, fillColor: z })));
    });
    if (list.length === 0) {
      body.push([{ text: 'No EB bill data for the selected period.', colSpan: cols.length, italics: true, fontSize: 8, color: '#888' }, ...Array(cols.length - 1).fill({})]);
    }
    const table = { table: { headerRows: 1, widths: cols.map((c) => c.width), body }, layout: tableLayout() };

    // Chart: the Total of each particular that actually carries a value.
    const chart = chartFromRows(list.filter((r) => dec(r, 'Total') > 0), {
      groupKey: (r) => str(r, 'Particular'), groupLabel: (r) => str(r, 'Particular'),
      valueFn: (r) => dec(r, 'Total'), valueHeader: 'Total', groupHeader: 'Particular', digits: 2
    });

    return buildPage({ companyName, companyLogo, title: 'EB BILL REPORT', fromDate, toDate, tables: [...chart, table] });
  }
});
