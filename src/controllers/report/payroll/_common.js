// Shared helpers + orchestrator for Payroll PDF reports.
//
// All Payroll "Master Report" listings are driven by sp_Employee_GetAll_Photo
// (same SP named in every .rdlc layout) plus sp_Company_GetAll for the page
// header. They are master/register listings (not date-ranged), so the title
// block intentionally omits the From/To date line that the production reports
// show.
//
// Visual style + low-level plumbing (renderPdf, table layout, palette, value
// coercion) are reused from the cotton report _common so every module looks
// consistent.

import sql from 'mssql';
import { getPool } from '../../../config/dynamicDB.js';
import { applyBranchCode } from '../../../utils/common.js';
import {
  renderPdf, getCompanyInfo, footerBlock, tableLayout, colors,
  dec, str, fmt, ddmmyyyy, buildTrendChart
} from '../cotton/_common.js';

export { sql, tableLayout, colors, dec, str, fmt, ddmmyyyy };

// Modern trend chart for payroll count summaries — groups rows, counts heads
// per group, and renders the shared multi-colour bar+line chart. Returns an
// unbreakable pdfmake node array (drop it between the summary and the detail).
export function countChart(rows, { groupBy, groupLabel, groupHeader = 'Group' }) {
  const groups = new Map();
  for (const r of rows || []) {
    const k = groupBy(r);
    if (k === null || k === undefined || k === '') continue;
    if (!groups.has(k)) groups.set(k, { label: groupLabel(r), count: 0 });
    groups.get(k).count += 1;
  }
  const groupSummaries = [...groups.values()]
    .sort((a, b) => String(a.label).localeCompare(String(b.label)))
    .map((g) => ({ label: g.label, totals: { count: g.count } }));
  return buildTrendChart(groupSummaries, [{ header: 'No. Of Employees', key: 'count', digits: 0 }], { groupHeader });
}

