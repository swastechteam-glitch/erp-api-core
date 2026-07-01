import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Yarn Purchase Order (port of WinForms frmYarnPurchaseOrder + frmYarnPurchaseOrderDetails).
// A master with ONE detail grid (the count lines). Save writes the header
// (sp_YarnPurchaseOrder_AddEdit → YarnPurchaseOrderCode) then loops each Count
// line into sp_YarnPurchaseOrderDetails_Insert, all in one transaction. Edit
// re-runs the AddEdit proc with the code, deletes the detail set, then re-inserts.
//
//   Options    : GET    /yarn-purchase-order/options
//   Tax types  : GET    /yarn-purchase-order/tax-types?salesTypeCode=
//   Next PO No : GET    /yarn-purchase-order/next-no
//   Count stock: GET    /yarn-purchase-order/stock
//   List       : GET    /yarn-purchase-order/lists
//   One (edit) : GET    /yarn-purchase-order/:code
//   Create     : POST   /yarn-purchase-order/create
//   Update     : PUT    /yarn-purchase-order/update/:code
//   Delete     : DELETE /yarn-purchase-order/:code
//
// CompanyCode / FYCode / userId / nodeCode come from the JWT (req.headers).
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
const D = (v) => (v ? new Date(v) : null);
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getFYCode = (req) => toInt(req.headers.FYCode);

const opt = (rs, valueKey, labelKey) =>
  (rs.recordset || []).map((r) => ({ ...r, value: r[valueKey], label: r[labelKey] }));

// GET /yarn-purchase-order/options — every dropdown the screen needs.
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    const [suppliers, salesTypes, otherCharges, countTypes] = await Promise.all([
      pool.request().query(
        "Select SupplierName, SupplierCode, Address1, Address2, City, District from tbl_Supplier where Status = 1 AND SupplierID IS NOT NULL Order by SupplierName"
      ),
      pool.request().query("Select SalesTypeCode, SalesType from tbl_SalesType"),
      pool.request().query("Select OtherChargesCode, OtherCharges, PerKg, Amount from tbl_OtherCharges"),
      pool.request().input("Status", sql.Bit, 1).execute("sp_CountType_GetAll"),
    ]);

    return sendSuccess(res, {
      suppliers: opt(suppliers, "SupplierCode", "SupplierName"),
      salesTypes: opt(salesTypes, "SalesTypeCode", "SalesType"),
      otherCharges: opt(otherCharges, "OtherChargesCode", "OtherCharges"),
      countTypes: opt(countTypes, "CountTypeCode", "CountType"),
      paymentTypes: [
        { value: "CA", label: "CASH" },
        { value: "CR", label: "CREDIT" },
      ],
      commissionTypes: [
        { value: 0, label: "QTY" },
        { value: 1, label: "WEIGHT" },
        { value: 2, label: "EX-MILLVALUE" },
      ],
    });
  } catch (err) {
    console.error("DB Error (YarnPurchaseOrder.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /yarn-purchase-order/tax-types?salesTypeCode= — tax rows (carry CGST/SGST/...).
export const getTaxTypes = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const rs = await pool
      .request()
      .input("Status", sql.Bit, 1)
      .input("SalesTypeCode", sql.Int, toInt(req.query.salesTypeCode))
      .execute("sp_TaxType_GetAll");
    return sendSuccess(res, opt(rs, "TaxTypeCode", "TaxType"));
  } catch (err) {
    console.error("DB Error (YarnPurchaseOrder.getTaxTypes):", err);
    return sendError(res, err);
  }
};

// GET /yarn-purchase-order/next-no — sp_YarnPurchaseOrder_GetYarnPurchaseOrderNo.
export const getNextNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const rs = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("FYCode", sql.Int, getFYCode(req))
      .execute("sp_YarnPurchaseOrder_GetYarnPurchaseOrderNo");
    const no = rs.recordset?.[0] ? Object.values(rs.recordset[0])[0] : 0;
    return sendSuccess(res, { poNo: toInt(no) });
  } catch (err) {
    console.error("DB Error (YarnPurchaseOrder.getNextNo):", err);
    return sendError(res, err);
  }
};

// GET /yarn-purchase-order/stock — count-wise bag stock { [CountTypeCode]: Stock }.
export const getStock = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const rs = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .query("Select CountTypeCode, Count(BagNo) as Stock from vw_BagStock WHERE CompanyCode = @CompanyCode Group by CountTypeCode");
    const map = {};
    for (const r of rs.recordset || []) map[toInt(r.CountTypeCode)] = toInt(r.Stock);
    return sendSuccess(res, map);
  } catch (err) {
    console.error("DB Error (YarnPurchaseOrder.getStock):", err);
    return sendError(res, err);
  }
};

// GET /yarn-purchase-order/lists — purchase orders for the company + FY.
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const rs = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("FYCode", sql.Int, getFYCode(req))
      .execute("sp_YarnPurchaseOrder_GetAll");
    return sendSuccess(res, rs.recordset || []);
  } catch (err) {
    console.error("DB Error (YarnPurchaseOrder.getList):", err);
    return sendError(res, err);
  }
};

