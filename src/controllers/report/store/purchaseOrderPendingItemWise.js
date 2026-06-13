// reports/purchaseOrderPendingItemWise.js
// Item-wise grouped Purchase Order PENDING report.
// SP: sp_RptPurchaseOrderDetailsPending (CompanyCode, FromDate, ToDate)
// Grouped by ItemCode.

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

  const groupsMap = new Map();
  for (const r of rows) {
    const k = (r.ItemCode != null ? String(r.ItemCode) : '') + '||' + (str(r, 'ItemName') || '(Unknown Item)');
    if (!groupsMap.has(k)) groupsMap.set(k, []);
    groupsMap.get(k).push(r);
  }
  const sortedKeys = [...groupsMap.keys()].sort((a, b) => {
    const an = a.split('||')[1] || '';
    const bn = b.split('||')[1] || '';
    return an.localeCompare(bn);
  });

  // 11 columns: S.No, PO No, Date, Mode, Supplier, Department, UOM, Order Qty, Recv Qty, Pend Qty, Rate, Net Amount
  const widths = [22, 42, 50, 50, '*', '*', 36, 44, 44, 44, 40, 52];

  const headerFill = '#1A3C7B';
  const headerText = '#FFFFFF';
  const groupFill = '#E8F0FE';
  const groupText = '#1A3C7B';
  const zebraFill = '#FAFBFD';
  const subFill = '#EEF2F7';
  const subText = '#1A3C7B';
  const grandFill = '#1A3C7B';
  const grandText = '#FFFFFF';
  const borderColor = '#D7DCE3';

  const body = [];

  const headerRow = [
    'S.No', 'PO No', 'Date', 'Mode', 'Supplier Name', 'Department', 'UOM',
    'Order Qty', 'Recv Qty', 'Pend Qty', 'Rate', 'Net Amount'
  ].map(t => ({ text: t, bold: true, fillColor: headerFill, color: headerText, alignment: 'center', fontSize: 8 }));
  body.push(headerRow);

  let gPO = 0, gRecv = 0, gPend = 0, gNet = 0;
  const groupSummaries = [];
  let sno = 1;

  for (const key of sortedKeys) {
    const group = groupsMap.get(key).slice().sort((a, b) => {
      const da = new Date(a.PurchaseOrderDate).getTime() || 0;
      const db = new Date(b.PurchaseOrderDate).getTime() || 0;
      return da - db;
    });
    const first = group[0];
    const itemHeading = 'Item : ' + str(first, 'ItemName') + '     UOM : ' + str(first, 'ItemUomName');

    body.push([
      {
        text: itemHeading,
        colSpan: 12, bold: true, color: groupText, fillColor: groupFill, fontSize: 9, margin: [2, 2, 0, 2]
      },
      {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}
    ]);

    let sPO = 0, sRecv = 0, sPend = 0, sNet = 0;

    let rowIdx = 0;
    for (const r of group) {
      const poQty = dec(r, 'POQty');
      const recvQty = dec(r, 'PORQty');
      const pendQty = dec(r, 'PendingQty');
      const netAmt = dec(r, 'PendingNetAmount');

      sPO += poQty;
      sRecv += recvQty;
      sPend += pendQty;
      sNet += netAmt;

      const zebra = rowIdx % 2 === 1 ? zebraFill : null;
      const supplierName = str(r, 'SupplierName');
      const deptName = str(r, 'DepartmentName');
      const supLines = estimateLines(supplierName, 22);
      const deptLines = estimateLines(deptName, 18);
      const maxLines = Math.max(supLines, deptLines, 1);
      const lineHeightPt = 9;
      const topPadFor = (n) => ((maxLines - n) * lineHeightPt) / 2;
      const cell = (text, align = 'left') => ({
        text, alignment: align, fontSize: 8, fillColor: zebra, margin: [0, topPadFor(1), 0, 0]
      });
      const supCell = { text: supplierName, fontSize: 8, fillColor: zebra, margin: [0, topPadFor(supLines), 0, 0] };
      const deptCell = { text: deptName, fontSize: 8, fillColor: zebra, margin: [0, topPadFor(deptLines), 0, 0] };

      body.push([
        cell(String(sno), 'center'),
        cell(str(r, 'PurchaseOrderNo'), 'center'),
        cell(ddmmyyyy(r.PurchaseOrderDate), 'center'),
        cell(str(r, 'PurchaseMode'), 'center'),
        supCell,
        deptCell,
        cell(str(r, 'ItemUomName'), 'center'),
        cell(fmt(poQty, 3), 'right'),
        cell(fmt(recvQty, 3), 'right'),
        cell(fmt(pendQty, 3), 'right'),
        cell(fmt(dec(r, 'Rate'), 2), 'right'),
        cell(fmt(netAmt, 2), 'right')
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
      subCell(fmt(sPO, 3)),
      subCell(fmt(sRecv, 3)),
      subCell(fmt(sPend, 3)),
      { text: '', fillColor: subFill },
      subCell(fmt(sNet))
    ]);

    groupSummaries.push({
      label: str(first, 'ItemName'),
      totals: { po: sPO, recv: sRecv, pend: sPend, net: sNet }
    });

    gPO += sPO; gRecv += sRecv; gPend += sPend; gNet += sNet;
  }

  const grandCell = (text, align = 'right') => ({
    text, alignment: align, bold: true, color: grandText, fillColor: grandFill, fontSize: 9
  });
  body.push([
    { text: 'Grand Total', colSpan: 7, alignment: 'right', bold: true, color: grandText, fillColor: grandFill, fontSize: 9 },
    {}, {}, {}, {}, {}, {},
    grandCell(fmt(gPO, 3)),
    grandCell(fmt(gRecv, 3)),
    grandCell(fmt(gPend, 3)),
    { text: '', fillColor: grandFill },
    grandCell(fmt(gNet))
  ]);

  const summaryNodes = buildSummaryPage({
    companyName, fromDate, toDate,
    title: 'PURCHASE ORDER PENDING SUMMARY - ITEM WISE',
    groupHeader: 'Item Name',
    groupSummaries,
    grandTotals: { po: gPO, recv: gRecv, pend: gPend, net: gNet },
    totalCols: [
      { header: 'Order Qty', key: 'po', digits: 3 },
      { header: 'Received Qty', key: 'recv', digits: 3 },
      { header: 'Pending Qty', key: 'pend', digits: 3 },
      { header: 'Pending Net Amount', key: 'net' }
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
          { text: 'INWARD PENDING - ITEM WISE', alignment: 'center', fontSize: 12, bold: true, color: '#008000', margin: [0, 0, 0, 6] },
          { text: `As On : ${ddmmyyyy(toDate)}`, alignment: 'center', fontSize: 10, bold: true, margin: [0, 0, 0, 10] }
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
