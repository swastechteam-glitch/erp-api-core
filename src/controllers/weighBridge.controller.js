import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Weigh Bridge Entry  (port of frmWeighBridge).
//
//   Records a vehicle weighment: pick Transaction / Weigh Type (Empty=Tare,
//   Load=Gross) / Vehicle (Company from vw_Vehicle, or Private free-text) /
//   Section, enter Supplier / Material / Ref / Remarks and the weight. Net =
//   Gross - Tare (or Tare when no Gross). Save runs sp_WeighBridge_AddEdit. The
//   grid lists the vehicle's open Empty/Load weighments (sp_WeighBridge_EmptyLoad)
//   with edit / delete (sp_WeighBridge_Delete).
//
//   NOTE: the desktop reads the weight live off a serial (COM) scale and grabs a
//   camera image. A browser can't touch COM ports / IP cameras, so this port
//   uses MANUAL weight entry (the desktop's Manual mode) and stores no image.
//   A local "scale-bridge" helper can feed the reading later if wired up.
//
//   Company + financial-year scoped; user / node come from the auth token.
//
//   Endpoints
//     GET    /options                 vehicles + weigh sections + next No
//     GET    /empty-load?weighingType=&vehicleNumber=   open weighments grid
//     POST   /save                    sp_WeighBridge_AddEdit
//     DELETE /:weighCode              sp_WeighBridge_Delete
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
const pad = (n) => String(n).padStart(2, "0");
const ymd = (v) => {
  if (!v) return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  const m = String(v).match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : String(v).slice(0, 10);
};
const ddmmyyyy = (v) => {
  const d = ymd(v);
  return d ? d.split("-").reverse().join("/") : "";
};
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

// GET /weigh-bridge/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const fy = getFYCode(req);
    const pool = await getPool(req.headers.subdbname);

    const vRs = await pool.request().query("Select VehicleCode, RegistrationNumber from vw_Vehicle Where VehicleTypeCode = 1 and Status = 1");
    const vehicles = (vRs.recordset || []).map((x) => ({
      value: toInt(pick(x, "VehicleCode")),
      label: (pick(x, "RegistrationNumber") ?? "").toString(),
    }));

    const sRs = await pool.request().query("Select WeighSectionCode, WeighSection from tbl_WeighSection");
    const sections = (sRs.recordset || []).map((x) => ({
      value: toInt(pick(x, "WeighSectionCode")),
      label: (pick(x, "WeighSection") ?? "").toString(),
    }));

    let weighmentNumber = "";
    try {
      const noRs = await pool
        .request()
        .input("CompanyCode", sql.Int, cc)
        .input("FYCode", sql.Int, fy)
        .query("Select isnull(max(WeighmentNumber),0)+1 as No from tbl_WeighBridge Where CompanyCode = @CompanyCode AND FYCode = @FYCode");
      weighmentNumber = (pick((noRs.recordset || [])[0], "No") ?? "").toString();
    } catch {
      /* best-effort */
    }

    return sendSuccess(res, { vehicles, sections, weighmentNumber });
  } catch (err) {
    console.error("DB Error (WeighBridge.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /weigh-bridge/empty-load?weighingType=&vehicleNumber=
export const emptyLoad = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const weighingType = (req.query.weighingType ?? "").toString();
    const vehicleNumber = (req.query.vehicleNumber ?? "").toString();
    const pool = await getPool(req.headers.subdbname);

    const rs = await pool
      .request()
      .input("CompanyCode", sql.Int, cc)
      .input("WeighingType", sql.NVarChar, weighingType)
      .input("VehicleNumber", sql.NVarChar, vehicleNumber)
      .execute("sp_WeighBridge_EmptyLoad");
    const rows = (rs.recordset || []).map((row, i) => {
      const code = toInt(pick(row, "WeighCode"));
      return {
        id: code || i + 1,
        weighCode: code,
        weighmentNumber: toInt(pick(row, "WeighmentNumber")),
        weighmentDate: ddmmyyyy(pick(row, "WeighmentDate")),
        transactionType: toInt(pick(row, "TransactionType")),
        weighingType: (pick(row, "WeighingType") ?? "").toString(),
        vehicleType: (pick(row, "VehicleType") ?? "").toString(),
        vehicleCode: toInt(pick(row, "VehicleCode")),
        vehicleNumber: (pick(row, "VehicleNumber") ?? "").toString(),
        weighSectionCode: toInt(pick(row, "WeighSectionCode")),
        supplierName: (pick(row, "SupplierName") ?? "").toString(),
        materialName: (pick(row, "MaterialName") ?? "").toString(),
        refNo: (pick(row, "RefNo") ?? "").toString(),
        remarks: (pick(row, "Remarks") ?? "").toString(),
        tareWeight: toNum(pick(row, "TareWeight")),
        tareWeighmentTime: (pick(row, "TareWeighmentTime") ?? "").toString(),
        grossWeight: toNum(pick(row, "GrossWeight")),
        grossWeighmentTime: (pick(row, "GrossWeighmentTime") ?? "").toString(),
        netWeight: toNum(pick(row, "NetWeight")),
        _weighmentDate: ymd(pick(row, "WeighmentDate")),
      };
    });

    return sendSuccess(res, { rows });
  } catch (err) {
    console.error("DB Error (WeighBridge.emptyLoad):", err);
    return sendError(res, err);
  }
};

