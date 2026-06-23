import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Item Purchase Requisition (port of the WinForms frmItemRequisition, type 'R')
//   Stores raise a purchase requisition: a grid of items, each with cost head /
//   department / machine / employee, the live stock + pending figures, and a Qty.
//   - Options  : branches / cost heads / departments / employees / items
//   - Machines : tbl_Machine for a branch (+ DepartmentCode for filtering)
//   - Next no  : sp_ItemRequisition_ItemRequisitionNo (@RequisitionType='R')  -> "REQ"+n
//   - Item pend: per-item Req / PO / Inward pending figures
//   - List     : sp_ItemRequisition_GetAll (@RequisitionType='R')
//   - One      : sp_ItemRequisitionDetails_GetAll (header + rows)
//   - Save     : sp_ItemRequisition_AddEdit (ExecuteScalar -> code) then
//                sp_ItemRequisitionDetails_Delete + _Insert per item (Qty>0).
//   - Delete   : blocked when used by a PO / direct inward, else sp_ItemRequisition_Delete.
//
// Company from req.headers.companyCode, FY from req.headers.FYCode; AddEdit also
// needs @User / @Node from req.headers.userId / nodeCode.
// ---------------------------------------------------------------------------

const REQ_TYPE = "R";
const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};
// Display number zero-padded to 6 digits, matching the SP
// sp_ItemRequisition_ItemRequisitionNo (73 -> "000073" -> "REQ000073").
const padReqNo = (n) => String(toInt(n)).padStart(6, "0");
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getFYCode = (req) => toInt(req.headers.FYCode);
const D = (v) => (v ? new Date(v) : null);

const scalar = async (request, proc) => {
  const r = await request.execute(proc);
  const row = r.recordset?.[0];
  return row ? toInt(Object.values(row)[0]) : 0;
};

// Like scalar, but keeps the raw value (preserves zero-padding e.g. "000073")
const scalarRaw = async (request, proc) => {
  const r = await request.execute(proc);
  const row = r.recordset?.[0];
  return row ? Object.values(row)[0] : null;
};

// GET /item-requisition/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    const [branches, costHeads, departments, employees, items] = await Promise.all([
      // tbl_Branch has no CompanyCode column — don't filter by company.
      pool
        .request()
        .query("SELECT BranchCode, BranchName from tbl_Branch Where Status = 1 Order By BranchName"),
      pool
        .request()
        .query("Select CostHeadName, CostHeadCode from tbl_CostHead Where Status = 1 and CostHeadCode > 0 Order by CostHeadName"),
      pool
        .request()
        .query("Select DepartmentName_English as DepartmentName, DepartmentCode from tbl_Department Where Status = 1 Order by DepartmentName_English"),
      pool.request().input("CompanyCode", sql.Int, companyCode).execute("sp_Store_Employee_Load"),
      pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("Stock", sql.Int, 0)
        .input("Status", sql.Int, 1)
        .execute("sp_Item_GetbyItemName"),
    ]);

    return sendSuccess(res, {
      branches: branches.recordset.map((r) => ({ value: r.BranchCode, label: r.BranchName })),
      costHeads: costHeads.recordset.map((r) => ({ value: r.CostHeadCode, label: r.CostHeadName })),
      departments: departments.recordset.map((r) => ({ value: r.DepartmentCode, label: r.DepartmentName })),
      employees: employees.recordset.map((r) => ({ value: r.EmployeeCode, label: r.str_EmployeeID ?? r.EmployeeName })),
      items: items.recordset.map((r) => ({
        value: r.ItemCode,
        label: r.ItemName,
        ItemUomCode: toInt(r.ItemUomCode),
        ItemUomName: r.ItemUomName ?? r.ItemUOMName ?? "",
        ItemID: r.ItemID ?? "",
        PartNo: r.Partnumber ?? r.PartNo ?? "",
        Stock: toNum(r.Stock),
        StockValue: toNum(r.StockValue),
      })),
    });
  } catch (err) {
    console.error("DB Error (ItemRequisition.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /item-requisition/machines?branchCode=
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
    console.error("DB Error (ItemRequisition.getMachines):", err);
    return sendError(res, err);
  }
};

