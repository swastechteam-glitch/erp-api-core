// Production Over All ▸ Preparatory Monitor Wise.
// Mirrors rptPrepartoryProductionMoniterWise_Arun.rdlc — one row per monitor
// (employee) with PRODN / EFF / UTI per department (CDG, U/L, COM, DRG, SIX)
// plus W%, QA NC, Shift NC. Detail is aggregated per monitor (avg / sum).
//
// SP: sp_Preparatory_MoniterWise_Report (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt
} from '../cotton/_common.js';

const FILE_NAME = 'ProductionOverAll_PreparatoryMonitor';
const TITLE = 'PREPARATORY MONITERWISE REPORT';

// 20 columns: SNo, Name, PRODN x5, EFF x5, UTI x5, W%, QA NC, Shift NC.
const WIDTHS = [24, '*', 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 38, 38, 40];
const SUB = ['CDG', 'U/L', 'COM', 'DRG', 'SIX'];

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate }) {
  // Aggregate per monitor (EmployeeCode).
  const map = new Map();
  for (const r of rows) {
    const k = str(r, 'EmployeeCode');
    if (!map.has(k)) map.set(k, { name: str(r, 'EmployeeName'), n: 0, acc: {} });
    const g = map.get(k); g.n++;
    const add = (col) => { g.acc[col] = (g.acc[col] || 0) + dec(r, col); };
    ['Prodn_Carding', 'Prodn_UL', 'Prodn_Comber', 'Prodn_Drawing', 'Prodn_Six',
      'Eff_Carding', 'Eff_UL', 'Eff_Comber', 'Eff_Drawing', 'Eff_Six',
      'UTI_Carding', 'UTI_UL', 'UTI_Comber', 'UTI_Drawing', 'UTI_Six',
      'WastePer', 'QANC', 'ShiftNC'].forEach(add);
  }

  const body = [];
  const h = { bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 7 };
  // Row 1 — group headers.
  body.push([
    { text: 'S.No', rowSpan: 2, ...h }, { text: 'Name', rowSpan: 2, ...h },
    { text: 'PRODN', colSpan: 5, ...h }, {}, {}, {}, {},
    { text: 'EFF', colSpan: 5, ...h }, {}, {}, {}, {},
    { text: 'UTI', colSpan: 5, ...h }, {}, {}, {}, {},
    { text: 'W %', rowSpan: 2, ...h }, { text: 'QA NC', rowSpan: 2, ...h }, { text: 'Shift NC', rowSpan: 2, ...h },
  ]);
  // Row 2 — sub headers.
  body.push([{}, {}, ...SUB.map((s) => ({ text: s, ...h })), ...SUB.map((s) => ({ text: s, ...h })), ...SUB.map((s) => ({ text: s, ...h })), {}, {}, {}]);

  let i = 0;
  for (const g of map.values()) {
    const zebra = i % 2 === 1 ? colors.zebraFill : null;
    const cell = (text, align = 'right') => ({ text, alignment: align, fontSize: 7, fillColor: zebra });
    const avg = (col) => (g.n ? g.acc[col] / g.n : 0);
    body.push([
      cell(String(i + 1), 'center'),
      cell(g.name, 'left'),
      cell(fmt(avg('Prodn_Carding'), 0)), cell(fmt(avg('Prodn_UL'), 0)), cell(fmt(avg('Prodn_Comber'), 0)), cell(fmt(avg('Prodn_Drawing'), 0)), cell(fmt(avg('Prodn_Six'), 0)),
      cell(fmt(avg('Eff_Carding'), 2)), cell(fmt(avg('Eff_UL'), 2)), cell(fmt(avg('Eff_Comber'), 2)), cell(fmt(avg('Eff_Drawing'), 2)), cell(fmt(avg('Eff_Six'), 2)),
      cell(fmt(avg('UTI_Carding'), 2)), cell(fmt(avg('UTI_UL'), 2)), cell(fmt(avg('UTI_Comber'), 2)), cell(fmt(avg('UTI_Drawing'), 2)), cell(fmt(avg('UTI_Six'), 2)),
      cell(fmt(avg('WastePer'), 2)), cell(fmt(g.acc.QANC || 0, 0)), cell(fmt(g.acc.ShiftNC || 0, 0)),
    ]);
    i++;
  }

  if (!map.size) {
    return buildPage({ companyName, companyLogo, title: TITLE, fromDate, toDate,
      tables: [{ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] }] });
  }

  return buildPage({
    companyName, companyLogo, title: TITLE, fromDate, toDate,
    tables: [{ table: { headerRows: 2, dontBreakRows: true, widths: WIDTHS, body }, layout: tableLayout() }],
  });
}

export const prodnOverallPreparatoryMonitorReport = (req, res) =>
  runReport(req, res, { spName: 'sp_Preparatory_MoniterWise_Report', fileName: FILE_NAME, buildDocDefinition });
