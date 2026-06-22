import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Cotton Quality Test / CQT (port of the WinForms frmCottonTest)
//   Records lab test results for an arrived cotton lot against a quality STD.
//   - Options  : Mill Lot dropdown (vw_CottonArrival not yet tested) carrying
//                supplier/agent/station/variety/qty/CQTSTD/CPO codes; plus the
//                Quality STD list + the lookup maps for the read-only Lot panel.
//   - Next no  : sp_CottonQualityTest_CQTNo (@CompanyCode, @FYCode)
//   - Load     : the parameter grid for a lot — from the lot's CPO test detail
//                (vw_CottonPurchaseOrderDetails) or, when none / "Sel" is on,
//                from the chosen Quality STD (vw_CQTSTDDetails).
//   - List     : sp_CottonQualityTest_GetAll (@CompanyCode, @FYCode)
//   - One      : GetAll row + vw_CottonQualityTestDetails (the test rows)
//   - Save     : sp_CottonQualityTest_AddEdit (ExecuteScalar -> CQTCode) then
//                re-sync rows (sp_CottonQualityTestDetails_Delete + _Insert for
//                rows with a Test value) + optional sp_CottonQualityTest_Update_Sample.
//   - Delete   : sp_CottonQualityTest_Delete (@CQTCode, @CompanyCode, @ArrivalCode).
//
// Company from req.headers.companyCode, FY from req.headers.FYCode; AddEdit also
// needs @User / @Node from req.headers.userId / nodeCode.
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
const D = (v) => (v ? new Date(v) : null);

// Collapse a CPO-detail or STD-detail row into the one shape the grid uses.
const normalizeParam = (r, fromStd) => ({
  CQTParameterCode: toInt(r.CQTParameterCode),
  CQTParameterName: (r.CQTParameterName || "").toString().trim(),
  FromParameter: fromStd ? toNum(r.CQTParameterFrom) : toNum(r.FromParameter),
  FromParameter1: ((fromStd ? r.CQTParameterFrom1 : r.From1) || "").toString().trim(),
  ToParameter: fromStd ? toNum(r.CQTParameterTo) : toNum(r.ToParameter),
  ToParameter1: ((fromStd ? r.CQTParameterTo1 : r.To1) || "").toString().trim(),
  PartyFrom: (fromStd ? r.CQTParameterFrom : r.PartyFrom) ?? "",
  PartyFrom1: ((fromStd ? r.CQTParameterFrom1 : r.PartyFrom1) || "").toString().trim(),
  PartyTo: (fromStd ? r.CQTParameterTo : r.PartyTo) ?? "",
  PartyTo1: ((fromStd ? r.CQTParameterTo1 : r.PartyTo1) || "").toString().trim(),
  Test: "",
});

// GET /cotton-quality-test/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    const [millLots, qualitySTDs, agents, stations, varieties, suppliers] =
      await Promise.all([
        pool
          .request()
          .input("CompanyCode", sql.Int, companyCode)
          .query(
            "Select MillLotNo, ArrivalCode, SupplierCode, AgentCode, StationCode, RawMaterialCode, Qty, CQTSTDCode, CPOCode " +
              "from vw_CottonArrival Where CompanyCode = @CompanyCode " +
              "AND ArrivalCode NOT IN (Select ArrivalCode from tbl_CottonQualityTest where CompanyCode = @CompanyCode) " +
              "AND ArrivalDate >= '2024-01-01' Order by MillLotNo DESC"
          ),
        pool
          .request()
          .query("Select CQTSTDCode, CQTSTDName from tbl_CQTSTD WHERE ISNULL(Cotton,0) = 1 Order by CQTSTDName"),
        pool.request().query("Select AgentCode, AgentName from tbl_Agent Order by AgentName"),
        pool.request().query("Select StationCode, StationName from tbl_Station Order by StationName"),
        pool.request().query("Select RawMaterialCode, RawMaterialName from tbl_RawMaterial Order by RawMaterialName"),
        pool.request().query("Select SupplierCode, SupplierName from tbl_Supplier Order by SupplierName"),
      ]);

    return sendSuccess(res, {
      millLots: (millLots.recordset || []).map((r) => ({
        value: r.ArrivalCode,
        label: r.MillLotNo,
        ...r,
      })),
      qualitySTDs: qualitySTDs.recordset.map((r) => ({ value: r.CQTSTDCode, label: r.CQTSTDName })),
      agents: agents.recordset.map((r) => ({ value: r.AgentCode, label: r.AgentName })),
      stations: stations.recordset.map((r) => ({ value: r.StationCode, label: r.StationName })),
      varieties: varieties.recordset.map((r) => ({ value: r.RawMaterialCode, label: r.RawMaterialName })),
      suppliers: suppliers.recordset.map((r) => ({ value: r.SupplierCode, label: r.SupplierName })),
    });
  } catch (err) {
    console.error("DB Error (CottonQualityTest.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /cotton-quality-test/next-no
export const getNextNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("FYCode", sql.Int, getFYCode(req))
      .execute("sp_CottonQualityTest_CQTNo");
    const row = r.recordset?.[0];
    return sendSuccess(res, { nextNo: row ? toInt(Object.values(row)[0]) : 0 });
  } catch (err) {
    console.error("DB Error (CottonQualityTest.getNextNo):", err);
    return sendError(res, err);
  }
};

