import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Holiday master (port of the WinForms frmHoliday / frmHolidayDetails)
//
//   A holiday: HolidayName + HolidayDate + Staff/Worker flags + Status, plus a
//   multi-select of Employee Groups (tbl_EmpGroup) it applies to — saved as a
//   detail row per selected group (just like Grade's department workload).
//
//   Stored procs (kept identical to the desktop):
//     sp_Holiday_AddEdit       -> insert/update, returns HolidayCode (scalar)
//                                 create @C_User/@C_Node, edit @E_User/@E_Node + @HolidayCode
//     sp_HolidayDetails_Delete -> clears the holiday's emp-group rows (@HolidayCode)
//     sp_Holiday_Insert        -> one row per selected EmpGroup (@HolidayCode,@EmpGroupCode)
//     sp_Holiday_GetAll        -> list (@CompanyCode)
//     sp_Holiday_Delete        -> delete (@HolidayCode,@CompanyCode)
//   Lookups: tbl_EmpGroup. Edit detail source: vw_HoliDayDetails.
//
//   Company from req.headers.companyCode; AddEdit needs user/node:
//   create -> @C_User/@C_Node, edit -> @E_User/@E_Node (req.headers.userId / nodeCode).
//
//   Endpoints
//     GET    /options             employee groups (checkbox grid)
//     GET    /lists               sp_Holiday_GetAll for the company
//     GET    /record/:code        one holiday (header + selected emp groups)
//     POST   /create              transactional AddEdit -> Delete -> Insert(per group)
//     PUT    /update/:code        same, edit mode
//     DELETE /delete/:code        sp_Holiday_Delete
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const toBit = (v) =>
  v === true || v === 1 || v === "1" || (typeof v === "string" && v.trim().toUpperCase() === "ACTIVE")
    ? 1
    : 0;
const getCompanyCode = (req) => toInt(req.headers.companyCode);

// SQL date/Date -> "YYYY-MM-DD" (UTC midnight, so no timezone day-shift).
const ymd = (v) => {
  if (!v) return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
};
// "YYYY-MM-DD" -> "DD-MM-YYYY" for list display.
const dmy = (v) => {
  const s = ymd(v);
  if (!s) return "";
  const [y, m, d] = s.split("-");
  return `${d}-${m}-${y}`;
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

const scalar = async (request, proc) => {
  const r = await request.execute(proc);
  const row = r.recordset?.[0];
  return row ? toInt(Object.values(row)[0]) : 0;
};

// GET /holiday/options  -> employee groups (cmb grid source: tbl_EmpGroup)
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .query("Select EmpGroupCode, EmpGroupName from tbl_EmpGroup order by EmpGroupCode");
    return sendSuccess(res, {
      empGroups: (r.recordset || []).map((x) => ({
        EmpGroupCode: toInt(x.EmpGroupCode),
        EmpGroupName: x.EmpGroupName ?? "",
      })),
    });
  } catch (err) {
    console.error("DB Error (Holiday.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /holiday/lists  -> sp_Holiday_GetAll @CompanyCode
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_Holiday_GetAll");

    const data = (r.recordset || []).map((row) => {
      const code = toInt(pick(row, "HolidayCode"));
      return {
        ...row,
        id: code,
        HolidayCode: code,
        HolidayName: pick(row, "HolidayName") ?? "",
        HolidayDate: dmy(pick(row, "HolidayDate")),
        Staff: toBit(pick(row, "Staff")) ? "Yes" : "No",
        Worker: toBit(pick(row, "Worker", "Workers")) ? "Yes" : "No",
        Status: toBit(pick(row, "Status")) ? "ACTIVE" : "INACTIVE",
      };
    });
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (Holiday.getList):", err);
    return sendError(res, err);
  }
};

