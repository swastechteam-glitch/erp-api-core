import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Vehicle Expenses Entry (port of WinForms frmVehicleExpencessEntry / ...Details)
//
// A parent + child transaction: a header (Entry No / Entry Date / Vehicle) with
// a detail grid (Vehicle Expense + Amount) and a running Total Amount.
//
//   Lookups : vehicles (tbl_Vehicle WHERE UsageTypeCode = 1) /
//             expenses (tbl_VehicleExpencess)
//   List    : SELECT * FROM vw_VehicleExpencessEntry  (direct view, like the VB)
//   One     : header (vw_VehicleExpencessEntry) + vw_VehicleExpencessEntryDetails
//   Save    : sp_VehicleExpencessEntry_AddEdit (scalar -> code)
//             + sp_VehicleExpencessEntryDetails_Delete
//             + loop sp_VehicleExpencessEntryDeatils_Insert  [sic: "Deatils"]
//   Delete  : sp_VehicleExpencessEntry_Delete
//
// NOT company/FY scoped (the VB AddEdit passes neither). Entry No is entered by
// the user (no auto-number). TotalAmount is computed server-side from the rows.
// DB/SP names keep the legacy "Expencess" spelling (and the "Deatils" typo) exactly.
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};
const D = (v) => (v ? new Date(v) : null);

const scalar = async (request, proc) => {
  const r = await request.execute(proc);
  const row = r.recordset?.[0];
  return row ? toInt(Object.values(row)[0]) : 0;
};

// GET /vehicle-expenses-entry/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const [vehicles, expenses] = await Promise.all([
      pool.request().query(
        "SELECT VehicleCode AS value, VehicleName AS label, RegistrationNumber " +
          "FROM tbl_Vehicle WHERE UsageTypeCode = 1 ORDER BY VehicleName"
      ),
      pool.request().query(
        "SELECT VehicleExpencessCode AS value, VehicleExpencessName AS label, OrderNo, Opening " +
          "FROM tbl_VehicleExpencess ORDER BY OrderNo, VehicleExpencessName"
      ),
    ]);
    return sendSuccess(res, {
      vehicles: vehicles.recordset,
      expenses: expenses.recordset,
    });
  } catch (err) {
    console.error("DB Error (VehicleExpensesEntry.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /vehicle-expenses-entry/lists
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .query("SELECT * FROM vw_VehicleExpencessEntry ORDER BY VehicleExpencessEntryCode DESC");
    const data = (r.recordset || []).map((x) => ({ ...x, id: x.VehicleExpencessEntryCode }));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (VehicleExpensesEntry.getList):", err);
    return sendError(res, err);
  }
};

// GET /vehicle-expenses-entry/list/:code
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (!code) return sendError(res, "Invalid code", 400);
    const pool = await getPool(req.headers.subdbname);

    const head = await pool
      .request()
      .input("Code", sql.Int, code)
      .query("SELECT * FROM vw_VehicleExpencessEntry WHERE VehicleExpencessEntryCode = @Code");
    const header = (head.recordset || [])[0];
    if (!header) return sendError(res, "Vehicle Expenses Entry not found", 404);

    const det = await pool
      .request()
      .input("Code", sql.Int, code)
      .query("SELECT * FROM vw_VehicleExpencessEntryDetails WHERE VehicleExpencessEntryCode = @Code");

    return sendSuccess(res, { ...header, details: det.recordset || [] });
  } catch (err) {
    console.error("DB Error (VehicleExpensesEntry.getById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit -> one transaction (header AddEdit + details Delete/Insert).
const saveOrUpdate = async (req, res, isEdit) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const b = req.body || {};
    const entryNo = String(b.VehicleExpencessEntryNo || "").trim();
    const entryDate = D(b.VehicleExpencessEntryDate) || new Date();
    const vehicleCode = toInt(b.VehicleCode);
    // Keep only complete rows (an expense + a positive amount), like the VB loop.
    const rows = (Array.isArray(b.details) ? b.details : []).filter(
      (d) => toInt(d.VehicleExpencessCode) > 0 && toNum(d.Amount) > 0
    );

    // Validation — mirrors the WinForms btnSave.
    if (!entryNo) return sendError(res, "Enter the Entry No", 400);
    if (!vehicleCode) return sendError(res, "Select the Vehicle", 400);
    if (!rows.length) return sendError(res, "Enter the Amount", 400);

    const totalAmount = rows.reduce((s, d) => s + toNum(d.Amount), 0);

    const code = isEdit ? toInt(req.params.code ?? b.VehicleExpencessEntryCode) : 0;
    if (isEdit && !code) return sendError(res, "Invalid code for update", 400);

    const pool = await getPool(req.headers.subdbname);
    tx = new sql.Transaction(pool);
    await tx.begin();

    const head = new sql.Request(tx);
    if (code) head.input("VehicleExpencessEntryCode", sql.Int, code);
    head.input("VehicleExpencessEntryNo", sql.NVarChar, entryNo);
    head.input("VehicleExpencessEntryDate", sql.DateTime, entryDate);
    head.input("VehicleCode", sql.Int, vehicleCode);
    head.input("TotalAmount", sql.Decimal(18, 2), totalAmount);
    head.input("User", sql.Int, toInt(userId));
    head.input("Node", sql.Int, toInt(nodeCode));
    const entryCode = await scalar(head, "sp_VehicleExpencessEntry_AddEdit");

    await new sql.Request(tx)
      .input("VehicleExpencessEntryCode", sql.Int, entryCode)
      .execute("sp_VehicleExpencessEntryDetails_Delete");

    for (const d of rows) {
      await new sql.Request(tx)
        .input("VehicleExpencessEntryCode", sql.Int, entryCode)
        .input("VehicleExpencessCode", sql.Int, toInt(d.VehicleExpencessCode))
        .input("Amount", sql.Decimal(18, 2), toNum(d.Amount))
        .execute("sp_VehicleExpencessEntryDeatils_Insert"); // [sic] legacy proc name
    }

    await tx.commit();
    return sendSuccess(
      res,
      { VehicleExpencessEntryCode: entryCode },
      isEdit ? "The record is Updated" : "The record is Saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (tx) {
      try {
        await tx.rollback();
      } catch (_) {}
    }
    if (err.message && err.message.includes("FK_")) return sendError(res, "Please Check the Entry", 409);
    console.error("DB Error (VehicleExpensesEntry.saveOrUpdate):", err);
    return sendError(res, err);
  }
};

export const create = (req, res) => saveOrUpdate(req, res, false);
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /vehicle-expenses-entry/delete/:code
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (!code) return sendError(res, "Invalid code", 400);
    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("VehicleExpencessEntryCode", sql.Int, code)
      .execute("sp_VehicleExpencessEntry_Delete");
    return sendSuccess(res, { VehicleExpencessEntryCode: code }, "The record is deleted");
  } catch (err) {
    if (err.message && err.message.includes("FK_")) return sendError(res, "You cannot delete this Entry", 409);
    console.error("DB Error (VehicleExpensesEntry.remove):", err);
    return sendError(res, err);
  }
};
