import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Yarn Sales Order (port of WinForms frmSalesOrderAdd + frmSalesOrderDetails).
// A master with FOUR detail grids: Count lines, Quality parameters, Packing,
// and Delivery schedule. Save writes the header (sp_SalesOrder_Add → SOCode)
// then loops each grid into its proc, all in one transaction. Edit deletes the
// four detail sets first, then re-inserts.
//
//   Options       : GET /yarn-sales-order/options
//   Tax types     : GET /yarn-sales-order/tax-types?salesTypeCode=
//   Next SO No    : GET /yarn-sales-order/next-no?date=
//   Customer credit: GET /yarn-sales-order/customer-credit?customerCode=
//   Count stock   : GET /yarn-sales-order/stock
//   Quality STD   : GET /yarn-sales-order/quality-std?cqtStdCode=
//   List          : GET /yarn-sales-order/lists
//   One (edit)    : GET /yarn-sales-order/:soCode
//   Create        : POST /yarn-sales-order/create
//   Update        : PUT  /yarn-sales-order/update/:soCode
//   Delete        : DELETE /yarn-sales-order/:soCode
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

// GET /yarn-sales-order/options — every dropdown + settings the screen needs.
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    const [
      customers, agents, salesIncharges, salesTypes, otherCharges,
      countTypes, lotNos, deliveryCustomers, qualityStds, settings,
    ] = await Promise.all([
      pool.request().execute("sp_SalesOrder_Customer_Bind"),
      pool.request().query(
        "Select AgentCode, AgentName, ISNULL(CommissionPerBag,0) AS CommissionPerBag, ISNULL(CommissionPerKg,0) AS CommissionPerKg, ISNULL(CommissionPerExmill,0) AS CommissionPerExmill from tbl_Agent where Yarn=1 Order by AgentName"
      ),
      pool.request().input("CompanyCode", sql.Int, companyCode).input("Status", sql.Bit, 1).execute("sp_SalesIncharge_GetAll"),
      pool.request().query("Select SalesType, Prefix, SalesTypeCode, HeadCode from tbl_SalesType where Status=1"),
      pool.request().query("Select OtherChargesCode, OtherCharges, PerKg, Amount from tbl_OtherCharges where Status=1"),
      pool.request().query("SELECT ShortName, CountName, CountType, StdWeight, DeliveryWeight, CountTypeCode, CountNameCode, YarnBagNoGroupName FROM vw_CountType Where Status=1"),
      pool.request().query("Select LotNoCode, LotNo, LotDate from tbl_LotNo Where Status=1 ORDER BY LotNoCode DESC"),
      pool.request().query("Select CustomerCode, CustomerName from vw_Customer Where Status = 1 Order by CustomerName"),
      pool.request().query("Select CQTSTDName, CQTSTDCode from tbl_CQTSTD"),
      pool.request().input("CompanyCode", sql.Int, companyCode).query(
        "Select TOP 1 ISNULL(Yarn_SalesOrder_Control,0) AS Yarn_SalesOrder_Control, ISNULL(Yarn_SalesOrder_NetRate_Enable,0) AS Yarn_SalesOrder_NetRate_Enable from tbl_Setting WHERE CompanyCode = @CompanyCode"
      ),
    ]);

    const setting = settings.recordset?.[0] || {};
    return sendSuccess(res, {
      customers: opt(customers, "CustomerCode", "CustomerName"),
      agents: opt(agents, "AgentCode", "AgentName"),
      salesIncharges: opt(salesIncharges, "SalesInchargeCode", "SalesInchargeName"),
      salesTypes: opt(salesTypes, "SalesTypeCode", "SalesType"),
      otherCharges: opt(otherCharges, "OtherChargesCode", "OtherCharges"),
      countTypes: opt(countTypes, "CountTypeCode", "CountType"),
      lotNos: opt(lotNos, "LotNoCode", "LotNo"),
      deliveryCustomers: opt(deliveryCustomers, "CustomerCode", "CustomerName"),
      qualityStds: opt(qualityStds, "CQTSTDCode", "CQTSTDName"),
      paymentTypes: [
        { value: "CA", label: "CASH" },
        { value: "CR", label: "CREDIT" },
      ],
      commissionTypes: [
        { value: 0, label: "QTY" },
        { value: 1, label: "WEIGHT" },
        { value: 2, label: "EX-MILL VALUE" },
      ],
      salesOrderControl: toInt(setting.Yarn_SalesOrder_Control) === 1,
      netRateEnable: toInt(setting.Yarn_SalesOrder_NetRate_Enable) === 1,
    });
  } catch (err) {
    console.error("DB Error (YarnSalesOrder.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /yarn-sales-order/tax-types?salesTypeCode= — tax rows (carry CGST/SGST/...).
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
    console.error("DB Error (YarnSalesOrder.getTaxTypes):", err);
    return sendError(res, err);
  }
};

