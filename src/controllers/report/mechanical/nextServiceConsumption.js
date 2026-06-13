// Mechanical — Next Service Consumption reports.
// Mirrors:
//   rptMaintenance_Consumption_ItemWise / _MachineWise / _DepartmentWise.rdlc
//       (sp_Maintenance_Consumption_GetAll) — "Service Consumption"
//   rptMaintenance_LastMaintenanceDate_Consumption_ItemWise/MachineWise_New.rdlc
//       (sp_Schedule_BreakDownDetails_GetAll) — "Last Service Consumption"
//   rptMaintenceItemStock.rdlc (sp_Store_Maintence_StockStatus) — item stock status
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

// ---- column dictionary -----------------------------------------------------
const C = {
  sno: { header: 'S.No', width: 28, align: 'center', value: (r, i) => String(i + 1) },
  item: { header: 'Item Name', width: '*', value: (r) => str(r, 'ItemName') },
  machine: { header: 'Machine', width: '*', value: (r) => str(r, 'MachineName') },
  service: { header: 'Service Activity', width: '*', value: (r) => str(r, 'ServiceActivityName') },
  uom: { header: 'UOM', width: 48, align: 'center', value: (r) => str(r, 'UOMName') },
  qty: { header: 'Qty', width: 56, align: 'right', value: (r) => fmt(dec(r, 'Qty'), 2), sum: 'qty' },
  rate: { header: 'Rate', width: 56, align: 'right', value: (r) => fmt(dec(r, 'Rate'), 2) },
  amount: { header: 'Amount', width: 72, align: 'right', value: (r) => fmt(dec(r, 'Amount'), 2), sum: 'amount' },
  amountCalc: { header: 'Amount', width: 72, align: 'right', value: (r) => fmt(dec(r, 'Qty') * dec(r, 'Rate'), 2), sum: 'amount' },
  nextDate: { header: 'Next Service Date', width: 70, align: 'center', value: (r) => ddmmyyyy(r.NextServiceDate) },
  sbDate: { header: 'Service Date', width: 70, align: 'center', value: (r) => ddmmyyyy(r.SBDate) }
};

function buildGrouped({ rows, companyName, companyLogo, fromDate, toDate, title, columns, groupKey, groupLabel, sortGroups, qtyNum, amountNum, chartGroupHeader }) {
  const widths = columns.map((c) => c.width);
  const span = columns.length;
  const firstSum = columns.findIndex((c) => c.sum); // first numeric column
  const sub = (t, a = 'right') => ({ text: t, alignment: a, bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 8 });
  const grand = (t, a = 'right') => ({ text: t, alignment: a, bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 });
  const tables = [];

  for (const node of chartFromRows(rows, {
    groupKey, groupLabel, valueFn: amountNum, valueHeader: 'Amount',
    groupHeader: chartGroupHeader, digits: 2
  })) tables.push(node);

  const groups = groupBy(rows || [], groupKey);
  const keys = [...groups.keys()];
  if (sortGroups) keys.sort(sortGroups);
  let gQty = 0, gAmt = 0;

  for (const k of keys) {
    const list = groups.get(k).slice().sort((a, b) => String(a.ItemName || '').localeCompare(String(b.ItemName || '')));
    const body = [headRow(columns), groupRowNode(groupLabel(list[0]), span)];
    let sQty = 0, sAmt = 0;
    list.forEach((r, i) => {
      const z = zebraOf(i);
      sQty += qtyNum(r); sAmt += amountNum(r);
      body.push(columns.map((c) => ({ text: c.value(r, i), alignment: c.align || 'left', fontSize: 8, fillColor: z })));
    });
    gQty += sQty; gAmt += sAmt;

    const strow = [{ ...sub('Sub Total'), colSpan: firstSum }];
    for (let i = 1; i < firstSum; i++) strow.push({});
    for (let i = firstSum; i < columns.length; i++) {
      const c = columns[i];
      strow.push(sub(c.sum === 'qty' ? fmt(sQty, 2) : c.sum === 'amount' ? fmt(sAmt, 2) : ''));
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
      gt.push(grand(c.sum === 'qty' ? fmt(gQty, 2) : c.sum === 'amount' ? fmt(gAmt, 2) : ''));
    }
    tables.push({ margin: [0, 4, 0, 0], table: { widths, body: [gt] }, layout: tableLayout() });
  }
  return buildPage({ companyName, companyLogo, title, fromDate, toDate, tables });
}

