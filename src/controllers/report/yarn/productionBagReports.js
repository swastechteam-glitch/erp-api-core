// reports/yarn/productionBagReports.js
// The Yarn Production report variants NOT covered by productionReport.js:
//   bagNoAbstract : sp_Production_Abstract               (per Count -> bag-no lists + bag counts)
//   countAbstract : sp_BagProductionDetails_GetByRefDate (matrix: Date x Count -> bags + weight)
//   bagNoWise     : sp_YarnProduction_GetAll             (per Date -> per-bag detail rows)
//
// Each exports { buildDocDefinition(rows, companyName, fromDate, toDate, companyLogo) }.
// Mirrors rptProductionAbstractNew.rdlc / rptProductionCountWise1.rdlc /
// rptProductionBagNoWise.rdlc. Same visual language as productionReport.js.

const dec = (row, col) => {
  const v = row[col];
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};
const str = (row, col) => {
  const v = row[col];
  return v === null || v === undefined ? '' : String(v);
};
const fmt = (n, digits = 2) =>
  Number(n).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const intFmt = (n) =>
  Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const ddmmyyyy = (d) => {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
};
const isoDate = (d) => {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '0000-00-00';
  return dt.toISOString().slice(0, 10);
};

const COLORS = {
  headerFill: '#1A3C7B', headerText: '#FFFFFF', groupFill: '#E8F0FE', groupText: '#1A3C7B',
  zebraFill: '#FAFBFD', subFill: '#EEF2F7', subText: '#1A3C7B', grandFill: '#1A3C7B',
  grandText: '#FFFFFF', borderColor: '#D7DCE3',
};

const baseLayout = {
  hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0.4),
  vLineWidth: () => 0.4,
  hLineColor: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? COLORS.headerFill : COLORS.borderColor),
  vLineColor: () => COLORS.borderColor,
  paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 4, paddingBottom: () => 4,
};

const baseFooter = (currentPage, pageCount) => ({
  margin: [0, 12, 0, 0],
  columns: [
    { text: 'Developed by Swas Technologies, Report Printed : ' + new Date().toLocaleString('en-GB'), fontSize: 7, margin: [15, 0, 0, 0] },
    { text: `Page ${currentPage} of ${pageCount}`, alignment: 'right', fontSize: 7, margin: [0, 0, 15, 0] },
  ],
});

const titleBlock = (companyName, title, dateLine, logoDataUri) => {
  const W = 90;
  const logoCol = logoDataUri
    ? { image: logoDataUri, fit: [80, 80], width: W, alignment: 'left', margin: [4, 0, 0, 0] }
    : { text: '', width: W };
  return {
    columns: [
      logoCol,
      {
        width: '*',
        stack: [
          { text: companyName, alignment: 'center', fontSize: 16, bold: true, color: '#7B3F00', margin: [0, 0, 0, 6] },
          { text: title, alignment: 'center', fontSize: 12, bold: true, color: '#008000', margin: [0, 0, 0, 6] },
          { text: dateLine, alignment: 'center', fontSize: 10, bold: true },
        ],
      },
      { text: '', width: W },
    ],
    margin: [0, 0, 0, 10],
  };
};

const headerCells = (headers, fs = 8) =>
  headers.map((h) => ({ text: h, bold: true, fillColor: COLORS.headerFill, color: COLORS.headerText, alignment: 'center', fontSize: fs }));

const docShell = (title, dateLine, companyName, logo, widths, body, orientation = 'portrait', fs = 8) => ({
  pageSize: 'A4',
  pageOrientation: orientation,
  pageMargins: [20, 20, 20, 40],
  footer: baseFooter,
  content: [
    titleBlock(companyName, title, dateLine, logo),
    { table: { headerRows: 1, dontBreakRows: true, keepWithHeaderRows: 0, widths, body }, layout: baseLayout },
  ],
  defaultStyle: { font: 'Roboto', fontSize: fs, lineHeight: 1.2 },
});

