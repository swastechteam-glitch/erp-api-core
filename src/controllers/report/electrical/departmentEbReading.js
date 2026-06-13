// Electrical — Department EB Reading (Power Consumption) reports.
// Mirrors:
//   rptDepartmentWiseConsumption_DateWise.rdlc   — Power Consumption, Date Wise
//   rptDepartmentWiseConsumption_PlantWise.rdlc  — Power Consumption, Plant Wise
//   rptPowerConsumption.rdlc                      — Power Consumption, Power Group Wise
// All three read sp_DepartmentwiseConsumptionDetails_GetAll. Each row carries
// Difference (units consumed for the period) and TotalReading (the overall
// reading used to derive a contribution %). Shares the cotton/_common PDF
// pipeline (logo + trend chart).

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy, chartFromRows
} from '../cotton/_common.js';

// ---- helpers ---------------------------------------------------------------
function groupBy(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}
const headRow = (columns) =>
  columns.map((c) => ({ text: c.header, bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 8 }));
const groupRowNode = (label, span) =>
  [{ text: label, colSpan: span, bold: true, color: colors.groupText, fillColor: colors.groupFill, fontSize: 9, margin: [2, 2, 0, 2] }, ...Array(span - 1).fill({})];
const zebraOf = (i) => (i % 2 === 1 ? colors.zebraFill : null);

// Overall reading used for the contribution %, taken from the first row
// (the SP returns the same TotalReading on every row).
const totalReadingOf = (rows) => {
  for (const r of rows) {
    const t = dec(r, 'TotalReading');
    if (t) return t;
  }
  return 0;
};
const pct = (units, total) => (total ? (units / total) * 100 : 0);

// ---- column dictionary -----------------------------------------------------
const C = {
  sno: { header: 'S.No', width: 28, align: 'center', value: (r, i) => String(i + 1) },
  plant: { header: 'Plant Name', width: '*', value: (r) => str(r, 'PlantName') },
  dept: { header: 'Department', width: '*', value: (r) => str(r, 'DepartmentName') },
  meter: { header: 'EB Meter', width: '*', value: (r) => str(r, 'EBMeterName') },
  date: { header: 'Date', width: 70, align: 'center', value: (r) => ddmmyyyy(r.DWCDate) },
  units: { header: 'Units (KWH)', width: 80, align: 'right', value: (r) => fmt(dec(r, 'Difference'), 2), sum: 'units' }
};

// Generic grouped builder — one block per group with a per-group Sub Total
// (units + contribution %) and a closing Grand Total. `total` is the overall
// reading for the contribution-% column.
function buildGrouped({ rows, columns, groupKey, groupLabel, sortFn }) {
  const total = totalReadingOf(rows);
  const span = columns.length + 1; // + contribution % column
  const body = [[...headRow(columns), { text: 'Consumption %', bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 8 }]];

  const groups = [...groupBy(rows, groupKey).entries()];
  if (sortFn) groups.sort((a, b) => sortFn(a[1][0], b[1][0]));

  let grandUnits = 0;
  for (const [, gRows] of groups) {
    if (sortFn) gRows.sort(sortFn);
    body.push(groupRowNode(groupLabel(gRows[0]), span));
    let gUnits = 0;
    gRows.forEach((r, i) => {
      const z = zebraOf(i);
      const u = dec(r, 'Difference');
      gUnits += u;
      body.push([
        ...columns.map((c) => ({ text: c.value(r, i), alignment: c.align || 'left', fontSize: 8, fillColor: z })),
        { text: fmt(pct(u, total), 2), alignment: 'right', fontSize: 8, fillColor: z }
      ]);
    });
    grandUnits += gUnits;
    // Sub Total row
    const subLead = Math.max(1, columns.length - 1);
    body.push([
      { text: 'Sub Total', colSpan: subLead, alignment: 'right', bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 8 },
      ...Array(subLead - 1).fill({}),
      { text: fmt(gUnits, 2), alignment: 'right', bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 8 },
      { text: fmt(pct(gUnits, total), 2), alignment: 'right', bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 8 }
    ]);
  }

  // Grand Total
  const lead = Math.max(1, columns.length - 1);
  body.push([
    { text: 'Grand Total', colSpan: lead, alignment: 'right', bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 },
    ...Array(lead - 1).fill({}),
    { text: fmt(grandUnits, 2), alignment: 'right', bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 },
    { text: fmt(pct(grandUnits, total), 2), alignment: 'right', bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 }
  ]);

  const widths = [...columns.map((c) => c.width), 80];
  return { table: { headerRows: 1, widths, body }, layout: tableLayout() };
}

