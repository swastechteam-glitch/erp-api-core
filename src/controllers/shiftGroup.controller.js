import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Shift Group master (port of the WinForms frmShiftGroup / frmShiftGroupDetails)
//
//   A company-scoped master: Shift Group Name + Rotation Group flag + Status.
//   Stored procs (kept identical to the desktop):
//     sp_ShiftGroup_AddEdit  -> insert/update (create @C_User/@C_Node,
//                               edit @E_User/@E_Node + @ShiftGroupCode;
//                               always @Rotation, @ShiftGroupName, @CompanyCode, @Status)
//     sp_ShiftGroup_GetAll   -> list (@CompanyCode)
//     sp_ShiftGroup_Delete   -> delete (@ShiftGroupCode, @CompanyCode)
//
//   user/node read from the auth token; company from req.headers.companyCode.
//
//   Endpoints
//     GET    /lists                     sp_ShiftGroup_GetAll
//     GET    /list/:shiftGroupCode      one record (from GetAll)
//     POST   /create                    sp_ShiftGroup_AddEdit (no code)
//     PUT    /update/:shiftGroupCode    sp_ShiftGroup_AddEdit (with code)
//     DELETE /delete/:shiftGroupCode    sp_ShiftGroup_Delete
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");
const toBit = (v) => {
  if (v === true || v === 1 || v === "1") return 1;
  if (typeof v === "string" && ["active", "y", "yes", "true"].includes(v.trim().toLowerCase())) return 1;
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

// GET /shift-group/lists  -> sp_ShiftGroup_GetAll @CompanyCode
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool.request().input("CompanyCode", sql.Int, cc).execute("sp_ShiftGroup_GetAll");
    const data = (r.recordset || []).map((row) => {
      const code = toInt(pick(row, "ShiftGroupCode"));
      return {
        ...row,
        id: code,
        ShiftGroupCode: code,
        ShiftGroupName: pick(row, "ShiftGroupName") ?? "",
        Rotation: toBit(pick(row, "Rotation")) ? "Yes" : "No",
        Status: STATUS_LABEL(toBit(pick(row, "Status"))),
      };
    });
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (ShiftGroup.getList):", err);
    return sendError(res, err);
  }
};

// GET /shift-group/list/:shiftGroupCode  -> one record for the edit screen (from GetAll)
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const code = toInt(req.params.shiftGroupCode);
    if (code <= 0) return sendError(res, "Invalid ShiftGroupCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const r = await pool.request().input("CompanyCode", sql.Int, cc).execute("sp_ShiftGroup_GetAll");
    const row = (r.recordset || []).find((x) => toInt(pick(x, "ShiftGroupCode")) === code);
    if (!row) return sendError(res, "Shift Group not found", 404);

    return sendSuccess(res, {
      ShiftGroupCode: code,
      ShiftGroupName: pick(row, "ShiftGroupName") ?? "",
      Rotation: toBit(pick(row, "Rotation")),
      Status: toBit(pick(row, "Status")),
    });
  } catch (err) {
    console.error("DB Error (ShiftGroup.getById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_ShiftGroup_AddEdit (btnSave_Click)
const saveOrUpdate = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const companyCode = getCompanyCode(req);
    if (companyCode <= 0)
      return sendError(res, "You are logged in to a group of companies; switch to a single company.", 400);

    const body = req.body || {};
    const shiftGroupName = (body.ShiftGroupName || "").trim();
    if (!shiftGroupName) return sendError(res, "ShiftGroup Name should not be empty", 400);

    const code = isEdit ? toInt(req.params.shiftGroupCode ?? body.ShiftGroupCode) : null;
    if (isEdit && !code) return sendError(res, "Invalid ShiftGroupCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    if (isEdit) {
      request.input("E_User", sql.Int, parseInt(userId));
      request.input("E_Node", sql.Int, parseInt(nodeCode));
      request.input("ShiftGroupCode", sql.Int, code);
    } else {
      request.input("C_User", sql.Int, parseInt(userId));
      request.input("C_Node", sql.Int, parseInt(nodeCode));
    }
    request.input("Rotation", sql.Bit, toBit(body.Rotation));
    request.input("ShiftGroupName", sql.NVarChar, shiftGroupName);
    request.input("CompanyCode", sql.Int, companyCode);
    request.input("Status", sql.Int, toBit(body.Status));

    await request.execute("sp_ShiftGroup_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (err.message && err.message.includes("UK_")) {
      return sendError(res, "Already exist the ShiftGroup Name", 409);
    }
    console.error("DB Error (saveOrUpdateShiftGroup):", err);
    return sendError(res, err);
  }
};

// POST /shift-group/create
export const create = (req, res) => saveOrUpdate(req, res, false);

// PUT  /shift-group/update/:shiftGroupCode
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /shift-group/delete/:shiftGroupCode  -> sp_ShiftGroup_Delete
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const code = toInt(req.params.shiftGroupCode);
    if (code <= 0) return sendError(res, "Invalid ShiftGroupCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("ShiftGroupCode", sql.Int, code)
      .input("CompanyCode", sql.Int, cc)
      .execute("sp_ShiftGroup_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("FK_") || err.message.includes("REFERENCE"))) {
      return sendError(res, "This Shift Group is in use and cannot be deleted", 409);
    }
    console.error("DB Error (deleteShiftGroup):", err);
    return sendError(res, err);
  }
};
