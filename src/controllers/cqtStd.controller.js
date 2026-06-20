import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Cotton Quality Test STD master (port of the WinForms frmCottonQualityTestSTD)
//   - List    : EXEC sp_CQTSTD_GetAll  (@FYCode)
//   - Create  : EXEC sp_CQTSTD_AddEdit (no @CQTSTDCode) -> returns CQTSTDCode
//   - Update  : EXEC sp_CQTSTD_AddEdit (with @CQTSTDCode)
//   - Delete  : EXEC sp_CQTSTD_Delete
//   - Options : CQT parameter lists by type (GET /cqt-std/options)
// AddEdit returns the CQTSTDCode; we then re-sync the child "CQT STD details"
// (the parameter From/To grid) in the SAME transaction:
//   sp_CQTSTDDetails_Delete then a loop of sp_CQTSTDDetails_Insert (rows whose
//   CQTParameterFrom > 0, matching the WinForms btnSave_Click).
// The CQT Std No is auto-generated on create via sp_CQTSTD_BindNo (@FYCode).
//
// NOTE: the editable parameter (From/To) child grid is exposed as a `details[]`
// array but is NOT yet built in the React UI (parent fields only). When
// `details` is omitted the existing detail rows are left untouched.
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

const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};

// Cotton / Yarn radio collapses to one select value the form uses.
const deriveType = (row) => (row.Yarn ? "Yarn" : "Cotton");

// GET /cqt-std/lists  -> mirrors frmCottonQualityTestSTDDetails list
export const getCQTSTDList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const fyCode = toInt(req.headers.FYCode);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();
    if (fyCode) request.input("FYCode", sql.Int, fyCode);
    const result = await request.execute("sp_CQTSTD_GetAll");

    const data = result.recordset.map((item) => ({
      ...item,
      id: item.CQTSTDCode,
      StatusText: STATUS_LABEL(item.Status),
      Type: deriveType(item),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getCQTSTDList):", err);
    return sendError(res, err);
  }
};

