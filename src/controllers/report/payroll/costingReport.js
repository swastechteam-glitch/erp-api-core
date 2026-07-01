// =============================================================================
// Payroll ▸ Reports ▸ Costing Analysis ▸ Rpt Date Wise Costing Report
// (form: rptCostingAbstract)
// =============================================================================
// Port of the WinForms rptCostingAbstract screen. One SP (sp_Strength called
// with @CostingReport=1) feeds three layouts chosen by the report-type radios:
//
//   Depart with Designation → rptCostingWithDetails.rdlc       (default)
//       Department groups → per-Designation aggregated rows + department total.
//   Department Wise        → rptCosting.rdlc
//       Flat per-department manpower-costing abstract + grand total (+Cost/Head).
//   Grade with Designation → rptCostingWithDetails_GradeWise.rdlc
//       Grade groups → per-Designation aggregated rows + grade total.
//
//   GET /payroll/reports/costing/abstract
//     ?groupBy=departDesig|departmentWise|gradeDesig   (default departDesig)
//     &CompanyCode &FromDate &ToDate
//     &EmpGroupCode &EmpCategoryCode        // comma-separated code lists
//
// SP inputs mirror rptCostingAbstract.vb:
//   sp_Strength(@STDate,@ToDate,@CompanyCode?,@Emp_Status,@CostingReport=1)
//
// Costing columns: SHIFT (General/Day/Half Night/Full Night/Present man-days),
// Total Working Hours (Work / OT), Wages (Shift / OT), Cost/Day (Amount) and
// — summary layout only — Cost/Head (Amount ÷ Present).

import sql from 'mssql';
import { getPool } from '../../../config/dynamicDB.js';
import { renderPdf, getCompanyInfo } from '../cotton/_common.js';
import { buildEmployeePage, tableLayout, colors, headStyle, str, dec } from './_common.js';

// ---------------------------------------------------------------------------
// Formatters — shift counts blank when 0 (rdlc iif(Sum>0,…,"")); money 2 dp.
// ---------------------------------------------------------------------------
const gz = (v) => (v > 0 ? String(Math.round(v)) : '');
const f2 = (v) => Number(v || 0).toFixed(2);

// ---------------------------------------------------------------------------
// In-memory filter rail (rptCostingAbstract.vb DataTable.Select chain).
// ---------------------------------------------------------------------------
const codeSet = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const s = new Set(String(v).split(',').map((x) => x.trim()).filter(Boolean));
  return s.size ? s : null;
};

const ROW_FILTERS = [
  ['EmpGroupCode', 'EmpGroupCode'],
  ['EmpCategoryCode', 'EmpCategoryCode']
];

function applyCostingFilters(rows, query) {
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
// Aggregation — one bucket per entity (department / designation / grade).
// ---------------------------------------------------------------------------
function costingAgg(rows, keyFn, labelFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (k === null || k === undefined || k === '') continue;
    if (!map.has(k)) {
      map.set(k, {
        label: labelFn(r),
        gen: 0, day: 0, hn: 0, fn: 0, dayShift: 0, night: 0,
        workHrs: 0, otHrs: 0, wagesShift: 0, wagesOT: 0
      });
    }
    const a = map.get(k);
    a.gen += dec(r, 'GeneralShift'); a.day += dec(r, 'IShift');
    a.hn += dec(r, 'IIShift'); a.fn += dec(r, 'IIIShift');
    a.dayShift += dec(r, 'DayShift'); a.night += dec(r, 'NightShift');
    a.workHrs += dec(r, 'WORKINGHOURS'); a.otHrs += dec(r, 'OTHOURS');
    a.wagesShift += dec(r, 'ShiftSalary');
    a.wagesOT += dec(r, 'OTHOURS') * dec(r, 'OTSalary');
  }
  return [...map.values()].sort((a, b) => String(a.label).localeCompare(String(b.label)));
}

const H = (text, extra = {}) => ({ text, ...headStyle, fontSize: 7.5, ...extra });