// Format a DateTime field as "hh:mm tt" using UTC parts (mssql returns the
// stored wall-clock time as a UTC Date, so UTC getters avoid a TZ shift).
export const hhmm = (d) => {
  if (d === null || d === undefined || d === '') return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  let h = dt.getUTCHours();
  const m = dt.getUTCMinutes();
  const ap = h < 12 ? 'AM' : 'PM';
  h = h % 12 || 12;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ap}`;
};

// Shared header-cell style for payroll tables.
export const headStyle = {
  bold: true, fillColor: colors.headerFill, color: colors.headerText,
  alignment: 'center', fontSize: 7.5
};

// Detect common image magic bytes and emit a data URI pdfmake can render.
// (cotton/_common keeps its own copy private, so we replicate the few lines.)
export function bufferToDataUri(buf) {
  if (!buf) return null;
  const b = Buffer.isBuffer(buf) ? buf : (buf?.data ? Buffer.from(buf.data) : null);
  if (!b || b.length < 4) return null;
  let mime = 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) mime = 'image/png';
  else if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) mime = 'image/gif';
  else if (b[0] === 0x42 && b[1] === 0x4D) mime = 'image/bmp';
  return `data:${mime};base64,${b.toString('base64')}`;
}

// Master/register title block — logo on the left, company name (brown) and
// report title (green) centered, with an empty spacer column so the title
// stays visually centered on the page. `dateRange` (optional) adds a bold
// "From : … To : …" line below the title for date-ranged reports.
export function employeeTitleBlock(companyName, title, logoDataUri, dateRange) {
  const LOGO_COL_WIDTH = 90;
  const logoCol = logoDataUri
    ? { image: logoDataUri, fit: [70, 70], width: LOGO_COL_WIDTH, alignment: 'left', margin: [4, 0, 0, 0] }
    : { text: '', width: LOGO_COL_WIDTH };
  const stack = [
    { text: companyName, alignment: 'center', fontSize: 15, bold: true, color: colors.companyColor, margin: [0, 0, 0, 4] },
    { text: title, alignment: 'center', fontSize: 11, bold: true, color: colors.titleColor }
  ];
  if (dateRange) stack.push({ text: dateRange, alignment: 'center', fontSize: 9.5, bold: true, margin: [0, 4, 0, 0] });
  const textCol = { width: '*', stack };
  const spacerCol = { text: '', width: LOGO_COL_WIDTH };
  return { columns: [logoCol, textCol, spacerCol], margin: [0, 0, 0, 10] };
}

// Build a page-level pdfmake doc skeleton for an employee report. When
// `fromDate`/`toDate` are supplied a date-range line is added to the header.
export function buildEmployeePage({ companyName, companyLogo, title, orientation = 'landscape', tables, fromDate, toDate }) {
  const dateRange = (fromDate || toDate)
    ? `From : ${ddmmyyyy(fromDate)}   To : ${ddmmyyyy(toDate)}`
    : null;
  return {
    pageSize: 'A4',
    pageOrientation: orientation,
    pageMargins: [15, 20, 15, 45],
    footer: (currentPage, pageCount) => footerBlock(currentPage, pageCount),
    content: [employeeTitleBlock(companyName, title, companyLogo, dateRange), ...tables],
    defaultStyle: { font: 'Roboto', fontSize: 8, lineHeight: 1.2 }
  };
}

// ---------------------------------------------------------------------------
// Table builders
// `cols` is an array of { header, width, align?, value:(row) => string }.
// ---------------------------------------------------------------------------

// Flat (un-grouped) table with a continuous S.No column.
export function flatTable(cols, rows, { showSerial = true } = {}) {
  const widths = (showSerial ? [24] : []).concat(cols.map((c) => c.width));
  const header = (showSerial ? [{ text: 'S.No', ...headStyle }] : [])
    .concat(cols.map((c) => ({ text: c.header, ...headStyle })));
  const body = [header];

  rows.forEach((r, i) => {
    const zebra = i % 2 === 1 ? colors.zebraFill : null;
    const cells = (showSerial
      ? [{ text: String(i + 1), alignment: 'center', fontSize: 7.5, fillColor: zebra }]
      : []
    ).concat(cols.map((c) => ({
      text: c.value(r), alignment: c.align || 'left', fontSize: 7.5, fillColor: zebra
    })));
    body.push(cells);
  });

  return { table: { headerRows: 1, dontBreakRows: true, widths, body }, layout: tableLayout() };
}

// Grouped table — a group header row (spanning all columns) before each group,
// optional "Total <count>" footer row per group. S.No is continuous across
// the whole table to match RowNumber("table1") in the .rdlc files.
export function groupedTable(cols, rows, { groupBy, groupLabel, groupFooter = false, sortRows, serialPerGroup = false } = {}) {
  const span = cols.length + 1;
  const widths = [24, ...cols.map((c) => c.width)];
  const header = [{ text: 'S.No', ...headStyle }, ...cols.map((c) => ({ text: c.header, ...headStyle }))];
  const body = [header];

  const groups = new Map();
  for (const r of rows) {
    const k = groupBy(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }

  const blanks = (n) => Array(n).fill({});
  let globalSerial = 0;

  for (const grp of groups.values()) {
    if (sortRows) grp.sort(sortRows);
    body.push([
      { text: groupLabel(grp[0], grp), colSpan: span, fillColor: colors.groupFill, color: colors.groupText, bold: true, fontSize: 8, alignment: 'left' },
      ...blanks(span - 1)
    ]);
    let groupSerial = 0;
    for (const r of grp) {
      const n = serialPerGroup ? ++groupSerial : ++globalSerial;
      const zebra = n % 2 === 0 ? colors.zebraFill : null;
      body.push([
        { text: String(n), alignment: 'center', fontSize: 7.5, fillColor: zebra },
        ...cols.map((c) => ({ text: c.value(r), alignment: c.align || 'left', fontSize: 7.5, fillColor: zebra }))
      ]);
    }
    if (groupFooter) {
      body.push([
        { text: `Total   ${grp.length}`, colSpan: span, alignment: 'right', bold: true, fontSize: 8, color: colors.subText, fillColor: colors.subFill },
        ...blanks(span - 1)
      ]);
    }
  }

  return { table: { headerRows: 1, widths, body }, layout: tableLayout() };
}

// Cross-tab / abstract matrix — rows × columns with a count in each cell, plus
// a TOTAL column and a TOTAL row. Mirrors the matrix-based *Abstract.rdlc files.
export function buildMatrix(rows, { rowKeyFn, rowLabelFn, colKeyFn, colLabelFn, cornerText }) {
  const rowMap = new Map();
  const colMap = new Map();
  const counts = new Map();

  for (const r of rows) {
    const rk = rowKeyFn(r);
    const ck = colKeyFn(r);
    if (rk === null || rk === undefined || rk === '') continue;
    if (!rowMap.has(rk)) rowMap.set(rk, rowLabelFn(r));
    if (!colMap.has(ck)) colMap.set(ck, colLabelFn(r));
    const key = `${rk}|${ck}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const colKeys = [...colMap.keys()].sort((a, b) => String(colMap.get(a)).localeCompare(String(colMap.get(b))));
  const rowKeys = [...rowMap.keys()].sort((a, b) => String(rowMap.get(a)).localeCompare(String(rowMap.get(b))));

  const header = [
    { text: cornerText, ...headStyle, alignment: 'left' },
    ...colKeys.map((ck) => ({ text: colMap.get(ck), ...headStyle })),
    { text: 'TOTAL', ...headStyle }
  ];
  const body = [header];

  const colTotals = colKeys.map(() => 0);
  let grand = 0;

  rowKeys.forEach((rk, i) => {
    const zebra = i % 2 === 1 ? colors.zebraFill : null;
    let rowTot = 0;
    const cells = [{ text: rowMap.get(rk), alignment: 'left', bold: true, fontSize: 7.5, fillColor: zebra }];
    colKeys.forEach((ck, ci) => {
      const n = counts.get(`${rk}|${ck}`) || 0;
      rowTot += n;
      colTotals[ci] += n;
      cells.push({ text: n ? String(n) : '', alignment: 'center', fontSize: 7.5, fillColor: zebra });
    });
    grand += rowTot;
    cells.push({ text: String(rowTot), alignment: 'center', bold: true, fontSize: 7.5, fillColor: zebra });
    body.push(cells);
  });

  body.push([
    { text: 'TOTAL', bold: true, fontSize: 8, fillColor: colors.subFill, color: colors.subText },
    ...colTotals.map((n) => ({ text: String(n), alignment: 'center', bold: true, fontSize: 8, fillColor: colors.subFill, color: colors.subText })),
    { text: String(grand), alignment: 'center', bold: true, fontSize: 8, fillColor: colors.grandFill, color: colors.grandText }
  ]);

  const widths = ['*', ...colKeys.map(() => 42), 46];
  return { table: { headerRows: 1, widths, body }, layout: tableLayout() };
}

