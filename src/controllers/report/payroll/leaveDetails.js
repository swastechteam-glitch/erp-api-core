// =============================================================================
// Payroll ▸ Reports ▸ Leave Details Report  (form: rptLeaveDetails)
// =============================================================================
// Port of the WinForms rptLeaveDetails screen. That form ran ONE stored
// procedure (sp_Employee_Attendance) and rendered rptEmployeeLeaveReport.rdlc.
// For this report DynamicReportName = "rptEmployeeLeaveReport", which the VB
// forces to optLeave = True → @Attn = 7 (leave rows only).
//
// The .rdlc lays out two tables:
//   1. Summary  — one row per employee: ID / Name / Department / Agent / PF No /
//                 ESI No / No. of Days (leave count) / D.O.J / D.O. Rejoin.
//   2. Detail   — grouped per employee, one row per leave date, with the footer
//                 sentence "<Name> has taken a total of N day(s) of leave."
//
//   GET /payroll/reports/leave-details
//     ?empStatus=1|0             // live employees (1, default) vs all
//     &CompanyCode &FromDate &ToDate
//     &ShiftCode &EmpCategoryCode &EmpGroupCode &DepartmentCode &DesignationCode
//     &EmployeeCode &PayTypeCode &AgentCode &SexCode   // comma-separated lists
//     &leaveAbove=<n>            // keep only employees with leave count > n
//
// SP: sp_Employee_Attendance (FromDate, ToDate, Attn=7, Emp_Status, CompanyCode)

import sql from 'mssql';
import { getPool } from '../../../config/dynamicDB.js';
import { applyBranchCode } from '../../../utils/common.js';
import { renderPdf, getCompanyInfo } from '../cotton/_common.js';
import { buildEmployeePage, headStyle, tableLayout, colors, str, ddmmyyyy } from './_common.js';

const LEAVE_ATTN = 7;   // rptLeaveDetails.vb: optLeave.Checked → @Attn = 7

// ---------------------------------------------------------------------------
// In-memory filter rail (mirrors the VB DataTable.Select chain on the screen).
// Each param is a comma-separated code list; a filter no-ops when the param is
// empty or the column is absent from the recordset.
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
  ['DesignationCode', 'DesignationCode']
];

