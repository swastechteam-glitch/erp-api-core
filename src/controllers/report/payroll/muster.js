// =============================================================================
// Payroll ▸ Reports ▸ Muster Report  (form: rptMuster)
// =============================================================================
// Port of the WinForms rptMuster "Muster Report" screen (btnView_Click). NOT the
// Muster Generate screen (that is musterGenerate.controller.js / sp_Muster_Generate).
//
// Flow (VB parity):
//   1. sp_Muster  @CompanyCode(>0) @PayperiodCode @PayTypeCode @Emp_Status=1
//                 @PayMode(when Pay Mode <> "--ALL--")  @OnlyPresent(=1 when checked)
//      -> one row per employee. Day-of-month attendance marks live in columns
//         "1".."31" ("X" present, a trailing "/" = half day -> shaded), the
//         per-day OT in "1OT".."31OT", plus per-employee totals (WDays present,
//         OTHrs, NightShiftDays, TotalAbs, TotalLeave, …).
//   2. In-memory filter chain (exact VB order): Department, Designation,
//      Employee, Agent, EmpCategory, EmpGroup, Grade, Batch, then PF / Non PF
//      (PF = PF > 0, NON PF = PF <= 0). Each combo is a single code in the VB, so
//      a single value is the common case; comma lists are also honoured.
//   3. sp_Muster_Title @PayperiodCode -> a single row whose "1".."31" hold the
//      calendar day number for each in-period slot (0 outside the period). A day
//      column is shown only when its title value > 0 and headed by that number
//      (mirrors the .rdlc  Sum(IDn,"…Title") > 0  column-visibility + header).
//   4. sp_Company_GetAll @CompanyCode -> the page header name + logo.
//
// The desktop picks 1 of 12 .rdlc layouts from the "Report By" combo; here one
// endpoint renders the matching layout, chosen by ?reportBy=<0..11> (or its key).
//
//   GET /payroll/reports/muster
//     ?CompanyCode &PayTypeCode &PayperiodCode      (all required, VB validation)
//     &reportBy=0..11        (default 0 = ONLY MUSTER)
//     &PayMode=HOUR|DAY|MONTH  &onlyPresent=1
//     &pfNonPf=PF|NONPF
//     &DepartmentCode &DesignationCode &EmployeeCode &AgentCode
//     &EmpCategoryCode &EmpGroupCode &GradeCode &EmployeeBatchCode  (code lists)
//     &debug=1
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

// ---------------------------------------------------------------------------
// "Report By" combo (cmbReportBy) — the 12 desktop options, in index order, each
// mapped to how the web renders it: a `kind` (muster grid / OT-only / summary /
// engagement abstract), an optional `groupBy` dimension, and whether an OT total
// column is shown. Labels are the exact desktop combo strings.
// ---------------------------------------------------------------------------
const REPORTS = [
  { key: 'onlyMuster',        label: 'Only Muster',                              kind: 'muster',     groupBy: null,          showOT: false }, // 0
  { key: 'otEmpIdWise',       label: 'Muster With OT Employee ID Wise',          kind: 'muster',     groupBy: null,          showOT: true  }, // 1
  { key: 'otDeptWise',        label: 'Muster With OT Employee Department Wise',  kind: 'muster',     groupBy: 'department',  showOT: true  }, // 2
  { key: 'agentWise',         label: 'Agent Wise Muster',                        kind: 'muster',     groupBy: 'agent',       showOT: false }, // 3
  { key: 'agentWiseOT',       label: 'Agent Wise Muster With OT',                kind: 'muster',     groupBy: 'agent',       showOT: true  }, // 4
  { key: 'onlyOT',            label: 'Only OT',                                  kind: 'ot',         groupBy: null,          showOT: true  }, // 5
  { key: 'groupWise',         label: 'Muster Group Wise',                        kind: 'muster',     groupBy: 'empGroup',    showOT: false }, // 6
  { key: 'deptWise',          label: 'Muster Department Wise',                   kind: 'muster',     groupBy: 'department',  showOT: false }, // 7
  { key: 'employeeSummary',   label: 'Employee Wise Summary',                    kind: 'summary',    groupBy: null,          showOT: false }, // 8
  { key: 'engagementDept',    label: 'Employee Engagement Department Wise',      kind: 'engagement', groupBy: 'department',  showOT: false }, // 9
  { key: 'engagementGroup',   label: 'Employee Engagement Group Wise',           kind: 'engagement', groupBy: 'empGroup',    showOT: false }, // 10
  { key: 'engagementType',    label: 'Employee Engagement Type Wise',            kind: 'engagement', groupBy: 'empCategory', showOT: false }, // 11
];

function pickReport(query) {
  const raw = query.reportBy ?? query.ReportBy ?? query.groupBy ?? '0';
  const idx = toInt(raw);
  if (String(raw).trim() !== '' && idx >= 0 && idx < REPORTS.length && /^\d+$/.test(String(raw).trim())) {
    return REPORTS[idx];
  }
  return REPORTS.find((r) => r.key === String(raw).trim()) || REPORTS[0];
}