// GET /item-requisition/next-no
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
    return sendSuccess(res, { no, strNo: `REQ${no}` });
  } catch (err) {
    console.error("DB Error (ItemRequisition.getNextNo):", err);
    return sendError(res, err);
  }
};

// GET /item-requisition/item/:itemCode/pending -> { reqPending, poPending, inwPending }
export const getItemPending = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const itemCode = parseInt(req.params.itemCode);
    if (!itemCode) return sendError(res, "Invalid ItemCode", 400);
    const pool = await getPool(req.headers.subdbname);

    const sumOf = (recordset, key) =>
      Math.max(0, (recordset || []).reduce((s, r) => s + toNum(r[key]), 0));

    const [reqP, poP, inwP] = await Promise.all([
      pool.request().input("ItemCode", sql.Int, itemCode).execute("sp_PurchaseAdvice_PendingItemRequisition"),
      pool
        .request()
        .input("ItemCode", sql.Int, itemCode)
        .query(
          "SELECT ISNULL(SUM(Qty),0) AS PendingQty FROM vw_PurchaseOrderDetails WHERE " +
            "(ISNULL(Approve,0) = 0 OR ISNULL(Approve1,0) = 0 OR ISNULL(Approve2,0) = 0 OR ISNULL(Approve3,0) = 0) " +
            "AND ISNULL(RejectReason,'') = '' AND ISNULL(PO_Close,0) = 0 AND ItemCode = @ItemCode"
        ),
      pool.request().input("Pending", sql.Int, 1).input("ItemCode", sql.Int, itemCode).execute("sp_RptPurchaseOrderDetailsPending"),
    ]);

    return sendSuccess(res, {
      reqPending: sumOf(reqP.recordset, "PendQty"),
      poPending: sumOf(poP.recordset, "PendingQty"),
      inwPending: sumOf(inwP.recordset, "PendingQty"),
    });
  } catch (err) {
    console.error("DB Error (ItemRequisition.getItemPending):", err);
    return sendError(res, err);
  }
};

// GET /item-requisition/lists
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("RequisitionType", sql.NVarChar, REQ_TYPE)
      .execute("sp_ItemRequisition_GetAll");
    const data = (result.recordset || [])
      .map((r) => ({ ...r, id: r.ItemRequisitionCode }))
      .sort((a, b) => Number(b.ItemRequisitionCode) - Number(a.ItemRequisitionCode));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (ItemRequisition.getList):", err);
    return sendError(res, err);
  }
};

