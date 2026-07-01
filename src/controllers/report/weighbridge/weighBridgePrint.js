// =============================================================================
// Weigh Bridge ▸ Weighment Slip Print  (form: frmWeighBridgePrint)
// =============================================================================
// Master-detail print screen (NOT a date-range report):
//   • a Company dropdown (sp_Company_GetAll),
//   • a grid of weighments to print (sp_WeighBridge_DocPrint @CompanyCode,@FYCode),
//   • a per-weighment printable slip (rptWeighBridgeSlip.rdlc / _WithImage.rdlc)
//     rendered when the user clicks "View" on a row, and
//   • a "print once" guard: on print the desktop stamps tbl_WeighBridge.Printed=1.
//
// The slip is built with pdfmake (same engine the other reports use) to mirror
// the two RDLC layouts:
//   With Image OFF -> rptWeighBridgeSlip.rdlc          (slip only)
//   With Image ON  -> rptWeighBridgeSlip_WithImage.rdlc (slip + empty/load images)
// Images come straight from sp_WeighBridge_Image_GetAll — the browser entry
// screen stores none, so they simply render blank until a scale-bridge feeds them.
//
// Endpoints:
//   GET  /weigh-bridge-print/options                          companies
//   GET  /weigh-bridge-print/list?companyCode=                grid rows
//   GET  /weigh-bridge-print/slip?weighCode=&companyCode=&withImage=1   PDF
//   POST /weigh-bridge-print/mark-printed  { weighCode }      Printed = 1
//
// Stored procedures (same as the VB form):
//   sp_Company_GetAll                     [@CompanyCode]
//   sp_WeighBridge_DocPrint               @CompanyCode,@FYCode
//   sp_WeighBridge_GetAll                 @WeighCode,[@CompanyCode]
//   sp_WeighBridge_Image_GetAll           @WeighCode
// =============================================================================

import sql from "mssql";
import { getPool } from "../../../config/dynamicDB.js";
import { renderPdf, getCompanyInfo, colors, dec, str, fmt, ddmmyyyy } from "../cotton/_common.js";

const toInt = (v) => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? 0 : n;
};
const getFYCode = (req) => toInt(req.headers.FYCode ?? req.headers.fycode);
const pick = (row, ...keys) => {
  if (!row) return undefined;
  for (const k of keys) {
    if (k == null) continue;
    if (row[k] !== undefined) return row[k];
    const lk = String(k).toLowerCase();
    const hit = Object.keys(row).find((o) => o.toLowerCase() === lk);
    if (hit) return row[hit];
  }
  return undefined;
};

// Detect image magic bytes → data URI (pdfmake needs a data URI, not raw bytes).
function bufferToDataUri(buf) {
  const b = Buffer.isBuffer(buf) ? buf : buf?.data ? Buffer.from(buf.data) : null;
  if (!b || b.length < 4) return null;
  let mime = "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) mime = "image/png";
  else if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) mime = "image/gif";
  else if (b[0] === 0x42 && b[1] === 0x4d) mime = "image/bmp";
  return `data:${mime};base64,${b.toString("base64")}`;
}

// ---------------------------------------------------------------------------
// Slip document — matches rptWeighBridgeSlip.rdlc (+ _WithImage variant).
// ---------------------------------------------------------------------------
const w0 = (v) => (dec({ v }, "v") ? fmt(dec({ v }, "v"), 0) : "0"); // weight, no decimals

