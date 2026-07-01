// ---------------------------------------------------------------------------
// E-Invoice controller — GST IRN generation via the GSTRobo GSP.
//
//   GET  /einvoice/health    -> verifies GSP auth (token can be obtained)
//   GET  /einvoice/config    -> seller defaults (GSTIN) for prefilling the UI
//   POST /einvoice/generate  -> builds NIC payload, calls GSP, returns IRN + QR
//
// Standalone (manual-entry) flow: the React form posts a friendly invoice
// object; we map it to the GSTN schema, call the GSP, then render the signed
// QR text into a PNG data-URL so the UI can show a scannable code. Nothing is
// persisted to SQL (display + download only).
// ---------------------------------------------------------------------------

import QRCode from "qrcode";
import sql from "mssql";
import { sendSuccess, sendError } from "../utils/response.js";
import { einvoiceConfig as cfg, SALESTYPE_VIEW } from "../config/einvoice.config.js";
import { getPool } from "../config/dynamicDB.js";
import { saveEInvoiceRecord } from "../services/einvoiceStore.service.js";
import { resolveEInvoiceConfig } from "../services/einvoicePortal.service.js";
import {
  authenticate,
  generateEInvoice,
  buildNicPayload,
  normalizeResponse,
} from "../services/einvoice.service.js";

// Minimal payload validation mirroring the GSP's mandatory fields.
const validate = (b) => {
  const errors = [];
  const d = b.document || {};
  const s = b.seller || {};
  const buy = b.buyer || {};
  const items = Array.isArray(b.items) ? b.items : [];

  if (!d.no) errors.push("Document number is required");
  if (!d.date) errors.push("Document date is required (dd/mm/yyyy)");
  if (!s.gstin) errors.push("Seller GSTIN is required");
  if (!s.legalName) errors.push("Seller legal name is required");
  if (!s.address1) errors.push("Seller address is required");
  if (!s.location) errors.push("Seller location is required");
  if (!s.pincode) errors.push("Seller pincode is required");
  if (!s.stateCode) errors.push("Seller state code is required");
  if (!buy.gstin) errors.push("Buyer GSTIN is required");
  if (!buy.legalName) errors.push("Buyer legal name is required");
  if (!buy.address1) errors.push("Buyer address is required");
  if (!buy.location) errors.push("Buyer location is required");
  if (!buy.pincode) errors.push("Buyer pincode is required");
  if (!buy.stateCode) errors.push("Buyer state code is required");
  if (!items.length) errors.push("At least one item is required");
  items.forEach((it, i) => {
    if (!it.productName) errors.push(`Item ${i + 1}: product description required`);
    if (!it.hsnCode) errors.push(`Item ${i + 1}: HSN code required`);
  });
  return errors;
};

// GET /einvoice/health — confirms the GSP credentials work.
export const checkEInvoiceAuth = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    let portalCfg = cfg;
    if (subDbName) {
      const pool = await getPool(subDbName);
      const companyCode = req.query.CompanyCode ?? req.headers.companycode;
      portalCfg = (await resolveEInvoiceConfig(pool, companyCode)) || cfg;
    }
    await authenticate(portalCfg, true);
    return sendSuccess(res, { authenticated: true }, "E-Invoice service connected");
  } catch (err) {
    console.error("E-Invoice auth check failed:", err.message);
    return sendError(res, err.message || "E-Invoice authentication failed", 502);
  }
};

// GET /einvoice/config — non-secret seller defaults the UI can prefill, read
// from tbl_GST_PortalDetails (GST PORTAL) for the company; static GSTIN fallback.
export const getEInvoiceConfig = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (subDbName) {
      const pool = await getPool(subDbName);
      const companyCode = req.query.CompanyCode ?? req.headers.companycode;
      const p = await resolveEInvoiceConfig(pool, companyCode);
      if (p) {
        return sendSuccess(res, {
          gstin: p.gstin,
          legalName: p.legalName,
          tradeName: p.tradeName,
          address1: p.address1,
          address2: p.address2,
          location: p.location,
          pincode: p.pincode,
          stateCode: p.stateCode,
          email: p.email,
          mobile: p.mobile,
        });
      }
    }
  } catch (err) {
    console.warn("getEInvoiceConfig fell back to static:", err.message);
  }
  return sendSuccess(res, { gstin: cfg.gstin });
};

// ---------------------------------------------------------------------------
// GET /einvoice/worklist — the sales-day-book documents the E-Invoice / E-Way-Bill
// screens (Generate/Cancel IRN, Generate/Cancel EWB, Printout) list.
//   Query: CompanyCode, FromDate, ToDate, FYCode?, SalesType?
// Reads from vw_SalesDayBook (each row carries its SalesType, which maps to a
// detail view — see SALESTYPE_VIEW). Rows are returned as-is; the UI normalises
// the column names it displays.
// ---------------------------------------------------------------------------
export const getEInvoiceWorklist = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) return sendError(res, "Missing subDBName header", 400);
    const pool = await getPool(subDbName);
    const { CompanyCode, FromDate, ToDate, FYCode, SalesType } = req.query;

    const r = pool.request();
    const where = [];
    if (CompanyCode) {
      r.input("CompanyCode", sql.Int, parseInt(CompanyCode) || 0);
      where.push("CompanyCode = @CompanyCode");
    }
    if (FromDate) {
      r.input("FromDate", sql.DateTime, new Date(FromDate));
      where.push("SalesDayBookDate >= @FromDate");
    }
    if (ToDate) {
      r.input("ToDate", sql.DateTime, new Date(ToDate));
      where.push("SalesDayBookDate < DATEADD(day, 1, @ToDate)");
    }
    if (FYCode) {
      r.input("FYCode", sql.Int, parseInt(FYCode) || 0);
      where.push("FYCode = @FYCode");
    }
    if (SalesType) {
      r.input("SalesType", sql.VarChar(30), String(SalesType));
      where.push("SalesType = @SalesType");
    }

    const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
    const result = await r.query(
      `SELECT * FROM vw_SalesDayBook ${whereSql} ORDER BY SalesDayBookDate, SalesDayBookNo`
    );
    return sendSuccess(res, result.recordset || []);
  } catch (err) {
    console.error("E-Invoice worklist error:", err);
    return sendError(res, err.message || "Failed to load the worklist", 500);
  }
};

