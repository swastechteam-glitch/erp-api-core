// Electrical — Compressor Reading reports.
// Mirrors (all read sp_CompressorReplacement):
//   rptCompressorReading.rdlc / _MachineWise.rdlc — consolidation detail,
//       one row per reading (run hours, pressures, CFM, cost).
//   rptCompressorReading_Performance.rdlc — adds KWH + Power (KWH / (CFM/1.7)).
//   rptCompressorReading_MonthWise.rdlc — grouped by month, aggregated.
// Shares the cotton/_common PDF pipeline (logo + trend chart).

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy, chartFromRows, sql
} from '../cotton/_common.js';
import { getPool } from '../../../config/dynamicDB.js';

// ---- functional filters (port of the WinForms DataTable.Select chain) -------
const codeSet = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const s = new Set(String(v).split(',').map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n)));
  return s.size ? s : null;
};
const oneFilter = (rows, field, set) =>
  (!set || !rows.length || !(field in rows[0])) ? rows : rows.filter((r) => set.has(parseInt(r[field], 10)));
const filterRows = (rows, query = {}) => {
  let out = rows || [];
  out = oneFilter(out, 'BranchCode', codeSet(query.branchCode));
  out = oneFilter(out, 'CompressorGroupMasterCode', codeSet(query.compressorGroupMasterCode));
  out = oneFilter(out, 'MachineCode', codeSet(query.machineCode));
  out = oneFilter(out, 'ShiftCode', codeSet(query.shiftCode));
  return out;
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const headRow = (cells) =>
  cells.map((t) => ({ text: t, bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 7 }));
const groupRowNode = (label, span) =>
  [{ text: label, colSpan: span, bold: true, color: colors.groupText, fillColor: colors.groupFill, fontSize: 9, margin: [2, 2, 0, 2] }, ...Array(span - 1).fill({})];
const zebraOf = (i) => (i % 2 === 1 ? colors.zebraFill : null);
const totalStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 8 };

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}

// Flat detail grouped by compressor group, with a closing Grand Total.
function buildGroupedFlat({ rows, columns, title, companyName, companyLogo, fromDate, toDate, chartValue, chartHeader, groupField = 'CompressorGroupMasterName', groupCaption = 'Compressor Group' }) {
  const span = columns.length;
  const body = [headRow(columns.map((c) => c.header))];
  const groups = [...groupBy(rows || [], (r) => str(r, groupField)).entries()]
    .sort((a, b) => a[0].localeCompare(b[0]));
  let sno = 0;
  const grand = {};
  columns.forEach((c) => { if (c.sum) grand[c.header] = 0; });

  for (const [, gRows] of groups) {
    gRows.sort((a, b) => new Date(a.CompressorReadingDate) - new Date(b.CompressorReadingDate));
    body.push(groupRowNode(`${groupCaption} : ${str(gRows[0], groupField)}`, span));
    gRows.forEach((r) => {
      const z = zebraOf(sno);
      sno++;
      body.push(columns.map((c) => {
        if (c.sum) grand[c.header] += c.num(r);
        return { text: c.value(r, sno), alignment: c.align || 'left', fontSize: 7, fillColor: z };
      }));
    });
  }
  if ((rows || []).length === 0) {
    body.push([{ text: 'No compressor readings for the selected period.', colSpan: span, italics: true, fontSize: 8, color: '#888' }, ...Array(span - 1).fill({})]);
  } else {
    const firstSum = columns.findIndex((c) => c.sum);
    const cells = [{ text: 'Grand Total', colSpan: firstSum, alignment: 'right', ...totalStyle }];
    for (let i = 1; i < firstSum; i++) cells.push({});
    for (let i = firstSum; i < columns.length; i++) {
      const c = columns[i];
      cells.push(c.sum ? { text: fmt(grand[c.header], 2), alignment: 'right', ...totalStyle } : { text: '', ...totalStyle });
    }
    body.push(cells);
  }
  const table = { table: { headerRows: 1, widths: columns.map((c) => c.width), body }, layout: tableLayout() };
  const chart = chartFromRows(rows, {
    groupKey: (r) => ddmmyyyy(r.CompressorReadingDate), groupLabel: (r) => `Date : ${ddmmyyyy(r.CompressorReadingDate)}`,
    valueFn: chartValue, valueHeader: chartHeader, groupHeader: 'Date', digits: 2
  });
  return buildPage({ companyName, companyLogo, title, fromDate, toDate, tables: [...chart, table] });
}

