// Electrical — Electrical EB Reading (Electrical Daily Report).
// Mirrors rptElectricalDailyReport.rdlc — a composite stitching six SPs:
//   sp_Electrical_PowerDetails_DailyReport     (shift-wise power details)
//   sp_Diesel_Consumption                      (genset diesel details)
//   sp_Electrical_PowerGrouping_DailyReport    (plant/shift power grouping)
//   sp_Electrical_Compressor_DailyReport       (compressor run hours)
//   sp_Electrical_GenSet_DailyReport           (genset readings)
//   sp_EBDaysWise_Report                       (UKG + power-cost summary)
// Fault-isolated via runMultiReport — a failing SP shows "No data", rest render.

import {
  runMultiReport, buildPage, tableLayout, colors,
  dec, str, fmt
} from '../cotton/_common.js';

const headRow = (cells) =>
  cells.map((t) => ({ text: t, bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 8 }));
const zebraOf = (i) => (i % 2 === 1 ? colors.zebraFill : null);
const subStyle = { bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 8 };
const banner = (title) => ({
  table: { widths: ['*'], body: [[{ text: title, bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 9, margin: [3, 3, 0, 3] }]] },
  layout: 'noBorders', margin: [0, 8, 0, 2]
});

// Generic flat section: banner + header + rows + optional totals row.
function section(title, columns, rows) {
  const widths = columns.map((c) => c.width);
  const body = [headRow(columns.map((c) => c.header))];
  const list = rows || [];
  list.forEach((r, i) => {
    const z = zebraOf(i);
    body.push(columns.map((c) => ({ text: c.value(r, i), alignment: c.align || 'left', fontSize: 8, fillColor: z })));
  });
  if (list.length === 0) {
    body.push([{ text: 'No data for the selected period.', colSpan: columns.length, italics: true, fontSize: 8, color: '#888' }, ...Array(columns.length - 1).fill({})]);
  } else if (columns.some((c) => c.agg)) {
    const firstAgg = columns.findIndex((c) => c.agg);
    const cells = [{ text: 'Total', colSpan: firstAgg, alignment: 'right', ...subStyle }];
    for (let i = 1; i < firstAgg; i++) cells.push({});
    for (let i = firstAgg; i < columns.length; i++) {
      const c = columns[i];
      if (!c.agg) { cells.push({ text: '', ...subStyle }); continue; }
      const sum = list.reduce((a, r) => a + c.num(r), 0);
      const v = c.agg === 'avg' ? sum / (list.length || 1) : sum;
      cells.push({ text: fmt(v, c.digits ?? 2), alignment: 'right', ...subStyle });
    }
    body.push(cells);
  }
  return [banner(title), { table: { headerRows: 1, widths, body }, layout: tableLayout(), margin: [0, 0, 0, 6] }];
}

// UKG / power-cost summary panel from sp_EBDaysWise_Report rows.
function ukgSummary(rows) {
  const list = rows || [];
  const days = list.length;
  const sum = (col) => list.reduce((a, r) => a + dec(r, col), 0);
  const ebKwh = sum('EBKWH'), genKwh = sum('GENKWH'), solarKwh = sum('SolarKWH');
  const ebCost = sum('EBCost'), genCost = sum('GENCost');
  const powerCut = sum('EBPowerCutHr'), genHr = sum('GENPowerHr');
  const tfo = sum('TFOUnits'), actProd = sum('ActProduction'), convProd = sum('ConvertedProduction');
  const totalKwh = ebKwh + genKwh + solarKwh;
  const available = days * 24;
  const withoutTfo = totalKwh - tfo;
  const lines = [
    ['Total Hours Available', fmt(available, 0)],
    ['Total Power Cut Hours', fmt(powerCut, 2)],
    ['Total Running on Power', fmt(available - powerCut, 2)],
    ['Total Running on Genset', fmt(genHr, 2)],
    ['EB Consumption (Kwh)', fmt(ebKwh, 2)],
    ['Genset Power Consumption (Kwh)', fmt(genKwh, 2)],
    ['Solar Power Consumption (Kwh)', fmt(solarKwh, 2)],
    ['Total Power Consumption (Kwh)', fmt(totalKwh, 2)],
    ['Avg Consumption / Day', fmt(days ? totalKwh / days : 0, 2)],
    ['Avg Unit Cost / Day', fmt((ebKwh + genKwh) ? (ebCost + genCost + solarKwh) / (ebKwh + genKwh) : 0, 2)],
    ['Units Consumption (TFO)', fmt(tfo, 2)],
    ['Units Consumption Without TFO', fmt(withoutTfo, 2)],
    ['Actual Production', fmt(actProd, 2)],
    ['Converted Production', fmt(convProd, 2)],
    ['Actual UKG', fmt(actProd ? withoutTfo / actProd : 0, 2)],
    ['40s Converted UKG', fmt(convProd ? withoutTfo / convProd : 0, 2)]
  ];
  const body = [[
    { text: 'UKG and Power Cost Details', colSpan: 2, bold: true, color: colors.subText, fillColor: colors.subFill, fontSize: 9, margin: [2, 2, 0, 2] }, {}
  ]];
  lines.forEach(([k, v], i) => {
    const z = zebraOf(i);
    body.push([{ text: k, fontSize: 8, fillColor: z }, { text: v, alignment: 'right', fontSize: 8, fillColor: z }]);
  });
  return [banner('UKG and Power Cost Details'), { table: { widths: ['*', 110], body }, layout: tableLayout(), margin: [0, 0, 0, 6] }];
}

