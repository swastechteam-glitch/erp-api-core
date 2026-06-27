// Mechanical — Machine Details Doc Print (port of WinForms rptMachineDocumentPrint.vb).
//
// Master-detail screen, NOT a date-range report:
//   • a grid of machines (sp_Machine_GetAll) with Branch / Department / Machine
//     filters, and
//   • a per-machine printable document (rptMachinePrint.rdlc) generated when the
//     user clicks "View" on a row.
//
// Endpoints:
//   GET /machine-doc-print/options                 -> filter dropdowns
//   GET /machine-doc-print/machines?branchCode&departmentCode&machineCode
//                                                  -> grid rows (filtered in memory)
//   GET /machine-doc-print?machineCode=&serviceType=&CompanyCode=
//                                                  -> single-machine PDF document
//
// Stored procedures (same as the VB form):
//   sp_Machine_GetAll                          @CompanyCode | @MachineCode
//   sp_MachineDetails_ServiceSchedule_GetAll   @MachineCode,@ServiceType
//   sp_Company_GetAll                          @CompanyCode

import sql from "mssql";
import { getPool } from "../../../config/dynamicDB.js";
import {
  renderPdf, getCompanyInfo, readParams,
  tableLayout, colors, dec, str, fmt, ddmmyyyy,
} from "../cotton/_common.js";

const codeSet = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const s = new Set(String(v).split(",").map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n)));
  return s.size ? s : null;
};
const applyFilter = (rows, field, set) => {
  if (!set || !rows.length || !(field in rows[0])) return rows;
  return rows.filter((r) => set.has(parseInt(r[field], 10)));
};

// ---- single-machine document (rptMachinePrint.rdlc) ------------------------
function buildDocument({ machine, schedule, companyName, companyLogo }) {
  const m = machine || {};
  const maintGroup = schedule.length ? str(schedule[0], "MaintenanceGroupName") : "";

  // Two side-by-side label/value panels of the machine master fields.
  const kv = (label, value) => [
    { text: label, fontSize: 8, color: "#555", margin: [0, 1, 0, 1] },
    { text: ":", fontSize: 8, alignment: "center" },
    { text: value || "", fontSize: 8, bold: true, margin: [0, 1, 0, 1] },
  ];
  const panel = (rows) => ({
    width: "*",
    table: { widths: [95, 6, "*"], body: rows },
    layout: "noBorders",
  });

  const leftPanel = panel([
    kv("Machine Name", str(m, "MachineName")),
    kv("Machine No", str(m, "MachineNo")),
    kv("Machine Make", str(m, "MachineMakeName")),
    kv("Machine Serial No", str(m, "MachineSerialNo")),
    kv("Machine Model", str(m, "MachineModel")),
    kv("Manufacture Year", str(m, "ManufactureYear")),
    kv("Base Units", fmt(dec(m, "BaseUnit"), 2)),
    kv("Standard Units", fmt(dec(m, "StandardUnits"), 2)),
    kv("Maintenance Group", maintGroup),
    kv("Department", str(m, "DepartmentName_English") || str(m, "DepartmentName")),
  ]);
  const rightPanel = panel([
    kv("Company Name", str(m, "CommissioningCompanyName")),
    kv("Errector Name", str(m, "ErrectorName")),
    kv("Address", str(m, "Address")),
    kv("Contact No", str(m, "ContactNo")),
    kv("Date Of Installation From", ddmmyyyy(m.DateOfInstallationFrom)),
    kv("Date Of Installation To", ddmmyyyy(m.DateOfInstallationTo)),
    kv("Date Of Comission", ddmmyyyy(m.DateOfCommissioning)),
    kv("Mill Machine No", str(m, "MachineSortOrderNo")),
    kv("Branch", str(m, "BranchName")),
    kv("No Of Spindles", str(m, "NoOfSpindles")),
  ]);

  // Service activity schedule table.
  const head = (t) => ({ text: t, bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: "center", fontSize: 8 });
  const body = [[head("S.No"), head("Service Activity"), head("Duration Days"), head("Advance Days"), head("Grace Days")]];
  const sorted = (schedule || []).slice().sort((a, b) => str(a, "ServiceActivityName").localeCompare(str(b, "ServiceActivityName")));
  sorted.forEach((r, i) => {
    const z = i % 2 === 1 ? colors.zebraFill : null;
    body.push([
      { text: String(i + 1), alignment: "center", fontSize: 8, fillColor: z },
      { text: str(r, "ServiceActivityName"), alignment: "left", fontSize: 8, fillColor: z },
      { text: fmt(dec(r, "DurationDays"), 0), alignment: "center", fontSize: 8, fillColor: z },
      { text: fmt(dec(r, "AdvanceDays"), 0), alignment: "center", fontSize: 8, fillColor: z },
      { text: fmt(dec(r, "GraceDays"), 0), alignment: "center", fontSize: 8, fillColor: z },
    ]);
  });
  if (!sorted.length) body.push([{ text: "No service activity scheduled.", colSpan: 5, italics: true, fontSize: 8 }, {}, {}, {}, {}]);

  const logoCol = companyLogo
    ? { image: companyLogo, fit: [70, 70], width: 80, margin: [4, 0, 0, 0] }
    : { text: "", width: 80 };

  return {
    pageSize: "A4",
    pageOrientation: "portrait",
    pageMargins: [25, 18, 25, 40],
    content: [
      {
        columns: [
          logoCol,
          {
            width: "*",
            stack: [
              { text: companyName, alignment: "center", fontSize: 14, bold: true, color: "#0000c0" },
              { text: "MACHINE DETAILS", alignment: "center", fontSize: 13, bold: true, color: colors.companyColor, margin: [0, 2, 0, 2] },
            ],
          },
          { text: "", width: 80 },
        ],
      },
      { canvas: [{ type: "line", x1: 0, y1: 4, x2: 545, y2: 4, lineWidth: 0.8, lineColor: colors.borderColor }], margin: [0, 4, 0, 8] },
      { columns: [leftPanel, { width: 16, text: "" }, rightPanel], columnGap: 0, margin: [0, 0, 0, 12] },
      { table: { headerRows: 1, widths: [35, "*", 70, 70, 70], body }, layout: tableLayout() },
      {
        margin: [0, 30, 0, 0],
        columns: [
          { text: "Dept Incharge", alignment: "center", fontSize: 9, bold: true },
          { text: "Maint Manager", alignment: "center", fontSize: 9, bold: true },
          { text: "Factory Manager", alignment: "center", fontSize: 9, bold: true },
          { text: "General Manager", alignment: "center", fontSize: 9, bold: true },
        ],
      },
    ],
    footer: (currentPage, pageCount) => ({
      margin: [25, 8, 25, 0],
      columns: [
        { text: "Developed by Swas Technologies , Report Printed : " + new Date().toLocaleString("en-GB"), fontSize: 7 },
        { text: `${currentPage}/${pageCount}`, alignment: "right", fontSize: 7, color: colors.companyColor, bold: true },
      ],
    }),
    defaultStyle: { font: "Roboto", fontSize: 8, lineHeight: 1.2 },
  };
}

