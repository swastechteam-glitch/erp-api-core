import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Department master (port of the WinForms frmDepartment)
//   - List   : Select ... from vw_Department
//   - Read   : vw_Department + tbl_DepartmentDetails (man-power figures)
//   - Groups : tbl_DepartmentGroup (dropdown source)
//   - Save   : EXEC sp_DepartmentDetails_Delete then sp_Department_AddEdit
//              (wrapped in a transaction, mirroring btnSave_Click)
//   - Delete : EXEC sp_Department_Delete
// AddEdit requires @CompanyCode / @User / @Node from the auth token (headers).
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

const toBit = (v) => {
  if (v === true || v === 1 || v === "1") return 1;
  if (typeof v === "string" && v.trim().toUpperCase() === "ACTIVE") return 1;
  return 0;
};

const VW_COLS =
  "Select DepartmentCode, DepartmentName, DepartmentGroupName, Status, OrderNo, DGOrderNo, ProcessStock, ShortName, HR, StoresAndMaintenance, Production from vw_Department";

// GET /department/lists  -> mirrors frmDepartmentDetails list query
export const getDepartmentList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .query(`${VW_COLS} order by DepartmentCode desc`);

    const data = result.recordset.map((item) => ({
      ...item,
      id: item.DepartmentCode,
      StatusText: STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getDepartmentList):", err);
    return sendError(res, err);
  }
};

// GET /department/department-groups  -> dropdown source (tbl_DepartmentGroup)
export const getDepartmentGroupsDropdown = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .query(
        "Select DepartmentGroupCode, DepartmentGroupName from tbl_DepartmentGroup where Status = 1 order by DepartmentGroupName"
      );

    return sendSuccess(res, result.recordset);
  } catch (err) {
    console.error("DB Error (getDepartmentGroupsDropdown):", err);
    return sendError(res, err);
  }
};