// Group dimension -> { code column, name resolver }.
const GROUP_DIMS = {
  department: { col: 'DepartmentCode', label: (r) => str(r, 'DepartmentName') || str(r, 'DepartmentName_English') || '(No Department)' },
  agent:      { col: 'AgentCode',      label: (r) => str(r, 'AgentName') || '(No Agent)' },
  empGroup:   { col: 'EmpGroupCode',   label: (r) => str(r, 'EmpGroupName') || '(No Group)' },
  empCategory:{ col: 'EmpCategoryCode',label: (r) => str(r, 'EmpCategoryName') || str(r, 'CategoryName') || '(No Category)' },
};

// ---------------------------------------------------------------------------
// In-memory filter chain — mirrors the VB DataTable.Select() stack in exact
// order. Each filter applies only when its param is present AND the recordset
// exposes the column (so it no-ops rather than wiping rows).
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
  ['GradeCode', 'GradeCode'],
  ['EmployeeBatchCode', 'EmployeeBatchCode'],
];

function applyMusterFilters(rows, query) {
  if (!Array.isArray(rows) || rows.length === 0) return rows || [];
  const sample = rows[0];
  const active = [];
  for (const [param, col] of ROW_FILTERS) {
    const set = codeSet(query[param]);
    if (!set) continue;
    if (!Object.prototype.hasOwnProperty.call(sample, col)) continue;
    active.push({ col, set });
  }
  let out = active.length
    ? rows.filter((r) => active.every(({ col, set }) => set.has(String(r[col]))))
    : rows;

  // PF / Non PF — VB: idx 1 => PF > 0, idx 2 => PF <= 0.
  const pf = String(query.pfNonPf || query.PFNonPF || '').toUpperCase().replace(/\s+/g, '');
  if (pf === 'PF') out = out.filter((r) => dec(r, 'PF') > 0);
  else if (pf === 'NONPF' || pf === 'NON_PF') out = out.filter((r) => dec(r, 'PF') <= 0);
  return out;
}

// ---------------------------------------------------------------------------
// Day slots — the calendar-day columns to render. From the title row, a slot n
// (1..31) is shown when its value > 0, headed by that value (the day number).
// Falls back to any day that carries a mark on a data row when the title SP
// returns nothing (keeps the grid usable rather than blank).
// ---------------------------------------------------------------------------
function resolveDaySlots(titleRow, rows) {
  const slots = [];
  if (titleRow) {
    for (let n = 1; n <= 31; n++) {
      const v = Number(titleRow[String(n)]);
      if (Number.isFinite(v) && v > 0) slots.push({ n, day: v });
    }
    if (slots.length) return slots;
  }
  // Fallback: a day column is shown if any employee has a non-empty mark there.
  for (let n = 1; n <= 31; n++) {
    const key = String(n);
    if (rows.some((r) => String(r[key] ?? '').trim() !== '')) slots.push({ n, day: n });
  }
  return slots;
}

