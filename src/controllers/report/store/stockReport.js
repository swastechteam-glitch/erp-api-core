// reports/stockReport.js
// Three Stock Statement reports sharing one SP.
//   sp_Stock_Statement (CompanyCode, FromDate, ToDate, ReceiptIssueBased=0)
//
// Exports:
//   groupWise              -> "LEDGER ABSTRACT" (Group -> Category, with value cols)
//   departmentWiseValue    -> "STORE RECEIPT & ISSUE REGISTER - DEPARTMENT WISE"
//   departmentWiseClosing  -> "DEPARTMENT WISE CLOSING STOCK"

import { buildTrendChart } from '../cotton/_common.js';

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

const ddmmyyyy = (d) => {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yy = dt.getFullYear();
  return `${dd}/${mm}/${yy}`;
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
  hLineColor: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? '#1A3C7B' : COLORS.borderColor),
  vLineColor: () => COLORS.borderColor,
  paddingLeft: () => 4,
  paddingRight: () => 4,
  paddingTop: () => 6,
  paddingBottom: () => 6
};

const baseFooter = (currentPage, pageCount) => ({
  margin: [0, 12, 0, 0],
  columns: [
    { text: 'Report Printed : ' + new Date().toLocaleString('en-GB'), fontSize: 7, margin: [15, 0, 0, 0] },
    { text: `Page ${currentPage} of ${pageCount}`, alignment: 'right', fontSize: 7, margin: [0, 0, 15, 0] }
  ]
});

const titleBlock = (companyName, title, fromDate, toDate) => ({
  stack: [
    { text: companyName, alignment: 'center', fontSize: 16, bold: true, color: '#7B3F00', margin: [0, 0, 0, 6] },
    { text: title, alignment: 'center', fontSize: 12, bold: true, color: '#008000', margin: [0, 0, 0, 6] },
    { text: `From : ${ddmmyyyy(fromDate)}    To : ${ddmmyyyy(toDate)}`, alignment: 'center', fontSize: 10, bold: true, margin: [0, 0, 0, 10] }
  ]
});

// Build a new-page summary table with one row per group plus a grand-total
// row. `totalCols` is an array of { header, key, digits? } describing the
// numeric columns to include. `groupSummaries` is an array of { label, totals }.
function buildGroupSummaryPage({ companyName, fromDate, toDate, title, groupHeader, groupSummaries, grandTotals, totalCols }) {
  const hdr = (text) => ({ text, bold: true, fillColor: '#1A3C7B', color: '#FFFFFF', alignment: 'center', fontSize: 8 });

  const headerRow = [hdr('S.No'), hdr(groupHeader), ...totalCols.map(c => hdr(c.header))];

  const dataRows = groupSummaries.map((gs, i) => {
    const zebra = i % 2 === 1 ? '#FAFBFD' : null;
    return [
      { text: String(i + 1), alignment: 'center', fontSize: 8, fillColor: zebra },
      { text: gs.label, alignment: 'left', fontSize: 8, fillColor: zebra },
      ...totalCols.map(c => ({
        text: fmt(gs.totals[c.key] || 0, c.digits != null ? c.digits : 2),
        alignment: 'right', fontSize: 8, fillColor: zebra
      }))
    ];
  });

  const totalRow = [
    { text: 'Total', colSpan: 2, alignment: 'right', bold: true, color: '#FFFFFF', fillColor: '#1A3C7B', fontSize: 9 },
    {},
    ...totalCols.map(c => ({
      text: fmt(grandTotals[c.key] || 0, c.digits != null ? c.digits : 2),
      alignment: 'right', bold: true, color: '#FFFFFF', fillColor: '#1A3C7B', fontSize: 9
    }))
  ];

  const widths = [30, '*', ...totalCols.map(() => 70)];

  // Summary now renders FIRST — no pageBreak here; the detail title block in
  // each builder gets `pageBreak: 'before'` instead.
  return [
    {
      stack: [
        { text: companyName, alignment: 'center', fontSize: 16, bold: true, color: '#7B3F00', margin: [0, 0, 0, 6] },
        { text: title, alignment: 'center', fontSize: 12, bold: true, color: '#008000', margin: [0, 0, 0, 6] },
        { text: `From : ${ddmmyyyy(fromDate)}    To : ${ddmmyyyy(toDate)}`, alignment: 'center', fontSize: 10, bold: true, margin: [0, 0, 0, 10] }
      ]
    },
    {
      table: { headerRows: 1, dontBreakRows: true, widths, body: [headerRow, ...dataRows, totalRow] },
      layout: {
        hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0.4),
        vLineWidth: () => 0.4,
        hLineColor: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? '#1A3C7B' : COLORS.borderColor),
        vLineColor: () => COLORS.borderColor,
        paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 6, paddingBottom: () => 6
      }
    },
    ...buildTrendChart(groupSummaries, totalCols, { groupHeader })
  ];
}

