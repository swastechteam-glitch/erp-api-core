import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Scrap Invoice (port of the WinForms frmScrabInvoice / frmScrabInvoiceDetails)
//   Manual GST sales invoice for scrap / general / machinery / spare. Items are
//   typed directly (Description / UOM / HSN / Qty / Rate -> CGST/SGST/IGST) and
//   added to a grid; TCS + round-off roll up into the Net Amount. The invoice no
//   is drawn from the sales day-book by group (Scrap=3, General=4, Machine=7,
//   Spare=8). The Add screen and the Edit/Delete grid are merged into ONE page.
//
//   - GET    /scrap-invoice/options              -> customers/modeOfDespatch/transporters/branches/banks/weighBridges
//   - GET    /scrap-invoice/next-invoice-no        -> ?type=scrap|general|machine|spare  { invoiceNo, strInvoiceNo }
//   - GET    /scrap-invoice/lists                  -> sp_ScrapInvoice_GetAll (?fromDate&toDate&customerCode&type, paginated)
//   - GET    /scrap-invoice/list/:scrapInvoiceCode -> vw_ScrapInvoiceDetails (header + items)
//   - POST   /scrap-invoice/create                 -> sp_ScrapInvoice_AddEdit + details
//   - PUT    /scrap-invoice/update/:scrapInvoiceCode
//   - DELETE /scrap-invoice/delete/:scrapInvoiceCode -> sp_ScrapInvoice_Delete
//
// Tax math (CGST/SGST/IGST/TCS/round-off) runs on the React side like the desktop
// and is persisted as-is. Printing is NOT ported. Company from req.headers.companyCode,
// FY from req.headers.FYCode, user from req.headers.userId / nodeCode.
// ---------------------------------------------------------------------------

const INVOICE_GROUP = { scrap: 3, general: 4, machine: 7, spare: 8 };

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};
const r2 = (n) => Math.round((toNum(n) + Number.EPSILON) * 100) / 100;
const r3 = (n) => Math.round((toNum(n) + Number.EPSILON) * 1000) / 1000;
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getFYCode = (req) => toInt(req.headers.FYCode);
const todayStr = () => new Date().toISOString().slice(0, 10);
const scalar = (r) => (r.recordset?.[0] ? Object.values(r.recordset[0])[0] : null);

// GET /scrap-invoice/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);

    const [customers, mods, transporters, branches, banks] = await Promise.all([
      pool.request().query(
        "Select CustomerCode, CustomerName, Address1, Address2, City from vw_Customer " +
          "where Status = 1 AND Scrap = 1 order by CustomerName"
      ),
      pool.request().execute("sp_ModeOfDespatch_GetAll"),
      pool.request().execute("sp_Transporter_GetAll"),
      pool.request().query("Select BranchCode, BranchName from tbl_Branch where Status = 1 order by BranchName"),
      pool.request().query("SELECT BankCode, BankName, ACNo FROM tbl_CompanyDetails ORDER BY BankName"),
    ]);

    let weighBridges = [];
    try {
      const w = await pool
        .request()
        .input("CompanyCode", sql.Int, getCompanyCode(req))
        .input("FYCode", sql.Int, getFYCode(req))
        .execute("sp_ScrapInvoice_GetPendingWeighBridge");
      weighBridges = w.recordset.map((x) => ({ value: x.WeighCode, label: x.str_WeighmentNo }));
    } catch (e) {
      console.warn("ScrapInvoice options: pending weighbridge failed", e.message);
    }

    const cust = customers.recordset.map((c) => ({
      value: c.CustomerCode, label: c.CustomerName,
      address: [c.Address1, c.Address2, c.City].filter(Boolean).join(", "),
    }));

    return sendSuccess(res, {
      customers: cust,
      deliveryCustomers: cust,
      modeOfDespatch: mods.recordset.map((m) => ({ value: m.ModeOfDespatchCode, label: m.ModeOfDespatchName })),
      transporters: transporters.recordset.map((t) => ({ value: t.TransporterCode, label: t.TransporterName })),
      branches: branches.recordset.map((b) => ({ value: b.BranchCode, label: b.BranchName })),
      companyBanks: banks.recordset.map((b) => ({ value: b.BankCode, label: b.BankName, ACNo: b.ACNo })),
      weighBridges,
    });
  } catch (err) {
    console.error("DB Error (getOptions ScrapInvoice):", err);
    return sendError(res, err);
  }
};

