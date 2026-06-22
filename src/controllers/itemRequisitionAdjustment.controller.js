import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Item Requisition Adjustment / Cancel (port of frmItemRequisitionAdjustment)
//   List pending requisition ('R' = Purchase) or indent ('I' = Issue) item
//   lines, pick one, and cancel/adjust part of its pending quantity.
//   - List   : sp_ItemRequisition_CancelList (@CompanyCode, @RequitionType,
//              optional @ItemRequisitionCode)
//   - Adjust : sp_ItemRequisitionDetails_Adjustment (@CompanyCode, @CancelDate,
//              @ItemRequisitionCode, @ItemCode, @CancelEmployeeCode,
//              @CancelQty = existing CancelQty + the qty being cancelled now)
//
// Company from req.headers.companyCode; CancelEmployeeCode = req.headers.userId.
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

const normType = (v) => (String(v || "").toUpperCase() === "I" ? "I" : "R");

// GET /item-requisition-adjustment/list?type=R&itemRequisitionCode=&page=&pageSize=
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const request = pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("RequitionType", sql.NVarChar, normType(req.query.type));
    if (toInt(req.query.itemRequisitionCode) > 0)
      request.input("ItemRequisitionCode", sql.Int, toInt(req.query.itemRequisitionCode));

    const result = await request.execute("sp_ItemRequisition_CancelList");
    const data = (result.recordset || []).map((r) => ({
      ...r,
      id: `${toInt(r.ItemRequisitionCode)}-${toInt(r.ItemCode)}`,
      RequestQty: toNum(r.RequestQty),
      CancelQty: toNum(r.CancelQty),
      IssueQty: toNum(r.IssueQty),
      PendingQty: toNum(r.PendingQty),
    }));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (ItemRequisitionAdjustment.getList):", err);
    return sendError(res, err);
  }
};

// POST /item-requisition-adjustment/adjust
export const adjust = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    if (!userId) return sendError(res, "Missing user context (userId)", 400);

    const b = req.body || {};
    const itemRequisitionCode = toInt(b.ItemRequisitionCode);
    const itemCode = toInt(b.ItemCode);
    const doCancelQty = toNum(b.DoCancelQty);
    const pendingQty = toNum(b.PendingQty);
    const canceledQty = toNum(b.CanceledQty);

    if (itemRequisitionCode <= 0 || itemCode <= 0)
      return sendError(res, "Please select any Requisition / Indent item", 400);
    if (doCancelQty <= 0) return sendError(res, "Enter the Cancel Qty", 400);
    if (doCancelQty > pendingQty)
      return sendError(res, "Adjustable Qty is more than Pending Qty", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("CancelDate", sql.DateTime, new Date())
      .input("ItemRequisitionCode", sql.Int, itemRequisitionCode)
      .input("ItemCode", sql.Int, itemCode)
      .input("CancelEmployeeCode", sql.Int, parseInt(userId))
      .input("CancelQty", sql.Decimal(18, 3), canceledQty + doCancelQty)
      .execute("sp_ItemRequisitionDetails_Adjustment");

    return sendSuccess(res, { ItemRequisitionCode: itemRequisitionCode, ItemCode: itemCode }, "Qty adjusted successfully");
  } catch (err) {
    console.error("DB Error (ItemRequisitionAdjustment.adjust):", err);
    return sendError(res, err);
  }
};
