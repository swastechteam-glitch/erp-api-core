// Mechanical — Service Schedule reports.
// Mirrors the rptServiceSchedule_*.rdlc / rptScheduleTonnageDetails.rdlc /
// rptScheduleCost.rdlc family. All share the cotton/_common PDF pipeline.
//
// Stored procedures:
//   sp_Schedule_BreakDown_GetAll     -> date / machine / department / service wise
//   sp_Schedule_Pendings             -> date-wise pendings
//   sp_Schedule_Pendings_With_Reason -> date-wise pendings (with reason)
//   sp_Maintence_GetTonnage          -> tonnage details
//   sp_ScheduleBreakDown_Cost        -> schedule entry cost (with totals)

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy, sql
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
const groupRow = (label, span, color = colors.groupText, fill = colors.groupFill) =>
  [{ text: label, colSpan: span, bold: true, color, fillColor: fill, fontSize: 9, margin: [2, 2, 0, 2] }, ...Array(span - 1).fill({})];
const zebraOf = (i) => (i % 2 === 1 ? colors.zebraFill : null);
const dmy = (r, col) => ddmmyyyy(r[col]);

// Single-level grouped detail table (one table per group).
function buildSingleGroup({ rows, companyName, companyLogo, fromDate, toDate, title, columns, groupKey, groupLabel, sortGroups, sortRows }) {
  const widths = columns.map((c) => c.width);
  const tables = [];
  const groups = groupBy(rows || [], groupKey);
  const keys = [...groups.keys()];
  if (sortGroups) keys.sort(sortGroups);

  for (const k of keys) {
    let list = groups.get(k);
    if (sortRows) list = list.slice().sort(sortRows);
    const body = [headRow(columns), groupRow(groupLabel(list[0], k), columns.length)];
    list.forEach((r, i) => {
      const z = zebraOf(i);
      body.push(columns.map((c) => ({ text: c.value(r, i), alignment: c.align || 'left', fontSize: 8, fillColor: z })));
    });
    tables.push({ table: { headerRows: 1, widths, body }, layout: tableLayout(), margin: [0, 0, 0, 8] });
  }
  if (!tables.length) tables.push({ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] });
  return buildPage({ companyName, companyLogo, title, fromDate, toDate, tables });
}

// Columns shared by the four breakdown reports (sp_Schedule_BreakDown_GetAll).
const C_SNO = { header: 'S.No', width: 30, align: 'center', value: (r, i) => String(i + 1) };
const C_JOB = { header: 'Job Card No', width: 60, align: 'center', value: (r) => str(r, 'SBJobCardNo') };
const C_DEPT = { header: 'Department', width: '*', value: (r) => str(r, 'DepartmentName') };
const C_MACHINE = { header: 'Machine', width: '*', value: (r) => str(r, 'MachineName') };
const C_SERVICE = { header: 'Service Name', width: '*', value: (r) => str(r, 'ServiceActivityName') };
const C_DURATION = { header: 'Duration', width: 55, align: 'center', value: (r) => fmt(dec(r, 'DurationDays'), 0) };
const C_LAST = { header: 'Last Date', width: 70, align: 'center', value: (r) => dmy(r, 'LastPreMainDoneDate') };
const C_DONE = { header: 'Done Date', width: 70, align: 'center', value: (r) => dmy(r, 'SBDate') };
const C_NEXT = { header: 'Next Date', width: 70, align: 'center', value: (r) => dmy(r, 'NextServiceDate') };
const C_REMARKS = { header: 'Remarks', width: '*', value: (r) => str(r, 'Reason') };

