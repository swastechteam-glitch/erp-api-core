// Production OverAll — Daily Production Report.
// Mirrors 01rptProductionOverAll.rdlc — one composite landscape report stacking
// every daily-production section (preparatory, spinning, autoconer, stock,
// packing, workers, store, power, QC, waste, spinning stoppage).
//
// Multi-SP report (runMultiReport). Each SP takes (CompanyCode, FromDate, ToDate).

import {
  runMultiReport, buildPage, titleBlock, tableLayout, colors,
  dec, str, fmt, applyRowFiltersToData
} from '../cotton/_common.js';

const TITLE = 'PRODUCTION REPORT';
const FILE_NAME = 'ProductionOverAll';

// ----- local section helpers -----
const headRow = (headers, fs = 7) =>
  headers.map((h) => ({
    text: h, bold: true, fillColor: colors.headerFill, color: colors.headerText,
    alignment: 'center', fontSize: fs
  }));

const td = (text, align = 'right', zebra = null, fs = 7) =>
  ({ text, alignment: align, fontSize: fs, fillColor: zebra });

const totalCell = (text, align = 'right') =>
  ({ text, alignment: align, bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 7 });

// title text node + bordered table node.
function section(title, widths, body) {
  return [
    { text: title, bold: true, fontSize: 9, color: colors.subText, fillColor: colors.subFill, margin: [0, 8, 0, 2] },
    { table: { headerRows: 1, dontBreakRows: false, keepWithHeaderRows: 1, widths, body }, layout: tableLayout() }
  ];
}

const zebraOf = (i) => (i % 2 === 1 ? colors.zebraFill : null);

// Aggregate a list of rows by a key, summing/averaging chosen fields.
function groupBy(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}

// ----- individual sections -----
function preparatorySection(rows) {
  const headers = ['Branch', 'Department', 'Target', 'S1', 'S2', 'S3', 'Today', 'Upto', 'Eff %', 'UT %'];
  const widths = [58, '*', 45, 40, 40, 40, 48, 48, 40, 40];
  const body = [headRow(headers)];
  let i = 0;
  for (const r of rows) {
    const z = zebraOf(i++);
    body.push([
      td(str(r, 'BranchName'), 'left', z),
      td(str(r, 'DepartmentName'), 'left', z),
      td(fmt(dec(r, 'TotTargetProd'), 0), 'right', z),
      td(fmt(dec(r, 'Shift1Kg'), 0), 'right', z),
      td(fmt(dec(r, 'Shift2Kg'), 0), 'right', z),
      td(fmt(dec(r, 'Shift3Kg'), 0), 'right', z),
      td(fmt(dec(r, 'TodayProdnKg'), 2), 'right', z),
      td(fmt(dec(r, 'UptoDateProdnkg'), 2), 'right', z),
      td(fmt(dec(r, 'TodayEff'), 2), 'right', z),
      td(fmt(dec(r, 'TodayUt'), 2), 'right', z)
    ]);
  }
  return section('Preparatory Production', widths, body);
}

