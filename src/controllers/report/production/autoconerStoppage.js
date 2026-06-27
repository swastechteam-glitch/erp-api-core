// Autoconer Stoppage report.
// Mirrors rptAutoconerProduction_Stoppage.rdlc — one row per stoppage reason
// with Mins + % columns for each shift, plus on-date and upto-date totals.
// Stoppage time is stored in hours, shown in minutes (× 60, rounded).
//
// SP: sp_Prodn_Autoconer_Stoppage (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, buildGroupSummaryPage, tableLayout, colors,
  dec, str, fmt
} from '../cotton/_common.js';

// 13 columns: SNo, Description, Code, then 5x (Mins, %)
const WIDTHS = [24, '*', 50, 38, 38, 38, 38, 38, 38, 42, 42, 44, 44];

const TITLE = 'AUTOCONER STOPPAGE REPORT';
const FILE_NAME = 'AutoconerProduction_Stoppage';

const mins = (h) => Math.round(h * 60);

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate }) {
  const body = [];
  const headStyle = { bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 8 };

  // Row 1 — grouped headers.
  body.push([
    { text: 'S.No', rowSpan: 2, ...headStyle },
    { text: 'Description', rowSpan: 2, ...headStyle },
    { text: 'Code', rowSpan: 2, ...headStyle },
    { text: 'I Shift', colSpan: 2, ...headStyle }, {},
    { text: 'II Shift', colSpan: 2, ...headStyle }, {},
    { text: 'III Shift', colSpan: 2, ...headStyle }, {},
    { text: 'ON DATE', colSpan: 2, ...headStyle }, {},
    { text: 'UPTO DATE', colSpan: 2, ...headStyle }, {}
  ]);
  // Row 2 — Mins / % sub-headers.
  body.push([
    {}, {}, {},
    { text: 'Mins', ...headStyle }, { text: '%', ...headStyle },
    { text: 'Mins', ...headStyle }, { text: '%', ...headStyle },
    { text: 'Mins', ...headStyle }, { text: '%', ...headStyle },
    { text: 'Mins', ...headStyle }, { text: '%', ...headStyle },
    { text: 'Mins', ...headStyle }, { text: '%', ...headStyle }
  ]);

  const sorted = [...rows].sort((a, b) =>
    str(a, 'StoppageReason').localeCompare(str(b, 'StoppageReason'))
  );

  let sM1 = 0, sM2 = 0, sM3 = 0, sMToday = 0, sMUpto = 0;
  let sP1 = 0, sP2 = 0, sP3 = 0, sPToday = 0, sPUpto = 0;
  const groupSummaries = [];
  let rowIdx = 0;
  let sno = 1;

  for (const r of sorted) {
    const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;
    const cell = (text, align = 'right') => ({ text, alignment: align, fontSize: 8, fillColor: zebra });

    const m1 = mins(dec(r, 'ToDayStop1'));
    const p1 = dec(r, 'UtilPer1');
    const m2 = mins(dec(r, 'ToDayStop2'));
    const p2 = dec(r, 'UtilPer2');
    const m3 = mins(dec(r, 'ToDayStop3'));
    const p3 = dec(r, 'UtilPer3');
    const mT = mins(dec(r, 'ToDayStop'));
    const pT = dec(r, 'TodayUtilPer');
    const mU = mins(dec(r, 'UptoDateStop'));
    const pU = dec(r, 'UptoDateUtilPer');

    sM1 += m1; sM2 += m2; sM3 += m3; sMToday += mT; sMUpto += mU;
    sP1 += p1; sP2 += p2; sP3 += p3; sPToday += pT; sPUpto += pU;

    body.push([
      cell(String(sno), 'center'),
      cell(str(r, 'StoppageReason'), 'left'),
      cell(str(r, 'ShortName'), 'center'),
      cell(fmt(m1, 0)), cell(fmt(p1, 2)),
      cell(fmt(m2, 0)), cell(fmt(p2, 2)),
      cell(fmt(m3, 0)), cell(fmt(p3, 2)),
      cell(fmt(mT, 0)), cell(fmt(pT, 2)),
      cell(fmt(mU, 0)), cell(fmt(pU, 2))
    ]);
    groupSummaries.push({
      label: str(r, 'StoppageReason'),
      totals: { mins: mT, pct: pT, umins: mU, upct: pU }
    });
    sno++;
    rowIdx++;
  }

  const gStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 };
  body.push([
    { text: 'Total', colSpan: 3, alignment: 'right', ...gStyle }, {}, {},
    { text: fmt(sM1, 0), alignment: 'right', ...gStyle },
    { text: fmt(sP1, 2), alignment: 'right', ...gStyle },
    { text: fmt(sM2, 0), alignment: 'right', ...gStyle },
    { text: fmt(sP2, 2), alignment: 'right', ...gStyle },
    { text: fmt(sM3, 0), alignment: 'right', ...gStyle },
    { text: fmt(sP3, 2), alignment: 'right', ...gStyle },
    { text: fmt(sMToday, 0), alignment: 'right', ...gStyle },
    { text: fmt(sPToday, 2), alignment: 'right', ...gStyle },
    { text: fmt(sMUpto, 0), alignment: 'right', ...gStyle },
    { text: fmt(sPUpto, 2), alignment: 'right', ...gStyle }
  ]);

  const summary = buildGroupSummaryPage({
    companyName, companyLogo, fromDate, toDate,
    title: 'AUTOCONER STOPPAGE - SUMMARY',
    groupHeader: 'Stoppage Reason',
    groupSummaries,
    grandTotals: { mins: sMToday, pct: sPToday, umins: sMUpto, upct: sPUpto },
    totalCols: [
      { header: 'On Date Mins', key: 'mins', digits: 0 },
      { header: 'On Date %', key: 'pct' },
      { header: 'UpToDate Mins', key: 'umins', digits: 0 },
      { header: 'UpToDate %', key: 'upct' }
    ]
  });

  return buildPage({
    companyName, companyLogo, title: TITLE, fromDate, toDate,
    summary,
    tables: [{
      table: { headerRows: 2, dontBreakRows: true, keepWithHeaderRows: 0, widths: WIDTHS, body },
      layout: tableLayout()
    }]
  });
}

export const autoconerStoppageReport = (req, res) =>
  runReport(req, res, { spName: 'sp_Prodn_Autoconer_Stoppage', fileName: FILE_NAME, buildDocDefinition });
