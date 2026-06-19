// ---------------------------------------------------------------------------
// E-Invoice (GST IRN) integration config — GSTRobo Tax-Payer (TP) API.
//
// All endpoint URLs and GSP credentials live here in ONE place so switching
// between sandbox / production, or rotating the Client ID / Secret, is a
// single-file change. Values fall back to the supplied production credentials
// but can be overridden via environment variables (preferred for deployment).
//
//   Auth    : POST {authUrl}      -> AuthToken (cached, reused until expiry)
//   Generate: POST {invoiceUrl}   -> IRN + AckNo + signed QR
// ---------------------------------------------------------------------------

export const einvoiceConfig = {
  authUrl:
    process.env.EINV_AUTH_URL ||
    "https://einvoicetpapi.gstrobo.com/V1/Authenticate",
  invoiceUrl:
    process.env.EINV_INVOICE_URL ||
    "https://einvoicetpapi.gstrobo.com/V1/EInvoice",

  // GSP / tax-payer credentials.
  gstin: process.env.EINV_GSTIN || "33AABCT1285C2ZR",
  clientId: process.env.EINV_CLIENT_ID || "SWASTECHSRPPL7982BKH89gt",
  clientSecret:
    process.env.EINV_CLIENT_SECRET || "swastchrice7928hjprowin879bTRQ",

  // Static IP the GSP whitelists; some GSPs require it on every request header.
  ipAddress: process.env.EINV_IP || "192.168.0.21",

  // AuthToken lifetime fallback (seconds) when the auth response omits it.
  // GSTRobo tokens are typically valid ~6 hours.
  tokenTtlSeconds: Number(process.env.EINV_TOKEN_TTL) || 6 * 60 * 60,

  // GSTRobo routes every call on a generic endpoint by an `action` query param.
  authAction: process.env.EINV_AUTH_ACTION || "ACCESSTOKEN",
  generateAction: process.env.EINV_GEN_ACTION || "GENERATE",
};

export default einvoiceConfig;
