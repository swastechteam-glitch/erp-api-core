// ---------------------------------------------------------------------------
// Purchase Order DOC PRINT — data loader + pdfmake document.
//
// Port of rptPODisplay's View() + rptPurchaseOrderWithRate.rdlc. Faithful, FULL
// field set (Item ID, Dis % / Rate / Amt, Purpose, TCS, Amount-in-words, Note),
// rebuilt fresh (the older documentReport/storePurchaseOrderDetails.js doc is a
// simplified subset). The same loadPurchaseOrderDoc() feeds the on-screen HTML
// preview (JSON), the PDF download, and the e-mail attachment — one data source.
//
//   View() data contract:
//     EXEC sp_PurchaseOrder_TaxAbstract_Insert @PurchaseOrderCode, @CompanyCode
//     EXEC sp_PurchaseOrderDetails_GetAll       @CompanyCode, @PurchaseOrderCode  (header row0 + lines)
//     EXEC sp_Company_GetAll                     @CompanyCode                       (buyer header)
//     supplier address / contact from vw_SupplierDetails
//     Net amount -> words (numWord report parameter)
// ---------------------------------------------------------------------------

import sql from "mssql";
import { renderPdf, str, dec, fmt, ddmmyyyy } from "../report/cotton/_common.js";
import { amountInWords } from "../../utils/amountInWords.js";

const BORDER = "#9A9A9A";
const HEAD_FILL = "#EEF0FF"; // light indigo tint
const MAROON = "#800000";
const BLUE = "#0000CC";
const GREEN = "#006400";

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};

// mssql Image -> data URI (png/jpg/gif/bmp sniffed from magic bytes).
const bufferToDataUri = (buf) => {
  if (!buf) return null;
  const b = Buffer.isBuffer(buf) ? buf : buf?.data ? Buffer.from(buf.data) : null;
  if (!b || b.length < 4) return null;
  let mime = "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) mime = "image/png";
  else if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) mime = "image/gif";
  else if (b[0] === 0x42 && b[1] === 0x4d) mime = "image/bmp";
  return `data:${mime};base64,${b.toString("base64")}`;
};

// Collapse double commas / stray separators that come from address fields whose
// source data already ends in a comma (keeps the printed address tidy).
const tidy = (s) =>
  String(s || "")
    .replace(/\s*,\s*,+/g, ", ")
    .replace(/,\s*-/g, " -")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,]+|[\s,]+$/g, "");

// pick the first non-empty key (SPs/views vary in column naming across DBs).
const pick = (row, ...keys) => {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== null && v !== undefined && String(v).trim() !== "") return v;
  }
  return "";
};

const loadCompany = async (pool, companyCode) => {
  const r = await pool.request().input("CompanyCode", sql.Int, companyCode).execute("sp_Company_GetAll");
  const c = r.recordset?.[0] || {};
  return {
    name: pick(c, "CompanyName"),
    shortName: pick(c, "CompanyShortName", "ShortName"),
    address1: pick(c, "Address1"),
    address2: pick(c, "Address2"),
    city: pick(c, "City"),
    district: pick(c, "District"),
    pinCode: pick(c, "PinCode", "Pincode"),
    phoneNo: pick(c, "PhoneNo", "PhoneNumber"),
    mobileNo: pick(c, "MainMobileNo", "MobileNo"),
    email: pick(c, "EMail", "Email", "MailID"),
    gstin: pick(c, "GSTINNo", "GSTNo", "GstNo", "GSTIN"),
    pan: pick(c, "PANNo", "PanNo"),
    logo: bufferToDataUri(c.Logo),
  };
};

const loadSupplier = async (pool, supplierCode, h) => {
  let s = {};
  if (supplierCode > 0) {
    try {
      const r = await pool
        .request()
        .input("SupplierCode", sql.Int, supplierCode)
        .query("SELECT TOP 1 * FROM vw_SupplierDetails WHERE SupplierCode = @SupplierCode");
      s = r.recordset?.[0] || {};
    } catch {
      s = {};
    }
  }
  return {
    name: pick(s, "SupplierName") || pick(h, "SupplierName"),
    address1: pick(s, "Address1") || pick(h, "Address1"),
    address2: pick(s, "Address2") || pick(h, "Address2"),
    city: pick(s, "City") || pick(h, "City"),
    district: pick(s, "District") || pick(h, "District"),
    pinCode: pick(s, "PinCode", "Pincode") || pick(h, "PinCode", "Pincode"),
    gstNo: pick(s, "GstNo", "GSTNo") || pick(h, "GstNo", "GSTNo"),
    mobileNo: pick(s, "MainMobileNo", "MobileNo") || pick(h, "MainMobileNo"),
    email: pick(s, "EMail", "Email", "MailID") || pick(h, "MailID", "EMail"),
    contactPerson: pick(s, "ContactPerson"),
  };
};