// GET /yarn-purchase-order/:code — full record for edit (header + detail lines).
export const getOne = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const code = toInt(req.params.code);
    if (code <= 0) return sendError(res, "Invalid YarnPurchaseOrderCode", 400);

    const [header, details] = await Promise.all([
      pool.request().input("Code", sql.Int, code).query("Select * from vw_YarnPurchaseOrder Where YarnPurchaseOrderCode = @Code"),
      pool.request().input("Code", sql.Int, code).query("Select * from vw_YarnPurchaseOrderDetails Where YarnPurchaseOrderCode = @Code"),
    ]);

    if (!(header.recordset || []).length) return sendError(res, "Yarn Purchase Order not found", 404);
    return sendSuccess(res, {
      header: header.recordset[0],
      details: details.recordset || [],
    });
  } catch (err) {
    console.error("DB Error (YarnPurchaseOrder.getOne):", err);
    return sendError(res, err);
  }
};

// Validate the header + grid before saving (mirrors btnSave_Click / btnPlus guards).
const validateBody = (b) => {
  const details = Array.isArray(b.details) ? b.details : [];
  if (!details.length) return "Enter the Yarn Purchase Order Details";
  if (toInt(b.SupplierCode) <= 0) return "Select the Supplier";
  if (!str(b.PONo)) return "P.O. No should not be empty";
  if (toInt(b.TaxTypeCode) <= 0) return "Select the Tax Type";
  if (str(b.PaymentType) === "CR" && toInt(b.CreditDays) <= 0) return "Credit Days should not be zero";
  return null;
};

// Bind the sp_YarnPurchaseOrder_AddEdit header params (shared by create + update).
const bindHeader = (request, b, { companyCode, userId, nodeCode, fyCode }) => {
  request.input("YarnPurchaseOrderDate", sql.DateTime, D(b.YarnPurchaseOrderDate));
  request.input("YarnPurchaseOrderNo", sql.Int, toInt(b.YarnPurchaseOrderNo));
  request.input("SupplierCode", sql.Int, toInt(b.SupplierCode));
  request.input("PODate", sql.DateTime, D(b.PODate) || D(b.YarnPurchaseOrderDate));
  request.input("PONo", sql.NVarChar, str(b.PONo));
  request.input("OtherChargesCode", sql.Int, toInt(b.OtherChargesCode));
  request.input("PaymentType", sql.NVarChar, str(b.PaymentType).slice(0, 2) || "CA");
  request.input("CreditDays", sql.Int, toInt(b.CreditDays));
  request.input("Freight", sql.Bit, b.Freight ? 1 : 0);
  request.input("Remarks", sql.NVarChar, str(b.Remarks));
  request.input("TotalQty", sql.Decimal(18, 3), toNum(b.TotalQty));
  request.input("TotalWeight", sql.Decimal(18, 3), toNum(b.TotalWeight));
  request.input("CommissionType", sql.Int, toInt(b.CommissionType));
  request.input("CommissionTypeName", sql.NVarChar, str(b.CommissionTypeName));
  request.input("CommissionPer", sql.Decimal(18, 3), toNum(b.CommissionPer));
  request.input("CommissionRs", sql.Decimal(18, 3), toNum(b.CommissionRs));
  request.input("FYCode", sql.Int, fyCode);
  request.input("CompanyCode", sql.Int, companyCode);
  request.input("User", sql.Int, toInt(userId));
  request.input("Node", sql.Int, toInt(nodeCode));
};

// Insert all detail (Count) lines for a saved code (shared by create + update).
const saveDetailLines = async (tx, code, b, companyCode) => {
  const details = Array.isArray(b.details) ? b.details : [];
  for (let i = 0; i < details.length; i++) {
    const d = details[i];
    await new sql.Request(tx)
      .input("YarnPurchaseOrderCode", sql.Int, code)
      .input("SNo", sql.Int, i + 1)
      .input("CountTypeCode", sql.Int, toInt(d.CountTypeCode))
      .input("TaxTypeCode", sql.Int, toInt(b.TaxTypeCode))
      .input("SalesTypeCode", sql.Int, toInt(b.SalesTypeCode))
      .input("CGST", sql.Decimal(18, 3), toNum(d.CGST))
      .input("SGST", sql.Decimal(18, 3), toNum(d.SGST))
      .input("IGST", sql.Decimal(18, 3), toNum(d.IGST))
      .input("Insurance", sql.Decimal(18, 3), toNum(d.Insurance))
      .input("BED", sql.Decimal(18, 3), toNum(d.BED))
      .input("AED", sql.Decimal(18, 3), toNum(d.AED))
      .input("CESS", sql.Decimal(18, 3), toNum(d.CESS))
      .input("TNGST", sql.Decimal(18, 3), toNum(d.TNGST))
      .input("Surcharge", sql.Decimal(18, 3), toNum(d.Surcharge))
      .input("FreightAmount", sql.Decimal(18, 3), toNum(d.FreightAmount))
      .input("FabricCharge", sql.Decimal(18, 3), toNum(d.FabricCharge))
      .input("StdWeight", sql.Decimal(18, 3), toNum(d.StdWeight))
      .input("DeliveryWeight", sql.Decimal(18, 3), toNum(d.DeliveryWeight))
      .input("LessWeight", sql.Decimal(18, 3), toNum(d.LessWeight))
      .input("Weight", sql.Decimal(18, 3), toNum(d.Weight))
      .input("Qty", sql.Decimal(18, 3), toNum(d.Qty))
      .input("Amount", sql.Decimal(18, 3), toNum(d.Amount))
      .input("Rate", sql.Decimal(18, 6), toNum(d.Rate))
      .input("RateEx", sql.Decimal(18, 6), toNum(d.RateEx))
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_YarnPurchaseOrderDetails_Insert");
  }
};

