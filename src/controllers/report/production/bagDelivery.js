// Bag Delivery Details.
// Mirrors rptBagDeliveryDetails.rdlc — a matrix pivot of BillDate (rows) by
// CountType (columns) summing Qty, with a per-date "Daily Delivery" row total
// and a bottom "Total" row of per-count-type column totals.
//
// SP: sp_BagDelivery_GetAll (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, ddmmyyyy, applyRowFilters
} from '../cotton/_common.js';

const TITLE = 'BAG DELIVERY DETAILS';
const FILE_NAME = 'BagDeliveryDetails';

function buildDocDefinition({ rows, companyName, companyLogo, fromDate, toDate, query }) {
  const data = applyRowFilters(rows, query);

  // Column groups — distinct CountType in first-seen order.
  const countTypes = [];
  for (const r of data) {
    const ct = str(r, 'CountType') || '-';
    if (!countTypes.includes(ct)) countTypes.push(ct);
  }

  // Row groups — distinct BillDate, sorted ascending (the RDLC groups by BillDate).
  const dateMap = new Map();
  for (const r of data) {
    const key = str(r, 'BillDate');
    if (!dateMap.has(key)) dateMap.set(key, []);
    dateMap.get(key).push(r);
  }
  const dateKeys = [...dateMap.keys()].sort((a, b) => new Date(a) - new Date(b));

  const headStyle = { bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 8 };
  const headers = ['Date', ...countTypes, 'Daily Delivery'];
  const widths = ['auto', ...countTypes.map(() => '*'), 90];
  const body = [headers.map((h) => ({ text: h, ...headStyle }))];

  // Sum of Qty for a given (date rows, countType).
  const sumQty = (list, ct) =>
    list.filter((r) => (str(r, 'CountType') || '-') === ct).reduce((a, r) => a + dec(r, 'Qty'), 0);

  const colTotals = countTypes.map(() => 0);
  let grand = 0;

  dateKeys.forEach((dk, i) => {
    const zebra = i % 2 === 1 ? colors.zebraFill : null;
    const list = dateMap.get(dk);
    const cells = [{ text: ddmmyyyy(dk), alignment: 'center', fontSize: 8, fillColor: zebra }];
    let rowTotal = 0;
    countTypes.forEach((ct, c) => {
      const v = sumQty(list, ct);
      colTotals[c] += v;
      rowTotal += v;
      cells.push({ text: v ? fmt(v, 0) : '', alignment: 'right', fontSize: 8, fillColor: zebra });
    });
    grand += rowTotal;
    cells.push({ text: fmt(rowTotal, 0), alignment: 'right', bold: true, fontSize: 8, fillColor: zebra });
    body.push(cells);
  });

  const gStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 8 };
  body.push([
    { text: 'Total', alignment: 'right', ...gStyle },
    ...colTotals.map((v) => ({ text: fmt(v, 0), alignment: 'right', ...gStyle })),
    { text: fmt(grand, 0), alignment: 'right', ...gStyle }
  ]);

  if (data.length === 0) {
    return buildPage({
      companyName, companyLogo, title: TITLE, fromDate, toDate,
      tables: [{ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] }]
    });
  }

  return buildPage({
    companyName, companyLogo, title: TITLE, fromDate, toDate,
    tables: [{ table: { headerRows: 1, dontBreakRows: true, widths, body }, layout: tableLayout() }]
  });
}

export const bagDeliveryReport = (req, res) =>
  runReport(req, res, { spName: 'sp_BagDelivery_GetAll', fileName: FILE_NAME, buildDocDefinition });