// ============================================================================
// BAG NO ABSTRACT — sp_Production_Abstract (per Count short name -> bag-no list)
// ============================================================================
export const bagNoAbstract = {
  buildDocDefinition(rows, companyName, fromDate, toDate, companyLogo) {
    const dateLine = `From Date : ${ddmmyyyy(fromDate)}    To Date : ${ddmmyyyy(toDate)}`;
    const widths = [40, '*', 90];
    const body = [headerCells(['S.No', 'Bag No', 'Bag Count'])];

    const map = new Map();
    for (const r of rows || []) {
      const k = str(r, 'ShortName') || str(r, 'CountType') || '(Unknown)';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    }
    const keys = [...map.keys()].sort((a, b) => a.localeCompare(b));

    let grand = 0;
    for (const k of keys) {
      const grp = map.get(k);
      body.push([{ text: k, colSpan: 3, bold: true, color: COLORS.groupText, fillColor: COLORS.groupFill, fontSize: 9, margin: [2, 2, 0, 2] }, {}, {}]);
      let sno = 1, sub = 0;
      for (const r of grp) {
        const bc = dec(r, 'BagCount');
        const zebra = sno % 2 === 0 ? COLORS.zebraFill : null;
        body.push([
          { text: String(sno), alignment: 'center', fontSize: 8, fillColor: zebra },
          { text: str(r, 'BagNo'), alignment: 'left', fontSize: 8, fillColor: zebra },
          { text: intFmt(bc), alignment: 'right', fontSize: 8, fillColor: zebra },
        ]);
        sub += bc; sno++;
      }
      body.push([
        { text: 'Total', colSpan: 2, alignment: 'right', bold: true, color: COLORS.subText, fillColor: COLORS.subFill, fontSize: 8 },
        {},
        { text: intFmt(sub), alignment: 'right', bold: true, color: COLORS.subText, fillColor: COLORS.subFill, fontSize: 8 },
      ]);
      grand += sub;
    }
    if (!keys.length) body.push([{ text: 'No records found', colSpan: 3, alignment: 'center', italics: true, fontSize: 9, margin: [0, 6, 0, 6] }, {}, {}]);
    else body.push([
      { text: 'Grand Total', colSpan: 2, alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: 9 },
      {},
      { text: intFmt(grand), alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: 9 },
    ]);

    return docShell('YARN PRODUCTION - ABSTRACT', dateLine, companyName, companyLogo, widths, body);
  },
};

// ============================================================================
// BAG NO WISE — sp_YarnProduction_GetAll (per Production Date -> per-bag detail)
// ============================================================================
export const bagNoWise = {
  buildDocDefinition(rows, companyName, fromDate, toDate, companyLogo) {
    const dateLine = `From Date : ${ddmmyyyy(fromDate)}    To Date : ${ddmmyyyy(toDate)}`;
    const widths = [34, 55, '*', 64, 64, 64, 60];
    const body = [headerCells(['S.No', 'Bag No', 'Lot No', 'Gross Wt', 'Tare Wt', 'Net Wt', 'Wt Diff'])];

    const map = new Map();
    for (const r of rows || []) {
      const k = isoDate(r.ProductionDate);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    }
    const keys = [...map.keys()].sort((a, b) => a.localeCompare(b));

    const G = { bags: 0, g: 0, t: 0, n: 0, d: 0 };
    const numCell = (v, zebra) => ({ text: fmt(v, 3), alignment: 'right', fontSize: 8, fillColor: zebra });
    for (const k of keys) {
      const grp = map.get(k).slice().sort((a, b) => dec(a, 'BagNo') - dec(b, 'BagNo'));
      body.push([{ text: 'Date : ' + ddmmyyyy(grp[0].ProductionDate), colSpan: 7, bold: true, color: COLORS.groupText, fillColor: COLORS.groupFill, fontSize: 9, margin: [2, 2, 0, 2] }, {}, {}, {}, {}, {}, {}]);
      let sno = 1; const S = { g: 0, t: 0, n: 0, d: 0 };
      for (const r of grp) {
        const zebra = sno % 2 === 0 ? COLORS.zebraFill : null;
        const g = dec(r, 'GrossWeight'), t = dec(r, 'TareWeight'), n = dec(r, 'NetWeight'), d = dec(r, 'WeightDiff');
        body.push([
          { text: String(sno), alignment: 'center', fontSize: 8, fillColor: zebra },
          { text: str(r, 'BagNo'), alignment: 'center', fontSize: 8, fillColor: zebra },
          { text: str(r, 'LotNo'), alignment: 'left', fontSize: 8, fillColor: zebra },
          numCell(g, zebra), numCell(t, zebra), numCell(n, zebra), numCell(d, zebra),
        ]);
        S.g += g; S.t += t; S.n += n; S.d += d; sno++;
      }
      const subCell = (v) => ({ text: fmt(v, 3), alignment: 'right', bold: true, color: COLORS.subText, fillColor: COLORS.subFill, fontSize: 8 });
      body.push([
        { text: `Total (${grp.length} Bags)`, colSpan: 3, alignment: 'right', bold: true, color: COLORS.subText, fillColor: COLORS.subFill, fontSize: 8 },
        {}, {}, subCell(S.g), subCell(S.t), subCell(S.n), subCell(S.d),
      ]);
      G.bags += grp.length; G.g += S.g; G.t += S.t; G.n += S.n; G.d += S.d;
    }
    if (!keys.length) body.push([{ text: 'No records found', colSpan: 7, alignment: 'center', italics: true, fontSize: 9, margin: [0, 6, 0, 6] }, {}, {}, {}, {}, {}, {}]);
    else {
      const gCell = (v) => ({ text: fmt(v, 3), alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: 8 });
      body.push([
        { text: `Grand Total (${G.bags} Bags)`, colSpan: 3, alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: 8 },
        {}, {}, gCell(G.g), gCell(G.t), gCell(G.n), gCell(G.d),
      ]);
    }

    return docShell('YARN PRODUCTION - BAG NO WISE', dateLine, companyName, companyLogo, widths, body);
  },
};

