import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Machine Service Schedule SETUP (port of frmMachineServiceSchedule).
// Per-machine schedule, shared by two menus via ServiceType ("M" | "E").
//
// Flow:
//   1. /branches / /departments / /service-activities / /uoms / /items  -> dropdowns
//   2. /machines        -> left machine list (sp_MachineServiceSetup_LoadGrid)
//   3. /machine-schedule-> a machine's saved schedule + spare-item rows (View click)
//   4. /activity-items  -> spare items for a chosen activity (cmbServiceActivity change)
//   5. /save            -> wipe + re-insert this machine's schedule + items (one tx)
// CompanyCode comes from the auth token (headers).
// ---------------------------------------------------------------------------

const toDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};
const toBit = (v) => (v === true || v === 1 || v === "1" ? 1 : 0);

// GET /machine-service-schedule/branches
// tbl_Branch has no CompanyCode column, so it isn't filtered by company
// (matches the working branch dropdown in machine.controller.js).
export const getBranches = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .query(
        "SELECT BranchCode, BranchName FROM tbl_Branch ORDER BY BranchName"
      );
    return sendSuccess(res, result.recordset);
  } catch (err) {
    console.error("DB Error (getBranches):", err);
    return sendError(res, err);
  }
};

// GET /machine-service-schedule/departments
// Departments that own at least one active machine (cmbDepartment_Filter).
export const getDepartments = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().query(
      `SELECT DepartmentName, ShortName, OrderNo, DepartmentCode
         FROM tbl_Department
        WHERE Status = 1 AND DepartmentCode IN (SELECT DepartmentCode FROM tbl_Machine WHERE status = 1)
        ORDER BY DepartmentName`
    );
    return sendSuccess(res, result.recordset);
  } catch (err) {
    console.error("DB Error (getDepartments):", err);
    return sendError(res, err);
  }
};

// GET /machine-service-schedule/service-activities?serviceType=M
// Returns ScheduleDurationDays + Tollerence so the form can auto-fill on select.
export const getServiceActivities = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const serviceType = (req.query.serviceType || "").toString().trim();
    if (!serviceType)
      return sendError(res, "serviceType is required (M or E)", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("ServiceType", sql.NVarChar, serviceType)
      .query(
        "Select * from tbl_ServiceActivity where Status = 1 AND servicetype = @ServiceType ORDER BY ServiceActivityName"
      );
    return sendSuccess(res, result.recordset);
  } catch (err) {
    console.error("DB Error (getServiceActivities):", err);
    return sendError(res, err);
  }
};

// GET /machine-service-schedule/uoms
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

// GET /machine-service-schedule/items  -> EXEC sp_Item_GetbyItemName
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

// GET /machine-service-schedule/machines?branchCode=&departmentCode=
// Left machine list -> EXEC sp_MachineServiceSetup_LoadGrid
export const getMachines = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const branchCode = parseInt(req.query.branchCode) || 0;
    const departmentCode = parseInt(req.query.departmentCode) || 0;

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();
    // NOTE: sp_MachineServiceSetup_LoadGrid only accepts @BranchCode /
    // @DepartmentCode in this DB — it has no @CompanyCode parameter.
    if (branchCode > 0) request.input("BranchCode", sql.Int, branchCode);
    if (departmentCode > 0)
      request.input("DepartmentCode", sql.Int, departmentCode);

    const result = await request.execute("sp_MachineServiceSetup_LoadGrid");
    return sendSuccess(res, result.recordset);
  } catch (err) {
    console.error("DB Error (getMachines):", err);
    return sendError(res, err);
  }
};

// GET /machine-service-schedule/machine-schedule?machineCode=&serviceType=
// View click -> machine header + saved schedule grid + saved spare-item grid.
export const getMachineSchedule = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const machineCode = parseInt(req.query.machineCode);
    const serviceType = (req.query.serviceType || "").toString().trim();
    if (!machineCode) return sendError(res, "machineCode is required", 400);
    if (!serviceType)
      return sendError(res, "serviceType is required (M or E)", 400);

    const pool = await getPool(req.headers.subdbname);

    const machineRes = await pool
      .request()
      .input("MachineCode", sql.Int, machineCode)
      .query("Select * from tbl_Machine where machineCode = @MachineCode");
    const machine = machineRes.recordset[0] || null;

    const scheduleRes = await pool
      .request()
      .input("MachineCode", sql.Int, machineCode)
      .input("ServiceType", sql.NVarChar, serviceType)
      .query(
        "Select * from vw_MachineDetails_ServiceSchedule where servicetype = @ServiceType and machineCode = @MachineCode"
      );

    const itemRes = await pool
      .request()
      .input("MachineCode", sql.Int, machineCode)
      .input("ServiceType", sql.NVarChar, serviceType)
      .query(
        "Select * from vw_MachineDetails_ServiceSchedule_Item where servicetype = @ServiceType and machineCode = @MachineCode"
      );

    // 'Status' (Deselect) bit -> Selected flag on each schedule row.
    const schedules = scheduleRes.recordset.map((r) => ({
      ...r,
      Selected: !!r.Status,
    }));

    return sendSuccess(res, {
      machine,
      schedules,
      items: itemRes.recordset,
    });
  } catch (err) {
    console.error("DB Error (getMachineSchedule):", err);
    return sendError(res, err);
  }
};

