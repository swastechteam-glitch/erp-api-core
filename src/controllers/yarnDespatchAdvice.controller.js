import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Yarn Despatch Advice (Bag No) — port of WinForms frmDespatchAdviceBagNoPrint.
// The desktop form is a LIST + VIEW/PRINT screen: it lists the invoices that
// have a despatch advice (sp_DespatchAdvice_GetPrint) and renders the selected
// one as an RDLC report (sp_Despatch_Advice_BagNo / _Summary) with a
// Details/Summary toggle. There is NO add/edit/delete or entry form in the VB.
//
// This controller keeps that list + report faithful AND adds the CRUD the UI
// asked for. The CRUD procs/columns below are INFERRED (no add/edit/delete VB
// or stored procedures were supplied) and follow the repo's master convention
// (sp_<X>_AddEdit / sp_<X>_Delete, @C_User/@C_Node on create, @E_User/@E_Node/
// @<X>Code on edit). Lookups degrade gracefully; Save/Delete surface the raw
// SQL error so the real proc names/params can be confirmed against the DB.
//
//   List    : GET    /yarn-despatch-advice/lists
//   One      : GET    /yarn-despatch-advice/list/:code
//   Options  : GET    /yarn-despatch-advice/options
//   Report   : GET    /yarn-despatch-advice/report/:invoiceCode?mode=details|summary
//   Create   : POST   /yarn-despatch-advice/create
//   Update   : PUT    /yarn-despatch-advice/update/:code
//   Delete   : DELETE /yarn-despatch-advice/delete/:code
//
// CompanyCode / userId / nodeCode come from the JWT headers (Company is fixed,
// as in the VB where cmbCompany is disabled and pinned to int_CompanyCode).
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const str = (v) => (v == null ? "" : String(v));
const D = (v) => (v ? new Date(v) : new Date());
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getUserId = (req) => toInt(req.headers.userId);
const getNodeCode = (req) => toInt(req.headers.nodeCode);

// Map a recordset to { ...row, value, label } option shape.
const opt = (rs, valueKey, labelKey) =>
  (rs?.recordset || []).map((r) => ({ ...r, value: r[valueKey], label: r[labelKey] }));

// Run a lookup but never throw — INFERRED lookups degrade to the fallback when
// the proc/table names differ from this DB (rather than crashing the screen).
const safe = async (fn, fallback) => {
  try {
    return await fn();
  } catch (e) {
    console.warn("DespatchAdvice lookup skipped:", e?.message);
    return fallback;
  }
};

// GET /yarn-despatch-advice/lists — despatch advices for the current company.
// Faithful: sp_DespatchAdvice_GetPrint (InvoiceCode, TaxTypeCode, SalesTypeCode,
// Company, BillDate, BillNo).
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const rs = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_DespatchAdvice_GetPrint");
    return sendSuccess(res, rs.recordset || []);
  } catch (err) {
    console.error("DB Error (DespatchAdvice.getList):", err);
    return sendError(res, err);
  }
};

// GET /yarn-despatch-advice/list/:code — load one row for the Edit form.
// INFERRED: tries sp_DespatchAdvice_GetByCode, else falls back to the row from
// the list proc whose InvoiceCode matches :code.
export const getOne = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const code = toInt(req.params.code);
    if (code <= 0) return sendError(res, "Invalid code", 400);
    const companyCode = getCompanyCode(req);

    const byCode = await safe(
      () =>
        pool
          .request()
          .input("CompanyCode", sql.Int, companyCode)
          .input("DespatchAdviceCode", sql.Int, code)
          .input("InvoiceCode", sql.Int, code)
          .execute("sp_DespatchAdvice_GetByCode")
          .then((r) => r.recordset?.[0] || null),
      null
    );
    if (byCode) return sendSuccess(res, byCode);

    // Fallback: pull from the list proc (keyed by InvoiceCode).
    const list = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_DespatchAdvice_GetPrint");
    const row = (list.recordset || []).find((r) => toInt(r.InvoiceCode) === code) || null;
    return sendSuccess(res, row);
  } catch (err) {
    console.error("DB Error (DespatchAdvice.getOne):", err);
    return sendError(res, err);
  }
};

