import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Item Issue Indent  (port of the WinForms frmItemIndent, RequisitionType 'I')
//   Stores raise an ISSUE indent: a grid of in-stock items, each with cost head /
//   department / machine / employee, the live stock + rate, and a Qty that may
//   not exceed available stock. Display number = "IND" + zero-padded number.
//   Same stored-proc family as Item Requisition; the differences are:
//     - only stock-bearing items (sp_Item_GetbyItemName @Stock=1)
//     - Qty must be <= stock (re-validated server-side at save, authoritative)
//     - the four IssueApproval* flags depend on the line Rate vs the
//       tbl_Setting issue thresholds (replicated AS-IS — see saveOrUpdate).
//
//   Endpoints
//     GET  /options                branches / cost heads / departments /
//                                  employees (attendance-aware) / in-stock items
//                                  / dateConfig
//     GET  /items?date=            re-snapshot stock for a date, return items
//     GET  /machines?branchCode=   tbl_Machine for a branch (+ DepartmentCode)
//     GET  /next-no                sp_ItemRequisition_ItemRequisitionNo ('I')
//     GET  /lists                  sp_ItemRequisition_GetAll ('I') + lock flags
//     GET  /list/:code             sp_ItemRequisitionDetails_GetAll (header+rows)
//     POST /create  PUT /update/:code   transactional AddEdit -> Delete -> Insert
//     DELETE /delete/:code         guarded (approved / consumed) -> 409
//
// Company from req.headers.companyCode, FY from req.headers.FYCode/FYEnd; AddEdit
// also needs @User / @Node from req.headers.userId / nodeCode.
// ---------------------------------------------------------------------------

const REQ_TYPE = "I";
const DOC_FROM = "ITEM INDENT";

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};
// Display number zero-padded to 6 digits, matching the SP
// sp_ItemRequisition_ItemRequisitionNo (268 -> "000268" -> "IND000268").
const padReqNo = (n) => String(toInt(n)).padStart(6, "0");
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getFYCode = (req) => toInt(req.headers.FYCode);
const D = (v) => (v ? new Date(v) : null);

const pad2 = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// Indent Date rules (port of frmItemIndent's date logic):
//   - max = server today (no future dates)
//   - min = today - Prev_StoreDays (tbl_Setting), else today (no back-dating)
//   - enabled = the user is level 1 (admin) OR tbl_Setting.DateEnable = 1
// Defensive: any failure falls back to "today only, editable".
const buildStoreDateConfig = async (pool, req) => {
  let serverDate = ymd(new Date());
  let prevDays = 0;
  let dateEnable = 0;
  let settingsRead = false;
  let isAdmin = true; // fail-open: only lock a user we positively confirm is limited
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
    /* unknown -> treat as admin (don't lock out) */
  }

  const [y, m, d] = serverDate.split("-").map(Number);
  const minObj = new Date(y, m - 1, d);
  if (prevDays > 0) minObj.setDate(minObj.getDate() - prevDays);

  const enabled = isAdmin || dateEnable === 1 || !settingsRead;
  return { serverDate, minDate: ymd(minObj), maxDate: serverDate, enabled };
};

const scalar = async (request, proc) => {
  const r = await request.execute(proc);
  const row = r.recordset?.[0];
  return row ? toInt(Object.values(row)[0]) : 0;
};
// Keeps the raw value (preserves zero-padding e.g. "000268").
const scalarRaw = async (request, proc) => {
  const r = await request.execute(proc);
  const row = r.recordset?.[0];
  return row ? Object.values(row)[0] : null;
};

// Map a sp_Item_GetbyItemName recordset row -> dropdown option. Stock is the
// cap for Qty; CurStock + StockValue feed the 4-decimal rate (StockValue/CurStock).
const mapItem = (r) => ({
  value: r.ItemCode,
  label: r.ItemName,
  ItemUomCode: toInt(r.ItemUomCode),
  ItemUomName: r.ItemUomName ?? r.ItemUOMName ?? "",
  ItemID: r.ItemID ?? "",
  PartNo: r.Partnumber ?? r.PartNo ?? "",
  Stock: toNum(r.AvailableStock ?? r.Stock), // display + qty cap
  CurStock: toNum(r.Stock), // rate denominator
  StockValue: toNum(r.StockValue),
  CatalogueNo: r.CatalogueNo ?? r.CatalogNo ?? "",
  DrawingNo: r.DrawingNo ?? r.DrawingNumber ?? "",
  HSNCode: r.HSNCode ?? r.HSNNo ?? r.HSN ?? "",
});

