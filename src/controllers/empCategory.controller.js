import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Employee Category master (port of the WinForms frmEmpCategory / frmEmpCategoryDetails)
//
//   A global master: EmpCategoryName + Status.
//   Stored procs (kept identical to the desktop):
//     sp_EmpCategory_AddEdit  -> insert/update (create @C_User/@C_Node,
//                                edit @E_User/@E_Node + @EmpCategoryCode)
//     sp_EmpCategory_GetAll   -> list
//     sp_EmpCategory_Delete   -> delete (@EmpCategoryCode)
//
//   The AddEdit SP needs user/node which we read from the auth token (headers).
//
//   Endpoints
//     GET    /lists                     sp_EmpCategory_GetAll
//     GET    /list/:empCategoryCode     one record (from GetAll)
//     POST   /create                    sp_EmpCategory_AddEdit (no code)
//     PUT    /update/:empCategoryCode   sp_EmpCategory_AddEdit (with code)
//     DELETE /delete/:empCategoryCode   sp_EmpCategory_Delete
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

// GET /emp-category/lists  -> sp_EmpCategory_GetAll
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool.request().execute("sp_EmpCategory_GetAll");
    const data = (r.recordset || []).map((row) => {
      const code = toInt(pick(row, "EmpCategoryCode"));
      return {
        ...row,
        id: code,
        EmpCategoryCode: code,
        EmpCategoryName: pick(row, "EmpCategoryName") ?? "",
        Status: STATUS_LABEL(toStatusBit(pick(row, "Status"))),
      };
    });
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (EmpCategory.getList):", err);
    return sendError(res, err);
  }
};

// GET /emp-category/list/:empCategoryCode  -> one record for the edit screen (from GetAll)
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.empCategoryCode);
    if (code <= 0) return sendError(res, "Invalid EmpCategoryCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const r = await pool.request().execute("sp_EmpCategory_GetAll");
    const row = (r.recordset || []).find((x) => toInt(pick(x, "EmpCategoryCode")) === code);
    if (!row) return sendError(res, "Employee Category not found", 404);

    return sendSuccess(res, {
      EmpCategoryCode: code,
      EmpCategoryName: pick(row, "EmpCategoryName") ?? "",
      Status: toStatusBit(pick(row, "Status")),
    });
  } catch (err) {
    console.error("DB Error (EmpCategory.getById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_EmpCategory_AddEdit (btnSave_Click)
const saveOrUpdate = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const empCategoryName = (body.EmpCategoryName || "").trim();
    if (!empCategoryName) return sendError(res, "EmpCategory Name should not be empty", 400);

    const code = isEdit ? toInt(req.params.empCategoryCode ?? body.EmpCategoryCode) : null;
    if (isEdit && !code) return sendError(res, "Invalid EmpCategoryCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    if (isEdit) {
      request.input("E_User", sql.Int, parseInt(userId));
      request.input("E_Node", sql.Int, parseInt(nodeCode));
      request.input("EmpCategoryCode", sql.Int, code);
    } else {
      request.input("C_User", sql.Int, parseInt(userId));
      request.input("C_Node", sql.Int, parseInt(nodeCode));
    }
    request.input("EmpCategoryName", sql.NVarChar, empCategoryName);
    request.input("Status", sql.Int, toStatusBit(body.Status));

    await request.execute("sp_EmpCategory_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (err.message && err.message.includes("UK_")) {
      return sendError(res, "Already exist the EmpCategory Name", 409);
    }
    console.error("DB Error (saveOrUpdateEmpCategory):", err);
    return sendError(res, err);
  }
};

// POST /emp-category/create
export const create = (req, res) => saveOrUpdate(req, res, false);

// PUT  /emp-category/update/:empCategoryCode
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /emp-category/delete/:empCategoryCode  -> sp_EmpCategory_Delete
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.empCategoryCode);
    if (code <= 0) return sendError(res, "Invalid EmpCategoryCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("EmpCategoryCode", sql.Int, code)
      .execute("sp_EmpCategory_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("FK_") || err.message.includes("REFERENCE"))) {
      return sendError(res, "This Employee Category is in use and cannot be deleted", 409);
    }
    console.error("DB Error (deleteEmpCategory):", err);
    return sendError(res, err);
  }
};