// GET /yarn-despatch-advice/options — data for the Add/Edit entry form.
// INFERRED: the invoices that can have an advice (reusing the list proc), the
// next advice number, and the fixed company code.
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const companyCode = getCompanyCode(req);

    const invoices = await safe(
      () =>
        pool
          .request()
          .input("CompanyCode", sql.Int, companyCode)
          .execute("sp_DespatchAdvice_GetPrint")
          .then((r) => opt(r, "InvoiceCode", "BillNo")),
      []
    );
    const nextNo = await safe(
      () =>
        pool
          .request()
          .input("CompanyCode", sql.Int, companyCode)
          .query("Select ISNULL(MAX(DespatchAdviceNo),0)+1 AS NextNo from tbl_DespatchAdvice Where CompanyCode = @CompanyCode")
          .then((r) => r.recordset?.[0]?.NextNo ?? 1),
      1
    );

    return sendSuccess(res, { invoices, nextNo, companyCode });
  } catch (err) {
    console.error("DB Error (DespatchAdvice.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /yarn-despatch-advice/report/:invoiceCode — data for the printable advice.
// Faithful: sp_Despatch_Advice_BagNo (details) + sp_Despatch_Advice_BagNo_Summary
// (summary) + sp_Company_GetAll (header). The frontend chooses Details/Summary.
export const getReport = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const companyCode = getCompanyCode(req);
    const invoiceCode = toInt(req.params.invoiceCode);
    if (invoiceCode <= 0) return sendError(res, "Invalid InvoiceCode", 400);

    const [details, summary, company] = await Promise.all([
      pool.request().input("InvoiceCode", sql.Int, invoiceCode).execute("sp_Despatch_Advice_BagNo"),
      safe(() => pool.request().input("InvoiceCode", sql.Int, invoiceCode).execute("sp_Despatch_Advice_BagNo_Summary"), { recordset: [] }),
      pool.request().input("CompanyCode", sql.Int, companyCode).execute("sp_Company_GetAll"),
    ]);

    const detailRows = details.recordset || [];
    return sendSuccess(res, {
      header: detailRows[0] || {},
      details: detailRows,
      summary: summary.recordset || [],
      company: company.recordset?.[0] || {},
    });
  } catch (err) {
    console.error("DB Error (DespatchAdvice.getReport):", err);
    return sendError(res, err);
  }
};

// Shared param binder for create/edit (INFERRED entry fields).
const bindAdvice = (request, b, companyCode) =>
  request
    .input("CompanyCode", sql.Int, companyCode)
    .input("InvoiceCode", sql.Int, toInt(b.InvoiceCode))
    .input("DespatchAdviceNo", sql.Int, toInt(b.DespatchAdviceNo))
    .input("DespatchAdviceDate", sql.DateTime, D(b.DespatchAdviceDate))
    .input("VehicleNo", sql.NVarChar(50), str(b.VehicleNo))
    .input("DriverName", sql.NVarChar(100), str(b.DriverName))
    .input("Remarks", sql.NVarChar(500), str(b.Remarks));

// POST /yarn-despatch-advice/create — save a new despatch advice.
// INFERRED: sp_DespatchAdvice_AddEdit (create branch, @C_User/@C_Node).
export const create = async (req, res) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const companyCode = getCompanyCode(req);
    const b = req.body || {};
    if (toInt(b.InvoiceCode) <= 0) return sendError(res, "Select the Bill / Invoice", 400);

    tx = new sql.Transaction(pool);
    await tx.begin();
    const result = await bindAdvice(new sql.Request(tx), b, companyCode)
      .input("C_User", sql.Int, getUserId(req))
      .input("C_Node", sql.Int, getNodeCode(req))
      .execute("sp_DespatchAdvice_AddEdit");
    await tx.commit();

    const row = result.recordset?.[0];
    return sendSuccess(res, { code: row ? toInt(Object.values(row)[0]) : toInt(b.InvoiceCode) }, "Despatch advice saved", 201);
  } catch (err) {
    if (tx) await tx.rollback().catch(() => {});
    console.error("DB Error (DespatchAdvice.create):", err);
    if (/UNIQUE|duplicate|PRIMARY KEY/i.test(str(err?.message))) {
      return sendError(res, "A despatch advice already exists for this invoice.", 409);
    }
    return sendError(res, err);
  }
};

// PUT /yarn-despatch-advice/update/:code — edit an existing despatch advice.
// INFERRED: sp_DespatchAdvice_AddEdit (edit branch, @E_User/@E_Node/@<X>Code).
export const update = async (req, res) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const companyCode = getCompanyCode(req);
    const code = toInt(req.params.code);
    if (code <= 0) return sendError(res, "Invalid code", 400);
    const b = req.body || {};

    tx = new sql.Transaction(pool);
    await tx.begin();
    await bindAdvice(new sql.Request(tx), b, companyCode)
      .input("DespatchAdviceCode", sql.Int, code)
      .input("E_User", sql.Int, getUserId(req))
      .input("E_Node", sql.Int, getNodeCode(req))
      .execute("sp_DespatchAdvice_AddEdit");
    await tx.commit();

    return sendSuccess(res, { code }, "Despatch advice updated");
  } catch (err) {
    if (tx) await tx.rollback().catch(() => {});
    console.error("DB Error (DespatchAdvice.update):", err);
    return sendError(res, err);
  }
};

// DELETE /yarn-despatch-advice/delete/:code — remove a despatch advice.
// INFERRED: sp_DespatchAdvice_Delete.
export const remove = async (req, res) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const code = toInt(req.params.code);
    if (code <= 0) return sendError(res, "Invalid code", 400);

    tx = new sql.Transaction(pool);
    await tx.begin();
    await new sql.Request(tx)
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("DespatchAdviceCode", sql.Int, code)
      .input("InvoiceCode", sql.Int, code)
      .input("E_User", sql.Int, getUserId(req))
      .input("E_Node", sql.Int, getNodeCode(req))
      .execute("sp_DespatchAdvice_Delete");
    await tx.commit();

    return sendSuccess(res, { code }, "Despatch advice deleted");
  } catch (err) {
    if (tx) await tx.rollback().catch(() => {});
    console.error("DB Error (DespatchAdvice.remove):", err);
    if (/REFERENCE|conflict|FK_/i.test(str(err?.message))) {
      return sendError(res, "This despatch advice is referenced elsewhere and cannot be deleted.", 409);
    }
    return sendError(res, err);
  }
};