// GET /scrap-invoice/next-invoice-no?type=scrap|general|machine|spare
export const getNextInvoiceNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const groupCode = INVOICE_GROUP[(req.query.type || "scrap").toLowerCase()] || INVOICE_GROUP.scrap;

    const noRes = await pool
      .request()
      .input("InvoiceGroupCode", sql.Int, groupCode)
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("FYCode", sql.Int, getFYCode(req))
      .execute("sp_Sales_DayBook_BindNo");
    const strRes = await pool
      .request()
      .input("InvoiceGroupCode", sql.Int, groupCode)
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("FYCode", sql.Int, getFYCode(req))
      .execute("sp_Sales_DayBook_StrBindno");

    return sendSuccess(res, {
      invoiceNo: toInt(scalar(noRes)),
      strInvoiceNo: scalar(strRes) || "",
    });
  } catch (err) {
    console.error("DB Error (getNextInvoiceNo ScrapInvoice):", err);
    return sendError(res, err);
  }
};

// GET /scrap-invoice/lists  (sp_ScrapInvoice_GetAll, filtered + paginated)
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("FYCode", sql.Int, getFYCode(req))
      .execute("sp_ScrapInvoice_GetAll");

    const fromDate = req.query.fromDate ? new Date(req.query.fromDate) : null;
    const toDate = req.query.toDate ? new Date(req.query.toDate) : null;
    const customerCode = toInt(req.query.customerCode);
    const type = (req.query.type || "").toLowerCase(); // scrap|general|machine|spare|""

    let data = result.recordset.map((r) => ({ ...r, id: r.ScrapInvoiceCode }));
    data = data.filter((r) => {
      if (fromDate && r.ScrapInvoiceDate && new Date(r.ScrapInvoiceDate) < fromDate) return false;
      if (toDate && r.ScrapInvoiceDate && new Date(r.ScrapInvoiceDate) > toDate) return false;
      if (customerCode > 0 && toInt(r.CustomerCode) !== customerCode) return false;
      // The "report type" flag (Scrap/General/Machine/Spare) is a 1/0 column per row.
      if (type && type !== "all") {
        const col = { scrap: "Scrap", general: "General", machine: "Machine", spare: "Spare" }[type];
        if (col && Object.prototype.hasOwnProperty.call(r, col) && toInt(r[col]) !== 1) return false;
      }
      return true;
    });
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getList ScrapInvoice):", err);
    return sendError(res, err);
  }
};

// GET /scrap-invoice/list/:scrapInvoiceCode  -> vw_ScrapInvoiceDetails (header + items)
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.scrapInvoiceCode);
    if (!code) return sendError(res, "Invalid ScrapInvoiceCode", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("Code", sql.Int, code)
      .query("Select * from vw_ScrapInvoiceDetails where ScrapInvoiceCode = @Code");
    if (r.recordset.length === 0) return sendError(res, "Scrap Invoice not found", 404);
    const header = r.recordset[0];
    const items = r.recordset.map((d) => ({
      ItemDescription: d.ItemDescription, UOM_Type: d.UOM_Type, HSNCode: d.HSNCode,
      Qty: toNum(d.Qty), Rate: toNum(d.Rate), GrossAmount: toNum(d.GrossAmount),
      CGSTPer: toNum(d.CGSTPer), CGSTAmount: toNum(d.CGSTAmount),
      SGSTPer: toNum(d.SGSTPer), SGSTAmount: toNum(d.SGSTAmount),
      IGSTPer: toNum(d.IGSTPer), IGSTAmount: toNum(d.IGSTAmount),
      TCSAmount: toNum(d.TCSAmount), NetAmount: toNum(d.NetAmount),
    }));
    return sendSuccess(res, { ...header, items });
  } catch (err) {
    console.error("DB Error (getById ScrapInvoice):", err);
    return sendError(res, err);
  }
};