// ============================================================================
// COUNT ABSTRACT — sp_BagProductionDetails_GetByRefDate (matrix Date x Count)
// ============================================================================
export const countAbstract = {
  buildDocDefinition(rows, companyName, fromDate, toDate, companyLogo) {
    const dateLine = `From Date : ${ddmmyyyy(fromDate)}    To Date : ${ddmmyyyy(toDate)}`;
    const countKey = (r) => str(r, 'ShortName') || str(r, 'CountType') || '(Unknown)';
    const counts = [...new Set((rows || []).map(countKey))].sort((a, b) => a.localeCompare(b));

    const dateMap = new Map();
    for (const r of rows || []) {
      const k = isoDate(r.ProductionDate);
      if (!dateMap.has(k)) dateMap.set(k, []);
      dateMap.get(k).push(r);
    }
    const dates = [...dateMap.keys()].sort((a, b) => a.localeCompare(b));

    const fs = 7;
    const headers = ['Date'];
    const widths = [70];
    for (const c of counts) { headers.push(`${c} Bags`, `${c} Wt`); widths.push(42, 52); }
    const body = [headerCells(headers, fs)];

    const totals = {};
    counts.forEach((c) => (totals[c] = { bags: 0, wt: 0 }));

    for (const d of dates) {
      const grp = dateMap.get(d);
      const zebra = body.length % 2 === 0 ? COLORS.zebraFill : null;
      const row = [{ text: ddmmyyyy(grp[0].ProductionDate), fontSize: fs, fillColor: zebra }];
      for (const c of counts) {
        const cg = grp.filter((r) => countKey(r) === c);
        const bags = cg.length;
        const wt = cg.reduce((s, r) => s + dec(r, 'GrossWeight'), 0);
        totals[c].bags += bags; totals[c].wt += wt;
        row.push(
          { text: bags ? intFmt(bags) : '', alignment: 'right', fontSize: fs, fillColor: zebra },
          { text: wt ? fmt(wt, 2) : '', alignment: 'right', fontSize: fs, fillColor: zebra },
        );
      }
      body.push(row);
    }
    if (!dates.length) {
      body.push([{ text: 'No records found', colSpan: Math.max(1, headers.length), alignment: 'center', italics: true, fontSize: 9, margin: [0, 6, 0, 6] }, ...new Array(Math.max(0, headers.length - 1)).fill({})]);
    } else {
      const totalRow = [{ text: 'Total', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: fs }];
      for (const c of counts) {
        totalRow.push(
          { text: intFmt(totals[c].bags), alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: fs },
          { text: fmt(totals[c].wt, 2), alignment: 'right', bold: true, color: COLORS.grandText, fillColor: COLORS.grandFill, fontSize: fs },
        );
      }
      body.push(totalRow);
    }

    return docShell('YARN PRODUCTION - COUNT ABSTRACT', dateLine, companyName, companyLogo, widths, body, 'landscape', fs);
  },
};

export default { bagNoAbstract, bagNoWise, countAbstract };