// Issue rate = StockValue / CurStock rounded to 4 decimals (desktop:
// Math.Round(StockValue / CurStock, 4)); blank/0 when there is no stock.
const issueRate = (stockValue, curStock) =>
  toNum(curStock) > 0 ? Math.round((toNum(stockValue) / toNum(curStock)) * 1e4) / 1e4 : 0;

// Refresh the date's stock snapshot, then load the in-stock item lookup. Port of
// frmItemIndent.GetStock(): sp_Stock_Statement (@CurStock=1) primes per-item
// stock for @FromDate=@ToDate=date, then sp_Item_GetbyItemName returns it.
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
    /* snapshot is best-effort; the item SP still returns its own stock columns */
  }
  const items = await pool
    .request()
    .input("CompanyCode", sql.Int, companyCode)
    .input("Stock", sql.Int, 1)
    .input("Status", sql.Int, 1)
    .execute("sp_Item_GetbyItemName");
  return (items.recordset || []).map(mapItem);
};

// GET /item-indent/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const date = req.query.date; // optional: snapshot stock as of this date
    const pool = await getPool(req.headers.subdbname);

    // Employee source depends on tbl_Setting.Check_Attendence (port of
    // frmItemIndent.Bind_Data): when on, only employees present per attendance on
    // the indent date (sp_ItemRequisition_GetbyEmployee); else all store staff.
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

    const [branches, costHeads, departments, employees, items, dateConfig] = await Promise.all([
      // tbl_Branch has no CompanyCode column — don't filter by company.
      pool.request().query("SELECT BranchCode, BranchName from tbl_Branch Order by BranchName"),
      pool.request().query("Select CostHeadName, CostHeadCode from tbl_CostHead Where Status = 1 and CostHeadCode > 0 Order by CostHeadName"),
      pool.request().query("Select DepartmentName_English as DepartmentName, DepartmentCode from tbl_Department Where Status = 1 Order by DepartmentName_English"),
      employeeReq,
      loadItemsForDate(pool, companyCode, date),
      buildStoreDateConfig(pool, req),
    ]);

    return sendSuccess(res, {
      dateConfig,
      checkAttendance,
      branches: branches.recordset.map((r) => ({ value: r.BranchCode, label: r.BranchName })),
      costHeads: costHeads.recordset.map((r) => ({ value: r.CostHeadCode, label: r.CostHeadName })),
      departments: departments.recordset.map((r) => ({ value: r.DepartmentCode, label: r.DepartmentName })),
      employees: employees.recordset.map((r) => ({ value: r.EmployeeCode, label: r.str_EmployeeID ?? r.EmployeeName })),
      items, // already mapped by loadItemsForDate
    });
  } catch (err) {
    console.error("DB Error (ItemIndent.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /item-indent/items?date=  -> re-snapshot stock for a date, return items
export const getItems = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const items = await loadItemsForDate(pool, getCompanyCode(req), req.query.date);
    return sendSuccess(res, { items });
  } catch (err) {
    console.error("DB Error (ItemIndent.getItems):", err);
    return sendError(res, err);
  }
};

// GET /item-indent/machines?branchCode=
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
          " Order by MachineName"
      );
    return sendSuccess(res, {
      machines: r.recordset.map((x) => ({ value: x.MachineCode, label: x.MachineName, DepartmentCode: toInt(x.DepartmentCode) })),
    });
  } catch (err) {
    console.error("DB Error (ItemIndent.getMachines):", err);
    return sendError(res, err);
  }
};

// GET /item-indent/next-no
export const getNextNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const no = await scalarRaw(
      pool
        .request()
        .input("CompanyCode", sql.Int, getCompanyCode(req))
        .input("FYCode", sql.Int, getFYCode(req))
        .input("RequisitionType", sql.NVarChar, REQ_TYPE),
      "sp_ItemRequisition_ItemRequisitionNo"
    );
    return sendSuccess(res, { no, strNo: `IND${no}` });
  } catch (err) {
    console.error("DB Error (ItemIndent.getNextNo):", err);
    return sendError(res, err);
  }
};

// Item Indents already approved (IssueApproval1=1) or consumed downstream
// (on a PO / direct inward) can no longer be edited or deleted. Mirrors
// frmItemRequisition_IndentDetails.LoadNonEditableCodes + the PO/inward guard.
const loadLockedSet = async (pool) => {
  const r = await pool.request().query(
    "SELECT DISTINCT ItemRequisitionCode FROM vw_ItemRequisitionDetails WHERE IssueApproval1 = 1 AND RequisitionType = 'I' " +
      "UNION SELECT DISTINCT ItemRequisitionCode FROM tbl_PurchaseOrderDetails " +
      "UNION SELECT DISTINCT ItemRequisitionCode FROM vw_ItemRequisitionDetails WHERE WithoutPO_Inward = 1"
  );
  return new Set((r.recordset || []).map((x) => Number(x.ItemRequisitionCode)));
};

