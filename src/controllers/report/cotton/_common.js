// Shared helpers + orchestrator for cotton PDF reports.
// All cotton report controllers compose their docDefinition using
// the helpers here so the visual style + plumbing stays consistent.

import sql from 'mssql';
import PdfPrinter from 'pdfmake';
import { getPool } from '../../../config/dynamicDB.js';

const fontDescriptors = {
  Roboto: {
    normal: 'Times-Roman',
    bold: 'Times-Bold',
    italics: 'Times-Italic',
    bolditalics: 'Times-BoldItalic'
  }
};
const printer = new PdfPrinter(fontDescriptors);

export function renderPdf(docDefinition) {
  return new Promise((resolve, reject) => {
    try {
      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      const chunks = [];
      pdfDoc.on('data', (c) => chunks.push(c));
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
      pdfDoc.on('error', reject);
      pdfDoc.end();
    } catch (err) {
      reject(err);
    }
  });
}

export function readParams(req) {
  return {
    CompanyCode: req.query.CompanyCode || '0',
    FromDate: req.query.FromDate || new Date().toISOString().slice(0, 10),
    ToDate: req.query.ToDate || new Date().toISOString().slice(0, 10),
    debug: req.query.debug === '1'
  };
}

// Detect common image magic bytes and emit a data URI pdfmake can render.
function bufferToDataUri(buf) {
  if (!buf) return null;
  // mssql may give us Buffer directly, or { type: 'Buffer', data: [...] }
  const b = Buffer.isBuffer(buf) ? buf : (buf?.data ? Buffer.from(buf.data) : null);
  if (!b || b.length < 4) return null;
  let mime = 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) mime = 'image/png';
  else if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) mime = 'image/gif';
  else if (b[0] === 0x42 && b[1] === 0x4D) mime = 'image/bmp';
  return `data:${mime};base64,${b.toString('base64')}`;
}

// Returns { name, logo } — logo is a data URI (or null when the company row
// has no logo bytes). Both come from sp_Company_GetAll.
export async function getCompanyInfo(pool, companyCode) {
  const r = pool.request();
  r.input('CompanyCode', sql.Int, parseInt(companyCode) || 0);
  const result = await r.execute('sp_Company_GetAll');
  const rows = result.recordset || [];
  if (rows.length === 0) return { name: '', logo: null };
  return {
    name: rows[0].CompanyName || '',
    logo: bufferToDataUri(rows[0].Logo)
  };
}

// Back-compat — kept so any older caller still works.
export async function getCompanyName(pool, companyCode) {
  return (await getCompanyInfo(pool, companyCode)).name;
}

// ---- value coercion helpers ----
export const dec = (row, col) => {
  const v = row[col];
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};
export const str = (row, col) => {
  const v = row[col];
  return (v === null || v === undefined) ? '' : String(v);
};
export const fmt = (n, digits = 2) =>
  Number(n).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const ddmmyyyy = (d) => {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yy = dt.getFullYear();
  return `${dd}/${mm}/${yy}`;
};

// Greedy word-wrap line estimator — used to compute per-row vertical centering.
export const estimateLines = (text, charsPerLine) => {
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

// Empirical line height for Times-Roman 8pt with lineHeight 1.25
export const LINE_HEIGHT_PT = 9;

// Compute vertical-centering top margin for a cell with `cellLines` content
// inside a row whose tallest cell has `maxLines`.
export const topPadFor = (maxLines, cellLines) =>
  ((maxLines - cellLines) * LINE_HEIGHT_PT) / 2;

// ---- shared visual palette ----
export const colors = {
  headerFill: '#1A3C7B',
  headerText: '#FFFFFF',
  groupFill: '#E8F0FE',
  groupText: '#1A3C7B',
  zebraFill: '#FAFBFD',
  subFill: '#EEF2F7',
  subText: '#1A3C7B',
  grandFill: '#1A3C7B',
  grandText: '#FFFFFF',
  borderColor: '#D7DCE3',
  titleColor: '#008000',
  companyColor: '#7B3F00'
};

// Standard table layout — thicker accent lines at top of header / under header / bottom.
export function tableLayout() {
  return {
    hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0.4),
    vLineWidth: () => 0.4,
    hLineColor: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? colors.headerFill : colors.borderColor),
    vLineColor: () => colors.borderColor,
    paddingLeft: () => 4,
    paddingRight: () => 4,
    paddingTop: () => 6,
    paddingBottom: () => 6
  };
}

