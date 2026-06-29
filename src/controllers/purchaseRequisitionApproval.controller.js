import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Purchase Requisition Approval (port of WinForms frmItemRequistionApproval,
// RequisitionType 'R').
//
//   Filter pending purchase requisitions (sp_ItemRequistion_Approval_Pendings),
//   open the requisition document (sp_Company_GetAll + sp_ItemRequisitionDetails_
//   GetAll @RequisitionType='R'), and Approve / Reject it.
//
//   - options    : the Requisition-No dropdown (all pendings, deduped).
//   - pending    : sp_ItemRequistion_Approval_Pendings(@FromDate,@ToDate[,@ItemRequisitionCode]).
//   - document   : company header + the requisition's item lines (no rates/amounts).
//   - approve    : sp_ItemRequistion_Approval_Update(@ItemRequisitionCode,@UserCode,@NodeCode).
//   - reject     : sp_ItemRequistion_Reject_Update(@ItemRequisitionCode,@RejectReason,@UserCode,@NodeCode).
//
//   Approve/Reject re-check the requisition is STILL pending first -> HTTP 409 if
//   it left the queue (approved/rejected elsewhere). Company / user / node come
//   from the session headers — never the client. A UK_tbl* violation maps to the
//   friendly "Please Check the Entry".
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
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getUserCode = (req) => toInt(req.headers.userId);
const getNodeCode = (req) => toInt(req.headers.nodeCode);
const D = (v) => (v ? new Date(v) : null);
const pick = (row, ...keys) => {
  for (const k of keys) {
    const x = row?.[k];
    if (x !== null && x !== undefined && String(x).trim() !== "") return x;
  }
  return null;
};
const bufferToDataUri = (buf) => {
  if (!buf) return null;
  try {
    const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
    if (!b.length) return null;
    return `data:image/png;base64,${b.toString("base64")}`;
  } catch {
    return null;
  }
};
const serverDate = async (pool) => {
  const r = await pool.request().query("SELECT CAST(GETDATE() AS date) AS d");
  return r.recordset?.[0]?.d || null;
};

const loadCompany = async (pool, companyCode) => {
  const r = await pool.request().input("CompanyCode", sql.Int, companyCode).execute("sp_Company_GetAll");
  const c = r.recordset?.[0] || {};
  return {
    name: str(pick(c, "CompanyName")),
    address1: str(pick(c, "Address1")),
    address2: str(pick(c, "Address2")),
    city: str(pick(c, "City")),
    district: str(pick(c, "District")),
    pinCode: str(pick(c, "PinCode", "Pincode")),
    phoneNo: str(pick(c, "PhoneNo")),
    mobileNo: str(pick(c, "MainMobileNo", "MobileNo")),
    gstin: str(pick(c, "GSTINNo", "GSTNo")),
    logo: bufferToDataUri(c.Logo || c.ReportLogo),
  };
};

// True when the requisition is still in the approval-pending queue. Used as the
// concurrency guard before approve/reject. Probe failure -> allow (don't hard-block).
const stillPending = async (pool, code) => {
  try {
    const r = await pool
      .request()
      .input("FromDate", sql.DateTime, new Date("1900-01-01"))
      .input("ToDate", sql.DateTime, new Date("2999-12-31"))
      .input("ItemRequisitionCode", sql.Int, code)
      .execute("sp_ItemRequistion_Approval_Pendings");
    return (r.recordset || []).some((x) => toInt(pick(x, "ItemRequisitionCode")) === code);
  } catch (_) {
    return true;
  }
};

// GET /purchase-requisition-approval/options  -> the Requisition-No dropdown
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);
    const today = await serverDate(pool);
    if (companyCode <= 0) return sendSuccess(res, { groupLogin: true, requisitions: [], serverDate: today });

    let requisitions = [];
    try {
      // Same SP as the list, but unfiltered (wide date range) so the dropdown
      // offers EVERY pending requisition. The SP requires @FromDate/@ToDate —
      // calling it bare returns nothing, which is why the dropdown was empty.
      const r = await pool
        .request()
        .input("FromDate", sql.DateTime, new Date("1900-01-01"))
        .input("ToDate", sql.DateTime, new Date("2999-12-31"))
        .execute("sp_ItemRequistion_Approval_Pendings");
      const seen = new Set();
      for (const x of r.recordset || []) {
        const code = toInt(pick(x, "ItemRequisitionCode"));
        if (code > 0 && !seen.has(code)) {
          seen.add(code);
          requisitions.push({ value: code, label: str(pick(x, "strItemRequisitionNo", "ItemRequisitionNo")) });
        }
      }
    } catch (_) {
      requisitions = [];
    }
    return sendSuccess(res, { groupLogin: false, requisitions, serverDate: today });
  } catch (err) {
    console.error("DB Error (PRApproval.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /purchase-requisition-approval/pending?fromDate=&toDate=&itemRequisitionCode=
export const getPending = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    if (getCompanyCode(req) <= 0) return sendSuccess(res, []);
    const pool = await getPool(req.headers.subdbname);
    const code = toInt(req.query.itemRequisitionCode);
    const r = pool
      .request()
      .input("FromDate", sql.DateTime, D(req.query.fromDate))
      .input("ToDate", sql.DateTime, D(req.query.toDate));
    if (code > 0) r.input("ItemRequisitionCode", sql.Int, code);
    const result = await r.execute("sp_ItemRequistion_Approval_Pendings");
    // NOTE: this SP is header-grain (one row per requisition). A requisition
    // spans many departments/employees (those are LINE-level, surfaced in the
    // document), so it carries no single Department/Employee — the list shows the
    // header-level audit pair Entry User / Entry Date / Branch instead. Column
    // names are mapped tolerantly to match this app's pendings-SP convention.
    const rows = (result.recordset || []).map((x, i) => ({
      id: toInt(pick(x, "ItemRequisitionCode")) || i,
      ItemRequisitionCode: toInt(pick(x, "ItemRequisitionCode")),
      ItemRequisitionNo: pick(x, "ItemRequisitionNo"),
      strItemRequisitionNo: str(pick(x, "strItemRequisitionNo")),
      ItemRequisitionDate: pick(x, "ItemRequisitionDate"),
      EntryUser: str(pick(x, "EntryUser", "Entry_User", "UName", "UserName", "CreatedUser")),
      EntryDate: pick(x, "EntryDate", "Entry_Date", "C_Date", "CreatedDate") || null,
      BranchName: str(pick(x, "BranchName", "Branch")),
      // Line-grain; usually absent here — kept tolerant in case a variant exists.
      DepartmentName: str(pick(x, "DepartmentName", "Department", "DeptName")),
      EmployeeName: str(pick(x, "EmployeeName", "Employee", "EmpName")),
    }));
    return sendSuccess(res, rows);
  } catch (err) {
    console.error("DB Error (PRApproval.getPending):", err);
    return sendError(res, err);
  }
};

