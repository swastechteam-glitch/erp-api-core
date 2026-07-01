// =============================================================================
// Payroll ▸ Reports ▸ Attendance Detail Report  (form: rptAttendanceDetails)
// =============================================================================
// One controller, many report-type layouts — a faithful port of the WinForms
// rptAttendanceDetails screen. That form ran ONE stored procedure
// (sp_Employee_Attendance) and then picked one of ~12 .rdlc layouts from the
// report-type radios, while the "All / Present / Below Shift / Leave / Only
// Leave" radios + the report name decided the @Attn / @EntryMode SP inputs.
//
//   GET /payroll/reports/attendance/details
//     ?groupBy=<reportType>      // which layout (default dateWise)
//     &status=<attnStatus>       // all|present|belowShift|leave|onlyLeave
//     &empStatus=1|0             // live employees (1, default) vs all
//     &CompanyCode &FromDate &ToDate
//     &ShiftCode &EmpGroupCode &EmpCategoryCode &DepartmentCode
//     &DesignationCode &EmployeeCode &PayTypeCode &SexCode &AgentCode
//     &ManualEntryReasonCode     // comma-separated code lists (in-memory filter)
//
// @Attn precedence mirrors rptAttendanceDetails.vb exactly:
//   MisMatch → 9 ; All → 8 ; Below Shift → 3 ; OT report → 4 ;
//   Present → 5 ; Leave → 11 ; Only Leave → (omit).
// Manual Entry report also sends @EntryMode = 1.
//
// SP: sp_Employee_Attendance (FromDate, ToDate, Attn?, EntryMode?, Emp_Status, CompanyCode)

import sql from 'mssql';
import { getPool } from '../../../config/dynamicDB.js';
import { applyBranchCode } from '../../../utils/common.js';
import { renderPdf, getCompanyInfo } from '../cotton/_common.js';
import {
  buildEmployeePage, groupedTable, flatTable, buildMatrix,
  headStyle, tableLayout, colors, str, dec, fmt, ddmmyyyy, hhmm
} from './_common.js';

// ---------------------------------------------------------------------------
// @Attn / @EntryMode resolution (rptAttendanceDetails.vb parity)
// ---------------------------------------------------------------------------
const OT_TYPES = new Set(['withOT', 'otDetails']);
const MISPUNCH_TYPES = new Set(['misPunch', 'misMatch']);

function resolveAttn(reportType, status) {
  if (MISPUNCH_TYPES.has(reportType)) return 9;   // MisMatch forces 9
  if (status === 'all') return 8;
  if (status === 'belowShift') return 3;
  if (OT_TYPES.has(reportType)) return 4;         // OT reports force 4
  if (status === 'present') return 5;
  if (status === 'leave') return 11;
  return null;                                    // onlyLeave → no @Attn
}

// Split a comma-separated "1,2,3" query value into a Set of trimmed strings.
const codeSet = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const s = new Set(String(v).split(',').map((x) => x.trim()).filter(Boolean));
  return s.size ? s : null;
};

// query param -> row column it filters on (mirrors the VB DataTable.Select rail).
const ROW_FILTERS = [
  ['ShiftCode', 'ShiftCode'],
  ['EmpGroupCode', 'EmpGroupCode'],
  ['EmpCategoryCode', 'EmpCategoryCode'],
  ['DepartmentCode', 'DepartmentCode'],
  ['DesignationCode', 'DesignationCode'],
  ['EmployeeCode', 'EmployeeCode'],
  ['PayTypeCode', 'PayTypeCode'],
  ['SexCode', 'SexCode'],
  ['AgentCode', 'AgentCode'],
  ['ManualEntryReasonCode', 'ReasonCode']
];

function applyAttendanceFilters(rows, query) {
  if (!Array.isArray(rows) || rows.length === 0) return rows || [];
  const active = [];
  for (const [param, col] of ROW_FILTERS) {
    const set = codeSet(query[param]);
    if (set) active.push({ col, set });
  }
  if (!active.length) return rows;
  return rows.filter((r) => active.every(({ col, set }) => set.has(String(r[col]))));
}

