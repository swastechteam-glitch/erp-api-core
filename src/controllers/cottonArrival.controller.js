import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";
import {
  getAgents,
  getStations,
  getRawMaterials,
  getPackingTypes,
  getTaxes,
  getCottonPackingMaterials,
  getTransporters,
  getCottonArrivalTypes,
  PAYMENT_TYPES,
  PAYMENT_MODES,
} from "../utils/masters.js";

// ---------------------------------------------------------------------------
// Cotton Arrival / GRN (port of the WinForms frmCottonArrival)
//   A large goods-receipt transaction against a Cotton Purchase Order.
//   - List    : sp_CottonArrival_GetAll (@CompanyCode, @FYCode)
//   - One      : vw_CottonArrival header + vw_CottonArrivalDetails (tax rows)
//   - Options  : agents/stations/varieties/packingTypes/taxes/packingMaterials/
//               transporters/receiptTypes (+ payment enums) — GET /options
//   - CPO list : sp_CottonPurchaseOrder_PendingQty (the Pur. Order No dropdown)
//   - CPO one  : vw_CottonPurchaseOrder (autofill supplier/agent/station/rate…)
//   - Gate/WB  : pending gate-pass + weigh-bridge dropdowns
//   - Mill lot : sp_CottonArrival_MillLotNo (auto number)
//   - Save     : sp_CottonArrival_AddEdit (ExecuteScalar -> ArrivalCode) then
//                re-sync tax rows (sp_CottonArrivalDetails_Delete + _Insert).
//   - Delete   : blocked if weighment/QC exists, else sp_CottonArrival_Delete.
//
// Company from req.headers.companyCode, FY from req.headers.FYCode. The cotton
// season is the latest tbl_CottonSeation row (overridable via header/body).
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getFYCode = (req) => toInt(req.headers.FYCode);

// Latest cotton season (matches the WinForms "Max(SeationCode) from tbl_CottonSeation").
const resolveSeationCode = async (pool, req) => {
  const override = toInt(req.headers.seationcode ?? req.body?.SeationCode);
  if (override) return override;
  try {
    const r = await pool
      .request()
      .query("Select Max(SeationCode) AS SeationCode from tbl_CottonSeation");
    return toInt(r.recordset?.[0]?.SeationCode) || 1;
  } catch (_) {
    return 1;
  }
};

const D = (v) => (v ? new Date(v) : null);

// GET /cotton-arrival/lists
export const getCottonArrivalList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("FYCode", sql.Int, getFYCode(req))
      .execute("sp_CottonArrival_GetAll");
    const data = result.recordset
      .map((r) => ({ ...r, id: r.ArrivalCode }))
      .sort((a, b) => Number(b.ArrivalCode) - Number(a.ArrivalCode));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getCottonArrivalList):", err);
    return sendError(res, err);
  }
};

// GET /cotton-arrival/list/:code  -> header + tax detail rows
export const getCottonArrivalById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = parseInt(req.params.code);
    if (!code) return sendError(res, "Invalid ArrivalCode", 400);

    const companyCode = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    const head = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("ArrivalCode", sql.Int, code)
      .query(
        "Select * from vw_CottonArrival where CompanyCode = @CompanyCode AND ArrivalCode = @ArrivalCode"
      );
    if (!head.recordset.length)
      return sendError(res, "Cotton Arrival not found", 404);

    const details = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("ArrivalCode", sql.Int, code)
      .query(
        "Select * from vw_CottonArrivalDetails where CompanyCode = @CompanyCode AND ArrivalCode = @ArrivalCode"
      );

    return sendSuccess(res, {
      ...head.recordset[0],
      details: details.recordset || [],
    });
  } catch (err) {
    console.error("DB Error (getCottonArrivalById):", err);
    return sendError(res, err);
  }
};

// GET /cotton-arrival/options -> all the form lookups.
export const getCottonArrivalOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);

    const [agents, stations, varieties, packingTypes, taxes, packingMaterials, transporters, receiptTypes] =
      await Promise.all([
        getAgents(pool),
        getStations(pool),
        getRawMaterials(pool),
        getPackingTypes(pool),
        getTaxes(pool),
        getCottonPackingMaterials(pool),
        getTransporters(pool),
        getCottonArrivalTypes(pool),
      ]);

    return sendSuccess(res, {
      agents,
      stations,
      varieties,
      packingTypes,
      taxes,
      packingMaterials,
      transporters,
      // ReceiptType is saved by NAME (the WinForms sends CottonArrivalTypeName).
      receiptTypes,
      paymentTypes: PAYMENT_TYPES,
      paymentModes: PAYMENT_MODES,
    });
  } catch (err) {
    console.error("DB Error (getCottonArrivalOptions):", err);
    return sendError(res, err);
  }
};

