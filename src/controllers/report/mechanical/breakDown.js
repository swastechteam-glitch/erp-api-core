// Mechanical — Break Down reports.
// Mirrors rptBreakDown_MachineWise / _DepartmentWise / _DateWise.rdlc
// (sp_BreakDown_GetAll) and rptBreakDownCost.rdlc (sp_ScheduleBreakDown_Cost).
// All share the cotton/_common PDF pipeline (logo + trend chart included).

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy, chartFromRows, sql
} from '../cotton/_common.js';
import { getPool } from '../../../config/dynamicDB.js';

// ---- functional filters (port of the WinForms DataTable.Select chain) -------
const codeSet = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const s = new Set(String(v).split(',').map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n)));
  return s.size ? s : null;
};
const oneFilter = (rows, field, set) =>
  (!set || !rows.length || !(field in rows[0])) ? rows : rows.filter((r) => set.has(parseInt(r[field], 10)));
const filterRows = (rows, query = {}) => {
  let out = rows || [];
  out = oneFilter(out, 'BranchCode', codeSet(query.branchCode));
  out = oneFilter(out, 'DepartmentCode', codeSet(query.departmentCode));
  out = oneFilter(out, 'MachineCode', codeSet(query.machineCode));
  out = oneFilter(out, 'BreakDownMasterCode', codeSet(query.breakDownMasterCode));
  return out;
};
const svcType = (req) => (String(req.query.serviceType || 'M').toUpperCase() === 'E' ? 'E' : 'M');

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

// hh:mm from a DateTime (mssql returns wall-clock as UTC).
const hhmm = (d) => {
  if (d === null || d === undefined || d === '') return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  return `${String(dt.getUTCHours()).padStart(2, '0')}:${String(dt.getUTCMinutes()).padStart(2, '0')}`;
};

// ---- detail columns (sp_BreakDown_GetAll) ----------------------------------
const C = {
  sno: { header: 'S.No', width: 28, align: 'center', value: (r, i) => String(i + 1) },
  job: { header: 'Job Card No', width: 52, align: 'center', value: (r) => str(r, 'SBJobCardNo') },
  bdDate: { header: 'B.D Date', width: 60, align: 'center', value: (r) => ddmmyyyy(r.BreakDownDate) },
  bdTime: { header: 'B.D Time', width: 52, align: 'center', value: (r) => hhmm(r.BreakDownTime) },
  dept: { header: 'Department', width: '*', value: (r) => str(r, 'DepartmentName') },
  machine: { header: 'Machine', width: '*', value: (r) => str(r, 'MachineName') },
  type: { header: 'Type Of Break Down', width: '*', value: (r) => str(r, 'BreakDownName') },
  mpUsed: { header: 'M.P Used', width: 50, align: 'right', value: (r) => fmt(dec(r, 'TotalManPowerUsed'), 0) },
  mpMin: { header: 'M.P Mins', width: 50, align: 'right', value: (r) => fmt(dec(r, 'TotalManPowerHrs'), 0) },
  mpHrs: { header: 'M.P Hrs', width: 48, align: 'right', value: (r) => fmt(dec(r, 'TotalManPowerHrs') / 60, 2) },
  bdPct: { header: 'B.D %', width: 44, align: 'right', value: (r) => fmt(dec(r, 'Percentage'), 2) },
  reason: { header: 'Reason', width: '*', value: (r) => str(r, 'Reason') }
};

function buildDetail({ rows, companyName, companyLogo, fromDate, toDate, title, columns, groupKey, groupLabel, sortGroups, chartGroupHeader }) {
  const widths = columns.map((c) => c.width);
  const tables = [];

  const chart = chartFromRows(rows, {
    groupKey, groupLabel,
    valueFn: (r) => dec(r, 'TotalManPowerHrs') / 60, valueHeader: 'M.P Hrs',
    groupHeader: chartGroupHeader, digits: 2
  });
  for (const node of chart) tables.push(node);

  const groups = groupBy(rows || [], groupKey);
  const keys = [...groups.keys()];
  if (sortGroups) keys.sort(sortGroups);

  for (const k of keys) {
    const list = groups.get(k).slice().sort((a, b) => new Date(a.BreakDownDate) - new Date(b.BreakDownDate));
    const body = [headRow(columns), groupRowNode(groupLabel(list[0]), columns.length)];
    list.forEach((r, i) => {
      const z = zebraOf(i);
      body.push(columns.map((c) => ({ text: c.value(r, i), alignment: c.align || 'left', fontSize: 8, fillColor: z })));
    });
    tables.push({ table: { headerRows: 1, widths, body }, layout: tableLayout(), margin: [0, 0, 0, 8] });
  }
  if (!tables.length || keys.length === 0) tables.push({ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] });

  return buildPage({ companyName, companyLogo, title, fromDate, toDate, tables });
}