// ---------------------------------------------------------------------------
// Small value helpers
// ---------------------------------------------------------------------------
const dayKey = (r) => (r.CalendarDate ? new Date(r.CalendarDate).toISOString().slice(0, 10) : '');
const ddmm = (d) => { const s = ddmmyyyy(d); return s ? s.slice(0, 5) : ''; };
const otCell = (r) => { const v = dec(r, 'OT_Hours'); return v ? str(r, 'OT_Hours') : ''; };

// ---------------------------------------------------------------------------
// Report-type layouts. Each build() returns an array of pdfmake table nodes.
// Columns are the shared web-report style (matches attendanceDateWise.js) —
// the same data as the .rdlc layouts, not a pixel-for-pixel replica.
// ---------------------------------------------------------------------------

// Date Wise — flat list ordered by date then ID (rptAttendanceDetails2.rdlc:
// the CalendarDate group header is hidden, so it reads as one continuous table).
function buildDateWise(rows) {
  const sorted = [...rows].sort((a, b) => {
    const d = dayKey(a).localeCompare(dayKey(b));
    if (d) return d;
    return String(a.EmployeeID ?? '').localeCompare(String(b.EmployeeID ?? ''), undefined, { numeric: true });
  });
  const cols = [
    { header: 'Date', width: 60, align: 'center', value: (r) => ddmmyyyy(r.CalendarDate) },
    { header: 'Shift', width: 70, value: (r) => str(r, 'ShiftName') },
    { header: 'ID', width: 34, align: 'center', value: (r) => str(r, 'EmployeeID') },
    { header: 'Employee Name', width: '*', value: (r) => str(r, 'EmployeeName') },
    { header: 'In / Out Time', width: 150, value: (r) => str(r, 'TimeLog') },
    { header: 'Late In', width: 44, align: 'center', value: (r) => str(r, 'Late_In') },
    { header: 'Early Out', width: 48, align: 'center', value: (r) => str(r, 'Early_Out') },
    { header: 'W. Hours', width: 48, align: 'center', value: (r) => str(r, 'TotalWorking_Hours') },
    { header: 'OT Hours', width: 44, align: 'center', value: otCell },
    { header: 'Brks Mins', width: 44, align: 'center', value: (r) => { const v = dec(r, 'Break_Duration'); return v ? String(v) : ''; } },
    { header: 'Sts', width: 30, align: 'center', value: (r) => str(r, 'Status') }
  ];
  return [flatTable(cols, sorted)];
}

// Punching Details — grouped per employee (S.No resets per employee), the group
// header carries Designation + Department (rptAttendancePunchingDetails.rdlc).
function buildPunchingDetails(rows) {
  const cols = [
    { header: 'Date', width: 70, align: 'center', value: (r) => ddmmyyyy(r.CalendarDate) },
    { header: 'Punching Time', width: '*', value: (r) => str(r, 'TimeLog') },
    { header: 'Shift', width: 90, value: (r) => str(r, 'ShiftName') },
    { header: 'Att. Status', width: 70, align: 'center', value: (r) => str(r, 'Status') },
    { header: 'Shift Hrs', width: 55, align: 'center', value: (r) => str(r, 'Working_Hours') }
  ];
  return [groupedTable(cols, rows, {
    groupBy: (r) => str(r, 'EmployeeCode'),
    groupLabel: (r) =>
      `${str(r, 'EmployeeID')} - ${str(r, 'EmployeeName')}`
      + `   |   Designation : ${str(r, 'DesignationName')}`
      + `   |   Department : ${str(r, 'DepartmentName')}`,
    groupFooter: true,
    serialPerGroup: true,
    sortRows: (a, b) => dayKey(a).localeCompare(dayKey(b))
  })];
}

