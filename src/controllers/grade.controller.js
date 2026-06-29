import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Grade — Payroll Master  (port of the WinForms frmGrade / frmGradeDetails)
//
//   A pay grade: Grade Group + Category + day band (From/To), a base salary
//   (A/C Salary = PFSalary) split into components — Basic / DA / HRA / TA /
//   Conveyance / Special / Washing / Other — each stored as a percentage AND the
//   resulting amount (amount = PFSalary * percent / 100). Plus Loyalty, Incentive,
//   Allow Manual, Status, and a per-Department Work Load grid.
//
//   Stored procs (kept identical to the desktop):
//     sp_Grade_AddEdit        -> insert/update, returns GradeCode (scalar)
//     sp_GradeDetails_Delete  -> clears the grade's per-department workload rows
//     sp_GradeDetails_Insert  -> one row per department (Work Load)
//     sp_Grade_Delete         -> delete a grade
//   Lookups: tbl_GradeGroup, tbl_EmpCategory, tbl_Department.  List: VW_Grade.
//
//   Company from req.headers.companyCode; AddEdit needs user/node:
//   create -> @C_User/@C_Node, edit -> @E_User/@E_Node (req.headers.userId / nodeCode).
//
//   Endpoints
//     GET    /options        gradeGroups / categories / departments
//     GET    /lists          VW_Grade for the company
//     GET    /record/:code   one grade (all fields + department workloads)
//     POST   /create         transactional AddEdit -> Delete -> Insert(per dept)
//     PUT    /update/:code   same, edit mode
//     DELETE /delete/:code   sp_Grade_Delete
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};
const toBit = (v) => (v === true || v === 1 || v === "1" || v === "ACTIVE" ? 1 : 0);
const getCompanyCode = (req) => toInt(req.headers.companyCode);

const scalar = async (request, proc) => {
  const r = await request.execute(proc);
  const row = r.recordset?.[0];
  return row ? toInt(Object.values(row)[0]) : 0;
};

// GET /grade/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const [groups, categories, departments] = await Promise.all([
      pool
        .request()
        .query("Select GradeGroupCode, GradeGroupName From tbl_GradeGroup WHERE Status = 1 ORDER BY GradeGroupName"),
      pool
        .request()
        .query("Select EmpCategoryCode, EmpCategoryName from tbl_EmpCategory WHERE Status = 1 ORDER BY EmpCategoryName"),
      pool
        .request()
        .query("SELECT DepartmentCode, DepartmentName FROM tbl_Department WHERE Status = 1 ORDER BY DepartmentName"),
    ]);
    return sendSuccess(res, {
      gradeGroups: groups.recordset.map((r) => ({ value: r.GradeGroupCode, label: r.GradeGroupName })),
      categories: categories.recordset.map((r) => ({ value: r.EmpCategoryCode, label: r.EmpCategoryName })),
      departments: departments.recordset.map((r) => ({
        DepartmentCode: toInt(r.DepartmentCode),
        DepartmentName: r.DepartmentName ?? "",
      })),
    });
  } catch (err) {
    console.error("DB Error (Grade.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /grade/lists
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .query(
        "Select GradeCode, GradeName, GradeGroupName, EmpCategoryName, Salary, PFSalary, Status " +
          "from VW_Grade WHERE CompanyCode = @CompanyCode ORDER BY GradeName"
      );
    const data = (r.recordset || []).map((row) => ({
      ...row,
      id: row.GradeCode,
      Status: toBit(row.Status) ? "ACTIVE" : "INACTIVE",
    }));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (Grade.getList):", err);
    return sendError(res, err);
  }
};

