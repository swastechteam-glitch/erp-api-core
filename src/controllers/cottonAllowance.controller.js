import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Cotton Allowance / RawMaterial Allowance (port of the WinForms frmCottonAllowance)
//   Record a quality allowance (credit note) against an arrived cotton lot. Pick
//   a Mill Lot (autofills supplier/agent/variety/station + Qty + Candy Rate and
//   the QC allowance rate), enter Allowance Kgs + Allowance Rate/Candy + the
//   Credit Note (No / Date / Amount) + remarks, then save. Parent-only (no child
//   grid). Mirrors frmCottonAllowance btnSave_Click:
//     EXEC sp_CottonAllowance_AddEdit  (no code = insert, code = update)
//
//   - GET    /cotton-allowance/options              -> suppliers/agents/stations/varieties/millLots
//   - GET    /cotton-allowance/next-no              -> { no }
//   - GET    /cotton-allowance/lot/:arrivalCode     -> lot autofill + QC allowance rate
//   - GET    /cotton-allowance/lists                -> sp_CottonAllowance_GetAll (paginated)
//   - POST   /cotton-allowance/create               -> AddEdit (insert)
//   - PUT    /cotton-allowance/update/:code         -> AddEdit (update)
//   - DELETE /cotton-allowance/delete/:code         -> sp_CottonAllowance_Delete
//
// Company from req.headers.companyCode, FY from req.headers.FYCode; AddEdit also
// needs @User / @Node from req.headers.userId / nodeCode. The desktop Print and
// the int_UserLevel gating of the Allowance Rate field are not ported.
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

// GET /cotton-allowance/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);

    const [suppliers, agents, stations, varieties, lots] = await Promise.all([
      pool
        .request()
        .query("Select SupplierName, SupplierCode from tbl_Supplier Where Status = 1 Order by SupplierName"),
      pool
        .request()
        .query("Select AgentName, AgentCode from tbl_Agent Where Status = 1 Order by AgentName"),
      pool
        .request()
        .query("Select StationName, StationCode from tbl_Station Where Status = 1 Order by StationName"),
      pool
        .request()
        .query("Select RawMaterialName, RawMaterialCode from tbl_RawMaterial Where Status = 1 Order by RawMaterialName"),
      pool
        .request()
        .input("CompanyCode", sql.Int, getCompanyCode(req))
        .execute("sp_CottonAllowance_LotStock"),
    ]);

    return sendSuccess(res, {
      suppliers: (suppliers.recordset || []).map((r) => ({ value: r.SupplierCode, label: r.SupplierName })),
      agents: (agents.recordset || []).map((r) => ({ value: r.AgentCode, label: r.AgentName })),
      stations: (stations.recordset || []).map((r) => ({ value: r.StationCode, label: r.StationName })),
      varieties: (varieties.recordset || []).map((r) => ({ value: r.RawMaterialCode, label: r.RawMaterialName })),
      millLots: (lots.recordset || []).map((x) => ({
        value: x.ArrivalCode,
        label: (x.MillLotNo || "").toString().trim(),
        ...x,
      })),
    });
  } catch (err) {
    console.error("DB Error (CottonAllowance.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /cotton-allowance/next-no -> { no } for a new allowance.
export const getNextNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const no = await scalar(
      pool
        .request()
        .input("CompanyCode", sql.Int, getCompanyCode(req))
        .input("FYCode", sql.Int, getFYCode(req)),
      "sp_CottonAllowance_No",
    );
    return sendSuccess(res, { no });
  } catch (err) {
    console.error("DB Error (CottonAllowance.getNextNo):", err);
    return sendError(res, err);
  }
};