// GET /item-indent/lists
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("RequisitionType", sql.NVarChar, REQ_TYPE)
      .execute("sp_ItemRequisition_GetAll");

    let lockedSet = new Set();
    try {
      lockedSet = await loadLockedSet(pool);
    } catch (_) {
      /* if the lock probe fails, default to editable (backend still guards writes) */
    }

    const data = (result.recordset || [])
      .map((r) => {
        const IsLocked = lockedSet.has(Number(r.ItemRequisitionCode));
        return { ...r, id: r.ItemRequisitionCode, IsLocked, Status: IsLocked ? "Approved/Used" : "Pending" };
      })
      .sort((a, b) => Number(b.ItemRequisitionCode) - Number(a.ItemRequisitionCode));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (ItemIndent.getList):", err);
    return sendError(res, err);
  }
};

// GET /item-indent/list/:code -> header + detail rows
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = parseInt(req.params.code);
    if (!code) return sendError(res, "Invalid ItemRequisitionCode", 400);
    const pool = await getPool(req.headers.subdbname);

    const det = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("ItemRequisitionCode", sql.Int, code)
      .execute("sp_ItemRequisitionDetails_GetAll");
    const recs = det.recordset || [];
    if (!recs.length) return sendError(res, "Item Indent not found", 404);

    const h = recs[0];
    return sendSuccess(res, {
      ItemRequisitionCode: toInt(h.ItemRequisitionCode),
      ItemRequisitionNo: toInt(h.ItemRequisitionNo),
      strItemRequisitionNo: h.strItemRequisitionNo ?? "",
      ItemRequisitionDate: h.ItemRequisitionDate,
      BranchCode: toInt(h.BranchCode),
      Remarks: (h.Remarks || "").toString().trim(),
      details: recs.map((r) => ({
        CostHeadCode: toInt(r.CostHeadCode),
        DepartmentCode: toInt(r.DepartmentCode),
        MachineCode: toInt(r.MachineCode),
        EmployeeCode: toInt(r.EmployeeCode),
        ItemCode: toInt(r.ItemCode),
        ItemID: r.ItemID ?? "",
        PartNo: r.PartNumber ?? r.PartNo ?? "",
        ItemUomCode: toInt(r.ItemUomCode),
        ItemUomName: r.ItemUomName ?? "",
        Qty: toNum(r.Qty),
        Stock: toNum(r.CurStockQty ?? r.Stock),
        Rate: toNum(r.StockRate ?? r.Rate),
        CommittedDate: r.CommittedDate,
        Remarks: (r.Remarks1 ?? r.Remarks ?? "").toString().trim(),
        AllMachines: false,
      })),
    });
  } catch (err) {
    console.error("DB Error (ItemIndent.getById):", err);
    return sendError(res, err);
  }
};

// Server-authoritative stock re-validation (spec point 7 / desktop save loop):
// for each line with Qty>0 sum Closing from sp_Stock_Statement and reject if Qty
// exceeds it. Don't trust the client's Stock. Returns the offending lines.
// FromDate = indent date, ToDate = FY end (req.headers.FYEnd) so Closing reflects
// the full financial-year availability, mirroring frmItemIndent (@ToDate=FYMaxDate).
const revalidateStock = async (pool, companyCode, fyEnd, reqDate, details) => {
  const offenders = [];
  const from = new Date(reqDate);
  const to = fyEnd ? new Date(fyEnd) : new Date(reqDate);
  for (const d of details) {
    const itemCode = toInt(d.ItemCode);
    if (itemCode <= 0) continue;
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("FromDate", sql.DateTime, from)
      .input("ToDate", sql.DateTime, to)
      .input("ItemCode", sql.Int, itemCode)
      .execute("sp_Stock_Statement");
    const available = (r.recordset || []).reduce((s, x) => s + toNum(x.Closing), 0);
    if (toNum(d.Qty) > available)
      offenders.push({ ItemCode: itemCode, ItemID: d.ItemID ?? "", requested: toNum(d.Qty), available });
  }
  return offenders;
};

