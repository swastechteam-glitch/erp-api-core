import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Yarn GRN (Inward) — port of WinForms frmYarnGRN (+ frmYarnGRNDetails list).
// Two-tab screen: PENDING (pick a pending purchase order by supplier) and the
// GRN ENTRY form (header + per-bag detail grid + PO-balance grid + tax totals).
// Save writes the header (sp_YarnGRN_AddEdit → YarnGRNCode), clears + re-inserts
// the bag lines (sp_YarnGRNDetails_Insert) and — unless "skip stock" is set —
// also pushes each bag into yarn stock (sp_YarnStock_AddEdit), all in one
// transaction.
//
//   Options       : GET  /yarn-grn/options
//   Next GRN No   : GET  /yarn-grn/next-no
//   Bag No        : GET  /yarn-grn/bag-no?countTypeCode=&date=
//   Pending POs   : GET  /yarn-grn/pending?supplierCode=
//   PO detail     : GET  /yarn-grn/pending-detail/:code
//   List          : GET  /yarn-grn/lists
//   Create        : POST /yarn-grn/create
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

// GET /yarn-grn/options — every dropdown the screen needs.
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const fyCode = getFYCode(req);
    const pool = await getPool(req.headers.subdbname);

    const [
      suppliers, employees, packingTypes, lotNos, gateEntries,
      taxTypes, boxPackings, bagColours, tipColours,
    ] = await Promise.all([
      pool.request().query("Select SupplierCode, SupplierName, Address1, Address2, City, District, PinCode from tbl_Supplier where Status = 1 AND SupplierID IS NOT NULL AND SupplierName IS NOT NULL Order by SupplierName"),
      pool.request().input("CompanyCode", sql.Int, companyCode).query("Select EmployeeCode, EmployeeName from tbl_Employee where CompanyCode = @CompanyCode"),
      pool.request().query("Select YarnPackingType, YarnPackingTypeCode from tbl_YarnPackingType"),
      pool.request().query("Select LotNo, LotNoCode from tbl_LotNo"),
      pool.request().input("CompanyCode", sql.Int, companyCode).input("FYCode", sql.Int, fyCode).query("Select GoodsInPassCode, CONVERT(varchar, GoodsPassNumber) as GoodsInPassNo from tbl_GateEntryGoodsIn where CompanyCode = @CompanyCode AND TransGoodsTypeCode IN (1,3,4) AND FYCode = @FYCode"),
      pool.request().query("Select SalesTypeCode, TaxTypeCode, TaxType, TaxName, CGST, SGST, IGST, PackingCharges from tbl_TaxType where Status = 1 Order by TaxName"),
      pool.request().execute("sp_BoxPacking_GetAll"),
      pool.request().execute("sp_BagColour_GetAll"),
      pool.request().execute("sp_TipColour_GetAll"),
    ]);

    return sendSuccess(res, {
      suppliers: opt(suppliers, "SupplierCode", "SupplierName"),
      employees: opt(employees, "EmployeeCode", "EmployeeName"),
      packingTypes: opt(packingTypes, "YarnPackingTypeCode", "YarnPackingType"),
      lotNos: opt(lotNos, "LotNoCode", "LotNo"),
      gateEntries: opt(gateEntries, "GoodsInPassCode", "GoodsInPassNo"),
      taxTypes: opt(taxTypes, "TaxTypeCode", "TaxType"),
      boxPackings: opt(boxPackings, "BoxPackingCode", "BoxPackingName"),
      bagColours: opt(bagColours, "BagColourCode", "BagColour"),
      tipColours: opt(tipColours, "TipColourCode", "TipColour"),
    });
  } catch (err) {
    console.error("DB Error (YarnGRN.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /yarn-grn/next-no — sp_YarnGRN_BindNo.
export const getNextNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const rs = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("FYCode", sql.Int, getFYCode(req))
      .execute("sp_YarnGRN_BindNo");
    const no = rs.recordset?.[0] ? Object.values(rs.recordset[0])[0] : 0;
    return sendSuccess(res, { grnNo: toInt(no) });
  } catch (err) {
    console.error("DB Error (YarnGRN.getNextNo):", err);
    return sendError(res, err);
  }
};

