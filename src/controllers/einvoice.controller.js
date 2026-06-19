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
import { sendSuccess, sendError } from "../utils/response.js";
import { einvoiceConfig as cfg } from "../config/einvoice.config.js";
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
    await authenticate(true);
    return sendSuccess(res, { authenticated: true }, "E-Invoice service connected");
  } catch (err) {
    console.error("E-Invoice auth check failed:", err.message);
    return sendError(res, err.message || "E-Invoice authentication failed", 502);
  }
};

// GET /einvoice/config — non-secret defaults the UI can prefill (seller GSTIN).
export const getEInvoiceConfig = (req, res) =>
  sendSuccess(res, { gstin: cfg.gstin });

// POST /einvoice/generate — main generation endpoint.
export const generateInvoice = async (req, res) => {
  try {
    const body = req.body || {};

    const errors = validate(body);
    if (errors.length) return sendError(res, errors.join("; "), 400);

    // Default seller GSTIN to the configured tax-payer if the UI left it blank.
    body.seller = { gstin: cfg.gstin, ...(body.seller || {}) };

    const nicPayload = buildNicPayload(body);
    const gspReply = await generateEInvoice(nicPayload);
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

    return sendSuccess(
      res,
      {
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
