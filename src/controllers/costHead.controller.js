import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Cost Head master (port of the WinForms frmCostHead)
//   - List   : Select ... from tbl_CostHead
//   - Create : EXEC sp_CostHead_AddEdit  (without @CostHeadCode)
//   - Update : EXEC sp_CostHead_AddEdit  (with @CostHeadCode)
//   - Delete : EXEC sp_CostHead_Delete
// AddEdit requires @User / @Node which we read from the auth token (headers).
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

const toStatusBit = (status) => {
  if (status === true || status === 1 || status === "1") return 1;
  if (typeof status === "string" && status.trim().toUpperCase() === "ACTIVE")
    return 1;
  return 0;
};

const SELECT_COLS =
  "Select CostHeadCode, CostHeadName, Status from tbl_CostHead";

// GET /cost-head/lists  -> mirrors frmCostHeadDetails list query
export const getCostHeadList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .query(`${SELECT_COLS} order by CostHeadCode desc`);

    const data = result.recordset.map((item) => ({
      ...item,
      id: item.CostHeadCode,
      StatusText: STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getCostHeadList):", err);
    return sendError(res, err);
  }
};

// GET /cost-head/list/:costHeadCode  -> single record
export const getCostHeadById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.costHeadCode);
    if (!code) return sendError(res, "Invalid CostHeadCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CostHeadCode", sql.Int, code)
      .query(`${SELECT_COLS} where CostHeadCode = @CostHeadCode`);

    if (!result.recordset.length)
      return sendError(res, "Cost Head not found", 404);

    const row = result.recordset[0];
    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getCostHeadById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_CostHead_AddEdit (pnlMainNew_Save_Click)
const saveOrUpdateCostHead = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const name = (body.CostHeadName || "").trim();

    // Same validation the form enforces: name is mandatory.
    if (!name)
      return sendError(res, "CostHead Name should not be empty", 400);

    const code = isEdit
      ? parseInt(req.params.costHeadCode ?? body.CostHeadCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid CostHeadCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) request.input("CostHeadCode", sql.Int, code);
    request.input("CostHeadName", sql.NVarChar, name);
    request.input("Status", sql.Bit, toStatusBit(body.Status));

    await request.execute("sp_CostHead_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_CostHeadName_tblCostHead")) {
      return sendError(res, "Already exist the CostHead Name", 409);
    }
    console.error("DB Error (saveOrUpdateCostHead):", err);
    return sendError(res, err);
  }
};

// POST /cost-head/create        -> create
export const createCostHead = (req, res) =>
  saveOrUpdateCostHead(req, res, false);

// PUT  /cost-head/update/:code  -> update
export const updateCostHead = (req, res) =>
  saveOrUpdateCostHead(req, res, true);

// DELETE /cost-head/delete/:costHeadCode -> EXEC sp_CostHead_Delete
export const deleteCostHead = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.costHeadCode);
    if (!code) return sendError(res, "Invalid CostHeadCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("CostHeadCode", sql.Int, code)
      .execute("sp_CostHead_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    // Still referenced elsewhere -> friendly 409 instead of a raw FK error.
    if (err.message && err.message.includes("REFERENCE")) {
      return sendError(
        res,
        "This cost head is in use and cannot be deleted",
        409
      );
    }
    console.error("DB Error (deleteCostHead):", err);
    return sendError(res, err);
  }
};
