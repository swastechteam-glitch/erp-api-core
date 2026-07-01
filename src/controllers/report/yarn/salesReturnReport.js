// reports/yarn/salesReturnReport.js
// Yarn Sales Return reports sharing one SP and one builder factory.
//   sp_SalesReturn_GetAll (CompanyCode, FromDate, ToDate)
//
// Exports: dateWise, customerWise
// Each exports { buildDocDefinition(rows, companyName, fromDate, toDate, companyLogo) }.
//
// Mirrors:
//   rptSalesReturnDateWise.rdlc       -> dateWise      (grouped by Sales Return Date)
//   rptSalesReturnCustomerWise.rdlc   -> customerWise  (grouped by Customer)
//
// Each renders a leading summary page (one row per group + Net Total), then the
// grouped detail with a per-group Total and a Grand Total. Company logo on every
// title block. Both show a From / To date range.

import { chartFromRows } from '../cotton/_common.js';

const dec = (row, col) => {
  const v = row[col];
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};
const str = (row, col) => {
  const v = row[col];
  return (v === null || v === undefined) ? '' : String(v);
};
const fmt = (n, digits = 2) =>
  Number(n).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const intFmt = (n) =>
  Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const ddmmyyyy = (d) => {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yy = dt.getFullYear();
  return `${dd}/${mm}/${yy}`;
};
const isoDate = (d) => {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '0000-00-00';
  return dt.toISOString().slice(0, 10);
};

const COLORS = {
  headerFill: '#1A3C7B',
  headerText: '#FFFFFF',
  groupFill: '#E8F0FE',
  groupText: '#1A3C7B',
  zebraFill: '#FAFBFD',
  subFill: '#EEF2F7',
  subText: '#1A3C7B',
  grandFill: '#1A3C7B',
  grandText: '#FFFFFF',
  borderColor: '#D7DCE3'
};

const baseLayout = {
  hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0.4),
  vLineWidth: () => 0.4,
  hLineColor: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? COLORS.headerFill : COLORS.borderColor),
  vLineColor: () => COLORS.borderColor,
  paddingLeft: () => 4,
  paddingRight: () => 4,
  paddingTop: () => 5,
  paddingBottom: () => 5
};

const baseFooter = (currentPage, pageCount) => ({
  margin: [0, 12, 0, 0],
  columns: [
    { text: 'Developed by Swas Technologies, Report Printed : ' + new Date().toLocaleString('en-GB'), fontSize: 7, margin: [15, 0, 0, 0] },
    { text: `Page ${currentPage} of ${pageCount}`, alignment: 'right', fontSize: 7, margin: [0, 0, 15, 0] }
  ]
});

const titleBlock = (companyName, title, dateLine, logoDataUri) => {
  const LOGO_COL_WIDTH = 90;
  const logoCol = logoDataUri
    ? { image: logoDataUri, fit: [80, 80], width: LOGO_COL_WIDTH, alignment: 'left', margin: [4, 0, 0, 0] }
    : { text: '', width: LOGO_COL_WIDTH };
  const textCol = {
    width: '*',
    stack: [
      { text: companyName, alignment: 'center', fontSize: 16, bold: true, color: '#7B3F00', margin: [0, 0, 0, 6] },
      { text: title, alignment: 'center', fontSize: 12, bold: true, color: '#008000', margin: [0, 0, 0, 6] },
      { text: dateLine, alignment: 'center', fontSize: 10, bold: true }
    ]
  };
  return {
    columns: [logoCol, textCol, { text: '', width: LOGO_COL_WIDTH }],
    margin: [0, 0, 0, 10]
  };
};

const cellText = (c, r, idx) => {
  if (c.kind === 'sno') return String(idx);
  if (c.kind === 'text') return str(r, c.key);
  if (c.kind === 'date') return ddmmyyyy(r[c.key]);
  const v = dec(r, c.key);
  return (c.kind === 'kgs') ? fmt(v, 2) : intFmt(v);
};
const totalText = (c, val) => (c.kind === 'kgs') ? fmt(val, 2) : intFmt(val);

const headerCells = (columns, fs) =>
  columns.map(c => ({ text: c.header, bold: true, fillColor: COLORS.headerFill, color: COLORS.headerText, alignment: 'center', fontSize: fs }));

