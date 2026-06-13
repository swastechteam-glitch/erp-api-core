// Strength Details (Abstract).
// Mirrors rptStrengthAbstract.rdlc — one aggregated row per department with
// per-shift man-day totals (General / I / II / III, each Shift + OT), standard
// man-power, present, leave and total persons, plus a grand-total row.
//
// SP: sp_Strength (FromDate, ToDate)  [detail rows aggregated per department]

import {
  runNewJoiningReport, buildEmployeePage, tableLayout, colors, headStyle, str, dec, ddmmyyyy
} from './_common.js';

const FILE_NAME = 'StrengthAbstract';

const n1 = (v) => (v > 0 ? v.toFixed(1) : '-');
const n0 = (v) => (v > 0 ? String(Math.round(v)) : '-');
const n3 = (v) => (v > 0 ? v.toFixed(3) : '-');

function buildDocDefinition({ rows, companyName, companyLogo, toDate }) {
  const asOn = (rows[0] && rows[0].StDate) ? rows[0].StDate : toDate;
  const TITLE = `Strength Details - ${ddmmyyyy(asOn)}`;

  // Aggregate per department.
  const depts = new Map();
  for (const r of rows) {
    const code = r.DepartmentCode;
    if (code === null || code === undefined) continue;
    if (!depts.has(code)) {
      depts.set(code, {
        name: str(r, 'DepartmentName_English') || str(r, 'DepartmentName'),
        gen: 0, genOT: 0, i: 0, iOT: 0, ii: 0, iiOT: 0, iii: 0, iiiOT: 0,
        day: 0, night: 0, avg: 0, leave: 0
      });
    }
    const d = depts.get(code);
    d.gen += dec(r, 'GeneralShift'); d.genOT += dec(r, 'GeneralShift_OT');
    d.i += dec(r, 'IShift'); d.iOT += dec(r, 'IShift_OT');
    d.ii += dec(r, 'IIShift'); d.iiOT += dec(r, 'IIShift_OT');
    d.iii += dec(r, 'IIIShift'); d.iiiOT += dec(r, 'IIIShift_OT');
    d.day += dec(r, 'DayShift'); d.night += dec(r, 'NightShift');
    d.avg += dec(r, 'AvgManPower'); d.leave += dec(r, 'Leave');
  }
  const list = [...depts.values()].sort((a, b) => a.name.localeCompare(b.name));

  const HEADERS = ['S.No', 'Department', 'Gen', 'Gen OT', 'I Sh', 'I OT', 'II Sh', 'II OT',
    'III Sh', 'III OT', 'STD', 'Tot.Pre', 'Tot.OT', 'Pre+OT', 'Leave', 'Persons'];
  const widths = [24, '*', 36, 32, 36, 32, 36, 32, 36, 32, 40, 44, 36, 50, 40, 44];
  const header = HEADERS.map((t) => ({ text: t, ...headStyle, fontSize: 7 }));
  const body = [header];

  const G = { gen: 0, genOT: 0, i: 0, iOT: 0, ii: 0, iiOT: 0, iii: 0, iiiOT: 0, day: 0, night: 0, avg: 0, leave: 0 };

  const rowCells = (d, i, opts = {}) => {
    const present = d.gen + d.i + d.ii + d.iii + d.day + d.night;
    const totOT = d.genOT + d.iOT + d.iiOT + d.iiiOT;
    const presentOT = present + totOT / 8;
    const persons = present + d.leave;
    const z = (!opts.total && i % 2 === 1) ? colors.zebraFill : null;
    const base = opts.total
      ? { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 7.5 }
      : { fontSize: 7, fillColor: z };
    const c = (text, align = 'right', extra = {}) => ({ text, alignment: align, ...base, ...extra });
    return [
      c(opts.total ? '' : String(i + 1), 'center'),
      c(opts.total ? 'TOTAL' : d.name, 'left'),
      c(n1(d.gen)), c(n0(d.genOT)),
      c(n1(d.i)), c(n0(d.iOT)),
      c(n1(d.ii)), c(n0(d.iiOT)),
      c(n1(d.iii)), c(n0(d.iiiOT)),
      c(n0(d.avg)), c(n1(present)), c(n0(totOT)), c(n3(presentOT)), c(n0(d.leave)), c(n0(persons))
    ];
  };

  list.forEach((d, i) => {
    body.push(rowCells(d, i));
    for (const k of Object.keys(G)) G[k] += d[k];
  });
  body.push(rowCells(G, 0, { total: true }));

  return buildEmployeePage({
    companyName, companyLogo, title: TITLE, orientation: 'landscape',
    tables: [{ table: { headerRows: 1, widths, body }, layout: tableLayout() }]
  });
}

export const strengthAbstractReport = (req, res) =>
  runNewJoiningReport(req, res, { fileName: FILE_NAME, buildDocDefinition, spName: 'sp_Strength' });
