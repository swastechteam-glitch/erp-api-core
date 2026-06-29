import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Vehicle IN / OUT — Pass Entry  (port of the WinForms frmVehicleInOut)
//
//   Tracks a company vehicle leaving and returning. Two modes share one form:
//     OUT : a NEW pass — the vehicle leaves. Pick the vehicle, opening KM (auto
//           from its last closing reading), driver employee, reason. Out Time is
//           stamped; In Time stays NULL (the pass is now "pending"/out).
//     IN  : COMPLETE a pending pass — the vehicle returns. Pick it from the
//           Pending Entries grid, enter closing KM (Running KM = closing-opening)
//           and the In Time is stamped.
//
//   Stored-proc family (kept identical to the desktop):
//     sp_GateEntryVehicleInOut_BindNo      -> next pass number for FY/date
//     sp_GateEntryVehicleInOut_AddEdit     -> insert/update a pass
//     sp_GateEntryVehicleInOut_GetAll      -> one pass (header + image) for edit
//
//   Company from req.headers.companyCode, FY from req.headers.FYCode; AddEdit
//   also needs @user / @Node from req.headers.userId / nodeCode.
//
//   Endpoints
//     GET  /options                 designations / employees / vehicles +
//                                   serverDate + dateConfig + next pass number
//     GET  /next-no?date=           sp_GateEntryVehicleInOut_BindNo
//     GET  /pending                 vw_GateEntryVehicleInOut WHERE InTime IS NULL
//     GET  /lists                   all passes (newest first) for the list screen
//     GET  /employees?designationCode=  employees, optionally by designation
//     GET  /employee-by-id/:empId   resolve EmployeeID -> employee row
//     GET  /employee-photo/:employeeCode  tbl_employee_Photo -> base64
//     GET  /vehicle-opening/:vehicleCode  MAX(ClosingReading) -> opening KM
//     GET  /record/:code            sp_GateEntryVehicleInOut_GetAll (+ image)
//     POST /save                    sp_GateEntryVehicleInOut_AddEdit
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getFYCode = (req) => toInt(req.headers.FYCode);

const pad2 = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const cleanYMD = (v) => (v ? String(v).slice(0, 10) : "");

// Binary photo/image column -> "data:image/jpeg;base64,…" (or null when empty).
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

// Pass-date rules (port of frmVehicleInOut_Load): max = server today; non-admins
// (UserLevel <> 1) are pinned to today. Defensive: fall back to "today, editable".
const buildPassDateConfig = async (pool, req) => {
  let serverDate = ymd(new Date());
  let isAdmin = true;
  try {
    const s = await pool
      .request()
      .query("SELECT CONVERT(varchar(10), GETDATE(), 23) AS ServerDate");
    if (s.recordset?.[0]?.ServerDate) serverDate = String(s.recordset[0].ServerDate).slice(0, 10);
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
    /* unknown -> admin */
  }
  return {
    serverDate,
    minDate: isAdmin ? null : serverDate,
    maxDate: serverDate,
    enabled: isAdmin,
  };
};

// Next pass number for the FY + pass date (objDScal in the desktop).
const nextPassNumber = async (pool, companyCode, fyCode, dateStr) => {
  const r = await pool
    .request()
    .input("FYCode", sql.Int, fyCode)
    .input("CompanyCode", sql.Int, companyCode)
    .input("VehiclePassDate", sql.VarChar(10), dateStr)
    .execute("sp_GateEntryVehicleInOut_BindNo");
  const row = r.recordset?.[0];
  return row ? toInt(Object.values(row)[0]) : 0;
};

