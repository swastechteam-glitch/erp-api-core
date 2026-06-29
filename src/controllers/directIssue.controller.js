import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Direct Issue  (port of the WinForms frmIssueLatest — internal material issue)
//   Issue stock items directly (no indent): a grid of in-stock items, each with
//   cost head / department / machine, the live stock + rate (StockValue/CurStock)
//   and a Qty that may not exceed available stock. Header carries Branch, the
//   auto Issue No (sp_Issue_IssueNo), Issue Date, Employee, Remarks.
//
//   This is CREATE-ONLY (the desktop Show_Edit is broken copy-paste — wrong SP +
//   non-existent grid columns — and the menu opens a fresh entry). There is no
//   issue-type toggle in this form (optRequisition/optPurchaseIssue are dead
//   handlers with no controls).
//
//   Endpoints
//     GET  /direct-issue/options              branches / cost heads / departments /
//                                             employees (attendance-aware) / in-stock
//                                             items / issueNo / dateConfig
//     GET  /direct-issue/items?date=          re-snapshot stock for a date, items
//     GET  /direct-issue/machines?branchCode= tbl_Machine for a branch (+DeptCode)
//     POST /direct-issue/create               txn AddEdit -> Delete -> Insert(loop)
//
//   Reuses the exact lookup SP family as Item Issue Indent. Company/FY/user/node
//   come from the session headers — never the client. Group login is rejected.
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};
const str = (v) => (v ?? "").toString().trim();
const r4 = (v) => Math.round((toNum(v) + Number.EPSILON) * 1e4) / 1e4;
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getFYCode = (req) => toInt(req.headers.FYCode);
const D = (v) => (v ? new Date(v) : null);
const pad2 = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const scalar = async (request, proc) => {
  const r = await request.execute(proc);
  const row = r.recordset?.[0];
  return row ? toInt(Object.values(row)[0]) : 0;
};
const scalarRaw = async (request, proc) => {
  const r = await request.execute(proc);
  const row = r.recordset?.[0];
  return row ? Object.values(row)[0] : null;
};

// Map a sp_Item_GetbyItemName row -> dropdown option (same shape as Item Indent).
// Stock = display + qty cap; CurStock + StockValue feed the 4-dp rate.
const mapItem = (r) => ({
  value: r.ItemCode,
  label: r.ItemName,
  ItemUomCode: toInt(r.ItemUomCode),
  ItemUomName: r.ItemUomName ?? r.ItemUOMName ?? "",
  ItemID: r.ItemID ?? "",
  PartNo: r.Partnumber ?? r.PartNo ?? "",
  Stock: toNum(r.AvailableStock ?? r.Stock),
  CurStock: toNum(r.Stock),
  StockValue: toNum(r.StockValue),
  CatalogueNo: r.CatalogueNo ?? r.CatalogNo ?? "",
  DrawingNo: r.DrawingNo ?? r.DrawingNumber ?? "",
  HSNCode: r.HSNCode ?? r.HSNNo ?? r.HSN ?? "",
});
const issueRate = (stockValue, curStock) =>
  toNum(curStock) > 0 ? Math.round((toNum(stockValue) / toNum(curStock)) * 1e4) / 1e4 : 0;

// frmIssueLatest.GetStock(): refresh the date's stock snapshot, then the in-stock
// item lookup (sp_Item_GetbyItemName @Stock=1, @Status=1).
const loadItemsForDate = async (pool, companyCode, date) => {
  const fromTo = date ? ymd(new Date(date)) : ymd(new Date());
  try {
    await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("FromDate", sql.DateTime, new Date(fromTo))
      .input("ToDate", sql.DateTime, new Date(fromTo))
      .input("CurStock", sql.Int, 1)
      .execute("sp_Stock_Statement");
  } catch (_) {
    /* snapshot best-effort */
  }
  const items = await pool
    .request()
    .input("CompanyCode", sql.Int, companyCode)
    .input("Stock", sql.Int, 1)
    .input("Status", sql.Int, 1)
    .input("Date", sql.DateTime, new Date(fromTo))
    .execute("sp_Item_GetbyItemName");
  return (items.recordset || []).map(mapItem);
};

