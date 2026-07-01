// =============================================================================
// Payroll ▸ Reports ▸ Strength Report  (form: rptStrengthAbstract)
// =============================================================================
// Port of the WinForms rptStrengthAbstract screen. The report-type radios pick
// the SP + layout; the Details checkbox forces the per-employee detail layout:
//
//   Department Wise → sp_Strength   Department × shift man-day abstract   (.rdlc)
//   Agent Wise      → sp_Strength   Agent × shift man-day abstract
//   Designation Wise→ sp_Strength   Department → Designation abstract
//   Grade Wise      → sp_GradeWise_Strength  Department grade requirement vs avail
//   Details (chk)   → sp_Strength   Department → Shift → employee In/Out list
//
//   GET /payroll/reports/strength/abstract
//     ?groupBy=departmentWise|agentWise|designationWise|gradeWise  (default departmentWise)
//     &details=1                     // force the With-Details layout
//     &CompanyCode &FromDate &ToDate
//     &EmpCategoryCode &DepartmentCode &AgentCode &EmpGroupCode &DesignationCode
//
// SP inputs mirror rptStrengthAbstract.vb: sp_Strength(@STDate,@ToDate,@CompanyCode?),
// sp_GradeWise_Strength(@FromDate,@ToDate,@CompanyCode?).

import sql from 'mssql';
import { getPool } from '../../../config/dynamicDB.js';
import { renderPdf, getCompanyInfo } from '../cotton/_common.js';
import { buildEmployeePage, tableLayout, colors, headStyle, str, dec, ddmmyyyy, hhmm } from './_common.js';

// ---------------------------------------------------------------------------
// Number formatters — "-" when zero (mirrors the .rdlc iif(>0,…,"-")).
// ---------------------------------------------------------------------------
const n1 = (v) => (v > 0 ? Number(v).toFixed(1) : '-');
const n0 = (v) => (v > 0 ? String(Math.round(v)) : '-');
const n3 = (v) => (v > 0 ? Number(v).toFixed(3) : '-');

// ---------------------------------------------------------------------------
// In-memory filter rail (rptStrengthAbstract.vb DataTable.Select chain). Applied
// only when the column is present on the recordset (the grade SP omits several).
// ---------------------------------------------------------------------------
const codeSet = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const s = new Set(String(v).split(',').map((x) => x.trim()).filter(Boolean));
  return s.size ? s : null;
};

const ROW_FILTERS = [
  ['EmpCategoryCode', 'EmpCategoryCode'],
  ['DepartmentCode', 'DepartmentCode'],
  ['AgentCode', 'AgentCode'],
  ['EmpGroupCode', 'EmpGroupCode'],
  ['DesignationCode', 'DesignationCode']
];

function applyStrengthFilters(rows, query) {
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
// Shift man-day abstract (Department Wise / Agent Wise / per-department rows in
// Designation Wise). Aggregates sp_Strength detail rows per entity.
// Columns: General / Day / Half Night / Full Night (each Shift + OT), Present
// (Shift + OT), STD, Total Persons — a 3-row grouped header.
// ---------------------------------------------------------------------------
const SHIFT_WIDTHS = [22, '*', 34, 30, 34, 30, 34, 30, 34, 30, 40, 32, 34, 46];

function aggregateShift(rows, keyFn, labelFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (k === null || k === undefined || k === '') continue;
    if (!map.has(k)) {
      map.set(k, {
        label: labelFn(r), std: dec(r, 'STDManPower'),
        gen: 0, genOT: 0, i: 0, iOT: 0, ii: 0, iiOT: 0, iii: 0, iiiOT: 0, day: 0, night: 0
      });
    }
    const a = map.get(k);
    a.gen += dec(r, 'GeneralShift'); a.genOT += dec(r, 'GeneralShift_OT');
    a.i += dec(r, 'IShift'); a.iOT += dec(r, 'IShift_OT');
    a.ii += dec(r, 'IIShift'); a.iiOT += dec(r, 'IIShift_OT');
    a.iii += dec(r, 'IIIShift'); a.iiiOT += dec(r, 'IIIShift_OT');
    a.day += dec(r, 'DayShift'); a.night += dec(r, 'NightShift');
  }
  return [...map.values()].sort((a, b) => String(a.label).localeCompare(String(b.label)));
}

const H = (text, extra = {}) => ({ text, ...headStyle, fontSize: 7, ...extra });
const blanks = (n) => Array(n).fill({});