// A day mark with the half-day "/" stripped (RDLC: Replace(IDn,"/","")).
const dayMark = (r, n) => String(r[String(n)] ?? '').replace(/\//g, '').trim();
// Half-day flag — RDLC: Right(Rtrim(IDn),1) = "/".
const isHalfDay = (r, n) => String(r[String(n)] ?? '').trimEnd().endsWith('/');
// Per-day OT hours (columns "1OT".."31OT").
const dayOT = (r, n) => dec(r, `${n}OT`);
const HALF_DAY_FILL = '#C0C0C0'; // "Silver" in the .rdlc

// Format an OT hours value the way the .rdlc does: iif(OTHrs>0, format(#0), "").
const otText = (v) => (v > 0 ? String(Math.round(v)) : '');

// ---------------------------------------------------------------------------
// Muster grid (indices 0,1,2,3,4,6,7). Optional grouping + optional OT total
// column. Columns: S.No | ID | Employee Name | D.O.J | <day cols> | Days | [OT] | ND
// `otRow` (rptMusterWithOT*) emits a second per-day OT line under each employee.
// ---------------------------------------------------------------------------
function buildMusterGrid(rows, slots, { groupBy, showOT, otRow = false }) {
  const dayW = slots.length > 24 ? 15 : slots.length > 16 ? 17 : 20;
  const leadWidths = [22, 40, '*', 52];
  const tailWidths = [26, ...(showOT ? [30] : []), 24];
  const widths = [...leadWidths, ...slots.map(() => dayW), ...tailWidths];
  const span = widths.length;

  const H = (t, extra = {}) => ({ text: t, ...headStyle, fontSize: 6.8, ...extra });
  const header = [
    H('S.No'), H('ID'), H('Employee Name', { alignment: 'left' }), H('D.O.J'),
    ...slots.map((s) => H(String(s.day))),
    H('Days'), ...(showOT ? [H('OT')] : []), H('ND'),
  ];
  const body = [header];

  const dim = groupBy ? GROUP_DIMS[groupBy] : null;

  const emitRow = (r, sno) => {
    const zebra = sno % 2 === 0 ? colors.zebraFill : null;
    const c = (t, align = 'center', extra = {}) => ({ text: t, alignment: align, fontSize: 6.8, fillColor: zebra, ...extra });
    const dayCells = slots.map((s) => ({
      text: dayMark(r, s.n),
      alignment: 'center',
      fontSize: 6.8,
      fillColor: isHalfDay(r, s.n) ? HALF_DAY_FILL : zebra,
    }));
    return [
      c(String(sno)),
      c(str(r, 'EmployeeID')),
      c(str(r, 'EmployeeName'), 'left'),
      c(r.DateOfJoining ? ddmmyyyy(r.DateOfJoining) : ''),
      ...dayCells,
      c(str(r, 'WDays')),
      ...(showOT ? [c(otText(dec(r, 'OTHrs')))] : []),
      c(dec(r, 'NightShiftDays') > 0 ? str(r, 'NightShiftDays') : ''),
    ];
  };

  // Second line per employee — per-day OT hours (rptMusterWithOT* layouts).
  const emitOtRow = (r, sno) => {
    const zebra = sno % 2 === 0 ? colors.zebraFill : null;
    const c = (t, align = 'center', extra = {}) => ({ text: t, alignment: align, fontSize: 6.3, fillColor: zebra, color: '#6b7280', ...extra });
    return [
      c(''), c(''), c('OT', 'left', { italics: true }), c(''),
      ...slots.map((s) => c(otText(dayOT(r, s.n)))),
      c(''), ...(showOT ? [c('')] : []), c(''),
    ];
  };

  const blanks = (n) => Array(n).fill({});
  const groupTotalRow = (label, grp) => {
    const days = grp.reduce((a, r) => a + dec(r, 'WDays'), 0);
    const ot = grp.reduce((a, r) => a + dec(r, 'OTHrs'), 0);
    const nd = grp.reduce((a, r) => a + dec(r, 'NightShiftDays'), 0);
    const base = { bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 6.8 };
    const leadSpan = 4 + slots.length; // through the last day column
    return [
      { text: `${label}  (${grp.length})`, colSpan: leadSpan, alignment: 'right', ...base },
      ...blanks(leadSpan - 1),
      { text: String(days), alignment: 'center', ...base },
      ...(showOT ? [{ text: otText(ot), alignment: 'center', ...base }] : []),
      { text: nd > 0 ? String(nd) : '', alignment: 'center', ...base },
    ];
  };

  let serial = 0;
  if (dim) {
    const groups = new Map();
    for (const r of rows) {
      const k = String(r[dim.col] ?? '');
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    }
    const ordered = [...groups.values()].sort((a, b) =>
      String(dim.label(a[0])).localeCompare(String(dim.label(b[0]))));
    for (const grp of ordered) {
      const label = dim.label(grp[0]);
      body.push([
        { text: label, colSpan: span, bold: true, fillColor: colors.groupFill, color: colors.groupText, fontSize: 7.5, alignment: 'left' },
        ...blanks(span - 1),
      ]);
      grp.sort((a, b) => String(a.EmployeeID ?? '').localeCompare(String(b.EmployeeID ?? ''), undefined, { numeric: true }));
      for (const r of grp) {
        body.push(emitRow(r, ++serial));
        if (otRow) body.push(emitOtRow(r, serial));
      }
      body.push(groupTotalRow(`${label} — Total`, grp));
    }
  } else {
    rows
      .slice()
      .sort((a, b) => String(a.EmployeeID ?? '').localeCompare(String(b.EmployeeID ?? ''), undefined, { numeric: true }))
      .forEach((r) => {
        body.push(emitRow(r, ++serial));
        if (otRow) body.push(emitOtRow(r, serial));
      });
  }

  // Legend for the half-day shade so the silver cells read correctly.
  const legend = { text: 'Shaded cell = half day (½). Blank day cell = absent / off. X = present.', fontSize: 7, italics: true, color: '#64748b', margin: [0, 6, 0, 0] };
  return [
    { table: { headerRows: 1, widths, body }, layout: tableLayout() },
    legend,
  ];
}

// ---------------------------------------------------------------------------
// Only OT (index 5). Per-day OT hours + a total OT column, employee-id wise.
// ---------------------------------------------------------------------------
function buildOnlyOT(rows, slots) {
  const dayW = slots.length > 24 ? 15 : slots.length > 16 ? 17 : 20;
  const widths = [22, 40, '*', ...slots.map(() => dayW), 34];
  const H = (t, extra = {}) => ({ text: t, ...headStyle, fontSize: 6.8, ...extra });
  const header = [H('S.No'), H('ID'), H('Employee Name', { alignment: 'left' }), ...slots.map((s) => H(String(s.day))), H('Total OT')];
  const body = [header];

  let serial = 0;
  const sorted = rows.slice().sort((a, b) =>
    String(a.EmployeeID ?? '').localeCompare(String(b.EmployeeID ?? ''), undefined, { numeric: true }));
  let grand = 0;
  for (const r of sorted) {
    serial += 1;
    const zebra = serial % 2 === 0 ? colors.zebraFill : null;
    const c = (t, align = 'center', extra = {}) => ({ text: t, alignment: align, fontSize: 6.8, fillColor: zebra, ...extra });
    const tot = dec(r, 'OTHrs');
    grand += tot;
    body.push([
      c(String(serial)), c(str(r, 'EmployeeID')), c(str(r, 'EmployeeName'), 'left'),
      ...slots.map((s) => c(otText(dayOT(r, s.n)))),
      c(otText(tot), 'center', { bold: true }),
    ]);
  }
  const g = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 7 };
  const leadSpan = 3 + slots.length;
  body.push([
    { text: 'Grand Total', colSpan: leadSpan, alignment: 'right', ...g },
    ...Array(leadSpan - 1).fill({}),
    { text: otText(grand), alignment: 'center', ...g },
  ]);
  return [{ table: { headerRows: 1, widths, body }, layout: tableLayout() }];
}

