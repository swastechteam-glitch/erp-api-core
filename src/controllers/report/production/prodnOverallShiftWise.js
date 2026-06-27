// Production Over All ▸ Shift Wise — all-department shift detail.
// Mirrors rptProductionShiftWise_AllReport.rdlc: one section per department,
// rows grouped by shift, machine-level detail with a per-section total.
//
// SPs (each CompanyCode/FromDate/ToDate): sp_Prodn_<Dept>ProdnDetails_GetAll.

import {
  runMultiReport, buildPage, tableLayout, colors,
  dec, str, fmt
} from '../cotton/_common.js';

const FILE_NAME = 'ProductionOverAll_ShiftWise';
const TITLE = 'PRODUCTION DEPARTMENT — SHIFT WISE';

const WIDTHS = [40, '*', 60, 54, 56, 56, 56, 50, 50, 50];
const HEADERS = ['M/C No', 'Mixing', 'Working Mins', 'Speed', 'STD Prodn', 'ACT Prodn', 'Stop Time', 'Eff %', 'UT %', 'Index'];

const DEPTS = [
  { key: 'carding', title: 'CARDING' },
  { key: 'drawing', title: 'BREAKER DRAWING' },
  { key: 'unilap', title: 'UNILAP' },
  { key: 'comber', title: 'COMBER' },
  { key: 'finisherDrawing', title: 'FINISHER DRAWING' },
  { key: 'simplex', title: 'SIMPLEX' },
];

function buildDeptTable(title, rows) {
  const body = [];
  const h = { bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 8 };
  body.push([{ text: title, colSpan: 10, bold: true, color: colors.groupText, fillColor: colors.groupFill, fontSize: 9, alignment: 'center' }, {}, {}, {}, {}, {}, {}, {}, {}, {}]);
  body.push(HEADERS.map((t) => ({ text: t, ...h })));

  // Group by ShiftCode (preserve first-seen order).
  const shifts = new Map();
  for (const r of rows) {
    const key = str(r, 'ShiftCode');
    if (!shifts.has(key)) shifts.set(key, []);
    shifts.get(key).push(r);
  }

  let rowIdx = 0;
  for (const sRows of shifts.values()) {
    const head = sRows[0] || {};
    body.push([{ text: `Shift : ${str(head, 'ShiftName') || str(head, 'ShiftNo')}`, colSpan: 10, bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 8 }, {}, {}, {}, {}, {}, {}, {}, {}, {}]);

    let tTgt = 0, tPro = 0, tStop = 0, eSum = 0, uSum = 0, n = 0;
    sRows.forEach((r) => {
      const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;
      const cell = (text, align = 'right') => ({ text, alignment: align, fontSize: 8, fillColor: zebra });
      const tgt = dec(r, 'TargetProdn'), pro = dec(r, 'Prodn'), stop = dec(r, 'Stoppage');
      const eff = dec(r, 'ProdnEffi'), uti = dec(r, 'Utilisation');
      tTgt += tgt; tPro += pro; tStop += stop; eSum += eff; uSum += uti; n++;
      body.push([
        cell(str(r, 'MachineNo'), 'center'),
        cell(str(r, 'MixingName'), 'left'),
        cell(fmt(dec(r, 'ActualWorkingMins'), 0)),
        cell(fmt(dec(r, 'DSpeed'), 0)),
        cell(fmt(tgt, 2)), cell(fmt(pro, 2)), cell(fmt(stop, 0)),
        cell(fmt(eff, 2)), cell(fmt(uti, 2)), cell(fmt(dec(r, 'Indexs'), 2)),
      ]);
      rowIdx++;
    });

    const g = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 8 };
    const avg = (s) => (n ? s / n : 0);
    body.push([
      { text: 'TOTAL', colSpan: 4, alignment: 'right', ...g }, {}, {}, {},
      { text: fmt(tTgt, 2), alignment: 'right', ...g },
      { text: fmt(tPro, 2), alignment: 'right', ...g },
      { text: fmt(tStop, 0), alignment: 'right', ...g },
      { text: fmt(avg(eSum), 2), alignment: 'right', ...g },
      { text: fmt(avg(uSum), 2), alignment: 'right', ...g },
      { text: fmt((avg(eSum) + avg(uSum)) / 2, 2), alignment: 'right', ...g },
    ]);
  }

  return { table: { headerRows: 2, dontBreakRows: true, widths: WIDTHS, body }, layout: tableLayout(), margin: [0, 0, 0, 8] };
}

function buildDocDefinition({ data, companyName, companyLogo, fromDate, toDate }) {
  const tables = [];
  for (const d of DEPTS) {
    const rows = data[d.key] || [];
    if (rows.length) tables.push(buildDeptTable(d.title, rows));
  }
  if (!tables.length) {
    tables.push({ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] });
  }
  return buildPage({ companyName, companyLogo, title: TITLE, fromDate, toDate, tables });
}

export const prodnOverallShiftWiseReport = (req, res) =>
  runMultiReport(req, res, {
    fileName: FILE_NAME,
    procs: [
      { key: 'carding', spName: 'sp_Prodn_CardingProdnDetails_GetAll' },
      { key: 'drawing', spName: 'sp_Prodn_DrawingProdnDetails_GetAll' },
      { key: 'unilap', spName: 'sp_Prodn_UnilapProdnDetails_GetAll' },
      { key: 'comber', spName: 'sp_Prodn_ComberProdnDetails_GetAll' },
      { key: 'finisherDrawing', spName: 'sp_Prodn_FinisherDrawingProdnDetails_GetAll' },
      { key: 'simplex', spName: 'sp_Prodn_SimplexProdnDetails_GetAll' },
    ],
    buildDocDefinition,
  });
