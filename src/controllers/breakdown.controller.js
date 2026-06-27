import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Electrical / Mechanical Break Down Entry (port of WinForms frmBreakDown, SBType 'B')
//
// Shared by Mechanical ('M') and Electrical ('E'); defaults to 'E'. Pass
// ?serviceType=M to reuse it for the Mechanical breakdown menu.
//
//   Lookups : branches / uoms / items / departments / type-of-breakdowns / employees
//   Machines: tbl_Machine (status=1, company, optional branch/department)
//   Job no  : sp_Schedule_BreakDown_BindNo (@SBType='B')
//   Stock   : sp_Stock_Statement -> closing qty + avg rate
//   List    : sp_Schedule_BreakDown_GetAll_EditScreen (@SBType='B')
//   One     : header (from list) + vw_Schedule_BreakDownDetails rows
//   Save    : sp_Schedule_BreakDown_AddEdit (scalar -> SBCode) + details
//             _Delete/_Insert, then auto Indent/Requisition when AUTOIndent=1.
//   Delete  : sp_Schedule_BreakDown_Delete
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

// GET /breakdown/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    const [branches, uoms, items, departments, breakdownTypes, employees] = await Promise.all([
      pool.request().input("CompanyCode", sql.Int, companyCode)
        .query("SELECT BranchCode, BranchName FROM tbl_Branch WHERE CompanyCode = @CompanyCode ORDER BY BranchName"),
      pool.request().query("SELECT ItemUomCode, ItemUomName FROM tbl_ItemUom"),
      pool.request().query("SELECT ItemCode, ItemName, ItemUomCode FROM tbl_Item ORDER BY ItemName"),
      pool.request().query(
        "SELECT DepartmentCode, DepartmentName FROM tbl_Department " +
          "WHERE DepartmentCode IN (SELECT DepartmentCode FROM tbl_Machine WHERE Status=1) ORDER BY DepartmentName"
      ),
      pool.request().query("SELECT BreakDownMasterCode, BreakDownName FROM tbl_TypeOfBreakDowns"),
      pool.request().input("CompanyCode", sql.Int, companyCode)
        .query("SELECT EmployeeCode, EmployeeName FROM vw_Employee_New WHERE DOL IS NULL AND CompanyCode = @CompanyCode ORDER BY EmployeeName"),
    ]);

    return sendSuccess(res, {
      branches: branches.recordset,
      uoms: uoms.recordset,
      items: items.recordset,
      departments: departments.recordset,
      breakdownTypes: breakdownTypes.recordset,
      employees: employees.recordset,
    });
  } catch (err) {
    console.error("DB Error (BreakDown.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /breakdown/machines?branchCode=&departmentCode=
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
    console.error("DB Error (BreakDown.getMachines):", err);
    return sendError(res, err);
  }
};

// GET /breakdown/job-card-no
export const getJobCardNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const no = await scalarRawNo(
      pool
        .request()
        .input("FYCode", sql.Int, getFYCode(req))
        .input("SBType", sql.NVarChar, "B")
        .input("ServiceType", sql.NVarChar, getServiceType(req))
        .input("CompanyCode", sql.Int, getCompanyCode(req)),
      "sp_Schedule_BreakDown_BindNo"
    );
    return sendSuccess(res, { jobCardNo: no });
  } catch (err) {
    console.error("DB Error (BreakDown.getJobCardNo):", err);
    return sendError(res, err);
  }
};

// Closing stock qty + avg rate (port of the VB stock loop). Falls back to PurchaseCost.
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

// GET /breakdown/stock?itemCode=&date=
export const getStock = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const itemCode = toInt(req.query.itemCode);
    if (!itemCode) return sendError(res, "itemCode is required", 400);
    const pool = await getPool(req.headers.subdbname);
    const info = await getStockInfo(pool, getCompanyCode(req), itemCode, D(req.query.date));
    return sendSuccess(res, info);
  } catch (err) {
    console.error("DB Error (BreakDown.getStock):", err);
    return sendError(res, err);
  }
};

// =========================================================================
// LIST / ONE
// =========================================================================

// GET /breakdown/lists
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("FyCode", sql.Int, getFYCode(req))
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("SBType", sql.NVarChar, "B")
      .input("ServiceType", sql.NVarChar, getServiceType(req))
      .execute("sp_Schedule_BreakDown_GetAll_EditScreen");
    const data = (r.recordset || []).sort((a, b) => b.SBCode - a.SBCode).map((x) => ({ ...x, id: x.SBCode }));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (BreakDown.getList):", err);
    return sendError(res, err);
  }
};

