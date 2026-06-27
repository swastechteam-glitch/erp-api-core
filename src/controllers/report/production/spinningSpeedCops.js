// Spinning Speed & Cop Content report.
// Mirrors rptSpinningSpeedMachineWise.rdlc — two sections (Count Wise summary and
// Machine Wise detail), each per date with per-shift speed / cop content + average.
//
// SPs: sp_Prodn_Spinning_Speed_Cpo_Report_CountWise (count) and
//      sp_Prodn_Spinning_Speed_Cpo_Report (machine), both CompanyCode/FromDate/ToDate.

import {
  runMultiReport, buildPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy
} from '../cotton/_common.js';

const WIDTHS = ['*', 54, 54, 54, 54, 54, 54, 60, 60];
const HEADERS = ['', 'Speed 1', 'Cpo 1', 'Speed 2', 'Cpo 2', 'Speed 3', 'Cpo 3', 'Avg Speed', 'Avg Cpos'];

const TITLE = 'SPEED AND COP CONTENT REPORT';
const FILE_NAME = 'SpinningProduction_SpeedCops';

// Build one section table (grouped by date) for the given rows.
function buildSection(rows, labelField, firstHeader) {
  const body = [];
  const headStyle = { bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 8 };
  body.push([firstHeader, ...HEADERS.slice(1)].map((h) => ({ text: h, ...headStyle })));

  // Group by production date (header sub-row), preserving first-seen order.
  const dates = new Map();
  for (const r of rows) {
    const key = str(r, 'ProdnDate');
    if (!dates.has(key)) dates.set(key, []);
    dates.get(key).push(r);
  }

  let rowIdx = 0;
  for (const dRows of dates.values()) {
    body.push([{ text: `Date : ${ddmmyyyy(dRows[0].ProdnDate)}`, colSpan: 9, bold: true, color: colors.groupText, fillColor: colors.groupFill, fontSize: 8 }, {}, {}, {}, {}, {}, {}, {}, {}]);
    for (const r of dRows) {
      const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;
      const cell = (text, align = 'right') => ({ text, alignment: align, fontSize: 7, fillColor: zebra });
      body.push([
        cell(str(r, labelField), 'left'),
        cell(fmt(dec(r, 'Speed1'), 0)),
        cell(fmt(dec(r, 'Cpo1'), 2)),
        cell(fmt(dec(r, 'Speed2'), 0)),
        cell(fmt(dec(r, 'Cpo2'), 2)),
        cell(fmt(dec(r, 'Speed3'), 0)),
        cell(fmt(dec(r, 'Cpo3'), 2)),
        cell(fmt(dec(r, 'AVGSpeed'), 0)),
        cell(fmt(dec(r, 'AVGCpos'), 2)),
      ]);
      rowIdx++;
    }
  }

  return { table: { headerRows: 1, dontBreakRows: true, widths: WIDTHS, body }, layout: tableLayout() };
}

function buildDocDefinition({ data, companyName, companyLogo, fromDate, toDate }) {
  const countRows = data.countWise || [];
  const machineRows = data.machineWise || [];

  const subtitle = (text) => ({ text, bold: true, fontSize: 11, color: colors.titleColor, margin: [0, 10, 0, 4] });
  const tables = [];

  tables.push(subtitle('COUNT WISE SUMMARY'));
  tables.push(countRows.length
    ? buildSection(countRows, 'ShortName', 'Count')
    : { text: 'No count-wise data for the selected period.', italics: true, margin: [0, 2, 0, 0] });

  tables.push(subtitle('MACHINE WISE'));
  tables.push(machineRows.length
    ? buildSection(machineRows, 'MachineName', 'Machine')
    : { text: 'No machine-wise data for the selected period.', italics: true, margin: [0, 2, 0, 0] });

  return buildPage({ companyName, companyLogo, title: TITLE, fromDate, toDate, tables });
}

export const spinningSpeedCopsReport = (req, res) =>
  runMultiReport(req, res, {
    fileName: FILE_NAME,
    procs: [
      { key: 'countWise', spName: 'sp_Prodn_Spinning_Speed_Cpo_Report_CountWise' },
      { key: 'machineWise', spName: 'sp_Prodn_Spinning_Speed_Cpo_Report' },
    ],
    buildDocDefinition,
  });
