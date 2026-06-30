import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Process Stock Entry — port of WinForms frmProcessStock.
// Month-wise department process-stock entry. Unlike the batch transaction forms,
// each Add writes a row immediately (sp_ProcessStock_AddEdit, which upserts by
// month + year + department), and Delete removes one row (sp_ProcessStock_Delete).
// The grid lists vw_ProcessStock for the chosen Month / Year.
//
//   Options : GET    /process-stock/options                 (departments + FY start year)
//   List    : GET    /process-stock/lists?monthNo=&yearNo=  (vw_ProcessStock)
//   Add     : POST   /process-stock/add                     (sp_ProcessStock_AddEdit)
//   Delete  : DELETE /process-stock/:code                   (sp_ProcessStock_Delete)
//
// MonthNo follows the VB financial-year ordering: APR=4 … DEC=12, then JAN=1 /
// FEB=2 / MAR=3 of the next calendar year (the client sends the resolved
// MonthNo + YearNo). CompanyCode / FYCode / userId / nodeCode come from the JWT.
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
const getFYCode = (req) => toInt(req.headers.FYCode);

const opt = (rs, valueKey, labelKey) =>
  (rs.recordset || []).map((r) => ({ ...r, value: r[valueKey], label: r[labelKey] }));

// GET /process-stock/options — departments (processStock=1) + the FY start year.
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const [departments, fyear] = await Promise.all([
      pool.request().query("Select DepartmentCode, DepartmentName from tbl_Department where processStock = 1 and Status = 1"),
      pool.request().input("FYCode", sql.Int, getFYCode(req)).query("select Year(FyStart) as Yr from tbl_Fyear where fycode = @FYCode"),
    ]);
    return sendSuccess(res, {
      departments: opt(departments, "DepartmentCode", "DepartmentName"),
      fyStartYear: toInt(fyear.recordset?.[0]?.Yr) || new Date().getFullYear(),
      months: ["APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC", "JAN", "FEB", "MAR"],
    });
  } catch (err) {
    console.error("DB Error (ProcessStock.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /process-stock/lists?monthNo=&yearNo= — rows for the chosen month + year.
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const rs = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("MonthNo", sql.Int, toInt(req.query.monthNo))
      .input("YearNo", sql.Int, toInt(req.query.yearNo))
      .query("select * from vw_ProcessStock where CompanyCode = @CompanyCode AND monthno = @MonthNo and YearNo = @YearNo");
    const rows = rs.recordset || [];
    const total = rows.reduce((s, r) => s + toNum(r.ProcessStock_Kgs), 0);
    return sendSuccess(res, { rows, total });
  } catch (err) {
    console.error("DB Error (ProcessStock.getList):", err);
    return sendError(res, err);
  }
};

// POST /process-stock/add — upsert one department's month process stock.
export const add = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode) return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const b = req.body || {};
    if (toInt(b.DepartmentCode) <= 0) return sendError(res, "Select Department Name", 400);
    if (toNum(b.ProcessStock_Kgs) <= 0) return sendError(res, "Type Process Qty", 400);
    if (toInt(b.MonthNo) <= 0 || toInt(b.YearNo) <= 0) return sendError(res, "Invalid Month / Year", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();
    if (toInt(b.ProcessStockCode) > 0) request.input("ProcessStockCode", sql.Int, toInt(b.ProcessStockCode));
    request
      .input("MonthNo", sql.Int, toInt(b.MonthNo))
      .input("YearNo", sql.Int, toInt(b.YearNo))
      .input("DepartmentCode", sql.Int, toInt(b.DepartmentCode))
      .input("ProcessStock_kgs", sql.Decimal(18, 3), toNum(b.ProcessStock_Kgs))
      .input("FyCode", sql.Int, getFYCode(req))
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("User", sql.Int, toInt(userId))
      .input("Node", sql.Int, toInt(nodeCode));
    await request.execute("sp_ProcessStock_AddEdit");
    return sendSuccess(res, {}, "The record is saved");
  } catch (err) {
    if (err.message && err.message.includes("UK_"))
      return sendError(res, "As per this Month This Department Data is Repeated. Check it Please", 409);
    console.error("DB Error (ProcessStock.add):", err);
    return sendError(res, err);
  }
};

// DELETE /process-stock/:code — sp_ProcessStock_Delete.
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (code <= 0) return sendError(res, "Invalid ProcessStockCode", 400);
    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("ProcessStockCode", sql.Int, code)
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_ProcessStock_Delete");
    return sendSuccess(res, { ProcessStockCode: code }, "The record is deleted");
  } catch (err) {
    console.error("DB Error (ProcessStock.remove):", err);
    return sendError(res, err);
  }
};
