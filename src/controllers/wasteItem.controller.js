import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Waste Item master (port of the WinForms frmWasteItem / frmWasteItemDetails)
//   - Options: Department / Waste Item Group / Raw Material dropdowns
//   - List   : EXEC sp_WasteItem_GetAll
//   - Create : EXEC sp_WasteItem_AddEdit   (without @WasteItemCode)
//   - Update : EXEC sp_WasteItem_AddEdit   (with @WasteItemCode)
//   - Delete : EXEC sp_WasteItem_Delete
// AddEdit requires @User / @Node which we read from the auth token (headers).
// The WinForms Waste-Type radio (Waste Cotton / Others) is modelled as a single
// "WasteType" select (C | O) and expanded server-side into @WasteCotton / @Others.
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

const toBit = (v) => {
  if (v === true || v === 1 || v === "1") return 1;
  if (typeof v === "string" && v.trim().toUpperCase() === "ACTIVE") return 1;
  return 0;
};

const toNum = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

// Waste Cotton / Others bits -> single "WasteType" code for the React select.
const wasteTypeCode = (row) => (toBit(row.WasteCotton) ? "C" : toBit(row.Others) ? "O" : "");

// Decorate a raw GetAll/record row for the UI.
const decorate = (row) => ({
  ...row,
  id: row.WasteItemCode,
  WasteType: wasteTypeCode(row),
  StatusText: STATUS_LABEL(row.Status),
});

// GET /waste-item/options  -> dropdown lookups (Department / Group / Raw Material)
export const getWasteItemOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);

    const [departments, wasteItemGroups, rawMaterials] = await Promise.all([
      pool
        .request()
        .query("Select DepartmentCode, DepartmentName from tbl_Department Order By DepartmentName"),
      pool
        .request()
        .query(
          "SELECT WasteItemGroupCode, WasteItemGroupName FROM tbl_WasteItemGroup WHERE Status = 1 Order By WasteItemGroupName"
        ),
      pool
        .request()
        .query("Select RawMaterialCode, RawMaterialName from tbl_RawMaterial Order By RawMaterialName"),
    ]);

    return sendSuccess(res, {
      departments: departments.recordset.map((r) => ({
        value: r.DepartmentCode,
        label: r.DepartmentName,
      })),
      wasteItemGroups: wasteItemGroups.recordset.map((r) => ({
        value: r.WasteItemGroupCode,
        label: r.WasteItemGroupName,
      })),
      rawMaterials: rawMaterials.recordset.map((r) => ({
        value: r.RawMaterialCode,
        label: r.RawMaterialName,
      })),
    });
  } catch (err) {
    console.error("DB Error (getWasteItemOptions):", err);
    return sendError(res, err);
  }
};

// GET /waste-item/lists  -> mirrors frmWasteItemDetails list (sp_WasteItem_GetAll)
export const getWasteItemList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_WasteItem_GetAll");

    const data = result.recordset.map(decorate);
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getWasteItemList):", err);
    return sendError(res, err);
  }
};

// GET /waste-item/list/:wasteItemCode  -> single record (filtered from GetAll)
export const getWasteItemById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.wasteItemCode);
    if (!code) return sendError(res, "Invalid WasteItemCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_WasteItem_GetAll");

    const row = result.recordset.find((r) => Number(r.WasteItemCode) === code);
    if (!row) return sendError(res, "Waste Item not found", 404);

    return sendSuccess(res, decorate(row));
  } catch (err) {
    console.error("DB Error (getWasteItemById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_WasteItem_AddEdit (btnSave_Click)
const saveOrUpdateWasteItem = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const departmentCode = parseInt(body.DepartmentCode) || 0;
    const wasteItemGroupCode = parseInt(body.WasteItemGroupCode) || 0;
    const name = (body.WasteItemName || "").trim();
    const shortName = (body.ShortName || "").trim();
    const rate = toNum(body.Rate);
    const wasteType = String(body.WasteType || "").trim().toUpperCase();
    const rawMaterialCode = parseInt(body.RawMaterialCode) || 0;

    // Validation mirrors the WinForms btnSave_Click.
    if (!departmentCode) return sendError(res, "Select the Department", 400);
    if (!wasteItemGroupCode) return sendError(res, "Select the Waste Item Group", 400);
    if (!name) return sendError(res, "Waste Item Name should not be empty", 400);
    if (!shortName) return sendError(res, "Short Name should not be empty", 400);
    if (!(rate > 0)) return sendError(res, "Enter the Rate", 400);
    if (wasteType !== "C" && wasteType !== "O")
      return sendError(res, "Please select Waste Type", 400);

    const code = isEdit
      ? parseInt(req.params.wasteItemCode ?? body.WasteItemCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid WasteItemCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) request.input("WasteItemCode", sql.Int, code);
    request.input("DepartmentCode", sql.Int, departmentCode);
    request.input("WasteItemGroupCode", sql.Int, wasteItemGroupCode);
    request.input("WasteItemName", sql.NVarChar, name);
    request.input("ShortName", sql.NVarChar, shortName);
    request.input("Rate", sql.Decimal(18, 2), rate);
    request.input("OrderNo", sql.Int, parseInt(body.OrderNo) || 0);
    request.input("BaleTareWeight", sql.Decimal(18, 3), toNum(body.BaleTareWeight));
    request.input("TareZeroAllowed", sql.Bit, toBit(body.TareZeroAllowed));
    request.input("WasteCotton", sql.Bit, wasteType === "C" ? 1 : 0);
    request.input("Others", sql.Bit, wasteType === "O" ? 1 : 0);
    request.input("YarnRealisation", sql.Bit, toBit(body.YarnRealisation));
    // RawMaterialCode is optional in the WinForms screen (added only when > 0).
    if (rawMaterialCode > 0) request.input("RawMaterialCode", sql.Int, rawMaterialCode);
    request.input("StockRate", sql.Decimal(18, 2), toNum(body.StockRate));
    request.input("HSNCode", sql.NVarChar, (body.HSNCode || "").trim());
    request.input("Status", sql.Bit, toBit(body.Status));

    await request.execute("sp_WasteItem_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_WasteItemName")) {
      return sendError(res, "Already exist this Waste Item Name", 409);
    }
    console.error("DB Error (saveOrUpdateWasteItem):", err);
    return sendError(res, err);
  }
};

// POST /waste-item/create        -> create
export const createWasteItem = (req, res) =>
  saveOrUpdateWasteItem(req, res, false);

// PUT  /waste-item/update/:code  -> update
export const updateWasteItem = (req, res) =>
  saveOrUpdateWasteItem(req, res, true);

// DELETE /waste-item/delete/:wasteItemCode -> EXEC sp_WasteItem_Delete
export const deleteWasteItem = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.wasteItemCode);
    if (!code) return sendError(res, "Invalid WasteItemCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("WasteItemCode", sql.Int, code)
      .execute("sp_WasteItem_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the Waste Item!", 409);
    }
    console.error("DB Error (deleteWasteItem):", err);
    return sendError(res, err);
  }
};
