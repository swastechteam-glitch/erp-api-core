import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Lot No master (port of the WinForms frmLotNo / frmLotNoDetails)
//   - List   : EXEC sp_LotNo_GetAll
//   - Create : EXEC sp_LotNo_AddEdit   (@C_User / @C_Node, no code)
//   - Update : EXEC sp_LotNo_AddEdit   (@E_User / @E_Node / @LotNoCode)
//   - Delete : EXEC sp_LotNo_Delete
// The VB form (btnSave_Click) validates only Lot No as mandatory and maps the
// UK_LotNo_tbl_LotNo unique violation to "Already exist the LotNo Name". The
// Mixing Count combo is sourced from tbl_CottonCount. Status: ACTIVE -> 1,
// INACTIVE -> 0. Mirrors countName.controller.js.
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

const toBit = (v) => {
  if (v === true || v === 1 || v === "1") return 1;
  if (typeof v === "string" && v.trim().toUpperCase() === "ACTIVE") return 1;
  return 0;
};

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};

// GET /lot-no/lists  -> mirrors frmLotNoDetails list
export const getLotNoList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_LotNo_GetAll");

    const data = (result.recordset || []).map((item) => ({
      ...item,
      id: item.LotNoCode,
      StatusText: STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getLotNoList):", err);
    return sendError(res, err);
  }
};

// GET /lot-no/list/:lotNoCode  -> single record (filtered from GetAll)
export const getLotNoById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = toInt(req.params.lotNoCode);
    if (!code) return sendError(res, "Invalid LotNoCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_LotNo_GetAll");
    const row = (result.recordset || []).find(
      (r) => toInt(r.LotNoCode) === code
    );

    if (!row) return sendError(res, "Lot No not found", 404);
    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getLotNoById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_LotNo_AddEdit (btnSave_Click)
const saveOrUpdateLotNo = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const lotNo = (body.LotNo || "").trim();

    // Same validation the form enforces (btnSave_Click).
    if (!lotNo) return sendError(res, "Lot No should not be empty", 400);

    const code = isEdit ? toInt(req.params.lotNoCode ?? body.LotNoCode) : null;
    if (isEdit && !code)
      return sendError(res, "Invalid LotNoCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // The proc uses C_* params for a new row and E_* params for an edit.
    if (isEdit) {
      request.input("E_User", sql.Int, toInt(userId));
      request.input("E_Node", sql.Int, toInt(nodeCode));
      request.input("LotNoCode", sql.Int, code);
    } else {
      request.input("C_User", sql.Int, toInt(userId));
      request.input("C_Node", sql.Int, toInt(nodeCode));
    }
    request.input("CottonCountCode", sql.Int, toInt(body.CottonCountCode));
    request.input("LotNo", sql.NVarChar, lotNo);
    request.input("Status", sql.Bit, toBit(body.Status));

    await request.execute("sp_LotNo_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique index -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_LotNo_tbl_LotNo")) {
      return sendError(res, "Already exist the LotNo Name", 409);
    }
    console.error("DB Error (saveOrUpdateLotNo):", err);
    return sendError(res, err);
  }
};

// POST /lot-no/create        -> create
export const createLotNo = (req, res) => saveOrUpdateLotNo(req, res, false);

// PUT  /lot-no/update/:code  -> update
export const updateLotNo = (req, res) => saveOrUpdateLotNo(req, res, true);

// DELETE /lot-no/delete/:lotNoCode -> EXEC sp_LotNo_Delete
export const deleteLotNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = toInt(req.params.lotNoCode);
    if (!code) return sendError(res, "Invalid LotNoCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("LotNoCode", sql.Int, code)
      .execute("sp_LotNo_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the LotNo!", 409);
    }
    console.error("DB Error (deleteLotNo):", err);
    return sendError(res, err);
  }
};

// GET /lot-no/mixing-counts -> cmbMixingCount dropdown
//   VB: SELECT CottonCountName, CottonCountCode FROM tbl_CottonCount
export const getMixingCountOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .query(
        "SELECT CottonCountCode, CottonCountName FROM tbl_CottonCount ORDER BY CottonCountName"
      );

    const data = (result.recordset || []).map((item) => ({
      ...item,
      value: item.CottonCountCode,
      label: item.CottonCountName,
    }));

    return sendSuccess(res, data);
  } catch (err) {
    console.error("DB Error (getMixingCountOptions):", err);
    return sendError(res, err);
  }
};
