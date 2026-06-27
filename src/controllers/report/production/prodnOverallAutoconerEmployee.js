// Production Over All ▸ AutoConer Employee Wise.
// Mirrors rptAutoConerProductionEmployeeWise_Arun.rdlc — one row per employee
// with PRODN / EFF / RL / RCY, plus an Average footer row.
//
// SP: sp_Prodn_AutoConer_EmployeeWiseDetails (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt
} from '../cotton/_common.js';

const FILE_NAME = 'ProductionOverAll_AutoConerEmployee';
const TITLE = 'AUTOCONER EMPLOYEE WISE REPORT';

const WIDTHS = [34, '*', 70, 70, 70, 70, 70];
const HEADERS = ['SNo', 'Employee Name', 'EMP ID', 'PRODN', 'EFF', 'RL', 'RCY'];

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate }) {
  const body = [];
  const h = { bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 8 };
  body.push(HEADERS.map((t) => ({ text: t, ...h })));

  let pSum = 0, eSum = 0, rlSum = 0, rcySum = 0;
  rows.forEach((r, i) => {
    const zebra = i % 2 === 1 ? colors.zebraFill : null;
    const cell = (text, align = 'right') => ({ text, alignment: align, fontSize: 8, fillColor: zebra });
    const p = dec(r, 'Prodn_Auto'), e = dec(r, 'Eff_Auto'), rl = dec(r, 'RL'), rcy = dec(r, 'RCY');
    pSum += p; eSum += e; rlSum += rl; rcySum += rcy;
    body.push([
      cell(String(i + 1), 'center'),
      cell(str(r, 'EmployeeName'), 'left'),
      cell(str(r, 'EmployeeID'), 'right'),
      cell(fmt(p, 2)), cell(fmt(e, 2)), cell(fmt(rl, 2)), cell(fmt(rcy, 2)),
    ]);
  });

  const n = rows.length || 1;
  const g = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 };
  if (rows.length) {
    body.push([
      { text: 'Average', colSpan: 3, alignment: 'right', ...g }, {}, {},
      { text: fmt(pSum / n, 2), alignment: 'right', ...g },
      { text: fmt(eSum / n, 2), alignment: 'right', ...g },
      { text: fmt(rlSum / n, 2), alignment: 'right', ...g },
      { text: fmt(rcySum / n, 2), alignment: 'right', ...g },
    ]);
  }

  if (!rows.length) {
    return buildPage({ companyName, companyLogo, title: TITLE, fromDate, toDate,
      tables: [{ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] }] });
  }

  return buildPage({
    companyName, companyLogo, title: TITLE, fromDate, toDate,
    tables: [{ table: { headerRows: 1, dontBreakRows: true, widths: WIDTHS, body }, layout: tableLayout() }],
  });
}

export const prodnOverallAutoconerEmployeeReport = (req, res) =>
  runReport(req, res, { spName: 'sp_Prodn_AutoConer_EmployeeWiseDetails', fileName: FILE_NAME, buildDocDefinition });
