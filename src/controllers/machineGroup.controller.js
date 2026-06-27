import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";
import { isDuplicateByGetAll } from "../utils/duplicateCheck.js";

// ---------------------------------------------------------------------------
// (Diesel) Machine Group master (port of WinForms frmMachineGroup / Details)
//   - List   : EXEC sp_MachineGroup_GetAll   @CompanyCode
//   - Create : EXEC sp_MachineGroup_AddEdit  (without @MachineGroupCode)
//   - Update : EXEC sp_MachineGroup_AddEdit  (with @MachineGroupCode)
//   - Delete : EXEC sp_MachineGroup_Delete   @MachineGroupCode
// AddEdit requires @User / @Node (auth token headers) and is company-scoped via
// @CompanyCode. Each machine group has a Machine Type (@MachineTypeCode).
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

// Accepts true / 1 / "1" / "ACTIVE" as active, everything else inactive.
const toStatusBit = (status) => {
  if (status === true || status === 1 || status === "1") return 1;
  if (typeof status === "string" && status.trim().toUpperCase() === "ACTIVE")
    return 1;
  return 0;
};

// GET /machine-group/lists  -> EXEC sp_MachineGroup_GetAll @CompanyCode
export const getMachineGroupList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const companyCode = parseInt(req.headers.companyCode);
    if (!companyCode) return sendError(res, "Missing company context", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_MachineGroup_GetAll");

    const data = result.recordset
      // Newest first (the SP doesn't guarantee order, so sort here).
      .sort((a, b) => b.MachineGroupCode - a.MachineGroupCode)
      .map((item) => ({
        ...item,
        id: item.MachineGroupCode,
        StatusText: STATUS_LABEL(item.Status),
      }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getMachineGroupList):", err);
    return sendError(res, err);
  }
};

// GET /machine-group/list/:machineGroupCode  -> single record
export const getMachineGroupById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const companyCode = parseInt(req.headers.companyCode);
    if (!companyCode) return sendError(res, "Missing company context", 400);

    const code = parseInt(req.params.machineGroupCode);
    if (!code) return sendError(res, "Invalid MachineGroupCode", 400);

    const pool = await getPool(req.headers.subdbname);
    // No single-row SP exists; filter the GetAll result.
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_MachineGroup_GetAll");
    const row = result.recordset.find((r) => r.MachineGroupCode === code);

    if (!row) return sendError(res, "Machine Group not found", 404);

    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getMachineGroupById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_MachineGroup_AddEdit (btnSave_Click)
const saveOrUpdateMachineGroup = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    const companyCode = parseInt(req.headers.companyCode);
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);
    if (!companyCode) return sendError(res, "Missing company context", 400);

    const body = req.body || {};
    const name = (body.MachineGroupName || "").trim();
    const machineTypeCode = parseInt(body.MachineTypeCode) || 0;

    // Same validation the form enforces: name + machine type are mandatory.
    if (!name)
      return sendError(res, "MachineGroup Name should not be empty", 400);
    if (machineTypeCode <= 0)
      return sendError(res, "Select The Machine Type..", 400);

    const description = (body.Description || "").trim();

    const code = isEdit
      ? parseInt(req.params.machineGroupCode ?? body.MachineGroupCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid MachineGroupCode for update", 400);

    const pool = await getPool(req.headers.subdbname);

    if (
      await isDuplicateByGetAll(pool, {
        proc: "sp_MachineGroup_GetAll",
        params: [{ name: "CompanyCode", type: sql.Int, value: companyCode }],
        nameField: "MachineGroupName",
        codeField: "MachineGroupCode",
        name,
        code,
      })
    )
      return sendError(res, "Already exist the MachineGroup Name", 409);

    const request = pool.request();

    if (isEdit) request.input("MachineGroupCode", sql.Int, code);
    request.input("MachineGroupName", sql.NVarChar, name);
    request.input("Description", sql.NVarChar, description);
    request.input("Status", sql.Bit, toStatusBit(body.Status));
    request.input("MachineTypeCode", sql.Int, machineTypeCode);
    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    request.input("CompanyCode", sql.Int, companyCode);

    await request.execute("sp_MachineGroup_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_MachineGroupName")) {
      return sendError(res, "Already exist the MachineGroup Name", 409);
    }
    console.error("DB Error (saveOrUpdateMachineGroup):", err);
    return sendError(res, err);
  }
};

// POST /machine-group/create        -> create
export const createMachineGroup = (req, res) =>
  saveOrUpdateMachineGroup(req, res, false);

// PUT  /machine-group/update/:code  -> update
export const updateMachineGroup = (req, res) =>
  saveOrUpdateMachineGroup(req, res, true);

// DELETE /machine-group/delete/:machineGroupCode -> EXEC sp_MachineGroup_Delete
export const deleteMachineGroup = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.machineGroupCode);
    if (!code) return sendError(res, "Invalid MachineGroupCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();
    request.input("MachineGroupCode", sql.Int, code);

    await request.execute("sp_MachineGroup_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("FK_") || err.message.includes("REFERENCE"))) {
      return sendError(res, "You cannot delete the Machine Group!", 409);
    }
    console.error("DB Error (deleteMachineGroup):", err);
    return sendError(res, err);
  }
};
