import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Designation master (port of the WinForms frmDesignation / frmDesignationDetails)
//
//   A global master: Department (tbl_Department) + DesignationName + OrderNo + Status.
//   Stored procs (kept identical to the desktop):
//     sp_Designation_AddEdit  -> insert/update (create @C_User/@C_Node,
//                                edit @E_User/@E_Node + @DesignationCode)
//     sp_Designation_GetAll   -> list
//     sp_Designation_Delete   -> delete (@DesignationCode)
//   Department lookup: tbl_Department (Status=1, DepartmentName_English).
//
//   The AddEdit SP needs user/node which we read from the auth token (headers).
//
//   Endpoints
//     GET    /options                  departments (Department dropdown)
//     GET    /lists                    sp_Designation_GetAll
//     GET    /list/:designationCode    one record (from GetAll)
//     POST   /create                   sp_Designation_AddEdit (no code)
//     PUT    /update/:designationCode  sp_Designation_AddEdit (with code)
//     DELETE /delete/:designationCode  sp_Designation_Delete
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
const pick = (row, ...keys) => {
  if (!row) return undefined;
  for (const k of keys) {
    if (k == null) continue;
    if (row[k] !== undefined) return row[k];
    const lk = String(k).toLowerCase();
    const hit = Object.keys(row).find((o) => o.toLowerCase() === lk);
    if (hit) return row[hit];
  }
  return undefined;
};

// GET /designation/options  -> departments (cmbDepartment source)
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .query("Select DepartmentCode, DepartmentName_English from tbl_Department where Status = 1 order by DepartmentName_English");
    return sendSuccess(res, {
      departments: (r.recordset || []).map((x) => ({
        value: toInt(x.DepartmentCode),
        label: x.DepartmentName_English ?? "",
      })),
    });
  } catch (err) {
    console.error("DB Error (Designation.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /designation/lists  -> sp_Designation_GetAll
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool.request().execute("sp_Designation_GetAll");
    const data = (r.recordset || []).map((row) => {
      const code = toInt(pick(row, "DesignationCode"));
      return {
        ...row,
        id: code,
        DesignationCode: code,
        DepartmentName: pick(row, "DepartmentName_English", "DepartmentName") ?? "",
        DesignationName: pick(row, "DesignationName") ?? "",
        DesignationOrderNo: toInt(pick(row, "DesignationOrderNo")),
        Status: STATUS_LABEL(toStatusBit(pick(row, "Status"))),
      };
    });
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (Designation.getList):", err);
    return sendError(res, err);
  }
};

// GET /designation/list/:designationCode  -> one record for the edit screen (from GetAll)
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.designationCode);
    if (code <= 0) return sendError(res, "Invalid DesignationCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const r = await pool.request().execute("sp_Designation_GetAll");
    const row = (r.recordset || []).find((x) => toInt(pick(x, "DesignationCode")) === code);
    if (!row) return sendError(res, "Designation not found", 404);

    return sendSuccess(res, {
      DesignationCode: code,
      DepartmentCode: toInt(pick(row, "DepartmentCode")),
      DesignationName: pick(row, "DesignationName") ?? "",
      DesignationOrderNo: toInt(pick(row, "DesignationOrderNo")),
      Status: toStatusBit(pick(row, "Status")),
    });
  } catch (err) {
    console.error("DB Error (Designation.getById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_Designation_AddEdit (btnSave_Click)
const saveOrUpdate = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const departmentCode = toInt(body.DepartmentCode);
    const designationName = (body.DesignationName || "").trim();

    if (departmentCode <= 0) return sendError(res, "Select the Department.....", 400);
    if (!designationName) return sendError(res, "Designation Name should not be empty", 400);

    const code = isEdit ? toInt(req.params.designationCode ?? body.DesignationCode) : null;
    if (isEdit && !code) return sendError(res, "Invalid DesignationCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    if (isEdit) {
      request.input("E_User", sql.Int, parseInt(userId));
      request.input("E_Node", sql.Int, parseInt(nodeCode));
      request.input("DesignationCode", sql.Int, code);
    } else {
      request.input("C_User", sql.Int, parseInt(userId));
      request.input("C_Node", sql.Int, parseInt(nodeCode));
    }
    request.input("DepartmentCode", sql.Int, departmentCode);
    request.input("DesignationName", sql.NVarChar, designationName);
    request.input("DesignationOrderNo", sql.Int, toInt(body.DesignationOrderNo));
    request.input("Status", sql.Int, toStatusBit(body.Status));

    await request.execute("sp_Designation_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (err.message && err.message.includes("UK_")) {
      return sendError(res, "Already exist the Designation Name", 409);
    }
    console.error("DB Error (saveOrUpdateDesignation):", err);
    return sendError(res, err);
  }
};

// POST /designation/create
export const create = (req, res) => saveOrUpdate(req, res, false);

// PUT  /designation/update/:designationCode
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /designation/delete/:designationCode  -> sp_Designation_Delete
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.designationCode);
    if (code <= 0) return sendError(res, "Invalid DesignationCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("DesignationCode", sql.Int, code)
      .execute("sp_Designation_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("FK_") || err.message.includes("REFERENCE"))) {
      return sendError(res, "This Designation is in use and cannot be deleted", 409);
    }
    console.error("DB Error (deleteDesignation):", err);
    return sendError(res, err);
  }
};
