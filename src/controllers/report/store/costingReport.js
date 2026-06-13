// reports/costingReport.js
// Four grouped Store Costing reports sharing one SP and one builder factory.
//   sp_Store_Costing (CompanyCode, FromDate, ToDate)
//
// Exports: categoryWise, departmentWise, itemWise, machineWise
// Each exports { buildDocDefinition(rows, companyName, fromDate, toDate) }.
//
// Mirrors rptStoreCostingDetails{Category,Department,Item,Machine}Wise.rdlc.
// Each report has a two-band header (TO DAY / UPTO DATE / COST/KG / COST/SPL),
// one row per group with both period qty+value and SP-provided cost figures,
// then a footer block surfacing the period's RG1 Production + Spindle totals.

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
  bandFill: '#D6E0F5',
  bandText: '#1A3C7B',
  zebraFill: '#FAFBFD',
  subFill: '#EEF2F7',
  subText: '#1A3C7B',
  grandFill: '#1A3C7B',
  grandText: '#FFFFFF',
  borderColor: '#D7DCE3'
};

const baseLayout = {
  hLineWidth: (i, node) => (i === 0 || i === 2 || i === node.table.body.length ? 0.8 : 0.4),
  vLineWidth: () => 0.4,
  hLineColor: (i, node) => (i === 0 || i === 2 || i === node.table.body.length ? COLORS.headerFill : COLORS.borderColor),
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

// sp_Store_Costing emits identical RG1 Production and Spindle figures across
// every detail row (period totals). Summing them would double-count, so we
// pick the largest value seen.
function maxOf(rows, col) {
  let m = 0;
  for (const r of rows) {
    const v = dec(r, col);
    if (v > m) m = v;
  }
  return m;
}

function rg1SpindleBlock(rows) {
  const todayProd = maxOf(rows, 'RG1Prodn');
  const uptoProd = maxOf(rows, 'UpToDateRG1Prodn');
  const todaySpl = maxOf(rows, 'WorkedSpl');
  const uptoSpl = maxOf(rows, 'UpToDateSpl');

  const hdr = (text) => ({ text, bold: true, fillColor: COLORS.bandFill, color: COLORS.bandText, alignment: 'center', fontSize: 8 });
  const sub = (text) => ({ text, bold: true, fillColor: COLORS.subFill, color: COLORS.subText, alignment: 'center', fontSize: 8 });
  const val = (n, digits = 2) => ({ text: fmt(n, digits), bold: true, alignment: 'center', fontSize: 8 });

  return {
    margin: [0, 8, 0, 0],
    table: {
      headerRows: 2,
      widths: ['*', '*', '*', '*'],
      body: [
        [
          { ...hdr('RG1 PRODUCTION'), colSpan: 2 },
          {},
          { ...hdr('SPINDLES'), colSpan: 2 },
          {}
        ],
        [sub('TO DAY'), sub('UPTO DATE'), sub('TO DAY'), sub('UPTO DATE')],
        [val(todayProd), val(uptoProd), val(todaySpl), val(uptoSpl)]
      ]
    },
    layout: baseLayout
  };
}

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

    const COLS = config.columns;
    const body = [];

    // Two-row banded header — band cells with colSpan over their group on row 1,
    // lone label columns (S.No / group name) use rowSpan=2 so they span both rows
    // and don't get duplicated.
    const [hdrRow1, hdrRow2] = buildHeaderRows(COLS, toDate);
    body.push(hdrRow1);
    body.push(hdrRow2);

    // Aggregate per-group and accumulate grand totals across all tracked keys.
    const totals = {};
    let sno = 1;

    for (const key of sortedKeys) {
      const group = groupsMap.get(key).slice().sort((a, b) =>
        str(a, 'ItemName').localeCompare(str(b, 'ItemName'))
      );

      const sub = {};
      for (const r of group) {
        for (const c of COLS) {
          if (c.totalKey && typeof c.totalFn === 'function') {
            sub[c.totalKey] = (sub[c.totalKey] || 0) + c.totalFn(r);
          }
        }
      }

      const ctx = { r: group[0], sub, sno };
      body.push(COLS.map(c => c.groupCell(ctx)));
      sno++;

      for (const k of Object.keys(sub)) {
        totals[k] = (totals[k] || 0) + sub[k];
      }
    }

    // Grand totals row.
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

    return {
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [15, 20, 15, 45],
      footer: baseFooter,
      content: [
        titleBlock(companyName, config.title, fromDate, toDate),
        {
          table: {
            headerRows: 2,
            dontBreakRows: true,
            keepWithHeaderRows: 0,
            widths: COLS.map(c => c.width),
            body: body
          },
          layout: baseLayout
        },
        rg1SpindleBlock(rows)
      ],
      defaultStyle: { font: 'Roboto', fontSize: 8, lineHeight: 1.25 }
    };
  };
}

