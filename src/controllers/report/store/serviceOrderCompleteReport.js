// reports/serviceOrderCompleteReport.js
// Four Service Order Complete reports sharing one SP.
//   sp_ServiceOrderCompleteDetails_GetAll (CompanyCode, FromDate, ToDate)
//
// Exports:
//   materialDateWise        -> "SERVICE ORDER COMPLETE DETAILS (MATERIAL) - DATE WISE"
//   materialDepartmentWise  -> "SERVICE ORDER COMPLETE DETAILS (MATERIAL) - DEPARTMENT WISE"
//   visitorsDateWise        -> "SERVICE ORDER COMPLETE DETAILS (VISITORS) - DATE WISE"
//   visitorsDepartmentWise  -> "SERVICE ORDER COMPLETE VISITOR DETAILS - DEPARTMENT WISE"

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

const isoDate = (d) => {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '0000-00-00';
  return dt.toISOString().slice(0, 10);
};

// Tax = CGST + SGST + IGST. The Material-DeptWise SP returns `sGSTAmount`
// (lowercase s) while the others return `SGSTAmount`. Read both so either works.
const taxOf = (r) => dec(r, 'CGSTAmount') + dec(r, 'SGSTAmount') + dec(r, 'sGSTAmount') + dec(r, 'IGSTAmount');

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

function makeBuilder(config) {
  return function buildDocDefinition(rows, companyName, fromDate, toDate) {

    const groupsMap = new Map();
    for (const r of rows) {
      const k = config.groupKey(r);
      if (!groupsMap.has(k)) groupsMap.set(k, []);
      groupsMap.get(k).push(r);
    }
    const sortedKeys = [...groupsMap.keys()].sort((a, b) => {
      const an = a.split('||')[0] || '';
      const bn = b.split('||')[0] || '';
      return an.localeCompare(bn);
    });

    const body = [];
    const COLS = config.columns;
    const colCount = COLS.length;

    body.push(COLS.map(c => ({
      text: c.header, bold: true, fillColor: COLORS.headerFill,
      color: COLORS.headerText, alignment: 'center', fontSize: 8
    })));

    const totals = {};
    const groupSummaries = [];
    let sno = 1;

    for (const key of sortedKeys) {
      const group = groupsMap.get(key).slice().sort((a, b) => {
        const da = new Date(a.SODate).getTime() || 0;
        const db = new Date(b.SODate).getTime() || 0;
        if (da !== db) return da - db;
        return dec(a, 'SONo') - dec(b, 'SONo');
      });
      const groupLabel = config.groupLabel(group[0], key);

      const blank = new Array(colCount - 1).fill({});
      body.push([
        { text: groupLabel, colSpan: colCount, bold: true, color: COLORS.groupText, fillColor: COLORS.groupFill, fontSize: 9, margin: [2, 2, 0, 2] },
        ...blank
      ]);

      const sub = {};
      let rowIdx = 0;
      for (const r of group) {
        for (const c of COLS) {
          if (c.totalKey && typeof c.totalFn === 'function') {
            sub[c.totalKey] = (sub[c.totalKey] || 0) + c.totalFn(r);
          }
        }
        const zebra = rowIdx % 2 === 1 ? COLORS.zebraFill : null;
        const ctx = { r, sno, zebra };
        body.push(COLS.map(c => c.cell(ctx)));
        sno++;
        rowIdx++;
      }

      const subRow = COLS.map((c, i) => {
        if (i === 0) {
          return { text: 'Sub Total', colSpan: config.subLabelSpan, alignment: 'right', bold: true, color: COLORS.subText, fillColor: COLORS.subFill, fontSize: 8 };
        }
        if (i > 0 && i < config.subLabelSpan) return {};
        const tkey = c.totalKey;
        if (!tkey) return { text: '', fillColor: COLORS.subFill };
        return { text: fmt(sub[tkey] || 0, c.totalDigits != null ? c.totalDigits : 0), alignment: 'right', bold: true, color: COLORS.subText, fillColor: COLORS.subFill, fontSize: 8 };
      });
      body.push(subRow);

      groupSummaries.push({ label: cleanGroupLabel(groupLabel), sub });

      for (const k of Object.keys(sub)) totals[k] = (totals[k] || 0) + sub[k];
    }

    const grandRow = COLS.map((c, i) => {
      if (i === 0) {
        return { text: 'Grand Total', colSpan: config.subLabelSpan, alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: 9 };
      }
      if (i > 0 && i < config.subLabelSpan) return {};
      const tkey = c.totalKey;
      if (!tkey) return { text: '', fillColor: COLORS.grandFill };
      return { text: fmt(totals[tkey] || 0, c.totalDigits != null ? c.totalDigits : 0), alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: 9 };
    });
    body.push(grandRow);

    const summaryNodes = buildSummaryPage({ COLS, groupSummaries, totals, config, companyName, fromDate, toDate });

    return {
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [15, 20, 15, 45],

      footer: function (currentPage, pageCount) {
        return {
          margin: [0, 12, 0, 0],
          columns: [
            { text: 'Report Printed : ' + new Date().toLocaleString('en-GB'), fontSize: 7, margin: [15, 0, 0, 0] },
            { text: `Page ${currentPage} of ${pageCount}`, alignment: 'right', fontSize: 7, margin: [0, 0, 15, 0] }
          ]
        };
      },

      content: [
        ...summaryNodes,
        {
          stack: [
            { text: companyName, alignment: 'center', fontSize: 16, bold: true, color: '#7B3F00', margin: [0, 0, 0, 6] },
            { text: config.title, alignment: 'center', fontSize: 12, bold: true, color: '#008000', margin: [0, 0, 0, 6] },
            { text: `From : ${ddmmyyyy(fromDate)}    To : ${ddmmyyyy(toDate)}`, alignment: 'center', fontSize: 10, bold: true, margin: [0, 0, 0, 10] }
          ],
          pageBreak: 'before'
        },
        {
          table: {
            headerRows: 1,
            dontBreakRows: true,
            keepWithHeaderRows: 0,
            widths: COLS.map(c => c.width),
            body: body
          },
          layout: {
            hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0.4),
            vLineWidth: () => 0.4,
            hLineColor: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? '#1A3C7B' : COLORS.borderColor),
            vLineColor: () => COLORS.borderColor,
            paddingLeft: () => 4,
            paddingRight: () => 4,
            paddingTop: () => 6,
            paddingBottom: () => 6
          }
        }
      ],

      defaultStyle: { font: 'Roboto', fontSize: 8, lineHeight: 1.25 }
    };
  };
}

