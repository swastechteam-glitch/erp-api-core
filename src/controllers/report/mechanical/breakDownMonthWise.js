// Mechanical — BreakDown MonthWise Report (port of rptBreakDownMonthWise.vb).
//
// Two report families selected by ?groupBy=:
//   cost | percentage  -> sp_BreakDown_MonthWise_Report (fiscal Apr->Mar columns
//                         + Total), rptBreakDownDetailsMonthWise[_Percent].rdlc
//   year              -> sp_BreakDown_YearWise (Department x Year matrix),
//                         rptBreakdownDetailsYearwise.rdlc
//
// Filters: a single Branch dropdown (the legacy screen) + date range.

import {
  runReport, buildPage, tableLayout, colors, dec, str, fmt, sql
} from '../cotton/_common.js';
import { getPool } from '../../../config/dynamicDB.js';

const firstCode = (v) => {
  if (v === undefined || v === null || v === '') return 0;
  const n = parseInt(String(v).split(',')[0], 10);
  return Number.isNaN(n) ? 0 : n;
};
const svcType = (req) => (String(req.query.serviceType || 'M').toUpperCase() === 'E' ? 'E' : 'M');
const headRow = (cols) => cols.map((c) => ({ text: c.header, bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: c.align || 'center', fontSize: 8 }));
const zebra = (i) => (i % 2 === 1 ? colors.zebraFill : null);

// Fiscal-year month columns (Apr -> Mar). `July` matches the SP field name.
const MONTHS = [
  ['Apr', 'APR'], ['May', 'MAY'], ['Jun', 'JUN'], ['July', 'JULY'], ['Aug', 'AUG'], ['Sep', 'SEP'],
  ['Oct', 'OCT'], ['Nov', 'NOV'], ['Dec', 'DEC'], ['Jan', 'JAN'], ['Feb', 'FEB'], ['Mar', 'MAR'],
];

// ---- Month-wise (Cost / Percentage) ----------------------------------------
function buildMonthWise({ rows, companyName, companyLogo, fromDate, toDate, query }) {
  const isPercent = String(query?.groupBy || '') === 'percentage';
  const title = isPercent ? 'BREAKDOWN DETAILS - MONTH WISE (%)' : 'BREAKDOWN DETAILS - MONTH WISE';
  const columns = [
    { header: 'S.No', width: 32, align: 'center' },
    { header: 'Department Name', width: '*', align: 'left' },
    ...MONTHS.map(([, h]) => ({ header: h, width: 44, align: 'center' })),
    { header: 'TOTAL', width: 55, align: 'center' },
  ];
  const widths = columns.map((c) => c.width);
  const list = rows || [];
  const body = [headRow(columns)];
  list.forEach((r, i) => {
    const z = zebra(i);
    const cells = [
      { text: String(i + 1), alignment: 'center', fontSize: 8, fillColor: z },
      { text: str(r, 'DepartmentName'), alignment: 'left', fontSize: 8, fillColor: z },
      ...MONTHS.map(([f]) => ({ text: fmt(dec(r, f), 2), alignment: 'center', fontSize: 8, fillColor: z })),
      { text: fmt(dec(r, 'Total'), 2), alignment: 'center', fontSize: 8, fillColor: z },
    ];
    body.push(cells);
  });
  if (!list.length) {
    body.push([{ text: 'No data for the selected period.', colSpan: columns.length, italics: true, fontSize: 8 }, ...Array(columns.length - 1).fill({})]);
  } else {
    const agg = (f) => {
      const vals = list.map((r) => dec(r, f));
      const sum = vals.reduce((s, v) => s + v, 0);
      return isPercent ? sum / (vals.length || 1) : sum;
    };
    const g = (t, a = 'center') => ({ text: t, alignment: a, bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 8 });
    body.push([
      { ...g('Grand Total', 'right'), colSpan: 2 }, {},
      ...MONTHS.map(([f]) => g(fmt(agg(f), 2))),
      g(fmt(agg('Total'), 2)),
    ]);
  }
  return buildPage({ companyName, companyLogo, title, fromDate, toDate, tables: [{ table: { headerRows: 1, widths, body }, layout: tableLayout() }] });
}

