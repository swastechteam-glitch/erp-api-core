import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";
import { isDuplicateByGetAll } from "../utils/duplicateCheck.js";

// ---------------------------------------------------------------------------
// District master (port of the WinForms frmDistrict)
//   - List   : EXEC sp_District_GetAll
//   - States : tbl_State (dropdown source)
//   - Create : EXEC sp_District_AddEdit  (@C_User/@C_Node, no @DistrictCode)
//   - Update : EXEC sp_District_AddEdit  (@E_User/@E_Node + @DistrictCode)
//   - Delete : EXEC sp_District_Delete
// NOTE: AddEdit uses CREATE audit params on insert and EDIT audit params on
//       update (per frmDistrict.vb).
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

const toStatusBit = (status) => {
  if (status === true || status === 1 || status === "1") return 1;
  if (typeof status === "string" && status.trim().toUpperCase() === "ACTIVE")
    return 1;
  return 0;
};

// GET /district/lists  -> EXEC sp_District_GetAll
export const getDistrictList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_District_GetAll");

    const data = result.recordset
      // Newest first (the SP doesn't guarantee order, so sort here).
      .sort((a, b) => b.DistrictCode - a.DistrictCode)
      .map((item) => ({
        ...item,
        id: item.DistrictCode,
        StatusText: STATUS_LABEL(item.Status),
      }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getDistrictList):", err);
    return sendError(res, err);
  }
};

// GET /district/states  -> dropdown source (tbl_State)
export const getStatesDropdown = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .query("Select StateCode, StateName from tbl_State order by StateName");

    return sendSuccess(res, result.recordset);
  } catch (err) {
    console.error("DB Error (getStatesDropdown):", err);
    return sendError(res, err);
  }
};

// GET /district/list/:districtCode  -> single record (filtered from GetAll)
export const getDistrictById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.districtCode);
    if (!code) return sendError(res, "Invalid DistrictCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_District_GetAll");
    const row = result.recordset.find((r) => r.DistrictCode === code);

    if (!row) return sendError(res, "District not found", 404);

    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getDistrictById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_District_AddEdit (btnSave_Click)
const saveOrUpdateDistrict = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const districtName = (body.DistrictName || "").trim();
    const stateCode = parseInt(body.StateCode);

    // Validation mirrors btnSave_Click.
    if (!stateCode || stateCode <= 0)
      return sendError(res, "Select the State Name", 400);
    if (!districtName)
      return sendError(res, "District should not be empty", 400);

    const code = isEdit
      ? parseInt(req.params.districtCode ?? body.DistrictCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid DistrictCode for update", 400);

    const pool = await getPool(req.headers.subdbname);

    if (
      await isDuplicateByGetAll(pool, {
        proc: "sp_District_GetAll",
        nameField: "DistrictName",
        codeField: "DistrictCode",
        name: districtName,
        code,
      })
    )
      return sendError(res, "District already exists", 409);

    const request = pool.request();

    // Create uses C_* audit params; edit uses E_* + the district code.
    if (isEdit) {
      request.input("E_User", sql.Int, parseInt(userId));
      request.input("E_Node", sql.Int, parseInt(nodeCode));
      request.input("DistrictCode", sql.Int, code);
    } else {
      request.input("C_User", sql.Int, parseInt(userId));
      request.input("C_Node", sql.Int, parseInt(nodeCode));
    }
    request.input("DistrictName", sql.NVarChar, districtName);
    request.input("StateCode", sql.Int, stateCode);
    request.input("Status", sql.Bit, toStatusBit(body.Status));

    await request.execute("sp_District_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_District_tblDistrict")) {
      return sendError(res, "Already exist the District", 409);
    }
    console.error("DB Error (saveOrUpdateDistrict):", err);
    return sendError(res, err);
  }
};

// POST /district/create        -> create
export const createDistrict = (req, res) =>
  saveOrUpdateDistrict(req, res, false);

// PUT  /district/update/:code  -> update
export const updateDistrict = (req, res) =>
  saveOrUpdateDistrict(req, res, true);

// DELETE /district/delete/:districtCode -> EXEC sp_District_Delete
export const deleteDistrict = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.districtCode);
    if (!code) return sendError(res, "Invalid DistrictCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("DistrictCode", sql.Int, code)
      .execute("sp_District_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    // Still referenced elsewhere -> friendly 409 instead of a raw FK error.
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(
        res,
        "This district is in use and cannot be deleted",
        409
      );
    }
    console.error("DB Error (deleteDistrict):", err);
    return sendError(res, err);
  }
};