const cleanGroupLabel = (label) => {
  const idx = label.indexOf(' : ');
  return idx >= 0 ? label.slice(idx + 3).trim() : label;
};

function buildSummaryPage({ COLS, groupSummaries, totals, config, companyName, fromDate, toDate }) {
  const totalCols = COLS.filter(c => c.totalKey);
  const summaryTitle = (config.title || '').replace(/DETAILS/gi, 'SUMMARY');
  const groupHeader = config.summaryGroupHeader || 'Group';

  const hdrCell = (text) => ({ text, bold: true, fillColor: COLORS.headerFill, color: COLORS.headerText, alignment: 'center', fontSize: 8 });

  const headerRow = [
    hdrCell('S.No'),
    hdrCell(groupHeader),
    ...totalCols.map(c => hdrCell(c.header))
  ];

  const dataRows = groupSummaries.map((gs, i) => {
    const zebra = i % 2 === 1 ? COLORS.zebraFill : null;
    return [
      { text: String(i + 1), alignment: 'center', fontSize: 8, fillColor: zebra },
      { text: gs.label, alignment: 'left', fontSize: 8, fillColor: zebra },
      ...totalCols.map(c => ({
        text: fmt(gs.sub[c.totalKey] || 0, c.totalDigits != null ? c.totalDigits : 2),
        alignment: 'right', fontSize: 8, fillColor: zebra
      }))
    ];
  });

  const totalRow = [
    { text: 'Total', colSpan: 2, alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: 9 },
    {},
    ...totalCols.map(c => ({
      text: fmt(totals[c.totalKey] || 0, c.totalDigits != null ? c.totalDigits : 2),
      alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: 9
    }))
  ];

  const widths = [30, '*', ...totalCols.map(() => 70)];

  return [
    {
      stack: [
        { text: companyName, alignment: 'center', fontSize: 16, bold: true, color: '#7B3F00', margin: [0, 0, 0, 6] },
        { text: summaryTitle, alignment: 'center', fontSize: 12, bold: true, color: '#008000', margin: [0, 0, 0, 6] },
        { text: `From : ${ddmmyyyy(fromDate)}    To : ${ddmmyyyy(toDate)}`, alignment: 'center', fontSize: 10, bold: true, margin: [0, 0, 0, 10] }
      ]
    },
    {
      table: {
        headerRows: 1,
        dontBreakRows: true,
        keepWithHeaderRows: 0,
        widths,
        body: [headerRow, ...dataRows, totalRow]
      },
      layout: {
        hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0.4),
        vLineWidth: () => 0.4,
        hLineColor: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? '#1A3C7B' : COLORS.borderColor),
        vLineColor: () => COLORS.borderColor,
        paddingLeft: () => 4,
        paddingRight: () => 4,
        paddingTop: () => 6,
        paddingBottom: () => 6
      }
    }
  ];
}