// Build BOTH header rows together. Band columns (bandSpan>=2) use colSpan on
// row 1 and emit their own per-column headers on row 2. Lone label columns
// (S.No / group name) rowSpan=2 so they span both rows; row 2 emits {} as
// the rowSpan placeholder pdfmake expects.
function buildHeaderRows(COLS, toDate) {
  const row1 = [];
  const row2 = [];
  let i = 0;
  while (i < COLS.length) {
    const c = COLS[i];
    if (c.bandSpan && c.bandSpan > 1) {
      const text = typeof c.bandLabel === 'function' ? c.bandLabel(toDate) : c.bandLabel;
      row1.push({
        text, colSpan: c.bandSpan, bold: true,
        fillColor: COLORS.bandFill, color: COLORS.bandText,
        alignment: 'center', fontSize: 9
      });
      for (let j = 1; j < c.bandSpan; j++) row1.push({});

      for (let j = 0; j < c.bandSpan; j++) {
        const cc = COLS[i + j];
        row2.push({
          text: cc.header, bold: true,
          fillColor: COLORS.headerFill, color: COLORS.headerText,
          alignment: 'center', fontSize: 8
        });
      }
      i += c.bandSpan;
    } else {
      // Lone label column — render label on row 1 and an empty header-coloured
      // cell on row 2 (no rowSpan merge, just visual continuity). Use a
      // non-breaking space so pdfmake reliably paints the fillColor — an empty
      // string leaves the cell white.
      row1.push({
        text: c.bandLabel || c.header, bold: true,
        fillColor: COLORS.headerFill, color: COLORS.headerText,
        alignment: 'center', fontSize: 8
      });
      row2.push({
        text: ' ', fillColor: COLORS.headerFill, color: COLORS.headerText
      });
      i += 1;
    }
  }
  return [row1, row2];
}

// ---- per-cell builders for the group rows ----
const txt = (val, align = 'left') => (ctx) => ({
  text: String(val(ctx.r) ?? ''), alignment: align, fontSize: 8
});
const numFromSub = (key, digits = 2) => (ctx) => ({
  text: fmt(ctx.sub[key] || 0, digits), alignment: 'right', fontSize: 8
});
const sn = () => (ctx) => ({
  text: String(ctx.sno), alignment: 'center', fontSize: 8
});
// Avg Rate (Item Wise only) — derived from group sums of qty/amount.
const avgRate = (qtyKey, amountKey) => (ctx) => ({
  text: fmt(ctx.sub[qtyKey] > 0 ? (ctx.sub[amountKey] || 0) / ctx.sub[qtyKey] : 0, 2),
  alignment: 'right', fontSize: 8
});

// ============================================================================
// CATEGORY WISE — grouped by ItemCategoryCode
// ============================================================================
const categoryWiseConfig = {
  title: 'COSTING DETAILS - CATEGORY WISE',
  subLabelSpan: 2,
  groupKey: (r) => (str(r, 'ItemCategoryName') || '(Unknown Category)') + '||' + (r.ItemCategoryCode != null ? String(r.ItemCategoryCode) : ''),
  columns: [
    { header: 'S.No', width: 28, bandLabel: 'S.No', groupCell: sn() },
    { header: 'Item Category Name', width: '*', bandLabel: 'Item Category Name', groupCell: txt(r => str(r, 'ItemCategoryName')) },

    { header: 'Qty', width: 60, bandLabel: (toDate) => `TO DAY (${ddmmyyyy(toDate)})`, bandSpan: 2,
      groupCell: numFromSub('qty', 3), totalKey: 'qty', totalDigits: 3, totalFn: r => dec(r, 'Qty') },
    { header: 'Value', width: 80,
      groupCell: numFromSub('amount'), totalKey: 'amount', totalFn: r => dec(r, 'Amount') },

    { header: 'Qty', width: 60, bandLabel: 'UPTO DATE', bandSpan: 2,
      groupCell: numFromSub('uptoQty', 3), totalKey: 'uptoQty', totalDigits: 3, totalFn: r => dec(r, 'UpToDateQty') },
    { header: 'Value', width: 80,
      groupCell: numFromSub('uptoAmount'), totalKey: 'uptoAmount', totalFn: r => dec(r, 'UpToDateAmount') },

    { header: 'TO DAY', width: 55, bandLabel: 'COST / KG', bandSpan: 2,
      groupCell: numFromSub('onKg'), totalKey: 'onKg', totalFn: r => dec(r, 'OnDate_CostperKgs') },
    { header: 'UPTO DATE', width: 60,
      groupCell: numFromSub('upKg'), totalKey: 'upKg', totalFn: r => dec(r, 'UptoDate_CostPerKgs') },

    { header: 'TO DAY', width: 55, bandLabel: 'COST / SPL', bandSpan: 2,
      groupCell: numFromSub('onSpl'), totalKey: 'onSpl', totalFn: r => dec(r, 'OnDate_CostPerSpl') },
    { header: 'UPTO DATE', width: 60,
      groupCell: numFromSub('upSpl'), totalKey: 'upSpl', totalFn: r => dec(r, 'UpToDate_CostPerSpl') }
  ]
};

