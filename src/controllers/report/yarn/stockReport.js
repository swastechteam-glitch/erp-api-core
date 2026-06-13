// reports/yarn/stockReport.js
// Yarn Stock Statement reports sharing one SP and one builder factory.
//   sp_StockStatement_Yarn (CompanyCode, FromDate, ToDate)
//
// Exports: dateWise, withKgs, countGroupWise
// Each exports { buildDocDefinition(rows, companyName, fromDate, toDate, companyLogo) }.
//
// Mirrors:
//   rptStockStatement_Yarn.rdlc              -> dateWise        (Qty only)
//   rptStockStatement_withKgs_Yarn.rdlc      -> withKgs         (Qty + Weight)
//   rptStockStatement_CountGroupWiseQtyKgs   -> countGroupWise  (grouped by Count Group, Qty + Weight)
//
// A stock statement is itself a summary — one row per count type showing the
// movement (Opening / Production / Purchase / Sales Return / Transfer In /
// Sales / Transfer Out / Closing) over the date range, with a Total footer. The
// count-group variant adds a per-group Total and a Net Total. The company logo
// sits on the title block, matching the RDLC header image.

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
  paddingLeft: () => 3,
  paddingRight: () => 3,
  paddingTop: () => 4,
  paddingBottom: () => 4
};

const baseFooter = (currentPage, pageCount) => ({
  margin: [0, 12, 0, 0],
  columns: [
    { text: 'Developed by Swas Technologies, Report Printed : ' + new Date().toLocaleString('en-GB'), fontSize: 7, margin: [15, 0, 0, 0] },
    { text: `Page ${currentPage} of ${pageCount}`, alignment: 'right', fontSize: 7, margin: [0, 0, 15, 0] }
  ]
});

// Title block — logo on the left, company name (brown), report title (green),
// date range bold. The right spacer matches the logo column so the title stays
// visually centered on the page.
const titleBlock = (companyName, title, fromDate, toDate, logoDataUri) => {
  const LOGO_COL_WIDTH = 90;
  const logoCol = logoDataUri
    ? { image: logoDataUri, fit: [80, 80], width: LOGO_COL_WIDTH, alignment: 'left', margin: [4, 0, 0, 0] }
    : { text: '', width: LOGO_COL_WIDTH };
  const textCol = {
    width: '*',
    stack: [
      { text: companyName, alignment: 'center', fontSize: 16, bold: true, color: '#7B3F00', margin: [0, 0, 0, 6] },
      { text: title, alignment: 'center', fontSize: 12, bold: true, color: '#008000', margin: [0, 0, 0, 6] },
      { text: `From Date : ${ddmmyyyy(fromDate)}    To Date : ${ddmmyyyy(toDate)}`, alignment: 'center', fontSize: 10, bold: true }
    ]
  };
  return {
    columns: [logoCol, textCol, { text: '', width: LOGO_COL_WIDTH }],
    margin: [0, 0, 0, 10]
  };
};

const numText = (kind, value, blankZero) => {
  if (blankZero && (!value || value === 0)) return '';
  return kind === 'kgs' ? fmt(value, 2) : intFmt(value);
};

// Header rows for a section table. `leadHeaders` are the lead columns (e.g.
// S.No + Count / Count Group) that rowSpan both rows when two-level.
const sectionHeaderRows = (sections, twoLevel, leadHeaders, fs) => {
  const hdr = (text, extra = {}) => ({
    text, bold: true, fillColor: COLORS.headerFill, color: COLORS.headerText,
    alignment: 'center', fontSize: fs, ...extra
  });
  if (twoLevel) {
    const row1 = leadHeaders.map(h => hdr(h, { rowSpan: 2 }));
    const row2 = leadHeaders.map(() => ({}));
    for (const s of sections) {
      row1.push(hdr(s.label, { colSpan: s.leaves.length }));
      for (let i = 1; i < s.leaves.length; i++) row1.push({});
      for (const l of s.leaves) row2.push(hdr(l.sub));
    }
    return [row1, row2];
  }
  const row1 = leadHeaders.map(h => hdr(h));
  for (const s of sections) row1.push(hdr(s.label));
  return [row1];
};

