import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Yarn Sales Return (port of WinForms frmSalesReturn + frmSalesReturnDetails).
// A master-detail transaction: header (customer / delivery customer / supervisor
// / entered-by / vehicle / sales bags+kgs / remarks) + bag lines entered one at
// a time. Mirrors btnSave_Click exactly:
//     sp_SalesReturn_AddEdit            -> SalesReturnCode   (@User/@Node)
//     sp_SalesReturnDetails_Delete      (clear old lines)
//     loop sp_SalesReturnDetails_Insert (one row per bag)
//     loop sp_YarnStock_AddEdit         (each returned bag RE-ENTERS STOCK; new only)
// The list/edit/delete screen (frmSalesReturnDetails) uses sp_SalesReturn_GetAll
// and sp_SalesReturn_Delete.
//
//   List     : GET    /yarn-sales-return/lists
//   One      : GET    /yarn-sales-return/list/:code
//   Options  : GET    /yarn-sales-return/options
//   Next No  : GET    /yarn-sales-return/next-no
//   Bag No   : GET    /yarn-sales-return/bag-no?bagNoGroupCode=&date=
//   Create   : POST   /yarn-sales-return/create
//   Update   : PUT    /yarn-sales-return/update/:code
//   Delete   : DELETE /yarn-sales-return/delete/:code
//
// Company / FY / userId / nodeCode come from the JWT headers (as in the VB,
// where int_CompanyCode / FYCode / int_UserCode / int_NodeCode are globals).
// The desktop weigh-bridge serial/LAN scale capture is NOT ported (weights are
// typed). Totals are recomputed server-side from the lines. Like cotton sales
// return, the stock re-entry (sp_YarnStock_AddEdit) runs on CREATE only.
//
// INFERRED: loading a saved return's lines for EDIT uses sp_SalesReturnDetails_GetAll
// (degrades to empty if the proc/columns differ); everything else is faithful to
// the procs named in the VB.
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};
const str = (v) => (v == null ? "" : String(v));
const D = (v) => (v ? new Date(v) : new Date());
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getFYCode = (req) => toInt(req.headers.FYCode);
const getUserId = (req) => toInt(req.headers.userId);
const getNodeCode = (req) => toInt(req.headers.nodeCode);

const opt = (rs, valueKey, labelKey) =>
  (rs?.recordset || []).map((r) => ({ ...r, value: r[valueKey], label: r[labelKey] }));

const safe = async (fn, fallback) => {
  try {
    return await fn();
  } catch (e) {
    console.warn("YarnSalesReturn lookup skipped:", e?.message);
    return fallback;
  }
};

const scalar = async (request, proc) => {
  const r = await request.execute(proc);
  const row = r.recordset?.[0];
  return row ? toInt(Object.values(row)[0]) : 0;
};

