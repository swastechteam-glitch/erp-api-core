// Production UKG OverAll (Units per Kg).
// Mirrors 05rptProductionUKG.rdlc — one section per department, each grouped by
// branch with a per-branch Total and a Grand Total. Spinning carries two extra
// columns (Count, UKG/Count).
//
// Multi-SP report (runMultiReport). Each SP takes (CompanyCode, FromDate, ToDate).

import {
  runMultiReport, buildPage, tableLayout, colors,
  dec, str, fmt
} from '../cotton/_common.js';

const TITLE = 'PRODUCTION UKG REPORT';
const FILE_NAME = 'ProductionOverAll_UKG';

const headRow = (headers, fs = 8) =>
  headers.map((h) => ({
    text: h, bold: true, fillColor: colors.headerFill, color: colors.headerText,
    alignment: 'center', fontSize: fs
  }));
const td = (text, align = 'right', zebra = null, fs = 8) =>
  ({ text, alignment: align, fontSize: fs, fillColor: zebra });
const totalCell = (text, align = 'right') =>
  ({ text, alignment: align, bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 8 });
const branchCell = (text) =>
  ({ text, bold: true, color: colors.groupText, fillColor: colors.groupFill, fontSize: 8 });
const zebraOf = (i) => (i % 2 === 1 ? colors.zebraFill : null);

function section(title, widths, body) {
  return [
    { text: title, bold: true, fontSize: 9, color: colors.subText, fillColor: colors.subFill, margin: [0, 8, 0, 2] },
    { table: { headerRows: 1, dontBreakRows: false, keepWithHeaderRows: 1, widths, body }, layout: tableLayout() }
  ];
}

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}

const avgOf = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

function ukgSection(rows, title, spinning) {
  const headers = spinning
    ? ['Machine Name', 'Count', 'Prod', 'Energy', 'UKG', 'Upto Prod', 'Upto Energy', 'Upto UKG', 'UKG/Count']
    : ['Machine Name', 'Prod', 'Energy', 'UKG', 'Upto Prod', 'Upto Energy', 'Upto UKG'];
  const widths = spinning
    ? ['*', 55, 60, 60, 55, 70, 70, 60, 60]
    : ['*', 80, 80, 65, 90, 90, 75];
  const ncol = headers.length;
  const body = [headRow(headers)];

  const groups = groupBy(rows, (r) => str(r, 'BranchCode'));
  const g = { p: 0, u: 0, up: 0, uu: 0, ukg: [], uukg: [] };

  for (const list of groups.values()) {
    body.push([{ ...branchCell(str(list[0], 'BranchName')), colSpan: ncol }, ...Array(ncol - 1).fill({})]);
    let i = 0, sP = 0, sU = 0, sUP = 0, sUU = 0;
    const ukg = [], uukg = [];
    for (const r of list) {
      const z = zebraOf(i++);
      const cells = [td(str(r, 'MachineName'), 'left', z)];
      if (spinning) cells.push(td(fmt(dec(r, 'ActulCount'), 2), 'center', z));
      cells.push(td(fmt(dec(r, 'Prodn'), 2), 'right', z));
      cells.push(td(fmt(dec(r, 'Units'), 2), 'right', z));
      cells.push(td(fmt(dec(r, 'UKG'), 2), 'right', z));
      cells.push(td(fmt(dec(r, 'UPTOProdn'), 2), 'right', z));
      cells.push(td(fmt(dec(r, 'UPTOUnits'), 2), 'right', z));
      cells.push(td(fmt(dec(r, 'UPTOUKG'), 2), 'right', z));
      if (spinning) cells.push(td(fmt(dec(r, 'UKGPer'), 2), 'right', z));
      body.push(cells);
      sP += dec(r, 'Prodn'); sU += dec(r, 'Units'); sUP += dec(r, 'UPTOProdn'); sUU += dec(r, 'UPTOUnits');
      ukg.push(dec(r, 'UKG')); uukg.push(dec(r, 'UPTOUKG'));
    }
    const totRow = [{ ...totalCell('Total', 'right'), colSpan: spinning ? 2 : 1 }];
    if (spinning) totRow.push({});
    totRow.push(totalCell(fmt(sP, 2)), totalCell(fmt(sU, 2)), totalCell(fmt(avgOf(ukg), 2)),
      totalCell(fmt(sUP, 2)), totalCell(fmt(sUU, 2)), totalCell(fmt(avgOf(uukg), 2)));
    if (spinning) totRow.push(totalCell(''));
    body.push(totRow);
    g.p += sP; g.u += sU; g.up += sUP; g.uu += sUU; g.ukg.push(...ukg); g.uukg.push(...uukg);
  }

  const grandRow = [{ ...totalCell('Grand Total', 'right'), colSpan: spinning ? 2 : 1 }];
  if (spinning) grandRow.push({});
  grandRow.push(totalCell(fmt(g.p, 2)), totalCell(fmt(g.u, 2)), totalCell(fmt(avgOf(g.ukg), 2)),
    totalCell(fmt(g.up, 2)), totalCell(fmt(g.uu, 2)), totalCell(fmt(avgOf(g.uukg), 2)));
  if (spinning) grandRow.push(totalCell(''));
  body.push(grandRow);

  return section(title, widths, body);
}

function buildDocDefinition({ data, companyName, companyLogo, fromDate, toDate }) {
  const d = data || {};
  const order = [
    ['carding', 'CARDING', false],
    ['drawing', 'DRAWING', false],
    ['unilap', 'UNILAP', false],
    ['comber', 'COMBER', false],
    ['finisherDrawing', 'FINISHER DRAWING', false],
    ['simplex', 'SIMPLEX', false],
    ['spinning', 'SPINNING', true]
  ];
  const tables = [];
  for (const [key, label, spinning] of order) {
    if ((d[key] || []).length) for (const n of ukgSection(d[key], label, spinning)) tables.push(n);
  }
  if (!tables.length) {
    tables.push({ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] });
  }
  return buildPage({ companyName, companyLogo, title: TITLE, fromDate, toDate, tables });
}

export const overAllUKGReport = (req, res) => {
  return runMultiReport(req, res, {
    fileName: FILE_NAME,
    buildDocDefinition,
    procs: [
      { key: 'carding', spName: 'sp_Prodn_UKG_Carding' },
      { key: 'drawing', spName: 'sp_Prodn_UKG_Drawing' },
      { key: 'unilap', spName: 'sp_Prodn_UKG_UniLap' },
      { key: 'comber', spName: 'sp_Prodn_UKG_Comber' },
      { key: 'finisherDrawing', spName: 'sp_Prodn_UKG_FinisherDrawing' },
      { key: 'simplex', spName: 'sp_Prodn_UKG_Simplex' },
      { key: 'spinning', spName: 'sp_Prodn_UKG_Spinning' }
    ]
  });
};
