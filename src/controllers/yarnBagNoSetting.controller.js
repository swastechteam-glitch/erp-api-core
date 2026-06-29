import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Yarn Bag No Setting master (port of the WinForms frmYarnBagNo_Setting /
// frmYarnBagNo_SettingDetails).
//   - List   : EXEC sp_YarnBagNo_Setting_GetAll  @FYCode
//   - Create : EXEC sp_YarnBagNo_Setting_AddEdit (@User/@Node/@CompanyCode/
//              @YarnBagNoGroupCode/@Start_Number/@End_Number/@FYCode/@Status)
//   - Update : same proc + @YarnBagNo_SettingCode
//   - Delete : EXEC sp_YarnBagNo_Setting_Delete
// The VB form (btnSave_Click) requires a Yarn Bag No Group and Starting Number,
// and allocates bag-number ranges SEQUENTIALLY per financial year: the Starting
// Number is forced to max(End_Number)+1 once any range exists for the FY (the
// field is disabled in the form). We enforce that here server-side so ranges
// can't overlap. CompanyCode + FYCode come from the JWT (req.headers, set by
// authMiddleware). Status: ACTIVE -> 1, INACTIVE -> 0.
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

// GET /yarn-bag-no-setting/lists  -> mirrors frmYarnBagNo_SettingDetails list
export const getYarnBagNoSettingList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("FYCode", sql.Int, toInt(req.headers.FYCode))
      .execute("sp_YarnBagNo_Setting_GetAll");

    const data = (result.recordset || []).map((item) => ({
      ...item,
      id: item.YarnBagNo_SettingCode,
      StatusText: STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getYarnBagNoSettingList):", err);
    return sendError(res, err);
  }
};

// GET /yarn-bag-no-setting/list/:code  -> single record (filtered from GetAll)
export const getYarnBagNoSettingById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = toInt(req.params.yarnBagNoSettingCode);
    if (!code) return sendError(res, "Invalid YarnBagNo_SettingCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("FYCode", sql.Int, toInt(req.headers.FYCode))
      .execute("sp_YarnBagNo_Setting_GetAll");
    const row = (result.recordset || []).find(
      (r) => toInt(r.YarnBagNo_SettingCode) === code
    );

    if (!row) return sendError(res, "Yarn Bag No Setting not found", 404);
    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getYarnBagNoSettingById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_YarnBagNo_Setting_AddEdit (btnSave_Click)
const saveOrUpdateYarnBagNoSetting = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const fyCode = toInt(req.headers.FYCode);
    if (!fyCode) return sendError(res, "Missing financial year (FYCode)", 400);

    const body = req.body || {};
    const groupCode = toInt(body.YarnBagNoGroupCode);
    let startNumber = toInt(body.Start_Number);
    const endNumber = toInt(body.End_Number);

    // Same validation the form enforces (btnSave_Click).
    if (!groupCode)
      return sendError(res, "Yarn Bag No Group Name should not be empty", 400);

    const code = isEdit
      ? toInt(req.params.yarnBagNoSettingCode ?? body.YarnBagNo_SettingCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid YarnBagNo_SettingCode for update", 400);

    const pool = await getPool(req.headers.subdbname);

    // Sequential numbering: on create, force Start_Number to the next free
    // number for this FY once any range exists (mirrors the VB form, which
    // disables Starting Number and sets it to max(End_Number)+1).
    if (!isEdit) {
      const maxRes = await pool
        .request()
        .input("FYCode", sql.Int, fyCode)
        .query(
          "SELECT ISNULL(MAX(End_Number), 0) AS m FROM tbl_YarnBagNo_Setting WHERE FYCode = @FYCode"
        );
      const prevMax = toInt(maxRes.recordset?.[0]?.m);
      if (prevMax > 0) startNumber = prevMax + 1;
    }

    if (!startNumber)
      return sendError(res, "Starting Number should not be empty", 400);

    // End_Number must be a real upper bound: a missing/zero or below-start value
    // would corrupt the sequential allocator (the next range starts at
    // MAX(End_Number)+1), so reject it here — the form only validated the start.
    if (!endNumber)
      return sendError(res, "Ending Number should not be empty", 400);
    if (endNumber < startNumber)
      return sendError(
        res,
        "Ending Number must be greater than or equal to Starting Number",
        400
      );

    const request = pool.request();

    // Always: @User/@Node/@CompanyCode/@YarnBagNoGroupCode/@Start_Number/
    // @End_Number/@FYCode/@Status. Edit also sends the setting code.
    request.input("User", sql.Int, toInt(userId));
    request.input("Node", sql.Int, toInt(nodeCode));
    if (isEdit) request.input("YarnBagNo_SettingCode", sql.Int, code);
    request.input("CompanyCode", sql.Int, toInt(req.headers.companyCode));
    request.input("YarnBagNoGroupCode", sql.Int, groupCode);
    request.input("Start_Number", sql.Int, startNumber);
    request.input("End_Number", sql.Int, endNumber);
    request.input("FYCode", sql.Int, fyCode);
    // Default to ACTIVE when Status is omitted (the VB combo defaults to index 0
    // = ACTIVE); only an explicit INACTIVE maps to 0.
    request.input("Status", sql.Bit, body.Status === undefined ? 1 : toBit(body.Status));

    await request.execute("sp_YarnBagNo_Setting_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    console.error("DB Error (saveOrUpdateYarnBagNoSetting):", err);
    return sendError(res, err);
  }
};

// POST /yarn-bag-no-setting/create        -> create
export const createYarnBagNoSetting = (req, res) =>
  saveOrUpdateYarnBagNoSetting(req, res, false);

// PUT  /yarn-bag-no-setting/update/:code  -> update
export const updateYarnBagNoSetting = (req, res) =>
  saveOrUpdateYarnBagNoSetting(req, res, true);

// DELETE /yarn-bag-no-setting/delete/:code -> EXEC sp_YarnBagNo_Setting_Delete
export const deleteYarnBagNoSetting = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = toInt(req.params.yarnBagNoSettingCode);
    if (!code) return sendError(res, "Invalid YarnBagNo_SettingCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("YarnBagNo_SettingCode", sql.Int, code)
      .execute("sp_YarnBagNo_Setting_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the YarnBagNo Setting!", 409);
    }
    console.error("DB Error (deleteYarnBagNoSetting):", err);
    return sendError(res, err);
  }
};

// --- Dropdown lookup (mirror cmbYarnBagNoGroupName.RecordSource) --------------

// GET /yarn-bag-no-setting/groups -> EXEC sp_YarnBagNoGroup_GetAll
export const getYarnBagNoGroupOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_YarnBagNoGroup_GetAll");
    const data = (result.recordset || []).map((item) => ({
      ...item,
      value: item.YarnBagNoGroupCode,
      label: item.YarnBagNoGroupName,
    }));
    return sendSuccess(res, data);
  } catch (err) {
    console.error("DB Error (getYarnBagNoGroupOptions):", err);
    return sendError(res, err);
  }
};