// GET /yarn-sales-order/next-no?date= — sp_SalesOrder_GetSONo.
export const getNextNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const rs = await pool
      .request()
      .input("FYCode", sql.Int, getFYCode(req))
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("SODate", sql.DateTime, D(req.query.date) || new Date())
      .execute("sp_SalesOrder_GetSONo");
    const soNo = rs.recordset?.[0] ? Object.values(rs.recordset[0])[0] : 0;
    return sendSuccess(res, { soNo: toInt(soNo) });
  } catch (err) {
    console.error("DB Error (YarnSalesOrder.getNextNo):", err);
    return sendError(res, err);
  }
};

// GET /yarn-sales-order/customer-credit?customerCode= — credit limit / balance.
export const getCustomerCredit = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const companyCode = getCompanyCode(req);
    const customerCode = toInt(req.query.customerCode);
    const today = new Date();

    const [ledger, limit] = await Promise.all([
      pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("FromDate", sql.DateTime, today)
        .input("ToDate", sql.DateTime, today)
        .input("CustomerCode", sql.Int, customerCode)
        .execute("sp_CustomerLedger_Detailed"),
      pool.request().input("CustomerCode", sql.Int, customerCode).query("Select CreditLimit from tbl_Customer where CustomerCode = @CustomerCode"),
    ]);

    const total = (ledger.recordset || []).reduce((s, r) => s + toNum(r.ClosingAmount), 0);
    const creditLimit = toNum(limit.recordset?.[0]?.CreditLimit);
    return sendSuccess(res, { total, creditLimit, available: creditLimit - total });
  } catch (err) {
    console.error("DB Error (YarnSalesOrder.getCustomerCredit):", err);
    return sendError(res, err);
  }
};

// GET /yarn-sales-order/stock — count-wise bag stock { [CountTypeCode]: Stock }.
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
    console.error("DB Error (YarnSalesOrder.getStock):", err);
    return sendError(res, err);
  }
};

// GET /yarn-sales-order/quality-std?cqtStdCode= — parameter rows for a STD.
export const getQualityStdDetails = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const rs = await pool
      .request()
      .input("CQTSTDCode", sql.Int, toInt(req.query.cqtStdCode))
      .query("Select * from vw_CQTSTDDetails Where CQTSTDCode = @CQTSTDCode Order by OrderNo");
    return sendSuccess(res, rs.recordset || []);
  } catch (err) {
    console.error("DB Error (YarnSalesOrder.getQualityStdDetails):", err);
    return sendError(res, err);
  }
};

// GET /yarn-sales-order/lists — open sales orders (Approval=0, Cancel=0).
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const rs = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("FYCode", sql.Int, getFYCode(req))
      .query("Select * from vw_SalesOrder where CompanyCode = @CompanyCode AND Approval=0 and Cancel=0 and FYCode = @FYCode");
    return sendSuccess(res, rs.recordset || []);
  } catch (err) {
    console.error("DB Error (YarnSalesOrder.getList):", err);
    return sendError(res, err);
  }
};

