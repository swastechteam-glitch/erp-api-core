import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Item Issue  (port of the WinForms frmIssue_New — "Store Issue by Indent")
//   INDENT-DRIVEN issue: the user picks a pending Item Issue Indent and its
//   pending lines are pulled into the issue grid (no free-form add panel). Each
//   pulled line runs a live stock check + a rate-based two-level issue-approval
//   gate against tbl_ItemRequisitionDetails; only lines that pass are added. The
//   header + detail lines are then saved in ONE transaction.
//   ("Direct Issue" is a SEPARATE screen — see directIssue.controller.js.)
//
//   Endpoints (mounted at /item-issue)
//     GET  /options                      branches / employees / issueNo / dateConfig
//     GET  /pending-indents?fromDate&toDate&branchCode&itemRequisitionCode
//                                        sp_Issue_ItemRequisition_Pendings
//     POST /pull-indent  { itemRequisitionCode }
//                                        stock + two-level approval per line;
//                                        WRITES StockRate / IssueApproval1/2 on
//                                        tbl_ItemRequisitionDetails (port of
//                                        frmIssue_New.CheckStock). 409 if the
//                                        indent is no longer pending.
//     POST /item-history { itemCode, machineCode, departmentCode }
//                                        sp_Store_Issue_ItemDetails (drill-down)
//     POST /create                       txn AddEdit -> Delete -> Insert(loop);
//                                        422 (stock) / 409 (indent no longer pending)
//
//   Company / FY come from req.headers.companyCode / FYCode / FYEnd / FYStart;
//   AddEdit also needs @User / @Node from req.headers.userId / nodeCode. Group
//   login (CompanyCode <= 0) is rejected. Datetimes are local IST — never TZ-shift.
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
const r2 = (v) => Math.round((toNum(v) + Number.EPSILON) * 1e2) / 1e2;
// Numeric indent no from the SP's formatted string. strItemRequisitionNo comes as
// "IND000228 / 2026-2027" — the indent number is only the FIRST token; the trailing
// financial year must NOT be folded in (digits of the whole string overflow @IndentNo,
// a SQL Int). Take digits of the token before "/" only: "IND000228 / 2026-2027" -> 228.
const indentNoInt = (v) => toInt(String(v ?? "").split("/")[0].replace(/\D/g, ""));
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getFYCode = (req) => toInt(req.headers.FYCode);
const pad2 = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
// Parse a user-picked "YYYY-MM-DD" as LOCAL calendar midnight so the stored date
// is exactly the day chosen, on any server timezone. new Date("YYYY-MM-DD") would
// parse as UTC midnight and could roll back a day on a west-of-UTC host — the
// hard rule is: datetimes are local IST, never TZ-shift.
const localDate = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? "").trim());
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return v ? new Date(v) : null;
};

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
// node-mssql collapses duplicate SELECT column names into arrays; take the first
// meaningful element (the pending SPs are legacy and may repeat column names).
const firstVal = (v) => (Array.isArray(v) ? v.find((x) => x != null) : v);

// sp_Issue_ItemRequisition_Pendings filtered to ONE indent, over the whole FY so a
// still-pending indent is never missed by a narrow default date range (the desktop
// btnClear calls it with no dates = all pendings). Empty result => not pending.
const pendingByCode = async (pool, companyCode, req, itemRequisitionCode) => {
  const rq = pool
    .request()
    .input("CompanyCode", sql.Int, companyCode)
    .input("ItemRequisitionCode", sql.Int, itemRequisitionCode);
  if (req.headers.FYStart) rq.input("FromDate", sql.DateTime, new Date(req.headers.FYStart));
  if (req.headers.FYEnd) rq.input("ToDate", sql.DateTime, new Date(req.headers.FYEnd));
  const r = await rq.execute("sp_Issue_ItemRequisition_Pendings");
  return r.recordset || [];
};

// tbl_Branch is company-scoped in frmIssue_New (WHERE CompanyCode). Some tenant
// DBs lack that column (see itemIndent.controller.js), so fall back to unfiltered
// rather than hard-fail.
const loadBranches = async (pool, companyCode) => {
  try {
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .query("SELECT BranchCode, BranchName from tbl_Branch WHERE CompanyCode = @CompanyCode Order by BranchName");
    return r.recordset.map((x) => ({ value: x.BranchCode, label: x.BranchName }));
  } catch (_) {
    const r = await pool.request().query("SELECT BranchCode, BranchName from tbl_Branch Order by BranchName");
    return r.recordset.map((x) => ({ value: x.BranchCode, label: x.BranchName }));
  }
};

