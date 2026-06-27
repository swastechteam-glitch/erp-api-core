// Mechanical — Mechanical (Maintenance) Daily Report.
// Mirrors rptMaintenanceDailyReport.rdlc — a single-day composite stitching six
// stored procedures into one document:
//   sp_ScheduleEntry_FullCleaing_DailyReport   (Full Cleaning activity wise)
//   sp_BreakDown_DailyReport                    (Break Down details)
//   sp_ScheduleEntry_DailyReport                (Schedule maintenance)
//   sp_ScheduleEntry_Replacement_DailyReport    (Replacement)
//   sp_ScheduleBreakDown_StoreIssue_DailyReport (Store issue)
//   sp_MaintenanceEmpEngaged_Daily_Report       (Employee engaged)
// Report params: FromDate (the day) + ServiceType.

import {
  runMultiReport, buildPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy, sql
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
  return out;
};

// ---- helpers ---------------------------------------------------------------
const headRow = (columns) =>
  columns.map((c) => ({ text: c.header, bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 8 }));
const zebraOf = (i) => (i % 2 === 1 ? colors.zebraFill : null);
const banner = (title) => ({
  table: { widths: ['*'], body: [[{ text: title, bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 9, margin: [3, 3, 0, 3] }]] },
  layout: 'noBorders', margin: [0, 8, 0, 2]
});
const totalStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 8 };

function totalRow(columns, rows) {
  const firstAgg = columns.findIndex((c) => c.agg);
  if (firstAgg < 0) return null;
  const cells = [{ text: 'Total', colSpan: firstAgg, alignment: 'right', ...totalStyle }];
  for (let i = 1; i < firstAgg; i++) cells.push({});
  for (let i = firstAgg; i < columns.length; i++) {
    const c = columns[i];
    if (!c.agg) { cells.push({ text: '', ...totalStyle }); continue; }
    const sum = rows.reduce((a, r) => a + c.num(r), 0);
    const v = c.agg === 'avg' ? sum / (rows.length || 1) : sum;
    cells.push({ text: fmt(v, c.digits ?? 2), alignment: 'right', ...totalStyle });
  }
  return cells;
}

function buildSection(title, columns, rows) {
  const widths = columns.map((c) => c.width);
  const body = [headRow(columns)];
  const list = rows || [];
  list.forEach((r, i) => {
    const z = zebraOf(i);
    body.push(columns.map((c) => ({ text: c.value(r, i), alignment: c.align || 'left', fontSize: 8, fillColor: z })));
  });
  if (list.length === 0) {
    body.push([{ text: 'No data for the selected day.', colSpan: columns.length, italics: true, fontSize: 8, color: '#888' }, ...Array(columns.length - 1).fill({})]);
  } else {
    const tr = totalRow(columns, list);
    if (tr) body.push(tr);
  }
  return [banner(title), { table: { headerRows: 1, widths, body }, layout: tableLayout(), margin: [0, 0, 0, 6] }];
}

const sno = { header: 'S.No', width: 28, align: 'center', value: (r, i) => String(i + 1) };

