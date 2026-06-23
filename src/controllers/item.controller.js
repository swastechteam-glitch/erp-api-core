import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";
import { getFilterCurrentDate } from "../utils/common.js";

// ---------------------------------------------------------------------------
// Item master (port of the WinForms frmItem) — the largest master.
//   - List        : EXEC sp_Item_GetbyEdit  (current stock primed via sp_Stock_Statement)
//   - Read        : vw_Item_WithImage (photo returned as base64 data URL)
//   - Dropdowns   : item-groups, item-categories(byGroup), item-usage-types,
//                   item-uoms, taxes, departments
//   - Save        : sp_Item_AddEdit (ExecuteScalar -> ItemCode) +
//                   sp_ItemSubUom_Delete + sp_ItemSubUom_Insert, in a transaction
//   - Delete      : EXEC sp_Item_Delete
// AddEdit needs @User/@Node/@CompanyCode from the auth token (headers).
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

const toBit = (v) => {
  if (v === true || v === 1 || v === "1") return 1;
  if (typeof v === "string" && v.trim().toUpperCase() === "ACTIVE") return 1;
  return 0;
};
const num = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));

// GET /item/lists  -> EXEC sp_Item_GetbyEdit
export const getItemList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);

    // Prime current-stock columns (best-effort — matches frmItemDetails_Load).
    try {
      const today = getFilterCurrentDate();
      await pool
        .request()
        .input("FromDate", sql.NVarChar, today)
        .input("ToDate", sql.NVarChar, today)
        .input("CurStock", sql.Int, 1)
        .execute("sp_Stock_Statement");
    } catch (stockErr) {
      console.warn("sp_Stock_Statement prime skipped:", stockErr.message);
    }

    const result = await pool.request().execute("sp_Item_GetbyEdit");

    const data = result.recordset
      .sort((a, b) => b.ItemCode - a.ItemCode)
      .map((item) => ({
        ...item,
        id: item.ItemCode,
        StatusText: STATUS_LABEL(item.Status),
      }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getItemList):", err);
    return sendError(res, err);
  }
};

// GET /item/search?name=  -> existing item names matching the typed text.
// Mirrors the WinForms Item-Name typeahead: "Select ItemName from vw_Item
// Where ItemName like '%...%'" — used to surface/prevent duplicate items.
export const searchItems = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const term = (req.query.name || "").toString().trim();
    if (!term) return sendSuccess(res, []);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("Name", sql.NVarChar, `%${term}%`)
      .query(
        "Select Top 20 ItemCode, ItemName from vw_Item Where ItemName like @Name Order by ItemName"
      );

    return sendSuccess(res, result.recordset);
  } catch (err) {
    console.error("DB Error (searchItems):", err);
    return sendError(res, err);
  }
};

// GET /item/next-item-id/:departmentCode  -> auto-generated Item ID.
// Ports WinForms Bind_ItemID: Left(Department.ShortName, 4) + (Max(ItemCode)+1).
export const getNextItemId = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.departmentCode);
    if (!code) return sendSuccess(res, { itemId: "" });

    const pool = await getPool(req.headers.subdbname);

    const deptRes = await pool
      .request()
      .input("DepartmentCode", sql.Int, code)
      .query(
        "Select ShortName from tbl_Department where DepartmentCode = @DepartmentCode"
      );
    const shortName = (deptRes.recordset[0]?.ShortName || "").toString();

    const maxRes = await pool
      .request()
      .query("Select ISNULL(Max(ItemCode),0) as MaxCode from tbl_Item");
    const nextCode = (maxRes.recordset[0]?.MaxCode || 0) + 1;

    const itemId = shortName.substring(0, 4) + nextCode;
    return sendSuccess(res, { itemId });
  } catch (err) {
    console.error("DB Error (getNextItemId):", err);
    return sendError(res, err);
  }
};