function spinningSection(rows) {
  const headers = ['Count', 'Target', 'S1', 'S2', 'S3', 'Today', 'Upto', 'Tgt GPS', 'Tdy GPS', 'Upto GPS'];
  const widths = ['*', 50, 45, 45, 45, 50, 55, 50, 50, 55];
  const body = [headRow(headers)];
  const groups = groupBy(rows, (r) => str(r, 'CountNameCode') || str(r, 'CountName'));
  let i = 0;
  let sT = 0, sS1 = 0, sS2 = 0, sS3 = 0, sTdy = 0, sUp = 0;
  for (const list of groups.values()) {
    const z = zebraOf(i++);
    const sum = (f) => list.reduce((a, r) => a + dec(r, f), 0);
    const avg = (f) => (list.length ? sum(f) / list.length : 0);
    const t = sum('TotTargetProd'), s1 = sum('Shift1Kg'), s2 = sum('Shift2Kg'), s3 = sum('Shift3Kg');
    const tdy = sum('TodayProdnKg'), up = sum('UptoDateProdnkg');
    sT += t; sS1 += s1; sS2 += s2; sS3 += s3; sTdy += tdy; sUp += up;
    body.push([
      td(str(list[0], 'CountName'), 'left', z),
      td(fmt(t, 0), 'right', z),
      td(fmt(s1, 0), 'right', z),
      td(fmt(s2, 0), 'right', z),
      td(fmt(s3, 0), 'right', z),
      td(fmt(tdy, 2), 'right', z),
      td(fmt(up, 2), 'right', z),
      td(fmt(avg('TaegetGPS'), 2), 'right', z),
      td(fmt(avg('TodayGPS'), 2), 'right', z),
      td(fmt(avg('UptoDateGPS'), 2), 'right', z)
    ]);
  }
  body.push([
    totalCell('Total', 'right'),
    totalCell(fmt(sT, 0)), totalCell(fmt(sS1, 0)), totalCell(fmt(sS2, 0)), totalCell(fmt(sS3, 0)),
    totalCell(fmt(sTdy, 2)), totalCell(fmt(sUp, 2)), totalCell(''), totalCell(''), totalCell('')
  ]);
  return section('Spinning', widths, body);
}

function spinningWasteSection(rows) {
  const headers = ['Count', 'Tdy Waste Kg', 'Upto Waste Kg', 'Tdy %', 'Upto %', 'Eff %', 'UT %'];
  const widths = ['*', 80, 80, 55, 55, 55, 55];
  const body = [headRow(headers)];
  const groups = groupBy(rows, (r) => str(r, 'CountNameCode') || str(r, 'CountName'));
  let i = 0;
  for (const list of groups.values()) {
    const z = zebraOf(i++);
    const sum = (f) => list.reduce((a, r) => a + dec(r, f), 0);
    const avg = (f) => (list.length ? sum(f) / list.length : 0);
    body.push([
      td(str(list[0], 'CountName'), 'left', z),
      td(fmt(sum('TodayWasteProdnKg'), 2), 'right', z),
      td(fmt(sum('UptoDateWasteProdnkg'), 2), 'right', z),
      td(fmt(avg('TodayPer'), 2), 'right', z),
      td(fmt(avg('UptodatePer'), 2), 'right', z),
      td(fmt(avg('Todayeffi'), 2), 'right', z),
      td(fmt(avg('TodayUt'), 2), 'right', z)
    ]);
  }
  return section('Spinning Pneumafil Waste', widths, body);
}

function autoconerSection(rows) {
  const headers = ['Count', 'Target', 'Today Prdn', 'Upto Prdn', 'Tdy Waste', 'Tdy %', 'Upto Waste', 'Upto %'];
  const widths = ['*', 55, 65, 65, 60, 50, 60, 50];
  const body = [headRow(headers)];
  let i = 0;
  for (const r of rows) {
    const z = zebraOf(i++);
    body.push([
      td(str(r, 'CountName'), 'left', z),
      td(fmt(dec(r, 'TotTargetProdn'), 0), 'right', z),
      td(fmt(dec(r, 'TodayProdnKg'), 2), 'right', z),
      td(fmt(dec(r, 'UptoDateProdnkg'), 2), 'right', z),
      td(fmt(dec(r, 'TodayWasteProdnKg'), 2), 'right', z),
      td(fmt(dec(r, 'TodayPer'), 2), 'right', z),
      td(fmt(dec(r, 'UptoDateWasteProdnkg'), 2), 'right', z),
      td(fmt(dec(r, 'UptodatePer'), 2), 'right', z)
    ]);
  }
  return section('Autoconer', widths, body);
}

