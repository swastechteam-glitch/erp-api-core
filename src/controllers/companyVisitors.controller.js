import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Company Visitors — Pass Entry  (port of the WinForms frmCompanyVisitorsIn)
//
//   A gate-management screen that issues an IN pass to a visitor and later
//   records their OUT time. Two modes share one form:
//     IN  -> create a new pass (auto pass number for the visiting date), capture
//            visitor + which employee they are meeting + reason + a photo.
//     OUT -> pick a still-inside pass (outtime IS NULL) and stamp the out time.
//
//   Stored-proc family (kept identical to the desktop):
//     sp_GateEntryCompanyVisitors            -> next pass number for FY/date
//     sp_GateEntryCompanyVisitors_AddEdit    -> insert/update a pass
//     sp_GateEntryCompanyVisitors_GetAll     -> one pass (header + image) for edit
//
//   Company from req.headers.companyCode, FY from req.headers.FYCode; AddEdit
//   also needs @user / @Node from req.headers.userId / nodeCode.
//
//   Endpoints
//     GET  /options              designations / meeting types / employees /
//                                existing companies + serverDate + dateConfig +
//                                the IN pass number for today
//     GET  /next-no?date=        sp_GateEntryCompanyVisitors (IN pass number)
//     GET  /pending?date=&mode=  pending grid (IN: intime null, OUT: outtime null)
//     GET  /employees?designationCode=   employees, optionally by designation
//     GET  /employee-by-id/:empId        resolve EmployeeID -> employee row
//     GET  /employee-photo/:employeeCode tbl_employee_Photo -> base64 data URL
//     GET  /record/:code         sp_GateEntryCompanyVisitors_GetAll (+ image)
//     POST /save                 sp_GateEntryCompanyVisitors_AddEdit
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getFYCode = (req) => toInt(req.headers.FYCode);

const pad2 = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const cleanYMD = (v) => (v ? String(v).slice(0, 10) : "");

// Binary photo column -> "data:image/jpeg;base64,…" (or null when empty).
const toDataUrl = (val) => {
  if (val == null) return null;
  try {
    const buf = Buffer.isBuffer(val) ? val : Buffer.from(val);
    if (!buf.length) return null;
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  } catch (_) {
    return null;
  }
};

// "data:image/…;base64,xxxx" | raw base64 -> Buffer (or null).
const toPhotoBuffer = (dataUrl) => {
  if (!dataUrl) return null;
  try {
    const base64 = String(dataUrl).includes(",")
      ? String(dataUrl).split(",")[1]
      : String(dataUrl);
    if (!base64) return null;
    return Buffer.from(base64, "base64");
  } catch (_) {
    return null;
  }
};

// Visiting-date rules (port of frmCompanyVisitorsIn.Bind_Data):
//   - max = server today
//   - when the user is NOT level 1 (admin), the desktop pins min = max = today
//     (no back/forward dating); admins are free.
// Defensive: any failure falls back to "today only, but editable".
const buildVisitDateConfig = async (pool, req) => {
  let serverDate = ymd(new Date());
  let isAdmin = true; // fail-open: only lock a user we positively confirm is limited
  try {
    const s = await pool
      .request()
      .query("SELECT CONVERT(varchar(10), GETDATE(), 23) AS ServerDate");
    const row = s.recordset?.[0];
    if (row?.ServerDate) serverDate = String(row.ServerDate).slice(0, 10);
  } catch (_) {
    /* keep default */
  }
  try {
    const u = await pool
      .request()
      .input("uid", sql.Int, toInt(req.headers.userId))
      .query("SELECT TOP 1 UserLevel FROM vw_User WHERE UserCode = @uid");
    const raw = u.recordset?.[0]?.UserLevel;
    const lvl = String(raw ?? "").trim();
    isAdmin = lvl === "" || lvl === ";" || lvl === "1" || toInt(raw) === 1;
  } catch (_) {
    /* unknown -> treat as admin (don't lock out) */
  }
  return {
    serverDate,
    minDate: isAdmin ? null : serverDate,
    maxDate: serverDate,
    enabled: isAdmin,
  };
};