function makeBuildDocDefinition(defaultServiceType) {
  return function buildDocDefinition({ data, companyName, companyLogo, fromDate, toDate, query }) {
  const raw = data || {};
  // Branch / Department filters applied to every section (port of the VB DataTable.Select).
  const d = Object.fromEntries(Object.entries(raw).map(([k, rows]) => [k, filterRows(rows, query)]));
  const st = (query && query.ServiceType) || defaultServiceType;
  const serviceType = st ? `${st} ` : '';
  const tables = [];

  // 1) Full Cleaning (activity wise)
  tables.push(...buildSection('Activity Wise Details : Full Cleaning', [
    sno,
    { header: 'Department', width: '*', value: (r) => str(r, 'DepartmentName') },
    { header: 'Machine Group', width: '*', value: (r) => str(r, 'MachineModel') },
    { header: 'No.Of M/C s', width: 70, align: 'center', value: (r) => fmt(dec(r, 'NoOFSB'), 0), agg: 'sum', num: (r) => dec(r, 'NoOFSB'), digits: 0 },
    { header: 'Item Cost', width: 80, align: 'right', value: (r) => fmt(dec(r, 'ItemCost'), 2), agg: 'sum', num: (r) => dec(r, 'ItemCost'), digits: 2 }
  ], d.fullCleaning));

  // 2) Break Down details
  tables.push(...buildSection('BreakDown Details', [
    sno,
    { header: 'Department', width: '*', value: (r) => str(r, 'DepartmentName') },
    { header: 'M/C No', width: '*', value: (r) => str(r, 'MachineName') },
    { header: 'Nature Of BreakDown', width: '*', value: (r) => str(r, 'BreakDownName') },
    { header: 'Stop Hrs', width: 56, align: 'center', value: (r) => fmt(dec(r, 'StopHours') / 60, 2), agg: 'sum', num: (r) => dec(r, 'StopHours') / 60, digits: 2 },
    { header: 'Total Item Cost', width: 72, align: 'right', value: (r) => fmt(dec(r, 'ItemCost'), 2), agg: 'sum', num: (r) => dec(r, 'ItemCost'), digits: 2 },
    { header: 'BD %', width: 50, align: 'center', value: (r) => fmt(dec(r, 'BDPercentage'), 2), agg: 'avg', num: (r) => dec(r, 'BDPercentage'), digits: 2 }
  ], d.breakDown));

  // 3) Schedule maintenance details
  tables.push(...buildSection('Schedule Maintenance Details', [
    sno,
    { header: 'Department', width: '*', value: (r) => str(r, 'DepartmentName') },
    { header: 'M/C No', width: '*', value: (r) => str(r, 'MachineName') },
    { header: 'Activity Description', width: '*', value: (r) => str(r, 'ServiceActivityName') },
    { header: 'Total Item Cost', width: 80, align: 'right', value: (r) => fmt(dec(r, 'ItemCost'), 2), agg: 'sum', num: (r) => dec(r, 'ItemCost'), digits: 2 }
  ], d.schedule));

  // 4) Replacement details
  tables.push(...buildSection('Replacement Details', [
    sno,
    { header: 'Department', width: '*', value: (r) => str(r, 'DepartmentName') },
    { header: 'M/C No', width: '*', value: (r) => str(r, 'MachineName') },
    { header: 'Activity Description', width: '*', value: (r) => str(r, 'ServiceActivityName') },
    { header: 'Total Item Cost', width: 80, align: 'right', value: (r) => fmt(dec(r, 'ItemCost'), 2), agg: 'sum', num: (r) => dec(r, 'ItemCost'), digits: 2 }
  ], d.replacement));

  // 5) Store issue details
  tables.push(...buildSection('Store Issue Details', [
    sno,
    { header: 'Department', width: '*', value: (r) => str(r, 'DepartmentName') },
    { header: 'M/C No', width: '*', value: (r) => str(r, 'MachineName') },
    { header: 'Item Description', width: '*', value: (r) => str(r, 'ItemName') },
    { header: 'Qty', width: 56, align: 'center', value: (r) => fmt(dec(r, 'Qty'), 3), agg: 'sum', num: (r) => dec(r, 'Qty'), digits: 3 },
    { header: 'Cost/Unit', width: 60, align: 'right', value: (r) => fmt(dec(r, 'CostPerUnit'), 2) },
    { header: 'Total Cost', width: 72, align: 'right', value: (r) => fmt(dec(r, 'TotalCost'), 2), agg: 'sum', num: (r) => dec(r, 'TotalCost'), digits: 2 }
  ], d.storeIssue));

  // 6) Employee engaged details
  tables.push(...buildSection('Employee Engaged Details', [
    sno,
    { header: 'Department', width: '*', value: (r) => str(r, 'DepartmentName') },
    { header: 'Dept Incharge', width: 64, align: 'center', value: (r) => fmt(dec(r, 'NoOfDeptInchare'), 0), agg: 'sum', num: (r) => dec(r, 'NoOfDeptInchare'), digits: 0 },
    { header: 'Fitter', width: 56, align: 'center', value: (r) => fmt(dec(r, 'NoOfFitter'), 0), agg: 'sum', num: (r) => dec(r, 'NoOfFitter'), digits: 0 },
    { header: 'Fitter Asst', width: 56, align: 'center', value: (r) => fmt(dec(r, 'NoOfFitterAss'), 0), agg: 'sum', num: (r) => dec(r, 'NoOfFitterAss'), digits: 0 },
    { header: 'Civil Ladies', width: 56, align: 'center', value: (r) => fmt(dec(r, 'NoOfCivilLadies'), 0), agg: 'sum', num: (r) => dec(r, 'NoOfCivilLadies'), digits: 0 },
    { header: 'No Of Emp', width: 56, align: 'center', value: (r) => fmt(dec(r, 'TotalEmployee'), 0), agg: 'sum', num: (r) => dec(r, 'TotalEmployee'), digits: 0 },
    { header: 'Salary', width: 72, align: 'right', value: (r) => fmt(dec(r, 'TotalSalary'), 2), agg: 'sum', num: (r) => dec(r, 'TotalSalary'), digits: 2 }
  ], d.empEngaged));

  return buildPage({
    companyName, companyLogo,
    title: `${serviceType}MAINTENANCE DAILY REPORT`,
    fromDate, toDate, tables
  });
  };
}

