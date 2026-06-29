import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Type Of Employment master (port of the WinForms frmTypeOfEmployment /
// frmTypeofEmploymentDetails)
//
//   A global master: EmploymentName + Duration (months) + Status.
//   - List   : Select ... from tbl_Employment
//   - Create : EXEC sp_Employment_AddEdit  (@C_User/@C_Node, no @EmploymentCode)
//   - Update : EXEC sp_Employment_AddEdit  (@E_User/@E_Node + @EmploymentCode)
//   - Delete : EXEC sp_Employment_Delete   (@EmploymentCode)
//
//   The AddEdit SP needs user/node which we read from the auth token (headers):
//   create -> @C_User/@C_Node, edit -> @E_User/@E_Node.
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

// Accepts true / 1 / "1" / "ACTIVE" as active, everything else inactive.
const toStatusBit = (status) => {
  if (status === true || status === 1 || status === "1") return 1;
  if (typeof status === "string" && status.trim().toUpperCase() === "ACTIVE")
    return 1;
  return 0;
};

// GET /employment/lists  -> mirrors the desktop list query
export const getEmploymentList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .query(
        "Select EmploymentCode, EmploymentName, Duration, Status from tbl_Employment order by EmploymentCode desc"
      );

    const data = result.recordset.map((item) => ({
      ...item,
      id: item.EmploymentCode,
      Status: STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getEmploymentList):", err);
    return sendError(res, err);
  }
};

// GET /employment/list/:employmentCode  -> single record (edit screen)
export const getEmploymentById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const employmentCode = parseInt(req.params.employmentCode);
    if (!employmentCode) return sendError(res, "Invalid EmploymentCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("EmploymentCode", sql.Int, employmentCode)
      .query(
        "Select EmploymentCode, EmploymentName, Duration, Status from tbl_Employment where EmploymentCode = @EmploymentCode"
      );

    if (!result.recordset.length)
      return sendError(res, "Type of Employment not found", 404);

    const row = result.recordset[0];
    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getEmploymentById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_Employment_AddEdit (pnlMainNew_Save_Click)
const saveOrUpdate = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const employmentName = (body.EmploymentName || "").trim();
    const duration = String(body.Duration ?? "").trim();

    // Same validation the form enforces.
    if (!employmentName)
      return sendError(res, "Type of Employment should not be empty", 400);
    if (!duration)
      return sendError(res, "Duration should not be empty", 400);

    const employmentCode = isEdit
      ? parseInt(req.params.employmentCode ?? body.EmploymentCode)
      : null;
    if (isEdit && !employmentCode)
      return sendError(res, "Invalid EmploymentCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    if (isEdit) {
      request.input("E_User", sql.Int, parseInt(userId));
      request.input("E_Node", sql.Int, parseInt(nodeCode));
      request.input("EmploymentCode", sql.Int, employmentCode);
    } else {
      request.input("C_User", sql.Int, parseInt(userId));
      request.input("C_Node", sql.Int, parseInt(nodeCode));
    }
    request.input("EmploymentName", sql.NVarChar, employmentName);
    request.input("Duration", sql.Int, parseInt(duration) || 0);
    request.input("Status", sql.Int, toStatusBit(body.Status));

    await request.execute("sp_Employment_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "Record Updated Successfully" : "Record Saved Successfully",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint -> friendly 409 (matches the desktop message).
    if (err.message && err.message.includes("UK_tbl_Employment")) {
      return sendError(res, "Already Exist this Employment", 409);
    }
    console.error("DB Error (saveOrUpdateEmployment):", err);
    return sendError(res, err);
  }
};

// POST /employment/create
export const createEmployment = (req, res) => saveOrUpdate(req, res, false);

// PUT  /employment/update/:employmentCode
export const updateEmployment = (req, res) => saveOrUpdate(req, res, true);

// DELETE /employment/delete/:employmentCode  -> EXEC sp_Employment_Delete
export const deleteEmployment = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const employmentCode = parseInt(req.params.employmentCode);
    if (!employmentCode) return sendError(res, "Invalid EmploymentCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("EmploymentCode", sql.Int, employmentCode)
      .execute("sp_Employment_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    // Still referenced elsewhere -> friendly 409 instead of a raw FK error.
    if (err.message && (err.message.includes("REFERENCE") || err.message.includes("FK_"))) {
      return sendError(res, "This Type of Employment is in use and cannot be deleted", 409);
    }
    console.error("DB Error (deleteEmployment):", err);
    return sendError(res, err);
  }
};