// Issue Date rules (port of frmIssue_New.Bind_Data): max = server today; min =
// today - Prev_StoreDays; enabled when admin OR DateEnable=1. Defensive fallback
// to "today only, editable". Copied from directIssue/itemIndent for parity.
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
          "CONVERT(varchar(10), GETDATE(), 23) AS ServerDate FROM tbl_Setting"
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

// Live stock for one item: sp_Stock_Statement @FromDate=today, @ToDate=FY end,
// @ItemCode. available = SUM(Closing), value = SUM(ClosingValue) (frmIssue_New
// uses @FromDate=GetServer_CurDate, @ToDate=FYMaxDate — no @CurStock here).
const stockOf = async (pool, companyCode, fyEnd, itemCode) => {
  const r = await pool
    .request()
    .input("CompanyCode", sql.Int, companyCode)
    .input("FromDate", sql.DateTime, new Date())
    .input("ToDate", sql.DateTime, fyEnd ? new Date(fyEnd) : new Date())
    .input("ItemCode", sql.Int, itemCode)
    .execute("sp_Stock_Statement");
  let available = 0;
  let value = 0;
  for (const x of r.recordset || []) {
    available += toNum(x.Closing);
    value += toNum(x.ClosingValue);
  }
  return { available, value };
};

// Server-authoritative stock re-validation at save (port of frmIssue_New.btnSave
// pre-save loop): aggregate Qty per item, then sp_Stock_Statement @FromDate=today,
// @ToDate=FY end; reject Qty > Closing. Same shape as directIssue.
const revalidateIssueStock = async (pool, companyCode, fyEnd, rows) => {
  const byItem = {};
  for (const d of rows) {
    const ic = toInt(d.itemCode);
    if (ic <= 0) continue;
    if (!byItem[ic]) byItem[ic] = { qty: 0, name: d.itemName || ic };
    byItem[ic].qty += toNum(d.qty);
  }
  const offenders = [];
  for (const ic of Object.keys(byItem)) {
    const agg = byItem[ic];
    const { available } = await stockOf(pool, companyCode, fyEnd, toInt(ic));
    if (agg.qty > available)
      offenders.push({ itemCode: toInt(ic), itemName: agg.name, requested: agg.qty, available, message: `Please Check the Issue Qty : ${agg.name}` });
  }
  return offenders;
};

// One approval-flag write (port of the inline UPDATE in frmIssue_New.CheckStock).
// StockRate is written at the 2-dp approval rate, exactly as the desktop does.
// Column names are fixed literals (never user input).
const approvalWrite = async (pool, level, val, auto, rate, irc, itemCode) => {
  const col = level === 1 ? "IssueApproval1" : "IssueApproval2";
  const autoCol = level === 1 ? "IssueApproval1_Auto" : "IssueApproval2_Auto";
  await pool
    .request()
    .input("StockRate", sql.Decimal(18, 4), rate)
    .input("Val", sql.Int, val)
    .input("Auto", sql.Int, auto)
    .input("ItemRequisitionCode", sql.Int, irc)
    .input("ItemCode", sql.Int, itemCode)
    .query(
      `Update tbl_ItemRequisitionDetails set StockRate = @StockRate, ${col} = @Val, ${autoCol} = @Auto ` +
        `where isnull(${col},0) = 0 and ItemRequisitionCode = @ItemRequisitionCode and ItemCode = @ItemCode`
    );
};

// Current approval status for (indent, item); -1 signals a read failure so the
// caller can fail-open like the desktop (empty Catch leaves the flag unset).
const approvalStatus = async (pool, level, irc, itemCode) => {
  const col = level === 1 ? "IssueApproval1" : "IssueApproval2";
  try {
    const q = await pool
      .request()
      .input("ItemRequisitionCode", sql.Int, irc)
      .input("ItemCode", sql.Int, itemCode)
      .query(`select isnull(${col},0) AS S from tbl_ItemRequisitionDetails where ItemRequisitionCode = @ItemRequisitionCode and ItemCode = @ItemCode`);
    return toInt(q.recordset?.[0]?.S);
  } catch (_) {
    return -1;
  }
};

