import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Indent Approval — Stage 1 (port of WinForms frmIssueApproval1).
//
//   Approve the HIGH-VALUE lines of pending Item Issue Indents (RequisitionType
//   'I'). A line only needs (and only appears for) stage-1 approval when its
//   average stock Rate >= tbl_Setting.IssueApproval1_Value AND it is not yet
//   IssueApproval1-approved AND it has stock — mirrors the VB CheckStock filter.
//
//   - options       : employees (vw_Employee_New) + indent-no dropdown
//                     (sp_IssueApproval1_Pending) + auto Issue No (sp_Issue_IssueNo)
//                     + FY start + server date + the IssueApproval1_Value threshold.
//   - pending        : sp_IssueApproval1_Pending (@CompanyCode [+@ItemRequisitionCode | +@FromDate,@ToDate]).
//   - indent-lines   : sp_Issue_ItemRequisitionDetails_Pendings -> per line run
//                      sp_Stock_Statement, keep only Rate>=threshold & not-approved & in-stock.
//   - approve        : per checked line UPDATE tbl_ItemRequisitionDetails set
//                      IssueApproval1=1, IssueApprovalUser1, IssueApprovalDate1
//                      (status-guarded, one txn, 409 on already-approved).
//
//   Company / FY / user come from the session headers — never the client. A
//   group login (companyCode <= 0) is rejected (the VB int_CompanyCode = 0 guard).
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
const r2 = (v) => Math.round((toNum(v) + Number.EPSILON) * 100) / 100;
const r4 = (v) => Math.round((toNum(v) + Number.EPSILON) * 10000) / 10000;
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getFYCode = (req) => toInt(req.headers.FYCode);
const getUserCode = (req) => toInt(req.headers.userId);
const D = (v) => (v ? new Date(v) : null);
const pick = (row, ...keys) => {
  for (const k of keys) {
    const x = row?.[k];
    if (x !== null && x !== undefined && String(x).trim() !== "") return x;
  }
  return null;
};
const scalarRaw = async (request, proc) => {
  const r = await request.execute(proc);
  const row = r.recordset?.[0];
  return row ? Object.values(row)[0] : null;
};
const serverDate = async (pool) => {
  const r = await pool.request().query("SELECT CAST(GETDATE() AS date) AS d");
  return r.recordset?.[0]?.d || null;
};

// GET /indent-approval-1/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const groupLogin = companyCode <= 0; // VB: int_CompanyCode = 0 -> group of companies
    const pool = await getPool(req.headers.subdbname);

    const fyRes = await pool
      .request()
      .input("FYCode", sql.Int, getFYCode(req))
      .query("Select FYStart from tbl_Fyear where FYCode = @FYCode");
    const today = await serverDate(pool);

    let employees = [];
    let indents = [];
    let issueNo = "";
    let appr1Value = 0;
    if (!groupLogin) {
      const empRes = await pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .query(
          "Select EmployeeCode, str_EmployeeID, EmployeeName from vw_Employee_New WHERE CompanyCode = @CompanyCode AND DOL IS NULL Order by str_EmployeeID",
        );
      employees = (empRes.recordset || []).map((e) => ({
        value: toInt(e.EmployeeCode),
        label: str(e.str_EmployeeID),
        EmployeeID: str(e.str_EmployeeID),
        EmployeeName: str(e.EmployeeName),
      }));

      const setRes = await pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .query("Select isnull(IssueApproval1_Value,0) AS A1 from tbl_Setting where CompanyCode = @CompanyCode");
      appr1Value = toNum(setRes.recordset?.[0]?.A1);

      try {
        const n = await scalarRaw(
          pool.request().input("FYCode", sql.Int, getFYCode(req)).input("CompanyCode", sql.Int, companyCode),
          "sp_Issue_IssueNo",
        );
        issueNo = n == null ? "" : String(n);
      } catch {
        issueNo = "";
      }

      try {
        const ind = await pool.request().input("CompanyCode", sql.Int, companyCode).execute("sp_IssueApproval1_Pending");
        const seen = new Set();
        for (const r of ind.recordset || []) {
          const code = toInt(pick(r, "ItemRequisitionCode"));
          if (code > 0 && !seen.has(code)) {
            seen.add(code);
            indents.push({
              value: code,
              label: str(pick(r, "strItemRequisitionNo", "ItemRequisitionNo")),
              ItemRequisitionDate: pick(r, "ItemRequisitionDate") || null,
              DepartmentName: str(pick(r, "DepartmentName")),
            });
          }
        }
      } catch {
        indents = [];
      }
    }

    return sendSuccess(res, {
      groupLogin,
      employees,
      indents,
      issueNo,
      fyStart: fyRes.recordset?.[0]?.FYStart || null,
      serverDate: today,
      appr1Value,
    });
  } catch (err) {
    console.error("DB Error (IndentApproval1.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /indent-approval-1/pending?fromDate=&toDate=&itemRequisitionCode=
export const getPending = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    if (companyCode <= 0) return sendSuccess(res, []);
    const pool = await getPool(req.headers.subdbname);

    const code = toInt(req.query.itemRequisitionCode);
    const r = pool.request().input("CompanyCode", sql.Int, companyCode);
    if (code > 0) {
      r.input("ItemRequisitionCode", sql.Int, code);
    } else {
      r.input("FromDate", sql.DateTime, D(req.query.fromDate));
      r.input("ToDate", sql.DateTime, D(req.query.toDate));
    }
    const result = await r.execute("sp_IssueApproval1_Pending");
    const rows = (result.recordset || []).map((x, i) => ({
      id: `${toInt(pick(x, "ItemRequisitionCode"))}-${str(pick(x, "DepartmentCode")) || i}`,
      ItemRequisitionCode: toInt(pick(x, "ItemRequisitionCode")),
      ItemRequisitionNo: pick(x, "ItemRequisitionNo"),
      ItemRequisitionDate: pick(x, "ItemRequisitionDate"),
      DepartmentName: str(pick(x, "DepartmentName")),
      strItemRequisitionNo: str(pick(x, "strItemRequisitionNo")),
    }));
    return sendSuccess(res, rows);
  } catch (err) {
    console.error("DB Error (IndentApproval1.getPending):", err);
    return sendError(res, err);
  }
};