const qtyOf = (r) => dec(r, 'Qty');
const amtOf = (r) => dec(r, 'Amount');
const amtCalc = (r) => dec(r, 'Qty') * dec(r, 'Rate');
const byStr = (a, b) => String(a).localeCompare(String(b));

// ============================================================================
// sp_Maintenance_Consumption_GetAll — Service Consumption
// ============================================================================
export const consumptionItemWise = (req, res) => runReport(req, res, {
  spName: 'sp_Maintenance_Consumption_GetAll', fileName: 'ServiceConsumption_ItemWise',
  buildDocDefinition: (ctx) => buildGrouped({
    ...ctx, title: 'SERVICE CONSUMPTION DETAILS - ITEM WISE',
    columns: [C.sno, C.machine, C.service, C.uom, C.qty, C.rate, C.amount],
    groupKey: (r) => str(r, 'ItemCode') || str(r, 'ItemName'), groupLabel: (r) => str(r, 'ItemName'),
    sortGroups: byStr, qtyNum: qtyOf, amountNum: amtOf, chartGroupHeader: 'Item'
  })
});

export const consumptionMachineWise = (req, res) => runReport(req, res, {
  spName: 'sp_Maintenance_Consumption_GetAll', fileName: 'ServiceConsumption_MachineWise',
  buildDocDefinition: (ctx) => buildGrouped({
    ...ctx, title: 'SERVICE CONSUMPTION DETAILS - MACHINE WISE',
    columns: [C.sno, C.item, C.service, C.uom, C.qty, C.rate, C.amount],
    groupKey: (r) => str(r, 'MachineCode') || str(r, 'MachineName'), groupLabel: (r) => str(r, 'MachineName'),
    sortGroups: byStr, qtyNum: qtyOf, amountNum: amtOf, chartGroupHeader: 'Machine'
  })
});

export const consumptionDepartmentWise = (req, res) => runReport(req, res, {
  spName: 'sp_Maintenance_Consumption_GetAll', fileName: 'ServiceConsumption_DepartmentWise',
  buildDocDefinition: (ctx) => buildGrouped({
    ...ctx, title: 'SERVICE CONSUMPTION DETAILS - DEPARTMENT WISE',
    columns: [C.sno, C.machine, C.item, C.uom, C.qty, C.rate, C.amount],
    groupKey: (r) => str(r, 'DepartmentCode') || str(r, 'DepartmentName'), groupLabel: (r) => str(r, 'DepartmentName'),
    sortGroups: byStr, qtyNum: qtyOf, amountNum: amtOf, chartGroupHeader: 'Department'
  })
});

export const consumptionDateWise = (req, res) => runReport(req, res, {
  spName: 'sp_Maintenance_Consumption_GetAll', fileName: 'ServiceConsumption_DateWise',
  buildDocDefinition: (ctx) => buildGrouped({
    ...ctx, title: 'SERVICE CONSUMPTION DETAILS - DATE WISE',
    columns: [C.sno, C.item, C.machine, C.service, C.uom, C.qty, C.rate, C.amount],
    groupKey: (r) => (r.NextServiceDate ? new Date(r.NextServiceDate).toISOString().slice(0, 10) : ''),
    groupLabel: (r) => ddmmyyyy(r.NextServiceDate),
    sortGroups: (a, b) => new Date(a) - new Date(b), qtyNum: qtyOf, amountNum: amtOf, chartGroupHeader: 'Date'
  })
});