// ============================================================================
// REPORT 1: LEDGER ABSTRACT (Group -> Category)
// ============================================================================
function buildGroupWise(rows, companyName, fromDate, toDate) {
  // Aggregate per ItemGroupCode -> ItemCategoryCode
  const groupsMap = new Map();
  for (const r of rows) {
    const gKey = (r.ItemGroupCode != null ? String(r.ItemGroupCode) : '') + '||' + (str(r, 'ItemGroupName') || '(Unknown Group)');
    if (!groupsMap.has(gKey)) groupsMap.set(gKey, new Map());
    const catMap = groupsMap.get(gKey);
    const cKey = (r.ItemCategoryCode != null ? String(r.ItemCategoryCode) : '') + '||' + (str(r, 'ItemCategoryName') || '(Unknown Category)');
    if (!catMap.has(cKey)) {
      catMap.set(cKey, {
        ItemGroupName: str(r, 'ItemGroupName'),
        ItemCategoryName: str(r, 'ItemCategoryName'),
        OpnValue: 0, InValue: 0, InwardReturnValue: 0, OutwardValue: 0,
        IssueReturnValue: 0, InwAdjValue: 0, RecAdjValue: 0, ClosingValue: 0
      });
    }
    const a = catMap.get(cKey);
    a.OpnValue += dec(r, 'OpnValue');
    a.InValue += dec(r, 'InValue');
    a.InwardReturnValue += dec(r, 'InwardReturnValue');
    a.OutwardValue += dec(r, 'OutwardValue');
    a.IssueReturnValue += dec(r, 'IssueReturnValue');
    a.InwAdjValue += dec(r, 'InwAdjValue');
    a.RecAdjValue += dec(r, 'RecAdjValue');
    a.ClosingValue += dec(r, 'ClosingValue');
  }

  const body = [];
  const widths = [70, '*', 76, 76, 76, 76, 76, 64, 64, 76];

  const headers = ['Group Name', 'Category Name', 'Opening Value', 'Purchase Value', 'Pur. Rtn. Value',
                   'Issue Value', 'Iss. Rtn. Value', 'Add Value', 'Less Value', 'Closing Value'];
  body.push(headers.map(t => ({
    text: t, bold: true, fillColor: COLORS.headerFill, color: COLORS.headerText,
    alignment: 'center', fontSize: 8
  })));

  const totals = { OpnValue: 0, InValue: 0, InwardReturnValue: 0, OutwardValue: 0,
                   IssueReturnValue: 0, InwAdjValue: 0, RecAdjValue: 0, ClosingValue: 0 };
  const groupSummaries = [];

  const sortedGroupKeys = [...groupsMap.keys()].sort((a, b) => {
    const an = a.split('||')[1] || '';
    const bn = b.split('||')[1] || '';
    return an.localeCompare(bn);
  });

  for (const gKey of sortedGroupKeys) {
    const catMap = groupsMap.get(gKey);
    const sortedCatKeys = [...catMap.keys()].sort((a, b) => {
      const an = a.split('||')[1] || '';
      const bn = b.split('||')[1] || '';
      return an.localeCompare(bn);
    });

    const groupSub = { OpnValue: 0, InValue: 0, InwardReturnValue: 0, OutwardValue: 0,
                       IssueReturnValue: 0, InwAdjValue: 0, RecAdjValue: 0, ClosingValue: 0 };

    let firstRow = true;
    let rowIdx = 0;
    for (const cKey of sortedCatKeys) {
      const a = catMap.get(cKey);
      const zebra = rowIdx % 2 === 1 ? COLORS.zebraFill : null;
      const cell = (text, align = 'right') => ({ text, alignment: align, fontSize: 8, fillColor: zebra });
      body.push([
        { text: firstRow ? a.ItemGroupName : '', alignment: 'left', fontSize: 8, fillColor: zebra, bold: firstRow },
        cell(a.ItemCategoryName, 'left'),
        cell(fmt(a.OpnValue)),
        cell(fmt(a.InValue)),
        cell(fmt(a.InwardReturnValue)),
        cell(fmt(a.OutwardValue)),
        cell(fmt(a.IssueReturnValue)),
        cell(fmt(a.InwAdjValue)),
        cell(fmt(a.RecAdjValue)),
        cell(fmt(a.ClosingValue))
      ]);
      for (const k of Object.keys(groupSub)) groupSub[k] += a[k];
      firstRow = false;
      rowIdx++;
    }

    // Group total row
    const subCell = (text, align = 'right') => ({
      text, alignment: align, bold: true, color: COLORS.subText, fillColor: COLORS.subFill, fontSize: 8
    });
    body.push([
      { text: 'TOTAL', colSpan: 2, alignment: 'right', bold: true, color: COLORS.subText, fillColor: COLORS.subFill, fontSize: 8 },
      {},
      subCell(fmt(groupSub.OpnValue)),
      subCell(fmt(groupSub.InValue)),
      subCell(fmt(groupSub.InwardReturnValue)),
      subCell(fmt(groupSub.OutwardValue)),
      subCell(fmt(groupSub.IssueReturnValue)),
      subCell(fmt(groupSub.InwAdjValue)),
      subCell(fmt(groupSub.RecAdjValue)),
      subCell(fmt(groupSub.ClosingValue))
    ]);

    groupSummaries.push({
      label: gKey.split('||')[1] || '',
      totals: { ...groupSub }
    });

    for (const k of Object.keys(totals)) totals[k] += groupSub[k];
  }

  // Grand total
  const grandCell = (text, align = 'right') => ({
    text, alignment: align, bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: 9
  });
  body.push([
    { text: 'GRAND TOTAL', colSpan: 2, alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: 9 },
    {},
    grandCell(fmt(totals.OpnValue)),
    grandCell(fmt(totals.InValue)),
    grandCell(fmt(totals.InwardReturnValue)),
    grandCell(fmt(totals.OutwardValue)),
    grandCell(fmt(totals.IssueReturnValue)),
    grandCell(fmt(totals.InwAdjValue)),
    grandCell(fmt(totals.RecAdjValue)),
    grandCell(fmt(totals.ClosingValue))
  ]);

  const summaryNodes = buildGroupSummaryPage({
    companyName, fromDate, toDate,
    title: 'LEDGER ABSTRACT SUMMARY - GROUP WISE',
    groupHeader: 'Group Name',
    groupSummaries,
    grandTotals: totals,
    totalCols: [
      { header: 'Opening Value', key: 'OpnValue' },
      { header: 'Purchase Value', key: 'InValue' },
      { header: 'Pur. Rtn. Value', key: 'InwardReturnValue' },
      { header: 'Issue Value', key: 'OutwardValue' },
      { header: 'Iss. Rtn. Value', key: 'IssueReturnValue' },
      { header: 'Add Value', key: 'InwAdjValue' },
      { header: 'Less Value', key: 'RecAdjValue' },
      { header: 'Closing Value', key: 'ClosingValue' }
    ]
  });

  return {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [15, 20, 15, 45],
    footer: baseFooter,
    content: [
      ...summaryNodes,
      { ...titleBlock(companyName, 'LEDGER ABSTRACT', fromDate, toDate), pageBreak: 'before' },
      {
        table: { headerRows: 1, dontBreakRows: true, keepWithHeaderRows: 0, widths, body },
        layout: baseLayout
      }
    ],
    defaultStyle: { font: 'Roboto', fontSize: 8, lineHeight: 1.25 }
  };
}