// Leading summary page — one row per Count Group with the aggregated movement
// totals + a Net Total. Gives a quick stock overview before the detail table.
function buildSummaryPage({ sections, leaves, rows, config, companyName, fromDate, toDate, companyLogo }) {
  const fs = config.fontSize;
  const leadCount = 2; // S.No + Count Group

  const groupsMap = new Map();
  for (const r of rows) {
    const k = (r.CountGroupCode != null ? String(r.CountGroupCode) : '') + '||' + (str(r, 'CountGroupName') || '(Ungrouped)');
    if (!groupsMap.has(k)) groupsMap.set(k, { name: str(r, 'CountGroupName') || '(Ungrouped)', sums: {} });
    const g = groupsMap.get(k);
    for (const l of leaves) g.sums[l.field] = (g.sums[l.field] || 0) + dec(r, l.field);
  }
  const keys = [...groupsMap.keys()].sort((a, b) => (a.split('||')[1] || '').localeCompare(b.split('||')[1] || ''));

  const body = [...sectionHeaderRows(sections, config.twoLevel, ['S.No', 'Count Group'], fs)];

  const grand = {};
  for (const l of leaves) grand[l.field] = 0;

  let sno = 1;
  for (const key of keys) {
    const g = groupsMap.get(key);
    const zebra = sno % 2 === 0 ? COLORS.zebraFill : null;
    const cells = [
      { text: String(sno), alignment: 'center', fontSize: fs, fillColor: zebra },
      { text: g.name, alignment: 'left', fontSize: fs, fillColor: zebra }
    ];
    for (const l of leaves) {
      cells.push({ text: numText(l.kind, g.sums[l.field] || 0, false), alignment: 'right', fontSize: fs, fillColor: zebra });
      grand[l.field] += g.sums[l.field] || 0;
    }
    body.push(cells);
    sno++;
  }

  const totalRow = [
    { text: 'Net Total :', colSpan: leadCount, alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: fs },
    {}
  ];
  for (const l of leaves) {
    totalRow.push({ text: numText(l.kind, grand[l.field] || 0, false), alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: fs });
  }
  body.push(totalRow);

  return [
    titleBlock(companyName, config.summaryTitle, fromDate, toDate, companyLogo),
    {
      table: {
        headerRows: config.twoLevel ? 2 : 1,
        dontBreakRows: true,
        keepWithHeaderRows: 0,
        widths: config.widths,
        body
      },
      layout: baseLayout
    }
  ];
}

