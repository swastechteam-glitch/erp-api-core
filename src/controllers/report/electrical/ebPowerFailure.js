// Electrical — EB Power Failure reports.
// Mirrors (both read sp_PowerFailure_GetAll):
//   rptPowerFailure_Individual.rdlc  — one row per failure (date, from, to,
//       failure minutes, reason) + summary (count / total hrs / avg hrs).
//   rptPowerFailureCumulative.rdlc   — grouped by date: failure hrs, no. of
//       failures, average hrs/failure.
// Shares the cotton/_common PDF pipeline (logo + trend chart).

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy, chartFromRows
} from '../cotton/_common.js';

const headRow = (cells) =>
  cells.map((t) => ({ text: t, bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 8 }));
const zebraOf = (i) => (i % 2 === 1 ? colors.zebraFill : null);
const totalStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 };

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}

// hh:mm tt time formatter (TimeFrom / TimeTo are DateTimes).
const hhmm = (d) => {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  let h = dt.getHours();
  const m = String(dt.getMinutes()).padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${String(h).padStart(2, '0')}:${m} ${ap}`;
};

// Summary panel: count / total failure hours / average hours per failure.
function summaryPanel(rows) {
  const count = rows.length;
  const totalMin = rows.reduce((a, r) => a + dec(r, 'TotalMin'), 0);
  const totalHrs = totalMin / 60;
  const avgHrs = count ? totalMin / count / 60 : 0;
  const line = (k, v) => [
    { text: k, fontSize: 8, bold: true },
    { text: v, alignment: 'right', fontSize: 8 }
  ];
  return {
    table: {
      widths: ['*', 90],
      body: [
        [{ text: 'Summary', colSpan: 2, bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 9, margin: [2, 2, 0, 2] }, {}],
        line('No of Failures', fmt(count, 0)),
        line('Total Failure Time (Hours)', fmt(totalHrs, 2)),
        line('Average Time / Failure (Hours)', fmt(avgHrs, 2))
      ]
    },
    layout: tableLayout(), margin: [0, 8, 0, 0]
  };
}

// ---- handlers --------------------------------------------------------------

// Individual — one row per power-failure event.
export const powerFailureIndividual = (req, res) => runReport(req, res, {
  spName: 'sp_PowerFailure_GetAll',
  fileName: 'EBPowerFailure_Individual',
  buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate }) => {
    const list = (rows || []).slice().sort((a, b) => {
      const d = new Date(a.PowerFailureDate) - new Date(b.PowerFailureDate);
      return d || (new Date(a.TimeFrom) - new Date(b.TimeFrom));
    });
    const cols = [
      { header: 'S.No', width: 30, align: 'center', value: (r, i) => String(i + 1) },
      { header: 'Date', width: 70, align: 'center', value: (r) => ddmmyyyy(r.PowerFailureDate) },
      { header: 'From', width: 70, align: 'center', value: (r) => hhmm(r.TimeFrom) },
      { header: 'To', width: 70, align: 'center', value: (r) => hhmm(r.TimeTo) },
      { header: 'Failure Time (Mins)', width: 90, align: 'right', value: (r) => fmt(dec(r, 'TotalMin'), 0) },
      { header: 'Reason', width: '*', align: 'left', value: (r) => str(r, 'Reason') }
    ];
    const body = [headRow(cols.map((c) => c.header))];
    list.forEach((r, i) => {
      const z = zebraOf(i);
      body.push(cols.map((c) => ({ text: c.value(r, i), alignment: c.align || 'left', fontSize: 8, fillColor: z })));
    });
    if (list.length === 0) {
      body.push([{ text: 'No power failures for the selected period.', colSpan: cols.length, italics: true, fontSize: 8, color: '#888' }, ...Array(cols.length - 1).fill({})]);
    } else {
      // Total failure minutes row
      const totMin = list.reduce((a, r) => a + dec(r, 'TotalMin'), 0);
      body.push([
        { text: 'Total', colSpan: 4, alignment: 'right', ...totalStyle }, {}, {}, {},
        { text: fmt(totMin, 0), alignment: 'right', ...totalStyle },
        { text: '', ...totalStyle }
      ]);
    }
    const table = { table: { headerRows: 1, widths: cols.map((c) => c.width), body }, layout: tableLayout() };
    const chart = chartFromRows(list, {
      groupKey: (r) => ddmmyyyy(r.PowerFailureDate), groupLabel: (r) => `Date : ${ddmmyyyy(r.PowerFailureDate)}`,
      valueFn: (r) => dec(r, 'TotalMin') / 60, valueHeader: 'Failure Hours', groupHeader: 'Date', digits: 2
    });
    return buildPage({
      companyName, companyLogo, title: 'POWER FAILURE - INDIVIDUAL', fromDate, toDate,
      tables: [...chart, table, summaryPanel(list)]
    });
  }
});

// Cumulative — grouped by failure date.
export const powerFailureCumulative = (req, res) => runReport(req, res, {
  spName: 'sp_PowerFailure_GetAll',
  fileName: 'EBPowerFailure_Cumulative',
  buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate }) => {
    const groups = [...groupBy(rows || [], (r) => ddmmyyyy(r.PowerFailureDate)).entries()]
      .sort((a, b) => new Date(a[1][0].PowerFailureDate) - new Date(b[1][0].PowerFailureDate));

    const cols = ['Period', 'Failure Time (Hours)', 'No. of Failures', 'Average Time / Failure (Hours)'];
    const body = [headRow(cols)];
    let gMin = 0, gCount = 0;
    groups.forEach(([date, gRows], i) => {
      const z = zebraOf(i);
      const min = gRows.reduce((a, r) => a + dec(r, 'TotalMin'), 0);
      const count = gRows.length;
      gMin += min; gCount += count;
      body.push([
        { text: date, alignment: 'center', fontSize: 8, fillColor: z },
        { text: fmt(min / 60, 2), alignment: 'right', fontSize: 8, fillColor: z },
        { text: fmt(count, 0), alignment: 'center', fontSize: 8, fillColor: z },
        { text: fmt(count ? min / count / 60 : 0, 2), alignment: 'right', fontSize: 8, fillColor: z }
      ]);
    });
    if (groups.length === 0) {
      body.push([{ text: 'No power failures for the selected period.', colSpan: cols.length, italics: true, fontSize: 8, color: '#888' }, ...Array(cols.length - 1).fill({})]);
    } else {
      body.push([
        { text: 'Summary', alignment: 'right', ...totalStyle },
        { text: fmt(gMin / 60, 2), alignment: 'right', ...totalStyle },
        { text: fmt(gCount, 0), alignment: 'center', ...totalStyle },
        { text: fmt(gCount ? gMin / gCount / 60 : 0, 2), alignment: 'right', ...totalStyle }
      ]);
    }
    const table = { table: { headerRows: 1, widths: ['*', '*', '*', '*'], body }, layout: tableLayout() };
    const chart = chartFromRows(rows, {
      groupKey: (r) => ddmmyyyy(r.PowerFailureDate), groupLabel: (r) => `Date : ${ddmmyyyy(r.PowerFailureDate)}`,
      valueFn: (r) => dec(r, 'TotalMin') / 60, valueHeader: 'Failure Hours', groupHeader: 'Date', digits: 2
    });
    return buildPage({
      companyName, companyLogo, title: 'POWER FAILURE - CUMULATIVE (DATE WISE)', fromDate, toDate,
      tables: [...chart, table]
    });
  }
});
