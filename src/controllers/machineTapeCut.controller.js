import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Machine Tape Cut (port of WinForms frmMachineTapeCut / frmMachinetapeCutDetails)
//
// Single-table header-only entry (Mechanical only): Tape Cut Date, Branch,
// Department, Machine, Item (SKIVED APRON / SPINDLE TAPE), No Of Tapes, and a
// Tape Cut / Apron Change radio. Rate auto-fills from the item's PurchaseCost.
//
//   Lookups : branches / departments / items / machines
//   Machines: tbl_Machine (Status=1, MachineTypeCode=1, company, optional br/dept)
//   List    : sp_MachineTapeCut_GetAll
//   One     : header (from GetAll, by TapeCutCode)
//   Save    : sp_MachineTapeCut_AddEdit            (ExecuteNonQuery)
//   Delete  : sp_MachineTapeCut_Delete
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};
const D = (v) => (v ? new Date(v) : null);
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getFYCode = (req) => toInt(req.headers.FYCode);

// =========================================================================
// LOOKUPS
// =========================================================================

// GET /machine-tape-cut/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    const [branches, departments, items] = await Promise.all([
      pool.request().input("CompanyCode", sql.Int, companyCode)
        .query("SELECT BranchCode, BranchName FROM tbl_Branch WHERE CompanyCode = @CompanyCode ORDER BY BranchName"),
      pool.request().query(
        "SELECT DepartmentCode, DepartmentName FROM tbl_Department WHERE Status = 1 ORDER BY DepartmentName"
      ),
      // Tape Cut items only — mirrors the VB filter (note the AND binds to the
      // SPINDLE TAPE clause, matching the original query's precedence).
      pool.request().query(
        "SELECT ItemCode, ItemName, ISNULL(PurchaseCost,0) AS PurchaseCost FROM tbl_Item " +
          "WHERE ItemName LIKE '%SKIVED APRON%' OR (ItemName LIKE '%SPINDLE TAPE%' AND Status = 1) ORDER BY ItemName"
      ),
    ]);

    return sendSuccess(res, {
      branches: branches.recordset,
      departments: departments.recordset,
      items: items.recordset,
    });
  } catch (err) {
    console.error("DB Error (MachineTapeCut.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /machine-tape-cut/machines?branchCode=&departmentCode=
export const getMachines = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const branchCode = toInt(req.query.branchCode);
    const departmentCode = toInt(req.query.departmentCode);

    let where = "Status = 1 AND MachineTypeCode = 1 AND CompanyCode = @CompanyCode";
    if (branchCode) where += " AND BranchCode = @BranchCode";
    if (departmentCode) where += " AND DepartmentCode = @DepartmentCode";

    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("BranchCode", sql.Int, branchCode)
      .input("DepartmentCode", sql.Int, departmentCode)
      .query(`SELECT MachineCode, MachineName, BranchCode, DepartmentCode FROM tbl_Machine WHERE ${where} ORDER BY MachineName`);
    return sendSuccess(res, r.recordset);
  } catch (err) {
    console.error("DB Error (MachineTapeCut.getMachines):", err);
    return sendError(res, err);
  }
};

// =========================================================================
// LIST / ONE
// =========================================================================

// GET /machine-tape-cut/lists
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("FyCode", sql.Int, getFYCode(req))
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_MachineTapeCut_GetAll");
    const data = (r.recordset || [])
      .sort((a, b) => b.TapeCutCode - a.TapeCutCode)
      .map((x) => ({ ...x, id: x.TapeCutCode }));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (MachineTapeCut.getList):", err);
    return sendError(res, err);
  }
};

// GET /machine-tape-cut/list/:code
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (!code) return sendError(res, "Invalid code", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("FyCode", sql.Int, getFYCode(req))
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_MachineTapeCut_GetAll");
    const row = (r.recordset || []).find((x) => x.TapeCutCode === code);
    if (!row) return sendError(res, "Tape Cut not found", 404);
    return sendSuccess(res, row);
  } catch (err) {
    console.error("DB Error (MachineTapeCut.getById):", err);
    return sendError(res, err);
  }
};

// =========================================================================
// SAVE
// =========================================================================
const saveOrUpdate = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode) return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const b = req.body || {};
    const branchCode = toInt(b.BranchCode);
    const departmentCode = toInt(b.DepartmentCode);
    const machineCode = toInt(b.MachineCode);
    const itemCode = toInt(b.ItemCode);
    const noOfTapes = toNum(b.NoOfTapes);
    const rate = toNum(b.Rate);
    const tapeCut = b.TapeCut === 1 || b.TapeCut === "1" || b.TapeCut === true ? 1 : 0;
    const apronChange = b.ApronChange === 1 || b.ApronChange === "1" || b.ApronChange === true ? 1 : 0;
    const tapeCutDate = D(b.TapeCutDate) || new Date();

    // Validation — mirrors the WinForms btnSave_Click.
    if (!branchCode) return sendError(res, "Select the Branch Name", 400);
    if (!departmentCode) return sendError(res, "Select the Department Name", 400);
    if (!machineCode) return sendError(res, "Select the Machine Name", 400);
    if (!itemCode) return sendError(res, "Select the Item Name", 400);
    if (noOfTapes <= 0) return sendError(res, "Enter the No Of Tapes", 400);

    const code = isEdit ? toInt(req.params.code ?? b.TapeCutCode) : 0;
    if (isEdit && !code) return sendError(res, "Invalid code for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool
      .request()
      .input("TapeCutDate", sql.DateTime, tapeCutDate)
      .input("BranchCode", sql.Int, branchCode)
      .input("DepartmentCode", sql.Int, departmentCode)
      .input("MachineCode", sql.Int, machineCode)
      .input("ItemCode", sql.Int, itemCode)
      .input("Rate", sql.Decimal(18, 4), rate)
      .input("NoOfTapes", sql.Decimal(18, 4), noOfTapes)
      .input("TapeCut", sql.Int, tapeCut)
      .input("ApronChange", sql.Int, apronChange)
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("User", sql.Int, toInt(userId))
      .input("Node", sql.Int, toInt(nodeCode))
      .input("FYCode", sql.Int, getFYCode(req));
    if (code) request.input("TapeCutCode", sql.Int, code);

    await request.execute("sp_MachineTapeCut_AddEdit");
    return sendSuccess(
      res,
      { TapeCutCode: code || null },
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    console.error("DB Error (MachineTapeCut.saveOrUpdate):", err);
    return sendError(res, err);
  }
};

export const create = (req, res) => saveOrUpdate(req, res, false);
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /machine-tape-cut/delete/:code
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (!code) return sendError(res, "Invalid code", 400);
    const pool = await getPool(req.headers.subdbname);
    await pool.request().input("TapeCutCode", sql.Int, code).execute("sp_MachineTapeCut_Delete");
    return sendSuccess(res, { TapeCutCode: code }, "The record is deleted");
  } catch (err) {
    if (err.message && err.message.includes("FK_")) return sendError(res, "You cannot delete this Tape Cut", 409);
    console.error("DB Error (MachineTapeCut.remove):", err);
    return sendError(res, err);
  }
};
