import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// EB Rate master (port of WinForms frmEBRate / frmEBRateDetails)
//   - List   : EXEC SP_EBRate_GetAll   @CompanyCode
//   - Create : EXEC SP_EBRate_AddEdit  (without @EBRateCode)
//   - Update : EXEC SP_EBRate_AddEdit  (with @EBRateCode)
//   - Delete : EXEC SP_EBRate_Delete   @EBRateCode
// Company-scoped via @CompanyCode (int_CompanyCode). This SP does NOT take
// @User / @Node (unlike the other masters).
// ---------------------------------------------------------------------------

// GET /eb-rate/lists  -> EXEC SP_EBRate_GetAll @CompanyCode
export const getEBRateList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const companyCode = parseInt(req.headers.companyCode);
    if (!companyCode) return sendError(res, "Missing company context", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .execute("SP_EBRate_GetAll");

    const data = result.recordset
      // Newest first (the SP doesn't guarantee order, so sort here).
      .sort((a, b) => b.EBRateCode - a.EBRateCode)
      .map((item) => ({ ...item, id: item.EBRateCode }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getEBRateList):", err);
    return sendError(res, err);
  }
};

// GET /eb-rate/list/:ebRateCode  -> single record
export const getEBRateById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const companyCode = parseInt(req.headers.companyCode);
    if (!companyCode) return sendError(res, "Missing company context", 400);

    const code = parseInt(req.params.ebRateCode);
    if (!code) return sendError(res, "Invalid EBRateCode", 400);

    const pool = await getPool(req.headers.subdbname);
    // No single-row SP exists; filter the GetAll result.
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .execute("SP_EBRate_GetAll");
    const row = result.recordset.find((r) => r.EBRateCode === code);

    if (!row) return sendError(res, "EB Rate not found", 404);

    return sendSuccess(res, row);
  } catch (err) {
    console.error("DB Error (getEBRateById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC SP_EBRate_AddEdit (btnSave_Click)
const saveOrUpdateEBRate = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const companyCode = parseInt(req.headers.companyCode);
    if (!companyCode) return sendError(res, "Missing company context", 400);

    const body = req.body || {};
    // Val() in VB returns 0 for blank / non-numeric input.
    const ebRate = Number(body.EBRate) || 0;

    // Same validation the form enforces: rate must be > 0.
    if (ebRate <= 0)
      return sendError(res, "EBRate should not be empty", 400);

    // EB Costing Date — required for a meaningful record; defaults to today
    // (the WinForms form pre-fills the current server date).
    const costingDate = body.EBCostingDate ? new Date(body.EBCostingDate) : null;
    if (!costingDate || isNaN(costingDate.getTime()))
      return sendError(res, "EB Costing Date is required", 400);

    const code = isEdit
      ? parseInt(req.params.ebRateCode ?? body.EBRateCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid EBRateCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    if (isEdit) request.input("EBRateCode", sql.Int, code);
    request.input("EBRate", sql.Decimal(18, 3), ebRate);
    request.input("EBCostingDate", sql.Date, costingDate);
    request.input("CompanyCode", sql.Int, companyCode);

    await request.execute("SP_EBRate_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    console.error("DB Error (saveOrUpdateEBRate):", err);
    return sendError(res, err);
  }
};

// POST /eb-rate/create        -> create
export const createEBRate = (req, res) => saveOrUpdateEBRate(req, res, false);

// PUT  /eb-rate/update/:code  -> update
export const updateEBRate = (req, res) => saveOrUpdateEBRate(req, res, true);

// DELETE /eb-rate/delete/:ebRateCode -> EXEC SP_EBRate_Delete
export const deleteEBRate = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.ebRateCode);
    if (!code) return sendError(res, "Invalid EBRateCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();
    request.input("EBRateCode", sql.Int, code);

    await request.execute("SP_EBRate_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("FK_") || err.message.includes("REFERENCE"))) {
      return sendError(res, "You cannot delete the EB Rate!", 409);
    }
    console.error("DB Error (deleteEBRate):", err);
    return sendError(res, err);
  }
};