// ============================================================================
// DEPARTMENT WISE — grouped by DepartmentCode
// ============================================================================
const departmentWiseConfig = {
  title: 'COSTING DETAILS - DEPARTMENT WISE',
  subLabelSpan: 2,
  groupKey: (r) => (str(r, 'DepartmentName') || '(Unknown Department)') + '||' + (r.DepartmentCode != null ? String(r.DepartmentCode) : ''),
  columns: [
    { header: 'S.No', width: 28, bandLabel: 'S.No', groupCell: sn() },
    { header: 'Department', width: '*', bandLabel: 'Department', groupCell: txt(r => str(r, 'DepartmentName')) },

    { header: 'Qty', width: 60, bandLabel: (toDate) => `TO DAY (${ddmmyyyy(toDate)})`, bandSpan: 2,
      groupCell: numFromSub('qty', 3), totalKey: 'qty', totalDigits: 3, totalFn: r => dec(r, 'Qty') },
    { header: 'Value', width: 80,
      groupCell: numFromSub('amount'), totalKey: 'amount', totalFn: r => dec(r, 'Amount') },

    { header: 'Qty', width: 60, bandLabel: 'UPTO DATE', bandSpan: 2,
      groupCell: numFromSub('uptoQty', 3), totalKey: 'uptoQty', totalDigits: 3, totalFn: r => dec(r, 'UpToDateQty') },
    { header: 'Value', width: 80,
      groupCell: numFromSub('uptoAmount'), totalKey: 'uptoAmount', totalFn: r => dec(r, 'UpToDateAmount') },

    { header: 'TO DAY', width: 55, bandLabel: 'COST / KG', bandSpan: 2,
      groupCell: numFromSub('onKg'), totalKey: 'onKg', totalFn: r => dec(r, 'OnDate_CostperKgs') },
    { header: 'UPTO DATE', width: 60,
      groupCell: numFromSub('upKg'), totalKey: 'upKg', totalFn: r => dec(r, 'UptoDate_CostPerKgs') },

    { header: 'TO DAY', width: 55, bandLabel: 'COST / SPL', bandSpan: 2,
      groupCell: numFromSub('onSpl'), totalKey: 'onSpl', totalFn: r => dec(r, 'OnDate_CostPerSpl') },
    { header: 'UPTO DATE', width: 60,
      groupCell: numFromSub('upSpl'), totalKey: 'upSpl', totalFn: r => dec(r, 'UpToDate_CostPerSpl') }
  ]
};