const saveOrUpdate = async (req, res, isEdit) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const companyCode = getCompanyCode(req);
    const fyCode = getFYCode(req);
    if (companyCode <= 0)
      return sendError(res, "You are logged in to a group of companies; switch to a single company.", 400);

    const code = isEdit ? parseInt(req.params.code) : 0;
    const b = req.body || {};

    if (toInt(b.BranchCode) <= 0) return sendError(res, "Select the Branch", 400);
    const details = (Array.isArray(b.details) ? b.details : []).filter((d) => toNum(d.Qty) > 0);
    if (!details.length) return sendError(res, "Select the Item", 400);
    for (const d of details) {
      if (toNum(d.Qty) <= 0) return sendError(res, "Enter the Qty", 400);
    }

    const totalQty = details.reduce((s, d) => s + toNum(d.Qty), 0);
    const reqDate = D(b.ItemRequisitionDate) || new Date();

    const pool = await getPool(req.headers.subdbname);

    // Block edit/delete of an already-approved/consumed indent (parity with the
    // desktop guard) before touching the record.
    if (isEdit && code) {
      try {
        const locked = await loadLockedSet(pool);
        if (locked.has(Number(code)))
          return sendError(res, "You can not edit the Item Indent (already approved or consumed).", 409);
      } catch (_) {
        /* probe failure -> allow; the write guards still protect FK integrity */
      }
    }

    // Authoritative stock re-check. If the SP signature differs in a tenant DB and
    // the probe throws, fall back to the client-supplied Stock comparison so saves
    // aren't hard-blocked — and log it. (Adapt the SP call, not the SP.)
    try {
      const offenders = await revalidateStock(pool, companyCode, req.headers.FYEnd, reqDate, details);
      if (offenders.length) {
        const names = offenders.map((o) => o.ItemID || o.ItemCode).join(", ");
        return res.status(422).json({
          success: false,
          error: `Qty exceeds available stock for: ${names}`,
          offenders,
        });
      }
    } catch (e) {
      console.warn("ItemIndent stock re-validation fell back to client stock:", e.message);
      for (const d of details) {
        if (toNum(d.Qty) > toNum(d.Stock))
          return res.status(422).json({
            success: false,
            error: `Qty exceeds available stock for: ${d.ItemID || d.ItemCode}`,
            offenders: [{ ItemCode: toInt(d.ItemCode), ItemID: d.ItemID ?? "", requested: toNum(d.Qty), available: toNum(d.Stock) }],
          });
      }
    }

    // Issue approval thresholds from tbl_Setting (issue value bands).
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
      /* default thresholds 0 -> everything auto-passes (flags 0) */
    }

    const reqNo = isEdit
      ? toInt(b.ItemRequisitionNo)
      : await scalar(
          pool
            .request()
            .input("CompanyCode", sql.Int, companyCode)
            .input("FYCode", sql.Int, fyCode)
            .input("RequisitionType", sql.NVarChar, REQ_TYPE),
          "sp_ItemRequisition_ItemRequisitionNo"
        );
    const strReqNo = isEdit ? b.strItemRequisitionNo || `IND${padReqNo(reqNo)}` : `IND${padReqNo(reqNo)}`;

    tx = new sql.Transaction(pool);
    await tx.begin();

    const head = new sql.Request(tx);
    if (isEdit && code) head.input("ItemRequisitionCode", sql.Int, code);
    head.input("BranchCode", sql.Int, toInt(b.BranchCode));
    head.input("ItemRequisitionDate", sql.DateTime, reqDate);
    head.input("ItemRequisitionNo", sql.Int, reqNo);
    head.input("RequisitionType", sql.NVarChar, REQ_TYPE);
    head.input("strItemRequisitionNo", sql.NVarChar, strReqNo);
    head.input("TotalQty", sql.Decimal(18, 3), totalQty);
    head.input("CommittedDate", sql.DateTime, reqDate);
    head.input("Remarks", sql.NVarChar, (b.Remarks || "").toString().trim());
    head.input("FYCode", sql.Int, fyCode);
    head.input("CompanyCode", sql.Int, companyCode);
    head.input("User", sql.Int, parseInt(userId));
    head.input("Node", sql.Int, parseInt(nodeCode));
    const itemRequisitionCode = await scalar(head, "sp_ItemRequisition_AddEdit");

    await new sql.Request(tx)
      .input("ItemRequisitionCode", sql.Int, itemRequisitionCode)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_ItemRequisitionDetails_Delete");

    let sno = 0;
    for (const d of details) {
      sno += 1;
      // Prefer a server-recomputed 4-dp rate when the client sent stock figures;
      // otherwise trust the line Rate. Keeps StockRate at 4 decimals (desktop).
      const rate = issueRate(d.StockValue, d.CurStock) || Math.round(toNum(d.Rate) * 1e4) / 1e4;

      // -- Approval flags: replicated AS-IS from frmItemIndent.btnSave_Click. ----
      // NOTE: the first two branches are intentionally identical (both all-zeros)
      // in the desktop source. This looks like a latent bug — the middle band may
      // have been meant to set IssueApproval2=1 — but it is reproduced verbatim
      // for byte-for-byte data compatibility. See README / hand-off note.
      let f1 = 1, f1a = 0, f2 = 1, f2a = 0;
      if (rate >= appr1) {
        f1 = 0; f1a = 0; f2 = 0; f2a = 0;
      } else if (rate >= appr2) {
        f1 = 0; f1a = 0; f2 = 0; f2a = 0;
      } else {
        f1 = 1; f1a = 0; f2 = 1; f2a = 0;
      }

      await new sql.Request(tx)
        .input("ItemRequisitionCode", sql.Int, itemRequisitionCode)
        .input("SNo", sql.Int, sno)
        .input("CostHeadCode", sql.Int, toInt(d.CostHeadCode))
        .input("DepartmentCode", sql.Int, toInt(d.DepartmentCode))
        .input("MachineCode", sql.Int, toInt(d.MachineCode))
        .input("EmployeeCode", sql.Int, toInt(d.EmployeeCode))
        .input("ItemCode", sql.Int, toInt(d.ItemCode))
        .input("ItemUomCode", sql.Int, toInt(d.ItemUomCode))
        .input("Qty", sql.Decimal(18, 3), toNum(d.Qty))
        // Committed date is OPTIONAL on the line: send NULL when the user left it
        // blank (was previously coerced to the indent date). NOTE: ships unverified
        // — confirm tbl_ItemRequisitionDetails.CommittedDate is nullable before
        // rollout; if NOT NULL, restore `|| reqDate`.
        .input("CommittedDate", sql.DateTime, D(d.CommittedDate))
        .input("CompanyCode", sql.Int, companyCode)
        .input("Remarks", sql.NVarChar, (d.Remarks || "").toString().trim())
        .input("DocumentFrom", sql.NVarChar, DOC_FROM)
        .input("Qty_Status", sql.NVarChar, DOC_FROM)
        .input("StockRate", sql.Decimal(18, 4), rate)
        .input("IssueApproval1", sql.Int, f1)
        .input("IssueApproval1_Auto", sql.Int, f1a)
        .input("IssueApproval2", sql.Int, f2)
        .input("IssueApproval2_Auto", sql.Int, f2a)
        .execute("sp_ItemRequisitionDetails_Insert");
    }

    await tx.commit();
    return sendSuccess(
      res,
      { ItemRequisitionCode: itemRequisitionCode, strItemRequisitionNo: strReqNo },
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (tx) {
      try {
        await tx.rollback();
      } catch (_) {}
    }
    console.error("DB Error (saveOrUpdateItemIndent):", err);
    return sendError(res, err);
  }
};

