import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Work Load master (port of the WinForms frmWorkLoad / frmWorkLoadDetails)
//
//   A global master: Department -> Designation (dependent) + WorkLoad + OrderNo +
//   Status. NB: the record stores only DesignationCode — the Department dropdown
//   is purely a filter for the Designation list and is NOT saved (faithful to the
//   desktop: sp_WorkLoad_AddEdit receives @DesignationCode, never @DepartmentCode).
//
//   Stored procs (kept identical to the desktop):
//     sp_WorkLoad_AddEdit  -> insert/update (@User/@Node, edit adds @WorkLoadCode)
//     sp_WorkLoad_GetAll   -> list
//     sp_WorkLoad_Delete   -> delete (@WorkLoadCode)
//   Lookups: sp_Department_GetAll (DepartmentName_English),
//            tbl_Designation (filtered by DepartmentCode).
//
//   The AddEdit SP needs user/node which we read from the auth token (headers).
//
//   Endpoints
//     GET    /options                     departments (Department dropdown)
//     GET    /designations/:departmentCode designations for a department
//     GET    /lists                       sp_WorkLoad_GetAll
//     GET    /list/:workLoadCode          one record (from GetAll)
//     POST   /create                      sp_WorkLoad_AddEdit (no code)
//     PUT    /update/:workLoadCode        sp_WorkLoad_AddEdit (with code)
//     DELETE /delete/:workLoadCode        sp_WorkLoad_Delete
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

// GET /work-load/options  -> departments (cmbDepartment source)
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool.request().execute("sp_Department_GetAll");
    return sendSuccess(res, {
      departments: (r.recordset || []).map((x) => ({
        value: toInt(pick(x, "DepartmentCode")),
        label: pick(x, "DepartmentName_English", "DepartmentName") ?? "",
      })),
    });
  } catch (err) {
    console.error("DB Error (WorkLoad.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /work-load/designations/:departmentCode  -> designations for the chosen dept
export const getDesignations = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const departmentCode = toInt(req.params.departmentCode);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("DepartmentCode", sql.Int, departmentCode)
      .query("Select DesignationCode, DesignationName from tbl_Designation where DepartmentCode = @DepartmentCode order by DesignationName");
    return sendSuccess(
      res,
      (r.recordset || []).map((x) => ({
        value: toInt(x.DesignationCode),
        label: x.DesignationName ?? "",
      }))
    );
  } catch (err) {
    console.error("DB Error (WorkLoad.getDesignations):", err);
    return sendError(res, err);
  }
};

// GET /work-load/lists  -> sp_WorkLoad_GetAll
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool.request().execute("sp_WorkLoad_GetAll");
    const data = (r.recordset || []).map((row) => {
      const code = toInt(pick(row, "WorkLoadCode"));
      return {
        ...row,
        id: code,
        WorkLoadCode: code,
        DepartmentName: pick(row, "DepartmentName_English", "DepartmentName") ?? "",
        DesignationName: pick(row, "DesignationName") ?? "",
        WorkLoad: pick(row, "WorkLoad") ?? "",
        WorkLoadOrderNo: toInt(pick(row, "WorkLoadOrderNo")),
        Status: STATUS_LABEL(toStatusBit(pick(row, "Status"))),
      };
    });
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (WorkLoad.getList):", err);
    return sendError(res, err);
  }
};

// GET /work-load/list/:workLoadCode  -> one record for the edit screen (from GetAll)
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.workLoadCode);
    if (code <= 0) return sendError(res, "Invalid WorkLoadCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const r = await pool.request().execute("sp_WorkLoad_GetAll");
    const row = (r.recordset || []).find((x) => toInt(pick(x, "WorkLoadCode")) === code);
    if (!row) return sendError(res, "Work Load not found", 404);

    return sendSuccess(res, {
      WorkLoadCode: code,
      DepartmentCode: toInt(pick(row, "DepartmentCode")),
      DesignationCode: toInt(pick(row, "DesignationCode")),
      WorkLoad: pick(row, "WorkLoad") ?? "",
      WorkLoadOrderNo: toInt(pick(row, "WorkLoadOrderNo")),
      Status: toStatusBit(pick(row, "Status")),
    });
  } catch (err) {
    console.error("DB Error (WorkLoad.getById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_WorkLoad_AddEdit (pnlMainNew_Save_Click)
const saveOrUpdate = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const designationCode = toInt(body.DesignationCode);
    const workLoad = (body.WorkLoad || "").trim();

    // Same validation the form enforces (the desktop's "Select the State....." is
    // its own message text — kept verbatim).
    if (designationCode <= 0) return sendError(res, "Select the State.....", 400);
    if (!workLoad) return sendError(res, "WorkLoad Name should not be empty", 400);

    const code = isEdit ? toInt(req.params.workLoadCode ?? body.WorkLoadCode) : null;
    if (isEdit && !code) return sendError(res, "Invalid WorkLoadCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) request.input("WorkLoadCode", sql.Int, code);
    request.input("DesignationCode", sql.Int, designationCode);
    request.input("WorkLoad", sql.NVarChar, workLoad);
    request.input("WorkLoadOrderNo", sql.Int, toInt(body.WorkLoadOrderNo));
    request.input("Status", sql.Int, toStatusBit(body.Status));

    await request.execute("sp_WorkLoad_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (err.message && err.message.includes("UK_")) {
      return sendError(res, "Already exist the Work Load", 409);
    }
    console.error("DB Error (saveOrUpdateWorkLoad):", err);
    return sendError(res, err);
  }
};

// POST /work-load/create
export const create = (req, res) => saveOrUpdate(req, res, false);

// PUT  /work-load/update/:workLoadCode
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /work-load/delete/:workLoadCode  -> sp_WorkLoad_Delete
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.workLoadCode);
    if (code <= 0) return sendError(res, "Invalid WorkLoadCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("WorkLoadCode", sql.Int, code)
      .execute("sp_WorkLoad_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("FK_") || err.message.includes("REFERENCE"))) {
      return sendError(res, "You can not delete the WorkLoad !", 409);
    }
    console.error("DB Error (deleteWorkLoad):", err);
    return sendError(res, err);
  }
};