// ============================================================================
// sp_Schedule_BreakDown_GetAll — Date / Machine / Department / Service wise
// ============================================================================
export const serviceScheduleDateWise = (req, res) => runReport(req, res, {
  spName: 'sp_Schedule_BreakDown_GetAll',
  fileName: 'ServiceSchedule_DateWise',
  buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate }) => buildSingleGroup({
    rows, companyName, companyLogo, fromDate, toDate,
    title: 'SERVICE SCHEDULE DETAILS - DATE WISE',
    columns: [C_SNO, C_JOB, C_MACHINE, { ...C_SERVICE, header: 'Schedule Activity' }, C_DURATION, C_LAST, C_DONE, C_NEXT, C_REMARKS],
    groupKey: (r) => str(r, 'SBDate'),
    groupLabel: (r) => dmy(r, 'SBDate'),
    sortGroups: (a, b) => new Date(a) - new Date(b)
  })
});

export const serviceScheduleMachineWise = (req, res) => runReport(req, res, {
  spName: 'sp_Schedule_BreakDown_GetAll',
  fileName: 'ServiceSchedule_MachineWise',
  buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate }) => buildSingleGroup({
    rows, companyName, companyLogo, fromDate, toDate,
    title: 'SERVICE SCHEDULE DETAILS - MACHINE WISE',
    columns: [C_SNO, C_JOB, C_DEPT, C_SERVICE, C_DURATION, C_LAST, C_DONE, C_NEXT, C_REMARKS],
    groupKey: (r) => str(r, 'MachineCode') || str(r, 'MachineName'),
    groupLabel: (r) => str(r, 'MachineName'),
    sortGroups: (a, b) => String(a).localeCompare(String(b))
  })
});

export const serviceScheduleDepartmentWise = (req, res) => runReport(req, res, {
  spName: 'sp_Schedule_BreakDown_GetAll',
  fileName: 'ServiceSchedule_DepartmentWise',
  buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate }) => buildSingleGroup({
    rows, companyName, companyLogo, fromDate, toDate,
    title: 'SERVICE SCHEDULE DETAILS - DEPARTMENT WISE',
    columns: [C_SNO, C_JOB, C_MACHINE, C_SERVICE, C_DURATION, C_LAST, C_DONE, C_NEXT, C_REMARKS],
    groupKey: (r) => str(r, 'DepartmentCode') || str(r, 'DepartmentName'),
    groupLabel: (r) => str(r, 'DepartmentName'),
    sortGroups: (a, b) => String(a).localeCompare(String(b))
  })
});

export const serviceScheduleServiceWise = (req, res) => runReport(req, res, {
  spName: 'sp_Schedule_BreakDown_GetAll',
  fileName: 'ServiceSchedule_ServiceWise',
  buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate }) => buildSingleGroup({
    rows, companyName, companyLogo, fromDate, toDate,
    title: 'SERVICE SCHEDULE DETAILS - SERVICE WISE',
    columns: [C_SNO, C_JOB, C_DEPT, C_MACHINE, C_DURATION, C_LAST, C_DONE, C_NEXT, C_REMARKS],
    groupKey: (r) => str(r, 'ServiceActivityCode') || str(r, 'ServiceActivityName'),
    groupLabel: (r) => str(r, 'ServiceActivityName'),
    sortGroups: (a, b) => String(a).localeCompare(String(b))
  })
});

// ============================================================================
// sp_Maintence_GetTonnage — Tonnage details (grouped by machine)
// ============================================================================
export const scheduleTonnage = (req, res) => runReport(req, res, {
  spName: 'sp_Maintence_GetTonnage',
  fileName: 'ServiceSchedule_Tonnage',
  spParams: (p) => ({ CompanyCode: { type: sql.Int, value: parseInt(p.CompanyCode) || 0 } }),
  buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate }) => buildSingleGroup({
    rows, companyName, companyLogo, fromDate, toDate,
    title: 'SERVICE SCHEDULE TONNAGE DETAILS',
    columns: [
      { header: 'Service Activity Name', width: '*', value: (r) => str(r, 'ServiceActivityName') },
      { header: 'Per.Done Date', width: 90, align: 'center', value: (r) => dmy(r, 'LastMaintenanceDate') },
      { header: 'Target', width: 80, align: 'right', value: (r) => fmt(dec(r, 'Tonnage'), 2) },
      { header: 'Running', width: 80, align: 'right', value: (r) => fmt(dec(r, 'CrdProd'), 2) },
      { header: 'Pending', width: 80, align: 'right', value: (r) => fmt(dec(r, 'PendingTon'), 2) }
    ],
    groupKey: (r) => str(r, 'MachineCode') || str(r, 'MachineName'),
    groupLabel: (r) => str(r, 'MachineName'),
    sortGroups: (a, b) => String(a).localeCompare(String(b))
  })
});