// ============================================================================
// sp_Schedule_BreakDownDetails_GetAll — Last Service Consumption
// ============================================================================
export const lastConsumptionItemWise = (req, res) => runReport(req, res, {
  spName: 'sp_Schedule_BreakDownDetails_GetAll', fileName: 'LastServiceConsumption_ItemWise',
  buildDocDefinition: (ctx) => buildGrouped({
    ...ctx, title: 'LAST SERVICE CONSUMPTION DETAILS - ITEM WISE',
    columns: [C.sno, C.sbDate, C.machine, C.service, C.uom, C.qty, C.rate, C.amountCalc],
    groupKey: (r) => str(r, 'ItemCode') || str(r, 'ItemName'), groupLabel: (r) => str(r, 'ItemName'),
    sortGroups: byStr, qtyNum: qtyOf, amountNum: amtCalc, chartGroupHeader: 'Item'
  })
});

export const lastConsumptionMachineWise = (req, res) => runReport(req, res, {
  spName: 'sp_Schedule_BreakDownDetails_GetAll', fileName: 'LastServiceConsumption_MachineWise',
  buildDocDefinition: (ctx) => buildGrouped({
    ...ctx, title: 'LAST SERVICE CONSUMPTION DETAILS - MACHINE WISE',
    columns: [C.sno, C.sbDate, C.item, C.service, C.uom, C.qty, C.rate, C.amountCalc],
    groupKey: (r) => str(r, 'MachineCode') || str(r, 'MachineName'), groupLabel: (r) => str(r, 'MachineName'),
    sortGroups: byStr, qtyNum: qtyOf, amountNum: amtCalc, chartGroupHeader: 'Machine'
  })
});

// ============================================================================
// sp_Store_Maintence_StockStatus — Maintenance Item Stock
// ============================================================================
function buildItemStock({ rows, companyName, companyLogo, fromDate, toDate }) {
  const columns = [
    { header: 'S.No', width: 28, align: 'center', value: (r, i) => String(i + 1) },
    { header: 'Item Name', width: '*', value: (r) => str(r, 'ItemName') },
    { header: 'UOM', width: 48, align: 'center', value: (r) => str(r, 'ItemUomName') },
    { header: 'Required Qty', width: 66, align: 'right', value: (r) => fmt(dec(r, 'RequiredQty'), 2) },
    { header: 'Stock Qty', width: 60, align: 'right', value: (r) => fmt(dec(r, 'StockQty'), 2) },
    { header: 'PO Reserve Qty', width: 70, align: 'right', value: (r) => fmt(dec(r, 'ResQty'), 2) },
    { header: 'Need Qty', width: 60, align: 'right', value: (r) => { const n = dec(r, 'NeedQty'); return fmt(n > 0 ? n : 0, 2); } },
    { header: 'Excess Qty', width: 60, align: 'right', value: (r) => { const n = dec(r, 'NeedQty'); return fmt(n < 0 ? -n : 0, 2); } }
  ];
  const widths = columns.map((c) => c.width);
  const tables = [];

  for (const node of chartFromRows(rows, {
    groupKey: (r) => str(r, 'ItemCode') || str(r, 'ItemName'), groupLabel: (r) => str(r, 'ItemName'),
    valueFn: (r) => { const n = dec(r, 'NeedQty'); return n > 0 ? n : 0; }, valueHeader: 'Need Qty',
    groupHeader: 'Item', digits: 2
  })) tables.push(node);

  const list = (rows || []).slice();
  if (list.length === 0) {
    tables.push({ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] });
  } else {
    const body = [headRow(columns)];
    list.forEach((r, i) => {
      const z = zebraOf(i);
      body.push(columns.map((c) => ({ text: c.value(r, i), alignment: c.align || 'left', fontSize: 8, fillColor: z })));
    });
    tables.push({ table: { headerRows: 1, widths, body }, layout: tableLayout() });
  }
  return buildPage({ companyName, companyLogo, title: 'MAINTENANCE ITEM STOCK STATUS', fromDate, toDate, tables });
}

export const maintenanceItemStock = (req, res) => runReport(req, res, {
  spName: 'sp_Store_Maintence_StockStatus', fileName: 'Maintenance_ItemStock',
  buildDocDefinition: (ctx) => buildItemStock(ctx)
});
