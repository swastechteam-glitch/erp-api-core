// Cotton — Quality Test Slip Print DETAILS (Document report).
// Given an ArrivalCode (from the quality-slip list), runs
// sp_CottonQualityTestDetails_GetAll and renders the single-test quality slip
// PDF mirroring rptCottonQualitySlip.rdlc — TWO identical copies side by side
// (office / party copy), each with:
//   - the company ShortName heading,
//   - an info block (Mill Lot No / Arrival Date / Party / Lot / Station /
//     Raw Material / No. of Bales / Agent / Rate),
//   - the parameter grid (PARAMETER | STD From/To | P.O From/To | TEST), with a
//     red highlight on out-of-spec test results,
//   - a Grade footer.
//
//   EXEC sp_CottonQualityTestDetails_GetAll @ArrivalCode = <ArrivalCode>

import sql from "mssql";
import { getPool } from "../../config/dynamicDB.js";
import { renderPdf, getCompanyInfo, str, dec, fmt, ddmmyyyy } from "../report/cotton/_common.js";

const BLUE = "#0000CC";
const MAROON = "#800000";
const HEADER_FILL = "#F2F2F2";
const BORDER = "#999999";

const gridLayout = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => BORDER,
  vLineColor: () => BORDER,
  paddingLeft: () => 3,
  paddingRight: () => 3,
  paddingTop: () => 2,
  paddingBottom: () => 2,
};

// "12.5 A" style range cell — only when the numeric part is non-zero.
const range = (n, suffix) => {
  const v = Number(n);
  if (!isFinite(v) || v === 0) return "";
  const s = String(Math.round(v * 100) / 100);
  return suffix ? `${s} ${suffix}`.trim() : s;
};

// One full slip (used twice, side by side).
function buildSlip(rows, company) {
  const r = rows[0] || {};
  const payType = dec(r, "PaymentType") === 0 ? "SPOT" : "FOR";

  // --- company heading ---
  const heading = {
    table: {
      widths: ["*"],
      body: [[{ text: company.shortName || company.name || "", color: BLUE, bold: true, fontSize: 11, alignment: "center" }]],
    },
    layout: {
      hLineWidth: (i) => (i === 1 ? 1 : 0),
      vLineWidth: () => 0,
      hLineColor: () => "#000000",
      paddingTop: () => 2,
      paddingBottom: () => 3,
    },
  };

  // --- info block (label : value) ---
  const info = [
    ["Mill Lot No", str(r, "MillLotNo")],
    ["Arrival Date", ddmmyyyy(r.ArrivalDate)],
    ["Party Name", str(r, "SupplierName")],
    ["Party Lot No", str(r, "PartyLotNo")],
    ["Station Name", str(r, "StationName")],
    ["Raw Material", str(r, "RawMaterialName")],
    ["No. of Bales", fmt(dec(r, "Qty"), 0)],
    ["Agent Name", str(r, "AgentName")],
    ["Rate", `${fmt(dec(r, "CandyRate"), 0)} / ${payType}`],
  ];
  const infoTable = {
    table: {
      widths: [95, "*"],
      body: info.map(([k, v]) => [
        { text: k, fontSize: 8 },
        { text: v, fontSize: 8, bold: true, color: k === "Mill Lot No" ? MAROON : undefined },
      ]),
    },
    layout: gridLayout,
    margin: [0, 4, 0, 0],
  };

  // --- parameter grid ---
  const head1 = [
    { text: "PARAMETER", rowSpan: 2, color: BLUE, bold: true, fontSize: 7.5, alignment: "center", fillColor: HEADER_FILL, margin: [0, 6, 0, 0] },
    { text: "STD", colSpan: 2, color: BLUE, bold: true, fontSize: 8, alignment: "center", fillColor: HEADER_FILL },
    {},
    { text: "P.O", colSpan: 2, color: BLUE, bold: true, fontSize: 8, alignment: "center", fillColor: HEADER_FILL },
    {},
    { text: "TEST", rowSpan: 2, color: BLUE, bold: true, fontSize: 8, alignment: "center", fillColor: HEADER_FILL, margin: [0, 6, 0, 0] },
  ];
  const head2 = [
    {},
    { text: "FROM", color: BLUE, bold: true, fontSize: 7.5, alignment: "center", fillColor: HEADER_FILL },
    { text: "TO", color: BLUE, bold: true, fontSize: 7.5, alignment: "center", fillColor: HEADER_FILL },
    { text: "FROM", color: BLUE, bold: true, fontSize: 7.5, alignment: "center", fillColor: HEADER_FILL },
    { text: "TO", color: BLUE, bold: true, fontSize: 7.5, alignment: "center", fillColor: HEADER_FILL },
    {},
  ];

  const paramRows = rows
    .filter((x) => x.ViewSlip === true || x.ViewSlip === 1)
    .map((x) => {
      const highlight = dec(x, "HighLight") === 1;
      const testVal = dec(x, "TestResult");
      return [
        { text: str(x, "CQTParameterName"), fontSize: 8 },
        { text: range(x.CQTParameterFrom, str(x, "CQTParameterFrom1")), fontSize: 8, alignment: "center" },
        { text: range(x.CQTParameterTo, str(x, "CQTParameterTo1")), fontSize: 8, alignment: "center" },
        { text: range(x.PartyFrom, str(x, "PartyFrom1")), fontSize: 8, alignment: "center" },
        { text: range(x.PartyTo, str(x, "PartyTo1")), fontSize: 8, alignment: "center" },
        {
          text: testVal !== 0 ? String(testVal) : "",
          fontSize: 8,
          alignment: "center",
          bold: true,
          // Out-of-spec results print white-on-red (HighLight != 1), matching the .rdlc.
          color: highlight ? "#000000" : "#FFFFFF",
          fillColor: highlight ? undefined : "#FF0000",
        },
      ];
    });

  const gridTable = {
    table: {
      headerRows: 2,
      widths: [110, 38, 38, 38, 38, 50],
      body: [head1, head2, ...paramRows],
    },
    layout: gridLayout,
    margin: [0, 0, 0, 0],
  };

  // --- Grade footer ---
  const gradeTable = {
    table: {
      widths: ["*"],
      body: [[{ text: `Grade : ${str(r, "Grade")}`, fontSize: 10, bold: true, margin: [2, 4, 2, 4] }]],
    },
    layout: gridLayout,
  };

  return {
    width: "*",
    stack: [heading, infoTable, gridTable, gradeTable],
  };
}

