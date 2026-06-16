import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Bank master (port of the WinForms frmBank functionality)
//   - List   : Select ... from tbl_Bank
//   - Create : EXEC sp_Bank_AddEdit  (without @BankCode)
//   - Update : EXEC sp_Bank_AddEdit  (with @BankCode)
// The SP requires @User / @Node which we read from the auth token (headers).
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

// Accepts true / 1 / "1" / "ACTIVE" as active, everything else inactive.
const toStatusBit = (status) => {
  if (status === true || status === 1 || status === "1") return 1;
  if (typeof status === "string" && status.trim().toUpperCase() === "ACTIVE")
    return 1;
  return 0;
};

// GET /bank/list  -> mirrors frmBank list query (pnlMainNew_Clear_Click)
export const getBankList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    const result = await request.query(
      "Select BankCode, BankName, BranchName, IFSCCode, PhoneNo, Status from tbl_Bank order by BankCode desc"
    );

    const data = result.recordset.map((item) => ({
      ...item,
      id: item.BankCode,
      StatusText: STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getBankList):", err);
    return sendError(res, err);
  }
};

// GET /bank/:bankCode  -> single bank (used to populate the edit screen)
export const getBankById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const bankCode = parseInt(req.params.bankCode);
    if (!bankCode) return sendError(res, "Invalid BankCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("BankCode", sql.Int, bankCode)
      .query(
        "Select BankCode, BankName, BranchName, IFSCCode, PhoneNo, Status from tbl_Bank where BankCode = @BankCode"
      );

    if (!result.recordset.length)
      return sendError(res, "Bank not found", 404);

    const row = result.recordset[0];
    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getBankById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_Bank_AddEdit (pnlMainNew_Save_Click)
const saveOrUpdateBank = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const bankName = (body.BankName || "").trim();
    const branchName = (body.BranchName || "").trim();
    const ifscCode = (body.IFSCCode || "").trim();
    const phoneNo = (body.PhoneNo || "").trim();

    // Same validation the form enforces: Bank Name is mandatory.
    if (!bankName)
      return sendError(res, "Bank Name should not be empty", 400);

    const bankCode = isEdit
      ? parseInt(req.params.bankCode ?? body.BankCode)
      : null;
    if (isEdit && !bankCode)
      return sendError(res, "Invalid BankCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) request.input("BankCode", sql.Int, bankCode);
    request.input("BankName", sql.NVarChar, bankName);
    request.input("BranchName", sql.NVarChar, branchName);
    request.input("IFSCCode", sql.NVarChar, ifscCode);
    request.input("PhoneNo", sql.NVarChar, phoneNo);
    request.input("Status", sql.Bit, toStatusBit(body.Status));

    await request.execute("sp_Bank_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint on bank name -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_BankName_tblBank")) {
      return sendError(res, "Already exist the Bank Name", 409);
    }
    console.error("DB Error (saveOrUpdateBank):", err);
    return sendError(res, err);
  }
};

// POST /bank        -> create
export const createBank = (req, res) => saveOrUpdateBank(req, res, false);

// PUT  /bank/:bankCode -> update
export const updateBank = (req, res) => saveOrUpdateBank(req, res, true);

// DELETE /bank/delete/:bankCode  -> EXEC sp_bank_delete
export const deleteBank = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const bankCode = parseInt(req.params.bankCode);
    if (!bankCode) return sendError(res, "Invalid BankCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    request.input("BankCode", sql.Int, bankCode);
    // request.input("User", sql.Int, parseInt(userId));
    // request.input("Node", sql.Int, parseInt(nodeCode));

    await request.execute("sp_bank_delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    // Bank still referenced elsewhere -> friendly 409 instead of a raw FK error.
    if (err.message && err.message.includes("REFERENCE")) {
      return sendError(
        res,
        "This bank is in use and cannot be deleted",
        409
      );
    }
    console.error("DB Error (deleteBank):", err);
    return sendError(res, err);
  }
};
