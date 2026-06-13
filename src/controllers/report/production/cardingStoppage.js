// Carding Stoppage Wise report.
// Mirrors rptCarding_Prodn_Stoppage.rdlc — one row per stoppage reason, with
// HRS and % columns for each shift, plus on-date and upto-date totals.
//
// SP: sp_Prodn_Carding_Stoppage (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, buildGroupSummaryPage, tableLayout, colors,
  dec, str, fmt
} from '../cotton/_common.js';

// 13 columns: SNo, Description, Code, then 5x (HRS, %)
const WIDTHS = [24, '*', 50, 38, 38, 38, 38, 38, 38, 42, 42, 44, 44];

const TITLE = 'CARDING STOPPAGE REPORT';
const FILE_NAME = 'CardingProduction_StoppageWise';

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate }) {
  const body = [];

  const headStyle = {
    bold: true, fillColor: colors.headerFill, color: colors.headerText,
    alignment: 'center', fontSize: 8
  };

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

  // Row 2 — HRS / % sub-headers.
  body.push([
    {}, {}, {},
    { text: 'HRS', ...headStyle }, { text: '%', ...headStyle },
    { text: 'HRS', ...headStyle }, { text: '%', ...headStyle },
    { text: 'HRS', ...headStyle }, { text: '%', ...headStyle },
    { text: 'HRS', ...headStyle }, { text: '%', ...headStyle },
    { text: 'HRS', ...headStyle }, { text: '%', ...headStyle }
  ]);

  // Sort by stoppage reason for stable presentation.
  const sorted = [...rows].sort((a, b) =>
    str(a, 'StoppageReason').localeCompare(str(b, 'StoppageReason'))
  );

  let sH1 = 0, sH2 = 0, sH3 = 0, sHToday = 0, sHUpto = 0;
  let sP1 = 0, sP2 = 0, sP3 = 0, sPToday = 0, sPUpto = 0;
  const groupSummaries = [];

  let rowIdx = 0;
  let sno = 1;
  for (const r of sorted) {
    const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;
    const cell = (text, align = 'right') => ({
      text, alignment: align, fontSize: 8, fillColor: zebra
    });

    const h1 = dec(r, 'ToDayStop1');
    const p1 = dec(r, 'UtilPer1');
    const h2 = dec(r, 'ToDayStop2');
    const p2 = dec(r, 'UtilPer2');
    const h3 = dec(r, 'ToDayStop3');
    const p3 = dec(r, 'UtilPer3');
    const hT = dec(r, 'ToDayStop');
    const pT = dec(r, 'TodayUtilPer');
    const hU = dec(r, 'UptoDateStop');
    const pU = dec(r, 'UptoDateUtilPer');

    sH1 += h1; sH2 += h2; sH3 += h3; sHToday += hT; sHUpto += hU;
    sP1 += p1; sP2 += p2; sP3 += p3; sPToday += pT; sPUpto += pU;

    body.push([
      cell(String(sno), 'center'),
      cell(str(r, 'StoppageReason'), 'left'),
      cell(str(r, 'ShortName'), 'center'),
      cell(fmt(h1, 2)),
      cell(fmt(p1, 2)),
      cell(fmt(h2, 2)),
      cell(fmt(p2, 2)),
      cell(fmt(h3, 2)),
      cell(fmt(p3, 2)),
      cell(fmt(hT, 2)),
      cell(fmt(pT, 2)),
      cell(fmt(hU, 2)),
      cell(fmt(pU, 2))
    ]);
    groupSummaries.push({
      label: str(r, 'StoppageReason'),
      totals: { hrs: hT, pct: pT, uhrs: hU, upct: pU }
    });
    sno++;
    rowIdx++;
  }

  const gStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 };
  body.push([
    { text: 'Total', colSpan: 3, alignment: 'right', ...gStyle }, {}, {},
    { text: fmt(sH1, 2), alignment: 'right', ...gStyle },
    { text: fmt(sP1, 2), alignment: 'right', ...gStyle },
    { text: fmt(sH2, 2), alignment: 'right', ...gStyle },
    { text: fmt(sP2, 2), alignment: 'right', ...gStyle },
    { text: fmt(sH3, 2), alignment: 'right', ...gStyle },
    { text: fmt(sP3, 2), alignment: 'right', ...gStyle },
    { text: fmt(sHToday, 2), alignment: 'right', ...gStyle },
    { text: fmt(sPToday, 2), alignment: 'right', ...gStyle },
    { text: fmt(sHUpto, 2), alignment: 'right', ...gStyle },
    { text: fmt(sPUpto, 2), alignment: 'right', ...gStyle }
  ]);

  const summary = buildGroupSummaryPage({
    companyName, companyLogo, fromDate, toDate,
    title: 'CARDING STOPPAGE - SUMMARY',
    groupHeader: 'Stoppage Reason',
    groupSummaries,
    grandTotals: { hrs: sHToday, pct: sPToday, uhrs: sHUpto, upct: sPUpto },
    totalCols: [
      { header: 'On Date HRS', key: 'hrs' },
      { header: 'On Date %', key: 'pct' },
      { header: 'UpToDate HRS', key: 'uhrs' },
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

export const cardingStoppageReport = (req, res) => {
  return runReport(req, res, {
    spName: 'sp_Prodn_Carding_Stoppage',
    fileName: FILE_NAME,
    buildDocDefinition
  });
};