// Next IN pass number for the FY + visiting date (objDScal in the desktop).
const nextPassNumber = async (pool, companyCode, fyCode, dateStr) => {
  const r = await pool
    .request()
    .input("FYCode", sql.Int, fyCode)
    .input("CompanyCode", sql.Int, companyCode)
    .input("DateofVisiting", sql.VarChar(10), dateStr)
    .execute("sp_GateEntryCompanyVisitors");
  const row = r.recordset?.[0];
  return row ? toInt(Object.values(row)[0]) : 0;
};

// Employee lookup (tbl_Employee, still-employed), optionally by designation.
// Mirrors Bind_Data / cmbDesignation_Leave.
const loadEmployees = async (pool, companyCode, designationCode) => {
  const req = pool.request().input("CompanyCode", sql.Int, companyCode);
  let q =
    "Select EmployeeName, EmployeeCode, EmployeeID, DesignationCode from tbl_Employee " +
    "WHERE DOL IS NULL AND CompanyCode = @CompanyCode";
  if (toInt(designationCode) > 0) {
    req.input("DesignationCode", sql.Int, toInt(designationCode));
    q += " AND DesignationCode = @DesignationCode";
  }
  q += " Order by EmployeeName";
  const r = await req.query(q);
  return (r.recordset || []).map((e) => ({
    value: e.EmployeeCode,
    label: e.EmployeeName,
    EmployeeCode: toInt(e.EmployeeCode),
    EmployeeName: e.EmployeeName ?? "",
    EmployeeID: e.EmployeeID ?? "",
    DesignationCode: toInt(e.DesignationCode),
  }));
};

// GET /company-visitors/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const fyCode = getFYCode(req);
    const pool = await getPool(req.headers.subdbname);

    const dateConfig = await buildVisitDateConfig(pool, req);

    const [designations, meetingTypes, companies, employees, passNumber] =
      await Promise.all([
        pool
          .request()
          .query(
            "select DesignationName, DesignationCode from tbl_Designation Order by DesignationName"
          ),
        pool
          .request()
          .query(
            "Select MeetingTypeName, MeetingTypeCode from tbl_GateEntryMeetingType Order by MeetingTypeName"
          ),
        pool
          .request()
          .input("CompanyCode", sql.Int, companyCode)
          .query(
            "select DISTINCT CompanyName from tbl_GateEntryCompanyVisitors " +
              "where CompanyCode = @CompanyCode AND CompanyName IS NOT NULL Order by CompanyName"
          ),
        loadEmployees(pool, companyCode),
        nextPassNumber(pool, companyCode, fyCode, dateConfig.serverDate),
      ]);

    return sendSuccess(res, {
      dateConfig,
      passNumber,
      designations: designations.recordset.map((r) => ({
        value: r.DesignationCode,
        label: r.DesignationName,
      })),
      meetingTypes: meetingTypes.recordset.map((r) => ({
        value: r.MeetingTypeCode,
        label: r.MeetingTypeName,
      })),
      companies: companies.recordset
        .filter((r) => (r.CompanyName ?? "").toString().trim() !== "")
        .map((r) => ({ value: r.CompanyName, label: r.CompanyName })),
      employees,
    });
  } catch (err) {
    console.error("DB Error (CompanyVisitors.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /company-visitors/next-no?date=YYYY-MM-DD
export const getNextNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const date = cleanYMD(req.query.date) || ymd(new Date());
    const no = await nextPassNumber(pool, getCompanyCode(req), getFYCode(req), date);
    return sendSuccess(res, { passNumber: no });
  } catch (err) {
    console.error("DB Error (CompanyVisitors.getNextNo):", err);
    return sendError(res, err);
  }
};