// 2-row grouped header; `includeCostHead` adds the summary-only Cost/Head column.
function costingHeaderRows(nameLabel, includeCostHead) {
  const rowA = [
    H(nameLabel, { rowSpan: 2 }),
    H('SHIFT', { colSpan: 5 }), {}, {}, {}, {},
    H('Total working Hours (By Hours)', { colSpan: 2 }), {},
    H('Wages', { colSpan: 2 }), {},
    H('Cost / Day', { rowSpan: 2 })
  ];
  const rowB = [
    {},
    H('General'), H('Day'), H('Half Night'), H('Full Night'), H('Present'),
    H('Work (Hours)'), H('OT (Hours)'),
    H('Shift'), H('OT'),
    {}
  ];
  if (includeCostHead) {
    rowA.push(H('Cost / Head', { rowSpan: 2 }));
    rowB.push({});
  }
  return [rowA, rowB];
}

const COLS_SUMMARY = ['*', 42, 40, 44, 44, 46, 52, 48, 54, 54, 58, 52];
const COLS_DETAIL = ['*', 44, 42, 48, 48, 48, 56, 50, 62, 62, 66];

// One data / total row (11 cells; 12 when includeCostHead).
function costingRow(a, i, { total = false, label = null, includeCostHead = false } = {}) {
  const present = a.gen + a.day + a.hn + a.fn + a.dayShift + a.night;
  const amount = a.wagesShift + a.wagesOT;
  const costHead = present > 0 ? amount / present : 0;
  const zebra = (!total && i % 2 === 1) ? colors.zebraFill : null;
  const base = total
    ? { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 7.5 }
    : { fontSize: 7.5, fillColor: zebra };
  const c = (text, align = 'right', extra = {}) => ({ text, alignment: align, ...base, ...extra });
  const cells = [
    c(total ? (label || 'Total') : a.label, 'left'),
    c(gz(a.gen), 'center'), c(gz(a.day), 'center'), c(gz(a.hn), 'center'), c(gz(a.fn), 'center'),
    c(String(Math.round(present)), 'center'),
    c(f2(a.workHrs)), c(f2(a.otHrs)),
    c(f2(a.wagesShift)), c(f2(a.wagesOT)), c(f2(amount))
  ];
  if (includeCostHead) cells.push(c(f2(costHead)));
  return cells;
}

const grandAcc = () => ({ gen: 0, day: 0, hn: 0, fn: 0, dayShift: 0, night: 0, workHrs: 0, otHrs: 0, wagesShift: 0, wagesOT: 0 });
const addInto = (G, a) => { for (const k of Object.keys(G)) G[k] += a[k]; };

// Department Wise — rptCosting.rdlc: flat per-department abstract + Cost/Head.
function buildDepartmentWise(rows) {
  const list = costingAgg(rows, (r) => str(r, 'DepartmentCode'), (r) => str(r, 'DepartmentName') || str(r, 'DepartmentName_English'));
  const body = costingHeaderRows('Department Name', true);
  const G = grandAcc();
  list.forEach((a, i) => { body.push(costingRow(a, i, { includeCostHead: true })); addInto(G, a); });
  body.push(costingRow(G, 0, { total: true, label: 'Total', includeCostHead: true }));
  return [{ table: { headerRows: 2, widths: COLS_SUMMARY, body }, layout: tableLayout() }];
}

