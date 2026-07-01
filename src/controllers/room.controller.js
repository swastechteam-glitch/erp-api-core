import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Room master (port of the WinForms frmRoom / frmRoomDetails)
//
//   A global master: Hostel Type -> Room No + Capacity + Status.
//
//   Stored procs (kept identical to the desktop):
//     sp_Room_AddEdit -> insert/update (@User/@Node, edit adds @RoomCode)
//     sp_Room_GetAll  -> list
//     sp_Room_Delete  -> delete (@RoomCode)
//   Lookup: tbl_HostelType (HostelTypeName).
//
//   The AddEdit SP needs user/node which we read from the auth token (headers).
//
//   Endpoints
//     GET    /options              hostel types (Hostel Type dropdown)
//     GET    /lists                sp_Room_GetAll
//     GET    /list/:roomCode       one record (from GetAll)
//     POST   /create               sp_Room_AddEdit (no code)
//     PUT    /update/:roomCode     sp_Room_AddEdit (with code)
//     DELETE /delete/:roomCode     sp_Room_Delete
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

// GET /room/options  -> hostel types (cmbHostelType source)
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .query("Select HostelTypeName, HostelTypeCode from tbl_HostelType Order by HostelTypeName");
    return sendSuccess(res, {
      hostelTypes: (r.recordset || []).map((x) => ({
        value: toInt(pick(x, "HostelTypeCode")),
        label: pick(x, "HostelTypeName") ?? "",
      })),
    });
  } catch (err) {
    console.error("DB Error (Room.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /room/lists  -> sp_Room_GetAll
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool.request().execute("sp_Room_GetAll");
    const data = (r.recordset || []).map((row) => {
      const code = toInt(pick(row, "RoomCode"));
      return {
        ...row,
        id: code,
        RoomCode: code,
        HostelTypeName: pick(row, "HostelTypeName") ?? "",
        RoomNo: pick(row, "RoomNo") ?? "",
        Capacity: toInt(pick(row, "Capacity")),
        Status: STATUS_LABEL(toStatusBit(pick(row, "Status"))),
      };
    });
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (Room.getList):", err);
    return sendError(res, err);
  }
};

// GET /room/list/:roomCode  -> one record for the edit screen (from GetAll)
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.roomCode);
    if (code <= 0) return sendError(res, "Invalid RoomCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const r = await pool.request().execute("sp_Room_GetAll");
    const row = (r.recordset || []).find((x) => toInt(pick(x, "RoomCode")) === code);
    if (!row) return sendError(res, "Room not found", 404);

    return sendSuccess(res, {
      RoomCode: code,
      HostelTypeCode: toInt(pick(row, "HostelTypeCode")),
      RoomNo: pick(row, "RoomNo") ?? "",
      Capacity: toInt(pick(row, "Capacity")),
      Status: toStatusBit(pick(row, "Status")),
    });
  } catch (err) {
    console.error("DB Error (Room.getById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_Room_AddEdit (btnSave_Click)
const saveOrUpdate = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const hostelTypeCode = toInt(body.HostelTypeCode);
    const roomNo = (body.RoomNo || "").trim();
    const capacity = toInt(body.Capacity);

    // Same validation order/messages the form enforces.
    if (hostelTypeCode <= 0) return sendError(res, "Select the Hostel Type", 400);
    if (!roomNo) return sendError(res, "Enter the Room No", 400);
    if (capacity <= 0) return sendError(res, "Please adjust Room Capacity", 400);

    const code = isEdit ? toInt(req.params.roomCode ?? body.RoomCode) : null;
    if (isEdit && !code) return sendError(res, "Invalid RoomCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    if (isEdit) request.input("RoomCode", sql.Int, code);
    request.input("RoomNo", sql.NVarChar, roomNo);
    request.input("Capacity", sql.Int, capacity);
    request.input("HostelTypeCode", sql.Int, hostelTypeCode);
    request.input("Status", sql.Int, toStatusBit(body.Status));
    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));

    await request.execute("sp_Room_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The Record is updated" : "The Record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (err.message && err.message.includes("UK_")) {
      return sendError(res, "This Room already exists in this Hostel Type", 409);
    }
    console.error("DB Error (saveOrUpdateRoom):", err);
    return sendError(res, err);
  }
};

// POST /room/create
export const create = (req, res) => saveOrUpdate(req, res, false);

// PUT  /room/update/:roomCode
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /room/delete/:roomCode  -> sp_Room_Delete
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.roomCode);
    if (code <= 0) return sendError(res, "Invalid RoomCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool.request().input("RoomCode", sql.Int, code).execute("sp_Room_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("FK_") || err.message.includes("REFERENCE"))) {
      return sendError(res, "This Room already assigned to Data. Do not delete", 409);
    }
    console.error("DB Error (deleteRoom):", err);
    return sendError(res, err);
  }
};