// GET /cotton-arrival/cpo-pending -> Pur. Order No dropdown (with pending qty).
export const getCpoPending = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_CottonPurchaseOrder_PendingQty");
    return sendSuccess(res, {
      cpoList: (result.recordset || []).map((r) => ({
        value: r.CPOCode,
        label: r.StrCPONo ?? r.strCPONo ?? r.CPONo,
        ...r,
      })),
    });
  } catch (err) {
    console.error("DB Error (getCpoPending):", err);
    return sendError(res, err);
  }
};

// GET /cotton-arrival/cpo/:code -> a single CPO (autofill supplier/agent/etc).
export const getCpoById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = parseInt(req.params.code);
    if (!code) return sendError(res, "Invalid CPOCode", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("CPOCode", sql.Int, code)
      .query(
        "Select * from vw_CottonPurchaseOrder Where CompanyCode = @CompanyCode AND CPOCode = @CPOCode"
      );
    if (!result.recordset.length) return sendError(res, "CPO not found", 404);
    // vw_CottonPurchaseOrder has duplicate columns (mssql returns those as
    // arrays, e.g. AgentCode = [49,49]); collapse to the first scalar value.
    const r0 = result.recordset[0];
    const flat = {};
    for (const k of Object.keys(r0)) flat[k] = Array.isArray(r0[k]) ? r0[k][0] : r0[k];
    return sendSuccess(res, flat);
  } catch (err) {
    console.error("DB Error (getCpoById):", err);
    return sendError(res, err);
  }
};

// GET /cotton-arrival/gate-entries -> pending gate-pass dropdown.
export const getGateEntries = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .query(
        "Select * from vw_CottonArrival_GetPendingGatePassNo Where CompanyCode = @CompanyCode order by strGoodsPassNumber"
      );
    return sendSuccess(res, {
      gateEntries: (result.recordset || []).map((r) => ({
        value: r.GoodsInPassCode,
        label: r.strGoodsPassNumber1 ?? r.strGoodsPassNumber,
        ...r,
      })),
    });
  } catch (err) {
    console.error("DB Error (getGateEntries):", err);
    return sendError(res, err);
  }
};

// GET /cotton-arrival/weigh-bridges -> pending weigh-bridge dropdown.
export const getWeighBridges = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);
    // NOTE: the legacy WinForms query filtered `Cancel=0`, but this DB's
    // vw_WeighBridge has no such column, so that predicate is omitted.
    const result = await pool.request().query(
      "SELECT str_WeighmentNo,WeighCode,WeighmentDate,WeighingType,VehicleType,VehicleCode,VehicleNumber,GrossWeight,TareWeight,NetWeight,CompanyCode " +
        "FROM vw_WeighBridge where CompanyCode = " + companyCode +
        " AND WeighSectionCode = 2 AND WeighCode NOT IN (Select ISNULL(WeighCode,0) from tbl_CottonArrival where CompanyCode = " + companyCode +
        " ) and WeighmentDate >= '2019-08-21' Order by WeighmentNumber DESC"
    );
    return sendSuccess(res, {
      weighBridges: (result.recordset || []).map((r) => ({
        value: r.WeighCode,
        label: r.str_WeighmentNo,
        ...r,
      })),
    });
  } catch (err) {
    console.error("DB Error (getWeighBridges):", err);
    return sendError(res, err);
  }
};

// GET /cotton-arrival/mill-lot-no?receiptType= -> next mill lot number.
export const getMillLotNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const receiptType = (req.query.receiptType || "PARTY").toString();
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("ReceiptType", sql.NVarChar, receiptType)
      .input("FYCode", sql.Int, getFYCode(req))
      .execute("sp_CottonArrival_MillLotNo");
    const row = result.recordset?.[0];
    const millLotNo = row ? Object.values(row)[0] : "";
    return sendSuccess(res, { millLotNo });
  } catch (err) {
    console.error("DB Error (getMillLotNo):", err);
    return sendError(res, err);
  }
};