// POST /yarn-purchase-order/create — header + count lines in one transaction.
export const create = async (req, res) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode) return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const companyCode = getCompanyCode(req);
    if (companyCode <= 0) return sendError(res, "Select the Company", 400);
    const fyCode = getFYCode(req);
    const b = req.body || {};
    if (!D(b.YarnPurchaseOrderDate)) return sendError(res, "Invalid Yarn Purchase Order Date", 400);
    const vErr = validateBody(b);
    if (vErr) return sendError(res, vErr, 400);

    const pool = await getPool(req.headers.subdbname);
    tx = new sql.Transaction(pool);
    await tx.begin();

    const head = new sql.Request(tx);
    bindHeader(head, b, { companyCode, userId, nodeCode, fyCode });
    const headRes = await head.execute("sp_YarnPurchaseOrder_AddEdit");
    const code = toInt(Object.values(headRes.recordset?.[0] || {})[0]);
    if (code <= 0) {
      await tx.rollback();
      return sendError(res, "YarnPurchaseOrderCode could not be generated", 400);
    }

    await saveDetailLines(tx, code, b, companyCode);
    await tx.commit();
    return sendSuccess(res, { YarnPurchaseOrderCode: code }, "The record(s) are saved", 201);
  } catch (err) {
    if (tx) { try { await tx.rollback(); } catch (_) {} }
    console.error("DB Error (YarnPurchaseOrder.create):", err);
    return sendError(res, err);
  }
};

// PUT /yarn-purchase-order/update/:code — re-run AddEdit, delete details, re-insert.
export const update = async (req, res) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode) return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const companyCode = getCompanyCode(req);
    const fyCode = getFYCode(req);
    const code = toInt(req.params.code);
    if (code <= 0) return sendError(res, "Invalid YarnPurchaseOrderCode", 400);
    const b = req.body || {};
    if (!D(b.YarnPurchaseOrderDate)) return sendError(res, "Invalid Yarn Purchase Order Date", 400);
    const vErr = validateBody(b);
    if (vErr) return sendError(res, vErr, 400);

    const pool = await getPool(req.headers.subdbname);
    tx = new sql.Transaction(pool);
    await tx.begin();

    // Re-run sp_YarnPurchaseOrder_AddEdit with the existing code (header upsert).
    const head = new sql.Request(tx);
    head.input("YarnPurchaseOrderCode", sql.Int, code);
    bindHeader(head, b, { companyCode, userId, nodeCode, fyCode });
    const headRes = await head.execute("sp_YarnPurchaseOrder_AddEdit");
    const savedCode = toInt(Object.values(headRes.recordset?.[0] || {})[0]) || code;

    // Clear the existing detail lines, then re-insert from the payload.
    await new sql.Request(tx)
      .input("YarnPurchaseOrderCode", sql.Int, savedCode)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_YarnPurchaseOrderDetails_Delete");

    await saveDetailLines(tx, savedCode, b, companyCode);
    await tx.commit();
    return sendSuccess(res, { YarnPurchaseOrderCode: savedCode }, "The record(s) are saved");
  } catch (err) {
    if (tx) { try { await tx.rollback(); } catch (_) {} }
    console.error("DB Error (YarnPurchaseOrder.update):", err);
    return sendError(res, err);
  }
};

// DELETE /yarn-purchase-order/:code — sp_YarnPurchaseOrder_Delete.
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (code <= 0) return sendError(res, "Invalid YarnPurchaseOrderCode", 400);
    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("YarnPurchaseOrderCode", sql.Int, code)
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_YarnPurchaseOrder_Delete");
    return sendSuccess(res, { YarnPurchaseOrderCode: code }, "The record is deleted");
  } catch (err) {
    if (err.message && err.message.includes("FK_"))
      return sendError(res, "The Yarn Purchase Order is in Use. Can't able to Delete", 409);
    console.error("DB Error (YarnPurchaseOrder.remove):", err);
    return sendError(res, err);
  }
};