// GET /cotton-quality-test/load/:arrivalCode?useStd=&qualityStdCode=
//   Returns the parameter grid for a lot. Mirrors the WinForms btnLoad:
//   from the lot's CPO test detail, or from a Quality STD when there is no CPO
//   or the user ticked "Sel" (useStd=1).
export const getLoad = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const arrivalCode = parseInt(req.params.arrivalCode);
    if (!arrivalCode) return sendError(res, "Invalid ArrivalCode", 400);

    const companyCode = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    const lotRes = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("ArrivalCode", sql.Int, arrivalCode)
      .query(
        "Select * from vw_CottonArrival Where CompanyCode = @CompanyCode AND ArrivalCode = @ArrivalCode"
      );
    if (!lotRes.recordset.length) return sendError(res, "Lot not found", 404);
    const lot = lotRes.recordset[0];

    const useStd = String(req.query.useStd) === "1";
    const cpoCode = toInt(lot.CPOCode);
    const qualityStdCode = toInt(req.query.qualityStdCode) || toInt(lot.CQTSTDCode);

    let parameters = [];
    if (!useStd && cpoCode > 0) {
      const det = await pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("CPOCode", sql.Int, cpoCode)
        .query(
          "Select * from vw_CottonPurchaseOrderDetails where CompanyCode = @CompanyCode AND CPOCode = @CPOCode Order by OrderNo"
        );
      parameters = (det.recordset || []).map((r) => normalizeParam(r, false));
    } else if (qualityStdCode > 0) {
      const det = await pool
        .request()
        .input("CQTSTDCode", sql.Int, qualityStdCode)
        .query("Select * from vw_CQTSTDDetails Where CQTSTDCode = @CQTSTDCode Order by OrderNo");
      parameters = (det.recordset || []).map((r) => normalizeParam(r, true));
    }

    return sendSuccess(res, {
      lot: {
        ArrivalCode: arrivalCode,
        MillLotNo: lot.MillLotNo,
        SupplierCode: toInt(lot.SupplierCode),
        AgentCode: toInt(lot.AgentCode),
        StationCode: toInt(lot.StationCode),
        RawMaterialCode: toInt(lot.RawMaterialCode),
        Qty: toNum(lot.Qty),
        CQTSTDCode: toInt(lot.CQTSTDCode),
        CPOCode: cpoCode,
      },
      // When the lot is tied to a CPO the STD is fixed; else the user may pick one.
      qualityStdLocked: cpoCode > 0 && !useStd,
      parameters,
    });
  } catch (err) {
    console.error("DB Error (CottonQualityTest.getLoad):", err);
    return sendError(res, err);
  }
};

// GET /cotton-quality-test/lists
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("FYCode", sql.Int, getFYCode(req))
      .execute("sp_CottonQualityTest_GetAll");
    const data = result.recordset
      .map((r) => ({ ...r, id: r.CQTCode }))
      .sort((a, b) => Number(b.CQTCode) - Number(a.CQTCode));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (CottonQualityTest.getList):", err);
    return sendError(res, err);
  }
};

