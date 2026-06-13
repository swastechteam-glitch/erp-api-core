// Mechanical — Work Order (Schedule Complete) reports.
// Mirrors:
//   rptWorkOrderScheduleComplete_DateWise.rdlc          (sp_WorkOrder_GetAll, group WorkOrderDate)
//   rptWorkOrderScheduleComplete_DepartmentWise.rdlc    (sp_WorkOrder_GetAll, group Department)
//   rptWorkOrderScheduleCompleteDetails_MachineWise.rdlc          (sp_WorkOrderDetails_GetAll, group Machine)
//   rptWorkOrderScheduleCompleteDetails_DepartmentWise.rdlc       (sp_WorkOrderDetails_GetAll, group Department)
//   rptWorkOrderScheduleCompleteDetails_ServiceActivityWise.rdlc  (sp_WorkOrderDetails_GetAll, group Service Activity)
//   rptWorkOrderScheduleCompleteDetails_MachineWise_BreakDown.rdlc(sp_WorkOrderDetails_GetAll, group Machine)
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

// ---- column dictionary (sp_WorkOrder_GetAll / sp_WorkOrderDetails_GetAll) ---
const W = {
  sno: { header: 'S.No', width: 28, align: 'center', value: (r, i) => String(i + 1) },
  woNo: { header: 'W.O No', width: 50, align: 'center', value: (r) => str(r, 'WorkOrderNo') },
  dept: { header: 'Department', width: '*', value: (r) => str(r, 'DepartmentName') },
  machine: { header: 'Machine Name', width: '*', value: (r) => str(r, 'MachineName') },
  service: { header: 'Service Name', width: '*', value: (r) => str(r, 'ServiceActivityName') },
  breakdown: { header: 'BreakDown Name', width: '*', value: (r) => str(r, 'BreakDownName') },
  itemName: { header: 'Item Name', width: '*', value: (r) => str(r, 'ItemName') },
  lastDone: { header: 'Last Done Date', width: 64, align: 'center', value: (r) => ddmmyyyy(r.LastPreMainDoneDate) },
  woDate: { header: 'W.O Done Date', width: 64, align: 'center', value: (r) => ddmmyyyy(r.WorkOrderDate) },
  schedDone: { header: 'Schedule Done Date', width: 64, align: 'center', value: (r) => ddmmyyyy(r.WorkOrderDate) },
  duration: { header: 'Duration', width: 48, align: 'center', value: (r) => fmt(dec(r, 'Duration'), 0) },
  nextService: { header: 'Next Service Date', width: 64, align: 'center', value: (r) => ddmmyyyy(r.NextServiceDate) },
  remarks: { header: 'Remarks', width: '*', value: (r) => str(r, 'Reason') },
  remarksSB: { header: 'Remarks', width: '*', value: (r) => str(r, 'SBReason') },
  attnBy: { header: 'Attn.By', width: 80, align: 'left', value: (r) => str(r, 'ServiceBy') },
  sign: { header: 'Sign', width: 56, align: 'center', value: () => '' }
};

function buildGrouped({ rows, companyName, companyLogo, fromDate, toDate, title, columns, groupKey, groupLabel, sortGroups, sortRows, chartGroupHeader }) {
  const widths = columns.map((c) => c.width);
  const tables = [];

  // chart: number of work orders per group
  for (const node of chartFromRows(rows, {
    groupKey, groupLabel, valueFn: () => 1, valueHeader: 'Work Orders',
    groupHeader: chartGroupHeader, digits: 0
  })) tables.push(node);

  const groups = groupBy(rows || [], groupKey);
  const keys = [...groups.keys()];
  if (sortGroups) keys.sort(sortGroups);

  for (const k of keys) {
    const list = groups.get(k).slice();
    if (sortRows) list.sort(sortRows);
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

const byWoDate = (a, b) => new Date(a.WorkOrderDate) - new Date(b.WorkOrderDate);

// ============================================================================
// sp_WorkOrder_GetAll — Schedule Complete (Date / Department wise)
// ============================================================================
export const workOrderDateWise = (req, res) => runReport(req, res, {
  spName: 'sp_WorkOrder_GetAll',
  fileName: 'WorkOrder_DateWise',
  buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate }) => buildGrouped({
    rows, companyName, companyLogo, fromDate, toDate,
    title: 'WORK ORDER SCHEDULE COMPLETE - DATE WISE',
    columns: [W.sno, W.woNo, W.machine, W.service, W.lastDone, W.schedDone, W.duration, W.nextService, W.remarks, W.attnBy],
    groupKey: (r) => (r.WorkOrderDate ? new Date(r.WorkOrderDate).toISOString().slice(0, 10) : ''),
    groupLabel: (r) => ddmmyyyy(r.WorkOrderDate),
    sortGroups: (a, b) => new Date(a) - new Date(b),
    sortRows: byWoDate, chartGroupHeader: 'Date'
  })
});