// POST /weigh-bridge/save  -> sp_WeighBridge_AddEdit
export const save = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode) return sendError(res, "Missing user context (userId / nodeCode)", 400);
    const companyCode = getCompanyCode(req);
    if (companyCode <= 0)
      return sendError(res, "You are logged in to a group of companies; switch to a single company.", 400);
    const fyCode = getFYCode(req);

    const b = req.body || {};
    const isEdit = toInt(b.weighCode) > 0;
    const weighmentNumber = toInt(b.weighmentNumber);
    const weighingType = (b.weighingType ?? "").toString().trim(); // "Empty" | "Load"
    const vehicleType = (b.vehicleType ?? "").toString().trim(); // "COMPANY" | "PRIVATE"
    const vehicleCode = toInt(b.vehicleCode);
    const vehicleNumber = (b.vehicleNumber ?? "").toString().trim();
    const weighSectionCode = toInt(b.weighSectionCode);
    const supplierName = (b.supplierName ?? "").toString().trim();
    const materialName = (b.materialName ?? "").toString().trim();
    const refNo = (b.refNo ?? "").toString().trim();
    const remarks = (b.remarks ?? "").toString().trim();
    const tareWeight = toNum(b.tareWeight);
    const grossWeight = toNum(b.grossWeight);
    const netWeight = grossWeight > 0 ? grossWeight - tareWeight : tareWeight;

    // validations (mirror btnSave, in order)
    if (weighmentNumber <= 0) return sendError(res, "Check the WeighBridge No....", 400);
    if (!weighingType) return sendError(res, "Select the Weighing Type......", 400);
    if (weighingType === "Empty" && tareWeight <= 0) return sendError(res, "Please Check the Empty Weight....", 400);
    if (weighingType === "Load" && grossWeight <= 0) return sendError(res, "Please Check the Load Weight....", 400);
    if (tareWeight === 0 && grossWeight === 0) return sendError(res, "Weight is Empty", 400);
    if (vehicleType === "COMPANY" && vehicleCode <= 0) return sendError(res, "Invalid Vehicle Number is given...", 400);
    if (vehicleType === "PRIVATE" && !vehicleNumber) return sendError(res, "Invalid Vehicle Number is given...", 400);
    if (weighSectionCode <= 0) return sendError(res, "Select the Weigh Section....", 400);
    if (!supplierName) return sendError(res, "Enter the Supplier Name....", 400);
    if (!materialName) return sendError(res, "Enter the Material Name ....", 400);
    if (!refNo) return sendError(res, "Enter the RefNo...", 400);
    if (!remarks) return sendError(res, "Enter the Remarks.........", 400);

    const pool = await getPool(req.headers.subdbname);
    const rq = pool.request();
    if (isEdit) rq.input("WeighCode", sql.Int, toInt(b.weighCode));
    rq.input("WeighmentNumber", sql.Int, weighmentNumber);
    rq.input("WeighmentDate", sql.VarChar(10), ymd(b.weighmentDate));
    rq.input("TransactionType", sql.Int, toInt(b.transactionType)); // FIRST=0 / SECOND=1
    rq.input("WeighingType", sql.NVarChar, weighingType);
    rq.input("VehicleType", sql.NVarChar, vehicleType);
    if (vehicleCode > 0) rq.input("VehicleCode", sql.Int, vehicleCode);
    rq.input("VehicleNumber", sql.NVarChar, vehicleNumber);
    rq.input("WeighSectionCode", sql.Int, weighSectionCode);
    rq.input("SupplierName", sql.NVarChar, supplierName);
    rq.input("MaterialName", sql.NVarChar, materialName);
    rq.input("RefNo", sql.NVarChar, refNo);
    rq.input("Remarks", sql.NVarChar, remarks);
    rq.input("TareWeighmentTime", sql.NVarChar, (b.tareWeighmentTime ?? "").toString());
    rq.input("TareWeight", sql.Decimal(18, 2), tareWeight);
    rq.input("GrossWeighmentTime", sql.NVarChar, (b.grossWeighmentTime ?? "").toString());
    rq.input("GrossWeight", sql.Decimal(18, 2), grossWeight);
    rq.input("NetWeight", sql.Decimal(18, 2), netWeight);
    rq.input("EntryMode", sql.Bit, b.entryMode ? true : false);
    rq.input("FYCode", sql.Int, fyCode);
    rq.input("User", sql.Int, parseInt(userId));
    rq.input("Node", sql.Int, parseInt(nodeCode));
    rq.input("CompanyCode", sql.Int, companyCode);

    const addRs = await rq.execute("sp_WeighBridge_AddEdit");
    const weighCode = toInt(Object.values((addRs.recordset || [])[0] || {})[0]) || toInt(b.weighCode);

    return sendSuccess(res, { weighCode }, "Records are updated Sucessfully...", isEdit ? 200 : 201);
  } catch (err) {
    console.error("DB Error (WeighBridge.save):", err);
    return sendError(res, err);
  }
};

// DELETE /weigh-bridge/:weighCode  -> sp_WeighBridge_Delete
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const weighCode = toInt(req.params.weighCode);
    if (weighCode <= 0) return sendError(res, "Invalid WeighCode", 400);
    const pool = await getPool(req.headers.subdbname);

    await pool.request().input("WeighCode", sql.Int, weighCode).input("CompanyCode", sql.Int, cc).execute("sp_WeighBridge_Delete");
    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    console.error("DB Error (WeighBridge.remove):", err);
    return sendError(res, err);
  }
};
