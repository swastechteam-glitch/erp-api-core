import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Electrical / Mechanical Work Order Complete (port of WinForms frmWorkOrder)
//
// A Work Order "completes" a pending Schedule (SBType 'S') or Break Down
// (SBType 'B'). Shared by Mechanical ('M') and Electrical ('E'); defaults to
// 'E'. Pass ?serviceType=M to reuse it for the Mechanical menu.
//
//   Lookups  : branches / items / uoms / service-activities / breakdown-types /
//              employees (service-by + checked-by) / departments
//   Machines : tbl_Machine (status=1, company, optional branch/department)
//   Activities: sp_ScheduleEntry_GetbyServiceActivityName (@ServiceType)
//   Work no  : sp_WorkOrder_BindNo (@FYCode,@CompanyCode)
//   Pendings : sp_WorkOrder_GetPendings (@ServiceType,@SBType,filters)
//   Pending  : vw_Schedule_BreakDown (header) + vw_Schedule_BreakDownDetails
//   List     : sp_WorkOrder_GetAll (@CompanyCode,@ServiceType) saved work orders
//   One      : header (from GetAll) + vw_WorkOrderDetails
//   Save     : sp_WorkOrder_AddEdit (scalar -> WorkOrderCode) + details
//              _Delete/_Insert; on create also stamps the machine schedule.
//   Bulk     : loops selected pendings, building a work order from each SB.
//   Delete   : sp_WorkOrder_Delete
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
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getFYCode = (req) => toInt(req.headers.FYCode);
const getServiceType = (req) =>
  String(req.query.serviceType || req.body?.ServiceType || "E").toUpperCase() === "M" ? "M" : "E";

const scalar = async (request, proc) => {
  const r = await request.execute(proc);
  const row = r.recordset?.[0];
  return row ? toInt(Object.values(row)[0]) : 0;
};
const scalarRawNo = async (request, proc) => {
  const r = await request.execute(proc);
  const row = r.recordset?.[0];
  return row ? Object.values(row)[0] : null;
};

// =========================================================================
// LOOKUPS
// =========================================================================

// GET /work-order/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    const [branches, items, uoms, serviceActivities, breakdownTypes, employees, departments] = await Promise.all([
      pool.request().input("CompanyCode", sql.Int, companyCode)
        .query("SELECT BranchCode, BranchName FROM tbl_Branch WHERE CompanyCode = @CompanyCode ORDER BY BranchName"),
      pool.request().query("SELECT ItemCode, ItemName, ItemUomCode FROM tbl_Item ORDER BY ItemName"),
      pool.request().query("SELECT ItemUomCode, ItemUomName FROM tbl_ItemUom"),
      pool.request().query("SELECT ServiceActivityCode, ServiceActivityName FROM tbl_ServiceActivity"),
      pool.request().query("SELECT BreakDownMasterCode, BreakDownName FROM tbl_TypeOfBreakDowns"),
      pool.request().input("CompanyCode", sql.Int, companyCode)
        .query("SELECT EmployeeCode, EmployeeName FROM vw_Employee_New WHERE DOL IS NULL AND CompanyCode = @CompanyCode ORDER BY EmployeeName"),
      pool.request().query(
        "SELECT DepartmentName, DepartmentCode FROM tbl_Department " +
          "WHERE DepartmentCode IN (SELECT DepartmentCode FROM tbl_Machine WHERE Status=1) ORDER BY DepartmentName"
      ),
    ]);

    return sendSuccess(res, {
      branches: branches.recordset,
      items: items.recordset,
      uoms: uoms.recordset,
      serviceActivities: serviceActivities.recordset,
      breakdownTypes: breakdownTypes.recordset,
      employees: employees.recordset,
      departments: departments.recordset,
    });
  } catch (err) {
    console.error("DB Error (WorkOrder.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /work-order/machines?branchCode=&departmentCode=
export const getMachines = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const serviceType = getServiceType(req);
    const branchCode = toInt(req.query.branchCode);
    const departmentCode = toInt(req.query.departmentCode);

    let where = "Status = 1 AND CompanyCode = @CompanyCode";
    if (serviceType === "M") where += " AND MachineTypeCode = 1";
    if (branchCode) where += " AND BranchCode = @BranchCode";
    if (departmentCode) where += " AND DepartmentCode = @DepartmentCode";

    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("BranchCode", sql.Int, branchCode)
      .input("DepartmentCode", sql.Int, departmentCode)
      .query(`SELECT MachineCode, MachineName, BranchCode, DepartmentCode FROM tbl_Machine WHERE ${where} ORDER BY MachineName`);
    return sendSuccess(res, r.recordset);
  } catch (err) {
    console.error("DB Error (WorkOrder.getMachines):", err);
    return sendError(res, err);
  }
};