// GET /grade/record/:code
export const getRecord = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (code <= 0) return sendError(res, "Invalid GradeCode", 400);
    const companyCode = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("GradeCode", sql.Int, code)
      .query("Select * from VW_Grade WHERE CompanyCode = @CompanyCode AND GradeCode = @GradeCode");
    const row = r.recordset?.[0];
    if (!row) return sendError(res, "Grade not found", 404);

    // Per-department workload rows for this grade.
    let details = [];
    try {
      const d = await pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("GradeCode", sql.Int, code)
        .query("Select DepartmentCode, WorkLoad from tbl_GradeDetails WHERE CompanyCode = @CompanyCode AND GradeCode = @GradeCode");
      details = (d.recordset || []).map((x) => ({
        DepartmentCode: toInt(x.DepartmentCode),
        WorkLoad: toNum(x.WorkLoad),
      }));
    } catch (_) {
      /* details optional */
    }

    return sendSuccess(res, {
      GradeCode: toInt(row.GradeCode),
      GradeGroupCode: toInt(row.GradeGroupCode),
      GradeName: row.GradeName ?? "",
      EmpCategoryCode: toInt(row.EmpCategoryCode),
      FromDay: toNum(row.FromDay),
      ToDay: toNum(row.ToDay),
      Salary: toNum(row.Salary),
      PFSalary: toNum(row.PFSalary),
      Sal_BasicPer: toNum(row.Sal_BasicPer),
      Basic: toNum(row.Basic),
      Sal_DAPer: toNum(row.Sal_DAPer),
      DA: toNum(row.DA),
      Sal_HRAPer: toNum(row.Sal_HRAPer),
      HRA: toNum(row.HRA),
      Sal_TAPer: toNum(row.Sal_TAPer),
      TA: toNum(row.TA),
      Sal_ConveyancePer: toNum(row.Sal_ConveyancePer),
      Conveyance: toNum(row.Conveyance),
      Sal_SpecialAllowancePer: toNum(row.Sal_SpecialAllowancePer),
      SpecialAllowance: toNum(row.SpecialAllowance),
      Sal_WashingAllowancePer: toNum(row.Sal_WashingAllowancePer),
      WashingAllowance: toNum(row.WashingAllowance),
      Sal_OtherAllowancePer: toNum(row.Sal_OtherAllowancePer),
      OtherAllowance: toNum(row.OtherAllowance),
      Loylity: toNum(row.Loylity),
      Incentive: toNum(row.Incentive),
      AllowManual: toBit(row.AllowManual),
      Status: toBit(row.Status) ? "ACTIVE" : "INACTIVE",
      details,
    });
  } catch (err) {
    console.error("DB Error (Grade.getRecord):", err);
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

    // ---- validation (port of btnSave_Click) --------------------------------
    if (toInt(b.GradeGroupCode) <= 0) return sendError(res, "Please choose the Group Name", 400);
    const gradeName = (b.GradeName || "").toString().trim();
    if (!gradeName) return sendError(res, "Grade Name should not be empty", 400);
    if (toInt(b.EmpCategoryCode) <= 0) return sendError(res, "Please choose the category", 400);
    if (toNum(b.FromDay) <= 0) return sendError(res, "From Day should not be empty", 400);
    if (toNum(b.ToDay) <= 0) return sendError(res, "To Day should not be empty", 400);
    if (toNum(b.FromDay) > toNum(b.ToDay))
      return sendError(res, "To Day should not greater than From Day", 400);

    const pfSalary = toNum(b.PFSalary);
    const allow =
      toNum(b.Basic) + toNum(b.DA) + toNum(b.HRA) + toNum(b.TA) +
      toNum(b.Conveyance) + toNum(b.SpecialAllowance) + toNum(b.WashingAllowance) + toNum(b.OtherAllowance);
    if (Math.round(pfSalary * 100) !== Math.round(allow * 100))
      return sendError(res, "PF Salary and Allowances Mismatch...", 400);

    const details = (Array.isArray(b.details) ? b.details : []).filter((d) => toInt(d.DepartmentCode) > 0);

    const pool = await getPool(req.headers.subdbname);
    tx = new sql.Transaction(pool);
    await tx.begin();

    const head = new sql.Request(tx);
    if (isEdit) {
      head.input("E_User", sql.Int, parseInt(userId));
      head.input("E_Node", sql.Int, parseInt(nodeCode));
      head.input("GradeCode", sql.Int, toInt(req.params.code));
    } else {
      head.input("C_User", sql.Int, parseInt(userId));
      head.input("C_Node", sql.Int, parseInt(nodeCode));
    }
    head.input("GradeGroupCode", sql.Int, toInt(b.GradeGroupCode));
    head.input("GradeName", sql.NVarChar, gradeName);
    head.input("Sal_BasicPer", sql.Decimal(18, 2), toNum(b.Sal_BasicPer));
    head.input("Basic", sql.Decimal(18, 2), toNum(b.Basic));
    head.input("Salary", sql.Decimal(18, 2), toNum(b.Salary));
    head.input("PFSalary", sql.Decimal(18, 2), pfSalary);
    head.input("Sal_DAPer", sql.Decimal(18, 2), toNum(b.Sal_DAPer));
    head.input("DA", sql.Decimal(18, 2), toNum(b.DA));
    head.input("Sal_HRAPer", sql.Decimal(18, 2), toNum(b.Sal_HRAPer));
    head.input("HRA", sql.Decimal(18, 2), toNum(b.HRA));
    head.input("Sal_TAPer", sql.Decimal(18, 2), toNum(b.Sal_TAPer));
    head.input("TA", sql.Decimal(18, 2), toNum(b.TA));
    head.input("Sal_ConveyancePer", sql.Decimal(18, 2), toNum(b.Sal_ConveyancePer));
    head.input("Conveyance", sql.Decimal(18, 2), toNum(b.Conveyance));
    head.input("Sal_SpecialAllowancePer", sql.Decimal(18, 2), toNum(b.Sal_SpecialAllowancePer));
    head.input("SpecialAllowance", sql.Decimal(18, 2), toNum(b.SpecialAllowance));
    head.input("Sal_WashingAllowancePer", sql.Decimal(18, 2), toNum(b.Sal_WashingAllowancePer));
    head.input("WashingAllowance", sql.Decimal(18, 2), toNum(b.WashingAllowance));
    head.input("Sal_OtherAllowancePer", sql.Decimal(18, 2), toNum(b.Sal_OtherAllowancePer));
    head.input("OtherAllowance", sql.Decimal(18, 2), toNum(b.OtherAllowance));
    head.input("Incentive", sql.Decimal(18, 2), toNum(b.Incentive));
    head.input("Loylity", sql.Decimal(18, 2), toNum(b.Loylity));
    head.input("FromDay", sql.Int, toNum(b.FromDay));
    head.input("ToDay", sql.Int, toNum(b.ToDay));
    head.input("WorkLoad", sql.Int, 0);
    head.input("EmpCategoryCode", sql.Int, toInt(b.EmpCategoryCode));
    head.input("CompanyCode", sql.Int, companyCode);
    head.input("AllowManual", sql.Int, toBit(b.AllowManual));
    head.input("Status", sql.Int, toBit(b.Status));

    const gradeCode = await scalar(head, "sp_Grade_AddEdit");

    await new sql.Request(tx)
      .input("GradeCode", sql.Int, gradeCode)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_GradeDetails_Delete");

    for (const d of details) {
      await new sql.Request(tx)
        .input("GradeCode", sql.Int, gradeCode)
        .input("CompanyCode", sql.Int, companyCode)
        .input("DepartmentCode", sql.Int, toInt(d.DepartmentCode))
        .input("WorkLoad", sql.Int, toNum(d.WorkLoad))
        .execute("sp_GradeDetails_Insert");
    }

    await tx.commit();
    return sendSuccess(
      res,
      { GradeCode: gradeCode },
      isEdit ? "Record Updated Successfully" : "Record Saved Successfully",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (tx) {
      try {
        await tx.rollback();
      } catch (_) {}
    }
    if (err.message && err.message.includes("UK_"))
      return sendError(res, "Already Exist this Grade", 409);
    console.error("DB Error (Grade.saveOrUpdate):", err);
    return sendError(res, err);
  }
};

export const create = (req, res) => saveOrUpdate(req, res, false);
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /grade/delete/:code
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (code <= 0) return sendError(res, "Invalid GradeCode", 400);
    const pool = await getPool(req.headers.subdbname);
    await pool.request().input("GradeCode", sql.Int, code).execute("sp_Grade_Delete");
    return sendSuccess(res, { GradeCode: code }, "The record is deleted");
  } catch (err) {
    if (err.message && err.message.includes("FK_"))
      return sendError(res, "You can not delete this Grade", 409);
    console.error("DB Error (Grade.remove):", err);
    return sendError(res, err);
  }
};
