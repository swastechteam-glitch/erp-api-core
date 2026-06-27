// Production UKG Summary (Units per Kg, pivot).
// Mirrors rptProdn_UKGSummary.rdlc — a matrix pivot of (EntryDate, CountName)
// rows by DepartmentName columns summing UKG, with a per-row "Total" column.
// The RDLC title is "PRODUCTION UKG REPORT ON : <ToDate>".
//
// SP: sp_Prodn_UKG_Summary (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy, applyRowFilters
} from '../cotton/_common.js';

const FILE_NAME = 'ProductionUKG_Summary';

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate, query }) {
  const data = applyRowFilters(rows, query);
  const title = `PRODUCTION UKG REPORT ON : ${ddmmyyyy(toDate)}`;

  // Column groups — distinct DepartmentName in first-seen order.
  const departments = [];
  for (const r of data) {
    const d = str(r, 'DepartmentName') || '-';
    if (!departments.includes(d)) departments.push(d);
  }

  // Row groups — (EntryDate, CountName), preserving first-seen order.
  const rowMap = new Map();
  for (const r of data) {
    const key = `${str(r, 'EntryDate')}||${str(r, 'CountName')}`;
    if (!rowMap.has(key)) {
      rowMap.set(key, { entryDate: str(r, 'EntryDate'), countName: str(r, 'CountName'), rows: [] });
    }
    rowMap.get(key).rows.push(r);
  }

  const headStyle = { bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 8 };
  const headers = ['Date', 'Count', ...departments, 'Total'];
  const widths = ['auto', '*', ...departments.map(() => 70), 70];
  const body = [headers.map((h) => ({ text: h, ...headStyle }))];

  const sumUKG = (list, dept) =>
    list.filter((r) => (str(r, 'DepartmentName') || '-') === dept).reduce((a, r) => a + dec(r, 'UKG'), 0);

  const colTotals = departments.map(() => 0);
  let grand = 0;
  let i = 0;
  for (const grp of rowMap.values()) {
    const zebra = i % 2 === 1 ? colors.zebraFill : null;
    const cells = [
      { text: ddmmyyyy(grp.entryDate), alignment: 'center', fontSize: 8, fillColor: zebra },
      { text: grp.countName, alignment: 'left', fontSize: 8, fillColor: zebra }
    ];
    let rowTotal = 0;
    departments.forEach((dept, c) => {
      const v = sumUKG(grp.rows, dept);
      colTotals[c] += v;
      rowTotal += v;
      cells.push({ text: v ? fmt(v, 2) : '', alignment: 'right', fontSize: 8, fillColor: zebra });
    });
    grand += rowTotal;
    cells.push({ text: fmt(rowTotal, 2), alignment: 'right', bold: true, fontSize: 8, fillColor: zebra });
    body.push(cells);
    i++;
  }

  const gStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 8 };
  body.push([
    { text: 'Total', colSpan: 2, alignment: 'right', ...gStyle }, {},
    ...colTotals.map((v) => ({ text: fmt(v, 2), alignment: 'right', ...gStyle })),
    { text: fmt(grand, 2), alignment: 'right', ...gStyle }
  ]);

  if (data.length === 0) {
    return buildPage({
      companyName, companyLogo, title, fromDate, toDate,
      tables: [{ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] }]
    });
  }

  return buildPage({
    companyName, companyLogo, title, fromDate, toDate,
    tables: [{ table: { headerRows: 1, dontBreakRows: true, widths, body }, layout: tableLayout() }]
  });
}

export const productionUKGSummaryReport = (req, res) =>
  runReport(req, res, { spName: 'sp_Prodn_UKG_Summary', fileName: FILE_NAME, buildDocDefinition });
