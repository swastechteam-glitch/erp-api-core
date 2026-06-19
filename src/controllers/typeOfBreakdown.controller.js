import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Type Of Break Downs master (port of frmTypeOfBreakDowns + ...Details).
//   - List   : EXEC sp_TypeOfBreakDowns_GetAll  (or name search)
//   - Save   : EXEC sp_TypeOfBreakDowns_AddEdit  (BreakDownOrderNo auto = max+1)
//   - Delete : EXEC sp_TypeOfBreakDowns_Delete @BreakDownMasterCode
// AddEdit needs @User / @Node from the auth token (headers).
// ---------------------------------------------------------------------------

const STATUS_LABEL = (s) => (s ? "ACTIVE" : "INACTIVE");
const toBit = (v) => {
  if (v === true || v === 1 || v === "1") return 1;
  if (typeof v === "string" && v.trim().toUpperCase() === "ACTIVE") return 1;
  return 0;
};

// GET /type-of-breakdown/lists?search=   (full list, no pagination)
export const getBreakdownList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const search = (req.query.search || "").toString().trim();
    const pool = await getPool(req.headers.subdbname);

    let result;
    if (search) {
      result = await pool
        .request()
        .input("BreakDownName", sql.NVarChar, `%${search}%`)
        .execute("sp_TypeOfBreakDown_GetbyBreakDownName");
    } else {
      result = await pool.request().execute("sp_TypeOfBreakDowns_GetAll");
    }

    const data = result.recordset
      .sort((a, b) => b.BreakDownMasterCode - a.BreakDownMasterCode)
      .map((item) => ({
        ...item,
        id: item.BreakDownMasterCode,
        StatusText: STATUS_LABEL(item.Status),
      }));

    return sendSuccess(res, data);
  } catch (err) {
    console.error("DB Error (getBreakdownList):", err);
    return sendError(res, err);
  }
};

// GET /type-of-breakdown/list/:breakDownMasterCode
export const getBreakdownById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = parseInt(req.params.breakDownMasterCode);
    if (!code) return sendError(res, "Invalid BreakDownMasterCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_TypeOfBreakDowns_GetAll");
    const row = result.recordset.find((r) => r.BreakDownMasterCode === code);
    if (!row) return sendError(res, "Type Of Break Down not found", 404);

    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getBreakdownById):", err);
    return sendError(res, err);
  }
};

// Shared save (create / update) -> EXEC sp_TypeOfBreakDowns_AddEdit
const saveOrUpdate = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const b = req.body || {};
    const name = (b.BreakDownName || "").trim();
    if (!name)
      return sendError(res, "Break Down Name should not be empty", 400);

    const code = isEdit
      ? parseInt(req.params.breakDownMasterCode ?? b.BreakDownMasterCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid BreakDownMasterCode for update", 400);

    const pool = await getPool(req.headers.subdbname);

    // Auto order no = max+1 when not supplied (mirrors the form).
    let orderNo = parseInt(b.BreakDownOrderNo) || 0;
    if (orderNo === 0) {
      const maxRes = await pool
        .request()
        .query(
          "select isnull(max(BreakDownOrderNo),0)+1 as NextNo from tbl_TypeOfBreakDowns"
        );
      orderNo = maxRes.recordset[0]?.NextNo || 1;
    }

    const request = pool.request();
    if (isEdit) request.input("BreakDownMasterCode", sql.Int, code);
    request.input("BreakDownOrderNo", sql.Int, orderNo);
    request.input("BreakDownName", sql.NVarChar, name);
    request.input("Status", sql.Bit, toBit(b.Status));
    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));

    await request.execute("sp_TypeOfBreakDowns_AddEdit");

    return sendSuccess(
      res,
      { BreakDownOrderNo: orderNo },
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (err.message && err.message.includes("UK_BreakDownOrderNo")) {
      return sendError(res, "Already exist the BreakDown Order No", 409);
    }
    console.error("DB Error (saveOrUpdate TypeOfBreakDown):", err);
    return sendError(res, err);
  }
};

export const createBreakdown = (req, res) => saveOrUpdate(req, res, false);
export const updateBreakdown = (req, res) => saveOrUpdate(req, res, true);

// DELETE /type-of-breakdown/delete/:breakDownMasterCode
export const deleteBreakdown = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = parseInt(req.params.breakDownMasterCode);
    if (!code) return sendError(res, "Invalid BreakDownMasterCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("BreakDownMasterCode", sql.Int, code)
      .execute("sp_TypeOfBreakDowns_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the Type Of Break Down!", 409);
    }
    console.error("DB Error (deleteBreakdown):", err);
    return sendError(res, err);
  }
};