// Leading summary page — one row per group with the aggregated total columns + Net Total.
function buildSummaryPage({ COLS, rows, config, companyName, dateLine, companyLogo }) {
  const fs = config.fontSize;
  const totalCols = COLS.filter(c => c.total);
  const summaryCols = [
    { header: 'S.No', width: 32, align: 'center' },
    { header: config.summaryGroupHeader, width: '*', align: 'left' },
    ...totalCols.map(c => ({ header: c.header, width: c.width, kind: c.kind }))
  ];
  const body = [headerCells(summaryCols, fs)];

  const groupsMap = new Map();
  for (const r of rows) {
    const k = config.groupKey(r);
    if (!groupsMap.has(k)) groupsMap.set(k, { label: config.groupLabel(r), rows: [] });
    groupsMap.get(k).rows.push(r);
  }
  const keys = [...groupsMap.keys()].sort(config.sortKeys || ((a, b) => a.localeCompare(b)));

  const grand = {};
  for (const c of totalCols) grand[c.key] = 0;

  let sno = 1;
  for (const key of keys) {
    const g = groupsMap.get(key);
    const sums = {};
    for (const c of totalCols) sums[c.key] = 0;
    for (const r of g.rows) for (const c of totalCols) sums[c.key] += dec(r, c.key);
    const zebra = sno % 2 === 0 ? COLORS.zebraFill : null;
    const cells = [
      { text: String(sno), alignment: 'center', fontSize: fs, fillColor: zebra },
      { text: g.label, alignment: 'left', fontSize: fs, fillColor: zebra }
    ];
    for (const c of totalCols) {
      cells.push({ text: totalText(c, sums[c.key]), alignment: 'right', fontSize: fs, fillColor: zebra });
      grand[c.key] += sums[c.key];
    }
    body.push(cells);
    sno++;
  }

  const totalRow = [
    { text: 'Net Total :', colSpan: 2, alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: fs },
    {}
  ];
  for (const c of totalCols) totalRow.push({ text: totalText(c, grand[c.key]), alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: fs });
  body.push(totalRow);

  return [
    titleBlock(companyName, config.summaryTitle, dateLine, companyLogo),
    {
      table: { headerRows: 1, dontBreakRows: true, keepWithHeaderRows: 0, widths: summaryCols.map(c => c.width), body },
      layout: baseLayout
    }
  ];
}

function makeBuilder(config) {
  return function buildDocDefinition(rows, companyName, fromDate, toDate, companyLogo) {
    const COLS = config.columns;
    const colCount = COLS.length;
    const fs = config.fontSize;
    const firstTotal = COLS.findIndex(c => c.total);
    // Approval-Pending has no period (its SP takes only CompanyCode) — the RDLC
    // shows no From/To line, so `noDateLine` blanks it here too.
    const dateLine = config.noDateLine
      ? ''
      : `From Date : ${ddmmyyyy(fromDate)}    To Date : ${ddmmyyyy(toDate)}`;
    const sortKey = config.rowSortKey || 'SalesReturnNo';

    const body = [headerCells(COLS, fs)];

    const dataRow = (r, idx, zebra) =>
      COLS.map(c => ({ text: cellText(c, r, idx), alignment: c.align || 'left', fontSize: fs, fillColor: zebra }));

    const totalsRow = (label, totals, fill, color) => {
      const row = [{ text: label, colSpan: firstTotal, alignment: 'right', bold: true, color, fillColor: fill, fontSize: fs }];
      for (let k = 1; k < firstTotal; k++) row.push({});
      for (let i = firstTotal; i < COLS.length; i++) {
        const c = COLS[i];
        row.push(c.total
          ? { text: totalText(c, totals[c.key] || 0), alignment: 'right', bold: true, color, fillColor: fill, fontSize: fs }
          : { text: '', fillColor: fill });
      }
      return row;
    };

    const groupsMap = new Map();
    for (const r of rows) {
      const k = config.groupKey(r);
      if (!groupsMap.has(k)) groupsMap.set(k, { label: config.groupLabel(r), rows: [] });
      groupsMap.get(k).rows.push(r);
    }
    const keys = [...groupsMap.keys()].sort(config.sortKeys || ((a, b) => a.localeCompare(b)));

    const grand = {};
    for (const c of COLS) if (c.total) grand[c.key] = 0;

    for (const key of keys) {
      const g = groupsMap.get(key);
      const ghr = [{ text: g.label, colSpan: colCount, bold: true, color: COLORS.groupText, fillColor: COLORS.groupFill, fontSize: fs + 1, margin: [2, 2, 0, 2] }];
      for (let i = 1; i < colCount; i++) ghr.push({});
      body.push(ghr);

      const sub = {};
      for (const c of COLS) if (c.total) sub[c.key] = 0;
      const sorted = g.rows.slice().sort((a, b) => dec(a, sortKey) - dec(b, sortKey));
      let idx = 1;
      for (const r of sorted) {
        body.push(dataRow(r, idx, idx % 2 === 0 ? COLORS.zebraFill : null));
        for (const c of COLS) if (c.total) sub[c.key] += dec(r, c.key);
        idx++;
      }
      body.push(totalsRow('Total', sub, COLORS.subFill, COLORS.subText));
      for (const c of COLS) if (c.total) grand[c.key] += sub[c.key];
    }
    body.push(totalsRow('Grand Total', grand, COLORS.grandFill, COLORS.grandText));

    const summaryNodes = buildSummaryPage({ COLS, rows, config, companyName, dateLine, companyLogo });
    const detailTitle = titleBlock(companyName, config.title, dateLine, companyLogo);
    detailTitle.pageBreak = 'before';

    return {
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [15, 20, 15, 45],
      footer: baseFooter,
      content: [
        ...summaryNodes,
        ...chartFromRows(rows, {
          groupKey: config.groupKey, groupLabel: config.groupLabel,
          valueFn: (r) => dec(r, config.chartValueKey || 'TotalNetWt'),
          valueHeader: config.chartValueHeader || 'Total Net Wt',
          groupHeader: config.summaryGroupHeader, digits: 2
        }),
        detailTitle,
        {
          table: { headerRows: 1, dontBreakRows: true, keepWithHeaderRows: 0, widths: COLS.map(c => c.width), body },
          layout: baseLayout
        }
      ],
      defaultStyle: { font: 'Roboto', fontSize: fs, lineHeight: 1.2 }
    };
  };
}