function buildDocDefinition(rows, company) {
  return {
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [24, 20, 24, 28],
    footer: (currentPage, pageCount) => ({
      margin: [24, 6, 24, 0],
      columns: [
        { text: `Report Printed : ${new Date().toLocaleString("en-GB")}`, fontSize: 7, italics: true, color: MAROON },
        { text: `${currentPage}/${pageCount}`, alignment: "right", fontSize: 7, color: MAROON },
      ],
    }),
    content: [
      {
        // Two identical copies side by side (office / party).
        columns: [buildSlip(rows, company), buildSlip(rows, company)],
        columnGap: 16,
      },
    ],
    defaultStyle: { font: "Roboto", fontSize: 8 },
  };
}

export const cottonQualitySlipPrintDetails = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) {
      return res.status(400).type("text/plain").send("Missing subDBName header");
    }

    const ArrivalCode = parseInt(req.query.ArrivalCode) || 0;
    const CompanyCode = parseInt(req.query.CompanyCode) || parseInt(req.headers.companyCode) || 0;

    const pool = await getPool(subDbName);
    const result = await pool
      .request()
      .input("ArrivalCode", sql.Int, ArrivalCode)
      .execute("sp_CottonQualityTestDetails_GetAll");
    const rows = result.recordset || [];

    if (req.query.debug === "1") {
      return res
        .type("text/plain")
        .send(`ArrivalCode=${ArrivalCode}\nrows=${rows.length}\n` + JSON.stringify(rows.slice(0, 2), null, 2));
    }

    const company = await getCompanyInfo(pool, CompanyCode);
    const docDef = buildDocDefinition(rows, company);
    const pdfBuffer = await renderPdf(docDef);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="CottonQualitySlip_${ArrivalCode}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error("cottonQualitySlipPrintDetails:", err);
    res.status(500).type("text/plain").send("ERROR: " + err.message);
  }
};
