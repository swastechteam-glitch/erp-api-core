import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Electrical / Mechanical Schedule Entry (port of WinForms frmSchedule, SBType 'S')
//
// The WinForms screen is shared by Mechanical (ServiceType 'M') and Electrical
// ('E'). This controller defaults to 'E' (the Electrical Schedule Entry menu);
// pass ?serviceType=M to reuse it for Mechanical.
//
//   Lookups   : branches / uoms / items / service activities / departments
//   Machines  : tbl_Machine (status=1, company, optional branch/department)
//   Job no    : sp_Schedule_BreakDown_BindNo
//   Pendings  : sp_Schedule_Pendings (Today / Pending / NextService / Tonnage)
//   Activity  : vw_MachineDetails_ServiceSchedule_Item (default spares for a PM)
//   Stock     : sp_Stock_Statement (closing qty + value -> avg rate)
//   List      : sp_Schedule_BreakDown_GetAll_EditScreen
//   One       : header (from list) + vw_Schedule_BreakDownDetails rows
//   Save      : sp_Schedule_BreakDown_AddEdit (scalar -> SBCode) then
//               sp_Schedule_BreakDownDetails_Delete + _Insert per row, all in a
//               transaction. On create, when tbl_Setting.AUTOIndent = 1, it also
//               raises an Item Indent (Indent_Qty>0) and an Item Requisition
//               (Requisition_Qty>0) exactly like the VB form.
//   Delete    : sp_Schedule_BreakDown_Delete
//
// Company from req.headers.companyCode, FY from req.headers.FYCode; user/node
// from req.headers.userId / nodeCode.
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
  String(req.query.serviceType || req.body?.ServiceType || "E").toUpperCase() === "M"
    ? "M"
    : "E";

// Run a proc/query that returns a single scalar (first column of first row).
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

// GET /electrical-schedule/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    const [branches, uoms, items, activities, departments] = await Promise.all([
      pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .query(
          "SELECT BranchCode, BranchName FROM tbl_Branch WHERE CompanyCode = @CompanyCode ORDER BY BranchName"
        ),
      pool.request().query("SELECT ItemUomCode, ItemUomName FROM tbl_ItemUom"),
      pool
        .request()
        .query("SELECT ItemCode, ItemName, ItemUomCode FROM tbl_Item ORDER BY ItemName"),
      pool
        .request()
        .query(
          "SELECT ServiceActivityCode, ServiceActivityName FROM tbl_ServiceActivity ORDER BY ServiceActivityName"
        ),
      pool
        .request()
        .query(
          "SELECT DepartmentCode, DepartmentName FROM tbl_Department " +
            "WHERE DepartmentCode IN (SELECT DepartmentCode FROM tbl_Machine WHERE status=1) ORDER BY DepartmentName"
        ),
    ]);

    return sendSuccess(res, {
      branches: branches.recordset,
      uoms: uoms.recordset,
      items: items.recordset,
      serviceActivities: activities.recordset,
      departments: departments.recordset,
    });
  } catch (err) {
    console.error("DB Error (Schedule.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /electrical-schedule/machines?branchCode=&departmentCode=
export const getMachines = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const serviceType = getServiceType(req);
    const branchCode = toInt(req.query.branchCode);
    const departmentCode = toInt(req.query.departmentCode);

    let where = "Status = 1 AND CompanyCode = @CompanyCode";
    // Mechanical schedule only lists MachineTypeCode = 1 (the VB filter).
    if (serviceType === "M") where += " AND MachineTypeCode = 1";
    if (branchCode) where += " AND BranchCode = @BranchCode";
    if (departmentCode) where += " AND DepartmentCode = @DepartmentCode";

    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("BranchCode", sql.Int, branchCode)
      .input("DepartmentCode", sql.Int, departmentCode)
      .query(
        `SELECT MachineCode, MachineName, BranchCode, DepartmentCode FROM tbl_Machine WHERE ${where} ORDER BY MachineName`
      );
    return sendSuccess(res, r.recordset);
  } catch (err) {
    console.error("DB Error (Schedule.getMachines):", err);
    return sendError(res, err);
  }
};