// 3-row grouped header for the shift abstract; `entityHeader` labels column 2.
function shiftHeaderRows(entityHeader) {
  return [
    [
      H('S.No', { rowSpan: 3 }), H(entityHeader, { rowSpan: 3 }),
      H('SHIFT', { colSpan: 8 }), {}, {}, {}, {}, {}, {}, {},
      H('TOTAL', { colSpan: 2 }), {},
      H('STD', { rowSpan: 3 }), H('Total Persons', { rowSpan: 3 })
    ],
    [
      {}, {},
      H('General', { colSpan: 2 }), {}, H('Day', { colSpan: 2 }), {},
      H('Half Night', { colSpan: 2 }), {}, H('Full Night', { colSpan: 2 }), {},
      H('Present', { colSpan: 2 }), {}, {}, {}
    ],
    [
      {}, {}, H('Shift'), H('OT'), H('Shift'), H('OT'), H('Shift'), H('OT'),
      H('Shift'), H('OT'), H('Shift'), H('OT'), {}, {}
    ]
  ];
}

// One 14-cell data/total row for the shift abstract.
function shiftRow(a, i, { total = false, sno = null, label = null } = {}) {
  const present = a.gen + a.i + a.ii + a.iii + a.day + a.night;
  const totOT = a.genOT + a.iOT + a.iiOT + a.iiiOT;
  const persons = present + totOT / 8;
  const zebra = (!total && i % 2 === 1) ? colors.zebraFill : null;
  const base = total
    ? { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 7.5 }
    : { fontSize: 7, fillColor: zebra };
  const c = (text, align = 'right', extra = {}) => ({ text, alignment: align, ...base, ...extra });
  const red = total ? {} : { color: '#c0392b' };
  return [
    c(total ? '' : String(sno != null ? sno : i + 1), 'center'),
    c(total ? (label || 'Total') : a.label, 'left'),
    c(n1(a.gen)), c(n0(a.genOT), 'right', red),
    c(n1(a.i)), c(n0(a.iOT), 'right', red),
    c(n1(a.ii)), c(n0(a.iiOT), 'right', red),
    c(n1(a.iii)), c(n0(a.iiiOT), 'right', red),
    c(n1(present)), c(n0(totOT), 'right', red),
    c(total ? '' : n0(a.std), 'right', total ? {} : { color: '#1f4e9c' }),
    c(n3(persons))
  ];
}

const grandAccumulator = () => ({ gen: 0, genOT: 0, i: 0, iOT: 0, ii: 0, iiOT: 0, iii: 0, iiiOT: 0, day: 0, night: 0, std: 0 });
const addInto = (G, a) => { for (const k of Object.keys(G)) if (k !== 'std') G[k] += a[k]; };

// Department Wise / Agent Wise — flat entity abstract with a Net Total row.
function buildEntityAbstract(rows, entityKeyFn, entityLabelFn, entityHeader) {
  const list = aggregateShift(rows, entityKeyFn, entityLabelFn);
  const body = shiftHeaderRows(entityHeader);
  const G = grandAccumulator();
  list.forEach((a, i) => { body.push(shiftRow(a, i)); addInto(G, a); });
  body.push(shiftRow(G, 0, { total: true, label: 'Net Total' }));
  return [{ table: { headerRows: 3, widths: SHIFT_WIDTHS, body }, layout: tableLayout() }];
}

// Designation Wise — department group header, one row per designation, dept total.
function buildDesignationWise(rows) {
  const body = shiftHeaderRows('Designation');
  // group rows by department (ordered by department name)
  const deptMap = new Map();
  for (const r of rows) {
    const dk = str(r, 'DepartmentCode');
    if (!deptMap.has(dk)) deptMap.set(dk, { name: str(r, 'DepartmentName_English') || str(r, 'DepartmentName'), rows: [] });
    deptMap.get(dk).rows.push(r);
  }
  const depts = [...deptMap.values()].sort((a, b) => a.name.localeCompare(b.name));
  const G = grandAccumulator();

  for (const d of depts) {
    body.push([
      { text: d.name, colSpan: 14, bold: true, color: colors.groupText, fillColor: colors.groupFill, fontSize: 8, alignment: 'left' },
      ...blanks(13)
    ]);
    const desigs = aggregateShift(d.rows, (r) => str(r, 'DesignationCode'), (r) => str(r, 'DesignationName') || '(No Designation)');
    const D = grandAccumulator();
    desigs.forEach((a, i) => { body.push(shiftRow(a, i, { sno: i + 1 })); addInto(D, a); addInto(G, a); });
    body.push(shiftRow(D, 0, { total: true, label: `${d.name} — Total` }));
  }
  body.push(shiftRow(G, 0, { total: true, label: 'Net Total' }));
  return [{ table: { headerRows: 3, widths: SHIFT_WIDTHS, body }, layout: tableLayout() }];
}

