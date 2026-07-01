// =============================================================================
// Payroll ▸ Reports ▸ Muster ▸ Form 25  (form: rptForm25)
// =============================================================================
// Port of the WinForms rptForm25 "FORM 25 REPORT" screen (btnView_Click). A
// statutory register — "FORM NO. 25 : Muster Roll and Register of Compensatory
// Holidays" (Tamil Nadu Factories Rules 77(4), 103). Pay-period driven.
//
// Flow (VB parity):
//   1. sp_Muster1  @CompanyCode(>0) @PayperiodCode @PayTypeCode @Emp_Status=1
//                  @PayMode(when Pay Mode <> "--ALL--")
//      -> one row per employee (day marks in "1".."31", per-day OT in "1OT".., the
//         per-employee totals, plus Form12No = the Sl.No in the register).
//   2. In-memory filter chain (VB order): Department, Designation, Employee,
//      Agent, EmpCategory, EmpGroup.  (No Grade / Batch / PF / Only Present.)
//   3. sp_Muster_ShiftNo_Title @PayperiodCode -> a single row whose "1".."31" hold
//      the calendar day number for each in-period slot (0 outside the period); a
//      day column shows only when its value > 0 (mirrors the .rdlc Sum > 0).
//   4. sp_Company_GetAll @CompanyCode -> the statutory header (name / address /
//      Registration No.).
//
// The desktop offers a single "Report By" layout (FORM 25) -> rptForm25.rdlc.
//
//   GET /payroll/reports/form25
//     ?CompanyCode &PayTypeCode &PayperiodCode      (all required, VB validation)
//     &PayMode=HOUR|DAY|MONTH
//     &DepartmentCode &DesignationCode &EmployeeCode &AgentCode
//     &EmpCategoryCode &EmpGroupCode                (comma-separated code lists)
//     &debug=1
// =============================================================================

import sql from 'mssql';
import { getPool } from '../../../config/dynamicDB.js';
import { renderPdf } from '../cotton/_common.js';
import {
  buildEmployeePage, tableLayout, colors, headStyle, str, dec, ddmmyyyy, bufferToDataUri,
} from './_common.js';

const toInt = (v) => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? 0 : n;
};

// ---------------------------------------------------------------------------
// In-memory filter chain — exact VB DataTable.Select() order. Each applies only
// when its param is present AND the recordset exposes the column.
// ---------------------------------------------------------------------------
const codeSet = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const s = new Set(String(v).split(',').map((x) => x.trim()).filter(Boolean));
  return s.size ? s : null;
};

const ROW_FILTERS = [
  ['DepartmentCode', 'DepartmentCode'],
  ['DesignationCode', 'DesignationCode'],
  ['EmployeeCode', 'EmployeeCode'],
  ['AgentCode', 'AgentCode'],
  ['EmpCategoryCode', 'EmpCategoryCode'],
  ['EmpGroupCode', 'EmpGroupCode'],
];