// GET /cotton-allowance/lot/:arrivalCode -> lot autofill + QC allowance rate.
export const getLot = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const arrivalCode = parseInt(req.params.arrivalCode);
    if (!arrivalCode) return sendError(res, "Invalid ArrivalCode", 400);
    const companyCode = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    const [lotRes, qcRes] = await Promise.all([
      pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("ArrivalCode", sql.Int, arrivalCode)
        .query(
          `Select MillLotNo, ArrivalCode, SupplierCode, AgentCode, StationCode, RawMaterialCode, Qty, CandyRate
             from vw_CottonArrival Where CompanyCode = @CompanyCode AND ArrivalCode = @ArrivalCode`,
        ),
      pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("ArrivalCode", sql.Int, arrivalCode)
        .query(
          `Select Top 1 RatePerCandy from vw_CottonQualityTest_Approval
             Where CompanyCode = @CompanyCode AND ArrivalCode = @ArrivalCode`,
        ),
    ]);

    const x = lotRes.recordset?.[0] || {};
    const allowanceCandyRate = toNum(qcRes.recordset?.[0]?.RatePerCandy);
    return sendSuccess(res, {
      ArrivalCode: arrivalCode,
      MillLotNo: (x.MillLotNo || "").toString().trim(),
      SupplierCode: toInt(x.SupplierCode),
      AgentCode: toInt(x.AgentCode),
      StationCode: toInt(x.StationCode),
      RawMaterialCode: toInt(x.RawMaterialCode),
      Qty: toNum(x.Qty),
      CandyRate: toNum(x.CandyRate),
      AllowanceCandyRate: allowanceCandyRate,
    });
  } catch (err) {
    console.error("DB Error (CottonAllowance.getLot):", err);
    return sendError(res, err);
  }
};

// GET /cotton-allowance/lists -> all allowances (paginated).
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_CottonAllowance_GetAll");
    const data = (result.recordset || [])
      .map((r) => ({ ...r, id: r.CottonAllowanceCode }))
      .sort((a, b) => Number(b.CottonAllowanceCode) - Number(a.CottonAllowanceCode));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (CottonAllowance.getList):", err);
    return sendError(res, err);
  }
};

const saveOrUpdate = async (req, res, isEdit) => {
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

    const arrivalCode = toInt(b.ArrivalCode);
    if (arrivalCode <= 0) return sendError(res, "Select the Mill Lot No", 400);

    const pool = await getPool(req.headers.subdbname);

    // Allowance number: keep the existing one on edit, else allocate a new one.
    let allowanceNo = toInt(b.CottonAllowanceNo);
    if (!isEdit) {
      allowanceNo = await scalar(
        pool
          .request()
          .input("CompanyCode", sql.Int, companyCode)
          .input("FYCode", sql.Int, fyCode),
        "sp_CottonAllowance_No",
      );
    }

    const r = pool.request();
    if (isEdit && code) r.input("CottonAllowanceCode", sql.Int, code);
    r.input("CottonAllowanceNo", sql.Int, allowanceNo);
    r.input("CottonAllowanceDate", sql.DateTime, D(b.CottonAllowanceDate) || new Date());
    r.input("ArrivalCode", sql.Int, arrivalCode);
    r.input("AllowanceKgs", sql.Decimal(18, 3), toNum(b.AllowanceKgs));
    r.input("AllowanceCandyRate", sql.Decimal(18, 3), toNum(b.AllowanceCandyRate));
    r.input("CreditNoteNo", sql.NVarChar, (b.CreditNoteNo || "").toString().trim());
    r.input("CreditNoteDate", sql.DateTime, D(b.CreditNoteDate) || new Date());
    r.input("CreditNoteAmount", sql.Decimal(18, 2), toNum(b.CreditNoteAmount));
    r.input("Remarks", sql.NVarChar, (b.Remarks || "").toString().trim());
    r.input("FYCode", sql.Int, fyCode);
    r.input("CompanyCode", sql.Int, companyCode);
    r.input("User", sql.Int, parseInt(userId));
    r.input("Node", sql.Int, parseInt(nodeCode));
    await r.execute("sp_CottonAllowance_AddEdit");

    return sendSuccess(
      res,
      { CottonAllowanceCode: code || null },
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201,
    );
  } catch (err) {
    console.error("DB Error (saveOrUpdateCottonAllowance):", err);
    return sendError(res, err);
  }
};

export const create = (req, res) => saveOrUpdate(req, res, false);
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /cotton-allowance/delete/:code
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = parseInt(req.params.code);
    if (!code) return sendError(res, "Invalid CottonAllowanceCode", 400);
    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("CottonAllowanceCode", sql.Int, code)
      .execute("sp_CottonAllowance_Delete");
    return sendSuccess(res, { CottonAllowanceCode: code }, "The record is deleted");
  } catch (err) {
    if (err.number === 547) {
      return sendError(res, "This record is in use and can not be deleted", 409);
    }
    console.error("DB Error (CottonAllowance.remove):", err);
    return sendError(res, err);
  }
};