// Grade Wise — sp_GradeWise_Strength; per-department requirement vs available.
function buildGradeWise(rows) {
  const map = new Map();
  for (const r of rows) {
    const k = str(r, 'DepartmentCode');
    if (k === '' || k == null) continue;
    if (!map.has(k)) {
      map.set(k, {
        name: str(r, 'DepartmentName_English') || str(r, 'DepartmentName'),
        reqT1T2: dec(r, 'Req_T1T2'), reqT3E3: dec(r, 'Req_T3E3'), reqCritical: dec(r, 'Req_Critical'),
        totalRequired: dec(r, 'TotalRequired'),
        t1: 0, t2: 0, t3e3: 0, crit: 0, all: 0
      });
    }
    const a = map.get(k);
    a.t1 += dec(r, 'Total_T1'); a.t2 += dec(r, 'Total_T2'); a.t3e3 += dec(r, 'Total_T3E3');
    a.crit += dec(r, 'Total_Critical'); a.all += dec(r, 'Total_All');
  }
  const list = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));

  const widths = [22, '*', 42, 42, 42, 42, 46, 42, 34, 34, 42, 42, 40, 52];
  const header = [
    [
      H('S.No', { rowSpan: 2 }), H('Department', { rowSpan: 2 }),
      H('REQUIREMENT', { colSpan: 6 }), {}, {}, {}, {}, {},
      H('AVAILABLE', { colSpan: 5 }), {}, {}, {}, {},
      H('Excess / Shortage', { rowSpan: 2 })
    ],
    [
      {}, {},
      H('T1-T2'), H('T3-E3'), H('Critical'), H('Weekly Off'), H('Leave & Abs'), H('Total Req'),
      H('T1'), H('T2'), H('T3-E3'), H('Critical'), H('Total'), {}
    ]
  ];
  const body = header;

  list.forEach((a, i) => {
    const zebra = i % 2 === 1 ? colors.zebraFill : null;
    const weeklyOff = a.reqT3E3 > 0 ? Math.round(a.reqT3E3 * 0.167) : 0;
    const leaveAbs = a.reqT3E3 > 0 ? Math.round(a.reqT3E3 * 0.135) : 0;
    const excess = Math.round(a.all - a.totalRequired);
    const c = (text, align = 'center', extra = {}) => ({ text, alignment: align, fontSize: 7.5, fillColor: zebra, ...extra });
    body.push([
      c(String(i + 1)), c(a.name, 'left'),
      c(n0(a.reqT1T2)), c(n0(a.reqT3E3)), c(n0(a.reqCritical)),
      c(weeklyOff > 0 ? String(weeklyOff) : '-'), c(leaveAbs > 0 ? String(leaveAbs) : '-'), c(n0(a.totalRequired)),
      c(n0(a.t1)), c(n0(a.t2)), c(n0(a.t3e3)), c(n0(a.crit)), c(n0(a.all)),
      c(String(excess), 'center', { bold: true, color: excess < 0 ? '#c0392b' : '#1f4e9c' })
    ]);
  });

  return [{ table: { headerRows: 2, widths, body }, layout: tableLayout() }];
}

// With Details — Department → Shift → employee In/Out list (rptStrengthAbstractWithDetails).
function buildDetails(rows) {
  const widths = [26, 60, '*', 70, 70];
  const header = [H('S.No'), H('ID'), H('Employee Name'), H('In Time'), H('Out Time')];
  const body = [header];

  const deptMap = new Map();
  for (const r of rows) {
    const dk = str(r, 'DepartmentCode');
    if (!deptMap.has(dk)) deptMap.set(dk, { name: str(r, 'DepartmentName_English') || str(r, 'DepartmentName'), rows: [] });
    deptMap.get(dk).rows.push(r);
  }
  const depts = [...deptMap.values()].sort((a, b) => a.name.localeCompare(b.name));

  for (const d of depts) {
    body.push([
      { text: d.name, colSpan: 5, bold: true, color: colors.groupText, fillColor: colors.groupFill, fontSize: 8, alignment: 'left' },
      {}, {}, {}, {}
    ]);
    // shift groups within the department, ordered by ShiftNo
    const shiftMap = new Map();
    for (const r of d.rows) {
      const sk = str(r, 'ShiftNo') || str(r, 'ShiftCode');
      if (!shiftMap.has(sk)) shiftMap.set(sk, { name: str(r, 'ShiftName') || '(No Shift)', no: dec(r, 'ShiftNo'), rows: [] });
      shiftMap.get(sk).rows.push(r);
    }
    const shifts = [...shiftMap.values()].sort((a, b) => a.no - b.no);
    let sno = 0;
    for (const s of shifts) {
      body.push([
        { text: s.name, colSpan: 5, color: '#1f4e9c', bold: true, fillColor: colors.subFill, fontSize: 7.5, alignment: 'left' },
        {}, {}, {}, {}
      ]);
      s.rows
        .sort((a, b) => String(a.EmployeeID ?? '').localeCompare(String(b.EmployeeID ?? ''), undefined, { numeric: true }))
        .forEach((r) => {
          sno += 1;
          const zebra = sno % 2 === 0 ? colors.zebraFill : null;
          body.push([
            { text: String(sno), alignment: 'center', fontSize: 7.5, fillColor: zebra },
            { text: str(r, 'EmployeeID'), alignment: 'center', fontSize: 7.5, fillColor: zebra },
            { text: str(r, 'EmployeeName'), alignment: 'left', fontSize: 7.5, fillColor: zebra },
            { text: hhmm(r.InTime), alignment: 'center', fontSize: 7.5, fillColor: zebra },
            { text: hhmm(r.OutTime), alignment: 'center', fontSize: 7.5, fillColor: zebra }
          ]);
        });
    }
  }
  return [{ table: { headerRows: 1, widths, body }, layout: tableLayout() }];
}

