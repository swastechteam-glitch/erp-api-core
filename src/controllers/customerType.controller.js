import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";
import { isDuplicateByGetAll } from "../utils/duplicateCheck.js";

// ---------------------------------------------------------------------------
// Customer Type master (port of the WinForms frmCustomerType)
//   - List   : EXEC sp_CustomerType_GetAll
//   - Create : EXEC sp_CustomerType_AddEdit  (without @CustomerTypeCode)
//   - Update : EXEC sp_CustomerType_AddEdit  (with @CustomerTypeCode)
//   - Delete : EXEC sp_CustomerType_Delete
// AddEdit requires @User / @Node which we read from the auth token (headers).
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

const toBit = (v) => {
  if (v === true || v === 1 || v === "1") return 1;
  if (typeof v === "string" && v.trim().toUpperCase() === "ACTIVE") return 1;
  return 0;
};

// GET /customer-type/lists  -> mirrors frmCustomerTypeDetails list
export const getCustomerTypeList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_CustomerType_GetAll");

    const data = result.recordset.map((item) => ({
      ...item,
      id: item.CustomerTypeCode,
      StatusText: STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getCustomerTypeList):", err);
    return sendError(res, err);
  }
};

// GET /customer-type/list/:customerTypeCode  -> single record
export const getCustomerTypeById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.customerTypeCode);
    if (!code) return sendError(res, "Invalid CustomerTypeCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CustomerTypeCode", sql.Int, code)
      .query(
        "Select CustomerTypeCode, CustomerType, Status " +
          "from tbl_CustomerType where CustomerTypeCode = @CustomerTypeCode"
      );

    if (!result.recordset.length)
      return sendError(res, "Customer Type not found", 404);

    const row = result.recordset[0];
    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getCustomerTypeById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_CustomerType_AddEdit (btnSave_Click)
const saveOrUpdateCustomerType = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const name = (body.CustomerType || "").trim();

    // Same validation the form enforces: name is mandatory.
    if (!name)
      return sendError(res, "CustomerType Name should not be empty", 400);

    const code = isEdit
      ? parseInt(req.params.customerTypeCode ?? body.CustomerTypeCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid CustomerTypeCode for update", 400);

    const pool = await getPool(req.headers.subdbname);

    if (
      await isDuplicateByGetAll(pool, {
        proc: "sp_CustomerType_GetAll",
        nameField: "CustomerType",
        codeField: "CustomerTypeCode",
        name,
        code: isEdit ? code : null,
      })
    )
      return sendError(res, "Customer Type already exists", 409);

    const request = pool.request();

    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) request.input("CustomerTypeCode", sql.Int, code);
    request.input("CustomerType", sql.NVarChar, name);
    request.input("Status", sql.Bit, toBit(body.Status));

    await request.execute("sp_CustomerType_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_CustomerType_tblCustomerType")) {
      return sendError(res, "Already exist the CustomerType Name", 409);
    }
    console.error("DB Error (saveOrUpdateCustomerType):", err);
    return sendError(res, err);
  }
};

// POST /customer-type/create        -> create
export const createCustomerType = (req, res) =>
  saveOrUpdateCustomerType(req, res, false);

// PUT  /customer-type/update/:code  -> update
export const updateCustomerType = (req, res) =>
  saveOrUpdateCustomerType(req, res, true);

// DELETE /customer-type/delete/:customerTypeCode -> EXEC sp_CustomerType_Delete
export const deleteCustomerType = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.customerTypeCode);
    if (!code) return sendError(res, "Invalid CustomerTypeCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("CustomerTypeCode", sql.Int, code)
      .execute("sp_CustomerType_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the CustomerType!", 409);
    }
    console.error("DB Error (deleteCustomerType):", err);
    return sendError(res, err);
  }
};
