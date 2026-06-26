import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Usable Waste Item master (port of the WinForms frmUsableWasteItem /
// frmUsableWasteItemDetails)
//   - Options: Department dropdown
//   - List   : EXEC sp_UsableWasteItem_GetAll
//   - Create : EXEC sp_UsableWasteItem_AddEdit  (without @UsableWasteItemCode)
//   - Update : EXEC sp_UsableWasteItem_AddEdit  (with @UsableWasteItemCode)
//   - Delete : EXEC sp_UsableWasteItem_Delete
// AddEdit requires @User / @Node which we read from the auth token (headers).
// The WinForms screen has NO Status field — it is not modelled here.
// ---------------------------------------------------------------------------

const toBit = (v) => {
  if (v === true || v === 1 || v === "1") return 1;
  if (typeof v === "string" && v.trim().toUpperCase() === "ACTIVE") return 1;
  return 0;
};

const toNum = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

// Decorate a raw GetAll/record row for the UI.
const decorate = (row) => ({
  ...row,
  id: row.UsableWasteItemCode,
});

// GET /usable-waste-item/options  -> dropdown lookups (Department)
export const getUsableWasteItemOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const departments = await pool
      .request()
      .query(
        "Select DepartmentCode, DepartmentName from tbl_Department Order By DepartmentName"
      );

    return sendSuccess(res, {
      departments: departments.recordset.map((r) => ({
        value: r.DepartmentCode,
        label: r.DepartmentName,
      })),
    });
  } catch (err) {
    console.error("DB Error (getUsableWasteItemOptions):", err);
    return sendError(res, err);
  }
};

// GET /usable-waste-item/lists  -> mirrors frmUsableWasteItemDetails list
export const getUsableWasteItemList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_UsableWasteItem_GetAll");

    const data = result.recordset.map(decorate);
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getUsableWasteItemList):", err);
    return sendError(res, err);
  }
};

// GET /usable-waste-item/list/:usableWasteItemCode -> single record (from GetAll)
export const getUsableWasteItemById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.usableWasteItemCode);
    if (!code) return sendError(res, "Invalid UsableWasteItemCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_UsableWasteItem_GetAll");

    const row = result.recordset.find(
      (r) => Number(r.UsableWasteItemCode) === code
    );
    if (!row) return sendError(res, "Usable Waste Item not found", 404);

    return sendSuccess(res, decorate(row));
  } catch (err) {
    console.error("DB Error (getUsableWasteItemById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_UsableWasteItem_AddEdit (btnSave_Click)
const saveOrUpdateUsableWasteItem = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const departmentCode = parseInt(body.DepartmentCode) || 0;
    const name = (body.UsableWasteItemName || "").trim();
    const shortName = (body.ShortName || "").trim();

    // Validation mirrors the WinForms btnSave_Click.
    if (!departmentCode) return sendError(res, "Select the Department", 400);
    if (!name)
      return sendError(res, "UsableWasteItem Name should not be empty", 400);
    if (!shortName)
      return sendError(res, "Short Name should not be empty", 400);

    const code = isEdit
      ? parseInt(req.params.usableWasteItemCode ?? body.UsableWasteItemCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid UsableWasteItemCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) request.input("UsableWasteItemCode", sql.Int, code);
    request.input("DepartmentCode", sql.Int, departmentCode);
    request.input("UsableWasteItemName", sql.NVarChar, name);
    request.input("ShortName", sql.NVarChar, shortName);
    request.input("Rate", sql.Decimal(18, 2), toNum(body.Rate));
    request.input("OrderNo", sql.Int, parseInt(body.OrderNo) || 0);
    request.input("BaleTareWeight", sql.Decimal(18, 3), toNum(body.BaleTareWeight));
    request.input("TareZeroAllowed", sql.Bit, toBit(body.TareZeroAllowed));
    request.input("HSNCode", sql.NVarChar, (body.HSNCode || "").trim());

    await request.execute("sp_UsableWasteItem_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_UsableWasteItemName")) {
      return sendError(res, "Already Name exist", 409);
    }
    console.error("DB Error (saveOrUpdateUsableWasteItem):", err);
    return sendError(res, err);
  }
};

// POST /usable-waste-item/create        -> create
export const createUsableWasteItem = (req, res) =>
  saveOrUpdateUsableWasteItem(req, res, false);

// PUT  /usable-waste-item/update/:code  -> update
export const updateUsableWasteItem = (req, res) =>
  saveOrUpdateUsableWasteItem(req, res, true);

// DELETE /usable-waste-item/delete/:usableWasteItemCode
export const deleteUsableWasteItem = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.usableWasteItemCode);
    if (!code) return sendError(res, "Invalid UsableWasteItemCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("UsableWasteItemCode", sql.Int, code)
      .execute("sp_UsableWasteItem_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the Usable Waste Item!", 409);
    }
    console.error("DB Error (deleteUsableWasteItem):", err);
    return sendError(res, err);
  }
};