// ---------------------------------------------------------------------------
// Employee Wise Summary (index 8). Per-employee totals, no day grid.
// ---------------------------------------------------------------------------
function buildSummary(rows) {
  const widths = [22, 44, '*', 52, 90, 90, 34, 34, 34, 34, 36, 34, 30, 24];
  const H = (t, extra = {}) => ({ text: t, ...headStyle, fontSize: 6.8, ...extra });
  const header = [
    H('S.No'), H('ID'), H('Employee Name', { alignment: 'left' }), H('D.O.J'),
    H('Department', { alignment: 'left' }), H('Designation', { alignment: 'left' }),
    H('Pre'), H('Abs'), H('Leave'), H('S.Lv'), H('Holi'), H('W.Off'), H('OT'), H('ND'),
  ];
  const body = [header];

  const T = { pre: 0, abs: 0, leave: 0, sleave: 0, holi: 0, woff: 0, ot: 0, nd: 0 };
  rows
    .slice()
    .sort((a, b) => String(a.EmployeeID ?? '').localeCompare(String(b.EmployeeID ?? ''), undefined, { numeric: true }))
    .forEach((r, i) => {
      const zebra = i % 2 === 1 ? colors.zebraFill : null;
      const c = (t, align = 'center', extra = {}) => ({ text: t, alignment: align, fontSize: 6.8, fillColor: zebra, ...extra });
      const pre = dec(r, 'TotalPre') || dec(r, 'WDays');
      T.pre += pre; T.abs += dec(r, 'TotalAbs'); T.leave += dec(r, 'TotalLeave');
      T.sleave += dec(r, 'TotalSLeave'); T.holi += dec(r, 'TotalHolidays');
      T.woff += dec(r, 'TotalWeeklyOff'); T.ot += dec(r, 'OTHrs'); T.nd += dec(r, 'NightShiftDays');
      body.push([
        c(String(i + 1)), c(str(r, 'EmployeeID')), c(str(r, 'EmployeeName'), 'left'),
        c(r.DateOfJoining ? ddmmyyyy(r.DateOfJoining) : ''),
        c(str(r, 'DepartmentName') || str(r, 'DepartmentName_English'), 'left'),
        c(str(r, 'DesignationName'), 'left'),
        c(String(pre)), c(str(r, 'TotalAbs')), c(str(r, 'TotalLeave')), c(str(r, 'TotalSLeave')),
        c(str(r, 'TotalHolidays')), c(str(r, 'TotalWeeklyOff')), c(otText(dec(r, 'OTHrs'))),
        c(dec(r, 'NightShiftDays') > 0 ? str(r, 'NightShiftDays') : ''),
      ]);
    });

  const g = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 7 };
  body.push([
    { text: 'Grand Total', colSpan: 6, alignment: 'right', ...g }, {}, {}, {}, {}, {},
    { text: String(Math.round(T.pre)), alignment: 'center', ...g },
    { text: String(Math.round(T.abs)), alignment: 'center', ...g },
    { text: String(Math.round(T.leave)), alignment: 'center', ...g },
    { text: String(Math.round(T.sleave)), alignment: 'center', ...g },
    { text: String(Math.round(T.holi)), alignment: 'center', ...g },
    { text: String(Math.round(T.woff)), alignment: 'center', ...g },
    { text: otText(T.ot), alignment: 'center', ...g },
    { text: String(Math.round(T.nd)), alignment: 'center', ...g },
  ]);
  return [{ table: { headerRows: 1, widths, body }, layout: tableLayout() }];
}