// GET /yarn-sales-order/:soCode — full record for edit (header + 4 detail sets).
export const getOne = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const soCode = toInt(req.params.soCode);
    if (soCode <= 0) return sendError(res, "Invalid SOCode", 400);

    const [header, details, delivery, packing, quality] = await Promise.all([
      pool.request().input("SOCode", sql.Int, soCode).query("Select * from tbl_Salesorder Where SOCode = @SOCode"),
      pool.request().input("SOCode", sql.Int, soCode).query("Select * from vw_SalesorderDetails Where SOCode = @SOCode"),
      pool.request().input("SOCode", sql.Int, soCode).query("Select * from tbl_SalesOrder_DeliverySchedule Where SOCode = @SOCode"),
      pool.request().input("SOCode", sql.Int, soCode).query("Select * from tbl_SalesOrder_PackingDetails Where SOCode = @SOCode"),
      pool.request().input("SOCode", sql.Int, soCode).query("Select * from vw_SalesOrder_Quality Where SOCode = @SOCode"),
    ]);

    if (!(header.recordset || []).length) return sendError(res, "Sales Order not found", 404);
    return sendSuccess(res, {
      header: header.recordset[0],
      details: details.recordset || [],
      delivery: delivery.recordset || [],
      packing: packing.recordset || [],
      quality: quality.recordset || [],
    });
  } catch (err) {
    console.error("DB Error (YarnSalesOrder.getOne):", err);
    return sendError(res, err);
  }
};

// Validate the header + grids before saving (mirrors btnSave_Click guards).
const validateBody = (b, salesOrderControl) => {
  const details = Array.isArray(b.details) ? b.details : [];
  if (!details.length) return "Enter the Sales Order Details";
  if (toInt(b.CustomerCode) <= 0) return "Select the Customer Name";
  if (toInt(b.SalesInchargeCode) <= 0) return "Select the Sales Incharge";
  if (toInt(b.OtherChargesCode) <= 0) return "Select the Other Charges";
  if (toInt(b.SalesTypeCode) <= 0) return "Select the Sales Type";
  if (toInt(b.TaxTypeCode) <= 0) return "Select the Tax Type";
  if (salesOrderControl) {
    if (!(Array.isArray(b.quality) && b.quality.length)) return "Enter the Quality Parameters";
    if (!(Array.isArray(b.packing) && b.packing.length)) return "Enter the Packing Parameters";
    if (!(Array.isArray(b.delivery) && b.delivery.length)) return "Enter the Delivery Details";
  }
  return null;
};

// Insert all four detail grids for a saved SOCode (shared by create + update).
const saveDetailGrids = async (tx, soCode, b, companyCode) => {
  const details = Array.isArray(b.details) ? b.details : [];
  const quality = Array.isArray(b.quality) ? b.quality : [];
  const delivery = Array.isArray(b.delivery) ? b.delivery : [];
  const packing = Array.isArray(b.packing) ? b.packing : [];

  for (let i = 0; i < details.length; i++) {
    const d = details[i];
    await new sql.Request(tx)
      .input("SOCode", sql.Int, soCode)
      .input("SNo", sql.Int, i + 1)
      .input("CountTypeCode", sql.Int, toInt(d.CountTypeCode))
      .input("TaxTypeCode", sql.Int, toInt(d.TaxTypeCode))
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
      .input("DeliveryCustomerCode", sql.Int, toInt(d.DeliveryCustomerCode))
      .input("CompanyCode", sql.Int, companyCode)
      .input("LotNoCode", sql.Int, toInt(d.LotNoCode))
      .execute("sp_SalesOrderDetails_Add");
  }

  for (let i = 0; i < quality.length; i++) {
    const q = quality[i];
    await new sql.Request(tx)
      .input("SOCode", sql.Int, soCode)
      .input("SNo", sql.Int, i + 1)
      .input("CQTParameterCode", sql.Int, toInt(q.CQTParameterCode))
      .input("FromParameter", sql.NVarChar, str(q.FromParameter))
      .input("FROM1", sql.NVarChar, str(q.FROM1))
      .input("ToParameter", sql.NVarChar, str(q.ToParameter))
      .input("TO1", sql.NVarChar, str(q.TO1))
      .input("PartyFrom", sql.NVarChar, str(q.PartyFrom))
      .input("PartyFrom1", sql.NVarChar, str(q.PartyFrom1))
      .input("PartyTo", sql.NVarChar, str(q.PartyTo))
      .input("PartyTo1", sql.NVarChar, str(q.PartyTo1))
      .input("STDType", sql.NVarChar, str(q.STDType))
      .execute("sp_SalesOrder_Quality_Insert");
  }

  for (const dl of delivery) {
    await new sql.Request(tx)
      .input("SOCode", sql.Int, soCode)
      .input("DeliveryScheduleDate", sql.DateTime, D(dl.DeliveryScheduleDate))
      .input("DeliveryQty", sql.Decimal(18, 3), toNum(dl.DeliveryQty))
      .input("DeliveryWt", sql.Decimal(18, 3), toNum(dl.DeliveryWt))
      .execute("sp_SalesOrder_DeliverySchedule_Insert");
  }

  for (const p of packing) {
    await new sql.Request(tx)
      .input("SOCode", sql.Int, soCode)
      .input("SingDoub", sql.NVarChar, str(p.SingDoub))
      .input("ConeTipClr", sql.NVarChar, str(p.ConeTipClr))
      .input("ConeWt", sql.Decimal(18, 3), toNum(p.ConeWt))
      .input("NoOfCone", sql.Int, toInt(p.NoOfCone))
      .input("NoOfPack", sql.Int, toInt(p.NoOfPack))
      .input("PackWt", sql.Decimal(18, 3), toNum(p.PackWt))
      .input("BoxColour", sql.NVarChar, str(p.BoxColour))
      .input("NoOfStrap", sql.Int, toInt(p.NoOfStrap))
      .input("OriginalReport", sql.NVarChar, str(p.OriginalReport))
      .input("YCP", sql.NVarChar, str(p.YCP))
      .execute("sp_SalesOrder_Packing_Insert");
  }
};

