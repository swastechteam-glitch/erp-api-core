// =============================================================================
// Payroll ▸ Reports ▸ Late In Details  (form: rptLateInDetails)
// =============================================================================
// Port of the WinForms rptLateInDetails screen. That form ran ONE stored
// procedure (sp_Employee_Attendance) with @Attn = 6 (the Late-In sub-report),
// narrowed the rows in memory with a rail of combos, then rendered one of two
// .rdlc layouts chosen by the Detailed / Matrix radios:
//
//   Detailed → rptAttendanceDetailsLateIn.rdlc         one row per day/punch
//   Matrix   → rptAttendanceDetailsLateIn_Matrix.rdlc  Employee × Day (Late_In)
//
//   GET /payroll/reports/attendance/late-in
//     ?groupBy=detailed|matrix   // which layout (default detailed)
//     &empStatus=1|0             // live employees (1, default) vs all
//     &CompanyCode &FromDate &ToDate
//     &ShiftCode &EmpGroupCode &EmpCategoryCode &DepartmentCode
//     &DesignationCode &EmployeeCode        // comma-separated code lists
//
// @Attn is fixed at 6 (Late In) exactly as rptLateInDetails.vb hard-codes it.
//
// SP: sp_Employee_Attendance (FromDate, ToDate, Attn=6, Emp_Status, CompanyCode)

import sql from 'mssql';
import { getPool } from '../../../config/dynamicDB.js';
import { applyBranchCode } from '../../../utils/common.js';
import { renderPdf, getCompanyInfo } from '../cotton/_common.js';
import {
  buildEmployeePage, groupedTable, headStyle, tableLayout, colors,
  str, ddmmyyyy, hhmm
} from './_common.js';

const LATE_IN_ATTN = 6;   // rptLateInDetails.vb: objSqlCommand.Parameters.AddWithValue("@Attn", 6)

// ---------------------------------------------------------------------------
// In-memory filter rail (mirrors the VB DataTable.Select chain on the screen).
// Each param is a comma-separated code list; a filter no-ops when the column is
// absent from the recordset or the param is empty.
// ---------------------------------------------------------------------------
const codeSet = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const s = new Set(String(v).split(',').map((x) => x.trim()).filter(Boolean));
  return s.size ? s : null;
};

const ROW_FILTERS = [
  ['ShiftCode', 'ShiftCode'],
  ['EmpGroupCode', 'EmpGroupCode'],
  ['EmpCategoryCode', 'EmpCategoryCode'],
  ['DepartmentCode', 'DepartmentCode'],
  ['DesignationCode', 'DesignationCode'],
  ['EmployeeCode', 'EmployeeCode']
];

function applyLateInFilters(rows, query) {
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
// Small value helpers
// ---------------------------------------------------------------------------
const dayKey = (r) => (r.CalendarDate ? new Date(r.CalendarDate).toISOString().slice(0, 10) : '');
const ddmm = (d) => { const s = ddmmyyyy(d); return s ? s.slice(0, 5) : ''; };

// In / Out time cell: "NP" when the day is Present but there's no punch time,
// else "hh:mm tt" — mirrors the .rdlc IIF(InTime=nothing AND Status="P","NP",…).
const punch = (r, field) => {
  const v = r[field];
  const empty = v === null || v === undefined || v === '';
  if (empty && String(r.Status || '').trim().toUpperCase() === 'P') return 'NP';
  return hhmm(v);
};

// ---------------------------------------------------------------------------
// Detailed — one row per day, grouped by Employee Group (rptAttendanceDetailsLateIn.rdlc).
// Columns mirror the .rdlc header order; rows sort by CalendarDate within group.
// ---------------------------------------------------------------------------
function buildDetailed(rows) {
  const cols = [
    { header: 'Date', width: 58, align: 'center', value: (r) => ddmmyyyy(r.CalendarDate) },
    { header: 'Shift', width: 66, value: (r) => str(r, 'ShiftName') },
    { header: 'Department', width: 96, value: (r) => str(r, 'DepartmentName_English') || str(r, 'DepartmentName') },
    { header: 'Designation', width: 96, value: (r) => str(r, 'DesignationName') },
    { header: 'ID', width: 36, align: 'center', value: (r) => str(r, 'EmployeeID') },
    { header: 'Employee Name', width: '*', value: (r) => str(r, 'EmployeeName') },
    { header: 'In Time', width: 54, align: 'center', value: (r) => punch(r, 'InTime') },
    { header: 'Late In', width: 48, align: 'center', value: (r) => str(r, 'Late_In') },
    { header: 'Out Time', width: 54, align: 'center', value: (r) => punch(r, 'OutTime') },
    { header: 'Early Out', width: 50, align: 'center', value: (r) => str(r, 'Early_Out') },
    { header: 'W. Hours', width: 48, align: 'center', value: (r) => str(r, 'Working_Hours') },
    { header: 'OT Hours', width: 48, align: 'center', value: (r) => str(r, 'OT_Hours') },
    { header: 'Tot. Late', width: 46, align: 'right', value: (r) => str(r, 'TotalLateIn') }
  ];
  return [groupedTable(cols, rows, {
    groupBy: (r) => str(r, 'EmpGroupName') || '(No Group)',
    groupLabel: (r) => str(r, 'EmpGroupName') || '(No Group)',
    sortRows: (a, b) => dayKey(a).localeCompare(dayKey(b))
  })];
}

// ---------------------------------------------------------------------------
// Matrix — Employee (rows) × Day (cols), cell = the Late_In value for that day
// (rptAttendanceDetailsLateIn_Matrix.rdlc: First(Late_In) per employee/date).
// ---------------------------------------------------------------------------
function buildMatrixLateIn(rows) {
  const dateKeys = [...new Set(rows.map(dayKey))].filter(Boolean).sort();
  const empMap = new Map();
  for (const r of rows) {
    const ek = str(r, 'EmployeeCode');
    if (!empMap.has(ek)) {
      empMap.set(ek, { id: str(r, 'EmployeeID'), name: str(r, 'EmployeeName'), cells: {} });
    }
    const dk = dayKey(r);
    if (dk && empMap.get(ek).cells[dk] === undefined) empMap.get(ek).cells[dk] = str(r, 'Late_In');
  }
  const emps = [...empMap.values()].sort(
    (a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true })
  );

  const header = [
    { text: 'S.No', ...headStyle }, { text: 'ID', ...headStyle }, { text: 'Employee Name', ...headStyle },
    ...dateKeys.map((d) => ({ text: ddmm(d), ...headStyle, fontSize: 6.5 }))
  ];
  const body = [header];
  emps.forEach((e, i) => {
    const zebra = i % 2 === 1 ? colors.zebraFill : null;
    body.push([
      { text: String(i + 1), alignment: 'center', fontSize: 7, fillColor: zebra },
      { text: e.id, alignment: 'center', fontSize: 7, fillColor: zebra },
      { text: e.name, alignment: 'left', fontSize: 7, fillColor: zebra },
      ...dateKeys.map((d) => ({ text: e.cells[d] || '', alignment: 'center', fontSize: 6.5, fillColor: zebra }))
    ]);
  });

  const widths = [22, 34, '*', ...dateKeys.map(() => 20)];
  return [{ table: { headerRows: 1, widths, body }, layout: tableLayout() }];
}

