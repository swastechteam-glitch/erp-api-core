// Spinning & AutoConer & Packing Production.
// Mirrors 08rptSpinningAndAutoconerAndPackingProduction.rdlc — one SP, one row
// per production date (the RDLC hides the detail rows and shows the per-date
// group totals), plus a grand Total row.
//
// SP: sp_Prodn_Production_Spg_Ac_Packing_Difference (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy, chartFromRows
} from '../cotton/_common.js';

const TITLE = 'SPG & A/C & PACKING PRODUCTION';
const FILE_NAME = 'ProductionOverAll_SpgAcPacking';

const headRow = (headers, fs = 7) =>
  headers.map((h) => ({
    text: h, bold: true, fillColor: colors.headerFill, color: colors.headerText,
    alignment: 'center', fontSize: fs
  }));
const td = (text, align = 'right', zebra = null, fs = 7) =>
  ({ text, alignment: align, fontSize: fs, fillColor: zebra });
const totalCell = (text, align = 'right') =>
  ({ text, alignment: align, bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 7 });
const zebraOf = (i) => (i % 2 === 1 ? colors.zebraFill : null);

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate }) {
  const headers = [
    'Date', 'Spg Prodn', 'A/C Prodn', 'Pkg Prodn', 'Bag Prodn',
    'Diff-1 (Spg-A/c)', 'Diff-2 (Spg-Pkg)', 'Diff-3 (Pkg-Bag)',
    'A/C Cones', 'Pkg P.Cones', 'Diff Cones'
  ];
  const widths = ['*', 62, 62, 62, 62, 70, 70, 70, 55, 60, 55];
  const body = [headRow(headers)];

  // Group by ProdnDate (sum every numeric field) — one row per date.
  const groups = groupBy(rows || [], (r) => str(r, 'ProdnDate'));
  const F = ['SpgProdnKgs', 'ACProdnKgs', 'ConeKgs', 'BagKgs', 'DiffspgAc', 'DiffSpgCone', 'DiffConeBage', 'ACCone', 'LoseCone', 'DiffCones'];
  const grand = {}; F.forEach((f) => { grand[f] = 0; });

  let i = 0;
  const sorted = [...groups.entries()].sort((a, b) => new Date(a[1][0].ProdnDate) - new Date(b[1][0].ProdnDate));
  for (const [, list] of sorted) {
    const z = zebraOf(i++);
    const sum = (f) => list.reduce((a, r) => a + dec(r, f), 0);
    const v = {}; F.forEach((f) => { v[f] = sum(f); grand[f] += v[f]; });
    body.push([
      td(ddmmyyyy(list[0].ProdnDate), 'center', z),
      td(fmt(v.SpgProdnKgs, 2), 'right', z),
      td(fmt(v.ACProdnKgs, 2), 'right', z),
      td(fmt(v.ConeKgs, 2), 'right', z),
      td(fmt(v.BagKgs, 2), 'right', z),
      td(fmt(v.DiffspgAc, 2), 'right', z),
      td(fmt(v.DiffSpgCone, 2), 'right', z),
      td(fmt(v.DiffConeBage, 2), 'right', z),
      td(fmt(v.ACCone, 0), 'right', z),
      td(fmt(v.LoseCone, 0), 'right', z),
      td(fmt(v.DiffCones, 0), 'right', z)
    ]);
  }

  body.push([
    totalCell('TOTAL', 'right'),
    totalCell(fmt(grand.SpgProdnKgs, 2)),
    totalCell(fmt(grand.ACProdnKgs, 2)),
    totalCell(fmt(grand.ConeKgs, 2)),
    totalCell(fmt(grand.BagKgs, 2)),
    totalCell(fmt(grand.DiffspgAc, 2)),
    totalCell(fmt(grand.DiffSpgCone, 2)),
    totalCell(fmt(grand.DiffConeBage, 2)),
    totalCell(fmt(grand.ACCone, 0)),
    totalCell(fmt(grand.LoseCone, 0)),
    totalCell(fmt(grand.DiffCones, 0))
  ]);

  const tables = (rows && rows.length)
    ? [{ table: { headerRows: 1, dontBreakRows: false, keepWithHeaderRows: 1, widths, body }, layout: tableLayout() }]
    : [{ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] }];

  const chart = chartFromRows(rows, {
    groupKey: (r) => str(r, 'ProdnDate'), groupLabel: (r) => ddmmyyyy(r.ProdnDate),
    valueFn: (r) => dec(r, 'SpgProdnKgs'), valueHeader: 'Spg Prdn Kgs',
    groupHeader: 'Date', digits: 2
  });

  return buildPage({ companyName, companyLogo, title: TITLE, fromDate, toDate, tables: [...chart, ...tables] });
}

export const spgAcPackingReport = (req, res) => {
  return runReport(req, res, {
    spName: 'sp_Prodn_Production_Spg_Ac_Packing_Difference',
    fileName: FILE_NAME,
    buildDocDefinition
  });
};
