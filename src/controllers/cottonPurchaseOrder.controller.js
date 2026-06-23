import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";
import {
  getSuppliers,
  getAgents,
  getStates,
  getRawMaterials,
  getPackingTypes,
  getQualitySTDs,
  getStationsByState as getStations,
  PAYMENT_TYPES,
  PAYMENT_MODES,
} from "../utils/masters.js";

// ---------------------------------------------------------------------------
// Cotton Purchase Order transaction (port of the WinForms frmCottonPurchaseOrder)
//   - List     : EXEC sp_CottonPurchaseOrder_GetAll      (@CompanyCode, @FYCode)
//   - One       : Select from vw_CottonPurchaseOrder + vw_CottonPurchaseOrderDetails
//   - Next No   : EXEC sp_CottonPurchaseOrder_OrderNo     (@SeationCode, @CompanyCode, @FYCode)
//   - Options   : supplier / agent / state / station / variety / packingType /
//                 qualitySTD lookups (GET /cotton-purchase-order/options)
//   - STD grid  : vw_CQTSTDDetails for a Quality STD (GET .../quality-std/:code/parameters)
//   - Create/Update : a single transaction that mirrors btnSave_Click:
//        sp_CottonPurchaseOrder_AddEdit (ExecuteScalar -> CPOCode),
//        sp_CottonPurchaseOrderDetails_Delete,
//        loop sp_CottonPurchaseOrderDetails_Insert (rows with FromParameter <> 0),
//        sp_CottonPurchaseOrder_TestUpdate,
//        on edit: sp_CottonPurchaseOrderApproval_Delete.
//   - Delete    : EXEC sp_CottonPurchaseOrder_Delete (blocked if cotton has arrived).
//
// Company is read from the JWT (req.headers.companyCode), FY from req.headers.FYCode.
// The cotton "season" code is not carried in the token; default to 1 and allow a
// header/body/query override (seationCode).
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};

const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};

const toBit = (v) => (v === true || v === 1 || v === "1" ? 1 : 0);

const scalarRaw = async (request, proc) => {
  const r = await request.execute(proc);
  const row = r.recordset?.[0];
  return row ? Object.values(row)[0] : null;
};
// vw_CottonPurchaseOrder has duplicate column names (e.g. AgentCode appears
// twice), and mssql returns duplicate columns as an array (["49","49"]).
// Collapse any array-valued column back to its first scalar value.
const flattenRow = (row) => {
  if (!row) return row;
  const out = {};
  for (const k of Object.keys(row))
    out[k] = Array.isArray(row[k]) ? row[k][0] : row[k];
  return out;
};

const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getFYCode = (req) => toInt(req.headers.FYCode);
// Season is not in the token; default to 1, overridable via header/body/query.
const getSeationCode = (req) =>
  toInt(
    req.headers.seationcode ??
      req.body?.SeationCode ??
      req.query?.seationCode ??
      1,
  ) || 1;

// GET /cotton-purchase-order/lists  -> mirrors frmCottonPurchaseOrderDetails list
export const getCottonPurchaseOrderList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("FYCode", sql.Int, getFYCode(req))
      .execute("sp_CottonPurchaseOrder_GetAll");

    const data = result.recordset.map((item) => ({
      ...item,
      id: item.CPOCode,
    }));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getCottonPurchaseOrderList):", err);
    return sendError(res, err);
  }
};

// GET /cotton-purchase-order/list/:code -> header (vw_CottonPurchaseOrder) + details
export const getCottonPurchaseOrderById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.code);
    if (!code) return sendError(res, "Invalid CPOCode", 400);

    const companyCode = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    const head = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("CPOCode", sql.Int, code)
      .query(
        "Select * from vw_CottonPurchaseOrder where CompanyCode = @CompanyCode AND CPOCode = @CPOCode",
      );

    if (!head.recordset.length)
      return sendError(res, "Cotton Purchase Order not found", 404);

    const details = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("CPOCode", sql.Int, code)
      .query(
        "Select * from vw_CottonPurchaseOrderDetails where CompanyCode = @CompanyCode AND CPOCode = @CPOCode",
      );

    return sendSuccess(res, {
      ...flattenRow(head.recordset[0]),
      details: details.recordset || [],
    });
  } catch (err) {
    console.error("DB Error (getCottonPurchaseOrderById):", err);
    return sendError(res, err);
  }
};

