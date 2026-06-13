// Electrical — Generator Reading reports.
// Mirrors (both read sp_GeneratorReadingDetails_GetAll):
//   rptGeneratorReadingConsoildation_MachineGroupWise.rdlc — flat consolidation
//       (S.No, Machine, Date, KWH, Diesel, UPL, Run Hours, Cur/Cum Run Hr).
//   rptGeneratorReadingConsoildation_MonthWise.rdlc — grouped by machine, then
//       month, with summed KWH / Diesel / UPL / run hours.
// KWH = Difference, UPL = UPI, Cum Run Hr = RunHours + CurrentRunHours.
// Shares the cotton/_common PDF pipeline (logo + trend chart).

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy, chartFromRows
} from '../cotton/_common.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const headRow = (cells) =>
  cells.map((t) => ({ text: t, bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 8 }));
const groupRowNode = (label, span) =>
  [{ text: label, colSpan: span, bold: true, color: colors.groupText, fillColor: colors.groupFill, fontSize: 9, margin: [2, 2, 0, 2] }, ...Array(span - 1).fill({})];
const zebraOf = (i) => (i % 2 === 1 ? colors.zebraFill : null);
const totalStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 };
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

const kwh = (r) => dec(r, 'Difference');
const cum = (r) => dec(r, 'RunHours') + dec(r, 'CurrentRunHours');

// ---- handlers --------------------------------------------------------------

// Date Wise — flat consolidation, one row per generator reading.
export const generatorDateWise = (req, res) => runReport(req, res, {
  spName: 'sp_GeneratorReadingDetails_GetAll',
  fileName: 'GeneratorReading_DateWise',
  buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate }) => {
    const list = (rows || []).slice().sort((a, b) => (new Date(a.GRDate) - new Date(b.GRDate)) || (dec(a, 'GRCode') - dec(b, 'GRCode')));
    const cols = [
      { header: 'S.No', width: 28, align: 'center', value: (r, i) => String(i + 1) },
      { header: 'Machine', width: '*', align: 'left', value: (r) => str(r, 'MachineName') },
      { header: 'Date', width: 64, align: 'center', value: (r) => ddmmyyyy(r.GRDate) },
      { header: 'KWH', width: '*', align: 'right', value: (r) => fmt(kwh(r), 2), sum: kwh },
      { header: 'Diesel LTR', width: '*', align: 'right', value: (r) => fmt(dec(r, 'Diesel'), 2), sum: (r) => dec(r, 'Diesel') },
      { header: 'UPL KWH', width: 64, align: 'right', value: (r) => fmt(dec(r, 'UPI'), 2) },
      { header: 'Run Hours', width: 64, align: 'right', value: (r) => fmt(dec(r, 'RunHours'), 2), sum: (r) => dec(r, 'RunHours') },
      { header: 'Cur Run HR', width: 64, align: 'right', value: (r) => fmt(dec(r, 'CurrentRunHours'), 2), sum: (r) => dec(r, 'CurrentRunHours') },
      { header: 'Cum Run HR', width: 64, align: 'right', value: (r) => fmt(cum(r), 2), sum: cum }
    ];
    const body = [headRow(cols.map((c) => c.header))];
    list.forEach((r, i) => {
      const z = zebraOf(i);
      body.push(cols.map((c) => ({ text: c.value(r, i), alignment: c.align || 'left', fontSize: 8, fillColor: z })));
    });
    if (list.length === 0) {
      body.push([{ text: 'No generator readings for the selected period.', colSpan: cols.length, italics: true, fontSize: 8, color: '#888' }, ...Array(cols.length - 1).fill({})]);
    } else {
      const firstSum = cols.findIndex((c) => c.sum);
      const cells = [{ text: 'Total', colSpan: firstSum, alignment: 'right', ...totalStyle }];
      for (let i = 1; i < firstSum; i++) cells.push({});
      for (let i = firstSum; i < cols.length; i++) {
        const c = cols[i];
        cells.push(c.sum
          ? { text: fmt(list.reduce((a, r) => a + c.sum(r), 0), 2), alignment: 'right', ...totalStyle }
          : { text: '', ...totalStyle });
      }
      body.push(cells);
    }
    const table = { table: { headerRows: 1, widths: cols.map((c) => c.width), body }, layout: tableLayout() };
    const chart = chartFromRows(list, {
      groupKey: (r) => ddmmyyyy(r.GRDate), groupLabel: (r) => `Date : ${ddmmyyyy(r.GRDate)}`,
      valueFn: kwh, valueHeader: 'KWH', groupHeader: 'Date', digits: 2
    });
    return buildPage({ companyName, companyLogo, title: 'GENERATOR RUN DETAILS - CONSOLIDATION', fromDate, toDate, tables: [...chart, table] });
  }
});