// GET /indent-approval-1/indent-lines?itemRequisitionCode=&issueDate=
// Mirrors the VB CheckStock filter — only the lines that still need stage-1.
export const getIndentLines = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    if (companyCode <= 0)
      return sendError(res, "You are logged into a group of companies — select a single company", 400);
    const code = toInt(req.query.itemRequisitionCode);
    if (code <= 0) return sendError(res, "Invalid ItemRequisitionCode", 400);
    const pool = await getPool(req.headers.subdbname);
    const issueDate = req.query.issueDate ? D(req.query.issueDate) : new Date();

    const setRes = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .query("Select isnull(IssueApproval1_Value,0) AS A1 from tbl_Setting where CompanyCode = @CompanyCode");
    const appr1 = toNum(setRes.recordset?.[0]?.A1);

    const det = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("ItemRequisitionCode", sql.Int, code)
      .execute("sp_Issue_ItemRequisitionDetails_Pendings");
    const details = det.recordset || [];

    const empRow = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("ItemRequisitionCode", sql.Int, code)
      .query(
        "Select Top 1 EmployeeCode from tbl_ItemRequisitionDetails where CompanyCode = @CompanyCode AND ItemRequisitionCode = @ItemRequisitionCode",
      );
    const employeeCode = toInt(empRow.recordset?.[0]?.EmployeeCode);
    const indentNo = str(pick(details[0] || {}, "strItemRequisitionNo"));

    const consumed = {}; // running same-item stock consumption (VB reduces StQty per grid row)
    const lines = [];
    for (const d of details) {
      const itemCode = toInt(pick(d, "ItemCode"));
      if (itemCode <= 0) continue;
      const pendingQty = toNum(pick(d, "PendingQty"));

      const st = await pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("FromDate", sql.DateTime, issueDate)
        .input("ToDate", sql.DateTime, issueDate)
        .input("ItemCode", sql.Int, itemCode)
        .execute("sp_Stock_Statement");
      const stockRows = st.recordset || [];
      if (!stockRows.length) continue; // Nil Stock

      let stQty = 0;
      let clValue = 0;
      for (const s of stockRows) {
        stQty += toNum(s.Closing);
        clValue += toNum(s.ClosingValue);
      }
      if (stQty === 0) continue; // Nil / avoid divide-by-zero

      const rate = r2(clValue / stQty); // avg rate from ORIGINAL stock (VB txtRate)
      if (rate < appr1) continue; // below stage-1 threshold -> no stage-1 needed

      const ap = await pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("ItemRequisitionCode", sql.Int, code)
        .input("ItemCode", sql.Int, itemCode)
        .query(
          "select isnull(IssueApproval1,0) AS A from tbl_ItemRequisitionDetails where CompanyCode = @CompanyCode AND ItemRequisitionCode = @ItemRequisitionCode AND ItemCode = @ItemCode",
        );
      if (toInt(ap.recordset?.[0]?.A) !== 0) continue; // already stage-1 approved

      const availQty = stQty - (consumed[itemCode] || 0); // reduced by earlier same-item lines
      if (availQty <= 0) continue; // Nil Stock after consumption

      const qty = Math.min(pendingQty, availQty); // VB: cap Qty at stock
      consumed[itemCode] = (consumed[itemCode] || 0) + qty;

      lines.push({
        itemCode,
        itemName: str(pick(d, "ItemName")),
        departmentCode: toInt(pick(d, "DepartmentCode")),
        departmentName: str(pick(d, "DepartmentName")),
        machineCode: toInt(pick(d, "MachineCode")),
        machineName: str(pick(d, "MachineName")),
        returnQty: 0,
        stockQty: r4(availQty),
        qty: r4(qty),
        rate,
        amount: r2(qty * rate),
      });
    }

    return sendSuccess(res, { indentNo, employeeCode, lines });
  } catch (err) {
    console.error("DB Error (IndentApproval1.getIndentLines):", err);
    return sendError(res, err);
  }
};

