import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Hostel Type master (port of the WinForms frmHostelType / frmHostelTypeDetails)
//
//   A global master: Hostel Type Name + Status.
//   Stored procs (kept identical to the desktop):
//     sp_HostelType_AddEdit  -> insert/update (create @C_User/@C_Node,
//                               edit @E_User/@E_Node + @HostelTypeCode)
//     sp_HostelType_GetAll   -> list
//     sp_HostelType_Delete   -> delete (@HostelTypeCode)
//
//   The AddEdit SP needs user/node which we read from the auth token (headers).
//
//   Endpoints
//     GET    /lists                    sp_HostelType_GetAll
//     GET    /list/:hostelTypeCode     one record (from GetAll)
//     POST   /create                   sp_HostelType_AddEdit (no code)
//     PUT    /update/:hostelTypeCode   sp_HostelType_AddEdit (with code)
//     DELETE /delete/:hostelTypeCode   sp_HostelType_Delete
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

// GET /hostel-type/lists  -> sp_HostelType_GetAll
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool.request().execute("sp_HostelType_GetAll");
    const data = (r.recordset || []).map((row) => {
      const code = toInt(pick(row, "HostelTypeCode"));
      return {
        ...row,
        id: code,
        HostelTypeCode: code,
        HostelTypeName: pick(row, "HostelTypeName") ?? "",
        Status: STATUS_LABEL(toStatusBit(pick(row, "Status"))),
      };
    });
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (HostelType.getList):", err);
    return sendError(res, err);
  }
};

// GET /hostel-type/list/:hostelTypeCode  -> one record for the edit screen (from GetAll)
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.hostelTypeCode);
    if (code <= 0) return sendError(res, "Invalid HostelTypeCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const r = await pool.request().execute("sp_HostelType_GetAll");
    const row = (r.recordset || []).find((x) => toInt(pick(x, "HostelTypeCode")) === code);
    if (!row) return sendError(res, "Hostel Type not found", 404);

    return sendSuccess(res, {
      HostelTypeCode: code,
      HostelTypeName: pick(row, "HostelTypeName") ?? "",
      Status: toStatusBit(pick(row, "Status")),
    });
  } catch (err) {
    console.error("DB Error (HostelType.getById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_HostelType_AddEdit (btnSave_Click)
const saveOrUpdate = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const hostelTypeName = (body.HostelTypeName || "").trim();
    if (!hostelTypeName) return sendError(res, "Enter the Hostel Type", 400);

    const code = isEdit ? toInt(req.params.hostelTypeCode ?? body.HostelTypeCode) : null;
    if (isEdit && !code) return sendError(res, "Invalid HostelTypeCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    if (isEdit) {
      request.input("E_User", sql.Int, parseInt(userId));
      request.input("E_Node", sql.Int, parseInt(nodeCode));
      request.input("HostelTypeCode", sql.Int, code);
    } else {
      request.input("C_User", sql.Int, parseInt(userId));
      request.input("C_Node", sql.Int, parseInt(nodeCode));
    }
    request.input("HostelTypeName", sql.NVarChar, hostelTypeName);
    request.input("Status", sql.Int, toStatusBit(body.Status));

    await request.execute("sp_HostelType_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The Record is updated" : "The Record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (err.message && err.message.includes("UK_")) {
      return sendError(res, "Already exist the Hostel Type", 409);
    }
    console.error("DB Error (saveOrUpdateHostelType):", err);
    return sendError(res, err);
  }
};

// POST /hostel-type/create
export const create = (req, res) => saveOrUpdate(req, res, false);

// PUT  /hostel-type/update/:hostelTypeCode
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /hostel-type/delete/:hostelTypeCode  -> sp_HostelType_Delete
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.hostelTypeCode);
    if (code <= 0) return sendError(res, "Invalid HostelTypeCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("HostelTypeCode", sql.Int, code)
      .execute("sp_HostelType_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("FK_") || err.message.includes("REFERENCE"))) {
      return sendError(res, "This Hostel Type is in use and cannot be deleted", 409);
    }
    console.error("DB Error (deleteHostelType):", err);
    return sendError(res, err);
  }
};