// GET /purchase-requisition-approval/document/:code
export const getDocument = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const code = toInt(req.params.code);
    if (code <= 0) return sendError(res, "Invalid ItemRequisitionCode", 400);
    const pool = await getPool(req.headers.subdbname);

    const [company, det] = await Promise.all([
      loadCompany(pool, companyCode),
      pool
        .request()
        .input("RequisitionType", sql.NVarChar, "R")
        .input("CompanyCode", sql.Int, companyCode)
        .input("ItemRequisitionCode", sql.Int, code)
        .execute("sp_ItemRequisitionDetails_GetAll"),
    ]);
    const recs = det.recordset || [];
    if (!recs.length) return sendError(res, "Requisition not found", 404);
    const h = recs[0];

    const items = recs.map((r, i) => ({
      sno: i + 1,
      itemID: str(pick(r, "ItemID")),
      itemName: str(pick(r, "ItemName")),
      partNo: str(pick(r, "Partnumber", "PartNumber", "PartNo")),
      machineName: str(pick(r, "MachineName")),
      departmentName: str(pick(r, "DepartmentName")),
      costHeadName: str(pick(r, "CostHeadName")),
      rackNo: str(pick(r, "RackNo")),
      uom: str(pick(r, "ItemUomName")),
      qty: toNum(pick(r, "Qty")),
      employeeName: str(pick(r, "EmployeeName")),
      remarks: str(pick(r, "Remarks1", "Remarks")),
      committedDate: pick(r, "CommittedDate") || null,
    }));
    const totalQty = items.reduce((s, x) => s + x.qty, 0);

    return sendSuccess(res, {
      company,
      header: {
        heading: "ITEM REQUISITION",
        reqNo: str(pick(h, "strItemRequisitionNo")) || String(toInt(pick(h, "ItemRequisitionNo"))),
        reqDate: pick(h, "ItemRequisitionDate") || null,
        costHeadName: str(pick(h, "CostHeadName")),
        createdDate: pick(h, "C_Date") || null,
        entryUser: str(pick(h, "UName")),
        system: str(pick(h, "NodeName")),
        branch: str(pick(h, "BranchName")),
        department: str(pick(h, "DepartmentName")),
        employee: str(pick(h, "EmployeeName")),
        remarks: str(pick(h, "Remarks")),
      },
      items,
      totalQty,
    });
  } catch (err) {
    console.error("DB Error (PRApproval.getDocument):", err);
    return sendError(res, err);
  }
};

