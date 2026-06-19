import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Service Activity master (port of frmServiceActivity + frmServiceActivityDetails)
// Header + spare-item detail grid, shared by two menus via ServiceType ("M"|"E").
//   - List    : EXEC sp_ServiceActivity_GetAll @ServiceType  (or name search)
//   - Read    : tbl_ServiceActivity row + vw_ServiceActivityDetails (items)
//   - Dropdowns: items (sp_Item_GetbyItemName), uoms (tbl_ItemUom)
//   - Save    : sp_ServiceActivity_AddEdit (scalar -> code) +
//               sp_ServiceActivityDetails_Delete + _Insert per item (transaction)
//   - Delete  : EXEC sp_ServiceActivity_Delete @ServiceActivityCode
// AddEdit needs @User / @Node from the auth token (headers).
// ---------------------------------------------------------------------------

const STATUS_LABEL = (s) => (s ? "ACTIVE" : "INACTIVE");
const toBit = (v) => {
  if (v === true || v === 1 || v === "1") return 1;
  if (typeof v === "string" && v.trim().toUpperCase() === "ACTIVE") return 1;
  if (typeof v === "string" && v.trim().toUpperCase() === "YES") return 1;
  return 0;
};

// GET /service-activity/lists?serviceType=M&search=
export const getServiceActivityList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const serviceType = (req.query.serviceType || "").toString().trim();
    if (!serviceType)
      return sendError(res, "serviceType is required (M or E)", 400);

    const search = (req.query.search || "").toString().trim();
    const pool = await getPool(req.headers.subdbname);
    const request = pool
      .request()
      .input("ServiceType", sql.NVarChar, serviceType);

    let result;
    if (search) {
      request.input("ServiceActivityName", sql.NVarChar, `%${search}%`);
      result = await request.execute(
        "sp_ServiceActivity_GetbyServiceActivityName"
      );
    } else {
      result = await request.execute("sp_ServiceActivity_GetAll");
    }

    const data = result.recordset
      // Ascending by name: numeric-prefixed names sort first, then A-Z.
      .sort((a, b) =>
        (a.ServiceActivityName || "").localeCompare(
          b.ServiceActivityName || "",
          undefined,
          { numeric: true, sensitivity: "base" }
        )
      )
      .map((item) => ({
        ...item,
        id: item.ServiceActivityCode,
        StatusText: STATUS_LABEL(item.Status),
      }));

    // No pagination — return the full list (left grid shows everything).
    return sendSuccess(res, data);
  } catch (err) {
    console.error("DB Error (getServiceActivityList):", err);
    return sendError(res, err);
  }
};

// GET /service-activity/list/:serviceActivityCode -> header + detail items
export const getServiceActivityById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = parseInt(req.params.serviceActivityCode);
    if (!code) return sendError(res, "Invalid ServiceActivityCode", 400);

    const pool = await getPool(req.headers.subdbname);

    const headRes = await pool
      .request()
      .input("ServiceActivityCode", sql.Int, code)
      .query(
        "Select * from tbl_ServiceActivity where ServiceActivityCode = @ServiceActivityCode"
      );
    if (headRes.recordset.length === 0)
      return sendError(res, "Service Activity not found", 404);

    const h = headRes.recordset[0];

    const itemRes = await pool
      .request()
      .input("ServiceActivityCode", sql.Int, code)
      .query(
        "Select * from vw_ServiceActivityDetails Where ServiceActivityCode = @ServiceActivityCode"
      );
    const items = itemRes.recordset
      .filter((r) => r.ItemCode > 0)
      .map((r) => ({
        ItemCode: r.ItemCode,
        ItemName: r.ItemName,
        UOMCode: r.UOMCode,
        UOMName: r.UOMName,
        Qty: r.Qty,
      }));

    return sendSuccess(res, {
      ServiceActivityCode: h.ServiceActivityCode,
      ServiceActivityName: h.ServiceActivityName,
      ScheduleDurationDays: h.ScheduleDurationDays ?? 0,
      Tollerence: h.Tollerence ?? 0,
      AuthorisedRequired: toBit(h.AuthorisedRequired),
      ExternalServiceRequired: toBit(h.ExternalServiceRequired),
      Replacement: toBit(h.Replacement),
      Tonnage: toBit(h.Tonnage),
      TonnageValue: h.TonnageValue ?? 0,
      Status: toBit(h.Status),
      StatusText: STATUS_LABEL(h.Status),
      items,
    });
  } catch (err) {
    console.error("DB Error (getServiceActivityById):", err);
    return sendError(res, err);
  }
};

// GET /service-activity/items  -> EXEC sp_Item_GetbyItemName
export const getItems = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_Item_GetbyItemName");
    return sendSuccess(res, result.recordset);
  } catch (err) {
    console.error("DB Error (getItems):", err);
    return sendError(res, err);
  }
};

