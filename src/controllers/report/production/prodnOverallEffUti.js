// Production Over All ▸ Eff - Uti — dept-wise efficiency & utilisation by date.
// Mirrors rptProductionDept.rdlc — Date column then EFF/UTI pair per department,
// with AVERAGE / MINIMUM / MAXIMUM footer rows.
//
// SP: sp_Prodn_Department_EfffUT_Report (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy
} from '../cotton/_common.js';

const FILE_NAME = 'ProductionOverAll_EffUti';
const TITLE = 'DEPT WISE EFFICIENCY & UTILISATION';

// Department -> [Eff field, UTI field].
const DEPTS = [
  { label: 'CARDING', eff: 'Eff_Carding', uti: 'UTI_Carding' },
  { label: 'UNILAB', eff: 'Eff_UL', uti: 'UTI_UL' },
  { label: 'COMBER', eff: 'Eff_Comber', uti: 'UTI_Comber' },
  { label: 'DRAWING', eff: 'Eff_Drawing', uti: 'UTI_Drawing' },
  { label: 'SIMPLEX', eff: 'Eff_Six', uti: 'UTI_Six' },
  { label: 'SPINNING', eff: 'Eff_SPG', uti: 'UTI_SPG' },
  { label: 'AUTOCONER', eff: 'Eff_AUTO', uti: 'UTI_AUTO' },
  { label: 'CHEESE', eff: 'Eff_Cheese', uti: 'UTI_Cheese' },
  { label: 'PPW', eff: 'Eff_PPW', uti: 'UTI_PPW' },
  { label: 'TFO', eff: 'Eff_TFO', uti: 'UTI_TFO' },
  { label: 'A/C 12', eff: 'Eff_RAM01', uti: 'UTI_RAM01' },
  { label: 'A/C 13', eff: 'Eff_RAM02', uti: 'UTI_RAM02' },
];

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate }) {
  const fields = DEPTS.flatMap((d) => [d.eff, d.uti]);
  const WIDTHS = [54, ...fields.map(() => '*')];

  const body = [];
  const h = { bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 6 };
  // Row 1 — department group headers.
  body.push([
    { text: 'Department', rowSpan: 2, ...h },
    ...DEPTS.flatMap((d) => [{ text: d.label, colSpan: 2, ...h }, {}]),
  ]);
  // Row 2 — EFF / UTI.
  body.push([{}, ...DEPTS.flatMap(() => [{ text: 'EFF', ...h }, { text: 'UTI', ...h }])]);

  rows.forEach((r, i) => {
    const zebra = i % 2 === 1 ? colors.zebraFill : null;
    const cell = (text, align = 'right') => ({ text, alignment: align, fontSize: 6, fillColor: zebra });
    body.push([
      cell(ddmmyyyy(r.CalendarDate), 'center'),
      ...fields.map((f) => cell(fmt(dec(r, f), 2))),
    ]);
  });

  // Footer summary rows (Average / Minimum / Maximum) per column.
  const stat = (f, kind) => {
    const vals = rows.map((r) => dec(r, f));
    if (!vals.length) return 0;
    if (kind === 'avg') return vals.reduce((a, b) => a + b, 0) / vals.length;
    if (kind === 'min') return Math.min(...vals);
    return Math.max(...vals);
  };
  const footRow = (label, kind, color) => {
    const f = { bold: true, fillColor: colors.subFill, color, fontSize: 6 };
    return [
      { text: label, ...f, alignment: 'left' },
      ...fields.map((fld) => ({ text: fmt(stat(fld, kind), 2), alignment: 'right', ...f })),
    ];
  };
  if (rows.length) {
    body.push(footRow('AVERAGE', 'avg', '#8B0000'));
    body.push(footRow('MINIMUM', 'min', '#1A3C7B'));
    body.push(footRow('MAXIMUM', 'max', '#1A3C7B'));
  }

  if (!rows.length) {
    return buildPage({ companyName, companyLogo, title: TITLE, fromDate, toDate,
      tables: [{ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] }] });
  }

  return buildPage({
    companyName, companyLogo, title: TITLE, fromDate, toDate,
    tables: [{ table: { headerRows: 2, dontBreakRows: true, widths: WIDTHS, body }, layout: tableLayout() }],
  });
}

export const prodnOverallEffUtiReport = (req, res) =>
  runReport(req, res, { spName: 'sp_Prodn_Department_EfffUT_Report', fileName: FILE_NAME, buildDocDefinition });
