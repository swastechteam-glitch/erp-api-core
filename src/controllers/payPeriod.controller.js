import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Pay Period master (port of the WinForms frmPayPeriod / frmPayPeriodDetails)
//
//   A company-scoped master: Pay Type + From/To dates + working-day counts +
//   incentive days + Room Rent / Extra Mess deduction flags. The period name is
//   auto-built "dd/MM/yyyy - dd/MM/yyyy" from the dates. Status is always 1 and
//   Finalize 0 on save (faithful to the desktop).
//
//   Stored procs (kept identical to the desktop):
//     sp_PayPeriod_AddEdit     -> insert/update (@User/@Node + @CompanyCode, edit adds @PayPeriodCode)
//     sp_PayPeriod_GetAll      -> list (@CompanyCode)
//     sp_PayPeriod_Delete      -> delete (@PayperiodCode,@CompanyCode)
//     sp_PayPeriod_GetFromDate -> last PayPeriodTo for a pay type (@CompanyCode,@PayTypeCode)
//   Lookups: tbl_PayType. Duplicate check: tbl_Payperiod (company + name).
//
//   Endpoints
//     GET    /options              pay types
//     GET    /from-date/:payType   last period's "to" date for that pay type
//     GET    /lists                sp_PayPeriod_GetAll for the company
//     GET    /record/:code         one pay period
//     POST   /create               sp_PayPeriod_AddEdit (no @PayPeriodCode)
//     PUT    /update/:code         sp_PayPeriod_AddEdit (with @PayPeriodCode)
//     DELETE /delete/:code         sp_PayPeriod_Delete
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};
const toBit = (v) =>
  v === true || v === 1 || v === "1" || (typeof v === "string" && v.trim().toUpperCase() === "ACTIVE")
    ? 1
    : 0;
const getCompanyCode = (req) => toInt(req.headers.companyCode);

const ymd = (v) => {
  if (!v) return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
};
// "YYYY-MM-DD" -> "DD/MM/YYYY" (the desktop's PayPeriodName / display format).
const ddmmyyyy = (v) => {
  const s = ymd(v);
  if (!s) return "";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
};

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

// GET /pay-period/options  -> pay types (cmbPayType source)
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .query("Select PayTypeCode, PayTypeName from tbl_PayType order by PayTypeName");
    return sendSuccess(res, {
      payTypes: (r.recordset || []).map((x) => ({
        value: toInt(x.PayTypeCode),
        label: x.PayTypeName ?? "",
      })),
    });
  } catch (err) {
    console.error("DB Error (PayPeriod.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /pay-period/from-date/:payType  -> last PayPeriodTo for the chosen pay type
// (drives the desktop's auto From/To behaviour when adding a new period).
export const getFromDate = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const payTypeCode = toInt(req.params.payType);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("PayTypeCode", sql.Int, payTypeCode)
      .execute("sp_PayPeriod_GetFromDate");
    const row = r.recordset?.[0];
    return sendSuccess(res, { payPeriodTo: row ? ymd(pick(row, "PayPeriodTo")) : "" });
  } catch (err) {
    console.error("DB Error (PayPeriod.getFromDate):", err);
    return sendError(res, err);
  }
};

// GET /pay-period/lists  -> sp_PayPeriod_GetAll @CompanyCode
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_PayPeriod_GetAll");
    const data = (r.recordset || []).map((row) => {
      const code = toInt(pick(row, "PayPeriodCode"));
      return {
        ...row,
        id: code,
        PayPeriodCode: code,
        PayTypeName: pick(row, "PayTypeName") ?? "",
        PayPeriodName: pick(row, "PayPeriodName") ?? "",
        PayPeriodFrom: ddmmyyyy(pick(row, "PayPeriodFrom")),
        PayPeriodTo: ddmmyyyy(pick(row, "PayPeriodTo")),
        WorkingDays: toNum(pick(row, "WorkingDays")),
        Status: toBit(pick(row, "Status")) ? "ACTIVE" : "INACTIVE",
      };
    });
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (PayPeriod.getList):", err);
    return sendError(res, err);
  }
};

