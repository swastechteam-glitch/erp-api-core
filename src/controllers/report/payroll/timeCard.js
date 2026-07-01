// =============================================================================
// Payroll ▸ Reports ▸ Time Card  (form: rptTimeCard / frmTimeCard)
// =============================================================================
// Port of the WinForms rptTimeCard "Time Card" option. The WinForms form hosts
// several statement radios but only Time Card is visible/enabled; it renders a
// per-employee attendance time card (one card per employee, page-broken).
//
//   SP: sp_Employee_Attendance_GOTS
//       @FromDate @ToDate @Emp_Status=1 @Attn=8 @CompanyCode
//   Layout: rptTimeCard_EmployeeWise.rdlc — per employee: From/To, ID, Name,
//   Designation, Department header; a Date / In / Out / Total Working Hours /
//   Status / OT Hrs detail grid; a Total-Days-Present + OT footer.
//
//   GET /payroll/reports/time-card
//     ?CompanyCode &FromDate &ToDate &empStatus(=1)
//     &EmpGroupCode &EmpCategoryCode &DepartmentCode &DesignationCode
//     &EmployeeCode &AgentCode          // comma-separated code lists
//
// In the WinForms screen the date range is filled from the chosen Pay Period;
// on the web the shared ReportViewer's Date Range supplies @FromDate/@ToDate
// directly (the SP only consumes the dates), so the output is identical.

import sql from 'mssql';
import { getPool } from '../../../config/dynamicDB.js';
import { renderPdf, getCompanyInfo } from '../cotton/_common.js';
import { buildEmployeePage, tableLayout, colors, headStyle, str, dec, ddmmyyyy, hhmm } from './_common.js';

// ---------------------------------------------------------------------------
// In-memory filter rail (rptTimeCard.vb DataTable.Select chain), each guarded.
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
  ['EmpGroupCode', 'EmpGroupCode']
];