const validateInvoice = (body) => {
  if (!body.ScrapInvoiceDate || Number.isNaN(new Date(body.ScrapInvoiceDate).getTime()))
    return "Invalid Invoice Date";
  if (toInt(body.CustomerCode) <= 0) return "Select the Customer Name";
  if (toInt(body.DeliveryCustomerCode) <= 0) return "Select the Delivery Customer Name";
  if (toInt(body.ModeOfDespatchCode) <= 0) return "Select the Mode of Despatch";
  if (toInt(body.TransporterCode) <= 0) return "Select the Transporter Name";
  if (toInt(body.BranchCode) <= 0) return "Select the Branch";
  if (toInt(body.CompanyBankCode) <= 0) return "Select the Company Bank";
  if (!Array.isArray(body.items) || body.items.length === 0) return "Enter the Item";
  return null;
};

// sp_ScrapInvoice_AddEdit (returns the new ScrapInvoiceCode) inside the tx.
const addEditHeader = async (tx, req, { code, body }) => {
  const rq = new sql.Request(tx);
  if (code) rq.input("ScrapInvoiceCode", sql.Int, code);
  rq.input("ScrapInvoiceNo", sql.Int, toInt(body.ScrapInvoiceNo));
  rq.input("strScrapInvoiceNo", sql.NVarChar, String(body.strScrapInvoiceNo || ""));
  rq.input("ScrapInvoiceDate", sql.DateTime, new Date(body.ScrapInvoiceDate));
  rq.input("TransporterCode", sql.Int, toInt(body.TransporterCode));
  rq.input("ModeOfDespatchCode", sql.Int, toInt(body.ModeOfDespatchCode));
  rq.input("VehicalNumber", sql.NVarChar, String(body.VehicleNumber || ""));
  rq.input("LRNumner", sql.NVarChar, String(body.LRNumber || ""));
  rq.input("CustomerCode", sql.Int, toInt(body.CustomerCode));
  rq.input("DeliveryCustomerCode", sql.Int, toInt(body.DeliveryCustomerCode));
  rq.input("TotalQty", sql.Decimal(18, 3), r3(body.TotalQty));
  rq.input("TotalGrossAmount", sql.Decimal(18, 2), r2(body.TotalGrossAmount));
  rq.input("TotalCGSTAmount", sql.Decimal(18, 2), r2(body.TotalCGSTAmount));
  rq.input("TotalSGSTAmount", sql.Decimal(18, 2), r2(body.TotalSGSTAmount));
  rq.input("TotalIGSTAmount", sql.Decimal(18, 2), r2(body.TotalIGSTAmount));
  rq.input("TotalTCSPer", sql.Decimal(18, 2), r2(body.TotalTCSPer));
  rq.input("TotalTCSAmount", sql.Decimal(18, 2), r2(body.TotalTCSAmount));
  rq.input("TotalRoundOff", sql.Decimal(18, 2), r2(body.TotalRoundOff));
  rq.input("TotalNetAmount", sql.Decimal(18, 2), r2(body.TotalNetAmount));
  rq.input("Description", sql.NVarChar, String(body.Description || ""));
  rq.input("BranchCode", sql.Int, toInt(body.BranchCode));
  rq.input("CompanyBankCode", sql.Int, toInt(body.CompanyBankCode));
  if (toInt(body.WeighCode) > 0) rq.input("WeighCode", sql.Int, toInt(body.WeighCode));
  // Only the active invoice-type flag is sent (=1), matching the desktop.
  const type = (body.type || "scrap").toLowerCase();
  if (type === "general") rq.input("General", sql.Int, 1);
  else if (type === "machine") rq.input("Machine", sql.Int, 1);
  else if (type === "spare") rq.input("Spare", sql.Int, 1);
  else rq.input("Scrap", sql.Int, 1);
  rq.input("FYCode", sql.Int, getFYCode(req));
  rq.input("CompanyCode", sql.Int, getCompanyCode(req));
  rq.input("USER", sql.Int, toInt(req.headers.userId));
  rq.input("Node", sql.Int, toInt(req.headers.nodeCode));
  const r = await rq.execute("sp_ScrapInvoice_AddEdit");
  return toInt(scalar(r)) || code || 0;
};

