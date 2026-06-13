// Mechanical — Machine Buffing reports.
// Mirrors rptMaintenanceBuffing.rdlc and rptMaintenanceBuffing_Pending.rdlc
// (sp_MaintenanceBuffing_GetAll), grouped Department -> Dia.
// A Date-wise grouping (by BuffingDate) is added to match the menu item.
// All share the cotton/_common PDF pipeline (logo + trend chart included).

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

// ---- column dictionary (sp_MaintenanceBuffing_GetAll) ----------------------
const C = {
  sno: { header: 'S.No', width: 28, align: 'center', value: (r, i) => String(i + 1) },
  buffingDate: { header: 'Buffing Date', width: 70, align: 'center', value: (r) => ddmmyyyy(r.BuffingDate) },
  lastDate: { header: 'Last Date', width: 70, align: 'center', value: (r) => ddmmyyyy(r.BuffingDate) },
  machine: { header: 'Machine Name', width: '*', value: (r) => str(r, 'MachineName') },
  dept: { header: 'Department', width: '*', value: (r) => str(r, 'DepartmentName') },
  dia: { header: 'Dia', width: 70, align: 'center', value: (r) => str(r, 'Dia') || str(r, 'DiaName') },
  nextDate: { header: 'Next Date', width: 70, align: 'center', value: (r) => ddmmyyyy(r.NextDate) },
  pendingDays: { header: 'Pending', width: 60, align: 'right', value: (r) => fmt(dec(r, 'PendingDays'), 0) },
  pendingDate: { header: 'Pending Date', width: 70, align: 'center', value: (r) => ddmmyyyy(r.NextDate) }
};

function buildGrouped({ rows, companyName, companyLogo, fromDate, toDate, title, columns, groupKey, groupLabel, sortGroups, chartGroupHeader, chartValueFn, chartValueHeader, chartDigits }) {
  const widths = columns.map((c) => c.width);
  const span = columns.length;
  const tables = [];

  for (const node of chartFromRows(rows, {
    groupKey, groupLabel,
    valueFn: chartValueFn || (() => 1), valueHeader: chartValueHeader || 'Buffings',
    groupHeader: chartGroupHeader, digits: chartDigits ?? 0
  })) tables.push(node);

  const groups = groupBy(rows || [], groupKey);
  const keys = [...groups.keys()];
  if (sortGroups) keys.sort(sortGroups);

  for (const k of keys) {
    const list = groups.get(k).slice().sort((a, b) => new Date(a.BuffingDate) - new Date(b.BuffingDate));
    const body = [headRow(columns), groupRowNode(groupLabel(list[0]), span)];
    list.forEach((r, i) => {
      const z = zebraOf(i);
      body.push(columns.map((c) => ({ text: c.value(r, i), alignment: c.align || 'left', fontSize: 8, fillColor: z })));
    });
    tables.push({ table: { headerRows: 1, widths, body }, layout: tableLayout(), margin: [0, 0, 0, 8] });
  }
  if (keys.length === 0) tables.push({ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] });

  return buildPage({ companyName, companyLogo, title, fromDate, toDate, tables });
}

// group by Department + Dia, like the RDLC group header "Dept - Dia"
const deptDiaKey = (r) => `${str(r, 'DepartmentCode') || str(r, 'DepartmentName')}||${str(r, 'DiaCode') || str(r, 'DiaName')}`;
const deptDiaLabel = (r) => `${str(r, 'DepartmentName')} - ${str(r, 'DiaName')}`;

// ============================================================================
export const buffingDetail = (req, res) => runReport(req, res, {
  spName: 'sp_MaintenanceBuffing_GetAll', fileName: 'MaintenanceBuffing',
  buildDocDefinition: (ctx) => buildGrouped({
    ...ctx, title: 'MAINTENANCE BUFFING',
    columns: [C.sno, C.buffingDate, C.machine, C.dia, C.nextDate],
    groupKey: deptDiaKey, groupLabel: deptDiaLabel,
    sortGroups: (a, b) => String(a).localeCompare(String(b)), chartGroupHeader: 'Dept - Dia'
  })
});

export const buffingPending = (req, res) => runReport(req, res, {
  spName: 'sp_MaintenanceBuffing_GetAll', fileName: 'MaintenanceBuffing_Pending',
  buildDocDefinition: (ctx) => buildGrouped({
    ...ctx, title: 'MAINTENANCE BUFFING PENDING',
    columns: [C.sno, C.lastDate, C.machine, C.pendingDays, C.pendingDate],
    groupKey: deptDiaKey, groupLabel: deptDiaLabel,
    sortGroups: (a, b) => String(a).localeCompare(String(b)),
    chartGroupHeader: 'Dept - Dia', chartValueFn: (r) => dec(r, 'PendingDays'), chartValueHeader: 'Pending Days'
  })
});

export const buffingDateWise = (req, res) => runReport(req, res, {
  spName: 'sp_MaintenanceBuffing_GetAll', fileName: 'MaintenanceBuffing_DateWise',
  buildDocDefinition: (ctx) => buildGrouped({
    ...ctx, title: 'MAINTENANCE BUFFING - DATE WISE',
    columns: [C.sno, C.machine, C.dept, C.dia, C.nextDate],
    groupKey: (r) => (r.BuffingDate ? new Date(r.BuffingDate).toISOString().slice(0, 10) : ''),
    groupLabel: (r) => ddmmyyyy(r.BuffingDate),
    sortGroups: (a, b) => new Date(a) - new Date(b), chartGroupHeader: 'Date'
  })
});
