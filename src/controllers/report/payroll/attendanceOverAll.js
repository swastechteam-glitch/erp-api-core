// =============================================================================
// Payroll ▸ Reports ▸ Attendance Over All  (form: rptAttendanceOverAll)
// =============================================================================
// Port of the WinForms rptAttendanceOverAll screen — a working-days cross-tab.
// The Day / Month / Year radios choose the SP + matrix shape:
//
//   Day Wise   → sp_EmpAtten_OverAll_DayWise            Department × Day
//   Month Wise → sp_EmpAtten_OverAll (@MonthWise=1)     Employee   × MonYear
//   Year Wise  → sp_EmpAtten_OverAll (@YearWise=1)      Employee   × MonYear
//
// The cell is Sum(WDays). After fetch the rows are narrowed in memory by the
// rail combos (Emp Group / Category / Department / Designation / Employee /
// Agent / Gender), each applied only when that column exists on the recordset.
//
//   GET /payroll/reports/attendance-overall
//     ?groupBy=dayWise|monthWise|yearWise   (default dayWise)
//     &empStatus=1|0  &CompanyCode  &FromDate  &ToDate
//     &EmpGroupCode &EmpCategoryCode &DepartmentCode &DesignationCode
//     &EmployeeCode &AgentCode &SexCode      (comma-separated code lists)
//
// SP inputs mirror rptAttendanceOverAll.vb: @FromDate, @ToDate, @Emp_Status,
// @CompanyCode (when > 0), and (month/year only) @MonthWise + @YearWise.

import sql from 'mssql';
import { getPool } from '../../../config/dynamicDB.js';
import { renderPdf, getCompanyInfo } from '../cotton/_common.js';
import { buildEmployeePage, headStyle, tableLayout, colors, str, fmt, ddmmyyyy } from './_common.js';

const num = (v) => { const n = Number(v); return isNaN(n) ? 0 : n; };

// ---------------------------------------------------------------------------
// In-memory filter rail (mirrors the VB DataTable.Select chain). Applied only
// when the recordset actually exposes the column (the DayWise SP aggregates and
// omits several code columns, so those filters no-op instead of wiping rows).
// ---------------------------------------------------------------------------
const codeSet = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const s = new Set(String(v).split(',').map((x) => x.trim()).filter(Boolean));
  return s.size ? s : null;
};

const ROW_FILTERS = [
  ['EmpGroupCode', 'EmpGroupCode'],
  ['EmpCategoryCode', 'EmpCategoryCode'],
  ['DepartmentCode', 'DepartmentCode'],
  ['DesignationCode', 'DesignationCode'],
  ['EmployeeCode', 'EmployeeCode'],
  ['AgentCode', 'AgentCode'],
  ['SexCode', 'SexCode']
];

function applyOverAllFilters(rows, query) {
  if (!Array.isArray(rows) || rows.length === 0) return rows || [];
  const sample = rows[0];
  const active = [];
  for (const [param, col] of ROW_FILTERS) {
    const set = codeSet(query[param]);
    if (!set) continue;
    if (!Object.prototype.hasOwnProperty.call(sample, col)) continue;
    active.push({ col, set });
  }
  if (!active.length) return rows;
  return rows.filter((r) => active.every(({ col, set }) => set.has(String(r[col]))));
}

// ---------------------------------------------------------------------------
// Shared pivot renderer — leading descriptor columns + one column per pivot key
// (summing `valueFn`), a per-row Total, and a grand Total row.
// ---------------------------------------------------------------------------
const gStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 8 };

function buildSumPivot({ rows, entityKeyFn, descriptors, colKeyFn, colLabel, valueFn, keyFontSize = 7 }) {
  // distinct pivot columns, in first-seen (SP) order
  const colKeys = [];
  const seen = new Set();
  for (const r of rows) {
    const k = colKeyFn(r);
    if (k === '' || k == null || seen.has(k)) continue;
    seen.add(k); colKeys.push(k);
  }

  // aggregate entity × colKey → sum(value)
  const entities = new Map();
  for (const r of rows) {
    const ek = entityKeyFn(r);
    if (!entities.has(ek)) entities.set(ek, { sample: r, cells: {} });
    const ck = colKeyFn(r);
    if (ck === '' || ck == null) continue;
    entities.get(ek).cells[ck] = (entities.get(ek).cells[ck] || 0) + num(valueFn(r));
  }
  const list = [...entities.values()];

  const header = [
    ...descriptors.map((d) => ({ text: d.header, ...headStyle, alignment: d.align || 'center' })),
    ...colKeys.map((k) => ({ text: colLabel(k), ...headStyle, fontSize: keyFontSize })),
    { text: 'Total', ...headStyle }
  ];
  const body = [header];

  const colTotals = colKeys.map(() => 0);
  let grand = 0;
  list.forEach((e, i) => {
    const zebra = i % 2 === 1 ? colors.zebraFill : null;
    let rowTot = 0;
    const cells = descriptors.map((d) => ({
      text: d.value(e.sample), alignment: d.align || 'left', fontSize: 7.5, fillColor: zebra
    }));
    colKeys.forEach((k, ci) => {
      const v = e.cells[k] || 0;
      rowTot += v; colTotals[ci] += v;
      cells.push({ text: v ? String(v) : '', alignment: 'center', fontSize: keyFontSize, fillColor: zebra });
    });
    grand += rowTot;
    cells.push({ text: String(rowTot), alignment: 'right', bold: true, fontSize: 7.5, fillColor: zebra });
    body.push(cells);
  });

  // grand total row
  const totalRow = [
    { text: 'Total', colSpan: descriptors.length, alignment: 'right', ...gStyle },
    ...Array(descriptors.length - 1).fill({}),
    ...colTotals.map((v) => ({ text: String(v), alignment: 'center', ...gStyle })),
    { text: String(grand), alignment: 'right', ...gStyle }
  ];
  body.push(totalRow);

  const widths = [
    ...descriptors.map((d) => d.width),
    ...colKeys.map(() => 22),
    40
  ];
  return [{ table: { headerRows: 1, dontBreakRows: true, widths, body }, layout: tableLayout() }];
}