// GET /pay-period/record/:code  -> one record for the edit screen (from GetAll).
export const getRecord = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (code <= 0) return sendError(res, "Invalid PayPeriodCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_PayPeriod_GetAll");
    const row = (r.recordset || []).find((x) => toInt(pick(x, "PayPeriodCode")) === code);
    if (!row) return sendError(res, "Pay Period not found", 404);

    return sendSuccess(res, {
      PayPeriodCode: code,
      PayTypeCode: toInt(pick(row, "PayTypeCode")),
      PayPeriodFrom: ymd(pick(row, "PayPeriodFrom")),
      PayPeriodTo: ymd(pick(row, "PayPeriodTo")),
      PayPeriodName: pick(row, "PayPeriodName") ?? "",
      WorkingDays: toNum(pick(row, "WorkingDays")),
      PFWorkingDays: toNum(pick(row, "PFWorkingDays")),
      SecurityWorkingDays: toNum(pick(row, "SecurityWorkingDays")),
      IncentiveDays: toNum(pick(row, "IncentiveDays")),
      RoomRent: toBit(pick(row, "RoomRent")),
      ExtraMess: toBit(pick(row, "ExtraMess")),
    });
  } catch (err) {
    console.error("DB Error (PayPeriod.getRecord):", err);
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
    if (companyCode <= 0)
      return sendError(res, "You are logged in to a group of companies; switch to a single company.", 400);

    const b = req.body || {};
    const payTypeCode = toInt(b.PayTypeCode);
    const from = ymd(b.PayPeriodFrom);
    const to = ymd(b.PayPeriodTo);
    const workingDays = toNum(b.WorkingDays);

    // ---- validation (port of btnSave_Click) --------------------------------
    if (payTypeCode <= 0) return sendError(res, "Select the Pay Type", 400);
    if (payTypeCode === 2 && workingDays <= 0)
      return sendError(res, "Enter the Working Days", 400);
    if (!from || !to) return sendError(res, "Please Check the Pay Period Date", 400);
    if (from > to) return sendError(res, "Please Check the Pay Period Date", 400);

    // Period name "dd/MM/yyyy - dd/MM/yyyy" (built from the dates, as the desktop does).
    const payPeriodName = `${ddmmyyyy(from)} - ${ddmmyyyy(to)}`;

    const code = isEdit ? toInt(req.params.code ?? b.PayPeriodCode) : 0;
    if (isEdit && !code) return sendError(res, "Invalid PayPeriodCode for update", 400);

    const pool = await getPool(req.headers.subdbname);

    // Duplicate-name guard (company + name + different code) -> desktop message.
    const dup = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("PayPeriodName", sql.NVarChar, payPeriodName)
      .input("PayPeriodCode", sql.Int, code)
      .query(
        "Select 1 from tbl_Payperiod where CompanyCode = @CompanyCode AND PayperiodName = @PayPeriodName AND PayPeriodCode <> @PayPeriodCode"
      );
    if (dup.recordset && dup.recordset.length > 0)
      return sendError(res, "Pay Period Already Created....", 409);

    const request = pool.request();
    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) request.input("PayPeriodCode", sql.Int, code);
    request.input("PayTypeCode", sql.Int, payTypeCode);
    request.input("PayPeriodFrom", sql.VarChar(10), from);
    request.input("PayPeriodTo", sql.VarChar(10), to);
    request.input("PayPeriodName", sql.NVarChar, payPeriodName);
    request.input("WorkingDays", sql.Int, workingDays);
    request.input("PFWorkingDays", sql.Int, toNum(b.PFWorkingDays));
    request.input("SecurityWorkingDays", sql.Int, toNum(b.SecurityWorkingDays));
    request.input("IncentiveDays", sql.Int, toNum(b.IncentiveDays));
    request.input("Finalize", sql.Bit, 0);
    request.input("Status", sql.Int, 1);
    request.input("RoomRent", sql.Bit, toBit(b.RoomRent));
    request.input("ExtraMess", sql.Bit, toBit(b.ExtraMess));
    request.input("CompanyCode", sql.Int, companyCode);

    await request.execute("sp_PayPeriod_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (err.message && err.message.includes("UK_")) {
      return sendError(res, "Already exist the PayPeriod Name", 409);
    }
    console.error("DB Error (saveOrUpdatePayPeriod):", err);
    return sendError(res, err);
  }
};

// POST /pay-period/create
export const create = (req, res) => saveOrUpdate(req, res, false);

// PUT  /pay-period/update/:code
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /pay-period/delete/:code  -> sp_PayPeriod_Delete (@PayperiodCode,@CompanyCode)
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (code <= 0) return sendError(res, "Invalid PayPeriodCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("PayperiodCode", sql.Int, code)
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_PayPeriod_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("FK_") || err.message.includes("REFERENCE"))) {
      return sendError(res, "You can not delete the PayPeriod !", 409);
    }
    console.error("DB Error (deletePayPeriod):", err);
    return sendError(res, err);
  }
};