const REPORTS = {
  detailed: { title: 'Attendance Late In Details', build: buildDetailed },
  matrix: { title: 'Attendance Late In Abstract', build: buildMatrixLateIn }
};

function pickReport(query) {
  const raw = String(query.groupBy || query.reportType || 'detailed').trim();
  return REPORTS[raw] ? raw : 'detailed';
}

// ---------------------------------------------------------------------------
// Orchestrator — runs sp_Employee_Attendance with @Attn = 6, applies the
// in-memory filter rail, and dispatches to the chosen layout.
// ---------------------------------------------------------------------------
export const attendanceLateInReport = async (req, res) => {
  const t0 = Date.now();
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type('text/plain').send('Missing subDBName header');

    const debug = req.query.debug === '1';
    const reportType = pickReport(req.query);
    const cfg = REPORTS[reportType];
    const companyCode = req.query.CompanyCode || req.query.companyCode || req.headers.companycode || '0';
    const today = new Date().toISOString().slice(0, 10);
    const fromDate = req.query.FromDate || req.query.fromDate || today;
    const toDate = req.query.ToDate || req.query.toDate || today;

    // Emp_Status: 1 = live employees (default), 0 = all.
    const empStatus = req.query.empStatus === undefined
      ? 1
      : (req.query.empStatus === '1' || req.query.empStatus === 'true' ? 1 : 0);

    const pool = await getPool(subDbName);
    const spReq = pool.request();
    applyBranchCode(spReq, req.headers);                 // BranchCode or CompanyCode
    spReq.input('FromDate', sql.DateTime, new Date(fromDate));
    spReq.input('ToDate', sql.DateTime, new Date(toDate));
    spReq.input('Attn', sql.Int, LATE_IN_ATTN);
    spReq.input('Emp_Status', sql.Bit, empStatus);

    const spResult = await spReq.execute('sp_Employee_Attendance');
    const rows = applyLateInFilters(spResult.recordset || [], req.query);
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
          `SP:           sp_Employee_Attendance`,
          `reportType:   ${reportType}`,
          `Attn:         ${LATE_IN_ATTN}`,
          `Emp_Status:   ${empStatus}`,
          `subDBName:    ${subDbName}`,
          `server:       ${dbCfg.server}${dbCfg.port ? ':' + dbCfg.port : ''}`,
          `database:     ${dbCfg.database}`,
          `company:      ${company.name || '(none)'}`,
          `FromDate:     ${fromDate}`,
          `ToDate:       ${toDate}`,
          `rows:         ${rows.length}`,
          `Total:        ${Date.now() - t0} ms (${pdfBuffer.length} pdf bytes)`,
          sample ? `\nfirst rows:\n${sample}` : ''
        ].join('\n')
      );
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="AttendanceLateIn_${reportType}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
};