// Shared total columns (Sales Bags / Sales Kgs / Total Qty as integers; weights to 2 dp)
const bags = { key: 'SalesBags', header: 'Sales Bags', width: 55, align: 'right', kind: 'int', total: true };
const kgs = { key: 'SalesKgs', header: 'Sales Kgs', width: 60, align: 'right', kind: 'int', total: true };
const qty = { key: 'TotalQty', header: 'Total Qty', width: 55, align: 'right', kind: 'int', total: true };
const gross = { key: 'TotalGrossWt', header: 'Total Gross Wt', width: 65, align: 'right', kind: 'kgs', total: true };
const tare = { key: 'TotalTareWt', header: 'Total Tare Wt', width: 65, align: 'right', kind: 'kgs', total: true };
const net = { key: 'TotalNetWt', header: 'Total Net Wt', width: 65, align: 'right', kind: 'kgs', total: true };

// Approval-level trailing columns (sp_SalesReturnApproval_GetAll / _Pending):
// approval user / node / date. Non-total text columns after the weight totals.
const apprUser = { key: 'UName', header: 'Approval User', width: 70, align: 'left', kind: 'text' };
const apprNode = { key: 'NodeName', header: 'Approval Node', width: 70, align: 'left', kind: 'text' };
const apprDate = { key: 'C_Date', header: 'Approval Date', width: 62, align: 'center', kind: 'date' };

// Bale/item-level columns (sp_SalesReturnDetails_GetAll) — the "(Detailed)" reports.
const dQty = { key: 'Qty', header: 'Qty', width: 45, align: 'right', kind: 'int', total: true };
const dGross = { key: 'GrossWt', header: 'Gross Wt', width: 60, align: 'right', kind: 'kgs', total: true };
const dTare = { key: 'TareWt', header: 'Tare Wt', width: 60, align: 'right', kind: 'kgs', total: true };
const dNet = { key: 'NetWt', header: 'Net Wt', width: 60, align: 'right', kind: 'kgs', total: true };
const billNo = { header: 'Bill No', width: 60, align: 'left', key: 'BillNo', kind: 'text' };
const billDate = { header: 'Bill Date', width: 60, align: 'center', key: 'BillDate', kind: 'date' };
const partyBillNo = { header: 'Party Bill No', width: 62, align: 'left', key: 'PartyBillNo', kind: 'text' };
const partyBillDate = { header: 'Party Bill Date', width: 62, align: 'center', key: 'PartyBillDate', kind: 'date' };
const gatePassNo = { header: 'Gate Pass No', width: 55, align: 'center', key: 'GoodsPassnumber', kind: 'int' };
const bagNo = { header: 'Bag No', width: 55, align: 'left', key: 'BagNo', kind: 'text' };

