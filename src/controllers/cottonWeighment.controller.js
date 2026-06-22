import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Cotton Weighment (port of the WinForms frmCottonWeighment)
//   Bale-by-bale weighing of an arrived cotton lot.
//   - List    : sp_CottonWeighment_GetAll (@FYCode, @CompanyCode)
//   - One      : sp_CottonWeighment_GetAll row + vw_CottonWeighmentDetails (bales)
//   - Next no  : sp_CottonWeighment_No
//   - Mill lots: vw_CottonArrival not yet weighed (the Mill Lot No dropdown)
//   - Weigh br : pending weigh-bridge dropdown (vw_WeighBridge, section 2)
//   - Options  : godowns
//   - Save     : sp_CottonWeighment_AddEdit (ExecuteScalar -> WeighmentCode) then
//                re-sync bales (sp_CottonWeighmentDetails_Delete + _AddEdit loop)
//                + sp_CottonWeighmentDetails_Temp_Delete (clears the scratch grid).
//   - Delete   : blocked when the lot's bales are already issued, else
//                sp_CottonWeighment_Delete.
//
// The desktop-only bits (serial scale capture, barcode/label printing, Excel
// bulk import, "same weight" average, temp-table reload) are intentionally not
// ported — the web form manages the bale grid client-side and posts the array.
// Net = Gross - (Allowance + Sample + Tare); Allowance/Sample default to 0.
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

// GET /cotton-weighment/lists
export const getCottonWeighmentList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("FYCode", sql.Int, getFYCode(req))
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_CottonWeighment_GetAll");
    const data = result.recordset.map((r) => ({ ...r, id: r.WeighmentCode }));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getCottonWeighmentList):", err);
    return sendError(res, err);
  }
};

// GET /cotton-weighment/list/:code -> header (from GetAll) + bale detail rows
export const getCottonWeighmentById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = parseInt(req.params.code);
    if (!code) return sendError(res, "Invalid WeighmentCode", 400);

    const companyCode = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    const listRes = await pool
      .request()
      .input("FYCode", sql.Int, getFYCode(req))
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_CottonWeighment_GetAll");
    const row = listRes.recordset.find((r) => parseInt(r.WeighmentCode) === code);
    if (!row) return sendError(res, "Cotton Weighment not found", 404);

    const det = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("WeighmentCode", sql.Int, code)
      .query(
        "Select * from vw_CottonWeighmentDetails Where CompanyCode = @CompanyCode AND WeighmentCode = @WeighmentCode"
      );

    return sendSuccess(res, { ...row, details: det.recordset || [] });
  } catch (err) {
    console.error("DB Error (getCottonWeighmentById):", err);
    return sendError(res, err);
  }
};

// GET /cotton-weighment/next-no
export const getCottonWeighmentNextNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("FYCode", sql.Int, getFYCode(req))
      .execute("sp_CottonWeighment_No");
    const row = r.recordset?.[0];
    return sendSuccess(res, { nextNo: row ? toInt(Object.values(row)[0]) : 0 });
  } catch (err) {
    console.error("DB Error (getCottonWeighmentNextNo):", err);
    return sendError(res, err);
  }
};

// GET /cotton-weighment/mill-lots -> arrivals not yet weighed (Mill Lot dropdown).
export const getMillLots = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().query(
      "Select * from vw_CottonArrival where CompanyCode = " + companyCode +
        " AND ArrivalCode NOT IN (select ArrivalCode from tbl_CottonWeighment Where CompanyCode = " + companyCode +
        ") AND ArrivalDate > '2016-11-01'"
    );
    return sendSuccess(res, {
      millLots: (result.recordset || []).map((r) => ({
        value: r.ArrivalCode,
        label: r.MillLotNo,
        ...r,
      })),
    });
  } catch (err) {
    console.error("DB Error (getMillLots):", err);
    return sendError(res, err);
  }
};

