import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Shift master (port of the WinForms frmShift / frmShiftDetails)
//
//   A large company-scoped master: shift header + In/Out times, 2 long breaks,
//   3 short breaks, working-hours auto-calc, half-day settings, flags.
//
//   Stored procs (kept identical to the desktop):
//     sp_Shift_AddEdit  -> insert/update (create @C_User/@C_Node,
//                          edit @E_User/@E_Node + @ShiftCode; ~80 params)
//     sp_Shift_GetAll   -> list (@CompanyCode)   [also used to fetch one for edit]
//     sp_Shift_Delete   -> delete (@ShiftCode, @CompanyCode)
//   Lookups: sp_ShiftGroup_GetAll (@CompanyCode,@Status=1) [+Rotation],
//            sp_ShiftSubGroup_GetAll, sp_WeekDay_GetAll.
//
//   Time fields are DateTime in SQL but only the clock part matters: the React
//   form sends "HH:mm"; we store as '1900-01-01 HH:mm:00' (VarChar -> implicit
//   DateTime) so there is no timezone shift, and read back via UTC accessors.
//   Duration fields (MinFullDay/MinHalfDay/HalfWorkingDayMins) are int minutes;
//   the form shows them as "HH:mm" so we convert both ways (Conv_Mins/Conv_Hours).
//
//   user/node from the auth token; company from req.headers.companyCode.
//
//   Endpoints
//     GET    /options                lookups (shift groups [+Rotation], sub groups, week days)
//     GET    /lists                  sp_Shift_GetAll
//     GET    /list/:shiftCode        one record (from GetAll), times -> "HH:mm"
//     POST   /create                 sp_Shift_AddEdit (no code)
//     PUT    /update/:shiftCode      sp_Shift_AddEdit (with code)
//     DELETE /delete/:shiftCode      sp_Shift_Delete
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const toBit = (v) => {
  if (v === true || v === 1 || v === "1") return 1;
  if (typeof v === "string" && ["active", "y", "yes", "true"].includes(v.trim().toLowerCase())) return 1;
  return 0;
};
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");
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

// SQL DateTime -> "HH:mm" (UTC accessors: tedious gives the wall clock as UTC).
const hm = (v) => {
  if (!v) return "00:00";
  const d = v instanceof Date ? v : new Date(v);
  if (!Number.isNaN(d.getTime())) {
    return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  }
  const m = String(v).match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "00:00";
};
// "HH:mm" -> '1900-01-01 HH:mm:00' (constant date, no TZ shift)
const timeDT = (s) => {
  const m = String(s || "").match(/(\d{1,2}):(\d{2})/);
  const h = m ? m[1].padStart(2, "0") : "00";
  const mi = m ? m[2] : "00";
  return `1900-01-01 ${h}:${mi}:00`;
};
const hmToMin = (s) => {
  const m = String(s || "").match(/(\d{1,2}):(\d{2})/);
  return m ? toInt(m[1]) * 60 + toInt(m[2]) : 0;
};
const minToHM = (mins) => {
  const n = toInt(mins);
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
};