function buildSlip({ row, images, companyName, companyLogo, withImage }) {
  const r = row || {};
  const gross = dec(r, "GrossWeight");
  const tare = dec(r, "TareWeight");
  const net = pick(r, "NetWeight") != null ? dec(r, "NetWeight") : gross > 0 ? gross - tare : tare;
  const grossTime = gross > 0 ? str(r, "GrossWeighmentTime") : "";
  const tareTime = tare > 0 ? str(r, "TareWeighmentTime") : "";
  const weighNo = str(r, "str_WeighmentNo") || str(r, "WeighmentNumber");

  const logoCol = companyLogo
    ? { image: companyLogo, fit: [70, 70], width: 80, margin: [4, 0, 0, 0] }
    : { text: "", width: 80 };

  // label : value row for the two-column key/value block
  const kv = (label, value, bold = false) => [
    { text: label, fontSize: 10, color: "#333", margin: [0, 2, 0, 2] },
    { text: ":", fontSize: 10, alignment: "center" },
    { text: value == null ? "" : String(value), fontSize: 10, bold, margin: [0, 2, 0, 2] },
  ];

  const header = [
    {
      columns: [
        logoCol,
        {
          width: "*",
          stack: [
            { text: companyName, alignment: "center", fontSize: 14, bold: true, color: "#0000c0" },
            withImage
              ? { text: "Weigh Bridge Slip", alignment: "center", fontSize: 11, bold: true, color: colors.companyColor, margin: [0, 3, 0, 0] }
              : null,
          ].filter(Boolean),
        },
        { text: "", width: 80 },
      ],
    },
    { canvas: [{ type: "line", x1: 0, y1: 4, x2: 515, y2: 4, lineWidth: 0.8, lineColor: colors.borderColor }], margin: [0, 4, 0, 8] },
  ];

  // Two-panel label/value block (Weighment No/Date, Party, Vehicle, Section…).
  const panel = (rows) => ({ width: "*", table: { widths: [95, 6, "*"], body: rows }, layout: "noBorders" });
  const leftInfo = panel([
    kv("Weighment No", weighNo, true),
    kv("Party Name", str(r, "SupplierName")),
    kv("Vehicle No", str(r, "VehicleNumber")),
    kv("Material Name", str(r, "MaterialName")),
    kv("Ref No", str(r, "RefNo")),
    kv("Remarks", str(r, "Remarks")),
  ]);
  const rightInfo = panel([
    kv("Date", ddmmyyyy(pick(r, "WeighmentDate")), true),
    kv("Section", str(r, "WeighSection")),
  ]);

  // Weight block — three boxes: Gross | Tare | Net (with weighment times).
  const weightHead = (t) => ({ text: t, bold: true, alignment: "center", fontSize: 10, fillColor: colors.headerFill, color: colors.headerText });
  const weightVal = (v) => ({ text: v, alignment: "center", fontSize: 12, bold: true, margin: [0, 3, 0, 3] });
  const weightTime = (t) => ({ text: t || " ", alignment: "center", fontSize: 8, color: "#555" });
  const weightTable = {
    table: {
      widths: ["*", "*", "*"],
      body: [
        [weightHead("Gross Weight"), weightHead("Tare Weight"), weightHead("Net Weight")],
        [weightVal(w0(gross)), weightVal(w0(tare)), weightVal(w0(net))],
        [weightTime(grossTime), weightTime(tareTime), weightTime("")],
      ],
    },
    layout: {
      hLineWidth: () => 0.6,
      vLineWidth: () => 0.6,
      hLineColor: () => colors.borderColor,
      vLineColor: () => colors.borderColor,
    },
    margin: [0, 12, 0, 0],
  };

  const content = [
    ...header,
    {
      table: { widths: ["*"], body: [[{ stack: [{ columns: [leftInfo, { width: 12, text: "" }, rightInfo] }], margin: [6, 6, 6, 6] }]] },
      layout: { hLineWidth: () => 0.6, vLineWidth: () => 0.6, hLineColor: () => colors.borderColor, vLineColor: () => colors.borderColor },
    },
    weightTable,
  ];

  // With Image: two vehicle images + a signature line (rptWeighBridgeSlip_WithImage).
  if (withImage) {
    const emptyImg = bufferToDataUri(pick(images || {}, "EmptyImage"));
    const loadImg = bufferToDataUri(pick(images || {}, "LoadImage"));
    const imgCell = (uri, caption) => ({
      stack: [
        { text: caption, bold: true, alignment: "center", fontSize: 9, margin: [0, 0, 0, 4] },
        uri
          ? { image: uri, fit: [230, 150], alignment: "center" }
          : { text: "(no image)", italics: true, color: "#999", alignment: "center", margin: [0, 40, 0, 40] },
      ],
      margin: [4, 4, 4, 4],
    });
    content.push({
      table: { widths: ["*", "*"], body: [[imgCell(emptyImg, "EMPTY VEHICLE IMAGE"), imgCell(loadImg, "LOAD VEHICLE IMAGE")]] },
      layout: { hLineWidth: () => 0.6, vLineWidth: () => 0.6, hLineColor: () => colors.borderColor, vLineColor: () => colors.borderColor },
      margin: [0, 12, 0, 0],
    });
    content.push({ text: "Signature", alignment: "right", fontSize: 10, margin: [0, 40, 20, 0] });
  }

  return {
    pageSize: "A4",
    pageOrientation: "portrait",
    pageMargins: [25, 20, 25, 40],
    content,
    footer: (currentPage, pageCount) => ({
      margin: [25, 8, 25, 0],
      columns: [
        { text: "Developed by Swas Technologies , Report Printed : " + new Date().toLocaleString("en-GB"), fontSize: 7 },
        { text: `${currentPage}/${pageCount}`, alignment: "right", fontSize: 7, color: colors.companyColor, bold: true },
      ],
    }),
    defaultStyle: { font: "Roboto", fontSize: 10, lineHeight: 1.2 },
  };
}