function cottonStockSection(rows) {
  const headers = ['Variety', 'Op Bales', 'Recv Bales', 'Issue Bales', 'Sales Bales', 'Cl Bales', 'Cl Kgs'];
  const widths = ['*', 55, 60, 60, 60, 55, 70];
  const body = [headRow(headers)];
  const groups = groupBy(rows, (r) => str(r, 'RawMaterialCode') || str(r, 'RawMaterialName'));
  let i = 0;
  for (const list of groups.values()) {
    const z = zebraOf(i++);
    const sum = (f) => list.reduce((a, r) => a + dec(r, f), 0);
    body.push([
      td(str(list[0], 'RawMaterialName'), 'left', z),
      td(fmt(sum('OpBales'), 0), 'right', z),
      td(fmt(sum('ReceiptBales'), 0), 'right', z),
      td(fmt(sum('IssueBales'), 0), 'right', z),
      td(fmt(sum('SalesBales'), 0), 'right', z),
      td(fmt(sum('ClosingBales'), 0), 'right', z),
      td(fmt(sum('ClosingKgs'), 2), 'right', z)
    ]);
  }
  return section('Cotton Stock Report', widths, body);
}

function packingSection(rows) {
  const headers = ['Count', 'Op Cones', 'Prod Cones', 'Prod Bags', 'Prod Kgs', 'Upto Kgs', 'Sales Bags', 'Cl Bags'];
  const widths = ['*', 55, 60, 55, 60, 65, 60, 55];
  const body = [headRow(headers)];
  const groups = groupBy(rows, (r) => str(r, 'CountTypeCode') || str(r, 'ShortName'));
  let i = 0;
  for (const list of groups.values()) {
    const z = zebraOf(i++);
    const sum = (f) => list.reduce((a, r) => a + dec(r, f), 0);
    const first = (f) => dec(list[0], f);
    body.push([
      td(str(list[0], 'ShortName'), 'left', z),
      td(fmt(first('OpeningCones'), 0), 'right', z),
      td(fmt(sum('ProductionCones'), 0), 'right', z),
      td(fmt(sum('ProductionBags'), 0), 'right', z),
      td(fmt(sum('ProductionKgs'), 2), 'right', z),
      td(fmt(sum('UptoDateKgs'), 2), 'right', z),
      td(fmt(sum('SalesBags'), 0), 'right', z),
      td(fmt(sum('ClosingBags'), 0), 'right', z)
    ]);
  }
  return section('Packing', widths, body);
}

function workersSection(rows) {
  const headers = ['Department', 'I', 'II', 'III', 'Gen', 'Total', 'Upto Date'];
  const widths = ['*', 55, 55, 55, 55, 60, 70];
  const body = [headRow(headers)];
  let i = 0, sT = 0, sU = 0;
  for (const r of rows) {
    const z = zebraOf(i++);
    sT += dec(r, 'Total'); sU += dec(r, 'UptoDate');
    body.push([
      td(str(r, 'DepartmentName'), 'left', z),
      td(fmt(dec(r, 'Shift1'), 0), 'right', z),
      td(fmt(dec(r, 'Shift2'), 0), 'right', z),
      td(fmt(dec(r, 'Shift3'), 0), 'right', z),
      td(fmt(dec(r, 'ShiftGen'), 0), 'right', z),
      td(fmt(dec(r, 'Total'), 0), 'right', z),
      td(fmt(dec(r, 'UptoDate'), 0), 'right', z)
    ]);
  }
  body.push([
    totalCell('Total', 'right'), totalCell(''), totalCell(''), totalCell(''), totalCell(''),
    totalCell(fmt(sT, 0)), totalCell(fmt(sU, 0))
  ]);
  return section('Workers Engaged', widths, body);
}

function storeSection(rows) {
  const headers = ['Details', 'Tdy Cons', 'Upto Cons', 'Tdy Cost/Kg', 'Upto Cost/Kg', 'Tdy Cost/Spdl', 'Upto Cost/Spdl'];
  const widths = ['*', 65, 65, 70, 70, 75, 75];
  const body = [headRow(headers)];
  let i = 0;
  for (const r of rows) {
    const z = zebraOf(i++);
    body.push([
      td(str(r, 'Name'), 'left', z),
      td(fmt(dec(r, 'TodayCons'), 2), 'right', z),
      td(fmt(dec(r, 'UpdateCons'), 2), 'right', z),
      td(fmt(dec(r, 'TodayCostPerKg'), 2), 'right', z),
      td(fmt(dec(r, 'UpdateCostPerKg'), 2), 'right', z),
      td(fmt(dec(r, 'TodayCostPerSpin'), 2), 'right', z),
      td(fmt(dec(r, 'UpdateCostPerSpin'), 2), 'right', z)
    ]);
  }
  return section('Store', widths, body);
}