// GET /company-visitors/pending?date=YYYY-MM-DD&mode=IN|OUT
// IN  -> entries still without an in time; OUT -> entries still inside (no out time).
export const getPending = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const date = cleanYMD(req.query.date) || ymd(new Date());
    const mode = String(req.query.mode || "IN").toUpperCase();
    const nullCol = mode === "OUT" ? "outtime" : "intime";

    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("DateofVisiting", sql.VarChar(10), date)
      .query(
        "select CompanyVisitorPassCode, VisitorPassNumber as Pass, VisitorName as Name, " +
          "MobileNumber, intime, outtime from tbl_GateEntryCompanyVisitors " +
          "where CompanyCode = @CompanyCode AND CONVERT(date, DateofVisiting) = @DateofVisiting " +
          `and ${nullCol} is null order by VisitorPassNumber`
      );

    const data = (r.recordset || []).map((row) => ({
      ...row,
      id: row.CompanyVisitorPassCode,
    }));
    return sendSuccess(res, data);
  } catch (err) {
    console.error("DB Error (CompanyVisitors.getPending):", err);
    return sendError(res, err);
  }
};

// GET /company-visitors/lists?date=YYYY-MM-DD (optional)
// All visitor passes for the company (newest first) — feeds the list screen.
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const date = cleanYMD(req.query.date);

    const request = pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req));
    let where = "WHERE CompanyCode = @CompanyCode";
    if (date) {
      request.input("DateofVisiting", sql.VarChar(10), date);
      where += " AND CONVERT(date, DateofVisiting) = @DateofVisiting";
    }

    const r = await request.query(
      "select CompanyVisitorPassCode, VisitorPassNumber, VisitorName, CompanyName, MobileNumber, " +
        "EmployeeName, Reason, DateofVisiting, intime as InTime, outtime as OutTime " +
        "from tbl_GateEntryCompanyVisitors " +
        where +
        " order by DateofVisiting desc, VisitorPassNumber desc"
    );

    const data = (r.recordset || []).map((row) => ({
      ...row,
      id: row.CompanyVisitorPassCode,
      Status: (row.OutTime ?? "").toString().trim() ? "Completed" : "Inside",
    }));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (CompanyVisitors.getList):", err);
    return sendError(res, err);
  }
};

// GET /company-visitors/employees?designationCode=
export const getEmployees = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const employees = await loadEmployees(
      pool,
      getCompanyCode(req),
      req.query.designationCode
    );
    return sendSuccess(res, { employees });
  } catch (err) {
    console.error("DB Error (CompanyVisitors.getEmployees):", err);
    return sendError(res, err);
  }
};

// GET /company-visitors/employee-by-id/:empId  (port of txtEmpID_Leave)
export const getEmployeeById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const empId = toInt(req.params.empId);
    if (empId <= 0) return sendError(res, "Invalid Employee ID", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("EmployeeID", sql.Int, empId)
      .query(
        "select DesignationCode, EmployeeCode, EmployeeName, EmployeeID from tbl_Employee " +
          "Where DOL IS NULL AND CompanyCode = @CompanyCode AND EmployeeID = @EmployeeID"
      );
    const row = r.recordset?.[0];
    if (!row) return sendError(res, "Employee ID is not Found...", 404);
    return sendSuccess(res, {
      EmployeeCode: toInt(row.EmployeeCode),
      EmployeeName: row.EmployeeName ?? "",
      EmployeeID: row.EmployeeID ?? "",
      DesignationCode: toInt(row.DesignationCode),
    });
  } catch (err) {
    console.error("DB Error (CompanyVisitors.getEmployeeById):", err);
    return sendError(res, err);
  }
};