const C = {
  sno: { header: 'S.No', width: 26, align: 'center', value: (r, i) => String(i) },
  date: { header: 'Date', width: 58, align: 'center', value: (r) => ddmmyyyy(r.CompressorReadingDate) },
  machine: { header: 'Machine', width: '*', align: 'left', value: (r) => str(r, 'MachineName') },
  totRun: { header: 'Tot Run Hrs', width: 56, align: 'right', value: (r) => fmt(dec(r, 'RunCurrentReading'), 2) },
  runHrs: { header: 'Run Hrs', width: 50, align: 'right', value: (r) => fmt(dec(r, 'RunDifference'), 2), sum: true, num: (r) => dec(r, 'RunDifference') },
  oil: { header: 'Oil Press', width: 48, align: 'right', value: (r) => fmt(dec(r, 'OilPressor'), 2) },
  radiator: { header: 'Radiator Temp', width: 56, align: 'right', value: (r) => fmt(dec(r, 'RadiotorTemperature'), 2) },
  cfm: { header: 'CFM', width: 44, align: 'right', value: (r) => fmt(dec(r, 'CFM'), 2) },
  due: { header: 'Due Point', width: 48, align: 'right', value: (r) => fmt(dec(r, 'DuePoint'), 2) },
  high: { header: 'High Press', width: 48, align: 'right', value: (r) => fmt(dec(r, 'HighPressor'), 2) },
  low: { header: 'Low Press', width: 48, align: 'right', value: (r) => fmt(dec(r, 'LowPressor'), 2) },
  cost: { header: 'Replace Cost', width: 60, align: 'right', value: (r) => fmt(dec(r, 'Cost'), 2), sum: true, num: (r) => dec(r, 'Cost') }
};

// ---- handlers --------------------------------------------------------------

// Date Wise — consolidation (one row per reading, grouped by compressor group).
export const compressorDateWise = (req, res) => runReport(req, res, {
  spName: 'sp_CompressorReplacement',
  fileName: 'CompressorReading_Consolidation',
  buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate, query }) =>
    buildGroupedFlat({
      rows: filterRows(rows, query), companyName, companyLogo, fromDate, toDate,
      title: 'COMPRESSOR RUN DETAILS - CONSOLIDATION',
      columns: [C.sno, C.date, C.machine, C.totRun, C.runHrs, C.oil, C.radiator, C.cfm, C.due, C.high, C.low, C.cost],
      chartValue: (r) => dec(r, 'RunDifference'), chartHeader: 'Run Hours'
    })
});

// Machine Wise — same consolidation detail but grouped by machine.
export const compressorMachineWise = (req, res) => runReport(req, res, {
  spName: 'sp_CompressorReplacement',
  fileName: 'CompressorReading_MachineWise',
  buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate, query }) =>
    buildGroupedFlat({
      rows: filterRows(rows, query), companyName, companyLogo, fromDate, toDate,
      title: 'COMPRESSOR RUN DETAILS - MACHINE WISE',
      groupField: 'MachineName', groupCaption: 'Machine',
      columns: [C.sno, C.date, C.totRun, C.runHrs, C.oil, C.radiator, C.cfm, C.due, C.high, C.low, C.cost],
      chartValue: (r) => dec(r, 'RunDifference'), chartHeader: 'Run Hours'
    })
});

// Performance — adds KWH + derived Power (KWH / (CFM / 1.7)).
export const compressorPerformance = (req, res) => runReport(req, res, {
  spName: 'sp_CompressorReplacement',
  fileName: 'CompressorReading_Performance',
  buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate, query }) =>
    buildGroupedFlat({
      rows: filterRows(rows, query), companyName, companyLogo, fromDate, toDate,
      title: 'COMPRESSOR RUN DETAILS - PERFORMANCE',
      columns: [
        C.sno, C.date, C.machine, C.totRun, C.runHrs, C.oil, C.radiator, C.cfm,
        { header: 'KWH', width: 50, align: 'right', value: (r) => fmt(dec(r, 'KWHDifference'), 2), sum: true, num: (r) => dec(r, 'KWHDifference') },
        C.high, C.low,
        { header: 'Power', width: 48, align: 'right', value: (r) => { const c = dec(r, 'CFM'); return fmt(c ? dec(r, 'KWHDifference') / (c / 1.7) : 0, 2); } },
        C.cost
      ],
      chartValue: (r) => dec(r, 'KWHDifference'), chartHeader: 'KWH'
    })
});

