import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";
import { isDuplicateByGetAll } from "../utils/duplicateCheck.js";

// ---------------------------------------------------------------------------
// Machine Type master (port of the WinForms frmMachineType)
//   - List   : EXEC sp_MachineType_GetAll
//   - Create : EXEC sp_MachineType_AddEdit  (without @MachineTypeCode)
//   - Update : EXEC sp_MachineType_AddEdit  (with @MachineTypeCode)
//   - Delete : EXEC sp_MachineType_Delete
// AddEdit requires @User / @Node which we read from the auth token (headers).
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

const toBit = (v) => {
  if (v === true || v === 1 || v === "1") return 1;
  if (typeof v === "string" && v.trim().toUpperCase() === "ACTIVE") return 1;
  return 0;
};

// GET /machine-type/lists  -> EXEC sp_MachineType_GetAll
export const getMachineTypeList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_MachineType_GetAll");

    const data = result.recordset
      // Newest first (the SP doesn't guarantee order, so sort here).
      .sort((a, b) => b.MachineTypeCode - a.MachineTypeCode)
      .map((item) => ({
        ...item,
        id: item.MachineTypeCode,
        StatusText: STATUS_LABEL(item.Status),
      }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getMachineTypeList):", err);
    return sendError(res, err);
  }
};

// GET /machine-type/list/:machineTypeCode  -> single record (filtered from GetAll)
export const getMachineTypeById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.machineTypeCode);
    if (!code) return sendError(res, "Invalid MachineTypeCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_MachineType_GetAll");
    const row = result.recordset.find((r) => r.MachineTypeCode === code);

    if (!row) return sendError(res, "Machine Type not found", 404);

    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getMachineTypeById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_MachineType_AddEdit (btnSave_Click)
const saveOrUpdateMachineType = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const name = (body.MachineTypeName || "").trim();

    // Same validation the form enforces: name is mandatory.
    if (!name)
      return sendError(res, "Machine Type should not be empty", 400);

    const code = isEdit
      ? parseInt(req.params.machineTypeCode ?? body.MachineTypeCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid MachineTypeCode for update", 400);

    const pool = await getPool(req.headers.subdbname);

    if (
      await isDuplicateByGetAll(pool, {
        proc: "sp_MachineType_GetAll",
        nameField: "MachineTypeName",
        codeField: "MachineTypeCode",
        name,
        code: isEdit ? code : null,
      })
    )
      return sendError(res, "Machine Type already exists", 409);

    const request = pool.request();

    if (isEdit) request.input("MachineTypeCode", sql.Int, code);
    request.input("MachineTypeName", sql.NVarChar, name);
    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    request.input("Status", sql.Bit, toBit(body.Status));

    await request.execute("sp_MachineType_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_MachineType_tblMachineType")) {
      return sendError(res, "Already exist the MachineType", 409);
    }
    console.error("DB Error (saveOrUpdateMachineType):", err);
    return sendError(res, err);
  }
};

// POST /machine-type/create        -> create
export const createMachineType = (req, res) =>
  saveOrUpdateMachineType(req, res, false);

// PUT  /machine-type/update/:code  -> update
export const updateMachineType = (req, res) =>
  saveOrUpdateMachineType(req, res, true);

// DELETE /machine-type/delete/:machineTypeCode -> EXEC sp_MachineType_Delete
export const deleteMachineType = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.machineTypeCode);
    if (!code) return sendError(res, "Invalid MachineTypeCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("MachineTypeCode", sql.Int, code)
      .execute("sp_MachineType_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    // Still referenced elsewhere -> friendly 409 instead of a raw FK error.
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the MachineType!", 409);
    }
    console.error("DB Error (deleteMachineType):", err);
    return sendError(res, err);
  }
};