const txt = (val, align = 'left') => (ctx) => ({
  text: String(val(ctx.r) ?? ''), alignment: align, fontSize: 8, fillColor: ctx.zebra
});
const num = (getVal, digits = 0) => (ctx) => ({
  text: fmt(getVal(ctx.r), digits), alignment: 'right', fontSize: 8, fillColor: ctx.zebra
});
const sn = () => (ctx) => ({
  text: String(ctx.sno), alignment: 'center', fontSize: 8, fillColor: ctx.zebra
});

// ============================================================================
// MATERIAL - DATE WISE — grouped by SODate
// ============================================================================
const materialDateWiseConfig = {
  title: 'SERVICE ORDER COMPLETE DETAILS (MATERIAL) - DATE WISE',
  summaryGroupHeader: 'S.O Date',
  subLabelSpan: 9,
  groupKey: (r) => isoDate(r.SODate) + '||' + ddmmyyyy(r.SODate),
  groupLabel: (first) => 'S.O Date : ' + ddmmyyyy(first.SODate),
  columns: [
    { header: 'S.No', width: 22, cell: sn() },
    { header: 'S.O No', width: 40, cell: txt(r => str(r, 'SONo'), 'center') },
    { header: 'Req. No', width: 45, cell: txt(r => str(r, 'SORNo'), 'center') },
    { header: 'Req. Date', width: 55, cell: txt(r => ddmmyyyy(r.SORDate), 'center') },
    { header: 'Supplier', width: '*', cell: txt(r => str(r, 'SupplierName')) },
    { header: 'S.O Type', width: 60, cell: txt(r => str(r, 'ServiceOrderTypeName')) },
    { header: 'Item Name', width: '*', cell: txt(r => str(r, 'ItemName') + (str(r, 'Reason') ? ' , ' + str(r, 'Reason') : '')) },
    { header: 'Bill No', width: 55, cell: txt(r => str(r, 'PartyBillNo'), 'center') },
    { header: 'Bill Date', width: 55, cell: txt(r => ddmmyyyy(r.PartyBillDate), 'center') },
    { header: 'Qty', width: 40, cell: num(r => dec(r, 'Qty'), 0), totalKey: 'qty', totalFn: r => dec(r, 'Qty') },
    { header: 'Payment', width: 55, cell: num(r => dec(r, 'TotalPayment') || dec(r, 'Payment'), 0), totalKey: 'payment', totalFn: r => dec(r, 'TotalPayment') || dec(r, 'Payment') },
    { header: 'Deduction', width: 55, cell: num(r => dec(r, 'Deduction'), 0), totalKey: 'deduction', totalFn: r => dec(r, 'Deduction') },
    { header: 'Tax', width: 50, cell: num(r => taxOf(r), 0), totalKey: 'tax', totalFn: r => taxOf(r) },
    { header: 'Net Amount', width: 60, cell: num(r => dec(r, 'NetAmount'), 0), totalKey: 'net', totalFn: r => dec(r, 'NetAmount') }
  ]
};

