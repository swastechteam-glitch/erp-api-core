import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// RawMaterial Weight List Approval / Cotton Weight Approval for Payment
//   (port of the WinForms frmCottonPayment_WeightApproval). Cross-company. Pick
//   a Company -> its weighed lots pending payment-weight approval. View a lot:
//   it shows the Party / Weigh-Bridge / Weighment net weights; choose which is
//   the "Selected Weight", pick the lot's Cotton Quality Test (fills PO/QC/Std
//   trash & moisture), enter the MD-allowance trash/moisture %, and the final
//   Approval Weight = Selected - TrashKg - MoistureKg is computed. Approve:
//     UPDATE tbl_CottonWeighment SET ApprovalWeight = <final>, AWApproval_*
//     EXEC sp_CottonWeighment_ApprovalDetails_ADD (snapshot of the decision)
//
//   - GET  /cotton-weight-approval/options                    -> companies + lookup maps
//   - GET  /cotton-weight-approval/pendings?companyCode=      -> sp_CottonWeightApproval_Payment_Pending (paginated)
//   - GET  /cotton-weight-approval/detail/:weighmentCode?companyCode= -> vw_CottonWeighment row + QC tests
//   - POST /cotton-weight-approval/approve                    -> UPDATE + sp_CottonWeighment_ApprovalDetails_ADD
//
// CROSS-COMPANY: the Company is chosen in the screen, so pendings/detail/approve
// use that selected CompanyCode (query/body), falling back to req.headers.companyCode.
// @User/@Node from req.headers.userId / nodeCode. Trash/Moisture Kgs and the
// final approval weight are recomputed SERVER-SIDE (client figures are preview).
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};
const resolveCompany = (req, fromBody) =>
  toInt(fromBody ?? req.query.companyCode) || toInt(req.headers.companyCode);

// GET /cotton-weight-approval/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);

    const [companies, suppliers, agents, stations, varieties, packingTypes, godowns] =
      await Promise.all([
        pool.request().execute("sp_Company_GetAll"),
        pool.request().query("Select SupplierCode, SupplierName from tbl_Supplier Order by SupplierName"),
        pool.request().query("Select AgentCode, AgentName from tbl_Agent Order by AgentName"),
        pool.request().query("Select StationCode, StationName from tbl_Station Order by StationName"),
        pool.request().query("Select RawMaterialCode, RawMaterialName from tbl_RawMaterial Order by RawMaterialName"),
        pool.request().query("Select PackingTypeCode, PackingType from tbl_PackingType Order by PackingType"),
        pool.request().query("Select GodownCode, GodownName from tbl_Godown Order by GodownName"),
      ]);

    return sendSuccess(res, {
      companies: (companies.recordset || []).map((r) => ({
        value: r.CompanyCode,
        label: (r.CompanyName || "").toString().trim(),
      })),
      suppliers: (suppliers.recordset || []).map((r) => ({ value: r.SupplierCode, label: r.SupplierName })),
      agents: (agents.recordset || []).map((r) => ({ value: r.AgentCode, label: r.AgentName })),
      stations: (stations.recordset || []).map((r) => ({ value: r.StationCode, label: r.StationName })),
      varieties: (varieties.recordset || []).map((r) => ({ value: r.RawMaterialCode, label: r.RawMaterialName })),
      packingTypes: (packingTypes.recordset || []).map((r) => ({ value: r.PackingTypeCode, label: r.PackingType })),
      godowns: (godowns.recordset || []).map((r) => ({ value: r.GodownCode, label: r.GodownName })),
    });
  } catch (err) {
    console.error("DB Error (CottonWeightApproval.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /cotton-weight-approval/pendings?companyCode= -> pending lots (paginated).
export const getPendings = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = resolveCompany(req);
    if (companyCode <= 0) return sendSuccess(res, []);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_CottonWeightApproval_Payment_Pending");
    const data = (result.recordset || []).map((r) => ({
      ...r,
      id: r.WeighmentCode ?? r.CPOCode,
    }));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (CottonWeightApproval.getPendings):", err);
    return sendError(res, err);
  }
};

// GET /cotton-weight-approval/detail/:weighmentCode?companyCode= -> weighment + QC tests.
export const getDetail = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Invalid", 400);
    const weighmentCode = parseInt(req.params.weighmentCode);
    if (!weighmentCode) return sendError(res, "Invalid WeighmentCode", 400);
    const companyCode = resolveCompany(req);
    const pool = await getPool(req.headers.subdbname);

    const wRes = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("WeighmentCode", sql.Int, weighmentCode)
      .query(
        "Select * from vw_CottonWeighment Where CompanyCode = @CompanyCode AND WeighmentCode = @WeighmentCode",
      );
    const w = wRes.recordset?.[0];
    if (!w) return sendError(res, "Weighment not found", 404);

    const arrivalCode = toInt(w.ArrivalCode);
    const qRes = await pool
      .request()
      .input("ArrivalCode", sql.Int, arrivalCode)
      .execute("sp_QualityTestResult_PurchaseOrder");
    const qcTests = (qRes.recordset || []).map((x) => ({
      value: x.CQTCode,
      label: x.CQTNo,
      POT_Trash: toNum(x.POT_Trash),
      POT_Moisture: toNum(x.POT_Moisture),
      QCR_Trash: toNum(x.QCR_Trash),
      QCR_Moisture: toNum(x.QCR_Moisture),
      Diff_Trash: toNum(x.Diff_Trash),
      Diff_Moisture: toNum(x.Diff_Moisture),
    }));

    const weighment = {
      WeighmentCode: weighmentCode,
      ArrivalCode: arrivalCode,
      CPONo: w.CPONo ?? "",
      MillLotNo: (w.MillLotNo || "").toString().trim(),
      SupplierCode: toInt(w.SupplierCode),
      AgentCode: toInt(w.AgentCode),
      StationCode: toInt(w.StationCode),
      PackingTypeCode: toInt(w.PackingTypeCode),
      RawMaterialCode: toInt(w.RawMaterialCode),
      GodownCode: toInt(w.GodownCode),
      NoofBales: toNum(w.NoofBales),
      PartyGrossWeight: toNum(w.PartyGrossWeight),
      PartyTareWeight: toNum(w.PartyTareWeight),
      PartyNetWeight: toNum(w.PartyNetWeight),
      WeighBridgeGrossWt: toNum(w.WeighBridgeGrossWt),
      WeighBridgeTareWt: toNum(w.WeighBridgeTareWt),
      WeighBridgeNetWt: toNum(w.WeighBridgeNetWt),
      TotalGrossWeight: toNum(w.TotalGrossWeight),
      TotalTareWeight: toNum(w.TotalTareWeight),
      TotalNetWeight: toNum(w.TotalNetWeight),
      Remarks: (w.Remarks || "").toString().trim(),
    };
    return sendSuccess(res, { weighment, qcTests });
  } catch (err) {
    console.error("DB Error (CottonWeightApproval.getDetail):", err);
    return sendError(res, err);
  }
};

