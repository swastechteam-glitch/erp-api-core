// ---------------------------------------------------------------------------
// GST lookup — fetch a firm's details by GSTIN (port of frmSupplier.FetchGSTDetails)
// ---------------------------------------------------------------------------
// Calls the RapidAPI "gst-return-status" service and returns a normalised shape
// the masters use to auto-fill the form (Name / Address / Pincode / PAN / …).
// The API key lives server-side (env GST_RAPIDAPI_KEY) so it never ships to the
// browser. GET /gst/:gstin
// ---------------------------------------------------------------------------

import axios from "axios";
import { sendSuccess, sendError } from "../utils/response.js";

const RAPIDAPI_HOST = "gst-return-status.p.rapidapi.com";
const RAPIDAPI_KEY =
  process.env.GST_RAPIDAPI_KEY ||
  "ca58a3b08emsh47607dd84286bb4p1a87d9jsnbe5e528917c3";

// 15-char GSTIN format (same checks the WinForms screen ran).
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9]{1}[A-Z0-9]{1}[A-Z0-9]{1}$/;

const clean = (v) => (v == null ? "" : String(v).trim());

// Pull a clean state name out of the verbose `stj` string the GST API returns,
// e.g. "State - Tamil Nadu,Division - ERODE,Zone - Erode,..." -> "Tamil Nadu".
const stateFromStj = (stj) => {
  const s = clean(stj);
  if (!s) return "";
  const m = s.match(/State\s*-\s*([^,]+)/i);
  return m ? m[1].trim() : s.split(",")[0].trim();
};

// Street-only parts (building / door / floor / street / locality) — city,
// district, state and pincode are returned separately so they fill their own
// fields.
const buildStreet = (a = {}) =>
  [a.bno, a.bnm, a.flno, a.st, a.loc]
    .map(clean)
    .filter(Boolean)
    .join(", ");

// Split a street address across two lines (Address 1 / Address 2): the first
// half of the comma parts goes to line 1, the remainder to line 2.
const splitTwoLines = (street) => {
  const parts = clean(street)
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length <= 1) return { address1: parts[0] || "", address2: "" };
  const half = Math.ceil(parts.length / 2);
  return {
    address1: parts.slice(0, half).join(", "),
    address2: parts.slice(half).join(", "),
  };
};

// Fallback: split a flat formatted address. The GST API's tail order is
// "..., city, district, state, pincode" — peel those off, the rest is street.
const parseFlatAddress = (adr) => {
  const parts = clean(adr)
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const out = { street: "", city: "", district: "", stateName: "", pincode: "" };
  if (!parts.length) return out;
  // Trailing pincode (6 digits).
  if (/^\d{6}$/.test(parts[parts.length - 1])) out.pincode = parts.pop();
  if (parts.length) out.stateName = parts.pop();
  if (parts.length) out.district = parts.pop();
  if (parts.length) out.city = parts.pop();
  out.street = parts.join(", ");
  return out;
};

// Normalise the address into separate fields. The API may hand back a
// structured `pradr.addr` object, a flat `adr` string, or both — so merge them
// field-by-field, preferring a structured value when it's present and non-empty
// and otherwise falling back to the parsed flat string.
const normaliseAddress = (d) => {
  const a = d.pradr?.addr || {};
  const flat = d.adr || d.pradr?.adr || "";
  const f = parseFlatAddress(flat);
  const pick = (...vals) => vals.map(clean).find(Boolean) || "";
  const street = pick(buildStreet(a), f.street, flat);
  const lines = splitTwoLines(street);
  return {
    address: street, // full street line (Address 1 + Address 2 combined)
    address1: lines.address1,
    address2: lines.address2,
    city: pick(a.city, f.city, a.loc),
    district: pick(a.dst, f.district),
    stateName: pick(a.stcd, f.stateName),
    pincode: pick(a.pncd, f.pincode),
  };
};

export const getGstDetails = async (req, res) => {
  try {
    const gstin = String(req.params.gstin || "").trim().toUpperCase();

    if (!gstin) return sendError(res, "GST No is required", 400);
    if (gstin.length !== 15 || !GSTIN_RE.test(gstin))
      return sendError(res, "Invalid GST Number", 400);

    const { data } = await axios.get(
      `https://${RAPIDAPI_HOST}/free/gstin/${gstin}`,
      {
        timeout: 10000,
        headers: {
          "x-rapidapi-key": RAPIDAPI_KEY,
          "x-rapidapi-host": RAPIDAPI_HOST,
          Accept: "application/json",
        },
      }
    );

    // The service nests the firm details under `data` (some plans use a flat
    // body). Accept both.
    const d = data?.data || data || {};
    if (!d || (!d.lgnm && !d.tradeNam && !d.tradeName)) {
      return sendError(res, "GST Number not found or invalid", 404);
    }

    const legalName = clean(d.lgnm);
    const tradeName = clean(d.tradeName || d.tradeNam);
    const addr = normaliseAddress(d);
    // State: structured field first, else the verbose `stj` string.
    const stateName = addr.stateName || stateFromStj(d.stj);
    const pincode = addr.pincode || clean(d.pincode);

    return sendSuccess(res, {
      gstin,
      name: tradeName || legalName, // prefer trade name, else legal name
      legalName,
      tradeName,
      address: addr.address, // full street line
      address1: addr.address1, // street split — line 1
      address2: addr.address2, // street split — line 2
      fullAddress: clean(d.adr || d.pradr?.adr), // complete address string
      city: addr.city,
      district: addr.district,
      stateName,
      pincode: pincode ? String(pincode) : "",
      panNo: clean(d.pan) || gstin.substring(2, 12), // PAN is chars 3-12 of GSTIN
      status: clean(d.sts),
    });
  } catch (err) {
    if (err?.response?.status === 429)
      return sendError(res, "GST API limit reached. Please try again later.", 429);
    if (err?.response?.status === 404)
      return sendError(res, "GST Number not found or invalid", 404);
    console.error("GST lookup error:", err?.message || err);
    return sendError(res, "Unable to fetch GST details", 502);
  }
};
