// Waste Invoice Approval — Date Wise.
// Port of the VB "Approval (Date Wise)" report (rptWasteInvoiceApprovalDateWise.rdlc).
// Invoice-level rows grouped by WasteInvoiceDate, each date with a Total row and
// a final Grand Total. Customer / Tax Type filters apply (the approval recordset
// is invoice-level, so the Waste Item filter is not applicable — matching the VB
// which only filtered Customer + WasteTaxType for this branch).
//
// SP: sp_WasteInvocieApproval_GetAll (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy
} from '../cotton/_common.js';

const TITLE = 'WASTE SALES REPORT - APPROVAL (DATE WISE)';
const FILE_NAME = 'WasteInvoice_ApprovalDateWise';

const csvSet = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const s = new Set(String(v).split(',').map((x) => x.trim()).filter(Boolean));
  return s.size ? s : null;
};

const NUM = [
  { key: 'TotalQty', label: 'Qty', digits: 0 },
  { key: 'TotalFirstWeight', label: 'First Wt', digits: 3 },
  { key: 'TotalSecondWeight', label: 'Second Wt', digits: 3 },
  { key: 'TotalWeighBridgeWt', label: 'W.B Wt', digits: 3 },
  { key: 'TotalSalesWeight', label: 'Billing Wt', digits: 3 },
  { key: 'BasicValue', label: 'Basic Value', digits: 2 },
  { key: 'CGST', label: 'CGST', digits: 2 },
  { key: 'SGST', label: 'SGST', digits: 2 },
  { key: 'IGST', label: 'IGST', digits: 2 },
  { key: 'RoundedOff', label: 'R/Off', digits: 2 },
  { key: 'NetAmount', label: 'Net Amount', digits: 2 }
];
const NUM_WIDTHS = [26, 42, 42, 42, 44, 50, 40, 40, 40, 34, 52];

const headRow = (headers) =>
  headers.map((h) => ({
    text: h, bold: true, fillColor: colors.headerFill, color: colors.headerText,
    alignment: 'center', fontSize: 7
  }));
const td = (text, align = 'right', zebra = null) =>
  ({ text, alignment: align, fontSize: 7, fillColor: zebra });
const subCell = (text, align = 'right') =>
  ({ text, alignment: align, bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 7 });
const totalCell = (text, align = 'right') =>
  ({ text, alignment: align, bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 7 });
const zebraOf = (i) => (i % 2 === 1 ? colors.zebraFill : null);

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate, query }) {
  const cust = csvSet(query && query.CustomerCodes);
  const tax = csvSet(query && query.WasteTaxTypeCodes);
  const src = (rows || []).filter((r) => {
    if (cust && !cust.has(String(dec(r, 'CustomerCode')))) return false;
    if (tax && !tax.has(String(dec(r, 'WasteTaxTypeCode')))) return false;
    return true;
  });

  const headers = ['S.No', 'Invoice No', 'Customer Name', ...NUM.map((n) => n.label)];
  const widths = [24, 46, '*', ...NUM_WIDTHS];
  const tables = [];

  const byDate = groupBy(src, (r) => (r.WasteInvoiceDate ? new Date(r.WasteInvoiceDate).toISOString().slice(0, 10) : ''));
  const dateKeys = [...byDate.keys()].sort((a, b) => new Date(a) - new Date(b));
  const grand = {};

  for (const dk of dateKeys) {
    const list = byDate.get(dk);
    const body = [headRow(headers)];
    const sub = {};
    let i = 0;
    for (const r of list) {
      const z = zebraOf(i);
      body.push([
        td(String(i + 1), 'center', z),
        td(str(r, 'WasteInvoiceNostr') || str(r, 'WasteInvoiceNo'), 'center', z),
        td(str(r, 'CustomerName'), 'left', z),
        ...NUM.map((n) => {
          const v = dec(r, n.key);
          sub[n.key] = (sub[n.key] || 0) + v;
          return td(fmt(v, n.digits), 'right', z);
        })
      ]);
      i++;
    }
    body.push([
      { ...subCell('Total', 'right'), colSpan: 3 }, {}, {},
      ...NUM.map((n) => {
        grand[n.key] = (grand[n.key] || 0) + (sub[n.key] || 0);
        return subCell(fmt(sub[n.key] || 0, n.digits));
      })
    ]);
    tables.push(
      { text: `Date : ${ddmmyyyy(list[0].WasteInvoiceDate)}`, bold: true, fontSize: 9, color: colors.subText, fillColor: colors.subFill, margin: [0, 8, 0, 2] },
      { table: { headerRows: 1, widths, body }, layout: tableLayout() }
    );
  }

  if (!tables.length) {
    tables.push({ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] });
  } else {
    tables.push({
      margin: [0, 6, 0, 0],
      table: {
        widths,
        body: [[
          { ...totalCell('Grand Total', 'right'), colSpan: 3 }, {}, {},
          ...NUM.map((n) => totalCell(fmt(grand[n.key] || 0, n.digits)))
        ]]
      },
      layout: tableLayout()
    });
  }
  return buildPage({ companyName, companyLogo, title: TITLE, fromDate, toDate, tables });
}

export const wasteInvoiceApprovalReport = (req, res) => {
  return runReport(req, res, {
    spName: 'sp_WasteInvocieApproval_GetAll',
    fileName: FILE_NAME,
    buildDocDefinition
  });
};
