import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Cotton QC Test Parameter master (port of the WinForms frmCQTParameter)
//   - List   : SELECT from tbl_CQTParameter WHERE CompanyCode = @CompanyCode
//   - Create : EXEC sp_CQTParameter_AddEdit   (without @CQTParameterCode)
//   - Update : EXEC sp_CQTParameter_AddEdit   (with @CQTParameterCode)
//   - Delete : EXEC sp_CQTParameter_Delete
// AddEdit requires @User / @Node / @CompanyCode (read from the auth token headers).
// The three radio groups are stored as separate bit columns; the React form
// sends them as single selects and we expand them here:
//   DataType    -> EntryData / Calc / Constent
//   TestResult  -> TestResult_Above / TestResult_Below
//   TestCompare -> TestCompare_STD / TestCompare_PO
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

// Collapse the separate bit columns into the single select values the form uses.
const deriveSelects = (row) => ({
  DataType: row.Constent ? "Constent" : row.Calc ? "Calculate" : "Entry",
  TestResult: row.TestResult_Below ? "Below" : "Above",
  TestCompare: row.TestCompare_PO ? "PO" : "STD",
});

// GET /cqt-parameter/lists  -> mirrors frmCQTParameterDetails list (company scoped)
export const getCQTParameterList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const companyCode = toInt(req.headers.companyCode);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();
    let query = "Select * from tbl_CQTParameter";
    if (companyCode) {
      request.input("CompanyCode", sql.Int, companyCode);
      query += " where CompanyCode = @CompanyCode";
    }

    const result = await request.query(query);

    const data = result.recordset.map((item) => ({
      ...item,
      id: item.CQTParameterCode,
      StatusText: STATUS_LABEL(item.Status),
      ...deriveSelects(item),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getCQTParameterList):", err);
    return sendError(res, err);
  }
};

// GET /cqt-parameter/list/:cqtParameterCode  -> single record
export const getCQTParameterById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.cqtParameterCode);
    if (!code) return sendError(res, "Invalid CQTParameterCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CQTParameterCode", sql.Int, code)
      .query(
        "Select * from tbl_CQTParameter where CQTParameterCode = @CQTParameterCode"
      );

    if (!result.recordset.length)
      return sendError(res, "CQT Parameter not found", 404);

    const row = result.recordset[0];
    return sendSuccess(res, {
      ...row,
      StatusText: STATUS_LABEL(row.Status),
      ...deriveSelects(row),
    });
  } catch (err) {
    console.error("DB Error (getCQTParameterById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_CQTParameter_AddEdit (btnSave_Click)
const saveOrUpdateCQTParameter = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const companyCode = toInt(req.headers.companyCode);

    const body = req.body || {};
    const name = (body.CQTParameterName || "").trim();
    const tamil = (body.CQTParameter_Tamil || "").trim();
    const orderNo = toInt(body.OrderNo);
    const cotton = toBit(body.Cotton);
    const yarn = toBit(body.Yarn);

    // Same validations the form enforces.
    if (!name)
      return sendError(res, "CQTParameter Name should not be empty", 400);
    if (!tamil)
      return sendError(res, "CQTParameter Name in Tamil should not be empty", 400);
    if (!orderNo) return sendError(res, "Enter the Order No", 400);
    if (!cotton && !yarn)
      return sendError(res, "Select the Parameter Based On Cotton Or Yarn", 400);

    // Expand the single-select radio groups into their bit columns.
    const dataType = (body.DataType || "Entry").toString();
    const testResult = (body.TestResult || "Above").toString();
    const testCompare = (body.TestCompare || "STD").toString();

    const code = isEdit
      ? parseInt(req.params.cqtParameterCode ?? body.CQTParameterCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid CQTParameterCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) request.input("CQTParameterCode", sql.Int, code);
    request.input("CQTParameterName", sql.NVarChar, name);
    request.input("CQTParameter_Tamil", sql.NVarChar, tamil);
    request.input("TestResult_Above", sql.Bit, testResult === "Above" ? 1 : 0);
    request.input("TestResult_Below", sql.Bit, testResult === "Below" ? 1 : 0);
    request.input("TestCompare_STD", sql.Bit, testCompare === "STD" ? 1 : 0);
    request.input("TestCompare_PO", sql.Bit, testCompare === "PO" ? 1 : 0);
    request.input("OrderNo", sql.Int, orderNo);
    request.input("ViewSlip", sql.Bit, toBit(body.ViewSlip));
    request.input("Cotton", sql.Bit, cotton);
    request.input("Yarn", sql.Bit, yarn);
    request.input("CompanyCode", sql.Int, companyCode);
    request.input("Constent", sql.Bit, dataType === "Constent" ? 1 : 0);
    request.input("EntryData", sql.Bit, dataType === "Entry" ? 1 : 0);
    request.input("Calc", sql.Bit, dataType === "Calculate" ? 1 : 0);
    request.input("Status", sql.Bit, toBit(body.Status));

    await request.execute("sp_CQTParameter_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_CQTParameterName")) {
      return sendError(res, "Already exist the CQTParameter Name", 409);
    }
    console.error("DB Error (saveOrUpdateCQTParameter):", err);
    return sendError(res, err);
  }
};

// POST /cqt-parameter/create        -> create
export const createCQTParameter = (req, res) =>
  saveOrUpdateCQTParameter(req, res, false);

// PUT  /cqt-parameter/update/:code  -> update
export const updateCQTParameter = (req, res) =>
  saveOrUpdateCQTParameter(req, res, true);

// DELETE /cqt-parameter/delete/:cqtParameterCode -> EXEC sp_CQTParameter_Delete
export const deleteCQTParameter = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.cqtParameterCode);
    if (!code) return sendError(res, "Invalid CQTParameterCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("CQTParameterCode", sql.Int, code)
      .execute("sp_CQTParameter_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the CQT Parameter!", 409);
    }
    console.error("DB Error (deleteCQTParameter):", err);
    return sendError(res, err);
  }
};