// GET /item-requisition/list/:code -> header + detail rows
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
    if (!recs.length) return sendError(res, "Item Requisition not found", 404);

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
        Rate: toNum(r.StockRate ?? r.Rate),
        CommittedDate: r.CommittedDate,
        Remarks: (r.Remarks1 ?? r.Remarks ?? "").toString().trim(),
        AllMachines: false,
      })),
    });
  } catch (err) {
    console.error("DB Error (ItemRequisition.getById):", err);
    return sendError(res, err);
  }
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
    const code = isEdit ? parseInt(req.params.code) : 0;
    const b = req.body || {};

    if (toInt(b.BranchCode) <= 0) return sendError(res, "Select the Branch Name", 400);
    const details = (Array.isArray(b.details) ? b.details : []).filter((d) => toNum(d.Qty) > 0);
    if (!details.length) return sendError(res, "Select the Item", 400);

    const totalQty = details.reduce((s, d) => s + toNum(d.Qty), 0);
    const reqDate = D(b.ItemRequisitionDate) || new Date();

    const pool = await getPool(req.headers.subdbname);

    // Compute the requisition number server-side on add.
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
    const strReqNo = isEdit
      ? b.strItemRequisitionNo || `REQ${padReqNo(reqNo)}`
      : `REQ${padReqNo(reqNo)}`;

    tx = new sql.Transaction(pool);
    await tx.begin();

    const head = new sql.Request(tx);
    if (isEdit && code) head.input("ItemRequisitionCode", sql.Int, code);
    head.input("ItemRequisitionDate", sql.DateTime, reqDate);
    head.input("ItemRequisitionNo", sql.Int, reqNo);
    head.input("RequisitionType", sql.NVarChar, REQ_TYPE);
    head.input("strItemRequisitionNo", sql.NVarChar, strReqNo);
    head.input("TotalQty", sql.Decimal(18, 3), totalQty);
    head.input("BranchCode", sql.Int, toInt(b.BranchCode));
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
      await new sql.Request(tx)
        .input("ItemRequisitionCode", sql.Int, itemRequisitionCode)
        .input("SNo", sql.Int, sno)
        .input("CostHeadCode", sql.Int, toInt(d.CostHeadCode))
        .input("DepartmentCode", sql.Int, toInt(d.DepartmentCode))
        .input("MachineCode", sql.Int, toInt(d.MachineCode))
        .input("DocumentFrom", sql.NVarChar, (d.DocumentFrom || "").toString().trim())
        .input("Qty_Status", sql.NVarChar, (d.Qty_Status || "").toString().trim())
        .input("Remarks", sql.NVarChar, (d.Remarks || "").toString().trim())
        .input("EmployeeCode", sql.Int, toInt(d.EmployeeCode))
        .input("ItemCode", sql.Int, toInt(d.ItemCode))
        .input("ItemUomCode", sql.Int, toInt(d.ItemUomCode))
        .input("Qty", sql.Decimal(18, 3), toNum(d.Qty))
        .input("CommittedDate", sql.DateTime, D(d.CommittedDate) || reqDate)
        .input("CompanyCode", sql.Int, companyCode)
        .input("StockRate", sql.Decimal(18, 3), toNum(d.Rate))
        .input("IssueApproval1", sql.Int, 1)
        .input("IssueApproval1_Auto", sql.Int, 1)
        .input("IssueApproval2", sql.Int, 1)
        .input("IssueApproval2_Auto", sql.Int, 1)
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
    console.error("DB Error (saveOrUpdateItemRequisition):", err);
    return sendError(res, err);
  }
};

export const create = (req, res) => saveOrUpdate(req, res, false);
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /item-requisition/delete/:code
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = parseInt(req.params.code);
    if (!code) return sendError(res, "Invalid ItemRequisitionCode", 400);
    const pool = await getPool(req.headers.subdbname);

    // Blocked when the requisition is already on a PO or a direct inward.
    const usedPO = await pool
      .request()
      .input("ItemRequisitionCode", sql.Int, code)
      .query("Select 1 from tbl_PurchaseOrderDetails Where ItemRequisitionCode = @ItemRequisitionCode");
    const usedInw = await pool
      .request()
      .input("ItemRequisitionCode", sql.Int, code)
      .query("Select 1 from vw_ItemRequisitionDetails Where WithoutPO_Inward = 1 AND ItemRequisitionCode = @ItemRequisitionCode");
    if (usedPO.recordset.length || usedInw.recordset.length)
      return sendError(res, "You can not delete the Item Requisition", 409);

    await pool
      .request()
      .input("ItemRequisitionCode", sql.Int, code)
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_ItemRequisition_Delete");
    return sendSuccess(res, { ItemRequisitionCode: code }, "The record is deleted");
  } catch (err) {
    if (err.message && err.message.includes("FK_"))
      return sendError(res, "You can not delete the Item Requisition", 409);
    console.error("DB Error (ItemRequisition.remove):", err);
    return sendError(res, err);
  }
};
