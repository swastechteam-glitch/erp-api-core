// Costing — OverAll Mill Costing report.
// Mirrors rptCosting.rdlc (sp_Costing): cost groups nested under cost main
// groups, each cost group showing summed Qty / Value and average Cost/Kg.
// Shares the cotton/_common PDF pipeline (logo + trend chart).

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, chartFromRows
} from '../cotton/_common.js';

const headRow = (cells) =>
  cells.map((t) => ({ text: t, bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 8 }));
const groupRowNode = (label, span) =>
  [{ text: label, colSpan: span, bold: true, color: colors.groupText, fillColor: colors.groupFill, fontSize: 9, margin: [2, 2, 0, 2] }, ...Array(span - 1).fill({})];
const zebraOf = (i) => (i % 2 === 1 ? colors.zebraFill : null);
const totalStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 };
const subStyle = { bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 8 };

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}

export const millCosting = (req, res) => runReport(req, res, {
  spName: 'sp_Costing',
  fileName: 'OverAllMillCosting',
  buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate }) => {
    const list = rows || [];
    const WIDTHS = ['*', 90, 100, 90];
    const SPAN = 4;
    const body = [headRow(['Cost Group', 'Cost Qty', 'Cost Value', 'Cost Per Kg'])];

    // Cost Main Groups, ordered by MainOrderNo.
    const mains = [...groupBy(list, (r) => str(r, 'CostMainGroupName')).entries()]
      .sort((a, b) => dec(a[1][0], 'MainOrderNo') - dec(b[1][0], 'MainOrderNo'));

    let grandQty = 0, grandValue = 0;
    let zi = 0;
    for (const [, mRows] of mains) {
      body.push(groupRowNode(str(mRows[0], 'CostMainGroupName') || '(Main Group)', SPAN));
      // Cost Groups within, ordered by OrderNo.
      const cgs = [...groupBy(mRows, (r) => str(r, 'CostGroupName')).entries()]
        .sort((a, b) => dec(a[1][0], 'OrderNo') - dec(b[1][0], 'OrderNo'));
      let mQty = 0, mValue = 0;
      for (const [, cgRows] of cgs) {
        const qty = cgRows.reduce((a, r) => a + dec(r, 'CostQty'), 0);
        const value = cgRows.reduce((a, r) => a + dec(r, 'CostValue'), 0);
        const perKgVals = cgRows.map((r) => dec(r, 'CostPerKg')).filter((v) => v > 0);
        const perKg = perKgVals.length ? perKgVals.reduce((a, v) => a + v, 0) / perKgVals.length : 0;
        mQty += qty; mValue += value;
        const z = zebraOf(zi++);
        body.push([
          { text: str(cgRows[0], 'CostGroupName'), fontSize: 8, fillColor: z, margin: [16, 0, 0, 0] },
          { text: qty ? fmt(qty, 2) : '', alignment: 'right', fontSize: 8, fillColor: z },
          { text: value ? fmt(value, 2) : '', alignment: 'right', fontSize: 8, fillColor: z },
          { text: perKg ? fmt(perKg, 2) : '', alignment: 'right', fontSize: 8, fillColor: z }
        ]);
      }
      grandQty += mQty; grandValue += mValue;
      body.push([
        { text: 'Sub Total', alignment: 'right', ...subStyle },
        { text: fmt(mQty, 2), alignment: 'right', ...subStyle },
        { text: fmt(mValue, 2), alignment: 'right', ...subStyle },
        { text: '', ...subStyle }
      ]);
    }

    if (list.length === 0) {
      body.push([{ text: 'No costing data for the selected period.', colSpan: SPAN, italics: true, fontSize: 8, color: '#888' }, ...Array(SPAN - 1).fill({})]);
    } else {
      body.push([
        { text: 'Grand Total', alignment: 'right', ...totalStyle },
        { text: fmt(grandQty, 2), alignment: 'right', ...totalStyle },
        { text: fmt(grandValue, 2), alignment: 'right', ...totalStyle },
        { text: '', ...totalStyle }
      ]);
    }

    const table = { table: { headerRows: 1, widths: WIDTHS, body }, layout: tableLayout() };
    const chart = chartFromRows(list, {
      groupKey: (r) => str(r, 'CostMainGroupName'), groupLabel: (r) => str(r, 'CostMainGroupName'),
      valueFn: (r) => dec(r, 'CostValue'), valueHeader: 'Cost Value', groupHeader: 'Main Group', digits: 2
    });
    return buildPage({ companyName, companyLogo, title: 'COSTING REPORT', fromDate, toDate, tables: [...chart, table] });
  }
});
