// Mechanical — Maintenance Item Life Span report.
// Mirrors rptMaintenceItemLifeSpan.rdlc (sp_Maintence_Item_LifeSpan),
// grouped Branch -> Department (single report). Shares the cotton/_common
// PDF pipeline (logo + trend chart included).

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

// ---- columns (sp_Maintence_Item_LifeSpan) ----------------------------------
const COLUMNS = [
  { header: 'S.No', width: 28, align: 'center', value: (r, i) => String(i + 1) },
  { header: 'Machine', width: '*', value: (r) => str(r, 'MachineName') },
  { header: 'Service Activity', width: '*', value: (r) => str(r, 'ServiceActivityName') },
  { header: 'Duration', width: 56, align: 'center', value: (r) => fmt(dec(r, 'ScheduleDurationDays'), 0) },
  { header: 'Item', width: '*', value: (r) => str(r, 'ItemName') },
  { header: 'Cur. Date', width: 64, align: 'center', value: (r) => ddmmyyyy(r.CurSBDate) },
  { header: 'Per. Date', width: 64, align: 'center', value: (r) => ddmmyyyy(r.PerSBDate) },
  { header: 'Per. Life Span', width: 64, align: 'center', value: (r) => fmt(dec(r, 'PerLifeSpan'), 0) },
  { header: 'Cur. Running Days', width: 70, align: 'center', value: (r) => fmt(dec(r, 'RunningDays'), 0) }
];

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate }) {
  const widths = COLUMNS.map((c) => c.width);
  const span = COLUMNS.length;
  const tables = [];

  // chart: number of items per Department
  for (const node of chartFromRows(rows, {
    groupKey: (r) => str(r, 'DepartmentCode') || str(r, 'DepartmentName'),
    groupLabel: (r) => str(r, 'DepartmentName'),
    valueFn: () => 1, valueHeader: 'Items', groupHeader: 'Department', digits: 0
  })) tables.push(node);

  // grouped Branch -> Department (matches the RDLC)
  const groups = groupBy(rows || [], (r) => `${str(r, 'BranchCode') || str(r, 'BranchName')}||${str(r, 'DepartmentCode') || str(r, 'DepartmentName')}`);
  const keys = [...groups.keys()].sort((a, b) => {
    const ga = groups.get(a)[0], gb = groups.get(b)[0];
    const bn = String(str(ga, 'BranchName')).localeCompare(String(str(gb, 'BranchName')));
    return bn !== 0 ? bn : (dec(ga, 'OrderNo') - dec(gb, 'OrderNo'));
  });

  for (const k of keys) {
    const list = groups.get(k);
    const head = list[0];
    const label = `${str(head, 'BranchName')}${str(head, 'BranchName') ? ' / ' : ''}${str(head, 'DepartmentName')}`;
    const body = [headRow(COLUMNS), groupRowNode(label, span)];
    list.forEach((r, i) => {
      const z = zebraOf(i);
      body.push(COLUMNS.map((c) => ({ text: c.value(r, i), alignment: c.align || 'left', fontSize: 8, fillColor: z })));
    });
    tables.push({ table: { headerRows: 1, widths, body }, layout: tableLayout(), margin: [0, 0, 0, 8] });
  }
  if (keys.length === 0) tables.push({ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] });

  return buildPage({ companyName, companyLogo, title: 'MAINTENANCE ITEM LIFE SPAN', fromDate, toDate, tables });
}

export const maintenanceLifeSpan = (req, res) => runReport(req, res, {
  spName: 'sp_Maintence_Item_LifeSpan',
  fileName: 'MaintenanceItemLifeSpan',
  buildDocDefinition
});