// POST /indent-approval-1/approve
//   { itemRequisitionCode, issueDate, employeeCode, indentNo, remarks, itemCodes:[...] }
export const approve = async (req, res) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    if (companyCode <= 0)
      return sendError(res, "You Are Login in Group of Company, please change in any one Company", 400);
    const userCode = getUserCode(req);

    const b = req.body || {};
    const code = toInt(b.itemRequisitionCode);
    const employeeCode = toInt(b.employeeCode);
    const indentNo = str(b.indentNo);
    const itemCodes = Array.isArray(b.itemCodes)
      ? [...new Set(b.itemCodes.map(toInt).filter((x) => x > 0))]
      : [];

    // Validations — exact VB order.
    if (!b.issueDate || Number.isNaN(new Date(b.issueDate).getTime()))
      return sendError(res, "Check Issue Date", 400);
    if (code <= 0) return sendError(res, "Select Issue pending Line in Grid", 400);
    if (!indentNo) return sendError(res, "Given Indent No is invalid", 400);
    if (employeeCode <= 0) return sendError(res, "Select the Req. ID or Name", 400);
    if (!itemCodes.length)
      return sendError(res, "No Record is Selected to Approval...Please Check and Select...", 400);

    const pool = await getPool(req.headers.subdbname);
    tx = new sql.Transaction(pool);
    await tx.begin();

    const conflicts = [];
    let approvedCount = 0;
    for (const itemCode of itemCodes) {
      const r = await new sql.Request(tx)
        .input("User", sql.Int, userCode)
        .input("Now", sql.DateTime, new Date())
        .input("ItemRequisitionCode", sql.Int, code)
        .input("ItemCode", sql.Int, itemCode)
        .input("CompanyCode", sql.Int, companyCode)
        .query(
          "UPDATE tbl_ItemRequisitionDetails SET IssueApproval1 = 1, IssueApprovalUser1 = @User, IssueApprovalDate1 = @Now " +
            "WHERE ItemRequisitionCode = @ItemRequisitionCode AND ItemCode = @ItemCode AND CompanyCode = @CompanyCode AND ISNULL(IssueApproval1,0) = 0",
        );
      const affected = r.rowsAffected?.[0] || 0;
      if (affected === 0) conflicts.push(itemCode);
      else approvedCount += affected;
    }

    if (conflicts.length) {
      await tx.rollback();
      return sendError(
        res,
        `Some lines were already approved elsewhere — please reload (items: ${conflicts.join(", ")})`,
        409,
      );
    }

    await tx.commit();
    return sendSuccess(res, { approvedCount }, "Approved Successfully");
  } catch (err) {
    if (tx) {
      try {
        await tx.rollback();
      } catch {
        /* ignore */
      }
    }
    console.error("DB Error (IndentApproval1.approve):", err);
    return sendError(res, err);
  }
};
