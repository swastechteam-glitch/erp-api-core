// Finisher Drawing Production Details (Mix Wise) report.
// Mirrors rptFinisherDrawingMixWiseDetails_report.rdlc — one row per Mixing with
// Opening + per-shift production + Total + Upto Date, plus a grand-total row.
//
// SP: sp_Prodn_FinisherDrawing_ShiftMixWise (CompanyCode, FromDate, ToDate[, ShiftCode])

import {
  runReport, buildPage, buildGroupSummaryPage, tableLayout, colors,
  dec, str, fmt
} from '../cotton/_common.js';

const WIDTHS = [40, '*', 80, 80, 80, 80, 90, 100];

const TITLE = 'FINISHER DRAWING PRODUCTION DETAILS (MIX WISE)';
const FILE_NAME = 'FinisherDrawingProduction_MixWise';

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate }) {
  const body = [];
  const headStyle = { bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 8 };
  body.push(['S.No', 'Mixing', 'Opening', 'Shift 1', 'Shift 2', 'Shift 3', 'Total', 'Up to Date'].map((h) => ({ text: h, ...headStyle })));

  let sOpen = 0, s1 = 0, s2 = 0, s3 = 0, sTot = 0, sUpto = 0;
  const groupSummaries = [];

  let rowIdx = 0;
  rows.forEach((r, i) => {
    const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;
    const cell = (text, align = 'right') => ({ text, alignment: align, fontSize: 8, fillColor: zebra });

    const open = dec(r, 'Opening');
    const v1 = dec(r, 'IShift');
    const v2 = dec(r, 'IIShift');
    const v3 = dec(r, 'IIIShift');
    const tot = dec(r, 'Total');
    const upto = dec(r, 'UptoDate');

    sOpen += open; s1 += v1; s2 += v2; s3 += v3; sTot += tot; sUpto += upto;

    body.push([
      cell(String(i + 1), 'center'),
      cell(str(r, 'MixingName'), 'left'),
      cell(fmt(open, 0)),
      cell(fmt(v1, 0)),
      cell(fmt(v2, 0)),
      cell(fmt(v3, 0)),
      cell(fmt(tot, 0)),
      cell(fmt(upto, 0)),
    ]);
    groupSummaries.push({ label: str(r, 'MixingName'), totals: { total: tot, upto } });
    rowIdx++;
  });

  const gStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 };
  body.push([
    { text: 'Total', colSpan: 2, alignment: 'right', ...gStyle }, {},
    { text: fmt(sOpen, 0), alignment: 'right', ...gStyle },
    { text: fmt(s1, 0), alignment: 'right', ...gStyle },
    { text: fmt(s2, 0), alignment: 'right', ...gStyle },
    { text: fmt(s3, 0), alignment: 'right', ...gStyle },
    { text: fmt(sTot, 0), alignment: 'right', ...gStyle },
    { text: fmt(sUpto, 0), alignment: 'right', ...gStyle },
  ]);

  if (rows.length === 0) {
    return buildPage({ companyName, companyLogo, title: TITLE, fromDate, toDate,
      tables: [{ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] }] });
  }

  const summary = buildGroupSummaryPage({
    companyName, companyLogo, fromDate, toDate,
    title: 'FINISHER DRAWING MIX WISE - SUMMARY',
    groupHeader: 'Mixing',
    groupSummaries,
    grandTotals: { total: sTot, upto: sUpto },
    totalCols: [
      { header: 'Total', key: 'total', digits: 0 },
      { header: 'Up to Date', key: 'upto', digits: 0 },
    ],
  });

  return buildPage({
    companyName, companyLogo, title: TITLE, fromDate, toDate,
    summary,
    tables: [{ table: { headerRows: 1, dontBreakRows: true, widths: WIDTHS, body }, layout: tableLayout() }],
  });
}

export const finisherDrawingMixWiseReport = (req, res) =>
  runReport(req, res, { spName: 'sp_Prodn_FinisherDrawing_ShiftMixWise', fileName: FILE_NAME, buildDocDefinition });
