import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";
import {
  getAgents,
  getStations,
  getRawMaterials,
  getSuppliers,
} from "../utils/masters.js";

// ---------------------------------------------------------------------------
// Cotton Lot Issue Approval (port of the WinForms frmCottonLotApproval)
//   Approve (or reject) a weighed cotton lot for issue. Pick a pending lot, the
//   Lot Details panel autofills (supplier/agent/station/variety/qty/net kgs),
//   then Approve or Reject.
//   - Pending  : sp_CottonLotApproval_GetPendings (@CompanyCode)
//   - Options  : agent/station/variety/supplier maps for the read-only panel
//   - Next no  : sp_CottonLotApproval_No (@CompanyCode, @FYCode)
//   - Net wt   : vw_CottonWeighment.TotalNetWeight for the lot
//   - Approve  : sp_CottonLotApproval_AddEdit (No computed server-side on add)
//   - Reject   : sp_CottonReject_AddEdit (ExecuteScalar -> RejectCode) then
//                sp_CottonRejectDetails_Delete + bale loop (sp_CottonReject_GetBales
//                -> sp_CottonRejectDetails_AddEdit per bale).
//   - List     : sp_CottonLotApprovalDelete_GetAll (the Edit/Delete grid)
//   - Update   : sp_CottonLotApproval_AddEdit (@CottonLotApprovalCode)
//   - Delete   : sp_CottonLotApproval_Delete (@CottonLotApprovalCode)
//
// Company from req.headers.companyCode, FY from req.headers.FYCode; AddEdit also
// needs @User / @Node from req.headers.userId / nodeCode.
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getFYCode = (req) => toInt(req.headers.FYCode);
const D = (v) => (v ? new Date(v) : null);

const scalar = async (request, proc) => {
  const r = await request.execute(proc);
  const row = r.recordset?.[0];
  return row ? toInt(Object.values(row)[0]) : 0;
};

// GET /cotton-lot-approval/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const [agents, stations, varieties, suppliers] = await Promise.all([
      getAgents(pool),
      getStations(pool),
      getRawMaterials(pool),
      getSuppliers(pool, { usage: "all" }),
    ]);
    return sendSuccess(res, { agents, stations, varieties, suppliers });
  } catch (err) {
    console.error("DB Error (CottonLotApproval.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /cotton-lot-approval/next-no
export const getNextNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const no = await scalar(
      pool.request().input("CompanyCode", sql.Int, getCompanyCode(req)).input("FYCode", sql.Int, getFYCode(req)),
      "sp_CottonLotApproval_No"
    );
    return sendSuccess(res, { nextNo: no });
  } catch (err) {
    console.error("DB Error (CottonLotApproval.getNextNo):", err);
    return sendError(res, err);
  }
};

// GET /cotton-lot-approval/pending
export const getPending = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_CottonLotApproval_GetPendings");
    const data = (result.recordset || []).map((r) => ({ ...r, id: r.ArrivalCode, value: r.ArrivalCode, label: r.MillLotNo }));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (CottonLotApproval.getPending):", err);
    return sendError(res, err);
  }
};

// GET /cotton-lot-approval/net-weight/:arrivalCode
export const getNetWeight = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const arrivalCode = parseInt(req.params.arrivalCode);
    if (!arrivalCode) return sendError(res, "Invalid ArrivalCode", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("ArrivalCode", sql.Int, arrivalCode)
      .query("Select TotalNetWeight from vw_CottonWeighment Where ArrivalCode = @ArrivalCode");
    return sendSuccess(res, { netWeight: toNum(r.recordset?.[0]?.TotalNetWeight) });
  } catch (err) {
    console.error("DB Error (CottonLotApproval.getNetWeight):", err);
    return sendError(res, err);
  }
};

// POST /cotton-lot-approval/approve   PUT /cotton-lot-approval/update/:code
const approveOrUpdate = async (req, res, isEdit) => {
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
    if (toInt(b.ArrivalCode) <= 0) return sendError(res, "Select the Mill Lot No", 400);

    const pool = await getPool(req.headers.subdbname);

    // The approval number is computed server-side on add (matches Bind_ApprovalNo).
    const approvalNo = isEdit
      ? toInt(b.CottonLotApprovalNo)
      : await scalar(
          pool.request().input("CompanyCode", sql.Int, companyCode).input("FYCode", sql.Int, fyCode),
          "sp_CottonLotApproval_No"
        );

    const r = pool.request();
    if (isEdit && code) r.input("CottonLotApprovalCode", sql.Int, code);
    r.input("CottonLotApprovalNo", sql.Int, approvalNo);
    r.input("CottonLotApprovalDate", sql.DateTime, D(b.CottonLotApprovalDate) || new Date());
    r.input("ArrivalCode", sql.Int, toInt(b.ArrivalCode));
    r.input("Remarks", sql.NVarChar, (b.Remarks || "").toString().trim());
    r.input("FYCode", sql.Int, fyCode);
    r.input("CompanyCode", sql.Int, companyCode);
    r.input("User", sql.Int, parseInt(userId));
    r.input("Node", sql.Int, parseInt(nodeCode));
    await r.execute("sp_CottonLotApproval_AddEdit");

    return sendSuccess(
      res,
      { CottonLotApprovalNo: approvalNo, ArrivalCode: toInt(b.ArrivalCode) },
      isEdit ? "The record is updated" : "The record is Approved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    console.error("DB Error (CottonLotApproval.approve):", err);
    return sendError(res, err);
  }
};