// GET /cotton-purchase-order/next-no -> next PO number (sp_CottonPurchaseOrder_OrderNo)
export const getCottonPurchaseOrderNextNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await scalarRaw(
      pool
        .request()
        .input("SeationCode", sql.Int, getSeationCode(req))
        .input("CompanyCode", sql.Int, getCompanyCode(req))
        .input("FYCode", sql.Int, getFYCode(req)),
      "sp_CottonPurchaseOrder_OrderNo",
    );

    // const result = await pool
    //   .request()
    //   .input("SeationCode", sql.Int, getSeationCode(req))
    //   .input("CompanyCode", sql.Int, getCompanyCode(req))
    //   .input("FYCode", sql.Int, getFYCode(req))
    //   .execute("sp_CottonPurchaseOrder_OrderNo");
    console.log(result, "result");
    return sendSuccess(res, { nextNo: result });
    // const row = result.recordset?.[0];
    // const nextNo = row ? toInt(Object.values(row)[0]) : 0;
    // return sendSuccess(res, { nextNo });
  } catch (err) {
    console.error("DB Error (getCottonPurchaseOrderNextNo):", err);
    return sendError(res, err);
  }
};

// GET /cotton-purchase-order/quality-std/:code/parameters -> CQT STD parameter grid
export const getQualityStdParameters = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.code);
    if (!code) return sendError(res, "Invalid CQTSTDCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CQTSTDCode", sql.Int, code)
      .query(
        "Select * from vw_CQTSTDDetails Where CQTSTDCode = @CQTSTDCode Order by OrderNo",
      );

    // Only the parameter rows the WinForms grid would show (valid parameter code).
    const rows = (result.recordset || []).filter(
      (r) => toInt(r.CQTParameterCode) > 0,
    );
    return sendSuccess(res, { parameters: rows });
  } catch (err) {
    console.error("DB Error (getQualityStdParameters):", err);
    return sendError(res, err);
  }
};