// Month Wise — grouped by machine, one row per month (summed).
export const generatorMonthWise = (req, res) => runReport(req, res, {
  spName: 'sp_GeneratorReadingDetails_GetAll',
  fileName: 'GeneratorReading_MonthWise',
  buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate }) => {
    const cols = ['Month', 'KWH', 'Diesel LTR', 'UPL KWH', 'Run Hours', 'Cur Run HR', 'Cum Run HR'];
    const span = cols.length;
    const body = [headRow(cols)];
    const machines = [...groupBy(rows || [], (r) => str(r, 'MachineName')).entries()]
      .sort((a, b) => a[0].localeCompare(b[0]));

    const grand = { kwh: 0, diesel: 0, upi: 0, run: 0, cur: 0, cum: 0 };
    const monthRowsForChart = [];

    for (const [machine, mRows] of machines) {
      body.push(groupRowNode(machine || '(Machine)', span));
      const byMonth = [...groupBy(mRows, (r) => new Date(r.GRDate).getMonth()).entries()]
        .sort((a, b) => a[0] - b[0]);
      const sub = { kwh: 0, diesel: 0, upi: 0, run: 0, cur: 0, cum: 0 };
      byMonth.forEach(([m, gRows], i) => {
        const agg = {
          kwh: gRows.reduce((a, r) => a + kwh(r), 0),
          diesel: gRows.reduce((a, r) => a + dec(r, 'Diesel'), 0),
          upi: gRows.reduce((a, r) => a + dec(r, 'UPI'), 0),
          run: gRows.reduce((a, r) => a + dec(r, 'RunHours'), 0),
          cur: gRows.reduce((a, r) => a + dec(r, 'CurrentRunHours'), 0),
          cum: gRows.reduce((a, r) => a + cum(r), 0)
        };
        Object.keys(sub).forEach((k) => { sub[k] += agg[k]; grand[k] += agg[k]; });
        monthRowsForChart.push({ label: `${MONTHS[m]} - ${machine}`, v: agg.kwh });
        const z = zebraOf(i);
        body.push([
          { text: MONTHS[m] || '', fontSize: 8, fillColor: z },
          { text: fmt(agg.kwh, 2), alignment: 'right', fontSize: 8, fillColor: z },
          { text: fmt(agg.diesel, 2), alignment: 'right', fontSize: 8, fillColor: z },
          { text: fmt(agg.upi, 2), alignment: 'right', fontSize: 8, fillColor: z },
          { text: fmt(agg.run, 2), alignment: 'right', fontSize: 8, fillColor: z },
          { text: fmt(agg.cur, 2), alignment: 'right', fontSize: 8, fillColor: z },
          { text: fmt(agg.cum, 2), alignment: 'right', fontSize: 8, fillColor: z }
        ]);
      });
      body.push([
        { text: 'Sub Total', alignment: 'right', ...subStyle },
        { text: fmt(sub.kwh, 2), alignment: 'right', ...subStyle },
        { text: fmt(sub.diesel, 2), alignment: 'right', ...subStyle },
        { text: fmt(sub.upi, 2), alignment: 'right', ...subStyle },
        { text: fmt(sub.run, 2), alignment: 'right', ...subStyle },
        { text: fmt(sub.cur, 2), alignment: 'right', ...subStyle },
        { text: fmt(sub.cum, 2), alignment: 'right', ...subStyle }
      ]);
    }

    if ((rows || []).length === 0) {
      body.push([{ text: 'No generator readings for the selected period.', colSpan: span, italics: true, fontSize: 8, color: '#888' }, ...Array(span - 1).fill({})]);
    } else {
      body.push([
        { text: 'Grand Total', alignment: 'right', ...totalStyle },
        { text: fmt(grand.kwh, 2), alignment: 'right', ...totalStyle },
        { text: fmt(grand.diesel, 2), alignment: 'right', ...totalStyle },
        { text: fmt(grand.upi, 2), alignment: 'right', ...totalStyle },
        { text: fmt(grand.run, 2), alignment: 'right', ...totalStyle },
        { text: fmt(grand.cur, 2), alignment: 'right', ...totalStyle },
        { text: fmt(grand.cum, 2), alignment: 'right', ...totalStyle }
      ]);
    }
    const table = { table: { headerRows: 1, widths: ['*', '*', '*', '*', '*', '*', '*'], body }, layout: tableLayout() };
    const chart = chartFromRows(monthRowsForChart, {
      groupKey: (r) => r.label, groupLabel: (r) => r.label, valueFn: (r) => r.v,
      valueHeader: 'KWH', groupHeader: 'Month', digits: 2
    });
    return buildPage({ companyName, companyLogo, title: 'GENERATOR RUN DETAILS - MONTH WISE', fromDate, toDate, tables: [...chart, table] });
  }
});
