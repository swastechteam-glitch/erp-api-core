import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Box Packing master (port of the WinForms frmBoxPacking).
//   - List   : EXEC sp_BoxPacking_GetAll
//   - Create : EXEC sp_BoxPacking_AddEdit  (@User/@Node, no code)
//   - Update : EXEC sp_BoxPacking_AddEdit  (+ @BoxPackingCode)
//   - Delete : EXEC sp_BoxPacking_Delete
// The VB form (pnlMainNew_Save_Click) always passes @BoxPackingName, @NoofCones,
// @Remarks, @Status, @User and @Node, adding @BoxPackingCode only on edit (no
// @CompanyCode, no @C_*/@E_* split). It validates Packing Name + No of Cones > 0
// and maps a "UK_tbl" unique violation to "Already exist the BoxPacking Name".
// Status: ACTIVE -> 1, INACTIVE -> 0. Mirrors yarnBagNoGroup.controller.js.
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

// GET /box-packing/lists  -> mirrors the Box Packing list
export const getBoxPackingList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_BoxPacking_GetAll");

    const data = (result.recordset || []).map((item) => ({
      ...item,
      id: item.BoxPackingCode,
      StatusText: STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getBoxPackingList):", err);
    return sendError(res, err);
  }
};

// GET /box-packing/list/:boxPackingCode  -> single record (filtered from GetAll)
export const getBoxPackingById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = toInt(req.params.boxPackingCode);
    if (!code) return sendError(res, "Invalid BoxPackingCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_BoxPacking_GetAll");
    const row = (result.recordset || []).find(
      (r) => toInt(r.BoxPackingCode) === code
    );

    if (!row) return sendError(res, "Box Packing not found", 404);
    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getBoxPackingById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_BoxPacking_AddEdit (pnlMainNew_Save_Click)
const saveOrUpdateBoxPacking = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const boxPackingName = (body.BoxPackingName || "").trim();
    const noofCones = toInt(body.NoofCones);

    // Same validation the form enforces (pnlMainNew_Save_Click).
    if (!boxPackingName)
      return sendError(res, "Packing Name should not be empty", 400);
    if (noofCones <= 0)
      return sendError(res, "No of Cones should not be empty", 400);

    const code = isEdit
      ? toInt(req.params.boxPackingCode ?? body.BoxPackingCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid BoxPackingCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // Always @BoxPackingName/@NoofCones/@Remarks/@Status/@User/@Node; edit also
    // sends the code (no @C_*/@E_* split, no @CompanyCode for this proc).
    if (isEdit) request.input("BoxPackingCode", sql.Int, code);
    request.input("BoxPackingName", sql.NVarChar, boxPackingName);
    request.input("NoofCones", sql.Int, noofCones);
    request.input("Remarks", sql.NVarChar, (body.Remarks || "").trim());
    // Default to ACTIVE when Status is omitted (VB combo defaults to ACTIVE).
    request.input("Status", sql.Bit, body.Status === undefined ? 1 : toBit(body.Status));
    request.input("User", sql.Int, toInt(userId));
    request.input("Node", sql.Int, toInt(nodeCode));

    await request.execute("sp_BoxPacking_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique index -> friendly 409 (the VB checks for "UK_tbl").
    if (err.message && err.message.includes("UK_tbl")) {
      return sendError(res, "Already exist the BoxPacking Name", 409);
    }
    console.error("DB Error (saveOrUpdateBoxPacking):", err);
    return sendError(res, err);
  }
};

// POST /box-packing/create        -> create
export const createBoxPacking = (req, res) =>
  saveOrUpdateBoxPacking(req, res, false);

// PUT  /box-packing/update/:code  -> update
export const updateBoxPacking = (req, res) =>
  saveOrUpdateBoxPacking(req, res, true);

// DELETE /box-packing/delete/:boxPackingCode -> EXEC sp_BoxPacking_Delete
export const deleteBoxPacking = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = toInt(req.params.boxPackingCode);
    if (!code) return sendError(res, "Invalid BoxPackingCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("BoxPackingCode", sql.Int, code)
      .execute("sp_BoxPacking_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the BoxPacking!", 409);
    }
    console.error("DB Error (deleteBoxPacking):", err);
    return sendError(res, err);
  }
};