// Load everything the document needs for one PurchaseOrderCode.
export const loadPurchaseOrderDoc = async (pool, companyCode, code) => {
  let taxAbstract = [];
  try {
    const ta = await pool
      .request()
      .input("PurchaseOrderCode", sql.Int, code)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_PurchaseOrder_TaxAbstract_Insert");
    taxAbstract = ta.recordset || [];
  } catch {
    /* abstract is best-effort — the RDLC pre-populates it; our totals come from the header */
  }

  const det = await pool
    .request()
    .input("CompanyCode", sql.Int, companyCode)
    .input("PurchaseOrderCode", sql.Int, code)
    .execute("sp_PurchaseOrderDetails_GetAll");
  const recs = det.recordset || [];
  if (!recs.length) throw new Error("Purchase Order not found");
  const h = recs[0] || {};

  const [company, supplier] = await Promise.all([
    loadCompany(pool, companyCode),
    loadSupplier(pool, toInt(h.SupplierCode), h),
  ]);

  const items = recs.map((r, i) => {
    const amount = dec(r, "Amount"); // gross (Qty x Rate)
    const discAmt = dec(r, "DiscountAmount");
    return {
      sno: i + 1,
      itemId: str(r, "ItemID"),
      itemName: str(r, "ItemName"),
      partNumber: str(r, "PartNumber"),
      reason: str(r, "Reason"),
      qty: dec(r, "Qty"),
      uom: str(r, "ItemUomName"),
      rate: dec(r, "Rate"),
      discPer: dec(r, "DiscountPer"),
      discRate: dec(r, "DiscountPerRate"),
      discAmt,
      total: amount - discAmt,
      gstPer: dec(r, "CGSTPer") + dec(r, "SGSTPer") + dec(r, "IGSTPer"),
      purpose: pick(r, "Purpose", "PurposeName"),
    };
  });

  const totals = {
    totalQty: items.reduce((a, b) => a + b.qty, 0),
    subTotal: dec(h, "TotalGrossAmount"),
    otherExpenses: dec(h, "TotalOtherExpenses"),
    pfAmount: dec(h, "TotalPFAmount"),
    cgst: dec(h, "TotalCGSTAmount"),
    sgst: dec(h, "TotalSGSTAmount"),
    igst: dec(h, "TotalIGSTAmount"),
    tcs: dec(h, "TotalTCSAmount"),
    roundedOff: dec(h, "Roundedoff") || dec(h, "TotalRoundedOff"),
    netAmount: dec(h, "TotalNetAmount"),
  };

  return {
    company,
    supplier,
    header: {
      purchaseOrderCode: toInt(h.PurchaseOrderCode) || toInt(code),
      purchaseOrderNo: pick(h, "PurchaseOrderNo"),
      purchaseOrderDate: h.PurchaseOrderDate || null,
      refNo: str(h, "RefNo"),
      deliveryDate: h.DeliveryDate || null,
      warranty: str(h, "Warrenty"),
      modeOfDespatch: str(h, "ModeOfDespatchName"),
      transporter: str(h, "TransporterName"),
      paymentTerms: str(h, "PurchaseMode"),
      specialTerms: str(h, "SpecialTerms"),
      remarks: str(h, "Remarks"),
    },
    items,
    totals,
    amountInWords: amountInWords(totals.netAmount),
    taxAbstract,
  };
};