// GET /company-visitors/employee-photo/:employeeCode
export const getEmployeePhoto = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const employeeCode = toInt(req.params.employeeCode);
    if (employeeCode <= 0) return sendError(res, "Invalid Employee", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("EmployeeCode", sql.Int, employeeCode)
      .query(
        "select Photo from tbl_employee_Photo where CompanyCode = @CompanyCode AND EmployeeCode = @EmployeeCode"
      );
    return sendSuccess(res, { photo: toDataUrl(r.recordset?.[0]?.Photo) });
  } catch (err) {
    console.error("DB Error (CompanyVisitors.getEmployeePhoto):", err);
    return sendError(res, err);
  }
};

// GET /company-visitors/record/:code  (sp_GateEntryCompanyVisitors_GetAll)
export const getRecord = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (code <= 0) return sendError(res, "Invalid CompanyVisitorPassCode", 400);
    const pool = await getPool(req.headers.subdbname);

    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("CompanyVisitorPassCode", sql.Int, code)
      .execute("sp_GateEntryCompanyVisitors_GetAll");
    const row = r.recordset?.[0];
    if (!row) return sendError(res, "Company Visitor not found", 404);

    // Meeting type: the desktop only had two rows and inferred 1 (CASUAL) / 2 by
    // a name match. Prefer the real MeetingTypeCode when the SP returns it.
    const meetingTypeName = (row.MeetingTypeName ?? "").toString();
    const meetingTypeCode =
      row.MeetingTypeCode != null
        ? toInt(row.MeetingTypeCode)
        : meetingTypeName.toUpperCase().includes("CASUAL")
        ? 1
        : 2;

    return sendSuccess(res, {
      CompanyVisitorPassCode: toInt(row.CompanyVisitorPassCode),
      VisitorPassNumber: toInt(row.VisitorPassNumber),
      VisitorName: row.VisitorName ?? "",
      MobileNumber: (row.MobileNumber ?? "").toString(),
      CompanyName: row.CompanyName ?? "",
      EmployeeCode: toInt(row.EmployeeCode),
      EmployeeName: row.EmployeeName ?? "",
      Reason: (row.Reason ?? "").toString(),
      MeetingTypeCode: meetingTypeCode,
      MeetingTypeName: meetingTypeName,
      ExtraPerson: toInt(row.ExtraPerson ?? row.Extraperson),
      InTime: (row.InTime ?? "").toString(),
      OutTime: (row.OutTime ?? "").toString(),
      DateofVisiting: row.DateofVisiting,
      VisitorsImage: toDataUrl(row.VisitorsImage),
    });
  } catch (err) {
    console.error("DB Error (CompanyVisitors.getRecord):", err);
    return sendError(res, err);
  }
};

