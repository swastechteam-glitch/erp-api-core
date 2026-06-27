import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";
import { getSuppliers } from "../utils/masters.js";
import { sendCompanyMail } from "../services/mail.service.js";
import { loadPurchaseOrderDoc, buildPoPdfBuffer } from "./documentReport/purchaseOrderDocPrint.js";

// ---------------------------------------------------------------------------
// Purchase Order Doc Print (port of rptPODisplay). Filter approved/pending POs,
// preview the PO document, print it, download a PDF, and e-mail the PO (as a PDF
// attachment) to the supplier. Read-only over the PO data + a server-side mail
// step (credentials from tbl_Email per company — never from the client).
//
//   Status -> list SP:
//     allApproved -> sp_PurchaseOrder_Print @FromDate,@Todate,@AllApprove=1
//     all         -> sp_PurchaseOrder_Print @FromDate,@Todate
//     stage1      -> sp_PurchaseOrder_Approval_1_Pendings
//     gm          -> sp_PurchaseOrder_Approval_2_Pendings
//     md          -> sp_PurchaseOrder_Approval_3_Pendings
//   Not-fully-received badge: sp_PurchaseOrderDetails_Pending @AllApprove=0,@CompanyCode
//     summed per PurchaseOrderCode (VB Pendingsloading / cell painting).
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};
const str = (v) => (v ?? "").toString().trim();
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getFYCode = (req) => toInt(req.headers.FYCode);
// The screen drives off a SELECTED company (may differ from the session company
// when logged into a group); fall back to the session company.
const reqCompany = (req) => toInt(req.query.companyCode) || getCompanyCode(req);
const D = (v) => (v ? new Date(v) : null);
const codeList = (v) =>
  String(v ?? "")
    .split(",")
    .map((x) => toInt(x))
    .filter((x) => x > 0);
const pick = (row, ...keys) => {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== null && v !== undefined && String(v).trim() !== "") return v;
  }
  return null;
};

// GET /purchase-order-print/companies
export const getCompanies = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const companyCode = getCompanyCode(req);
    const r = pool.request();
    if (companyCode > 0) r.input("CompanyCode", sql.Int, companyCode);
    const result = await r.execute("sp_Company_GetAll");
    const data = (result.recordset || []).map((c) => ({
      value: toInt(c.CompanyCode),
      label: str(c.CompanyName),
    }));
    return sendSuccess(res, data);
  } catch (err) {
    console.error("DB Error (POPrint.getCompanies):", err);
    return sendError(res, err);
  }
};

// GET /purchase-order-print/suppliers
export const getSupplierList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const data = await getSuppliers(pool, { usage: "stores" });
    return sendSuccess(res, data);
  } catch (err) {
    console.error("DB Error (POPrint.getSupplierList):", err);
    return sendError(res, err);
  }
};

// GET /purchase-order-print/orders?supplierCode=
export const getOrders = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const supplierCode = toInt(req.query.supplierCode);
    const r = pool
      .request()
      .input("CompanyCode", sql.Int, reqCompany(req))
      .input("FYCode", sql.Int, getFYCode(req));
    let where = "WHERE CompanyCode = @CompanyCode AND FYCode = @FYCode";
    if (supplierCode > 0) {
      r.input("SupplierCode", sql.Int, supplierCode);
      where += " AND SupplierCode = @SupplierCode";
    }
    const result = await r.query(
      `SELECT DISTINCT PurchaseOrderCode,
         (CONVERT(varchar, PurchaseOrderNo) + ' - ' + SupplierName) AS PurchaseOrderNo,
         SupplierCode
       FROM vw_PurchaseOrderDetails ${where}
       GROUP BY PurchaseOrderCode, PurchaseOrderNo, SupplierCode, SupplierName
       ORDER BY PurchaseOrderCode DESC`,
    );
    const data = (result.recordset || []).map((o) => ({
      value: toInt(o.PurchaseOrderCode),
      label: str(o.PurchaseOrderNo),
      SupplierCode: toInt(o.SupplierCode),
    }));
    return sendSuccess(res, data);
  } catch (err) {
    console.error("DB Error (POPrint.getOrders):", err);
    return sendError(res, err);
  }
};