function applyTimeCardFilters(rows, query) {
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
// Cell helpers (rptTimeCard_EmployeeWise.rdlc cell expressions).
// ---------------------------------------------------------------------------
const isEmptyTime = (v) => v === null || v === undefined || v === '';
// In / Out — "NP" (Not Punched) when the employee is Present but has no punch.
const punch = (r, field) => {
  const status = String(str(r, 'Status')).trim();
  if (isEmptyTime(r[field]) && status === 'P') return 'NP';
  return hhmm(r[field]);
};
const dayKey = (r) => { const d = new Date(r.CalendarDate); return isNaN(d) ? String(r.CalendarDate) : d.getTime(); };
const otMins = (r) => dec(r, 'OT_Mins');
// "hh:mm" from total minutes (footer OT total).
const minsToHHMM = (mins) => {
  const m = Math.max(0, Math.round(mins));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

const DETAIL_COLS = [72, 66, 66, 96, '*', 58];
const H = (text) => ({ text, ...headStyle, fontSize: 8 });

// One employee's time card: info block + detail grid + present/OT footer.
function renderEmployee(sample, rows, fromDate, toDate, pageBreak) {
  const info = {
    table: {
      widths: ['*', '*'],
      body: [
        [tcInfo(`From Date : ${ddmmyyyy(fromDate)}`), tcInfo(`To Date : ${ddmmyyyy(toDate)}`)],
        [tcInfo(`Emp. ID : ${str(sample, 'EmployeeID')}`), tcInfo(`Name : ${str(sample, 'EmployeeName')}`)],
        [tcInfo(`Designation : ${str(sample, 'DesignationName')}`), tcInfo(`Department : ${str(sample, 'DepartmentName')}`)]
      ]
    },
    layout: tableLayout(),
    margin: [0, pageBreak ? 0 : 0, 0, 4]
  };
  if (pageBreak) info.pageBreak = 'before';

  const body = [[H('Date'), H('In'), H('Out'), H('Total Working Hours'), H('Status'), H('OT Hrs')]];
  let presentDays = 0;
  let totOtMins = 0;
  rows
    .slice()
    .sort((a, b) => (dayKey(a) > dayKey(b) ? 1 : dayKey(a) < dayKey(b) ? -1 : 0))
    .forEach((r, i) => {
      const status = String(str(r, 'Status')).replace(/\//g, '');
      if (status.trim().toUpperCase().startsWith('P')) presentDays += 1;
      totOtMins += otMins(r);
      const zebra = i % 2 === 1 ? colors.zebraFill : null;
      const c = (text, extra = {}) => ({ text, alignment: 'center', fontSize: 8, fillColor: zebra, ...extra });
      body.push([
        c(ddmmyyyy(r.CalendarDate)),
        c(punch(r, 'InTime')),
        c(punch(r, 'OutTime')),
        c(str(r, 'TotalWorking_Hours')),
        c(status),
        c(otMins(r) > 0 ? str(r, 'OT_Hours') : '')
      ]);
    });

  const detail = { table: { headerRows: 1, widths: DETAIL_COLS, body }, layout: tableLayout() };

  const foot = (text) => ({ text, bold: true, fontSize: 8.5, fillColor: colors.subFill, color: colors.subText, margin: [2, 1, 2, 1] });
  const footer = {
    table: {
      widths: ['*', '*', '*'],
      body: [
        [foot(`Total Days Present : ${presentDays}`), foot('Total NFH Days :'), foot('Others :')],
        [foot('Total Days LOP / Absent :'), foot('Total Week off :'), foot(`Total OT Hours : ${minsToHHMM(totOtMins)}`)]
      ]
    },
    layout: tableLayout(),
    margin: [0, 0, 0, 6]
  };

  return [{ text: 'TIME CARD', bold: true, alignment: 'center', fontSize: 10, color: colors.titleColor, margin: [0, 0, 0, 4], pageBreak: pageBreak ? 'before' : undefined }, info, detail, footer];
}
const tcInfo = (text) => ({ text, fontSize: 8.5, margin: [3, 2, 3, 2] });

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------
export const timeCardReport = async (req, res) => {
  const t0 = Date.now();
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type('text/plain').send('Missing subDBName header');

    const debug = req.query.debug === '1';
    const companyCode = req.query.CompanyCode || req.query.companyCode || req.headers.companycode || '0';
    const companyCodeInt = parseInt(companyCode) || 0;
    const empStatus = parseInt(req.query.empStatus ?? req.query.Emp_Status ?? '1');
    const today = new Date().toISOString().slice(0, 10);
    const fromDate = req.query.FromDate || req.query.fromDate || today;
    const toDate = req.query.ToDate || req.query.toDate || today;

    const pool = await getPool(subDbName);
    const spReq = pool.request();
    spReq.input('FromDate', sql.DateTime, new Date(fromDate));
    spReq.input('ToDate', sql.DateTime, new Date(toDate));
    spReq.input('Emp_Status', sql.Int, Number.isNaN(empStatus) ? 1 : empStatus);
    spReq.input('Attn', sql.Int, 8);
    if (companyCodeInt > 0) spReq.input('CompanyCode', sql.Int, companyCodeInt);

    const spResult = await spReq.execute('sp_Employee_Attendance_GOTS');
    const rows = applyTimeCardFilters(spResult.recordset || [], req.query);
    const company = await getCompanyInfo(pool, companyCode);

    // Group by employee, ordered by EmployeeID.
    const empMap = new Map();
    for (const r of rows) {
      const k = str(r, 'EmployeeCode');
      if (!empMap.has(k)) empMap.set(k, { sample: r, rows: [] });
      empMap.get(k).rows.push(r);
    }
    const emps = [...empMap.values()].sort(
      (a, b) => String(a.sample.EmployeeID ?? '').localeCompare(String(b.sample.EmployeeID ?? ''), undefined, { numeric: true })
    );

    let tables;
    if (emps.length === 0) {
      tables = [{ text: 'No attendance found for the selected period.', italics: true, alignment: 'center', margin: [0, 20, 0, 0] }];
    } else {
      tables = emps.flatMap((e, i) => renderEmployee(e.sample, e.rows, fromDate, toDate, i > 0));
    }

    const docDef = buildEmployeePage({
      companyName: company.name,
      companyLogo: company.logo,
      title: 'Time Card',
      orientation: 'portrait',
      fromDate,
      toDate,
      tables
    });
    const pdfBuffer = await renderPdf(docDef);

    if (debug) {
      const dbCfg = pool.config || {};
      const sample = rows.slice(0, 3).map((r, i) => `  [${i}] ` + JSON.stringify(r).slice(0, 300)).join('\n');
      return res.type('text/plain').send(
        [
          `SP:           sp_Employee_Attendance_GOTS (@Attn=8)`,
          `subDBName:    ${subDbName}`,
          `server:       ${dbCfg.server}${dbCfg.port ? ':' + dbCfg.port : ''}`,
          `database:     ${dbCfg.database}`,
          `company:      ${company.name || '(none)'} (${companyCodeInt})`,
          `Emp_Status:   ${empStatus}`,
          `FromDate:     ${fromDate}`,
          `ToDate:       ${toDate}`,
          `rows:         ${rows.length}`,
          `employees:    ${emps.length}`,
          `Total:        ${Date.now() - t0} ms (${pdfBuffer.length} pdf bytes)`,
          sample ? `\nfirst rows:\n${sample}` : ''
        ].join('\n')
      );
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="TimeCard.pdf"');
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
};