// MisPunch / MisMatch — mismatched punches grouped by date.
function buildMisPunch(rows) {
  const cols = [
    { header: 'Date', width: 70, align: 'center', value: (r) => ddmmyyyy(r.CalendarDate) },
    { header: 'Shift', width: 90, value: (r) => str(r, 'ShiftName') },
    { header: 'ID', width: 45, align: 'center', value: (r) => str(r, 'EmployeeID') },
    { header: 'Employee Name', width: 160, value: (r) => str(r, 'EmployeeName') },
    { header: 'Department', width: 110, value: (r) => str(r, 'DepartmentName') },
    { header: 'In / Out Time', width: '*', value: (r) => str(r, 'TimeLog') }
  ];
  return [groupedTable(cols, rows, {
    groupBy: dayKey,
    groupLabel: (r) => `Date : ${ddmmyyyy(r.CalendarDate)}`
  })];
}

// Employee Wise — grouped per employee, day-by-day detail.
function buildEmployeeWise(rows) {
  const cols = [
    { header: 'Date', width: 70, align: 'center', value: (r) => ddmmyyyy(r.CalendarDate) },
    { header: 'Shift', width: 80, value: (r) => str(r, 'ShiftName') },
    { header: 'In Time', width: 55, align: 'center', value: (r) => hhmm(r.InTime) },
    { header: 'Out Time', width: 55, align: 'center', value: (r) => hhmm(r.OutTime) },
    { header: 'Machine Logs', width: '*', value: (r) => str(r, 'TimeLog') },
    { header: 'Late In', width: 45, align: 'center', value: (r) => str(r, 'Late_In') },
    { header: 'Early Out', width: 50, align: 'center', value: (r) => str(r, 'Early_Out') },
    { header: 'Wrk.Hrs', width: 50, align: 'center', value: (r) => str(r, 'TotalWorking_Hours') },
    { header: 'OT Hrs', width: 45, align: 'center', value: otCell },
    { header: 'Sts', width: 34, align: 'center', value: (r) => str(r, 'Status') }
  ];
  return [groupedTable(cols, rows, {
    groupBy: (r) => str(r, 'EmployeeCode'),
    groupLabel: (r) => `${str(r, 'EmployeeID')} - ${str(r, 'EmployeeName')}`,
    groupFooter: true,
    sortRows: (a, b) => dayKey(a).localeCompare(dayKey(b))
  })];
}

// Batch Wise — grouped by employee batch.
function buildBatchWise(rows) {
  const cols = [
    { header: 'ID', width: 45, align: 'center', value: (r) => str(r, 'EmployeeID') },
    { header: 'Employee Name', width: '*', value: (r) => str(r, 'EmployeeName') },
    { header: 'Designation', width: 110, value: (r) => str(r, 'DesignationName') },
    { header: 'In Time', width: 55, align: 'center', value: (r) => hhmm(r.InTime) },
    { header: 'Late In', width: 45, align: 'center', value: (r) => str(r, 'Late_In') },
    { header: 'Out Time', width: 55, align: 'center', value: (r) => hhmm(r.OutTime) },
    { header: 'Early Out', width: 50, align: 'center', value: (r) => str(r, 'Early_Out') },
    { header: 'Shift Hrs', width: 50, align: 'center', value: (r) => str(r, 'Working_Hours') },
    { header: 'Sts', width: 34, align: 'center', value: (r) => str(r, 'Status') }
  ];
  return [groupedTable(cols, rows, {
    groupBy: (r) => str(r, 'EmployeeBatchCode'),
    groupLabel: (r) => `Batch : ${str(r, 'EmployeeBatchName') || '(No Batch)'}`
  })];
}