// ============================================================================
// sp_Schedule_Pendings[_With_Reason] — Date-wise pendings (Department -> Machine)
// ============================================================================
function buildPendings({ rows, companyName, companyLogo, fromDate, toDate, withReason }) {
  const columns = [
    { header: 'S.No', width: 36, align: 'center', value: (r, i) => String(i + 1) },
    { header: 'Service Activity Name', width: '*', value: (r) => str(r, 'ServiceActivityName') },
    { header: 'Last Maintenance Date', width: 95, align: 'center', value: (r) => dmy(r, 'LastMaintenanceDate') },
    { header: 'Pending', width: 60, align: 'center', value: (r) => str(r, 'Pending') },
    { header: 'Duration', width: 60, align: 'center', value: (r) => fmt(dec(r, 'DurationDays'), 0) },
    { header: 'To Be Done Date', width: 95, align: 'center', value: (r) => dmy(r, 'NextServiceDate') }
  ];
  if (withReason) columns.push({ header: 'Reason', width: '*', value: (r) => str(r, 'Reason') });
  const widths = columns.map((c) => c.width);
  const span = columns.length;

  const tables = [];
  const byDept = groupBy(rows || [], (r) => str(r, 'DepartmentCode') || str(r, 'DepartmentName'));
  const deptKeys = [...byDept.keys()].sort((a, b) => String(a).localeCompare(String(b)));

  for (const dk of deptKeys) {
    const deptRows = byDept.get(dk);
    const body = [headRow(columns), groupRow(str(deptRows[0], 'DepartmentName'), span, '#0000c0')];
    const byMachine = groupBy(deptRows, (r) => str(r, 'MachineCode') || str(r, 'MachineName'));
    const machineKeys = [...byMachine.keys()].sort((a, b) => String(a).localeCompare(String(b)));
    for (const mk of machineKeys) {
      const mRows = byMachine.get(mk);
      body.push(groupRow(str(mRows[0], 'MachineName'), span, '#8B0000', colors.subFill));
      mRows.forEach((r, i) => {
        const z = zebraOf(i);
        body.push(columns.map((c) => ({ text: c.value(r, i), alignment: c.align || 'left', fontSize: 8, fillColor: z })));
      });
    }
    tables.push({ table: { headerRows: 1, widths, body }, layout: tableLayout(), margin: [0, 0, 0, 8] });
  }
  if (!tables.length) tables.push({ text: 'No pending schedules.', italics: true, margin: [0, 10, 0, 0] });

  const title = withReason ? 'SERVICE SCHEDULE DETAILS - PENDINGS WITH REASON' : 'SERVICE SCHEDULE DETAILS - PENDINGS';
  return buildPage({ companyName, companyLogo, title, fromDate, toDate, tables });
}

export const schedulePendings = (req, res) => runReport(req, res, {
  spName: 'sp_Schedule_Pendings',
  fileName: 'ServiceSchedule_Pendings',
  spParams: (p) => ({ CompanyCode: { type: sql.Int, value: parseInt(p.CompanyCode) || 0 } }),
  buildDocDefinition: (args) => buildPendings({ ...args, withReason: false })
});

export const schedulePendingsWithReason = (req, res) => runReport(req, res, {
  spName: 'sp_Schedule_Pendings_With_Reason',
  fileName: 'ServiceSchedule_Pendings_WithReason',
  spParams: (p) => ({ CompanyCode: { type: sql.Int, value: parseInt(p.CompanyCode) || 0 } }),
  buildDocDefinition: (args) => buildPendings({ ...args, withReason: true })
});