// GET /weigh-bridge-print/options  -> [{ value, label }]
export const getOptions = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type("text/plain").send("Missing subDBName header");
    const pool = await getPool(subDbName);
    const rs = await pool.request().execute("sp_Company_GetAll");
    const companies = (rs.recordset || []).map((x) => ({
      value: toInt(pick(x, "CompanyCode")),
      label: (pick(x, "CompanyName") ?? "").toString(),
    }));
    res.json({ success: true, data: { companies } });
  } catch (err) {
    console.error("Report Error (weighBridgePrint.getOptions):", err);
    res.status(500).type("text/plain").send("ERROR: " + err.message);
  }
};

// GET /weigh-bridge-print/list?companyCode=  -> grid rows (sp_WeighBridge_DocPrint)
export const list = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type("text/plain").send("Missing subDBName header");
    const companyCode = toInt(req.query.companyCode ?? req.query.CompanyCode ?? req.headers.companyCode);
    const fyCode = getFYCode(req);
    const pool = await getPool(subDbName);

    const rs = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("FYCode", sql.Int, fyCode)
      .execute("sp_WeighBridge_DocPrint");

    const data = (rs.recordset || []).map((row, i) => ({
      id: toInt(pick(row, "WeighCode")) || i + 1,
      WeighCode: toInt(pick(row, "WeighCode")),
      WeighmentNumber: (pick(row, "str_WeighmentNo") ?? pick(row, "WeighmentNumber") ?? "").toString(),
      WeighmentDate: ddmmyyyy(pick(row, "WeighmentDate")),
      TransactionType: toInt(pick(row, "TransactionType")),
      WeighingType: (pick(row, "WeighingType") ?? "").toString(),
      VehicleType: (pick(row, "VehicleType") ?? "").toString(),
      VehicleNumber: (pick(row, "VehicleNumber") ?? "").toString(),
      SupplierName: (pick(row, "SupplierName") ?? "").toString(),
      Printed: toInt(pick(row, "Printed")) === 1,
    }));

    res.json({ success: true, data });
  } catch (err) {
    console.error("Report Error (weighBridgePrint.list):", err);
    res.status(500).type("text/plain").send("ERROR: " + err.message);
  }
};

// GET /weigh-bridge-print/slip?weighCode=&companyCode=&withImage=1  -> PDF
export const slip = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type("text/plain").send("Missing subDBName header");
    const weighCode = toInt(req.query.weighCode);
    if (!weighCode) return res.status(400).type("text/plain").send("weighCode is required");
    const companyCode = toInt(req.query.companyCode ?? req.query.CompanyCode);
    const withImage = String(req.query.withImage ?? "1") === "1" || String(req.query.withImage) === "true";
    const pool = await getPool(subDbName);

    const wbReq = pool.request().input("WeighCode", sql.Int, weighCode);
    if (companyCode > 0) wbReq.input("CompanyCode", sql.Int, companyCode);

    const [wbRes, company, imgRes] = await Promise.all([
      wbReq.execute("sp_WeighBridge_GetAll"),
      getCompanyInfo(pool, companyCode),
      withImage
        ? pool.request().input("WeighCode", sql.Int, weighCode).execute("sp_WeighBridge_Image_GetAll").catch(() => ({ recordset: [] }))
        : Promise.resolve({ recordset: [] }),
    ]);

    const row = (wbRes.recordset || [])[0];
    if (!row) return res.status(404).type("text/plain").send("Weighment not found");

    const docDef = buildSlip({
      row,
      images: (imgRes.recordset || [])[0] || {},
      companyName: company.name,
      companyLogo: company.logo,
      withImage,
    });
    const pdfBuffer = await renderPdf(docDef);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="WeighBridgeSlip_${weighCode}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error("Report Error (weighBridgePrint.slip):", err);
    res.status(500).type("text/plain").send("ERROR: " + err.message);
  }
};

// POST /weigh-bridge-print/mark-printed  { weighCode }  -> Printed = 1
// Mirrors rptViewer_Print / btnPrint_Click, which stamp Printed when PrintLimit
// is on. The PrintLimit config flag isn't available server-side, so we always
// record the print here; the caller invokes this when the user prints/downloads.
export const markPrinted = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return res.status(400).type("text/plain").send("Missing subDBName header");
    const weighCode = toInt(req.body?.weighCode ?? req.query.weighCode);
    if (!weighCode) return res.status(400).json({ success: false, message: "weighCode is required" });
    const pool = await getPool(subDbName);
    await pool
      .request()
      .input("WeighCode", sql.Int, weighCode)
      .query("Update tbl_WeighBridge Set Printed = 1 Where WeighCode = @WeighCode");
    res.json({ success: true, message: "Marked as printed" });
  } catch (err) {
    console.error("Report Error (weighBridgePrint.markPrinted):", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