function makeBuilder(config) {
  return function buildDocDefinition(rows, companyName, fromDate, toDate, companyLogo) {
    const sections = config.sections;
    const leaves = [];
    for (const s of sections) {
      for (const l of s.leaves) leaves.push(l);
    }
    const leadCount = 2; // S.No + Count
    const colCount = leadCount + leaves.length;
    const fs = config.fontSize;

    const body = [...sectionHeaderRows(sections, config.twoLevel, ['S.No', 'Count'], fs)];

    const dataCell = (text, align, zebra) => ({ text, alignment: align, fontSize: fs, fillColor: zebra });

    let sno = 1;
    const addDetailRow = (r, zebra) => {
      const cells = [
        dataCell(String(sno), 'center', zebra),
        dataCell(str(r, 'CountType') || str(r, 'CountName'), 'left', zebra)
      ];
      for (const l of leaves) cells.push(dataCell(numText(l.kind, dec(r, l.field), config.blankZero), 'right', zebra));
      body.push(cells);
      sno++;
    };

    const totalsRow = (label, totals, fill, color) => {
      const row = [
        { text: label, colSpan: leadCount, alignment: 'right', bold: true, color, fillColor: fill, fontSize: fs },
        {}
      ];
      for (const l of leaves) {
        row.push({ text: numText(l.kind, totals[l.field] || 0, false), alignment: 'right', bold: true, color, fillColor: fill, fontSize: fs });
      }
      return row;
    };

    const grandTotals = {};
    for (const l of leaves) grandTotals[l.field] = 0;

    if (config.grouped) {
      const groupsMap = new Map();
      for (const r of rows) {
        const k = (r.CountGroupCode != null ? String(r.CountGroupCode) : '') + '||' + (str(r, 'CountGroupName') || '(Ungrouped)');
        if (!groupsMap.has(k)) groupsMap.set(k, []);
        groupsMap.get(k).push(r);
      }
      const keys = [...groupsMap.keys()].sort((a, b) => (a.split('||')[1] || '').localeCompare(b.split('||')[1] || ''));
      for (const key of keys) {
        const grp = groupsMap.get(key);
        const groupName = key.split('||')[1] || '(Ungrouped)';
        const ghr = [{ text: groupName, colSpan: colCount, bold: true, color: COLORS.groupText, fillColor: COLORS.groupFill, fontSize: fs + 1, margin: [2, 2, 0, 2] }];
        for (let i = 1; i < colCount; i++) ghr.push({});
        body.push(ghr);

        const sub = {};
        for (const l of leaves) sub[l.field] = 0;
        let idx = 0;
        for (const r of grp) {
          addDetailRow(r, idx % 2 === 1 ? COLORS.zebraFill : null);
          for (const l of leaves) sub[l.field] += dec(r, l.field);
          idx++;
        }
        body.push(totalsRow('Total :', sub, COLORS.subFill, COLORS.subText));
        for (const l of leaves) grandTotals[l.field] += sub[l.field];
      }
      body.push(totalsRow('Net Total :', grandTotals, COLORS.grandFill, COLORS.grandText));
    } else {
      let idx = 0;
      for (const r of rows) {
        addDetailRow(r, idx % 2 === 1 ? COLORS.zebraFill : null);
        for (const l of leaves) grandTotals[l.field] += dec(r, l.field);
        idx++;
      }
      body.push(totalsRow('Total :', grandTotals, COLORS.grandFill, COLORS.grandText));
    }

    const summaryNodes = config.summary
      ? buildSummaryPage({ sections, leaves, rows, config, companyName, fromDate, toDate, companyLogo })
      : [];

    const detailTitle = titleBlock(companyName, config.title, fromDate, toDate, companyLogo);
    if (summaryNodes.length) detailTitle.pageBreak = 'before';

    return {
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [15, 20, 15, 45],
      footer: baseFooter,
      content: [
        ...summaryNodes,
        ...(config.summary ? chartFromRows(rows, {
          groupKey: (r) => (r.CountGroupCode != null ? String(r.CountGroupCode) : '') + '||' + (str(r, 'CountGroupName') || '(Ungrouped)'),
          groupLabel: (r) => str(r, 'CountGroupName') || '(Ungrouped)',
          valueFn: (r) => dec(r, 'ClQty'), valueHeader: 'Closing Qty',
          groupHeader: 'Count Group', digits: 0
        }) : []),
        detailTitle,
        {
          table: {
            headerRows: config.twoLevel ? 2 : 1,
            dontBreakRows: true,
            keepWithHeaderRows: 0,
            widths: config.widths,
            body
          },
          layout: baseLayout
        }
      ],
      defaultStyle: { font: 'Roboto', fontSize: fs, lineHeight: 1.15 }
    };
  };
}

// ---- section definitions ----

// Qty-only: each movement is a single column carrying its own label.
const qtySections = [
  { label: 'Opening', leaves: [{ field: 'OpnQty', kind: 'qty' }] },
  { label: 'Prodn Qty', leaves: [{ field: 'ProdnQty', kind: 'qty' }] },
  { label: 'Purcha. Qty', leaves: [{ field: 'PurQty', kind: 'qty' }] },
  { label: 'Sales Return Qty', leaves: [{ field: 'SalesReturnQty', kind: 'qty' }] },
  { label: 'Transfer In Qty', leaves: [{ field: 'TransInQty', kind: 'qty' }] },
  { label: 'Sales Qty', leaves: [{ field: 'SalesQty', kind: 'qty' }] },
  { label: 'Transfer Out Qty', leaves: [{ field: 'TransOutQty', kind: 'qty' }] },
  { label: 'Closing Qty', leaves: [{ field: 'ClQty', kind: 'qty' }] }
];