export const workOrderDepartmentWise = (req, res) => runReport(req, res, {
  spName: 'sp_WorkOrder_GetAll',
  fileName: 'WorkOrder_DepartmentWise',
  buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate }) => buildGrouped({
    rows, companyName, companyLogo, fromDate, toDate,
    title: 'WORK ORDER SCHEDULE COMPLETE - DEPARTMENT WISE',
    columns: [W.sno, W.woNo, W.machine, W.service, W.lastDone, W.woDate, W.duration, W.nextService, W.remarks, W.attnBy],
    groupKey: (r) => str(r, 'DepartmentCode') || str(r, 'DepartmentName'),
    groupLabel: (r) => str(r, 'DepartmentName'),
    sortGroups: (a, b) => String(a).localeCompare(String(b)),
    sortRows: byWoDate, chartGroupHeader: 'Department'
  })
});

// ============================================================================
// sp_WorkOrderDetails_GetAll — Schedule Complete Details
// ============================================================================
export const workOrderDetailsMachineWise = (req, res) => runReport(req, res, {
  spName: 'sp_WorkOrderDetails_GetAll',
  fileName: 'WorkOrderDetails_MachineWise',
  buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate }) => buildGrouped({
    rows, companyName, companyLogo, fromDate, toDate,
    title: 'WORK ORDER SCHEDULE COMPLETE - MACHINE WISE',
    columns: [W.sno, W.woNo, W.dept, W.service, W.lastDone, W.woDate, W.duration, W.nextService, W.remarks, W.sign],
    groupKey: (r) => str(r, 'MachineCode') || str(r, 'MachineName'),
    groupLabel: (r) => str(r, 'MachineName'),
    sortGroups: (a, b) => String(a).localeCompare(String(b)),
    sortRows: byWoDate, chartGroupHeader: 'Machine'
  })
});

export const workOrderDetailsDepartmentWise = (req, res) => runReport(req, res, {
  spName: 'sp_WorkOrderDetails_GetAll',
  fileName: 'WorkOrderDetails_DepartmentWise',
  buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate }) => buildGrouped({
    rows, companyName, companyLogo, fromDate, toDate,
    title: 'WORK ORDER SCHEDULE COMPLETE DETAILS - DEPARTMENT WISE',
    columns: [W.sno, W.woNo, W.machine, W.service, W.lastDone, W.woDate, W.duration, W.nextService, W.remarks, W.sign],
    groupKey: (r) => str(r, 'DepartmentCode') || str(r, 'DepartmentName'),
    groupLabel: (r) => str(r, 'DepartmentName'),
    sortGroups: (a, b) => String(a).localeCompare(String(b)),
    sortRows: byWoDate, chartGroupHeader: 'Department'
  })
});

export const workOrderDetailsServiceWise = (req, res) => runReport(req, res, {
  spName: 'sp_WorkOrderDetails_GetAll',
  fileName: 'WorkOrderDetails_ServiceActivityWise',
  buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate }) => buildGrouped({
    rows, companyName, companyLogo, fromDate, toDate,
    title: 'WORK ORDER SCHEDULE COMPLETE - SERVICE ACTIVITY WISE',
    columns: [W.sno, W.woNo, W.machine, W.dept, W.lastDone, W.woDate, W.duration, W.nextService, W.remarks, W.sign],
    groupKey: (r) => str(r, 'ServiceActivityCode') || str(r, 'ServiceActivityName'),
    groupLabel: (r) => str(r, 'ServiceActivityName'),
    sortGroups: (a, b) => String(a).localeCompare(String(b)),
    sortRows: byWoDate, chartGroupHeader: 'Service Activity'
  })
});

export const workOrderDetailsMachineWiseBreakDown = (req, res) => runReport(req, res, {
  spName: 'sp_WorkOrderDetails_GetAll',
  fileName: 'WorkOrderDetails_MachineWise_BreakDown',
  buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate }) => buildGrouped({
    rows, companyName, companyLogo, fromDate, toDate,
    title: 'WORK ORDER BREAKDOWN DETAILS - MACHINE WISE',
    columns: [W.sno, W.dept, W.machine, W.breakdown, W.lastDone, W.woDate, W.itemName, W.remarksSB, W.attnBy],
    groupKey: (r) => str(r, 'MachineCode') || str(r, 'MachineName'),
    groupLabel: (r) => str(r, 'MachineName'),
    sortGroups: (a, b) => String(a).localeCompare(String(b)),
    sortRows: byWoDate, chartGroupHeader: 'Machine'
  })
});