// pdfmake content array for ONE purchase order.
const buildPoContent = (doc) => {
  const { company: c, supplier: s, header: h, items, totals: t } = doc;

  const itemHead = ["S.No", "Item ID", "Item Name", "Qty", "UOM", "Unit Rate", "Dis %", "Dis Rate", "Dis Amt", "Total", "GST %", "Purpose"].map(
    (txt) => ({ text: txt, bold: true, fontSize: 7, alignment: "center", fillColor: HEAD_FILL }),
  );
  const body = [itemHead];
  items.forEach((r) => {
    const nameStack = [{ text: r.itemName, fontSize: 7 }];
    if (r.partNumber) nameStack.push({ text: r.partNumber, fontSize: 6, color: "#666" });
    body.push([
      { text: String(r.sno), fontSize: 7, alignment: "center" },
      { text: r.itemId, fontSize: 7 },
      { stack: nameStack },
      { text: fmt(r.qty, 2), fontSize: 7, alignment: "right" },
      { text: r.uom, fontSize: 7, alignment: "center" },
      { text: fmt(r.rate, 2), fontSize: 7, alignment: "right" },
      { text: fmt(r.discPer, 2), fontSize: 7, alignment: "right" },
      { text: fmt(r.discRate, 2), fontSize: 7, alignment: "right" },
      { text: fmt(r.discAmt, 2), fontSize: 7, alignment: "right" },
      { text: fmt(r.total, 2), fontSize: 7, alignment: "right" },
      { text: fmt(r.gstPer, 2), fontSize: 7, alignment: "right" },
      { text: r.reason, fontSize: 7 },
    ]);
  });
  // table Total row (sum of the Total column)
  const totalLine = items.reduce((a, b) => a + b.total, 0);
  body.push([
    { text: "Total", colSpan: 9, alignment: "right", bold: true, fontSize: 7.5 },
    {}, {}, {}, {}, {}, {}, {}, {},
    { text: fmt(totalLine, 2), bold: true, fontSize: 7.5, alignment: "right" },
    { text: "", colSpan: 2 }, {},
  ]);

  const totalsRows = [
    ["Other Expenses", t.otherExpenses],
    ["Packing & Forward", t.pfAmount],
    ["Sub Total", t.subTotal],
    ["CGST Amount", t.cgst],
    ["SGST Amount", t.sgst],
    ["IGST Amount", t.igst],
    ["TCS Amount", t.tcs],
    ["Rounded Off", t.roundedOff],
  ].map(([k, v]) => [
    { text: k, fontSize: 8 },
    { text: fmt(v, 2), fontSize: 8, alignment: "right" },
  ]);
  totalsRows.push([
    { text: "Net Amount (INR)", bold: true, fontSize: 9, fillColor: HEAD_FILL },
    { text: fmt(t.netAmount, 2), bold: true, fontSize: 9, alignment: "right", fillColor: HEAD_FILL },
  ]);

  const kv = (label, value) => ({
    columns: [
      { width: 95, text: label, bold: true, fontSize: 8 },
      { width: "auto", text: ":", fontSize: 8 },
      { width: "*", text: " " + (value || ""), fontSize: 8 },
    ],
    margin: [0, 1, 0, 1],
  });

  const companyAddr = tidy([c.address1, c.address2, c.city, c.district, c.pinCode ? "- " + c.pinCode : ""].filter(Boolean).join(", "));
  const companyContacts = [
    c.phoneNo || c.mobileNo ? "Ph No. : " + [c.phoneNo, c.mobileNo].filter(Boolean).join(", ") : "",
    c.email ? "E-Mail : " + c.email : "",
  ].filter(Boolean).join("    ");
  const companyTax = [c.gstin ? "GSTIN : " + c.gstin : "", c.pan ? "PAN No. : " + c.pan : ""].filter(Boolean).join("    ");

  return [
    // ---- company header ----
    {
      columns: [
        c.logo ? { image: c.logo, fit: [58, 58], width: 66 } : { text: "", width: 66 },
        {
          width: "*",
          stack: [
            { text: c.name || "", color: MAROON, bold: true, fontSize: 15, alignment: "center" },
            { text: companyAddr, fontSize: 8, alignment: "center", margin: [0, 2, 0, 0] },
            { text: companyContacts, fontSize: 8, alignment: "center" },
            { text: companyTax, fontSize: 8, bold: true, alignment: "center" },
          ],
        },
        { text: "", width: 66 },
      ],
    },
    { canvas: [{ type: "line", x1: 0, y1: 6, x2: 535, y2: 6, lineWidth: 1, lineColor: BORDER }] },
    { text: "PURCHASE ORDER", color: BLUE, bold: true, fontSize: 14, alignment: "center", margin: [0, 6, 0, 6] },
    // ---- To + PO meta ----
    {
      columns: [
        {
          width: "*",
          stack: [
            { text: "To :", bold: true, fontSize: 9 },
            { text: s.name, bold: true, fontSize: 9 },
            { text: tidy([s.address1, s.address2, s.city, s.district, s.pinCode ? "- " + s.pinCode : ""].filter(Boolean).join(", ")), fontSize: 9 },
            { text: s.gstNo ? "GST No : " + s.gstNo : "", fontSize: 9 },
            { text: [s.mobileNo ? "Ph: " + s.mobileNo : "", s.email ? "Mail: " + s.email : ""].filter(Boolean).join("   "), fontSize: 9 },
          ],
        },
        {
          width: 180,
          stack: [
            { text: "P.O No. : " + h.purchaseOrderNo, bold: true, color: GREEN, fontSize: 11 },
            { text: "DATE     : " + ddmmyyyy(h.purchaseOrderDate), bold: true, color: GREEN, fontSize: 11, margin: [0, 3, 0, 0] },
            { text: h.refNo ? "Ref No. : " + h.refNo : "", fontSize: 9, margin: [0, 3, 0, 0] },
          ],
        },
      ],
      margin: [0, 4, 0, 6],
    },
    { text: "Dear Sir,", bold: true, fontSize: 9 },
    {
      text: "Please send original and Duplicate Copies of the Invoice to the Mills and Copy to the administrative office.",
      fontSize: 8, margin: [0, 2, 0, 1],
    },
    {
      text: "With reference to your quotation we have pleasure in placing your order for supply of the following materials.",
      fontSize: 8, margin: [0, 0, 0, 6],
    },
    // ---- items ----
    {
      table: { headerRows: 1, widths: [18, 46, "*", 34, 28, 44, 26, 36, 44, 50, 28, 50], body },
      layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => BORDER, vLineColor: () => BORDER },
    },
    // ---- terms (left) + totals (right) ----
    {
      columns: [
        {
          width: "*",
          margin: [0, 8, 8, 0],
          stack: [
            { text: "Terms & Conditions", bold: true, decoration: "underline", fontSize: 9, margin: [0, 0, 0, 3] },
            { text: h.specialTerms || "", fontSize: 7.5, lineHeight: 1.15 },
          ],
        },
        {
          width: 210,
          margin: [0, 8, 0, 0],
          table: { widths: ["*", 84], body: totalsRows },
          layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => BORDER, vLineColor: () => BORDER },
        },
      ],
    },
    // ---- footer meta block ----
    {
      margin: [0, 10, 0, 0],
      table: {
        widths: ["*", "*"],
        body: [
          [
            { stack: [kv("Delivery", ddmmyyyy(h.deliveryDate)), kv("Warranty", h.warranty), kv("Mode of Despatch", h.modeOfDespatch), kv("Transporter Name", h.transporter)], border: [true, true, true, true] },
            { stack: [kv("Payment Terms", h.paymentTerms), kv("Amount in words", doc.amountInWords)], border: [true, true, true, true] },
          ],
        ],
      },
      layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => BORDER, vLineColor: () => BORDER },
    },
    { text: "Note : " + (h.remarks || ""), fontSize: 8, margin: [0, 6, 0, 0] },
    // ---- signatures ----
    {
      margin: [0, 26, 0, 0],
      columns: [
        { text: "STORES", bold: true, fontSize: 9, alignment: "center", margin: [0, 22, 0, 0] },
        { text: "G.M", bold: true, fontSize: 9, alignment: "center", margin: [0, 22, 0, 0] },
        { text: "M.D", bold: true, fontSize: 9, alignment: "center", margin: [0, 22, 0, 0] },
      ],
    },
  ];
};

// Build a PDF Buffer for one or many docs (page break between POs).
export const buildPoPdfBuffer = async (docs) => {
  const content = [];
  docs.forEach((doc, i) => {
    const block = buildPoContent(doc);
    if (i > 0 && block[0]) block[0] = { ...block[0], pageBreak: "before" };
    content.push(...block);
  });
  const docDef = {
    pageSize: "A4",
    pageMargins: [28, 24, 28, 30],
    footer: (cp, pc) => ({
      margin: [28, 6, 28, 0],
      columns: [
        { text: "*** PLEASE MENTION OUR PURCHASE ORDER NUMBER IN YOUR INVOICE.", fontSize: 7, bold: true },
        { text: `Page ${cp} of ${pc}`, alignment: "right", fontSize: 7, color: "#555" },
      ],
    }),
    content,
    defaultStyle: { font: "Roboto", fontSize: 9 },
  };
  return renderPdf(docDef);
};
