import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Cotton Purchase Order Amendment (port of frmCottonPurchaseOrder_Amendment)
//   Pick an existing PO, then amend only the order quantity via Add Qty /
//   Less Qty (+ remarks). All other header fields are read-only (loaded from
//   the PO). Save re-runs sp_CottonPurchaseOrder_AddEdit with @AddQty/@LessQty
//   and re-syncs the CQT detail rows (sp_CottonPurchaseOrderDetails_Insert with
//   @EditMode = 1), then sp_CottonPurchaseOrder_TestUpdate — exactly the WinForms
//   btnSave_Click flow (no approval row is touched here).
//
//   - GET /cotton-purchase-order-amendment/cpo-numbers  -> sp_CottonPurchaseOrderNo_GetAll
//   - GET /cotton-purchase-order-amendment/pending-qty   -> sp_CottonPurchaseOrder_PendingQty
//   - PUT /cotton-purchase-order-amendment/amend/:code   -> the amendment transaction
//   (the PO header + detail rows are loaded via /cotton-purchase-order/list/:code)
//
// Company from req.headers.companyCode, FY from req.headers.FYCode. Season is not
// in the token; default to 1, overridable via header/body/query (seationCode).
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};
const toBit = (v) => (v === true || v === 1 || v === "1" ? 1 : 0);

const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getFYCode = (req) => toInt(req.headers.FYCode);
const getSeationCode = (req) =>
  toInt(
    req.headers.seationcode ?? req.body?.SeationCode ?? req.query?.seationCode ?? 1
  ) || 1;

// GET /cotton-purchase-order-amendment/cpo-numbers -> PO number dropdown.
export const getCPONumbers = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("SeationCode", sql.Int, getSeationCode(req))
      .execute("sp_CottonPurchaseOrderNo_GetAll");

    return sendSuccess(res, {
      cpoNumbers: (result.recordset || []).map((r) => ({
        value: r.CPOCode,
        label: r.strCPONo ?? r.CPONo,
        cpoNo: r.strCPONo ?? r.CPONo,
        fyCode: r.FYCode,
        seationCode: r.SeationCode,
      })),
    });
  } catch (err) {
    console.error("DB Error (getCPONumbers):", err);
    return sendError(res, err);
  }
};

// GET /cotton-purchase-order-amendment/pending-qty -> the "pending qty" help grid.
export const getPendingQty = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_CottonPurchaseOrder_PendingQty");

    const data = (result.recordset || []).map((r) => ({ ...r, id: r.CPOCode }));
    return sendSuccess(res, data);
  } catch (err) {
    console.error("DB Error (getPendingQty):", err);
    return sendError(res, err);
  }
};