// GET /cotton-weighment/weigh-bridges -> pending weigh-bridge dropdown.
export const getWeighBridges = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().query(
      "Select str_WeighmentNo,WeighCode,WeighmentDate,VehicleNumber,GrossWeight,TareWeight,NetWeight,CompanyCode " +
        "from vw_WeighBridge where CompanyCode = " + companyCode +
        " AND WeighSectionCode = 2 and WeighmentDate >= '2018-02-01' Order by WeighmentNumber DESC"
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

// GET /cotton-weighment/options -> godown lookup.
export const getCottonWeighmentOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const godowns = await pool
      .request()
      .query("Select GodownCode, GodownName from tbl_Godown Order by GodownName");
    return sendSuccess(res, {
      godowns: godowns.recordset.map((r) => ({ value: r.GodownCode, label: r.GodownName })),
    });
  } catch (err) {
    console.error("DB Error (getCottonWeighmentOptions):", err);
    return sendError(res, err);
  }
};

// Shared create/update -> sp_CottonWeighment_AddEdit (btnSave_Click).
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
    const bales = Array.isArray(b.details) ? b.details : [];

    // Validations (mirror btnSave_Click).
    if (toInt(b.ArrivalCode) <= 0) return sendError(res, "Select the Mill Lot No", 400);
    if (toInt(b.WeighCode) <= 0) return sendError(res, "Select the WeighBridge No", 400);
    if (toInt(b.GodownCode) <= 0) return sendError(res, "Select the Godown", 400);
    if (!bales.length) return sendError(res, "Add at least one bale", 400);
    if (toNum(b.ArrivalQty) > 0 && bales.length !== toNum(b.ArrivalQty))
      return sendError(res, "Check the Arrival / Weighment Qty", 400);

    const code = isEdit ? parseInt(req.params.code ?? b.WeighmentCode) : null;
    if (isEdit && !code) return sendError(res, "Invalid WeighmentCode for update", 400);

    // Totals from the bale grid.
    const millLotNo = (b.MillLotNo || "").toString().trim();
    const norm = bales.map((d, i) => {
      const gross = toNum(d.GrossWeight ?? d.GrossWt);
      const allow = toNum(d.Allowance);
      const sample = toNum(d.SampleWeight ?? d.Sample);
      const tare = toNum(d.TareWeight ?? d.Tare);
      const net = toNum(d.NetWeight ?? d.Net) || gross - (allow + sample + tare);
      const baleNo = toInt(d.BaleNo);
      const barCode =
        (d.BarCode || "").toString().trim() ||
        `${millLotNo}${String(baleNo).padStart(3, "0")}`;
      return { sno: i + 1, baleNo, gross, allow, sample, tare, net, barCode };
    });
    const totGross = norm.reduce((s, x) => s + x.gross, 0);
    const totAllow = norm.reduce((s, x) => s + x.allow, 0);
    const totSample = norm.reduce((s, x) => s + x.sample, 0);
    const totTare = norm.reduce((s, x) => s + x.tare, 0);
    const totNet = norm.reduce((s, x) => s + x.net, 0);

    const pool = await getPool(req.headers.subdbname);

    // Stock-approval setting (pass @StockApproval=1 when configured).
    let stockApproval = 0;
    try {
      const s = await pool
        .request()
        .query("Select 1 AS f from tbl_Setting WHERE CottonWeighmentApproval = 1");
      stockApproval = s.recordset.length ? 1 : 0;
    } catch (_) {}

    tx = new sql.Transaction(pool);
    await tx.begin();

    const head = new sql.Request(tx);
    if (isEdit) head.input("WeighmentCode", sql.Int, code);
    head.input("WeighmentNo", sql.Int, toInt(b.WeighmentNo));
    head.input("WeighmentDate", sql.DateTime, b.WeighmentDate ? new Date(b.WeighmentDate) : new Date());
    head.input("ArrivalCode", sql.Int, toInt(b.ArrivalCode));
    head.input("NoofBales", sql.Int, norm.length);
    head.input("TotalGrossWeight", sql.Decimal(18, 3), totGross);
    head.input("TotalAllowance", sql.Decimal(18, 3), totAllow);
    head.input("TotalSamplesWeight", sql.Decimal(18, 3), totSample);
    head.input("TotalTareWeight", sql.Decimal(18, 3), totTare);
    head.input("TotalNetWeight", sql.Decimal(18, 3), totNet);
    head.input("WeighBridgeGrossWt", sql.Decimal(18, 3), toNum(b.WeighBridgeGrossWt));
    head.input("WeighBridgeTareWt", sql.Decimal(18, 3), toNum(b.WeighBridgeTareWt));
    head.input("WeighBridgeNetWt", sql.Decimal(18, 3), toNum(b.WeighBridgeNetWt));
    head.input("GodownCode", sql.Int, toInt(b.GodownCode));
    head.input("WeighCode", sql.Int, toInt(b.WeighCode));
    head.input("FYCode", sql.Int, fyCode);
    if (stockApproval) head.input("StockApproval", sql.Bit, 1);
    head.input("CompanyCode", sql.Int, companyCode);
    head.input("User", sql.Int, parseInt(userId));
    head.input("Node", sql.Int, parseInt(nodeCode));

    const headRes = await head.execute("sp_CottonWeighment_AddEdit");
    const scalarRow = headRes.recordset?.[0];
    const weighmentCode = scalarRow ? toInt(Object.values(scalarRow)[0]) : code || 0;

    await new sql.Request(tx)
      .input("WeighmentCode", sql.Int, weighmentCode)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_CottonWeighmentDetails_Delete");

    for (const d of norm) {
      await new sql.Request(tx)
        .input("WeighmentCode", sql.Int, weighmentCode)
        .input("SNo", sql.Int, d.sno)
        .input("BaleNo", sql.Int, d.baleNo)
        .input("GrossWeight", sql.Decimal(18, 3), d.gross)
        .input("Allowance", sql.Decimal(18, 3), d.allow)
        .input("SampleWeight", sql.Decimal(18, 3), d.sample)
        .input("TareWeight", sql.Decimal(18, 3), d.tare)
        .input("NetWeight", sql.Decimal(18, 3), d.net)
        .input("BarCode", sql.NVarChar, d.barCode)
        .input("CompanyCode", sql.Int, companyCode)
        .execute("sp_CottonWeighmentDetails_AddEdit");
    }

    // Clear the scratch (temp) bale grid for this company.
    try {
      await new sql.Request(tx)
        .input("CompanyCode", sql.Int, companyCode)
        .execute("sp_CottonWeighmentDetails_Temp_Delete");
    } catch (_) {}

    await tx.commit();
    return sendSuccess(
      res,
      { WeighmentCode: weighmentCode },
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (tx) {
      try {
        await tx.rollback();
      } catch (_) {}
    }
    console.error("DB Error (saveOrUpdateCottonWeighment):", err);
    return sendError(res, err);
  }
};

export const createCottonWeighment = (req, res) => saveOrUpdate(req, res, false);
export const updateCottonWeighment = (req, res) => saveOrUpdate(req, res, true);

// DELETE /cotton-weighment/delete/:code
export const deleteCottonWeighment = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = parseInt(req.params.code);
    if (!code) return sendError(res, "Invalid WeighmentCode", 400);

    const companyCode = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    // Blocked once the lot's bales have been issued (matches the WinForms guard).
    const issued = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("WeighmentCode", sql.Int, code)
      .query(
        "Select 1 from vw_CottonIssueDetails Where CompanyCode = @CompanyCode AND WeighmentCode = @WeighmentCode"
      );
    if (issued.recordset.length)
      return sendError(res, "This Weighment's Bales are already issued", 409);

    await pool
      .request()
      .input("WeighmentCode", sql.Int, code)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_CottonWeighment_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("REFERENCE") || err.message.includes("FK_"))) {
      return sendError(res, "You can not delete the Cotton Weighment!", 409);
    }
    console.error("DB Error (deleteCottonWeighment):", err);
    return sendError(res, err);
  }
};
