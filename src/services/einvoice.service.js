// ---------------------------------------------------------------------------
// E-Invoice service — talks to the GSTRobo GSP.
//
//   authenticate()        -> returns a (cached) AuthToken
//   generateEInvoice()    -> posts a NIC-schema invoice, returns the GSP reply
//   buildNicPayload()     -> maps our friendly invoice object -> GSTN schema v1.1
//   normalizeResponse()   -> flattens the various GSP success/error shapes
//
// GSTRobo wraps payloads inconsistently across environments (data / Data /
// result), so every extraction below probes the common locations and is easy
// to tighten once the exact contract is confirmed ("I'll adjust").
// ---------------------------------------------------------------------------

import axios from "axios";
import { einvoiceConfig as staticCfg } from "../config/einvoice.config.js";

// Per-portal token cache. Key = gstin|clientId|authUrl, so e-invoice vs EWB (and
// different companies / GSTINs) cache independently. { token, sek, expiresAt }
const tokenCache = new Map();
const cacheKey = (c) => `${c.gstin}|${c.clientId}|${c.authUrl}`;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Headers every GSP call carries, from the RESOLVED portal config (DB-driven,
// see einvoicePortal.service.js). Adjust key casing here if GSTRobo differs.
const baseHeaders = (c) => ({
  gstin: c.gstin,
  client_id: c.clientId,
  client_secret: c.clientSecret,
  ip_address: c.ipAddress,
  "Content-Type": "application/json",
});

const pick = (obj, keys) => {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== "")
      return obj[k];
  }
  return undefined;
};

// ---------------------------------------------------------------------------
// Authentication (token cached & auto-refreshed). `cfg` is the resolved portal
// config (falls back to the static config).
// ---------------------------------------------------------------------------
export async function authenticate(cfg = staticCfg, force = false) {
  const key = cacheKey(cfg);
  const cached = tokenCache.get(key);
  // Reuse a still-valid token (60s safety margin).
  if (!force && cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token;
  }

  // Discovered GSTRobo TP contract: credentials are HEADERS (gstin / client_id /
  // client_secret), the operation `action` goes in the BODY.
  const res = await axios.post(
    cfg.authUrl,
    { action: cfg.authAction || staticCfg.authAction },
    {
      headers: baseHeaders(cfg),
      timeout: 60_000,
      validateStatus: () => true,
    }
  );

  const body = res.data || {};
  const data = body.data || body.Data || body.result || body;

  const token = pick(data, ["AuthToken", "authToken", "Token", "token"]);
  if (!token) {
    const msg =
      pick(body, ["message", "Message", "error", "errorMessage"]) ||
      JSON.stringify(body).slice(0, 300);
    throw new Error(`E-Invoice authentication failed: ${msg}`);
  }

  const expSeconds =
    num(pick(data, ["TokenExpiry", "ExpiresIn", "expiresIn"])) ||
    cfg.tokenTtlSeconds ||
    staticCfg.tokenTtlSeconds;

  tokenCache.set(key, {
    token,
    sek: pick(data, ["Sek", "sek"]),
    expiresAt: Date.now() + expSeconds * 1000,
  });
  return token;
}

// ---------------------------------------------------------------------------
// Generate IRN — posts a fully-built NIC payload. Retries once on token expiry.
// `cfg` is the resolved portal config.
// ---------------------------------------------------------------------------
export async function generateEInvoice(cfg, nicPayload) {
  const c = cfg || staticCfg;
  const post = async (token) =>
    axios.post(c.invoiceUrl, nicPayload, {
      headers: { ...baseHeaders(c), AuthToken: token, "auth-token": token },
      params: { action: c.generateAction || staticCfg.generateAction },
      timeout: 60_000,
      validateStatus: () => true,
    });

  let token = await authenticate(c);
  let res = await post(token);

  // If the GSP says the token is invalid/expired, refresh once and retry.
  const looksExpired =
    res.status === 401 ||
    /token|unauthor|expired/i.test(JSON.stringify(res.data || "").slice(0, 300));
  if (looksExpired) {
    token = await authenticate(c, true);
    res = await post(token);
  }

  return res.data;
}

