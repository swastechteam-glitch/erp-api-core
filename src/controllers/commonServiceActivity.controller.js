import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Common Service Activity / Schedule Common Update (port of frmCommonServiceActivity)
// One screen shared by two menus via ServiceType:
//   - "M" -> Mechanical Service Activity - Common Update
//   - "E" -> Electrical Service Activity - Common Update  (shows Main Machine)
//
// Flow:
//   1. /departments          -> departments that have active machines
//   2. /service-activities   -> left grid (filter by serviceType + name search)
//   3. /main-machines        -> main-machine dropdown (electrical, optional dept)
//   4. /machine-grid         -> master fields + machine rows (existing=Selected,
//                               addable=not selected) for the chosen activity
//   5. /save                 -> per-row sp_MachineDetails_ServiceSchedule_update
//                               (selected) or _Common_Delete (deselected), in a tx
// CompanyCode comes from the auth token (headers).
// ---------------------------------------------------------------------------

const toDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};
const toBit = (v) => (v === true || v === 1 || v === "1" ? 1 : 0);

// Columns selected from the schedule view (matches the VB grid binding).
const GRID_COLS =
  "MachineCode, MachineName, MachineNo, MachineModel, DurationDays, Speed, LastMaintenanceDate, AdvanceDays, GraceDays, status";

// Normalise an existing (already-scheduled) row -> Selected = true.
const mapExisting = (r) => ({
  Selected: true,
  MachineCode: r.MachineCode,
  MachineName: r.MachineName,
  MachineNo: r.MachineNo,
  MachineModel: r.MachineModel,
  Speed: r.Speed,
  LastMaintenanceDate: r.LastMaintenanceDate,
  DurationDays: r.DurationDays,
  AdvanceDays: r.AdvanceDays,
  GraceDays: r.GraceDays,
  Status: r.status ?? r.Status,
});

// Normalise an addable row (from sp_..._AddMachine) -> Selected = false,
// schedule fields defaulted from the activity master (mirrors the form).
const mapNew = (r, defaults) => ({
  Selected: false,
  MachineCode: r.MachineCode,
  MachineName: r.MachineName,
  MachineNo: r.MachineNo,
  MachineModel: r.MachineModel,
  Speed: r.Speed,
  LastMaintenanceDate: new Date(),
  DurationDays: defaults.DurationDays,
  AdvanceDays: defaults.AdvanceDays,
  GraceDays: defaults.GraceDays,
  Status: r.Status ?? r.status,
});

// GET /common-service-activity/departments
// Departments that own at least one active machine (cmbDepartmentFilter source).
export const getDepartmentsDropdown = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().query(
      `SELECT DepartmentName, ShortName, OrderNo, DepartmentCode
         FROM tbl_Department
        WHERE DepartmentCode IN (SELECT DepartmentCode FROM tbl_Machine WHERE status = 1)
        ORDER BY DepartmentName`
    );
    return sendSuccess(res, result.recordset);
  } catch (err) {
    console.error("DB Error (getDepartmentsDropdown):", err);
    return sendError(res, err);
  }
};

// GET /common-service-activity/service-activities?serviceType=M&search=
// Left grid: service activities for the given type, optional name filter.
export const getServiceActivities = async (req, res) => {
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

    let query =
      "Select ServiceActivityCode, ServiceActivityName from tbl_ServiceActivity where ServiceType = @ServiceType";
    if (search) {
      request.input("Search", sql.NVarChar, `%${search}%`);
      query += " AND ServiceActivityName Like @Search";
    }
    query += " Order by ServiceActivityName";

    const result = await request.query(query);
    return sendSuccess(res, result.recordset);
  } catch (err) {
    console.error("DB Error (getServiceActivities):", err);
    return sendError(res, err);
  }
};

// GET /common-service-activity/main-machines?departmentCode=
// Main-machine dropdown (only meaningful for the Electrical screen).
export const getMainMachines = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const departmentCode = parseInt(req.query.departmentCode) || 0;
    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    let query =
      "Select MainMachineCode, MainMachineName from vw_Machine Where MainMachineName IS NOT NULL";
    if (departmentCode > 0) {
      request.input("DepartmentCode", sql.Int, departmentCode);
      query += " AND DepartmentCode = @DepartmentCode";
    }

    const result = await request.query(query);
    return sendSuccess(res, result.recordset);
  } catch (err) {
    console.error("DB Error (getMainMachines):", err);
    return sendError(res, err);
  }
};

