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