// GET /breakdown/list/:sbCode
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
      .input("SBType", sql.NVarChar, "B")
      .input("ServiceType", sql.NVarChar, getServiceType(req))
      .execute("sp_Schedule_BreakDown_GetAll_EditScreen");
    const header = (head.recordset || []).find((r) => r.SBCode === code);
    if (!header) return sendError(res, "Break Down not found", 404);
    const det = await pool
      .request()
      .input("SBCode", sql.Int, code)
      .query("SELECT * FROM vw_Schedule_BreakDownDetails WHERE SBCode = @SBCode");
    return sendSuccess(res, { ...header, details: det.recordset || [] });
  } catch (err) {
    console.error("DB Error (BreakDown.getById):", err);
    return sendError(res, err);
  }
};

// =========================================================================
// SAVE
// =========================================================================
const COST_HEAD_NAME = (st) => (st === "M" ? "MECHANICAL" : "ELECTRICAL");
const DOC_TYPE = (st, kind) => `${st === "M" ? "M" : "E"}_BREAKDOWN_${kind}`; // INDENT | ReQuisition

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
    const departmentCode = toInt(b.DepartmentCode);
    const machineCode = toInt(b.MachineCode);
    const branchCode = toInt(b.BranchCode);
    const breakDownMasterCode = toInt(b.BreakDownMasterCode);
    const serviceByEmpCode = toInt(b.ServiceByEmpCode);
    const totalManPowerUsed = toNum(b.TotalManPowerUsed);
    const totalManPowerHrs = toNum(b.TotalManPowerHrs);
    const percentage = toNum(b.Percentage);
    const breakDownDate = D(b.BreakDownDate) || new Date();
    const breakDownTime = D(b.BreakDownTime) || new Date();
    const startDate = D(b.StartDate) || breakDownDate;
    const endDate = D(b.EndDate) || breakDownDate;
    const externalService = b.ExternalService === 0 || b.ExternalService === "0" || b.ExternalService === false ? 0 : 1;
    const rows = Array.isArray(b.details) ? b.details : [];

    // Validation — mirrors the WinForms btnSave checks.
    if (!departmentCode) return sendError(res, "Select Department Name", 400);
    if (!machineCode) return sendError(res, "Select Machine Name", 400);
    if (!breakDownMasterCode) return sendError(res, "Select Type of Breakdown", 400);
    if (totalManPowerUsed <= 0) return sendError(res, "Enter The Total Man Power Used", 400);
    if (serviceByEmpCode <= 0) return sendError(res, "Please Select the Employee Name", 400);

    const code = isEdit ? toInt(req.params.sbCode ?? b.SBCode) : 0;
    if (isEdit && !code) return sendError(res, "Invalid SBCode for update", 400);

    const pool = await getPool(req.headers.subdbname);

    const costHeadRes = await pool
      .request()
      .input("Name", sql.NVarChar, COST_HEAD_NAME(serviceType))
      .query("SELECT TOP 1 CostHeadCode FROM tbl_CostHead WHERE Status = 1 AND CostHeadName = @Name");
    const costHeadCode = toInt(costHeadRes.recordset?.[0]?.CostHeadCode);

    // Per-line stock split + rate (port of btnAdd).
    const lines = [];
    for (const row of rows) {
      const itemCode = toInt(row.ItemCode);
      const uomCode = toInt(row.UOMCode ?? row.ItemUomCode);
      const qty = toNum(row.Qty);
      if (!itemCode || qty <= 0) continue;
      const { stockQty, rate } = await getStockInfo(pool, companyCode, itemCode, breakDownDate);
      let indentQty = 0;
      let requisitionQty = 0;
      if (stockQty > qty) indentQty = qty;
      else if (stockQty <= 0) requisitionQty = qty;
      else {
        indentQty = stockQty;
        requisitionQty = qty - stockQty;
      }
      lines.push({
        itemCode,
        uomCode,
        qty,
        rate: toNum(row.Rate) || rate,
        indentQty,
        requisitionQty,
        documentType: DOC_TYPE(serviceType, indentQty > 0 ? "INDENT" : "ReQuisition"),
        qtyStatus: (row.Qty_Status || "NEW").toString(),
      });
    }

    const jobCardNo = isEdit
      ? toInt(b.SBJobCardNo)
      : toInt(
          await scalarRawNo(
            pool.request().input("FYCode", sql.Int, fyCode).input("SBType", sql.NVarChar, "B")
              .input("ServiceType", sql.NVarChar, serviceType).input("CompanyCode", sql.Int, companyCode),
            "sp_Schedule_BreakDown_BindNo"
          )
        );

    const autoRes = await pool
      .request()
      .query("SELECT TOP 1 ISNULL(AUTOIndent,0) AS AUTOIndent FROM tbl_Setting WHERE AUTOIndent = 1");
    const autoIndent = (autoRes.recordset || []).length > 0 && !isEdit;
    let issueApproval1 = 0;
    let issueApproval2 = 0;
    if (autoIndent) {
      const setting = await pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .query("SELECT TOP 1 ISNULL(IssueApproval1_Value,0) AS A1, ISNULL(IssueApproval2_Value,0) AS A2 FROM tbl_Setting WHERE CompanyCode = @CompanyCode");
      issueApproval1 = toNum(setting.recordset?.[0]?.A1);
      issueApproval2 = toNum(setting.recordset?.[0]?.A2);
    }

    tx = new sql.Transaction(pool);
    await tx.begin();

    // ---- header ----
    const head = new sql.Request(tx);
    if (code) head.input("SBCode", sql.Int, code);
    head.input("SBDate", sql.DateTime, breakDownDate);
    head.input("SBType", sql.NVarChar, "B");
    head.input("SBJobCardNo", sql.Int, jobCardNo);
    head.input("BreakDownDate", sql.DateTime, breakDownDate);
    head.input("BreakDownTime", sql.DateTime, breakDownTime);
    head.input("BreakDownMasterCode", sql.Int, breakDownMasterCode);
    head.input("MachineCode", sql.Int, machineCode);
    head.input("BranchCode", sql.Int, branchCode);
    head.input("DepartmentCode", sql.Int, departmentCode);
    head.input("TotalManPowerUsed", sql.Decimal(18, 2), totalManPowerUsed);
    head.input("TotalManPowerHrs", sql.Decimal(18, 2), totalManPowerHrs);
    head.input("Reason", sql.NVarChar, (b.Reason || "").toString().trim());
    head.input("ServiceType", sql.NVarChar, serviceType);
    head.input("ExternalService", sql.Int, externalService);
    head.input("StartDate", sql.DateTime, startDate);
    head.input("EndDate", sql.DateTime, endDate);
    head.input("Percentage", sql.Decimal(18, 3), percentage);
    head.input("CompanyCode", sql.Int, companyCode);
    head.input("FYCode", sql.Int, fyCode);
    head.input("User", sql.Int, toInt(userId));
    head.input("Node", sql.Int, toInt(nodeCode));
    head.input("ServiceByEmpCode", sql.Int, serviceByEmpCode);
    const sbCode = await scalar(head, "sp_Schedule_BreakDown_AddEdit");

    // ---- details ----
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

    // ---- optional auto Indent ('I') + Requisition ('R') ----
    if (autoIndent) {
      const buildReqDoc = async (reqType, docLines, qtyOf) => {
        const totalQty = docLines.reduce((s, l) => s + qtyOf(l), 0);
        if (totalQty <= 0) return;
        const reqNo = toInt(
          await scalarRawNo(
            new sql.Request(tx).input("CompanyCode", sql.Int, companyCode).input("FYCode", sql.Int, fyCode)
              .input("RequisitionType", sql.NVarChar, reqType),
            "sp_ItemRequisition_ItemRequisitionNo"
          )
        );
        const strNo = `${reqType === "I" ? "IND" : "REQ"}${reqNo}`;
        const reqHead = new sql.Request(tx);
        reqHead.input("ItemRequisitionDate", sql.DateTime, breakDownDate);
        reqHead.input("ItemRequisitionNo", sql.Int, reqNo);
        reqHead.input("RequisitionType", sql.NVarChar, reqType);
        reqHead.input("strItemRequisitionNo", sql.NVarChar, strNo);
        reqHead.input("TotalQty", sql.Decimal(18, 3), totalQty);
        reqHead.input("CommittedDate", sql.DateTime, new Date());
        reqHead.input("Remarks", sql.NVarChar, (b.Reason || "").toString().trim());
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
          r.input("EmployeeCode", sql.Int, serviceByEmpCode);
          r.input("ItemCode", sql.Int, l.itemCode);
          r.input("ItemUomCode", sql.Int, l.uomCode);
          r.input("Qty", sql.Decimal(18, 3), qtyOf(l));
          r.input("CommittedDate", sql.DateTime, new Date());
          r.input("CompanyCode", sql.Int, companyCode);
          r.input("Remarks", sql.NVarChar, (b.Reason || "").toString().trim());
          r.input("DocumentFrom", sql.NVarChar, l.documentType);
          r.input("Qty_Status", sql.NVarChar, l.qtyStatus);
          r.input("StockRate", sql.Decimal(18, 3), l.rate);
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
      await buildReqDoc("I", lines.filter((l) => l.indentQty > 0), (l) => l.indentQty);
      await buildReqDoc("R", lines.filter((l) => l.requisitionQty > 0), (l) => l.requisitionQty);
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
    console.error("DB Error (BreakDown.saveOrUpdate):", err);
    return sendError(res, err);
  }
};

export const create = (req, res) => saveOrUpdate(req, res, false);
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /breakdown/delete/:sbCode
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
    if (err.message && err.message.includes("FK_")) return sendError(res, "You cannot delete this Break Down", 409);
    console.error("DB Error (BreakDown.remove):", err);
    return sendError(res, err);
  }
};
