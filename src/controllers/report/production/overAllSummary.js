// Production OverAll Summary — Daily Production Report (condensed).
// Mirrors 02rptProductionOverAllSummary.rdlc — a single landscape page stacking
// the spinning abstract, spinning stoppage matrix, preparatory production,
// usable/saleable waste, spinning+autoconer, and power abstracts.
//
// Multi-SP report (runMultiReport). Each SP takes (CompanyCode, FromDate, ToDate).

import {
  runMultiReport, buildPage, tableLayout, colors,
  dec, str, fmt
} from '../cotton/_common.js';

const TITLE = 'DAILY PRODUCTION REPORT';
const FILE_NAME = 'ProductionOverAllSummary';

const headRow = (headers, fs = 8) =>
  headers.map((h) => ({
    text: h, bold: true, fillColor: colors.headerFill, color: colors.headerText,
    alignment: 'center', fontSize: fs
  }));

const td = (text, align = 'right', zebra = null, fs = 8) =>
  ({ text, alignment: align, fontSize: fs, fillColor: zebra });

const totalCell = (text, align = 'right') =>
  ({ text, alignment: align, bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 8 });

function section(title, widths, body) {
  return [
    { text: title, bold: true, fontSize: 9, color: colors.subText, fillColor: colors.subFill, margin: [0, 8, 0, 2] },
    { table: { headerRows: 1, dontBreakRows: false, keepWithHeaderRows: 1, widths, body }, layout: tableLayout() }
  ];
}

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

// ----- sections -----
function spinningAbstractSection(rows) {
  // Columns + group/footer aggregation mirror table1 of the RDLC. NOTE: the
  // column headed "UT %" actually shows ProdEffi (textbox77 => AVG(ProdEffi));
  // the dataset's AvgUT field is not rendered in the original report.
  const headers = ['Unit', 'Count', 'Run M/C', 'Speed', 'TPI', 'Target', 'Actual', 'Loss In Kgs', 'UT %', 'Tar.GPS', 'Act.GPS'];
  const widths = [60, '*', 45, 45, 40, 50, 50, 55, 45, 45, 45];
  const body = [headRow(headers)];
  // Group by Branch + Count (the RDLC table group key).
  const groups = groupBy(rows, (r) => `${str(r, 'BranchCode')}||${str(r, 'CountNameCode')}`);
  let i = 0;
  for (const list of groups.values()) {
    const z = zebraOf(i++);
    const sum = (f) => list.reduce((a, r) => a + dec(r, f), 0);
    const avg = (f) => (list.length ? sum(f) / list.length : 0);
    body.push([
      td(str(list[0], 'BranchName'), 'left', z),
      td(str(list[0], 'CountName'), 'left', z),
      td(fmt(avg('RunMC'), 0), 'center', z),
      td(fmt(avg('DSpeed'), 0), 'center', z),
      td(fmt(avg('TPI'), 2), 'center', z),
      td(fmt(sum('TargetProdn'), 0), 'center', z),
      td(fmt(sum('AcutalProdn'), 0), 'center', z),
      td(fmt(sum('StopKgs'), 0), 'center', z),
      td(fmt(avg('ProdEffi'), 2), 'center', z),
      td(fmt(avg('TargetGPS'), 2), 'center', z),
      td(fmt(avg('AchivedGPS'), 2), 'center', z)
    ]);
  }
  // Footer aggregates over ALL rows (matches the RDLC table footer).
  const sumAll = (f) => rows.reduce((a, r) => a + dec(r, f), 0);
  const avgAll = (f) => (rows.length ? sumAll(f) / rows.length : 0);
  body.push([
    { ...totalCell('Total', 'right'), colSpan: 3 }, {}, {},
    totalCell(fmt(avgAll('DSpeed'), 0)),
    totalCell(''),
    totalCell(fmt(sumAll('TargetProdn'), 0)),
    totalCell(fmt(sumAll('AcutalProdn'), 0)),
    totalCell(fmt(sumAll('StopKgs'), 0)),
    totalCell(fmt(avgAll('ProdEffi'), 2)),
    totalCell(fmt(avgAll('TargetGPS'), 2)),
    totalCell(fmt(avgAll('AchivedGPS'), 2))
  ]);
  return section('Spinning', widths, body);
}