// GET /yarn-grn/bag-no?countTypeCode=&date= — next bag no (GetBagNo).
export const getBagNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const companyCode = getCompanyCode(req);
    const date = D(req.query.date) || new Date();
    const countTypeCode = toInt(req.query.countTypeCode);
    const yarnBagNoGroupCode = toInt(req.query.yarnBagNoGroupCode);

    const setting = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .query("Select ISNULL(YarnBagNoSetting,0) as YarnBagNoSetting from tbl_Setting WHERE CompanyCode = @CompanyCode");
    const bySetting = !!toInt(setting.recordset?.[0]?.YarnBagNoSetting);

    let bagNo = "";
    if (!bySetting) {
      const rs = await pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("ProductionDate", sql.DateTime, date)
        .execute("sp_YarnProduction_BagNo");
      bagNo = rs.recordset?.[0] ? Object.values(rs.recordset[0])[0] : "";
    } else if (countTypeCode > 0) {
      const rs = await pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("ProductionDate", sql.DateTime, date)
        .input("YarnBagNoGroupCode", sql.Int, yarnBagNoGroupCode)
        .execute("sp_YarnProduction_BagNo_GetbyBagSetting");
      bagNo = rs.recordset?.[0] ? Object.values(rs.recordset[0])[0] : "";
    }
    return sendSuccess(res, { bagNo: bagNo ?? "" });
  } catch (err) {
    console.error("DB Error (YarnGRN.getBagNo):", err);
    return sendError(res, err);
  }
};

// GET /yarn-grn/pending?supplierCode= — pending purchase orders (Grid_Pendings).
export const getPending = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const request = pool.request().input("CompanyCode", sql.Int, getCompanyCode(req));
    const supplierCode = toInt(req.query.supplierCode);
    if (supplierCode > 0) request.input("SupplierCode", sql.Int, supplierCode);
    const rs = await request.execute("sp_YarnPurchaseOrder_GetPending");
    return sendSuccess(res, rs.recordset || []);
  } catch (err) {
    console.error("DB Error (YarnGRN.getPending):", err);
    return sendError(res, err);
  }
};

// GET /yarn-grn/pending-detail/:code — the PO's count-balance lines + count types.
export const getPendingDetail = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const code = toInt(req.params.code);
    if (code <= 0) return sendError(res, "Invalid YarnPurchaseOrderCode", 400);

    const [details, countTypes] = await Promise.all([
      pool.request().input("YarnPurchaseOrderCode", sql.Int, code).execute("sp_YarnPurchaseOrderDetails_GetPending"),
      pool.request().input("YarnPurchaseOrderCode", sql.Int, code).execute("sp_Yarn_GRN_GetItem"),
    ]);
    return sendSuccess(res, {
      details: details.recordset || [],
      countTypes: opt(countTypes, "CountTypeCode", "CountType"),
    });
  } catch (err) {
    console.error("DB Error (YarnGRN.getPendingDetail):", err);
    return sendError(res, err);
  }
};

// GET /yarn-grn/lists — saved GRNs for the company + FY (frmYarnGRNDetails).
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const rs = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("FYCode", sql.Int, getFYCode(req))
      .execute("sp_YarnGRN_GetAll");
    return sendSuccess(res, rs.recordset || []);
  } catch (err) {
    console.error("DB Error (YarnGRN.getList):", err);
    return sendError(res, err);
  }
};

// Validate the header + grid before saving (mirrors btnSave_Click guards).
const validateBody = (b) => {
  const details = Array.isArray(b.details) ? b.details : [];
  if (toInt(b.SupplierCode) <= 0) return "Select the Supplier Name";
  if (toInt(b.EmployeeCode) <= 0) return "Select the Entered by";
  if (toInt(b.YarnPackingTypeCode) <= 0) return "Select the Packing Type";
  if (toInt(b.GoodsInPassCode) <= 0) return "Select the Gate Entry No";
  if (!str(b.PONo)) return "Enter the PoNo";
  if (toInt(b.TaxTypeCode) <= 0) return "Select the Tax Type";
  if (!str(b.VehicleNo)) return "Enter the Vehicle No";
  if (!details.length) return "Enter the Details";
  if (toInt(b.YarnPurchaseOrderCode) <= 0) return "Select the Yarn Purchase Order";
  return null;
};

