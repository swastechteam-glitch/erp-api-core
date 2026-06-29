// Electrical — Electrical Check List (port of rptElectricalCheckList.vb).
// The WinForms screen had a Department multi-select + a list of three report
// templates (Check List / RSB Check List / SPG UKG Check List) + View. Only the
// main "Check List" template binds data (sp_Electrical_Schedule @CompanyCode);
// the other two are STATIC printable blank forms that carry only the company
// header (rptRSBCheckList.rdlc / rptElectricalUKG_Spinning.rdlc).
//
//   • Check List  — rptElecticalCheckList.rdlc: per Department, a matrix of
//                   ServiceActivity (rows) × Machine (columns) with blank cells
//                   to tick. Filtered by the Department combo (DepartmentCode IN).
//   • RSB         — rptRSBCheckList.rdlc: "CALIBRATION FORMAT FOR RSB DRAWING"
//                   blank B-90 / B-50 / Speed-Test calibration tables.
//   • SPG UKG     — rptElectricalUKG_Spinning.rdlc: blank "SPINING MACHINE UKG"
//                   monthly grid (M/c No × days 1-31).
//
// sp_Electrical_Schedule takes ONLY @CompanyCode (no FromDate/ToDate), so every
// handler overrides spParams to pass CompanyCode alone. The reports have no date
// range — the React screen runs with noDateRange. Reuses the cotton/_common PDF
// pipeline (logo + footer) but draws its own header (no date line).

import {
  runReport, tableLayout, colors, str, footerBlock, sql
} from '../cotton/_common.js';
import { getPool } from '../../../config/dynamicDB.js';

// sp_Electrical_Schedule accepts ONLY @CompanyCode (the VB passed just that).
const scheduleParams = (p) => ({
  CompanyCode: { type: sql.Int, value: parseInt(p.CompanyCode) || 0 }
});

// ---- functional Department filter (port of the WinForms DataTable.Select) ----
// The VB narrowed the recordset by `DepartmentCode IN (cmbDepartment codes)`.
// The recordset carries DepartmentCode, so we filter client-side (camelCase
// query param, comma-separated codes), exactly like the sibling reports.
const codeSet = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const s = new Set(String(v).split(',').map((x) => x.trim()).filter((x) => x.length));
  return s.size ? s : null;
};
const filterByDepartment = (rows, query = {}) => {
  const set = codeSet(query.departmentCode);
  if (!set || !rows.length || !('DepartmentCode' in rows[0])) return rows || [];
  return rows.filter((r) => set.has(String(r.DepartmentCode)));
};

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

const headCell = (t, fontSize = 8) => ({
  text: t, bold: true, fillColor: colors.headerFill, color: colors.headerText,
  alignment: 'center', fontSize
});

// Page skeleton — logo + company (brown) + report title (green), NO date line
// (these reports have no period). Footer reused from the shared pipeline.
function pageDoc({ companyName, companyLogo, title, tables, orientation = 'landscape' }) {
  const LOGO = 90;
  const header = {
    columns: [
      companyLogo
        ? { image: companyLogo, fit: [78, 78], width: LOGO, alignment: 'left', margin: [4, 0, 0, 0] }
        : { text: '', width: LOGO },
      {
        width: '*',
        stack: [
          { text: companyName, alignment: 'center', fontSize: 16, bold: true, color: colors.companyColor, margin: [0, 0, 0, 6] },
          { text: title, alignment: 'center', fontSize: 12, bold: true, color: colors.titleColor }
        ]
      },
      { text: '', width: LOGO }
    ],
    margin: [0, 0, 0, 10]
  };
  return {
    pageSize: 'A4',
    pageOrientation: orientation,
    pageMargins: [15, 20, 15, 45],
    footer: (currentPage, pageCount) => footerBlock(currentPage, pageCount),
    content: [header, ...tables],
    defaultStyle: { font: 'Roboto', fontSize: 8, lineHeight: 1.25 }
  };
}

// ---------------------------------------------------------------------------
// Check List — per Department, ServiceActivity (rows) × Machine (columns).
// ---------------------------------------------------------------------------
const MAX_MACHINE_COLS = 10; // keep cells legible in A4 landscape

function deptBar(name) {
  return {
    table: { widths: ['*'], body: [[{ text: name, bold: true, fontSize: 11, color: colors.groupText, fillColor: colors.groupFill, margin: [6, 4, 6, 4] }]] },
    layout: 'noBorders',
    margin: [0, 10, 0, 2]
  };
}

function matrixTable(activities, machines) {
  const header = [headCell('SERVICE ACTIVITY'), ...machines.map((m) => headCell(m.name, 7))];
  const body = [header];
  activities.forEach((a, i) => {
    const z = i % 2 === 1 ? colors.zebraFill : null;
    body.push([
      { text: a.name, fontSize: 8, fillColor: z },
      ...machines.map(() => ({ text: '', fillColor: z }))
    ]);
  });
  return {
    table: { headerRows: 1, widths: [150, ...machines.map(() => '*')], body },
    layout: tableLayout(),
    margin: [0, 0, 0, 6]
  };
}