// Bind the sp_SalesOrder_Add header params (shared by create + update).
const bindHeader = (request, b, { companyCode, userId, nodeCode }) => {
  request.input("SODate", sql.DateTime, D(b.SODate));
  request.input("SONo", sql.Int, toInt(b.SONo));
  request.input("Sample", sql.Bit, b.Sample ? 1 : 0);
  request.input("SalesInchargeCode", sql.Int, toInt(b.SalesInchargeCode));
  request.input("CustomerCode", sql.Int, toInt(b.CustomerCode));
  request.input("AgentCode", sql.Int, toInt(b.AgentCode));
  request.input("PODate", sql.DateTime, D(b.PODate) || D(b.SODate));
  request.input("PONo", sql.NVarChar, str(b.PONo));
  request.input("OtherChargesCode", sql.Int, toInt(b.OtherChargesCode));
  request.input("PaymentType", sql.NVarChar, str(b.PaymentType).slice(0, 2) || "CA");
  request.input("CreditDays", sql.Int, toInt(b.CreditDays));
  request.input("Freight", sql.Bit, b.Freight ? 1 : 0);
  request.input("Remarks", sql.NVarChar, str(b.Remarks));
  request.input("CommissionType", sql.Int, toInt(b.CommissionType));
  request.input("CommissionTypeName", sql.NVarChar, str(b.CommissionTypeName));
  request.input("CommissionPer", sql.Decimal(18, 3), toNum(b.CommissionPer));
  request.input("CommissionRs", sql.Decimal(18, 3), toNum(b.CommissionRs));
  request.input("CompanyCode", sql.Int, companyCode);
};