// POST /yarn-grn/create — header + bag lines (+ stock) in one transaction.
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
    if (!D(b.YarnGRNDate)) return sendError(res, "Invalid Yarn GRN Date", 400);
    const vErr = validateBody(b);
    if (vErr) return sendError(res, vErr, 400);

    const details = Array.isArray(b.details) ? b.details : [];
    const pool = await getPool(req.headers.subdbname);
    tx = new sql.Transaction(pool);
    await tx.begin();

    // 1) Header — sp_YarnGRN_AddEdit returns the (new/updated) YarnGRNCode.
    const head = new sql.Request(tx);
    if (toInt(b.YarnGRNCode) > 0) head.input("YarnGRNCode", sql.Int, toInt(b.YarnGRNCode));
    head.input("YarnGRNNo", sql.Int, toInt(b.YarnGRNNo));
    head.input("YarnGRNDate", sql.DateTime, D(b.YarnGRNDate));
    head.input("YarnPurchaseOrderCode", sql.Int, toInt(b.YarnPurchaseOrderCode));
    head.input("YarnPurchaseOrderNo", sql.Int, toInt(b.YarnPurchaseOrderNo));
    head.input("YarnPurchaseOrderDate", sql.DateTime, D(b.YarnPurchaseOrderDate) || D(b.YarnGRNDate));
    head.input("SupplierCode", sql.Int, toInt(b.SupplierCode));
    head.input("PartyInvoiceNo", sql.NVarChar, str(b.PartyInvoiceNo));
    head.input("PartyInvoiceDate", sql.DateTime, D(b.PartyInvoiceDate) || D(b.YarnGRNDate));
    head.input("EmployeeCode", sql.Int, toInt(b.EmployeeCode));
    head.input("YarnProductionTypeCode", sql.Int, toInt(b.YarnProductionTypeCode) || 6);
    head.input("YarnPackingTypeCode", sql.Int, toInt(b.YarnPackingTypeCode));
    head.input("GoodsInPassCode", sql.Int, toInt(b.GoodsInPassCode));
    head.input("VehicleNo", sql.NVarChar, str(b.VehicleNo));
    head.input("TotalQty", sql.Decimal(18, 3), toNum(b.TotalQty));
    head.input("TotalGrossWt", sql.Decimal(18, 3), toNum(b.TotalGrossWt));
    head.input("TotalTareWt", sql.Decimal(18, 3), toNum(b.TotalTareWt));
    head.input("TotalNetWt", sql.Decimal(18, 3), toNum(b.TotalNetWt));
    head.input("TaxTypeCode", sql.Int, toInt(b.TaxTypeCode));
    head.input("BasicAmount", sql.Decimal(18, 2), toNum(b.BasicAmount));
    head.input("FreightAmount", sql.Decimal(18, 2), toNum(b.FreightAmount));
    head.input("TaxableAmount", sql.Decimal(18, 2), toNum(b.TaxableAmount));
    head.input("CGSTPer", sql.Decimal(18, 3), toNum(b.CGSTPer));
    head.input("SGSTPer", sql.Decimal(18, 3), toNum(b.SGSTPer));
    head.input("IGSTPer", sql.Decimal(18, 3), toNum(b.IGSTPer));
    head.input("CGSTAmount", sql.Decimal(18, 2), toNum(b.CGSTAmount));
    head.input("SGSTAmount", sql.Decimal(18, 2), toNum(b.SGSTAmount));
    head.input("IGSTAmount", sql.Decimal(18, 2), toNum(b.IGSTAmount));
    head.input("TotalTaxAmount", sql.Decimal(18, 2), toNum(b.TotalTaxAmount));
    head.input("TotalAmount", sql.Decimal(18, 2), toNum(b.TotalAmount));
    head.input("TCSPer", sql.Decimal(18, 5), toNum(b.TCSPer));
    head.input("TCSAmount", sql.Decimal(18, 2), toNum(b.TCSAmount));
    head.input("Roundoff", sql.Decimal(18, 2), toNum(b.Roundoff));
    head.input("NetAmount", sql.Decimal(18, 2), toNum(b.NetAmount));
    head.input("Remarks", sql.NVarChar, str(b.Remarks));
    head.input("FYCode", sql.Int, fyCode);
    head.input("CompanyCode", sql.Int, companyCode);
    head.input("User", sql.Int, toInt(userId));
    head.input("Node", sql.Int, toInt(nodeCode));
    const headRes = await head.execute("sp_YarnGRN_AddEdit");
    const grnCode = toInt(Object.values(headRes.recordset?.[0] || {})[0]);
    if (grnCode <= 0) {
      await tx.rollback();
      return sendError(res, "YarnGRNCode could not be generated", 400);
    }

    // 2) Clear existing detail lines (idempotent for the AddEdit upsert).
    await new sql.Request(tx)
      .input("YarnGRNCode", sql.Int, grnCode)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_YarnGRNDetails_Delete");

    // 3) Re-insert the bag lines.
    for (const d of details) {
      await new sql.Request(tx)
        .input("YarnGRNCode", sql.Int, grnCode)
        .input("BagNo", sql.NVarChar, str(d.BagNo))
        .input("CountTypeCode", sql.Int, toInt(d.CountTypeCode))
        .input("LotNoCode", sql.Int, toInt(d.LotNoCode))
        .input("Qty", sql.Decimal(18, 3), toNum(d.Qty) || 1)
        .input("GrossWt", sql.Decimal(18, 3), toNum(d.GrossWt))
        .input("TareWt", sql.Decimal(18, 3), toNum(d.TareWt))
        .input("NetWt", sql.Decimal(18, 3), toNum(d.NetWt))
        .input("CompanyCode", sql.Int, companyCode)
        .execute("sp_YarnGRNDetails_Insert");
    }

    // 4) Push each bag into yarn stock unless explicitly skipped (chkStock).
    if (!b.SkipStock) {
      for (const d of details) {
        await new sql.Request(tx)
          .input("C_User", sql.Int, toInt(userId))
          .input("C_Node", sql.Int, toInt(nodeCode))
          .input("ProductionDate", sql.DateTime, D(b.YarnGRNDate))
          .input("Opening", sql.Decimal(18, 3), 0)
          .input("SupervisorCode", sql.Int, 1)
          .input("EmployeeCode", sql.Int, toInt(b.EmployeeCode))
          .input("YarnProductionTypeCode", sql.Int, toInt(b.YarnProductionTypeCode) || 6)
          .input("YarnPackingTypeCode", sql.Int, toInt(b.YarnPackingTypeCode))
          .input("LotNoCode", sql.Int, toInt(d.LotNoCode))
          .input("BagNo", sql.NVarChar, str(d.BagNo))
          .input("CountTypeCode", sql.Int, toInt(d.CountTypeCode))
          .input("GrossWeight", sql.Decimal(18, 3), toNum(d.GrossWt))
          .input("TareWeight", sql.Decimal(18, 3), toNum(d.TareWt))
          .input("NetWeight", sql.Decimal(18, 3), toNum(d.NetWt))
          .input("TrallyWeight", sql.Decimal(18, 3), 0)
          .input("StdWeight", sql.Decimal(18, 3), toNum(d.NetWt))
          .input("DeliveryWeight", sql.Decimal(18, 3), toNum(d.NetWt))
          .input("ConeCount", sql.Int, toInt(d.NoofCones))
          .input("YarnType", sql.NVarChar, "P")
          .input("EntryType", sql.NVarChar, "M")
          .input("YarnBagNoGroupCode", sql.Int, toInt(d.YarnBagNoGroupCode))
          .input("BoxPackingCode", sql.Int, toInt(b.BoxPackingCode))
          .input("BagColourCode", sql.Int, toInt(d.BagColourCode))
          .input("TipColourCode", sql.Int, toInt(d.TipColourCode))
          .input("CompanyCode", sql.Int, companyCode)
          .execute("sp_YarnStock_AddEdit");
      }
    }

    await tx.commit();
    return sendSuccess(res, { YarnGRNCode: grnCode, YarnGRNNo: toInt(b.YarnGRNNo) }, "The record is Saved", 201);
  } catch (err) {
    if (tx) { try { await tx.rollback(); } catch (_) {} }
    console.error("DB Error (YarnGRN.create):", err);
    return sendError(res, err);
  }
};