// GET /work-order/activities  (service-activity filter)
export const getActivities = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("ServiceType", sql.NVarChar, getServiceType(req))
      .execute("sp_ScheduleEntry_GetbyServiceActivityName");
    return sendSuccess(res, r.recordset);
  } catch (err) {
    console.error("DB Error (WorkOrder.getActivities):", err);
    return sendError(res, err);
  }
};

// GET /work-order/bind-no
export const getBindNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const no = await scalarRawNo(
      pool
        .request()
        .input("FYCode", sql.Int, getFYCode(req))
        .input("CompanyCode", sql.Int, getCompanyCode(req)),
      "sp_WorkOrder_BindNo"
    );
    return sendSuccess(res, { workOrderNo: no });
  } catch (err) {
    console.error("DB Error (WorkOrder.getBindNo):", err);
    return sendError(res, err);
  }
};

// =========================================================================
// PENDINGS
// =========================================================================

// GET /work-order/pendings?sbType=S|B&branchCode=&departmentCode=&machineCode=&serviceActivityCode=&chkDate=&mainMachineCode=
export const getPendings = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const serviceType = getServiceType(req);
    const sbType = String(req.query.sbType || "S").toUpperCase() === "B" ? "B" : "S";
    const pool = await getPool(req.headers.subdbname);

    const request = pool
      .request()
      .input("ServiceType", sql.NVarChar, serviceType)
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("SBType", sql.NVarChar, sbType);
    if (toInt(req.query.departmentCode)) request.input("DepartmentCode", sql.Int, toInt(req.query.departmentCode));
    if (toInt(req.query.machineCode)) request.input("MachineCode", sql.Int, toInt(req.query.machineCode));
    if (toInt(req.query.serviceActivityCode)) request.input("ServiceActivityCode", sql.Int, toInt(req.query.serviceActivityCode));
    if (toInt(req.query.branchCode)) request.input("BranchCode", sql.Int, toInt(req.query.branchCode));
    if (req.query.chkDate) request.input("ChkDate", sql.Date, D(req.query.chkDate));
    if (toInt(req.query.mainMachineCode)) request.input("MainMachineCode", sql.Int, toInt(req.query.mainMachineCode));

    const r = await request.execute("sp_WorkOrder_GetPendings");
    return sendSuccess(res, (r.recordset || []).map((x, i) => ({ ...x, _rid: x.SBCode ?? i })));
  } catch (err) {
    console.error("DB Error (WorkOrder.getPendings):", err);
    return sendError(res, err);
  }
};

// GET /work-order/pending/:sbCode  -> SB header + spare-item details
export const getPending = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.sbCode);
    if (!code) return sendError(res, "Invalid SBCode", 400);
    const pool = await getPool(req.headers.subdbname);
    const [head, det] = await Promise.all([
      pool.request().input("SBCode", sql.Int, code).query("SELECT * FROM vw_Schedule_BreakDown WHERE SBCode = @SBCode"),
      pool.request().input("SBCode", sql.Int, code).query("SELECT * FROM vw_Schedule_BreakDownDetails WHERE SBCode = @SBCode"),
    ]);
    return sendSuccess(res, { ...(head.recordset?.[0] || {}), details: det.recordset || [] });
  } catch (err) {
    console.error("DB Error (WorkOrder.getPending):", err);
    return sendError(res, err);
  }
};

// =========================================================================
// SAVED WORK ORDERS (list / one)
// =========================================================================

// GET /work-order/lists
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("ServiceType", sql.NVarChar, getServiceType(req))
      .execute("sp_WorkOrder_GetAll");
    const data = (r.recordset || []).sort((a, b) => b.WorkOrderCode - a.WorkOrderCode).map((x) => ({ ...x, id: x.WorkOrderCode }));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (WorkOrder.getList):", err);
    return sendError(res, err);
  }
};