// Shared create/update -> mirrors btnSave_Click (full transaction).
const saveOrUpdate = async (req, res, isEdit) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const companyCode = getCompanyCode(req);
    const fyCode = getFYCode(req);
    const seationCode = getSeationCode(req);

    const b = req.body || {};

    // ---- validations (mirror the WinForms btnSave_Click) ----
    if (!(b.RefNo || "").toString().trim())
      return sendError(res, "Enter the Ref No", 400);
    if (toInt(b.SupplierCode) <= 0)
      return sendError(res, "Select the Supplier Name", 400);
    if (toInt(b.AgentCode) <= 0)
      return sendError(res, "Select the Broker Name", 400);
    if (toInt(b.StationCode) <= 0)
      return sendError(res, "Select the Station", 400);
    if (toInt(b.StateCode) <= 0) return sendError(res, "Select the State", 400);
    if (toInt(b.RawMaterialCode) <= 0)
      return sendError(res, "Select the Variety", 400);
    if (toNum(b.Qty) <= 0) return sendError(res, "Enter the Purchase Qty", 400);
    if (toNum(b.Rate) <= 0)
      return sendError(res, "Enter the Purchase Rate", 400);
    if (toInt(b.CQTSTDCode) <= 0)
      return sendError(res, "Select the Quality STD", 400);

    const code = isEdit ? parseInt(req.params.code ?? b.CPOCode) : null;
    if (isEdit && !code)
      return sendError(res, "Invalid CPOCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    tx = new sql.Transaction(pool);
    await tx.begin();

    // PO number: keep existing on edit, otherwise pull a fresh one.
    let cpoNo = toInt(b.CPONo);
    if (!isEdit) {
      const noRes = await new sql.Request(tx)
        .input("SeationCode", sql.Int, seationCode)
        .input("CompanyCode", sql.Int, companyCode)
        .input("FYCode", sql.Int, fyCode)
        .execute("sp_CottonPurchaseOrder_OrderNo");
      const r = noRes.recordset?.[0];
      if (r) cpoNo = toInt(Object.values(r)[0]);
    }

    const head = new sql.Request(tx);
    if (isEdit) head.input("CPOCode", sql.Int, code);
    head.input("CPONo", sql.Int, cpoNo);
    head.input(
      "CPODate",
      sql.DateTime,
      b.CPODate ? new Date(b.CPODate) : new Date(),
    );
    head.input("SupplierCode", sql.Int, toInt(b.SupplierCode));
    head.input("AgentCode", sql.Int, toInt(b.AgentCode));
    head.input("StationCode", sql.Int, toInt(b.StationCode));
    head.input("CQTSTDCode", sql.Int, toInt(b.CQTSTDCode));
    head.input("PaymentType", sql.Int, toInt(b.PaymentType));
    head.input("PayMode", sql.Int, toInt(b.PayMode));
    head.input("PaymentDays", sql.Int, toInt(b.PaymentDays));
    head.input("RawMaterialCode", sql.Int, toInt(b.RawMaterialCode));
    head.input("MixingCount", sql.Decimal(18, 2), toNum(b.MixingCount));
    // Packing Type isn't on the PO screen; default to 2 (matches the WinForms
    // cmbPackingType.EditValue = 2) so the FK to tbl_PackingType is satisfied.
    head.input("PackingTypeCode", sql.Int, toInt(b.PackingTypeCode) || 2);
    head.input("Qty", sql.Decimal(18, 3), toNum(b.Qty));
    head.input("Rate", sql.Decimal(18, 3), toNum(b.Rate));
    head.input(
      "DespatchDetails",
      sql.NVarChar,
      (b.DespatchDetails || "").toString().trim(),
    );
    head.input(
      "PaymentDetails",
      sql.NVarChar,
      (b.PaymentDetails || "").toString().trim(),
    );
    head.input("Length", sql.Decimal(18, 2), toNum(b.Length));
    head.input("Mic", sql.Decimal(18, 2), toNum(b.Mic));
    head.input("Sth", sql.Decimal(18, 2), toNum(b.Sth));
    head.input("Trash", sql.Decimal(18, 2), toNum(b.Trash));
    head.input("Moisture", sql.Decimal(18, 2), toNum(b.Moisture));
    head.input("Remarks", sql.NVarChar, (b.Remarks || "").toString().trim());
    head.input("RefNo", sql.NVarChar, (b.RefNo || "").toString().trim());
    head.input("DeliveryDays", sql.Int, toInt(b.DeliveryDays));
    head.input("CForm", sql.Bit, toBit(b.CForm));
    head.input("ToLength", sql.Decimal(18, 2), toNum(b.ToLength));
    head.input("ToMic", sql.Decimal(18, 2), toNum(b.ToMic));
    head.input("ToSth", sql.Decimal(18, 2), toNum(b.ToSth));
    head.input("ToTrash", sql.Decimal(18, 2), toNum(b.ToTrash));
    head.input("ToMoisture", sql.Decimal(18, 2), toNum(b.ToMoisture));
    head.input("CancelQty", sql.Decimal(18, 3), toNum(b.CancelQty));
    head.input(
      "CancelRemarks",
      sql.NVarChar,
      (b.CancelRemarks || "").toString().trim(),
    );
    head.input("FYCode", sql.Int, fyCode);
    head.input("SeationCode", sql.Int, seationCode);
    head.input("CompanyCode", sql.Int, companyCode);
    head.input("User", sql.Int, parseInt(userId));
    head.input("Node", sql.Int, parseInt(nodeCode));
    head.input(
      "LegalName",
      sql.NVarChar,
      (b.LegalName || "").toString().trim(),
    );

    const headRes = await head.execute("sp_CottonPurchaseOrder_AddEdit");
    const scalarRow = headRes.recordset?.[0];
    const cpoCode = scalarRow ? toInt(Object.values(scalarRow)[0]) : code || 0;

    // Re-sync the CQT parameter child grid.
    await new sql.Request(tx)
      .input("CPOCode", sql.Int, cpoCode)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_CottonPurchaseOrderDetails_Delete");

    const details = Array.isArray(b.details) ? b.details : [];
    for (const d of details) {
      // WinForms inserts rows whose FromParameter <> 0; we also keep rows that
      // only carry a Maximum (ToParameter) so an edited "Maximum" is not lost.
      if (toNum(d.FromParameter) === 0 && toNum(d.ToParameter) === 0) continue;
      await new sql.Request(tx)
        .input("CPOCode", sql.Int, cpoCode)
        .input("CQTParameterCode", sql.Int, toInt(d.CQTParameterCode))
        .input("FromParameter", sql.Decimal(18, 2), toNum(d.FromParameter))
        .input("From1", sql.NVarChar, (d.From1 || "").toString().trim())
        .input("ToParameter", sql.Decimal(18, 2), toNum(d.ToParameter))
        .input("To1", sql.NVarChar, (d.To1 || "").toString().trim())
        .input("PartyFrom", sql.Decimal(18, 2), toNum(d.PartyFrom))
        .input(
          "PartyFrom1",
          sql.NVarChar,
          (d.PartyFrom1 || "").toString().trim(),
        )
        .input("PartyTo", sql.Decimal(18, 2), toNum(d.PartyTo))
        .input("PartyTo1", sql.NVarChar, (d.PartyTo1 || "").toString().trim())
        .input("CompanyCode", sql.Int, companyCode)
        .execute("sp_CottonPurchaseOrderDetails_Insert");
    }

    // Roll up the test min/max columns on the header.
    await new sql.Request(tx)
      .input("CPOCode", sql.Int, cpoCode)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_CottonPurchaseOrder_TestUpdate");

    // On edit, clear any pending approval so it re-enters the workflow.
    if (isEdit) {
      await new sql.Request(tx)
        .input("CPOCode", sql.Int, code)
        .input("CompanyCode", sql.Int, companyCode)
        .input("FYCode", sql.Int, fyCode)
        .execute("sp_CottonPurchaseOrderApproval_Delete");
    }

    await tx.commit();
    return sendSuccess(
      res,
      { CPOCode: cpoCode, CPONo: cpoNo },
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201,
    );
  } catch (err) {
    if (tx) {
      try {
        await tx.rollback();
      } catch (_) {}
    }
    console.error("DB Error (saveOrUpdateCottonPurchaseOrder):", err);
    return sendError(res, err);
  }
};