// ============================================================================
// REPORT 2: STORE RECEIPT & ISSUE REGISTER - DEPARTMENT WISE
// ============================================================================
function buildDepartmentWiseValue(rows, companyName, fromDate, toDate) {
  // Aggregate per Department
  const aggMap = new Map();
  for (const r of rows) {
    const key = (r.DepartmentCode != null ? String(r.DepartmentCode) : '') + '||' +
                (str(r, 'DepartmentName_English') || str(r, 'DepartmentName') || '(Unknown Department)');
    if (!aggMap.has(key)) {
      aggMap.set(key, {
        DepartmentName: str(r, 'DepartmentName_English') || str(r, 'DepartmentName'),
        OpnValue: 0, PurInwardValue: 0, OutwardValue: 0, ClosingValue: 0
      });
    }
    const a = aggMap.get(key);
    a.OpnValue += dec(r, 'OpnValue');
    a.PurInwardValue += dec(r, 'PurInwardValue');
    a.OutwardValue += dec(r, 'OutwardValue');
    a.ClosingValue += dec(r, 'ClosingValue');
  }

  const sortedKeys = [...aggMap.keys()].sort((a, b) => {
    const an = a.split('||')[1] || '';
    const bn = b.split('||')[1] || '';
    return an.localeCompare(bn);
  });

  const body = [];
  const widths = ['*', 100, 100, 100, 100, 100];

  const headers = ['Department', 'Opening Balance (INR)', 'Purchase (INR)', 'Total (INR)', 'Issue (INR)', 'Closing Balance (INR)'];
  body.push(headers.map(t => ({
    text: t, bold: true, fillColor: COLORS.headerFill, color: COLORS.headerText,
    alignment: 'center', fontSize: 8
  })));

  const totals = { OpnValue: 0, PurInwardValue: 0, Total: 0, OutwardValue: 0, ClosingValue: 0 };
  const groupSummaries = [];

  let rowIdx = 0;
  for (const k of sortedKeys) {
    const a = aggMap.get(k);
    const total = a.OpnValue + a.PurInwardValue;
    const zebra = rowIdx % 2 === 1 ? COLORS.zebraFill : null;
    const cell = (text, align = 'right') => ({ text, alignment: align, fontSize: 8, fillColor: zebra });
    body.push([
      { text: a.DepartmentName, alignment: 'left', fontSize: 8, fillColor: zebra },
      cell(fmt(a.OpnValue)),
      cell(fmt(a.PurInwardValue)),
      cell(fmt(total)),
      cell(fmt(a.OutwardValue)),
      cell(fmt(a.ClosingValue))
    ]);
    groupSummaries.push({
      label: a.DepartmentName,
      totals: { OpnValue: a.OpnValue, PurInwardValue: a.PurInwardValue, Total: total, OutwardValue: a.OutwardValue, ClosingValue: a.ClosingValue }
    });
    totals.OpnValue += a.OpnValue;
    totals.PurInwardValue += a.PurInwardValue;
    totals.Total += total;
    totals.OutwardValue += a.OutwardValue;
    totals.ClosingValue += a.ClosingValue;
    rowIdx++;
  }

  // Grand total
  const grandCell = (text, align = 'right') => ({
    text, alignment: align, bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: 9
  });
  body.push([
    { text: 'Grand Total', alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: 9 },
    grandCell(fmt(totals.OpnValue)),
    grandCell(fmt(totals.PurInwardValue)),
    grandCell(fmt(totals.Total)),
    grandCell(fmt(totals.OutwardValue)),
    grandCell(fmt(totals.ClosingValue))
  ]);

  const summaryNodes = buildGroupSummaryPage({
    companyName, fromDate, toDate,
    title: 'STORE RECEIPT & ISSUE REGISTER - SUMMARY',
    groupHeader: 'Department',
    groupSummaries,
    grandTotals: totals,
    totalCols: [
      { header: 'Opening Balance (INR)', key: 'OpnValue' },
      { header: 'Purchase (INR)', key: 'PurInwardValue' },
      { header: 'Total (INR)', key: 'Total' },
      { header: 'Issue (INR)', key: 'OutwardValue' },
      { header: 'Closing Balance (INR)', key: 'ClosingValue' }
    ]
  });

  return {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [15, 20, 15, 45],
    footer: baseFooter,
    content: [
      ...summaryNodes,
      { ...titleBlock(companyName, 'STORE RECEIPT & ISSUE REGISTER', fromDate, toDate), pageBreak: 'before' },
      {
        table: { headerRows: 1, dontBreakRows: true, keepWithHeaderRows: 0, widths, body },
        layout: baseLayout
      }
    ],
    defaultStyle: { font: 'Roboto', fontSize: 8, lineHeight: 1.25 }
  };
}