// GET /mechanical/reports/machine-doc-print?machineCode=&serviceType=&CompanyCode=
export const machineDocPrintReport = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type("text/plain").send("Missing subDBName header");
    const p = readParams(req);
    const machineCode = parseInt(req.query.machineCode, 10) || 0;
    if (!machineCode) return res.status(400).type("text/plain").send("machineCode is required");
    const serviceType = String(req.query.serviceType || "1");

    const pool = await getPool(subDbName);
    const [machineRes, scheduleRes, company] = await Promise.all([
      pool.request().input("MachineCode", sql.Int, machineCode).execute("sp_Machine_GetAll"),
      pool.request()
        .input("MachineCode", sql.Int, machineCode)
        .input("ServiceType", sql.NVarChar, serviceType)
        .execute("sp_MachineDetails_ServiceSchedule_GetAll"),
      getCompanyInfo(pool, p.CompanyCode),
    ]);

    const docDef = buildDocument({
      machine: (machineRes.recordset || [])[0] || {},
      schedule: scheduleRes.recordset || [],
      companyName: company.name,
      companyLogo: company.logo,
    });
    const pdfBuffer = await renderPdf(docDef);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="MachineDocument_${machineCode}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error("Report Error (machineDocPrintReport):", err);
    res.status(500).type("text/plain").send("ERROR: " + err.message);
  }
};

// GET /mechanical/reports/machine-doc-print/machines?branchCode&departmentCode&machineCode
export const machineDocPrintMachines = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type("text/plain").send("Missing subDBName header");
    const companyCode = parseInt(req.query.CompanyCode || req.headers.companycode) || 0;
    const pool = await getPool(subDbName);
    const result = await pool.request().input("CompanyCode", sql.Int, companyCode).execute("sp_Machine_GetAll");
    let rows = result.recordset || [];
    rows = applyFilter(rows, "BranchCode", codeSet(req.query.branchCode));
    rows = applyFilter(rows, "DepartmentCode", codeSet(req.query.departmentCode));
    rows = applyFilter(rows, "MachineCode", codeSet(req.query.machineCode));
    const data = rows.map((r) => ({
      MachineCode: r.MachineCode,
      BranchName: r.BranchName,
      MachineNo: r.MachineNo,
      MachineName: r.MachineName,
      DepartmentName: r.DepartmentName_English || r.DepartmentName,
      MachineMakeName: r.MachineMakeName,
    }));
    res.json({ success: true, data });
  } catch (err) {
    console.error("Report Error (machineDocPrintMachines):", err);
    res.status(500).type("text/plain").send("ERROR: " + err.message);
  }
};

// GET /mechanical/reports/machine-doc-print/options
export const machineDocPrintOptions = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type("text/plain").send("Missing subDBName header");
    const companyCode = parseInt(req.query.CompanyCode || req.headers.companycode) || 0;
    const pool = await getPool(subDbName);

    const [branches, departments, machines] = await Promise.all([
      pool.request().input("CompanyCode", sql.Int, companyCode)
        .query("SELECT BranchCode AS value, BranchName AS label FROM tbl_Branch WHERE CompanyCode = @CompanyCode ORDER BY BranchName"),
      pool.request()
        .query("SELECT DepartmentCode AS value, DepartmentName AS label FROM tbl_Department WHERE DepartmentCode IN (SELECT DepartmentCode FROM tbl_Machine WHERE Status = 1) ORDER BY DepartmentName"),
      pool.request().input("CompanyCode", sql.Int, companyCode)
        .query("SELECT MachineCode AS value, MachineName AS label FROM tbl_Machine WHERE CompanyCode = @CompanyCode AND Status = 1 AND MachineTypeCode = 1 ORDER BY MachineName"),
    ]);

    res.json({
      success: true,
      data: {
        branches: branches.recordset,
        departments: departments.recordset,
        machines: machines.recordset,
      },
    });
  } catch (err) {
    console.error("Report Error (machineDocPrintOptions):", err);
    res.status(500).type("text/plain").send("ERROR: " + err.message);
  }
};
