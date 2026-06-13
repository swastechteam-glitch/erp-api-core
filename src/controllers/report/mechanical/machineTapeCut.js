// Mechanical — Machine Tape Cut reports.
// Mirrors rptMachinetapecut_ItemWise / _DepartmentWise / _MachineWise.rdlc
// (sp_MachineTapeCut_GetAll). A Date-wise grouping is added to match the menu.
// All share the cotton/_common PDF pipeline (logo + trend chart included).

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy, chartFromRows
} from '../cotton/_common.js';

// ---- helpers ---------------------------------------------------------------
function groupBy(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}
const headRow = (columns) =>
  columns.map((c) => ({ text: c.header, bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 8 }));
const groupRowNode = (label, span) =>
  [{ text: label, colSpan: span, bold: true, color: colors.groupText, fillColor: colors.groupFill, fontSize: 9, margin: [2, 2, 0, 2] }, ...Array(span - 1).fill({})];
const zebraOf = (i) => (i % 2 === 1 ? colors.zebraFill : null);

// ---- column dictionary (sp_MachineTapeCut_GetAll) --------------------------
const C = {
  sno: { header: 'S.No', width: 28, align: 'center', value: (r, i) => String(i + 1) },
  date: { header: 'Tape Cut Date', width: 66, align: 'center', value: (r) => ddmmyyyy(r.TapeCutDate) },
  machine: { header: 'Machine Name', width: '*', value: (r) => str(r, 'MachineName') },
  dept: { header: 'Department', width: '*', value: (r) => str(r, 'DepartmentName') },
  item: { header: 'Item Name', width: '*', value: (r) => str(r, 'ItemName') },
  tapes: { header: 'No Of Tapes / Aprons', width: 80, align: 'right', value: (r) => fmt(dec(r, 'NoOfTapes'), 0), sum: 'tapes' },
  cost: { header: 'Cost', width: 80, align: 'right', value: (r) => fmt(dec(r, 'Amount'), 2), sum: 'cost' }
};

function buildGrouped({ rows, companyName, companyLogo, fromDate, toDate, title, columns, groupKey, groupLabel, sortGroups, chartGroupHeader }) {
  const widths = columns.map((c) => c.width);
  const span = columns.length;
  const firstSum = columns.findIndex((c) => c.sum);
  const sub = (t, a = 'right') => ({ text: t, alignment: a, bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 8 });
  const grand = (t, a = 'right') => ({ text: t, alignment: a, bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 });
  const tables = [];

  for (const node of chartFromRows(rows, {
    groupKey, groupLabel, valueFn: (r) => dec(r, 'Amount'), valueHeader: 'Cost',
    groupHeader: chartGroupHeader, digits: 2
  })) tables.push(node);

  const groups = groupBy(rows || [], groupKey);
  const keys = [...groups.keys()];
  if (sortGroups) keys.sort(sortGroups);
  let gTapes = 0, gCost = 0;

  for (const k of keys) {
    const list = groups.get(k).slice().sort((a, b) => new Date(a.TapeCutDate) - new Date(b.TapeCutDate));
    const body = [headRow(columns), groupRowNode(groupLabel(list[0]), span)];
    let sTapes = 0, sCost = 0;
    list.forEach((r, i) => {
      const z = zebraOf(i);
      sTapes += dec(r, 'NoOfTapes'); sCost += dec(r, 'Amount');
      body.push(columns.map((c) => ({ text: c.value(r, i), alignment: c.align || 'left', fontSize: 8, fillColor: z })));
    });
    gTapes += sTapes; gCost += sCost;

    const strow = [{ ...sub('Sub Total'), colSpan: firstSum }];
    for (let i = 1; i < firstSum; i++) strow.push({});
    for (let i = firstSum; i < columns.length; i++) {
      const c = columns[i];
      strow.push(sub(c.sum === 'tapes' ? fmt(sTapes, 0) : c.sum === 'cost' ? fmt(sCost, 2) : ''));
    }
    body.push(strow);
    tables.push({ table: { headerRows: 1, widths, body }, layout: tableLayout(), margin: [0, 0, 0, 8] });
  }

  if (keys.length === 0) {
    tables.push({ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] });
  } else {
    const gt = [{ ...grand('GRAND TOTAL'), colSpan: firstSum }];
    for (let i = 1; i < firstSum; i++) gt.push({});
    for (let i = firstSum; i < columns.length; i++) {
      const c = columns[i];
      gt.push(grand(c.sum === 'tapes' ? fmt(gTapes, 0) : c.sum === 'cost' ? fmt(gCost, 2) : ''));
    }
    tables.push({ margin: [0, 4, 0, 0], table: { widths, body: [gt] }, layout: tableLayout() });
  }
  return buildPage({ companyName, companyLogo, title, fromDate, toDate, tables });
}

const byStr = (a, b) => String(a).localeCompare(String(b));

// ============================================================================
export const tapeCutItemWise = (req, res) => runReport(req, res, {
  spName: 'sp_MachineTapeCut_GetAll', fileName: 'MachineTapeCut_ItemWise',
  buildDocDefinition: (ctx) => buildGrouped({
    ...ctx, title: 'MACHINE TAPE CUT DETAILS - ITEM WISE',
    columns: [C.sno, C.date, C.machine, C.dept, C.tapes, C.cost],
    groupKey: (r) => str(r, 'ItemCode') || str(r, 'ItemName'), groupLabel: (r) => str(r, 'ItemName'),
    sortGroups: byStr, chartGroupHeader: 'Item'
  })
});

export const tapeCutDepartmentWise = (req, res) => runReport(req, res, {
  spName: 'sp_MachineTapeCut_GetAll', fileName: 'MachineTapeCut_DepartmentWise',
  buildDocDefinition: (ctx) => buildGrouped({
    ...ctx, title: 'MACHINE TAPE CUT DETAILS - DEPARTMENT WISE',
    columns: [C.sno, C.date, C.machine, C.item, C.tapes, C.cost],
    groupKey: (r) => str(r, 'DepartmentCode') || str(r, 'DepartmentName'), groupLabel: (r) => str(r, 'DepartmentName'),
    sortGroups: byStr, chartGroupHeader: 'Department'
  })
});

export const tapeCutMachineWise = (req, res) => runReport(req, res, {
  spName: 'sp_MachineTapeCut_GetAll', fileName: 'MachineTapeCut_MachineWise',
  buildDocDefinition: (ctx) => buildGrouped({
    ...ctx, title: 'MACHINE TAPE CUT DETAILS - MACHINE WISE',
    columns: [C.sno, C.date, C.dept, C.item, C.tapes, C.cost],
    groupKey: (r) => str(r, 'MachineCode') || str(r, 'MachineName'), groupLabel: (r) => str(r, 'MachineName'),
    sortGroups: byStr, chartGroupHeader: 'Machine'
  })
});

export const tapeCutDateWise = (req, res) => runReport(req, res, {
  spName: 'sp_MachineTapeCut_GetAll', fileName: 'MachineTapeCut_DateWise',
  buildDocDefinition: (ctx) => buildGrouped({
    ...ctx, title: 'MACHINE TAPE CUT DETAILS - DATE WISE',
    columns: [C.sno, C.machine, C.dept, C.item, C.tapes, C.cost],
    groupKey: (r) => (r.TapeCutDate ? new Date(r.TapeCutDate).toISOString().slice(0, 10) : ''),
    groupLabel: (r) => ddmmyyyy(r.TapeCutDate),
    sortGroups: (a, b) => new Date(a) - new Date(b), chartGroupHeader: 'Date'
  })
});