// Batch with Department Wise — grouped by batch, then department.
function buildBatchWithDept(rows) {
  const cols = [
    { header: 'ID', width: 45, align: 'center', value: (r) => str(r, 'EmployeeID') },
    { header: 'Employee Name', width: '*', value: (r) => str(r, 'EmployeeName') },
    { header: 'Department', width: 120, value: (r) => str(r, 'DepartmentName') },
    { header: 'In Time', width: 55, align: 'center', value: (r) => hhmm(r.InTime) },
    { header: 'Late In', width: 45, align: 'center', value: (r) => str(r, 'Late_In') },
    { header: 'Out Time', width: 55, align: 'center', value: (r) => hhmm(r.OutTime) },
    { header: 'Early Out', width: 50, align: 'center', value: (r) => str(r, 'Early_Out') },
    { header: 'Wrk.Hrs', width: 50, align: 'center', value: (r) => str(r, 'Working_Hours') },
    { header: 'Sts', width: 34, align: 'center', value: (r) => str(r, 'Status') }
  ];
  return [groupedTable(cols, rows, {
    groupBy: (r) => `${str(r, 'EmployeeBatchCode')}|${str(r, 'DepartmentCode')}`,
    groupLabel: (r) => `${str(r, 'EmployeeBatchName') || '(No Batch)'}  —  ${str(r, 'DepartmentName')}`
  })];
}

// Manual Entry — offline/manual attendance rows grouped by date, with reason.
function buildManualEntry(rows) {
  const cols = [
    { header: 'Shift', width: 80, value: (r) => str(r, 'ShiftName') },
    { header: 'ID', width: 45, align: 'center', value: (r) => str(r, 'EmployeeID') },
    { header: 'Employee Name', width: '*', value: (r) => str(r, 'EmployeeName') },
    { header: 'In', width: 50, align: 'center', value: (r) => hhmm(r.InTime) },
    { header: 'Out', width: 50, align: 'center', value: (r) => hhmm(r.OutTime) },
    { header: 'Late In', width: 45, align: 'center', value: (r) => str(r, 'Late_In') },
    { header: 'Early Out', width: 50, align: 'center', value: (r) => str(r, 'Early_Out') },
    { header: 'W.Hrs', width: 45, align: 'center', value: (r) => str(r, 'Working_Hours') },
    { header: 'Sts', width: 32, align: 'center', value: (r) => str(r, 'Status') },
    { header: 'Reason', width: 120, value: (r) => str(r, 'ManualEntryReason') }
  ];
  return [groupedTable(cols, rows, {
    groupBy: dayKey,
    groupLabel: (r) => `Date : ${ddmmyyyy(r.CalendarDate)}`
  })];
}

// OT Details — grouped by department, OT hours per day.
function buildOtDetails(rows) {
  const cols = [
    { header: 'Date', width: 70, align: 'center', value: (r) => ddmmyyyy(r.CalendarDate) },
    { header: 'Shift', width: 80, value: (r) => str(r, 'ShiftName') },
    { header: 'ID', width: 45, align: 'center', value: (r) => str(r, 'EmployeeID') },
    { header: 'Employee Name', width: '*', value: (r) => str(r, 'EmployeeName') },
    { header: 'In / Out Time', width: 150, value: (r) => str(r, 'TimeLog') },
    { header: 'Tot.Hrs', width: 50, align: 'center', value: (r) => str(r, 'TotalWorking_Hours') },
    { header: 'OT Hrs', width: 50, align: 'center', value: otCell },
    { header: 'Sts', width: 34, align: 'center', value: (r) => str(r, 'Status') }
  ];
  return [groupedTable(cols, rows, {
    groupBy: (r) => str(r, 'DepartmentCode'),
    groupLabel: (r) => `Department : ${str(r, 'DepartmentName')}`
  })];
}

