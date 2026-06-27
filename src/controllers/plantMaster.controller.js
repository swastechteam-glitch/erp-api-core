import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";
import { isDuplicateByGetAll } from "../utils/duplicateCheck.js";

// ---------------------------------------------------------------------------
// Plant master (port of WinForms frmPlantMaster / frmPlantMasterDetails)
//   - List   : EXEC sp_PlantMaster_GetAll   @CompanyCode
//   - Create : EXEC sp_PlantMaster_AddEdit  (without @PlantCode)
//   - Update : EXEC sp_PlantMaster_AddEdit  (with @PlantCode)
//   - Delete : EXEC sp_PlantMaster_Delete   @PlantCode
// AddEdit requires @User / @Node (auth token headers) and is company-scoped via
// @CompanyCode. Each plant belongs to a Plant Group (@PlantGroupCode).
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

// Accepts true / 1 / "1" / "ACTIVE" as active, everything else inactive.
const toStatusBit = (status) => {
  if (status === true || status === 1 || status === "1") return 1;
  if (typeof status === "string" && status.trim().toUpperCase() === "ACTIVE")
    return 1;
  return 0;
};

// GET /plant-master/lists  -> EXEC sp_PlantMaster_GetAll @CompanyCode
export const getPlantMasterList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const companyCode = parseInt(req.headers.companyCode);
    if (!companyCode) return sendError(res, "Missing company context", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_PlantMaster_GetAll");

    const data = result.recordset
      // Newest first (the SP doesn't guarantee order, so sort here).
      .sort((a, b) => b.PlantCode - a.PlantCode)
      .map((item) => ({
        ...item,
        id: item.PlantCode,
        StatusText: STATUS_LABEL(item.Status),
      }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getPlantMasterList):", err);
    return sendError(res, err);
  }
};

// GET /plant-master/list/:plantCode  -> single record
export const getPlantMasterById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const companyCode = parseInt(req.headers.companyCode);
    if (!companyCode) return sendError(res, "Missing company context", 400);

    const code = parseInt(req.params.plantCode);
    if (!code) return sendError(res, "Invalid PlantCode", 400);

    const pool = await getPool(req.headers.subdbname);
    // No single-row SP exists; filter the GetAll result.
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_PlantMaster_GetAll");
    const row = result.recordset.find((r) => r.PlantCode === code);

    if (!row) return sendError(res, "Plant not found", 404);

    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getPlantMasterById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_PlantMaster_AddEdit (btnSave_Click)
const saveOrUpdatePlantMaster = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    const companyCode = parseInt(req.headers.companyCode);
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);
    if (!companyCode) return sendError(res, "Missing company context", 400);

    const body = req.body || {};
    const plantGroupCode = parseInt(body.PlantGroupCode) || 0;
    const name = (body.PlantName || "").trim();

    // Same validation the form enforces: group + name are mandatory.
    if (plantGroupCode <= 0)
      return sendError(res, "Select the Plant Group Name", 400);
    if (!name)
      return sendError(res, "Plant Name should not be empty", 400);

    const description = (body.Description || "").trim();
    const orderNo = parseInt(body.OrderNo) || 0;

    const code = isEdit
      ? parseInt(req.params.plantCode ?? body.PlantCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid PlantCode for update", 400);

    const pool = await getPool(req.headers.subdbname);

    if (
      await isDuplicateByGetAll(pool, {
        proc: "sp_PlantMaster_GetAll",
        params: [{ name: "CompanyCode", type: sql.Int, value: companyCode }],
        nameField: "PlantName",
        codeField: "PlantCode",
        name,
        code,
      })
    )
      return sendError(res, "Already exist the Plant Name", 409);

    const request = pool.request();

    if (isEdit) request.input("PlantCode", sql.Int, code);
    request.input("PlantName", sql.NVarChar, name);
    request.input("Description", sql.NVarChar, description);
    request.input("OrderNo", sql.Int, orderNo);
    request.input("PlantGroupCode", sql.Int, plantGroupCode);
    request.input("Status", sql.Bit, toStatusBit(body.Status));
    request.input("CompanyCode", sql.Int, companyCode);
    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));

    await request.execute("sp_PlantMaster_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_PlantName")) {
      return sendError(res, "Already exist the Plant Name", 409);
    }
    console.error("DB Error (saveOrUpdatePlantMaster):", err);
    return sendError(res, err);
  }
};

// POST /plant-master/create        -> create
export const createPlantMaster = (req, res) =>
  saveOrUpdatePlantMaster(req, res, false);

// PUT  /plant-master/update/:code  -> update
export const updatePlantMaster = (req, res) =>
  saveOrUpdatePlantMaster(req, res, true);

// DELETE /plant-master/delete/:plantCode -> EXEC sp_PlantMaster_Delete
export const deletePlantMaster = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.plantCode);
    if (!code) return sendError(res, "Invalid PlantCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();
    request.input("PlantCode", sql.Int, code);

    await request.execute("sp_PlantMaster_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("FK_") || err.message.includes("REFERENCE"))) {
      return sendError(res, "You cannot delete the Plant!", 409);
    }
    console.error("DB Error (deletePlantMaster):", err);
    return sendError(res, err);
  }
};
