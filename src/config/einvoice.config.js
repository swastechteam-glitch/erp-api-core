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

  // NIC IRP / E-Way-Bill TAXPAYER API credentials (username + password). These
  // are the portal API user the GSP forwards for E-Way-Bill generate / cancel
  // (and, on some GSPs, for IRP auth). Keep them in the environment in
  // production — the literal fallback here is only for local/dev.
  // SECURITY: do not commit real secrets; set EINV_EWB_USERNAME / EINV_EWB_PASSWORD.
  ewbUserName: process.env.EINV_EWB_USERNAME || "API_TPSM_SWAS",
  ewbPassword: process.env.EINV_EWB_PASSWORD || "Skyrp@1979",
};

// Sales-type → source detail view. The Generate / Print worklist reads its
// documents from the matching view (each tbl_SalesDayBook row carries a
// SalesType). Confirm each view's exact column names before wiring the query.
export const SALESTYPE_VIEW = {
  YARN_SALES: "vw_InvoiceDetails",
  SCRAP_SALES: "vw_ScrapInvoiceDetails",
  WASTE_SALES: "vw_WasteInvoiceDetails",
  GENERAL_SALES: "vw_GeneralSalesDetails",
  COTTON_SALES: "vw_CottonSalesDetails",
};

export default einvoiceConfig;
