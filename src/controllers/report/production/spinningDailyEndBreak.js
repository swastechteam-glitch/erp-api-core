// Spinning Daily End Break report.
// Mirrors 07rptSpinningDailyEndBreakReport.rdlc — one row per machine with the
// upto-date totals for EBHSH / EM / Idle / EB / Waste %.
//
// SP: sp_Prodn_Spinning_EndBreaks_OverAll (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, chartFromRows
} from '../cotton/_common.js';

// 7 columns
const WIDTHS = ['*', 70, 70, 70, 70, 70, 70];

const TITLE = 'SPINNING DAILY END BREAK REPORT';
const FILE_NAME = 'SpinningProduction_DailyEndBreak';

const HEADERS = ['M/C Name', 'Act Count', 'EBHSH', 'EM', 'Idle', 'EB', 'Waste %'];

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate }) {
  const body = [];

  const headStyle = {
    bold: true, fillColor: colors.headerFill, color: colors.headerText,
    alignment: 'center', fontSize: 8
  };
  body.push(HEADERS.map((h) => ({ text: h, ...headStyle })));

  const sorted = [...rows].sort((a, b) => {
    const am = parseInt(a.MachineNo, 10);
    const bm = parseInt(b.MachineNo, 10);
    if (!isNaN(am) && !isNaN(bm)) return am - bm;
    return str(a, 'MachineName').localeCompare(str(b, 'MachineName'));
  });

  let sEbhsh = 0, sEm = 0, sIdle = 0, sEb = 0, sWaste = 0, n = 0;

  let rowIdx = 0;
  for (const r of sorted) {
    const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;
    const cell = (text, align = 'right') => ({
      text, alignment: align, fontSize: 8, fillColor: zebra
    });

    const ebhsh = dec(r, 'TotalEBHSH');
    const em = dec(r, 'TotalEM');
    const idle = dec(r, 'TotalIdel');
    const eb = dec(r, 'TotalEB');
    const waste = dec(r, 'TotalWastePer');

    sEbhsh += ebhsh; sEm += em; sIdle += idle; sEb += eb; sWaste += waste; n++;

    body.push([
      cell(str(r, 'MachineName') || str(r, 'MachineNo'), 'left'),
      cell(fmt(dec(r, 'ActualCount'), 2)),
      cell(fmt(ebhsh, 2)),
      cell(fmt(em, 2)),
      cell(fmt(idle, 0)),
      cell(fmt(eb, 2)),
      cell(fmt(waste, 2))
    ]);
    rowIdx++;
  }

  const gStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 };
  const avg = (sum) => (n > 0 ? sum / n : 0);
  body.push([
    { text: 'Average', alignment: 'right', ...gStyle },
    { text: '', ...gStyle },
    { text: fmt(avg(sEbhsh), 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(sEm), 2), alignment: 'right', ...gStyle },
    { text: fmt(sIdle, 0), alignment: 'right', ...gStyle },
    { text: fmt(avg(sEb), 2), alignment: 'right', ...gStyle },
    { text: fmt(avg(sWaste), 2), alignment: 'right', ...gStyle }
  ]);

  const chart = chartFromRows(rows, {
    groupKey: (r) => str(r, 'MachineCode') || str(r, 'MachineName') || str(r, 'MachineNo'),
    groupLabel: (r) => str(r, 'MachineName') || str(r, 'MachineNo'),
    valueFn: (r) => dec(r, 'TotalEB'), valueHeader: 'Ends Break',
    groupHeader: 'Machine', digits: 2
  });

  return buildPage({
    companyName, companyLogo, title: TITLE, fromDate, toDate,
    tables: [...chart, {
      table: { headerRows: 1, dontBreakRows: true, keepWithHeaderRows: 0, widths: WIDTHS, body },
      layout: tableLayout()
    }]
  });
}

export const spinningDailyEndBreakReport = (req, res) => {
  return runReport(req, res, {
    spName: 'sp_Prodn_Spinning_EndBreaks_OverAll',
    fileName: FILE_NAME,
    buildDocDefinition
  });
};
