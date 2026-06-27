// Mechanical — Machine Details report (port of WinForms rptMachineDetails.vb).
//
// ONE config-driven endpoint that reproduces the seven RDLC variants the legacy
// "Machine Report" screen offered, selected by the `groupBy` query param:
//
//   department       -> rptMachine_DepartmentWise.rdlc          (machine master, by Department)
//   maintenance-group-> rptMachine_MaintenanceGroupWise.rdlc    (machine master, by Maint. Group)
//   dept-detail      -> rptMachineDetails_DepartmentWise.rdlc   (service schedule, by Department)
//   group-detail     -> rptMachineDetails_MaintenanceGroupWise  (service schedule, by Maint. Group)
//   service-activity -> rptMachineDetails_ServiceActivity.rdlc  (service schedule, by Service)
//   machine          -> rptMachineDetailsReport.rdlc            (service schedule, by Machine)
//   history          -> rptMachineHistory.rdlc                  (sp_Machine_History, Dept -> Machine)
//
// Stored procedures (same as the VB form):
//   sp_MachineDetails_ServiceSchedule_GetAll  @CompanyCode          (all but history)
//   sp_Machine_History                        @FromDate,@ToDate,@CompanyCode
//
// Filters (Branch / Maintenance Group / Department / Machine Make / Machine) are
// applied in memory on the recordset, exactly like the WinForms DataTable.Select
// chain — each accepts a comma-separated list of codes.

import sql from "mssql";
import { getPool } from "../../../config/dynamicDB.js";
import {
  renderPdf, getCompanyInfo, readParams,
  buildPage, tableLayout, colors, dec, str, fmt, ddmmyyyy,
} from "../cotton/_common.js";

// ---- small helpers ---------------------------------------------------------
const groupBy = (rows, keyFn) => {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
};
const headRow = (columns) =>
  columns.map((c) => ({ text: c.header, bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: c.align || "center", fontSize: 8 }));
const groupRow = (label, span, color = colors.groupText, fill = colors.groupFill) =>
  [{ text: label, colSpan: span, bold: true, color, fillColor: fill, fontSize: 9, margin: [2, 2, 0, 2] }, ...Array(span - 1).fill({})];
const zebraOf = (i) => (i % 2 === 1 ? colors.zebraFill : null);
const cmpStr = (a, b) => String(a).localeCompare(String(b));

// Parse a comma-separated "1,2,3" filter param into a Set of ints (empty = no filter).
const codeSet = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const s = new Set(
    String(v).split(",").map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n))
  );
  return s.size ? s : null;
};

// Apply a filter only when the recordset actually carries that column — so a
// selected filter on a column the SP doesn't return won't wipe the whole report.
const applyFilter = (rows, field, set) => {
  if (!set || !rows.length || !(field in rows[0])) return rows;
  return rows.filter((r) => set.has(parseInt(r[field], 10)));
};

// Single-level grouped detail table (one table per group), S.No resets per group.
function buildGrouped({ rows, companyName, companyLogo, fromDate, toDate, title, columns, groupKey, groupLabel, sortGroups }) {
  const widths = columns.map((c) => c.width);
  const tables = [];
  const groups = groupBy(rows || [], groupKey);
  const keys = [...groups.keys()];
  if (sortGroups) keys.sort(sortGroups);

  for (const k of keys) {
    const list = groups.get(k);
    const body = [headRow(columns), groupRow(groupLabel(list[0]), columns.length)];
    list.forEach((r, i) => {
      const z = zebraOf(i);
      body.push(columns.map((c) => ({ text: c.value(r, i), alignment: c.align || "left", fontSize: 8, fillColor: z })));
    });
    tables.push({ table: { headerRows: 1, widths, body }, layout: tableLayout(), margin: [0, 0, 0, 8] });
  }
  if (!tables.length) tables.push({ text: "No data for the selected criteria.", italics: true, margin: [0, 10, 0, 0] });
  return buildPage({ companyName, companyLogo, title, fromDate, toDate, tables });
}

// ---- column sets -----------------------------------------------------------
const SNO = { header: "S.No", width: 30, align: "center", value: (r, i) => String(i + 1) };