function spinningStoppageMatrixSection(rows) {
  // Pivot: rows = StoppageReason, columns = Unit_Branch, value = sum StopKgs.
  const units = [];
  for (const r of rows) {
    const u = str(r, 'Unit_Branch');
    if (u && !units.includes(u)) units.push(u);
  }
  const headers = ['Reason', ...units, 'Total'];
  const widths = ['*', ...units.map(() => 60), 60];
  const body = [headRow(headers)];

  const reasons = groupBy(rows, (r) => str(r, 'StoppageReason'));
  const colTotals = units.map(() => 0);
  let grand = 0;
  let i = 0;
  for (const [reason, list] of reasons.entries()) {
    const z = zebraOf(i++);
    const cells = [td(reason, 'left', z)];
    let rowTotal = 0;
    units.forEach((u, ci) => {
      const v = list.filter((r) => str(r, 'Unit_Branch') === u)
        .reduce((a, r) => a + dec(r, 'StopKgs'), 0);
      rowTotal += v; colTotals[ci] += v;
      cells.push(td(v ? fmt(v, 2) : '', 'right', z));
    });
    grand += rowTotal;
    cells.push(td(fmt(rowTotal, 2), 'right', z));
    body.push(cells);
  }
  body.push([
    totalCell('Total', 'right'),
    ...colTotals.map((v) => totalCell(fmt(v, 2))),
    totalCell(fmt(grand, 2))
  ]);
  return section('Spinning Stoppage (Loss Kgs)', widths, body);
}

function preparatorySection(rows) {
  const headers = ['Department', 'Target', 'On Date', 'Upto Tr.Prod', 'Upto Prod'];
  const widths = ['*', 70, 70, 80, 80];
  const body = [headRow(headers)];
  let i = 0;
  for (const r of rows) {
    const z = zebraOf(i++);
    body.push([
      td(str(r, 'DepartmentName'), 'left', z),
      td(fmt(dec(r, 'TargetProduction'), 0), 'right', z),
      td(fmt(dec(r, 'OnDateProdn'), 2), 'right', z),
      td(fmt(dec(r, 'UptoDateTargetProdn'), 0), 'right', z),
      td(fmt(dec(r, 'UptoDateProdn'), 2), 'right', z)
    ]);
  }
  return section('Preparatory Production', widths, body);
}

function preparatoryWasteSection(rows) {
  const headers = ['Department', 'Usable Waste KGS', '%'];
  const widths = ['*', 110, 70];
  const body = [headRow(headers)];
  let i = 0, sKg = 0, sPer = 0;
  for (const r of rows) {
    const z = zebraOf(i++);
    sKg += dec(r, 'WasteKgs'); sPer += dec(r, 'WastePer');
    body.push([
      td(str(r, 'DepartmentName'), 'left', z),
      td(fmt(dec(r, 'WasteKgs'), 2), 'right', z),
      td(fmt(dec(r, 'WastePer'), 2), 'right', z)
    ]);
  }
  body.push([totalCell('Total', 'right'), totalCell(fmt(sKg, 2)), totalCell(fmt(sPer, 2))]);
  return section('Usable Waste (Preparatory)', widths, body);
}

function spinningAutoconerSection(rows) {
  const headers = ['Count', 'Spg On Date', 'Spg Up Date', 'A/C On Date', 'A/C Up Date'];
  const widths = ['*', 90, 90, 90, 90];
  const body = [headRow(headers)];
  let i = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0;
  for (const r of rows) {
    const z = zebraOf(i++);
    s1 += dec(r, 'SpgOnDateProdn'); s2 += dec(r, 'SpgUpDateProdn');
    s3 += dec(r, 'ACOnDateProdn'); s4 += dec(r, 'ACUpDateProdn');
    body.push([
      td(str(r, 'CountName'), 'left', z),
      td(fmt(dec(r, 'SpgOnDateProdn'), 2), 'right', z),
      td(fmt(dec(r, 'SpgUpDateProdn'), 2), 'right', z),
      td(fmt(dec(r, 'ACOnDateProdn'), 2), 'right', z),
      td(fmt(dec(r, 'ACUpDateProdn'), 2), 'right', z)
    ]);
  }
  body.push([
    totalCell('Total', 'right'), totalCell(fmt(s1, 2)), totalCell(fmt(s2, 2)),
    totalCell(fmt(s3, 2)), totalCell(fmt(s4, 2))
  ]);
  return section('Spinning & AutoConer Production', widths, body);
}