// POST /company-visitors/save  (sp_GateEntryCompanyVisitors_AddEdit)
// One endpoint for IN (insert) and OUT (update with out time), mirroring the
// single btnSave_Click in the desktop form.
export const save = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const companyCode = getCompanyCode(req);
    const fyCode = getFYCode(req);
    if (companyCode <= 0)
      return sendError(
        res,
        "You are logged in to a group of companies; switch to a single company.",
        400
      );

    const b = req.body || {};
    const mode = String(b.Mode || "IN").toUpperCase();
    const isOut = mode === "OUT";

    // ---- validation (port of btnSave_Click) ----------------------------------
    const passNumber = toInt(b.VisitorsPassNumber);
    if (passNumber <= 0) return sendError(res, "Check the Pass Number", 400);
    if (!cleanYMD(b.DateofVisiting)) return sendError(res, "Check Visiting Date", 400);

    const visitorName = (b.VisitorName || "").toString().trim();
    const companyNameNew = (b.CompanyName_New || "").toString().trim();
    const companyNameExist = (b.CompanyName || "").toString().trim();
    const companyName = companyNameNew || companyNameExist;
    const mobile = (b.MobileNumber || "").toString().trim();
    const empId = (b.EmployeeID || "").toString().trim();
    const employeeCode = toInt(b.EmployeeCode);
    const employeeName = (b.EmployeeName || "").toString().trim();
    const designationCode = toInt(b.DesignationCode);
    const meetingTypeCode = toInt(b.MeetingTypeCode);
    const reason = (b.Reason || "").toString().trim();
    const inTime = (b.InTime || "").toString().trim();
    const outTime = (b.OutTime || "").toString().trim();

    if (!isOut) {
      // IN mode captures the full visitor record; OUT only stamps the out time on
      // an already-saved pass, so the desktop disables every entry field.
      if (!visitorName) return sendError(res, "Type Visitor's Name", 400);
      if (!companyName)
        return sendError(res, "Please Select (Or) Type the Company Name...", 400);
      if (!mobile) return sendError(res, "Type Visitor's Mobile Number", 400);
      if (mobile.length !== 10)
        return sendError(res, "Please Type Valid Mobile Number", 400);
      if (!empId) return sendError(res, "Type the Employee ID", 400);
      if (designationCode <= 0) return sendError(res, "Select the Designation", 400);
      if (employeeCode <= 0) return sendError(res, "Select the Employee Name", 400);
      if (meetingTypeCode <= 0) return sendError(res, "Select the Meeting Type", 400);
      if (!reason) return sendError(res, "Type Reason for Visiting", 400);
      if (!inTime) return sendError(res, "Check the In Time", 400);
    } else {
      if (!outTime) return sendError(res, "Check the Out Time", 400);
    }

    const pool = await getPool(req.headers.subdbname);

    // Map an existing company name to a supplier (desktop tags @SupplierCode when
    // the visitor's company matches a supplier in tbl_Supplier).
    let supplierCode = 0;
    if (companyName) {
      try {
        const s = await pool
          .request()
          .input("SupplierName", sql.NVarChar, companyName)
          .query("Select SupplierCode from tbl_Supplier where SupplierName = @SupplierName");
        supplierCode = toInt(s.recordset?.[0]?.SupplierCode);
      } catch (_) {
        /* no supplier match -> leave 0 */
      }
    }

    const request = pool.request();
    const code = toInt(b.CompanyVisitorPassCode);
    if (code > 0) request.input("CompanyVisitorPassCode", sql.Int, code);
    request.input("visitorspassnumber", sql.Int, passNumber);
    request.input("visitorname", sql.NVarChar, visitorName);
    request.input("MobileNumber", sql.NVarChar, mobile);
    request.input("CompanyName", sql.NVarChar, companyName);
    request.input("EmployeeCode", sql.Int, employeeCode);
    request.input("EmployeeName", sql.NVarChar, employeeName);
    request.input("Reason", sql.NVarChar, reason);
    request.input("MeetingTypeCode", sql.Int, meetingTypeCode);
    request.input("ExtraPerson", sql.Int, toInt(b.ExtraPerson));
    // Pass the visiting date as an ISO 'YYYY-MM-DD' string — same shape the
    // desktop sent (SD(...)) and the same type used by nextPassNumber / getPending,
    // so SQL Server's date conversion is consistent and time-zone safe.
    request.input("DateofVisiting", sql.VarChar(10), cleanYMD(b.DateofVisiting));
    request.input("intime", sql.NVarChar, inTime);
    request.input("outtime", sql.NVarChar, isOut ? outTime : null);

    const photoBuf = toPhotoBuffer(b.VisitorsImage);
    if (photoBuf) request.input("VisitorsImage", sql.Image, photoBuf);
    if (supplierCode > 0) request.input("SupplierCode", sql.Int, supplierCode);

    request.input("CompanyCode", sql.Int, companyCode);
    request.input("FYCode", sql.Int, fyCode);
    request.input("user", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));

    await request.execute("sp_GateEntryCompanyVisitors_AddEdit");

    return sendSuccess(
      res,
      { CompanyVisitorPassCode: code || null },
      "Record Saved Successfully",
      code > 0 ? 200 : 201
    );
  } catch (err) {
    console.error("DB Error (CompanyVisitors.save):", err);
    return sendError(res, err);
  }
};