// GET /service-activity/uoms
export const getUoms = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .query("select ItemUomCode, ItemUomName from tbl_ItemUom");
    return sendSuccess(res, result.recordset);
  } catch (err) {
    console.error("DB Error (getUoms):", err);
    return sendError(res, err);
  }
};

// Shared save (create / update) -> AddEdit (scalar) + Details Delete/Insert (tx).
const saveOrUpdate = async (req, res, isEdit) => {
  let transaction;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const b = req.body || {};
    const name = (b.ServiceActivityName || "").trim();
    const serviceType = (b.ServiceType || "").toString().trim();
    const scheduleDurationDays = b.ScheduleDurationDays;
    const tollerence = b.Tollerence;
    const tonnage = toBit(b.Tonnage);
    const items = Array.isArray(b.items) ? b.items : [];

    // Validation mirrors btnSave_Click.
    if (!name) return sendError(res, "Enter The Service Activity Name....", 400);
    if (!serviceType)
      return sendError(res, "serviceType is required (M or E)", 400);
    if (scheduleDurationDays === "" || scheduleDurationDays == null)
      return sendError(res, "Enter The Schedule Duration Days....", 400);
    if (tollerence === "" || tollerence == null)
      return sendError(res, "Enter The Tolerance....", 400);
    if (tonnage && !(parseFloat(b.TonnageValue) > 0))
      return sendError(res, "Tonnage Value should not be empty", 400);

    const code = isEdit
      ? parseInt(req.params.serviceActivityCode ?? b.ServiceActivityCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid ServiceActivityCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // 1) sp_ServiceActivity_AddEdit -> ServiceActivityCode (ExecuteScalar in VB).
    const reqA = new sql.Request(transaction);
    if (isEdit) reqA.input("ServiceActivityCode", sql.Int, code);
    reqA.input("ServiceActivityName", sql.NVarChar, name);
    reqA.input("ScheduleDurationDays", sql.Int, parseInt(scheduleDurationDays) || 0);
    reqA.input("Tollerence", sql.Int, parseInt(tollerence) || 0);
    reqA.input("ServiceType", sql.NVarChar, serviceType);
    reqA.input("AuthorisedRequired", sql.Bit, toBit(b.AuthorisedRequired));
    reqA.input("ExternalServiceRequired", sql.Bit, toBit(b.ExternalServiceRequired));
    reqA.input("Replacement", sql.Bit, toBit(b.Replacement));
    reqA.input("Tonnage", sql.Bit, tonnage);
    if (tonnage)
      reqA.input("TonnageValue", sql.Decimal(18, 2), parseFloat(b.TonnageValue) || 0);
    reqA.input("Status", sql.Bit, toBit(b.Status));
    reqA.input("User", sql.Int, parseInt(userId));
    reqA.input("Node", sql.Int, parseInt(nodeCode));

    const addEditRes = await reqA.execute("sp_ServiceActivity_AddEdit");
    const scalarRow = addEditRes.recordset && addEditRes.recordset[0];
    const newCode = isEdit
      ? code
      : scalarRow
      ? Object.values(scalarRow)[0]
      : null;

    // 2) refresh detail items.
    await new sql.Request(transaction)
      .input("ServiceActivityCode", sql.Int, parseInt(newCode))
      .execute("sp_ServiceActivityDetails_Delete");

    for (const it of items) {
      await new sql.Request(transaction)
        .input("ServiceActivityCode", sql.Int, parseInt(newCode))
        .input("ItemCode", sql.Int, parseInt(it.ItemCode ?? it.itemCode) || 0)
        .input("UOMCode", sql.Int, parseInt(it.UOMCode ?? it.uomCode) || 0)
        .input("Qty", sql.Decimal(18, 4), parseFloat(it.Qty ?? it.qty) || 0)
        .execute("sp_ServiceActivityDetails_Insert");
    }

    await transaction.commit();
    return sendSuccess(
      res,
      { ServiceActivityCode: newCode },
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
    if (err.message && err.message.includes("UK_tbl_ServiceActivity")) {
      return sendError(res, "Please Check the Entry", 409);
    }
    console.error("DB Error (saveOrUpdate ServiceActivity):", err);
    return sendError(res, err);
  }
};

export const createServiceActivity = (req, res) => saveOrUpdate(req, res, false);
export const updateServiceActivity = (req, res) => saveOrUpdate(req, res, true);

// DELETE /service-activity/delete/:serviceActivityCode
export const deleteServiceActivity = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = parseInt(req.params.serviceActivityCode);
    if (!code) return sendError(res, "Invalid ServiceActivityCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("ServiceActivityCode", sql.Int, code)
      .execute("sp_ServiceActivity_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the Service Activity!", 409);
    }
    console.error("DB Error (deleteServiceActivity):", err);
    return sendError(res, err);
  }
};