const insertDetails = async (tx, code, items) => {
  for (const it of items) {
    await new sql.Request(tx)
      .input("ScrapInvoiceCode", sql.Int, code)
      .input("Rate", sql.Decimal(18, 2), r2(it.Rate))
      .input("Qty", sql.Decimal(18, 3), r3(it.Qty))
      .input("GrossAmount", sql.Decimal(18, 2), r2(it.GrossAmount))
      .input("CGSTPer", sql.Decimal(18, 2), r2(it.CGSTPer))
      .input("CGSTAmount", sql.Decimal(18, 2), r2(it.CGSTAmount))
      .input("SGSTPer", sql.Decimal(18, 2), r2(it.SGSTPer))
      .input("SGSTAmount", sql.Decimal(18, 2), r2(it.SGSTAmount))
      .input("IGSTPer", sql.Decimal(18, 2), r2(it.IGSTPer))
      .input("IGSTAmount", sql.Decimal(18, 2), r2(it.IGSTAmount))
      .input("TCSAmount", sql.Decimal(18, 4), r2(it.TCSAmount))
      .input("NetAmount", sql.Decimal(18, 2), r2(it.NetAmount))
      .input("RoundOff", sql.Decimal(18, 2), 0)
      .input("ItemDescription", sql.NVarChar, String(it.ItemDescription || ""))
      .input("UOM_Type", sql.NVarChar, String(it.UOM_Type || ""))
      .input("HSNCode", sql.Int, toInt(it.HSNCode))
      .execute("sp_ScrapInvoiceDetails_Insert");
  }
};

// POST /scrap-invoice/create
export const createScrapInvoice = async (req, res) => {
  const body = req.body || {};
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    if (!req.headers.userId || !req.headers.nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);
    const err = validateInvoice(body);
    if (err) return sendError(res, err, 400);

    const pool = await getPool(req.headers.subdbname);
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const code = await addEditHeader(tx, req, { code: null, body });
      await new sql.Request(tx)
        .input("ScrapInvoiceCode", sql.Int, code)
        .execute("sp_ScrapInvoiceDetails_Delete");
      await insertDetails(tx, code, body.items);
      await tx.commit();
      return sendSuccess(res, { ScrapInvoiceCode: code }, "The record is saved", 201);
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  } catch (err) {
    console.error("DB Error (createScrapInvoice):", err);
    return sendError(res, err);
  }
};

// PUT /scrap-invoice/update/:scrapInvoiceCode
export const updateScrapInvoice = async (req, res) => {
  const body = req.body || {};
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    if (!req.headers.userId || !req.headers.nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);
    const code = toInt(req.params.scrapInvoiceCode);
    if (!code) return sendError(res, "Invalid ScrapInvoiceCode", 400);
    const err = validateInvoice(body);
    if (err) return sendError(res, err, 400);

    const pool = await getPool(req.headers.subdbname);
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const wicode = await addEditHeader(tx, req, { code, body });
      await new sql.Request(tx)
        .input("ScrapInvoiceCode", sql.Int, wicode)
        .execute("sp_ScrapInvoiceDetails_Delete");
      await insertDetails(tx, wicode, body.items);
      await tx.commit();
      return sendSuccess(res, { ScrapInvoiceCode: wicode }, "The record is updated", 200);
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  } catch (err) {
    console.error("DB Error (updateScrapInvoice):", err);
    return sendError(res, err);
  }
};

// DELETE /scrap-invoice/delete/:scrapInvoiceCode
export const deleteScrapInvoice = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.scrapInvoiceCode);
    if (!code) return sendError(res, "Invalid ScrapInvoiceCode", 400);
    const pool = await getPool(req.headers.subdbname);
    await pool.request().input("ScrapInvoiceCode", sql.Int, code).execute("sp_ScrapInvoice_Delete");
    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("REFERENCE") || err.message.includes("FK_")))
      return sendError(res, "You can not delete the Scrap Invoice!", 409);
    console.error("DB Error (deleteScrapInvoice):", err);
    return sendError(res, err);
  }
};