// GET /purchase-order-print/list?status=&fromDate=&toDate=&supplierCode=&orderCode=
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const companyCode = reqCompany(req);
    const status = str(req.query.status) || "allApproved";

    let result;
    if (status === "allApproved" || status === "all") {
      const r = pool.request();
      if (req.query.fromDate) r.input("FromDate", sql.DateTime, D(req.query.fromDate));
      if (req.query.toDate) r.input("Todate", sql.DateTime, D(req.query.toDate));
      if (status === "allApproved") r.input("AllApprove", sql.Int, 1);
      result = await r.execute("sp_PurchaseOrder_Print");
    } else {
      const sp =
        status === "stage1"
          ? "sp_PurchaseOrder_Approval_1_Pendings"
          : status === "gm"
          ? "sp_PurchaseOrder_Approval_2_Pendings"
          : "sp_PurchaseOrder_Approval_3_Pendings";
      result = await pool.request().execute(sp);
    }

    // Not-fully-received: pending qty summed per PO.
    const pendMap = new Map();
    try {
      const pend = await pool
        .request()
        .input("AllApprove", sql.Int, 0)
        .input("CompanyCode", sql.Int, companyCode)
        .execute("sp_PurchaseOrderDetails_Pending");
      for (const p of pend.recordset || []) {
        const c = toInt(p.PurchaseOrderCode);
        if (!c) continue;
        pendMap.set(c, (pendMap.get(c) || 0) + toNum(pick(p, "PendingQty", "Pending", "Qty")));
      }
    } catch {
      /* badge is best-effort */
    }

    const supFilter = codeList(req.query.supplierCode);
    const ordFilter = codeList(req.query.orderCode);

    const rows = (result.recordset || [])
      .map((r) => {
        const code = toInt(r.PurchaseOrderCode);
        const pendingQty = pendMap.get(code) || 0;
        return {
          id: code,
          PurchaseOrderCode: code,
          SupplierCode: toInt(r.SupplierCode),
          PurchaseOrderNo: str(pick(r, "PurchaseOrderNo", "OrderNo", "Order_No", "PONo")),
          PurchaseOrderDate: pick(r, "PurchaseOrderDate", "OrderDate", "Order_Date", "PODate"),
          SupplierName: str(r.SupplierName),
          TotalQty: toNum(pick(r, "TotalQty", "Qty")),
          TotalAmount: toNum(pick(r, "TotalNetAmount", "TotalAmount", "Total", "NetAmount")),
          pendingQty: Math.round(pendingQty * 1000) / 1000,
          notFullyReceived: pendingQty > 0,
          // Audit trail — already returned by the list SPs (column names vary per
          // status path; the GM-pending SP names the store approver "Approve_User").
          createdUser: str(pick(r, "EntryUser", "Entry_User", "UName")),
          createdDate: pick(r, "EntryDate", "Entry_Date", "C_Date") || null,
          storeUser: str(pick(r, "Approve1_UserName", "Approve_User")),
          storeDate: pick(r, "Approve1_Date", "Approve_Date") || null,
          gmUser: str(pick(r, "Approve2_UserName")),
          gmDate: pick(r, "Approve2_Date") || null,
          mdUser: str(pick(r, "Approve3_UserName")),
          mdDate: pick(r, "Approve3_Date") || null,
        };
      })
      .filter((r) => (supFilter.length ? supFilter.includes(r.SupplierCode) : true))
      .filter((r) => (ordFilter.length ? ordFilter.includes(r.PurchaseOrderCode) : true))
      .sort((a, b) => b.PurchaseOrderCode - a.PurchaseOrderCode);

    return sendSuccess(res, rows);
  } catch (err) {
    console.error("DB Error (POPrint.getList):", err);
    return sendError(res, err);
  }
};

