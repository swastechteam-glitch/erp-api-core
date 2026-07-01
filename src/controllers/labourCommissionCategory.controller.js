import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Labour Commission Category master (frmLabourCommissionCategory)
//
//   ⚠️ BUILT BEST-EFFORT FROM THE DESKTOP SCREENSHOT — the original VB for this
//   exact form was not supplied, so the stored-proc names, table and column names
//   below are ASSUMPTIONS. Rename them to match your database if they differ:
//       SP:    sp_LabourCommissionCategory_AddEdit / _GetAll / _Delete
//       Table: tbl_LabourCommissionCategory  (keyed by CompanyCode + DepartmentCode)
//       Dept:  tbl_Department (DepartmentCode, DepartmentName)
//
//   A per-department commission config: a base Salary + W.Days, and 4 category
//   slabs (Salary Above/Below × W.Days Above/Below), each with its own Salary,
//   W.Days and Commission Amount / Day:
//       Cat1 = Salary Above, W.Days Above
//       Cat2 = Salary Above, W.Days Below
//       Cat3 = Salary Below, W.Days Above
//       Cat4 = Salary Below, W.Days Below
//
//   Company-scoped (req.headers.companyCode); AddEdit needs user/node from token.
//
//   Endpoints
//     GET    /options                  departments (Department dropdown)
//     GET    /lists                    configured rows for the company
//     GET    /list/:departmentCode     one department's config
//     POST   /create                   upsert (sp_..._AddEdit)
//     PUT    /update/:departmentCode   upsert (sp_..._AddEdit)
//     DELETE /delete/:departmentCode   sp_..._Delete
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
const pick = (row, ...keys) => {
  if (!row) return undefined;
  for (const k of keys) {
    if (k == null) continue;
    if (row[k] !== undefined) return row[k];
    const lk = String(k).toLowerCase();
    const hit = Object.keys(row).find((o) => o.toLowerCase() === lk);
    if (hit) return row[hit];
  }
  return undefined;
};

// The 4 category slabs -> their column/param keys.
const CATS = [1, 2, 3, 4];
const catKeys = (n) => ({
  salary: `Cat${n}Salary`,
  wdays: `Cat${n}WDays`,
  commission: `Cat${n}Commission`,
});

// GET /labour-commission-category/options  -> departments
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .query("SELECT DepartmentCode, DepartmentName FROM tbl_Department WHERE Status = 1 ORDER BY DepartmentName");
    return sendSuccess(res, {
      departments: (r.recordset || []).map((x) => ({
        value: toInt(x.DepartmentCode),
        label: x.DepartmentName ?? "",
      })),
    });
  } catch (err) {
    console.error("DB Error (LabourCommissionCategory.getOptions):", err);
    return sendError(res, err);
  }
};

const mapRow = (row) => {
  const out = {
    DepartmentCode: toInt(pick(row, "DepartmentCode")),
    DepartmentName: pick(row, "DepartmentName", "DepartmentName_English") ?? "",
    Salary: toNum(pick(row, "Salary")),
    WDays: toNum(pick(row, "WDays", "WorkingDays")),
  };
  for (const n of CATS) {
    const k = catKeys(n);
    out[k.salary] = toNum(pick(row, k.salary));
    out[k.wdays] = toNum(pick(row, k.wdays));
    out[k.commission] = toNum(pick(row, k.commission));
  }
  return out;
};

// GET /labour-commission-category/lists
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_LabourCommissionCategory_GetAll");
    const data = (r.recordset || []).map((row) => {
      const m = mapRow(row);
      return { ...m, id: m.DepartmentCode };
    });
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (LabourCommissionCategory.getList):", err);
    return sendError(res, err);
  }
};

// GET /labour-commission-category/list/:departmentCode
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.departmentCode);
    if (code <= 0) return sendError(res, "Invalid DepartmentCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_LabourCommissionCategory_GetAll");
    const row = (r.recordset || []).find((x) => toInt(pick(x, "DepartmentCode")) === code);
    if (!row) return sendError(res, "Labour Commission Category not found", 404);
    return sendSuccess(res, mapRow(row));
  } catch (err) {
    console.error("DB Error (LabourCommissionCategory.getById):", err);
    return sendError(res, err);
  }
};

const saveOrUpdate = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const companyCode = getCompanyCode(req);
    if (companyCode <= 0)
      return sendError(res, "You are logged in to a group of companies; switch to a single company.", 400);

    const b = req.body || {};
    // On edit the department is fixed (the route param); on create it's in the body.
    const departmentCode = isEdit ? toInt(req.params.departmentCode ?? b.DepartmentCode) : toInt(b.DepartmentCode);
    if (departmentCode <= 0) return sendError(res, "Select the Department", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    request.input("CompanyCode", sql.Int, companyCode);
    request.input("DepartmentCode", sql.Int, departmentCode);
    request.input("Salary", sql.Decimal(18, 2), toNum(b.Salary));
    request.input("WDays", sql.Decimal(18, 2), toNum(b.WDays));
    for (const n of CATS) {
      const k = catKeys(n);
      request.input(k.salary, sql.Decimal(18, 2), toNum(b[k.salary]));
      request.input(k.wdays, sql.Decimal(18, 2), toNum(b[k.wdays]));
      request.input(k.commission, sql.Decimal(18, 2), toNum(b[k.commission]));
    }

    await request.execute("sp_LabourCommissionCategory_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (err.message && err.message.includes("UK_")) {
      return sendError(res, "This Department is already configured", 409);
    }
    console.error("DB Error (saveOrUpdateLabourCommissionCategory):", err);
    return sendError(res, err);
  }
};

// POST /labour-commission-category/create
export const create = (req, res) => saveOrUpdate(req, res, false);

// PUT  /labour-commission-category/update/:departmentCode
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /labour-commission-category/delete/:departmentCode
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.departmentCode);
    if (code <= 0) return sendError(res, "Invalid DepartmentCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("DepartmentCode", sql.Int, code)
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_LabourCommissionCategory_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("FK_") || err.message.includes("REFERENCE"))) {
      return sendError(res, "You can not delete this Labour Commission Category !", 409);
    }
    console.error("DB Error (deleteLabourCommissionCategory):", err);
    return sendError(res, err);
  }
};
