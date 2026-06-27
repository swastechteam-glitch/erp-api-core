import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";
import { isDuplicateByGetAll } from "../utils/duplicateCheck.js";

// ---------------------------------------------------------------------------
// Generator Machine Group master (port of WinForms frmGeneratorMachineGroup / Details)
//   - List   : EXEC sp_GeneratorMachineGroup_GetAll   @CompanyCode
//   - Create : EXEC sp_GeneratorMachineGroup_AddEdit  (without @GeneratorMachineGroupCode)
//   - Update : EXEC sp_GeneratorMachineGroup_AddEdit  (with @GeneratorMachineGroupCode)
//   - Delete : EXEC sp_GeneratorMachineGroup_Delete   @GeneratorMachineGroupCode
// AddEdit requires @User / @Node (auth token headers); GetAll / AddEdit are
// company-scoped via @CompanyCode (int_CompanyCode).
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

// Accepts true / 1 / "1" / "ACTIVE" as active, everything else inactive.
const toStatusBit = (status) => {
  if (status === true || status === 1 || status === "1") return 1;
  if (typeof status === "string" && status.trim().toUpperCase() === "ACTIVE")
    return 1;
  return 0;
};

// GET /generator-machine-group/lists  -> EXEC sp_GeneratorMachineGroup_GetAll @CompanyCode
export const getGeneratorMachineGroupList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const companyCode = parseInt(req.headers.companyCode);
    if (!companyCode) return sendError(res, "Missing company context", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_GeneratorMachineGroup_GetAll");

    const data = result.recordset
      // Newest first (the SP doesn't guarantee order, so sort here).
      .sort((a, b) => b.GeneratorMachineGroupCode - a.GeneratorMachineGroupCode)
      .map((item) => ({
        ...item,
        id: item.GeneratorMachineGroupCode,
        StatusText: STATUS_LABEL(item.Status),
      }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getGeneratorMachineGroupList):", err);
    return sendError(res, err);
  }
};

// GET /generator-machine-group/list/:generatorMachineGroupCode  -> single record
export const getGeneratorMachineGroupById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const companyCode = parseInt(req.headers.companyCode);
    if (!companyCode) return sendError(res, "Missing company context", 400);

    const code = parseInt(req.params.generatorMachineGroupCode);
    if (!code) return sendError(res, "Invalid GeneratorMachineGroupCode", 400);

    const pool = await getPool(req.headers.subdbname);
    // No single-row SP exists; filter the GetAll result.
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_GeneratorMachineGroup_GetAll");
    const row = result.recordset.find(
      (r) => r.GeneratorMachineGroupCode === code
    );

    if (!row) return sendError(res, "Generator Machine Group not found", 404);

    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getGeneratorMachineGroupById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_GeneratorMachineGroup_AddEdit (btnSave_Click)
const saveOrUpdateGeneratorMachineGroup = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    const companyCode = parseInt(req.headers.companyCode);
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);
    if (!companyCode) return sendError(res, "Missing company context", 400);

    const body = req.body || {};
    const name = (body.GeneratorMachineGroupName || "").trim();

    // Same validation the form enforces: name is mandatory.
    if (!name)
      return sendError(
        res,
        "GENERATOR MACHINE GROUP NAME should not be empty",
        400
      );

    const description = (body.Description || "").trim();
    const multipleFactor = Number(body.MultipleFactor) || 0;

    const code = isEdit
      ? parseInt(req.params.generatorMachineGroupCode ?? body.GeneratorMachineGroupCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid GeneratorMachineGroupCode for update", 400);

    const pool = await getPool(req.headers.subdbname);

    if (
      await isDuplicateByGetAll(pool, {
        proc: "sp_GeneratorMachineGroup_GetAll",
        params: [{ name: "CompanyCode", type: sql.Int, value: companyCode }],
        nameField: "GeneratorMachineGroupName",
        codeField: "GeneratorMachineGroupCode",
        name,
        code,
      })
    )
      return sendError(res, "Already exist the Generator Machine Group Name", 409);

    const request = pool.request();

    if (isEdit)
      request.input("GeneratorMachineGroupCode", sql.Int, code);
    request.input("GeneratorMachineGroupName", sql.NVarChar, name);
    request.input("Description", sql.NVarChar, description);
    request.input("MultipleFactor", sql.Decimal(18, 3), multipleFactor);
    request.input("CompanyCode", sql.Int, companyCode);
    request.input("Status", sql.Bit, toStatusBit(body.Status));
    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));

    await request.execute("sp_GeneratorMachineGroup_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_")) {
      return sendError(res, "Already exist the Generator Machine Group Name", 409);
    }
    console.error("DB Error (saveOrUpdateGeneratorMachineGroup):", err);
    return sendError(res, err);
  }
};

// POST /generator-machine-group/create        -> create
export const createGeneratorMachineGroup = (req, res) =>
  saveOrUpdateGeneratorMachineGroup(req, res, false);

// PUT  /generator-machine-group/update/:code  -> update
export const updateGeneratorMachineGroup = (req, res) =>
  saveOrUpdateGeneratorMachineGroup(req, res, true);

// DELETE /generator-machine-group/delete/:generatorMachineGroupCode
export const deleteGeneratorMachineGroup = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.generatorMachineGroupCode);
    if (!code) return sendError(res, "Invalid GeneratorMachineGroupCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();
    request.input("GeneratorMachineGroupCode", sql.Int, code);

    await request.execute("sp_GeneratorMachineGroup_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("FK_") || err.message.includes("REFERENCE"))) {
      return sendError(res, "You cannot delete the Generator Machine Group!", 409);
    }
    console.error("DB Error (deleteGeneratorMachineGroup):", err);
    return sendError(res, err);
  }
};
