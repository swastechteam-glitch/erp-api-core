// Electrical — Slot Wise EB Reading reports.
// Mirrors:
//   rptEBSlotDateWise.rdlc / rptEBSlotMonthWise.rdlc / rptEBSlotYearWise.rdlc
//       (sp_SlotWiseReadingDetails_GetAll) — slot consumption (Difference) pivoted
//       with slots as columns, grouped by date / month / year.
//   rptEBSlot_PowerCategory_Datewise.rdlc (sp_EBSlot_PowerCategory_DateWise) —
//       per-day C1..C5 + Day/Peak/Night units, grouped by power category.
// Shares the cotton/_common PDF pipeline (logo + trend chart).

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy, chartFromRows
} from '../cotton/_common.js';

// ---- helpers ---------------------------------------------------------------
const headRow = (cells) =>
  cells.map((t) => ({ text: t, bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 8 }));
const groupRowNode = (label, span) =>
  [{ text: label, colSpan: span, bold: true, color: colors.groupText, fillColor: colors.groupFill, fontSize: 9, margin: [2, 2, 0, 2] }, ...Array(span - 1).fill({})];
const zebraOf = (i) => (i % 2 === 1 ? colors.zebraFill : null);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}

// Generic pivot: one row per rowKey, one column per distinct colKey, each cell
// the summed value, plus a per-row Total and a closing Grand Total row.
function buildPivot(rows, { rowKeyFn, rowLabelFn, rowSort, colKeyFn, colLabelFn, valueFn, rowHeader }) {
  // distinct columns (sorted by label)
  const colMap = new Map();
  for (const r of rows || []) {
    const k = colKeyFn(r);
    if (k === null || k === undefined || k === '') continue;
    if (!colMap.has(k)) colMap.set(k, String(colLabelFn(r) || ''));
  }
  const cols = [...colMap.entries()].sort((a, b) => a[1].localeCompare(b[1]));

  // rows -> { label, byCol{}, total }
  const rowMap = new Map();
  for (const r of rows || []) {
    const rk = rowKeyFn(r);
    if (!rowMap.has(rk)) rowMap.set(rk, { label: String(rowLabelFn(r) || ''), sample: r, byCol: {}, total: 0 });
    const v = Number(valueFn(r)) || 0;
    const ck = colKeyFn(r);
    rowMap.get(rk).byCol[ck] = (rowMap.get(rk).byCol[ck] || 0) + v;
    rowMap.get(rk).total += v;
  }
  let rowEntries = [...rowMap.entries()];
  if (rowSort) rowEntries.sort((a, b) => rowSort(a[1].sample, b[1].sample));

  const header = headRow([rowHeader, ...cols.map((c) => c[1]), 'Total']);
  const body = [header];
  const colTotals = cols.map(() => 0);
  let grand = 0;

  rowEntries.forEach(([, row], i) => {
    const z = zebraOf(i);
    const cells = [{ text: row.label, fontSize: 8, fillColor: z }];
    cols.forEach(([ck], ci) => {
      const v = row.byCol[ck] || 0;
      colTotals[ci] += v;
      cells.push({ text: v ? fmt(v, 0) : '', alignment: 'right', fontSize: 8, fillColor: z });
    });
    grand += row.total;
    cells.push({ text: fmt(row.total, 0), alignment: 'right', bold: true, fontSize: 8, fillColor: z });
    body.push(cells);
  });

  if (rowEntries.length === 0) {
    body.push([{ text: 'No data for the selected period.', colSpan: cols.length + 2, italics: true, fontSize: 8, color: '#888' }, ...Array(cols.length + 1).fill({})]);
  } else {
    const totalCells = [{ text: 'Grand Total', bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 }];
    colTotals.forEach((v) => totalCells.push({ text: fmt(v, 0), alignment: 'right', bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 }));
    totalCells.push({ text: fmt(grand, 0), alignment: 'right', bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 });
    body.push(totalCells);
  }

  const widths = [90, ...cols.map(() => '*'), 70];
  return { table: { headerRows: 1, widths, body }, layout: tableLayout() };
}

