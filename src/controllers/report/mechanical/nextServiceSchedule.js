// Mechanical — Next Service Schedule reports.
// Mirrors:
//   rptNextServiceScheduleDetails_MachineWise.rdlc       (group Machine)
//   rptNextServiceScheduleDetails_DepartmentWise.rdlc    (group Department)
//   rptNextServiceScheduleDetails_ServiceNameWise.rdlc   (group Service Activity)
// SP: sp_MachineDetails_ServiceSchedule_GetAll (CompanyCode, FromDate, ToDate)
// A Date-wise grouping (by NextServiceDate) is added to match the menu item.
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

// ---- column dictionary (sp_MachineDetails_ServiceSchedule_GetAll) ----------
const C = {
  sno: { header: 'S.No', width: 32, align: 'center', value: (r, i) => String(i + 1) },
  dept: { header: 'Department', width: '*', value: (r) => str(r, 'DepartmentName') },
  machine: { header: 'Machine Name', width: '*', value: (r) => str(r, 'MachineName') },
  service: { header: 'Service Name', width: '*', value: (r) => str(r, 'ServiceActivityName') },
  duration: { header: 'Duration', width: 60, align: 'center', value: (r) => fmt(dec(r, 'DurationDays'), 0) },
  lastDate: { header: 'Last Date', width: 80, align: 'center', value: (r) => ddmmyyyy(r.LastMaintenanceDate) },
  nextDate: { header: 'Next Date', width: 80, align: 'center', value: (r) => ddmmyyyy(r.NextServiceDate) }
};

function buildGrouped({ rows, companyName, companyLogo, fromDate, toDate, title, columns, groupKey, groupLabel, sortGroups, chartGroupHeader }) {
  const widths = columns.map((c) => c.width);
  const tables = [];

  // chart: number of scheduled services per group
  for (const node of chartFromRows(rows, {
    groupKey, groupLabel, valueFn: () => 1, valueHeader: 'Schedules',
    groupHeader: chartGroupHeader, digits: 0
  })) tables.push(node);

  const groups = groupBy(rows || [], groupKey);
  const keys = [...groups.keys()];
  if (sortGroups) keys.sort(sortGroups);

  for (const k of keys) {
    const list = groups.get(k).slice().sort((a, b) => new Date(a.NextServiceDate) - new Date(b.NextServiceDate));
    const body = [headRow(columns), groupRowNode(groupLabel(list[0]), columns.length)];
    list.forEach((r, i) => {
      const z = zebraOf(i);
      body.push(columns.map((c) => ({ text: c.value(r, i), alignment: c.align || 'left', fontSize: 8, fillColor: z })));
    });
    tables.push({ table: { headerRows: 1, widths, body }, layout: tableLayout(), margin: [0, 0, 0, 8] });
  }
  if (keys.length === 0) tables.push({ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] });

  return buildPage({ companyName, companyLogo, title, fromDate, toDate, tables });
}

// ============================================================================
export const nextServiceMachineWise = (req, res) => runReport(req, res, {
  spName: 'sp_MachineDetails_ServiceSchedule_GetAll',
  fileName: 'NextServiceSchedule_MachineWise',
  buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate }) => buildGrouped({
    rows, companyName, companyLogo, fromDate, toDate,
    title: 'NEXT SERVICE SCHEDULE DETAILS - MACHINE WISE',
    columns: [C.sno, C.dept, C.service, C.duration, C.lastDate, C.nextDate],
    groupKey: (r) => str(r, 'MachineCode') || str(r, 'MachineName'),
    groupLabel: (r) => str(r, 'MachineName'),
    sortGroups: (a, b) => String(a).localeCompare(String(b)),
    chartGroupHeader: 'Machine'
  })
});

export const nextServiceDepartmentWise = (req, res) => runReport(req, res, {
  spName: 'sp_MachineDetails_ServiceSchedule_GetAll',
  fileName: 'NextServiceSchedule_DepartmentWise',
  buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate }) => buildGrouped({
    rows, companyName, companyLogo, fromDate, toDate,
    title: 'NEXT SERVICE SCHEDULE DETAILS - DEPARTMENT WISE',
    columns: [C.sno, C.machine, C.service, C.duration, C.lastDate, C.nextDate],
    groupKey: (r) => str(r, 'DepartmentCode') || str(r, 'DepartmentName'),
    groupLabel: (r) => str(r, 'DepartmentName'),
    sortGroups: (a, b) => String(a).localeCompare(String(b)),
    chartGroupHeader: 'Department'
  })
});

export const nextServiceServiceWise = (req, res) => runReport(req, res, {
  spName: 'sp_MachineDetails_ServiceSchedule_GetAll',
  fileName: 'NextServiceSchedule_ServiceWise',
  buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate }) => buildGrouped({
    rows, companyName, companyLogo, fromDate, toDate,
    title: 'NEXT SERVICE SCHEDULE DETAILS - SERVICE WISE',
    columns: [C.sno, C.dept, C.machine, C.duration, C.lastDate, C.nextDate],
    groupKey: (r) => str(r, 'ServiceActivityCode') || str(r, 'ServiceActivityName'),
    groupLabel: (r) => str(r, 'ServiceActivityName'),
    sortGroups: (a, b) => String(a).localeCompare(String(b)),
    chartGroupHeader: 'Service Activity'
  })
});

export const nextServiceDateWise = (req, res) => runReport(req, res, {
  spName: 'sp_MachineDetails_ServiceSchedule_GetAll',
  fileName: 'NextServiceSchedule_DateWise',
  buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate }) => buildGrouped({
    rows, companyName, companyLogo, fromDate, toDate,
    title: 'NEXT SERVICE SCHEDULE DETAILS - DATE WISE',
    columns: [C.sno, C.machine, C.service, C.duration, C.lastDate, C.nextDate],
    groupKey: (r) => (r.NextServiceDate ? new Date(r.NextServiceDate).toISOString().slice(0, 10) : ''),
    groupLabel: (r) => ddmmyyyy(r.NextServiceDate),
    sortGroups: (a, b) => new Date(a) - new Date(b),
    chartGroupHeader: 'Date'
  })
});