// ============================================================================
// REPORT 3: DEPARTMENT WISE CLOSING STOCK
// ============================================================================
function buildDepartmentWiseClosing(rows, companyName, fromDate, toDate) {
  // Group by DepartmentCode, then by ItemCode
  const groupsMap = new Map();
  for (const r of rows) {
    const dKey = (r.DepartmentCode != null ? String(r.DepartmentCode) : '') + '||' +
                 (str(r, 'DepartmentName_English') || str(r, 'DepartmentName') || '(Unknown Department)');
    if (!groupsMap.has(dKey)) groupsMap.set(dKey, new Map());
    const itemMap = groupsMap.get(dKey);
    const iKey = r.ItemCode != null ? String(r.ItemCode) : (str(r, 'ItemID') + '||' + str(r, 'ItemName'));
    if (!itemMap.has(iKey)) {
      itemMap.set(iKey, {
        ItemID: str(r, 'ItemID'),
        ItemName: str(r, 'ItemName'),
        PartNumber: str(r, 'PartNumber'),
        Closing: 0
      });
    }
    const a = itemMap.get(iKey);
    a.Closing += dec(r, 'Closing');
  }

  const body = [];
  const widths = [80, '*', 120, 90];

  const headers = ['Item ID', 'Name', 'Part Number', 'Qty'];
  body.push(headers.map(t => ({
    text: t, bold: true, fillColor: COLORS.headerFill, color: COLORS.headerText,
    alignment: 'center', fontSize: 8
  })));

  let grandClosing = 0;
  const groupSummaries = [];

  const sortedDeptKeys = [...groupsMap.keys()].sort((a, b) => {
    const an = a.split('||')[1] || '';
    const bn = b.split('||')[1] || '';
    return an.localeCompare(bn);
  });

  for (const dKey of sortedDeptKeys) {
    const itemMap = groupsMap.get(dKey);
    const deptName = dKey.split('||')[1] || '';

    // Department header row
    body.push([
      { text: deptName, colSpan: 4, bold: true, color: COLORS.groupText, fillColor: COLORS.groupFill, fontSize: 9, margin: [2, 2, 0, 2] },
      {}, {}, {}
    ]);

    const sortedItemKeys = [...itemMap.keys()].sort((a, b) => {
      const aN = itemMap.get(a).ItemName || '';
      const bN = itemMap.get(b).ItemName || '';
      return aN.localeCompare(bN);
    });

    let deptTotal = 0;
    let rowIdx = 0;
    for (const iKey of sortedItemKeys) {
      const a = itemMap.get(iKey);
      if (a.Closing === 0) continue;
      const zebra = rowIdx % 2 === 1 ? COLORS.zebraFill : null;
      body.push([
        { text: a.ItemID, alignment: 'center', fontSize: 8, fillColor: zebra },
        { text: a.ItemName, alignment: 'left', fontSize: 8, fillColor: zebra },
        { text: a.PartNumber, alignment: 'left', fontSize: 8, fillColor: zebra },
        { text: fmt(a.Closing, 3), alignment: 'right', fontSize: 8, fillColor: zebra }
      ]);
      deptTotal += a.Closing;
      rowIdx++;
    }

    // Department subtotal
    body.push([
      { text: 'Department Wise Total', colSpan: 3, alignment: 'right', bold: true, color: COLORS.subText, fillColor: COLORS.subFill, fontSize: 8 },
      {}, {},
      { text: fmt(deptTotal, 3), alignment: 'right', bold: true, color: COLORS.subText, fillColor: COLORS.subFill, fontSize: 8 }
    ]);

    groupSummaries.push({
      label: deptName,
      totals: { Closing: deptTotal }
    });

    grandClosing += deptTotal;
  }

  // Grand total
  body.push([
    { text: 'Grand Total', colSpan: 3, alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: 9 },
    {}, {},
    { text: fmt(grandClosing, 3), alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: 9 }
  ]);

  const summaryNodes = buildGroupSummaryPage({
    companyName, fromDate, toDate,
    title: 'DEPARTMENT WISE CLOSING STOCK - SUMMARY',
    groupHeader: 'Department',
    groupSummaries,
    grandTotals: { Closing: grandClosing },
    totalCols: [
      { header: 'Closing Qty', key: 'Closing', digits: 3 }
    ]
  });

  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: [20, 20, 20, 45],
    footer: baseFooter,
    content: [
      ...summaryNodes,
      { ...titleBlock(companyName, 'DEPARTMENT WISE CLOSING STOCK', fromDate, toDate), pageBreak: 'before' },
      {
        table: { headerRows: 1, dontBreakRows: true, keepWithHeaderRows: 0, widths, body },
        layout: baseLayout
      }
    ],
    defaultStyle: { font: 'Roboto', fontSize: 8, lineHeight: 1.25 }
  };
}

export const groupWise = { buildDocDefinition: buildGroupWise };
export const departmentWiseValue = { buildDocDefinition: buildDepartmentWiseValue };
export const departmentWiseClosing = { buildDocDefinition: buildDepartmentWiseClosing };

export default { groupWise, departmentWiseValue, departmentWiseClosing };