// GET /common-service-activity/machine-grid
//   ?serviceActivityCode=&departmentCode=&mainMachineCode=
// Returns the activity master + the merged machine grid (existing + addable).
export const getMachineGrid = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const serviceActivityCode = parseInt(req.query.serviceActivityCode);
    if (!serviceActivityCode)
      return sendError(res, "serviceActivityCode is required", 400);

    const companyCode = parseInt(req.headers.companyCode);
    const departmentCode = parseInt(req.query.departmentCode) || 0;
    const mainMachineCode = parseInt(req.query.mainMachineCode) || 0;

    const pool = await getPool(req.headers.subdbname);

    // 1) Activity master (header fields).
    const masterRes = await pool
      .request()
      .input("ServiceActivityCode", sql.Int, serviceActivityCode)
      .query(
        "Select * from tbl_ServiceActivity Where ServiceActivityCode = @ServiceActivityCode"
      );
    const m = masterRes.recordset[0] || {};
    const master = {
      ServiceActivityCode: serviceActivityCode,
      ServiceActivityName: m.ServiceActivityName,
      AuthorisedRequired: toBit(m.AuthorisedRequired),
      ExternalServiceRequired: toBit(m.ExternalServiceRequired),
      ScheduleDurationDays: m.ScheduleDurationDays ?? 0,
      GraceDays: m.Tollerence ?? 0, // Tollerence column -> Grace Days on the form
      Status: toBit(m.Status),
    };

    // 2) Existing (already-scheduled) machines -> Selected = true.
    const existReq = pool
      .request()
      .input("ServiceActivityCode", sql.Int, serviceActivityCode);
    let existQuery = `select ${GRID_COLS} from vw_MachineDetails_ServiceSchedule where ServiceActivityCode = @ServiceActivityCode`;
    if (departmentCode > 0) {
      existReq.input("DepartmentCode", sql.Int, departmentCode);
      existQuery += " AND DepartmentCode = @DepartmentCode";
      if (mainMachineCode > 0) {
        existReq.input("MainMachineCode", sql.Int, mainMachineCode);
        existQuery += " AND MainMachineCode = @MainMachineCode";
      }
    } else if (companyCode) {
      existReq.input("CompanyCode", sql.Int, companyCode);
      existQuery += " AND CompanyCode = @CompanyCode";
    }
    const existRes = await existReq.query(existQuery);
    const existing = existRes.recordset.map(mapExisting);

    // Header Advance Days defaults from the first existing row (as in the form).
    const advanceDays =
      existing.length > 0 ? existing[0].AdvanceDays ?? 0 : 0;

    // 3) Addable machines (sp_MachineDetails_ServiceSchedule_AddMachine).
    // NOTE: this SP only accepts @ServiceActivityCode (+ optional dept /
    // main-machine). It does NOT take @CompanyCode, so we never pass it here.
    const addReq = pool
      .request()
      .input("ServiceActivityCode", sql.Int, serviceActivityCode);
    if (departmentCode > 0) {
      addReq.input("DepartmentCode", sql.Int, departmentCode);
      if (mainMachineCode > 0)
        addReq.input("MainMachineCode", sql.Int, mainMachineCode);
    }
    const addRes = await addReq.execute(
      "sp_MachineDetails_ServiceSchedule_AddMachine"
    );
    const newDefaults = {
      DurationDays: master.ScheduleDurationDays,
      AdvanceDays: advanceDays,
      GraceDays: master.GraceDays,
    };
    const addable = addRes.recordset.map((r) => mapNew(r, newDefaults));

    return sendSuccess(res, {
      master,
      advanceDays,
      machines: [...existing, ...addable],
    });
  } catch (err) {
    console.error("DB Error (getMachineGrid):", err);
    return sendError(res, err);
  }
};

// POST /common-service-activity/save
// Body: {
//   serviceActivityCode, serviceType,
//   scheduleDurationDays, advanceDays, graceDays,
//   machines: [{ machineCode, selected, lastMaintenanceDate, status }]
// }
// Selected rows -> sp_MachineDetails_ServiceSchedule_update
// Deselected   -> sp_MachineDetails_ServiceSchedule_Common_Delete   (one transaction)
export const saveCommonUpdate = async (req, res) => {
  let transaction;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const companyCode = parseInt(req.headers.companyCode);
    if (!companyCode)
      return sendError(res, "Missing company context (companyCode)", 400);

    const b = req.body || {};
    const serviceActivityCode = parseInt(b.serviceActivityCode);
    const serviceType = (b.serviceType || "").toString().trim();
    const machines = Array.isArray(b.machines) ? b.machines : [];

    if (!serviceActivityCode)
      return sendError(res, "serviceActivityCode is required", 400);
    if (!serviceType)
      return sendError(res, "serviceType is required (M or E)", 400);
    if (machines.length === 0)
      return sendError(
        res,
        "No Machine is found for common Updation...",
        400
      );

    const durationDays = parseInt(b.scheduleDurationDays) || 0;
    const advanceDays = parseInt(b.advanceDays) || 0;
    const graceDays = parseInt(b.graceDays) || 0;

    const pool = await getPool(req.headers.subdbname);
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    let count = 0;
    for (let i = 0; i < machines.length; i++) {
      const row = machines[i];
      const machineCode = parseInt(row.machineCode ?? row.MachineCode);
      if (!machineCode) continue;

      const selected = row.selected ?? row.Selected;
      if (selected) {
        // Add / update this machine's schedule.
        await new sql.Request(transaction)
          .input("MachineCode", sql.Int, machineCode)
          .input("ServiceActivityCode", sql.Int, serviceActivityCode)
          .input("SNo", sql.Int, i + 1)
          .input("DurationDays", sql.Int, durationDays)
          .input(
            "LastMaintenanceDate",
            sql.DateTime,
            toDate(row.lastMaintenanceDate ?? row.LastMaintenanceDate)
          )
          .input("ServiceType", sql.NVarChar, serviceType)
          .input("AdvanceDays", sql.Int, advanceDays)
          .input("GraceDays", sql.Int, graceDays)
          .input("CompanyCode", sql.Int, companyCode)
          .input("Status", sql.Bit, toBit(row.status ?? row.Status))
          .execute("sp_MachineDetails_ServiceSchedule_update");
        count++;
      } else {
        // Remove this machine from the schedule.
        await new sql.Request(transaction)
          .input("ServiceActivityCode", sql.Int, serviceActivityCode)
          .input("ServiceType", sql.NVarChar, serviceType)
          .input("MachineCode", sql.Int, machineCode)
          .execute("sp_MachineDetails_ServiceSchedule_Common_Delete");
      }
    }

    await transaction.commit();
    return sendSuccess(
      res,
      { updated: count },
      `${count} Machine Records Updated Successful...`
    );
  } catch (err) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (_) {
        /* ignore */
      }
    }
    console.error("DB Error (saveCommonUpdate):", err);
    return sendError(res, err);
  }
};
