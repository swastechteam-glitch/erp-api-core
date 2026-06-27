// =============================================================================
// Waste ▸ Usable Waste Production Report  (WinForms rptUsablewasteProductionDateWise)
// =============================================================================
//   GET /waste/reports/usable-waste-production/date-wise
//     sp_UsableWasteStock_GetByUsableWasteProductionDate (CompanyCode/FromDate/ToDate)
//
// Mirrors rptUsabelWasteProductionDateWise.rdlc — two parts:
//   1. "Usable Waste Bale Details" — bale lines grouped by production Date, then
//      by Usable Waste Item, with per-item + per-date + grand totals.
//   2. "Usable Waste Bale Details - Summary" — one row per Date (G/T/N weight).
//
// Functional filters mirror the VB DataResult.Select("... IN (...)") in-memory:
//   SupervisorCodes       -> SupervisorCode       (Supervisor multi-select)
//   EmployeeCodes         -> EmployeeCode          (Employee multi-select)
//   UsableWasteItemCodes  -> UsableWasteItemCode   (Item Name multi-select)
//
// Options come from GET /waste/reports/usable-waste-production/options
// -> { supervisors, employees, usableWasteItems }.
// =============================================================================

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy
} from '../cotton/_common.js';
import { getPool } from '../../../config/dynamicDB.js';

// --- in-memory CSV filters ---------------------------------------------------
const csvSet = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const set = new Set(String(v).split(',').map((x) => x.trim()).filter((x) => x !== ''));
  return set.size ? set : null;
};

function applyFilters(rows, query = {}) {
  let out = rows || [];
  const sups = csvSet(query.SupervisorCodes);
  const emps = csvSet(query.EmployeeCodes);
  const items = csvSet(query.UsableWasteItemCodes);
  if (sups) out = out.filter((r) => sups.has(String(dec(r, 'SupervisorCode'))));
  if (emps) out = out.filter((r) => emps.has(String(dec(r, 'EmployeeCode'))));
  if (items) out = out.filter((r) => items.has(String(dec(r, 'UsableWasteItemCode'))));
  return out;
}

// --- cell helpers ------------------------------------------------------------
const H = (hs) => hs.map((t) => ({ text: t, bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 8 }));
const C = (t, a = 'right', z = null) => ({ text: t, alignment: a, fontSize: 8, fillColor: z });
const T = (t, a = 'right') => ({ text: t, alignment: a, bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 8 });
const itemHdr = (t) => ({ text: t, bold: true, fontSize: 8, color: colors.groupText, fillColor: colors.groupFill, alignment: 'left' });
const zof = (i) => (i % 2 === 1 ? colors.zebraFill : null);
const dayKey = (r) => ddmmyyyy(r.UsableWasteProductionDate);

