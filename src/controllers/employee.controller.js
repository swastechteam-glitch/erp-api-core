import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Employee master (port of the WinForms frmEmployee / frmEmployeeDetails)
//
//   The biggest payroll master: one header (sp_Employee_AddEdit, ExecuteScalar ->
//   EmployeeCode) plus two child grids saved transactionally:
//     sp_EmployeeExp_Delete    + sp_EmployeeExp_AddEdit    (Experience grid)
//     sp_EmployeeFamily_Delete + sp_EmployeeFamily_AddEdit (Family grid)
//   List : sp_Employee_GetAll_Grid (@CompanyCode,@Emp_Status)
//   Edit : vw_Employee_New + sp_EmployeeExp_GetAll + sp_EmployeeFamily_GetAll
//   Delete: sp_Employee_Delete (@EmployeeCode)   FK -> "You can not delete the Employee !"
//
//   Company-scoped (req.headers.companyCode). user/node read from the auth token.
//   Photos / documents are SQL image columns: the React form sends base64 (or
//   omits) and we convert to Buffer (NULL when absent) — faithful to the desktop's
//   "no image" path. PayMode is stored as its first char (D/M) like the desktop.
//
//   Endpoints
//     GET    /options                       all simple lookups in one call
//     GET    /designations/:departmentCode  designations for a department
//     GET    /vehicles/:routeCode           route vehicles for a route
//     GET    /shifts/:shiftGroupCode        shifts for a shift group
//     GET    /rooms/:hostelTypeCode         rooms for a hostel type
//     GET    /districts/:stateCode          districts for a state
//     GET    /grades/:empCategoryCode       grades (with allowance template) for a category
//     GET    /next-id/:empGroupCode         next Employee ID (sp_Employee_EmployeeNo)
//     GET    /form12/:empGroupCode          next Form 12 No (sp_Employee_Form12No_BindNo)
//     GET    /lists                         sp_Employee_GetAll_Grid
//     GET    /list/:employeeCode            one employee (vw_Employee_New + children)
//     POST   /create                        sp_Employee_AddEdit (+children, txn)
//     PUT    /update/:employeeCode          sp_Employee_AddEdit (+children, txn)
//     DELETE /delete/:employeeCode          sp_Employee_Delete
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
  v === true || v === 1 || v === "1" || (typeof v === "string" && v.trim().toUpperCase() === "ACTIVE") ? 1 : 0;
const getCompanyCode = (req) => toInt(req.headers.companyCode);

