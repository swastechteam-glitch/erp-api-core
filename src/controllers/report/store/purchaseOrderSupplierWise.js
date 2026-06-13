// reports/purchaseOrderSupplierWise.js
// Supplier-wise grouped PurchaseOrder report.
// Same data source as purchaseOrderDetails, regrouped by SupplierName.

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

// Greedy word-wrap line estimate for vertically centering shorter cells
const estimateLines = (text, charsPerLine) => {
  if (!text) return 1;
  const words = String(text).split(/\s+/).filter(Boolean);
  let lines = 1, len = 0;
  for (const w of words) {
    if (len === 0) len = w.length;
    else if (len + 1 + w.length <= charsPerLine) len += 1 + w.length;
    else { lines++; len = w.length; }
    while (len > charsPerLine) { lines++; len -= charsPerLine; }
  }
  return lines;
};

// Summary page (rendered on a new page after the detail table) listing each
// group's aggregated totals as one row, plus a Total footer row.
function buildSummaryPage({ companyName, fromDate, toDate, title, groupHeader, groupSummaries, grandTotals, totalCols }) {
  const COLORS_HEADER_FILL = '#1A3C7B';
  const ZEBRA = '#FAFBFD';
  const BORDER = '#D7DCE3';

  const hdr = (text) => ({ text, bold: true, fillColor: COLORS_HEADER_FILL, color: '#FFFFFF', alignment: 'center', fontSize: 8 });

  const headerRow = [hdr('S.No'), hdr(groupHeader), ...totalCols.map(c => hdr(c.header))];

  const dataRows = groupSummaries.map((gs, i) => {
    const zebra = i % 2 === 1 ? ZEBRA : null;
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
    { text: 'Total', colSpan: 2, alignment: 'right', bold: true, color: '#FFFFFF', fillColor: COLORS_HEADER_FILL, fontSize: 9 },
    {},
    ...totalCols.map(c => ({
      text: fmt(grandTotals[c.key] || 0, c.digits != null ? c.digits : 2),
      alignment: 'right', bold: true, color: '#FFFFFF', fillColor: COLORS_HEADER_FILL, fontSize: 9
    }))
  ];

  const widths = [30, '*', ...totalCols.map(() => 70)];

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
        hLineColor: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? '#1A3C7B' : BORDER),
        vLineColor: () => BORDER,
        paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 6, paddingBottom: () => 6
      }
    }
  ];
}

