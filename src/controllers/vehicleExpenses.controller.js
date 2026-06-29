import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Vehicle Expenses master
// (port of WinForms frmVehicleExpensess / frmVehicleExpensessDetails)
//   - List   : SELECT * FROM vw_VehicleExpencess  (direct view, like the VB —
//              the view exposes the joined group name for the grid)
//   - Create : EXEC sp_VehicleExpencess_AddEdit  (without @VehicleExpencessCode)
//   - Update : EXEC sp_VehicleExpencess_AddEdit  (with @VehicleExpencessCode)
//   - Delete : EXEC sp_VehicleExpencess_Delete   @VehicleExpencessCode
// Each expense belongs to a Vehicle Expenses Group (@VehicleExpencessGroupCode,
// the dropdown reuses /vehicle-expenses-group/lists) and carries an Opening
// flag. AddEdit takes @User/@Node but — like the group master — NO @CompanyCode.
// DB/SP names keep the legacy "Expencess" spelling exactly.
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

// Accepts true / 1 / "1" / "ACTIVE" as active, everything else inactive.
const toStatusBit = (status) => {
  if (status === true || status === 1 || status === "1") return 1;
  if (typeof status === "string" && status.trim().toUpperCase() === "ACTIVE")
    return 1;
  return 0;
};

// Generic bit coercion for the Opening checkbox (true / 1 / "1" / "true").
const toBit = (v) => {
  if (v === true || v === 1 || v === "1") return 1;
  if (typeof v === "string" && v.trim().toLowerCase() === "true") return 1;
  return 0;
};

const LIST_SQL =
  "SELECT * FROM vw_VehicleExpencess ORDER BY VehicleExpencessCode DESC";

// GET /vehicle-expenses/lists
export const getVehicleExpensesList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().query(LIST_SQL);

    const data = result.recordset.map((item) => ({
      ...item,
      id: item.VehicleExpencessCode,
      StatusText: STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getVehicleExpensesList):", err);
    return sendError(res, err);
  }
};

// GET /vehicle-expenses/list/:vehicleExpensesCode
export const getVehicleExpensesById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.vehicleExpensesCode);
    if (!code) return sendError(res, "Invalid VehicleExpencessCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().query(LIST_SQL);
    const row = result.recordset.find((r) => r.VehicleExpencessCode === code);

    if (!row) return sendError(res, "Vehicle Expenses not found", 404);

    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getVehicleExpensesById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_VehicleExpencess_AddEdit (btnSave_Click)
const saveOrUpdate = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const name = (body.VehicleExpencessName || "").trim();
    const groupCode = parseInt(body.VehicleExpencessGroupCode) || 0;

    // Same validation the form enforces: name + group are mandatory.
    if (!name) return sendError(res, "Enter the Vehicle Expenses Name", 400);
    if (groupCode <= 0)
      return sendError(res, "Select the Vehicle Expenses Group", 400);

    // Val() in VB returns 0 for blank / non-numeric input.
    const orderNo = parseInt(body.OrderNo) || 0;

    const code = isEdit
      ? parseInt(req.params.vehicleExpensesCode ?? body.VehicleExpencessCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid VehicleExpencessCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    if (isEdit) request.input("VehicleExpencessCode", sql.Int, code);
    request.input("VehicleExpencessName", sql.NVarChar, name);
    request.input("VehicleExpencessGroupCode", sql.Int, groupCode);
    request.input("OrderNo", sql.Int, orderNo);
    request.input("Status", sql.Bit, toStatusBit(body.Status));
    request.input("Opening", sql.Bit, toBit(body.Opening));
    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));

    await request.execute("sp_VehicleExpencess_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "Record Updated Successfully" : "Record Saved Successfully",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (err.message && err.message.includes("UK_")) {
      return sendError(res, "Already Exist this Vehicle Expenses", 409);
    }
    console.error("DB Error (saveOrUpdate VehicleExpenses):", err);
    return sendError(res, err);
  }
};

// POST /vehicle-expenses/create
export const createVehicleExpenses = (req, res) => saveOrUpdate(req, res, false);

// PUT  /vehicle-expenses/update/:vehicleExpensesCode
export const updateVehicleExpenses = (req, res) => saveOrUpdate(req, res, true);

// DELETE /vehicle-expenses/delete/:vehicleExpensesCode
export const deleteVehicleExpenses = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.vehicleExpensesCode);
    if (!code) return sendError(res, "Invalid VehicleExpencessCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("VehicleExpencessCode", sql.Int, code)
      .execute("sp_VehicleExpencess_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("FK_") || err.message.includes("REFERENCE"))) {
      return sendError(res, "You cannot delete this Vehicle Expenses !", 409);
    }
    console.error("DB Error (deleteVehicleExpenses):", err);
    return sendError(res, err);
  }
};