export const approve = (req, res) => approveOrUpdate(req, res, false);
export const update = (req, res) => approveOrUpdate(req, res, true);

// POST /cotton-lot-approval/reject -> create a Cotton Reject for the lot's bales.
export const reject = async (req, res) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const companyCode = getCompanyCode(req);
    const fyCode = getFYCode(req);
    const b = req.body || {};
    const arrivalCode = toInt(b.ArrivalCode);
    if (arrivalCode <= 0) return sendError(res, "Select the Mill Lot No", 400);

    const pool = await getPool(req.headers.subdbname);

    const rejectNo = await scalar(
      pool.request().input("CompanyCode", sql.Int, companyCode).input("FYCode", sql.Int, fyCode),
      "sp_CottonReject_No"
    );

    tx = new sql.Transaction(pool);
    await tx.begin();

    const head = new sql.Request(tx);
    head.input("CottonRejectNo", sql.Int, rejectNo);
    head.input("CottonRejectDate", sql.DateTime, D(b.CottonLotApprovalDate) || new Date());
    head.input("ArrivalCode", sql.Int, arrivalCode);
    head.input("NoofBales", sql.Decimal(18, 3), toNum(b.Qty));
    head.input("Remarks", sql.NVarChar, (b.Remarks || "").toString().trim());
    head.input("RejectSales", sql.Int, 1);
    head.input("FYCode", sql.Int, fyCode);
    head.input("CompanyCode", sql.Int, companyCode);
    head.input("User", sql.Int, parseInt(userId));
    head.input("Node", sql.Int, parseInt(nodeCode));
    const rejectCode = await scalar(head, "sp_CottonReject_AddEdit");

    await new sql.Request(tx)
      .input("CottonRejectCode", sql.Int, rejectCode)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_CottonRejectDetails_Delete");

    const bales = await new sql.Request(tx)
      .input("CompanyCode", sql.Int, companyCode)
      .input("ArrivalCode", sql.Int, arrivalCode)
      .execute("sp_CottonReject_GetBales");

    let sno = 0;
    for (const bale of bales.recordset || []) {
      sno += 1;
      await new sql.Request(tx)
        .input("CottonRejectCode", sql.Int, rejectCode)
        .input("SNo", sql.Int, sno)
        .input("WeighmentDetailsCode", sql.Int, toInt(bale.WeighmentDetailsCode))
        .input("BaleNo", sql.Int, toInt(bale.BaleNo))
        .input("GrossWeight", sql.Decimal(18, 3), toNum(bale.GrossWeight))
        .input("Allowance", sql.Decimal(18, 3), toNum(bale.Allowance))
        .input("SampleWeight", sql.Decimal(18, 3), toNum(bale.SampleWeight))
        .input("TareWeight", sql.Decimal(18, 3), toNum(bale.TareWeight))
        .input("NetWeight", sql.Decimal(18, 3), toNum(bale.NetWeight))
        .input("CompanyCode", sql.Int, companyCode)
        .execute("sp_CottonRejectDetails_AddEdit");
    }

    await tx.commit();
    return sendSuccess(res, { CottonRejectNo: rejectNo, ArrivalCode: arrivalCode }, "The record is Rejected", 201);
  } catch (err) {
    if (tx) {
      try {
        await tx.rollback();
      } catch (_) {}
    }
    console.error("DB Error (CottonLotApproval.reject):", err);
    return sendError(res, err);
  }
};

// GET /cotton-lot-approval/lists -> the approved records (Edit / Delete grid)
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_CottonLotApprovalDelete_GetAll");
    const data = (result.recordset || [])
      .map((r) => ({ ...r, id: r.CottonLotApprovalCode }))
      .sort((a, b) => Number(b.CottonLotApprovalCode) - Number(a.CottonLotApprovalCode));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (CottonLotApproval.getList):", err);
    return sendError(res, err);
  }
};

// GET /cotton-lot-approval/list/:code -> a single approved record (for edit)
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = parseInt(req.params.code);
    if (!code) return sendError(res, "Invalid CottonLotApprovalCode", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_CottonLotApprovalDelete_GetAll");
    const row = (result.recordset || []).find(
      (r) => parseInt(r.CottonLotApprovalCode) === code
    );
    if (!row) return sendError(res, "Cotton Lot Approval not found", 404);
    return sendSuccess(res, row);
  } catch (err) {
    console.error("DB Error (CottonLotApproval.getById):", err);
    return sendError(res, err);
  }
};

// DELETE /cotton-lot-approval/delete/:code
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = parseInt(req.params.code);
    if (!code) return sendError(res, "Invalid CottonLotApprovalCode", 400);
    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("CottonLotApprovalCode", sql.Int, code)
      .execute("sp_CottonLotApproval_Delete");
    return sendSuccess(res, { CottonLotApprovalCode: code }, "The record is deleted");
  } catch (err) {
    console.error("DB Error (CottonLotApproval.remove):", err);
    return sendError(res, err);
  }
};