function powerSection(rows) {
  const r = rows[0] || {};
  const headers = ['Particular', 'Today', 'Upto Date'];
  const widths = ['*', 120, 120];
  const body = [headRow(headers)];
  const line = (label, tdyF, upF, digits = 2) => body.push([
    td(label, 'left'), td(fmt(dec(r, tdyF), digits)), td(fmt(dec(r, upF), digits))
  ]);
  line('EB Units', 'TodayEBKWH', 'UptoEBKWH');
  line('Genset Units', 'TodayGENKWH', 'UptoGENKWH');
  line('Total Units', 'TodayUnit', 'UptoUnit');
  line('M.D.', 'TodayMD', 'UptoMD');
  line('Power Factor', 'TodayPF', 'UptoPF');
  line('UKG', 'TodayUKG', 'UptoUKG');
  line('UKG (40s Conv)', 'Today40UKG', 'Upto40UKG');
  line('UPL', 'TodayUPL', 'UptoUPL');
  line('No.of Power Fail', 'TodayPowerFail', 'UptoPowerFail', 0);
  line('Power Fail Mins', 'TodayPowerFailMins', 'UptoPowerFailMins', 0);
  line('Compressor Units', 'TodayCompersorUnit', 'UptoCompersorunit');
  return section('Power Details - Electrical', widths, body);
}

function cascadeSection(rows) {
  const headers = ['Count', 'Ct.Avg', 'Strength', 'CSP', 'Ct.CV%', 'St.CV%', 'U%', '-50%', '+50%', '+200%', 'Total', 'Hairnes'];
  const widths = ['*', 45, 50, 45, 45, 45, 40, 40, 40, 45, 40, 50];
  const body = [headRow(headers)];
  let i = 0;
  for (const r of rows) {
    const z = zebraOf(i++);
    body.push([
      td(str(r, 'CountName'), 'left', z),
      td(fmt(dec(r, 'CtAvg'), 2), 'right', z),
      td(fmt(dec(r, 'Strength'), 2), 'right', z),
      td(fmt(dec(r, 'CSP'), 2), 'right', z),
      td(fmt(dec(r, 'CTCVPer'), 2), 'right', z),
      td(fmt(dec(r, 'StrengthCVPer'), 2), 'right', z),
      td(fmt(dec(r, 'UPer'), 2), 'right', z),
      td(fmt(dec(r, 'Thin50Per'), 2), 'right', z),
      td(fmt(dec(r, 'Thick50Per'), 2), 'right', z),
      td(fmt(dec(r, 'Neps200'), 2), 'right', z),
      td(fmt(dec(r, 'TotalIP'), 2), 'right', z),
      td(fmt(dec(r, 'Hairnes'), 2), 'right', z)
    ]);
  }
  return section('Cascade Report', widths, body);
}

function autoconerCutsSection(rows) {
  const headers = ['Count', 'N', 'S', 'L', 'T', 'FD', 'CP', 'CM', 'CCP', 'CCM', 'PC', 'YF'];
  const widths = ['*', 42, 42, 42, 42, 42, 42, 42, 42, 42, 42, 42];
  const body = [headRow(headers)];
  let i = 0;
  for (const r of rows) {
    const z = zebraOf(i++);
    body.push([
      td(str(r, 'CountName'), 'left', z),
      td(fmt(dec(r, 'N'), 2), 'right', z),
      td(fmt(dec(r, 'S'), 2), 'right', z),
      td(fmt(dec(r, 'L'), 2), 'right', z),
      td(fmt(dec(r, 'T'), 2), 'right', z),
      td(fmt(dec(r, 'FD'), 2), 'right', z),
      td(fmt(dec(r, 'CP'), 2), 'right', z),
      td(fmt(dec(r, 'CM'), 2), 'right', z),
      td(fmt(dec(r, 'CCP'), 2), 'right', z),
      td(fmt(dec(r, 'CCM'), 2), 'right', z),
      td(fmt(dec(r, 'PC'), 2), 'right', z),
      td(fmt(dec(r, 'YF'), 2), 'right', z)
    ]);
  }
  return section('Autoconer Cuts', widths, body);
}