// GET /cqt-std/list/:cqtStdCode  -> single record (+ child parameter details)
export const getCQTSTDById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.cqtStdCode);
    if (!code) return sendError(res, "Invalid CQTSTDCode", 400);

    const pool = await getPool(req.headers.subdbname);

    const listRes = await pool.request().execute("sp_CQTSTD_GetAll");
    const row = listRes.recordset.find((r) => r.CQTSTDCode === code);
    if (!row) return sendError(res, "Cotton Quality Test STD not found", 404);

    const detRes = await pool
      .request()
      .input("CQTSTDCode", sql.Int, code)
      .query(
        "Select * from vw_CQTSTDDetails where CQTSTDCode = @CQTSTDCode Order by OrderNo"
      );

    return sendSuccess(res, {
      ...row,
      StatusText: STATUS_LABEL(row.Status),
      Type: deriveType(row),
      details: detRes.recordset || [],
    });
  } catch (err) {
    console.error("DB Error (getCQTSTDById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_CQTSTD_AddEdit (btnSave_Click)
const saveOrUpdateCQTSTD = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const fyCode = toInt(req.headers.FYCode);

    const body = req.body || {};
    const name = (body.CQTSTDName || "").trim();
    const type = (body.Type || "Cotton").toString();
    const cotton = type === "Yarn" ? 0 : 1;
    const yarn = type === "Yarn" ? 1 : 0;

    // Validation mirrors btnSave_Click: STD Name is mandatory.
    if (!name) return sendError(res, "Enter The CQT STD Name", 400);

    const code = isEdit
      ? parseInt(req.params.cqtStdCode ?? body.CQTSTDCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid CQTSTDCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      // Auto-generate the CQT Std No on create (sp_CQTSTD_BindNo @FYCode).
      let cqtStdNo = toInt(body.CQTSTDNo);
      if (!isEdit) {
        const noRes = await new sql.Request(tx)
          .input("FYCode", sql.Int, fyCode)
          .execute("sp_CQTSTD_BindNo");
        const scalar = noRes.recordset?.[0];
        if (scalar) cqtStdNo = toInt(Object.values(scalar)[0]);
      }

      const request = new sql.Request(tx);
      if (isEdit) request.input("CQTSTDCode", sql.Int, code);
      request.input("CQTSTDNo", sql.Int, cqtStdNo);
      request.input("CQTSTDDate", sql.DateTime, body.CQTSTDDate ? new Date(body.CQTSTDDate) : new Date());
      request.input("CQTSTDName", sql.NVarChar, name);
      request.input("Cotton", sql.Bit, cotton);
      request.input("Yarn", sql.Bit, yarn);
      request.input("Remarks", sql.NVarChar, (body.Remarks || "").trim());
      request.input("Status", sql.Bit, body.Status === undefined ? 1 : toBit(body.Status));
      request.input("FYCode", sql.Int, fyCode);
      request.input("User", sql.Int, parseInt(userId));
      request.input("Node", sql.Int, parseInt(nodeCode));

      const result = await request.execute("sp_CQTSTD_AddEdit");
      const scalarRow = result.recordset?.[0];
      const cqtStdCode = scalarRow
        ? toInt(Object.values(scalarRow)[0])
        : code || 0;

      // Re-sync the parameter From/To child rows only when the client sends them.
      if (Array.isArray(body.details)) {
        await new sql.Request(tx)
          .input("CQTSTDCode", sql.Int, cqtStdCode)
          .execute("sp_CQTSTDDetails_Delete");

        for (const d of body.details) {
          const from = toNum(d.CQTParameterFrom);
          if (from <= 0) continue; // WinForms only persists rows with From > 0
          await new sql.Request(tx)
            .input("CQTSTDCode", sql.Int, cqtStdCode)
            .input("CQTParameterCode", sql.Int, toInt(d.CQTParameterCode))
            .input("CQTParameterFrom", sql.Decimal(18, 2), from)
            .input("CQTParameterFrom1", sql.NVarChar, (d.CQTParameterFrom1 || "").toString().trim())
            .input("CQTParameterTo", sql.Decimal(18, 2), toNum(d.CQTParameterTo))
            .input("CQTParameterTo1", sql.NVarChar, (d.CQTParameterTo1 || "").toString().trim())
            .execute("sp_CQTSTDDetails_Insert");
        }
      }

      await tx.commit();
      return sendSuccess(
        res,
        { CQTSTDCode: cqtStdCode, CQTSTDNo: cqtStdNo },
        isEdit ? "The record is updated" : "The record is saved",
        isEdit ? 200 : 201
      );
    } catch (txErr) {
      try {
        await tx.rollback();
      } catch (_) {}
      throw txErr;
    }
  } catch (err) {
    if (err.message && err.message.includes("UK_tbl_CQTSTD")) {
      return sendError(res, "Already exist the STD Name", 409);
    }
    console.error("DB Error (saveOrUpdateCQTSTD):", err);
    return sendError(res, err);
  }
};

// POST /cqt-std/create        -> create
export const createCQTSTD = (req, res) => saveOrUpdateCQTSTD(req, res, false);

// PUT  /cqt-std/update/:code  -> update
export const updateCQTSTD = (req, res) => saveOrUpdateCQTSTD(req, res, true);

// DELETE /cqt-std/delete/:cqtStdCode -> EXEC sp_CQTSTD_Delete
export const deleteCQTSTD = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.cqtStdCode);
    if (!code) return sendError(res, "Invalid CQTSTDCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("CQTSTDCode", sql.Int, code)
      .execute("sp_CQTSTD_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the Cotton Quality Test STD!", 409);
    }
    console.error("DB Error (deleteCQTSTD):", err);
    return sendError(res, err);
  }
};

// GET /cqt-std/options -> CQT parameter lists by type (for the From/To grid).
export const getCQTSTDOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const map = (rows) =>
      rows.map((r) => ({ value: r.CQTParameterCode, label: r.CQTParameterName }));

    const [cotton, yarn] = await Promise.all([
      pool
        .request()
        .query("Select CQTParameterCode, CQTParameterName from tbl_CQTParameter where ISNULL(Cotton,0) = 1 Order by OrderNo"),
      pool
        .request()
        .query("Select CQTParameterCode, CQTParameterName from tbl_CQTParameter where ISNULL(Yarn,0) = 1 Order by OrderNo"),
    ]);

    return sendSuccess(res, {
      parametersCotton: map(cotton.recordset),
      parametersYarn: map(yarn.recordset),
    });
  } catch (err) {
    console.error("DB Error (getCQTSTDOptions):", err);
    return sendError(res, err);
  }
};