const ymd = (v) => {
  if (!v) return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
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
// base64 (optionally a data: URL) -> Buffer, or null when empty.
const toImage = (v) => {
  if (!v || typeof v !== "string") return null;
  const b64 = v.includes(",") ? v.slice(v.indexOf(",") + 1) : v;
  if (!b64.trim()) return null;
  try {
    return Buffer.from(b64, "base64");
  } catch {
    return null;
  }
};

const opt = (rows, codeKey, labelKey, extra) =>
  (rows || []).map((x) => {
    const o = { value: toInt(pick(x, codeKey)), label: pick(x, labelKey) ?? "" };
    if (extra) for (const k of extra) o[k] = pick(x, k);
    return o;
  });

// GET /employee/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);
    const q = (sqlText) => pool.request().query(sqlText).then((r) => r.recordset || []);

    const [
      branches, empGroups, agents, empCategories, departments, sexes, routes,
      batches, hostelTypes, employments, shiftGroups, payTypes, weekoffs,
      states, maritals, bloodGroups, banks,
    ] = await Promise.all([
      q(`Select BranchCode, BranchName from tbl_Branch where Status = 1 AND CompanyCode = ${cc} order by BranchName`),
      q(`Select EmpGroupCode, EmpGroupName from tbl_EmpGroup where Status = 1 order by EmpGroupName`),
      q(`Select AgentCode, AgentName from tbl_Agent where Status = 1 AND HR = 1`),
      q(`Select EmpCategoryCode, EmpCategoryName from tbl_EmpCategory where Status = 1`),
      q(`Select DepartmentCode, DepartmentName_English from tbl_Department where Status = 1 AND HR = 1 order by DepartmentName_English`),
      q(`Select SexCode, SexName from tbl_Sex`),
      q(`Select RouteCode, RouteName from tbl_Route where Status = 1 order by RouteName`),
      q(`Select EmployeeBatchCode, EmployeeBatchName from tbl_EmployeeBatch where Status = 1`),
      q(`Select HostelTypeCode, HostelTypeName from tbl_HostelType where Status = 1`),
      q(`Select EmploymentCode, EmploymentName from tbl_Employment where Status = 1 order by EmploymentName`),
      q(`Select ShiftGroupCode, ShiftGroupName, Rotation from tbl_ShiftGroup where Status = 1 AND CompanyCode = ${cc}`),
      q(`Select PayTypeCode, PayTypeName from tbl_PayType where Status = 1`),
      q(`Select WeekCode, WeekDayName from tbl_WeekDay`),
      q(`Select StateCode, StateName from tbl_State`),
      q(`Select MaritalCode, Marital from tbl_Marital`),
      q(`Select BloodGroupCode, BloodGroup from tbl_BloodGroup where Status = 1`),
      q(`Select BankCode, BankName from tbl_Bank where Status = 1 order by BankName`),
    ]);

    return sendSuccess(res, {
      branches: opt(branches, "BranchCode", "BranchName"),
      empGroups: opt(empGroups, "EmpGroupCode", "EmpGroupName"),
      agents: opt(agents, "AgentCode", "AgentName"),
      empCategories: opt(empCategories, "EmpCategoryCode", "EmpCategoryName"),
      departments: opt(departments, "DepartmentCode", "DepartmentName_English"),
      sexes: opt(sexes, "SexCode", "SexName"),
      routes: opt(routes, "RouteCode", "RouteName"),
      batches: opt(batches, "EmployeeBatchCode", "EmployeeBatchName"),
      hostelTypes: opt(hostelTypes, "HostelTypeCode", "HostelTypeName"),
      employments: opt(employments, "EmploymentCode", "EmploymentName"),
      shiftGroups: opt(shiftGroups, "ShiftGroupCode", "ShiftGroupName", ["Rotation"]),
      payTypes: opt(payTypes, "PayTypeCode", "PayTypeName"),
      weekoffs: opt(weekoffs, "WeekCode", "WeekDayName"),
      states: opt(states, "StateCode", "StateName"),
      maritals: opt(maritals, "MaritalCode", "Marital"),
      bloodGroups: opt(bloodGroups, "BloodGroupCode", "BloodGroup"),
      banks: opt(banks, "BankCode", "BankName"),
      payModes: [
        { value: "DAY", label: "DAY" },
        { value: "MONTH", label: "MONTH" },
      ],
    });
  } catch (err) {
    console.error("DB Error (Employee.getOptions):", err);
    return sendError(res, err);
  }
};

const dependent = (sqlText, codeKey, labelKey, extra) => async (req, res, paramName) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params[paramName]);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool.request().input("p", sql.Int, code).query(sqlText);
    return sendSuccess(res, opt(r.recordset, codeKey, labelKey, extra));
  } catch (err) {
    console.error("DB Error (Employee.dependent):", err);
    return sendError(res, err);
  }
};

export const getDesignations = (req, res) =>
  dependent(
    "Select DesignationCode, DesignationName from tbl_Designation where Status = 1 AND DepartmentCode = @p order by DesignationName",
    "DesignationCode",
    "DesignationName"
  )(req, res, "departmentCode");

export const getVehicles = (req, res) =>
  dependent(
    "Select VehicleCode, VehicleName from tbl_Route_Vehicle where RouteCode = @p",
    "VehicleCode",
    "VehicleName"
  )(req, res, "routeCode");