// Group head-count summary — S.No, <groupHeader>, NO. OF EMPLOYEES, with a
// TOTAL footer row. `compact` shrinks columns/fonts so several summaries can sit
// side-by-side in a columns row (used by the combined Join & Left report).
export function countSummaryTable(rows, { groupBy, groupLabel, groupHeader, compact = false }) {
  const groups = new Map();
  for (const r of rows) {
    const k = groupBy(r);
    if (k === null || k === undefined) continue;
    if (!groups.has(k)) groups.set(k, { label: groupLabel(r), count: 0 });
    groups.get(k).count += 1;
  }
  const list = [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));

  const hSize = compact ? 7 : 8.5;
  const cSize = compact ? 7 : 8;
  const header = ['S.No', groupHeader, 'No. Of Emp.'].map((t) => ({ text: t, ...headStyle, fontSize: hSize }));
  const body = [header];

  let total = 0;
  list.forEach((g, i) => {
    const zebra = i % 2 === 1 ? colors.zebraFill : null;
    total += g.count;
    body.push([
      { text: String(i + 1), alignment: 'center', fontSize: cSize, fillColor: zebra },
      { text: g.label, alignment: 'left', fontSize: cSize, fillColor: zebra },
      { text: String(g.count), alignment: 'center', fontSize: cSize, fillColor: zebra }
    ]);
  });

  const g = { bold: true, color: colors.grandText, fillColor: colors.grandFill, fontSize: compact ? 8 : 9 };
  body.push([
    { text: 'TOTAL', colSpan: 2, alignment: 'right', ...g }, {},
    { text: String(total), alignment: 'center', ...g }
  ]);

  const widths = compact ? [20, '*', 34] : [40, '*', 130];
  return { table: { headerRows: 1, widths, body }, layout: tableLayout() };
}