// Employee lookup (tbl_Employee, still-employed), optionally by designation.
const loadEmployees = async (pool, companyCode, designationCode) => {
  const req = pool.request().input("CompanyCode", sql.Int, companyCode);
  let q =
    "Select EmployeeName, EmployeeCode, EmployeeID, DesignationCode from tbl_Employee " +
    "WHERE DOL IS NULL AND CompanyCode = @CompanyCode";
  if (toInt(designationCode) > 0) {
    req.input("DesignationCode", sql.Int, toInt(designationCode));
    q += " AND DesignationCode = @DesignationCode";
  }
  q += " Order by EmployeeID";
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

// Active company vehicles for the dropdown. Using the full active list (not the
// out-filtered SP) so an already-out vehicle still resolves to its name when an
// IN/edit record loads. Mirrors the desktop's tbl_Vehicle branch.
const loadVehicles = async (pool, companyCode) => {
  const r = await pool
    .request()
    .input("CompanyCode", sql.Int, companyCode)
    .query(
      "Select VehicleName, VehicleCode from tbl_Vehicle " +
        "Where VehicleTypeCode = 1 AND UsageTypeCode = 1 AND Status = 1 AND CompanyCode = @CompanyCode " +
        "Order by VehicleName"
    );
  return (r.recordset || []).map((v) => ({
    value: v.VehicleCode,
    label: v.VehicleName,
    VehicleCode: toInt(v.VehicleCode),
    VehicleName: v.VehicleName ?? "",
  }));
};

// GET /vehicle-in-out/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const fyCode = getFYCode(req);
    const pool = await getPool(req.headers.subdbname);

    const dateConfig = await buildPassDateConfig(pool, req);

    const [designations, employees, vehicles, passNumber] = await Promise.all([
      pool
        .request()
        .query("Select DesignationName, DesignationCode from tbl_Designation Order by DesignationName"),
      loadEmployees(pool, companyCode),
      loadVehicles(pool, companyCode),
      nextPassNumber(pool, companyCode, fyCode, dateConfig.serverDate),
    ]);

    return sendSuccess(res, {
      dateConfig,
      passNumber,
      designations: designations.recordset.map((r) => ({
        value: r.DesignationCode,
        label: r.DesignationName,
      })),
      employees,
      vehicles,
    });
  } catch (err) {
    console.error("DB Error (VehicleInOut.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /vehicle-in-out/next-no?date=YYYY-MM-DD
export const getNextNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const date = cleanYMD(req.query.date) || ymd(new Date());
    const no = await nextPassNumber(pool, getCompanyCode(req), getFYCode(req), date);
    return sendSuccess(res, { passNumber: no });
  } catch (err) {
    console.error("DB Error (VehicleInOut.getNextNo):", err);
    return sendError(res, err);
  }
};

// GET /vehicle-in-out/pending  -> vehicles currently out (InTime IS NULL)
export const getPending = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .query(
        "select VehiclePassnumber as PassNo, VehicleName as VehicleNo, Reason, InTime, OutTime, VehicleInOutPassCode " +
          "from vw_GateEntryVehicleInOut where CompanyCode = @CompanyCode and InTime is null " +
          "Order By VehiclePassnumber DESC"
      );
    const data = (r.recordset || []).map((row) => ({ ...row, id: row.VehicleInOutPassCode }));
    return sendSuccess(res, data);
  } catch (err) {
    console.error("DB Error (VehicleInOut.getPending):", err);
    return sendError(res, err);
  }
};

// GET /vehicle-in-out/lists  -> all passes for the company (newest first)
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .query(
        "select VehicleInOutPassCode, VehiclePassnumber, VehiclePassDate, VehicleName, " +
          "OpeningReading, ClosingReading, RunningKM, Reason, InTime, OutTime " +
          "from vw_GateEntryVehicleInOut where CompanyCode = @CompanyCode " +
          "order by VehiclePassDate desc, VehiclePassnumber desc"
      );
    const data = (r.recordset || []).map((row) => ({
      ...row,
      id: row.VehicleInOutPassCode,
      Status: (row.InTime ?? "").toString().trim() ? "Returned" : "Out",
    }));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (VehicleInOut.getList):", err);
    return sendError(res, err);
  }
};

// GET /vehicle-in-out/employees?designationCode=
export const getEmployees = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const employees = await loadEmployees(pool, getCompanyCode(req), req.query.designationCode);
    return sendSuccess(res, { employees });
  } catch (err) {
    console.error("DB Error (VehicleInOut.getEmployees):", err);
    return sendError(res, err);
  }
};

// GET /vehicle-in-out/employee-by-id/:empId  (port of txtEmpID_Leave)
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
    console.error("DB Error (VehicleInOut.getEmployeeById):", err);
    return sendError(res, err);
  }
};

// GET /vehicle-in-out/employee-photo/:employeeCode
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
    console.error("DB Error (VehicleInOut.getEmployeePhoto):", err);
    return sendError(res, err);
  }
};

// GET /vehicle-in-out/vehicle-opening/:vehicleCode
// Opening KM = the vehicle's last recorded ClosingReading (cmbVehicleNo change).
export const getVehicleOpening = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const vehicleCode = toInt(req.params.vehicleCode);
    if (vehicleCode <= 0) return sendError(res, "Invalid Vehicle", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("VehicleCode", sql.Int, vehicleCode)
      .query(
        "SELECT MAX(ClosingReading) AS ClosingReading FROM tbl_GateEntryVehicleInOut " +
          "WHERE CompanyCode = @CompanyCode AND VehicleCode = @VehicleCode"
      );
    const val = r.recordset?.[0]?.ClosingReading;
    return sendSuccess(res, { openingKM: val == null ? null : toNum(val) });
  } catch (err) {
    console.error("DB Error (VehicleInOut.getVehicleOpening):", err);
    return sendError(res, err);
  }
};

