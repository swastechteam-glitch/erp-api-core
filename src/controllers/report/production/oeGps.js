// OE GPS reports — Machine Wise and Count Wise.
// Mirrors rptOE_MachineWiseGPS.rdlc / rptOE_CountWiseGPS.rdlc —
// production + average actual GPS, grouped by machine or by count.
//
// SP: sp_Prodn_OE_GPS (CompanyCode, FromDate, ToDate)

import {
  runReport, buildPage, tableLayout, colors,
  dec, str, fmt, chartFromRows
} from '../cotton/_common.js';

const WIDTHS = ['*', 110, 110];

// Build a GPS doc grouped by `keyField` (display via `labelField`).
function buildGpsDoc({ rows, companyName, companyLogo, fromDate, toDate }, { title, keyField, labelField, groupHeader }) {
  const body = [];
  const headStyle = { bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: 'center', fontSize: 9 };
  body.push([groupHeader, 'Prodn', 'Actual GPS'].map((h) => ({ text: h, ...headStyle })));

  const groups = new Map();
  for (const r of rows) {
    const key = str(r, keyField) || str(r, labelField);
    const g = groups.get(key) || { label: str(r, labelField) || key, prodn: 0, gpsSum: 0, n: 0 };
    g.prodn += dec(r, 'Prodn');
    g.gpsSum += dec(r, 'ActualGPS');
    g.n += 1;
    groups.set(key, g);
  }
  const list = [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));

  let sProdn = 0, sGps = 0, n = 0;
  let rowIdx = 0;
  for (const g of list) {
    const zebra = rowIdx % 2 === 1 ? colors.zebraFill : null;
    const cell = (text, align = 'right') => ({ text, alignment: align, fontSize: 8, fillColor: zebra });
    const avgGps = g.n > 0 ? g.gpsSum / g.n : 0;
    sProdn += g.prodn; sGps += avgGps; n++;
    body.push([
      cell(g.label, 'left'),
      cell(fmt(g.prodn, 2)),
      cell(fmt(avgGps, 2)),
    ]);
    rowIdx++;
  }

  const gStyle = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 9 };
  body.push([
    { text: 'Total', alignment: 'right', ...gStyle },
    { text: fmt(sProdn, 2), alignment: 'right', ...gStyle },
    { text: fmt(n > 0 ? sGps / n : 0, 2), alignment: 'right', ...gStyle },
  ]);

  if (rows.length === 0) {
    return buildPage({ companyName, companyLogo, title, fromDate, toDate,
      tables: [{ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] }] });
  }

  const chart = chartFromRows(rows, {
    groupKey: (r) => str(r, keyField) || str(r, labelField),
    groupLabel: (r) => str(r, labelField),
    valueFn: (r) => dec(r, 'Prodn'), valueHeader: 'Prodn',
    groupHeader, digits: 2,
  });

  return buildPage({
    companyName, companyLogo, title, fromDate, toDate,
    tables: [...chart, { table: { headerRows: 1, dontBreakRows: true, widths: WIDTHS, body }, layout: tableLayout() }],
  });
}

export const oeMachineWiseGpsReport = (req, res) =>
  runReport(req, res, {
    spName: 'sp_Prodn_OE_GPS',
    fileName: 'OEProduction_MachineWiseGPS',
    buildDocDefinition: (ctx) => buildGpsDoc(ctx, {
      title: 'MACHINE WISE OE GPS',
      keyField: 'MachineCode', labelField: 'MachineName', groupHeader: 'Machine Name',
    }),
  });

export const oeCountWiseGpsReport = (req, res) =>
  runReport(req, res, {
    spName: 'sp_Prodn_OE_GPS',
    fileName: 'OEProduction_CountWiseGPS',
    buildDocDefinition: (ctx) => buildGpsDoc(ctx, {
      title: 'COUNT WISE OE GPS',
      keyField: 'CountNameCode', labelField: 'CountName', groupHeader: 'Count Name',
    }),
  });