// ---------------------------------------------------------------------------
// Employee Engagement abstract (indices 9,10,11) — grouped head-count + man-day
// engagement by Department / Group / Category. (The desktop's engagement .rdlc
// were not shipped with the report folder, so this renders the equivalent
// grouped abstract from the muster totals.)
// ---------------------------------------------------------------------------
function buildEngagement(rows, groupBy) {
  const dim = GROUP_DIMS[groupBy] || GROUP_DIMS.department;
  const widths = [24, '*', 60, 70, 70, 70, 60];
  const H = (t, extra = {}) => ({ text: t, ...headStyle, fontSize: 7.5, ...extra });
  const header = [H('S.No'), H(dimHeader(groupBy), { alignment: 'left' }), H('No. Of Emp'), H('Present Days'), H('Absent Days'), H('Leave Days'), H('OT Hrs')];
  const body = [header];

  const groups = new Map();
  for (const r of rows) {
    const k = String(r[dim.col] ?? '');
    if (!groups.has(k)) groups.set(k, { label: dim.label(r), emp: 0, pre: 0, abs: 0, leave: 0, ot: 0 });
    const a = groups.get(k);
    a.emp += 1;
    a.pre += dec(r, 'TotalPre') || dec(r, 'WDays');
    a.abs += dec(r, 'TotalAbs');
    a.leave += dec(r, 'TotalLeave');
    a.ot += dec(r, 'OTHrs');
  }
  const list = [...groups.values()].sort((a, b) => String(a.label).localeCompare(String(b.label)));

  const T = { emp: 0, pre: 0, abs: 0, leave: 0, ot: 0 };
  list.forEach((a, i) => {
    const zebra = i % 2 === 1 ? colors.zebraFill : null;
    const c = (t, align = 'center', extra = {}) => ({ text: t, alignment: align, fontSize: 7.5, fillColor: zebra, ...extra });
    T.emp += a.emp; T.pre += a.pre; T.abs += a.abs; T.leave += a.leave; T.ot += a.ot;
    body.push([
      c(String(i + 1)), c(a.label, 'left'), c(String(a.emp)),
      c(String(Math.round(a.pre))), c(String(Math.round(a.abs))),
      c(String(Math.round(a.leave))), c(otText(a.ot)),
    ]);
  });
  const g = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 8 };
  body.push([
    { text: 'Total', colSpan: 2, alignment: 'right', ...g }, {},
    { text: String(T.emp), alignment: 'center', ...g },
    { text: String(Math.round(T.pre)), alignment: 'center', ...g },
    { text: String(Math.round(T.abs)), alignment: 'center', ...g },
    { text: String(Math.round(T.leave)), alignment: 'center', ...g },
    { text: otText(T.ot), alignment: 'center', ...g },
  ]);
  return [{ table: { headerRows: 1, widths, body }, layout: tableLayout() }];
}

const dimHeader = (groupBy) =>
  groupBy === 'agent' ? 'Agent'
    : groupBy === 'empGroup' ? 'Group'
    : groupBy === 'empCategory' ? 'Category'
    : 'Department';

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------
export const musterReport = async (req, res) => {
  const t0 = Date.now();
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type('text/plain').send('Missing subDBName header');

    const debug = req.query.debug === '1';
    const report = pickReport(req.query);

    const companyCode = toInt(req.query.CompanyCode || req.query.companyCode || req.headers.companycode);
    const payTypeCode = toInt(req.query.PayTypeCode || req.query.payTypeCode);
    const payPeriodCode = toInt(req.query.PayperiodCode || req.query.PayPeriodCode || req.query.payPeriodCode);

    // Validation order + messages mirror btnView_Click.
    if (companyCode <= 0) return res.status(400).type('text/plain').send('Select the Company Name');
    if (payTypeCode <= 0) return res.status(400).type('text/plain').send('Select the Pay Type...');
    if (payPeriodCode <= 0) return res.status(400).type('text/plain').send('Select the Pay Period...');

    const payMode = String(req.query.PayMode || req.query.payMode || '').trim();
    const payModeActive = payMode && payMode.toUpperCase() !== '--ALL--' && payMode.toUpperCase() !== 'ALL';
    const onlyPresent = req.query.onlyPresent === '1' || req.query.onlyPresent === 'true' || req.query.OnlyPresent === '1';

    const pool = await getPool(subDbName);

    // 1. sp_Muster (VB parameter set).
    const musterReq = pool.request();
    musterReq.timeout = 300000;
    if (companyCode > 0) musterReq.input('CompanyCode', sql.Int, companyCode);
    musterReq.input('PayperiodCode', sql.Int, payPeriodCode);
    musterReq.input('PayTypeCode', sql.Int, payTypeCode);
    musterReq.input('Emp_Status', sql.Int, 1);
    if (payModeActive) musterReq.input('PayMode', sql.VarChar(50), payMode);
    if (onlyPresent) musterReq.input('OnlyPresent', sql.Int, 1);
    const musterResult = await musterReq.execute('sp_Muster');
    const rows = applyMusterFilters(musterResult.recordset || [], req.query);

    // 3. sp_Muster_Title (day-number header row).
    let titleRow = null;
    try {
      const titleReq = pool.request();
      titleReq.input('PayperiodCode', sql.Int, payPeriodCode);
      const titleResult = await titleReq.execute('sp_Muster_Title');
      titleRow = (titleResult.recordset || [])[0] || null;
    } catch (e) {
      console.error('sp_Muster_Title failed:', e.message);
    }

    const company = await getCompanyInfo(pool, companyCode);
    const slots = resolveDaySlots(titleRow, rows);

    // Period line for the header — from the first row's PayPeriodFrom/To.
    const first = rows[0] || {};
    const fromDate = first.PayPeriodFrom || null;
    const toDate = first.PayPeriodTo || null;

    let tables;
    if (rows.length === 0) {
      tables = [{ text: 'No muster data found for the selected pay period / filters.', italics: true, alignment: 'center', margin: [0, 24, 0, 0] }];
    } else if (report.kind === 'ot') {
      tables = buildOnlyOT(rows, slots);
    } else if (report.kind === 'summary') {
      tables = buildSummary(rows);
    } else if (report.kind === 'engagement') {
      tables = buildEngagement(rows, report.groupBy);
    } else {
      tables = buildMusterGrid(rows, slots, { groupBy: report.groupBy, showOT: report.showOT });
    }

    const docDef = buildEmployeePage({
      companyName: company.name,
      companyLogo: company.logo,
      title: `Muster Report - ${report.label}`,
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
          `SP:           sp_Muster (+ sp_Muster_Title)`,
          `reportBy:     ${report.key} — ${report.label}`,
          `subDBName:    ${subDbName}`,
          `server:       ${dbCfg.server}${dbCfg.port ? ':' + dbCfg.port : ''}`,
          `database:     ${dbCfg.database}`,
          `company:      ${company.name || '(none)'} (${companyCode})`,
          `PayTypeCode:  ${payTypeCode}`,
          `PayperiodCode:${payPeriodCode}`,
          `PayMode:      ${payModeActive ? payMode : '(all)'}`,
          `OnlyPresent:  ${onlyPresent ? 1 : 0}`,
          `daySlots:     ${slots.map((s) => s.day).join(',') || '(none)'}`,
          `rows:         ${rows.length}`,
          `Total:        ${Date.now() - t0} ms (${pdfBuffer.length} pdf bytes)`,
          sample ? `\nfirst rows:\n${sample}` : '',
        ].join('\n')
      );
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="MusterReport_${report.key}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
};