export const getShifts = (req, res) =>
  dependent(
    `Select ShiftCode, ShiftName from tbl_Shift where ShiftGroupCode = @p`,
    "ShiftCode",
    "ShiftName"
  )(req, res, "shiftGroupCode");

export const getRooms = (req, res) =>
  dependent(
    "Select RoomCode, RoomNo from tbl_Room where HostelTypeCode = @p",
    "RoomCode",
    "RoomNo"
  )(req, res, "hostelTypeCode");

export const getDistricts = (req, res) =>
  dependent(
    "Select DistrictCode, DistrictName from tbl_District where Status = 1 AND StateCode = @p order by DistrictName",
    "DistrictCode",
    "DistrictName"
  )(req, res, "stateCode");

// Grades carry the allowance template so the form can auto-fill the pay structure.
const GRADE_EXTRA = [
  "Salary", "PFSalary", "Sal_BasicPer", "Basic", "Sal_DAPer", "DA", "Sal_HRAPer", "HRA",
  "Sal_TAPer", "TA", "Sal_ConveyancePer", "Conveyance", "Sal_SpecialAllowancePer",
  "SpecialAllowance", "Sal_WashingAllowancePer", "WashingAllowance",
  "Sal_OtherAllowancePer", "OtherAllowance", "AllowManual",
];
export const getGrades = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const empCategoryCode = toInt(req.params.empCategoryCode);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("EmpCategoryCode", sql.Int, empCategoryCode)
      .input("CompanyCode", sql.Int, cc)
      .query(
        `Select GradeCode, GradeName, ${GRADE_EXTRA.join(", ")} from vw_Grade
         where EmpCategoryCode = @EmpCategoryCode AND CompanyCode = @CompanyCode order by GradeName`
      );
    return sendSuccess(res, opt(r.recordset, "GradeCode", "GradeName", GRADE_EXTRA));
  } catch (err) {
    console.error("DB Error (Employee.getGrades):", err);
    return sendError(res, err);
  }
};

// GET /employee/next-id/:empGroupCode  -> sp_Employee_EmployeeNo
export const getNextId = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("EmpGroupCode", sql.Int, toInt(req.params.empGroupCode))
      .execute("sp_Employee_EmployeeNo");
    const row = r.recordset?.[0];
    const val = row ? row[Object.keys(row)[0]] : "";
    return sendSuccess(res, { employeeId: toInt(val) });
  } catch (err) {
    console.error("DB Error (Employee.getNextId):", err);
    return sendError(res, err);
  }
};

// GET /employee/form12/:empGroupCode  -> sp_Employee_Form12No_BindNo
export const getForm12No = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("EmpGroupCode", sql.Int, toInt(req.params.empGroupCode))
      .execute("sp_Employee_Form12No_BindNo");
    const row = r.recordset?.[0];
    const val = row ? row[Object.keys(row)[0]] : "";
    return sendSuccess(res, { form12No: toInt(val) });
  } catch (err) {
    console.error("DB Error (Employee.getForm12No):", err);
    return sendError(res, err);
  }
};

// GET /employee/lists  -> sp_Employee_GetAll_Grid
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const empStatus = req.query.status === undefined ? 1 : toBit(req.query.status);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("Emp_Status", sql.Bit, empStatus)
      .execute("sp_Employee_GetAll_Grid");
    const data = (r.recordset || []).map((row) => ({
      ...row,
      id: toInt(pick(row, "EmployeeCode")),
      EmployeeCode: toInt(pick(row, "EmployeeCode")),
      EmployeeID: pick(row, "EmployeeID", "str_EmployeeID") ?? "",
      EmployeeName: pick(row, "EmployeeName") ?? "",
      DepartmentName: pick(row, "DepartmentName_English", "DepartmentName") ?? "",
      DesignationName: pick(row, "DesignationName") ?? "",
      LeaveStatus: pick(row, "LeaveStatus", "Status") ?? "",
    }));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (Employee.getList):", err);
    return sendError(res, err);
  }
};