// GET /item/list/:itemCode  -> single record (vw_Item_WithImage)
export const getItemById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.itemCode);
    if (!code) return sendError(res, "Invalid ItemCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("ItemCode", sql.Int, code)
      .query("Select * from vw_Item_WithImage where ItemCode = @ItemCode");

    if (!result.recordset.length)
      return sendError(res, "Item not found", 404);

    const row = { ...result.recordset[0] };

    // Convert the binary photo to a base64 data URL (and drop the raw buffer).
    if (row.ItemPhoto) {
      try {
        const buf = Buffer.isBuffer(row.ItemPhoto)
          ? row.ItemPhoto
          : Buffer.from(row.ItemPhoto);
        row.ItemPhotoBase64 = `data:image/jpeg;base64,${buf.toString("base64")}`;
      } catch (_) {
        /* ignore bad image data */
      }
    }
    delete row.ItemPhoto;
    row.StatusText = STATUS_LABEL(row.Status);

    return sendSuccess(res, row);
  } catch (err) {
    console.error("DB Error (getItemById):", err);
    return sendError(res, err);
  }
};

// -------- Dropdown sources ------------------------------------------------
const runDropdown = async (req, res, query, label) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().query(query);
    return sendSuccess(res, result.recordset);
  } catch (err) {
    console.error(`DB Error (${label}):`, err);
    return sendError(res, err);
  }
};

// GET /item/item-groups
export const getItemGroupsDropdown = (req, res) =>
  runDropdown(
    req,
    res,
    "Select ItemGroupName, ItemGroupCode from tbl_ItemGroup where status = 1 order by ItemGroupName",
    "getItemGroupsDropdown"
  );

// GET /item/item-categories/:itemGroupCode  (categories belonging to a group)
export const getItemCategoriesDropdown = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);
    const groupCode = parseInt(req.params.itemGroupCode) || 0;
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("ItemGroupCode", sql.Int, groupCode)
      .query(
        "Select ItemCategoryCode, ItemCategoryName from tbl_ItemCategory where ItemGroupCode = @ItemGroupCode order by ItemCategoryName"
      );
    return sendSuccess(res, result.recordset);
  } catch (err) {
    console.error("DB Error (getItemCategoriesDropdown):", err);
    return sendError(res, err);
  }
};

// GET /item/item-usage-types
export const getItemUsageTypesDropdown = (req, res) =>
  runDropdown(
    req,
    res,
    "Select ItemUsageTypeName, ItemUsageTypeCode from tbl_ItemUsageType order by ItemUsageTypeName",
    "getItemUsageTypesDropdown"
  );

// GET /item/item-uoms
export const getItemUomsDropdown = (req, res) =>
  runDropdown(
    req,
    res,
    "Select ItemUomName, ItemUomCode, UnitInNumbers from tbl_ItemUOM where status = 1 order by ItemUomName",
    "getItemUomsDropdown"
  );

// GET /item/taxes
export const getTaxesDropdown = (req, res) =>
  runDropdown(
    req,
    res,
    "Select TaxName, TaxCode from tbl_Tax where status = 1 order by TaxName",
    "getTaxesDropdown"
  );

// GET /item/departments
export const getDepartmentsDropdown = (req, res) =>
  runDropdown(
    req,
    res,
    "Select DepartmentName, ShortName, DepartmentCode from tbl_Department order by DepartmentName",
    "getDepartmentsDropdown"
  );