// GET /shift/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    const [shiftGroups, shiftSubGroups, weekDays] = await Promise.all([
      pool.request().input("CompanyCode", sql.Int, cc).input("Status", sql.Int, 1).execute("sp_ShiftGroup_GetAll"),
      pool.request().execute("sp_ShiftSubGroup_GetAll"),
      pool.request().execute("sp_WeekDay_GetAll"),
    ]);

    return sendSuccess(res, {
      shiftGroups: (shiftGroups.recordset || []).map((x) => ({
        value: toInt(pick(x, "ShiftGroupCode")),
        label: pick(x, "ShiftGroupName") ?? "",
        Rotation: toBit(pick(x, "Rotation")),
      })),
      shiftSubGroups: (shiftSubGroups.recordset || []).map((x) => ({
        value: toInt(pick(x, "ShiftSubGroupCode")),
        label: pick(x, "ShiftSubGroupName") ?? "",
      })),
      weekDays: (weekDays.recordset || []).map((x) => ({
        value: toInt(pick(x, "WeekCode")),
        label: pick(x, "WeekDayName") ?? "",
      })),
    });
  } catch (err) {
    console.error("DB Error (Shift.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /shift/lists  -> sp_Shift_GetAll @CompanyCode
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool.request().input("CompanyCode", sql.Int, cc).execute("sp_Shift_GetAll");
    const data = (r.recordset || []).map((row) => {
      const code = toInt(pick(row, "ShiftCode"));
      return {
        ...row,
        id: code,
        ShiftCode: code,
        ShiftName: pick(row, "ShiftName") ?? "",
        ShortName: pick(row, "ShortName") ?? "",
        ShiftNo: pick(row, "ShiftNo") ?? "",
        ShiftGroupName: pick(row, "ShiftGroupName") ?? "",
        InTime: hm(pick(row, "InTime")),
        OutTime: hm(pick(row, "OutTime")),
        Status: STATUS_LABEL(toBit(pick(row, "Status"))),
      };
    });
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (Shift.getList):", err);
    return sendError(res, err);
  }
};