// First-page title block — logo on the left, company name (brown), report title
// (green), date range bold. The right column is an empty spacer matching the
// logo column width so the title text remains visually centered on the page.
export function titleBlock(companyName, title, fromDate, toDate, logoDataUri) {
  const LOGO_COL_WIDTH = 90;
  const logoCol = logoDataUri
    ? { image: logoDataUri, fit: [80, 80], width: LOGO_COL_WIDTH, alignment: 'left', margin: [4, 0, 0, 0] }
    : { text: '', width: LOGO_COL_WIDTH };
  const textCol = {
    width: '*',
    stack: [
      { text: companyName, alignment: 'center', fontSize: 16, bold: true, color: colors.companyColor, margin: [0, 0, 0, 6] },
      { text: title, alignment: 'center', fontSize: 12, bold: true, color: colors.titleColor, margin: [0, 0, 0, 6] },
      { text: `From : ${ddmmyyyy(fromDate)}   To : ${ddmmyyyy(toDate)}`, alignment: 'center', fontSize: 10, bold: true }
    ]
  };
  const spacerCol = { text: '', width: LOGO_COL_WIDTH };
  return {
    columns: [logoCol, textCol, spacerCol],
    margin: [0, 0, 0, 10]
  };
}

export function footerBlock(currentPage, pageCount) {
  return {
    margin: [0, 12, 0, 0],
    columns: [
      { text: 'Report Printed : ' + new Date().toLocaleString('en-GB'), fontSize: 7, margin: [15, 0, 0, 0] },
      { text: `Page ${currentPage} of ${pageCount}`, alignment: 'right', fontSize: 7, margin: [0, 0, 15, 0] }
    ]
  };
}

// Build a page-level pdfmake doc skeleton. When `summary` is provided, the
// summary page is rendered FIRST and the detail title block / tables follow on
// a new page (pageBreak before the detail title).
export function buildPage({ companyName, companyLogo, title, fromDate, toDate, tables, summary }) {
  const hasSummary = Array.isArray(summary) && summary.length > 0;
  const content = [];

  if (hasSummary) content.push(...summary);

  const detailTitle = titleBlock(companyName, title, fromDate, toDate, companyLogo);
  if (hasSummary) detailTitle.pageBreak = 'before';
  content.push(detailTitle);

  for (const t of tables) content.push(t);

  return {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [15, 20, 15, 45],
    footer: (currentPage, pageCount) => footerBlock(currentPage, pageCount),
    content,
    defaultStyle: { font: 'Roboto', fontSize: 8, lineHeight: 1.25 }
  };
}

