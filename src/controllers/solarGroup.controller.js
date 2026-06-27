import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";
import { isDuplicateByGetAll } from "../utils/duplicateCheck.js";

// ---------------------------------------------------------------------------
// Solar & Wind Mill Group master (port of WinForms frmSolarGroup / frmSolarGroupDetails)
//   - List   : EXEC sp_SolarGroup_GetAll   @CompanyCode
//   - Create : EXEC sp_SolarGroup_AddEdit  (without @SolarGroupCode)
//   - Update : EXEC sp_SolarGroup_AddEdit  (with @SolarGroupCode)
//   - Delete : EXEC sp_SolarGroup_Delete   @SolarGroupCode
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

// GET /solar-group/lists  -> EXEC sp_SolarGroup_GetAll @CompanyCode
export const getSolarGroupList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const companyCode = parseInt(req.headers.companyCode);
    if (!companyCode) return sendError(res, "Missing company context", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_SolarGroup_GetAll");

    const data = result.recordset
      // Newest first (the SP doesn't guarantee order, so sort here).
      .sort((a, b) => b.SolarGroupCode - a.SolarGroupCode)
      .map((item) => ({
        ...item,
        id: item.SolarGroupCode,
        StatusText: STATUS_LABEL(item.Status),
      }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getSolarGroupList):", err);
    return sendError(res, err);
  }
};

// GET /solar-group/list/:solarGroupCode  -> single record
export const getSolarGroupById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const companyCode = parseInt(req.headers.companyCode);
    if (!companyCode) return sendError(res, "Missing company context", 400);

    const code = parseInt(req.params.solarGroupCode);
    if (!code) return sendError(res, "Invalid SolarGroupCode", 400);

    const pool = await getPool(req.headers.subdbname);
    // No single-row SP exists; filter the GetAll result so we don't guess the
    // physical table / column names.
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_SolarGroup_GetAll");
    const row = result.recordset.find((r) => r.SolarGroupCode === code);

    if (!row) return sendError(res, "Solar Group not found", 404);

    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getSolarGroupById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_SolarGroup_AddEdit (btnSave_Click)
const saveOrUpdateSolarGroup = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    const companyCode = parseInt(req.headers.companyCode);
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);
    if (!companyCode) return sendError(res, "Missing company context", 400);

    const body = req.body || {};
    const name = (body.SolarGroupName || "").trim();

    // Same validation the form enforces: name is mandatory.
    if (!name)
      return sendError(res, "Group Name should not be empty", 400);

    // Val() in VB returns 0 for blank / non-numeric input.
    const orderNo = parseInt(body.OrderNo) || 0;

    const code = isEdit
      ? parseInt(req.params.solarGroupCode ?? body.SolarGroupCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid SolarGroupCode for update", 400);

    const pool = await getPool(req.headers.subdbname);

    if (
      await isDuplicateByGetAll(pool, {
        proc: "sp_SolarGroup_GetAll",
        params: [{ name: "CompanyCode", type: sql.Int, value: companyCode }],
        nameField: "SolarGroupName",
        codeField: "SolarGroupCode",
        name,
        code,
      })
    )
      return sendError(res, "Already Exist this Group", 409);

    const request = pool.request();

    if (isEdit) request.input("SolarGroupCode", sql.Int, code);
    request.input("SolarGroupName", sql.NVarChar, name);
    request.input("OrderNo", sql.Int, orderNo);
    request.input("Status", sql.Bit, toStatusBit(body.Status));
    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    request.input("CompanyCode", sql.Int, companyCode);

    await request.execute("sp_SolarGroup_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "Record Updated Successfully" : "Record Saved Successfully",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_")) {
      return sendError(res, "Already Exist this Group", 409);
    }
    console.error("DB Error (saveOrUpdateSolarGroup):", err);
    return sendError(res, err);
  }
};

// POST /solar-group/create        -> create
export const createSolarGroup = (req, res) =>
  saveOrUpdateSolarGroup(req, res, false);

// PUT  /solar-group/update/:code  -> update
export const updateSolarGroup = (req, res) =>
  saveOrUpdateSolarGroup(req, res, true);

// DELETE /solar-group/delete/:solarGroupCode -> EXEC sp_SolarGroup_Delete
export const deleteSolarGroup = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.solarGroupCode);
    if (!code) return sendError(res, "Invalid SolarGroupCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();
    request.input("SolarGroupCode", sql.Int, code);

    await request.execute("sp_SolarGroup_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    // Still referenced elsewhere -> friendly 409 instead of a raw FK error.
    if (err.message && (err.message.includes("FK_") || err.message.includes("REFERENCE"))) {
      return sendError(res, "You cannot delete this Group !", 409);
    }
    console.error("DB Error (deleteSolarGroup):", err);
    return sendError(res, err);
  }
};
