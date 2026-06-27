// Mechanical — Type of Break Downs Report (port of WinForms rptTypeOfBreakDown.vb).
//
// Simple master listing, NO date range: a single "Break Down Name" filter and a
// flat table (rptTypeOfBreakDowns.rdlc) of S.No / Break Down Name / Order No.
//
// Endpoints:
//   GET /type-of-breakdown/options   -> Break Down Name dropdown
//   GET /type-of-breakdown           -> PDF (filtered by breakDownMasterCode csv)
//
// Stored procedure: sp_TypeOfBreakDowns_GetAll (no params).

import sql from "mssql";
import { getPool } from "../../../config/dynamicDB.js";
import {
  renderPdf, getCompanyInfo, readParams,
  tableLayout, colors, dec, str, fmt,
} from "../cotton/_common.js";

const codeSet = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const s = new Set(String(v).split(",").map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n)));
  return s.size ? s : null;
};

function buildDoc({ rows, companyName, companyLogo }) {
  const head = (t, align = "center") => ({ text: t, bold: true, fillColor: colors.headerFill, color: colors.headerText, alignment: align, fontSize: 8 });
  const body = [[head("S.No"), head("Break Down Name", "left"), head("Break Down Order No")]];
  const sorted = (rows || []).slice().sort((a, b) => str(a, "BreakDownName").localeCompare(str(b, "BreakDownName")));
  sorted.forEach((r, i) => {
    const z = i % 2 === 1 ? colors.zebraFill : null;
    body.push([
      { text: String(i + 1), alignment: "center", fontSize: 8, fillColor: z },
      { text: str(r, "BreakDownName"), alignment: "left", fontSize: 8, fillColor: z },
      { text: fmt(dec(r, "BreakDownOrderNo"), 0), alignment: "center", fontSize: 8, fillColor: z },
    ]);
  });
  if (!sorted.length) body.push([{ text: "No break down types found.", colSpan: 3, italics: true, fontSize: 8 }, {}, {}]);

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
              { text: companyName, alignment: "center", fontSize: 14, bold: true, color: "#000080" },
              { text: "Type Of Break Downs", alignment: "center", fontSize: 13, bold: true, color: colors.companyColor, margin: [0, 2, 0, 2] },
            ],
          },
          { text: "", width: 80 },
        ],
      },
      { canvas: [{ type: "line", x1: 0, y1: 4, x2: 545, y2: 4, lineWidth: 0.8, lineColor: colors.borderColor }], margin: [0, 4, 0, 10] },
      { table: { headerRows: 1, widths: [50, "*", 130], body }, layout: tableLayout() },
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

// GET /mechanical/reports/type-of-breakdown?breakDownMasterCode=&CompanyCode=
export const typeOfBreakDownReport = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type("text/plain").send("Missing subDBName header");
    const p = readParams(req);
    const pool = await getPool(subDbName);

    const result = await pool.request().execute("sp_TypeOfBreakDowns_GetAll");
    let rows = result.recordset || [];
    const set = codeSet(req.query.breakDownMasterCode);
    if (set) rows = rows.filter((r) => set.has(parseInt(r.BreakDownMasterCode, 10)));

    const company = await getCompanyInfo(pool, p.CompanyCode);
    const pdfBuffer = await renderPdf(buildDoc({ rows, companyName: company.name, companyLogo: company.logo }));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="TypeOfBreakDowns.pdf"');
    res.send(pdfBuffer);
  } catch (err) {
    console.error("Report Error (typeOfBreakDownReport):", err);
    res.status(500).type("text/plain").send("ERROR: " + err.message);
  }
};

// GET /mechanical/reports/type-of-breakdown/options
export const typeOfBreakDownOptions = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type("text/plain").send("Missing subDBName header");
    const pool = await getPool(subDbName);
    const r = await pool.request().query(
      "SELECT BreakDownMasterCode AS value, BreakDownName AS label FROM tbl_TypeOfBreakDowns ORDER BY BreakDownName"
    );
    res.json({ success: true, data: { breakdowns: r.recordset } });
  } catch (err) {
    console.error("Report Error (typeOfBreakDownOptions):", err);
    res.status(500).type("text/plain").send("ERROR: " + err.message);
  }
};