// Build a new-page summary table — one row per group plus a grand-total row.
// `totalCols` is an array of { header, key, digits? } describing summary columns.
// `groupSummaries` is an array of { label, totals } emitted while building the main table.
// Returns pdfmake content nodes to spread into the doc's content array (or pass as `summary`).
// ----------------------------------------------------------------------------
// Shared "modern UI" trend chart — a white panel with gradient bars, a teal
// trend line + markers + arrowhead, and a value/index label under each bar.
// Rendered with pdfmake's native canvas (no charting library). Returns an
// unbreakable node array so the title + graph stay together on one page.
// ----------------------------------------------------------------------------
const CHART = {
  width: 540, height: 240, pad: 16, topPad: 30, bottomPad: 16, maxBars: 24,
  panelTop: '#FFFFFF', panelBottom: '#F3F6FB', panelBorder: '#D7DCE3',
  gridColor: '#E6EAF2', axisColor: '#C7CEDB', line: '#12B886'
};
// Vibrant [top, bottom] gradient pairs — each bar cycles to the next pair so
// adjacent bars never share the same colour.
const BAR_GRADIENTS = [
  ['#FF2D9B', '#FF9F1C'], // magenta -> orange
  ['#11998E', '#38EF7D'], // teal -> green
  ['#2193B0', '#6DD5ED'], // blue -> cyan
  ['#7B4397', '#DC2430'], // purple -> red
  ['#F7971E', '#FFD200'], // orange -> yellow
  ['#4E54C8', '#8F94FB'], // indigo -> violet
  ['#0BAB64', '#3BB78F'], // green -> teal
  ['#CB356B', '#BD3F32'], // pink -> rust
  ['#EC008C', '#FC6767'], // pink -> coral
  ['#1FA2FF', '#12D8FA']  // sky -> aqua
];
const _hexToRgb = (h) => { const x = h.replace('#', ''); return { r: parseInt(x.slice(0, 2), 16), g: parseInt(x.slice(2, 4), 16), b: parseInt(x.slice(4, 6), 16) }; };
const _toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
const _lerp = (a, b, t) => { const c1 = _hexToRgb(a), c2 = _hexToRgb(b); return `#${_toHex(c1.r + (c2.r - c1.r) * t)}${_toHex(c1.g + (c2.g - c1.g) * t)}${_toHex(c1.b + (c2.b - c1.b) * t)}`; };
function _gradientBar(x, yTop, w, h, top, bottom) {
  const ops = []; const slices = 18; const sh = h / slices;
  for (let s = 0; s < slices; s++) { const t = slices > 1 ? s / (slices - 1) : 0; ops.push({ type: 'rect', x, y: yTop + s * sh, w, h: sh + 0.6, color: _lerp(top, bottom, t) }); }
  ops.push({ type: 'ellipse', x: x + w / 2, y: yTop, r1: w / 2, r2: 3, color: top });
  return ops;
}
const _compact = (v, digits) => {
  const a = Math.abs(v);
  if (a >= 1e7) return (v / 1e7).toFixed(2) + 'Cr';
  if (a >= 1e5) return (v / 1e5).toFixed(2) + 'L';
  if (a >= 1e3) return (v / 1e3).toFixed(1) + 'k';
  return fmt(v, digits);
};

// Convenience: build the trend chart directly from detail rows by grouping and
// summing one numeric column. Used by reports that don't expose a ready-made
// groupSummaries array.
export function chartFromRows(rows, { groupKey, groupLabel, valueFn, valueHeader = 'Value', groupHeader = 'Group', digits = 2 }) {
  const map = new Map();
  for (const r of rows || []) {
    const k = groupKey(r);
    if (k === null || k === undefined || k === '') continue;
    if (!map.has(k)) {
      let label = String(groupLabel(r) || '');
      const ci = label.indexOf(' : ');
      if (ci >= 0) label = label.slice(ci + 3).trim();
      map.set(k, { label, v: 0 });
    }
    map.get(k).v += Number(valueFn(r)) || 0;
  }
  const groupSummaries = [...map.values()].map((g) => ({ label: g.label, totals: { v: g.v } }));
  return buildTrendChart(groupSummaries, [{ header: valueHeader, key: 'v', digits }], { groupHeader });
}