// ============================================================================
// DATE WISE — grouped by Sales Return Date
// ============================================================================
const dateWiseConfig = {
  title: 'SALES RETURN - DATE WISE',
  summaryTitle: 'SALES RETURN SUMMARY - DATE WISE',
  summaryGroupHeader: 'S.Rtn Date',
  fontSize: 8,
  groupKey: (r) => isoDate(r.SalesReturnDate),
  groupLabel: (r) => 'Date : ' + ddmmyyyy(r.SalesReturnDate),
  sortKeys: (a, b) => a.localeCompare(b),
  columns: [
    { header: 'S.No', width: 28, align: 'center', kind: 'sno' },
    { header: 'S.Rtn No', width: 55, align: 'center', key: 'SalesReturnNo', kind: 'int' },
    { header: 'Employee Name', width: '*', align: 'left', key: 'EmployeeName', kind: 'text' },
    { header: 'Customer Name', width: '*', align: 'left', key: 'CustomerName', kind: 'text' },
    { header: 'Delivery Customer', width: '*', align: 'left', key: 'DeliveryCustomerName', kind: 'text' },
    bags, kgs, qty, gross, tare, net
  ]
};

// ============================================================================
// CUSTOMER WISE — grouped by Customer
// ============================================================================
const customerWiseConfig = {
  title: 'SALES RETURN - CUSTOMER WISE',
  summaryTitle: 'SALES RETURN SUMMARY - CUSTOMER WISE',
  summaryGroupHeader: 'Customer Name',
  fontSize: 8,
  groupKey: (r) => (r.CustomerCode != null ? String(r.CustomerCode) : '') + '||' + (str(r, 'CustomerName') || '(Unknown)'),
  groupLabel: (r) => str(r, 'CustomerName') || '(Unknown)',
  sortKeys: (a, b) => (a.split('||')[1] || '').localeCompare(b.split('||')[1] || ''),
  columns: [
    { header: 'S.No', width: 28, align: 'center', kind: 'sno' },
    { header: 'S.Rtn No', width: 55, align: 'center', key: 'SalesReturnNo', kind: 'int' },
    { header: 'S.Rtn Date', width: 60, align: 'center', key: 'SalesReturnDate', kind: 'date' },
    { header: 'Employee Name', width: '*', align: 'left', key: 'EmployeeName', kind: 'text' },
    { header: 'Delivery Customer', width: '*', align: 'left', key: 'DeliveryCustomerName', kind: 'text' },
    bags, kgs, qty, gross, tare, net
  ]
};

// ============================================================================
// APPROVAL — grouped by Sales Return Date (sp_SalesReturnApproval_GetAll)
//   rptSalesReturnApprovalDateWise.rdlc
// ============================================================================
const approvalConfig = {
  title: 'SALES RETURN APPROVAL - DATE WISE',
  summaryTitle: 'SALES RETURN APPROVAL SUMMARY - DATE WISE',
  summaryGroupHeader: 'S.Rtn Date',
  fontSize: 8,
  groupKey: (r) => isoDate(r.SalesReturnDate),
  groupLabel: (r) => 'Date : ' + ddmmyyyy(r.SalesReturnDate),
  sortKeys: (a, b) => a.localeCompare(b),
  columns: [
    { header: 'S.No', width: 26, align: 'center', kind: 'sno' },
    { header: 'S.Rtn No', width: 48, align: 'center', key: 'SalesReturnNo', kind: 'int' },
    { header: 'Employee Name', width: '*', align: 'left', key: 'EmployeeName', kind: 'text' },
    { header: 'Customer Name', width: '*', align: 'left', key: 'CustomerName', kind: 'text' },
    { header: 'Delivery Customer', width: '*', align: 'left', key: 'DeliveryCustomerName', kind: 'text' },
    bags, kgs, qty, gross, tare, net, apprUser, apprNode, apprDate
  ]
};