// POST /einvoice/generate — main generation endpoint.
export const generateInvoice = async (req, res) => {
  try {
    const body = req.body || {};

    // Resolve the portal config from tbl_GST_PortalDetails (per company). Falls
    // back to the static config when there's no sub-DB / matching row.
    const subDbName = req.headers.subdbname;
    const companyCode = body.meta?.companyCode ?? req.query.CompanyCode;
    let pool = null;
    let portalCfg = cfg;
    if (subDbName) {
      pool = await getPool(subDbName);
      portalCfg = (await resolveEInvoiceConfig(pool, companyCode)) || cfg;
    }

    // Fill seller defaults from the portal config (any UI-supplied value wins).
    body.seller = {
      gstin: portalCfg.gstin,
      legalName: portalCfg.legalName,
      tradeName: portalCfg.tradeName,
      address1: portalCfg.address1,
      address2: portalCfg.address2,
      location: portalCfg.location,
      pincode: portalCfg.pincode,
      stateCode: portalCfg.stateCode,
      email: portalCfg.email,
      phone: portalCfg.mobile,
      ...(body.seller || {}),
    };

    const errors = validate(body);
    if (errors.length) return sendError(res, errors.join("; "), 400);

    const nicPayload = buildNicPayload(body);
    const gspReply = await generateEInvoice(portalCfg, nicPayload);
    const result = normalizeResponse(gspReply);

    if (!result.success) {
      // Surface the GSP's own validation messages back to the form.
      const detail = Array.isArray(result.errors)
        ? result.errors
            .map((e) => e.ErrorMessage || e.message || e.Desc || JSON.stringify(e))
            .join("; ")
        : result.message;
      return sendError(res, detail || "E-Invoice generation failed", 422);
    }

    // Render the signed QR text into a scannable PNG (data URL) for the UI.
    let qrImage = null;
    if (result.signedQRCode) {
      try {
        qrImage = await QRCode.toDataURL(result.signedQRCode, {
          margin: 1,
          width: 240,
          errorCorrectionLevel: "M",
        });
      } catch (qrErr) {
        console.warn("QR render failed:", qrErr.message);
      }
    }

    // Persist to tbl_GST_EInvoice (best-effort; a store failure never fails the
    // IRN response). Needs the sub-database header + a `meta` block on the body
    // carrying company / FY / sales-type / source document identifiers.
    let eInvoiceCode = null;
    try {
      if (pool) {
        const m = body.meta || {};
        const v = body.value || {};
        eInvoiceCode = await saveEInvoiceRecord(pool, {
          companyCode: m.companyCode ?? companyCode,
          fyCode: m.fyCode ?? req.query.FYCode,
          salesType: m.salesType,
          sourceView: m.sourceView || SALESTYPE_VIEW[m.salesType],
          salesDayBookCode: m.salesDayBookCode,
          refCode: m.refCode,
          documentType: body.document?.type,
          documentNo: body.document?.no,
          documentDate: m.documentDateISO || body.document?.date,
          vendorCode: m.vendorCode,
          customerName: body.buyer?.legalName,
          buyerGstin: body.buyer?.gstin,
          taxableValue: v.assessableValue,
          cgstValue: v.cgstValue,
          sgstValue: v.sgstValue,
          igstValue: v.igstValue,
          cessValue: v.cessValue,
          otherCharges: v.otherCharges,
          roundOff: v.roundOff,
          totalValue: v.totalInvoiceValue,
          irp: m.irp || "NIC1",
          irn: result.irn,
          ackNo: result.ackNo,
          ackDate: m.ackDateISO || result.ackDt,
          signedInvoice: result.signedInvoice,
          signedQRCode: result.signedQRCode,
          ewayBillNo: m.ewayBillNo,
          ewayBillDate: m.ewayBillDate,
          ewayBillValidUpto: m.ewayBillValidUpto,
          irnStatus: "ACTIVE",
          requestJson: JSON.stringify(nicPayload),
          responseJson: JSON.stringify(gspReply),
          createdBy: m.createdBy || req.headers.username || null,
        });
      }
    } catch (persistErr) {
      console.warn("E-Invoice persist to tbl_GST_EInvoice failed:", persistErr.message);
    }

    return sendSuccess(
      res,
      {
        eInvoiceCode,
        irn: result.irn,
        ackNo: result.ackNo,
        ackDt: result.ackDt,
        signedQRCode: result.signedQRCode,
        signedInvoice: result.signedInvoice,
        qrImage,
        document: body.document,
      },
      result.message || "E-Invoice generated successfully",
      201
    );
  } catch (err) {
    console.error("E-Invoice generate error:", err);
    return sendError(res, err.message || "E-Invoice generation failed", 500);
  }
};
