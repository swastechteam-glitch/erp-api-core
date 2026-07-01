// =============================================================================
// Payroll ▸ Reports ▸ Attendance Details GOTS  (form: frmAttendanceDetails_GOTS)
// =============================================================================
// Port of the WinForms rptAttendanceDetails_GOTS screen. The report-type radios
// pick the SP + .rdlc; the All / Present / Below Shift / Leave / Only Leave
// radios drive @Attn (unless the report name forces it):
//
//   Date Wise → rptAttendanceDetails2_Complaince.rdlc
//               SP sp_Employee_Attendance_GOTS ; @Attn from the status radios.
//               A Shift × Status head-count matrix + a date-wise detail table.
//   MisPunch  → rptAttendanceDetails_MisMatch_Complaince.rdlc
//               SP sp_Employee_Attendance ; @Attn = 9 (MisMatch forces it).
//               A date-wise mis-punch detail table.
//
//   GET /payroll/reports/attendance/details-gots
//     ?groupBy=dateWise|misPunch     (default dateWise)
//     &status=all|present|belowShift|leave|onlyLeave   (dateWise only)
//     &empStatus=1|0  &CompanyCode  &FromDate  &ToDate
//     &ShiftCode &EmpCategoryCode &EmpGroupCode &DepartmentCode &DesignationCode
//     &EmployeeCode &PayTypeCode &SexCode &AgentCode &ManualEntryReasonCode
//
// @Attn parity with rptAttendanceDetails_GOTS.vb:
//   MisMatch → 9 ; All → 8 ; Below Shift → 3 ; Present → 5 ; Leave → 11 ;
//   Only Leave → (omit).
//
// SP: sp_Employee_Attendance_GOTS / sp_Employee_Attendance
//     (FromDate, ToDate, Attn?, Emp_Status, CompanyCode)

import sql from 'mssql';
import { getPool } from '../../../config/dynamicDB.js';
import { applyBranchCode } from '../../../utils/common.js';
import { renderPdf, getCompanyInfo } from '../cotton/_common.js';
import {
  buildEmployeePage, flatTable, buildMatrix,
  tableLayout, colors, str, ddmmyyyy, hhmm
} from './_common.js';

// ---------------------------------------------------------------------------
// @Attn resolution (rptAttendanceDetails_GOTS.vb parity)
// ---------------------------------------------------------------------------
function resolveAttn(reportType, status) {
  if (reportType === 'misPunch') return 9;   // MisMatch forces 9
  if (status === 'all') return 8;
  if (status === 'belowShift') return 3;
  if (status === 'present') return 5;
  if (status === 'leave') return 11;
  return null;                               // onlyLeave → no @Attn
}

// ---------------------------------------------------------------------------
// In-memory filter rail (mirrors the VB DataTable.Select chain). Applied only
// when the recordset exposes the column (so a filter no-ops instead of wiping
// rows when the chosen SP doesn't return that column).
// ---------------------------------------------------------------------------
const codeSet = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const s = new Set(String(v).split(',').map((x) => x.trim()).filter(Boolean));
  return s.size ? s : null;
};

const ROW_FILTERS = [
  ['PayTypeCode', 'PayTypeCode'],
  ['EmpGroupCode', 'EmpGroupCode'],
  ['ShiftCode', 'ShiftCode'],
  ['EmpCategoryCode', 'EmpCategoryCode'],
  ['EmployeeCode', 'EmployeeCode'],
  ['AgentCode', 'AgentCode'],
  ['SexCode', 'SexCode'],
  ['DepartmentCode', 'DepartmentCode'],
  ['DesignationCode', 'DesignationCode'],
  ['ManualEntryReasonCode', 'ReasonCode']
];