// GET /item-issue/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const groupLogin = companyCode <= 0;
    const pool = await getPool(req.headers.subdbname);

    let issueNo = "";
    try {
      issueNo = await scalarRaw(
        pool.request().input("FYCode", sql.Int, getFYCode(req)).input("CompanyCode", sql.Int, companyCode),
        "sp_Issue_IssueNo"
      );
    } catch (_) {
      issueNo = "";
    }

    const [branches, employees, dateConfig] = await Promise.all([
      loadBranches(pool, companyCode),
      // frmIssue_New.Bind_Data loads employees straight from vw_Employee_New.
      pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .query("Select str_EmployeeID, EmployeeCode from vw_Employee_New Where DOL IS NULL AND CompanyCode = @CompanyCode Order by str_EmployeeID"),
      buildStoreDateConfig(pool, req),
    ]);

    const fyStart = req.headers.FYStart ? String(req.headers.FYStart).slice(0, 10) : dateConfig.minDate;
    return sendSuccess(res, {
      groupLogin,
      dateConfig,
      fyStart,
      issueNo: issueNo == null ? "" : String(issueNo),
      branches,
      employees: employees.recordset.map((r) => ({ value: r.EmployeeCode, label: r.str_EmployeeID })),
    });
  } catch (err) {
    console.error("DB Error (ItemIssue.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /item-issue/pending-indents
export const getPendingIndents = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    const rq = pool.request().input("CompanyCode", sql.Int, companyCode);
    if (req.query.fromDate) rq.input("FromDate", sql.DateTime, new Date(req.query.fromDate));
    if (req.query.toDate) rq.input("ToDate", sql.DateTime, new Date(req.query.toDate));
    const branchCode = toInt(req.query.branchCode);
    if (branchCode > 0) rq.input("BranchCode", sql.Int, branchCode);
    const irc = toInt(req.query.itemRequisitionCode);
    if (irc > 0) rq.input("ItemRequisitionCode", sql.Int, irc);

    const r = await rq.execute("sp_Issue_ItemRequisition_Pendings");
    const indents = (r.recordset || []).map((x) => ({
      ItemRequisitionCode: toInt(firstVal(x.ItemRequisitionCode)),
      ItemRequisitionNo: toInt(firstVal(x.ItemRequisitionNo)),
      strItemRequisitionNo: str(firstVal(x.strItemRequisitionNo)),
      ItemRequisitionDate: firstVal(x.ItemRequisitionDate),
      BranchCode: toInt(firstVal(x.BranchCode)),
      BranchName: str(firstVal(x.BranchName)),
    }));
    return sendSuccess(res, { indents });
  } catch (err) {
    console.error("DB Error (ItemIssue.getPendingIndents):", err);
    return sendError(res, err);
  }
};