// ============================================================================
// MATERIAL - DEPARTMENT WISE — grouped by DepartmentCode
// ============================================================================
const materialDepartmentWiseConfig = {
  title: 'SERVICE ORDER COMPLETE DETAILS (MATERIAL) - DEPARTMENT WISE',
  summaryGroupHeader: 'Department',
  subLabelSpan: 9,
  groupKey: (r) => (str(r, 'DepartmentName_English') || '(Unknown Department)') + '||' + (r.DepartmentCode != null ? String(r.DepartmentCode) : ''),
  groupLabel: (first) => 'Department : ' + (str(first, 'DepartmentName_English') || '(Unknown Department)'),
  columns: [
    { header: 'S.No', width: 22, cell: sn() },
    { header: 'S.O No', width: 40, cell: txt(r => str(r, 'SONo'), 'center') },
    { header: 'S.O Date', width: 55, cell: txt(r => ddmmyyyy(r.SODate), 'center') },
    { header: 'Req. No', width: 45, cell: txt(r => str(r, 'SORNo'), 'center') },
    { header: 'Req. Date', width: 55, cell: txt(r => ddmmyyyy(r.SORDate), 'center') },
    { header: 'Supplier', width: '*', cell: txt(r => str(r, 'SupplierName')) },
    { header: 'S.O Type', width: 55, cell: txt(r => str(r, 'ServiceOrderTypeName')) },
    { header: 'Item Name', width: '*', cell: txt(r => str(r, 'ItemName') + (str(r, 'Reason') ? ' , ' + str(r, 'Reason') : '')) },
    { header: 'Bill No', width: 55, cell: txt(r => str(r, 'PartyBillNo'), 'center') },
    { header: 'Qty', width: 40, cell: num(r => dec(r, 'Qty'), 0), totalKey: 'qty', totalFn: r => dec(r, 'Qty') },
    { header: 'Payment', width: 55, cell: num(r => dec(r, 'Payment'), 0), totalKey: 'payment', totalFn: r => dec(r, 'Payment') },
    { header: 'Deduction', width: 55, cell: num(r => dec(r, 'Deduction'), 0), totalKey: 'deduction', totalFn: r => dec(r, 'Deduction') },
    { header: 'Tax', width: 50, cell: num(r => taxOf(r), 0), totalKey: 'tax', totalFn: r => taxOf(r) },
    { header: 'Net Amount', width: 60, cell: num(r => dec(r, 'NetAmount'), 0), totalKey: 'net', totalFn: r => dec(r, 'NetAmount') }
  ]
};

// ============================================================================
// VISITORS - DATE WISE — grouped by SODate
// ============================================================================
const visitorsDateWiseConfig = {
  title: 'SERVICE ORDER COMPLETE DETAILS (VISITORS) - DATE WISE',
  summaryGroupHeader: 'S.O Date',
  subLabelSpan: 9,
  groupKey: (r) => isoDate(r.SODate) + '||' + ddmmyyyy(r.SODate),
  groupLabel: (first) => 'S.O Date : ' + ddmmyyyy(first.SODate),
  columns: [
    { header: 'S.No', width: 22, cell: sn() },
    { header: 'S.O No', width: 40, cell: txt(r => str(r, 'SONo'), 'center') },
    { header: 'Req. No', width: 45, cell: txt(r => str(r, 'SORNo'), 'center') },
    { header: 'Req. Date', width: 55, cell: txt(r => ddmmyyyy(r.SORDate), 'center') },
    { header: 'Supplier', width: '*', cell: txt(r => str(r, 'SupplierName')) },
    { header: 'Visitor Name', width: '*', cell: txt(r => str(r, 'VisitorName')) },
    { header: 'S.O Type', width: 60, cell: txt(r => str(r, 'ServiceOrderTypeName')) },
    { header: 'Bill No', width: 50, cell: txt(r => str(r, 'PartyBillNo'), 'center') },
    { header: 'Bill Date', width: 55, cell: txt(r => ddmmyyyy(r.PartyBillDate), 'center') },
    { header: 'Persons', width: 45, cell: num(r => dec(r, 'NoofPerson'), 0), totalKey: 'persons', totalFn: r => dec(r, 'NoofPerson') },
    { header: 'Payment', width: 55, cell: num(r => dec(r, 'TotalPayment') || dec(r, 'Payment'), 0), totalKey: 'payment', totalFn: r => dec(r, 'TotalPayment') || dec(r, 'Payment') },
    { header: 'Deduction', width: 55, cell: num(r => dec(r, 'Deduction'), 0), totalKey: 'deduction', totalFn: r => dec(r, 'Deduction') },
    { header: 'Tax', width: 50, cell: num(r => taxOf(r), 0), totalKey: 'tax', totalFn: r => taxOf(r) },
    { header: 'Net Amount', width: 60, cell: num(r => dec(r, 'NetAmount'), 0), totalKey: 'net', totalFn: r => dec(r, 'NetAmount') }
  ]
};