// POST /cotton-weight-approval/approve
export const approve = async (req, res) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const b = req.body || {};
    const companyCode = resolveCompany(req, b.CompanyCode);
    if (companyCode <= 0) return sendError(res, "Select the Company", 400);
    const arrivalCode = toInt(b.ArrivalCode);
    if (arrivalCode <= 0) return sendError(res, "Select the Mill Lot No", 400);

    // Selected weight (party / weigh-bridge / weighment net, chosen by radio).
    const selectedWeight = toNum(b.SelectedWeight);
    if (selectedWeight <= 0)
      return sendError(res, "Approval Weight Shows Zero..., Please Give Approval Weight", 400);

    // Approved weight can't exceed the party (billed) weight, when known.
    const partyNet = toNum(b.PartyNetWeight);
    if (partyNet > 0 && selectedWeight > partyNet)
      return sendError(res, "Approved Weight Is Higher Then Party Weight", 400);

    const allowTrash = toNum(b.AllowTrash);
    const allowMoisture = toNum(b.AllowMoisture);
    // Mirror Load_TrashKG / Load_MoistureKG (round to 0 decimals).
    const trashKg = Math.round((selectedWeight * allowTrash) / 100);
    const moistureKg = Math.round((selectedWeight * allowMoisture) / 100);
    const finalApprovalWeight = selectedWeight - trashKg - moistureKg;
    const shortageWeight = partyNet > 0 ? r0(partyNet - selectedWeight) : 0;

    const pool = await getPool(req.headers.subdbname);
    tx = new sql.Transaction(pool);
    await tx.begin();

    await new sql.Request(tx)
      .input("ApprovalWeight", sql.Decimal(18, 3), finalApprovalWeight)
      .input("User", sql.Int, parseInt(userId))
      .input("Node", sql.Int, parseInt(nodeCode))
      .input("CompanyCode", sql.Int, companyCode)
      .input("ArrivalCode", sql.Int, arrivalCode)
      .query(
        `Update tbl_CottonWeighment
            Set ApprovalWeight = @ApprovalWeight, AWApproval_User = @User,
                AWApproval_Date = GETDATE(), AWApproval_Node = @Node
          Where CompanyCode = @CompanyCode AND ArrivalCode = @ArrivalCode`,
      );

    await new sql.Request(tx)
      .input("ArrivalCode", sql.Int, arrivalCode)
      .input("CQTCode", sql.Int, toInt(b.CQTCode))
      .input("SelectedWeight", sql.Decimal(18, 3), selectedWeight)
      .input("ApprovalWeight", sql.Decimal(18, 3), finalApprovalWeight)
      .input("ShortageWeight", sql.Decimal(18, 3), shortageWeight > 0 ? shortageWeight : 0)
      .input("Po_Trash", sql.Decimal(18, 3), toNum(b.Po_Trash))
      .input("Po_Moisture", sql.Decimal(18, 3), toNum(b.Po_Moisture))
      .input("Trash", sql.Decimal(18, 3), toNum(b.Trash))
      .input("Moisture", sql.Decimal(18, 3), toNum(b.Moisture))
      .input("AllowTrash", sql.Decimal(18, 3), allowTrash)
      .input("AllowMoisture", sql.Decimal(18, 3), allowMoisture)
      .input("StdAllowTrash", sql.Decimal(18, 3), toNum(b.StdAllowTrash))
      .input("StdAllowMoisture", sql.Decimal(18, 3), toNum(b.StdAllowMoisture))
      .input("TrashKG", sql.Decimal(18, 3), trashKg)
      .input("MoistureKg", sql.Decimal(18, 3), moistureKg)
      .input("Remarks", sql.NVarChar, (b.Remarks || "").toString().trim())
      .input("User", sql.Int, parseInt(userId))
      .input("Node", sql.Int, parseInt(nodeCode))
      .execute("sp_CottonWeighment_ApprovalDetails_ADD");

    await tx.commit();
    return sendSuccess(res, { ArrivalCode: arrivalCode, ApprovalWeight: finalApprovalWeight }, "Approved Success");
  } catch (err) {
    if (tx) {
      try {
        await tx.rollback();
      } catch (_) {}
    }
    console.error("DB Error (CottonWeightApproval.approve):", err);
    return sendError(res, err);
  }
};

const r0 = (v) => Math.round(toNum(v));