const REPORT_TYPES = new Set(['departmentWise', 'agentWise', 'designationWise', 'gradeWise']);
function pickReport(query) {
  const raw = String(query.groupBy || query.reportType || 'departmentWise').trim();
  return REPORT_TYPES.has(raw) ? raw : 'departmentWise';
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------
export const strengthAbstractReport = async (req, res) => {
  const t0 = Date.now();
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type('text/plain').send('Missing subDBName header');

    const debug = req.query.debug === '1';
    const reportType = pickReport(req.query);
    const details = req.query.details === '1' || req.query.details === 'true';
    const isGrade = reportType === 'gradeWise' && !details;   // Details forces sp_Strength
    const spName = isGrade ? 'sp_GradeWise_Strength' : 'sp_Strength';

    const companyCode = req.query.CompanyCode || req.query.companyCode || req.headers.companycode || '0';
    const companyCodeInt = parseInt(companyCode) || 0;
    const today = new Date().toISOString().slice(0, 10);
    const fromDate = req.query.FromDate || req.query.fromDate || today;
    const toDate = req.query.ToDate || req.query.toDate || today;

    const pool = await getPool(subDbName);
    const spReq = pool.request();
    // sp_Strength takes @STDate; sp_GradeWise_Strength takes @FromDate (VB parity).
    spReq.input(isGrade ? 'FromDate' : 'STDate', sql.DateTime, new Date(fromDate));
    spReq.input('ToDate', sql.DateTime, new Date(toDate));
    if (companyCodeInt > 0) spReq.input('CompanyCode', sql.Int, companyCodeInt);

    const spResult = await spReq.execute(spName);
    const rows = applyStrengthFilters(spResult.recordset || [], req.query);
    const company = await getCompanyInfo(pool, companyCode);

    let title;
    let tables;
    if (details) {
      title = 'Strength Details - With Details';
      tables = buildDetails(rows);
    } else if (isGrade) {
      title = 'Strength Details - Grade Wise';
      tables = buildGradeWise(rows);
    } else if (reportType === 'agentWise') {
      title = 'Strength Details - Agent Wise';
      tables = buildEntityAbstract(rows, (r) => str(r, 'AgentCode'), (r) => str(r, 'AgentName') || '(No Agent)', 'Agent Name');
    } else if (reportType === 'designationWise') {
      title = 'Strength Details - Designation Wise';
      tables = buildDesignationWise(rows);
    } else {
      title = 'Strength Details - Department Wise';
      tables = buildEntityAbstract(rows, (r) => str(r, 'DepartmentCode'), (r) => str(r, 'DepartmentName_English') || str(r, 'DepartmentName'), 'Department Name');
    }

    const docDef = buildEmployeePage({
      companyName: company.name,
      companyLogo: company.logo,
      title,
      orientation: 'landscape',
      fromDate,
      toDate,
      tables
    });
    const pdfBuffer = await renderPdf(docDef);

    if (debug) {
      const dbCfg = pool.config || {};
      const sample = rows.slice(0, 3).map((r, i) => `  [${i}] ` + JSON.stringify(r).slice(0, 260)).join('\n');
      return res.type('text/plain').send(
        [
          `SP:           ${spName}`,
          `reportType:   ${reportType}${details ? ' (+details)' : ''}`,
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
    res.setHeader('Content-Disposition', `inline; filename="StrengthReport_${details ? 'details' : reportType}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
};
