import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Transporter master (port of the WinForms frmTransporter)
//   - List   : EXEC sp_Transporter_GetAll
//   - Create : EXEC sp_Transporter_AddEdit  (without @TransporterCode)
//   - Update : EXEC sp_Transporter_AddEdit  (with @TransporterCode)
//   - Delete : EXEC sp_Transporter_Delete
//   - Options: Bank lookup for the form dropdown (GET /transporter/options)
// AddEdit requires @User / @Node which we read from the auth token (headers).
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

// GET /transporter/lists  -> mirrors frmTransporterDetails list
export const getTransporterList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_Transporter_GetAll");

    const data = result.recordset.map((item) => ({
      ...item,
      id: item.TransporterCode,
      StatusText: STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getTransporterList):", err);
    return sendError(res, err);
  }
};

// GET /transporter/list/:transporterCode  -> single record
export const getTransporterById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.transporterCode);
    if (!code) return sendError(res, "Invalid TransporterCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("TransporterCode", sql.Int, code)
      .query(
        "Select TransporterCode, TransporterName, BankCode, IFSCCode, AccountNo, Status " +
          "from tbl_Transporter where TransporterCode = @TransporterCode"
      );

    if (!result.recordset.length)
      return sendError(res, "Transporter not found", 404);

    const row = result.recordset[0];
    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getTransporterById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_Transporter_AddEdit (btnSave_Click)
const saveOrUpdateTransporter = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const name = (body.TransporterName || "").trim();
    const bankCode = toInt(body.BankCode);
    const accountNo = (body.AccountNo || "").trim();
    const ifscCode = (body.IFSCCode || "").trim();

    // Same validations the form enforces.
    if (!name)
      return sendError(res, "Transporter Name should not be empty", 400);
    if (!bankCode) return sendError(res, "Select the Bank Name", 400);
    if (!accountNo) return sendError(res, "Enter the Account No", 400);
    if (!ifscCode) return sendError(res, "Enter the IFSC Code", 400);

    const code = isEdit
      ? parseInt(req.params.transporterCode ?? body.TransporterCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid TransporterCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) request.input("TransporterCode", sql.Int, code);
    request.input("TransporterName", sql.NVarChar, name);
    request.input("BankCode", sql.Int, bankCode);
    request.input("IFSCCode", sql.NVarChar, ifscCode);
    request.input("AccountNo", sql.NVarChar, accountNo);
    request.input("Status", sql.Bit, toBit(body.Status));

    await request.execute("sp_Transporter_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint -> friendly 409 (matches form behaviour).
    if (
      err.message &&
      err.message.includes("UK_TransporterName_tblTransporter")
    ) {
      return sendError(res, "Already exist the Transporter Name", 409);
    }
    console.error("DB Error (saveOrUpdateTransporter):", err);
    return sendError(res, err);
  }
};

// POST /transporter/create        -> create
export const createTransporter = (req, res) =>
  saveOrUpdateTransporter(req, res, false);

// PUT  /transporter/update/:code  -> update
export const updateTransporter = (req, res) =>
  saveOrUpdateTransporter(req, res, true);

// DELETE /transporter/delete/:transporterCode -> EXEC sp_Transporter_Delete
export const deleteTransporter = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.transporterCode);
    if (!code) return sendError(res, "Invalid TransporterCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("TransporterCode", sql.Int, code)
      .execute("sp_Transporter_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the Transporter!", 409);
    }
    console.error("DB Error (deleteTransporter):", err);
    return sendError(res, err);
  }
};

// GET /transporter/options -> Bank lookup for the form dropdown (Bind_Data()).
export const getTransporterOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .query("Select BankCode, BankName from tbl_Bank Order by BankName");

    return sendSuccess(res, {
      banks: result.recordset.map((r) => ({
        value: r.BankCode,
        label: r.BankName,
      })),
    });
  } catch (err) {
    console.error("DB Error (getTransporterOptions):", err);
    return sendError(res, err);
  }
};