// ============================================================================
// VISITORS - DEPARTMENT WISE — grouped by DepartmentCode
// ============================================================================
const visitorsDepartmentWiseConfig = {
  title: 'SERVICE ORDER COMPLETE VISITOR DETAILS - DEPARTMENT WISE',
  summaryGroupHeader: 'Department',
  subLabelSpan: 9,
  groupKey: (r) => (str(r, 'DepartmentName_English') || '(Unknown Department)') + '||' + (r.DepartmentCode != null ? String(r.DepartmentCode) : ''),
  groupLabel: (first) => 'Department : ' + (str(first, 'DepartmentName_English') || '(Unknown Department)'),
  columns: [
    { header: 'S.No', width: 22, cell: sn() },
    { header: 'S.O No', width: 40, cell: txt(r => str(r, 'SONo'), 'center') },
    { header: 'S.O Date', width: 55, cell: txt(r => ddmmyyyy(r.SODate), 'center') },
    { header: 'Bill No', width: 50, cell: txt(r => str(r, 'PartyBillNo'), 'center') },
    { header: 'Bill Date', width: 55, cell: txt(r => ddmmyyyy(r.PartyBillDate), 'center') },
    { header: 'Supplier', width: '*', cell: txt(r => str(r, 'SupplierName')) },
    { header: 'Visitor Name', width: '*', cell: txt(r => str(r, 'VisitorName')) },
    { header: 'Item / Reason', width: '*', cell: txt(r => (str(r, 'ItemDescription') || str(r, 'ItemName')) + (str(r, 'Reason') ? ' , ' + str(r, 'Reason') : '')) },
    { header: 'Persons', width: 45, cell: num(r => dec(r, 'NoofPerson'), 0), totalKey: 'persons', totalFn: r => dec(r, 'NoofPerson') },
    { header: 'Rate', width: 45, cell: num(r => dec(r, 'Rate'), 2) },
    { header: 'Amount', width: 55, cell: num(r => (dec(r, 'Qty') * dec(r, 'Rate')) + dec(r, 'PFAmount'), 2), totalKey: 'amount', totalDigits: 2, totalFn: r => (dec(r, 'Qty') * dec(r, 'Rate')) + dec(r, 'PFAmount') },
    { header: 'Tax', width: 50, cell: num(r => taxOf(r), 2), totalKey: 'tax', totalDigits: 2, totalFn: r => taxOf(r) },
    { header: 'Net Amount', width: 60, cell: num(r => dec(r, 'NetAmount'), 2), totalKey: 'net', totalDigits: 2, totalFn: r => dec(r, 'NetAmount') }
  ]
};

export const materialDateWise = { buildDocDefinition: makeBuilder(materialDateWiseConfig) };
export const materialDepartmentWise = { buildDocDefinition: makeBuilder(materialDepartmentWiseConfig) };
export const visitorsDateWise = { buildDocDefinition: makeBuilder(visitorsDateWiseConfig) };
export const visitorsDepartmentWise = { buildDocDefinition: makeBuilder(visitorsDepartmentWiseConfig) };

export default { materialDateWise, materialDepartmentWise, visitorsDateWise, visitorsDepartmentWise };