// GET /electrical-schedule/job-card-no
export const getJobCardNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const no = await scalarRawNo(
      pool
        .request()
        .input("FYCode", sql.Int, getFYCode(req))
        .input("SBType", sql.NVarChar, "S")
        .input("ServiceType", sql.NVarChar, getServiceType(req))
        .input("CompanyCode", sql.Int, getCompanyCode(req)),
      "sp_Schedule_BreakDown_BindNo"
    );
    return sendSuccess(res, { jobCardNo: no });
  } catch (err) {
    console.error("DB Error (Schedule.getJobCardNo):", err);
    return sendError(res, err);
  }
};

// GET /electrical-schedule/pendings?type=today|pending|nextservice|tonnage&branchCode=&replacement=
export const getPendings = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const serviceType = getServiceType(req);
    const type = String(req.query.type || "today").toLowerCase();
    const branchCode = toInt(req.query.branchCode);
    const replacement = req.query.replacement === "1" || req.query.replacement === "true";

    // Date window — mirrors the radio buttons in the WinForms filter.
    const today = new Date();
    let fromDate = null;
    let toDate = null;
    if (type === "today") {
      fromDate = today;
      toDate = today;
    } else if (type === "pending") {
      fromDate = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
      toDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    } else if (type === "nextservice") {
      // The SP handles the next-service window itself; no date range is passed.
      fromDate = null;
      toDate = null;
    } else if (type === "tonnage") {
      fromDate = today;
      toDate = today;
    }

    const pool = await getPool(req.headers.subdbname);
    const request = pool
      .request()
      .input("ServiceType", sql.NVarChar, serviceType)
      .input("CompanyCode", sql.Int, companyCode);

    if (type !== "nextservice") {
      request.input("Fromdate", sql.Date, fromDate);
      request.input("Todate", sql.Date, toDate);
    }
    if (branchCode) request.input("BranchCode", sql.Int, branchCode);
    if (replacement) request.input("Replacement", sql.Int, 1);
    if (type === "pending") request.input("Pending", sql.Int, 1);
    if (type === "today") request.input("Today", sql.Int, 1);
    if (type === "nextservice") request.input("NextService", sql.Int, 1);
    if (type === "tonnage") request.input("Tonnage", sql.Int, 1);

    const r = await request.execute("sp_Schedule_Pendings");
    return sendPaginated(res, r.recordset, req.query);
  } catch (err) {
    console.error("DB Error (Schedule.getPendings):", err);
    return sendError(res, err);
  }
};

// GET /electrical-schedule/activity-items?machineCode=&serviceActivityCode=
// The default spares list for a machine + PM activity (vw_MachineDetails_ServiceSchedule_Item).
export const getActivityItems = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const machineCode = toInt(req.query.machineCode);
    const serviceActivityCode = toInt(req.query.serviceActivityCode);
    if (!machineCode || !serviceActivityCode)
      return sendError(res, "machineCode and serviceActivityCode are required", 400);

    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("ServiceActivityCode", sql.Int, serviceActivityCode)
      .input("MachineCode", sql.Int, machineCode)
      .query(
        "SELECT * FROM vw_MachineDetails_ServiceSchedule_Item " +
          "WHERE ServiceActivityCode = @ServiceActivityCode AND MachineCode = @MachineCode"
      );
    return sendSuccess(res, r.recordset.filter((x) => x.ItemCode != null));
  } catch (err) {
    console.error("DB Error (Schedule.getActivityItems):", err);
    return sendError(res, err);
  }
};

