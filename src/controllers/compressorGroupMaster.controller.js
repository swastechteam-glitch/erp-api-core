import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";
import { isDuplicateByGetAll } from "../utils/duplicateCheck.js";

// ---------------------------------------------------------------------------
// Compressor Group master (port of WinForms frmCompressorGroupMaster / Details)
//   - List   : EXEC sp_CompressorGroupMaster_GetAll   @CompanyCode
//   - Create : EXEC sp_CompressorGroupMaster_AddEdit  (without @CompressorGroupMasterCode)
//   - Update : EXEC sp_CompressorGroupMaster_AddEdit  (with @CompressorGroupMasterCode)
//   - Delete : EXEC sp_CompressorGroupMaster_Delete   @CompressorGroupMasterCode
// AddEdit requires @User / @Node (auth token headers); GetAll / AddEdit are
// company-scoped via @CompanyCode (int_CompanyCode).
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

// Accepts true / 1 / "1" / "ACTIVE" as active, everything else inactive.
const toStatusBit = (status) => {
  if (status === true || status === 1 || status === "1") return 1;
  if (typeof status === "string" && status.trim().toUpperCase() === "ACTIVE")
    return 1;
  return 0;
};

// GET /compressor-group-master/lists  -> EXEC sp_CompressorGroupMaster_GetAll @CompanyCode
export const getCompressorGroupMasterList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const companyCode = parseInt(req.headers.companyCode);
    if (!companyCode) return sendError(res, "Missing company context", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_CompressorGroupMaster_GetAll");

    const data = result.recordset
      // Newest first (the SP doesn't guarantee order, so sort here).
      .sort((a, b) => b.CompressorGroupMasterCode - a.CompressorGroupMasterCode)
      .map((item) => ({
        ...item,
        id: item.CompressorGroupMasterCode,
        StatusText: STATUS_LABEL(item.Status),
      }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getCompressorGroupMasterList):", err);
    return sendError(res, err);
  }
};

// GET /compressor-group-master/list/:compressorGroupMasterCode  -> single record
export const getCompressorGroupMasterById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const companyCode = parseInt(req.headers.companyCode);
    if (!companyCode) return sendError(res, "Missing company context", 400);

    const code = parseInt(req.params.compressorGroupMasterCode);
    if (!code) return sendError(res, "Invalid CompressorGroupMasterCode", 400);

    const pool = await getPool(req.headers.subdbname);
    // No single-row SP exists; filter the GetAll result.
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_CompressorGroupMaster_GetAll");
    const row = result.recordset.find(
      (r) => r.CompressorGroupMasterCode === code
    );

    if (!row) return sendError(res, "Compressor Group Master not found", 404);

    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getCompressorGroupMasterById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_CompressorGroupMaster_AddEdit (btnSave_Click)
const saveOrUpdateCompressorGroupMaster = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    const companyCode = parseInt(req.headers.companyCode);
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);
    if (!companyCode) return sendError(res, "Missing company context", 400);

    const body = req.body || {};
    const name = (body.CompressorGroupMasterName || "").trim();

    // Same validation the form enforces: name is mandatory.
    if (!name)
      return sendError(res, "CompressorGroupMaster Name should not be empty", 400);

    const description = (body.Description || "").trim();

    const code = isEdit
      ? parseInt(req.params.compressorGroupMasterCode ?? body.CompressorGroupMasterCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid CompressorGroupMasterCode for update", 400);

    const pool = await getPool(req.headers.subdbname);

    if (
      await isDuplicateByGetAll(pool, {
        proc: "sp_CompressorGroupMaster_GetAll",
        params: [{ name: "CompanyCode", type: sql.Int, value: companyCode }],
        nameField: "CompressorGroupMasterName",
        codeField: "CompressorGroupMasterCode",
        name,
        code,
      })
    )
      return sendError(res, "Already exist the CompressorGroupMaster Name", 409);

    const request = pool.request();

    if (isEdit)
      request.input("CompressorGroupMasterCode", sql.Int, code);
    request.input("CompressorGroupMasterName", sql.NVarChar, name);
    request.input("Description", sql.NVarChar, description);
    request.input("Status", sql.Bit, toStatusBit(body.Status));
    request.input("CompanyCode", sql.Int, companyCode);
    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));

    await request.execute("sp_CompressorGroupMaster_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_CompressorGroupMasterName")) {
      return sendError(res, "Already exist the CompressorGroupMaster Name", 409);
    }
    console.error("DB Error (saveOrUpdateCompressorGroupMaster):", err);
    return sendError(res, err);
  }
};

// POST /compressor-group-master/create        -> create
export const createCompressorGroupMaster = (req, res) =>
  saveOrUpdateCompressorGroupMaster(req, res, false);

// PUT  /compressor-group-master/update/:code  -> update
export const updateCompressorGroupMaster = (req, res) =>
  saveOrUpdateCompressorGroupMaster(req, res, true);

// DELETE /compressor-group-master/delete/:compressorGroupMasterCode
export const deleteCompressorGroupMaster = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.compressorGroupMasterCode);
    if (!code) return sendError(res, "Invalid CompressorGroupMasterCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();
    request.input("CompressorGroupMasterCode", sql.Int, code);

    await request.execute("sp_CompressorGroupMaster_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("FK_") || err.message.includes("REFERENCE"))) {
      return sendError(res, "You cannot delete the Compressor Group Master!", 409);
    }
    console.error("DB Error (deleteCompressorGroupMaster):", err);
    return sendError(res, err);
  }
};