// ---------------------------------------------------------------------------
// Filter-rail lookup lists (rptMuster.vb Bind_Data). One call returns every
// dropdown the screen needs. Company-scoped lists (Employee, Pay Period) use the
// selected CompanyCode; the rest are global masters. A single failing list
// yields [] so the screen still opens. Shape { value, label } feeds <Select>
// directly; Pay Periods also carry PayTypeCode + From/To so the screen can
// narrow them to the chosen Pay Type (VB cmbPayType_SelectedIndexChanged).
// ---------------------------------------------------------------------------
export const musterReportOptions = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).json({ success: false, error: 'Missing subDBName header' });

    const companyCode = toInt(req.query.CompanyCode || req.query.companyCode || req.headers.companycode);
    const pool = await getPool(subDbName);

    const q = (text) =>
      pool.request().query(text)
        .then((r) => r.recordset || [])
        .catch((e) => { console.error('musterReportOptions query failed:', e.message); return []; });
    const map = (rows, codeKey, nameKey) => rows.map((r) => ({ value: r[codeKey], label: r[nameKey] }));

    const [
      companies, payTypes, payPeriods, empGroups, categories,
      departments, designations, employees, agents, grades, batches,
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
      q(`SELECT GradeCode, GradeName FROM tbl_Grade ORDER BY GradeName`),
      q(`SELECT EmployeeBatchCode, EmployeeBatchName FROM tbl_EmployeeBatch ORDER BY EmployeeBatchName`),
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
        grades: map(grades, 'GradeCode', 'GradeName'),
        batches: map(batches, 'EmployeeBatchCode', 'EmployeeBatchName'),
        // Static combos (rptMuster.Designer.vb) — sent so the screen doesn't hardcode.
        payModes: [
          { value: '', label: '--ALL--' },
          { value: 'HOUR', label: 'HOUR' },
          { value: 'DAY', label: 'DAY' },
          { value: 'MONTH', label: 'MONTH' },
        ],
        pfNonPf: [
          { value: '', label: 'ALL' },
          { value: 'PF', label: 'PF' },
          { value: 'NONPF', label: 'NON PF' },
        ],
        reportBy: REPORTS.map((r, i) => ({ value: i, label: r.label, key: r.key })),
      },
    });
  } catch (err) {
    console.error('DB Error (musterReportOptions):', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

// =============================================================================
// Payroll ▸ Reports ▸ Muster ▸ Muster Report ALL  (form: rptMusterAll)
// =============================================================================
// Port of the WinForms rptMusterAll "Muster Over All Report" screen
// (btnView_Click). Unlike Muster Report this is DATE-RANGE driven (not a Pay
// Period) and REGENERATES first:
//
//   1. sp_Muster_Generate_All  @FromDate @ToDate @CompanyCode   (rebuild, 600s)
//   2. sp_Muster_All           @PayTypeCode @CompanyCode(>0) @PayMode(<>--ALL--)
//   3. In-memory filters: Department, Designation, Employee, Agent, EmpCategory,
//      EmpGroup, Batch, then PF / Non PF  (VB order; NO Grade, NO Emp_Status).
//   4. sp_Muster_Title_All     @CompanyCode(>0)   -> day-number header row.
//   5. sp_Company_GetAll       -> page header.
//
// "Report By" has 4 layouts here (cmbReportBy): Only Muster / Muster With OT /
// Muster Group Wise / Muster Department Wise. "With OT" prints a per-day OT line
// under each employee (rptMusterWithOTEmployeeIDWiseAll.rdlc).
//
//   GET /payroll/reports/muster-all
//     ?CompanyCode &PayTypeCode        (both required, VB validation)
//     &FromDate &ToDate                (date range; feeds sp_Muster_Generate_All)
//     &reportBy=0..3   &PayMode=HOUR|DAY|MONTH   &pfNonPf=PF|NONPF
//     &DepartmentCode &DesignationCode &EmployeeCode &AgentCode
//     &EmpCategoryCode &EmpGroupCode &EmployeeBatchCode   (code lists)
//     &skipGenerate=1  (skip step 1 when the data is already generated)
//     &debug=1
// =============================================================================
const REPORTS_ALL = [
  { key: 'onlyMuster', label: 'Only Muster',            kind: 'muster', groupBy: null,        showOT: false, otRow: false }, // 0
  { key: 'withOT',     label: 'Muster With OT',          kind: 'muster', groupBy: null,        showOT: true,  otRow: true  }, // 1
  { key: 'groupWise',  label: 'Muster Group Wise',       kind: 'muster', groupBy: 'empGroup',  showOT: false, otRow: false }, // 2
  { key: 'deptWise',   label: 'Muster Department Wise',  kind: 'muster', groupBy: 'department', showOT: false, otRow: false }, // 3
];

function pickReportAll(query) {
  const raw = query.reportBy ?? query.ReportBy ?? '0';
  const idx = toInt(raw);
  if (/^\d+$/.test(String(raw).trim()) && idx >= 0 && idx < REPORTS_ALL.length) return REPORTS_ALL[idx];
  return REPORTS_ALL.find((r) => r.key === String(raw).trim()) || REPORTS_ALL[0];
}

export const musterAllReport = async (req, res) => {
  const t0 = Date.now();
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type('text/plain').send('Missing subDBName header');

    const debug = req.query.debug === '1';
    const report = pickReportAll(req.query);

    const companyCode = toInt(req.query.CompanyCode || req.query.companyCode || req.headers.companycode);
    const payTypeCode = toInt(req.query.PayTypeCode || req.query.payTypeCode);
    // Validation order + messages mirror btnView_Click.
    if (companyCode <= 0) return res.status(400).type('text/plain').send('Select the Company Name');
    if (payTypeCode <= 0) return res.status(400).type('text/plain').send('Select the Pay Type...');

    const today = new Date().toISOString().slice(0, 10);
    const fromDate = ymd(req.query.FromDate || req.query.fromDate) || today;
    const toDate = ymd(req.query.ToDate || req.query.toDate) || today;
    const payMode = String(req.query.PayMode || req.query.payMode || '').trim();
    const payModeActive = payMode && payMode.toUpperCase() !== '--ALL--' && payMode.toUpperCase() !== 'ALL';
    const skipGenerate = req.query.skipGenerate === '1' || req.query.skipGenerate === 'true';

    const pool = await getPool(subDbName);

    // 1. Regenerate the muster-all data for the range (btnView runs this first).
    let generateError = null;
    if (!skipGenerate) {
      try {
        const genReq = pool.request();
        genReq.timeout = 600000; // desktop CommandTimeout = 600
        await genReq
          .input('FromDate', sql.VarChar(10), fromDate)
          .input('ToDate', sql.VarChar(10), toDate)
          .input('CompanyCode', sql.Int, companyCode)
          .execute('sp_Muster_Generate_All');
      } catch (e) {
        generateError = e.message;
        console.error('sp_Muster_Generate_All failed:', e.message);
      }
    }

    // 2. sp_Muster_All (VB parameter set).
    const spReq = pool.request();
    spReq.timeout = 300000;
    spReq.input('PayTypeCode', sql.Int, payTypeCode);
    if (companyCode > 0) spReq.input('CompanyCode', sql.Int, companyCode);
    if (payModeActive) spReq.input('PayMode', sql.VarChar(50), payMode);
    const spResult = await spReq.execute('sp_Muster_All');
    const rows = applyMusterFilters(spResult.recordset || [], req.query);

    // 4. sp_Muster_Title_All (day-number header row).
    let titleRow = null;
    try {
      const titleReq = pool.request();
      if (companyCode > 0) titleReq.input('CompanyCode', sql.Int, companyCode);
      const titleResult = await titleReq.execute('sp_Muster_Title_All');
      titleRow = (titleResult.recordset || [])[0] || null;
    } catch (e) {
      console.error('sp_Muster_Title_All failed:', e.message);
    }

    const company = await getCompanyInfo(pool, companyCode);
    const slots = resolveDaySlots(titleRow, rows);

    let tables;
    if (rows.length === 0) {
      tables = [{ text: 'No muster data found for the selected date range / filters.', italics: true, alignment: 'center', margin: [0, 24, 0, 0] }];
    } else {
      tables = buildMusterGrid(rows, slots, { groupBy: report.groupBy, showOT: report.showOT, otRow: report.otRow });
    }

    const docDef = buildEmployeePage({
      companyName: company.name,
      companyLogo: company.logo,
      title: `Muster All Details - ${report.label}`,
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
          `SP:           sp_Muster_Generate_All + sp_Muster_All (+ sp_Muster_Title_All)`,
          `reportBy:     ${report.key} — ${report.label}`,
          `subDBName:    ${subDbName}`,
          `server:       ${dbCfg.server}${dbCfg.port ? ':' + dbCfg.port : ''}`,
          `database:     ${dbCfg.database}`,
          `company:      ${company.name || '(none)'} (${companyCode})`,
          `PayTypeCode:  ${payTypeCode}`,
          `FromDate:     ${fromDate}`,
          `ToDate:       ${toDate}`,
          `PayMode:      ${payModeActive ? payMode : '(all)'}`,
          `generate:     ${skipGenerate ? '(skipped)' : (generateError ? 'ERR: ' + generateError : 'ok')}`,
          `daySlots:     ${slots.map((s) => s.day).join(',') || '(none)'}`,
          `rows:         ${rows.length}`,
          `Total:        ${Date.now() - t0} ms (${pdfBuffer.length} pdf bytes)`,
          sample ? `\nfirst rows:\n${sample}` : '',
        ].join('\n')
      );
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="MusterReportAll_${report.key}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
};

// Filter-rail lookup lists for the Muster Report ALL screen (rptMusterAll.vb
// Bind_Data). Same shape as musterReportOptions but WITHOUT Grade / Pay Period
// (the screen has neither) and with the 4-entry Report By list.
export const musterAllReportOptions = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).json({ success: false, error: 'Missing subDBName header' });

    const companyCode = toInt(req.query.CompanyCode || req.query.companyCode || req.headers.companycode);
    const pool = await getPool(subDbName);

    const q = (text) =>
      pool.request().query(text)
        .then((r) => r.recordset || [])
        .catch((e) => { console.error('musterAllReportOptions query failed:', e.message); return []; });
    const map = (rows, codeKey, nameKey) => rows.map((r) => ({ value: r[codeKey], label: r[nameKey] }));

    const [
      companies, payTypes, empGroups, categories,
      departments, designations, employees, agents, batches,
    ] = await Promise.all([
      q(`SELECT CompanyCode, CompanyName FROM tbl_Company ORDER BY CompanyName`),
      q(`SELECT PayTypeCode, PayTypeName FROM tbl_PayType ORDER BY PayTypeName`),
      q(`SELECT EmpGroupCode, EmpGroupName FROM tbl_EmpGroup WHERE Status = 1 ORDER BY EmpGroupName`),
      q(`SELECT EmpCategoryCode, EmpCategoryName FROM tbl_EmpCategory ORDER BY EmpCategoryName`),
      q(`SELECT DepartmentCode, DepartmentName_English FROM tbl_Department WHERE HR = 1 ORDER BY DepartmentName`),
      q(`SELECT DesignationCode, DesignationName FROM tbl_Designation ORDER BY DesignationName`),
      q(`SELECT EmployeeCode, str_EmployeeID FROM vw_Employee_New WHERE CompanyCode = ${companyCode} ORDER BY EmployeeID`),
      q(`SELECT AgentCode, AgentName FROM tbl_Agent WHERE HR = 1 ORDER BY AgentName`),
      q(`SELECT EmployeeBatchCode, EmployeeBatchName FROM tbl_EmployeeBatch ORDER BY EmployeeBatchName`),
    ]);

    return res.json({
      success: true,
      data: {
        companies: map(companies, 'CompanyCode', 'CompanyName'),
        payTypes: map(payTypes, 'PayTypeCode', 'PayTypeName'),
        empGroups: map(empGroups, 'EmpGroupCode', 'EmpGroupName'),
        categories: map(categories, 'EmpCategoryCode', 'EmpCategoryName'),
        departments: map(departments, 'DepartmentCode', 'DepartmentName_English'),
        designations: map(designations, 'DesignationCode', 'DesignationName'),
        employees: map(employees, 'EmployeeCode', 'str_EmployeeID'),
        agents: map(agents, 'AgentCode', 'AgentName'),
        batches: map(batches, 'EmployeeBatchCode', 'EmployeeBatchName'),
        payModes: [
          { value: '', label: '--ALL--' },
          { value: 'HOUR', label: 'HOUR' },
          { value: 'DAY', label: 'DAY' },
          { value: 'MONTH', label: 'MONTH' },
        ],
        pfNonPf: [
          { value: '', label: 'ALL' },
          { value: 'PF', label: 'PF' },
          { value: 'NONPF', label: 'NON PF' },
        ],
        reportBy: REPORTS_ALL.map((r, i) => ({ value: i, label: r.label, key: r.key })),
      },
    });
  } catch (err) {
    console.error('DB Error (musterAllReportOptions):', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