// Issue Date rules: max = server today; min = today - Prev_StoreDays; enabled when
// admin OR DateEnable=1. Defensive fallback to "today only, editable".
const buildStoreDateConfig = async (pool, req) => {
  let serverDate = ymd(new Date());
  let prevDays = 0;
  let dateEnable = 0;
  let settingsRead = false;
  let isAdmin = true;
  try {
    const s = await pool
      .request()
      .query(
        "SELECT TOP 1 ISNULL(Prev_StoreDays,0) AS PrevDays, ISNULL(DateEnable,0) AS DateEnable, " +
          "CONVERT(varchar(10), GETDATE(), 23) AS ServerDate FROM tbl_Setting",
      );
    const row = s.recordset?.[0] || {};
    if (row.ServerDate) serverDate = String(row.ServerDate).slice(0, 10);
    prevDays = toInt(row.PrevDays);
    dateEnable = toInt(row.DateEnable);
    settingsRead = true;
  } catch (_) {
    /* keep defaults */
  }
  try {
    const u = await pool
      .request()
      .input("uid", sql.Int, toInt(req.headers.userId))
      .query("SELECT TOP 1 UserLevel FROM vw_User WHERE UserCode = @uid");
    const raw = u.recordset?.[0]?.UserLevel;
    const lvl = String(raw ?? "").trim();
    isAdmin = lvl === "" || lvl === ";" || lvl === "1" || toInt(raw) === 1;
  } catch (_) {
    /* unknown -> admin */
  }
  const [y, m, d] = serverDate.split("-").map(Number);
  const minObj = new Date(y, m - 1, d);
  if (prevDays > 0) minObj.setDate(minObj.getDate() - prevDays);
  const enabled = isAdmin || dateEnable === 1 || !settingsRead;
  return { serverDate, minDate: ymd(minObj), maxDate: serverDate, enabled };
};

// GET /direct-issue/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const groupLogin = companyCode <= 0;
    const date = req.query.date;
    const pool = await getPool(req.headers.subdbname);

    // Employee source depends on tbl_Setting.Check_Attendence (frmIssueLatest).
    let checkAttendance = false;
    try {
      const cs = await pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .query("SELECT TOP 1 ISNULL(Check_Attendence,0) AS A FROM tbl_Setting WHERE CompanyCode = @CompanyCode");
      checkAttendance = toInt(cs.recordset?.[0]?.A) === 1;
    } catch (_) {
      /* default: all employees */
    }
    const attenDate = date ? ymd(new Date(date)) : ymd(new Date());
    const employeeReq = checkAttendance
      ? pool
          .request()
          .input("AttenDate", sql.DateTime, new Date(attenDate))
          .input("CompanyCode", sql.Int, companyCode)
          .execute("sp_ItemRequisition_GetbyEmployee")
      : pool.request().input("CompanyCode", sql.Int, companyCode).execute("sp_Store_Employee_Load");

    let issueNo = "";
    try {
      issueNo = await scalarRaw(
        pool.request().input("FYCode", sql.Int, getFYCode(req)).input("CompanyCode", sql.Int, companyCode),
        "sp_Issue_IssueNo",
      );
    } catch (_) {
      issueNo = "";
    }

    const [branches, costHeads, departments, employees, items, dateConfig] = await Promise.all([
      // tbl_Branch IS company-scoped in frmIssueLatest (WHERE CompanyCode).
      pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .query("SELECT BranchCode, BranchName from tbl_Branch WHERE CompanyCode = @CompanyCode Order by BranchName"),
      pool.request().query("Select CostHeadName, CostHeadCode from tbl_CostHead Where Status = 1 and CostHeadCode > 0 Order by CostHeadName"),
      pool.request().query("Select DepartmentName_English as DepartmentName, DepartmentCode from tbl_Department Where Status = 1 Order by DepartmentName_English"),
      employeeReq,
      loadItemsForDate(pool, companyCode, date),
      buildStoreDateConfig(pool, req),
    ]);

    return sendSuccess(res, {
      groupLogin,
      dateConfig,
      checkAttendance,
      issueNo: issueNo == null ? "" : String(issueNo),
      branches: branches.recordset.map((r) => ({ value: r.BranchCode, label: r.BranchName })),
      costHeads: costHeads.recordset.map((r) => ({ value: r.CostHeadCode, label: r.CostHeadName })),
      departments: departments.recordset.map((r) => ({ value: r.DepartmentCode, label: r.DepartmentName })),
      employees: employees.recordset.map((r) => ({
        value: r.EmployeeCode,
        label: r.str_EmployeeID ?? r.EmployeeName,
        EmployeeID: r.str_EmployeeID ?? "",
        EmployeeName: r.EmployeeName ?? "",
      })),
      items,
    });
  } catch (err) {
    console.error("DB Error (DirectIssue.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /direct-issue/items?date=
export const getItems = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const items = await loadItemsForDate(pool, getCompanyCode(req), req.query.date);
    return sendSuccess(res, { items });
  } catch (err) {
    console.error("DB Error (DirectIssue.getItems):", err);
    return sendError(res, err);
  }
};

