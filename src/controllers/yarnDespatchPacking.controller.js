import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Yarn Despatch Packing — Add (port of WinForms frmPackingAdd_Multi, "Multi
// Count Despatch"). Work queue of pending invoices → pick a count line → select
// its bags (Auto = all recommended, or Manual/Scan one bag at a time, validated
// via sp_BagScan_Check) → Save packing (sp_Packing_Insert per bag; the "Direct
// Packing" / without-packing path also runs sp_PackingBag_Insert first).
//
//   Options       : GET  /yarn-despatch-packing/options
//   Pending       : GET  /yarn-despatch-packing/pending
//   Count lines   : GET  /yarn-despatch-packing/lines/:invoiceCode
//   Recommended   : GET  /yarn-despatch-packing/recommended?invoiceCode=&countTypeCode=&soCode=&lotNoCode=&withoutPacking=
//   Auto bags     : GET  /yarn-despatch-packing/auto?invoiceCode=&countTypeCode=&soCode=
//   Scan/validate : GET  /yarn-despatch-packing/scan?invoiceCode=&bagNo=&countTypeCode=&lotNoCode=&withoutPacking=
//   Save          : POST /yarn-despatch-packing/create
//
// NOT ported (desktop-hardware): the HENEX barcode scanner panel
// (Inventory/Download/Immediate/Clear modes) and the Bulk Data upload — bags
// are entered manually / auto-selected here.
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getUserId = (req) => toInt(req.headers.userId);
const D = (v) => (v ? new Date(v) : new Date());

const safe = async (fn, fallback) => {
  try {
    return await fn();
  } catch (e) {
    console.warn("DespatchPacking lookup skipped:", e?.message);
    return fallback;
  }
};

// GET /yarn-despatch-packing/options — settings that toggle the UI.
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    // Invoice_Allotted=0 rows → the "Direct Packing" (without-packing) checkbox
    // is OFFERED; ManualEntry toggles the Auto/Manual radios vs Scanning-only.
    const settings = await safe(
      () =>
        pool
          .request()
          .query("Select (Select Count(*) from tbl_Setting Where Invoice_Allotted=0) AS Allotted, (Select TOP 1 ISNULL(ManualEntry,1) from tbl_Setting) AS ManualEntry")
          .then((r) => r.recordset?.[0] || {}),
      {}
    );
    return sendSuccess(res, {
      allowWithoutPacking: toInt(settings.Allotted) > 0,
      manualEntry: settings.ManualEntry == null ? 1 : toInt(settings.ManualEntry),
      companyCode: getCompanyCode(req),
    });
  } catch (err) {
    console.error("DB Error (DespatchPacking.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /yarn-despatch-packing/pending — pending invoices to pack (grouped).
export const getPending = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const rs = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_Pending_Packing_MULTI_Group");
    return sendSuccess(res, rs.recordset || []);
  } catch (err) {
    console.error("DB Error (DespatchPacking.getPending):", err);
    return sendError(res, err);
  }
};

// GET /yarn-despatch-packing/lines/:invoiceCode — count lines for one invoice.
export const getLines = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const rs = await pool
      .request()
      .input("InvoiceCode", sql.Int, toInt(req.params.invoiceCode))
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_Pending_Packing_MULTI");
    return sendSuccess(res, rs.recordset || []);
  } catch (err) {
    console.error("DB Error (DespatchPacking.getLines):", err);
    return sendError(res, err);
  }
};

// GET /yarn-despatch-packing/recommended — recommended bags for a count line.
export const getRecommended = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const companyCode = getCompanyCode(req);
    const withoutPacking = String(req.query.withoutPacking) === "1" || String(req.query.withoutPacking) === "true";

    let rs;
    if (withoutPacking) {
      rs = await pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("LotNoCode", sql.Int, toInt(req.query.lotNoCode))
        .input("CountTypeCode", sql.Int, toInt(req.query.countTypeCode))
        .execute("sp_BagNo_GetByInvoice_WithoutPacking");
    } else {
      rs = await pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("InvoiceCode", sql.Int, toInt(req.query.invoiceCode))
        .input("CountTypeCode", sql.Int, toInt(req.query.countTypeCode))
        .input("SOCode", sql.Int, toInt(req.query.soCode))
        .execute("sp_BagNo_GetByInvoice");
    }
    return sendSuccess(res, rs.recordset || []);
  } catch (err) {
    console.error("DB Error (DespatchPacking.getRecommended):", err);
    return sendError(res, err);
  }
};