// Closing stock qty + average rate for an item as of `date` (port of the VB
// stock loop over sp_Stock_Statement). Falls back to the item's PurchaseCost.
const getStockInfo = async (pool, companyCode, itemCode, date) => {
  const d = date || new Date();
  const r = await pool
    .request()
    .input("CompanyCode", sql.Int, companyCode)
    .input("FromDate", sql.Date, d)
    .input("ToDate", sql.Date, d)
    .input("ItemCode", sql.Int, itemCode)
    .execute("sp_Stock_Statement");

  let qty = 0;
  let value = 0;
  for (const row of r.recordset || []) {
    qty += toNum(row.Closing);
    value += toNum(row.ClosingValue);
  }
  let rate = qty > 0 ? value / qty : 0;
  if (rate <= 0) {
    const it = await pool
      .request()
      .input("ItemCode", sql.Int, itemCode)
      .query("SELECT TOP 1 ISNULL(PurchaseCost,0) AS PurchaseCost FROM tbl_Item WHERE ItemCode = @ItemCode");
    rate = toNum(it.recordset?.[0]?.PurchaseCost);
  }
  return { stockQty: qty, rate };
};

// GET /electrical-schedule/stock?itemCode=&date=
// Lets the UI show live stock + the indent/requisition split as the VB does.
export const getStock = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const itemCode = toInt(req.query.itemCode);
    if (!itemCode) return sendError(res, "itemCode is required", 400);
    const pool = await getPool(req.headers.subdbname);
    const info = await getStockInfo(pool, getCompanyCode(req), itemCode, D(req.query.date));
    return sendSuccess(res, info);
  } catch (err) {
    console.error("DB Error (Schedule.getStock):", err);
    return sendError(res, err);
  }
};

// =========================================================================
// LIST / ONE
// =========================================================================

// GET /electrical-schedule/lists
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("FyCode", sql.Int, getFYCode(req))
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("SBType", sql.NVarChar, "S")
      .input("ServiceType", sql.NVarChar, getServiceType(req))
      .execute("sp_Schedule_BreakDown_GetAll_EditScreen");

    const data = (r.recordset || [])
      .sort((a, b) => b.SBCode - a.SBCode)
      .map((x) => ({ ...x, id: x.SBCode }));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (Schedule.getList):", err);
    return sendError(res, err);
  }
};

// GET /electrical-schedule/list/:sbCode  -> header + detail rows
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.sbCode);
    if (!code) return sendError(res, "Invalid SBCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const head = await pool
      .request()
      .input("FyCode", sql.Int, getFYCode(req))
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("SBType", sql.NVarChar, "S")
      .input("ServiceType", sql.NVarChar, getServiceType(req))
      .execute("sp_Schedule_BreakDown_GetAll_EditScreen");
    const header = (head.recordset || []).find((r) => r.SBCode === code);
    if (!header) return sendError(res, "Schedule not found", 404);

    const det = await pool
      .request()
      .input("SBCode", sql.Int, code)
      .query("SELECT * FROM vw_Schedule_BreakDownDetails WHERE sbCode = @SBCode");

    return sendSuccess(res, { ...header, details: det.recordset || [] });
  } catch (err) {
    console.error("DB Error (Schedule.getById):", err);
    return sendError(res, err);
  }
};

// =========================================================================
// SAVE (create / update) — header + details (+ optional auto indent/requisition)
// =========================================================================

const COST_HEAD_NAME = (serviceType) => (serviceType === "M" ? "MECHANICAL" : "ELECTRICAL");
const DOC_TYPE = (serviceType, kind) =>
  `${serviceType === "M" ? "M" : "E"}_Schedule_${kind}`; // kind: INDENT | ReQuisition