function makeSlotPivot({ title, rowKeyFn, rowLabelFn, rowSort, chartGroupHeader }) {
  return ({ rows, companyName, companyLogo, fromDate, toDate }) => {
    const pivot = buildPivot(rows, {
      rowKeyFn, rowLabelFn, rowSort,
      colKeyFn: (r) => str(r, 'SlotName') || str(r, 'SlotCode'),
      colLabelFn: (r) => str(r, 'SlotName'),
      valueFn: (r) => dec(r, 'Difference'),
      rowHeader: chartGroupHeader
    });
    // chart: total units by the row dimension
    const chart = chartFromRows((rows || []).map((r) => ({ ...r, __k: rowKeyFn(r), __l: rowLabelFn(r) })), {
      groupKey: (r) => r.__k, groupLabel: (r) => r.__l,
      valueFn: (r) => dec(r, 'Difference'),
      valueHeader: 'Units (KWH)', groupHeader: chartGroupHeader, digits: 0
    });
    return buildPage({ companyName, companyLogo, title, fromDate, toDate, tables: [...chart, pivot] });
  };
}

// ---- handlers: slot reading pivots (sp_SlotWiseReadingDetails_GetAll) -------

export const slotDateWise = (req, res) => runReport(req, res, {
  spName: 'sp_SlotWiseReadingDetails_GetAll',
  fileName: 'SlotWiseEBReading_DateWise',
  buildDocDefinition: makeSlotPivot({
    title: 'EB SLOTWISE REPORT - DATE WISE',
    rowKeyFn: (r) => ddmmyyyy(r.SWRDate),
    rowLabelFn: (r) => ddmmyyyy(r.SWRDate),
    rowSort: (a, b) => new Date(a.SWRDate) - new Date(b.SWRDate),
    chartGroupHeader: 'Date'
  })
});

export const slotMonthWise = (req, res) => runReport(req, res, {
  spName: 'sp_SlotWiseReadingDetails_GetAll',
  fileName: 'SlotWiseEBReading_MonthWise',
  buildDocDefinition: makeSlotPivot({
    title: 'EB SLOTWISE MONTHLY REPORT',
    rowKeyFn: (r) => new Date(r.SWRDate).getMonth(),
    rowLabelFn: (r) => MONTHS[new Date(r.SWRDate).getMonth()] || '',
    rowSort: (a, b) => new Date(a.SWRDate).getMonth() - new Date(b.SWRDate).getMonth(),
    chartGroupHeader: 'Month'
  })
});

export const slotYearWise = (req, res) => runReport(req, res, {
  spName: 'sp_SlotWiseReadingDetails_GetAll',
  fileName: 'SlotWiseEBReading_YearWise',
  buildDocDefinition: makeSlotPivot({
    title: 'EB SLOTWISE YEARLY REPORT',
    rowKeyFn: (r) => new Date(r.SWRDate).getFullYear(),
    rowLabelFn: (r) => String(new Date(r.SWRDate).getFullYear()),
    rowSort: (a, b) => new Date(a.SWRDate).getFullYear() - new Date(b.SWRDate).getFullYear(),
    chartGroupHeader: 'Year'
  })
});

