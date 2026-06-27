import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Spinning Stoppage Reason Entry master
//   (port of WinForms frmSpinningStopReason / frmSpinningStopReasonDetails)
//   Just Date + Remarks per day — one reason note per production date.
//   - List   : SELECT * FROM tbl_SpgDateReason  (Company + FY scoped)
//   - Create : EXEC sp_SpgDateReason_AddEdit (without @SPGDateCode)
//   - Update : EXEC sp_SpgDateReason_AddEdit (with @SPGDateCode)
//   - Delete : EXEC sp_SpgDateReason_Delete  (@SPGDateCode)
// AddEdit requires @User / @Node / @FyCode / @CompanyCode. UK_ -> already exists
// for this date.
// ---------------------------------------------------------------------------

const toInt = (v) => parseInt(v) || 0;
const D = (v) => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; };

// GET /spinning-stop-reason/lists
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = toInt(req.headers.companyCode);
    const fyCode = toInt(req.headers.FYCode);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .query(`SELECT * FROM tbl_SpgDateReason WHERE CompanyCode = ${companyCode} AND FYCode = ${fyCode} ORDER BY SPGDate DESC`);
    const data = result.recordset.map((item) => ({ ...item, id: item.SPGDateCode }));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getList spinning-stop-reason):", err);
    return sendError(res, err);
  }
};

// GET /spinning-stop-reason/list/:spgDateCode
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = toInt(req.headers.companyCode);
    const code = toInt(req.params.spgDateCode);
    if (!code) return sendError(res, "Invalid SPGDateCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("SPGDateCode", sql.Int, code)
      .input("CompanyCode", sql.Int, companyCode)
      .query("SELECT * FROM tbl_SpgDateReason WHERE SPGDateCode = @SPGDateCode AND CompanyCode = @CompanyCode");

    if (!result.recordset.length) return sendError(res, "Spinning Stoppage Reason not found", 404);
    return sendSuccess(res, result.recordset[0]);
  } catch (err) {
    console.error("DB Error (getById spinning-stop-reason):", err);
    return sendError(res, err);
  }
};

// Shared add/edit -> EXEC sp_SpgDateReason_AddEdit
const saveOrUpdate = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = toInt(req.headers.userId);
    const nodeCode = toInt(req.headers.nodeCode);
    const companyCode = toInt(req.headers.companyCode);
    const fyCode = toInt(req.headers.FYCode);

    const body = req.body || {};
    const spgDate = D(body.SPGDate);
    const reason = (body.Reason ?? "").toString().trim();

    if (!spgDate) return sendError(res, "Enter the Date", 400);

    const code = isEdit ? toInt(req.params.spgDateCode ?? body.SPGDateCode) : null;
    if (isEdit && !code) return sendError(res, "Invalid SPGDateCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();
    if (isEdit) request.input("SPGDateCode", sql.Int, code);
    request.input("SPGDate", sql.DateTime, spgDate);
    request.input("Reason", sql.VarChar(sql.MAX), reason);
    request.input("FyCode", sql.Int, fyCode);
    request.input("User", sql.Int, userId);
    request.input("Node", sql.Int, nodeCode);
    request.input("CompanyCode", sql.Int, companyCode);

    await request.execute("sp_SpgDateReason_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (err.message && err.message.includes("UK_")) {
      return sendError(res, "Already Data exists for this Date", 409);
    }
    console.error("DB Error (saveOrUpdate spinning-stop-reason):", err);
    return sendError(res, err);
  }
};

// POST /spinning-stop-reason/create
export const create = (req, res) => saveOrUpdate(req, res, false);
// PUT  /spinning-stop-reason/update/:spgDateCode
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /spinning-stop-reason/delete/:spgDateCode
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.spgDateCode);
    if (!code) return sendError(res, "Invalid SPGDateCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool.request().input("SPGDateCode", sql.Int, code).execute("sp_SpgDateReason_Delete");
    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("REFERENCE") || err.message.includes("FK_"))) {
      return sendError(res, "You can not delete this record!", 409);
    }
    console.error("DB Error (remove spinning-stop-reason):", err);
    return sendError(res, err);
  }
};
