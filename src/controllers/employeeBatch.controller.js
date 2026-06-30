import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Employee Batch master (port of the WinForms frmEmployeeBatch / ...Details)
//
//   A global master: Employee Batch Name + Order S.No (SerialNo) + Status.
//   Stored procs (kept identical to the desktop):
//     sp_EmployeeBatch_AddEdit  -> insert/update (create @C_User/@C_Node,
//                                  edit @E_User/@E_Node + @EmployeeBatchCode)
//     sp_EmployeeBatch_Delete   -> delete (@EmployeeBatchCode)
//   List: Select ... from tbl_EmployeeBatch (no _GetAll SP on the desktop).
//
//   The AddEdit SP needs user/node which we read from the auth token (headers).
//
//   Endpoints
//     GET    /lists                       tbl_EmployeeBatch
//     GET    /list/:employeeBatchCode     one record
//     POST   /create                      sp_EmployeeBatch_AddEdit (no code)
//     PUT    /update/:employeeBatchCode   sp_EmployeeBatch_AddEdit (with code)
//     DELETE /delete/:employeeBatchCode   sp_EmployeeBatch_Delete
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");
const toStatusBit = (status) => {
  if (status === true || status === 1 || status === "1") return 1;
  if (typeof status === "string" && status.trim().toUpperCase() === "ACTIVE") return 1;
  return 0;
};

// GET /employee-batch/lists  -> tbl_EmployeeBatch
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .query("Select EmployeeBatchCode, EmployeeBatchName, SerialNo, Status from tbl_EmployeeBatch order by SerialNo");
    const data = result.recordset.map((item) => ({
      ...item,
      id: item.EmployeeBatchCode,
      Status: STATUS_LABEL(item.Status),
    }));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getEmployeeBatchList):", err);
    return sendError(res, err);
  }
};

// GET /employee-batch/list/:employeeBatchCode  -> single record (edit screen)
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.employeeBatchCode);
    if (!code) return sendError(res, "Invalid EmployeeBatchCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("EmployeeBatchCode", sql.Int, code)
      .query(
        "Select EmployeeBatchCode, EmployeeBatchName, SerialNo, Status from tbl_EmployeeBatch where EmployeeBatchCode = @EmployeeBatchCode"
      );

    if (!result.recordset.length) return sendError(res, "Employee Batch not found", 404);
    const row = result.recordset[0];
    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getEmployeeBatchById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_EmployeeBatch_AddEdit (pnlMainNew_Save_Click)
const saveOrUpdate = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const employeeBatchName = (body.EmployeeBatchName || "").trim();
    if (!employeeBatchName) return sendError(res, "Employee Batch should not be empty", 400);

    const code = isEdit ? toInt(req.params.employeeBatchCode ?? body.EmployeeBatchCode) : null;
    if (isEdit && !code) return sendError(res, "Invalid EmployeeBatchCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    if (isEdit) {
      request.input("E_User", sql.Int, parseInt(userId));
      request.input("E_Node", sql.Int, parseInt(nodeCode));
      request.input("EmployeeBatchCode", sql.Int, code);
    } else {
      request.input("C_User", sql.Int, parseInt(userId));
      request.input("C_Node", sql.Int, parseInt(nodeCode));
    }
    request.input("EmployeeBatchName", sql.NVarChar, employeeBatchName);
    request.input("SerialNo", sql.Int, toInt(body.SerialNo));
    request.input("Status", sql.Int, toStatusBit(body.Status));

    await request.execute("sp_EmployeeBatch_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "Record Updated Successfully" : "Record Saved Successfully",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (err.message && err.message.includes("UK_")) {
      return sendError(res, "Already Exist this Employee Batch", 409);
    }
    console.error("DB Error (saveOrUpdateEmployeeBatch):", err);
    return sendError(res, err);
  }
};

// POST /employee-batch/create
export const create = (req, res) => saveOrUpdate(req, res, false);

// PUT  /employee-batch/update/:employeeBatchCode
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /employee-batch/delete/:employeeBatchCode  -> sp_EmployeeBatch_Delete
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.employeeBatchCode);
    if (!code) return sendError(res, "Invalid EmployeeBatchCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("EmployeeBatchCode", sql.Int, code)
      .execute("sp_EmployeeBatch_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("FK_") || err.message.includes("REFERENCE"))) {
      return sendError(res, "This Employee Batch is in use and cannot be deleted", 409);
    }
    console.error("DB Error (deleteEmployeeBatch):", err);
    return sendError(res, err);
  }
};
