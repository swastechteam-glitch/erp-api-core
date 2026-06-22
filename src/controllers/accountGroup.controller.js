import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Account Group master (port of the WinForms frmAC_Group)
//   - List   : EXEC sp_AC_Group_GetAll
//   - Create : EXEC sp_AC_Group_AddEdit   (without @GroupCode)
//   - Update : EXEC sp_AC_Group_AddEdit   (with @GroupCode)
//   - Delete : EXEC sp_AC_Group_Delete
//   - Options: Parent Group lookup (GET /account-group/options) from tbl_AC_Group
// AddEdit requires @User / @Node which we read from the auth token (headers).
// Business rule (from frmAC_GroupDetails): "Primary" groups (IsPrimary=1)
// cannot be edited or deleted.
// ---------------------------------------------------------------------------

const toBit = (v) => {
  if (v === true || v === 1 || v === "1") return 1;
  if (typeof v === "string" && v.trim().toUpperCase() === "TRUE") return 1;
  return 0;
};

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};

// Fetch a single group row (used for edit prefill and the primary guard).
const fetchGroup = async (pool, code) => {
  const result = await pool
    .request()
    .input("GroupCode", sql.Int, code)
    .query(
      "Select GroupCode, GroupName, ParentGroupCode, Nature, IsPrimary " +
        "from tbl_AC_Group where GroupCode = @GroupCode"
    );
  return result.recordset[0];
};

// GET /account-group/lists  -> mirrors frmAC_GroupDetails list
export const getAccountGroupList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_AC_Group_GetAll");

    const data = result.recordset.map((item) => ({
      ...item,
      id: item.GroupCode,
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getAccountGroupList):", err);
    return sendError(res, err);
  }
};

// GET /account-group/list/:code  -> single record
export const getAccountGroupById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.code);
    if (!code) return sendError(res, "Invalid GroupCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const row = await fetchGroup(pool, code);
    if (!row) return sendError(res, "Account Group not found", 404);

    return sendSuccess(res, row);
  } catch (err) {
    console.error("DB Error (getAccountGroupById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_AC_Group_AddEdit (btnSave_Click)
const saveOrUpdate = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const name = (body.GroupName || "").trim();
    const nature = (body.Nature || "").trim();

    // Same validations the form enforces.
    if (!name) return sendError(res, "Enter the Group Name", 400);
    if (!nature) return sendError(res, "Enter the Nature", 400);

    const code = isEdit
      ? parseInt(req.params.code ?? body.GroupCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid GroupCode for update", 400);

    const pool = await getPool(req.headers.subdbname);

    // Primary groups can't be edited (matches frmAC_GroupDetails).
    if (isEdit) {
      const existing = await fetchGroup(pool, code);
      if (!existing) return sendError(res, "Account Group not found", 404);
      if (existing.IsPrimary === true || existing.IsPrimary === 1)
        return sendError(res, "You can't edit this Group!", 409);
    }

    const request = pool.request();
    if (isEdit) request.input("GroupCode", sql.Int, code);
    request.input("GroupName", sql.NVarChar, name);
    request.input("ParentGroupCode", sql.Int, toInt(body.ParentGroupCode));
    request.input("Nature", sql.NVarChar, nature);
    request.input("IsPrimary", sql.Bit, toBit(body.IsPrimary));
    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));

    await request.execute("sp_AC_Group_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (err.message && err.message.includes("UK_")) {
      return sendError(res, "Already exist the Group Name", 409);
    }
    console.error("DB Error (saveOrUpdateAccountGroup):", err);
    return sendError(res, err);
  }
};

// POST /account-group/create        -> create
export const createAccountGroup = (req, res) =>
  saveOrUpdate(req, res, false);

// PUT  /account-group/update/:code  -> update
export const updateAccountGroup = (req, res) =>
  saveOrUpdate(req, res, true);

// DELETE /account-group/delete/:code -> EXEC sp_AC_Group_Delete
export const deleteAccountGroup = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.code);
    if (!code) return sendError(res, "Invalid GroupCode", 400);

    const pool = await getPool(req.headers.subdbname);

    // Primary groups can't be deleted (matches frmAC_GroupDetails).
    const existing = await fetchGroup(pool, code);
    if (!existing) return sendError(res, "Account Group not found", 404);
    if (existing.IsPrimary === true || existing.IsPrimary === 1)
      return sendError(res, "You can't delete this Group!", 409);

    await pool
      .request()
      .input("GroupCode", sql.Int, code)
      .execute("sp_AC_Group_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the Account Group!", 409);
    }
    console.error("DB Error (deleteAccountGroup):", err);
    return sendError(res, err);
  }
};

// GET /account-group/options -> Parent Group lookup for the form dropdown.
export const getAccountGroupOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .query("SELECT GroupCode, GroupName FROM tbl_AC_Group ORDER BY GroupName");

    return sendSuccess(res, {
      parentGroups: result.recordset.map((r) => ({
        value: r.GroupCode,
        label: r.GroupName,
      })),
    });
  } catch (err) {
    console.error("DB Error (getAccountGroupOptions):", err);
    return sendError(res, err);
  }
};
