// ---------------------------------------------------------------------------
// GST portal config loader — reads tbl_GST_PortalDetails (per company + portal
// type) so the IRP / E-Way-Bill URLs + credentials come from the DB instead of
// being hardcoded. Falls back to the static einvoice.config.js when a row is
// missing (e.g. a company that hasn't set up the portal yet).
//
//   getPortalConfig(pool, companyCode, portalType) -> normalised config | null
//   resolveEInvoiceConfig(pool, companyCode)        -> e-invoice ("GST PORTAL")
//   resolveEWBConfig(pool, companyCode)             -> e-way bill ("EWAY BILL")
//
// tbl_GST_PortalDetails columns (per the DB):
//   PortalType, GSTPortal_UserName, GSTPortal_Password, GSTPortal_GSTIN,
//   GSTPortal_StateCode, GSTPortal_LegalName, GSTPortal_TradeName,
//   GSTPortal_Address1/2, GSTPortal_Location, GSTPortal_PinCode,
//   GSTPortal_RegisteredEmailID, GSTPortal_RegisteredMobileNo,
//   Authenticate_URL, eInvoice_URL, ClientID, Client_Secret,
//   WhiteList_IPAddress1/2/3
// ---------------------------------------------------------------------------

import sql from "mssql";
import { einvoiceConfig as staticCfg } from "../config/einvoice.config.js";

// PortalType values as stored in tbl_GST_PortalDetails.
export const PORTAL_TYPE = {
  EINVOICE: "GST PORTAL",
  EINVOICE_SANDBOX: "SAND BOX",
  EWAYBILL: "EWAY BILL",
  EWAYBILL_SANDBOX: "EWAY BILL_SAND BOX",
};

// Cache resolved rows briefly so every generate call isn't a DB round-trip.
const cache = new Map(); // `${companyCode}|${portalType}` -> { cfg, at }
const TTL_MS = 5 * 60 * 1000;

// Map a tbl_GST_PortalDetails row to the shape the service uses. `action` verbs
// + token TTL aren't in the table, so they inherit from the static config.
function mapRow(row) {
  if (!row) return null;
  return {
    portalType: row.PortalType,
    authUrl: row.Authenticate_URL || staticCfg.authUrl,
    invoiceUrl: row.eInvoice_URL || staticCfg.invoiceUrl,
    gstin: row.GSTPortal_GSTIN || staticCfg.gstin,
    userName: row.GSTPortal_UserName,
    password: row.GSTPortal_Password,
    clientId: row.ClientID || staticCfg.clientId,
    clientSecret: row.Client_Secret || staticCfg.clientSecret,
    ipAddress: row.WhiteList_IPAddress1 || staticCfg.ipAddress,
    stateCode: row.GSTPortal_StateCode,
    legalName: row.GSTPortal_LegalName,
    tradeName: row.GSTPortal_TradeName,
    address1: row.GSTPortal_Address1,
    address2: row.GSTPortal_Address2,
    location: row.GSTPortal_Location,
    pincode: row.GSTPortal_PinCode,
    email: row.GSTPortal_RegisteredEmailID,
    mobile: row.GSTPortal_RegisteredMobileNo,
    // action verbs / token TTL come from the static config
    authAction: staticCfg.authAction,
    generateAction: staticCfg.generateAction,
    tokenTtlSeconds: staticCfg.tokenTtlSeconds,
  };
}

export async function getPortalConfig(pool, companyCode, portalType) {
  const key = `${companyCode || 0}|${portalType}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.cfg;

  const r = pool.request();
  r.input("CompanyCode", sql.Int, parseInt(companyCode) || 0);
  r.input("PortalType", sql.VarChar(50), String(portalType));
  const res = await r.query(
    `SELECT TOP 1 * FROM dbo.tbl_GST_PortalDetails
      WHERE CompanyCode = @CompanyCode AND PortalType = @PortalType
      ORDER BY Sno`
  );
  const cfg = mapRow(res.recordset?.[0]);
  cache.set(key, { cfg, at: Date.now() });
  return cfg;
}

// Clear the cache (call after editing tbl_GST_PortalDetails).
export function clearPortalCache() {
  cache.clear();
}

// Resolve e-invoice config (GST PORTAL), falling back to the static config.
export async function resolveEInvoiceConfig(pool, companyCode) {
  try {
    const cfg = await getPortalConfig(pool, companyCode, PORTAL_TYPE.EINVOICE);
    return cfg || staticCfg;
  } catch (err) {
    console.warn("resolveEInvoiceConfig fell back to static config:", err.message);
    return staticCfg;
  }
}

// Resolve E-Way-Bill config (EWAY BILL). No static fallback — returns null when
// the portal isn't set up (the caller surfaces a clear error).
export async function resolveEWBConfig(pool, companyCode) {
  return getPortalConfig(pool, companyCode, PORTAL_TYPE.EWAYBILL);
}

export default { PORTAL_TYPE, getPortalConfig, clearPortalCache, resolveEInvoiceConfig, resolveEWBConfig };
