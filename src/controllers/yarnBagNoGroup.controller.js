import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Yarn Bag No Group master (port of the WinForms frmYarnBagNoGroup /
// frmYarnBagNoGroupDetails).
//   - List   : EXEC sp_YarnBagNoGroup_GetAll
//   - Create : EXEC sp_YarnBagNoGroup_AddEdit  (@User / @Node / @CompanyCode, no code)
//   - Update : EXEC sp_YarnBagNoGroup_AddEdit  (+ @YarnBagNoGroupCode)
//   - Delete : EXEC sp_YarnBagNoGroup_Delete
// NOTE: unlike the other masters, this proc does NOT use the @C_User/@E_User
// split — the VB form always passes @User, @Node and @CompanyCode and only adds
// @YarnBagNoGroupCode when editing (btnSave_Click). CompanyCode comes from the
// JWT (req.headers.companyCode, set by authMiddleware). Validates the name as
// mandatory and maps UK_YarnBagNoGroup_tbl_YarnBagNoGroup to a friendly 409.
// Status: ACTIVE -> 1, INACTIVE -> 0.
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

const toBit = (v) => {
  if (v === true || v === 1 || v === "1") return 1;
  if (typeof v === "string" && v.trim().toUpperCase() === "ACTIVE") return 1;
  return 0;
};

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};

// GET /yarn-bag-no-group/lists  -> mirrors frmYarnBagNoGroupDetails list
export const getYarnBagNoGroupList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_YarnBagNoGroup_GetAll");

    const data = (result.recordset || []).map((item) => ({
      ...item,
      id: item.YarnBagNoGroupCode,
      StatusText: STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getYarnBagNoGroupList):", err);
    return sendError(res, err);
  }
};

// GET /yarn-bag-no-group/list/:yarnBagNoGroupCode  -> single record (from GetAll)
export const getYarnBagNoGroupById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = toInt(req.params.yarnBagNoGroupCode);
    if (!code) return sendError(res, "Invalid YarnBagNoGroupCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_YarnBagNoGroup_GetAll");
    const row = (result.recordset || []).find(
      (r) => toInt(r.YarnBagNoGroupCode) === code
    );

    if (!row) return sendError(res, "Yarn Bag No Group not found", 404);
    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getYarnBagNoGroupById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_YarnBagNoGroup_AddEdit (btnSave_Click)
const saveOrUpdateYarnBagNoGroup = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const groupName = (body.YarnBagNoGroupName || "").trim();

    // Same validation the form enforces (btnSave_Click).
    if (!groupName)
      return sendError(res, "Yarn Bag No Group Name should not be empty", 400);

    const code = isEdit
      ? toInt(req.params.yarnBagNoGroupCode ?? body.YarnBagNoGroupCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid YarnBagNoGroupCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // This proc always takes @User/@Node/@CompanyCode; edit also sends the code.
    if (isEdit) request.input("YarnBagNoGroupCode", sql.Int, code);
    request.input("CompanyCode", sql.Int, toInt(req.headers.companyCode));
    request.input("YarnBagNoGroupName", sql.NVarChar, groupName);
    // Default to ACTIVE when Status is omitted (VB combo defaults to ACTIVE).
    request.input("Status", sql.Bit, body.Status === undefined ? 1 : toBit(body.Status));
    request.input("User", sql.Int, toInt(userId));
    request.input("Node", sql.Int, toInt(nodeCode));

    await request.execute("sp_YarnBagNoGroup_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique index -> friendly 409 (matches form behaviour).
    if (
      err.message &&
      err.message.includes("UK_YarnBagNoGroup_tbl_YarnBagNoGroup")
    ) {
      return sendError(res, "Already exist the YarnBagNoGroup Name", 409);
    }
    console.error("DB Error (saveOrUpdateYarnBagNoGroup):", err);
    return sendError(res, err);
  }
};

// POST /yarn-bag-no-group/create        -> create
export const createYarnBagNoGroup = (req, res) =>
  saveOrUpdateYarnBagNoGroup(req, res, false);

// PUT  /yarn-bag-no-group/update/:code  -> update
export const updateYarnBagNoGroup = (req, res) =>
  saveOrUpdateYarnBagNoGroup(req, res, true);

// DELETE /yarn-bag-no-group/delete/:yarnBagNoGroupCode -> EXEC sp_YarnBagNoGroup_Delete
export const deleteYarnBagNoGroup = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = toInt(req.params.yarnBagNoGroupCode);
    if (!code) return sendError(res, "Invalid YarnBagNoGroupCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("YarnBagNoGroupCode", sql.Int, code)
      .execute("sp_YarnBagNoGroup_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the YarnBagNoGroup!", 409);
    }
    console.error("DB Error (deleteYarnBagNoGroup):", err);
    return sendError(res, err);
  }
};