// ---- handler: power-category date-wise (sp_EBSlot_PowerCategory_DateWise) ---
// Grouped by power category; one detail row per reading date with C1..C5 slot
// totals + Day/Peak/Night units.
export const powerCategoryDateWise = (req, res) => runReport(req, res, {
  spName: 'sp_EBSlot_PowerCategory_DateWise',
  fileName: 'SlotWiseEBReading_PowerCategoryDateWise',
  buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate }) => {
    const cols = [
      { header: 'Date', width: 64, align: 'center', value: (r) => ddmmyyyy(r.ReadingDate) },
      { header: 'C1', width: '*', align: 'right', value: (r) => fmt(dec(r, 'C1'), 0), key: 'C1' },
      { header: 'C2', width: '*', align: 'right', value: (r) => fmt(dec(r, 'C2'), 0), key: 'C2' },
      { header: 'C3', width: '*', align: 'right', value: (r) => fmt(dec(r, 'C3'), 0), key: 'C3' },
      { header: 'C4', width: '*', align: 'right', value: (r) => fmt(dec(r, 'C4'), 0), key: 'C4' },
      { header: 'C5', width: '*', align: 'right', value: (r) => fmt(dec(r, 'C5'), 0), key: 'C5' },
      { header: 'Total', width: '*', align: 'right', value: (r) => fmt(dec(r, 'C1') + dec(r, 'C2') + dec(r, 'C3') + dec(r, 'C4') + dec(r, 'C5'), 0), key: '__tot' },
      { header: 'Day', width: '*', align: 'right', value: (r) => fmt(dec(r, 'Day_Unit'), 0), key: 'Day_Unit' },
      { header: 'Peak', width: '*', align: 'right', value: (r) => fmt(dec(r, 'Peak_Unit'), 0), key: 'Peak_Unit' },
      { header: 'Night', width: '*', align: 'right', value: (r) => fmt(dec(r, 'Night_unit'), 0), key: 'Night_unit' }
    ];
    const rowTot = (r) => dec(r, 'C1') + dec(r, 'C2') + dec(r, 'C3') + dec(r, 'C4') + dec(r, 'C5');
    const numOf = (r, key) => (key === '__tot' ? rowTot(r) : dec(r, key));
    const span = cols.length;

    const body = [headRow(cols.map((c) => c.header))];
    const groups = [...groupBy(rows || [], (r) => str(r, 'PowerCategoryName')).entries()]
      .sort((a, b) => a[0].localeCompare(b[0]));
    const grand = {};
    cols.forEach((c) => { if (c.key) grand[c.key] = 0; });

    for (const [, gRows] of groups) {
      gRows.sort((a, b) => new Date(a.ReadingDate) - new Date(b.ReadingDate));
      body.push(groupRowNode(`Power Category : ${str(gRows[0], 'PowerCategoryName')}`, span));
      const sub = {};
      cols.forEach((c) => { if (c.key) sub[c.key] = 0; });
      gRows.forEach((r, i) => {
        const z = zebraOf(i);
        body.push(cols.map((c) => {
          if (c.key) { sub[c.key] += numOf(r, c.key); grand[c.key] += numOf(r, c.key); }
          return { text: c.value(r, i), alignment: c.align || 'left', fontSize: 8, fillColor: z };
        }));
      });
      // sub total
      const subCells = [{ text: 'Sub Total', alignment: 'right', bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 8 }];
      cols.slice(1).forEach((c) => subCells.push({ text: fmt(sub[c.key] || 0, 0), alignment: 'right', bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 8 }));
      body.push(subCells);
    }

    if ((rows || []).length === 0) {
      body.push([{ text: 'No data for the selected period.', colSpan: span, italics: true, fontSize: 8, color: '#888' }, ...Array(span - 1).fill({})]);
    } else {
      const gCells = [{ text: 'Grand Total', alignment: 'right', bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 }];
      cols.slice(1).forEach((c) => gCells.push({ text: fmt(grand[c.key] || 0, 0), alignment: 'right', bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 }));
      body.push(gCells);
    }

    const table = { table: { headerRows: 1, widths: cols.map((c) => c.width), body }, layout: tableLayout() };
    const chart = chartFromRows(rows, {
      groupKey: (r) => ddmmyyyy(r.ReadingDate), groupLabel: (r) => `Date : ${ddmmyyyy(r.ReadingDate)}`,
      valueFn: (r) => rowTot(r), valueHeader: 'Total Units', groupHeader: 'Date', digits: 0
    });
    return buildPage({ companyName, companyLogo, title: 'EB SLOT - POWER CATEGORY (DATE WISE)', fromDate, toDate, tables: [...chart, table] });
  }
});
