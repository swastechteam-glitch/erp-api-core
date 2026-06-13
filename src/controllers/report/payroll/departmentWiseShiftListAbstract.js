// Department Wise Standard & Employees Abstract.
// Mirrors rptDepartmentWiseShiftListAbstract.rdlc — one summary row per
// department: standard man-power (rounded SUM of AvgManPower), actual employee
// count, and the difference (shown red when non-zero).
//
// SP: sp_Employee_GetAll_Photo  (AvgManPower / STDManPower columns come from the
//     newer recordset variant; treated as 0 when absent.)

import {
  runEmployeeReport, buildEmployeePage, tableLayout, colors, headStyle, str, dec
} from './_common.js';

const TITLE = 'Department Wise Standard & Employees Abstract';
const FILE_NAME = 'DepartmentWiseShiftListAbstract';

function buildDocDefinition({ rows, companyName, companyLogo }) {
  // Aggregate per department (preserving first-seen order, sorted by name).
  const depts = new Map();
  for (const r of rows) {
    const code = r.DepartmentCode;
    if (code === null || code === undefined) continue;
    if (!depts.has(code)) {
      depts.set(code, { name: str(r, 'DepartmentName'), stdSum: 0, count: 0 });
    }
    const d = depts.get(code);
    d.stdSum += dec(r, 'AvgManPower');
    d.count += 1;
  }

  const list = [...depts.values()].sort((a, b) => a.name.localeCompare(b.name));

  const widths = [40, '*', 90, 95, 90];
  const header = ['S.No', 'DEPARTMENT', 'STD EMPLOYEES', 'NO. OF EMPLOYEES', 'DIFFERENCE']
    .map((t) => ({ text: t, ...headStyle, fontSize: 8.5 }));
  const body = [header];

  let totStd = 0, totCount = 0;
  list.forEach((d, i) => {
    const std = Math.round(d.stdSum);
    const diff = d.count - std;
    totStd += std;
    totCount += d.count;
    const zebra = i % 2 === 1 ? colors.zebraFill : null;
    body.push([
      { text: String(i + 1), alignment: 'center', fontSize: 8, fillColor: zebra },
      { text: d.name, alignment: 'left', fontSize: 8, fillColor: zebra },
      { text: String(std), alignment: 'center', fontSize: 8, fillColor: zebra },
      { text: String(d.count), alignment: 'center', fontSize: 8, fillColor: zebra },
      { text: diff === 0 ? '-' : String(diff), alignment: 'center', fontSize: 8, fillColor: zebra, color: diff === 0 ? 'black' : 'red' }
    ]);
  });

  const totDiff = totCount - totStd;
  const g = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 };
  body.push([
    { text: 'TOTAL', colSpan: 2, alignment: 'right', ...g }, {},
    { text: String(totStd), alignment: 'center', ...g },
    { text: String(totCount), alignment: 'center', ...g },
    { text: totDiff === 0 ? '-' : String(totDiff), alignment: 'center', ...g }
  ]);

  return buildEmployeePage({
    companyName, companyLogo, title: TITLE, orientation: 'portrait',
    tables: [{ table: { headerRows: 1, widths, body }, layout: tableLayout() }]
  });
}

export const departmentWiseShiftListAbstractReport = (req, res) =>
  runEmployeeReport(req, res, { fileName: FILE_NAME, buildDocDefinition });
