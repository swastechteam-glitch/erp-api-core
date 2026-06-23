import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Costing Master (port of the WinForms frmCostingMaster) — READ ONLY
//   - List   : Select ... from tbl_CostingMaster
//   - Latest : the highest CostingMasterCode row (used to prefill the form)
// NOTE: There is no Status column on this master.
// ---------------------------------------------------------------------------

// Use SELECT * (matching the WinForms form) so we don't hard-code column
// names that may differ across client DB schemas (e.g. OverHeads).
const SELECT_COLS = "Select * from tbl_CostingMaster";

// The editable money columns. We only write the ones that actually exist on the
// client's table (schema-tolerant), matching the SELECT * philosophy above.
const COST_FIELDS = [
  "EBDemandCost",
  "CCInterest",
  "HOSalary",
  "ExcutiveSalary",
  "OverHeads",
];

const num = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));

const getTableColumns = async (pool, table) => {
  const r = await pool
    .request()
    .input("t", sql.NVarChar, table)
    .query(
      "Select COLUMN_NAME from INFORMATION_SCHEMA.COLUMNS where TABLE_NAME = @t"
    );
  return new Set(r.recordset.map((x) => x.COLUMN_NAME));
};

// GET /costing-master/lists  -> all snapshots (newest first)
export const getCostingMasterList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .query(`${SELECT_COLS} order by CostingMasterCode desc`);

    const data = result.recordset.map((item) => ({
      ...item,
      id: item.CostingMasterCode,
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getCostingMasterList):", err);
    return sendError(res, err);
  }
};

// GET /costing-master/latest  -> latest snapshot (frmCostingMaster_Load prefill)
export const getLatestCostingMaster = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .query(
        `${SELECT_COLS} where CostingMasterCode = (Select Max(ISNULL(CostingMasterCode,0)) from tbl_CostingMaster)`
      );

    return sendSuccess(res, result.recordset[0] || null);
  } catch (err) {
    console.error("DB Error (getLatestCostingMaster):", err);
    return sendError(res, err);
  }
};

// POST /costing-master/create  -> insert a new snapshot
export const createCostingMaster = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const cols = await getTableColumns(pool, "tbl_CostingMaster");
    const b = req.body || {};

    const used = COST_FIELDS.filter((c) => cols.has(c));
    const request = pool.request();
    used.forEach((c) => request.input(c, sql.Decimal(18, 2), num(b[c])));

    const insertCols = [...used];
    // Carry CompanyCode only if the table has that column.
    if (cols.has("CompanyCode") && req.headers.companyCode) {
      request.input("CompanyCode", sql.Int, parseInt(req.headers.companyCode));
      insertCols.push("CompanyCode");
    }

    if (!insertCols.length)
      return sendError(res, "No costing columns to save", 400);

    const result = await request.query(
      `Insert into tbl_CostingMaster (${insertCols.join(", ")}) ` +
        `values (${insertCols.map((c) => "@" + c).join(", ")}); ` +
        `Select SCOPE_IDENTITY() as CostingMasterCode;`
    );

    const code = result.recordset?.[0]?.CostingMasterCode ?? null;
    return sendSuccess(res, { CostingMasterCode: code }, "The record is saved", 201);
  } catch (err) {
    console.error("DB Error (createCostingMaster):", err);
    return sendError(res, err);
  }
};

// PUT /costing-master/update/:costingMasterCode  -> update a snapshot
export const updateCostingMaster = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.costingMasterCode ?? req.body?.CostingMasterCode);
    if (!code) return sendError(res, "Invalid CostingMasterCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const cols = await getTableColumns(pool, "tbl_CostingMaster");
    const b = req.body || {};

    const used = COST_FIELDS.filter((c) => cols.has(c));
    if (!used.length) return sendError(res, "No costing columns to update", 400);

    const request = pool.request().input("CostingMasterCode", sql.Int, code);
    used.forEach((c) => request.input(c, sql.Decimal(18, 2), num(b[c])));

    await request.query(
      `Update tbl_CostingMaster set ${used
        .map((c) => `${c} = @${c}`)
        .join(", ")} where CostingMasterCode = @CostingMasterCode`
    );

    return sendSuccess(res, { CostingMasterCode: code }, "The record is updated");
  } catch (err) {
    console.error("DB Error (updateCostingMaster):", err);
    return sendError(res, err);
  }
};

// GET /costing-master/list/:costingMasterCode  -> single record
export const getCostingMasterById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.costingMasterCode);
    if (!code) return sendError(res, "Invalid CostingMasterCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CostingMasterCode", sql.Int, code)
      .query(`${SELECT_COLS} where CostingMasterCode = @CostingMasterCode`);

    if (!result.recordset.length)
      return sendError(res, "Costing Master not found", 404);

    return sendSuccess(res, result.recordset[0]);
  } catch (err) {
    console.error("DB Error (getCostingMasterById):", err);
    return sendError(res, err);
  }
};