export const electricalEbReadingDateWise = (req, res) => runMultiReport(req, res, {
  fileName: 'ElectricalEBReading',
  procs: [
    { key: 'powerDetails', spName: 'sp_Electrical_PowerDetails_DailyReport' },
    { key: 'diesel', spName: 'sp_Diesel_Consumption' },
    { key: 'powerGroup', spName: 'sp_Electrical_PowerGrouping_DailyReport' },
    { key: 'compressor', spName: 'sp_Electrical_Compressor_DailyReport' },
    { key: 'genset', spName: 'sp_Electrical_GenSet_DailyReport' },
    { key: 'ebDays', spName: 'sp_EBDaysWise_Report' }
  ],
  buildDocDefinition: ({ data, companyName, companyLogo, fromDate, toDate }) => {
    const d = data || {};
    const tables = [];

    // 1) Power Details (shift wise)
    tables.push(...section('Power Details', [
      { header: 'Shift No', width: 56, align: 'center', value: (r) => str(r, 'ShiftNo') },
      { header: 'Unit Consumed', width: '*', align: 'right', value: (r) => fmt(dec(r, 'UnitConsumped'), 2), agg: 'sum', num: (r) => dec(r, 'UnitConsumped') },
      { header: 'EB Run Hr', width: '*', align: 'right', value: (r) => fmt(dec(r, 'EBRunHr'), 0), agg: 'sum', num: (r) => dec(r, 'EBRunHr'), digits: 0 },
      { header: 'Power Fail Hr', width: '*', align: 'right', value: (r) => fmt(dec(r, 'PowerFailHr'), 0), agg: 'sum', num: (r) => dec(r, 'PowerFailHr'), digits: 0 },
      { header: 'Genset Hr', width: '*', align: 'right', value: (r) => fmt(dec(r, 'GensetHr'), 0), agg: 'sum', num: (r) => dec(r, 'GensetHr'), digits: 0 },
      { header: 'MD', width: 56, align: 'right', value: (r) => fmt(dec(r, 'MD'), 2), agg: 'avg', num: (r) => dec(r, 'MD') },
      { header: 'PF', width: 50, align: 'right', value: (r) => fmt(dec(r, 'PF'), 2), agg: 'avg', num: (r) => dec(r, 'PF') },
      { header: 'Peak Dem', width: 60, align: 'right', value: (r) => fmt(dec(r, 'PeakDem'), 2) }
    ], d.powerDetails));

    // 2) Genset (Diesel) details
    tables.push(...section('Genset Details', [
      { header: 'Opening Qty', width: '*', align: 'right', value: (r) => fmt(dec(r, 'OpeningQTy'), 2) },
      { header: 'Receipt Qty', width: '*', align: 'right', value: (r) => fmt(dec(r, 'ReceiptQty'), 2), agg: 'sum', num: (r) => dec(r, 'ReceiptQty') },
      { header: 'Issue Qty', width: '*', align: 'right', value: (r) => fmt(dec(r, 'IssueQty'), 2), agg: 'sum', num: (r) => dec(r, 'IssueQty') },
      { header: 'Units', width: '*', align: 'right', value: (r) => fmt(dec(r, 'Units'), 2), agg: 'sum', num: (r) => dec(r, 'Units') },
      { header: 'UPL', width: 56, align: 'right', value: (r) => fmt(dec(r, 'UPL'), 2), agg: 'avg', num: (r) => dec(r, 'UPL') },
      { header: 'Closing Qty', width: '*', align: 'right', value: (r) => fmt(dec(r, 'ClosingQty'), 2) }
    ], d.diesel));

    // 3) Power Grouping (plant / shift)
    tables.push(...section('Power Grouping Details', [
      { header: 'Power Grouping', width: '*', align: 'left', value: (r) => str(r, 'PlantName') },
      { header: 'Shift', width: '*', align: 'center', value: (r) => str(r, 'ShiftName') },
      { header: 'Units', width: 90, align: 'right', value: (r) => fmt(dec(r, 'Unts'), 2), agg: 'sum', num: (r) => dec(r, 'Unts') }
    ], d.powerGroup));

    // 4) Compressor run hours
    tables.push(...section('Run Hours Details (Compressor)', [
      { header: 'Compressor Group', width: '*', align: 'left', value: (r) => str(r, 'CompressorGroupMasterName') },
      { header: 'Machine', width: '*', align: 'left', value: (r) => str(r, 'MachineName') },
      { header: 'Run Current Reading', width: 120, align: 'right', value: (r) => fmt(dec(r, 'RunCurrentReading'), 2), agg: 'sum', num: (r) => dec(r, 'RunCurrentReading') }
    ], d.compressor));

    // 5) Genset readings
    tables.push(...section('Genset No / Readings', [
      { header: 'Generator Group', width: '*', align: 'left', value: (r) => str(r, 'GeneratorMachineGroupName') },
      { header: 'Machine', width: '*', align: 'left', value: (r) => str(r, 'MachineName') },
      { header: 'Reading', width: 120, align: 'right', value: (r) => fmt(dec(r, 'Reading'), 2), agg: 'sum', num: (r) => dec(r, 'Reading') }
    ], d.genset));

    // 6) UKG + power cost summary
    tables.push(...ukgSummary(d.ebDays));

    return buildPage({ companyName, companyLogo, title: 'ELECTRICAL EB READING', fromDate, toDate, tables });
  }
});
