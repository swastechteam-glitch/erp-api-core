import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Cotton Weighment Approval (port of the WinForms frmCottonWeighmentApproval)
//   A simple stock-approval screen for completed cotton weighments:
//   - Pending  : sp_Cotton_Weighment_Approval_Pending (optional @ArrivalCode /
//                @SupplierCode filters — the MillLotNo & Supplier dropdowns).
//   - Options  : the MillLotNo + Supplier filter lists, derived from the pending
//                recordset itself (the WinForms binds both to the same proc).
//   - Detail   : sp_CottonWeighment_GetAll row + vw_CottonWeighmentDetails bales
//                (the right-hand report preview, shown here as a summary + grid).
//   - Approve  : UPDATE tbl_CottonWeighment SET StockApproval = 1 (matches the
//                WinForms btnApprove, which runs the same single UPDATE).
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getFYCode = (req) => toInt(req.headers.FYCode);

// Distinct {value,label} list from a recordset, dropping blanks/zeros.
const distinct = (rows, valueKey, labelKey) => {
  const seen = new Map();
  for (const r of rows || []) {
    const value = r[valueKey];
    const label = r[labelKey];
    if (value === null || value === undefined || toInt(value) === 0) continue;
    if (!seen.has(value)) seen.set(value, { value, label });
  }
  return [...seen.values()].sort((a, b) =>
    String(a.label ?? "").localeCompare(String(b.label ?? ""))
  );
};

// GET /cotton-weighment-approval/options -> MillLotNo + Supplier filter lists.
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_Cotton_Weighment_Approval_Pending");
    const rows = result.recordset || [];
    return sendSuccess(res, {
      millLotNos: distinct(rows, "ArrivalCode", "MillLotNo"),
      suppliers: distinct(rows, "SupplierCode", "SupplierName"),
    });
  } catch (err) {
    console.error("DB Error (CottonWeighmentApproval.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /cotton-weighment-approval/pending?arrivalCode=&supplierCode=
export const getPending = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const request = pool.request().input("CompanyCode", sql.Int, getCompanyCode(req));
    // Both filters are optional in the WinForms (only added when > 0).
    if (toInt(req.query.arrivalCode) > 0)
      request.input("ArrivalCode", sql.Int, toInt(req.query.arrivalCode));
    if (toInt(req.query.supplierCode) > 0)
      request.input("SupplierCode", sql.Int, toInt(req.query.supplierCode));
    const result = await request.execute("sp_Cotton_Weighment_Approval_Pending");
    const data = result.recordset.map((r) => ({ ...r, id: r.WeighmentCode }));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (CottonWeighmentApproval.getPending):", err);
    return sendError(res, err);
  }
};

// GET /cotton-weighment-approval/detail/:code -> header + bale rows (preview).
export const getDetail = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = parseInt(req.params.code);
    if (!code) return sendError(res, "Invalid WeighmentCode", 400);

    const companyCode = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    const listRes = await pool
      .request()
      .input("FYCode", sql.Int, getFYCode(req))
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_CottonWeighment_GetAll");
    const row = listRes.recordset.find((r) => parseInt(r.WeighmentCode) === code);
    if (!row) return sendError(res, "Cotton Weighment not found", 404);

    const det = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("WeighmentCode", sql.Int, code)
      .query(
        "Select * from vw_CottonWeighmentDetails Where CompanyCode = @CompanyCode AND WeighmentCode = @WeighmentCode"
      );

    return sendSuccess(res, { ...row, details: det.recordset || [] });
  } catch (err) {
    console.error("DB Error (CottonWeighmentApproval.getDetail):", err);
    return sendError(res, err);
  }
};

// PUT /cotton-weighment-approval/approve/:code -> StockApproval = 1.
export const approve = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = parseInt(req.params.code);
    if (!code) return sendError(res, "Invalid WeighmentCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("WeighmentCode", sql.Int, code)
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .query(
        "UPDATE tbl_CottonWeighment SET StockApproval = 1 WHERE WeighmentCode = @WeighmentCode AND CompanyCode = @CompanyCode"
      );
    if (!result.rowsAffected?.[0])
      return sendError(res, "Cotton Weighment not found", 404);
    return sendSuccess(res, { WeighmentCode: code }, "The record is Approved");
  } catch (err) {
    console.error("DB Error (CottonWeighmentApproval.approve):", err);
    return sendError(res, err);
  }
};