// A titled count-summary block for the side-by-side combined report. Returns a
// pdfmake column node: a section title (e.g. "NEW JOIN") above a compact table.
export function countSummaryColumn(rows, { groupBy, groupLabel, groupHeader, sectionTitle }) {
  return {
    width: '*',
    margin: [2, 0, 2, 0],
    stack: [
      { text: sectionTitle, bold: true, alignment: 'center', fontSize: 9, color: colors.headerText, fillColor: colors.headerFill, margin: [0, 0, 0, 0] },
      countSummaryTable(rows, { groupBy, groupLabel, groupHeader, compact: true })
    ]
  };
}

// ---------------------------------------------------------------------------
// Employee Master filter chain (rptEmployeeMaster.vb parity).
// The legacy WinForms screen pulls every employee from sp_Employee_GetAll_Photo
// once, then narrows the DataTable in memory with a stack of .Select() calls —
// one per combo. We reproduce that here so the same filter set works for ALL
// master reports without changing the SP. Every filter is OPTIONAL: a query
// param that's absent/empty leaves the rows untouched, so the reports that send
// none of these params behave exactly as before.
// ---------------------------------------------------------------------------

// Split a comma-separated code list ("1,4,9") into a Set of trimmed strings, or
// null when nothing was passed (→ "all", skip the filter). Values compare as
// strings so 3 / "3" / "03" line up regardless of the source shape.
function codeSet(v) {
  if (v == null) return null;
  const arr = String(v)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
  return arr.length ? new Set(arr) : null;
}

