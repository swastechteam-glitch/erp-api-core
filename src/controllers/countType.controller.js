import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Count Type master (port of the WinForms frmCountType / frmCountTypeDetails)
//   - List   : EXEC sp_CountType_GetAll
//   - Create : EXEC sp_CountType_AddEdit   (@C_User / @C_Node, no code)
//   - Update : EXEC sp_CountType_AddEdit   (@E_User / @E_Node / @CountTypeCode)
//   - Delete : EXEC sp_CountType_Delete
// The VB form (btnSave_Click) validates Count Name, Short Name, HSN Code,
// Lot No, Tip Colour and Bag Colour as mandatory. The three "total" weights are
// derived here (the form computed them client-side) so the client only sends the
// base inputs:
//   ConeNetWt   = ConeGrossWt - ConeTareWt
//   TareWeight  = ConeTipWeight + ConeCoverWeight + BagBoxWeight + SutleeStrapWeight
//   YarnWeight  = StdWeight + AllowanceExcessWt
// Status combo: ACTIVE -> 1, INACTIVE -> 0. Mirrors countName.controller.js.
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
  const n = parseFloat(v);
  return Number.isNaN(n) ? 0 : n;
};

// GET /count-type/lists  -> mirrors frmCountTypeDetails list
export const getCountTypeList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_CountType_GetAll");

    const data = (result.recordset || []).map((item) => ({
      ...item,
      id: item.CountTypeCode,
      StatusText: STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getCountTypeList):", err);
    return sendError(res, err);
  }
};

// GET /count-type/list/:countTypeCode  -> single record (filtered from GetAll)
export const getCountTypeById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = toInt(req.params.countTypeCode);
    if (!code) return sendError(res, "Invalid CountTypeCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_CountType_GetAll");
    const row = (result.recordset || []).find(
      (r) => toInt(r.CountTypeCode) === code
    );

    if (!row) return sendError(res, "Count Type not found", 404);
    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getCountTypeById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_CountType_AddEdit (btnSave_Click)
const saveOrUpdateCountType = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const countNameCode = toInt(body.CountNameCode);
    const shortName = (body.ShortName || "").trim();
    const hsnCode = (body.HSNCode || "").trim();
    const lotNoCode = toInt(body.LotNoCode);
    const tipColourCode = toInt(body.TipColourCode);
    const bagColourCode = toInt(body.BagColourCode);

    // Same validation the form enforces (btnSave_Click).
    if (!countNameCode) return sendError(res, "Select the Count Type", 400);
    if (!shortName) return sendError(res, "Enter the Short Name", 400);
    if (!hsnCode) return sendError(res, "Enter the HSN Code", 400);
    if (!lotNoCode) return sendError(res, "Select the Lot No", 400);
    if (!tipColourCode) return sendError(res, "Select the Tip Colour", 400);
    if (!bagColourCode) return sendError(res, "Select the Bag Colour", 400);

    const code = isEdit
      ? toInt(req.params.countTypeCode ?? body.CountTypeCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid CountTypeCode for update", 400);

    // Base weights + derived totals (the VB form computed these client-side).
    const stdWeight = toNum(body.StdWeight);
    const excessWeight = toNum(body.AllowanceExcessWt);
    const coneGrossWt = toNum(body.ConeGrossWt);
    const coneTareWt = toNum(body.ConeTareWt);
    const coneTipWeight = toNum(body.ConeTipWeight);
    const coneCoverWeight = toNum(body.ConeCoverWeight);
    const bagBoxWeight = toNum(body.BagBoxWeight);
    const sutleeStrapWeight = toNum(body.SutleeStrapWeight);

    const coneNetWt = coneGrossWt - coneTareWt;
    const tareWeight =
      coneTipWeight + coneCoverWeight + bagBoxWeight + sutleeStrapWeight;
    const yarnWeight = stdWeight + excessWeight;

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    // The proc uses C_* params for a new row and E_* params for an edit.
    if (isEdit) {
      request.input("E_User", sql.Int, toInt(userId));
      request.input("E_Node", sql.Int, toInt(nodeCode));
      request.input("CountTypeCode", sql.Int, code);
    } else {
      request.input("C_User", sql.Int, toInt(userId));
      request.input("C_Node", sql.Int, toInt(nodeCode));
    }
    request.input("CountNameCode", sql.Int, countNameCode);
    request.input("ShortName", sql.NVarChar, shortName);
    request.input("HSNCode", sql.NVarChar, hsnCode);
    request.input("StdWeight", sql.Decimal(18, 3), stdWeight);
    request.input("Weight_Tolerance_Min", sql.Decimal(18, 3), toNum(body.Weight_Tolerance_Min));
    request.input("Weight_Tolerance_Max", sql.Decimal(18, 3), toNum(body.Weight_Tolerance_Max));
    request.input("DeliveryWeight", sql.Decimal(18, 3), toNum(body.DeliveryWeight));
    request.input("Fixed", sql.Bit, toBit(body.Fixed));
    request.input("Rate", sql.Decimal(18, 2), toNum(body.Rate));
    request.input("BillingDescription", sql.NVarChar, (body.BillingDescription || "").trim());
    request.input("YarnBagNoGroupCode", sql.Int, toInt(body.YarnBagNoGroupCode));
    request.input("Status", sql.Bit, toBit(body.Status));
    request.input("ConeGrossWt", sql.Decimal(18, 3), coneGrossWt);
    request.input("ConeTareWt", sql.Decimal(18, 3), coneTareWt);
    request.input("ConeNetWt", sql.Decimal(18, 3), coneNetWt);
    request.input("TareWeight", sql.Decimal(18, 3), tareWeight);
    request.input("AllowanceExcessWt", sql.Decimal(18, 3), excessWeight);
    request.input("LotNoCode", sql.Int, lotNoCode);
    request.input("TipColourCode", sql.Int, tipColourCode);
    request.input("BagColourCode", sql.Int, bagColourCode);
    request.input("ConeTipWeight", sql.Decimal(18, 3), coneTipWeight);
    request.input("ConeCoverWeight", sql.Decimal(18, 3), coneCoverWeight);
    request.input("BagBoxWeight", sql.Decimal(18, 3), bagBoxWeight);
    request.input("SutleeStrapWeight", sql.Decimal(18, 3), sutleeStrapWeight);
    request.input("YarnWeight", sql.Decimal(18, 3), yarnWeight);

    await request.execute("sp_CountType_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    // Unique index -> friendly 409 (matches form behaviour).
    if (err.message && err.message.includes("UK_ShortType_tblCountType")) {
      return sendError(res, "Already exist the Short Name", 409);
    }
    console.error("DB Error (saveOrUpdateCountType):", err);
    return sendError(res, err);
  }
};