export const electricalCheckList = (req, res) => runReport(req, res, {
  spName: 'sp_Electrical_Schedule',
  fileName: 'ElectricalCheckList',
  spParams: scheduleParams,
  buildDocDefinition: ({ rows, companyName, companyLogo, query }) => {
    const list = filterByDepartment(rows, query);
    const tables = [];

    // Group rows by Department, preserving first-seen order (sorted by name).
    const depts = new Map(); // code -> { name, rows }
    for (const r of list) {
      const code = str(r, 'DepartmentCode');
      if (!depts.has(code)) depts.set(code, { name: str(r, 'DepartmentName'), rows: [] });
      depts.get(code).rows.push(r);
    }
    const ordered = [...depts.values()].sort((a, b) => a.name.localeCompare(b.name));

    if (ordered.length === 0) {
      tables.push({ text: 'No electrical schedule found for the selected department(s).', italics: true, fontSize: 10, color: '#888', margin: [0, 20, 0, 0] });
    }

    for (const dept of ordered) {
      const machineMap = new Map();
      const actMap = new Map();
      for (const r of dept.rows) {
        machineMap.set(str(r, 'MachineCode'), str(r, 'MachineName'));
        actMap.set(str(r, 'ServiceActivityCode'), str(r, 'ServiceActivityName'));
      }
      const machines = [...machineMap.entries()].map(([code, name]) => ({ code, name }))
        .sort((a, b) => a.name.localeCompare(b.name));
      const activities = [...actMap.entries()].map(([code, name]) => ({ code, name }))
        .sort((a, b) => a.name.localeCompare(b.name));

      tables.push(deptBar(dept.name || '(Department)'));
      if (machines.length === 0 || activities.length === 0) {
        tables.push({ text: 'No machines / activities for this department.', italics: true, fontSize: 8, color: '#888', margin: [4, 0, 0, 6] });
        continue;
      }
      // Split wide machine lists across multiple tables so cells stay legible.
      chunk(machines, MAX_MACHINE_COLS).forEach((block) => tables.push(matrixTable(activities, block)));
    }

    return pageDoc({ companyName, companyLogo, title: 'ELECTRICAL CHECK LIST', tables });
  }
});

// ---------------------------------------------------------------------------
// RSB Check List — static "CALIBRATION FORMAT FOR RSB DRAWING" blank form.
// ---------------------------------------------------------------------------
function calibTable(rows) {
  const header = ['Gauge in mm', 'Before volts', 'After volts', 'Tolerance +/-', 'Nominal'].map((h) => headCell(h));
  const body = [header];
  for (const r of rows) {
    body.push([
      { text: r.gauge, alignment: 'center', fontSize: 9 },
      { text: '' }, // Before volts — blank to fill
      { text: '' }, // After volts — blank to fill
      { text: r.tol, alignment: 'center', fontSize: 9 },
      { text: r.nominal, alignment: 'center', fontSize: 9 }
    ]);
  }
  return { table: { headerRows: 1, widths: ['*', '*', '*', '*', '*'], body }, layout: tableLayout(), margin: [0, 4, 0, 10] };
}

const SECTION = (t) => ({ text: t, bold: true, fontSize: 10, margin: [0, 6, 0, 2] });
const NOTE = (t) => ({ text: t, fontSize: 9, margin: [0, 2, 0, 2] });