function applyForm25Filters(rows, query) {
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

// Day marks — "/" stripped (RDLC: Replace(IDn,"/","")); half day = trailing "/".
const dayMark = (r, n) => String(r[String(n)] ?? '').replace(/\//g, '').trim();
const isHalfDay = (r, n) => String(r[String(n)] ?? '').trimEnd().endsWith('/');
const HALF_DAY_FILL = '#C0C0C0';

// Day slots from the title row (value > 0 => in-period), headed by the day number.
function resolveDaySlots(titleRow, rows) {
  const slots = [];
  if (titleRow) {
    for (let n = 1; n <= 31; n++) {
      const v = Number(titleRow[String(n)]);
      if (Number.isFinite(v) && v > 0) slots.push({ n, day: v });
    }
    if (slots.length) return slots;
  }
  for (let n = 1; n <= 31; n++) {
    if (rows.some((r) => String(r[String(n)] ?? '').trim() !== '')) slots.push({ n, day: n });
  }
  return slots;
}

// One-decimal statutory figure ("0.0"), blank when zero.
const n1 = (v) => (v > 0 ? Number(v).toFixed(1) : '');

// ---------------------------------------------------------------------------
// Company header row — sp_Company_GetAll gives name / address / Registration No.
// ---------------------------------------------------------------------------
async function getCompanyForm25(pool, companyCode) {
  const r = pool.request();
  r.input('CompanyCode', sql.Int, companyCode);
  const result = await r.execute('sp_Company_GetAll');
  const row = (result.recordset || [])[0] || {};
  const addr = [row.Address1, row.Address2, row.City].map((x) => (x == null ? '' : String(x).trim())).filter(Boolean).join(', ');
  return {
    name: row.CompanyName || '',
    logo: bufferToDataUri(row.Logo),
    registrationNo: row.RegistrationNo || '',
    address: addr,
  };
}

// ---------------------------------------------------------------------------
// The statutory Form 25 register table.
// ---------------------------------------------------------------------------
function buildForm25(rows, slots) {
  const dayW = slots.length > 24 ? 15 : slots.length > 16 ? 17 : 20;
  const widths = [22, 40, '*', 42, ...slots.map(() => dayW), 40, 38, 34, 40, 40, 46];
  const H = (t, extra = {}) => ({ text: t, ...headStyle, fontSize: 6.6, ...extra });
  const blanks = (n) => Array(n).fill({});

  // Two-row grouped header (mirrors the .rdlc caption + column-number rows).
  const header1 = [
    H('S.No', { rowSpan: 2 }),
    H('Sl.No', { rowSpan: 2 }),
    H('Name of the Worker', { rowSpan: 2, alignment: 'left' }),
    H('Worker ID', { rowSpan: 2 }),
    H('Daily Hours of Work including Overtime (if any)', { colSpan: slots.length }),
    ...blanks(slots.length - 1),
    H('Total Days Worked', { rowSpan: 2 }),
    H('Total Hours Worked', { rowSpan: 2 }),
    H('No. of days on Loss of Pay', { rowSpan: 2 }),
    H('Benefit availed for National Holiday', { rowSpan: 2 }),
    H('Benefit availed for Festival Holiday', { rowSpan: 2 }),
    H('Remarks', { rowSpan: 2 }),
  ];
  const header2 = [
    {}, {}, {}, {},
    ...slots.map((s) => H(String(s.day))),
    {}, {}, {}, {}, {}, {},
  ];
  const body = [header1, header2];

  rows
    .slice()
    .sort((a, b) => String(a.EmployeeID ?? '').localeCompare(String(b.EmployeeID ?? ''), undefined, { numeric: true }))
    .forEach((r, i) => {
      const zebra = i % 2 === 1 ? colors.zebraFill : null;
      const c = (t, align = 'center', extra = {}) => ({ text: t, alignment: align, fontSize: 6.6, fillColor: zebra, ...extra });
      const dayCells = slots.map((s) => ({
        text: dayMark(r, s.n),
        alignment: 'center',
        fontSize: 6.6,
        fillColor: isHalfDay(r, s.n) ? HALF_DAY_FILL : zebra,
      }));
      body.push([
        c(String(i + 1)),
        c(str(r, 'Form12No')),
        c(str(r, 'EmployeeName'), 'left'),
        c(str(r, 'EmployeeID')),
        ...dayCells,
        c(n1(dec(r, 'TotalPre'))),
        c(''), // Total Hours Worked — blank on the statutory form
        c(dec(r, 'TotalAbs') > 0 ? str(r, 'TotalAbs') : ''),
        c(n1(dec(r, 'TotalHolidays'))),
        c(''), // Benefit availed for Festival Holiday — blank
        c(''), // Remarks — blank
      ]);
    });

  return [{ table: { headerRows: 2, widths, body }, layout: tableLayout() }];
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------
export const form25Report = async (req, res) => {
  const t0 = Date.now();
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type('text/plain').send('Missing subDBName header');

    const debug = req.query.debug === '1';
    const companyCode = toInt(req.query.CompanyCode || req.query.companyCode || req.headers.companycode);
    const payTypeCode = toInt(req.query.PayTypeCode || req.query.payTypeCode);
    const payPeriodCode = toInt(req.query.PayperiodCode || req.query.PayPeriodCode || req.query.payPeriodCode);

    // Validation order + messages mirror btnView_Click.
    if (companyCode <= 0) return res.status(400).type('text/plain').send('Select the Company Name');
    if (payTypeCode <= 0) return res.status(400).type('text/plain').send('Select the Pay Type...');
    if (payPeriodCode <= 0) return res.status(400).type('text/plain').send('Select the Pay Period...');

    const payMode = String(req.query.PayMode || req.query.payMode || '').trim();
    const payModeActive = payMode && payMode.toUpperCase() !== '--ALL--' && payMode.toUpperCase() !== 'ALL';

    const pool = await getPool(subDbName);

    // 1. sp_Muster1 (VB parameter set).
    const spReq = pool.request();
    spReq.timeout = 300000;
    if (companyCode > 0) spReq.input('CompanyCode', sql.Int, companyCode);
    spReq.input('PayperiodCode', sql.Int, payPeriodCode);
    spReq.input('PayTypeCode', sql.Int, payTypeCode);
    spReq.input('Emp_Status', sql.Int, 1);
    if (payModeActive) spReq.input('PayMode', sql.VarChar(50), payMode);
    const spResult = await spReq.execute('sp_Muster1');
    const rows = applyForm25Filters(spResult.recordset || [], req.query);

    // 3. sp_Muster_ShiftNo_Title (day-number header row).
    let titleRow = null;
    try {
      const titleReq = pool.request();
      titleReq.input('PayperiodCode', sql.Int, payPeriodCode);
      const titleResult = await titleReq.execute('sp_Muster_ShiftNo_Title');
      titleRow = (titleResult.recordset || [])[0] || null;
    } catch (e) {
      console.error('sp_Muster_ShiftNo_Title failed:', e.message);
    }

    const company = await getCompanyForm25(pool, companyCode);
    const slots = resolveDaySlots(titleRow, rows);

    const first = rows[0] || {};
    const fromDate = first.PayPeriodFrom || null;
    const toDate = first.PayPeriodTo || null;

    // Statutory sub-header lines that sit under the standard title block.
    const subHeader = [
      { text: 'Muster Roll and Register of Compensatory Holidays', alignment: 'center', bold: true, fontSize: 10, margin: [0, 0, 0, 2] },
      { text: 'See Rules 77(4), 103 of the Tamil Nadu Factories Rules, 1950', alignment: 'center', italics: true, fontSize: 8, margin: [0, 0, 0, 2] },
    ];
    if (company.address) subHeader.push({ text: `Name and Address of the Factory : ${company.name}, ${company.address}`, alignment: 'center', fontSize: 8 });
    if (company.registrationNo) subHeader.push({ text: `Registration No. : ${company.registrationNo}`, alignment: 'center', bold: true, fontSize: 8, margin: [0, 2, 0, 6] });

    const tables = rows.length === 0
      ? [{ text: 'No muster data found for the selected pay period / filters.', italics: true, alignment: 'center', margin: [0, 24, 0, 0] }]
      : [...subHeader, ...buildForm25(rows, slots)];

    const docDef = buildEmployeePage({
      companyName: company.name,
      companyLogo: company.logo,
      title: 'FORM NO. 25',
      orientation: 'landscape',
      fromDate,
      toDate,
      tables,
    });
    const pdfBuffer = await renderPdf(docDef);

    if (debug) {
      const dbCfg = pool.config || {};
      const sample = rows.slice(0, 3).map((r, i) => `  [${i}] ` + JSON.stringify(r).slice(0, 320)).join('\n');
      return res.type('text/plain').send(
        [
          `SP:           sp_Muster1 (+ sp_Muster_ShiftNo_Title)`,
          `subDBName:    ${subDbName}`,
          `server:       ${dbCfg.server}${dbCfg.port ? ':' + dbCfg.port : ''}`,
          `database:     ${dbCfg.database}`,
          `company:      ${company.name || '(none)'} (${companyCode})  Reg: ${company.registrationNo || '-'}`,
          `PayTypeCode:  ${payTypeCode}`,
          `PayperiodCode:${payPeriodCode}`,
          `PayMode:      ${payModeActive ? payMode : '(all)'}`,
          `daySlots:     ${slots.map((s) => s.day).join(',') || '(none)'}`,
          `rows:         ${rows.length}`,
          `Total:        ${Date.now() - t0} ms (${pdfBuffer.length} pdf bytes)`,
          sample ? `\nfirst rows:\n${sample}` : '',
        ].join('\n')
      );
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="Form25.pdf"');
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
};

// Filter-rail lookup lists for the Form 25 screen (rptForm25.vb Bind_Data): the
// pay-period family + the six combos it filters on. Pay Periods carry PayTypeCode
// + From/To so the screen can narrow them to the chosen Pay Type.
export const form25ReportOptions = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).json({ success: false, error: 'Missing subDBName header' });

    const companyCode = toInt(req.query.CompanyCode || req.query.companyCode || req.headers.companycode);
    const pool = await getPool(subDbName);

    const q = (text) =>
      pool.request().query(text)
        .then((r) => r.recordset || [])
        .catch((e) => { console.error('form25ReportOptions query failed:', e.message); return []; });
    const map = (r, ck, nk) => r.map((x) => ({ value: x[ck], label: x[nk] }));
    const ymd = (v) => (v ? String(v).slice(0, 10) : '');

    const [
      companies, payTypes, payPeriods, empGroups, categories,
      departments, designations, employees, agents,
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
        payModes: [
          { value: '', label: '--ALL--' },
          { value: 'HOUR', label: 'HOUR' },
          { value: 'DAY', label: 'DAY' },
          { value: 'MONTH', label: 'MONTH' },
        ],
        reportBy: [{ value: 0, label: 'FORM 25', key: 'form25' }],
      },
    });
  } catch (err) {
    console.error('DB Error (form25ReportOptions):', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