// Shared create/update -> sp_CottonArrival_AddEdit (btnSave_Click).
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
    const b = req.body || {};

    // Validations (mirror btnSave_Click).
    if (toInt(b.ReceiptTypeCode ?? b.ReceiptCode) < 0)
      return sendError(res, "Select the Receipt Type", 400);
    if (!(b.ReceiptType || "").toString().trim())
      return sendError(res, "Select the Receipt Type", 400);
    if (toInt(b.SupplierCode) <= 0) return sendError(res, "Select the Supplier Name", 400);
    if (toInt(b.AgentCode) <= 0) return sendError(res, "Select the Agent Name", 400);
    if (toInt(b.StationCode) <= 0) return sendError(res, "Select the Station", 400);
    if (toInt(b.RawMaterialCode) <= 0) return sendError(res, "Select the Variety", 400);
    if (toInt(b.PackingTypeCode) <= 0) return sendError(res, "Select the Packing Type", 400);
    if (toNum(b.Qty) <= 0) return sendError(res, "Enter the Purchase Qty", 400);
    if (toNum(b.Rate) <= 0) return sendError(res, "Enter the Purchase Rate", 400);
    if (toNum(b.PartyGrossWeight) <= 0)
      return sendError(res, "Gross Weight should not be Negative or 0", 400);
    if (toNum(b.PartyTareWeight) > toNum(b.PartyGrossWeight))
      return sendError(res, "Tare Weight should not be Greater than Gross Weight", 400);
    if (toInt(b.TransporterCode) <= 0)
      return sendError(res, "Select the Transporter Name", 400);

    const code = isEdit ? parseInt(req.params.code ?? b.ArrivalCode) : null;
    if (isEdit && !code) return sendError(res, "Invalid ArrivalCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const seationCode = await resolveSeationCode(pool, req);

    // ---- GST split + net amount, computed server-side (mirrors the WinForms) ----
    // CGST/SGST when company & supplier are in the same state, else IGST.
    const grossAmount = toNum(b.GrossAmount);
    let cgstPer = 0, cgstAmt = 0, sgstPer = 0, sgstAmt = 0, igstPer = 0, igstAmt = 0;
    if (toInt(b.TaxCode) > 0) {
      const taxRow = await pool
        .request()
        .input("TaxCode", sql.Int, toInt(b.TaxCode))
        .query("Select Tax from tbl_Tax Where TaxCode = @TaxCode");
      const taxPer = toNum(taxRow.recordset?.[0]?.Tax);

      const stateRow = await pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("SupplierCode", sql.Int, toInt(b.SupplierCode))
        .query(
          "Select (Select StateCode from tbl_Company Where CompanyCode=@CompanyCode) AS CompanyState, " +
            "(Select StateCode from tbl_Supplier Where SupplierCode=@SupplierCode) AS SupplierState"
        );
      const sameState =
        toInt(stateRow.recordset?.[0]?.CompanyState) ===
        toInt(stateRow.recordset?.[0]?.SupplierState);

      if (sameState) {
        cgstPer = taxPer / 2;
        sgstPer = taxPer / 2;
        cgstAmt = Math.round((cgstPer / 100) * grossAmount * 100) / 100;
        sgstAmt = Math.round((sgstPer / 100) * grossAmount * 100) / 100;
      } else {
        igstPer = taxPer;
        igstAmt = Math.round((igstPer / 100) * grossAmount * 100) / 100;
      }
    }
    const totalExpenses = cgstAmt + sgstAmt + igstAmt;
    // Net Amount = Gross + Total Tax + Round Off (the "Add freight" toggle is
    // hidden/off in the WinForms, so freight is not added by default).
    const netAmount = grossAmount + totalExpenses + toNum(b.RoundOff);

    // Only pass parameters the deployed proc actually declares — the
    // sp_CottonArrival_AddEdit schema varies between DBs (e.g. this one has
    // no @TDSAmount), so unknown params would otherwise error.
    let allowed = new Set();
    try {
      const ap = await pool
        .request()
        .query("SELECT REPLACE(name,'@','') AS n FROM sys.parameters WHERE object_id = OBJECT_ID('sp_CottonArrival_AddEdit')");
      allowed = new Set(ap.recordset.map((x) => String(x.n).toLowerCase()));
    } catch (_) { /* fall back to sending all params */ }

    tx = new sql.Transaction(pool);
    await tx.begin();

    const r = new sql.Request(tx);
    // Add an input only when the proc declares it (or when introspection failed).
    const add = (name, type, value) => {
      if (!allowed.size || allowed.has(String(name).toLowerCase())) r["input"](name, type, value);
    };
    if (isEdit) add("ArrivalCode", sql.Int, code);
    add("MillLotNo", sql.NVarChar, (b.MillLotNo || "").toString().trim());
    add("ArrivalDate", sql.DateTime, D(b.ArrivalDate) || new Date());
    if (toInt(b.CPOCode) > 0) add("CPOCode", sql.Int, toInt(b.CPOCode));
    add("SupplierCode", sql.Int, toInt(b.SupplierCode));
    add("AgentCode", sql.Int, toInt(b.AgentCode));
    add("StationCode", sql.Int, toInt(b.StationCode));
    add("PaymentType", sql.Int, toInt(b.PaymentType));
    add("PayMode", sql.Int, toInt(b.PayMode));
    add("PaymentDays", sql.Int, toInt(b.PaymentDays));
    add("RawMaterialCode", sql.Int, toInt(b.RawMaterialCode));
    add("PackingTypeCode", sql.Int, toInt(b.PackingTypeCode));
    add("Qty", sql.Decimal(18, 3), toNum(b.Qty));
    // The proc requires @CottonPackingMaterialCode, so always supply it. Use the
    // chosen Packing Material when set, else fall back to the Packing Type value.
    add(
      "CottonPackingMaterialCode",
      sql.Int,
      toInt(b.CottonPackingMaterialCode) > 0
        ? toInt(b.CottonPackingMaterialCode)
        : toInt(b.PackingTypeCode)
    );
    add("MixingCount", sql.Decimal(18, 2), toNum(b.MixingCount) || 30);
    add("CandyRate", sql.Decimal(18, 3), toNum(b.CandyRate));
    add("Rate", sql.Decimal(18, 8), toNum(b.Rate));
    add("PartyGrossWeight", sql.Decimal(18, 3), toNum(b.PartyGrossWeight));
    add("PartyTareWeight", sql.Decimal(18, 3), toNum(b.PartyTareWeight));
    add("PartyNetWeight", sql.Decimal(18, 3), toNum(b.PartyNetWeight));
    add("GrossAmount", sql.Decimal(18, 2), toNum(b.GrossAmount));
    // Gate-entry link is optional; only send it when a gate pass is chosen,
    // otherwise the FK to tbl_GateEntryGoodsIn rejects a 0.
    if (toInt(b.GoodsInPassCode) > 0)
      add("GoodsInPassCode", sql.Int, toInt(b.GoodsInPassCode));
    if ((b.GateEntryNo || "").toString().length) {
      add("GateEntryNo", sql.NVarChar, b.GateEntryNo.toString().trim());
      add("GateEntryDate", sql.DateTime, D(b.GateEntryDate) || new Date());
    }
    if ((b.PartyBillDCNo || "").toString().length) {
      add("PartyBillDCNo", sql.NVarChar, b.PartyBillDCNo.toString().trim());
      add("PartyBillDCDate", sql.DateTime, D(b.PartyBillDCDate) || new Date());
    }
    add("PartyLotNo", sql.NVarChar, (b.PartyLotNo || "").toString().trim());
    if ((b.MarketCommiteeNo || "").toString().length) {
      add("MarketCommiteeNo", sql.NVarChar, b.MarketCommiteeNo.toString().trim());
      add("MarketCommiteeDate", sql.DateTime, D(b.MarketCommiteeDate) || new Date());
    }
    if ((b.FormXXNo || "").toString().length) {
      add("FormXXNo", sql.NVarChar, b.FormXXNo.toString().trim());
      add("FormXXDate", sql.DateTime, D(b.FormXXDate) || new Date());
    }
    add("WayBillNo", sql.NVarChar, (b.WayBillNo || b.WeightBridgeWt || "").toString().trim());
    add("TransporterCode", sql.Int, toInt(b.TransporterCode));
    add("VehicleNo", sql.NVarChar, (b.VehicleNo || "").toString().trim());
    if ((b.LRNo || "").toString().length) {
      add("LRNo", sql.NVarChar, b.LRNo.toString().trim());
      add("LRDate", sql.DateTime, D(b.LRDate) || new Date());
    }
    add("TotalExpenses", sql.Decimal(18, 2), totalExpenses);
    add("FreightAmount", sql.Decimal(18, 2), toNum(b.FreightAmount));
    add("RoundOff", sql.Decimal(18, 2), toNum(b.RoundOff));
    add("NetAmount", sql.Decimal(18, 2), netAmount);
    add("Remarks", sql.NVarChar, (b.Remarks || "").toString().trim());
    add("ReceiptType", sql.NVarChar, (b.ReceiptType || "").toString().trim());
    // Weigh-bridge link is optional; omit when not selected (avoids FK on 0).
    if (toInt(b.WeighCode) > 0) add("WeighCode", sql.Int, toInt(b.WeighCode));
    add("PRONO", sql.NVarChar, (b.PRONo || b.PRONO || "").toString().trim());
    add("CGSTPer", sql.Decimal(18, 3), cgstPer);
    add("CGSTAmount", sql.Decimal(18, 2), cgstAmt);
    add("SGSTPer", sql.Decimal(18, 3), sgstPer);
    add("SGSTAmount", sql.Decimal(18, 2), sgstAmt);
    add("IGSTPer", sql.Decimal(18, 3), igstPer);
    add("IGSTAmount", sql.Decimal(18, 2), igstAmt);
    add("TaxCode", sql.Int, toInt(b.TaxCode));
    add("SeationCode", sql.Int, seationCode);
    add("TDSAmount", sql.Decimal(18, 2), toNum(b.TDSAmount));
    add("FYCode", sql.Int, fyCode);
    add("CompanyCode", sql.Int, companyCode);
    add("User", sql.Int, parseInt(userId));
    add("Node", sql.Int, parseInt(nodeCode));

    const headRes = await r.execute("sp_CottonArrival_AddEdit");
    const scalarRow = headRes.recordset?.[0];
    const arrivalCode = scalarRow ? toInt(Object.values(scalarRow)[0]) : code || 0;

    // Re-sync the tax / expense detail rows.
    await new sql.Request(tx)
      .input("ArrivalCode", sql.Int, arrivalCode)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_CottonArrivalDetails_Delete");

    const details = Array.isArray(b.details) ? b.details : [];
    for (const d of details) {
      await new sql.Request(tx)
        .input("ArrivalCode", sql.Int, arrivalCode)
        .input("Taxcode", sql.Int, toInt(d.TaxCode))
        .input("Tax", sql.Decimal(18, 3), toNum(d.Tax))
        .input("Amount", sql.Decimal(18, 2), toNum(d.Amount))
        .input("CompanyCode", sql.Int, companyCode)
        .execute("sp_CottonArrivalDetails_Insert");
    }

    await tx.commit();
    return sendSuccess(
      res,
      { ArrivalCode: arrivalCode },
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (tx) {
      try {
        await tx.rollback();
      } catch (_) {}
    }
    if (err.message && err.message.includes("FK_tbl_CottonArrival_tbl_Supplier_Code")) {
      return sendError(res, "Please approve the Supplier in the Supplier Master", 409);
    }
    console.error("DB Error (saveOrUpdateCottonArrival):", err);
    return sendError(res, err);
  }
};