// GET /cotton-quality-test/list/:code -> header + test rows
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = parseInt(req.params.code);
    if (!code) return sendError(res, "Invalid CQTCode", 400);

    const companyCode = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    const listRes = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("FYCode", sql.Int, getFYCode(req))
      .execute("sp_CottonQualityTest_GetAll");
    const row = listRes.recordset.find((r) => parseInt(r.CQTCode) === code);
    if (!row) return sendError(res, "Cotton Quality Test not found", 404);

    const det = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("CQTCode", sql.Int, code)
      .query(
        "Select * from vw_CottonQualityTestDetails Where CompanyCode = @CompanyCode AND CQTCode = @CQTCode"
      );

    const details = (det.recordset || []).map((r) => ({
      CQTParameterCode: toInt(r.CQTParameterCode),
      CQTParameterName: (r.CQTParameterName || "").toString().trim(),
      FromParameter: toNum(r.CQTParameterFrom),
      FromParameter1: (r.CQTParameterFrom1 || "").toString().trim(),
      ToParameter: toNum(r.CQTParameterTo),
      ToParameter1: (r.CQTParameterTo1 || "").toString().trim(),
      PartyFrom: r.PartyFrom ?? "",
      PartyFrom1: (r.PartyFrom1 || "").toString().trim(),
      PartyTo: r.PartyTo ?? "",
      PartyTo1: (r.PartyTo1 || "").toString().trim(),
      Test: r.TestResult ?? "",
    }));

    return sendSuccess(res, { ...row, details });
  } catch (err) {
    console.error("DB Error (CottonQualityTest.getById):", err);
    return sendError(res, err);
  }
};

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
    const code = isEdit ? parseInt(req.params.code) : 0;
    const b = req.body || {};

    if (toInt(b.ArrivalCode) <= 0) return sendError(res, "Select the Mill Lot No", 400);

    const pool = await getPool(req.headers.subdbname);
    tx = new sql.Transaction(pool);
    await tx.begin();

    const head = new sql.Request(tx);
    if (isEdit && code) head.input("CQTCode", sql.Int, code);
    head.input("CQTNo", sql.Int, toInt(b.CQTNo));
    head.input("CQTDate", sql.DateTime, D(b.CQTDate) || new Date());
    head.input("ArrivalCode", sql.Int, toInt(b.ArrivalCode));
    head.input("CQTStdCode", sql.Int, toInt(b.CQTStdCode));
    head.input("Remarks", sql.NVarChar, (b.Remarks || "").toString().trim());
    head.input("FYCode", sql.Int, fyCode);
    head.input("CompanyCode", sql.Int, companyCode);
    head.input("User", sql.Int, parseInt(userId));
    head.input("Node", sql.Int, parseInt(nodeCode));

    const headRes = await head.execute("sp_CottonQualityTest_AddEdit");
    const scalarRow = headRes.recordset?.[0];
    const cqtCode = scalarRow ? toInt(Object.values(scalarRow)[0]) : code || 0;

    await new sql.Request(tx)
      .input("CQTCode", sql.Int, cqtCode)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_CottonQualityTestDetails_Delete");

    // Only rows with an entered Test value are persisted (matches the WinForms).
    const details = Array.isArray(b.details) ? b.details : [];
    for (const d of details) {
      if (toNum(d.Test) <= 0) continue;
      await new sql.Request(tx)
        .input("CQTCode", sql.Int, cqtCode)
        .input("CQTParameterCode", sql.Int, toInt(d.CQTParameterCode))
        .input("CQTParameterFrom", sql.Decimal(18, 2), toNum(d.FromParameter))
        .input("CQTParameterFrom1", sql.NVarChar, (d.FromParameter1 || "").toString().trim())
        .input("CQTParameterTo", sql.Decimal(18, 2), toNum(d.ToParameter))
        .input("CQTParameterTo1", sql.NVarChar, (d.ToParameter1 || "").toString().trim())
        .input("PartyFrom", sql.Decimal(18, 2), toNum(d.PartyFrom))
        .input("PartyFrom1", sql.NVarChar, (d.PartyFrom1 || "").toString().trim())
        .input("PartyTo", sql.Decimal(18, 2), toNum(d.PartyTo))
        .input("PartyTo1", sql.NVarChar, (d.PartyTo1 || "").toString().trim())
        .input("TestResult", sql.Decimal(18, 2), toNum(d.Test))
        .input("CompanyCode", sql.Int, companyCode)
        .execute("sp_CottonQualityTestDetails_Insert");
    }

    // Optional: tie back to the sample test (CTR No) when one was chosen.
    if (toInt(b.SCQTCode) > 0) {
      await new sql.Request(tx)
        .input("ArrivalCode", sql.Int, toInt(b.ArrivalCode))
        .input("SCQTCode", sql.Int, toInt(b.SCQTCode))
        .execute("sp_CottonQualityTest_Update_Sample");
    }

    await tx.commit();
    return sendSuccess(
      res,
      { CQTCode: cqtCode },
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (tx) {
      try {
        await tx.rollback();
      } catch (_) {}
    }
    console.error("DB Error (saveOrUpdateCottonQualityTest):", err);
    return sendError(res, err);
  }
};

export const create = (req, res) => saveOrUpdate(req, res, false);
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /cotton-quality-test/delete/:code?arrivalCode=
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = parseInt(req.params.code);
    if (!code) return sendError(res, "Invalid CQTCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("CQTCode", sql.Int, code)
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("ArrivalCode", sql.Int, toInt(req.query.arrivalCode))
      .execute("sp_CottonQualityTest_Delete");
    return sendSuccess(res, { CQTCode: code }, "The record is deleted");
  } catch (err) {
    console.error("DB Error (CottonQualityTest.remove):", err);
    return sendError(res, err);
  }
};