// Atten With OT — flat date-wise list including OT columns.
function buildWithOT(rows) {
  const cols = [
    { header: 'Date', width: 70, align: 'center', value: (r) => ddmmyyyy(r.CalendarDate) },
    { header: 'Shift', width: 80, value: (r) => str(r, 'ShiftName') },
    { header: 'ID', width: 45, align: 'center', value: (r) => str(r, 'EmployeeID') },
    { header: 'Employee Name', width: '*', value: (r) => str(r, 'EmployeeName') },
    { header: 'In Time', width: 55, align: 'center', value: (r) => hhmm(r.InTime) },
    { header: 'Late In', width: 45, align: 'center', value: (r) => str(r, 'Late_In') },
    { header: 'Out Time', width: 55, align: 'center', value: (r) => hhmm(r.OutTime) },
    { header: 'Early Out', width: 50, align: 'center', value: (r) => str(r, 'Early_Out') },
    { header: 'W.Hrs', width: 45, align: 'center', value: (r) => str(r, 'Working_Hours') },
    { header: 'OT Hrs', width: 45, align: 'center', value: otCell },
    { header: 'Sts', width: 32, align: 'center', value: (r) => str(r, 'Status') }
  ];
  return [flatTable(cols, rows)];
}

// Shift Abstract — Department (rows) × Shift (cols) head-count matrix.
function buildShiftAbstract(rows) {
  return [buildMatrix(rows, {
    rowKeyFn: (r) => str(r, 'DepartmentCode'),
    rowLabelFn: (r) => str(r, 'DepartmentName'),
    colKeyFn: (r) => str(r, 'ShiftCode'),
    colLabelFn: (r) => str(r, 'ShiftName') || '(No Shift)',
    cornerText: 'Department'
  })];
}

// Employee Group Wise — grouped by employee group, day-by-day detail.
function buildEmployeeGroup(rows) {
  const cols = [
    { header: 'Date', width: 70, align: 'center', value: (r) => ddmmyyyy(r.CalendarDate) },
    { header: 'Shift', width: 80, value: (r) => str(r, 'ShiftName') },
    { header: 'ID', width: 45, align: 'center', value: (r) => str(r, 'EmployeeID') },
    { header: 'Employee Name', width: '*', value: (r) => str(r, 'EmployeeName') },
    { header: 'In Time', width: 55, align: 'center', value: (r) => hhmm(r.InTime) },
    { header: 'Late In', width: 45, align: 'center', value: (r) => str(r, 'Late_In') },
    { header: 'Out Time', width: 55, align: 'center', value: (r) => hhmm(r.OutTime) },
    { header: 'Wrk.Hrs', width: 50, align: 'center', value: (r) => str(r, 'Working_Hours') },
    { header: 'OT Hrs', width: 45, align: 'center', value: otCell },
    { header: 'Sts', width: 34, align: 'center', value: (r) => str(r, 'Status') }
  ];
  return [groupedTable(cols, rows, {
    groupBy: (r) => str(r, 'EmpGroupCode'),
    groupLabel: (r) => `Employee Group : ${str(r, 'EmpGroupName') || '(No Group)'}`,
    groupFooter: true
  })];
}

