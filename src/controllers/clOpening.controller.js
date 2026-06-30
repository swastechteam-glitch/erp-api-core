import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// CL Opening Entry (port of the WinForms frmCLOpeningEntry / ...Details)
//
//   Per-employee opening CL balance for a Year. Keyed by CLYear + EmployeeCode
//   (CLCode is a hidden surrogate). List is company-scoped; the AddEdit SP itself
//   only takes @User/@Node (faithful to the desktop — no @CompanyCode there).
//
//   Stored procs (kept identical to the desktop):
//     sp_EmployeeCLOpening_AddEdit -> upsert (@User/@Node; edit adds @CLCode)
//     sp_EmployeeCLOpening_GetAll  -> list (@CompanyCode)
//     sp_EmployeeCLOpening_Delete  -> delete (@CLYear + @EmployeeCode)
//   Lookup: vw_Employee_New (company-scoped) for the Employee dropdown.
//
//   Endpoints
//     GET    /options                          employees (Employee ID dropdown)
//     GET    /lists                            sp_EmployeeCLOpening_GetAll
//     POST   /create                           sp_EmployeeCLOpening_AddEdit (no code)
//     PUT    /update/:clCode                   sp_EmployeeCLOpening_AddEdit (with code)
//     DELETE /delete/:clYear/:employeeCode     sp_EmployeeCLOpening_Delete
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const pick = (row, ...keys) => {
  if (!row) return undefined;
  for (const k of keys) {
    if (k == null) continue;
    if (row[k] !== undefined) return row[k];
    const lk = String(k).toLowerCase();
    const hit = Object.keys(row).find((o) => o.toLowerCase() === lk);
    if (hit) return row[hit];
  }
  return undefined;
};

// GET /clopening/options  -> employees (cmbEmployeeID source)
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, cc)
      .query(
        "Select str_EmployeeID, EmployeeCode from vw_Employee_New WHERE CompanyCode = @CompanyCode Order By EmployeeID"
      );
    return sendSuccess(res, {
      employees: (r.recordset || []).map((x) => ({
        value: toInt(pick(x, "EmployeeCode")),
        label: pick(x, "str_EmployeeID") ?? "",
      })),
    });
  } catch (err) {
    console.error("DB Error (CLOpening.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /clopening/lists  -> sp_EmployeeCLOpening_GetAll @CompanyCode
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, cc)
      .execute("sp_EmployeeCLOpening_GetAll");
    const data = (r.recordset || []).map((row) => {
      const code = toInt(pick(row, "CLCode"));
      return {
        ...row,
        id: code,
        CLCode: code,
        CLYear: (pick(row, "CLYear") ?? "").toString(),
        EmployeeCode: toInt(pick(row, "EmployeeCode")),
        EmployeeID: pick(row, "str_EmployeeID", "EmployeeID") ?? "",
        EmployeeName: pick(row, "EmployeeName") ?? "",
        CLOpeningDays: toInt(pick(row, "CLOpeningDays")),
      };
    });
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (CLOpening.getList):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_EmployeeCLOpening_AddEdit (btnSave_Click)
const saveOrUpdate = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const clYear = (body.CLYear || "").toString().trim();
    const employeeCode = toInt(body.EmployeeCode);
    const openingDays = toInt(body.CLOpeningDays);

    // Same validation order / messages the form enforces.
    if (!clYear || clYear === "--SELECT--") return sendError(res, "Select the year....", 400);
    if (employeeCode <= 0) return sendError(res, "Select the Employee ID....", 400);
    if (openingDays <= 0) return sendError(res, "Enter the Opening Days....", 400);

    const code = isEdit ? toInt(req.params.clCode ?? body.CLCode) : null;
    if (isEdit && !code) return sendError(res, "Invalid CLCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    if (isEdit) request.input("CLCode", sql.Int, code);
    request.input("CLYear", sql.VarChar(10), clYear);
    request.input("EmployeeCode", sql.Int, employeeCode);
    request.input("CLOpeningDays", sql.Int, openingDays);
    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));

    await request.execute("sp_EmployeeCLOpening_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The Record is Updated...." : "The Record is Saved....",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (err.message && err.message.includes("UK_")) {
      return sendError(res, "CL Opening already exists for this Year and Employee", 409);
    }
    console.error("DB Error (saveOrUpdateCLOpening):", err);
    return sendError(res, err);
  }
};

// POST /clopening/create
export const create = (req, res) => saveOrUpdate(req, res, false);

// PUT  /clopening/update/:clCode
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /clopening/delete/:clYear/:employeeCode  -> sp_EmployeeCLOpening_Delete
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const clYear = (req.params.clYear || "").toString().trim();
    const employeeCode = toInt(req.params.employeeCode);
    if (!clYear) return sendError(res, "Invalid CLYear", 400);
    if (employeeCode <= 0) return sendError(res, "Invalid EmployeeCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("CLYear", sql.VarChar(10), clYear)
      .input("EmployeeCode", sql.Int, employeeCode)
      .execute("sp_EmployeeCLOpening_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("FK_") || err.message.includes("REFERENCE"))) {
      return sendError(res, "You cannot Delete the CL Opening!", 409);
    }
    console.error("DB Error (deleteCLOpening):", err);
    return sendError(res, err);
  }
};
