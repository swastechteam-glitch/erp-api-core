import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Department Group master (port of the WinForms frmDepartmentGroup)
//   - List   : Select ... from tbl_DepartmentGroup
//   - Create : EXEC sp_DepartmentGroup_AddEdit  (without @DepartmentGroupCode)
//   - Update : EXEC sp_DepartmentGroup_AddEdit  (with @DepartmentGroupCode)
//   - Delete : EXEC sp_DepartmentGroup_Delete
// AddEdit requires @User / @Node which we read from the auth token (headers).
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

// Accepts true / 1 / "1" / "ACTIVE" as active, everything else inactive.
const toStatusBit = (status) => {
  if (status === true || status === 1 || status === "1") return 1;
  if (typeof status === "string" && status.trim().toUpperCase() === "ACTIVE")
    return 1;
  return 0;
};

const SELECT_COLS =
  "Select DepartmentGroupCode, DepartmentGroupName, OrderNo, Status from tbl_DepartmentGroup";

// GET /department-group/lists  -> mirrors frmDepartmentGroup list query
export const getDepartmentGroupList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .query(`${SELECT_COLS} order by DepartmentGroupCode desc`);

    const data = result.recordset.map((item) => ({
      ...item,
      id: item.DepartmentGroupCode,
      StatusText: STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getDepartmentGroupList):", err);
    return sendError(res, err);
  }
};

// GET /department-group/list/:departmentGroupCode  -> single record
export const getDepartmentGroupById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.departmentGroupCode);
    if (!code) return sendError(res, "Invalid DepartmentGroupCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("DepartmentGroupCode", sql.Int, code)
      .query(`${SELECT_COLS} where DepartmentGroupCode = @DepartmentGroupCode`);

    if (!result.recordset.length)
      return sendError(res, "Department Group not found", 404);

    const row = result.recordset[0];
    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getDepartmentGroupById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_DepartmentGroup_AddEdit (btnSave_Click)
const saveOrUpdateDepartmentGroup = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const name = (body.DepartmentGroupName || "").trim();
    const orderNo = parseInt(body.OrderNo);

    // Same validation the form enforces: name mandatory, OrderNo > 0.
    if (!name)
      return sendError(res, "DepartmentGroup Name should not be empty", 400);
    if (!orderNo || orderNo <= 0)
      return sendError(res, "Enter the Order No...", 400);

    const code = isEdit
      ? parseInt(req.params.departmentGroupCode ?? body.DepartmentGroupCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid DepartmentGroupCode for update", 400);

    const pool = await getPool(req.headers.subdbname);

    // Reject a duplicate DepartmentGroup name (case-insensitive) before saving.
    // No sp_DepartmentGroup_GetAll proc exists, so reuse the list SELECT.
    const existing = await pool
      .request()
      .query(`${SELECT_COLS}`);
    const target = name.trim().toLowerCase();
    const isDuplicate = (existing.recordset || []).some(
      (row) =>
        String(row.DepartmentGroupName ?? "").trim().toLowerCase() === target &&
        Number(row.DepartmentGroupCode ?? 0) !== Number(code ?? 0)
    );
    if (isDuplicate)
      return sendError(res, "Department Group already exists", 409);

    const request = pool.request();

    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) request.input("DepartmentGroupCode", sql.Int, code);
    request.input("DepartmentGroupName", sql.NVarChar, name);
    request.input("OrderNo", sql.Int, orderNo);
    request.input("Status", sql.Bit, toStatusBit(body.Status));

    await request.execute("sp_DepartmentGroup_AddEdit");

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
      err.message.includes("UK_DepartmentGroupName_tblDepartmentGroup")
    ) {
      return sendError(res, "Already exist the DepartmentGroup Name", 409);
    }
    console.error("DB Error (saveOrUpdateDepartmentGroup):", err);
    return sendError(res, err);
  }
};

// POST /department-group/create        -> create
export const createDepartmentGroup = (req, res) =>
  saveOrUpdateDepartmentGroup(req, res, false);

// PUT  /department-group/update/:code  -> update
export const updateDepartmentGroup = (req, res) =>
  saveOrUpdateDepartmentGroup(req, res, true);

// DELETE /department-group/delete/:departmentGroupCode -> EXEC sp_DepartmentGroup_Delete
export const deleteDepartmentGroup = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.departmentGroupCode);
    if (!code) return sendError(res, "Invalid DepartmentGroupCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();
    request.input("DepartmentGroupCode", sql.Int, code);

    await request.execute("sp_DepartmentGroup_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    // Still referenced elsewhere -> friendly 409 instead of a raw FK error.
    if (err.message && err.message.includes("REFERENCE")) {
      return sendError(
        res,
        "This department group is in use and cannot be deleted",
        409
      );
    }
    console.error("DB Error (deleteDepartmentGroup):", err);
    return sendError(res, err);
  }
};