export const create = (req, res) => saveOrUpdate(req, res, false);
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /item-indent/delete/:code
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = parseInt(req.params.code);
    if (!code) return sendError(res, "Invalid ItemRequisitionCode", 400);
    const pool = await getPool(req.headers.subdbname);

    // Blocked when approved (IssueApproval1=1) or consumed by a PO / direct inward.
    const approved = await pool
      .request()
      .input("ItemRequisitionCode", sql.Int, code)
      .query("Select 1 from vw_ItemRequisitionDetails Where IssueApproval1 = 1 AND RequisitionType = 'I' AND ItemRequisitionCode = @ItemRequisitionCode");
    const usedPO = await pool
      .request()
      .input("ItemRequisitionCode", sql.Int, code)
      .query("Select 1 from tbl_PurchaseOrderDetails Where ItemRequisitionCode = @ItemRequisitionCode");
    const usedInw = await pool
      .request()
      .input("ItemRequisitionCode", sql.Int, code)
      .query("Select 1 from vw_ItemRequisitionDetails Where WithoutPO_Inward = 1 AND ItemRequisitionCode = @ItemRequisitionCode");
    if (approved.recordset.length || usedPO.recordset.length || usedInw.recordset.length)
      return sendError(res, "You can not delete the Item Indent", 409);

    await pool
      .request()
      .input("ItemRequisitionCode", sql.Int, code)
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_ItemRequisition_Delete");
    return sendSuccess(res, { ItemRequisitionCode: code }, "The record is deleted");
  } catch (err) {
    if (err.message && err.message.includes("FK_"))
      return sendError(res, "You can not delete the Item Indent", 409);
    console.error("DB Error (ItemIndent.remove):", err);
    return sendError(res, err);
  }
};
