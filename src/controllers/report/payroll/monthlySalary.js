// =============================================================================
// Payroll ▸ Reports ▸ Salary Details ▸ Monthly Salary Details (rptMonthlySalaryDetails)
// =============================================================================
// Port of the WinForms rptMonthlySalaryDetails "MONTHLY SALARY" screen
// (btnView_Click). Pay-period driven; one dataset (sp_Salary_GetAll) feeds a
// family of layouts the desktop picks from the "Report Type" combo
// (tbl_SalaryReports.ReportFileName). The desktop chooses a weekly/monthly .rdlc
// by ReportFileName; here one endpoint renders the matching layout, chosen from
// the report-type name/file (Salary Statement / PF / ESI / PF & ESI / Bank
// Statement / Checklist), with the plain Salary Statement as the fallback.
//
// Flow (VB parity):
//   1. sp_Salary_GetAll @CompanyCode(>0) @PayPeriodCode @PayTypeCode @Emp_Status
//        @PFCovering @ESICovering  (+ @FromVacationDate/@ToVacationDate when the
//        Live/Leave status radios are used) -> one row per employee with the full
//        earnings/deductions breakup.
//   2. In-memory chain (exact VB order): Status (Live / Leave / Left), then
//      Department, Branch, Designation, Employee, Agent, Bank, EmpCategory,
//      EmpGroup, EmployeeBatch. Each combo is a comma-code list; applied only
//      when the recordset exposes the column.
//   3. sp_Company_GetAll @CompanyCode -> page header name + logo.
//
//   GET /payroll/reports/monthly-salary
//     ?CompanyCode &PayTypeCode &PayperiodCode      (required, VB validation)
//     &reportType=<ReportCode> &reportName= &reportFile=   (pick the layout)
//     &cover=ALL|PF|ESI|PFESI      (PF/ESI covering radios)
//     &status=all|live|leave|left  (employee status radios)
//     &DepartmentCode &BranchCode &DesignationCode &EmployeeCode &AgentCode
//     &BankCode &EmpCategoryCode &EmpGroupCode &EmployeeBatchCode  (code lists)
//     &empStatus=0|1  &debug=1
// =============================================================================

import sql from 'mssql';
import { getPool } from '../../../config/dynamicDB.js';
import { renderPdf, getCompanyInfo } from '../cotton/_common.js';
import { buildEmployeePage, tableLayout, colors, headStyle, str, dec, ddmmyyyy } from './_common.js';

const toInt = (v) => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? 0 : n;
};
const ymd = (v) => (v ? String(v).slice(0, 10) : '');

// Indian-grouped whole rupees (mirrors the .rdlc "#,###0" / "#0" formats). Blank
// for zero to keep the wide grids readable, matching the desktop cells.
const money = (v) => {
  const n = Math.round(Number(v) || 0);
  return n ? n.toLocaleString('en-IN') : '';
};
// Days with up to one decimal (WDays etc.), blank when zero.
const days = (v) => {
  const n = Number(v) || 0;
  if (!n) return '';
  return (Math.round(n * 10) / 10).toString();
};
// First present numeric among keys (the SP shape varies by client build).
const pick = (r, ...keys) => {
  for (const k of keys) {
    const v = dec(r, k);
    if (v) return v;
  }
  return 0;
};

// ---------------------------------------------------------------------------
// Status + combo filter chain (exact VB order).
// ---------------------------------------------------------------------------
const codeSet = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const s = new Set(String(v).split(',').map((x) => x.trim()).filter(Boolean));
  return s.size ? s : null;
};

function applyStatus(rows, status) {
  const s = String(status || '').toLowerCase();
  if (s === 'live') return rows.filter((r) => String(r.EmpLiveStatus ?? '').toUpperCase() === 'LIVE' && r.DOL == null);
  if (s === 'leave') return rows.filter((r) => String(r.EmpLiveStatus ?? '').toUpperCase() === 'LEAVE' && r.DOL == null);
  if (s === 'left') return rows.filter((r) => r.DOL != null);
  return rows;
}

const ROW_FILTERS = [
  ['DepartmentCode', 'DepartmentCode'],
  ['BranchCode', 'BranchCode'],
  ['DesignationCode', 'DesignationCode'],
  ['EmployeeCode', 'EmployeeCode'],
  ['AgentCode', 'AgentCode'],
  ['BankCode', 'BankCode'],
  ['EmpCategoryCode', 'EmpCategoryCode'],
  ['EmpGroupCode', 'EmpGroupCode'],
  ['EmployeeBatchCode', 'EmployeeBatchCode'],
];