function applyLeaveFilters(rows, query) {
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

// "Leave above N" — group by employee, keep only those whose leave-day count
// exceeds N (rptLeaveDetails.vb: groupedResult Where Count > leaveAbove).
function applyLeaveAbove(rows, query) {
  const raw = query.leaveAbove;
  if (raw === undefined || raw === null || raw === '') return rows;
  const n = parseInt(raw, 10);
  if (isNaN(n)) return rows;
  const counts = new Map();
  for (const r of rows) {
    const k = String(r.EmployeeCode);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return rows.filter((r) => (counts.get(String(r.EmployeeCode)) || 0) > n);
}

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------
const dayKey = (r) => (r.CalendarDate ? new Date(r.CalendarDate).toISOString().slice(0, 10) : '');
const dt = (d) => (d ? ddmmyyyy(d) : '');

// Order employees by EmployeeID (numeric-aware), matching the .rdlc sort.
const byEmployeeId = (a, b) =>
  String(a.EmployeeID ?? '').localeCompare(String(b.EmployeeID ?? ''), undefined, { numeric: true });

// Group rows by EmployeeCode → [{ sample, rows }] ordered by EmployeeID.
function groupByEmployee(rows) {
  const map = new Map();
  for (const r of rows) {
    const k = String(r.EmployeeCode);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return [...map.values()]
    .map((grp) => ({ sample: grp[0], rows: grp.sort((a, b) => dayKey(a).localeCompare(dayKey(b))) }))
    .sort((a, b) => byEmployeeId(a.sample, b.sample));
}

// Summary — one row per employee, No. of Days = leave count (rdlc table1).
function buildSummary(groups) {
  const heads = ['S.No', 'Employee ID', 'Employee Name', 'Department', 'Agent', 'PF No', 'ESI No', 'No. of Days', 'Date of Joined', 'Date of Rejoined'];
  const header = heads.map((t) => ({ text: t, ...headStyle }));
  const body = [header];
  groups.forEach((g, i) => {
    const r = g.sample;
    const zebra = i % 2 === 1 ? colors.zebraFill : null;
    body.push([
      { text: String(i + 1), alignment: 'center', fontSize: 7.5, fillColor: zebra },
      { text: str(r, 'EmployeeID'), alignment: 'center', fontSize: 7.5, fillColor: zebra },
      { text: str(r, 'EmployeeName'), alignment: 'left', fontSize: 7.5, fillColor: zebra },
      { text: str(r, 'DepartmentName'), alignment: 'left', fontSize: 7.5, fillColor: zebra },
      { text: str(r, 'AgentName'), alignment: 'left', fontSize: 7.5, fillColor: zebra },
      { text: str(r, 'PFNo'), alignment: 'left', fontSize: 7.5, fillColor: zebra },
      { text: str(r, 'ESINo'), alignment: 'left', fontSize: 7.5, fillColor: zebra },
      { text: String(g.rows.length), alignment: 'center', bold: true, fontSize: 7.5, fillColor: zebra },
      { text: dt(r.DateOfJoining), alignment: 'center', fontSize: 7.5, fillColor: zebra },
      { text: dt(r.LastRejoinDate), alignment: 'center', fontSize: 7.5, fillColor: zebra }
    ]);
  });
  const widths = [24, 55, '*', 90, 80, 58, 58, 44, 60, 62];
  return { table: { headerRows: 1, widths, body }, layout: tableLayout() };
}

// Detail — grouped per employee: a name header, one row per leave date, and the
// footer sentence "<Name> has taken a total of N day(s) of leave." (rdlc table2).
function buildDetail(groups) {
  const heads = ['S.No', 'Leave Date', 'Date of Joined', 'Date of Rejoined', 'ID', 'Employee Name', 'Department', 'Designation'];
  const span = heads.length;
  const header = heads.map((t) => ({ text: t, ...headStyle }));
  const widths = [24, 60, 66, 70, 40, '*', 100, 100];
  const body = [header];
  const blanks = (n) => Array(n).fill({});

  for (const g of groups) {
    const name = str(g.sample, 'EmployeeName');
    body.push([
      { text: name, colSpan: span, fillColor: colors.groupFill, color: colors.groupText, bold: true, fontSize: 8, alignment: 'left' },
      ...blanks(span - 1)
    ]);
    g.rows.forEach((r, idx) => {
      const zebra = (idx + 1) % 2 === 0 ? colors.zebraFill : null;
      body.push([
        { text: String(idx + 1), alignment: 'center', fontSize: 7.5, fillColor: zebra },
        { text: dt(r.CalendarDate), alignment: 'center', fontSize: 7.5, fillColor: zebra },
        { text: dt(r.DateOfJoining), alignment: 'center', fontSize: 7.5, fillColor: zebra },
        { text: dt(r.LastRejoinDate), alignment: 'center', fontSize: 7.5, fillColor: zebra },
        { text: str(r, 'EmployeeID'), alignment: 'center', fontSize: 7.5, fillColor: zebra },
        { text: str(r, 'EmployeeName'), alignment: 'left', fontSize: 7.5, fillColor: zebra },
        { text: str(r, 'DepartmentName'), alignment: 'left', fontSize: 7.5, fillColor: zebra },
        { text: str(r, 'DesignationName'), alignment: 'left', fontSize: 7.5, fillColor: zebra }
      ]);
    });
    body.push([
      { text: `${name} has taken a total of ${g.rows.length} day(s) of leave.`, colSpan: span, alignment: 'right', bold: true, fontSize: 8, color: colors.subText, fillColor: colors.subFill },
      ...blanks(span - 1)
    ]);
  }
  return { table: { headerRows: 1, widths, body }, layout: tableLayout() };
}

const caption = (text, opts = {}) => ({
  text, bold: true, fontSize: 10, color: colors.titleColor, margin: [0, 0, 0, 6], ...opts
});

// ---------------------------------------------------------------------------
// Orchestrator — runs sp_Employee_Attendance with @Attn = 7, applies the
// in-memory filter rail + "Leave above", and renders the summary + detail.
// ---------------------------------------------------------------------------
export const leaveDetailsReport = async (req, res) => {
  const t0 = Date.now();
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type('text/plain').send('Missing subDBName header');

    const debug = req.query.debug === '1';
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
    spReq.input('Attn', sql.Int, LEAVE_ATTN);
    spReq.input('Emp_Status', sql.Bit, empStatus);

    const spResult = await spReq.execute('sp_Employee_Attendance');
    let rows = applyLeaveFilters(spResult.recordset || [], req.query);
    rows = applyLeaveAbove(rows, req.query);
    const groups = groupByEmployee(rows);
    const company = await getCompanyInfo(pool, companyCode);

    const docDef = buildEmployeePage({
      companyName: company.name,
      companyLogo: company.logo,
      title: 'Employee Leave Details',
      orientation: 'landscape',
      fromDate,
      toDate,
      tables: [
        caption('Leave Summary'),
        buildSummary(groups),
        caption('Leave Details', { pageBreak: 'before' }),
        buildDetail(groups)
      ]
    });
    const pdfBuffer = await renderPdf(docDef);

    if (debug) {
      const dbCfg = pool.config || {};
      const sample = rows.slice(0, 3).map((r, i) => `  [${i}] ` + JSON.stringify(r).slice(0, 260)).join('\n');
      return res.type('text/plain').send(
        [
          `SP:           sp_Employee_Attendance`,
          `Attn:         ${LEAVE_ATTN}`,
          `Emp_Status:   ${empStatus}`,
          `leaveAbove:   ${req.query.leaveAbove ?? '(none)'}`,
          `subDBName:    ${subDbName}`,
          `server:       ${dbCfg.server}${dbCfg.port ? ':' + dbCfg.port : ''}`,
          `database:     ${dbCfg.database}`,
          `company:      ${company.name || '(none)'}`,
          `FromDate:     ${fromDate}`,
          `ToDate:       ${toDate}`,
          `rows:         ${rows.length}  (employees: ${groups.length})`,
          `Total:        ${Date.now() - t0} ms (${pdfBuffer.length} pdf bytes)`,
          sample ? `\nfirst rows:\n${sample}` : ''
        ].join('\n')
      );
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="LeaveDetails.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
};
