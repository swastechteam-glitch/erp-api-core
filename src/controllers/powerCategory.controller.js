import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";
import { isDuplicateByGetAll } from "../utils/duplicateCheck.js";

// ---------------------------------------------------------------------------
// Power Category master (port of WinForms frmPowerCategory / frmpowerCategoryDetails)
//   - List   : EXEC sp_PowerCategory_GetAll   @CompanyCode
//   - Create : EXEC sp_PowerCategory_AddEdit  (without @PowerCategoryCode)
//   - Update : EXEC sp_PowerCategory_AddEdit  (with @PowerCategoryCode)
//   - Delete : EXEC sp_PowerCategory_Delete   @PowerCategoryCode
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

// GET /power-category/lists  -> EXEC sp_PowerCategory_GetAll @CompanyCode
export const getPowerCategoryList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const companyCode = parseInt(req.headers.companyCode);
    if (!companyCode) return sendError(res, "Missing company context", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_PowerCategory_GetAll");

    const data = result.recordset
      // Newest first (the SP doesn't guarantee order, so sort here).
      .sort((a, b) => b.PowerCategoryCode - a.PowerCategoryCode)
      .map((item) => ({
        ...item,
        id: item.PowerCategoryCode,
        StatusText: STATUS_LABEL(item.Status),
      }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getPowerCategoryList):", err);
    return sendError(res, err);
  }
};

// GET /power-category/list/:powerCategoryCode  -> single record
export const getPowerCategoryById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const companyCode = parseInt(req.headers.companyCode);
    if (!companyCode) return sendError(res, "Missing company context", 400);

    const code = parseInt(req.params.powerCategoryCode);
    if (!code) return sendError(res, "Invalid PowerCategoryCode", 400);

    const pool = await getPool(req.headers.subdbname);
    // No single-row SP exists; filter the GetAll result.
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_PowerCategory_GetAll");
    const row = result.recordset.find((r) => r.PowerCategoryCode === code);

    if (!row) return sendError(res, "Power Category not found", 404);

    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getPowerCategoryById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_PowerCategory_AddEdit (btnSave_Click)
const saveOrUpdatePowerCategory = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    const companyCode = parseInt(req.headers.companyCode);
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);
    if (!companyCode) return sendError(res, "Missing company context", 400);

    const body = req.body || {};
    const name = (body.PowerCategoryName || "").trim();

    // Same validation the form enforces: name is mandatory.
    if (!name)
      return sendError(res, "PowerCategory Name should not be empty", 400);

    const description = (body.Description || "").trim();
    const multipleFactor = Number(body.MultipleFactor) || 0;

    const code = isEdit
      ? parseInt(req.params.powerCategoryCode ?? body.PowerCategoryCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid PowerCategoryCode for update", 400);

    const pool = await getPool(req.headers.subdbname);

    if (
      await isDuplicateByGetAll(pool, {
        proc: "sp_PowerCategory_GetAll",
        params: [{ name: "CompanyCode", type: sql.Int, value: companyCode }],
        nameField: "PowerCategoryName",
        codeField: "PowerCategoryCode",
        name,
        code,
      })
    )
      return sendError(res, "Already exist the PowerCategory Name", 409);

    const request = pool.request();

    if (isEdit) request.input("PowerCategoryCode", sql.Int, code);
    request.input("PowerCategoryName", sql.NVarChar, name);
    request.input("MultipleFactor", sql.Decimal(18, 3), multipleFactor);
    request.input("Description", sql.NVarChar, description);
    request.input("Status", sql.Bit, toStatusBit(body.Status));
    request.input("CompanyCode", sql.Int, companyCode);
    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));

    await request.execute("sp_PowerCategory_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_PowerCategoryName")) {
      return sendError(res, "Already exist the PowerCategory Name", 409);
    }
    console.error("DB Error (saveOrUpdatePowerCategory):", err);
    return sendError(res, err);
  }
};

// POST /power-category/create        -> create
export const createPowerCategory = (req, res) =>
  saveOrUpdatePowerCategory(req, res, false);

// PUT  /power-category/update/:code  -> update
export const updatePowerCategory = (req, res) =>
  saveOrUpdatePowerCategory(req, res, true);

// DELETE /power-category/delete/:powerCategoryCode -> EXEC sp_PowerCategory_Delete
export const deletePowerCategory = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.powerCategoryCode);
    if (!code) return sendError(res, "Invalid PowerCategoryCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();
    request.input("PowerCategoryCode", sql.Int, code);

    await request.execute("sp_PowerCategory_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("FK_") || err.message.includes("REFERENCE"))) {
      return sendError(res, "You cannot delete the Power Category!", 409);
    }
    console.error("DB Error (deletePowerCategory):", err);
    return sendError(res, err);
  }
};
