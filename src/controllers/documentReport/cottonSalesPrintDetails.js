// Cotton — RawMaterial Sales Print DETAILS / invoice (Document report).
// Given a CottonSalesCode (from the sales-print list), runs
// sp_CottonSalesDetails_GetAll and renders the GST tax-invoice PDF mirroring
// rptCottonSales.rdlc:
//   - company heading (name / address / GSTIN-UIN),
//   - "Rawmaterial Sales" title + invoice meta (Sales No / Date / Vehicle /
//     Place of supply / reverse-charge / company GST + PAN),
//   - Receiver (Billed to) + Consignee (Shipped to) party blocks,
//   - the item table grouped by Raw Material (S.No | Description | HSN |
//     Quantity[Σ NetWeight] | Rate | UOM=Kgs | Amount[Σ Amount]),
//   - the tax footer (Basic Value / CGST / SGST / IGST / Total / Rounded Off /
//     Total Weight + Net Amount),
//   - amount-in-words + remarks, declaration, bank details, signatory.
//
//   EXEC sp_CottonSalesDetails_GetAll @CompanyCode = <c>, @CottonSalesCode = <code>

import sql from "mssql";
import { getPool } from "../../config/dynamicDB.js";
import { renderPdf, str, dec, fmt, ddmmyyyy } from "../report/cotton/_common.js";

// Full company row (name + address + GSTIN/PAN + bank) from sp_Company_GetAll.
async function getCompany(pool, companyCode) {
  const r = await pool.request().input("CompanyCode", sql.Int, companyCode).execute("sp_Company_GetAll");
  const c = r.recordset?.[0] || {};
  return {
    name: c.CompanyName || "",
    address1: c.Address1 || "",
    address2: c.Address2 || "",
    city: [c.City, c.District, c.PinCode].filter(Boolean).join(", "),
    gstin: c.GSTINNo || "",
    panNo: c.PANNo || "",
    bankName: c.BankName || "",
    accountNo: c.AccountNo || "",
  };
}

const BORDER = "#000000";
const HEAD_FILL = "#F2F2F2";

// ---- amount in words (Indian numbering) ----
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const twoDigits = (n) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : ""));
const threeDigits = (n) => {
  const h = Math.floor(n / 100), r = n % 100;
  return (h ? ONES[h] + " Hundred" + (r ? " " : "") : "") + (r ? twoDigits(r) : "");
};
function numberToWords(num) {
  num = Math.floor(Math.abs(Number(num) || 0));
  if (num === 0) return "Zero";
  const cr = Math.floor(num / 10000000); num %= 10000000;
  const la = Math.floor(num / 100000); num %= 100000;
  const th = Math.floor(num / 1000); num %= 1000;
  const parts = [];
  if (cr) parts.push(threeDigits(cr) + " Crore");
  if (la) parts.push(threeDigits(la) + " Lakh");
  if (th) parts.push(threeDigits(th) + " Thousand");
  if (num) parts.push(threeDigits(num));
  return parts.join(" ").trim();
}
function rupeesInWords(amount) {
  const n = Number(amount) || 0;
  const rupees = Math.floor(n);
  const paise = Math.round((n - rupees) * 100);
  let s = "Rupees " + numberToWords(rupees);
  if (paise) s += " and " + twoDigits(paise) + " Paise";
  return s + " Only";
}

const boxLayout = {
  hLineWidth: () => 0.5, vLineWidth: () => 0.5,
  hLineColor: () => BORDER, vLineColor: () => BORDER,
};