// Machine master family (rptMachine_*). `groupCol` is the column that varies
// between the Department-wise and Maintenance-Group-wise layouts.
const machineMasterColumns = (groupCol) => [
  SNO,
  { header: "Machine", width: "*", value: (r) => str(r, "MachineName") },
  { header: "Machine Make", width: 70, value: (r) => str(r, "MachineMakeName") },
  { header: "Serial No", width: 65, value: (r) => str(r, "MachineSerialNo") },
  { header: "Model", width: 60, value: (r) => str(r, "MachineModel") },
  { header: "Manuf Year", width: 50, align: "center", value: (r) => str(r, "ManufactureYear") },
  { header: "Base Units", width: 50, align: "right", value: (r) => fmt(dec(r, "BaseUnit"), 2) },
  { header: "Std Units", width: 50, align: "right", value: (r) => fmt(dec(r, "StandardUnits"), 2) },
  groupCol === "department"
    ? { header: "Maintenance Group", width: 80, value: (r) => str(r, "MaintenanceGroupName") }
    : { header: "Department", width: 80, value: (r) => str(r, "DepartmentName_English") || str(r, "DepartmentName") },
  { header: "Spindles", width: 45, align: "center", value: (r) => str(r, "NoOfSpindles") },
  { header: "Company", width: 75, value: (r) => str(r, "CommissioningCompanyName") },
  { header: "Inst From", width: 55, align: "center", value: (r) => ddmmyyyy(r.DateOfInstallationFrom) },
  { header: "Inst To", width: 55, align: "center", value: (r) => ddmmyyyy(r.DateOfInstallationTo) },
  { header: "Commi", width: 55, align: "center", value: (r) => ddmmyyyy(r.DateOfCommissioning) },
  { header: "Sort", width: 35, align: "center", value: (r) => str(r, "MachineSortOrderNo") },
];

// Service schedule family (rptMachineDetails_*) — shared schedule detail columns.
const C_MACHINE = { header: "Machine", width: "*", value: (r) => str(r, "MachineName") };
const C_MAKE = { header: "Machine Make", width: 80, value: (r) => str(r, "MachineMakeName") };
const C_BRANCH = { header: "Branch", width: 80, value: (r) => str(r, "BranchName") };
const C_SERIAL = { header: "Serial No", width: 70, value: (r) => str(r, "MachineSerialNo") };
const C_MODEL = { header: "Model", width: 70, value: (r) => str(r, "MachineModel") };
const C_MCNO = { header: "Machine No", width: 70, value: (r) => str(r, "MachineNo") };
const C_GROUP = { header: "Maintenance Group", width: 90, value: (r) => str(r, "MaintenanceGroupName") };
const C_DEPT = { header: "Department", width: 90, value: (r) => str(r, "DepartmentName_English") || str(r, "DepartmentName") };
const C_SERVICE = { header: "Service Activity", width: "*", value: (r) => str(r, "ServiceActivityName") };
const C_DURATION = { header: "Duration Days", width: 55, align: "center", value: (r) => fmt(dec(r, "DurationDays"), 0) };
const C_LASTMAINT = { header: "Last Maint Date", width: 70, align: "center", value: (r) => ddmmyyyy(r.LastMaintenanceDate || r.LastMaintenceDate) };
const C_ADVANCE = { header: "Advance Days", width: 50, align: "center", value: (r) => fmt(dec(r, "AdvanceDays"), 0) };
const C_GRACE = { header: "Grace Days", width: 50, align: "center", value: (r) => fmt(dec(r, "GraceDays"), 0) };