// ---------------------------------------------------------------------------
// Map our friendly invoice object -> GSTN e-invoice JSON schema (v1.1).
// ---------------------------------------------------------------------------
export function buildNicPayload(input = {}) {
  const t = input.transaction || {};
  const d = input.document || {};
  const s = input.seller || {};
  const b = input.buyer || {};
  const items = Array.isArray(input.items) ? input.items : [];
  const v = input.value || {};

  const undef = (x) => (x === "" || x === undefined || x === null ? undefined : x);

  return {
    Version: "1.1",
    TranDtls: {
      TaxSch: "GST",
      SupTyp: t.supplyType || "B2B",
      RegRev: t.regRev || "N",
      IgstOnIntra: t.igstOnIntra || "N",
    },
    DocDtls: {
      Typ: d.type || "INV",
      No: String(d.no || ""),
      Dt: d.date, // dd/mm/yyyy
    },
    SellerDtls: {
      Gstin: s.gstin,
      LglNm: s.legalName,
      TrdNm: undef(s.tradeName) || s.legalName,
      Addr1: s.address1,
      Addr2: undef(s.address2),
      Loc: s.location,
      Pin: num(s.pincode),
      Stcd: String(s.stateCode || ""),
      Ph: undef(s.phone),
      Em: undef(s.email),
    },
    BuyerDtls: {
      Gstin: b.gstin,
      LglNm: b.legalName,
      TrdNm: undef(b.tradeName) || b.legalName,
      Pos: String(b.pos || b.stateCode || ""),
      Addr1: b.address1,
      Addr2: undef(b.address2),
      Loc: b.location,
      Pin: num(b.pincode),
      Stcd: String(b.stateCode || ""),
      Ph: undef(b.phone),
      Em: undef(b.email),
    },
    ItemList: items.map((it, i) => ({
      SlNo: String(it.slNo || i + 1),
      PrdDesc: it.productName,
      IsServc: it.isService ? "Y" : "N",
      HsnCd: String(it.hsnCode || ""),
      Qty: num(it.qty),
      Unit: it.unit || "NOS",
      UnitPrice: num(it.unitPrice),
      TotAmt: num(it.totalAmount),
      Discount: num(it.discount),
      AssAmt: num(it.assessableValue),
      GstRt: num(it.gstRate),
      IgstAmt: num(it.igstAmount),
      CgstAmt: num(it.cgstAmount),
      SgstAmt: num(it.sgstAmount),
      TotItemVal: num(it.totalItemValue),
    })),
    ValDtls: {
      AssVal: num(v.assessableValue),
      CgstVal: num(v.cgstValue),
      SgstVal: num(v.sgstValue),
      IgstVal: num(v.igstValue),
      Discount: num(v.discount),
      OthChrg: num(v.otherCharges),
      RndOffAmt: num(v.roundOff),
      TotInvVal: num(v.totalInvoiceValue),
    },
  };
}

// ---------------------------------------------------------------------------
// Flatten the GSP reply into a predictable shape for the controller.
//   -> { success, irn, ackNo, ackDt, signedInvoice, signedQRCode, message, errors, raw }
// ---------------------------------------------------------------------------
export function normalizeResponse(body = {}) {
  const data = body.data || body.Data || body.result || body;

  const irn = pick(data, ["Irn", "irn", "IRN"]);
  const ackNo = pick(data, ["AckNo", "ackNo", "Ack_No"]);
  const ackDt = pick(data, ["AckDt", "ackDt", "Ack_Dt"]);
  const signedInvoice = pick(data, ["SignedInvoice", "signedInvoice"]);
  const signedQRCode = pick(data, ["SignedQRCode", "signedQRCode", "SignedQrCode"]);

  // Error surfaces vary: error.message, ErrorDetails[], errorCodes, message.
  const statusFlag = pick(body, ["status", "Status"]);
  const success =
    !!irn ||
    statusFlag === 1 ||
    statusFlag === "1" ||
    /success/i.test(String(statusFlag || ""));

  const errorObj = body.error || body.Error || {};
  const errors =
    body.ErrorDetails ||
    body.errorDetails ||
    errorObj.errorCodes ||
    errorObj.ErrorDetails ||
    null;

  const message =
    pick(body, ["message", "Message"]) ||
    pick(errorObj, ["message", "Message", "error"]) ||
    (success ? "E-Invoice generated" : "E-Invoice generation failed");

  return {
    success,
    irn,
    ackNo,
    ackDt,
    signedInvoice,
    signedQRCode,
    message,
    errors,
    raw: body,
  };
}

export default {
  authenticate,
  generateEInvoice,
  buildNicPayload,
  normalizeResponse,
};