// GET /yarn-despatch-packing/auto — all packable bags for a count line (Auto mode).
export const getAutoBags = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const rs = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("InvoiceCode", sql.Int, toInt(req.query.invoiceCode))
      .input("CountTypCode", sql.Int, toInt(req.query.countTypeCode)) // NB: proc param is @CountTypCode (VB spelling)
      .input("SOCode", sql.Int, toInt(req.query.soCode))
      .execute("sp_Packing_GetAll");
    return sendSuccess(res, rs.recordset || []);
  } catch (err) {
    console.error("DB Error (DespatchPacking.getAutoBags):", err);
    return sendError(res, err);
  }
};

// GET /yarn-despatch-packing/scan — validate a scanned / typed bag number.
export const scanBag = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const companyCode = getCompanyCode(req);
    const withoutPacking = String(req.query.withoutPacking) === "1" || String(req.query.withoutPacking) === "true";

    let rs;
    if (withoutPacking) {
      rs = await pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("BagNo", sql.Int, toInt(req.query.bagNo))
        .input("CountTypeCode", sql.Int, toInt(req.query.countTypeCode))
        .input("LotNoCode", sql.Int, toInt(req.query.lotNoCode))
        .execute("sp_BagScan_Check_WithoutPacking");
    } else {
      rs = await pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("InvoiceCode", sql.Int, toInt(req.query.invoiceCode))
        .input("BagNo", sql.Int, toInt(req.query.bagNo))
        .input("CountTypeCode", sql.Int, toInt(req.query.countTypeCode))
        .input("LotNoCode", sql.Int, toInt(req.query.lotNoCode))
        .execute("sp_BagScan_Check");
    }
    return sendSuccess(res, rs.recordset?.[0] || null);
  } catch (err) {
    console.error("DB Error (DespatchPacking.scanBag):", err);
    return sendError(res, err);
  }
};

// POST /yarn-despatch-packing/create — save the packing (one row per bag).
export const create = async (req, res) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const companyCode = getCompanyCode(req);
    const userId = getUserId(req);
    const b = req.body || {};
    const bags = Array.isArray(b.bags) ? b.bags : [];
    const invoiceCode = toInt(b.InvoiceCode);
    const sodNo = toInt(b.SODNo);
    const withoutPacking = !!b.withoutPacking;
    const packingDate = D(b.PackingDate);

    if (invoiceCode <= 0) return sendError(res, "Invalid Invoice", 400);
    if (bags.length === 0) return sendError(res, "No bags to pack", 400);

    tx = new sql.Transaction(pool);
    await tx.begin();

    // Direct/without packing: assign the bags to the invoice first.
    if (withoutPacking) {
      for (const bag of bags) {
        await new sql.Request(tx)
          .input("InvoiceCode", sql.Int, invoiceCode)
          .input("BagNo", sql.Int, toInt(bag.BagNo))
          .input("BagCode", sql.Int, toInt(bag.BagCode))
          .input("CountTypeCode", sql.Int, toInt(bag.CountTypeCode))
          .input("SOCode", sql.Int, toInt(bag.SOCode))
          .input("SODNo", sql.Int, sodNo)
          .input("CompanyCode", sql.Int, companyCode)
          .execute("sp_PackingBag_Insert");
      }
    }

    // One packing record per bag (mirrors the VB GridSaved loop).
    for (const bag of bags) {
      await new sql.Request(tx)
        .input("InvoiceCode", sql.Int, invoiceCode)
        .input("CountTypeCode", sql.Int, toInt(bag.CountTypeCode))
        .input("SOCode", sql.Int, toInt(bag.SOCode))
        .input("PackingDate", sql.DateTime, packingDate)
        .input("PreparationDate", sql.DateTime, new Date())
        .input("PackingUser", sql.Int, userId)
        .input("CompanyCode", sql.Int, companyCode)
        .execute("sp_Packing_Insert");
    }

    await tx.commit();
    return sendSuccess(res, { InvoiceCode: invoiceCode, packed: bags.length });
  } catch (err) {
    if (tx) await tx.rollback().catch(() => {});
    console.error("DB Error (DespatchPacking.create):", err);
    return sendError(res, err);
  }
};