// ---- Year-wise (Department x Year matrix) ----------------------------------
function buildYearWise({ rows, companyName, companyLogo, fromDate, toDate }) {
  const list = rows || [];
  const years = [...new Set(list.map((r) => parseInt(r.Year, 10)).filter((y) => !Number.isNaN(y)))].sort((a, b) => a - b);
  const deptMap = new Map();
  for (const r of list) {
    const key = str(r, 'DepartmentCode') || str(r, 'DepartmentName');
    if (!deptMap.has(key)) deptMap.set(key, { name: str(r, 'DepartmentName'), byYear: {} });
    const y = parseInt(r.Year, 10);
    deptMap.get(key).byYear[y] = (deptMap.get(key).byYear[y] || 0) + dec(r, 'Field');
  }
  const depts = [...deptMap.values()].sort((a, b) => a.name.localeCompare(b.name));

  const columns = [
    { header: 'S.No', width: 32, align: 'center' },
    { header: 'Department Name', width: '*', align: 'left' },
    ...years.map((y) => ({ header: String(y), width: 70, align: 'right' })),
  ];
  const widths = columns.map((c) => c.width);
  const body = [headRow(columns)];
  depts.forEach((d, i) => {
    const z = zebra(i);
    body.push([
      { text: String(i + 1), alignment: 'center', fontSize: 8, fillColor: z },
      { text: d.name, alignment: 'left', fontSize: 8, fillColor: z },
      ...years.map((y) => ({ text: fmt(d.byYear[y] || 0, 2), alignment: 'right', fontSize: 8, fillColor: z })),
    ]);
  });
  if (!depts.length) body.push([{ text: 'No data for the selected period.', colSpan: columns.length, italics: true, fontSize: 8 }, ...Array(columns.length - 1).fill({})]);

  return buildPage({ companyName, companyLogo, title: 'BREAKDOWN DETAILS - YEAR WISE', fromDate, toDate, tables: [{ table: { headerRows: 1, widths, body }, layout: tableLayout() }] });
}

// SP param builders (BranchCode added only when chosen, mirroring the VB form).
const monthWiseParams = (p, req) => {
  const out = {
    CompanyCode: { type: sql.Int, value: parseInt(p.CompanyCode) || 0 },
    FromDate: { type: sql.DateTime, value: p.FromDate ? new Date(p.FromDate) : null },
    ToDate: { type: sql.DateTime, value: p.ToDate ? new Date(p.ToDate) : null },
    ServiceType: { type: sql.NVarChar, value: svcType(req) },
  };
  const branch = firstCode(req.query.branchCode);
  if (branch > 0) out.BranchCode = { type: sql.Int, value: branch };
  const mode = String(req.query.groupBy || 'cost');
  if (mode === 'percentage') out.Percentage = { type: sql.Int, value: 1 };
  else if (mode === 'noofbd') out.NoOfBD = { type: sql.Int, value: 1 };
  else out.Cost = { type: sql.Int, value: 1 };
  return out;
};
const yearWiseParams = (p, req) => {
  const out = {
    CompanyCode: { type: sql.Int, value: parseInt(p.CompanyCode) || 0 },
    FromDate: { type: sql.DateTime, value: p.FromDate ? new Date(p.FromDate) : null },
    ToDate: { type: sql.DateTime, value: p.ToDate ? new Date(p.ToDate) : null },
    ServiceType: { type: sql.NVarChar, value: svcType(req) },
    Cost: { type: sql.Int, value: 1 },
    Percentage: { type: sql.Int, value: 0 },
    NoOfBD: { type: sql.Int, value: 0 },
  };
  const branch = firstCode(req.query.branchCode);
  if (branch > 0) out.BranchCode = { type: sql.Int, value: branch };
  return out;
};

export const breakDownMonthWise = (req, res) => runReport(req, res, {
  spName: 'sp_BreakDown_MonthWise_Report',
  fileName: 'BreakDown_MonthWise',
  spParams: monthWiseParams,
  buildDocDefinition: (args) => buildMonthWise(args),
});

export const breakDownYearWise = (req, res) => runReport(req, res, {
  spName: 'sp_BreakDown_YearWise',
  fileName: 'BreakDown_YearWise',
  spParams: yearWiseParams,
  buildDocDefinition: (args) => buildYearWise(args),
});

// GET /mechanical/reports/break-down-month-wise/options — Branch dropdown.
export const breakDownMonthWiseOptions = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type('text/plain').send('Missing subDBName header');
    const companyCode = parseInt(req.query.CompanyCode || req.headers.companycode) || 0;
    const pool = await getPool(subDbName);
    const branches = await pool.request().input('CompanyCode', sql.Int, companyCode)
      .query('SELECT BranchCode AS value, BranchName AS label FROM tbl_Branch WHERE CompanyCode = @CompanyCode ORDER BY BranchName');
    res.json({ success: true, data: { branches: branches.recordset } });
  } catch (err) {
    console.error('Report Error (breakDownMonthWiseOptions):', err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
};