const saveOrUpdate = async (req, res, isEdit) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    const companyCode = getCompanyCode(req);
    const fyCode = getFYCode(req);
    const serviceType = getServiceType(req);
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);
    if (!companyCode) return sendError(res, "Missing company context", 400);

    const b = req.body || {};
    const branchCode = toInt(b.BranchCode);
    const machineCode = toInt(b.MachineCode);
    const departmentCode = toInt(b.DepartmentCode);
    const serviceActivityCode = toInt(b.ServiceActivityCode);
    const duration = toInt(b.Duration);
    const scheduleDate = D(b.SBDate) || new Date();
    const lastPMDate = D(b.LastPreMainDoneDate) || scheduleDate;
    const nextServiceDate = D(b.NextServiceDate) || scheduleDate;
    const rows = Array.isArray(b.details) ? b.details : [];

    // Validation — mirrors the WinForms btnSave checks.
    if (!branchCode) return sendError(res, "Select the Branch", 400);
    if (!machineCode) return sendError(res, "Select the Machine Name", 400);
    if (!departmentCode) return sendError(res, "Select the Department Name", 400);
    if (!serviceActivityCode) return sendError(res, "Select the Service Activity Name", 400);
    if (!duration) return sendError(res, "Please Check the Duration Days", 400);

    const code = isEdit ? toInt(req.params.sbCode ?? b.SBCode) : 0;
    if (isEdit && !code) return sendError(res, "Invalid SBCode for update", 400);

    const pool = await getPool(req.headers.subdbname);

    // Resolve cost head once for the document set.
    const costHeadRes = await pool
      .request()
      .input("Name", sql.NVarChar, COST_HEAD_NAME(serviceType))
      .query("SELECT TOP 1 CostHeadCode FROM tbl_CostHead WHERE Status = 1 AND CostHeadName = @Name");
    const costHeadCode = toInt(costHeadRes.recordset?.[0]?.CostHeadCode);

    // Compute each line's rate + indent/requisition split from live stock,
    // exactly like the VB btnAdd: in-stock qty -> indent, shortfall -> requisition.
    const lines = [];
    for (const row of rows) {
      const itemCode = toInt(row.ItemCode);
      const uomCode = toInt(row.UOMCode ?? row.ItemUomCode);
      const qty = toNum(row.Qty);
      if (!itemCode || qty <= 0) continue;

      const { stockQty, rate } = await getStockInfo(pool, companyCode, itemCode, scheduleDate);
      let indentQty = 0;
      let requisitionQty = 0;
      if (stockQty > qty) {
        indentQty = qty;
      } else if (stockQty <= 0) {
        requisitionQty = qty;
      } else {
        indentQty = stockQty;
        requisitionQty = qty - stockQty;
      }
      const documentType = DOC_TYPE(serviceType, indentQty > 0 ? "INDENT" : "ReQuisition");

      lines.push({
        itemCode,
        uomCode,
        qty,
        rate: toNum(row.Rate) || rate,
        indentQty,
        requisitionQty,
        documentType,
        qtyStatus: (row.Qty_Status || "NEW").toString(),
      });
    }

    // Job card number is generated fresh on create.
    const jobCardNo = isEdit
      ? toInt(b.SBJobCardNo)
      : toInt(
          await scalarRawNo(
            pool
              .request()
              .input("FYCode", sql.Int, fyCode)
              .input("SBType", sql.NVarChar, "S")
              .input("ServiceType", sql.NVarChar, serviceType)
              .input("CompanyCode", sql.Int, companyCode),
            "sp_Schedule_BreakDown_BindNo"
          )
        );

    // Should we also raise indent / requisition documents? (tbl_Setting.AUTOIndent)
    const autoRes = await pool
      .request()
      .query("SELECT TOP 1 ISNULL(AUTOIndent,0) AS AUTOIndent FROM tbl_Setting WHERE AUTOIndent = 1");
    const autoIndent = (autoRes.recordset || []).length > 0 && !isEdit;

    let issueApproval1 = 0;
    let issueApproval2 = 0;
    let employeeCode = 0;
    if (autoIndent) {
      const setting = await pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .query(
          "SELECT TOP 1 ISNULL(IssueApproval1_Value,0) AS A1, ISNULL(IssueApproval2_Value,0) AS A2 FROM tbl_Setting WHERE CompanyCode = @CompanyCode"
        );
      issueApproval1 = toNum(setting.recordset?.[0]?.A1);
      issueApproval2 = toNum(setting.recordset?.[0]?.A2);
      const emp = await pool
        .request()
        .input("UserCode", sql.Int, toInt(userId))
        .query("SELECT TOP 1 EmployeeCode FROM tbl_User WHERE UserCode = @UserCode AND EmployeeCode IS NOT NULL");
      employeeCode = toInt(emp.recordset?.[0]?.EmployeeCode);
    }

    tx = new sql.Transaction(pool);
    await tx.begin();

    // ---- schedule header ----
    const head = new sql.Request(tx);
    if (code) head.input("SBCode", sql.Int, code);
    head.input("SBJobCardNo", sql.Int, jobCardNo);
    head.input("SBDate", sql.DateTime, scheduleDate);
    head.input("BranchCode", sql.Int, branchCode);
    head.input("SBType", sql.NVarChar, "S");
    head.input("LastPreMainDoneDate", sql.DateTime, lastPMDate);
    head.input("ServiceActivityCode", sql.Int, serviceActivityCode);
    head.input("MachineCode", sql.Int, machineCode);
    head.input("DepartmentCode", sql.Int, departmentCode);
    head.input("BreakDownMasterCode", sql.Int, 0);
    head.input("Reason", sql.NVarChar, (b.Reason || b.Remarks || "").toString().trim());
    head.input("FYCode", sql.Int, fyCode);
    head.input("ServiceType", sql.NVarChar, serviceType);
    head.input("Duration", sql.Int, duration);
    head.input("NextServiceDate", sql.DateTime, nextServiceDate);
    head.input("CompanyCode", sql.Int, companyCode);
    head.input("User", sql.Int, toInt(userId));
    head.input("Node", sql.Int, toInt(nodeCode));
    if (b.Replacement === 1 || b.Replacement === true || b.Replacement === "1")
      head.input("Replacement", sql.Int, 1);
    const sbCode = await scalar(head, "sp_Schedule_BreakDown_AddEdit");

    // ---- schedule details ----
    await new sql.Request(tx)
      .input("SBCode", sql.Int, sbCode)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_Schedule_BreakDownDetails_Delete");

    for (const ln of lines) {
      await new sql.Request(tx)
        .input("SBCode", sql.Int, sbCode)
        .input("CompanyCode", sql.Int, companyCode)
        .input("ItemCode", sql.Int, ln.itemCode)
        .input("UOMCode", sql.Int, ln.uomCode)
        .input("Qty", sql.Decimal(18, 3), ln.qty)
        .input("DocumentType", sql.NVarChar, ln.documentType)
        .input("Qty_Status", sql.NVarChar, ln.qtyStatus)
        .input("Indent_Qty", sql.Decimal(18, 3), ln.indentQty)
        .input("Requisition_Qty", sql.Decimal(18, 3), ln.requisitionQty)
        .input("Rate", sql.Decimal(18, 3), ln.rate)
        .execute("sp_Schedule_BreakDownDetails_Insert");
    }

    // ---- optional auto Indent ('I') + Requisition ('R') documents ----
    if (autoIndent) {
      const indentLines = lines.filter((l) => l.indentQty > 0);
      const reqLines = lines.filter((l) => l.requisitionQty > 0);

      const buildReqDoc = async (reqType, docLines, qtyOf) => {
        const totalQty = docLines.reduce((s, l) => s + qtyOf(l), 0);
        if (totalQty <= 0) return;
        const reqNo = toInt(
          await scalarRawNo(
            new sql.Request(tx)
              .input("CompanyCode", sql.Int, companyCode)
              .input("FYCode", sql.Int, fyCode)
              .input("RequisitionType", sql.NVarChar, reqType),
            "sp_ItemRequisition_ItemRequisitionNo"
          )
        );
        const prefix = reqType === "I" ? "IND" : "REQ";
        const strNo = `${prefix}${reqNo}`;

        const reqHead = new sql.Request(tx);
        reqHead.input("ItemRequisitionDate", sql.DateTime, scheduleDate);
        reqHead.input("ItemRequisitionNo", sql.Int, reqNo);
        reqHead.input("RequisitionType", sql.NVarChar, reqType);
        reqHead.input("strItemRequisitionNo", sql.NVarChar, strNo);
        reqHead.input("TotalQty", sql.Decimal(18, 3), totalQty);
        reqHead.input("CommittedDate", sql.DateTime, new Date());
        reqHead.input("Remarks", sql.NVarChar, (b.Reason || b.Remarks || "").toString().trim());
        reqHead.input("FYCode", sql.Int, fyCode);
        reqHead.input("CompanyCode", sql.Int, companyCode);
        reqHead.input("User", sql.Int, toInt(userId));
        reqHead.input("Node", sql.Int, toInt(nodeCode));
        const reqCode = await scalar(reqHead, "sp_ItemRequisition_AddEdit");

        await new sql.Request(tx)
          .input("ItemRequisitionCode", sql.Int, reqCode)
          .input("CompanyCode", sql.Int, companyCode)
          .execute("sp_ItemRequisitionDetails_Delete");

        let sno = 0;
        for (const l of docLines) {
          sno += 1;
          const r = new sql.Request(tx);
          r.input("ItemRequisitionCode", sql.Int, reqCode);
          r.input("SNo", sql.Int, sno);
          r.input("CostHeadCode", sql.Int, costHeadCode);
          r.input("DepartmentCode", sql.Int, departmentCode);
          r.input("MachineCode", sql.Int, machineCode);
          r.input("EmployeeCode", sql.Int, employeeCode);
          r.input("ItemCode", sql.Int, l.itemCode);
          r.input("ItemUomCode", sql.Int, l.uomCode);
          r.input("Qty", sql.Decimal(18, 3), qtyOf(l));
          r.input("CommittedDate", sql.DateTime, new Date());
          r.input("CompanyCode", sql.Int, companyCode);
          r.input("Remarks", sql.NVarChar, (b.Reason || b.Remarks || "").toString().trim());
          r.input("DocumentFrom", sql.NVarChar, l.documentType);
          r.input("Qty_Status", sql.NVarChar, l.qtyStatus);
          r.input("StockRate", sql.Decimal(18, 3), l.rate);
          // Approval flags: indent uses the value thresholds, requisition is auto-approved.
          if (reqType === "I") {
            if (l.rate >= issueApproval1) {
              r.input("IssueApproval1", sql.Int, 0).input("IssueApproval1_Auto", sql.Int, 0)
                .input("IssueApproval2", sql.Int, 0).input("IssueApproval2_Auto", sql.Int, 0);
            } else if (l.rate >= issueApproval2) {
              r.input("IssueApproval1", sql.Int, 1).input("IssueApproval1_Auto", sql.Int, 1)
                .input("IssueApproval2", sql.Int, 0).input("IssueApproval2_Auto", sql.Int, 0);
            } else {
              r.input("IssueApproval1", sql.Int, 1).input("IssueApproval1_Auto", sql.Int, 1)
                .input("IssueApproval2", sql.Int, 1).input("IssueApproval2_Auto", sql.Int, 1);
            }
          } else {
            r.input("IssueApproval1", sql.Int, 1).input("IssueApproval1_Auto", sql.Int, 1)
              .input("IssueApproval2", sql.Int, 1).input("IssueApproval2_Auto", sql.Int, 1);
          }
          await r.execute("sp_ItemRequisitionDetails_Insert");
        }
      };

      await buildReqDoc("I", indentLines, (l) => l.indentQty);
      await buildReqDoc("R", reqLines, (l) => l.requisitionQty);
    }

    await tx.commit();
    return sendSuccess(
      res,
      { SBCode: sbCode, SBJobCardNo: jobCardNo },
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (tx) {
      try {
        await tx.rollback();
      } catch (_) {}
    }
    console.error("DB Error (Schedule.saveOrUpdate):", err);
    return sendError(res, err);
  }
};

export const create = (req, res) => saveOrUpdate(req, res, false);
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /electrical-schedule/delete/:sbCode -> sp_Schedule_BreakDown_Delete
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.sbCode);
    if (!code) return sendError(res, "Invalid SBCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("SBCode", sql.Int, code)
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_Schedule_BreakDown_Delete");
    return sendSuccess(res, { SBCode: code }, "The record is deleted");
  } catch (err) {
    if (err.message && err.message.includes("FK_"))
      return sendError(res, "You cannot delete this Schedule", 409);
    console.error("DB Error (Schedule.remove):", err);
    return sendError(res, err);
  }
};
