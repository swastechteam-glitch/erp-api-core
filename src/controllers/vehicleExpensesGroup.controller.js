import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Vehicle Expenses Group master
// (port of WinForms frmVehicleExpensessGroup / frmVehicleExpensessGroupDetails)
//   - List   : SELECT * FROM tbl_VehicleExpencessGroup   (direct, like the VB —
//              there is NO _GetAll proc; the form binds the table directly)
//   - Create : EXEC sp_VehicleExpencessGroup_AddEdit  (without @VehicleExpencessGroupCode)
//   - Update : EXEC sp_VehicleExpencessGroup_AddEdit  (with @VehicleExpencessGroupCode)
//   - Delete : EXEC sp_VehicleExpencessGroup_Delete   @VehicleExpencessGroupCode
// AddEdit takes @User / @Node (auth headers) but — unlike the EB masters — NO
// @CompanyCode (the VB never passed one). DB/SP names keep the legacy
// "Expencess" spelling exactly.
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

// Accepts true / 1 / "1" / "ACTIVE" as active, everything else inactive.
const toStatusBit = (status) => {
  if (status === true || status === 1 || status === "1") return 1;
  if (typeof status === "string" && status.trim().toUpperCase() === "ACTIVE")
    return 1;
  return 0;
};

const LIST_SQL =
  "SELECT * FROM tbl_VehicleExpencessGroup ORDER BY VehicleExpencessGroupCode DESC";

// GET /vehicle-expenses-group/lists
export const getVehicleExpensesGroupList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().query(LIST_SQL);

    const data = result.recordset.map((item) => ({
      ...item,
      id: item.VehicleExpencessGroupCode,
      StatusText: STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getVehicleExpensesGroupList):", err);
    return sendError(res, err);
  }
};

// GET /vehicle-expenses-group/list/:vehicleExpensesGroupCode
export const getVehicleExpensesGroupById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.vehicleExpensesGroupCode);
    if (!code) return sendError(res, "Invalid VehicleExpencessGroupCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().query(LIST_SQL);
    const row = result.recordset.find((r) => r.VehicleExpencessGroupCode === code);

    if (!row) return sendError(res, "Vehicle Expenses Group not found", 404);

    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getVehicleExpensesGroupById):", err);
    return sendError(res, err);
  }
};

// Duplicate name guard (the VB had a UK constraint; we also pre-check the table
// since there is no _GetAll proc to reuse). Excludes the row being edited.
const isDuplicateName = async (pool, name, code) => {
  const result = await pool
    .request()
    .input("Name", sql.NVarChar, name)
    .query(
      "SELECT VehicleExpencessGroupCode FROM tbl_VehicleExpencessGroup WHERE LTRIM(RTRIM(VehicleExpencessGroupName)) = @Name"
    );
  return result.recordset.some((r) => r.VehicleExpencessGroupCode !== code);
};

// Shared add/edit handler -> EXEC sp_VehicleExpencessGroup_AddEdit (btnSave_Click)
const saveOrUpdate = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const name = (body.VehicleExpencessGroupName || "").trim();

    // Same validation the form enforces: name is mandatory.
    if (!name) return sendError(res, "Enter the Vehicle Expenses Group", 400);

    // Val() in VB returns 0 for blank / non-numeric input.
    const orderNo = parseInt(body.OrderNo) || 0;

    const code = isEdit
      ? parseInt(req.params.vehicleExpensesGroupCode ?? body.VehicleExpencessGroupCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid VehicleExpencessGroupCode for update", 400);

    const pool = await getPool(req.headers.subdbname);

    if (await isDuplicateName(pool, name, code))
      return sendError(res, "Already Exist this Vehicle Expenses Group", 409);

    const request = pool.request();
    if (isEdit) request.input("VehicleExpencessGroupCode", sql.Int, code);
    request.input("VehicleExpencessGroupName", sql.NVarChar, name);
    request.input("OrderNo", sql.Int, orderNo);
    request.input("Status", sql.Bit, toStatusBit(body.Status));
    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));

    await request.execute("sp_VehicleExpencessGroup_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "Record Updated Successfully" : "Record Saved Successfully",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (err.message && err.message.includes("UK_")) {
      return sendError(res, "Already Exist this Vehicle Expenses Group", 409);
    }
    console.error("DB Error (saveOrUpdate VehicleExpensesGroup):", err);
    return sendError(res, err);
  }
};

// POST /vehicle-expenses-group/create
export const createVehicleExpensesGroup = (req, res) =>
  saveOrUpdate(req, res, false);

// PUT  /vehicle-expenses-group/update/:vehicleExpensesGroupCode
export const updateVehicleExpensesGroup = (req, res) =>
  saveOrUpdate(req, res, true);

// DELETE /vehicle-expenses-group/delete/:vehicleExpensesGroupCode
export const deleteVehicleExpensesGroup = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.vehicleExpensesGroupCode);
    if (!code) return sendError(res, "Invalid VehicleExpencessGroupCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("VehicleExpencessGroupCode", sql.Int, code)
      .execute("sp_VehicleExpencessGroup_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    // Still referenced elsewhere -> friendly 409 instead of a raw FK error.
    if (err.message && (err.message.includes("FK_") || err.message.includes("REFERENCE"))) {
      return sendError(res, "You cannot delete this Vehicle Expenses Group !", 409);
    }
    console.error("DB Error (deleteVehicleExpensesGroup):", err);
    return sendError(res, err);
  }
};