// groupSummaries: [{ label, totals|sub }]; totalCols: [{ header, key|totalKey, digits }]
export function buildTrendChart(groupSummaries, totalCols, opts = {}) {
  if (!groupSummaries || !groupSummaries.length || !totalCols || !totalCols.length) return [];
  const metric = totalCols[totalCols.length - 1];
  const mkey = metric.key || metric.totalKey;
  const digits = (metric.digits != null ? metric.digits : (metric.totalDigits != null ? metric.totalDigits : 2));
  const groupHeader = opts.groupHeader || 'Group';
  const valOf = (gs) => Math.abs(Number((gs.totals || gs.sub || {})[mkey]) || 0);

  const shown = groupSummaries.slice(0, CHART.maxBars);
  const truncated = groupSummaries.length > shown.length;
  const { width: W, height: H, pad, topPad, bottomPad } = CHART;
  const baseline = H - bottomPad;
  const maxBarH = baseline - topPad;
  const plotW = W - pad * 2;
  const n = shown.length || 1;
  const slotW = plotW / n;
  const barW = Math.min(30, slotW * 0.6);
  const maxVal = Math.max(1, ...shown.map(valOf));

  const ops = [];
  ops.push({ type: 'rect', x: 0, y: 0, w: W, h: H, r: 10, linearGradient: [CHART.panelTop, CHART.panelBottom], lineColor: CHART.panelBorder, lineWidth: 1 });
  for (let g = 1; g <= 4; g++) { const y = baseline - (g / 4) * maxBarH; ops.push({ type: 'line', x1: pad, y1: y, x2: W - pad, y2: y, lineWidth: 0.5, lineColor: CHART.gridColor }); }
  ops.push({ type: 'line', x1: pad, y1: baseline, x2: W - pad, y2: baseline, lineWidth: 0.8, lineColor: CHART.axisColor });

  const pts = [];
  shown.forEach((gs, i) => {
    const v = valOf(gs);
    const h = Math.max(2, (v / maxVal) * maxBarH);
    const x = pad + i * slotW + (slotW - barW) / 2;
    const yTop = baseline - h;
    const [top, bottom] = BAR_GRADIENTS[i % BAR_GRADIENTS.length]; // each bar a different colour
    for (const op of _gradientBar(x, yTop, barW, h, top, bottom)) ops.push(op);
    pts.push({ x: x + barW / 2, y: yTop });
  });

  if (pts.length >= 2) {
    ops.push({ type: 'polyline', lineWidth: 2.5, lineColor: CHART.line, lineJoin: 'round', points: pts.map(p => ({ x: p.x, y: p.y })) });
    for (const p of pts) ops.push({ type: 'ellipse', x: p.x, y: p.y, r1: 2.4, r2: 2.4, color: '#FFFFFF', lineColor: CHART.line, lineWidth: 1.2 });
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    let dx = b.x - a.x, dy = b.y - a.y; const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    const px = -dy, py = dx; const L = 9, Wd = 5; const bx = b.x - dx * L, by = b.y - dy * L;
    ops.push({ type: 'polyline', closePath: true, color: CHART.line, points: [{ x: b.x, y: b.y }, { x: bx + px * Wd, y: by + py * Wd }, { x: bx - px * Wd, y: by - py * Wd }] });
  }

  const labelCols = [{ width: pad, text: '' }];
  shown.forEach((gs, i) => {
    labelCols.push({
      width: slotW,
      stack: [
        { text: _compact(Number((gs.totals || gs.sub || {})[mkey]) || 0, digits), fontSize: 6, bold: true, color: colors.subText, alignment: 'center' },
        { text: String(i + 1).padStart(2, '0'), fontSize: 6, color: '#9AA0AE', alignment: 'center', margin: [0, 1, 0, 0] }
      ],
      margin: [0, 4, 0, 0]
    });
  });
  labelCols.push({ width: pad, text: '' });

  const caption = `Trend of ${metric.header}; figure under each bar = value, number = S.No in the summary above`
    + (truncated ? `  (showing top ${shown.length} of ${groupSummaries.length})` : '');

  return [{
    unbreakable: true,
    stack: [
      { text: `${metric.header} by ${groupHeader}`, fontSize: 12, bold: true, color: '#008000', margin: [0, 14, 0, 2] },
      { text: caption, fontSize: 8, italics: true, color: '#666666', margin: [0, 0, 0, 8] },
      { canvas: ops },
      { columns: labelCols, columnGap: 0 }
    ]
  }];
}