function buildDocDefinition(rows, companyName, fromDate, toDate) {

  // Group rows by SupplierName, sorted alphabetically
  const groupsMap = new Map();
  for (const r of rows) {
    const k = str(r, 'SupplierName') || '(Unknown Supplier)';
    if (!groupsMap.has(k)) groupsMap.set(k, []);
    groupsMap.get(k).push(r);
  }
  const sortedKeys = [...groupsMap.keys()].sort((a, b) => a.localeCompare(b));

  // Column widths (14 columns)
  const widths = [22, 50, 40, 40, '*', 40, 44, 50, 44, 40, 44, 50, 32, 52];

  const headerFill = '#1A3C7B';
  const headerText = '#FFFFFF';
  const supplierFill = '#E8F0FE';
  const supplierText = '#1A3C7B';
  const zebraFill = '#FAFBFD';
  const subFill = '#EEF2F7';
  const subText = '#1A3C7B';
  const grandFill = '#1A3C7B';
  const grandText = '#FFFFFF';
  const borderColor = '#D7DCE3';

  const body = [];

  const headerRow = [
    'S.No', 'Date', 'Order No', 'Mode', 'Item Name',
    'Qty', 'Rate', 'Amount', 'Discount', 'P&F', 'Other Exp',
    'GST Amt', 'RND', 'Net Amount'
  ].map(t => ({ text: t, bold: true, fillColor: headerFill, color: headerText, alignment: 'center', fontSize: 8 }));
  body.push(headerRow);

  let gAmt = 0, gDisc = 0, gPF = 0, gOther = 0, gGST = 0, gRnd = 0, gNet = 0;
  const groupSummaries = [];
  let sno = 1;

  for (const supplierName of sortedKeys) {
    // sort rows in this supplier group by date
    const group = groupsMap.get(supplierName).slice().sort((a, b) => {
      const da = new Date(a.PurchaseOrderDate).getTime() || 0;
      const db = new Date(b.PurchaseOrderDate).getTime() || 0;
      return da - db;
    });

    // Supplier header row (spans all 14 columns)
    body.push([
      {
        text: 'Supplier : ' + supplierName,
        colSpan: 14, bold: true, color: supplierText, fillColor: supplierFill, fontSize: 9, margin: [2, 2, 0, 2]
      },
      {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}
    ]);

    let sAmt = 0, sDisc = 0, sPF = 0, sOther = 0, sGST = 0, sRnd = 0, sNet = 0;

    let rowIdx = 0;
    for (const r of group) {
      const gst = dec(r, 'CGSTAmount') + dec(r, 'SGSTAmount') + dec(r, 'IGSTAmount');

      sAmt += dec(r, 'Amount');
      sDisc += dec(r, 'DiscountAmount');
      sPF += dec(r, 'PFAmount');
      sOther += dec(r, 'OtherExpenses');
      sGST += gst;
      sRnd += dec(r, 'RoundedOff');
      sNet += dec(r, 'NetAmount');

      const zebra = rowIdx % 2 === 1 ? zebraFill : null;
      const itemName = str(r, 'ItemName');
      const itemLines = estimateLines(itemName, 22);
      const lineHeightPt = 9; // empirical for Times-Roman 8pt with lineHeight 1.25
      const topPad = ((itemLines - 1) * lineHeightPt) / 2;
      const cell = (text, align = 'left') => ({
        text, alignment: align, fontSize: 8, fillColor: zebra, margin: [0, topPad, 0, 0]
      });
      const itemCell = { text: itemName, fontSize: 8, fillColor: zebra };

      body.push([
        cell(String(sno), 'center'),
        cell(ddmmyyyy(r.PurchaseOrderDate), 'center'),
        cell(str(r, 'PurchaseOrderNo'), 'center'),
        cell(str(r, 'PurchaseMode')),
        itemCell,
        cell(fmt(dec(r, 'Qty'), 3), 'right'),
        cell(fmt(dec(r, 'Rate'), 2), 'right'),
        cell(fmt(dec(r, 'Amount'), 2), 'right'),
        cell(fmt(dec(r, 'DiscountAmount'), 2), 'right'),
        cell(fmt(dec(r, 'PFAmount'), 2), 'right'),
        cell(fmt(dec(r, 'OtherExpenses'), 2), 'right'),
        cell(fmt(gst, 2), 'right'),
        cell(fmt(dec(r, 'RoundedOff'), 2), 'right'),
        cell(fmt(dec(r, 'NetAmount'), 2), 'right')
      ]);
      sno++;
      rowIdx++;
    }

    const subCell = (text, align = 'right') => ({
      text, alignment: align, bold: true, color: subText, fillColor: subFill, fontSize: 8
    });
    body.push([
      { text: 'Sub Total', colSpan: 7, alignment: 'right', bold: true, color: subText, fillColor: subFill, fontSize: 8 },
      {}, {}, {}, {}, {}, {},
      subCell(fmt(sAmt)),
      subCell(fmt(sDisc)),
      subCell(fmt(sPF)),
      subCell(fmt(sOther)),
      subCell(fmt(sGST)),
      subCell(fmt(sRnd)),
      subCell(fmt(sNet))
    ]);

    groupSummaries.push({
      label: supplierName,
      totals: { amount: sAmt, discount: sDisc, pf: sPF, otherExp: sOther, tax: sGST, rnd: sRnd, net: sNet }
    });

    gAmt += sAmt; gDisc += sDisc; gPF += sPF; gOther += sOther;
    gGST += sGST; gRnd += sRnd; gNet += sNet;
  }

  const grandCell = (text, align = 'right') => ({
    text, alignment: align, bold: true, color: grandText, fillColor: grandFill, fontSize: 9
  });
  body.push([
    { text: 'Grand Total', colSpan: 7, alignment: 'right', bold: true, color: grandText, fillColor: grandFill, fontSize: 9 },
    {}, {}, {}, {}, {}, {},
    grandCell(fmt(gAmt)),
    grandCell(fmt(gDisc)),
    grandCell(fmt(gPF)),
    grandCell(fmt(gOther)),
    grandCell(fmt(gGST)),
    grandCell(fmt(gRnd)),
    grandCell(fmt(gNet))
  ]);

  const summaryNodes = buildSummaryPage({
    companyName, fromDate, toDate,
    title: 'PURCHASE ORDER SUMMARY - SUPPLIER WISE',
    groupHeader: 'Supplier Name',
    groupSummaries,
    grandTotals: { amount: gAmt, discount: gDisc, pf: gPF, otherExp: gOther, tax: gGST, rnd: gRnd, net: gNet },
    totalCols: [
      { header: 'Amount', key: 'amount' },
      { header: 'Discount', key: 'discount' },
      { header: 'P&F', key: 'pf' },
      { header: 'Other Expenses', key: 'otherExp' },
      { header: 'GST', key: 'tax' },
      { header: 'Rounded Off', key: 'rnd' },
      { header: 'Net Amount', key: 'net' }
    ]
  });

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
          { text: 'PURCHASE ORDER - SUPPLIER WISE', alignment: 'center', fontSize: 12, bold: true, color: '#008000', margin: [0, 0, 0, 6] },
          { text: `From : ${ddmmyyyy(fromDate)}   To : ${ddmmyyyy(toDate)}`, alignment: 'center', fontSize: 10, bold: true, margin: [0, 0, 0, 10] }
        ],
        pageBreak: 'before'
      },
      {
        table: {
          headerRows: 1,
          dontBreakRows: true,
          keepWithHeaderRows: 0,
          widths: widths,
          body: body
        },
        layout: {
          hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0.4),
          vLineWidth: () => 0.4,
          hLineColor: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? '#1A3C7B' : borderColor),
          vLineColor: () => borderColor,
          paddingLeft: () => 4,
          paddingRight: () => 4,
          paddingTop: () => 6,
          paddingBottom: () => 6
        }
      }
    ],

    defaultStyle: { font: 'Roboto', fontSize: 8, lineHeight: 1.25 }
  };
}

export { buildDocDefinition };
export default { buildDocDefinition };