// POST /count-type/create        -> create
export const createCountType = (req, res) =>
  saveOrUpdateCountType(req, res, false);

// PUT  /count-type/update/:code  -> update
export const updateCountType = (req, res) =>
  saveOrUpdateCountType(req, res, true);

// DELETE /count-type/delete/:countTypeCode -> EXEC sp_CountType_Delete
export const deleteCountType = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = toInt(req.params.countTypeCode);
    if (!code) return sendError(res, "Invalid CountTypeCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("CountTypeCode", sql.Int, code)
      .execute("sp_CountType_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the CountType!", 409);
    }
    console.error("DB Error (deleteCountType):", err);
    return sendError(res, err);
  }
};

// --- Dropdown lookups (mirror the cmb* RecordSource calls in Bind_Data) ------

// Helper: run a query/proc and shape rows into { value, label, ...row }.
const sendLookup = async (req, res, runner, valueKey, labelKey, name) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await runner(pool.request());
    const data = (result.recordset || []).map((item) => ({
      ...item,
      value: item[valueKey],
      label: item[labelKey],
    }));
    return sendSuccess(res, data);
  } catch (err) {
    console.error(`DB Error (${name}):`, err);
    return sendError(res, err);
  }
};

// GET /count-type/count-names -> cmbCountName (active count names)
export const getCountNameOptions = (req, res) =>
  sendLookup(
    req,
    res,
    (r) =>
      r.query(
        "SELECT CountNameCode, CountName, ShortName FROM tbl_CountName WHERE Status = 1 ORDER BY CountName"
      ),
    "CountNameCode",
    "CountName",
    "getCountNameOptions"
  );

// GET /count-type/lot-nos -> cmbLotNo (EXEC sp_LotNo_GetAll @Status = 1)
export const getLotNoOptions = (req, res) =>
  sendLookup(
    req,
    res,
    (r) => r.input("Status", sql.Bit, 1).execute("sp_LotNo_GetAll"),
    "LotNoCode",
    "LotNo",
    "getLotNoOptions"
  );

// GET /count-type/tip-colours -> cmbTipColour (EXEC sp_TipColour_GetAll)
export const getTipColourOptions = (req, res) =>
  sendLookup(
    req,
    res,
    (r) => r.execute("sp_TipColour_GetAll"),
    "TipColourCode",
    "TipColour",
    "getTipColourOptions"
  );

// GET /count-type/bag-colours -> cmbBagColour (EXEC sp_BagColour_GetAll)
export const getBagColourOptions = (req, res) =>
  sendLookup(
    req,
    res,
    (r) => r.execute("sp_BagColour_GetAll"),
    "BagColourCode",
    "BagColour",
    "getBagColourOptions"
  );

// GET /count-type/bagno-groups -> cmbYarnBagNoGroup (tbl_YarnBagNoGroup)
export const getBagNoGroupOptions = (req, res) =>
  sendLookup(
    req,
    res,
    (r) =>
      r.query(
        "SELECT YarnBagNoGroupCode, YarnBagNoGroupName FROM tbl_YarnBagNoGroup ORDER BY YarnBagNoGroupName"
      ),
    "YarnBagNoGroupCode",
    "YarnBagNoGroupName",
    "getBagNoGroupOptions"
  );