// ============================================================================
// APPROVAL PENDING — grouped by Sales Return Date (sp_SalesReturnApprovalPending)
//   rptSalesReturnApprovalPendingDateWise.rdlc — SP takes only CompanyCode, so
//   there is no date range on the report (noDateLine).
// ============================================================================
const approvalPendingConfig = {
  title: 'SALES RETURN APPROVAL PENDING - DATE WISE',
  summaryTitle: 'SALES RETURN APPROVAL PENDING SUMMARY - DATE WISE',
  summaryGroupHeader: 'S.Rtn Date',
  fontSize: 8,
  noDateLine: true,
  groupKey: (r) => isoDate(r.SalesReturnDate),
  groupLabel: (r) => 'Date : ' + ddmmyyyy(r.SalesReturnDate),
  sortKeys: (a, b) => a.localeCompare(b),
  columns: [
    { header: 'S.No', width: 26, align: 'center', kind: 'sno' },
    { header: 'S.Rtn No', width: 48, align: 'center', key: 'SalesReturnNo', kind: 'int' },
    { header: 'Employee Name', width: '*', align: 'left', key: 'EmployeeName', kind: 'text' },
    { header: 'Customer Name', width: '*', align: 'left', key: 'CustomerName', kind: 'text' },
    { header: 'Delivery Customer', width: '*', align: 'left', key: 'DeliveryCustomerName', kind: 'text' },
    bags, kgs, qty, gross, tare, net, apprUser, apprNode, apprDate
  ]
};

// ============================================================================
// CUSTOMER WISE (DETAILED) — grouped by Customer (sp_SalesReturnDetails_GetAll)
//   rptSalesReturnCustomerWiseDetails.rdlc — bale/item-level rows.
// ============================================================================
const customerWiseDetailedConfig = {
  title: 'SALES RETURN DETAILS - CUSTOMER WISE',
  summaryTitle: 'SALES RETURN DETAILS SUMMARY - CUSTOMER WISE',
  summaryGroupHeader: 'Customer Name',
  fontSize: 8,
  chartValueKey: 'NetWt',
  chartValueHeader: 'Net Wt',
  groupKey: (r) => (r.CustomerCode != null ? String(r.CustomerCode) : '') + '||' + (str(r, 'CustomerName') || '(Unknown)'),
  groupLabel: (r) => str(r, 'CustomerName') || '(Unknown)',
  sortKeys: (a, b) => (a.split('||')[1] || '').localeCompare(b.split('||')[1] || ''),
  columns: [
    { header: 'S.No', width: 26, align: 'center', kind: 'sno' },
    { header: 'S.Rtn No', width: 48, align: 'center', key: 'SalesReturnNo', kind: 'int' },
    { header: 'S.Rtn Date', width: 60, align: 'center', key: 'SalesReturnDate', kind: 'date' },
    { header: 'Employee Name', width: '*', align: 'left', key: 'EmployeeName', kind: 'text' },
    billNo, billDate, partyBillNo, partyBillDate, gatePassNo, bagNo, dQty, dGross, dTare, dNet
  ]
};

// ============================================================================
// DATE WISE (DETAILED) — grouped by Sales Return Date (sp_SalesReturnDetails_GetAll)
//   rptSalesReturnDateWiseDetails.rdlc — bale/item-level rows.
// ============================================================================
const dateWiseDetailedConfig = {
  title: 'SALES RETURN DETAILS - DATE WISE',
  summaryTitle: 'SALES RETURN DETAILS SUMMARY - DATE WISE',
  summaryGroupHeader: 'S.Rtn Date',
  fontSize: 8,
  chartValueKey: 'NetWt',
  chartValueHeader: 'Net Wt',
  groupKey: (r) => isoDate(r.SalesReturnDate),
  groupLabel: (r) => 'Date : ' + ddmmyyyy(r.SalesReturnDate),
  sortKeys: (a, b) => a.localeCompare(b),
  columns: [
    { header: 'S.No', width: 26, align: 'center', kind: 'sno' },
    { header: 'S.Rtn No', width: 48, align: 'center', key: 'SalesReturnNo', kind: 'int' },
    { header: 'Employee Name', width: '*', align: 'left', key: 'EmployeeName', kind: 'text' },
    { header: 'Customer Name', width: '*', align: 'left', key: 'CustomerName', kind: 'text' },
    billNo, billDate, partyBillNo, partyBillDate, gatePassNo, bagNo, dQty, dGross, dTare, dNet
  ]
};

export const dateWise = { buildDocDefinition: makeBuilder(dateWiseConfig) };
export const customerWise = { buildDocDefinition: makeBuilder(customerWiseConfig) };
export const approvalDateWise = { buildDocDefinition: makeBuilder(approvalConfig) };
export const approvalPendingDateWise = { buildDocDefinition: makeBuilder(approvalPendingConfig) };
export const customerWiseDetailed = { buildDocDefinition: makeBuilder(customerWiseDetailedConfig) };
export const dateWiseDetailed = { buildDocDefinition: makeBuilder(dateWiseDetailedConfig) };

export default { dateWise, customerWise, approvalDateWise, approvalPendingDateWise, customerWiseDetailed, dateWiseDetailed };