// Grouped detail — Department→Designation (rptCostingWithDetails) or
// Grade→Designation (rptCostingWithDetails_GradeWise). Employee rows are hidden
// in the .rdlc, so the visible output is per-designation aggregates + group total.
function buildGroupedDesignation(rows, groupKeyFn, groupLabelFn, groupHeader) {
  const body = costingHeaderRows(`${groupHeader} / Designation`, false);
  const span = COLS_DETAIL.length; // 11

  const groupMap = new Map();
  for (const r of rows) {
    const gk = groupKeyFn(r);
    if (gk === null || gk === undefined || gk === '') continue;
    if (!groupMap.has(gk)) groupMap.set(gk, { label: groupLabelFn(r), rows: [] });
    groupMap.get(gk).rows.push(r);
  }
  const groups = [...groupMap.values()].sort((a, b) => String(a.label).localeCompare(String(b.label)));
  const G = grandAcc();

  for (const g of groups) {
    body.push([
      { text: g.label, colSpan: span, bold: true, color: colors.groupText, fillColor: colors.groupFill, fontSize: 8, alignment: 'left' },
      ...Array(span - 1).fill({})
    ]);
    const desigs = costingAgg(g.rows, (r) => str(r, 'DesignationCode'), (r) => str(r, 'DesignationName') || '(No Designation)');
    const D = grandAcc();
    desigs.forEach((a, i) => { body.push(costingRow(a, i)); addInto(D, a); addInto(G, a); });
    body.push(costingRow(D, 0, { total: true, label: `${g.label} — Total` }));
  }
  body.push(costingRow(G, 0, { total: true, label: 'Net Total' }));
  return [{ table: { headerRows: 2, widths: COLS_DETAIL, body }, layout: tableLayout() }];
}

const REPORT_TYPES = new Set(['departDesig', 'departmentWise', 'gradeDesig']);
function pickReport(query) {
  const raw = String(query.groupBy || query.reportType || 'departDesig').trim();
  return REPORT_TYPES.has(raw) ? raw : 'departDesig';
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------
export const payrollCostingReport = async (req, res) => {
  const t0 = Date.now();
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type('text/plain').send('Missing subDBName header');

    const debug = req.query.debug === '1';
    const reportType = pickReport(req.query);

    const companyCode = req.query.CompanyCode || req.query.companyCode || req.headers.companycode || '0';
    const companyCodeInt = parseInt(companyCode) || 0;
    const empStatus = parseInt(req.query.empStatus ?? req.query.Emp_Status ?? '1');
    const today = new Date().toISOString().slice(0, 10);
    const fromDate = req.query.FromDate || req.query.fromDate || today;
    const toDate = req.query.ToDate || req.query.toDate || today;

    const pool = await getPool(subDbName);
    const spReq = pool.request();
    spReq.input('STDate', sql.DateTime, new Date(fromDate));
    spReq.input('ToDate', sql.DateTime, new Date(toDate));
    if (companyCodeInt > 0) spReq.input('CompanyCode', sql.Int, companyCodeInt);
    spReq.input('Emp_Status', sql.Int, Number.isNaN(empStatus) ? 1 : empStatus);
    spReq.input('CostingReport', sql.Int, 1);

    const spResult = await spReq.execute('sp_Strength');
    const rows = applyCostingFilters(spResult.recordset || [], req.query);
    const company = await getCompanyInfo(pool, companyCode);

    let title = 'Manpower Costing Details';
    let tables;
    if (reportType === 'departmentWise') {
      tables = buildDepartmentWise(rows);
    } else if (reportType === 'gradeDesig') {
      tables = buildGroupedDesignation(rows, (r) => str(r, 'GradeCode'), (r) => str(r, 'GradeName') || '(No Grade)', 'Grade');
    } else {
      tables = buildGroupedDesignation(rows, (r) => str(r, 'DepartmentCode'), (r) => str(r, 'DepartmentName_English') || str(r, 'DepartmentName'), 'Department');
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
      const sample = rows.slice(0, 3).map((r, i) => `  [${i}] ` + JSON.stringify(r).slice(0, 300)).join('\n');
      return res.type('text/plain').send(
        [
          `SP:           sp_Strength (@CostingReport=1)`,
          `reportType:   ${reportType}`,
          `subDBName:    ${subDbName}`,
          `server:       ${dbCfg.server}${dbCfg.port ? ':' + dbCfg.port : ''}`,
          `database:     ${dbCfg.database}`,
          `company:      ${company.name || '(none)'} (${companyCodeInt})`,
          `Emp_Status:   ${empStatus}`,
          `FromDate:     ${fromDate}`,
          `ToDate:       ${toDate}`,
          `rows:         ${rows.length}`,
          `Total:        ${Date.now() - t0} ms (${pdfBuffer.length} pdf bytes)`,
          sample ? `\nfirst rows:\n${sample}` : ''
        ].join('\n')
      );
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="CostingReport_${reportType}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
};