// ============================================================================
// sp_BreakDown_GetAll — Machine / Department / Date wise
// ============================================================================
export const breakDownMachineWise = (req, res) => runReport(req, res, {
  spName: 'sp_BreakDown_GetAll',
  fileName: 'BreakDown_MachineWise',
  buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate, query }) => buildDetail({
    rows: filterRows(rows, query), companyName, companyLogo, fromDate, toDate,
    title: 'BREAK DOWN DETAILS - MACHINE WISE',
    columns: [C.sno, C.job, C.bdDate, C.bdTime, C.dept, C.type, C.mpUsed, C.mpMin, C.mpHrs, C.bdPct, C.reason],
    groupKey: (r) => str(r, 'MachineCode') || str(r, 'MachineName'),
    groupLabel: (r) => str(r, 'MachineName'),
    sortGroups: (a, b) => String(a).localeCompare(String(b)),
    chartGroupHeader: 'Machine'
  })
});

export const breakDownDepartmentWise = (req, res) => runReport(req, res, {
  spName: 'sp_BreakDown_GetAll',
  fileName: 'BreakDown_DepartmentWise',
  buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate, query }) => buildDetail({
    rows: filterRows(rows, query), companyName, companyLogo, fromDate, toDate,
    title: 'BREAK DOWN DETAILS - DEPARTMENT WISE',
    columns: [C.sno, C.job, C.bdDate, C.bdTime, C.machine, C.type, C.mpUsed, C.mpMin, C.mpHrs, C.bdPct, C.reason],
    groupKey: (r) => str(r, 'DepartmentCode') || str(r, 'DepartmentName'),
    groupLabel: (r) => str(r, 'DepartmentName'),
    sortGroups: (a, b) => String(a).localeCompare(String(b)),
    chartGroupHeader: 'Department'
  })
});

export const breakDownDateWise = (req, res) => runReport(req, res, {
  spName: 'sp_BreakDown_GetAll',
  fileName: 'BreakDown_DateWise',
  buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate, query }) => buildDetail({
    rows: filterRows(rows, query), companyName, companyLogo, fromDate, toDate,
    title: 'BREAK DOWN DETAILS - DATE WISE',
    columns: [C.sno, C.job, C.bdTime, C.dept, C.machine, C.type, C.mpUsed, C.mpMin, C.mpHrs, C.bdPct, C.reason],
    groupKey: (r) => (r.BreakDownDate ? new Date(r.BreakDownDate).toISOString().slice(0, 10) : ''),
    groupLabel: (r) => ddmmyyyy(r.BreakDownDate),
    sortGroups: (a, b) => new Date(a) - new Date(b),
    chartGroupHeader: 'Date'
  })
});