function buildDocDefinition(rows, company) {
  const h = rows[0] || {};
  const companyName = company.name || str(h, "CompanyName");
  const companyAddr = [company.address1, company.address2, company.city].filter(Boolean).join(", ");

  // ---- group detail rows by Raw Material (matches the .rdlc grouping) ----
  const groups = new Map();
  for (const r of rows) {
    const key = dec(r, "RawMaterialCode") || str(r, "RawMaterialName");
    if (!groups.has(key)) {
      groups.set(key, {
        RawMaterialName: str(r, "RawMaterialName"),
        HSNCode: str(r, "HSNCode"),
        Rate: dec(r, "Rate"),
        Qty: 0,
        NetWeight: 0,
        Amount: 0,
      });
    }
    const g = groups.get(key);
    g.Qty += dec(r, "Qty");
    g.NetWeight += dec(r, "NetWeight");
    g.Amount += dec(r, "Amount");
  }
  const grouped = [...groups.values()];

  const itemHead = ["S.No", "Description of Goods", "HSN Code", "Quantity", "Rate", "UOM", "Amount"].map((t) => ({
    text: t, bold: true, fontSize: 8, alignment: "center", fillColor: HEAD_FILL,
  }));
  const body = [itemHead];
  let totWeight = 0, totAmount = 0;
  grouped.forEach((g, i) => {
    totWeight += g.NetWeight;
    totAmount += g.Amount;
    body.push([
      { text: String(i + 1), fontSize: 8, alignment: "center" },
      { text: g.RawMaterialName, fontSize: 8 },
      { text: g.HSNCode, fontSize: 8, alignment: "center" },
      { text: fmt(g.NetWeight, 2), fontSize: 8, alignment: "right" },
      { text: fmt(g.Rate, 2), fontSize: 8, alignment: "right" },
      { text: "Kgs", fontSize: 8, alignment: "center" },
      { text: fmt(g.Amount, 2), fontSize: 8, alignment: "right" },
    ]);
  });

  // ---- footer totals (from header row0) ----
  const basic = dec(h, "TotalGrossAmount") || totAmount;
  const cgstAmt = dec(h, "TotalCGSTAmount");
  const sgstAmt = dec(h, "TotalSGSTAmount");
  const igstAmt = dec(h, "TotalIGSTAmount");
  const taxAmt = dec(h, "TotalTaxAmount") || (cgstAmt + sgstAmt + igstAmt);
  const otherExp = dec(h, "TotalOtherExpenses");
  const roundedOff = dec(h, "TotalRoundedOff");
  const netAmount = dec(h, "TotalNetAmount") || basic + taxAmt + otherExp + roundedOff;

  const totRow = (label, value, opts = {}) => [
    { text: label, colSpan: 6, alignment: "right", fontSize: 8, bold: opts.bold, fillColor: opts.fill },
    {}, {}, {}, {}, {},
    { text: value === "" ? "" : fmt(value, 2), alignment: "right", fontSize: 8, bold: opts.bold, fillColor: opts.fill },
  ];

  const footerBody = [];
  footerBody.push(totRow("Basic Value", basic, { bold: true }));
  if (cgstAmt > 0) footerBody.push(totRow(`CGST : ${fmt(dec(h, "TotalCGSTPer"), 2)} %`, cgstAmt));
  if (sgstAmt > 0) footerBody.push(totRow(`SGST : ${fmt(dec(h, "TotalSGSTPer"), 2)} %`, sgstAmt));
  if (igstAmt > 0) footerBody.push(totRow(`IGST : ${fmt(dec(h, "TotalIGSTPer"), 2)} %`, igstAmt));
  footerBody.push(totRow("Total Amount", basic + taxAmt + otherExp, { bold: true }));
  footerBody.push(totRow("Rounded Off Account", roundedOff));
  footerBody.push([
    { text: "Total", colSpan: 3, alignment: "right", bold: true, fontSize: 9, fillColor: HEAD_FILL },
    {}, {},
    { text: fmt(totWeight, 2), alignment: "right", bold: true, fontSize: 9, fillColor: HEAD_FILL },
    { text: "Net Amount", colSpan: 2, alignment: "right", bold: true, fontSize: 9, fillColor: HEAD_FILL },
    {},
    { text: fmt(netAmount, 2), alignment: "right", bold: true, fontSize: 9, fillColor: HEAD_FILL },
  ]);

  // ---- party blocks ----
  const custAddr = [str(h, "Address1"), str(h, "Address2"), str(h, "City")].filter(Boolean).join(", ");
  const partyBox = (title) => ({
    width: "*",
    margin: [0, 0, 4, 0],
    table: {
      widths: [70, "*"],
      body: [
        [{ text: title, colSpan: 2, bold: true, fontSize: 8, alignment: "center", fillColor: "#696969", color: "#FFFFFF" }, {}],
        [{ text: "Name", fontSize: 8 }, { text: str(h, "CustomerName"), fontSize: 8, bold: true }],
        [{ text: "Address", fontSize: 8 }, { text: custAddr, fontSize: 8 }],
        [{ text: "State", fontSize: 8 }, { text: str(h, "StateName"), fontSize: 8 }],
        [{ text: "State Code", fontSize: 8 }, { text: str(h, "StateID"), fontSize: 8 }],
        [{ text: "GSTIN No", fontSize: 8 }, { text: str(h, "GSTINNo"), fontSize: 8 }],
      ],
    },
    layout: boxLayout,
  });

  return {
    pageSize: "A4",
    pageMargins: [28, 22, 28, 70],
    footer: (cp, pc) => ({
      margin: [28, 6, 28, 0],
      stack: [
        { canvas: [{ type: "line", x1: 0, y1: 0, x2: 539, y2: 0, lineWidth: 0.5 }] },
        {
          columns: [
            {
              width: "*",
              stack: [
                { text: "Bank Details :-", bold: true, fontSize: 8, margin: [0, 4, 0, 1] },
                { text: companyName, fontSize: 8 },
                { text: `Bank Name : ${company.bankName || ""}  Branch: TIRUPUR`, fontSize: 8 },
                { text: `A/C No. ${company.accountNo || ""}`, fontSize: 8 },
              ],
            },
            {
              width: 220,
              stack: [
                { text: `For ${companyName}`, bold: true, fontSize: 9, alignment: "center", margin: [0, 6, 0, 28] },
                { text: "Authorised Signatory", bold: true, fontSize: 9, alignment: "center" },
              ],
            },
          ],
          margin: [0, 2, 0, 0],
        },
        {
          text: "Declaration : We declare that this invoice shows the actual Price of the goods described and that all particulars are true and correct.",
          fontSize: 7,
          margin: [0, 4, 0, 0],
        },
        { text: `${cp} / ${pc}`, alignment: "right", fontSize: 7, color: "#800000" },
      ],
    }),
    content: [
      // ---- company / title header ----
      {
        table: {
          widths: ["*"],
          body: [
            [{ text: companyName, bold: true, fontSize: 16, alignment: "center" }],
            [{ text: companyAddr, fontSize: 9, alignment: "center" }],
            [{ text: company.gstin ? "GSTIN/UIN : " + company.gstin : "", bold: true, fontSize: 10, alignment: "center" }],
          ],
        },
        layout: boxLayout,
        margin: [0, 0, 0, 4],
      },
      {
        table: { widths: ["*"], body: [[{ text: "Rawmaterial Sales", bold: true, fontSize: 12, alignment: "center", color: "#FFFFFF", fillColor: "#696969" }]] },
        layout: boxLayout,
        margin: [0, 0, 0, 4],
      },
      // ---- invoice meta ----
      {
        columns: [
          {
            width: "*",
            stack: [
              { text: [{ text: "Tax is Payable on reserve charge : ", bold: true }, { text: "N" }], fontSize: 8 },
              { text: [{ text: "Sales No : ", bold: true }, { text: str(h, "strCottonSalesNo") || str(h, "CottonSalesNo") }], fontSize: 8 },
              { text: [{ text: "Sales Date : ", bold: true }, { text: ddmmyyyy(h.CottonSalesDate) }], fontSize: 8 },
            ],
          },
          {
            width: "*",
            stack: [
              { text: [{ text: "Vehicle No : ", bold: true }, { text: str(h, "VehicleNo") }], fontSize: 8 },
              { text: [{ text: "Date & Time of supply : ", bold: true }, { text: ddmmyyyy(h.CottonSalesDate) }], fontSize: 8 },
              { text: [{ text: "Place of supply : ", bold: true }, { text: str(h, "City") }], fontSize: 8 },
            ],
          },
        ],
        margin: [0, 0, 0, 2],
      },
      {
        text: `GST No : ${company.gstin || ""}        PAN NO : ${company.panNo || ""}`,
        bold: true, fontSize: 8, margin: [0, 0, 0, 4],
      },
      // ---- billed-to / shipped-to ----
      {
        columns: [partyBox("Details of Receiver (Billed to)"), partyBox("Details of Consignee (Shipped to)")],
        margin: [0, 0, 0, 6],
      },
      // ---- items ----
      {
        table: { headerRows: 1, widths: [28, "*", 60, 60, 55, 35, 70], body },
        layout: boxLayout,
      },
      // ---- footer totals ----
      {
        table: { widths: [28, "*", 60, 60, 55, 35, 70], body: footerBody },
        layout: boxLayout,
      },
      // ---- amount in words + remarks ----
      {
        margin: [0, 8, 0, 0],
        stack: [
          { text: "Amount Chargeable (in words)", bold: true, fontSize: 9 },
          { text: rupeesInWords(netAmount), fontSize: 9, margin: [0, 0, 0, 4] },
          { text: [{ text: "Tax Amount (in words) : ", bold: true }, { text: rupeesInWords(taxAmt) }], fontSize: 8 },
          { text: [{ text: "Remarks : ", bold: true }, { text: str(h, "Remarks") }], fontSize: 8, margin: [0, 2, 0, 0] },
        ],
      },
    ],
    defaultStyle: { font: "Roboto", fontSize: 9 },
  };
}

export const cottonSalesPrintDetails = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) {
      return res.status(400).type("text/plain").send("Missing subDBName header");
    }

    const CottonSalesCode = parseInt(req.query.CottonSalesCode) || 0;
    const CompanyCode = parseInt(req.query.CompanyCode) || parseInt(req.headers.companyCode) || 0;

    const pool = await getPool(subDbName);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, CompanyCode)
      .input("CottonSalesCode", sql.Int, CottonSalesCode)
      .execute("sp_CottonSalesDetails_GetAll");
    const rows = result.recordset || [];

    if (req.query.debug === "1") {
      return res
        .type("text/plain")
        .send(`CottonSalesCode=${CottonSalesCode}\nrows=${rows.length}\n` + JSON.stringify(rows.slice(0, 2), null, 2));
    }

    const company = await getCompany(pool, CompanyCode);
    const docDef = buildDocDefinition(rows, company);
    const pdfBuffer = await renderPdf(docDef);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="CottonSales_${CottonSalesCode}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error("cottonSalesPrintDetails:", err);
    res.status(500).type("text/plain").send("ERROR: " + err.message);
  }
};