// GET /work-order/list/:workOrderCode
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.workOrderCode);
    if (!code) return sendError(res, "Invalid WorkOrderCode", 400);
    const pool = await getPool(req.headers.subdbname);
    const head = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("ServiceType", sql.NVarChar, getServiceType(req))
      .execute("sp_WorkOrder_GetAll");
    const header = (head.recordset || []).find((r) => r.WorkOrderCode === code);
    if (!header) return sendError(res, "Work Order not found", 404);
    const det = await pool
      .request()
      .input("WorkOrderCode", sql.Int, code)
      .query("SELECT * FROM vw_WorkOrderDetails WHERE WorkOrderCode = @WorkOrderCode");
    return sendSuccess(res, { ...header, details: det.recordset || [] });
  } catch (err) {
    console.error("DB Error (WorkOrder.getById):", err);
    return sendError(res, err);
  }
};

// =========================================================================
// SAVE
// =========================================================================

// Build one work order inside an open transaction. `h` carries the resolved
// header values; `lines` are {ItemCode,UOMCode,Qty}. Returns WorkOrderCode.
const buildWorkOrder = async (tx, ctx, h, lines) => {
  const { companyCode, fyCode, serviceType, userId, nodeCode } = ctx;

  const head = new sql.Request(tx);
  if (h.workOrderCode) head.input("WorkOrderCode", sql.Int, h.workOrderCode);
  head.input("SBCode", sql.Int, h.sbCode);
  head.input("WorkOrderNo", sql.Int, h.workOrderNo);
  head.input("WorkOrderDate", sql.DateTime, h.workOrderDate);
  head.input("JobCardNo", sql.Int, h.jobCardNo);
  head.input("ScheduleDate", sql.DateTime, h.scheduleDate);
  head.input("LastPreMainDoneDate", sql.DateTime, h.lastPreMainDoneDate);
  head.input("Duration", sql.Int, h.duration);
  head.input("SBType", sql.NVarChar, h.sbType);
  head.input("NextServiceDate", sql.DateTime, h.nextServiceDate);
  if (h.sbType === "S" && h.serviceActivityCode > 0) head.input("ServiceActivityCode", sql.Int, h.serviceActivityCode);
  if (h.sbType === "B" && h.breakDownMasterCode > 0) head.input("BreakDownMasterCode", sql.Int, h.breakDownMasterCode);
  head.input("MachineCode", sql.Int, h.machineCode);
  head.input("BranchCode", sql.Int, h.branchCode);
  head.input("DepartmentCode", sql.Int, h.departmentCode);
  head.input("Reason", sql.NVarChar, (h.reason || "").toString().trim());
  head.input("ServiceByCode", sql.Int, h.serviceByCode);
  head.input("CheckedbyCode", sql.Int, h.checkedByCode);
  head.input("ServiceType", sql.NVarChar, serviceType);
  head.input("FYCode", sql.Int, fyCode);
  head.input("CompanyCode", sql.Int, companyCode);
  head.input("User", sql.Int, toInt(userId));
  head.input("Node", sql.Int, toInt(nodeCode));
  const workOrderCode = await scalar(head, "sp_WorkOrder_AddEdit");

  await new sql.Request(tx)
    .input("WorkOrderCode", sql.Int, workOrderCode)
    .input("CompanyCode", sql.Int, companyCode)
    .execute("sp_WorkOrderDetails_Delete");

  for (const ln of lines) {
    const itemCode = toInt(ln.ItemCode);
    const uomCode = toInt(ln.UOMCode ?? ln.ItemUomCode);
    const qty = toNum(ln.Qty);
    if (!itemCode || qty <= 0) continue;
    await new sql.Request(tx)
      .input("WorkOrderCode", sql.Int, workOrderCode)
      .input("ItemCode", sql.Int, itemCode)
      .input("UOMCode", sql.Int, uomCode)
      .input("Qty", sql.Decimal(18, 3), qty)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_WorkOrderDetails_Insert");
  }

  // On create, stamp the machine's service schedule (port of the VB update).
  if (!h.workOrderCode) {
    await new sql.Request(tx)
      .input("DurationDays", sql.Int, h.duration)
      .input("LastMaintenanceDate", sql.DateTime, h.workOrderDate)
      .input("MachineCode", sql.Int, h.machineCode)
      .input("ServiceActivityCode", sql.Int, h.sbType === "S" ? h.serviceActivityCode : 0)
      .query(
        "UPDATE tbl_MachineDetails_ServiceSchedule SET DurationDays=@DurationDays, LastMaintenanceDate=@LastMaintenanceDate " +
          "WHERE MachineCode=@MachineCode AND ServiceActivityCode=@ServiceActivityCode"
      );
  }

  return workOrderCode;
};