function groupByKey(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate, query }) {
  const data = applyFilters(rows, query);
  const widths = [34, '*', 86, 86, 86];
  const headers = ['S.No', 'Bale No', 'Gross Weight', 'Tare Weight', 'Net Weight'];
  const tables = [];

  // ---- Part 1: Bale Details grouped by Date -> Item ----
  const byDate = groupByKey(data, dayKey);
  const dateKeys = [...byDate.keys()].sort(
    (a, b) => new Date(a.split('/').reverse().join('-')) - new Date(b.split('/').reverse().join('-'))
  );
  const grand = { g: 0, t: 0, n: 0, bales: 0 };

  for (const dk of dateKeys) {
    const dayRows = byDate.get(dk);
    const body = [H(headers)];
    const dayTot = { g: 0, t: 0, n: 0, bales: 0 };

    const byItem = groupByKey(dayRows, (r) => str(r, 'UsableWasteItemName') || '(No Item)');
    for (const ik of [...byItem.keys()].sort((a, b) => a.localeCompare(b))) {
      const list = byItem.get(ik);
      body.push([{ ...itemHdr(ik), colSpan: 5 }, {}, {}, {}, {}]);
      const it = { g: 0, t: 0, n: 0 };
      list.forEach((r, i) => {
        const z = zof(i);
        it.g += dec(r, 'GrossWeight'); it.t += dec(r, 'TareWeight'); it.n += dec(r, 'NetWeight');
        body.push([
          C(String(i + 1), 'center', z), C(str(r, 'BaleNo'), 'right', z),
          C(fmt(dec(r, 'GrossWeight'), 3), 'right', z), C(fmt(dec(r, 'TareWeight'), 3), 'right', z), C(fmt(dec(r, 'NetWeight'), 3), 'right', z),
        ]);
      });
      body.push([{ text: `Total (${list.length} bale)`, alignment: 'right', bold: true, color: colors.groupText, colSpan: 2 }, {},
        { text: fmt(it.g, 3), alignment: 'right', bold: true, color: colors.groupText },
        { text: fmt(it.t, 3), alignment: 'right', bold: true, color: colors.groupText },
        { text: fmt(it.n, 3), alignment: 'right', bold: true, color: colors.groupText }]);
      dayTot.g += it.g; dayTot.t += it.t; dayTot.n += it.n; dayTot.bales += list.length;
    }

    body.push([{ ...T(`Date Total (${dayTot.bales})`, 'right'), colSpan: 2 }, {}, T(fmt(dayTot.g, 3)), T(fmt(dayTot.t, 3)), T(fmt(dayTot.n, 3))]);
    grand.g += dayTot.g; grand.t += dayTot.t; grand.n += dayTot.n; grand.bales += dayTot.bales;

    tables.push({ text: dk, bold: true, fontSize: 9, color: colors.subText, fillColor: colors.subFill, margin: [0, 8, 0, 2] });
    tables.push({ table: { headerRows: 1, widths, body }, layout: tableLayout() });
  }

  if (!tables.length) {
    return buildPage({ companyName, companyLogo, title: 'USABLE WASTE BALE DETAILS', fromDate, toDate,
      tables: [{ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] }] });
  }

  tables.push({
    margin: [0, 6, 0, 0],
    table: { widths, body: [[{ ...T(`Grand Total (${grand.bales})`, 'right'), colSpan: 2 }, {}, T(fmt(grand.g, 3)), T(fmt(grand.t, 3)), T(fmt(grand.n, 3))]] },
    layout: tableLayout()
  });

  // ---- Part 2: Date-wise Summary (one row per date) ----
  const sumWidths = [34, '*', 96, 96, 96];
  const sumBody = [H(['S.No', 'Date', 'Gross Weight', 'Tare Weight', 'Net Weight'])];
  dateKeys.forEach((dk, i) => {
    const dayRows = byDate.get(dk);
    const g = dayRows.reduce((a, r) => a + dec(r, 'GrossWeight'), 0);
    const t = dayRows.reduce((a, r) => a + dec(r, 'TareWeight'), 0);
    const n = dayRows.reduce((a, r) => a + dec(r, 'NetWeight'), 0);
    const z = zof(i);
    sumBody.push([C(String(i + 1), 'center', z), C(dk, 'center', z), C(fmt(g, 3), 'right', z), C(fmt(t, 3), 'right', z), C(fmt(n, 3), 'right', z)]);
  });
  sumBody.push([{ ...T('Total', 'right'), colSpan: 2 }, {}, T(fmt(grand.g, 3)), T(fmt(grand.t, 3)), T(fmt(grand.n, 3))]);
  tables.push({ text: 'Summary (Date Wise)', bold: true, fontSize: 11, color: colors.titleColor, margin: [0, 14, 0, 4], pageBreak: 'before' });
  tables.push({ table: { headerRows: 1, widths: sumWidths, body: sumBody }, layout: tableLayout() });

  return buildPage({ companyName, companyLogo, title: 'USABLE WASTE BALE DETAILS', fromDate, toDate, tables });
}

export const usableWasteProductionReport = (req, res) =>
  runReport(req, res, {
    spName: 'sp_UsableWasteStock_GetByUsableWasteProductionDate',
    fileName: 'UsableWasteProduction_DateWise',
    buildDocDefinition,
  });

// GET /waste/reports/usable-waste-production/options — Supervisor / Employee /
// Item Name lookups for the report's functional filters.
export const usableWasteProductionOptions = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).json({ success: false, message: 'Missing subDBName header' });
    const pool = await getPool(subDbName);

    const [supervisors, employees, items] = await Promise.all([
      pool.request().query('SELECT SupervisorCode, SupervisorName FROM tbl_SuperVisor ORDER BY SupervisorName'),
      pool.request().query('SELECT EmployeeCode, EmployeeName FROM tbl_Employee ORDER BY EmployeeName'),
      pool.request().query('SELECT UsableWasteItemCode, UsableWasteItemName FROM tbl_UsableWasteItem ORDER BY UsableWasteItemName'),
    ]);

    return res.json({
      success: true,
      data: {
        supervisors: supervisors.recordset.map((s) => ({ value: s.SupervisorCode, label: s.SupervisorName })),
        employees: employees.recordset.map((e) => ({ value: e.EmployeeCode, label: e.EmployeeName })),
        usableWasteItems: items.recordset.map((w) => ({ value: w.UsableWasteItemCode, label: w.UsableWasteItemName })),
      },
    });
  } catch (err) {
    console.error('DB Error (usableWasteProductionOptions):', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