// GET /yarn-sales-return/options — every combo on the entry form (VB Bind_Data).
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const companyCode = getCompanyCode(req);
    const fyCode = getFYCode(req);

    const customerQ =
      "Select CustomerCode,CustomerName,Address1,City,PhoneNo,MobileNo from tbl_Customer where Status = 1 AND CustomerID IS NOT NULL AND CustomerName IS NOT NULL Order by CustomerName";

    const [countTypes, customers, employees, packingTypes, supervisors, lotNos, productionTypes, gateEntries, boxPackings] =
      await Promise.all([
        safe(() => pool.request().query("Select CountTypeCode,CountType,CountName,YarnBagNoGroupCode,BagColourCode,TipColourCode from vw_CountType WHere Status =1 Order by CountName").then((r) => opt(r, "CountTypeCode", "CountType")), []),
        safe(() => pool.request().query(customerQ).then((r) => opt(r, "CustomerCode", "CustomerName")), []),
        safe(() => pool.request().input("CompanyCode", sql.Int, companyCode).query("Select EmployeeCode,EmployeeName from tbl_Employee where CompanyCode = @CompanyCode").then((r) => opt(r, "EmployeeCode", "EmployeeName")), []),
        safe(() => pool.request().query("Select YarnPackingType,YarnPackingTypeCode from tbl_YarnPackingType").then((r) => opt(r, "YarnPackingTypeCode", "YarnPackingType")), []),
        safe(() => pool.request().query("Select SupervisorName,SupervisorCode from tbl_Supervisor").then((r) => opt(r, "SupervisorCode", "SupervisorName")), []),
        safe(() => pool.request().query("Select LotNo,LotNoCode from tbl_LotNo").then((r) => opt(r, "LotNoCode", "LotNo")), []),
        safe(() => pool.request().query("Select YarnProductionType,YarnProductionTypeCode,BagNoGroupCode from tbl_YarnProductionType where YarnProductionTypeCode = 3").then((r) => opt(r, "YarnProductionTypeCode", "YarnProductionType")), []),
        safe(() => pool.request().input("CompanyCode", sql.Int, companyCode).input("FYCode", sql.Int, fyCode).query("Select GoodsInPassCode,CONVERT(varchar,GoodsPassNumber) as GoodsInPassNo from tbl_GateEntryGoodsIn where CompanyCode = @CompanyCode AND TransGoodsTypeCode IN (3,4) AND FYCode = @FYCode").then((r) => opt(r, "GoodsInPassCode", "GoodsInPassNo")), []),
        safe(() => pool.request().execute("sp_BoxPacking_GetAll").then((r) => opt(r, "BoxPackingCode", "BoxPackingName")), []),
      ]);

    return sendSuccess(res, {
      countTypes,
      customers, // address fields carried on each option for the Address auto-fill
      deliveryCustomers: customers,
      employees,
      packingTypes,
      supervisors,
      lotNos,
      productionTypes,
      gateEntries,
      boxPackings,
      companyCode,
    });
  } catch (err) {
    console.error("DB Error (YarnSalesReturn.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /yarn-sales-return/next-no — sp_SalesReturn_BindNo (VB Bind_BindNo).
export const getNextNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const no = await safe(
      () =>
        scalar(
          pool.request().input("CompanyCode", sql.Int, getCompanyCode(req)).input("FYCode", sql.Int, getFYCode(req)),
          "sp_SalesReturn_BindNo"
        ),
      1
    );
    return sendSuccess(res, { no });
  } catch (err) {
    console.error("DB Error (YarnSalesReturn.getNextNo):", err);
    return sendError(res, err);
  }
};

// GET /yarn-sales-return/bag-no — suggested bag number (VB GetBagNo, simplified).
export const getBagNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const bagNo = await safe(
      () =>
        pool
          .request()
          .input("CompanyCode", sql.Int, getCompanyCode(req))
          .input("ProductionDate", sql.DateTime, D(req.query.date))
          .input("BagNoGroupCode", sql.Int, toInt(req.query.bagNoGroupCode))
          .execute("sp_YarnProduction_BagNo")
          .then((r) => (r.recordset?.[0] ? Object.values(r.recordset[0])[0] : "")),
      ""
    );
    return sendSuccess(res, { bagNo: bagNo ?? "" });
  } catch (err) {
    console.error("DB Error (YarnSalesReturn.getBagNo):", err);
    return sendError(res, err);
  }
};

// GET /yarn-sales-return/lists — sp_SalesReturn_GetAll (frmSalesReturnDetails).
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("FYCode", sql.Int, getFYCode(req))
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_SalesReturn_GetAll");
    const data = (result.recordset || [])
      .map((r) => ({ ...r, id: r.SalesReturnCode }))
      .sort((a, b) => Number(b.SalesReturnCode) - Number(a.SalesReturnCode));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (YarnSalesReturn.getList):", err);
    return sendError(res, err);
  }
};

// GET /yarn-sales-return/list/:code — header + lines for Edit.
export const getOne = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const code = toInt(req.params.code);
    if (code <= 0) return sendError(res, "Invalid code", 400);
    const companyCode = getCompanyCode(req);

    const list = await pool
      .request()
      .input("FYCode", sql.Int, getFYCode(req))
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_SalesReturn_GetAll");
    const header = (list.recordset || []).find((r) => toInt(r.SalesReturnCode) === code) || null;

    // INFERRED: load the saved lines (proc/columns may differ → empty on mismatch).
    const details = await safe(
      () =>
        pool
          .request()
          .input("SalesReturnCode", sql.Int, code)
          .input("CompanyCode", sql.Int, companyCode)
          .execute("sp_SalesReturnDetails_GetAll")
          .then((r) => r.recordset || []),
      []
    );

    return sendSuccess(res, { header, details });
  } catch (err) {
    console.error("DB Error (YarnSalesReturn.getOne):", err);
    return sendError(res, err);
  }
};

