import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Yarn Sales Order Adjustment (port of WinForms frmSalesOrderAdjustment).
// List pending sales-order lines, view the order, and record an Adjustment
// (Cancel) Qty + Remarks against a line — capped at its pending quantity.
//
//   Pending : GET  /yarn-sales-order-adjustment/pending
//   Detail  : GET  /yarn-sales-order-adjustment/detail/:soCode
//   Save    : POST /yarn-sales-order-adjustment/adjust
//             { SOCode, CountTypeCode, CancelQty, Remarks }
//
// The VB did a raw string-built UPDATE on tbl_SalesOrderDetails; here it is a
// parameterized UPDATE, and the pending cap is re-derived server-side from
// sp_SalesOrder_PendingQty (not trusted from the client). The desktop RDLC
// report preview is replaced by the order-detail grid on the client.
// CompanyCode comes from the JWT.
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

const loadPending = async (pool, companyCode) => {
  const rs = await pool
    .request()
    .input("CompanyCode", sql.Int, companyCode)
    .execute("sp_SalesOrder_PendingQty");
  return rs.recordset || [];
};

// GET /yarn-sales-order-adjustment/pending — pending order lines.
export const getPending = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    return sendSuccess(res, await loadPending(pool, getCompanyCode(req)));
  } catch (err) {
    console.error("DB Error (YarnSalesOrderAdjustment.getPending):", err);
    return sendError(res, err);
  }
};

// GET /yarn-sales-order-adjustment/detail/:soCode — order line details preview.
export const getDetail = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const soCode = toInt(req.params.soCode);
    if (soCode <= 0) return sendError(res, "Invalid SOCode", 400);
    const pool = await getPool(req.headers.subdbname);
    const rs = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("SOCode", sql.Int, soCode)
      .execute("sp_SalesOrderDetails_GetAll");
    return sendSuccess(res, rs.recordset || []);
  } catch (err) {
    console.error("DB Error (YarnSalesOrderAdjustment.getDetail):", err);
    return sendError(res, err);
  }
};

// POST /yarn-sales-order-adjustment/adjust — set CancelQty + CancelRemarks.
export const adjust = async (req, res) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const b = req.body || {};
    const soCode = toInt(b.SOCode);
    const countTypeCode = toInt(b.CountTypeCode);
    const cancelQty = toNum(b.CancelQty);
    const remarks = str(b.Remarks);

    if (soCode <= 0) return sendError(res, "Select the Sales Order", 400);
    if (countTypeCode <= 0) return sendError(res, "Invalid Count Type", 400);
    if (cancelQty < 0) return sendError(res, "Adjustment Qty cannot be negative", 400);

    const pool = await getPool(req.headers.subdbname);

    // Re-derive the pending cap for this exact line (don't trust the client).
    const pending = await loadPending(pool, companyCode);
    const line = pending.find(
      (r) => toInt(r.SOCode) === soCode && toInt(r.CountTypeCode) === countTypeCode
    );
    if (!line) return sendError(res, "This Sales Order line is no longer pending", 409);
    if (cancelQty > toNum(line.Pending)) return sendError(res, "Check the Pending Qty", 400);

    tx = new sql.Transaction(pool);
    await tx.begin();
    await new sql.Request(tx)
      .input("CancelQty", sql.Decimal(18, 3), cancelQty)
      .input("Remarks", sql.NVarChar, remarks)
      .input("CompanyCode", sql.Int, companyCode)
      .input("SOCode", sql.Int, soCode)
      .input("CountTypeCode", sql.Int, countTypeCode)
      .query(
        "Update tbl_SalesOrderDetails Set CancelQty = @CancelQty, CancelRemarks = @Remarks Where CompanyCode = @CompanyCode AND SOCode = @SOCode AND CountTypeCode = @CountTypeCode"
      );
    await tx.commit();
    return sendSuccess(res, { SOCode: soCode, CountTypeCode: countTypeCode }, "The record is saved");
  } catch (err) {
    if (tx) { try { await tx.rollback(); } catch (_) {} }
    console.error("DB Error (YarnSalesOrderAdjustment.adjust):", err);
    return sendError(res, err);
  }
};