// GET /shift/list/:shiftCode  -> one record for the edit screen (from GetAll)
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const code = toInt(req.params.shiftCode);
    if (code <= 0) return sendError(res, "Invalid ShiftCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const r = await pool.request().input("CompanyCode", sql.Int, cc).execute("sp_Shift_GetAll");
    const row = (r.recordset || []).find((x) => toInt(pick(x, "ShiftCode")) === code);
    if (!row) return sendError(res, "Shift not found", 404);

    const g = (...k) => pick(row, ...k);
    return sendSuccess(res, {
      ShiftCode: code,
      ShiftName: g("ShiftName") ?? "",
      ShortName: g("ShortName") ?? "",
      ShiftNo: g("ShiftNo") ?? "",
      ShiftGroupCode: toInt(g("ShiftGroupCode")),
      ShiftSubGroupCode: toInt(g("ShiftSubGroupCode")),
      Rotation: toBit(g("Rotation")),
      Status: toBit(g("Status")),
      // In/Out
      InTime: hm(g("InTime")),
      OutTime: hm(g("OutTime")),
      NextInTime: toBit(g("NextInTime")),
      NextOutTime: toBit(g("NextOutTime")),
      LateIn: toInt(g("LateIn")),
      EarlyOut: toInt(g("EarlyOut")),
      BeginningIn: hm(g("BeginningIn")),
      BeginningOut: hm(g("BeginningOut")),
      NextDayBeginningIn: toBit(g("NextDayBeginningIn")),
      NextDayBeginningOut: toBit(g("NextDayBeginningOut")),
      EndingIn: hm(g("EndingIn")),
      EndingOut: hm(g("EndingOut")),
      NextDayEndingIn: toBit(g("NextDayEndingIn")),
      NextDayEndingOut: toBit(g("NextDayEndingOut")),
      // Long break 1
      LongBreak1: toBit(g("LongBreak1")),
      LongBreakMins1: toInt(g("LongBreakMins1")),
      LongLateInMins1: toInt(g("LongLateInMins1")),
      IncLongBreak1: toBit(g("IncLongBreak1")),
      LongBreakStart1: hm(g("LongBreakStart1")),
      NextLongStart1: toBit(g("NextLongStart1")),
      LongBreakEnd1: hm(g("LongBreakEnd1")),
      NextLongEnd1: toBit(g("NextLongEnd1")),
      // Long break 2
      LongBreak2: toBit(g("LongBreak2")),
      LongBreakMins2: toInt(g("LongBreakMins2")),
      LongLateInMins2: toInt(g("LongLateInMins2")),
      IncLongBreak2: toBit(g("IncLongBreak2")),
      LongBreakStart2: hm(g("LongBreakStart2")),
      NextLongStart2: toBit(g("NextLongStart2")),
      LongBreakEnd2: hm(g("LongBreakEnd2")),
      NextLongEnd2: toBit(g("NextLongEnd2")),
      // Short breaks
      ShortBreakMins: toInt(g("ShortBreakMins")),
      ShortLateInMins: toInt(g("ShortLateInMins")),
      IncShortBreak: toBit(g("IncShortBreak")),
      ShortBreak1: toBit(g("ShortBreak1")),
      ShortBreakStart1: hm(g("ShortBreakStart1")),
      NextShortStart1: toBit(g("NextShortStart1")),
      ShortBreakEnd1: hm(g("ShortBreakEnd1")),
      NextShortend1: toBit(g("NextShortEnd1", "NextShortend1")),
      ShortBreak2: toBit(g("ShortBreak2")),
      ShortBreakStart2: hm(g("ShortBreakStart2")),
      NextShortStart2: toBit(g("NextShortStart2")),
      ShortBreakEnd2: hm(g("ShortBreakEnd2")),
      NextShortend2: toBit(g("NextShortEnd2", "NextShortend2")),
      ShortBreak3: toBit(g("ShortBreak3")),
      ShortBreakStart3: hm(g("ShortBreakStart3")),
      NextShortStart3: toBit(g("NextShortStart3")),
      ShortBreakEnd3: hm(g("ShortBreakEnd3")),
      NextShortend3: toBit(g("NextShortEnd3", "NextShortend3")),
      // Working hours / day
      WorkingHours: g("WorkingHours") ?? "",
      WorkingMins: toInt(g("WorkingMins")),
      IncPermission: toBit(g("IncPermission")),
      IncOnDuty: toBit(g("IncOnDuty")),
      OTCal: toBit(g("OTCal")),
      HalfWorkingDay: toInt(g("HalfWorkingDay")),
      HalfWorkingDayMins: minToHM(g("HalfWorkingDayMins")),
      MinFullDay: minToHM(g("MinFullDay")),
      MinHalfDay: minToHM(g("MinHalfDay")),
    });
  } catch (err) {
    console.error("DB Error (Shift.getById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_Shift_AddEdit (btnSave_Click)
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

    // ---- validation (port of btnSave_Click, same order / messages) ---------
    if (!(b.ShiftName || "").trim()) return sendError(res, "Shift Name should not be empty", 400);
    if (toInt(b.ShiftGroupCode) <= 0) return sendError(res, "Select the Shift Group....", 400);
    if (toInt(b.ShiftSubGroupCode) <= 0) return sendError(res, "Select the Shift Sub Group....", 400);
    if (!(b.ShortName || "").trim()) return sendError(res, "Enter the Short NaMe...", 400);
    if (!String(b.ShiftNo ?? "").trim()) return sendError(res, "Enter the Shift No....", 400);

    const code = isEdit ? toInt(req.params.shiftCode ?? b.ShiftCode) : null;
    if (isEdit && !code) return sendError(res, "Invalid ShiftCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const r = pool.request();
    const S = (n, v) => r.input(n, sql.NVarChar, (v ?? "").toString().trim());
    const I = (n, v) => r.input(n, sql.Int, toInt(v));
    const B = (n, v) => r.input(n, sql.Bit, toBit(v));
    const T = (n, v) => r.input(n, sql.VarChar(20), timeDT(v));
    const M = (n, v) => r.input(n, sql.Int, hmToMin(v)); // "HH:mm" -> minutes

    if (isEdit) {
      I("E_User", userId);
      I("E_Node", nodeCode);
      I("ShiftCode", code);
    } else {
      I("C_User", userId);
      I("C_Node", nodeCode);
    }

    B("Rotation", b.Rotation);
    I("ShiftGroupCode", b.ShiftGroupCode);
    I("ShiftSubGroupCode", b.ShiftSubGroupCode);
    S("ShiftName", b.ShiftName);
    S("ShortName", b.ShortName);
    I("ShiftNo", b.ShiftNo);

    T("InTime", b.InTime);
    T("OutTime", b.OutTime);
    B("NextInTime", b.NextInTime);
    B("NextOutTime", b.NextOutTime);
    I("LateIn", b.LateIn);
    I("EarlyOut", b.EarlyOut);
    T("BeginningIn", b.BeginningIn);
    T("BeginningOut", b.BeginningOut);
    B("NextDayBeginningIn", b.NextDayBeginningIn);
    B("NextDayBeginningOut", b.NextDayBeginningOut);
    T("EndingIn", b.EndingIn);
    T("EndingOut", b.EndingOut);
    B("NextDayEndingIn", b.NextDayEndingIn);
    B("NextDayEndingOut", b.NextDayEndingOut);

    // Long break 1
    B("LongBreak1", b.LongBreak1);
    I("LongBreakMins1", b.LongBreakMins1);
    I("LongLateInMins1", b.LongLateInMins1);
    B("IncLongBreak1", b.IncLongBreak1);
    T("LongBreakStart1", b.LongBreakStart1);
    B("NextLongStart1", b.NextLongStart1);
    T("LongBreakEnd1", b.LongBreakEnd1);
    B("NextLongEnd1", b.NextLongEnd1);
    // Long break 2
    B("LongBreak2", b.LongBreak2);
    I("LongBreakMins2", b.LongBreakMins2);
    I("LongLateInMins2", b.LongLateInMins2);
    B("IncLongBreak2", b.IncLongBreak2);
    T("LongBreakStart2", b.LongBreakStart2);
    B("NextLongStart2", b.NextLongStart2);
    T("LongBreakEnd2", b.LongBreakEnd2);
    B("NextLongEnd2", b.NextLongEnd2);

    // Short breaks
    I("ShortBreakMins", b.ShortBreakMins);
    I("ShortLateInMins", b.ShortLateInMins);
    B("IncShortBreak", b.IncShortBreak);
    B("ShortBreak1", b.ShortBreak1);
    T("ShortBreakStart1", b.ShortBreakStart1);
    B("NextShortStart1", b.NextShortStart1);
    T("ShortBreakEnd1", b.ShortBreakEnd1);
    B("NextShortend1", b.NextShortend1);
    B("ShortBreak2", b.ShortBreak2);
    T("ShortBreakStart2", b.ShortBreakStart2);
    B("NextShortStart2", b.NextShortStart2);
    T("ShortBreakEnd2", b.ShortBreakEnd2);
    B("NextShortend2", b.NextShortend2);
    B("ShortBreak3", b.ShortBreak3);
    T("ShortBreakStart3", b.ShortBreakStart3);
    B("NextShortStart3", b.NextShortStart3);
    T("ShortBreakEnd3", b.ShortBreakEnd3);
    B("NextShortend3", b.NextShortend3);

    // Working hours / day
    S("WorkingHours", b.WorkingHours);
    I("WorkingMins", b.WorkingMins);
    B("IncPermission", b.IncPermission);
    B("IncOnDuty", b.IncOnDuty);
    B("OTCal", b.OTCal);
    I("HalfWorkingDay", b.HalfWorkingDay);
    M("HalfWorkingDayMins", b.HalfWorkingDayMins);
    M("MinFullDay", b.MinFullDay);
    M("MinHalfDay", b.MinHalfDay);
    I("CompanyCode", companyCode);
    I("Status", toBit(b.Status));

    await r.execute("sp_Shift_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (err.message && err.message.includes("UK_")) {
      return sendError(res, "Already exist the Shift Name", 409);
    }
    console.error("DB Error (saveOrUpdateShift):", err);
    return sendError(res, err);
  }
};

// POST /shift/create
export const create = (req, res) => saveOrUpdate(req, res, false);

// PUT  /shift/update/:shiftCode
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /shift/delete/:shiftCode  -> sp_Shift_Delete
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const code = toInt(req.params.shiftCode);
    if (code <= 0) return sendError(res, "Invalid ShiftCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("ShiftCode", sql.Int, code)
      .input("CompanyCode", sql.Int, cc)
      .execute("sp_Shift_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("FK_") || err.message.includes("REFERENCE"))) {
      return sendError(res, "This Shift is in use and cannot be deleted", 409);
    }
    console.error("DB Error (deleteShift):", err);
    return sendError(res, err);
  }
};