// groupBy -> report definition (title + grouping + columns) for the schedule SP.
const SCHEDULE_VARIANTS = {
  department: {
    title: "MACHINE DEPARTMENT",
    columns: machineMasterColumns("department"),
    groupKey: (r) => r.DepartmentCode,
    groupLabel: (r) => str(r, "DepartmentName"),
    sortGroups: cmpStr,
  },
  "maintenance-group": {
    title: "MACHINE MAINTENANCE GROUP",
    columns: machineMasterColumns("maintenance-group"),
    groupKey: (r) => r.MaintenanceGroupCode,
    groupLabel: (r) => str(r, "MaintenanceGroupName"),
    sortGroups: cmpStr,
  },
  "dept-detail": {
    title: "MACHINE DETAILS - DEPARTMENT WISE",
    columns: [SNO, C_MACHINE, C_BRANCH, C_SERIAL, C_MODEL, C_GROUP, C_SERVICE, C_DURATION, C_LASTMAINT, C_ADVANCE, C_GRACE],
    groupKey: (r) => r.DepartmentCode,
    groupLabel: (r) => str(r, "DepartmentName_English") || str(r, "DepartmentName"),
    sortGroups: cmpStr,
  },
  "group-detail": {
    title: "MACHINE DETAILS - MAINTENANCE GROUP WISE",
    columns: [SNO, C_MACHINE, C_MAKE, C_SERIAL, C_MODEL, C_DEPT, C_SERVICE, C_DURATION, C_LASTMAINT, C_ADVANCE, C_GRACE],
    groupKey: (r) => r.MaintenanceGroupCode,
    groupLabel: (r) => str(r, "MaintenanceGroupName"),
    sortGroups: cmpStr,
  },
  "service-activity": {
    title: "MACHINE DETAILS - SERVICE ACTIVITY WISE",
    columns: [SNO, C_MACHINE, C_MAKE, C_MCNO, C_BRANCH, C_GROUP, C_DEPT, C_DURATION, C_LASTMAINT, C_ADVANCE, C_GRACE],
    groupKey: (r) => r.ServiceActivityCode,
    groupLabel: (r) => str(r, "ServiceActivityName"),
    sortGroups: cmpStr,
  },
  machine: {
    title: "MACHINE DETAILS",
    columns: [SNO, C_MAKE, C_SERIAL, C_MODEL, C_GROUP, C_DEPT, C_SERVICE, C_DURATION, C_LASTMAINT, C_ADVANCE, C_GRACE],
    groupKey: (r) => r.MachineCode,
    groupLabel: (r) => str(r, "MachineName"),
    sortGroups: cmpStr,
  },
};

// ---- Machine History (Dept -> Machine, sp_Machine_History) -----------------
function buildHistory({ rows, companyName, companyLogo, fromDate, toDate }) {
  const columns = [
    { header: "Work Date", width: 70, align: "center", value: (r) => ddmmyyyy(r.WorkOrderDate) },
    { header: "Activity / Break Down", width: "*", value: (r) => `${str(r, "ServiceActivityName")} ${str(r, "BreakDownName")}`.trim() },
    { header: "Duration", width: 55, align: "center", value: (r) => str(r, "Duration") },
    { header: "Next Service", width: 70, align: "center", value: (r) => ddmmyyyy(r.NextServiceDate) },
    { header: "Service By", width: 90, value: (r) => str(r, "ServiceBy") },
    { header: "Checked By", width: 90, value: (r) => str(r, "CheckedBy") },
    { header: "Item Name", width: "*", value: (r) => str(r, "ItemName") },
    { header: "Qty", width: 45, align: "right", value: (r) => fmt(dec(r, "Qty"), 2) },
  ];
  const widths = columns.map((c) => c.width);
  const span = columns.length;

  const tables = [];
  const byDept = groupBy(rows || [], (r) => str(r, "DepartmentCode") || str(r, "DepartmentName"));
  const deptKeys = [...byDept.keys()].sort(cmpStr);

  for (const dk of deptKeys) {
    const deptRows = byDept.get(dk);
    const body = [headRow(columns), groupRow(str(deptRows[0], "DepartmentName"), span, "#0000c0")];
    const byMachine = groupBy(deptRows, (r) => str(r, "MachineCode") || str(r, "MachineName"));
    const machineKeys = [...byMachine.keys()].sort(cmpStr);
    for (const mk of machineKeys) {
      const mRows = byMachine.get(mk);
      const head = mRows[0];
      const label = `Machine : ${str(head, "MachineName")}   Model : ${str(head, "MachineModel")}   Make : ${str(head, "MachineMakeName")}`;
      body.push(groupRow(label, span, "#8B0000", colors.subFill));
      mRows.forEach((r, i) => {
        const z = zebraOf(i);
        body.push(columns.map((c) => ({ text: c.value(r, i), alignment: c.align || "left", fontSize: 8, fillColor: z })));
      });
    }
    tables.push({ table: { headerRows: 1, widths, body }, layout: tableLayout(), margin: [0, 0, 0, 8] });
  }
  if (!tables.length) tables.push({ text: "No history for the selected period.", italics: true, margin: [0, 10, 0, 0] });
  return buildPage({ companyName, companyLogo, title: "MACHINE HISTORY", fromDate, toDate, tables });
}