// GET /direct-issue/machines?branchCode=
export const getMachines = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const branchCode = toInt(req.query.branchCode);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("BranchCode", sql.Int, branchCode)
      .query(
        "select MachineName, MachineCode, DepartmentCode from tbl_Machine where Status = 1 AND CompanyCode = @CompanyCode" +
          (branchCode > 0 ? " AND BranchCode = @BranchCode" : "") +
          " Order by MachineName",
      );
    return sendSuccess(res, {
      machines: r.recordset.map((x) => ({ value: x.MachineCode, label: x.MachineName, DepartmentCode: toInt(x.DepartmentCode) })),
    });
  } catch (err) {
    console.error("DB Error (DirectIssue.getMachines):", err);
    return sendError(res, err);
  }
};

// Server-authoritative stock re-validation (frmIssueLatest btnSave pre-save loop):
// aggregate Qty + Value per item, then sp_Stock_Statement @FromDate=today,
// @ToDate=FY end; reject Qty > Closing ("Please Check the Issue Qty") or
// Value > ClosingValue ("Please Check the Issue Value").
const revalidateIssueStock = async (pool, companyCode, fyEnd, rows) => {
  const from = new Date();
  const to = fyEnd ? new Date(fyEnd) : new Date();
  const byItem = {};
  for (const d of rows) {
    const ic = toInt(d.itemCode);
    if (ic <= 0) continue;
    if (!byItem[ic]) byItem[ic] = { qty: 0, value: 0, name: d.itemName || ic };
    byItem[ic].qty += toNum(d.qty);
    byItem[ic].value += toNum(d.amount);
  }
  const offenders = [];
  for (const ic of Object.keys(byItem)) {
    const agg = byItem[ic];
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("FromDate", sql.DateTime, from)
      .input("ToDate", sql.DateTime, to)
      .input("ItemCode", sql.Int, toInt(ic))
      .execute("sp_Stock_Statement");
    let stQty = 0;
    let clValue = 0;
    for (const x of r.recordset || []) {
      stQty += toNum(x.Closing);
      clValue += toNum(x.ClosingValue);
    }
    if (agg.qty > stQty) offenders.push({ itemCode: toInt(ic), itemName: agg.name, message: `Please Check the Issue Qty : ${agg.name}` });
    else if (agg.value > clValue) offenders.push({ itemCode: toInt(ic), itemName: agg.name, message: `Please Check the Issue Value : ${agg.name}` });
  }
  return offenders;
};

