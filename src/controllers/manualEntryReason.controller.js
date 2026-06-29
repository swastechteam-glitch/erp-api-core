import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// (Attendance) Manual Entry Reason master
//   (port of the WinForms frmManualEntryReason / frmManualEntryReasonDetails)
//
//   A global master: ManualEntryReason (the reason text) + Status.
//   Stored procs (kept identical to the desktop):
//     sp_ManualEntryReason_AddEdit  -> insert/update (@User/@Node, edit adds @ManualEntryReasonCode)
//     sp_ManualEntryReason_GetAll   -> list
//     sp_ManualEntryReason_Delete   -> delete (@ManualEntryReasonCode)
//
//   The AddEdit SP needs user/node which we read from the auth token (headers);
//   both create and edit pass @User/@Node (faithful to the desktop).
//
//   Endpoints
//     GET    /lists                       sp_ManualEntryReason_GetAll
//     GET    /list/:code                  one reason (from GetAll)
//     POST   /create                      sp_ManualEntryReason_AddEdit (no code)
//     PUT    /update/:code                sp_ManualEntryReason_AddEdit (with code)
//     DELETE /delete/:code                sp_ManualEntryReason_Delete
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

// GET /manual-entry-reason/lists  -> sp_ManualEntryReason_GetAll
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool.request().execute("sp_ManualEntryReason_GetAll");
    const data = (r.recordset || []).map((row) => {
      const code = toInt(pick(row, "ManualEntryReasonCode"));
      return {
        ...row,
        id: code,
        ManualEntryReasonCode: code,
        ManualEntryReason: pick(row, "ManualEntryReason") ?? "",
        Status: STATUS_LABEL(toStatusBit(pick(row, "Status"))),
      };
    });
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (ManualEntryReason.getList):", err);
    return sendError(res, err);
  }
};

// GET /manual-entry-reason/list/:code  -> one record for the edit screen.
// Derived from sp_ManualEntryReason_GetAll (the desktop edits off that grid row).
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (code <= 0) return sendError(res, "Invalid ManualEntryReasonCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const r = await pool.request().execute("sp_ManualEntryReason_GetAll");
    const row = (r.recordset || []).find((x) => toInt(pick(x, "ManualEntryReasonCode")) === code);
    if (!row) return sendError(res, "Manual Entry Reason not found", 404);

    return sendSuccess(res, {
      ManualEntryReasonCode: code,
      ManualEntryReason: pick(row, "ManualEntryReason") ?? "",
      Status: toStatusBit(pick(row, "Status")),
    });
  } catch (err) {
    console.error("DB Error (ManualEntryReason.getById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_ManualEntryReason_AddEdit (btnSave_Click)
const saveOrUpdate = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const reason = (body.ManualEntryReason || "").trim();
    if (!reason) return sendError(res, "Enter the Reason", 400);

    const code = isEdit ? toInt(req.params.code ?? body.ManualEntryReasonCode) : null;
    if (isEdit && !code)
      return sendError(res, "Invalid ManualEntryReasonCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) request.input("ManualEntryReasonCode", sql.Int, code);
    request.input("ManualEntryReason", sql.NVarChar, reason);
    request.input("Status", sql.Int, toStatusBit(body.Status));

    await request.execute("sp_ManualEntryReason_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The Record is updated" : "The Record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint -> friendly 409 (matches the desktop message).
    if (err.message && err.message.includes("UK_")) {
      return sendError(res, "Already exists this Reason", 409);
    }
    console.error("DB Error (saveOrUpdateManualEntryReason):", err);
    return sendError(res, err);
  }
};

// POST /manual-entry-reason/create
export const create = (req, res) => saveOrUpdate(req, res, false);

// PUT  /manual-entry-reason/update/:code
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /manual-entry-reason/delete/:code  -> sp_ManualEntryReason_Delete
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (code <= 0) return sendError(res, "Invalid ManualEntryReasonCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("ManualEntryReasonCode", sql.Int, code)
      .execute("sp_ManualEntryReason_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("FK_") || err.message.includes("REFERENCE"))) {
      return sendError(res, "This Manual Entry Reason is in use and cannot be deleted", 409);
    }
    console.error("DB Error (deleteManualEntryReason):", err);
    return sendError(res, err);
  }
};