// GET /holiday/record/:code  -> one holiday (header + selected emp groups).
// Header derived from sp_Holiday_GetAll (the desktop edits off that grid row);
// selected groups from vw_HoliDayDetails.
export const getRecord = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (code <= 0) return sendError(res, "Invalid HolidayCode", 400);
    const companyCode = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_Holiday_GetAll");
    const row = (r.recordset || []).find((x) => toInt(pick(x, "HolidayCode")) === code);
    if (!row) return sendError(res, "Holiday not found", 404);

    // Selected employee groups for this holiday.
    let details = [];
    try {
      const d = await pool
        .request()
        .input("HolidayCode", sql.Int, code)
        .query("Select EmpGroupCode, EmpGroupName from vw_HoliDayDetails Where HolidayCode = @HolidayCode");
      details = (d.recordset || []).map((x) => toInt(x.EmpGroupCode)).filter((c) => c > 0);
    } catch (_) {
      /* details optional */
    }

    return sendSuccess(res, {
      HolidayCode: code,
      HolidayName: pick(row, "HolidayName") ?? "",
      HolidayDate: ymd(pick(row, "HolidayDate")),
      Staff: toBit(pick(row, "Staff")),
      Worker: toBit(pick(row, "Worker", "Workers")),
      Status: toBit(pick(row, "Status")),
      details,
    });
  } catch (err) {
    console.error("DB Error (Holiday.getRecord):", err);
    return sendError(res, err);
  }
};

const saveOrUpdate = async (req, res, isEdit) => {
  let tx;
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
    const holidayName = (b.HolidayName || "").toString().trim();
    if (!holidayName) return sendError(res, "Holiday Name should not be empty", 400);

    const holidayDate = ymd(b.HolidayDate);
    if (!holidayDate) return sendError(res, "Holiday Date should not be empty", 400);

    const groups = (Array.isArray(b.details) ? b.details : [])
      .map((g) => toInt(g))
      .filter((c) => c > 0);

    const pool = await getPool(req.headers.subdbname);
    tx = new sql.Transaction(pool);
    await tx.begin();

    const head = new sql.Request(tx);
    if (isEdit) {
      head.input("E_User", sql.Int, parseInt(userId));
      head.input("E_Node", sql.Int, parseInt(nodeCode));
      head.input("HolidayCode", sql.Int, toInt(req.params.code));
    } else {
      head.input("C_User", sql.Int, parseInt(userId));
      head.input("C_Node", sql.Int, parseInt(nodeCode));
    }
    head.input("HolidayName", sql.NVarChar, holidayName);
    head.input("HolidayDate", sql.VarChar(10), holidayDate);
    head.input("Staff", sql.Bit, toBit(b.Staff));
    head.input("Worker", sql.Bit, toBit(b.Worker));
    head.input("CompanyCode", sql.Int, companyCode);
    head.input("Status", sql.Int, toBit(b.Status));

    const holidayCode = await scalar(head, "sp_Holiday_AddEdit");

    await new sql.Request(tx)
      .input("HolidayCode", sql.Int, holidayCode)
      .execute("sp_HolidayDetails_Delete");

    for (const empGroupCode of groups) {
      await new sql.Request(tx)
        .input("HolidayCode", sql.Int, holidayCode)
        .input("EmpGroupCode", sql.Int, empGroupCode)
        .execute("sp_Holiday_Insert");
    }

    await tx.commit();
    return sendSuccess(
      res,
      { HolidayCode: holidayCode },
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (tx) {
      try {
        await tx.rollback();
      } catch (_) {}
    }
    if (err.message && err.message.includes("UK_"))
      return sendError(res, "Already exist the Holiday Name", 409);
    console.error("DB Error (Holiday.saveOrUpdate):", err);
    return sendError(res, err);
  }
};

export const create = (req, res) => saveOrUpdate(req, res, false);
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /holiday/delete/:code  -> sp_Holiday_Delete (@HolidayCode,@CompanyCode)
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (code <= 0) return sendError(res, "Invalid HolidayCode", 400);
    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("HolidayCode", sql.Int, code)
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_Holiday_Delete");
    return sendSuccess(res, { HolidayCode: code }, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("FK_") || err.message.includes("REFERENCE")))
      return sendError(res, "You can not delete the Holiday !", 409);
    console.error("DB Error (Holiday.remove):", err);
    return sendError(res, err);
  }
};
