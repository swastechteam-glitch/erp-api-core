// =============================================================================
// Waste ▸ Usable Waste Issue Report   (WinForms rptUsableWasteItemIssue)
// =============================================================================
//   GET /waste/reports/usable-waste-issue/details
//     sp_UsableWasteItemIssueDetails_GetAll (CompanyCode/FromDate/ToDate)
//
// Mirrors rptUsableWasteItemIssue.rdlc — bale rows grouped by Issue, rendered as
// ONE summary row per issue (S.No / Issue No / Issue Date / Item Name / Qty /
// Gross / Tare / Net Weight) with a grand total (bale count + weight sums).
//
// Functional filters mirror the VB DataResult.Select("... IN (...)") in-memory:
//   SupervisorCodes       -> SupervisorCode       (Supervisor multi-select)
//   EmployeeCodes         -> EmployeeCode          (Employee multi-select)
//   UsableWasteItemCodes  -> UsableWasteItemCode   (Item Name multi-select)
//
// Filter options are shared with the Usable Waste Production report
// (GET /waste/reports/usable-waste-production/options).
// =============================================================================

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy
} from '../cotton/_common.js';

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

const H = (hs) => hs.map((t) => ({ text: t, bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 8 }));
const C = (t, a = 'right', z = null) => ({ text: t, alignment: a, fontSize: 8, fillColor: z });
const T = (t, a = 'right') => ({ text: t, alignment: a, bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 8 });
const zof = (i) => (i % 2 === 1 ? colors.zebraFill : null);

// Collapse bale-level rows into one row per Issue (matches the rdlc group footer).
function aggregateIssues(rows) {
  const map = new Map();
  for (const r of rows) {
    const k = dec(r, 'UsableWasteIssueCode');
    if (!map.has(k)) {
      map.set(k, {
        IssueNo: dec(r, 'UsableWasteIssueNo'),
        IssueDate: r.UsableWasteIssueDate,
        ItemName: str(r, 'UsableWasteItemName'),
        TotalBales: dec(r, 'TotalBales'),
        bales: 0, g: 0, t: 0, n: 0,
      });
    }
    const o = map.get(k);
    o.bales += 1;
    o.g += dec(r, 'GrossWeight');
    o.t += dec(r, 'TareWeight');
    o.n += dec(r, 'NetWeight');
  }
  return [...map.values()].sort((a, b) => a.IssueNo - b.IssueNo);
}

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate, query }) {
  const issues = aggregateIssues(applyFilters(rows, query));
  const widths = [30, 56, 70, '*', 50, 80, 80, 80];
  const headers = ['S.No', 'Issue No', 'Issue Date', 'Item Name', 'Qty', 'Gross Weight', 'Tare Weight', 'Net Weight'];
  const body = [H(headers)];
  const grand = { bales: 0, g: 0, t: 0, n: 0 };

  issues.forEach((it, i) => {
    const z = zof(i);
    grand.bales += it.bales; grand.g += it.g; grand.t += it.t; grand.n += it.n;
    body.push([
      C(String(i + 1), 'center', z), C(String(it.IssueNo), 'center', z), C(ddmmyyyy(it.IssueDate), 'center', z),
      C(it.ItemName, 'left', z), C(fmt(it.TotalBales || it.bales, 0), 'right', z),
      C(fmt(it.g, 3), 'right', z), C(fmt(it.t, 3), 'right', z), C(fmt(it.n, 3), 'right', z),
    ]);
  });

  if (!issues.length) {
    return buildPage({ companyName, companyLogo, title: 'USABLE WASTE ITEM ISSUE DETAILS', fromDate, toDate,
      tables: [{ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] }] });
  }

  body.push([{ ...T('Total', 'right'), colSpan: 4 }, {}, {}, {}, T(fmt(grand.bales, 0)), T(fmt(grand.g, 3)), T(fmt(grand.t, 3)), T(fmt(grand.n, 3))]);

  return buildPage({
    companyName, companyLogo, title: 'USABLE WASTE ITEM ISSUE DETAILS', fromDate, toDate,
    tables: [{ table: { headerRows: 1, widths, body }, layout: tableLayout() }]
  });
}

export const usableWasteIssueReport = (req, res) =>
  runReport(req, res, {
    spName: 'sp_UsableWasteItemIssueDetails_GetAll',
    fileName: 'UsableWasteItemIssue_Details',
    buildDocDefinition,
  });