const saveOrUpdate = async (req, res, isEdit) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    const companyCode = getCompanyCode(req);
    const fyCode = getFYCode(req);
    const serviceType = getServiceType(req);
    if (!userId || !nodeCode) return sendError(res, "Missing user context (userId / nodeCode)", 400);
    if (!companyCode) return sendError(res, "Missing company context", 400);

    const b = req.body || {};
    const machineCode = toInt(b.MachineCode);
    const departmentCode = toInt(b.DepartmentCode);
    const serviceByCode = toInt(b.ServiceByCode);
    const checkedByCode = toInt(b.CheckedbyCode);

    // Validation — mirrors the WinForms btnSave (single mode).
    if (!machineCode) return sendError(res, "Select the Machine Name", 400);
    if (!departmentCode) return sendError(res, "Select the Department Name", 400);
    if (!serviceByCode) return sendError(res, "Select the Service by Name", 400);
    if (!checkedByCode) return sendError(res, "Select the Checked by Name", 400);

    const code = isEdit ? toInt(req.params.workOrderCode ?? b.WorkOrderCode) : 0;
    if (isEdit && !code) return sendError(res, "Invalid WorkOrderCode for update", 400);

    const pool = await getPool(req.headers.subdbname);

    // Fresh work-order number on create (Bind_No).
    const workOrderNo = isEdit
      ? toInt(b.WorkOrderNo)
      : toInt(
          await scalarRawNo(
            pool.request().input("FYCode", sql.Int, fyCode).input("CompanyCode", sql.Int, companyCode),
            "sp_WorkOrder_BindNo"
          )
        );

    const workOrderDate = D(b.WorkOrderDate) || new Date();
    const duration = toInt(b.Duration);
    const nextServiceDate = D(b.NextServiceDate) || workOrderDate;

    tx = new sql.Transaction(pool);
    await tx.begin();
    const ctx = { companyCode, fyCode, serviceType, userId, nodeCode };
    const workOrderCode = await buildWorkOrder(
      tx,
      ctx,
      {
        workOrderCode: code,
        sbCode: toInt(b.SBCode),
        workOrderNo,
        workOrderDate,
        jobCardNo: toInt(b.JobCardNo),
        scheduleDate: D(b.ScheduleDate) || workOrderDate,
        lastPreMainDoneDate: D(b.LastPreMainDoneDate) || workOrderDate,
        duration,
        sbType: String(b.SBType || "S").toUpperCase() === "B" ? "B" : "S",
        nextServiceDate,
        serviceActivityCode: toInt(b.ServiceActivityCode),
        breakDownMasterCode: toInt(b.BreakDownMasterCode),
        machineCode,
        branchCode: toInt(b.BranchCode),
        departmentCode,
        reason: b.Reason,
        serviceByCode,
        checkedByCode,
      },
      Array.isArray(b.details) ? b.details : []
    );
    await tx.commit();

    return sendSuccess(
      res,
      { WorkOrderCode: workOrderCode, WorkOrderNo: workOrderNo },
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (tx) {
      try {
        await tx.rollback();
      } catch (_) {}
    }
    if (err.message && err.message.includes("UK_tbl_Schedule")) return sendError(res, "Please Check the Entry", 409);
    console.error("DB Error (WorkOrder.saveOrUpdate):", err);
    return sendError(res, err);
  }
};

export const create = (req, res) => saveOrUpdate(req, res, false);
export const update = (req, res) => saveOrUpdate(req, res, true);