// The RDLC splits the QC waste dataset into two tables by WasteType:
//   Saleable Waste -> everything except "Pneumafile Waste" / "QC Waste"
//   Usable Waste   -> only "Pneumafile Waste" / "QC Waste"
const isUsableWasteType = (t) => t === 'Pneumafile Waste' || t === 'QC Waste';

function qcWasteSection(rows, title, saleable) {
  const filtered = rows.filter((r) => {
    const usable = isUsableWasteType(str(r, 'WasteType'));
    return saleable ? !usable : usable;
  });
  if (!filtered.length) return [];
  const headers = ['Waste Type', 'KGS', '%'];
  const widths = ['*', 80, 60];
  const body = [headRow(headers)];
  let i = 0;
  for (const r of filtered) {
    const z = zebraOf(i++);
    body.push([
      td(str(r, 'WasteType'), 'left', z),
      td(fmt(dec(r, 'WasteKgs'), 2), 'right', z),
      td(fmt(dec(r, 'WastePer'), 2), 'right', z)
    ]);
  }
  return section(title, widths, body);
}

function powerSection(rows) {
  const r = rows[0] || {};
  const headers = ['POWER', 'On Date', 'Up Date'];
  const widths = ['*', 120, 120];
  const body = [headRow(headers)];
  body.push([td('EB Unit', 'left'), td(fmt(dec(r, 'OnDateEB'), 2)), td(fmt(dec(r, 'UpdateEB'), 2))]);
  body.push([td('UKG', 'left'), td(fmt(dec(r, 'OnDateUKG'), 2)), td(fmt(dec(r, 'UpDateUKG'), 2))]);
  body.push([td('Max Demand', 'left'), td(fmt(dec(r, 'MaxDemand'), 2)), td('')]);
  return section('Power', widths, body);
}

function buildDocDefinition({ data, companyName, companyLogo, fromDate, toDate }) {
  const d = data || {};
  const tables = [];
  const add = (nodes) => { for (const n of nodes) tables.push(n); };

  if ((d.spinning || []).length) add(spinningAbstractSection(d.spinning));
  if ((d.stoppage || []).length) add(spinningStoppageMatrixSection(d.stoppage));
  if ((d.preparatory || []).length) add(preparatorySection(d.preparatory));
  if ((d.prepWaste || []).length) add(preparatoryWasteSection(d.prepWaste));
  if ((d.spgAc || []).length) add(spinningAutoconerSection(d.spgAc));
  if ((d.qcWaste || []).length) {
    add(qcWasteSection(d.qcWaste, 'Saleable Waste', true));
    add(qcWasteSection(d.qcWaste, 'Usable Waste', false));
  }
  if ((d.eb || []).length) add(powerSection(d.eb));

  if (!tables.length) {
    tables.push({ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] });
  }

  return buildPage({ companyName, companyLogo, title: TITLE, fromDate, toDate, tables });
}

export const overAllSummaryReport = (req, res) => {
  return runMultiReport(req, res, {
    fileName: FILE_NAME,
    buildDocDefinition,
    procs: [
      { key: 'spinning', spName: 'sp_Production_OverAll_Spinning_Abstract' },
      { key: 'stoppage', spName: 'sp_Production_OverAll_Spinning_Stopage_Abstract' },
      { key: 'preparatory', spName: 'sp_Production_OverAll_Abstract' },
      { key: 'prepWaste', spName: 'sp_Production_OverAll_Preparatory_Waste_Abstract' },
      { key: 'spgAc', spName: 'sp_Production_OverAll_Spinning_AutoConer_Abstract' },
      { key: 'qcWaste', spName: 'sp_Production_OverAll_QC_Spinning_Waste_Abstract' },
      { key: 'eb', spName: 'sp_Production_OverAll_EB_Abstract' }
    ]
  });
};