export function buildGroupSummaryPage({ companyName, companyLogo, fromDate, toDate, title, groupHeader, groupSummaries, grandTotals, totalCols }) {
  const hdr = (text) => ({ text, bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 8 });

  const headerRow = [hdr('S.No'), hdr(groupHeader), ...totalCols.map(c => hdr(c.header))];

  const dataRows = groupSummaries.map((gs, i) => {
    const zebra = i % 2 === 1 ? colors.zebraFill : null;
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
    { text: 'Total', colSpan: 2, alignment: 'right', bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 },
    {},
    ...totalCols.map(c => ({
      text: fmt(grandTotals[c.key] || 0, c.digits != null ? c.digits : 2),
      alignment: 'right', bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9
    }))
  ];

  const widths = [30, '*', ...totalCols.map(() => 70)];

  // No pageBreak on the title — the summary now renders FIRST, and `buildPage`
  // adds a pageBreak before the detail title block instead.
  // The trend chart is appended right after the summary table (before detail).
  return [
    titleBlock(companyName, title, fromDate, toDate, companyLogo),
    {
      table: { headerRows: 1, dontBreakRows: true, widths, body: [headerRow, ...dataRows, totalRow] },
      layout: tableLayout()
    },
    ...buildTrendChart(groupSummaries, totalCols, { groupHeader })
  ];
}

// Orchestrator — every cotton report controller calls this.
// `spParams` (optional) returns an object of { paramName: { type, value } } for the SP.
// Defaults to CompanyCode / FromDate / ToDate which covers most reports.
export async function runReport(req, res, { spName, fileName, buildDocDefinition, spParams }) {
  const t0 = Date.now();
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) {
      return res.status(400).type('text/plain').send('Missing subDBName header');
    }

    const p = readParams(req);
    const pool = await getPool(subDbName);

    const tSp = Date.now();
    const spReq = pool.request();
    const params = spParams ? spParams(p, req) : {
      CompanyCode: { type: sql.Int, value: parseInt(p.CompanyCode) || 0 },
      FromDate: { type: sql.DateTime, value: p.FromDate ? new Date(p.FromDate) : null },
      ToDate: { type: sql.DateTime, value: p.ToDate ? new Date(p.ToDate) : null }
    };
    for (const [key, { type, value }] of Object.entries(params)) {
      spReq.input(key, type, value);
    }
    const spResult = await spReq.execute(spName);
    const detail = spResult.recordset || [];
    console.log(detail, 'details 2323');
    
    const company = await getCompanyInfo(pool, p.CompanyCode);
    const spMs = Date.now() - tSp;

    const tRender = Date.now();
    const docDef = buildDocDefinition({
      rows: detail,
      companyName: company.name,
      companyLogo: company.logo,
      fromDate: p.FromDate,
      toDate: p.ToDate,
      query: req.query
    });
    const pdfBuffer = await renderPdf(docDef);
    const renderMs = Date.now() - tRender;

    if (p.debug) {
      // Surface every input that can produce different results across environments
      // so we can diff local vs live without guessing.
      const dbCfg = pool.config || {};
      const paramDump = Object.entries(params)
        .map(([k, { value }]) => `  ${k} = ${value instanceof Date ? value.toISOString() : value}`)
        .join('\n');
      const sample = detail.slice(0, 3).map((r, i) =>
        `  [${i}] ` + JSON.stringify(r).slice(0, 240)
      ).join('\n');
      return res.type('text/plain').send(
        [
          `SP:           ${spName}`,
          `subDBName:    ${subDbName}`,
          `server:       ${dbCfg.server}${dbCfg.port ? ':' + dbCfg.port : ''}`,
          `database:     ${dbCfg.database}`,
          `user:         ${dbCfg.user}`,
          `company:      ${company.name || '(none)'}`,
          `params:\n${paramDump}`,
          `rows:         ${detail.length}`,
          `SP fetch:     ${spMs} ms`,
          `PDF render:   ${renderMs} ms (${pdfBuffer.length} bytes)`,
          `Total:        ${Date.now() - t0} ms`,
          sample ? `\nfirst rows:\n${sample}` : ''
        ].join('\n')
      );
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}.pdf"`);
    res.send(pdfBuffer);

  } catch (err) {
    console.error(err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
}

// Multi-SP orchestrator — for composite reports that stitch several stored
// procedures into one document (e.g. the daily Production OverAll report).
// `procs` is an array of { key, spName, spParams? }. Each SP runs with the
// default CompanyCode / FromDate / ToDate params unless its own `spParams`
// override is supplied. Results are handed to `buildDocDefinition` as
// `{ data: { [key]: rows }, companyName, companyLogo, fromDate, toDate, query }`.
export async function runMultiReport(req, res, { procs, fileName, buildDocDefinition }) {
  const t0 = Date.now();
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) {
      return res.status(400).type('text/plain').send('Missing subDBName header');
    }

    const p = readParams(req);
    const pool = await getPool(subDbName);

    const defaultParams = {
      CompanyCode: { type: sql.Int, value: parseInt(p.CompanyCode) || 0 },
      FromDate: { type: sql.DateTime, value: p.FromDate ? new Date(p.FromDate) : null },
      ToDate: { type: sql.DateTime, value: p.ToDate ? new Date(p.ToDate) : null }
    };

    const tSp = Date.now();
    const data = {};
    const errors = {};
    // Run each proc independently — one failing SP must not sink the whole
    // report, so we capture its error and continue with an empty recordset.
    for (const proc of procs) {
      const params = proc.spParams ? proc.spParams(p, req) : defaultParams;
      try {
        const spReq = pool.request();
        for (const [key, { type, value }] of Object.entries(params)) {
          spReq.input(key, type, value);
        }
        const spResult = await spReq.execute(proc.spName);
        data[proc.key] = spResult.recordset || [];
      } catch (e) {
        data[proc.key] = [];
        errors[proc.key] = e.message;
        console.error(`runMultiReport: ${proc.spName} failed -`, e.message);
      }
    }

    const company = await getCompanyInfo(pool, p.CompanyCode);
    const spMs = Date.now() - tSp;

    const tRender = Date.now();
    const docDef = buildDocDefinition({
      data,
      companyName: company.name,
      companyLogo: company.logo,
      fromDate: p.FromDate,
      toDate: p.ToDate,
      query: req.query
    });
    const pdfBuffer = await renderPdf(docDef);
    const renderMs = Date.now() - tRender;

    if (p.debug) {
      const dbCfg = pool.config || {};
      const counts = procs
        .map((proc) => `  ${proc.key.padEnd(18)} ${proc.spName.padEnd(48)} rows=${(data[proc.key] || []).length}${errors[proc.key] ? '  ERR: ' + errors[proc.key] : ''}`)
        .join('\n');
      return res.type('text/plain').send(
        [
          `MultiReport:  ${fileName}`,
          `subDBName:    ${subDbName}`,
          `server:       ${dbCfg.server}${dbCfg.port ? ':' + dbCfg.port : ''}`,
          `database:     ${dbCfg.database}`,
          `company:      ${company.name || '(none)'}`,
          `params:       CompanyCode=${defaultParams.CompanyCode.value} FromDate=${p.FromDate} ToDate=${p.ToDate}`,
          `procs:\n${counts}`,
          `SP fetch:     ${spMs} ms`,
          `PDF render:   ${renderMs} ms (${pdfBuffer.length} bytes)`,
          `Total:        ${Date.now() - t0} ms`
        ].join('\n')
      );
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}.pdf"`);
    res.send(pdfBuffer);

  } catch (err) {
    console.error(err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
}

// Re-export sql so individual reports can declare custom param types if needed.
export { sql };