// ============================================================================
// sp_ScheduleBreakDown_Cost — Break Down Entry Cost (Department wise, totals)
// ============================================================================
function buildCost({ rows, companyName, companyLogo, fromDate, toDate, query }) {
  rows = filterRows(rows, query);
  const columns = [
    { header: 'S.No', width: 32, align: 'center' },
    { header: 'No Of Times', width: 70, align: 'center' },
    { header: 'Machine Name', width: '*', align: 'left' },
    { header: 'BreakDown Name', width: '*', align: 'left' },
    { header: 'Cost', width: 90, align: 'right' }
  ];
  const widths = columns.map((c) => c.width);
  const span = columns.length;
  const sub = (text, align = 'right') => ({ text, alignment: align, bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 8 });

  const tables = [];
  // chart: Cost by Department
  for (const node of chartFromRows(rows, {
    groupKey: (r) => str(r, 'DepartmentCode') || str(r, 'DepartmentName'),
    groupLabel: (r) => str(r, 'DepartmentName'),
    valueFn: (r) => dec(r, 'Cost'), valueHeader: 'Cost', groupHeader: 'Department', digits: 2
  })) tables.push(node);

  const byDept = groupBy(rows || [], (r) => str(r, 'DepartmentCode') || str(r, 'DepartmentName'));
  const deptKeys = [...byDept.keys()].sort((a, b) => String(a).localeCompare(String(b)));
  let grand = 0;

  for (const dk of deptKeys) {
    const list = byDept.get(dk);
    const body = [headRow(columns), groupRowNode(str(list[0], 'DepartmentName'), span)];
    let deptTotal = 0;
    list.forEach((r, i) => {
      const z = zebraOf(i);
      const cost = dec(r, 'Cost');
      deptTotal += cost;
      body.push([
        { text: String(i + 1), alignment: 'center', fontSize: 8, fillColor: z },
        { text: str(r, 'NoOFSB'), alignment: 'center', fontSize: 8, fillColor: z },
        { text: str(r, 'MachineName'), alignment: 'left', fontSize: 8, fillColor: z },
        { text: str(r, 'BreakDownName'), alignment: 'left', fontSize: 8, fillColor: z },
        { text: fmt(cost, 2), alignment: 'right', fontSize: 8, fillColor: z }
      ]);
    });
    body.push([{ ...sub('Sub Total', 'right'), colSpan: 4 }, {}, {}, {}, sub(fmt(deptTotal, 2))]);
    grand += deptTotal;
    tables.push({ table: { headerRows: 1, widths, body }, layout: tableLayout(), margin: [0, 0, 0, 8] });
  }

  if (deptKeys.length === 0) {
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
  return buildPage({ companyName, companyLogo, title: 'BREAK DOWN ENTRY COST REPORT', fromDate, toDate, tables });
}

// sp_ScheduleBreakDown_Cost additionally needs @SBType (defaults to 'B' = Break
// Down) and @ServiceType (M = Mechanical / E = Electrical). Both overridable via
// ?SBType= / ?ServiceType=.
const makeCostParams = (defaultServiceType) => (p, req) => ({
  CompanyCode: { type: sql.Int, value: parseInt(p.CompanyCode) || 0 },
  FromDate: { type: sql.DateTime, value: p.FromDate ? new Date(p.FromDate) : null },
  ToDate: { type: sql.DateTime, value: p.ToDate ? new Date(p.ToDate) : null },
  SBType: { type: sql.NVarChar, value: (req.query && req.query.SBType) || 'B' },
  ServiceType: { type: sql.NVarChar, value: (req.query && req.query.ServiceType) || defaultServiceType }
});

// Factory: Break Down Entry Cost shared by Mechanical (M) and Electrical (E) —
// same SP/layout, only the default ServiceType filter differs.
export function makeBreakDownCost(defaultServiceType) {
  const spParams = makeCostParams(defaultServiceType);
  return (req, res) => runReport(req, res, {
    spName: 'sp_ScheduleBreakDown_Cost',
    fileName: 'BreakDown_Cost',
    spParams,
    buildDocDefinition: (args) => buildCost(args)
  });
}

export const breakDownCost = makeBreakDownCost('M');

// ============================================================================
// sp_BreakDownDepartmentWise — Department Wise Consolidate
// (rptBreakDown_DepartmentWiseConsolidate.rdlc): one row per department with
// No.of BreakDowns / Loss In Time (Hrs) / BreakDown% / Item Cost + grand total.
// ============================================================================
function buildDeptConsolidate({ rows, companyName, companyLogo, fromDate, toDate, query }) {
  let list = filterRows(rows, query);
  list = list.slice().sort((a, b) => str(a, 'DepartmentName').localeCompare(str(b, 'DepartmentName')));

  const columns = [
    { header: 'S.No', width: 36, align: 'center', value: (r, i) => String(i + 1) },
    { header: 'Department', width: '*', value: (r) => str(r, 'DepartmentName') },
    { header: 'No.of BreakDowns', width: 90, align: 'center', value: (r) => fmt(dec(r, 'NoOfBreakDowns'), 0) },
    { header: 'Loss In Time (Hrs)', width: 90, align: 'right', value: (r) => fmt(dec(r, 'LossInTime'), 2) },
    { header: 'BreakDown %', width: 75, align: 'right', value: (r) => fmt(dec(r, 'BreakDownPercentage'), 2) },
    { header: 'Item Cost (Rs)', width: 85, align: 'right', value: (r) => fmt(dec(r, 'ItemCost'), 2) }
  ];
  const widths = columns.map((c) => c.width);
  const tables = [];

  for (const node of chartFromRows(list, {
    groupKey: (r) => str(r, 'DepartmentCode') || str(r, 'DepartmentName'),
    groupLabel: (r) => str(r, 'DepartmentName'),
    valueFn: (r) => dec(r, 'BreakDownPercentage'), valueHeader: 'BreakDown %', groupHeader: 'Department', digits: 2
  })) tables.push(node);

  const body = [columns.map((c) => ({ text: c.header, bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 8 }))];
  let tBd = 0, tLoss = 0, tCost = 0;
  list.forEach((r, i) => {
    const z = i % 2 === 1 ? colors.zebraFill : null;
    tBd += dec(r, 'NoOfBreakDowns'); tLoss += dec(r, 'LossInTime'); tCost += dec(r, 'ItemCost');
    body.push(columns.map((c) => ({ text: c.value(r, i), alignment: c.align || 'left', fontSize: 8, fillColor: z })));
  });
  if (!list.length) {
    body.push([{ text: 'No data for the selected period.', colSpan: 6, italics: true, fontSize: 8 }, {}, {}, {}, {}, {}]);
  } else {
    const g = (t, a = 'right') => ({ text: t, alignment: a, bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 });
    body.push([{ ...g('Total', 'right'), colSpan: 2 }, {}, g(fmt(tBd, 0), 'center'), g(fmt(tLoss, 2)), g(''), g(fmt(tCost, 2))]);
  }
  tables.push({ table: { headerRows: 1, widths, body }, layout: tableLayout(), margin: [0, 0, 0, 8] });

  return buildPage({ companyName, companyLogo, title: 'DEPARTMENT WISE BREAKDOWN COST', fromDate, toDate, tables });
}

const deptConsolidateParams = (p, req) => ({
  CompanyCode: { type: sql.Int, value: parseInt(p.CompanyCode) || 0 },
  FromDate: { type: sql.DateTime, value: p.FromDate ? new Date(p.FromDate) : null },
  ToDate: { type: sql.DateTime, value: p.ToDate ? new Date(p.ToDate) : null },
  ServiceType: { type: sql.NVarChar, value: svcType(req) }
});

export const breakDownDepartmentConsolidate = (req, res) => runReport(req, res, {
  spName: 'sp_BreakDownDepartmentWise',
  fileName: 'BreakDown_DepartmentWiseConsolidate',
  spParams: deptConsolidateParams,
  buildDocDefinition: (args) => buildDeptConsolidate(args)
});

// ============================================================================
// GET /mechanical/reports/break-down/options — filter dropdowns.
// ============================================================================
export const breakDownOptions = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type('text/plain').send('Missing subDBName header');
    const companyCode = parseInt(req.query.CompanyCode || req.headers.companycode) || 0;
    const machineWhere = svcType(req) === 'M' ? 'Status = 1 AND MachineTypeCode = 1' : 'Status = 1';
    const pool = await getPool(subDbName);
    const [branches, departments, machines, breakdowns] = await Promise.all([
      pool.request().input('CompanyCode', sql.Int, companyCode)
        .query('SELECT BranchCode AS value, BranchName AS label FROM tbl_Branch WHERE CompanyCode = @CompanyCode ORDER BY BranchName'),
      pool.request()
        .query('SELECT DepartmentCode AS value, DepartmentName AS label FROM tbl_Department ORDER BY DepartmentName'),
      pool.request().input('CompanyCode', sql.Int, companyCode)
        .query(`SELECT MachineCode AS value, MachineName AS label FROM tbl_Machine WHERE ${machineWhere} ORDER BY MachineName`),
      pool.request()
        .query('SELECT BreakDownMasterCode AS value, BreakDownName AS label FROM tbl_TypeOfBreakDowns ORDER BY BreakDownName')
    ]);
    res.json({
      success: true,
      data: {
        branches: branches.recordset,
        departments: departments.recordset,
        machines: machines.recordset,
        breakdowns: breakdowns.recordset
      }
    });
  } catch (err) {
    console.error('Report Error (breakDownOptions):', err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
};