const DATE_FIELDS = [
  "DateOfBirth", "DateOfJoining", "DOL", "PFDOJ", "ExpiryDate",
  "FitnessCertificateValidFrom", "FitnessCertificateValidTo",
];

// GET /employee/list/:employeeCode  -> vw_Employee_New + experience + family
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.employeeCode);
    if (code <= 0) return sendError(res, "Invalid EmployeeCode", 400);
    const cc = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    const head = await pool
      .request()
      .input("CompanyCode", sql.Int, cc)
      .input("EmployeeCode", sql.Int, code)
      .query("Select * from vw_Employee_New where CompanyCode = @CompanyCode AND EmployeeCode = @EmployeeCode");
    if (!head.recordset.length) return sendError(res, "Employee not found", 404);
    const row = { ...head.recordset[0] };

    for (const f of DATE_FIELDS) {
      const v = pick(row, f);
      if (v !== undefined) row[f] = ymd(v);
    }
    // PayMode is stored as its first char (D / M) -> expand for the dropdown.
    const pm = String(pick(row, "PayMode") ?? "").trim().toUpperCase();
    row.PayMode = pm.startsWith("D") ? "DAY" : pm.startsWith("M") ? "MONTH" : "";

    const exp = await pool
      .request()
      .input("CompanyCode", sql.Int, cc)
      .input("EmployeeCode", sql.Int, code)
      .execute("sp_EmployeeExp_GetAll");
    const fam = await pool
      .request()
      .input("EmployeeCode", sql.Int, code)
      .execute("sp_EmployeeFamily_GetAll");

    row.experiences = (exp.recordset || []).map((e) => ({
      Company: pick(e, "Company") ?? "",
      Designation: pick(e, "Designation") ?? "",
      Years: pick(e, "Years") ?? "",
      LastSalary: pick(e, "LastSalary") ?? "",
      FromDate: ymd(pick(e, "FromDate")),
      ToDate: ymd(pick(e, "ToDate")),
    }));
    row.families = (fam.recordset || []).map((f) => ({
      Name: pick(f, "Name") ?? "",
      Relation: pick(f, "Relation") ?? "",
      DOB: ymd(pick(f, "DOB")),
      Age: pick(f, "Age") ?? "",
      Remarks: pick(f, "Remarks") ?? "",
      Nominee: toBit(pick(f, "Nominee")) ? 1 : 0,
    }));

    return sendSuccess(res, row);
  } catch (err) {
    console.error("DB Error (Employee.getById):", err);
    return sendError(res, err);
  }
};

