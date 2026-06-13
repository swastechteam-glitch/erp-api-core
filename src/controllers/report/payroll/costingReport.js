// Payroll Costing.
// Mirrors rptCosting.rdlc — one aggregated row per department: shift man-day
// counts (General / Day / Half-Night / Full-Night), total present, working & OT
// hours, shift wages, OT wages, total amount and cost-per-head, plus a
// grand-total row.
//
// SP: sp_Strength (FromDate, ToDate)  [detail rows aggregated per department]

import {
  runNewJoiningReport, buildEmployeePage, tableLayout, colors, headStyle, str, dec, ddmmyyyy
} from './_common.js';

const TITLE = 'Costing Details';
const FILE_NAME = 'PayrollCosting';

const intOrBlank = (v) => (v > 0 ? String(Math.round(v)) : '');
const f2 = (v) => Number(v || 0).toFixed(2);

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate }) {
  // Aggregate per department.
  const depts = new Map();
  for (const r of rows) {
    const code = r.DepartmentCode;
    if (code === null || code === undefined) continue;
    if (!depts.has(code)) {
      depts.set(code, {
        name: str(r, 'DepartmentName') || str(r, 'DepartmentName_English'),
        gen: 0, i: 0, ii: 0, iii: 0, day: 0, night: 0,
        workHrs: 0, otHrs: 0, shiftSal: 0, otAmt: 0
      });
    }
    const d = depts.get(code);
    d.gen += dec(r, 'GeneralShift'); d.i += dec(r, 'IShift');
    d.ii += dec(r, 'IIShift'); d.iii += dec(r, 'IIIShift');
    d.day += dec(r, 'DayShift'); d.night += dec(r, 'NightShift');
    d.workHrs += dec(r, 'WORKINGHOURS'); d.otHrs += dec(r, 'OTHOURS');
    d.shiftSal += dec(r, 'ShiftSalary');
    d.otAmt += dec(r, 'OTHOURS') * dec(r, 'OTSalary');
  }
  const list = [...depts.values()].sort((a, b) => a.name.localeCompare(b.name));

  const HEADERS = ['Department', 'Gen', 'Day', 'Half Nt', 'Full Nt', 'Present',
    'W.Hrs', 'OT Hrs', 'Sh.Wages', 'OT Wages', 'Amount', 'Cost/Hd'];
  const widths = ['*', 40, 40, 44, 44, 48, 52, 50, 64, 60, 70, 56];
  const header = HEADERS.map((t) => ({ text: t, ...headStyle, fontSize: 7.5 }));
  const body = [header];

  const G = { gen: 0, i: 0, ii: 0, iii: 0, day: 0, night: 0, workHrs: 0, otHrs: 0, shiftSal: 0, otAmt: 0 };

  const rowCells = (d, idx, opts = {}) => {
    const present = d.gen + d.i + d.ii + d.iii + d.day + d.night;
    const total = d.shiftSal + d.otAmt;
    const costHd = present > 0 ? total / present : 0;
    const z = (!opts.total && idx % 2 === 1) ? colors.zebraFill : null;
    const base = opts.total
      ? { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 7.5 }
      : { fontSize: 7.5, fillColor: z };
    const c = (text, align = 'right') => ({ text, alignment: align, ...base });
    return [
      c(opts.total ? 'TOTAL' : d.name, 'left'),
      c(intOrBlank(d.gen), 'center'),
      c(intOrBlank(d.i), 'center'),
      c(intOrBlank(d.ii), 'center'),
      c(intOrBlank(d.iii), 'center'),
      c(present ? String(Math.round(present)) : '', 'center'),
      c(f2(d.workHrs)), c(f2(d.otHrs)),
      c(f2(d.shiftSal)), c(f2(d.otAmt)), c(f2(total)), c(f2(costHd))
    ];
  };

  list.forEach((d, i) => {
    body.push(rowCells(d, i));
    for (const k of Object.keys(G)) G[k] += d[k];
  });
  body.push(rowCells(G, 0, { total: true }));

  return buildEmployeePage({
    companyName, companyLogo, title: TITLE, orientation: 'landscape',
    fromDate, toDate,
    tables: [{ table: { headerRows: 1, widths, body }, layout: tableLayout() }]
  });
}

export const payrollCostingReport = (req, res) =>
  runNewJoiningReport(req, res, { fileName: FILE_NAME, buildDocDefinition, spName: 'sp_Strength' });