function applyGotsFilters(rows, query) {
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
// Value helpers
// ---------------------------------------------------------------------------
const dayKey = (r) => (r.CalendarDate ? new Date(r.CalendarDate).toISOString().slice(0, 10) : '');
const byDateThenId = (a, b) => {
  const d = dayKey(a).localeCompare(dayKey(b));
  if (d) return d;
  return String(a.EmployeeID ?? '').localeCompare(String(b.EmployeeID ?? ''), undefined, { numeric: true });
};
// "IN - hh:mm tt   OUT - hh:mm tt" (rptAttendanceDetails2_Complaince.rdlc).
const inOut = (r) => `IN - ${hhmm(r.InTime)}   OUT - ${hhmm(r.OutTime)}`;

// Append a right-aligned "Total No.of Employee in : N" footer row to a flatTable
// node (matches the .rdlc table footer). `span` = data columns + the S.No column.
function withEmployeeFooter(node, cols, count) {
  const span = cols.length + 1;
  node.table.body.push([
    { text: `Total No.of Employee in : ${count}`, colSpan: span, alignment: 'right', bold: true, fontSize: 8, color: colors.subText, fillColor: colors.subFill },
    ...Array(span - 1).fill({})
  ]);
  return node;
}

// ---------------------------------------------------------------------------
// Date Wise — Shift × Status head-count matrix + a date-wise detail table.
// ---------------------------------------------------------------------------
function buildDateWise(rows) {
  const matrix = buildMatrix(rows, {
    rowKeyFn: (r) => str(r, 'ShiftCode') || str(r, 'ShiftName'),
    rowLabelFn: (r) => str(r, 'ShiftName') || '(No Shift)',
    colKeyFn: (r) => str(r, 'Status') || '(None)',
    colLabelFn: (r) => str(r, 'Status') || '(None)',
    cornerText: 'Shift Name'
  });

  const cols = [
    { header: 'Date', width: 64, align: 'center', value: (r) => ddmmyyyy(r.CalendarDate) },
    { header: 'Shift', width: 80, value: (r) => str(r, 'ShiftName') },
    { header: 'ID', width: 40, align: 'center', value: (r) => str(r, 'EmployeeID') },
    { header: 'Employee Name', width: '*', value: (r) => str(r, 'EmployeeName') },
    { header: 'In / Out Time', width: 150, value: inOut },
    { header: 'W. Hours', width: 55, align: 'center', value: (r) => str(r, 'TotalWorking_Hours') },
    { header: 'OT Hours', width: 50, align: 'center', value: (r) => str(r, 'OT_Hours') || '00:00' },
    { header: 'Sts', width: 34, align: 'center', value: (r) => str(r, 'Status') }
  ];
  const sorted = [...rows].sort(byDateThenId);
  const detail = withEmployeeFooter(flatTable(cols, sorted), cols, rows.length);

  return [matrix, { text: '', margin: [0, 0, 0, 8] }, detail];
}

// ---------------------------------------------------------------------------
// MisPunch — date-wise mis-match punch detail (In/Out from the TimeLog string).
// ---------------------------------------------------------------------------
function buildMisPunch(rows) {
  const cols = [
    { header: 'Date', width: 64, align: 'center', value: (r) => ddmmyyyy(r.CalendarDate) },
    { header: 'Shift', width: 80, value: (r) => str(r, 'ShiftName') },
    { header: 'ID', width: 40, align: 'center', value: (r) => str(r, 'EmployeeID') },
    { header: 'Employee Name', width: 160, value: (r) => str(r, 'EmployeeName') },
    { header: 'Department', width: 120, value: (r) => str(r, 'DepartmentName') },
    { header: 'In / Out Time', width: '*', value: (r) => str(r, 'TimeLog') }
  ];
  const sorted = [...rows].sort(byDateThenId);
  return [withEmployeeFooter(flatTable(cols, sorted), cols, rows.length)];
}

const REPORTS = {
  dateWise: { title: 'Attendance Details - Date Wise', spName: 'sp_Employee_Attendance_GOTS', build: buildDateWise },
  misPunch: { title: 'Attendance Details - Mis Match Punch', spName: 'sp_Employee_Attendance', build: buildMisPunch }
};

function pickReport(query) {
  const raw = String(query.groupBy || query.reportType || 'dateWise').trim();
  return REPORTS[raw] ? raw : 'dateWise';
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------
export const attendanceDetailsGOTSReport = async (req, res) => {
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
    spReq.input('Emp_Status', sql.Bit, empStatus);

    const spResult = await spReq.execute(cfg.spName);
    const rows = applyGotsFilters(spResult.recordset || [], req.query);
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
          `SP:           ${cfg.spName}`,
          `reportType:   ${reportType}`,
          `status:       ${status}`,
          `Attn:         ${attn == null || isNaN(attn) ? '(omitted)' : attn}`,
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
    res.setHeader('Content-Disposition', `inline; filename="AttendanceDetailsGOTS_${reportType}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
};