// GET /vehicle-in-out/record/:code  (sp_GateEntryVehicleInOut_GetAll)
export const getRecord = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (code <= 0) return sendError(res, "Invalid VehicleInOutPassCode", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("VehicleInOutPassCode", sql.Int, code)
      .execute("sp_GateEntryVehicleInOut_GetAll");
    const row = r.recordset?.[0];
    if (!row) return sendError(res, "Vehicle pass not found", 404);

    return sendSuccess(res, {
      VehicleInOutPassCode: toInt(row.VehicleInOutPassCode),
      VehiclePassNumber: toInt(row.VehiclePassNumber),
      VehicleCode: toInt(row.VehicleCode),
      VehicleName: row.VehicleName ?? "",
      EmployeeCode: toInt(row.EmployeeCode),
      EmployeeName: row.EmployeeName ?? "",
      OpeningReading: toNum(row.OpeningReading),
      ClosingReading: toNum(row.ClosingReading),
      RunningKM: toNum(row.RunningKM),
      Reason: (row.Reason ?? "").toString(),
      VehiclePassDate: row.VehiclePassDate,
      InTime: (row.InTime ?? "").toString(),
      OutTime: (row.OutTime ?? "").toString(),
      VehicleImage: toDataUrl(row.VehicleImage),
    });
  } catch (err) {
    console.error("DB Error (VehicleInOut.getRecord):", err);
    return sendError(res, err);
  }
};

// POST /vehicle-in-out/save  (sp_GateEntryVehicleInOut_AddEdit)
// OUT = new exit (InTime NULL, OutTime now); IN = return (InTime now, OutTime kept).
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
      return sendError(res, "You are logged in to a group of companies; switch to a single company.", 400);

    const b = req.body || {};
    const mode = String(b.Mode || "OUT").toUpperCase();
    const isIn = mode === "IN";

    const vehicleCode = toInt(b.VehicleCode);
    const openingKM = toNum(b.OpeningReading);
    const closingKM = toNum(b.ClosingReading);
    const passNumber = toInt(b.VehiclePassNumber);
    const designationCode = toInt(b.DesignationCode);
    const employeeCode = toInt(b.EmployeeCode);
    const inTime = (b.InTime || "").toString().trim();
    const outTime = (b.OutTime || "").toString().trim();

    // ---- validation (port of btnSave_Click) --------------------------------
    if (vehicleCode <= 0) return sendError(res, "Select the Vehicle No", 400);
    if (openingKM <= 0) return sendError(res, "Please Check Opening KM", 400);
    if (isIn && closingKM <= openingKM) return sendError(res, "Please Check Closing KM", 400);
    if (passNumber <= 0) return sendError(res, "Check the Pass Number....", 400);
    if (!cleanYMD(b.VehiclePassDate)) return sendError(res, "Check Date", 400);
    if (designationCode <= 0) return sendError(res, "Type the Employee ID", 400);
    if (employeeCode <= 0) return sendError(res, "Type the Employee ID", 400);

    const runningKM = isIn ? Math.max(0, closingKM - openingKM) : toNum(b.RunningKM);

    const pool = await getPool(req.headers.subdbname);

    const request = pool.request();
    const code = toInt(b.VehicleInOutPassCode);
    if (code > 0) request.input("VehicleInOutPassCode", sql.Int, code);
    request.input("VehiclePassNumber", sql.Int, passNumber);
    request.input("VehiclePassDate", sql.VarChar(10), cleanYMD(b.VehiclePassDate));
    request.input("VehicleCode", sql.Int, vehicleCode);
    request.input("EmployeeCode", sql.Int, employeeCode);
    request.input("OpeningReading", sql.Decimal(18, 2), openingKM);
    request.input("ClosingReading", sql.Decimal(18, 2), isIn ? closingKM : 0);
    request.input("RunningKM", sql.Decimal(18, 2), runningKM);
    request.input("Reason", sql.NVarChar, (b.Reason || "").toString().trim());
    // OUT: a fresh exit — InTime NULL, OutTime now.
    // IN : the return — InTime now, OutTime preserved from when it left.
    request.input("Intime", sql.NVarChar, isIn ? inTime : null);
    request.input("Outtime", sql.NVarChar, outTime);

    const photoBuf = toPhotoBuffer(b.VehicleImage);
    if (photoBuf) request.input("VehicleImage", sql.Image, photoBuf);

    request.input("CompanyCode", sql.Int, companyCode);
    request.input("FYCode", sql.Int, fyCode);
    request.input("user", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));

    await request.execute("sp_GateEntryVehicleInOut_AddEdit");

    return sendSuccess(
      res,
      { VehicleInOutPassCode: code || null },
      "Record Saved Successfully",
      code > 0 ? 200 : 201
    );
  } catch (err) {
    console.error("DB Error (VehicleInOut.save):", err);
    return sendError(res, err);
  }
};