// Sum the line totals the way GridTotal does in the VB.
const computeTotals = (details) => ({
  totalQty: details.reduce((s, d) => s + toNum(d.Qty || 1), 0),
  totalGrossWt: details.reduce((s, d) => s + toNum(d.GrossWt), 0),
  totalTareWt: details.reduce((s, d) => s + toNum(d.TareWt), 0),
  totalNetWt: details.reduce((s, d) => s + toNum(d.NetWt), 0),
});

// Shared save (create + update). `isNew` controls the stock re-entry loop.
const saveReturn = async (req, res, { code = 0, isNew }) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const companyCode = getCompanyCode(req);
    const fyCode = getFYCode(req);
    const userId = getUserId(req);
    const nodeCode = getNodeCode(req);
    const b = req.body || {};

    const customerCode = toInt(b.CustomerCode);
    const supervisorCode = toInt(b.SupervisorCode);
    const deliveryCustomerCode = toInt(b.DeliveryCustomerCode);
    const employeeCode = toInt(b.EmployeeCode);
    const details = Array.isArray(b.details) ? b.details : [];

    // Validations (mirror btnSave_Click).
    if (customerCode <= 0) return sendError(res, "Select the customer Name", 400);
    if (supervisorCode <= 0) return sendError(res, "Select the Supervisor Name", 400);
    if (deliveryCustomerCode <= 0) return sendError(res, "Select the Delivery Customer Name", 400);
    if (employeeCode <= 0) return sendError(res, "Select the Entered by", 400);
    if (!str(b.PONo).trim()) return sendError(res, "Enter the PoNo", 400);
    if (!str(b.VehicleNo).trim()) return sendError(res, "Enter the Vehicle No", 400);
    if (details.length === 0) return sendError(res, "Enter the Details", 400);

    const t = computeTotals(details);
    const returnDate = D(b.SalesReturnDate);

    tx = new sql.Transaction(pool);
    await tx.begin();

    // ---- header: sp_SalesReturn_AddEdit -> SalesReturnCode -----------------
    const head = new sql.Request(tx);
    if (code > 0) head.input("SalesReturnCode", sql.Int, code);
    head.input("SalesReturnNo", sql.Int, toInt(b.SalesReturnNo));
    head.input("SalesReturnDate", sql.DateTime, returnDate);
    head.input("CustomerCode", sql.Int, customerCode);
    head.input("EmployeeCode", sql.Int, employeeCode);
    head.input("DeliveryCustomerCode", sql.Int, deliveryCustomerCode);
    head.input("VehicleNo", sql.NVarChar(100), str(b.VehicleNo).trim());
    head.input("TotalQty", sql.Decimal(18, 3), t.totalQty);
    head.input("TotalGrossWt", sql.Decimal(18, 3), t.totalGrossWt);
    head.input("TotalTareWt", sql.Decimal(18, 3), t.totalTareWt);
    head.input("TotalNetWt", sql.Decimal(18, 3), t.totalNetWt);
    head.input("SalesBags", sql.Decimal(18, 3), toNum(b.SalesBags));
    head.input("SalesKgs", sql.Decimal(18, 3), toNum(b.SalesKgs));
    head.input("Remarks", sql.NVarChar(500), str(b.Remarks).trim());
    head.input("FYCode", sql.Int, fyCode);
    head.input("CompanyCode", sql.Int, companyCode);
    head.input("User", sql.Int, userId);
    head.input("Node", sql.Int, nodeCode);
    const salesReturnCode = await scalar(head, "sp_SalesReturn_AddEdit");
    if (salesReturnCode <= 0) {
      await tx.rollback().catch(() => {});
      return sendError(res, "Sales return header save did not return a valid SalesReturnCode", 500);
    }

    // ---- clear + re-insert detail lines ------------------------------------
    await new sql.Request(tx)
      .input("SalesReturnCode", sql.Int, salesReturnCode)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_SalesReturnDetails_Delete");

    for (const d of details) {
      await new sql.Request(tx)
        .input("SalesReturnCode", sql.Int, salesReturnCode)
        .input("BillNo", sql.NVarChar(50), str(d.BillNo))
        .input("BillDate", sql.DateTime, D(d.BillDate))
        .input("BagNo", sql.NVarChar(50), str(d.BagNo))
        .input("CountTypeCode", sql.Int, toInt(d.CountTypeCode))
        .input("YarnProductionTypeCode", sql.Int, toInt(d.YarnProductionTypeCode))
        .input("PackingTypeCode", sql.Int, toInt(d.PackingTypeCode))
        .input("LotNoCode", sql.Int, toInt(d.LotNoCode))
        .input("PartyBillNo", sql.NVarChar(50), str(d.PartyBillNo))
        .input("PartyBillDate", sql.DateTime, D(d.PartyBillDate))
        .input("GoodsInPassCode", sql.Int, toInt(d.GoodsInPassCode))
        .input("Qty", sql.Decimal(18, 3), toNum(d.Qty || 1))
        .input("GrossWt", sql.Decimal(18, 3), toNum(d.GrossWt))
        .input("TareWt", sql.Decimal(18, 3), toNum(d.TareWt))
        .input("NetWt", sql.Decimal(18, 3), toNum(d.NetWt))
        .input("CompanyCode", sql.Int, companyCode)
        .execute("sp_SalesReturnDetails_Insert");
    }

    // ---- returned bags RE-ENTER STOCK (sp_YarnStock_AddEdit) — new only ----
    if (isNew) {
      for (const d of details) {
        const netWt = toNum(d.NetWt);
        await new sql.Request(tx)
          .input("C_User", sql.Int, userId)
          .input("C_Node", sql.Int, nodeCode)
          .input("ProductionDate", sql.DateTime, returnDate)
          .input("Opening", sql.Decimal(18, 3), 0)
          .input("SupervisorCode", sql.Int, supervisorCode)
          .input("EmployeeCode", sql.Int, employeeCode)
          .input("YarnProductionTypeCode", sql.Int, toInt(d.YarnProductionTypeCode))
          .input("YarnPackingTypeCode", sql.Int, toInt(d.PackingTypeCode))
          .input("LotNoCode", sql.Int, toInt(d.LotNoCode))
          .input("BagNo", sql.Int, toInt(d.BagNo))
          .input("CountTypeCode", sql.Int, toInt(d.CountTypeCode))
          .input("GrossWeight", sql.Decimal(18, 3), toNum(d.GrossWt))
          .input("TareWeight", sql.Decimal(18, 3), toNum(d.TareWt))
          .input("NetWeight", sql.Decimal(18, 3), netWt)
          .input("TrallyWeight", sql.Decimal(18, 3), 0)
          .input("StdWeight", sql.Decimal(18, 3), netWt)
          .input("DeliveryWeight", sql.Decimal(18, 3), netWt)
          .input("ConeCount", sql.Decimal(18, 3), toNum(d.NoofCones))
          .input("YarnType", sql.NVarChar(5), str(d.YarnProductionTypeCode).charAt(0))
          .input("EntryType", sql.NVarChar(5), "M")
          .input("CompanyCode", sql.Int, companyCode)
          .input("YarnBagNoGroupCode", sql.Int, toInt(d.YarnBagNoGroupCode))
          .input("BoxPackingCode", sql.Int, toInt(d.BoxPackingCode))
          .input("BagColourCode", sql.Int, toInt(d.BagColourCode))
          .input("TipColourCode", sql.Int, toInt(d.TipColourCode))
          .execute("sp_YarnStock_AddEdit");
      }
    }

    await tx.commit();
    return sendSuccess(
      res,
      { SalesReturnCode: salesReturnCode, SalesReturnNo: toInt(b.SalesReturnNo) },
      isNew ? "The record is Saved" : "The record is updated",
      isNew ? 201 : 200
    );
  } catch (err) {
    if (tx) await tx.rollback().catch(() => {});
    console.error("DB Error (YarnSalesReturn.save):", err);
    return sendError(res, err);
  }
};

// POST /yarn-sales-return/create
export const create = (req, res) => saveReturn(req, res, { code: 0, isNew: true });

// PUT /yarn-sales-return/update/:code
export const update = (req, res) => {
  const code = toInt(req.params.code);
  if (code <= 0) return sendError(res, "Invalid code", 400);
  return saveReturn(req, res, { code, isNew: false });
};

// DELETE /yarn-sales-return/delete/:code — sp_SalesReturn_Delete.
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (code <= 0) return sendError(res, "Invalid code", 400);
    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("SalesReturnCode", sql.Int, code)
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_SalesReturn_Delete");
    return sendSuccess(res, { SalesReturnCode: code }, "The record is deleted");
  } catch (err) {
    console.error("DB Error (YarnSalesReturn.remove):", err);
    if (err.number === 547 || /REFERENCE|conflict|FK_/i.test(str(err?.message))) {
      return sendError(res, "The Sales Return is in Use. Can't able to Delete", 409);
    }
    return sendError(res, err);
  }
};