function wasteStockSection(rows) {
  const headers = ['Item Name', 'Op Qty', 'Op Wt', 'Pro Qty', 'Pro Wt', 'Sal Qty', 'Sal Wt', 'Cl Qty', 'Cl Wt', 'Value'];
  const widths = ['*', 45, 55, 45, 55, 45, 55, 45, 55, 60];
  const body = [headRow(headers)];
  let i = 0;
  for (const r of rows) {
    const z = zebraOf(i++);
    body.push([
      td(str(r, 'WasteItemName'), 'left', z),
      td(fmt(dec(r, 'OpQty'), 0), 'right', z),
      td(fmt(dec(r, 'OpWeight'), 2), 'right', z),
      td(fmt(dec(r, 'ProQty'), 0), 'right', z),
      td(fmt(dec(r, 'ProWeight'), 2), 'right', z),
      td(fmt(dec(r, 'SalQty'), 0), 'right', z),
      td(fmt(dec(r, 'SalWeight'), 2), 'right', z),
      td(fmt(dec(r, 'ClQty'), 0), 'right', z),
      td(fmt(dec(r, 'ClWeight'), 2), 'right', z),
      td(fmt(dec(r, 'ClosingValue'), 2), 'right', z)
    ]);
  }
  return section('Waste Stock', widths, body);
}

function spinningStoppageSection(rows) {
  const headers = ['S.No', 'Description', 'I Mins', 'II Mins', 'III Mins', 'Today Mins', 'Today %', 'Upto Mins', 'Upto %'];
  const widths = [40, '*', 55, 55, 55, 65, 50, 65, 50];
  const body = [headRow(headers)];
  // group by StoppageReasonCode, aggregate.
  const groups = groupBy(rows, (r) => str(r, 'StoppageReasonCode') || str(r, 'StoppageReason'));
  let i = 0;
  for (const list of groups.values()) {
    const z = zebraOf(i);
    const sum = (f) => list.reduce((a, r) => a + dec(r, f), 0);
    const avg = (f) => (list.length ? sum(f) / list.length : 0);
    const m = (f) => Math.round(sum(f) * 60);
    body.push([
      td(String(i + 1), 'center', z),
      td(str(list[0], 'StoppageReason'), 'left', z),
      td(fmt(m('ToDayStop1'), 0), 'right', z),
      td(fmt(m('ToDayStop2'), 0), 'right', z),
      td(fmt(m('ToDayStop3'), 0), 'right', z),
      td(fmt(m('ToDayStop'), 0), 'right', z),
      td(fmt(avg('TodayUtilPer'), 2), 'right', z),
      td(fmt(Math.round(sum('UptoDateStop') * 60), 0), 'right', z),
      td(fmt(avg('UptoDateUtilPer'), 2), 'right', z)
    ]);
    i++;
  }
  return section('Spinning Loss of Utilisation', widths, body);
}