// POST /item-issue/pull-indent   { itemRequisitionCode }
//   Faithful port of frmIssue_New.GridItemIndentPending_CellMouseClick +
//   CheckStock: pull the indent's pending lines, run stock + two-level approval
//   per line, and return the addable lines plus the blocked/skipped ones.
//   WRITES StockRate / IssueApproval1/2 / *_Auto on tbl_ItemRequisitionDetails
//   (autocommit per line, fail-open like the desktop's empty Catch).
export const pullIndent = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    if (companyCode <= 0)
      return sendError(res, "You Are Login in Group of Company, please change in any one Company", 400);
    const itemRequisitionCode = toInt(req.body?.itemRequisitionCode);
    if (itemRequisitionCode <= 0) return sendError(res, "Select a pending indent", 400);

    const pool = await getPool(req.headers.subdbname);
    const fyEnd = req.headers.FYEnd;

    // Status guard + header info: the indent must still be pending (else 409).
    const hdrRows = await pendingByCode(pool, companyCode, req, itemRequisitionCode);
    const h = hdrRows[0];
    if (!h) return sendError(res, "This indent is no longer pending (already issued or removed).", 409);
    const branchCode = toInt(firstVal(h.BranchCode));
    const indentNo = str(firstVal(h.strItemRequisitionNo));
    const indentNoNum = toInt(firstVal(h.ItemRequisitionNo));

    // Req. employee = the indent's first line employee (frmIssue_New: Top 1).
    let employeeCode = 0;
    try {
      const e = await pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("ItemRequisitionCode", sql.Int, itemRequisitionCode)
        .query("Select Top 1 EmployeeCode from tbl_ItemRequisitionDetails where CompanyCode = @CompanyCode AND ItemRequisitionCode = @ItemRequisitionCode");
      employeeCode = toInt(e.recordset?.[0]?.EmployeeCode);
    } catch (_) {
      /* leave 0; user can pick */
    }

    // Issue-approval thresholds (tbl_Setting, per company; default 0).
    let appr1 = 0;
    let appr2 = 0;
    try {
      const s = await pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .query("Select isnull(IssueApproval1_Value,0) AS A1, isnull(IssueApproval2_Value,0) AS A2 from tbl_Setting where CompanyCode = @CompanyCode");
      appr1 = toNum(s.recordset?.[0]?.A1);
      appr2 = toNum(s.recordset?.[0]?.A2);
    } catch (_) {
      /* thresholds 0 -> everything auto-approves */
    }

    const det = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("ItemRequisitionCode", sql.Int, itemRequisitionCode)
      .execute("sp_Issue_ItemRequisitionDetails_Pendings");

    const lines = [];
    const blocked = [];
    const skipped = [];
    const usedByItem = {}; // running per-item deduction across accepted lines

    for (const d of det.recordset || []) {
      const g = (k) => firstVal(d[k]); // unwrap duplicate-column collapse
      const itemCode = toInt(g("ItemCode"));
      if (itemCode <= 0) continue;
      const itemName = str(g("ItemName"));

      const { available: rawAvail, value: rawValue } = await stockOf(pool, companyCode, fyEnd, itemCode);
      const rate = rawAvail > 0 ? rawValue / rawAvail : 0; // full-precision weighted-avg cost
      const used = usedByItem[itemCode] || 0;
      const available = rawAvail - used; // deduct qty already pulled for this item
      const approvalRate = r2(rate); // desktop compares the 2-dp rate

      // ---- two-level rate-based issue-approval gate (CheckStock) ------------
      let flag = false;
      // Level 1
      if (approvalRate >= appr1) {
        const status1 = await approvalStatus(pool, 1, itemRequisitionCode, itemCode);
        if (status1 === 0) {
          try {
            await approvalWrite(pool, 1, 0, 2, approvalRate, itemRequisitionCode, itemCode);
          } catch (_) {
            /* fail-open (desktop swallows write errors) */
          }
          flag = true;
        }
      } else {
        try {
          await approvalWrite(pool, 1, 1, 1, approvalRate, itemRequisitionCode, itemCode); // auto-approve
        } catch (_) {
          /* fail-open */
        }
      }
      // Level 2
      if (approvalRate >= appr2) {
        const status2 = await approvalStatus(pool, 2, itemRequisitionCode, itemCode);
        if (status2 === 0) {
          try {
            await approvalWrite(pool, 2, 0, 2, approvalRate, itemRequisitionCode, itemCode);
          } catch (_) {
            /* fail-open */
          }
          flag = true;
        }
      } else {
        try {
          await approvalWrite(pool, 2, 1, 1, approvalRate, itemRequisitionCode, itemCode); // auto-approve
        } catch (_) {
          /* fail-open */
        }
      }
      if (flag) {
        blocked.push({ itemCode, itemName, reason: "Approval Required" });
        continue; // not added, not deducted
      }

      // ---- stock clamp ------------------------------------------------------
      if (available <= 0) {
        skipped.push({ itemCode, itemName, reason: "Nil Stock" });
        continue;
      }
      let qty = toNum(g("PendingQty"));
      if (qty > available) qty = available; // clamp to what's on hand
      qty = Math.round(qty * 1000) / 1000;
      const lineRate = r4(rate);
      const amount = r4(qty * rate);
      usedByItem[itemCode] = used + qty;

      lines.push({
        costHeadCode: toInt(g("CostHeadCode")),
        costHeadName: str(g("CostHeadName")),
        departmentCode: toInt(g("DepartmentCode")),
        departmentName: str(g("DepartmentName")),
        machineCode: toInt(g("MachineCode")),
        machineName: str(g("MachineName")),
        itemCode,
        itemID: str(g("ItemID")),
        itemName,
        rackNo: str(g("RackNo")),
        stockQty: r4(available),
        returnQty: 0,
        indentQty: toNum(g("IRQty")),
        issuedQty: toNum(g("IssueQty")),
        qty,
        rate: lineRate,
        amount,
        reason: "",
      });
    }

    return sendSuccess(res, {
      header: { itemRequisitionCode, branchCode, employeeCode, indentNo, indentNoNum },
      lines,
      blocked,
      skipped,
    });
  } catch (err) {
    console.error("DB Error (ItemIssue.pullIndent):", err);
    return sendError(res, err);
  }
};

// POST /item-issue/item-history  { itemCode, machineCode, departmentCode }
export const itemHistory = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const b = req.body || {};
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("MachineCode", sql.Int, toInt(b.machineCode))
      .input("ItemCode", sql.Int, toInt(b.itemCode))
      .input("DepartmentCode", sql.Int, toInt(b.departmentCode))
      .execute("sp_Store_Issue_ItemDetails");
    return sendSuccess(res, { history: r.recordset || [] });
  } catch (err) {
    console.error("DB Error (ItemIssue.itemHistory):", err);
    return sendError(res, err);
  }
};