export function applyEmployeeFilters(rows, query = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return rows || [];
  const keep = (val, set) => set == null || set.has(String(val));

  const branch = codeSet(query.BranchCode);
  const empGroup = codeSet(query.EmpGroupCode);
  const category = codeSet(query.EmpCategoryCode);
  const department = codeSet(query.DepartmentCode);
  const designation = codeSet(query.DesignationCode);
  const employee = codeSet(query.EmployeeCode);
  const grade = codeSet(query.GradeCode);
  const batch = codeSet(query.EmployeeBatchCode);
  const hostel = codeSet(query.HostelTypeCode);
  const agent = codeSet(query.AgentCode);
  const bank = codeSet(query.BankCode);
  const gender = codeSet(query.SexCode);

  // Mess Allow. — YES = "1", NO = "0". Selecting both (or neither) = all.
  const mess = codeSet(query.messAllow);
  const messYes = mess && mess.has('1') && !mess.has('0');
  const messNo = mess && mess.has('0') && !mess.has('1');

  // PF / Non PF — the WinForms rule: PF = (PF > 0 AND PFNo is set).
  const pf = String(query.pfNonPf || '').toUpperCase();

  // Leave Status — matches the `Status` column (ACTIVE / ON LEAVE / RELEAVE).
  const leave = codeSet(String(query.leaveStatus || '').toUpperCase());

  // DOJ range — only applied when BOTH ends are present (checkbox-gated in VB).
  const dojFrom = query.dojFrom ? new Date(query.dojFrom) : null;
  const dojTo = query.dojTo ? new Date(query.dojTo) : null;
  const dojValid = dojFrom && dojTo && !isNaN(dojFrom) && !isNaN(dojTo);

  // Age band — only when both > 0 (the VB guard: Age >= above AND <= below).
  const ageAbove = query.ageAbove != null && query.ageAbove !== '' ? parseInt(query.ageAbove) : null;
  const ageBelow = query.ageBelow != null && query.ageBelow !== '' ? parseInt(query.ageBelow) : null;
  const ageValid = ageAbove > 0 && ageBelow > 0;

  const hasPf = (r) => Number(r.PF) > 0 && r.PFNo != null && String(r.PFNo).trim() !== '';

  return rows.filter((r) => {
    if (!keep(r.BranchCode, branch)) return false;
    if (!keep(r.EmpGroupCode, empGroup)) return false;
    if (!keep(r.EmpCategoryCode, category)) return false;
    if (!keep(r.DepartmentCode, department)) return false;
    if (!keep(r.DesignationCode, designation)) return false;
    if (!keep(r.EmployeeCode, employee)) return false;
    if (!keep(r.GradeCode, grade)) return false;
    if (!keep(r.EmployeeBatchCode, batch)) return false;
    if (!keep(r.HostelTypeCode, hostel)) return false;
    if (!keep(r.AgentCode, agent)) return false;
    if (!keep(r.BankCode, bank)) return false;
    if (!keep(r.SexCode, gender)) return false;

    const messOn = r.MessAllowance === true || r.MessAllowance === 1;
    if (messYes && !messOn) return false;
    if (messNo && messOn) return false;

    if (pf === 'PF' && !hasPf(r)) return false;
    if (pf === 'NONPF' && hasPf(r)) return false;

    if (leave && !leave.has(String(r.Status ?? '').toUpperCase())) return false;

    if (dojValid) {
      const doj = r.DateOfJoining ? new Date(r.DateOfJoining) : null;
      if (!doj || isNaN(doj) || doj < dojFrom || doj > dojTo) return false;
    }
    if (ageValid) {
      const age = parseInt(r.Age);
      if (isNaN(age) || age < ageAbove || age > ageBelow) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Orchestrator — every payroll master report calls this.
// Runs sp_Employee_GetAll_Photo with the same param shape the rest of the app
// uses (branch/company via applyBranchCode + EmployeeCode; 0 = all employees),
// then hands the rows to buildDocDefinition.
// ---------------------------------------------------------------------------
export async function runEmployeeReport(req, res, { fileName, buildDocDefinition, spName = 'sp_Employee_GetAll_Photo' }) {
  const t0 = Date.now();
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) {
      return res.status(400).type('text/plain').send('Missing subDBName header');
    }

    const debug = req.query.debug === '1';
    const companyCode = req.query.CompanyCode || req.query.companyCode || req.headers.companycode || '0';
    const pool = await getPool(subDbName);

    const spReq = pool.request();
    applyBranchCode(spReq, req.headers);                       // BranchCode or CompanyCode
    // spReq.input('EmployeeCode', sql.Int, parseInt(req.query.EmployeeCode) || 0); // 0 => all
    if (req.query.empStatus != null) {
      const v = (req.query.empStatus === 'true' || req.query.empStatus === '1') ? 1 : 0;
      spReq.input('Emp_Status', sql.Bit, v);
    }

    const spResult = await spReq.execute(spName);
    // Employee Master screen filters (Branch/Dept/Grade/Agent/Mess/PF/DOJ/Age…).
    // No-op for the other reports, which send none of these params.
    const rows = applyEmployeeFilters(spResult.recordset || [], req.query);
    const company = await getCompanyInfo(pool, companyCode);

    const docDef = buildDocDefinition({
      rows,
      companyName: company.name,
      companyLogo: company.logo,
      query: req.query
    });
    const pdfBuffer = await renderPdf(docDef);

    if (debug) {
      const dbCfg = pool.config || {};
      const sample = rows.slice(0, 3).map((r, i) => `  [${i}] ` + JSON.stringify(r).slice(0, 240)).join('\n');
      return res.type('text/plain').send(
        [
          `SP:           ${spName}`,
          `subDBName:    ${subDbName}`,
          `server:       ${dbCfg.server}${dbCfg.port ? ':' + dbCfg.port : ''}`,
          `database:     ${dbCfg.database}`,
          `company:      ${company.name || '(none)'}`,
          `EmployeeCode: ${parseInt(req.query.EmployeeCode) || 0}`,
          `rows:         ${rows.length}`,
          `Total:        ${Date.now() - t0} ms (${pdfBuffer.length} pdf bytes)`,
          sample ? `\nfirst rows:\n${sample}` : ''
        ].join('\n')
      );
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
}

// ---------------------------------------------------------------------------
// Generic date-ranged employee report orchestrator. Runs `spName` with
// branch/company (applyBranchCode) + FromDate/ToDate, applies the Employee
// Master filter chain (Department / Designation / Employee / Batch / … — a no-op
// when their params are absent), then hands the rows to buildDocDefinition.
// Used by reports whose SP takes @FromDate/@ToDate/@CompanyCode with the same
// filterable row shape (e.g. sp_DesignationChange_GetAll). FromDate/ToDate
// default to today and are passed through for the header.
// ---------------------------------------------------------------------------
export async function runDateRangeEmployeeReport(req, res, { fileName, buildDocDefinition, spName }) {
  const t0 = Date.now();
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) {
      return res.status(400).type('text/plain').send('Missing subDBName header');
    }

    const debug = req.query.debug === '1';
    const companyCode = req.query.CompanyCode || req.query.companyCode || req.headers.companycode || '0';
    const today = new Date().toISOString().slice(0, 10);
    const fromDate = req.query.FromDate || req.query.fromDate || today;
    const toDate = req.query.ToDate || req.query.toDate || today;
    const pool = await getPool(subDbName);

    const spReq = pool.request();
    applyBranchCode(spReq, req.headers);                       // BranchCode or CompanyCode
    spReq.input('FromDate', sql.DateTime, new Date(fromDate));
    spReq.input('ToDate', sql.DateTime, new Date(toDate));

    const spResult = await spReq.execute(spName);
    const rows = applyEmployeeFilters(spResult.recordset || [], req.query);
    const company = await getCompanyInfo(pool, companyCode);

    const docDef = buildDocDefinition({
      rows,
      companyName: company.name,
      companyLogo: company.logo,
      fromDate,
      toDate,
      query: req.query
    });
    const pdfBuffer = await renderPdf(docDef);

    if (debug) {
      const dbCfg = pool.config || {};
      const sample = rows.slice(0, 3).map((r, i) => `  [${i}] ` + JSON.stringify(r).slice(0, 240)).join('\n');
      return res.type('text/plain').send(
        [
          `SP:           ${spName}`,
          `subDBName:    ${subDbName}`,
          `server:       ${dbCfg.server}${dbCfg.port ? ':' + dbCfg.port : ''}`,
          `database:     ${dbCfg.database}`,
          `company:      ${company.name || '(none)'}`,
          `FromDate:     ${fromDate}`,
          `ToDate:       ${toDate}`,
          `rows:         ${rows.length}`,
          `Total:        ${Date.now() - t0} ms (${pdfBuffer.length} pdf bytes)`,
          sample ? `\nfirst rows:\n${sample}` : ''
        ].join('\n')
      );
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
}

// ---------------------------------------------------------------------------
// Orchestrator for the Attendance reports — runs sp_Employee_Attendance (or a
// variant SP) with branch/company + FromDate/ToDate + Attn (report-mode code)
// + Emp_Status. `Attn` selects the attendance sub-report on the SP side; pass a
// per-report default and allow `?attn=` to override. FromDate/ToDate default to
// today and are passed back for the header.
// ---------------------------------------------------------------------------
export async function runAttendanceReport(req, res, { fileName, buildDocDefinition, spName = 'sp_Employee_Attendance', defaultAttn = null }) {
  const t0 = Date.now();
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) {
      return res.status(400).type('text/plain').send('Missing subDBName header');
    }

    const debug = req.query.debug === '1';
    const companyCode = req.query.CompanyCode || req.query.companyCode || req.headers.companycode || '0';
    const today = new Date().toISOString().slice(0, 10);
    const fromDate = req.query.FromDate || req.query.fromDate || today;
    const toDate = req.query.ToDate || req.query.toDate || today;
    const attn = req.query.attn != null ? parseInt(req.query.attn) : defaultAttn;
    const empStatus = (req.query.empStatus === 'false' || req.query.empStatus === '0') ? 0 : 1;
    const pool = await getPool(subDbName);

    const spReq = pool.request();
    applyBranchCode(spReq, req.headers);
    spReq.input('FromDate', sql.DateTime, new Date(fromDate));
    spReq.input('ToDate', sql.DateTime, new Date(toDate));
    if (attn != null && !isNaN(attn)) spReq.input('Attn', sql.Int, attn);
    spReq.input('Emp_Status', sql.Bit, empStatus);

    const spResult = await spReq.execute(spName);
    const rows = spResult.recordset || [];
    const company = await getCompanyInfo(pool, companyCode);

    const docDef = buildDocDefinition({
      rows,
      companyName: company.name,
      companyLogo: company.logo,
      fromDate,
      toDate,
      query: req.query
    });
    const pdfBuffer = await renderPdf(docDef);

    if (debug) {
      const dbCfg = pool.config || {};
      const sample = rows.slice(0, 3).map((r, i) => `  [${i}] ` + JSON.stringify(r).slice(0, 260)).join('\n');
      return res.type('text/plain').send(
        [
          `SP:           ${spName}`,
          `subDBName:    ${subDbName}`,
          `server:       ${dbCfg.server}${dbCfg.port ? ':' + dbCfg.port : ''}`,
          `database:     ${dbCfg.database}`,
          `company:      ${company.name || '(none)'}`,
          `FromDate:     ${fromDate}`,
          `ToDate:       ${toDate}`,
          `Attn:         ${attn == null || isNaN(attn) ? '(not sent)' : attn}`,
          `Emp_Status:   ${empStatus}`,
          `rows:         ${rows.length}`,
          `Total:        ${Date.now() - t0} ms (${pdfBuffer.length} pdf bytes)`,
          sample ? `\nfirst rows:\n${sample}` : ''
        ].join('\n')
      );
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
}

// ---------------------------------------------------------------------------
// Multi-SP orchestrator — for combined reports that stitch several date-ranged
// employee SPs into one document (e.g. New Joining & Left). `procs` is an array
// of { key, spName }. Each runs with branch/company + FromDate/ToDate (+ optional
// Emp_Status); a failing SP yields [] for that key so the rest still render.
// Results reach buildDocDefinition as { data: { [key]: rows }, fromDate, toDate }.
// ---------------------------------------------------------------------------
export async function runMultiEmployeeReport(req, res, { fileName, procs, buildDocDefinition }) {
  const t0 = Date.now();
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) {
      return res.status(400).type('text/plain').send('Missing subDBName header');
    }

    const debug = req.query.debug === '1';
    const companyCode = req.query.CompanyCode || req.query.companyCode || req.headers.companycode || '0';
    const today = new Date().toISOString().slice(0, 10);
    const fromDate = req.query.FromDate || req.query.fromDate || today;
    const toDate = req.query.ToDate || req.query.toDate || today;
    const empStatus = req.query.empStatus != null
      ? ((req.query.empStatus === 'true' || req.query.empStatus === '1') ? 1 : 0)
      : null;
    const pool = await getPool(subDbName);

    const data = {};
    const errors = {};
    for (const proc of procs) {
      try {
        const spReq = pool.request();
        applyBranchCode(spReq, req.headers);
        spReq.input('FromDate', sql.DateTime, new Date(fromDate));
        spReq.input('ToDate', sql.DateTime, new Date(toDate));
        if (empStatus != null) spReq.input('Emp_Status', sql.Bit, empStatus);
        const spResult = await spReq.execute(proc.spName);
        data[proc.key] = spResult.recordset || [];
      } catch (e) {
        data[proc.key] = [];
        errors[proc.key] = e.message;
        console.error(`runMultiEmployeeReport: ${proc.spName} failed -`, e.message);
      }
    }

    const company = await getCompanyInfo(pool, companyCode);
    const docDef = buildDocDefinition({
      data,
      companyName: company.name,
      companyLogo: company.logo,
      fromDate,
      toDate,
      query: req.query
    });
    const pdfBuffer = await renderPdf(docDef);

    if (debug) {
      const dbCfg = pool.config || {};
      const counts = procs
        .map((p) => `  ${p.key.padEnd(10)} ${p.spName.padEnd(26)} rows=${(data[p.key] || []).length}${errors[p.key] ? '  ERR: ' + errors[p.key] : ''}`)
        .join('\n');
      return res.type('text/plain').send(
        [
          `MultiReport:  ${fileName}`,
          `subDBName:    ${subDbName}`,
          `server:       ${dbCfg.server}${dbCfg.port ? ':' + dbCfg.port : ''}`,
          `database:     ${dbCfg.database}`,
          `company:      ${company.name || '(none)'}`,
          `FromDate:     ${fromDate}`,
          `ToDate:       ${toDate}`,
          `procs:\n${counts}`,
          `Total:        ${Date.now() - t0} ms (${pdfBuffer.length} pdf bytes)`
        ].join('\n')
      );
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
}

// ---------------------------------------------------------------------------
// Orchestrator for the New Joining reports — runs sp_Employee_NewJoining with
// branch/company + FromDate/ToDate (+ optional Emp_Status). FromDate/ToDate
// default to today and are passed back to buildDocDefinition for the header.
// ---------------------------------------------------------------------------
export async function runNewJoiningReport(req, res, { fileName, buildDocDefinition, spName = 'sp_Employee_NewJoining' }) {
  const t0 = Date.now();
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) {
      return res.status(400).type('text/plain').send('Missing subDBName header');
    }

    const debug = req.query.debug === '1';
    const companyCode = req.query.CompanyCode || req.query.companyCode || req.headers.companycode || '0';
    const today = new Date().toISOString().slice(0, 10);
    const fromDate = req.query.FromDate || req.query.fromDate || today;
    const toDate = req.query.ToDate || req.query.toDate || today;
    const pool = await getPool(subDbName);

    const spReq = pool.request();
    applyBranchCode(spReq, req.headers);                       // BranchCode or CompanyCode
    spReq.input('FromDate', sql.DateTime, new Date(fromDate));
    spReq.input('ToDate', sql.DateTime, new Date(toDate));
    if (req.query.empStatus != null) {
      const v = (req.query.empStatus === 'true' || req.query.empStatus === '1') ? 1 : 0;
      spReq.input('Emp_Status', sql.Bit, v);
    }

    const spResult = await spReq.execute(spName);
    const rows = spResult.recordset || [];
    const company = await getCompanyInfo(pool, companyCode);

    const docDef = buildDocDefinition({
      rows,
      companyName: company.name,
      companyLogo: company.logo,
      fromDate,
      toDate,
      query: req.query
    });
    const pdfBuffer = await renderPdf(docDef);

    if (debug) {
      const dbCfg = pool.config || {};
      const sample = rows.slice(0, 3).map((r, i) => `  [${i}] ` + JSON.stringify(r).slice(0, 240)).join('\n');
      return res.type('text/plain').send(
        [
          `SP:           ${spName}`,
          `subDBName:    ${subDbName}`,
          `server:       ${dbCfg.server}${dbCfg.port ? ':' + dbCfg.port : ''}`,
          `database:     ${dbCfg.database}`,
          `company:      ${company.name || '(none)'}`,
          `FromDate:     ${fromDate}`,
          `ToDate:       ${toDate}`,
          `rows:         ${rows.length}`,
          `Total:        ${Date.now() - t0} ms (${pdfBuffer.length} pdf bytes)`,
          sample ? `\nfirst rows:\n${sample}` : ''
        ].join('\n')
      );
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
}