function makeReport({ title, columns, groupKey, groupLabel, chartGroupKey, chartGroupLabel, sortFn }) {
  return ({ rows, companyName, companyLogo, fromDate, toDate }) => {
    const chart = chartFromRows(rows, {
      groupKey: chartGroupKey,
      groupLabel: chartGroupLabel,
      valueFn: (r) => dec(r, 'Difference'),
      valueHeader: 'Units (KWH)',
      groupHeader: title.includes('Date') ? 'Date' : (title.includes('Power Group') ? 'Power Group' : 'Plant'),
      digits: 2
    });
    const table = buildGrouped({ rows, columns, groupKey, groupLabel, sortFn });
    return buildPage({ companyName, companyLogo, title, fromDate, toDate, tables: [...chart, table] });
  };
}

// ---- handlers --------------------------------------------------------------

// Date Wise — grouped by reading date, plants/departments listed under each day.
export const ebReadingDateWise = (req, res) => runReport(req, res, {
  spName: 'sp_DepartmentwiseConsumptionDetails_GetAll',
  fileName: 'DepartmentEBReading_DateWise',
  buildDocDefinition: makeReport({
    title: 'POWER CONSUMPTION - DATE WISE',
    columns: [C.sno, C.plant, C.dept, C.units],
    groupKey: (r) => ddmmyyyy(r.DWCDate),
    groupLabel: (r) => `Date : ${ddmmyyyy(r.DWCDate)}`,
    chartGroupKey: (r) => ddmmyyyy(r.DWCDate),
    chartGroupLabel: (r) => `Date : ${ddmmyyyy(r.DWCDate)}`,
    sortFn: (a, b) => new Date(a.DWCDate) - new Date(b.DWCDate)
  })
});

// Plant Wise — grouped by plant, departments listed under each plant.
export const ebReadingPlantWise = (req, res) => runReport(req, res, {
  spName: 'sp_DepartmentwiseConsumptionDetails_GetAll',
  fileName: 'DepartmentEBReading_PlantWise',
  buildDocDefinition: makeReport({
    title: 'POWER CONSUMPTION - PLANT WISE',
    columns: [C.sno, C.dept, C.date, C.units],
    groupKey: (r) => str(r, 'PlantName'),
    groupLabel: (r) => `Plant : ${str(r, 'PlantName')}`,
    chartGroupKey: (r) => str(r, 'PlantCode') || str(r, 'PlantName'),
    chartGroupLabel: (r) => `Plant : ${str(r, 'PlantName')}`,
    sortFn: (a, b) => str(a, 'PlantName').localeCompare(str(b, 'PlantName'))
  })
});

// Power Group Wise — grouped by plant group, plants/departments under each.
export const ebReadingPowerGroupWise = (req, res) => runReport(req, res, {
  spName: 'sp_DepartmentwiseConsumptionDetails_GetAll',
  fileName: 'DepartmentEBReading_PowerGroupWise',
  buildDocDefinition: makeReport({
    title: 'POWER CONSUMPTION - POWER GROUP WISE',
    columns: [C.sno, C.plant, C.dept, C.units],
    groupKey: (r) => str(r, 'PlantGroupName'),
    groupLabel: (r) => `Power Group : ${str(r, 'PlantGroupName')}`,
    chartGroupKey: (r) => str(r, 'PlantGroupCode') || str(r, 'PlantGroupName'),
    chartGroupLabel: (r) => `Power Group : ${str(r, 'PlantGroupName')}`,
    sortFn: (a, b) => str(a, 'PlantGroupName').localeCompare(str(b, 'PlantGroupName'))
  })
});