const saveOrUpdate = async (req, res, isEdit) => {
  let transaction;
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

    // ---- validation (port of btnSave_Click, same order/messages) -----------
    if (toInt(b.BranchCode) <= 0) return sendError(res, "Select the Branch Name.....", 400);
    if (toInt(b.EmployeeBatchCode) <= 0) return sendError(res, "Select the Employee Batch", 400);
    if (toInt(b.EmpGroupCode) <= 0) return sendError(res, "Select the Employee Group", 400);
    if (toInt(b.EmployeeID) <= 0) return sendError(res, "Employee ID should not be empty", 400);
    if (!(b.EmployeeName || "").trim()) return sendError(res, "Employee Name should not be empty", 400);
    if (toInt(b.AgentCode) <= 0) return sendError(res, "Select the Agent Name", 400);
    if (toInt(b.EmpCategoryCode) <= 0) return sendError(res, "Select the Employee Category", 400);
    if (toInt(b.DepartmentCode) <= 0) return sendError(res, "Select the Department", 400);
    if (toInt(b.DesignationCode) <= 0) return sendError(res, "Select the Designation", 400);
    if (toInt(b.SexCode) <= 0) return sendError(res, "Select the Sex", 400);
    if (toInt(b.RouteCode) <= 0) return sendError(res, "Select the Route.....", 400);
    if (toInt(b.VehicleCode) <= 0) return sendError(res, "Select the Vehicle.....", 400);
    if (toInt(b.ShiftGroupCode) <= 0) return sendError(res, "Select the Shift Group..", 400);
    if (toInt(b.ShiftCode) <= 0) return sendError(res, "Select the Shift..", 400);
    const payModeText = String(b.PayMode || "").trim().toUpperCase();
    if (!payModeText || payModeText === "--SELECT--") return sendError(res, "Select the Pay Mode", 400);
    if (toInt(b.PayTypeCode) <= 0) return sendError(res, "Select the PayType", 400);
    if (toInt(b.GradeCode) <= 0) return sendError(res, "Select the Grade", 400);
    if (toInt(b.StateCode) <= 0) return sendError(res, "Select the State", 400);
    if (toInt(b.MaritalCode) <= 0) return sendError(res, "Select the Marital", 400);
    if (toInt(b.BloodGroupCode) <= 0) return sendError(res, "Select the Blood Group", 400);
    if (!ymd(b.DateofBirth)) return sendError(res, "Enter the Date of Birth", 400);
    if (toInt(b.Age) <= 0) return sendError(res, "Enter the Age....", 400);
    if (!(b.Address1 || "").trim()) return sendError(res, "Enter the Address1....", 400);
    if (toInt(b.BankCode) <= 0) return sendError(res, "Select the Bank", 400);
    if (toInt(b.DistrictCode) <= 0) return sendError(res, "Select the District......", 400);

    // PF Salary must equal the sum of allowances (desktop guard).
    const allow =
      toNum(b.EmpBasic) + toNum(b.DA) + toNum(b.HRA) + toNum(b.TA) + toNum(b.Conveyance) +
      toNum(b.SpecialAllowance) + toNum(b.WashingAllowance) + toNum(b.OtherAllowance);
    if (Math.round(toNum(b.PFSalary) * 100) !== Math.round(allow * 100))
      return sendError(res, "PF Salary and Allowances Mismatch.....", 400);

    const code = isEdit ? toInt(req.params.employeeCode ?? b.EmployeeCode) : 0;
    if (isEdit && !code) return sendError(res, "Invalid EmployeeCode for update", 400);

    const pool = await getPool(req.headers.subdbname);

    // Shift rotation comes from the chosen shift group (desktop reads ColData).
    const sg = await pool
      .request()
      .input("ShiftGroupCode", sql.Int, toInt(b.ShiftGroupCode))
      .query("Select Rotation from tbl_ShiftGroup where ShiftGroupCode = @ShiftGroupCode");
    const rotation = sg.recordset?.[0] ? pick(sg.recordset[0], "Rotation") : null;

    transaction = pool.transaction();
    await transaction.begin();

    const r = transaction.request();
    r.input("CompanyCode", sql.Int, companyCode);
    if (isEdit) {
      r.input("E_User", sql.Int, parseInt(userId));
      r.input("E_Node", sql.Int, parseInt(nodeCode));
      r.input("EmployeeCode", sql.Int, code);
    } else {
      r.input("C_User", sql.Int, parseInt(userId));
      r.input("C_Node", sql.Int, parseInt(nodeCode));
    }

    const S = (n, v) => r.input(n, sql.NVarChar, v == null ? "" : String(v));
    const I = (n, v) => r.input(n, sql.Int, toInt(v));
    const D = (n, v) => r.input(n, sql.Decimal(18, 2), toNum(v));
    const B = (n, v) => r.input(n, sql.Bit, toBit(v));

    I("EmpGroupCode", b.EmpGroupCode);
    I("EmployeeID", b.EmployeeID);
    S("EmployeeName", (b.EmployeeName || "").trim());
    S("TamilName", (b.TamilName || "").trim() || (b.EmployeeName || "").trim());
    I("DepartmentCode", b.DepartmentCode);
    I("AgentCode", b.AgentCode);
    I("EmpCategoryCode", b.EmpCategoryCode);
    I("DesignationCode", b.DesignationCode);
    I("WorkLoadCode", b.WorkLoadCode);
    I("EmploymentCode", b.EmploymentCode);
    I("GradeCode", b.GradeCode);
    I("SexCode", b.SexCode);
    r.input("ShiftType", sql.NVarChar, rotation == null ? "" : String(rotation));
    I("ShiftGroupCode", b.ShiftGroupCode);
    I("ShiftCode", b.ShiftCode);
    I("WeekCode1", 0);
    I("WeekCode2", 0);
    I("MachineNo", b.MachineNo);
    B("CalculateAttendance", b.CalculateAttendance);
    B("CalculateOT", b.CalculateOT);
    I("Emp_Status", toBit(b.Emp_Status));
    r.input("DateofBirth", sql.VarChar(10), ymd(b.DateofBirth));
    r.input("DateOfJoining", sql.VarChar(10), ymd(b.DateOfJoining));
    if (ymd(b.DOL)) r.input("DOL", sql.VarChar(10), ymd(b.DOL));
    D("Mess", b.Mess);
    D("Tea", b.Tea);
    D("Insurance", b.Insurance);
    D("Incentive", b.Incentive);
    S("FatherName", (b.FatherName || "").trim());
    S("MotherName", (b.MotherName || "").trim());
    S("Address1", (b.Address1 || "").trim());
    S("Address2", (b.Address2 || "").trim());
    S("City", (b.City || "").trim());
    S("District", (b.District || "").trim());
    I("DistrictCode", b.DistrictCode);
    I("StateCode", b.StateCode);
    I("PinCode", b.PinCode);
    S("PhoneNo", (b.PhoneNo || "").trim());
    I("MaritalCode", b.MaritalCode);
    I("Children", b.Children);
    I("BloodGroupCode", b.BloodGroupCode);
    S("Nationality", (b.Nationality || "").trim());
    S("Community", (b.Community || "").trim());
    S("Qualification", (b.Qualification || "").trim());
    S("YearOfPass", (b.YearOfPass || "").trim());
    D("Percentage", b.Percentage);
    S("Class", (b.Class || "").trim());
    S("School", (b.School || "").trim());
    D("YearOfExp", b.YearOfExp);
    r.input("PayMode", sql.NVarChar, payModeText.slice(0, 1)); // D / M
    D("Salary", b.Salary);
    D("OTSalary", b.OTSalary);
    I("PayTypeCode", b.PayTypeCode);
    S("PassportNo", (b.PassportNo || "").trim());
    I("BranchCode", b.BranchCode);
    I("RouteCode", b.RouteCode);
    I("VehicleCode", b.VehicleCode);
    I("WeekCode", b.WeekCode);
    S("Height", (b.Height || "").toString().trim());
    S("Weight", (b.Weight || "").toString().trim());
    S("AlternatePhoneNo", (b.AlternatePhoneNo || "").toString().trim());
    S("Form12No", (b.Form12No || "").toString().trim());
    B("Father", b.Father);
    B("PhysicalFitness", b.PhysicalFitness);
    S("PhysicalRemarks", (b.PhysicalRemarks || "").trim());
    if (ymd(b.ExpiryDate)) r.input("ExpiryDate", sql.VarChar(10), ymd(b.ExpiryDate));
    S("PANNo", (b.PANNo || "").trim());

    // images (NULL when absent)
    r.input("Photo", sql.VarBinary(sql.MAX), toImage(b.Photo));
    r.input("VisitorPhoto", sql.VarBinary(sql.MAX), toImage(b.VisitorPhoto));
    r.input("Document1", sql.VarBinary(sql.MAX), toImage(b.Document1));
    r.input("Document2", sql.VarBinary(sql.MAX), toImage(b.Document2));
    r.input("Document3", sql.VarBinary(sql.MAX), toImage(b.Document3));

    D("EmpBasic", b.EmpBasic);
    D("DA", b.DA);
    D("HRA", b.HRA);
    D("TA", b.TA);
    D("Conveyance", b.Conveyance);
    D("SpecialAllowance", b.SpecialAllowance);
    D("WashingAllowance", b.WashingAllowance);
    D("OtherAllowance", b.OtherAllowance);
    D("PF", b.PF);
    D("FixedPF", b.FixedPF);
    D("ESI", b.ESI);
    D("VPF", b.VPF);
    B("ABRY", b.ABRY);
    D("EmpUnion", b.EmpUnion);
    D("LIC", b.LIC);
    D("TDS", b.TDS);
    D("RD", b.RD);
    D("LWF", b.LWF);
    D("ClubHouse", b.ClubHouse);
    B("ProffessionalTax", b.ProffessionalTax);
    I("BankCode", b.BankCode);
    S("ACNo", (b.ACNo || "").trim());
    S("FPFNo", (b.FPFNo || "").trim());
    S("TANNo", (b.TANNo || "").trim());
    S("PFNo", (b.PFNo || "").trim());
    if (ymd(b.PFDOJ)) r.input("PFDOJ", sql.VarChar(10), ymd(b.PFDOJ));
    S("ESINo", (b.ESINo || "").trim());
    if ((b.ESIName || "").trim()) r.input("ESIName", sql.NVarChar, (b.ESIName || "").trim());
    S("LICNo", (b.LICNo || "").trim());
    S("SSIDNo", (b.SSIDNo || "").trim());
    I("Approval", 0);
    I("Age", b.Age);
    I("RefEmpID", b.RefEmpID);
    S("IFSCCode", (b.IFSCCode || "").trim());
    S("BankBranchName", (b.BankBranchName || "").trim());
    D("Sal_BasicPer", b.Sal_BasicPer);
    D("Sal_DAPer", b.Sal_DAPer);
    D("Sal_HRAPer", b.Sal_HRAPer);
    D("Sal_TAPer", b.Sal_TAPer);
    D("Sal_ConveyancePer", b.Sal_ConveyancePer);
    D("Sal_SpecialAllowancePer", b.Sal_SpecialAllowancePer);
    D("Sal_WashingAllowancePer", b.Sal_WashingAllowancePer);
    D("Sal_OtherAllowancePer", b.Sal_OtherAllowancePer);
    I("MessDays", toInt(b.MessDays) <= 0 ? 1 : toInt(b.MessDays));
    B("FixedWorkingDays", b.FixedWorkingDays);
    B("AboveFixedDays_Incentive", b.AboveFixedDays_Incentive);
    I("IncentiveDays", toInt(b.IncentiveDays) <= 0 ? 1 : toInt(b.IncentiveDays));
    S("AadharNo", (b.AadharNo || "").trim());
    D("Bus", b.Bus);
    D("Refreshment", b.Refreshment);
    D("Aminity", b.Aminity);
    D("MonthIncentive", b.MonthIncentive);
    D("MonthIncentiveAboveDays", b.MonthIncentiveAboveDays);
    D("MonthIncentive1", b.MonthIncentive1);
    D("MonthIncentiveAboveDays1", b.MonthIncentiveAboveDays1);
    S("Emergency_Cont_Name", (b.Emergency_Cont_Name || "").trim());
    S("Emergency_Cont_No", (b.Emergency_Cont_No || "").trim());
    S("Emergency_Cont_Relationship", (b.Emergency_Cont_Relationship || "").trim());
    D("PFSalary", b.PFSalary);
    I("EmployeeBatchCode", b.EmployeeBatchCode);
    S("RoomNo", (b.RoomNo || "").trim());
    B("MessAllowance", b.MessAllowance);
    I("HostelTypeCode", b.HostelTypeCode);
    I("RoomCode", b.RoomCode);

    const fitness = String(b.FitnessCertificateStatus || "No");
    r.input("FitnessCertificateStatus", sql.NVarChar, fitness);
    if (fitness === "Yes") {
      I("FitnessCertificateNo", b.FitnessCertificateNo);
      r.input("FitnessCertificateValidFrom", sql.VarChar(10), ymd(b.FitnessCertificateValidFrom));
      r.input("FitnessCertificateValidTo", sql.VarChar(10), ymd(b.FitnessCertificateValidTo));
    }

    const headResult = await r.execute("sp_Employee_AddEdit");
    // ExecuteScalar -> first column of first row is the EmployeeCode.
    let empCode = code;
    const scalarRow = headResult.recordset?.[0];
    if (scalarRow) empCode = toInt(scalarRow[Object.keys(scalarRow)[0]]) || code;

    // ---- Experience grid (delete-all then insert selected) -----------------
    await transaction
      .request()
      .input("EmployeeCode", sql.Int, empCode)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_EmployeeExp_Delete");
    for (const e of Array.isArray(b.experiences) ? b.experiences : []) {
      if (!(e.Company || "").trim()) continue;
      await transaction
        .request()
        .input("EmployeeCode", sql.Int, empCode)
        .input("Company", sql.NVarChar, (e.Company || "").trim())
        .input("Designation", sql.NVarChar, (e.Designation || "").trim())
        .input("Years", sql.NVarChar, (e.Years ?? "").toString().trim())
        .input("LastSalary", sql.Decimal(18, 2), toNum(e.LastSalary))
        .input("FromDate", sql.VarChar(10), ymd(e.FromDate))
        .input("ToDate", sql.VarChar(10), ymd(e.ToDate))
        .input("CompanyCode", sql.Int, companyCode)
        .execute("sp_EmployeeExp_AddEdit");
    }

    // ---- Family grid (delete-all then insert) ------------------------------
    await transaction
      .request()
      .input("EmployeeCode", sql.Int, empCode)
      .execute("sp_EmployeeFamily_Delete");
    for (const f of Array.isArray(b.families) ? b.families : []) {
      if (!(f.Name || "").trim()) continue;
      await transaction
        .request()
        .input("EmployeeCode", sql.Int, empCode)
        .input("Name", sql.NVarChar, (f.Name || "").trim())
        .input("Relation", sql.NVarChar, (f.Relation || "").trim())
        .input("DOB", sql.VarChar(10), ymd(f.DOB))
        .input("Age", sql.NVarChar, (f.Age ?? "").toString().trim())
        .input("Remarks", sql.NVarChar, (f.Remarks || "").trim())
        .input("Nominee", sql.Bit, toBit(f.Nominee))
        .execute("sp_EmployeeFamily_AddEdit");
    }

    await transaction.commit();
    return sendSuccess(
      res,
      { employeeCode: empCode },
      isEdit ? "Record Updated Successfully" : "Record Saved Successfully",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch {
        /* ignore */
      }
    }
    if (err.message && err.message.includes("UK_tbl_Employee")) {
      return sendError(res, "Already Exist the Employee ID", 409);
    }
    console.error("DB Error (saveOrUpdateEmployee):", err);
    return sendError(res, err);
  }
};

// POST /employee/create
export const create = (req, res) => saveOrUpdate(req, res, false);

// PUT  /employee/update/:employeeCode
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /employee/delete/:employeeCode  -> sp_Employee_Delete
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.employeeCode);
    if (code <= 0) return sendError(res, "Invalid EmployeeCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool.request().input("EmployeeCode", sql.Int, code).execute("sp_Employee_Delete");
    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("FK_") || err.message.includes("REFERENCE"))) {
      return sendError(res, "You can not delete the Employee !", 409);
    }
    console.error("DB Error (deleteEmployee):", err);
    return sendError(res, err);
  }
};