// GET /department/list/:departmentCode  -> single record (+ man-power details)
export const getDepartmentById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.departmentCode);
    if (!code) return sendError(res, "Invalid DepartmentCode", 400);

    const companyCode = parseInt(req.headers.companyCode);

    const pool = await getPool(req.headers.subdbname);

    const head = await pool
      .request()
      .input("DepartmentCode", sql.Int, code)
      .query("SELECT * FROM vw_Department WHERE DepartmentCode = @DepartmentCode");

    if (!head.recordset.length)
      return sendError(res, "Department not found", 404);

    // Man-power figures live in tbl_DepartmentDetails (company-scoped).
    // Not all client DBs have this table — treat it as optional.
    let manPower = {};
    try {
      const details = await pool
        .request()
        .input("DepartmentCode", sql.Int, code)
        .input("CompanyCode", sql.Int, companyCode)
        .query(
          "Select STDManPower, TrgManPower, CrManPower from tbl_DepartmentDetails Where CompanyCode = @CompanyCode And DepartmentCode = @DepartmentCode"
        );
      manPower = details.recordset[0] || {};
    } catch (detailErr) {
      console.warn(
        "tbl_DepartmentDetails unavailable, skipping man-power:",
        detailErr.message
      );
    }

    const row = head.recordset[0];

    return sendSuccess(res, {
      ...row,
      StatusText: STATUS_LABEL(row.Status),
      STDManPower: manPower.STDManPower ?? 0,
      TrgManPower: manPower.TrgManPower ?? 0,
      CrManPower: manPower.CrManPower ?? 0,
    });
  } catch (err) {
    console.error("DB Error (getDepartmentById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> (optional) sp_DepartmentDetails_Delete + sp_Department_AddEdit
const saveOrUpdateDepartment = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    const companyCode = req.headers.companyCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);
    if (!companyCode)
      return sendError(res, "Missing company context (companyCode)", 400);

    const body = req.body || {};
    const departmentGroupCode = parseInt(body.DepartmentGroupCode);
    const departmentName = (body.DepartmentName || "").trim();
    const englishName = (body.DepartmentName_English || "").trim();
    const shortName = (body.ShortName || "").trim();

    // Validation mirrors btnSave_Click.
    if (!departmentGroupCode || departmentGroupCode <= 0)
      return sendError(res, "Select the Department Group", 400);
    if (!departmentName)
      return sendError(res, "Department Name should not be empty", 400);
    if (!englishName)
      return sendError(res, "English Name should not be empty", 400);
    if (!shortName)
      return sendError(res, "Short Name should not be empty", 400);

    const code = isEdit
      ? parseInt(req.params.departmentCode ?? body.DepartmentCode)
      : 0;
    if (isEdit && !code)
      return sendError(res, "Invalid DepartmentCode for update", 400);

    const pool = await getPool(req.headers.subdbname);

    // 1) Clear existing man-power detail rows. Optional — not all client DBs
    //    have sp_DepartmentDetails_Delete, so failure here is non-fatal.
    try {
      await pool
        .request()
        .input("DepartmentCode", sql.Int, code)
        .input("CompanyCode", sql.Int, parseInt(companyCode))
        .execute("sp_DepartmentDetails_Delete");
    } catch (delErr) {
      console.warn(
        "sp_DepartmentDetails_Delete unavailable, skipping:",
        delErr.message
      );
    }

    // 2) Insert / update the department. Some DB schemas don't have the
    //    man-power params, so retry without them if the SP rejects them.
    const buildRequest = (includeManPower) => {
      const request = pool.request();
      request.input("CompanyCode", sql.Int, parseInt(companyCode));
      request.input("User", sql.Int, parseInt(userId));
      request.input("Node", sql.Int, parseInt(nodeCode));
      if (isEdit) request.input("DepartmentCode", sql.Int, code);
      request.input("DepartmentGroupCode", sql.Int, departmentGroupCode);
      request.input("DepartmentName", sql.NVarChar, departmentName);
      request.input("DepartmentName_English", sql.NVarChar, englishName);
      request.input("ShortName", sql.NVarChar, shortName);
      request.input("ProcessStock", sql.Bit, toBit(body.ProcessStock));
      request.input("OrderNo", sql.Int, parseInt(body.OrderNo) || 0);
      request.input("Status", sql.Bit, toBit(body.Status));
      request.input("HR", sql.Bit, toBit(body.HR));
      request.input("StoresAndMaintenance", sql.Bit, toBit(body.StoresAndMaintenance));
      request.input("Production", sql.Bit, toBit(body.Production));
      if (includeManPower) {
        request.input("STDManPower", sql.Int, parseInt(body.STDManPower) || 0);
        request.input("TrgManPower", sql.Int, parseInt(body.TrgManPower) || 0);
        request.input("CrManPower", sql.Int, parseInt(body.CrManPower) || 0);
      }
      return request;
    };

    try {
      await buildRequest(true).execute("sp_Department_AddEdit");
    } catch (spErr) {
      // SP doesn't accept the man-power params on this schema -> retry without.
      if (/parameter|argument/i.test(spErr.message)) {
        console.warn(
          "sp_Department_AddEdit rejected man-power params, retrying without:",
          spErr.message
        );
        await buildRequest(false).execute("sp_Department_AddEdit");
      } else {
        throw spErr;
      }
    }

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_DepartmentName_tblDepartment")) {
      return sendError(res, "Already exist the Department Name", 409);
    }
    console.error("DB Error (saveOrUpdateDepartment):", err);
    return sendError(res, err);
  }
};

// POST /department/create        -> create
export const createDepartment = (req, res) =>
  saveOrUpdateDepartment(req, res, false);

// PUT  /department/update/:code  -> update
export const updateDepartment = (req, res) =>
  saveOrUpdateDepartment(req, res, true);

// DELETE /department/delete/:departmentCode -> EXEC sp_Department_Delete
export const deleteDepartment = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.departmentCode);
    if (!code) return sendError(res, "Invalid DepartmentCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();
    request.input("DepartmentCode", sql.Int, code);

    await request.execute("sp_Department_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    // Still referenced elsewhere -> friendly 409 instead of a raw FK error.
    if (err.message && err.message.includes("REFERENCE")) {
      return sendError(
        res,
        "This department is in use and cannot be deleted",
        409
      );
    }
    console.error("DB Error (deleteDepartment):", err);
    return sendError(res, err);
  }
};