// Month Wise — grouped by month, one row per machine (aggregated).
export const compressorMonthWise = (req, res) => runReport(req, res, {
  spName: 'sp_CompressorReplacement',
  fileName: 'CompressorReading_MonthWise',
  buildDocDefinition: ({ rows, companyName, companyLogo, fromDate, toDate, query }) => {
    rows = filterRows(rows, query);
    const cols = ['Month', 'Machine', 'Tot Run Hrs', 'Run Hrs', 'Oil Press', 'Radiator Temp', 'CFM', 'Due Point', 'High Press', 'Low Press', 'Replace Cost'];
    const span = cols.length;
    const body = [headRow(cols)];
    const dateOf = (r) => r.ComDate || r.CompressorReadingDate;
    const months = [...groupBy(rows || [], (r) => new Date(dateOf(r)).getMonth()).entries()]
      .sort((a, b) => a[0] - b[0]);
    const chartRows = [];

    for (const [m, mRows] of months) {
      body.push(groupRowNode(MONTHS[m] || '', span));
      const machines = [...groupBy(mRows, (r) => str(r, 'MachineName')).entries()]
        .sort((a, b) => a[0].localeCompare(b[0]));
      machines.forEach(([machine, gRows], i) => {
        const z = zebraOf(i);
        const max = (col) => gRows.reduce((a, r) => Math.max(a, dec(r, col)), 0);
        const sum = (col) => gRows.reduce((a, r) => a + dec(r, col), 0);
        const avg = (col) => (gRows.length ? sum(col) / gRows.length : 0);
        const runDiff = sum('RunDifference');
        chartRows.push({ label: `${MONTHS[m]} - ${machine}`, v: runDiff });
        body.push([
          { text: MONTHS[m] || '', fontSize: 7, fillColor: z },
          { text: machine, fontSize: 7, fillColor: z },
          { text: fmt(max('RunCurrentReading'), 2), alignment: 'right', fontSize: 7, fillColor: z },
          { text: fmt(runDiff, 2), alignment: 'right', fontSize: 7, fillColor: z },
          { text: fmt(avg('OilPressor'), 2), alignment: 'right', fontSize: 7, fillColor: z },
          { text: fmt(avg('RadiotorTemperature'), 2), alignment: 'right', fontSize: 7, fillColor: z },
          { text: fmt(max('CFM'), 2), alignment: 'right', fontSize: 7, fillColor: z },
          { text: fmt(avg('DuePoint'), 2), alignment: 'right', fontSize: 7, fillColor: z },
          { text: fmt(avg('HighPressor'), 2), alignment: 'right', fontSize: 7, fillColor: z },
          { text: fmt(avg('LowPressor'), 2), alignment: 'right', fontSize: 7, fillColor: z },
          { text: fmt(sum('Cost'), 2), alignment: 'right', fontSize: 7, fillColor: z }
        ]);
      });
    }
    if ((rows || []).length === 0) {
      body.push([{ text: 'No compressor readings for the selected period.', colSpan: span, italics: true, fontSize: 8, color: '#888' }, ...Array(span - 1).fill({})]);
    }
    const widths = [60, '*', 56, 50, 48, 56, 44, 48, 48, 48, 60];
    const table = { table: { headerRows: 1, widths, body }, layout: tableLayout() };
    const chart = chartFromRows(chartRows, {
      groupKey: (r) => r.label, groupLabel: (r) => r.label, valueFn: (r) => r.v,
      valueHeader: 'Run Hours', groupHeader: 'Month', digits: 2
    });
    return buildPage({ companyName, companyLogo, title: 'COMPRESSOR RUN DETAILS - MONTH WISE', fromDate, toDate, tables: [...chart, table] });
  }
});

// GET /electrical/reports/compressor-reading/options — filter dropdowns
// (Branch / Com.Group Master / Machine / Shift).
export const compressorReadingOptions = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type('text/plain').send('Missing subDBName header');
    const companyCode = parseInt(req.query.CompanyCode || req.headers.companycode) || 0;
    const pool = await getPool(subDbName);
    const [branches, groups, machines, shifts] = await Promise.all([
      pool.request().input('CompanyCode', sql.Int, companyCode)
        .query('SELECT BranchCode AS value, BranchName AS label FROM tbl_Branch WHERE CompanyCode = @CompanyCode ORDER BY BranchName'),
      pool.request()
        .query('SELECT CompressorGroupMasterCode AS value, CompressorGroupMasterName AS label FROM tbl_CompressorGroupMaster ORDER BY CompressorGroupMasterName'),
      pool.request().input('CompanyCode', sql.Int, companyCode)
        .query('SELECT MachineCode AS value, MachineName AS label FROM tbl_Machine WHERE CompanyCode = @CompanyCode ORDER BY MachineName'),
      pool.request()
        .query('SELECT ShiftCode AS value, ShiftName AS label FROM tbl_Shift ORDER BY ShiftName')
    ]);
    res.json({
      success: true,
      data: {
        branches: branches.recordset,
        compressorGroups: groups.recordset,
        machines: machines.recordset,
        shifts: shifts.recordset
      }
    });
  } catch (err) {
    console.error('Report Error (compressorReadingOptions):', err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
};