export const createCottonArrival = (req, res) => saveOrUpdate(req, res, false);
export const updateCottonArrival = (req, res) => saveOrUpdate(req, res, true);

// DELETE /cotton-arrival/delete/:code
export const deleteCottonArrival = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = parseInt(req.params.code);
    if (!code) return sendError(res, "Invalid ArrivalCode", 400);

    const companyCode = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    // Blocked when weighment or quality test already exists for the lot.
    const weigh = await pool
      .request()
      .input("ArrivalCode", sql.Int, code)
      .query("Select 1 from tbl_CottonWeighment where ArrivalCode = @ArrivalCode");
    if (weigh.recordset.length)
      return sendError(res, "Delete Not Possible in this Lot", 409);

    const qc = await pool
      .request()
      .input("ArrivalCode", sql.Int, code)
      .query("Select 1 from tbl_CottonQualityTest where ArrivalCode = @ArrivalCode");
    if (qc.recordset.length)
      return sendError(res, "Delete Not Possible in this Lot", 409);

    await pool
      .request()
      .input("ArrivalCode", sql.Int, code)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_CottonArrival_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("REFERENCE") || err.message.includes("FK_"))) {
      return sendError(res, "You can not delete the Cotton Arrival!", 409);
    }
    console.error("DB Error (deleteCottonArrival):", err);
    return sendError(res, err);
  }
};
