import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Approval master (port of the WinForms frmApproval)
//   - List   : Select ... from tbl_Approval
//   - Create : EXEC sp_Approval_AddEdit  (without @ApprovalCode)
//   - Update : EXEC sp_Approval_AddEdit  (with @ApprovalCode)
//   - Delete : EXEC sp_Approval_Delete
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
  "Select ApprovalCode, ApprovalName, Status from tbl_Approval";

// GET /approval/lists  -> mirrors frmApprovalDetails list query
export const getApprovalList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .query(`${SELECT_COLS} order by ApprovalCode desc`);

    const data = result.recordset.map((item) => ({
      ...item,
      id: item.ApprovalCode,
      StatusText: STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getApprovalList):", err);
    return sendError(res, err);
  }
};

// GET /approval/list/:approvalCode  -> single record
export const getApprovalById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.approvalCode);
    if (!code) return sendError(res, "Invalid ApprovalCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("ApprovalCode", sql.Int, code)
      .query(`${SELECT_COLS} where ApprovalCode = @ApprovalCode`);

    if (!result.recordset.length)
      return sendError(res, "Approval not found", 404);

    const row = result.recordset[0];
    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getApprovalById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_Approval_AddEdit (pnlMainNew_Save_Click)
const saveOrUpdateApproval = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const name = (body.ApprovalName || "").trim();

    // Same validation the form enforces: name is mandatory.
    if (!name)
      return sendError(res, "Approval Name should not be empty", 400);

    const code = isEdit
      ? parseInt(req.params.approvalCode ?? body.ApprovalCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid ApprovalCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) request.input("ApprovalCode", sql.Int, code);
    request.input("ApprovalName", sql.NVarChar, name);
    request.input("Status", sql.Bit, toStatusBit(body.Status));

    await request.execute("sp_Approval_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_ApprovalName_tblApproval")) {
      return sendError(res, "Already exist the Approval Name", 409);
    }
    console.error("DB Error (saveOrUpdateApproval):", err);
    return sendError(res, err);
  }
};

// POST /approval/create        -> create
export const createApproval = (req, res) =>
  saveOrUpdateApproval(req, res, false);

// PUT  /approval/update/:code  -> update
export const updateApproval = (req, res) =>
  saveOrUpdateApproval(req, res, true);

// DELETE /approval/delete/:approvalCode -> EXEC sp_Approval_Delete
export const deleteApproval = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.approvalCode);
    if (!code) return sendError(res, "Invalid ApprovalCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("ApprovalCode", sql.Int, code)
      .execute("sp_Approval_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    // Still referenced elsewhere -> friendly 409 instead of a raw FK error.
    if (err.message && err.message.includes("REFERENCE")) {
      return sendError(
        res,
        "This approval is in use and cannot be deleted",
        409
      );
    }
    console.error("DB Error (deleteApproval):", err);
    return sendError(res, err);
  }
};
