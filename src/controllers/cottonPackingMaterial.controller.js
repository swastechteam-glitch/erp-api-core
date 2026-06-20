import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Cotton Packing Material master (port of the WinForms frmCottonPackingMaterial)
//   - List   : SELECT from tbl_CottonPackingMaterial   (form uses a direct select)
//   - Create : EXEC sp_CottonPackingMaterial_AddEdit    (without @CottonPackingMaterialCode)
//   - Update : EXEC sp_CottonPackingMaterial_AddEdit    (with @CottonPackingMaterialCode)
//   - Delete : EXEC sp_CottonPackingMaterial_Delete
// AddEdit requires @User / @Node which we read from the auth token (headers).
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

const toBit = (v) => {
  if (v === true || v === 1 || v === "1") return 1;
  if (typeof v === "string" && v.trim().toUpperCase() === "ACTIVE") return 1;
  return 0;
};

// GET /cotton-packing-material/lists  -> mirrors frmCottonPackingMaterialDetails list
export const getCottonPackingMaterialList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .query(
        "Select CottonPackingMaterialCode, CottonPackingMaterialName, Status from tbl_CottonPackingMaterial"
      );

    const data = result.recordset.map((item) => ({
      ...item,
      id: item.CottonPackingMaterialCode,
      StatusText: STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getCottonPackingMaterialList):", err);
    return sendError(res, err);
  }
};

// GET /cotton-packing-material/list/:cottonPackingMaterialCode  -> single record
export const getCottonPackingMaterialById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.cottonPackingMaterialCode);
    if (!code) return sendError(res, "Invalid CottonPackingMaterialCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CottonPackingMaterialCode", sql.Int, code)
      .query(
        "Select CottonPackingMaterialCode, CottonPackingMaterialName, Status " +
          "from tbl_CottonPackingMaterial where CottonPackingMaterialCode = @CottonPackingMaterialCode"
      );

    if (!result.recordset.length)
      return sendError(res, "Cotton Packing Material not found", 404);

    const row = result.recordset[0];
    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getCottonPackingMaterialById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_CottonPackingMaterial_AddEdit (btnSave_Click)
const saveOrUpdateCottonPackingMaterial = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const name = (body.CottonPackingMaterialName || "").trim();

    // Same validation the form enforces: name is mandatory.
    if (!name)
      return sendError(res, "CottonPackingMaterial Name should not be empty", 400);

    const code = isEdit
      ? parseInt(req.params.cottonPackingMaterialCode ?? body.CottonPackingMaterialCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid CottonPackingMaterialCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) request.input("CottonPackingMaterialCode", sql.Int, code);
    request.input("CottonPackingMaterialName", sql.NVarChar, name);
    request.input("Status", sql.Bit, toBit(body.Status));

    await request.execute("sp_CottonPackingMaterial_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique constraint -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_CottonPackingMaterialName")) {
      return sendError(res, "Already exist the CottonPackingMaterial Name", 409);
    }
    console.error("DB Error (saveOrUpdateCottonPackingMaterial):", err);
    return sendError(res, err);
  }
};

// POST /cotton-packing-material/create        -> create
export const createCottonPackingMaterial = (req, res) =>
  saveOrUpdateCottonPackingMaterial(req, res, false);

// PUT  /cotton-packing-material/update/:code  -> update
export const updateCottonPackingMaterial = (req, res) =>
  saveOrUpdateCottonPackingMaterial(req, res, true);

// DELETE /cotton-packing-material/delete/:cottonPackingMaterialCode -> EXEC sp_CottonPackingMaterial_Delete
export const deleteCottonPackingMaterial = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.cottonPackingMaterialCode);
    if (!code) return sendError(res, "Invalid CottonPackingMaterialCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("CottonPackingMaterialCode", sql.Int, code)
      .execute("sp_CottonPackingMaterial_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the Cotton Packing Material!", 409);
    }
    console.error("DB Error (deleteCottonPackingMaterial):", err);
    return sendError(res, err);
  }
};