// POST /item-issue/create
//   { issueDate, branchCode, employeeCode, indentNo, itemRequisitionCode, remarks,
//     items:[{costHeadCode, departmentCode, machineCode, itemCode, itemName, qty,
//             rate, returnQty?, reason?}] }
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
    const itemRequisitionCode = toInt(b.itemRequisitionCode);
    if (itemRequisitionCode <= 0) return sendError(res, "Select Issue pending Line in Grid", 400);
    // Indent no must be present AND resolve to a numeric @IndentNo > 0. Prefer the
    // pure ItemRequisitionNo the client got from pull-details (indentNoNum); fall back
    // to parsing the formatted string ("IND000228 / 2026-2027" -> 228) for older clients.
    const indentNoNum = toInt(b.indentNoNum) || indentNoInt(b.indentNo);
    if (str(b.indentNo).length <= 0 || indentNoNum <= 0) return sendError(res, "Given Indent No is invalid", 400);
    if (toInt(b.branchCode) <= 0) return sendError(res, "Select the Branch...", 400);
    if (toInt(b.employeeCode) <= 0) return sendError(res, "Select the Req. ID or Name", 400);

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
    const totalQty = rows.reduce((s, d) => s + d.qty, 0);
    if (totalQty <= 0) return sendError(res, "Check the Qty...", 400);

    const pool = await getPool(req.headers.subdbname);

    // Status-guard: the indent must still be pending (else it was issued/removed).
    try {
      const chk = await pendingByCode(pool, companyCode, req, itemRequisitionCode);
      if (!chk.length)
        return sendError(res, "This indent is no longer pending (already issued or removed).", 409);
    } catch (e) {
      console.warn("ItemIssue pending re-check skipped:", e.message);
    }

    // Authoritative stock re-check -> 422 with the offending item(s).
    try {
      const offenders = await revalidateIssueStock(pool, companyCode, req.headers.FYEnd, rows);
      if (offenders.length) return res.status(422).json({ success: false, error: offenders[0].message, offenders });
    } catch (e) {
      console.warn("ItemIssue stock re-validation failed (proceeding):", e.message);
    }

    const totalAmount = rows.reduce((s, d) => s + d.amount, 0);
    const totalReturnQty = rows.reduce((s, d) => s + d.returnQty, 0);

    // Fresh issue number (never trust the client's).
    let issueNo = 0;
    try {
      issueNo = toInt(
        await scalarRaw(
          pool.request().input("FYCode", sql.Int, fyCode).input("CompanyCode", sql.Int, companyCode),
          "sp_Issue_IssueNo"
        )
      );
    } catch (_) {
      issueNo = 0;
    }

    tx = new sql.Transaction(pool);
    await tx.begin();

    // 1) Header — GST / discount all zero (the desktop pnlCalc is disabled+hidden);
    //    NetAmount = Amount, matching Direct Issue (same SP).
    const head = new sql.Request(tx);
    head.input("IssueDate", sql.DateTime, localDate(b.issueDate));
    head.input("IssueNo", sql.Int, issueNo);
    head.input("BranchCode", sql.Int, toInt(b.branchCode));
    head.input("IndentNo", sql.Int, indentNoNum);
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
    head.input("ItemRequisitionCode", sql.Int, itemRequisitionCode);
    head.input("TotalOtherExpenses", sql.Decimal(18, 4), 0);
    head.input("TotalRoundedOff", sql.Decimal(18, 4), 0);
    head.input("TotalNetAmount", sql.Decimal(18, 4), totalAmount);
    head.input("Remarks", sql.NVarChar, str(b.remarks));
    head.input("FYCode", sql.Int, fyCode);
    head.input("CompanyCode", sql.Int, companyCode);
    head.input("User", sql.Int, parseInt(userId));
    head.input("Node", sql.Int, parseInt(nodeCode));
    const issueCode = await scalar(head, "sp_Issue_AddEdit");

    // 2) Clear existing detail rows (edit-path pattern; harmless on create).
    await new sql.Request(tx)
      .input("IssueCode", sql.Int, issueCode)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_IssueDetails_Delete");

    // 3) Insert detail rows.
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

    // 4) Best-effort cached-stock recalc (the issue reduces stock).
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
    if (msg.includes("UK_IssueDetailsName_tblIssueDetails")) return sendError(res, "This item is already added.", 409);
    console.error("DB Error (ItemIssue.create):", err);
    return sendError(res, err);
  }
};