// Abstract — Employee (rows) × Date (cols) status pivot (Status letter per cell).
function buildAbstract(rows) {
  const dateKeys = [...new Set(rows.map(dayKey))].filter(Boolean).sort();
  const empMap = new Map();
  for (const r of rows) {
    const ek = str(r, 'EmployeeCode');
    if (!empMap.has(ek)) {
      empMap.set(ek, { id: str(r, 'EmployeeID'), name: str(r, 'EmployeeName'), cells: {} });
    }
    const dk = dayKey(r);
    if (dk) empMap.get(ek).cells[dk] = str(r, 'Status');
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
  dateWise: { title: 'Attendance Details - Date Wise', build: buildDateWise },
  punchingDetails: { title: 'Punching In and Out Time', build: buildPunchingDetails },
  misPunch: { title: 'Attendance Details - Mis Match Punch', build: buildMisPunch },
  employeeWise: { title: 'Attendance Details - Employee Wise', build: buildEmployeeWise },
  batchWithDept: { title: 'Attendance Details - Batch With Department Wise', build: buildBatchWithDept },
  batchWise: { title: 'Attendance Details - Batch Wise', build: buildBatchWise },
  manualEntry: { title: 'Attendance Details - Manual Entry', build: buildManualEntry },
  withOT: { title: 'Attendance Details With OT', build: buildWithOT },
  otDetails: { title: 'OT Details - Date Wise', build: buildOtDetails },
  abstract: { title: 'Attendance Details - Abstract', build: buildAbstract },
  shiftAbstract: { title: 'Attendance Details - Shift Wise Abstract', build: buildShiftAbstract },
  employeeGroup: { title: 'Attendance Details - Employee Group Wise', build: buildEmployeeGroup }
};

function pickReport(query) {
  const raw = String(query.groupBy || query.reportType || 'dateWise').trim();
  return REPORTS[raw] ? raw : 'dateWise';
}

// ---------------------------------------------------------------------------
// Orchestrator — runs sp_Employee_Attendance with the resolved @Attn/@EntryMode,
// applies the in-memory filter rail, and dispatches to the chosen layout.
// ---------------------------------------------------------------------------
export const attendanceDetailsReport = async (req, res) => {
  const t0 = Date.now();
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type('text/plain').send('Missing subDBName header');

    const debug = req.query.debug === '1';
    const reportType = pickReport(req.query);
    const cfg = REPORTS[reportType];
    const status = String(req.query.status || 'present');
    const companyCode = req.query.CompanyCode || req.query.companyCode || req.headers.companycode || '0';
    const today = new Date().toISOString().slice(0, 10);
    const fromDate = req.query.FromDate || req.query.fromDate || today;
    const toDate = req.query.ToDate || req.query.toDate || today;

    // Emp_Status: 1 = live employees (default), 0 = all.
    const empStatus = req.query.empStatus === undefined
      ? 1
      : (req.query.empStatus === '1' || req.query.empStatus === 'true' ? 1 : 0);

    // Explicit ?attn= overrides the derived value (debug/advanced use).
    const attn = req.query.attn != null && req.query.attn !== ''
      ? parseInt(req.query.attn)
      : resolveAttn(reportType, status);

    const pool = await getPool(subDbName);
    const spReq = pool.request();
    applyBranchCode(spReq, req.headers);                 // BranchCode or CompanyCode
    spReq.input('FromDate', sql.DateTime, new Date(fromDate));
    spReq.input('ToDate', sql.DateTime, new Date(toDate));
    if (attn != null && !isNaN(attn)) spReq.input('Attn', sql.Int, attn);
    if (reportType === 'manualEntry') spReq.input('EntryMode', sql.Int, 1);
    spReq.input('Emp_Status', sql.Bit, empStatus);

    const spResult = await spReq.execute('sp_Employee_Attendance');
    const rows = applyAttendanceFilters(spResult.recordset || [], req.query);
    const company = await getCompanyInfo(pool, companyCode);

    const docDef = buildEmployeePage({
      companyName: company.name,
      companyLogo: company.logo,
      title: cfg.title,
      orientation: 'landscape',
      fromDate,
      toDate,
      tables: cfg.build(rows, { fromDate, toDate })
    });
    const pdfBuffer = await renderPdf(docDef);

    if (debug) {
      const dbCfg = pool.config || {};
      const sample = rows.slice(0, 3).map((r, i) => `  [${i}] ` + JSON.stringify(r).slice(0, 260)).join('\n');
      return res.type('text/plain').send(
        [
          `SP:           sp_Employee_Attendance`,
          `reportType:   ${reportType}`,
          `status:       ${status}`,
          `Attn:         ${attn == null || isNaN(attn) ? '(omitted)' : attn}`,
          `EntryMode:    ${reportType === 'manualEntry' ? 1 : '(none)'}`,
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
    res.setHeader('Content-Disposition', `inline; filename="AttendanceDetails_${reportType}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
};