function buildDocDefinition({ data, companyName, companyLogo, fromDate, toDate, query }) {
  const d = applyRowFiltersToData(data, query);
  const tables = [];
  const add = (nodes) => { for (const n of nodes) tables.push(n); };

  if ((d.department || []).length) add(preparatorySection(d.department));
  if ((d.spinning || []).length) add(spinningSection(d.spinning));
  if ((d.spinningWaste || []).length) add(spinningWasteSection(d.spinningWaste));
  if ((d.autoconer || []).length) add(autoconerSection(d.autoconer));
  if ((d.cottonStock || []).length) add(cottonStockSection(d.cottonStock));
  if ((d.packing || []).length) add(packingSection(d.packing));
  if ((d.workers || []).length) add(workersSection(d.workers));
  if ((d.store || []).length) add(storeSection(d.store));
  if ((d.eb || []).length) add(powerSection(d.eb));
  if ((d.cascade || []).length) add(cascadeSection(d.cascade));
  if ((d.autoconerCuts || []).length) add(autoconerCutsSection(d.autoconerCuts));
  if ((d.wasteStock || []).length) add(wasteStockSection(d.wasteStock));
  if ((d.spinningStoppage || []).length) add(spinningStoppageSection(d.spinningStoppage));

  if (!tables.length) {
    tables.push({ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] });
  }

  // ----- Production Summary (rendered on the first page, before the detail) -----
  const sumField = (arr, f) => (arr || []).reduce((a, r) => a + dec(r, f), 0);
  const summaryRows = [
    ['Preparatory', sumField(d.department, 'TotTargetProd'), sumField(d.department, 'TodayProdnKg'), sumField(d.department, 'UptoDateProdnkg')],
    ['Spinning', sumField(d.spinning, 'TotTargetProd'), sumField(d.spinning, 'TodayProdnKg'), sumField(d.spinning, 'UptoDateProdnkg')],
    ['Autoconer', sumField(d.autoconer, 'TotTargetProdn'), sumField(d.autoconer, 'TodayProdnKg'), sumField(d.autoconer, 'UptoDateProdnkg')],
    ['Packing', 0, sumField(d.packing, 'ProductionKgs'), sumField(d.packing, 'UptoDateKgs')]
  ];
  const sHeaders = ['Section', 'Target (Kg)', 'Today Prodn (Kg)', 'Upto Prodn (Kg)'];
  const sBody = [headRow(sHeaders, 9)];
  let tTgt = 0, tToday = 0, tUpto = 0, si = 0;
  for (const [name, tgt, today, upto] of summaryRows) {
    const z = zebraOf(si++);
    tTgt += tgt; tToday += today; tUpto += upto;
    sBody.push([
      td(name, 'left', z, 9),
      td(tgt ? fmt(tgt, 0) : '-', 'right', z, 9),
      td(fmt(today, 2), 'right', z, 9),
      td(fmt(upto, 2), 'right', z, 9)
    ]);
  }
  sBody.push([
    totalCell('Total', 'right'),
    totalCell(fmt(tTgt, 0)), totalCell(fmt(tToday, 2)), totalCell(fmt(tUpto, 2))
  ]);

  const summary = [
    titleBlock(companyName, TITLE, fromDate, toDate, companyLogo),
    { text: 'PRODUCTION SUMMARY', bold: true, fontSize: 11, color: colors.titleColor, alignment: 'center', margin: [0, 4, 0, 6] },
    { table: { headerRows: 1, dontBreakRows: true, widths: ['*', 120, 130, 130], body: sBody }, layout: tableLayout() }
  ];

  return buildPage({ companyName, companyLogo, title: TITLE, fromDate, toDate, tables, summary });
}

export const overAllProductionReport = (req, res) => {
  return runMultiReport(req, res, {
    fileName: FILE_NAME,
    buildDocDefinition,
    procs: [
      { key: 'department', spName: 'sp_Prodn_Production_All_Department_Abstract' },
      { key: 'spinning', spName: 'sp_Prodn_Production_All_Spinning_Abstract' },
      { key: 'spinningWaste', spName: 'sp_Prodn_Production_All_Spinning_Waste_Abstract' },
      { key: 'autoconer', spName: 'sp_Prodn_Production_All_Autoconer_Abstract' },
      { key: 'cottonStock', spName: 'sp_Cotton_Stock' },
      { key: 'packing', spName: 'sp_Yarn_RG1_Count_WithoutDate' },
      { key: 'workers', spName: 'sp_Prodn_Production_All_EmpEngagement_Abstract' },
      { key: 'store', spName: 'sp_Prodn_Production_All_Store_Transaction' },
      { key: 'eb', spName: 'sp_Prodn_Production_All_EB_Details' },
      { key: 'cascade', spName: 'sp_Prodn_Production_All_QC_CascadDetails' },
      { key: 'autoconerCuts', spName: 'sp_Prodn_Production_All_QC_AutoconerCutsDetails' },
      { key: 'wasteStock', spName: 'sp_WasteStockStatus' },
      { key: 'spinningStoppage', spName: 'sp_Prodn_Spinning_Stoppage' }
    ]
  });
};
