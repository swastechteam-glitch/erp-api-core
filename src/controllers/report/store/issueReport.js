// reports/issueReport.js
// Five grouped Store Issue reports sharing one SP and one builder factory.
//   sp_IssueDetails_GetAll (CompanyCode, FromDate, ToDate)
//
// Exports: dateWise, departmentWise, itemWise, costHeadWise, machineWise
// Each exports { buildDocDefinition(rows, companyName, fromDate, toDate) }.

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

// Net amount actually consumed = NetAmount - IssueReturnAmount.
// Falls back to Amount when NetAmount is not populated.
const netIssue = (r) => {
  const net = dec(r, 'NetAmount') || dec(r, 'Amount');
  return net - dec(r, 'IssueReturnAmount');
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

// Title block with the company logo on the left (mirror spacer keeps it centred).
const LOGO_W = 80;
const titleWithLogo = (companyName, title, dateText, companyLogo) => ({
  columns: [
    companyLogo
      ? { image: companyLogo, fit: [70, 70], width: LOGO_W, alignment: 'left', margin: [4, 0, 0, 0] }
      : { text: '', width: LOGO_W },
    {
      width: '*',
      stack: [
        { text: companyName, alignment: 'center', fontSize: 16, bold: true, color: '#7B3F00', margin: [0, 0, 0, 6] },
        { text: title, alignment: 'center', fontSize: 12, bold: true, color: '#008000', margin: [0, 0, 0, 6] },
        { text: dateText, alignment: 'center', fontSize: 10, bold: true, margin: [0, 0, 0, 10] }
      ]
    },
    { text: '', width: LOGO_W }
  ]
});

function makeBuilder(config) {
  return function buildDocDefinition(rows, companyName, fromDate, toDate, companyLogo) {

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
        const da = new Date(a.IssueDate).getTime() || 0;
        const db = new Date(b.IssueDate).getTime() || 0;
        if (da !== db) return da - db;
        return dec(a, 'IssueNo') - dec(b, 'IssueNo');
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

      // Sub-total row for the group
      const subRow = COLS.map((c, i) => {
        if (i === 0) {
          return { text: 'Sub Total', colSpan: config.subLabelSpan, alignment: 'right', bold: true, color: COLORS.subText, fillColor: COLORS.subFill, fontSize: 8 };
        }
        if (i > 0 && i < config.subLabelSpan) return {};
        const tkey = c.totalKey;
        if (!tkey) return { text: '', fillColor: COLORS.subFill };
        return { text: fmt(sub[tkey] || 0, c.totalDigits || 2), alignment: 'right', bold: true, color: COLORS.subText, fillColor: COLORS.subFill, fontSize: 8 };
      });
      body.push(subRow);

      groupSummaries.push({ label: cleanGroupLabel(groupLabel), sub });

      for (const k of Object.keys(sub)) {
        totals[k] = (totals[k] || 0) + sub[k];
      }
    }

    const grandRow = COLS.map((c, i) => {
      if (i === 0) {
        return { text: 'Grand Total', colSpan: config.subLabelSpan, alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: 9 };
      }
      if (i > 0 && i < config.subLabelSpan) return {};
      const tkey = c.totalKey;
      if (!tkey) return { text: '', fillColor: COLORS.grandFill };
      return { text: fmt(totals[tkey] || 0, c.totalDigits || 2), alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: 9 };
    });
    body.push(grandRow);

    const summaryNodes = buildSummaryPage({ COLS, groupSummaries, totals, config, companyName, fromDate, toDate, companyLogo });
    const chartNodes = buildChartNodes({ COLS, groupSummaries, config });

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
        ...chartNodes,
        { ...titleWithLogo(companyName, config.title, `From : ${ddmmyyyy(fromDate)}    To : ${ddmmyyyy(toDate)}`, companyLogo), pageBreak: 'before' },
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

function buildSummaryPage({ COLS, groupSummaries, totals, config, companyName, fromDate, toDate, companyLogo }) {
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
    titleWithLogo(companyName, summaryTitle, `From : ${ddmmyyyy(fromDate)}    To : ${ddmmyyyy(toDate)}`, companyLogo),
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

// ============================================================================
// Modern bar-chart visual rendered between the summary table and the detail
// data. Drawn with pdfmake's native canvas (no external charting library):
// a dark rounded panel, subtle gridlines, and vertical bars with a
// magenta -> orange vertical gradient and rounded tops. Bars are numbered
// 01, 02, ... matching the S.No column in the summary table above.
// ============================================================================
const CHART = {
  width: 540,          // panel width (pt) — fits A4 portrait so it never clips
  height: 240,         // panel height (pt)
  pad: 16,             // horizontal inset for the plot area
  topPad: 30,          // space above the tallest bar (for gridlines)
  bottomPad: 16,       // space below the baseline (inside the panel)
  maxBars: 24,         // cap so bars stay readable
  // light / white theme
  panelTop: '#FFFFFF',
  panelBottom: '#F3F6FB',
  panelBorder: '#D7DCE3',
  gridColor: '#E6EAF2',
  axisColor: '#C7CEDB',
  line: '#12B886'      // trend line (teal)
};
// Vibrant [top, bottom] gradient pairs — each bar cycles to the next pair.
const BAR_GRADIENTS = [
  ['#FF2D9B', '#FF9F1C'], ['#11998E', '#38EF7D'], ['#2193B0', '#6DD5ED'],
  ['#7B4397', '#DC2430'], ['#F7971E', '#FFD200'], ['#4E54C8', '#8F94FB'],
  ['#0BAB64', '#3BB78F'], ['#CB356B', '#BD3F32'], ['#EC008C', '#FC6767'],
  ['#1FA2FF', '#12D8FA']
];

// hex -> {r,g,b}
const hexToRgb = (h) => {
  const x = h.replace('#', '');
  return { r: parseInt(x.slice(0, 2), 16), g: parseInt(x.slice(2, 4), 16), b: parseInt(x.slice(4, 6), 16) };
};
const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
// Linear interpolate between two hex colours (t: 0..1).
const lerpColor = (a, b, t) => {
  const c1 = hexToRgb(a), c2 = hexToRgb(b);
  return `#${toHex(c1.r + (c2.r - c1.r) * t)}${toHex(c1.g + (c2.g - c1.g) * t)}${toHex(c1.b + (c2.b - c1.b) * t)}`;
};

// Build the vector ops for one vertical gradient bar (sliced top->bottom)
// plus a rounded top cap.
function gradientBarOps(x, yTop, w, h, top, bottom) {
  const ops = [];
  const slices = 18;
  const sliceH = h / slices;
  for (let s = 0; s < slices; s++) {
    const t = slices > 1 ? s / (slices - 1) : 0;
    ops.push({ type: 'rect', x, y: yTop + s * sliceH, w, h: sliceH + 0.6, color: lerpColor(top, bottom, t) });
  }
  // rounded top cap
  ops.push({ type: 'ellipse', x: x + w / 2, y: yTop, r1: w / 2, r2: 3, color: top });
  return ops;
}

function buildChartNodes({ COLS, groupSummaries, config }) {
  if (!groupSummaries || !groupSummaries.length) return [];

  const totalCols = COLS.filter(c => c.totalKey);
  if (!totalCols.length) return [];

  // Prefer a money metric for the visual; fall back to the first total column.
  const metric = totalCols.find(c => c.totalKey === 'netIssue')
    || totalCols.find(c => c.totalKey === 'amount')
    || totalCols[0];

  const shown = groupSummaries.slice(0, CHART.maxBars);
  const truncated = groupSummaries.length > shown.length;

  const { width: W, height: H, pad, topPad, bottomPad } = CHART;
  const baseline = H - bottomPad;
  const maxBarH = baseline - topPad;
  const plotW = W - pad * 2;
  const n = shown.length;
  const slotW = plotW / n;
  const barW = Math.min(30, slotW * 0.6);

  const digits = metric.totalDigits != null ? metric.totalDigits : 2;
  // Compact value for the on-bar label (full precision stays in the table).
  const compact = (v) => {
    const a = Math.abs(v);
    if (a >= 1e7) return (v / 1e7).toFixed(2) + 'Cr';
    if (a >= 1e5) return (v / 1e5).toFixed(2) + 'L';
    if (a >= 1e3) return (v / 1e3).toFixed(1) + 'k';
    return fmt(v, digits);
  };

  const maxVal = Math.max(1, ...shown.map(gs => Math.abs(Number(gs.sub[metric.totalKey]) || 0)));

  const canvasOps = [];
  // light rounded panel with a soft border
  canvasOps.push({ type: 'rect', x: 0, y: 0, w: W, h: H, r: 10, linearGradient: [CHART.panelTop, CHART.panelBottom], lineColor: CHART.panelBorder, lineWidth: 1 });
  // subtle gridlines
  for (let g = 1; g <= 4; g++) {
    const y = baseline - (g / 4) * maxBarH;
    canvasOps.push({ type: 'line', x1: pad, y1: y, x2: W - pad, y2: y, lineWidth: 0.5, lineColor: CHART.gridColor });
  }
  // baseline axis
  canvasOps.push({ type: 'line', x1: pad, y1: baseline, x2: W - pad, y2: baseline, lineWidth: 0.8, lineColor: CHART.axisColor });
  // bars (collect each bar-top centre for the trend line)
  const pts = [];
  shown.forEach((gs, i) => {
    const v = Math.abs(Number(gs.sub[metric.totalKey]) || 0);
    const h = Math.max(2, (v / maxVal) * maxBarH);
    const x = pad + i * slotW + (slotW - barW) / 2;
    const yTop = baseline - h;
    const [top, bottom] = BAR_GRADIENTS[i % BAR_GRADIENTS.length]; // each bar a different colour
    for (const op of gradientBarOps(x, yTop, barW, h, top, bottom)) canvasOps.push(op);
    pts.push({ x: x + barW / 2, y: yTop });
  });

  // trend line over the bars: a teal polyline + a white dotted highlight +
  // round markers, finished with an arrowhead at the last point.
  if (pts.length >= 2) {
    const LINE = CHART.line;
    canvasOps.push({ type: 'polyline', lineWidth: 2.5, lineColor: LINE, lineJoin: 'round', points: pts.map(p => ({ x: p.x, y: p.y })) });
    for (const p of pts) {
      canvasOps.push({ type: 'ellipse', x: p.x, y: p.y, r1: 2.4, r2: 2.4, color: '#FFFFFF', lineColor: LINE, lineWidth: 1.2 });
    }
    // arrowhead along the last segment
    const a = pts[pts.length - 2];
    const b = pts[pts.length - 1];
    let dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const px = -dy, py = dx; // perpendicular
    const L = 9, W = 5;
    const baseX = b.x - dx * L, baseY = b.y - dy * L;
    canvasOps.push({
      type: 'polyline', closePath: true, color: LINE,
      points: [
        { x: b.x, y: b.y },
        { x: baseX + px * W, y: baseY + py * W },
        { x: baseX - px * W, y: baseY - py * W }
      ]
    });
  }

  // Clean label row under each bar: value (compact) on top, index below.
  // Kept in normal flow (a columns row right under the canvas) so it always
  // aligns with the bars — no overlap with the bars or the trend line.
  const labelCols = [{ width: pad, text: '' }];
  shown.forEach((gs, i) => {
    const v = Number(gs.sub[metric.totalKey]) || 0;
    labelCols.push({
      width: slotW,
      stack: [
        { text: compact(v), fontSize: 6, bold: true, color: COLORS.subText, alignment: 'center' },
        { text: String(i + 1).padStart(2, '0'), fontSize: 6, color: '#9AA0AE', alignment: 'center', margin: [0, 1, 0, 0] }
      ],
      margin: [0, 4, 0, 0]
    });
  });
  labelCols.push({ width: pad, text: '' });

  const caption = `Trend of ${metric.header}; figure under each bar = value, number = S.No in the summary above`
    + (truncated ? `  (showing top ${shown.length} of ${groupSummaries.length})` : '');

  // Keep the title + caption + graph + labels together on one page.
  return [
    {
      unbreakable: true,
      pageBreak: 'before',
      stack: [
        {
          text: `${metric.header} by ${config.summaryGroupHeader || 'Group'}`,
          fontSize: 12, bold: true, color: '#008000', margin: [0, 0, 0, 2]
        },
        { text: caption, fontSize: 8, italics: true, color: '#666666', margin: [0, 0, 0, 8] },
        { canvas: canvasOps },
        { columns: labelCols, columnGap: 0, margin: [0, 0, 0, 0] }
      ]
    }
  ];
}

// Helper cell builders
const txt = (val, align = 'left') => (ctx) => ({
  text: String(val(ctx.r) ?? ''), alignment: align, fontSize: 8, fillColor: ctx.zebra
});
const num = (getVal, digits = 2) => (ctx) => ({
  text: fmt(getVal(ctx.r), digits), alignment: 'right', fontSize: 8, fillColor: ctx.zebra
});
const sn = () => (ctx) => ({
  text: String(ctx.sno), alignment: 'center', fontSize: 8, fillColor: ctx.zebra
});

// ============================================================================
// DATE WISE — grouped by IssueDate
// ============================================================================
const dateWiseConfig = {
  title: 'ISSUE DETAILS - DATE WISE',
  summaryGroupHeader: 'Date',
  subLabelSpan: 8,
  groupKey: (r) => isoDate(r.IssueDate) + '||' + ddmmyyyy(r.IssueDate),
  groupLabel: (first) => 'Date : ' + ddmmyyyy(first.IssueDate),
  columns: [
    { header: 'S.No', width: 22, cell: sn() },
    { header: 'Iss. No', width: 40, cell: txt(r => str(r, 'IssueNo'), 'center') },
    { header: 'Indent No', width: 55, cell: txt(r => str(r, 'strItemRequisitionNo'), 'center') },
    { header: 'Department', width: '*', cell: txt(r => str(r, 'DepartmentName')) },
    { header: 'Cost Head', width: '*', cell: txt(r => str(r, 'CostHeadName')) },
    { header: 'Item Name', width: '*', cell: txt(r => str(r, 'ItemName')) },
    { header: 'UOM', width: 32, cell: txt(r => str(r, 'ItemUomName'), 'center') },
    { header: 'Machine', width: 70, cell: txt(r => str(r, 'MachineName')) },
    { header: 'Qty', width: 48, cell: num(r => dec(r, 'Qty'), 3), totalKey: 'qty', totalDigits: 3, totalFn: r => dec(r, 'Qty') },
    { header: 'Rate', width: 45, cell: num(r => dec(r, 'Rate')) },
    { header: 'Amount', width: 55, cell: num(r => dec(r, 'Amount')), totalKey: 'amount', totalFn: r => dec(r, 'Amount') },
    { header: 'Ret. Qty', width: 45, cell: num(r => dec(r, 'IssueReturnQty'), 3), totalKey: 'retQty', totalDigits: 3, totalFn: r => dec(r, 'IssueReturnQty') },
    { header: 'Ret. Value', width: 55, cell: num(r => dec(r, 'IssueReturnAmount')), totalKey: 'retAmount', totalFn: r => dec(r, 'IssueReturnAmount') },
    { header: 'Net Amount', width: 60, cell: num(r => netIssue(r)), totalKey: 'netIssue', totalFn: r => netIssue(r) }
  ]
};

// ============================================================================
// DEPARTMENT WISE — grouped by DepartmentCode
// ============================================================================
const departmentWiseConfig = {
  title: 'ISSUE DETAILS - DEPARTMENT WISE',
  summaryGroupHeader: 'Department',
  subLabelSpan: 10,
  groupKey: (r) => (str(r, 'DepartmentName') || '(Unknown Department)') + '||' + (r.DepartmentCode != null ? String(r.DepartmentCode) : ''),
  groupLabel: (first) => 'Department : ' + (str(first, 'DepartmentName') || '(Unknown Department)'),
  columns: [
    { header: 'S.No', width: 22, cell: sn() },
    { header: 'Iss. No', width: 40, cell: txt(r => str(r, 'IssueNo'), 'center') },
    { header: 'Indent No', width: 55, cell: txt(r => str(r, 'strItemRequisitionNo'), 'center') },
    { header: 'Date', width: 50, cell: txt(r => ddmmyyyy(r.IssueDate), 'center') },
    { header: 'Cost Head', width: '*', cell: txt(r => str(r, 'CostHeadName')) },
    { header: 'Item ID', width: 50, cell: txt(r => str(r, 'ItemID'), 'center') },
    { header: 'Item Name', width: '*', cell: txt(r => str(r, 'ItemName')) },
    { header: 'UOM', width: 32, cell: txt(r => str(r, 'ItemUomName'), 'center') },
    { header: 'Machine', width: 60, cell: txt(r => str(r, 'MachineName')) },
    { header: 'Require', width: 60, cell: txt(r => str(r, 'EmployeeName')) },
    { header: 'Qty', width: 45, cell: num(r => dec(r, 'Qty'), 3), totalKey: 'qty', totalDigits: 3, totalFn: r => dec(r, 'Qty') },
    { header: 'Rate', width: 42, cell: num(r => dec(r, 'Rate')) },
    { header: 'Amount', width: 52, cell: num(r => dec(r, 'Amount')), totalKey: 'amount', totalFn: r => dec(r, 'Amount') },
    { header: 'Ret. Qty', width: 42, cell: num(r => dec(r, 'IssueReturnQty'), 3), totalKey: 'retQty', totalDigits: 3, totalFn: r => dec(r, 'IssueReturnQty') },
    { header: 'Ret. Value', width: 50, cell: num(r => dec(r, 'IssueReturnAmount')), totalKey: 'retAmount', totalFn: r => dec(r, 'IssueReturnAmount') },
    { header: 'Net Amount', width: 55, cell: num(r => netIssue(r)), totalKey: 'netIssue', totalFn: r => netIssue(r) }
  ]
};

// ============================================================================
// ITEM WISE — grouped by ItemCode
// ============================================================================
const itemWiseConfig = {
  title: 'ISSUE DETAILS - ITEM WISE',
  summaryGroupHeader: 'Item Name',
  subLabelSpan: 9,
  groupKey: (r) => (str(r, 'ItemName') || '(Unknown Item)') + '||' + (r.ItemCode != null ? String(r.ItemCode) : ''),
  groupLabel: (first) => 'Item : ' + str(first, 'ItemName'),
  columns: [
    { header: 'S.No', width: 22, cell: sn() },
    { header: 'Iss. No', width: 40, cell: txt(r => str(r, 'IssueNo'), 'center') },
    { header: 'Indent No', width: 55, cell: txt(r => str(r, 'strItemRequisitionNo'), 'center') },
    { header: 'Date', width: 55, cell: txt(r => ddmmyyyy(r.IssueDate), 'center') },
    { header: 'Department', width: '*', cell: txt(r => str(r, 'DepartmentName')) },
    { header: 'Cost Head', width: '*', cell: txt(r => str(r, 'CostHeadName')) },
    { header: 'Machine', width: '*', cell: txt(r => str(r, 'MachineName')) },
    { header: 'Require', width: 80, cell: txt(r => str(r, 'EmployeeName')) },
    { header: 'UOM', width: 36, cell: txt(r => str(r, 'ItemUomName'), 'center') },
    { header: 'Qty', width: 55, cell: num(r => dec(r, 'Qty'), 3), totalKey: 'qty', totalDigits: 3, totalFn: r => dec(r, 'Qty') },
    { header: 'Rate', width: 50, cell: num(r => dec(r, 'Rate')) },
    { header: 'Amount', width: 70, cell: num(r => dec(r, 'Amount')), totalKey: 'amount', totalFn: r => dec(r, 'Amount') }
  ]
};

// ============================================================================
// COST HEAD WISE — grouped by CostHeadCode
// ============================================================================
const costHeadWiseConfig = {
  title: 'ISSUE DETAILS - COST HEAD WISE',
  summaryGroupHeader: 'Cost Head',
  subLabelSpan: 9,
  groupKey: (r) => (str(r, 'CostHeadName') || '(Unknown Cost Head)') + '||' + (r.CostHeadCode != null ? String(r.CostHeadCode) : ''),
  groupLabel: (first) => 'Cost Head : ' + (str(first, 'CostHeadName') || '(Unknown Cost Head)'),
  columns: [
    { header: 'S.No', width: 22, cell: sn() },
    { header: 'Iss. No', width: 40, cell: txt(r => str(r, 'IssueNo'), 'center') },
    { header: 'Indent No', width: 55, cell: txt(r => str(r, 'strItemRequisitionNo'), 'center') },
    { header: 'Date', width: 55, cell: txt(r => ddmmyyyy(r.IssueDate), 'center') },
    { header: 'Item ID', width: 50, cell: txt(r => str(r, 'ItemID'), 'center') },
    { header: 'Item Name', width: '*', cell: txt(r => str(r, 'ItemName')) },
    { header: 'UOM', width: 36, cell: txt(r => str(r, 'ItemUomName'), 'center') },
    { header: 'Machine', width: '*', cell: txt(r => str(r, 'MachineName')) },
    { header: 'Require', width: 80, cell: txt(r => str(r, 'EmployeeName')) },
    { header: 'Qty', width: 55, cell: num(r => dec(r, 'Qty'), 3), totalKey: 'qty', totalDigits: 3, totalFn: r => dec(r, 'Qty') },
    { header: 'Rate', width: 50, cell: num(r => dec(r, 'Rate')) },
    { header: 'Amount', width: 70, cell: num(r => dec(r, 'Amount')), totalKey: 'amount', totalFn: r => dec(r, 'Amount') }
  ]
};

// ============================================================================
// MACHINE WISE — grouped by MachineCode
// ============================================================================
const machineWiseConfig = {
  title: 'ISSUE DETAILS (CONSUMPTION) - MACHINE WISE',
  summaryGroupHeader: 'Machine',
  subLabelSpan: 8,
  groupKey: (r) => {
    const name = (r.MachineCode == 0 || r.MachineCode == null) ? 'Others' : (str(r, 'MachineName') || 'Others');
    return name + '||' + (r.MachineCode != null ? String(r.MachineCode) : '');
  },
  groupLabel: (first) => {
    const name = (first.MachineCode == 0 || first.MachineCode == null) ? 'Others' : (str(first, 'MachineName') || 'Others');
    return 'Machine : ' + name;
  },
  columns: [
    { header: 'S.No', width: 22, cell: sn() },
    { header: 'Iss. No', width: 40, cell: txt(r => str(r, 'IssueNo'), 'center') },
    { header: 'Indent No', width: 55, cell: txt(r => str(r, 'strItemRequisitionNo'), 'center') },
    { header: 'Date', width: 55, cell: txt(r => ddmmyyyy(r.IssueDate), 'center') },
    { header: 'Cost Head', width: '*', cell: txt(r => str(r, 'CostHeadName')) },
    { header: 'Item ID', width: 50, cell: txt(r => str(r, 'ItemID'), 'center') },
    { header: 'Item Name', width: '*', cell: txt(r => str(r, 'ItemName')) },
    { header: 'UOM', width: 36, cell: txt(r => str(r, 'ItemUomName'), 'center') },
    { header: 'Qty', width: 55, cell: num(r => dec(r, 'Qty'), 3), totalKey: 'qty', totalDigits: 3, totalFn: r => dec(r, 'Qty') },
    { header: 'Rate', width: 50, cell: num(r => dec(r, 'Rate')) },
    { header: 'Amount', width: 70, cell: num(r => dec(r, 'Amount')), totalKey: 'amount', totalFn: r => dec(r, 'Amount') }
  ]
};

export const dateWise = { buildDocDefinition: makeBuilder(dateWiseConfig) };
export const departmentWise = { buildDocDefinition: makeBuilder(departmentWiseConfig) };
export const itemWise = { buildDocDefinition: makeBuilder(itemWiseConfig) };
export const costHeadWise = { buildDocDefinition: makeBuilder(costHeadWiseConfig) };
export const machineWise = { buildDocDefinition: makeBuilder(machineWiseConfig) };

export default { dateWise, departmentWise, itemWise, costHeadWise, machineWise };