// POST /work-order/create-bulk  { sbCodes:[], sbType, serviceType, WorkOrderDate, ServiceByCode, CheckedbyCode, Reason }
// Mirrors the "Multiple" path: build a work order from each selected pending.
export const createBulk = async (req, res) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    const companyCode = getCompanyCode(req);
    const fyCode = getFYCode(req);
    const serviceType = getServiceType(req);
    if (!userId || !nodeCode) return sendError(res, "Missing user context (userId / nodeCode)", 400);
    if (!companyCode) return sendError(res, "Missing company context", 400);

    const b = req.body || {};
    const sbCodes = Array.isArray(b.sbCodes) ? b.sbCodes.map(toInt).filter(Boolean) : [];
    const serviceByCode = toInt(b.ServiceByCode);
    const checkedByCode = toInt(b.CheckedbyCode);
    if (!sbCodes.length) return sendError(res, "Select at least one pending row", 400);
    if (!serviceByCode) return sendError(res, "Select the Service by Name", 400);
    if (!checkedByCode) return sendError(res, "Select the Checked by Name", 400);

    const sbType = String(b.sbType || "S").toUpperCase() === "B" ? "B" : "S";
    const workOrderDate = D(b.WorkOrderDate) || new Date();
    const pool = await getPool(req.headers.subdbname);
    const ctx = { companyCode, fyCode, serviceType, userId, nodeCode };
    const created = [];

    tx = new sql.Transaction(pool);
    await tx.begin();
    for (const sbCode of sbCodes) {
      const [head, det] = await Promise.all([
        new sql.Request(tx).input("SBCode", sql.Int, sbCode).query("SELECT * FROM vw_Schedule_BreakDown WHERE SBCode = @SBCode"),
        new sql.Request(tx).input("SBCode", sql.Int, sbCode).query("SELECT * FROM vw_Schedule_BreakDownDetails WHERE SBCode = @SBCode"),
      ]);
      const sb = head.recordset?.[0];
      if (!sb) continue;

      const workOrderNo = toInt(
        await scalarRawNo(
          new sql.Request(tx).input("FYCode", sql.Int, fyCode).input("CompanyCode", sql.Int, companyCode),
          "sp_WorkOrder_BindNo"
        )
      );
      const duration = toInt(sb.Duration);
      const lastDate = D(sb.LastPreMainDoneDate) || D(sb.BreakDownDate) || workOrderDate;
      const woCode = await buildWorkOrder(
        tx,
        ctx,
        {
          workOrderCode: 0,
          sbCode,
          workOrderNo,
          workOrderDate,
          jobCardNo: toInt(sb.SBJobCardNo),
          scheduleDate: D(sb.SBDate) || workOrderDate,
          lastPreMainDoneDate: lastDate,
          duration,
          sbType,
          nextServiceDate: D(sb.NextServiceDate) || workOrderDate,
          serviceActivityCode: toInt(sb.ServiceActivityCode),
          breakDownMasterCode: toInt(sb.BreakDownMasterCode),
          machineCode: toInt(sb.MachineCode),
          branchCode: toInt(sb.BranchCode),
          departmentCode: toInt(sb.DepartmentCode),
          reason: b.Reason,
          serviceByCode,
          checkedByCode,
        },
        (det.recordset || []).filter((d) => toInt(d.ItemCode) > 0)
      );
      created.push(woCode);
    }
    await tx.commit();
    return sendSuccess(res, { created }, "The record is saved", 201);
  } catch (err) {
    if (tx) {
      try {
        await tx.rollback();
      } catch (_) {}
    }
    console.error("DB Error (WorkOrder.createBulk):", err);
    return sendError(res, err);
  }
};

// DELETE /work-order/delete/:workOrderCode
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.workOrderCode);
    if (!code) return sendError(res, "Invalid WorkOrderCode", 400);
    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("WorkOrderCode", sql.Int, code)
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_WorkOrder_Delete");
    return sendSuccess(res, { WorkOrderCode: code }, "The record is deleted");
  } catch (err) {
    if (err.message && err.message.includes("FK_")) return sendError(res, "You cannot delete this Work Order", 409);
    console.error("DB Error (WorkOrder.remove):", err);
    return sendError(res, err);
  }
};
