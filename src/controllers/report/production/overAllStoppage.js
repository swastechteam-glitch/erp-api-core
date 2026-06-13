// Stoppage Abstract OverAll.
// Mirrors 03rptStoppageOverAll.rdlc — one section per department, each from its
// own stoppage SP, grouped by StoppageReason with shift-wise HRS/%/Kgs columns.
//
// Multi-SP report (runMultiReport). Each SP takes (CompanyCode, FromDate, ToDate).
// NOTE: the Spinning SP exposes today waste as TodayStopKGS1/2/3 while the others
// expose UptoStopKgs1/2/3 — kg() reads whichever is present.

import {
  runMultiReport, buildPage, tableLayout, colors,
  dec, str, fmt
} from '../cotton/_common.js';

const TITLE = 'STOPPAGE ABSTRACT REPORT';
const FILE_NAME = 'ProductionOverAll_Stoppage';

const headRow = (headers, fs = 7) =>
  headers.map((h) => ({
    text: h, bold: true, fillColor: colors.headerFill, color: colors.headerText,
    alignment: 'center', fontSize: fs
  }));
const td = (text, align = 'right', zebra = null, fs = 7) =>
  ({ text, alignment: align, fontSize: fs, fillColor: zebra });
const totalCell = (text, align = 'right') =>
  ({ text, alignment: align, bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: 7 });
const zebraOf = (i) => (i % 2 === 1 ? colors.zebraFill : null);

function section(title, widths, body) {
  return [
    { text: title, bold: true, fontSize: 9, color: colors.subText, fillColor: colors.subFill, margin: [0, 8, 0, 2] },
    { table: { headerRows: 1, dontBreakRows: false, keepWithHeaderRows: 1, widths, body }, layout: tableLayout() }
  ];
}

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}

// 17 columns: S.No, Description, Code, then I/II/III/On-Date (HRS,%,Kgs) + Upto (HRS,%).
const HEADERS = [
  'S.No', 'Description', 'Code',
  'I HRS', 'I %', 'I Kgs',
  'II HRS', 'II %', 'II Kgs',
  'III HRS', 'III %', 'III Kgs',
  'OD HRS', 'OD %', 'OD Kgs',
  'UD HRS', 'UD %'
];
const WIDTHS = [22, '*', 40, 34, 28, 34, 34, 28, 34, 34, 28, 34, 34, 28, 34, 34, 28];

// today waste kgs for shift n — Spinning uses TodayStopKGS, others UptoStopKgs.
const kg = (r, n) => dec(r, 'UptoStopKgs' + n) || dec(r, 'TodayStopKGS' + n);

function stoppageSection(rows, title) {
  const body = [headRow(HEADERS)];
  const groups = groupBy(rows, (r) => str(r, 'StoppageReasonCode') || str(r, 'StoppageReason'));
  let i = 0;
  const tot = { s1: 0, s2: 0, s3: 0, k1: 0, k2: 0, k3: 0, od: 0, ud: 0 };
  for (const list of groups.values()) {
    const z = zebraOf(i);
    const sum = (f) => list.reduce((a, r) => a + dec(r, f), 0);
    const avg = (f) => (list.length ? sum(f) / list.length : 0);
    const sumKg = (n) => list.reduce((a, r) => a + kg(r, n), 0);
    const s1 = sum('ToDayStop1'), s2 = sum('ToDayStop2'), s3 = sum('ToDayStop3');
    const k1 = sumKg(1), k2 = sumKg(2), k3 = sumKg(3);
    const od = sum('ToDayStop'), ud = sum('UptoDateStop');
    tot.s1 += s1; tot.s2 += s2; tot.s3 += s3; tot.k1 += k1; tot.k2 += k2; tot.k3 += k3; tot.od += od; tot.ud += ud;
    body.push([
      td(String(i + 1), 'center', z),
      td(str(list[0], 'StoppageReason'), 'left', z),
      td(str(list[0], 'ShortName'), 'center', z),
      td(fmt(s1, 2), 'right', z), td(fmt(avg('UtilPer1'), 2), 'right', z), td(fmt(k1, 2), 'right', z),
      td(fmt(s2, 2), 'right', z), td(fmt(avg('UtilPer2'), 2), 'right', z), td(fmt(k2, 2), 'right', z),
      td(fmt(s3, 2), 'right', z), td(fmt(avg('UtilPer3'), 2), 'right', z), td(fmt(k3, 2), 'right', z),
      td(fmt(od, 2), 'right', z), td(fmt(avg('TodayUtilPer'), 2), 'right', z), td(fmt(k1 + k2 + k3, 2), 'right', z),
      td(fmt(ud, 2), 'right', z), td(fmt(avg('UptoDateUtilPer'), 2), 'right', z)
    ]);
    i++;
  }
  body.push([
    { ...totalCell('Total', 'right'), colSpan: 3 }, {}, {},
    totalCell(fmt(tot.s1, 2)), totalCell(''), totalCell(fmt(tot.k1, 2)),
    totalCell(fmt(tot.s2, 2)), totalCell(''), totalCell(fmt(tot.k2, 2)),
    totalCell(fmt(tot.s3, 2)), totalCell(''), totalCell(fmt(tot.k3, 2)),
    totalCell(fmt(tot.od, 2)), totalCell(''), totalCell(fmt(tot.k1 + tot.k2 + tot.k3, 2)),
    totalCell(fmt(tot.ud, 2)), totalCell('')
  ]);
  return section(title, WIDTHS, body);
}

function buildDocDefinition({ data, companyName, companyLogo, fromDate, toDate }) {
  const d = data || {};
  const order = [
    ['carding', 'CARDING'],
    ['drawing', 'BREAKER DRAWING'],
    ['comber', 'COMBER'],
    ['finisherDrawing', 'FINISHER DRAWING'],
    ['unilap', 'UNILAP'],
    ['spinning', 'SPINNING'],
    ['simplex', 'SIMPLEX'],
    ['autoconer', 'AUTOCONER']
  ];
  const tables = [];
  for (const [key, label] of order) {
    if ((d[key] || []).length) for (const n of stoppageSection(d[key], label)) tables.push(n);
  }
  if (!tables.length) {
    tables.push({ text: 'No data for the selected period.', italics: true, margin: [0, 10, 0, 0] });
  }
  return buildPage({ companyName, companyLogo, title: TITLE, fromDate, toDate, tables });
}

export const overAllStoppageReport = (req, res) => {
  return runMultiReport(req, res, {
    fileName: FILE_NAME,
    buildDocDefinition,
    procs: [
      { key: 'carding', spName: 'sp_Prodn_Carding_Stoppage' },
      { key: 'drawing', spName: 'sp_Prodn_Drawing_Stoppage' },
      { key: 'comber', spName: 'sp_Prodn_Comber_Stoppage' },
      { key: 'finisherDrawing', spName: 'sp_Prodn_FinisherDrawing_Stoppage' },
      { key: 'unilap', spName: 'sp_Prodn_Unilap_Stoppage' },
      { key: 'spinning', spName: 'sp_Prodn_Spinning_Stoppage' },
      { key: 'simplex', spName: 'sp_Prodn_Simplex_Stoppage' },
      { key: 'autoconer', spName: 'sp_Prodn_Autoconer_Stoppage' }
    ]
  });
};