// PUT /cotton-purchase-order-amendment/amend/:code -> amend qty (Add / Less).
export const amendCottonPurchaseOrder = async (req, res) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const companyCode = getCompanyCode(req);
    const fyCode = toInt(req.body?.FYCode) || getFYCode(req);
    const seationCode = getSeationCode(req);

    const code = parseInt(req.params.code ?? req.body?.CPOCode);
    if (!code) return sendError(res, "Invalid CPOCode", 400);

    const b = req.body || {};

    // Same validations the WinForms enforces.
    if (!(b.RefNo || "").toString().trim())
      return sendError(res, "Enter the Ref No", 400);
    if (toInt(b.SupplierCode) <= 0)
      return sendError(res, "Select the Supplier Name", 400);
    if (toInt(b.AgentCode) <= 0) return sendError(res, "Select the Broker Name", 400);
    if (toInt(b.StationCode) <= 0) return sendError(res, "Select the Station", 400);
    if (toInt(b.StateCode) <= 0) return sendError(res, "Select the State", 400);
    if (toInt(b.RawMaterialCode) <= 0) return sendError(res, "Select the Variety", 400);
    if (toNum(b.Qty) <= 0) return sendError(res, "Enter the Purchase Qty", 400);
    if (toNum(b.Rate) <= 0) return sendError(res, "Enter the Purchase Rate", 400);
    if (toInt(b.CQTSTDCode) <= 0) return sendError(res, "Select the Quality STD", 400);

    // Arrival Qty must not exceed (Qty - Less Qty)  (matches the form check).
    if (toNum(b.ArrivalQty) > toNum(b.Qty) - toNum(b.LessQty))
      return sendError(
        res,
        "Check the Less Qty. (No of Bales - Less Qty) should be >= Arrival Qty",
        400
      );

    const pool = await getPool(req.headers.subdbname);
    tx = new sql.Transaction(pool);
    await tx.begin();

    const head = new sql.Request(tx);
    head.input("CPOCode", sql.Int, code);
    head.input("CPONo", sql.Int, toInt(b.CPONo));
    head.input("CPODate", sql.DateTime, b.CPODate ? new Date(b.CPODate) : new Date());
    head.input("SupplierCode", sql.Int, toInt(b.SupplierCode));
    head.input("AgentCode", sql.Int, toInt(b.AgentCode));
    head.input("StationCode", sql.Int, toInt(b.StationCode));
    head.input("CQTSTDCode", sql.Int, toInt(b.CQTSTDCode));
    head.input("PaymentType", sql.Int, toInt(b.PaymentType));
    head.input("PayMode", sql.Int, toInt(b.PayMode));
    head.input("PaymentDays", sql.Int, toInt(b.PaymentDays));
    head.input("RawMaterialCode", sql.Int, toInt(b.RawMaterialCode));
    head.input("MixingCount", sql.Decimal(18, 2), toNum(b.MixingCount));
    head.input("PackingTypeCode", sql.Int, toInt(b.PackingTypeCode));
    head.input("Qty", sql.Decimal(18, 3), toNum(b.Qty));
    head.input("Rate", sql.Decimal(18, 3), toNum(b.Rate));
    head.input("DespatchDetails", sql.NVarChar, (b.DespatchDetails || "").toString().trim());
    head.input("PaymentDetails", sql.NVarChar, (b.PaymentDetails || "").toString().trim());
    head.input("Length", sql.Decimal(18, 2), toNum(b.Length));
    head.input("Mic", sql.Decimal(18, 2), toNum(b.Mic));
    head.input("Sth", sql.Decimal(18, 2), toNum(b.Sth));
    head.input("Trash", sql.Decimal(18, 2), toNum(b.Trash));
    head.input("Moisture", sql.Decimal(18, 2), toNum(b.Moisture));
    head.input("Remarks", sql.NVarChar, (b.Remarks || "").toString().trim());
    head.input("RefNo", sql.NVarChar, (b.RefNo || "").toString().trim());
    head.input("DeliveryDays", sql.Int, toInt(b.DeliveryDays));
    head.input("CForm", sql.Bit, toBit(b.CForm));
    head.input("ToLength", sql.Decimal(18, 2), toNum(b.ToLength));
    head.input("ToMic", sql.Decimal(18, 2), toNum(b.ToMic));
    head.input("ToSth", sql.Decimal(18, 2), toNum(b.ToSth));
    head.input("ToTrash", sql.Decimal(18, 2), toNum(b.ToTrash));
    head.input("ToMoisture", sql.Decimal(18, 2), toNum(b.ToMoisture));
    head.input("CancelQty", sql.Decimal(18, 3), toNum(b.CancelQty));
    head.input("CancelRemarks", sql.NVarChar, (b.CancelRemarks || "").toString().trim());
    head.input("FYCode", sql.Int, fyCode);
    head.input("CompanyCode", sql.Int, companyCode);
    head.input("SeationCode", sql.Int, seationCode);
    head.input("User", sql.Int, parseInt(userId));
    head.input("Node", sql.Int, parseInt(nodeCode));
    head.input("LegalName", sql.NVarChar, (b.LegalName || "").toString().trim());
    // Amendment-specific quantity adjustments.
    head.input("AddQty", sql.Decimal(18, 3), toNum(b.AddQty));
    head.input("LessQty", sql.Decimal(18, 3), toNum(b.LessQty));

    const headRes = await head.execute("sp_CottonPurchaseOrder_AddEdit");
    const scalarRow = headRes.recordset?.[0];
    const cpoCode = scalarRow ? toInt(Object.values(scalarRow)[0]) : code;

    // Re-sync the CQT detail rows (EditMode = 1 in the amendment flow).
    await new sql.Request(tx)
      .input("CPOCode", sql.Int, cpoCode)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_CottonPurchaseOrderDetails_Delete");

    const details = Array.isArray(b.details) ? b.details : [];
    for (const d of details) {
      await new sql.Request(tx)
        .input("CPOCode", sql.Int, cpoCode)
        .input("CQTParameterCode", sql.Int, toInt(d.CQTParameterCode))
        .input("FromParameter", sql.Decimal(18, 2), toNum(d.FromParameter))
        .input("From1", sql.NVarChar, (d.From1 || "").toString().trim())
        .input("ToParameter", sql.Decimal(18, 2), toNum(d.ToParameter))
        .input("To1", sql.NVarChar, (d.To1 || "").toString().trim())
        .input("PartyFrom", sql.Decimal(18, 2), toNum(d.PartyFrom))
        .input("PartyFrom1", sql.NVarChar, (d.PartyFrom1 || "").toString().trim())
        .input("PartyTo", sql.Decimal(18, 2), toNum(d.PartyTo))
        .input("PartyTo1", sql.NVarChar, (d.PartyTo1 || "").toString().trim())
        .input("CompanyCode", sql.Int, companyCode)
        .input("EditMode", sql.Bit, 1)
        .execute("sp_CottonPurchaseOrderDetails_Insert");
    }

    await new sql.Request(tx)
      .input("CPOCode", sql.Int, cpoCode)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_CottonPurchaseOrder_TestUpdate");

    await tx.commit();
    return sendSuccess(res, { CPOCode: cpoCode }, "The record is saved", 200);
  } catch (err) {
    if (tx) {
      try {
        await tx.rollback();
      } catch (_) {}
    }
    console.error("DB Error (amendCottonPurchaseOrder):", err);
    return sendError(res, err);
  }
};