function applyComboFilters(rows, query) {
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
// Layout selection — the desktop picks the .rdlc by ReportFileName; we map the
// report-type name/file (and, as a hint, the PF/ESI radio) to a `kind`.
// ---------------------------------------------------------------------------
function resolveKind(reportName, reportFile, cover) {
  const t = `${reportName || ''} ${reportFile || ''}`.toLowerCase();
  if (t.includes('bank')) return 'bank';
  if (t.includes('checklist') || t.includes('check list')) return 'checklist';
  const hasPf = t.includes('pf') || t.includes('epf') || t.includes('provident');
  const hasEsi = t.includes('esi') || t.includes('esic');
  if (hasPf && hasEsi) return 'pfesi';
  if (hasPf) return 'pf';
  if (hasEsi) return 'esi';
  // fall back to the covering radio when the report name is generic
  const c = String(cover || '').toUpperCase();
  if (c === 'PFESI' || c === 'PF&ESI') return 'pfesi';
  if (c === 'PF') return 'pf';
  if (c === 'ESI') return 'esi';
  return 'statement';
}

// Column sets per layout. Each col: { header, width, align, get(r)->text, sum?, raw? }.
// `sum` marks a numeric column that gets a bold TOTAL in the footer (raw provides
// the number to add). `label` places the "TOTAL" caption in that column.
function columnsFor(kind) {
  const nameCol = { header: 'Employee Name', width: '*', align: 'left', get: (r) => str(r, 'EmployeeName'), label: true };
  const idCol = { header: 'Emp ID', width: 42, align: 'center', get: (r) => str(r, 'EmployeeID') };

  if (kind === 'bank') {
    return [
      idCol,
      { header: 'Employee Name', width: '*', align: 'left', get: (r) => str(r, 'EmployeeName'), label: true },
      { header: 'IFSC Code', width: 78, align: 'center', get: (r) => str(r, 'IFSCCode') },
      { header: 'A/C No.', width: 110, align: 'center', get: (r) => str(r, 'ACNo') },
      { header: 'Amount', width: 70, align: 'right', sum: true, raw: (r) => pick(r, 'NetPay', 'SR_NET', 'NetSalary'), get: (r) => money(pick(r, 'NetPay', 'SR_NET', 'NetSalary')) },
    ];
  }

  if (kind === 'pf') {
    const gross = (r) => pick(r, 'Fixed_PF_GrossWages', 'PF_Wages', 'Wages');
    return [
      { header: 'UAN / PF No.', width: 90, align: 'center', get: (r) => str(r, 'FPFNo') || str(r, 'PFNo') },
      idCol,
      { header: 'Member Name', width: '*', align: 'left', get: (r) => str(r, 'EmployeeName'), label: true },
      { header: 'Gross Wages', width: 62, align: 'right', sum: true, raw: (r) => dec(r, 'Wages'), get: (r) => money(dec(r, 'Wages')) },
      { header: 'EPF Wages', width: 62, align: 'right', sum: true, raw: gross, get: (r) => money(gross(r)) },
      { header: 'EPS Wages', width: 62, align: 'right', sum: true, raw: (r) => pick(r, 'EPS_Wages', 'Fixed_PF_GrossWages'), get: (r) => money(pick(r, 'EPS_Wages', 'Fixed_PF_GrossWages')) },
      { header: 'EPF 12%', width: 55, align: 'right', sum: true, raw: (r) => Math.round(gross(r) * 12 / 100), get: (r) => money(Math.round(gross(r) * 12 / 100)) },
      { header: 'EPS 8.33%', width: 55, align: 'right', sum: true, raw: (r) => Math.round(gross(r) * 8.33 / 100), get: (r) => money(Math.round(gross(r) * 8.33 / 100)) },
      { header: 'Diff 3.67%', width: 55, align: 'right', sum: true, raw: (r) => Math.round(gross(r) * 12 / 100) - Math.round(gross(r) * 8.33 / 100), get: (r) => money(Math.round(gross(r) * 12 / 100) - Math.round(gross(r) * 8.33 / 100)) },
    ];
  }

  if (kind === 'esi') {
    const gross = (r) => pick(r, 'Fixed_ESI_GrossWages', 'Wages');
    return [
      { header: 'ESI No.', width: 90, align: 'center', get: (r) => str(r, 'ESINo') },
      idCol,
      { header: 'Employee Name', width: '*', align: 'left', get: (r) => str(r, 'EmployeeName'), label: true },
      { header: 'W. Days', width: 46, align: 'center', get: (r) => days(pick(r, 'Account_WDays', 'WDays')) },
      { header: 'Gross Amt', width: 64, align: 'right', sum: true, raw: gross, get: (r) => money(gross(r)) },
      { header: 'Emp 0.75%', width: 60, align: 'right', sum: true, raw: (r) => Math.round(gross(r) * 0.75 / 100), get: (r) => money(Math.round(gross(r) * 0.75 / 100)) },
      { header: 'Empr 3.25%', width: 62, align: 'right', sum: true, raw: (r) => Math.round(gross(r) * 3.25 / 100), get: (r) => money(Math.round(gross(r) * 3.25 / 100)) },
      { header: 'ESI', width: 55, align: 'right', sum: true, raw: (r) => dec(r, 'ESI'), get: (r) => money(dec(r, 'ESI')) },
    ];
  }

  if (kind === 'pfesi') {
    return [
      idCol,
      nameCol,
      { header: 'Department', width: 90, align: 'left', get: (r) => str(r, 'DepartmentName') },
      { header: 'PF No.', width: 74, align: 'center', get: (r) => str(r, 'PFNo') },
      { header: 'ESI No.', width: 78, align: 'center', get: (r) => str(r, 'ESINo') },
      { header: 'Gross', width: 60, align: 'right', sum: true, raw: (r) => dec(r, 'Wages'), get: (r) => money(dec(r, 'Wages')) },
      { header: 'PF', width: 55, align: 'right', sum: true, raw: (r) => dec(r, 'PF'), get: (r) => money(dec(r, 'PF')) },
      { header: 'ESI', width: 55, align: 'right', sum: true, raw: (r) => dec(r, 'ESI'), get: (r) => money(dec(r, 'ESI')) },
      { header: 'Total Ded', width: 62, align: 'right', sum: true, raw: (r) => dec(r, 'PF') + dec(r, 'ESI'), get: (r) => money(dec(r, 'PF') + dec(r, 'ESI')) },
    ];
  }

  if (kind === 'checklist') {
    return [
      idCol,
      nameCol,
      { header: 'Department', width: 96, align: 'left', get: (r) => str(r, 'DepartmentName') },
      { header: 'Fixed Gross', width: 62, align: 'right', sum: true, raw: (r) => dec(r, 'EmpSalary'), get: (r) => money(dec(r, 'EmpSalary')) },
      { header: 'Prsnt Days', width: 52, align: 'center', get: (r) => days(pick(r, 'Account_WDays', 'WDays')) },
      { header: 'NFH', width: 40, align: 'center', get: (r) => days(dec(r, 'HDays')) },
      { header: 'Extra', width: 40, align: 'center', get: (r) => days(dec(r, 'ExtraDays')) },
      { header: 'OT Hrs', width: 48, align: 'center', get: (r) => days(dec(r, 'OTHours')) },
      { header: 'W.Off', width: 40, align: 'center', get: (r) => days(pick(r, 'TotalWeeklyOff')) },
      { header: 'N.Shift', width: 44, align: 'center', get: (r) => days(dec(r, 'NightShiftDays')) },
    ];
  }

  // default — Salary Statement
  const netv = (r) => pick(r, 'NetSalary', 'SR_NET', 'NetPay');
  return [
    idCol,
    nameCol,
    { header: 'Department', width: 90, align: 'left', get: (r) => str(r, 'DepartmentName') },
    { header: 'W.Days', width: 42, align: 'center', get: (r) => days(pick(r, 'Account_WDays', 'WDays')) },
    { header: 'Wages', width: 58, align: 'right', sum: true, raw: (r) => dec(r, 'Wages'), get: (r) => money(dec(r, 'Wages')) },
    { header: 'OT', width: 50, align: 'right', sum: true, raw: (r) => dec(r, 'OTWages'), get: (r) => money(dec(r, 'OTWages')) },
    { header: 'Incentive', width: 52, align: 'right', sum: true, raw: (r) => dec(r, 'Incentive'), get: (r) => money(dec(r, 'Incentive')) },
    { header: 'PF', width: 48, align: 'right', sum: true, raw: (r) => dec(r, 'PF'), get: (r) => money(dec(r, 'PF')) },
    { header: 'ESI', width: 44, align: 'right', sum: true, raw: (r) => dec(r, 'ESI'), get: (r) => money(dec(r, 'ESI')) },
    { header: 'Advance', width: 54, align: 'right', sum: true, raw: (r) => dec(r, 'Advance'), get: (r) => money(dec(r, 'Advance')) },
    { header: 'Tot Ded', width: 58, align: 'right', sum: true, raw: (r) => dec(r, 'TotalDeduction'), get: (r) => money(dec(r, 'TotalDeduction')) },
    { header: 'Net Salary', width: 64, align: 'right', sum: true, raw: netv, get: (r) => money(netv(r)) },
  ];
}

function buildSalaryTable(rows, cols) {
  const widths = [24, ...cols.map((c) => c.width)];
  const header = [{ text: 'S.No', ...headStyle, fontSize: 7 }, ...cols.map((c) => ({ text: c.header, ...headStyle, fontSize: 7 }))];
  const body = [header];
  const totals = {};

  rows
    .slice()
    .sort((a, b) => String(a.EmployeeID ?? '').localeCompare(String(b.EmployeeID ?? ''), undefined, { numeric: true }))
    .forEach((r, i) => {
      const zebra = i % 2 === 1 ? colors.zebraFill : null;
      const cells = [{ text: String(i + 1), alignment: 'center', fontSize: 7, fillColor: zebra }];
      cols.forEach((c, ci) => {
        if (c.sum) totals[ci] = (totals[ci] || 0) + (Number(c.raw(r)) || 0);
        cells.push({ text: c.get(r), alignment: c.align || 'left', fontSize: 7, fillColor: zebra });
      });
      body.push(cells);
    });

  if (rows.length) {
    const foot = [{ text: '', fillColor: colors.grandFill }];
    let placed = false;
    cols.forEach((c, ci) => {
      if (c.sum) {
        foot.push({ text: money(totals[ci] || 0), alignment: c.align || 'right', bold: true, fontSize: 7.5, color: colors.grandText, fillColor: colors.grandFill });
      } else if (!placed && c.label) {
        foot.push({ text: 'TOTAL', alignment: 'right', bold: true, fontSize: 8, color: colors.grandText, fillColor: colors.grandFill });
        placed = true;
      } else {
        foot.push({ text: '', fillColor: colors.grandFill });
      }
    });
    body.push(foot);
  }

  return [{ table: { headerRows: 1, widths, body }, layout: tableLayout() }];
}

const TITLES = {
  statement: 'Salary Statement',
  pf: 'PF Monthly Contribution',
  esi: 'ESI Contribution',
  pfesi: 'PF & ESI Statement',
  bank: 'Salary Bank Statement',
  checklist: 'Salary Checklist',
};

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
export const monthlySalaryReport = async (req, res) => {
  const t0 = Date.now();
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type('text/plain').send('Missing subDBName header');

    const debug = req.query.debug === '1';
    const companyCode = toInt(req.query.CompanyCode || req.query.companyCode || req.headers.companyCode || req.headers.companycode);
    const payTypeCode = toInt(req.query.PayTypeCode || req.query.payTypeCode);
    const payPeriodCode = toInt(req.query.PayperiodCode || req.query.PayPeriodCode || req.query.payPeriodCode);
    const reportType = toInt(req.query.reportType);

    // Validation order + messages mirror btnView_Click.
    if (reportType <= 0) return res.status(400).type('text/plain').send('Select the Report Type....');
    if (companyCode <= 0) return res.status(400).type('text/plain').send('Select the Company Name');
    if (payPeriodCode <= 0) return res.status(400).type('text/plain').send('Select the PayPeriod');

    const cover = String(req.query.cover || 'ALL').toUpperCase();
    const status = String(req.query.status || 'all').toLowerCase();
    const kind = resolveKind(req.query.reportName, req.query.reportFile, cover);
    const empStatus = req.query.empStatus === '0' ? 0 : 1;

    const pool = await getPool(subDbName);

    const spReq = pool.request();
    spReq.timeout = 300000;
    if (companyCode > 0) spReq.input('CompanyCode', sql.Int, companyCode);
    spReq.input('PayPeriodCode', sql.Int, payPeriodCode);
    if (payTypeCode > 0) spReq.input('PayTypeCode', sql.Int, payTypeCode);
    spReq.input('Emp_Status', sql.Int, empStatus);

    // PF / ESI covering (optPFESI / optPF / optESI). ALL => both 0.
    if (cover === 'PFESI' || cover === 'PF&ESI') {
      spReq.input('PFCovering', sql.Int, 1);
      spReq.input('ESICovering', sql.Int, 1);
    } else {
      spReq.input('PFCovering', sql.Int, cover === 'PF' ? 1 : 0);
      spReq.input('ESICovering', sql.Int, cover === 'ESI' ? 1 : 0);
    }

    // Live / Leave status uses the pay period's From/To as the vacation window.
    if (status === 'live' || status === 'leave') {
      const from = ymd(req.query.FromDate || req.query.fromDate);
      const to = ymd(req.query.ToDate || req.query.toDate);
      if (from) spReq.input('FromVacationDate', sql.VarChar(10), from);
      if (to) spReq.input('ToVacationDate', sql.VarChar(10), to);
    }

    const spResult = await spReq.execute('sp_Salary_GetAll');
    let rows = spResult.recordset || [];
    rows = applyStatus(rows, status);
    rows = applyComboFilters(rows, req.query);

    const company = await getCompanyInfo(pool, companyCode);
    const first = rows[0] || {};
    const fromDate = first.PayPeriodFrom || req.query.FromDate || null;
    const toDate = first.PayPeriodTo || req.query.ToDate || null;
    const periodName = str(first, 'PayPeriodName');

    const cols = columnsFor(kind);
    const title = `${TITLES[kind] || 'Salary Statement'}${periodName ? ' - ' + periodName : ''}`;

    const tables = rows.length === 0
      ? [{ text: 'No salary data found for the selected pay period / filters.', italics: true, alignment: 'center', margin: [0, 24, 0, 0] }]
      : buildSalaryTable(rows, cols);

    const docDef = buildEmployeePage({
      companyName: company.name,
      companyLogo: company.logo,
      title,
      orientation: 'landscape',
      fromDate,
      toDate,
      tables,
    });
    const pdfBuffer = await renderPdf(docDef);

    if (debug) {
      const dbCfg = pool.config || {};
      const sample = rows.slice(0, 2).map((r, i) => `  [${i}] ` + JSON.stringify(r).slice(0, 400)).join('\n');
      return res.type('text/plain').send(
        [
          `SP:           sp_Salary_GetAll`,
          `subDBName:    ${subDbName}`,
          `server:       ${dbCfg.server}${dbCfg.port ? ':' + dbCfg.port : ''}`,
          `database:     ${dbCfg.database}`,
          `company:      ${company.name || '(none)'} (${companyCode})`,
          `PayTypeCode:  ${payTypeCode}`,
          `PayPeriodCode:${payPeriodCode}`,
          `reportType:   ${reportType}  name="${req.query.reportName || ''}" file="${req.query.reportFile || ''}" -> kind=${kind}`,
          `cover:        ${cover}   status: ${status}   empStatus: ${empStatus}`,
          `rows:         ${rows.length}`,
          `Total:        ${Date.now() - t0} ms (${pdfBuffer.length} pdf bytes)`,
          sample ? `\nfirst rows:\n${sample}` : '',
        ].join('\n')
      );
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="MonthlySalary.pdf"');
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
};

// ---------------------------------------------------------------------------
// Filter-rail lookup lists (rptMonthlySalaryDetails.vb Bind_Data). Report Types
// carry PayTypeCode + ReportFileName so the screen can narrow them to the chosen
// Pay Type and post the file back for layout selection. Also returns the
// employee-approval-pending count shown at the bottom of the desktop screen.
// ---------------------------------------------------------------------------
export const monthlySalaryReportOptions = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).json({ success: false, error: 'Missing subDBName header' });

    const companyCode = toInt(req.query.CompanyCode || req.query.companyCode || req.headers.companyCode || req.headers.companycode);
    const pool = await getPool(subDbName);

    const q = (text) =>
      pool.request().query(text)
        .then((r) => r.recordset || [])
        .catch((e) => { console.error('monthlySalaryReportOptions query failed:', e.message); return []; });
    const map = (rows, ck, nk) => rows.map((x) => ({ value: x[ck], label: x[nk] }));

    const [
      companies, payTypes, payPeriods, empGroups, categories,
      departments, designations, employees, agents, banks, branches, batches, reportTypes, pendings,
    ] = await Promise.all([
      q(`SELECT CompanyCode, CompanyName FROM tbl_Company ORDER BY CompanyName`),
      q(`SELECT PayTypeCode, PayTypeName FROM tbl_PayType WHERE Status = 1 ORDER BY PayTypeName`),
      q(`SELECT PayPeriodCode, PayPeriodName, PayPeriodFrom, PayPeriodTo, PayTypeCode FROM tbl_PayPeriod WHERE CompanyCode = ${companyCode} ORDER BY PayPeriodFrom DESC`),
      q(`SELECT EmpGroupCode, EmpGroupName FROM tbl_EmpGroup WHERE Status = 1 ORDER BY EmpGroupName`),
      q(`SELECT EmpCategoryCode, EmpCategoryName FROM tbl_EmpCategory ORDER BY EmpCategoryName`),
      q(`SELECT DepartmentCode, DepartmentName_English FROM tbl_Department WHERE HR = 1 ORDER BY DepartmentName`),
      q(`SELECT DesignationCode, DesignationName FROM tbl_Designation ORDER BY DesignationName`),
      q(`SELECT EmployeeCode, str_EmployeeID FROM vw_Employee_New WHERE CompanyCode = ${companyCode} ORDER BY EmployeeID`),
      q(`SELECT AgentCode, AgentName FROM tbl_Agent WHERE HR = 1 ORDER BY AgentName`),
      q(`SELECT BankCode, BankName FROM tbl_Bank ORDER BY BankName`),
      q(`SELECT BranchCode, BranchName FROM tbl_Branch ORDER BY BranchName`),
      q(`SELECT EmployeeBatchCode, EmployeeBatchName FROM tbl_EmployeeBatch ORDER BY EmployeeBatchName`),
      q(`SELECT ReportCode, ReportName, ReportFileName, PayTypeCode FROM tbl_SalaryReports ORDER BY ReportName`),
      q(`SELECT COUNT(ISNULL(EmployeeCode,0)) AS Pendings FROM tbl_Employee WHERE Approval = 0 AND Reject = 0 AND CompanyCode = ${companyCode}`),
    ]);

    return res.json({
      success: true,
      data: {
        companies: map(companies, 'CompanyCode', 'CompanyName'),
        payTypes: map(payTypes, 'PayTypeCode', 'PayTypeName'),
        payPeriods: payPeriods.map((r) => ({
          value: r.PayPeriodCode,
          label: r.PayPeriodName,
          PayTypeCode: r.PayTypeCode,
          PayPeriodFrom: ymd(r.PayPeriodFrom),
          PayPeriodTo: ymd(r.PayPeriodTo),
        })),
        empGroups: map(empGroups, 'EmpGroupCode', 'EmpGroupName'),
        categories: map(categories, 'EmpCategoryCode', 'EmpCategoryName'),
        departments: map(departments, 'DepartmentCode', 'DepartmentName_English'),
        designations: map(designations, 'DesignationCode', 'DesignationName'),
        employees: map(employees, 'EmployeeCode', 'str_EmployeeID'),
        agents: map(agents, 'AgentCode', 'AgentName'),
        banks: map(banks, 'BankCode', 'BankName'),
        branches: map(branches, 'BranchCode', 'BranchName'),
        batches: map(batches, 'EmployeeBatchCode', 'EmployeeBatchName'),
        reportTypes: reportTypes.map((r) => ({
          value: r.ReportCode,
          label: r.ReportName,
          PayTypeCode: r.PayTypeCode,
          ReportFileName: r.ReportFileName,
        })),
        statuses: [
          { value: 'all', label: 'All' },
          { value: 'live', label: 'Live' },
          { value: 'leave', label: 'Leave' },
          { value: 'left', label: 'Left' },
        ],
        covers: [
          { value: 'ALL', label: 'ALL' },
          { value: 'PF', label: 'PF' },
          { value: 'ESI', label: 'ESI' },
          { value: 'PFESI', label: 'PF & ESI' },
        ],
        approvalPendings: pendings[0]?.Pendings ?? 0,
      },
    });
  } catch (err) {
    console.error('DB Error (monthlySalaryReportOptions):', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