// POST /yarn-sales-order/create — header + 4 detail grids in one transaction.
export const create = async (req, res) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode) return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const companyCode = getCompanyCode(req);
    if (companyCode <= 0) return sendError(res, "Select the Company", 400);
    const b = req.body || {};
    if (!D(b.SODate)) return sendError(res, "Invalid Sales Order Date", 400);

    const pool = await getPool(req.headers.subdbname);
    const setting = await pool.request().input("CompanyCode", sql.Int, companyCode).query(
      "Select TOP 1 ISNULL(Yarn_SalesOrder_Control,0) AS C from tbl_Setting WHERE CompanyCode = @CompanyCode"
    );
    const control = toInt(setting.recordset?.[0]?.C) === 1;
    const vErr = validateBody(b, control);
    if (vErr) return sendError(res, vErr, 400);

    tx = new sql.Transaction(pool);
    await tx.begin();

    const head = new sql.Request(tx);
    bindHeader(head, b, { companyCode, userId, nodeCode });
    head.input("C_User", sql.Int, toInt(userId));
    head.input("C_Node", sql.Int, toInt(nodeCode));
    const headRes = await head.execute("sp_SalesOrder_Add");
    const soCode = toInt(Object.values(headRes.recordset?.[0] || {})[0]);
    if (soCode <= 0) {
      await tx.rollback();
      return sendError(res, "SOCode could not be generated", 400);
    }

    await saveDetailGrids(tx, soCode, b, companyCode);
    await tx.commit();
    return sendSuccess(res, { SOCode: soCode }, "The record(s) are saved", 201);
  } catch (err) {
    if (tx) { try { await tx.rollback(); } catch (_) {} }
    console.error("DB Error (YarnSalesOrder.create):", err);
    return sendError(res, err);
  }
};

// PUT /yarn-sales-order/update/:soCode — delete the 4 detail sets, re-insert.
export const update = async (req, res) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode) return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const companyCode = getCompanyCode(req);
    const soCode = toInt(req.params.soCode);
    if (soCode <= 0) return sendError(res, "Invalid SOCode", 400);
    const b = req.body || {};
    if (!D(b.SODate)) return sendError(res, "Invalid Sales Order Date", 400);

    const pool = await getPool(req.headers.subdbname);
    const setting = await pool.request().input("CompanyCode", sql.Int, companyCode).query(
      "Select TOP 1 ISNULL(Yarn_SalesOrder_Control,0) AS C from tbl_Setting WHERE CompanyCode = @CompanyCode"
    );
    const control = toInt(setting.recordset?.[0]?.C) === 1;
    const vErr = validateBody(b, control);
    if (vErr) return sendError(res, vErr, 400);

    tx = new sql.Transaction(pool);
    await tx.begin();

    // Re-run sp_SalesOrder_Add with the existing Socode (header upsert).
    const head = new sql.Request(tx);
    head.input("Socode", sql.Int, soCode);
    bindHeader(head, b, { companyCode, userId, nodeCode });
    head.input("C_User", sql.Int, toInt(userId));
    head.input("C_Node", sql.Int, toInt(nodeCode));
    const headRes = await head.execute("sp_SalesOrder_Add");
    const savedCode = toInt(Object.values(headRes.recordset?.[0] || {})[0]) || soCode;

    // Clear the four detail sets, then re-insert from the payload.
    await new sql.Request(tx).input("SOCode", sql.Int, savedCode).input("CompanyCode", sql.Int, companyCode).execute("sp_SalesOrderDetails_Delete");
    await new sql.Request(tx).input("SOCode", sql.Int, savedCode).execute("sp_SalesOrder_DeliverySchedule_Delete");
    await new sql.Request(tx).input("SOCode", sql.Int, savedCode).execute("sp_SalesOrder_Packing_Delete");
    await new sql.Request(tx).input("SOCode", sql.Int, savedCode).execute("sp_SalesOrder_Quality_Delete");

    await saveDetailGrids(tx, savedCode, b, companyCode);
    await tx.commit();
    return sendSuccess(res, { SOCode: savedCode }, "The record(s) are saved");
  } catch (err) {
    if (tx) { try { await tx.rollback(); } catch (_) {} }
    console.error("DB Error (YarnSalesOrder.update):", err);
    return sendError(res, err);
  }
};

// DELETE /yarn-sales-order/:soCode — sp_SalesOrder_Delete.
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const soCode = toInt(req.params.soCode);
    if (soCode <= 0) return sendError(res, "Invalid SOCode", 400);
    const pool = await getPool(req.headers.subdbname);
    await pool.request().input("SOCode", sql.Int, soCode).execute("sp_SalesOrder_Delete");
    return sendSuccess(res, { SOCode: soCode }, "The record is deleted");
  } catch (err) {
    if (err.message && err.message.includes("FK_"))
      return sendError(res, "You can not delete the Sales Order!", 409);
    console.error("DB Error (YarnSalesOrder.remove):", err);
    return sendError(res, err);
  }
};