// -------- Save (create / update) -----------------------------------------
const saveOrUpdateItem = async (req, res, isEdit) => {
  let transaction;
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    const companyCode = req.headers.companyCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);
    if (!companyCode)
      return sendError(res, "Missing company context (companyCode)", 400);

    const b = req.body || {};
    const itemCategoryCode = parseInt(b.ItemCategoryCode);
    const itemGroupCode = parseInt(b.ItemGroupCode);
    const itemUsageTypeCode = parseInt(b.ItemUsageTypeCode);
    const itemName = (b.ItemName || "").trim();
    const itemNameTamil = (b.ItemName_Tamil || "").trim();
    const itemUomCode = parseInt(b.ItemUomCode);
    const taxCode = parseInt(b.TaxCode);
    const departmentCode = parseInt(b.DepartmentCode);
    const itemId = (b.ItemID || "").toString().trim();

    // Validation mirrors btnSave_Click.
    if (!itemCategoryCode || itemCategoryCode <= 0)
      return sendError(res, "Select the Category Name", 400);
    if (!itemGroupCode || itemGroupCode <= 0)
      return sendError(res, "Select the Group Name", 400);
    if (!itemUsageTypeCode || itemUsageTypeCode <= 0)
      return sendError(res, "Select the Item Usage Type", 400);
    if (!itemName) return sendError(res, "Enter the Item Name", 400);
    if (!itemNameTamil)
      return sendError(res, "Enter the Item Name In Tamil", 400);
    if (!itemUomCode || itemUomCode <= 0)
      return sendError(res, "Select the Item Uom Name", 400);
    if (!taxCode || taxCode <= 0)
      return sendError(res, "Select the Tax Name", 400);
    if (!departmentCode || departmentCode <= 0)
      return sendError(res, "Select the Department", 400);
    if (!itemId) return sendError(res, "Enter the Item ID", 400);

    const code = isEdit ? parseInt(req.params.itemCode ?? b.ItemCode) : null;
    if (isEdit && !code)
      return sendError(res, "Invalid ItemCode for update", 400);

    const pool = await getPool(req.headers.subdbname);

    // ItemID must be unique across other items.
    const dup = isEdit
      ? await pool
          .request()
          .input("ItemID", sql.NVarChar, itemId)
          .input("ItemCode", sql.Int, code)
          .query(
            "Select ItemCode from tbl_Item where ItemID = @ItemID and ItemCode <> @ItemCode"
          )
      : await pool
          .request()
          .input("ItemID", sql.NVarChar, itemId)
          .query("Select ItemCode from tbl_Item where ItemID = @ItemID");
    if (dup.recordset.length)
      return sendError(res, "Item ID already fixed to another Item", 409);

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // 1) sp_Item_AddEdit -> returns the ItemCode (ExecuteScalar in VB).
    const reqItem = new sql.Request(transaction);
    reqItem.input("User", sql.Int, parseInt(userId));
    reqItem.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) reqItem.input("ItemCode", sql.Int, code);
    reqItem.input("ItemCategoryCode", sql.Int, itemCategoryCode);
    reqItem.input("ItemGroupCode", sql.Int, itemGroupCode);
    reqItem.input("ItemUsageTypeCode", sql.Int, itemUsageTypeCode);
    reqItem.input("ItemName", sql.NVarChar, itemName);
    reqItem.input("ItemName_Tamil", sql.NVarChar, itemNameTamil);
    reqItem.input("PartNumber", sql.NVarChar, (b.PartNumber || "").trim());
    reqItem.input("DrawingNo", sql.NVarChar, (b.DrawingNo || "").trim());
    reqItem.input("CatalogueNo", sql.NVarChar, (b.CatalogueNo || "").trim());
    reqItem.input("PurchaseCost", sql.Decimal(18, 2), num(b.PurchaseCost));
    reqItem.input("ReOrderLevel", sql.Decimal(18, 2), num(b.ReOrderLevel));
    reqItem.input("MinStock", sql.Decimal(18, 2), num(b.MinStock));
    reqItem.input("MaxStock", sql.Decimal(18, 2), num(b.MaxStock));
    reqItem.input("ItemUomCode", sql.Int, itemUomCode);
    reqItem.input("TaxCode", sql.Int, taxCode);

    // Optional photo: accept a base64 data URL / raw base64 string.
    let photoBuf = null;
    if (b.ItemPhotoBase64) {
      const base64 = b.ItemPhotoBase64.includes(",")
        ? b.ItemPhotoBase64.split(",")[1]
        : b.ItemPhotoBase64;
      try {
        photoBuf = Buffer.from(base64, "base64");
      } catch (_) {
        photoBuf = null;
      }
    }
    reqItem.input("ItemPhoto", sql.Image, photoBuf);

    reqItem.input("Stores", sql.Bit, 1);
    reqItem.input("Cotton", sql.Bit, toBit(b.Cotton));
    reqItem.input("Production", sql.Bit, toBit(b.Production));
    reqItem.input("VehicleManagement", sql.Bit, toBit(b.VehicleManagement));
    reqItem.input("WeighBridge", sql.Bit, toBit(b.WeighBridge));
    reqItem.input("OpnQty", sql.Decimal(18, 2), num(b.OpnQty));
    reqItem.input("OpnValue", sql.Decimal(18, 2), num(b.OpnValue));
    reqItem.input("Status", sql.Bit, toBit(b.Status));
    reqItem.input("ProductCost", sql.Decimal(18, 2), num(b.ProductCost));
    reqItem.input("LoadingCost", sql.Decimal(18, 2), num(b.LoadingCost));
    reqItem.input("SellingCost", sql.Decimal(18, 2), num(b.SellingCost));
    reqItem.input("RackNo", sql.NVarChar, (b.RackNo || "").trim());
    reqItem.input("DepartmentCode", sql.Int, departmentCode);
    reqItem.input("ItemID", sql.NVarChar, itemId);
    reqItem.input("HSNCode", sql.NVarChar, (b.HSNCode || "").trim());
    reqItem.input("CompanyCode", sql.Int, parseInt(companyCode));

    const addEditResult = await reqItem.execute("sp_Item_AddEdit");
    // ExecuteScalar equivalent: first column of the first row.
    const scalarRow = addEditResult.recordset && addEditResult.recordset[0];
    const newItemCode = isEdit
      ? code
      : scalarRow
      ? Object.values(scalarRow)[0]
      : null;

    if (newItemCode) {
      // 2) refresh the item's sub-UOM mapping (main UOM conversion).
      const uomRow = await new sql.Request(transaction)
        .input("ItemUomCode", sql.Int, itemUomCode)
        .query(
          "Select UnitInNumbers from tbl_ItemUOM where ItemUomCode = @ItemUomCode"
        );
      const conversionUnit = uomRow.recordset.length
        ? num(uomRow.recordset[0].UnitInNumbers)
        : 0;

      await new sql.Request(transaction)
        .input("ItemCode", sql.Int, parseInt(newItemCode))
        .execute("sp_ItemSubUom_Delete");

      await new sql.Request(transaction)
        .input("ItemCode", sql.Int, parseInt(newItemCode))
        .input("ItemSubUomCode", sql.Int, itemUomCode)
        .input("ConversionUnit", sql.Decimal(18, 2), conversionUnit)
        .execute("sp_ItemSubUom_Insert");
    }

    await transaction.commit();

    return sendSuccess(
      res,
      { ItemCode: newItemCode },
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (_) {
        /* ignore */
      }
    }
    if (err.message && err.message.includes("UK_tbl_Item")) {
      return sendError(res, "Already exist the Item Name", 409);
    }
    console.error("DB Error (saveOrUpdateItem):", err);
    return sendError(res, err);
  }
};

// POST /item/create        -> create
export const createItem = (req, res) => saveOrUpdateItem(req, res, false);

// PUT  /item/update/:code  -> update
export const updateItem = (req, res) => saveOrUpdateItem(req, res, true);

// DELETE /item/delete/:itemCode -> EXEC sp_Item_Delete
export const deleteItem = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.itemCode);
    if (!code) return sendError(res, "Invalid ItemCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("ItemCode", sql.Int, code)
      .execute("sp_Item_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the Item!", 409);
    }
    console.error("DB Error (deleteItem):", err);
    return sendError(res, err);
  }
};