// every proc runs for the period with CompanyCode + FromDate + ToDate + ServiceType
const makeDailyParams = (defaultServiceType) => (p, req) => ({
  CompanyCode: { type: sql.Int, value: parseInt(p.CompanyCode) || 0 },
  FromDate: { type: sql.DateTime, value: p.FromDate ? new Date(p.FromDate) : null },
  ToDate: { type: sql.DateTime, value: p.ToDate ? new Date(p.ToDate) : null },
  ServiceType: { type: sql.NVarChar, value: (req.query && req.query.ServiceType) || defaultServiceType }
});

// Factory: the Maintenance Daily Report composite is shared by Mechanical (M)
// and Electrical (E) — same six SPs, same layout, only the default ServiceType
// filter and the download file name differ.
export function makeDailyReport({ fileName, defaultServiceType }) {
  const dailyParams = makeDailyParams(defaultServiceType);
  const buildDocDefinition = makeBuildDocDefinition(defaultServiceType);
  return (req, res) => runMultiReport(req, res, {
    fileName,
    procs: [
      { key: 'fullCleaning', spName: 'sp_ScheduleEntry_FullCleaing_DailyReport', spParams: dailyParams },
      { key: 'breakDown', spName: 'sp_BreakDown_DailyReport', spParams: dailyParams },
      { key: 'schedule', spName: 'sp_ScheduleEntry_DailyReport', spParams: dailyParams },
      { key: 'replacement', spName: 'sp_ScheduleEntry_Replacement_DailyReport', spParams: dailyParams },
      { key: 'storeIssue', spName: 'sp_ScheduleBreakDown_StoreIssue_DailyReport', spParams: dailyParams },
      { key: 'empEngaged', spName: 'sp_MaintenanceEmpEngaged_Daily_Report', spParams: dailyParams }
    ],
    buildDocDefinition
  });
}

export const mechanicalDailyReport = makeDailyReport({ fileName: 'MechanicalDailyReport', defaultServiceType: 'M' });

// GET /mechanical/reports/daily-report/options — Branch / Department dropdowns.
export const mechanicalDailyReportOptions = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type('text/plain').send('Missing subDBName header');
    const companyCode = parseInt(req.query.CompanyCode || req.headers.companycode) || 0;
    const pool = await getPool(subDbName);
    const [branches, departments] = await Promise.all([
      pool.request().input('CompanyCode', sql.Int, companyCode)
        .query('SELECT BranchCode AS value, BranchName AS label FROM tbl_Branch WHERE CompanyCode = @CompanyCode ORDER BY BranchName'),
      pool.request()
        .query('SELECT DepartmentCode AS value, DepartmentName AS label FROM tbl_Department WHERE DepartmentCode IN (SELECT DepartmentCode FROM tbl_Machine WHERE Status = 1) ORDER BY DepartmentName')
    ]);
    res.json({
      success: true,
      data: { branches: branches.recordset, departments: departments.recordset }
    });
  } catch (err) {
    console.error('Report Error (mechanicalDailyReportOptions):', err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
};
