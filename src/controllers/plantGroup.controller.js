import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";
import { isDuplicateByGetAll } from "../utils/duplicateCheck.js";

// ---------------------------------------------------------------------------
// Plant Group master (port of the WinForms frmPlantGroup / frmPlantGroupDetails)
//   - List   : EXEC sp_PlantGroup_GetAll   @CompanyCode
//   - Create : EXEC sp_PlantGroup_AddEdit  (without @PlantGroupCode)
//   - Update : EXEC sp_PlantGroup_AddEdit  (with @PlantGroupCode)
//   - Delete : EXEC sp_PlantGroup_Delete   @PlantGroupCode
// AddEdit requires @User / @Node (read from the auth token headers) and the
// GetAll / AddEdit procs are company-scoped via @CompanyCode (int_CompanyCode).
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

// Accepts true / 1 / "1" / "ACTIVE" as active, everything else inactive.
const toStatusBit = (status) => {
  if (status === true || status === 1 || status === "1") return 1;
  if (typeof status === "string" && status.trim().toUpperCase() === "ACTIVE")
    return 1;
  return 0;
};

// GET /plant-group/lists  -> EXEC sp_PlantGroup_GetAll @CompanyCode
export const getPlantGroupList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const companyCode = parseInt(req.headers.companyCode);
    if (!companyCode) return sendError(res, "Missing company context", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_PlantGroup_GetAll");

    const data = result.recordset
      // Newest first (the SP doesn't guarantee order, so sort here).
      .sort((a, b) => b.PlantGroupCode - a.PlantGroupCode)
      .map((item) => ({
        ...item,
        id: item.PlantGroupCode,
        StatusText: STATUS_LABEL(item.Status),
      }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getPlantGroupList):", err);
    return sendError(res, err);
  }
};

// GET /plant-group/list/:plantGroupCode  -> single record
export const getPlantGroupById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const companyCode = parseInt(req.headers.companyCode);
    if (!companyCode) return sendError(res, "Missing company context", 400);

    const code = parseInt(req.params.plantGroupCode);
    if (!code) return sendError(res, "Invalid PlantGroupCode", 400);

    const pool = await getPool(req.headers.subdbname);
    // No single-row SP exists; filter the GetAll result so we don't guess the
    // physical table / column names.
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_PlantGroup_GetAll");
    const row = result.recordset.find((r) => r.PlantGroupCode === code);

    if (!row) return sendError(res, "Plant Group not found", 404);

    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getPlantGroupById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_PlantGroup_AddEdit (btnSave_Click)
const saveOrUpdatePlantGroup = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    const companyCode = parseInt(req.headers.companyCode);
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);
    if (!companyCode) return sendError(res, "Missing company context", 400);

    const body = req.body || {};
    const name = (body.PlantGroupName || "").trim();

    // Same validation the form enforces: name is mandatory.
    if (!name)
      return sendError(res, "Plant Group Name should not be empty", 400);

    // Val() in VB returns 0 for blank / non-numeric input.
    const multipleFactor = Number(body.MultipleFactor) || 0;

    const code = isEdit
      ? parseInt(req.params.plantGroupCode ?? body.PlantGroupCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid PlantGroupCode for update", 400);

    const pool = await getPool(req.headers.subdbname);

    if (
      await isDuplicateByGetAll(pool, {
        proc: "sp_PlantGroup_GetAll",
        params: [{ name: "CompanyCode", type: sql.Int, value: companyCode }],
        nameField: "PlantGroupName",
        codeField: "PlantGroupCode",
        name,
        code,
      })
    )
      return sendError(res, "Plant Group already exists", 409);

    const request = pool.request();

    if (isEdit) request.input("PlantGroupCode", sql.Int, code);
    request.input("PlantGroupName", sql.NVarChar, name);
    request.input("MultipleFactor", sql.Decimal(18, 3), multipleFactor);
    request.input("CompanyCode", sql.Int, companyCode);
    request.input("Status", sql.Bit, toStatusBit(body.Status));
    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));

    await request.execute("sp_PlantGroup_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK")) {
      return sendError(res, "Already exist the Plant Group Name", 409);
    }
    console.error("DB Error (saveOrUpdatePlantGroup):", err);
    return sendError(res, err);
  }
};

// POST /plant-group/create        -> create
export const createPlantGroup = (req, res) =>
  saveOrUpdatePlantGroup(req, res, false);

// PUT  /plant-group/update/:code  -> update
export const updatePlantGroup = (req, res) =>
  saveOrUpdatePlantGroup(req, res, true);

// DELETE /plant-group/delete/:plantGroupCode -> EXEC sp_PlantGroup_Delete
export const deletePlantGroup = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.plantGroupCode);
    if (!code) return sendError(res, "Invalid PlantGroupCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();
    request.input("PlantGroupCode", sql.Int, code);

    await request.execute("sp_PlantGroup_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    // Still referenced elsewhere -> friendly 409 instead of a raw FK error.
    if (err.message && (err.message.includes("FK_") || err.message.includes("REFERENCE"))) {
      return sendError(
        res,
        "You cannot delete the Plant Group !",
        409
      );
    }
    console.error("DB Error (deletePlantGroup):", err);
    return sendError(res, err);
  }
};