// Day Wise — Department (rows) × Day-of-range (cols), cell = Sum(WDays).
function buildDayWise(rows) {
  return buildSumPivot({
    rows,
    entityKeyFn: (r) => str(r, 'DepartmentName') || str(r, 'DepartmentName_English') || '(No Dept)',
    descriptors: [
      { header: 'Department', width: '*', align: 'left', value: (r) => str(r, 'DepartmentName') || str(r, 'DepartmentName_English') || '(No Dept)' }
    ],
    colKeyFn: (r) => String(r.AttnDate ?? ''),
    colLabel: (k) => k,
    valueFn: (r) => r.WDays,
    keyFontSize: 7
  });
}

// Month/Year Wise — Employee (rows) × MonYear (cols), cell = Sum(WDays).
function buildMonthYear(rows) {
  return buildSumPivot({
    rows,
    entityKeyFn: (r) => str(r, 'EmployeeCode'),
    descriptors: [
      { header: 'T.No', width: 40, align: 'center', value: (r) => str(r, 'EmployeeID') },
      { header: 'Employee Name', width: '*', align: 'left', value: (r) => str(r, 'EmployeeName') },
      { header: 'D.O.J', width: 56, align: 'center', value: (r) => (r.DateOfJoining ? ddmmyyyy(r.DateOfJoining) : '') },
      { header: 'Salary', width: 52, align: 'right', value: (r) => fmt(num(r.Salary), 2) },
      { header: 'Department', width: 100, align: 'left', value: (r) => str(r, 'DepartmentName_English') || str(r, 'DepartmentName') }
    ],
    colKeyFn: (r) => str(r, 'MonYear'),
    colLabel: (k) => k,
    valueFn: (r) => r.WDays,
    keyFontSize: 7.5
  });
}

const REPORTS = {
  dayWise: { title: 'Attendance Over All - Day Wise', build: buildDayWise },
  monthWise: { title: 'Attendance Over All - Month Wise', build: buildMonthYear },
  yearWise: { title: 'Attendance Over All - Year Wise', build: buildMonthYear }
};

function pickReport(query) {
  const raw = String(query.groupBy || query.reportType || 'dayWise').trim();
  return REPORTS[raw] ? raw : 'dayWise';
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------
export const attendanceOverAllReport = async (req, res) => {
  const t0 = Date.now();
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type('text/plain').send('Missing subDBName header');

    const debug = req.query.debug === '1';
    const reportType = pickReport(req.query);
    const cfg = REPORTS[reportType];
    const isDayWise = reportType === 'dayWise';
    const spName = isDayWise ? 'sp_EmpAtten_OverAll_DayWise' : 'sp_EmpAtten_OverAll';

    const companyCode = req.query.CompanyCode || req.query.companyCode || req.headers.companycode || '0';
    const companyCodeInt = parseInt(companyCode) || 0;
    const today = new Date().toISOString().slice(0, 10);
    const fromDate = req.query.FromDate || req.query.fromDate || today;
    const toDate = req.query.ToDate || req.query.toDate || today;
    const empStatus = req.query.empStatus === undefined
      ? 1
      : (req.query.empStatus === '1' || req.query.empStatus === 'true' ? 1 : 0);

    const pool = await getPool(subDbName);
    const spReq = pool.request();
    spReq.input('FromDate', sql.DateTime, new Date(fromDate));
    spReq.input('ToDate', sql.DateTime, new Date(toDate));
    spReq.input('Emp_Status', sql.Bit, empStatus);
    if (companyCodeInt > 0) spReq.input('CompanyCode', sql.Int, companyCodeInt);
    if (!isDayWise) {
      spReq.input('MonthWise', sql.Int, reportType === 'monthWise' ? 1 : 0);
      spReq.input('YearWise', sql.Int, reportType === 'yearWise' ? 1 : 0);
    }

    const spResult = await spReq.execute(spName);
    const rows = applyOverAllFilters(spResult.recordset || [], req.query);
    const company = await getCompanyInfo(pool, companyCode);

    const docDef = buildEmployeePage({
      companyName: company.name,
      companyLogo: company.logo,
      title: cfg.title,
      orientation: 'landscape',
      fromDate,
      toDate,
      tables: cfg.build(rows)
    });
    const pdfBuffer = await renderPdf(docDef);

    if (debug) {
      const dbCfg = pool.config || {};
      const sample = rows.slice(0, 3).map((r, i) => `  [${i}] ` + JSON.stringify(r).slice(0, 260)).join('\n');
      return res.type('text/plain').send(
        [
          `SP:           ${spName}`,
          `reportType:   ${reportType}`,
          `Emp_Status:   ${empStatus}`,
          `subDBName:    ${subDbName}`,
          `server:       ${dbCfg.server}${dbCfg.port ? ':' + dbCfg.port : ''}`,
          `database:     ${dbCfg.database}`,
          `company:      ${company.name || '(none)'} (${companyCodeInt})`,
          `FromDate:     ${fromDate}`,
          `ToDate:       ${toDate}`,
          `rows:         ${rows.length}`,
          `Total:        ${Date.now() - t0} ms (${pdfBuffer.length} pdf bytes)`,
          sample ? `\nfirst rows:\n${sample}` : ''
        ].join('\n')
      );
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="AttendanceOverAll_${reportType}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
};
