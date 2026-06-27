import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";
import { isDuplicateByGetAll } from "../utils/duplicateCheck.js";

// ---------------------------------------------------------------------------
// Slot master (port of WinForms frmSlot / frmSlotDetails)
//   - List   : EXEC sp_Slot_GetAll   @CompanyCode
//   - Create : EXEC sp_Slot_AddEdit  (without @SlotCode)
//   - Update : EXEC sp_Slot_AddEdit  (with @SlotCode)
//   - Delete : EXEC sp_Slot_Delete   @SlotCode
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

// GET /slot/lists  -> EXEC sp_Slot_GetAll @CompanyCode
export const getSlotList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const companyCode = parseInt(req.headers.companyCode);
    if (!companyCode) return sendError(res, "Missing company context", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_Slot_GetAll");

    const data = result.recordset
      // Newest first (the SP doesn't guarantee order, so sort here).
      .sort((a, b) => b.SlotCode - a.SlotCode)
      .map((item) => ({
        ...item,
        id: item.SlotCode,
        StatusText: STATUS_LABEL(item.Status),
      }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getSlotList):", err);
    return sendError(res, err);
  }
};

// GET /slot/list/:slotCode  -> single record
export const getSlotById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const companyCode = parseInt(req.headers.companyCode);
    if (!companyCode) return sendError(res, "Missing company context", 400);

    const code = parseInt(req.params.slotCode);
    if (!code) return sendError(res, "Invalid SlotCode", 400);

    const pool = await getPool(req.headers.subdbname);
    // No single-row SP exists; filter the GetAll result.
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_Slot_GetAll");
    const row = result.recordset.find((r) => r.SlotCode === code);

    if (!row) return sendError(res, "Slot not found", 404);

    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getSlotById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_Slot_AddEdit (btnSave_Click)
const saveOrUpdateSlot = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    const companyCode = parseInt(req.headers.companyCode);
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);
    if (!companyCode) return sendError(res, "Missing company context", 400);

    const body = req.body || {};
    const name = (body.SlotName || "").trim();

    // Same validation the form enforces: name is mandatory.
    if (!name)
      return sendError(res, "Slot Name should not be empty", 400);

    const description = (body.Description || "").trim();
    const machineFactor = Number(body.MachineFactor) || 0;

    const code = isEdit
      ? parseInt(req.params.slotCode ?? body.SlotCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid SlotCode for update", 400);

    const pool = await getPool(req.headers.subdbname);

    if (
      await isDuplicateByGetAll(pool, {
        proc: "sp_Slot_GetAll",
        params: [{ name: "CompanyCode", type: sql.Int, value: companyCode }],
        nameField: "SlotName",
        codeField: "SlotCode",
        name,
        code,
      })
    )
      return sendError(res, "Already exist the Slot Name", 409);

    const request = pool.request();

    if (isEdit) request.input("SlotCode", sql.Int, code);
    request.input("SlotName", sql.NVarChar, name);
    request.input("Description", sql.NVarChar, description);
    request.input("MachineFactor", sql.Decimal(18, 3), machineFactor);
    request.input("Status", sql.Bit, toStatusBit(body.Status));
    request.input("CompanyCode", sql.Int, companyCode);
    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));

    await request.execute("sp_Slot_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_SlotName")) {
      return sendError(res, "Already exist the Slot Name", 409);
    }
    console.error("DB Error (saveOrUpdateSlot):", err);
    return sendError(res, err);
  }
};

// POST /slot/create        -> create
export const createSlot = (req, res) => saveOrUpdateSlot(req, res, false);

// PUT  /slot/update/:code  -> update
export const updateSlot = (req, res) => saveOrUpdateSlot(req, res, true);

// DELETE /slot/delete/:slotCode -> EXEC sp_Slot_Delete
export const deleteSlot = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.slotCode);
    if (!code) return sendError(res, "Invalid SlotCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();
    request.input("SlotCode", sql.Int, code);

    await request.execute("sp_Slot_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("FK_") || err.message.includes("REFERENCE"))) {
      return sendError(res, "You cannot delete the Slot!", 409);
    }
    console.error("DB Error (deleteSlot):", err);
    return sendError(res, err);
  }
};
