// =============================================================================
// Payroll ▸ Reports ▸ Movement Details  (form: rptMovementDetails)
// =============================================================================
// Port of the WinForms rptMovementDetails screen. That form ran ONE of two
// stored procedures depending on the report-type radio, then narrowed the rows
// in memory with the Emp Group / Category / Department / Designation / Employee
// combos:
//
//   Movement       → sp_MovementDetails_GetAll        (grouped by employee)
//   Employee Wise  → sp_MovementDetails_GetByEmployee (per-employee detail)
//
//   GET /payroll/reports/movement-details
//     ?groupBy=movement|employeeWise    // which layout / SP (default movement)
//     &OrderBy=0|1                       // 0 = Employee ID, 1 = Employee Name
//     &empStatus=1|0                     // live employees (1, default) vs all
//     &CompanyCode &FromDate &ToDate
//     &EmpGroupCode &EmpCategoryCode &DepartmentCode &DesignationCode
//     &EmployeeCode                      // comma-separated code lists (in-memory)
//
// SP inputs mirror rptMovementDetails.vb: @FromDate, @ToDate, @Emp_Status,
// @OrderBy, and @CompanyCode (when > 0). The Photo option is not rendered.

import sql from 'mssql';
import { getPool } from '../../../config/dynamicDB.js';
import { renderPdf, getCompanyInfo } from '../cotton/_common.js';
import { buildEmployeePage, groupedTable, str, hhmm, ddmmyyyy } from './_common.js';

// ---------------------------------------------------------------------------
// In-memory filter rail (mirrors the VB DataTable.Select chain). Each filter is
// applied ONLY when the recordset actually has that column — so selecting an
// Emp Group on the Employee-Wise report (whose SP omits EmpGroupCode) is a no-op
// rather than filtering everything out.
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
  ['EmployeeCode', 'EmployeeCode']
];

function applyMovementFilters(rows, query) {
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
// Report-type layouts. Grouped per employee; the group order follows the SP's
// @OrderBy (Map preserves the recordset's row order, so we don't re-sort groups).
// ---------------------------------------------------------------------------

// Movement (sp_MovementDetails_GetAll) — punch in/out log grouped per employee.
function buildMovement(rows) {
  const cols = [
    { header: 'Date', width: 70, align: 'center', value: (r) => ddmmyyyy(r.AttenDate) },
    { header: 'Department', width: 130, value: (r) => str(r, 'DepartmentName_English') || str(r, 'DepartmentName') },
    { header: 'Designation', width: 120, value: (r) => str(r, 'DesignationName') },
    { header: 'In / Out', width: 60, align: 'center', value: (r) => str(r, 'InOutMode') },
    { header: 'Punch Time', width: 80, align: 'center', value: (r) => hhmm(r.AttenDateTime) },
    { header: 'Mins', width: 50, align: 'center', value: (r) => str(r, 'Mins') }
  ];
  return [groupedTable(cols, rows, {
    groupBy: (r) => str(r, 'EmployeeCode'),
    groupLabel: (r) => `${str(r, 'EmployeeID')} - ${str(r, 'EmployeeName')}`,
    serialPerGroup: true,
    sortRows: (a, b) => new Date(a.AttenDateTime) - new Date(b.AttenDateTime)
  })];
}

// Employee Wise (sp_MovementDetails_GetByEmployee) — per-employee movement detail
// with the shift/department context in the group header.
function buildEmployeeWise(rows) {
  const cols = [
    { header: 'Date', width: 70, align: 'center', value: (r) => ddmmyyyy(r.AttenDate) },
    { header: 'Designation', width: 140, value: (r) => str(r, 'DesignationName') },
    { header: 'In / Out', width: 70, align: 'center', value: (r) => str(r, 'InOutMode') },
    { header: 'Time', width: 90, align: 'center', value: (r) => hhmm(r.AttenTime) }
  ];
  return [groupedTable(cols, rows, {
    groupBy: (r) => str(r, 'EmployeeCode'),
    groupLabel: (r) =>
      `${str(r, 'EmployeeID')} - ${str(r, 'EmployeeName')}`
      + `   |   Department : ${str(r, 'DepartmentName')}`
      + (str(r, 'ShiftName') ? `   |   Shift : ${str(r, 'ShiftName')}` : ''),
    serialPerGroup: true,
    sortRows: (a, b) => new Date(a.AttenDateTime) - new Date(b.AttenDateTime)
  })];
}

const REPORTS = {
  movement: { sp: 'sp_MovementDetails_GetAll', title: 'Movement Details', build: buildMovement },
  employeeWise: { sp: 'sp_MovementDetails_GetByEmployee', title: 'Movement Details - Employee Wise', build: buildEmployeeWise }
};

function pickReport(query) {
  const raw = String(query.groupBy || query.reportType || 'movement').trim();
  return REPORTS[raw] ? raw : 'movement';
}

// ---------------------------------------------------------------------------
// Orchestrator — runs the report-type SP with the VB's param shape, applies the
// in-memory filter rail, and renders the chosen layout.
// ---------------------------------------------------------------------------
export const movementDetailsReport = async (req, res) => {
  const t0 = Date.now();
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type('text/plain').send('Missing subDBName header');

    const debug = req.query.debug === '1';
    const reportType = pickReport(req.query);
    const cfg = REPORTS[reportType];
    const companyCode = req.query.CompanyCode || req.query.companyCode || req.headers.companycode || '0';
    const companyCodeInt = parseInt(companyCode) || 0;
    const today = new Date().toISOString().slice(0, 10);
    const fromDate = req.query.FromDate || req.query.fromDate || today;
    const toDate = req.query.ToDate || req.query.toDate || today;
    const orderBy = parseInt(req.query.OrderBy) || 0;            // 0 = ID, 1 = Name
    const empStatus = req.query.empStatus === undefined
      ? 1
      : (req.query.empStatus === '1' || req.query.empStatus === 'true' ? 1 : 0);

    const pool = await getPool(subDbName);
    const spReq = pool.request();
    spReq.input('FromDate', sql.DateTime, new Date(fromDate));
    spReq.input('ToDate', sql.DateTime, new Date(toDate));
    spReq.input('Emp_Status', sql.Bit, empStatus);
    spReq.input('OrderBy', sql.Int, orderBy);
    if (companyCodeInt > 0) spReq.input('CompanyCode', sql.Int, companyCodeInt);

    const spResult = await spReq.execute(cfg.sp);
    const rows = applyMovementFilters(spResult.recordset || [], req.query);
    const company = await getCompanyInfo(pool, companyCode);

    const docDef = buildEmployeePage({
      companyName: company.name,
      companyLogo: company.logo,
      title: cfg.title,
      orientation: 'portrait',
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
          `SP:           ${cfg.sp}`,
          `reportType:   ${reportType}`,
          `OrderBy:      ${orderBy} (${orderBy === 1 ? 'Name' : 'ID'})`,
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
    res.setHeader('Content-Disposition', `inline; filename="MovementDetails_${reportType}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
};