// GET /machine-service-schedule/activity-items?serviceActivityCode=&machineCode=&serviceType=
// cmbServiceActivity change -> spare items to pre-fill the entry grid.
// = machine-specific items + activity-master items (skipping duplicate ItemCodes).
export const getActivityItems = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const serviceActivityCode = parseInt(req.query.serviceActivityCode);
    const machineCode = parseInt(req.query.machineCode) || 0;
    const serviceType = (req.query.serviceType || "").toString().trim();
    if (!serviceActivityCode)
      return sendError(res, "serviceActivityCode is required", 400);

    const pool = await getPool(req.headers.subdbname);

    // Machine-specific saved items for this activity.
    const machineItemsRes = await pool
      .request()
      .input("ServiceActivityCode", sql.Int, serviceActivityCode)
      .input("MachineCode", sql.Int, machineCode)
      .query(
        "Select * from vw_MachineDetails_ServiceSchedule_Item WHERE ServiceActivityCode = @ServiceActivityCode AND MachineCode = @MachineCode"
      );

    // Activity-master default items.
    const activityItemsRes = await pool
      .request()
      .input("ServiceActivityCode", sql.Int, serviceActivityCode)
      .input("ServiceType", sql.NVarChar, serviceType)
      .query(
        "Select * from vw_ServiceActivityDetails where ServiceActivityCode = @ServiceActivityCode AND ServiceType = @ServiceType"
      );

    const items = machineItemsRes.recordset.map((r) => ({
      ItemCode: r.ItemCode,
      ItemName: r.ItemName,
      UOMCode: r.UOMCode,
      UOMName: r.UOMName,
      Qty: r.Qty,
    }));
    const seen = new Set(items.map((i) => i.ItemCode));
    for (const r of activityItemsRes.recordset) {
      if (seen.has(r.ItemCode)) continue;
      seen.add(r.ItemCode);
      items.push({
        ItemCode: r.ItemCode,
        ItemName: r.ItemName,
        UOMCode: r.UOMCode,
        UOMName: r.UOMName,
        Qty: r.Qty,
      });
    }

    return sendSuccess(res, items);
  } catch (err) {
    console.error("DB Error (getActivityItems):", err);
    return sendError(res, err);
  }
};

// POST /machine-service-schedule/save
// Body: {
//   machineCode, serviceType,
//   schedules: [{ serviceActivityCode, durationDays, lastMaintenanceDate,
//                 advanceDays, graceDays, status, sNo }],
//   items:     [{ serviceActivityCode, itemCode, uomCode, qty }]
// }
// Wipe (sp_..._Delete) then re-insert all items + selected schedules, in one tx.
export const saveMachineSchedule = async (req, res) => {
  let transaction;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = parseInt(req.headers.companyCode);
    if (!companyCode)
      return sendError(res, "Missing company context (companyCode)", 400);

    const b = req.body || {};
    const machineCode = parseInt(b.machineCode);
    const serviceType = (b.serviceType || "").toString().trim();
    const schedules = Array.isArray(b.schedules) ? b.schedules : [];
    const items = Array.isArray(b.items) ? b.items : [];

    if (!machineCode) return sendError(res, "Select Machine...", 400);
    if (!serviceType)
      return sendError(res, "serviceType is required (M or E)", 400);
    if (schedules.length === 0)
      return sendError(res, "select Service Activity Details...", 400);

    const pool = await getPool(req.headers.subdbname);
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // 1) Wipe this machine's existing schedule (+ items handled by the SP/cascade).
    await new sql.Request(transaction)
      .input("MachineCode", sql.Int, machineCode)
      .input("ServiceType", sql.NVarChar, serviceType)
      .execute("sp_MachineDetails_ServiceSchedule_Delete");

    // 2) Re-insert every spare-item row.
    for (const it of items) {
      await new sql.Request(transaction)
        .input("MachineCode", sql.Int, machineCode)
        .input(
          "ServiceActivityCode",
          sql.Int,
          parseInt(it.serviceActivityCode) || 0
        )
        .input("ItemCode", sql.Int, parseInt(it.itemCode) || 0)
        .input("UOMCode", sql.Int, parseInt(it.uomCode) || 0)
        .input("Qty", sql.Decimal(18, 3), parseFloat(it.qty) || 0)
        .input("ServiceType", sql.NVarChar, serviceType)
        .input("CompanyCode", sql.Int, companyCode)
        .execute("sp_MachineDetails_ServiceSchedule_Item_Insert");
    }

    // 3) Re-insert selected (Sel/status ticked) schedule rows.
    let sno = 0;
    for (const s of schedules) {
      if (!toBit(s.status ?? s.Selected)) continue;
      sno++;
      await new sql.Request(transaction)
        .input("MachineCode", sql.Int, machineCode)
        .input("SNo", sql.Int, parseInt(s.sNo) || sno)
        .input(
          "ServiceActivityCode",
          sql.Int,
          parseInt(s.serviceActivityCode) || 0
        )
        .input("DurationDays", sql.Int, parseInt(s.durationDays) || 0)
        .input(
          "LastMaintenanceDate",
          sql.DateTime,
          toDate(s.lastMaintenanceDate)
        )
        .input("AdvanceDays", sql.Int, parseInt(s.advanceDays) || 0)
        .input("GraceDays", sql.Int, parseInt(s.graceDays) || 0)
        .input("ServiceType", sql.NVarChar, serviceType)
        .input("CompanyCode", sql.Int, companyCode)
        .input("Status", sql.Bit, 1)
        .execute("sp_MachineDetails_ServiceSchedule_Insert");
    }

    await transaction.commit();
    return sendSuccess(res, { machineCode }, "Record Saved.....");
  } catch (err) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (_) {
        /* ignore */
      }
    }
    console.error("DB Error (saveMachineSchedule):", err);
    return sendError(res, err);
  }
};