// GET /purchase-order-print/document?purchaseOrderCode=&companyCode=
export const getDocument = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.query.purchaseOrderCode);
    if (code <= 0) return sendError(res, "Invalid PurchaseOrderCode", 400);
    const companyCode = reqCompany(req);
    if (companyCode <= 0) return sendError(res, "Select the Company", 400);
    const pool = await getPool(req.headers.subdbname);
    const document = await loadPurchaseOrderDoc(pool, companyCode, code);

    const s = document.supplier;
    const addr = [s.address1, s.address2].filter(Boolean).join(", ");
    const emailDefaults = {
      to: s.email || "",
      subject: `Purchase Order - ${document.header.purchaseOrderNo}`,
      body:
        `Dear Sir,\nKind Attn : ${s.contactPerson || ""}\n` +
        `${s.name || ""}\n${addr}\n\n` +
        `Please find attached our Purchase Order No. ${document.header.purchaseOrderNo}.`,
    };
    return sendSuccess(res, { document, emailDefaults });
  } catch (err) {
    console.error("DB Error (POPrint.getDocument):", err);
    return sendError(res, err);
  }
};

// GET /purchase-order-print/pdf?purchaseOrderCode=  OR  ?codes=1,2,3
export const getPdf = async (req, res) => {
  try {
    if (!req.headers.subdbname) return res.status(400).type("text/plain").send("Missing subDBName");
    const codes = req.query.codes ? codeList(req.query.codes) : codeList(req.query.purchaseOrderCode);
    if (!codes.length) return res.status(400).type("text/plain").send("No PurchaseOrderCode");
    const companyCode = reqCompany(req);
    if (companyCode <= 0) return res.status(400).type("text/plain").send("Select the Company");
    const pool = await getPool(req.headers.subdbname);

    const docs = [];
    for (const c of codes) {
      docs.push(await loadPurchaseOrderDoc(pool, companyCode, c));
    }
    const pdf = await buildPoPdfBuffer(docs);
    const name = codes.length === 1 ? `PurchaseOrder_${docs[0].header.purchaseOrderNo || codes[0]}` : `PurchaseOrders_${codes.length}`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${name}.pdf"`);
    return res.send(pdf);
  } catch (err) {
    console.error("DB Error (POPrint.getPdf):", err);
    return res.status(500).type("text/plain").send("ERROR: " + err.message);
  }
};

// POST /purchase-order-print/email
//   single: { companyCode, purchaseOrderCode, to, subject, body }
//   bulk:   { companyCode, items: [{ purchaseOrderCode, to, subject, body }] }
export const sendEmail = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const b = req.body || {};
    const companyCode = toInt(b.companyCode) || getCompanyCode(req);
    if (companyCode <= 0) return sendError(res, "Select the Company", 400);

    const items = Array.isArray(b.items) && b.items.length
      ? b.items
      : [{ purchaseOrderCode: b.purchaseOrderCode, to: b.to, subject: b.subject, body: b.body }];

    const pool = await getPool(req.headers.subdbname);
    const results = [];
    for (const it of items) {
      const code = toInt(it.purchaseOrderCode);
      try {
        if (code <= 0) throw new Error("Invalid PurchaseOrderCode");
        const doc = await loadPurchaseOrderDoc(pool, companyCode, code);
        const to = str(it.to) || str(doc.supplier.email);
        if (!to) throw new Error("No recipient email for this supplier");
        const subject = str(it.subject) || `Purchase Order - ${doc.header.purchaseOrderNo}`;
        const text = str(it.body) || `Please find attached our Purchase Order No. ${doc.header.purchaseOrderNo}.`;
        const pdf = await buildPoPdfBuffer([doc]);
        await sendCompanyMail({
          pool,
          companyCode,
          fromName: doc.company.shortName || doc.company.name,
          to,
          subject,
          text,
          attachments: [{ filename: `PurchaseOrder_${doc.header.purchaseOrderNo || code}.pdf`, content: pdf }],
        });
        results.push({ purchaseOrderCode: code, to, sent: true });
      } catch (e) {
        results.push({ purchaseOrderCode: code, sent: false, error: e.message });
      }
    }

    const sent = results.filter((r) => r.sent).length;
    const failed = results.length - sent;
    if (sent === 0) return sendError(res, results[0]?.error || "Mail send failed", 502);
    return sendSuccess(res, { results, sent, failed }, failed ? `Sent ${sent}, failed ${failed}` : "Mail Sent Successfully");
  } catch (err) {
    console.error("DB Error (POPrint.sendEmail):", err);
    return sendError(res, err);
  }
};