// POST /direct-issue/create
//   { issueDate, branchCode, employeeCode, remarks, items:[{costHeadCode,
//     departmentCode, machineCode, itemCode, itemName, qty, rate, returnQty?, reason?}] }
export const create = async (req, res) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode) return sendError(res, "Missing user context (userId / nodeCode)", 400);
    const companyCode = getCompanyCode(req);
    const fyCode = getFYCode(req);
    if (companyCode <= 0)
      return sendError(res, "You Are Login in Group of Company, please change in any one Company", 400);

    const b = req.body || {};
    if (!b.issueDate || Number.isNaN(new Date(b.issueDate).getTime())) return sendError(res, "Check Issue Date", 400);
    if (toInt(b.branchCode) <= 0) return sendError(res, "Select the Branch...", 400);
    if (toInt(b.employeeCode) <= 0) return sendError(res, "Select the Employee Name...", 400);

    const rows = (Array.isArray(b.items) ? b.items : [])
      .map((d) => ({
        costHeadCode: toInt(d.costHeadCode),
        departmentCode: toInt(d.departmentCode),
        machineCode: toInt(d.machineCode),
        itemCode: toInt(d.itemCode),
        itemName: str(d.itemName),
        returnQty: toNum(d.returnQty),
        qty: toNum(d.qty),
        rate: r4(d.rate),
        amount: r4(toNum(d.qty) * toNum(d.rate)),
        reason: str(d.reason),
      }))
      .filter((d) => d.qty > 0);
    if (!rows.length) return sendError(res, "Amount Couldn't be Empty", 400);
    const totalAmount = rows.reduce((s, d) => s + d.amount, 0);
    if (totalAmount <= 0) return sendError(res, "Amount Couldn't be Empty", 400);

    const pool = await getPool(req.headers.subdbname);

    // Authoritative stock re-check -> 422 with the offending item(s).
    try {
      const offenders = await revalidateIssueStock(pool, companyCode, req.headers.FYEnd, rows);
      if (offenders.length) {
        return res.status(422).json({ success: false, error: offenders[0].message, offenders });
      }
    } catch (e) {
      console.warn("DirectIssue stock re-validation failed (proceeding):", e.message);
    }

    const totalQty = rows.reduce((s, d) => s + d.qty, 0);
    const totalReturnQty = rows.reduce((s, d) => s + d.returnQty, 0);

    // Fresh issue number (don't trust the client's).
    let issueNo = 0;
    try {
      issueNo = toInt(
        await scalarRaw(
          pool.request().input("FYCode", sql.Int, fyCode).input("CompanyCode", sql.Int, companyCode),
          "sp_Issue_IssueNo",
        ),
      );
    } catch (_) {
      issueNo = 0;
    }

    tx = new sql.Transaction(pool);
    await tx.begin();

    // 1) Header
    const head = new sql.Request(tx);
    head.input("IssueDate", sql.DateTime, new Date(b.issueDate));
    head.input("IssueNo", sql.Int, issueNo);
    head.input("BranchCode", sql.Int, toInt(b.branchCode));
    head.input("IndentNo", sql.Int, 0);
    head.input("EmployeeCode", sql.Int, toInt(b.employeeCode));
    head.input("TotalReturnQty", sql.Decimal(18, 3), totalReturnQty);
    head.input("TotalQty", sql.Decimal(18, 3), totalQty);
    head.input("TotalAmount", sql.Decimal(18, 4), totalAmount);
    head.input("TotalDiscountper", sql.Decimal(18, 4), 0);
    head.input("TotalDiscountAmount", sql.Decimal(18, 4), 0);
    head.input("TotalGrossAmount", sql.Decimal(18, 4), 0);
    head.input("TotalTaxPer", sql.Decimal(18, 4), 0);
    head.input("TotalTaxAmount", sql.Decimal(18, 4), 0);
    head.input("TotalCSTPer", sql.Decimal(18, 4), 0);
    head.input("TotalCSTAmount", sql.Decimal(18, 4), 0);
    head.input("TotalCGSTPer", sql.Decimal(18, 4), 0);
    head.input("TotalCGSTAmount", sql.Decimal(18, 4), 0);
    head.input("TotalSGSTPer", sql.Decimal(18, 4), 0);
    head.input("TotalSGSTAmount", sql.Decimal(18, 4), 0);
    head.input("TotalIGSTPer", sql.Decimal(18, 4), 0);
    head.input("TotalIGSTAmount", sql.Decimal(18, 4), 0);
    head.input("TotalOtherExpenses", sql.Decimal(18, 4), 0);
    head.input("TotalRoundedOff", sql.Decimal(18, 4), 0);
    head.input("TotalNetAmount", sql.Decimal(18, 4), totalAmount);
    head.input("Remarks", sql.NVarChar, str(b.remarks));
    head.input("FYCode", sql.Int, fyCode);
    head.input("CompanyCode", sql.Int, companyCode);
    head.input("User", sql.Int, parseInt(userId));
    head.input("Node", sql.Int, parseInt(nodeCode));
    const issueCode = await scalar(head, "sp_Issue_AddEdit");

    // 2) Clear existing detail rows
    await new sql.Request(tx)
      .input("IssueCode", sql.Int, issueCode)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_IssueDetails_Delete");

    // 3) Insert detail rows
    let sno = 0;
    for (const d of rows) {
      sno += 1;
      const reqd = new sql.Request(tx);
      reqd.input("IssueCode", sql.Int, issueCode);
      reqd.input("SNo", sql.Int, sno);
      reqd.input("CostHeadCode", sql.Int, d.costHeadCode);
      reqd.input("DepartmentCode", sql.Int, d.departmentCode);
      if (d.machineCode > 0) reqd.input("MachineCode", sql.Int, d.machineCode);
      reqd.input("ItemCode", sql.Int, d.itemCode);
      reqd.input("ReturnQty", sql.Decimal(18, 3), d.returnQty);
      reqd.input("Qty", sql.Decimal(18, 3), d.qty);
      reqd.input("Rate", sql.Decimal(18, 4), d.rate);
      reqd.input("Amount", sql.Decimal(18, 4), d.amount);
      reqd.input("DiscountPer", sql.Decimal(18, 4), 0);
      reqd.input("DiscountAmount", sql.Decimal(18, 4), 0);
      reqd.input("GrossAmount", sql.Decimal(18, 4), d.amount);
      reqd.input("TaxPer", sql.Decimal(18, 4), 0);
      reqd.input("TaxAmount", sql.Decimal(18, 4), 0);
      reqd.input("CSTPer", sql.Decimal(18, 4), 0);
      reqd.input("CSTAmount", sql.Decimal(18, 4), 0);
      reqd.input("CGSTPer", sql.Decimal(18, 4), 0);
      reqd.input("CGSTAmount", sql.Decimal(18, 4), 0);
      reqd.input("SGSTPer", sql.Decimal(18, 4), 0);
      reqd.input("SGSTAmount", sql.Decimal(18, 4), 0);
      reqd.input("IGSTPer", sql.Decimal(18, 4), 0);
      reqd.input("IGSTAmount", sql.Decimal(18, 4), 0);
      reqd.input("OtherExpenses", sql.Decimal(18, 4), 0);
      reqd.input("RoundedOff", sql.Decimal(18, 4), 0);
      reqd.input("NetAmount", sql.Decimal(18, 4), d.amount);
      reqd.input("Reason", sql.NVarChar, d.reason);
      reqd.input("CompanyCode", sql.Int, companyCode);
      await reqd.execute("sp_IssueDetails_Insert");
    }

    await tx.commit();

    // 4) Best-effort cached-stock recalc (the issue reduces stock). The desktop
    // form omits this; the sibling Inward/Return screens do it — mirror them so
    // CurStock reflects the issue. Same end-state, no extra issue data written.
    try {
      const today = ymd(new Date());
      await pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("FromDate", sql.DateTime, new Date(today))
        .input("ToDate", sql.DateTime, new Date(today))
        .input("CurStock", sql.Int, 1)
        .execute("sp_Stock_Statement");
    } catch (_) {
      /* best-effort */
    }

    return sendSuccess(res, { IssueCode: issueCode, IssueNo: issueNo }, "The record is saved", 201);
  } catch (err) {
    if (tx) {
      try {
        await tx.rollback();
      } catch (_) {
        /* ignore */
      }
    }
    const msg = String(err?.message || "");
    if (msg.includes("UK_IssueDetailsName_tblIssueDetails"))
      return sendError(res, "This item is already added.", 409);
    console.error("DB Error (DirectIssue.create):", err);
    return sendError(res, err);
  }
};