// ============================================================================
// sp_ScheduleBreakDown_Cost — Schedule entry cost (Department -> Machine, totals)
// ============================================================================
function buildCost({ rows, companyName, companyLogo, fromDate, toDate }) {
  const columns = [
    { header: 'S.No', width: 36, align: 'center' },
    { header: 'No Of Times', width: 70, align: 'center' },
    { header: 'Machine Name', width: '*', align: 'left' },
    { header: 'Service Activity Name', width: '*', align: 'left' },
    { header: 'Cost', width: 90, align: 'right' }
  ];
  const widths = columns.map((c) => c.width);
  const span = columns.length;
  const sub = (text, align = 'right', fill = colors.subFill, color = colors.subText) =>
    ({ text, alignment: align, bold: true, color, fillColor: fill, fontSize: 8 });

  const tables = [];
  const byDept = groupBy(rows || [], (r) => str(r, 'DepartmentCode') || str(r, 'DepartmentName'));
  const deptKeys = [...byDept.keys()].sort((a, b) => String(a).localeCompare(String(b)));
  let grand = 0;

  for (const dk of deptKeys) {
    const deptRows = byDept.get(dk);
    const body = [headRow(columns), groupRow(str(deptRows[0], 'DepartmentName'), span)];
    const byMachine = groupBy(deptRows, (r) => str(r, 'MachineCode') || str(r, 'MachineName'));
    const machineKeys = [...byMachine.keys()].sort((a, b) => String(a).localeCompare(String(b)));
    let deptTotal = 0;
    let i = 0;
    for (const mk of machineKeys) {
      const mRows = byMachine.get(mk);
      body.push(groupRow(str(mRows[0], 'MachineName'), span, '#1A3C7B', colors.subFill));
      let mTotal = 0;
      for (const r of mRows) {
        const z = zebraOf(i);
        const cost = dec(r, 'Cost');
        mTotal += cost;
        body.push([
          { text: String(i + 1), alignment: 'center', fontSize: 8, fillColor: z },
          { text: str(r, 'NoOFSB'), alignment: 'center', fontSize: 8, fillColor: z },
          { text: str(r, 'MachineName'), alignment: 'left', fontSize: 8, fillColor: z },
          { text: str(r, 'ServiceActivityName'), alignment: 'left', fontSize: 8, fillColor: z },
          { text: fmt(cost, 2), alignment: 'right', fontSize: 8, fillColor: z }
        ]);
        i++;
      }
      body.push([{ ...sub('Total', 'right'), colSpan: 4 }, {}, {}, {}, sub(fmt(mTotal, 2))]);
      deptTotal += mTotal;
    }
    body.push([{ ...sub('Sub Total', 'right'), colSpan: 4 }, {}, {}, {}, sub(fmt(deptTotal, 2))]);
    grand += deptTotal;
    tables.push({ table: { headerRows: 1, widths, body }, layout: tableLayout(), margin: [0, 0, 0, 8] });
  }

  if (!tables.length) {
    tables.push({ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] });
  } else {
    tables.push({
      margin: [0, 4, 0, 0],
      table: {
        widths,
        body: [[
          { text: 'GRAND TOTAL', colSpan: 4, alignment: 'right', bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 }, {}, {}, {},
          { text: fmt(grand, 2), alignment: 'right', bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 }
        ]]
      },
      layout: tableLayout()
    });
  }
  return buildPage({ companyName, companyLogo, title: 'SCHEDULE ENTRY COST REPORT', fromDate, toDate, tables });
}

export const scheduleCost = (req, res) => runReport(req, res, {
  spName: 'sp_ScheduleBreakDown_Cost',
  fileName: 'ServiceSchedule_Cost',
  buildDocDefinition: (args) => buildCost(args)
});
