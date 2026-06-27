import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";
import { isDuplicateByGetAll } from "../utils/duplicateCheck.js";

// ---------------------------------------------------------------------------
// Service Order Expenses master (port of the WinForms frmServiceOrderExpenses)
//   - List   : EXEC sp_ServiceOrderExpenses_GetAll
//   - Create : EXEC sp_ServiceOrderExpenses_AddEdit  (without @SOExpensesCode)
//   - Update : EXEC sp_ServiceOrderExpenses_AddEdit  (with @SOExpensesCode)
//   - Delete : EXEC sp_ServiceOrderExpenses_Delete
// AddEdit requires @User / @Node (read from the auth token headers).
// The Payment / Deduction radio is sent as one select (Type) and expanded here
// into the @Payment / @Deduction bit columns.
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

const toBit = (v) => {
  if (v === true || v === 1 || v === "1") return 1;
  if (typeof v === "string" && v.trim().toUpperCase() === "ACTIVE") return 1;
  return 0;
};

// Collapse the Payment/Deduction bits into the single select value the form uses.
const deriveType = (row) => (row.Deduction ? "Deduction" : "Payment");

// GET /service-order-expenses/lists  -> mirrors frmServiceOrderExpensesDetails list
export const getServiceOrderExpensesList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_ServiceOrderExpenses_GetAll");

    const data = result.recordset.map((item) => ({
      ...item,
      id: item.SOExpensesCode,
      StatusText: STATUS_LABEL(item.Status),
      Type: deriveType(item),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getServiceOrderExpensesList):", err);
    return sendError(res, err);
  }
};

// GET /service-order-expenses/list/:soExpensesCode  -> single record
export const getServiceOrderExpensesById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.soExpensesCode);
    if (!code) return sendError(res, "Invalid SOExpensesCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("SOExpensesCode", sql.Int, code)
      .query(
        "Select SOExpensesCode, SOExpensesName, Payment, Deduction, Status " +
          "from tbl_ServiceOrderExpenses where SOExpensesCode = @SOExpensesCode"
      );

    if (!result.recordset.length)
      return sendError(res, "Service Order Expenses not found", 404);

    const row = result.recordset[0];
    return sendSuccess(res, {
      ...row,
      StatusText: STATUS_LABEL(row.Status),
      Type: deriveType(row),
    });
  } catch (err) {
    console.error("DB Error (getServiceOrderExpensesById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_ServiceOrderExpenses_AddEdit (btnSave_Click)
const saveOrUpdateServiceOrderExpenses = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const name = (body.SOExpensesName || "").trim();
    const type = (body.Type || "Payment").toString();

    // Same validation the form enforces: name is mandatory.
    if (!name)
      return sendError(res, "Service Order Expenses Name should not be empty", 400);

    const code = isEdit
      ? parseInt(req.params.soExpensesCode ?? body.SOExpensesCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid SOExpensesCode for update", 400);

    const pool = await getPool(req.headers.subdbname);

    // Reject a duplicate name BEFORE saving.
    if (
      await isDuplicateByGetAll(pool, {
        proc: "sp_ServiceOrderExpenses_GetAll",
        nameField: "SOExpensesName",
        codeField: "SOExpensesCode",
        name,
        code: isEdit ? code : null,
      })
    )
      return sendError(res, "Service Order Expenses already exists", 409);

    const request = pool.request();

    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) request.input("SOExpensesCode", sql.Int, code);
    request.input("SOExpensesName", sql.NVarChar, name);
    request.input("Payment", sql.Bit, type === "Deduction" ? 0 : 1);
    request.input("Deduction", sql.Bit, type === "Deduction" ? 1 : 0);
    request.input("Status", sql.Bit, toBit(body.Status));

    await request.execute("sp_ServiceOrderExpenses_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_SOExpensesName")) {
      return sendError(res, "Already exist the Service Order Expenses Name", 409);
    }
    console.error("DB Error (saveOrUpdateServiceOrderExpenses):", err);
    return sendError(res, err);
  }
};

// POST /service-order-expenses/create        -> create
export const createServiceOrderExpenses = (req, res) =>
  saveOrUpdateServiceOrderExpenses(req, res, false);

// PUT  /service-order-expenses/update/:code  -> update
export const updateServiceOrderExpenses = (req, res) =>
  saveOrUpdateServiceOrderExpenses(req, res, true);

// DELETE /service-order-expenses/delete/:soExpensesCode -> EXEC sp_ServiceOrderExpenses_Delete
export const deleteServiceOrderExpenses = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.soExpensesCode);
    if (!code) return sendError(res, "Invalid SOExpensesCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("SOExpensesCode", sql.Int, code)
      .execute("sp_ServiceOrderExpenses_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the Service Order Expenses!", 409);
    }
    console.error("DB Error (deleteServiceOrderExpenses):", err);
    return sendError(res, err);
  }
};