// Qty + Weight: each movement spans two leaf columns (Qty / Weight).
const kgsSections = [
  { label: 'Opening', leaves: [{ sub: 'Qty', field: 'OpnQty', kind: 'qty' }, { sub: 'Weight', field: 'OpnKgs', kind: 'kgs' }] },
  { label: 'Production', leaves: [{ sub: 'Qty', field: 'ProdnQty', kind: 'qty' }, { sub: 'Weight', field: 'ProdnKgs', kind: 'kgs' }] },
  { label: 'Purchase', leaves: [{ sub: 'Qty', field: 'PurQty', kind: 'qty' }, { sub: 'Weight', field: 'PurKgs', kind: 'kgs' }] },
  { label: 'Sales Return', leaves: [{ sub: 'Qty', field: 'SalesReturnQty', kind: 'qty' }, { sub: 'Weight', field: 'SalesReturnKgs', kind: 'kgs' }] },
  { label: 'Transfer In', leaves: [{ sub: 'Qty', field: 'TransInQty', kind: 'qty' }, { sub: 'Weight', field: 'TransInKgs', kind: 'kgs' }] },
  { label: 'Sales', leaves: [{ sub: 'Qty', field: 'SalesQty', kind: 'qty' }, { sub: 'Weight', field: 'SalesKgs', kind: 'kgs' }] },
  { label: 'Transfer Out', leaves: [{ sub: 'Qty', field: 'TransOutQty', kind: 'qty' }, { sub: 'Weight', field: 'TransOutKgs', kind: 'kgs' }] },
  { label: 'Closing', leaves: [{ sub: 'Qty', field: 'ClQty', kind: 'qty' }, { sub: 'Weight', field: 'ClKgs', kind: 'kgs' }] }
];

const qtyWidths = [26, '*', 62, 62, 62, 62, 62, 62, 62, 62];
const kgsWidths = [20, '*', ...Array(16).fill(44)];

// ============================================================================
// DATE WISE — Qty only (rptStockStatement_Yarn.rdlc)
// ============================================================================
const dateWiseConfig = {
  title: 'YARN STOCK STATEMENT',
  summary: true,
  summaryTitle: 'YARN STOCK SUMMARY - COUNT GROUP WISE',
  twoLevel: false,
  grouped: false,
  blankZero: false,
  fontSize: 8,
  sections: qtySections,
  widths: qtyWidths
};

// ============================================================================
// WITH KGS — Qty + Weight (rptStockStatement_withKgs_Yarn.rdlc)
// ============================================================================
const withKgsConfig = {
  title: 'YARN STOCK STATEMENT WITH WEIGHT',
  summary: true,
  summaryTitle: 'YARN STOCK SUMMARY - COUNT GROUP WISE (WITH WEIGHT)',
  twoLevel: true,
  grouped: false,
  blankZero: false,
  fontSize: 7,
  sections: kgsSections,
  widths: kgsWidths
};

// ============================================================================
// COUNT GROUP WISE — grouped by Count Group, Qty + Weight
// (rptStockStatement_CountGroupWiseQtyKgs.rdlc)
// ============================================================================
const countGroupWiseConfig = {
  title: 'YARN STOCK STATEMENT - COUNT GROUP WISE',
  summary: true,
  summaryTitle: 'YARN STOCK SUMMARY - COUNT GROUP WISE',
  twoLevel: true,
  grouped: true,
  blankZero: true,
  fontSize: 7,
  sections: kgsSections,
  widths: kgsWidths
};

export const dateWise = { buildDocDefinition: makeBuilder(dateWiseConfig) };
export const withKgs = { buildDocDefinition: makeBuilder(withKgsConfig) };
export const countGroupWise = { buildDocDefinition: makeBuilder(countGroupWiseConfig) };

export default { dateWise, withKgs, countGroupWise };
