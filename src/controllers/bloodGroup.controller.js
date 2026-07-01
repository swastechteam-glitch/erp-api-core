import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Blood Group master (port of the WinForms frmBloodGroup / frmBloodGroupDetails)
//
//   A global master: BloodGroup + Status.
//   Stored procs (kept identical to the desktop):
//     sp_BloodGroup_AddEdit  -> insert/update (create @C_User/@C_Node,
//                               edit @E_User/@E_Node + @BloodGroupCode)
//     sp_BloodGroup_Delete   -> delete (@BloodGroupCode)
//   List: Select * from tbl_BloodGroup.
//
//   The AddEdit SP needs user/node which we read from the auth token (headers).
//
//   Endpoints
//     GET    /lists                    tbl_BloodGroup
//     GET    /list/:bloodGroupCode     one record
//     POST   /create                   sp_BloodGroup_AddEdit (no code)
//     PUT    /update/:bloodGroupCode   sp_BloodGroup_AddEdit (with code)
//     DELETE /delete/:bloodGroupCode   sp_BloodGroup_Delete
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");
const toStatusBit = (status) => {
  if (status === true || status === 1 || status === "1") return 1;
  if (typeof status === "string" && status.trim().toUpperCase() === "ACTIVE") return 1;
  return 0;
};

// GET /blood-group/lists  -> tbl_BloodGroup
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .query("Select BloodGroupCode, BloodGroup, Status from tbl_BloodGroup order by BloodGroupCode desc");
    const data = result.recordset.map((item) => ({
      ...item,
      id: item.BloodGroupCode,
      Status: STATUS_LABEL(item.Status),
    }));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getBloodGroupList):", err);
    return sendError(res, err);
  }
};

// GET /blood-group/list/:bloodGroupCode  -> single record (edit screen)
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const bloodGroupCode = parseInt(req.params.bloodGroupCode);
    if (!bloodGroupCode) return sendError(res, "Invalid BloodGroupCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("BloodGroupCode", sql.Int, bloodGroupCode)
      .query("Select BloodGroupCode, BloodGroup, Status from tbl_BloodGroup where BloodGroupCode = @BloodGroupCode");

    if (!result.recordset.length) return sendError(res, "Blood Group not found", 404);
    const row = result.recordset[0];
    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getBloodGroupById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_BloodGroup_AddEdit (btnSave_Click)
const saveOrUpdate = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const bloodGroup = (body.BloodGroup || "").trim();
    if (!bloodGroup) return sendError(res, "Blood Group should not be empty", 400);

    const bloodGroupCode = isEdit
      ? parseInt(req.params.bloodGroupCode ?? body.BloodGroupCode)
      : null;
    if (isEdit && !bloodGroupCode)
      return sendError(res, "Invalid BloodGroupCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    if (isEdit) {
      request.input("E_User", sql.Int, parseInt(userId));
      request.input("E_Node", sql.Int, parseInt(nodeCode));
      request.input("BloodGroupCode", sql.Int, bloodGroupCode);
    } else {
      request.input("C_User", sql.Int, parseInt(userId));
      request.input("C_Node", sql.Int, parseInt(nodeCode));
    }
    request.input("BloodGroup", sql.NVarChar, bloodGroup);
    request.input("Status", sql.Int, toStatusBit(body.Status));

    await request.execute("sp_BloodGroup_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (err.message && err.message.includes("UK_")) {
      return sendError(res, "Already exist the BloodGroup", 409);
    }
    console.error("DB Error (saveOrUpdateBloodGroup):", err);
    return sendError(res, err);
  }
};

// POST /blood-group/create
export const create = (req, res) => saveOrUpdate(req, res, false);

// PUT  /blood-group/update/:bloodGroupCode
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /blood-group/delete/:bloodGroupCode  -> sp_BloodGroup_Delete
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const bloodGroupCode = parseInt(req.params.bloodGroupCode);
    if (!bloodGroupCode) return sendError(res, "Invalid BloodGroupCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("BloodGroupCode", sql.Int, bloodGroupCode)
      .execute("sp_BloodGroup_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("FK_") || err.message.includes("REFERENCE"))) {
      return sendError(res, "This Blood Group is in use and cannot be deleted", 409);
    }
    console.error("DB Error (deleteBloodGroup):", err);
    return sendError(res, err);
  }
};