// ===========================================================================
// GET /mechanical/reports/machine-details?groupBy=&CompanyCode=&FromDate=&ToDate=
//      &branchCode=&maintenanceGroupCode=&departmentCode=&machineMakeCode=&machineCode=
// ===========================================================================
export const machineDetailsReport = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type("text/plain").send("Missing subDBName header");

    const p = readParams(req);
    const groupByKey = String(req.query.groupBy || "machine");
    const pool = await getPool(subDbName);
    const company = await getCompanyInfo(pool, p.CompanyCode);

    let docDef;

    if (groupByKey === "history") {
      const r = pool.request();
      r.input("CompanyCode", sql.Int, parseInt(p.CompanyCode) || 0);
      r.input("FromDate", sql.DateTime, p.FromDate ? new Date(p.FromDate) : null);
      r.input("ToDate", sql.DateTime, p.ToDate ? new Date(p.ToDate) : null);
      const result = await r.execute("sp_Machine_History");
      let rows = result.recordset || [];
      // History carries Branch/Department/Machine codes, so the same filters apply.
      rows = applyFilter(rows, "BranchCode", codeSet(req.query.branchCode));
      rows = applyFilter(rows, "DepartmentCode", codeSet(req.query.departmentCode));
      rows = applyFilter(rows, "MachineCode", codeSet(req.query.machineCode));
      docDef = buildHistory({
        rows, companyName: company.name, companyLogo: company.logo, fromDate: p.FromDate, toDate: p.ToDate,
      });
    } else {
      const variant = SCHEDULE_VARIANTS[groupByKey] || SCHEDULE_VARIANTS.machine;
      const r = pool.request();
      r.input("CompanyCode", sql.Int, parseInt(p.CompanyCode) || 0);
      const result = await r.execute("sp_MachineDetails_ServiceSchedule_GetAll");
      let rows = result.recordset || [];
      // In-memory filter chain — mirrors the WinForms DataTable.Select filters.
      rows = applyFilter(rows, "BranchCode", codeSet(req.query.branchCode));
      rows = applyFilter(rows, "MaintenanceGroupCode", codeSet(req.query.maintenanceGroupCode));
      rows = applyFilter(rows, "DepartmentCode", codeSet(req.query.departmentCode));
      rows = applyFilter(rows, "MachineCode", codeSet(req.query.machineCode));
      rows = applyFilter(rows, "MachineMakeCode", codeSet(req.query.machineMakeCode));
      docDef = buildGrouped({
        rows, companyName: company.name, companyLogo: company.logo, fromDate: p.FromDate, toDate: p.ToDate,
        title: variant.title, columns: variant.columns, groupKey: variant.groupKey,
        groupLabel: variant.groupLabel, sortGroups: variant.sortGroups,
      });
    }

    const pdfBuffer = await renderPdf(docDef);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="MachineDetails_${groupByKey}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error("Report Error (machineDetailsReport):", err);
    res.status(500).type("text/plain").send("ERROR: " + err.message);
  }
};

// ===========================================================================
// GET /mechanical/reports/machine-details/options
// Filter dropdowns for the report screen (port of rptMachineDetails.Bind_Data).
// ===========================================================================
export const machineDetailsOptions = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type("text/plain").send("Missing subDBName header");
    const companyCode = parseInt(req.query.CompanyCode || req.headers.companycode) || 0;
    const pool = await getPool(subDbName);

    const [branches, maintenanceGroups, departments, machineMakes, machines] = await Promise.all([
      pool.request().input("CompanyCode", sql.Int, companyCode)
        .query("SELECT BranchCode AS value, BranchName AS label FROM tbl_Branch WHERE CompanyCode = @CompanyCode ORDER BY BranchName"),
      pool.request()
        .query("SELECT MaintenanceGroupCode AS value, MaintenanceGroupName AS label FROM tbl_MaintenanceGroup ORDER BY MaintenanceGroupName"),
      pool.request()
        .query("SELECT DepartmentCode AS value, DepartmentName AS label FROM tbl_Department ORDER BY DepartmentName"),
      pool.request()
        .query("SELECT MachineMakeCode AS value, MachineMakeName AS label FROM tbl_MachineMake ORDER BY MachineMakeName"),
      pool.request().input("CompanyCode", sql.Int, companyCode)
        .query("SELECT MachineCode AS value, MachineName AS label FROM tbl_Machine WHERE CompanyCode = @CompanyCode AND Status = 1 ORDER BY MachineName"),
    ]);

    res.json({
      success: true,
      data: {
        branches: branches.recordset,
        maintenanceGroups: maintenanceGroups.recordset,
        departments: departments.recordset,
        machineMakes: machineMakes.recordset,
        machines: machines.recordset,
      },
    });
  } catch (err) {
    console.error("Report Error (machineDetailsOptions):", err);
    res.status(500).type("text/plain").send("ERROR: " + err.message);
  }
};
