import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";
import { getStates, getBanks } from "../utils/masters.js";

// ---------------------------------------------------------------------------
// Agent master (port of the WinForms frmAgent)
//   - List    : Select ... from tbl_Agent
//   - Create  : EXEC sp_Agent_AddEdit  (without @AgentCode)
//   - Update  : EXEC sp_Agent_AddEdit  (with @AgentCode)
//   - Delete  : EXEC sp_Agent_Delete
//   - Options : State + Bank lookups for the form dropdowns (GET /agent/options)
// AddEdit needs @User / @Node / @CompanyCode, read from the auth token (headers).
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

const toBit = (v) => {
  if (v === true || v === 1 || v === "1") return 1;
  if (typeof v === "string" && v.trim().toUpperCase() === "ACTIVE") return 1;
  return 0;
};

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};

const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};

const SELECT_COLS =
  "Select AgentCode, AgentName, City, District, StateCode, PinCode, PhoneNo, " +
  "MobileNo, EMail, BankCode, Status from tbl_Agent";

// GET /agent/lists  -> mirrors frmAgentDetails list query
export const getAgentList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .query(`${SELECT_COLS} order by AgentName`);

    const data = result.recordset.map((item) => ({
      ...item,
      id: item.AgentCode,
      StatusText: STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getAgentList):", err);
    return sendError(res, err);
  }
};

// GET /agent/list/:agentCode  -> single record (all columns, for edit)
export const getAgentById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.agentCode);
    if (!code) return sendError(res, "Invalid AgentCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("AgentCode", sql.Int, code)
      .query("Select * from tbl_Agent where AgentCode = @AgentCode");

    if (!result.recordset.length)
      return sendError(res, "Agent not found", 404);

    const row = result.recordset[0];
    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getAgentById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_Agent_AddEdit (btnSave_Click)
const saveOrUpdateAgent = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const name = (body.AgentName || "").trim();
    const stateCode = toInt(body.StateCode);
    const mobileNo = (body.MobileNo || "").trim();
    const bankCode = toInt(body.BankCode);

    // Same validations the form enforces.
    if (!name) return sendError(res, "Agent should not be empty", 400);
    if (!stateCode) return sendError(res, "Select the State", 400);
    if (mobileNo.length < 10)
      return sendError(res, "Enter the Mobile No", 400);
    if (!bankCode) return sendError(res, "Select the Bank", 400);

    const code = isEdit
      ? parseInt(req.params.agentCode ?? body.AgentCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid AgentCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    if (isEdit) request.input("AgentCode", sql.Int, code);
    request.input("AgentName", sql.NVarChar, name);
    request.input("Address1", sql.NVarChar, (body.Address1 || "").trim());
    request.input("Address2", sql.NVarChar, (body.Address2 || "").trim());
    request.input("City", sql.NVarChar, (body.City || "").trim());
    request.input("District", sql.NVarChar, (body.District || "").trim());
    request.input("StateCode", sql.Int, stateCode);
    request.input("PinCode", sql.NVarChar, (body.PinCode || "").trim());
    request.input("PhoneNo", sql.NVarChar, (body.PhoneNo || "").trim());
    request.input("MobileNo", sql.NVarChar, mobileNo);
    request.input("EMail", sql.NVarChar, (body.EMail || "").trim());
    request.input("OpnBalance", sql.Decimal(18, 2), toNum(body.OpnBalance));

    // DOB is only sent when the form's DOB checkbox is ticked.
    if (body.DOB) request.input("DOB", sql.DateTime, new Date(body.DOB));

    request.input("Yarn", sql.Bit, toBit(body.Yarn));
    request.input("Cotton", sql.Bit, toBit(body.Cotton));
    request.input("HR", sql.Bit, toBit(body.HR));
    request.input("Viscos", sql.Bit, toBit(body.Viscos));
    request.input("Scrap", sql.Bit, toBit(body.Scrap));

    request.input("BankCode", sql.Int, bankCode);
    request.input("IFSCCode", sql.NVarChar, (body.IFSCCode || "").trim());
    request.input("AccountNo", sql.NVarChar, (body.AccountNo || "").trim());

    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    request.input("CompanyCode", sql.Int, toInt(req.headers.companyCode));

    request.input("CreditDays", sql.Int, toInt(body.CreditDays));
    request.input("CreditLimit", sql.Decimal(18, 2), toNum(body.CreditLimit));
    request.input("CommissionPerBag", sql.Decimal(18, 2), toNum(body.CommissionPerBag));
    request.input("CommissionPerKg", sql.Decimal(18, 2), toNum(body.CommissionPerKg));
    request.input("CommissionPerExmill", sql.Decimal(18, 4), toNum(body.CommissionPerExmill));
    request.input("LabourCommission", sql.Decimal(18, 2), toNum(body.LabourCommission));
    request.input("FoodAllowance", sql.Decimal(18, 2), toNum(body.FoodAllowance));

    request.input("Status", sql.Bit, toBit(body.Status));

    await request.execute("sp_Agent_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_")) {
      return sendError(res, "Already exist this Agent ID / Retailer ID", 409);
    }
    console.error("DB Error (saveOrUpdateAgent):", err);
    return sendError(res, err);
  }
};

// POST /agent/create        -> create
export const createAgent = (req, res) => saveOrUpdateAgent(req, res, false);

// PUT  /agent/update/:code  -> update
export const updateAgent = (req, res) => saveOrUpdateAgent(req, res, true);

// DELETE /agent/delete/:agentCode -> EXEC sp_Agent_Delete
export const deleteAgent = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.agentCode);
    if (!code) return sendError(res, "Invalid AgentCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("AgentCode", sql.Int, code)
      .execute("sp_Agent_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the Agent!", 409);
    }
    console.error("DB Error (deleteAgent):", err);
    return sendError(res, err);
  }
};

// GET /agent/options -> State + Bank lookups for the form dropdowns (Bind_Data()).
export const getAgentOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);

    const [states, banks] = await Promise.all([getStates(pool), getBanks(pool)]);

    return sendSuccess(res, { states, banks });
  } catch (err) {
    console.error("DB Error (getAgentOptions):", err);
    return sendError(res, err);
  }
};