// ============================================================================
// ITEM WISE — grouped by ItemCode, adds Avg Rate columns for TO DAY / UPTO DATE
// ============================================================================
const itemWiseConfig = {
  title: 'COSTING DETAILS - ITEM WISE',
  subLabelSpan: 2,
  groupKey: (r) => (str(r, 'ItemName') || '(Unknown Item)') + '||' + (r.ItemCode != null ? String(r.ItemCode) : ''),
  columns: [
    { header: 'S.No', width: 24, bandLabel: 'S.No', groupCell: sn() },
    { header: 'Item Name', width: '*', bandLabel: 'Item Name', groupCell: txt(r => str(r, 'ItemName')) },

    { header: 'Qty', width: 52, bandLabel: (toDate) => `TO DAY (${ddmmyyyy(toDate)})`, bandSpan: 3,
      groupCell: numFromSub('qty', 3), totalKey: 'qty', totalDigits: 3, totalFn: r => dec(r, 'Qty') },
    { header: 'Avg Rate', width: 52, groupCell: avgRate('qty', 'amount') },
    { header: 'Value', width: 70,
      groupCell: numFromSub('amount'), totalKey: 'amount', totalFn: r => dec(r, 'Amount') },

    { header: 'Qty', width: 52, bandLabel: 'UPTO DATE', bandSpan: 3,
      groupCell: numFromSub('uptoQty', 3), totalKey: 'uptoQty', totalDigits: 3, totalFn: r => dec(r, 'UpToDateQty') },
    { header: 'Avg Rate', width: 52, groupCell: avgRate('uptoQty', 'uptoAmount') },
    { header: 'Value', width: 70,
      groupCell: numFromSub('uptoAmount'), totalKey: 'uptoAmount', totalFn: r => dec(r, 'UpToDateAmount') },

    { header: 'TO DAY', width: 52, bandLabel: 'COST / KG', bandSpan: 2,
      groupCell: numFromSub('onKg'), totalKey: 'onKg', totalFn: r => dec(r, 'OnDate_CostperKgs') },
    { header: 'UPTO DATE', width: 60,
      groupCell: numFromSub('upKg'), totalKey: 'upKg', totalFn: r => dec(r, 'UptoDate_CostPerKgs') },

    { header: 'TO DAY', width: 52, bandLabel: 'COST / SPL', bandSpan: 2,
      groupCell: numFromSub('onSpl'), totalKey: 'onSpl', totalFn: r => dec(r, 'OnDate_CostPerSpl') },
    { header: 'UPTO DATE', width: 60,
      groupCell: numFromSub('upSpl'), totalKey: 'upSpl', totalFn: r => dec(r, 'UpToDate_CostPerSpl') }
  ]
};

// ============================================================================
// MACHINE WISE — grouped by MachineCode
// ============================================================================
const machineWiseConfig = {
  title: 'COSTING DETAILS - MACHINE WISE',
  subLabelSpan: 2,
  groupKey: (r) => {
    const name = (r.MachineCode == 0 || r.MachineCode == null) ? 'Others' : (str(r, 'MachineName') || 'Others');
    return name + '||' + (r.MachineCode != null ? String(r.MachineCode) : '');
  },
  columns: [
    { header: 'S.No', width: 28, bandLabel: 'S.No', groupCell: sn() },
    { header: 'Machine Name', width: '*', bandLabel: 'Machine Name', groupCell: txt(r => str(r, 'MachineName')) },

    { header: 'Qty', width: 60, bandLabel: (toDate) => `TO DAY (${ddmmyyyy(toDate)})`, bandSpan: 2,
      groupCell: numFromSub('qty', 3), totalKey: 'qty', totalDigits: 3, totalFn: r => dec(r, 'Qty') },
    { header: 'Value', width: 80,
      groupCell: numFromSub('amount'), totalKey: 'amount', totalFn: r => dec(r, 'Amount') },

    { header: 'Qty', width: 60, bandLabel: 'UPTO DATE', bandSpan: 2,
      groupCell: numFromSub('uptoQty', 3), totalKey: 'uptoQty', totalDigits: 3, totalFn: r => dec(r, 'UpToDateQty') },
    { header: 'Value', width: 80,
      groupCell: numFromSub('uptoAmount'), totalKey: 'uptoAmount', totalFn: r => dec(r, 'UpToDateAmount') },

    { header: 'TO DAY', width: 55, bandLabel: 'COST / KG', bandSpan: 2,
      groupCell: numFromSub('onKg'), totalKey: 'onKg', totalFn: r => dec(r, 'OnDate_CostperKgs') },
    { header: 'UPTO DATE', width: 60,
      groupCell: numFromSub('upKg'), totalKey: 'upKg', totalFn: r => dec(r, 'UptoDate_CostPerKgs') },

    { header: 'TO DAY', width: 55, bandLabel: 'COST / SPL', bandSpan: 2,
      groupCell: numFromSub('onSpl'), totalKey: 'onSpl', totalFn: r => dec(r, 'OnDate_CostPerSpl') },
    { header: 'UPTO DATE', width: 60,
      groupCell: numFromSub('upSpl'), totalKey: 'upSpl', totalFn: r => dec(r, 'UpToDate_CostPerSpl') }
  ]
};

export const categoryWise = { buildDocDefinition: makeBuilder(categoryWiseConfig) };
export const departmentWise = { buildDocDefinition: makeBuilder(departmentWiseConfig) };
export const itemWise = { buildDocDefinition: makeBuilder(itemWiseConfig) };
export const machineWise = { buildDocDefinition: makeBuilder(machineWiseConfig) };

export default { categoryWise, departmentWise, itemWise, machineWise };
