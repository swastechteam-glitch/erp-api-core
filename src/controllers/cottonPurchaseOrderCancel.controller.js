import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Cotton Purchase Order Cancel / Adjustment (port of frmCottonPurchaseOrderCancel)
//   Pick a pending PO, view its print, then record a Cancel/Adjustment Qty +
//   Remarks against it. Mirrors the WinForms btnCancel_Click which simply runs:
//     UPDATE tbl_CottonPurchaseOrder
//        SET CancelQty = @CancelQty, CancelRemarks = @CancelRemarks
//      WHERE CompanyCode = @CompanyCode AND CPOCode = @CPOCode
//   with the guards: a PO is selected, CancelQty > 0, CancelQty <= Pending.
//
//   - GET /cotton-purchase-order-cancel/pending-qty  -> sp_CottonPurchaseOrder_PendingQty (paginated)
//   - PUT /cotton-purchase-order-cancel/cancel/:code  -> the cancel/adjustment update
//
// Company is read from the JWT (req.headers.companyCode).
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};

const getCompanyCode = (req) => toInt(req.headers.companyCode);

// GET /cotton-purchase-order-cancel/pending-qty -> the pending POs (paginated).
export const getPendingQty = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_CottonPurchaseOrder_PendingQty");

    const data = (result.recordset || []).map((r) => ({ ...r, id: r.CPOCode }));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (cancel getPendingQty):", err);
    return sendError(res, err);
  }
};

// PUT /cotton-purchase-order-cancel/cancel/:code -> set CancelQty + CancelRemarks.
export const cancelCottonPurchaseOrder = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const companyCode = getCompanyCode(req);
    const code = parseInt(req.params.code ?? req.body?.CPOCode);
    if (!code) return sendError(res, "Select the Purchase Order", 400);

    const b = req.body || {};
    const cancelQty = toNum(b.CancelQty);
    const pending = toNum(b.Pending);

    // Same guards the WinForms enforces.
    if (cancelQty <= 0)
      return sendError(res, "Enter the Cancel / Adjustment Qty", 400);
    if (pending > 0 && cancelQty > pending)
      return sendError(res, "Check the Pending Qty", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("CPOCode", sql.Int, code)
      .input("CancelQty", sql.Decimal(18, 3), cancelQty)
      .input("CancelRemarks", sql.NVarChar, (b.CancelRemarks || "").toString().trim())
      .query(
        "UPDATE tbl_CottonPurchaseOrder SET CancelQty = @CancelQty, CancelRemarks = @CancelRemarks WHERE CompanyCode = @CompanyCode AND CPOCode = @CPOCode",
      );

    if (!result.rowsAffected?.[0])
      return sendError(res, "Cotton Purchase Order not found", 404);

    return sendSuccess(res, { CPOCode: code }, "The record is Saved", 200);
  } catch (err) {
    console.error("DB Error (cancelCottonPurchaseOrder):", err);
    return sendError(res, err);
  }
};