export const rsbCheckList = (req, res) => runReport(req, res, {
  spName: 'sp_Electrical_Schedule',
  fileName: 'RSB_CheckList',
  spParams: scheduleParams,
  buildDocDefinition: ({ companyName, companyLogo }) => {
    const b90 = [
      { gauge: '3', tol: '0.02 V', nominal: '3.3' },
      { gauge: '4', tol: '0.04 V', nominal: '5' },
      { gauge: '5', tol: '0.02 V', nominal: '6.7' },
      { gauge: '6', tol: '0.02 V', nominal: '8.4' }
    ];
    const b50 = [
      { gauge: '3', tol: '0.02 V', nominal: '3.3' },
      { gauge: '4', tol: '0.04 V', nominal: '5' },
      { gauge: '5', tol: '0.02 V', nominal: '6.7' },
      { gauge: '6', tol: '0.02 V', nominal: '8.4' }
    ];
    const speedHeader = ['Gauge in mm', 'N a RPM', 'N b RPM', 'CAL RPM', 'Tolerance +/-'].map((h) => headCell(h));
    const speedBody = [speedHeader,
      [{ text: '3', alignment: 'center', fontSize: 9 }, { text: '' }, { text: '' }, { text: '' }, { text: '0 RPM', alignment: 'center', fontSize: 9 }],
      [{ text: '4', alignment: 'center', fontSize: 9 }, { text: '' }, { text: '' }, { text: '' }, { text: '10 RPM', alignment: 'center', fontSize: 9 }],
      [{ text: '5', alignment: 'center', fontSize: 9 }, { text: '' }, { text: '' }, { text: '' }, { text: '10 RPM', alignment: 'center', fontSize: 9 }]
    ];
    const speedTable = { table: { headerRows: 1, widths: ['*', '*', '*', '*', '*'], body: speedBody }, layout: tableLayout(), margin: [0, 4, 0, 10] };

    const signOff = {
      columns: [
        { text: 'Calibrated By', bold: true, alignment: 'center' },
        { text: 'Checked By', bold: true, alignment: 'center' },
        { text: 'Approved By', bold: true, alignment: 'center' }
      ],
      margin: [0, 40, 0, 0]
    };

    const tables = [
      { text: 'TUNE AC GAIN = MAIN MOTOR VOLT = 2V', bold: true, fontSize: 11, margin: [0, 4, 0, 8] },
      SECTION('B-90 CALIBRATION'), calibTable(b90),
      SECTION('B-50 CALIBRATION'), calibTable(b50),
      SECTION('SPEED TEST'), NOTE('L1 = 10, CP = 330, AW = 500'), NOTE('M/C. RUN AT 500 MPM'), speedTable,
      signOff
    ];
    return pageDoc({ companyName, companyLogo, title: 'CALIBRATION FORMAT FOR RSB DRAWING', tables, orientation: 'portrait' });
  }
});

// ---------------------------------------------------------------------------
// SPG UKG Check List — static blank "SPINING MACHINE UKG" monthly grid.
// ---------------------------------------------------------------------------
const UKG_MACHINE_ROWS = 34;
const UKG_FOOTER_LABELS = ['AVG', 'units', 'speed', 'Ne Avg'];

function ukgGrid(dayFrom, dayTo) {
  const days = [];
  for (let d = dayFrom; d <= dayTo; d++) days.push(String(d));
  const header = [headCell('M/c No', 7), headCell('Count', 7), ...days.map((d) => headCell(d, 7))];
  const body = [header];
  const blanks = () => days.map(() => ({ text: '' }));
  for (let m = 1; m <= UKG_MACHINE_ROWS; m++) {
    const z = m % 2 === 0 ? colors.zebraFill : null;
    body.push([
      { text: String(m), alignment: 'center', fontSize: 7, fillColor: z },
      { text: '', fillColor: z },
      ...days.map(() => ({ text: '', fillColor: z }))
    ]);
  }
  for (const lbl of UKG_FOOTER_LABELS) {
    body.push([
      { text: lbl, alignment: 'center', bold: true, fontSize: 7, fillColor: colors.subFill, color: colors.subText },
      { text: '', fillColor: colors.subFill },
      ...blanks().map(() => ({ text: '', fillColor: colors.subFill }))
    ]);
  }
  return {
    table: { headerRows: 1, widths: [38, 40, ...days.map(() => '*')], body },
    layout: tableLayout(),
    margin: [0, 4, 0, 8]
  };
}

export const spgUkgCheckList = (req, res) => runReport(req, res, {
  spName: 'sp_Electrical_Schedule',
  fileName: 'SPG_UKG_CheckList',
  spParams: scheduleParams,
  buildDocDefinition: ({ companyName, companyLogo }) => {
    // 31 day columns won't fit one A4 landscape row → split into two grids.
    const grid1 = ukgGrid(1, 16);
    const grid2 = ukgGrid(17, 31);
    grid2.table.dontBreakRows = true;
    const tables = [grid1, { ...grid2, pageBreak: 'before' }];
    return pageDoc({ companyName, companyLogo, title: 'SPINING MACHINE UKG', tables });
  }
});

// ---------------------------------------------------------------------------
// GET /electrical/reports/electrical-check-list/options — Department dropdown.
// Mirrors the WinForms Bind_Data: departments that have active machines.
// ---------------------------------------------------------------------------
export const electricalCheckListOptions = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type('text/plain').send('Missing subDBName header');
    const pool = await getPool(subDbName);
    const departments = await pool.request().query(
      'SELECT DepartmentCode AS value, DepartmentName AS label FROM tbl_Department ' +
      'WHERE DepartmentCode IN (SELECT DepartmentCode FROM tbl_Machine WHERE status = 1) ' +
      'ORDER BY DepartmentName'
    );
    res.json({ success: true, data: { departments: departments.recordset } });
  } catch (err) {
    console.error('Report Error (electricalCheckListOptions):', err);
    res.status(500).type('text/plain').send('ERROR: ' + err.message);
  }
};