// POST /cotton-purchase-order/create
export const createCottonPurchaseOrder = (req, res) =>
  saveOrUpdate(req, res, false);

// PUT  /cotton-purchase-order/update/:code
export const updateCottonPurchaseOrder = (req, res) =>
  saveOrUpdate(req, res, true);

// DELETE /cotton-purchase-order/delete/:code -> sp_CottonPurchaseOrder_Delete
export const deleteCottonPurchaseOrder = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.code);
    if (!code) return sendError(res, "Invalid CPOCode", 400);

    const companyCode = getCompanyCode(req);
    const fyCode = getFYCode(req);
    const pool = await getPool(req.headers.subdbname);

    // Block delete if the cotton has already arrived (matches the WinForms guard).
    const arrived = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("CPOCode", sql.Int, code)
      .query(
        "Select 1 from tbl_CottonArrival Where CompanyCode = @CompanyCode AND CPOCode = @CPOCode",
      );
    if (arrived.recordset.length)
      return sendError(
        res,
        "The Order Cannot be Deleted, Because it has Arrived",
        409,
      );

    await pool
      .request()
      .input("CPOCode", sql.Int, code)
      .input("CompanyCode", sql.Int, companyCode)
      .input("FYCode", sql.Int, fyCode)
      .execute("sp_CottonPurchaseOrder_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(
        res,
        "You can not delete the Cotton Purchase Order!",
        409,
      );
    }
    console.error("DB Error (deleteCottonPurchaseOrder):", err);
    return sendError(res, err);
  }
};

// GET /cotton-purchase-order/options -> all the form lookups in one call.
export const getCottonPurchaseOrderOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);

    const [suppliers, agents, states, varieties, packingTypes, qualitySTDs] =
      await Promise.all([
        getSuppliers(pool, { usage: "cotton" }),
        getAgents(pool, { usage: "cotton" }),
        getStates(pool),
        getRawMaterials(pool),
        getPackingTypes(pool),
        getQualitySTDs(pool, { usage: "cotton" }),
      ]);

    return sendSuccess(res, {
      suppliers,
      agents,
      states,
      varieties,
      packingTypes,
      qualitySTDs,
      // WinForms combo indexes (sent as PaymentType / PayMode).
      paymentTypes: PAYMENT_TYPES,
      paymentModes: PAYMENT_MODES,
    });
  } catch (err) {
    console.error("DB Error (getCottonPurchaseOrderOptions):", err);
    return sendError(res, err);
  }
};

// GET /cotton-purchase-order/stations?stateCode= -> stations for a state (dependent).
export const getStationsByState = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const stations = await getStations(pool, toInt(req.query.stateCode));

    return sendSuccess(res, { stations });
  } catch (err) {
    console.error("DB Error (getStationsByState):", err);
    return sendError(res, err);
  }
};
