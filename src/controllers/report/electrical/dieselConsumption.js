// Electrical — Diesel Consumption report.
// Mirrors rptDiselConsumption.rdlc (sp_Diesel_Consumption): a daily detail table
// (Opening / Receipt / Issue / Closing / Units / UPL / Power Cost) plus a
// summary panel (opening, receipt, gen issue, other issue, closing, units, UPL).
// Shares the cotton/_common PDF pipeline (logo + trend chart).

import {
  runReport, buildPage, tableLayout, colors,
  dec, fmt, ddmmyyyy, chartFromRows
} from '../cotton/_common.js';

const headRow = (cells) =>
  cells.map((t) => ({ text: t, bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 8 }));
const zebraOf = (i) => (i % 2 === 1 ? colors.zebraFill : null);
const totalStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 };

export const dieselDateWise = (req, res) => runReport(req, res, {
  spName: 'sp_Diesel_Consumption',
  fileName: 'DieselConsumption_DateWise',
  buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate }) => {
    const list = (rows || []).slice().sort((a, b) => new Date(a.DieselDate) - new Date(b.DieselDate));

    const cols = [
      { header: 'Date', width: 70, align: 'center', value: (r) => ddmmyyyy(r.DieselDate) },
      { header: 'Opn Stock', width: '*', align: 'right', value: (r) => fmt(dec(r, 'OpeningQTy'), 2) },
      { header: 'Receipt', width: '*', align: 'right', value: (r) => fmt(dec(r, 'ReceiptQty'), 2), sum: 'ReceiptQty' },
      { header: 'Issue', width: '*', align: 'right', value: (r) => fmt(dec(r, 'IssueQty'), 2), sum: 'IssueQty' },
      { header: 'Closing', width: '*', align: 'right', value: (r) => fmt(dec(r, 'ClosingQty'), 2) },
      { header: 'Units', width: '*', align: 'right', value: (r) => fmt(dec(r, 'Units'), 2), sum: 'Units' },
      { header: 'UPL', width: 60, align: 'right', value: (r) => fmt(dec(r, 'UPL'), 2), avg: 'UPL' },
      { header: 'Power Cost', width: '*', align: 'right', value: (r) => fmt(dec(r, 'PowerCost'), 2), sum: 'PowerCost' }
    ];

    const body = [headRow(cols.map((c) => c.header))];
    list.forEach((r, i) => {
      const z = zebraOf(i);
      body.push(cols.map((c) => ({ text: c.value(r), alignment: c.align || 'left', fontSize: 8, fillColor: z })));
    });
    if (list.length === 0) {
      body.push([{ text: 'No diesel entries for the selected period.', colSpan: cols.length, italics: true, fontSize: 8, color: '#888' }, ...Array(cols.length - 1).fill({})]);
    } else {
      const cells = [{ text: 'Total', alignment: 'right', ...totalStyle }];
      cols.slice(1).forEach((c) => {
        if (c.sum) {
          const t = list.reduce((a, r) => a + dec(r, c.sum), 0);
          cells.push({ text: fmt(t, 2), alignment: 'right', ...totalStyle });
        } else if (c.avg) {
          const t = list.reduce((a, r) => a + dec(r, c.avg), 0) / (list.length || 1);
          cells.push({ text: fmt(t, 2), alignment: 'right', ...totalStyle });
        } else {
          cells.push({ text: '', ...totalStyle });
        }
      });
      body.push(cells);
    }
    const table = { table: { headerRows: 1, widths: cols.map((c) => c.width), body }, layout: tableLayout() };

    // Summary panel — mirrors the RDLC's left-hand summary box.
    const sum = (col) => list.reduce((a, r) => a + dec(r, col), 0);
    const openingStock = list.length ? dec(list[0], 'OpeningQTy') : 0;
    const closingStock = list.length ? dec(list[list.length - 1], 'ClosingQty') : 0;
    const avgUpl = list.length ? sum('UPL') / list.length : 0;
    const sline = (k, v, i) => {
      const z = zebraOf(i);
      return [{ text: k, fontSize: 8, fillColor: z }, { text: v, alignment: 'right', fontSize: 8, fillColor: z }];
    };
    const summary = {
      table: {
        widths: ['*', 90],
        body: [
          [{ text: 'Summary', colSpan: 2, bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 9, margin: [2, 2, 0, 2] }, {}],
          sline('Opening Stock', fmt(openingStock, 2), 0),
          sline('Receipt', fmt(sum('ReceiptQty'), 2), 1),
          sline('Issues (Generator)', fmt(list.length ? dec(list[0], 'GenIssQty') : 0, 2), 2),
          sline('Other Diesel Issue', fmt(list.length ? dec(list[0], 'VecIssQty') : 0, 2), 3),
          sline('Closing Stock', fmt(closingStock, 2), 4),
          sline('Units Generated', fmt(sum('Units'), 2), 5),
          sline('Units / litre', fmt(avgUpl, 2), 6)
        ]
      },
      layout: tableLayout(), margin: [0, 8, 0, 0]
    };

    const chart = chartFromRows(list, {
      groupKey: (r) => ddmmyyyy(r.DieselDate), groupLabel: (r) => `Date : ${ddmmyyyy(r.DieselDate)}`,
      valueFn: (r) => dec(r, 'Units'), valueHeader: 'Units Generated', groupHeader: 'Date', digits: 2
    });

    return buildPage({
      companyName, companyLogo, title: 'DIESEL CONSUMPTION', fromDate, toDate,
      tables: [...chart, table, summary]
    });
  }
});