// POST /purchase-requisition-approval/approve   { itemRequisitionCode }
export const approve = async (req, res) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    if (companyCode <= 0)
      return sendError(res, "You Are Login in Group of Company, please change in any one Company", 400);
    const code = toInt(req.body?.itemRequisitionCode);
    if (code <= 0) return sendError(res, "Select the Requistion...", 400);

    const pool = await getPool(req.headers.subdbname);
    if (!(await stillPending(pool, code)))
      return sendError(res, "This requisition was already approved or rejected — please reload.", 409);

    tx = new sql.Transaction(pool);
    await tx.begin();
    await new sql.Request(tx)
      .input("ItemRequisitionCode", sql.Int, code)
      .input("UserCode", sql.Int, getUserCode(req))
      .input("NodeCode", sql.Int, getNodeCode(req))
      .execute("sp_ItemRequistion_Approval_Update");
    await tx.commit();
    return sendSuccess(res, { itemRequisitionCode: code }, "The record is Approved...");
  } catch (err) {
    if (tx) {
      try {
        await tx.rollback();
      } catch (_) {
        /* ignore */
      }
    }
    if (String(err?.message || "").includes("UK_tbl")) return sendError(res, "Please Check the Entry", 400);
    console.error("DB Error (PRApproval.approve):", err);
    return sendError(res, err);
  }
};

// POST /purchase-requisition-approval/reject   { itemRequisitionCode, rejectReason }
export const reject = async (req, res) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    if (companyCode <= 0)
      return sendError(res, "You Are Login in Group of Company, please change in any one Company", 400);
    const code = toInt(req.body?.itemRequisitionCode);
    const reason = str(req.body?.rejectReason);
    if (code <= 0) return sendError(res, "Select the Requistion...", 400);
    if (!reason) return sendError(res, "Enter the Reason...", 400);

    const pool = await getPool(req.headers.subdbname);
    if (!(await stillPending(pool, code)))
      return sendError(res, "This requisition was already approved or rejected — please reload.", 409);

    tx = new sql.Transaction(pool);
    await tx.begin();
    await new sql.Request(tx)
      .input("ItemRequisitionCode", sql.Int, code)
      .input("RejectReason", sql.NVarChar, reason)
      .input("UserCode", sql.Int, getUserCode(req))
      .input("NodeCode", sql.Int, getNodeCode(req))
      .execute("sp_ItemRequistion_Reject_Update");
    await tx.commit();
    return sendSuccess(res, { itemRequisitionCode: code }, "The record is Rejected...");
  } catch (err) {
    if (tx) {
      try {
        await tx.rollback();
      } catch (_) {
        /* ignore */
      }
    }
    if (String(err?.message || "").includes("UK_tbl")) return sendError(res, "Please Check the Entry", 400);
    console.error("DB Error (PRApproval.reject):", err);
    return sendError(res, err);
  }
};
