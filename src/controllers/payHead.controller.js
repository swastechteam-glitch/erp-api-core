import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Pay Head master (port of the WinForms frmPayHead / frmPayHeadDetails)
//
//   A pay head: PayHeadName + Type (tbl_PayHeadType) + Refundable (N/Y) +
//   Salary Report Head / Group (tbl_PayHeadGroup, filtered by the chosen Type) +
//   Status. The Group dropdown depends on the selected Type.
//
//   Stored procs (kept identical to the desktop):
//     sp_PayHead_AddEdit  -> insert/update (@User/@Node, edit adds @PayHeadCode)
//     sp_PayHead_GetAll   -> list (joined display + the hidden code columns)
//     sp_PayHead_Delete   -> delete (@PayHeadCode)
//   Lookups: tbl_PayHeadType, tbl_PayHeadGroup (where PayHeadTypeCode = <type>).
//
//   The AddEdit SP needs user/node which we read from the auth token (headers):
//   both create and edit pass @User/@Node (faithful to the desktop).
//
//   Endpoints
//     GET    /options              pay head types
//     GET    /groups/:typeCode     groups (salary report heads) for a type
//     GET    /lists                sp_PayHead_GetAll
//     GET    /list/:payHeadCode    one pay head (from GetAll, normalized)
//     POST   /create               sp_PayHead_AddEdit (no @PayHeadCode)
//     PUT    /update/:payHeadCode  sp_PayHead_AddEdit (with @PayHeadCode)
//     DELETE /delete/:payHeadCode  sp_PayHead_Delete
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};

const toStatusBit = (status) => {
  if (status === true || status === 1 || status === "1") return 1;
  if (typeof status === "string" && status.trim().toUpperCase() === "ACTIVE")
    return 1;
  return 0;
};

// Refundable is stored as "N"/"Y". Normalise anything (Y/YES/1/true) -> "Y".
const toRefundable = (v) => {
  const s = String(v ?? "").trim().toUpperCase();
  return s.startsWith("Y") || s === "1" || s === "TRUE" ? "Y" : "N";
};

// Case-insensitive read of a column from a recordset row (the SP may return a
// column in a slightly different casing/alias than we expect).
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

// GET /pay-head/options  -> pay head types (cmbPayHeadType source)
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .query("Select PayHeadTypeCode, PayHeadTypeName from tbl_PayHeadType order by PayHeadTypeName");
    return sendSuccess(res, {
      types: (r.recordset || []).map((x) => ({
        value: toInt(x.PayHeadTypeCode),
        label: x.PayHeadTypeName ?? "",
      })),
    });
  } catch (err) {
    console.error("DB Error (PayHead.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /pay-head/groups/:typeCode  -> salary report heads for the chosen type
export const getGroups = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const typeCode = toInt(req.params.typeCode);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("PayHeadTypeCode", sql.Int, typeCode)
      .query(
        "Select PayHeadGroupCode, PayHeadGroupName from tbl_PayHeadGroup where PayHeadTypeCode = @PayHeadTypeCode order by PayHeadGroupName"
      );
    return sendSuccess(
      res,
      (r.recordset || []).map((x) => ({
        value: toInt(x.PayHeadGroupCode),
        label: x.PayHeadGroupName ?? "",
      }))
    );
  } catch (err) {
    console.error("DB Error (PayHead.getGroups):", err);
    return sendError(res, err);
  }
};

// GET /pay-head/lists  -> sp_PayHead_GetAll (joined display data)
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool.request().execute("sp_PayHead_GetAll");

    const data = (r.recordset || []).map((row) => {
      const code = toInt(pick(row, "PayHeadCode"));
      return {
        ...row,
        id: code,
        PayHeadCode: code,
        PayHeadName: pick(row, "PayHeadName") ?? "",
        TypeName: pick(row, "PayHeadTypeName", "PayHeadType", "TypeName", "Type") ?? "",
        GroupName:
          pick(row, "PayHeadGroupName", "PayHeadGroup", "GroupName", "SalaryReportHead") ?? "",
        Refundable: toRefundable(pick(row, "Refundable")) === "Y" ? "YES" : "NO",
        Status: toStatusBit(pick(row, "Status")) ? "ACTIVE" : "INACTIVE",
      };
    });

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (PayHead.getList):", err);
    return sendError(res, err);
  }
};

// GET /pay-head/list/:payHeadCode  -> one record for the edit screen.
// Derived from sp_PayHead_GetAll (the desktop edits straight off that grid row),
// so we depend only on the SP — not on guessing the base-table column layout.
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.payHeadCode);
    if (code <= 0) return sendError(res, "Invalid PayHeadCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const r = await pool.request().execute("sp_PayHead_GetAll");
    const row = (r.recordset || []).find((x) => toInt(pick(x, "PayHeadCode")) === code);
    if (!row) return sendError(res, "Pay Head not found", 404);

    return sendSuccess(res, {
      PayHeadCode: code,
      PayHeadName: pick(row, "PayHeadName") ?? "",
      PayHeadTypeCode: toInt(pick(row, "PayHeadTypeCode")),
      PayHeadGroupCode: toInt(pick(row, "PayHeadGroupCode")),
      Refundable: toRefundable(pick(row, "Refundable")),
      Status: toStatusBit(pick(row, "Status")),
    });
  } catch (err) {
    console.error("DB Error (PayHead.getById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_PayHead_AddEdit (btnSave_Click)
const saveOrUpdate = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const payHeadName = (body.PayHeadName || "").trim();
    const payHeadTypeCode = toInt(body.PayHeadTypeCode);
    const payHeadGroupCode = toInt(body.PayHeadGroupCode);

    // Same validation order the form enforces.
    if (payHeadTypeCode <= 0) return sendError(res, "Select the Pay Head Type", 400);
    if (!payHeadName) return sendError(res, "PayHead Name should not be empty", 400);
    if (payHeadGroupCode <= 0) return sendError(res, "Select the PayHead Group...", 400);

    const payHeadCode = isEdit
      ? toInt(req.params.payHeadCode ?? body.PayHeadCode)
      : null;
    if (isEdit && !payHeadCode)
      return sendError(res, "Invalid PayHeadCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) request.input("PayHeadCode", sql.Int, payHeadCode);
    request.input("PayHeadName", sql.NVarChar, payHeadName);
    request.input("PayHeadTypeCode", sql.Int, payHeadTypeCode);
    request.input("Refundable", sql.VarChar(1), toRefundable(body.Refundable));
    request.input("PayHeadGroupCode", sql.Int, payHeadGroupCode);
    request.input("Status", sql.Int, toStatusBit(body.Status));

    await request.execute("sp_PayHead_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint -> friendly 409 (matches the desktop message).
    if (err.message && err.message.includes("UK_")) {
      return sendError(res, "Already exist the PayHead Name", 409);
    }
    console.error("DB Error (saveOrUpdatePayHead):", err);
    return sendError(res, err);
  }
};

// POST /pay-head/create
export const create = (req, res) => saveOrUpdate(req, res, false);

// PUT  /pay-head/update/:payHeadCode
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /pay-head/delete/:payHeadCode  -> sp_PayHead_Delete
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.payHeadCode);
    if (code <= 0) return sendError(res, "Invalid PayHeadCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("PayHeadCode", sql.Int, code)
      .execute("sp_PayHead_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    // Still referenced elsewhere -> friendly 409 (matches "You can not delete").
    if (err.message && (err.message.includes("FK_") || err.message.includes("REFERENCE"))) {
      return sendError(res, "You can not delete the PayHead !", 409);
    }
    console.error("DB Error (deletePayHead):", err);
    return sendError(res, err);
  }
};
