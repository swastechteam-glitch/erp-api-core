import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Cotton Reject / RawMaterial Reject (port of the WinForms frmCottonReject)
//   Reject (sell back) bales of an arrived cotton lot to its supplier. Pick a
//   Mill Lot (loads supplier/agent/variety/station + party weights + rate),
//   click OK to load that lot's in-stock bales, drop the bales that are NOT
//   being rejected, pick a Tax Type, then save. Mirrors frmCottonReject
//   btnSave_Click:
//     sp_CottonReject_AddEdit            -> CottonRejectCode (@RejectSales = 1)
//     sp_CottonRejectDetails_Delete + loop sp_CottonRejectDetails_AddEdit
//     sp_DebitNote_AddEdit -> DebitNoteCode (+ _Details_Delete + _Details_Insert)
//     Gate Entry Goods-Out pass (GoodsTypeCode 2, TransGoodsTypeCode 9)
//
//   - GET    /cotton-reject/options              -> suppliers/agents/stations/varieties/taxTypes/millLots
//   - GET    /cotton-reject/next-no              -> { no, debitNo }
//   - GET    /cotton-reject/bales-stock/:arrivalCode -> in-stock bales of a lot
//   - GET    /cotton-reject/lists                -> sp_CottonReject_GetAll (paginated)
//   - POST   /cotton-reject/create               -> AddEdit (+ details + debit note + gate pass)
//   - DELETE /cotton-reject/delete/:code         -> sp_CottonReject_Delete
//
// Company from req.headers.companyCode, FY from req.headers.FYCode; AddEdit also
// needs @User / @Node from req.headers.userId / nodeCode. The amount is the
// lot's Party Net Weight x Rate (header-level, matching the WinForms — NOT a
// per-bale amount); tax (CGST/SGST or IGST) + the net amount are recomputed
// SERVER-SIDE (client figures are preview only). Edit is NOT implemented (the
// list form only deletes) — create / list / delete only. The desktop serial
// scale, barcode capture, party-weight mode, temp-table reload and Print are
// not ported.
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};
const r2 = (v) => Math.round((toNum(v) + Number.EPSILON) * 100) / 100;
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getFYCode = (req) => toInt(req.headers.FYCode);
const D = (v) => (v ? new Date(v) : null);

const scalar = async (request, proc) => {
  const r = await request.execute(proc);
  const row = r.recordset?.[0];
  return row ? toInt(Object.values(row)[0]) : 0;
};

// GET /cotton-reject/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);

    const [suppliers, agents, stations, varieties, taxTypes, lots] = await Promise.all([
      pool
        .request()
        .query("Select SupplierName, SupplierCode from tbl_Supplier Order by SupplierName"),
      pool.request().query("Select AgentName, AgentCode from tbl_Agent Order by AgentName"),
      pool.request().query("Select StationName, StationCode from tbl_Station Order by StationName"),
      pool
        .request()
        .query("Select RawMaterialName, RawMaterialCode from tbl_RawMaterial Order by RawMaterialName"),
      pool
        .request()
        .query(
          `Select TaxTypeCode, TaxType, CGST, SGST, IGST from tbl_TaxType
            Where Status = 1 Order by TaxType`,
        ),
      pool.request().input("CompanyCode", sql.Int, getCompanyCode(req)).execute("sp_CottonReject_LotStock"),
    ]);

    return sendSuccess(res, {
      suppliers: (suppliers.recordset || []).map((r) => ({
        value: r.SupplierCode,
        label: r.SupplierName,
        SupplierName: r.SupplierName,
      })),
      agents: (agents.recordset || []).map((r) => ({ value: r.AgentCode, label: r.AgentName })),
      stations: (stations.recordset || []).map((r) => ({ value: r.StationCode, label: r.StationName })),
      varieties: (varieties.recordset || []).map((r) => ({
        value: r.RawMaterialCode,
        label: r.RawMaterialName,
        RawMaterialName: r.RawMaterialName,
      })),
      taxTypes: (taxTypes.recordset || []).map((r) => ({
        value: r.TaxTypeCode,
        label: r.TaxType,
        CGST: toNum(r.CGST),
        SGST: toNum(r.SGST),
        IGST: toNum(r.IGST),
      })),
      // Mill Lot dropdown carrying everything the form autofills.
      millLots: (lots.recordset || []).map((x) => ({
        value: x.ArrivalCode,
        label: (x.MillLotNo || "").toString().trim(),
        ...x,
      })),
    });
  } catch (err) {
    console.error("DB Error (CottonReject.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /cotton-reject/next-no -> { no, debitNo } for a new reject.
export const getNextNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const fyCode = getFYCode(req);
    const pool = await getPool(req.headers.subdbname);

    const [no, debitNo] = await Promise.all([
      scalar(
        pool
          .request()
          .input("CompanyCode", sql.Int, companyCode)
          .input("FYCode", sql.Int, fyCode),
        "sp_CottonReject_No",
      ),
      scalar(
        pool
          .request()
          .input("CompanyCode", sql.Int, companyCode)
          .input("FYCode", sql.Int, fyCode),
        "sp_DebitNote_DebitNoteNo",
      ),
    ]);
    return sendSuccess(res, { no, debitNo });
  } catch (err) {
    console.error("DB Error (CottonReject.getNextNo):", err);
    return sendError(res, err);
  }
};

// GET /cotton-reject/bales-stock/:arrivalCode -> in-stock bales of a lot.
export const getBalesStock = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const arrivalCode = parseInt(req.params.arrivalCode);
    if (!arrivalCode) return sendError(res, "Invalid ArrivalCode", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("Entry", sql.Int, 1)
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("ArrivalCode", sql.Int, arrivalCode)
      .execute("sp_CottonIssue_BalesStock");
    const bales = (r.recordset || []).map((x) => ({
      value: x.WeighmentDetailsCode,
      label: x.strBaleNo ?? x.BaleNo,
      WeighmentDetailsCode: toInt(x.WeighmentDetailsCode),
      BaleNo: x.BaleNo,
      GrossWeight: toNum(x.GrossWeight),
      Allowance: toNum(x.Allowance),
      SampleWeight: toNum(x.SampleWeight),
      TareWeight: toNum(x.TareWeight),
      NetWeight: toNum(x.NetWeight),
    }));
    return sendSuccess(res, { bales });
  } catch (err) {
    console.error("DB Error (CottonReject.getBalesStock):", err);
    return sendError(res, err);
  }
};

// GET /cotton-reject/lists -> all rejects (paginated).
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_CottonReject_GetAll");
    const data = (result.recordset || [])
      .map((r) => ({ ...r, id: r.CottonRejectCode }))
      .sort((a, b) => Number(b.CottonRejectCode) - Number(a.CottonRejectCode));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (CottonReject.getList):", err);
    return sendError(res, err);
  }
};

// Header-level amount + tax (matches frmCottonReject TaxCalc): Amount =
// PartyNetWeight x Rate; CGST/SGST when CGSTPer>0 else IGST; NetAmount = sum.
const computeTotals = (partyNetWeight, rate, tax, details) => {
  const cgstPer = toNum(tax.CGST);
  const sgstPer = toNum(tax.SGST);
  const igstPer = toNum(tax.IGST);

  const amount = r2(toNum(partyNetWeight) * toNum(rate));
  let cgstAmt = 0;
  let sgstAmt = 0;
  let igstAmt = 0;
  if (cgstPer > 0) {
    cgstAmt = r2((amount * cgstPer) / 100);
    sgstAmt = r2((amount * sgstPer) / 100);
  } else if (igstPer > 0) {
    igstAmt = r2((amount * igstPer) / 100);
  }
  const netAmount = r2(amount + cgstAmt + sgstAmt + igstAmt);

  const totalBales = details.length;
  const totalNetWeight = r2(details.reduce((s, d) => s + toNum(d.NetWeight), 0));

  return {
    cgstPer, sgstPer, igstPer, cgstAmt, sgstAmt, igstAmt,
    amount, netAmount, totalBales, totalNetWeight,
  };
};

// POST /cotton-reject/create
export const create = async (req, res) => {
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

    const arrivalCode = toInt(b.ArrivalCode);
    const taxTypeCode = toInt(b.TaxTypeCode);
    const supplierCode = toInt(b.SupplierCode);
    const rawMaterialCode = toInt(b.RawMaterialCode);
    if (taxTypeCode <= 0) return sendError(res, "Select the Tax Type", 400);
    if (arrivalCode <= 0) return sendError(res, "Select the Mill Lot No", 400);

    const details = (Array.isArray(b.details) ? b.details : []).filter(
      (d) => toInt(d.WeighmentDetailsCode) > 0,
    );
    if (!details.length)
      return sendError(res, "Please Select Items to Reject / Sale", 400);

    const pool = await getPool(req.headers.subdbname);

    // Resolve the Tax Type's CGST/SGST/IGST server-side (don't trust client).
    const taxRes = await pool
      .request()
      .input("TaxTypeCode", sql.Int, taxTypeCode)
      .query("Select CGST, SGST, IGST from tbl_TaxType Where TaxTypeCode = @TaxTypeCode");
    const tax = taxRes.recordset?.[0] || { CGST: 0, SGST: 0, IGST: 0 };

    const t = computeTotals(b.PartyNetWeight, b.Rate, tax, details);

    // Reject number + Debit Note number.
    const rejectNo = await scalar(
      pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("FYCode", sql.Int, fyCode),
      "sp_CottonReject_No",
    );
    const debitNoteNo = await scalar(
      pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("FYCode", sql.Int, fyCode),
      "sp_DebitNote_DebitNoteNo",
    );

    // Gate pass number + the BALE UOM code (matches the WinForms helpers).
    const goodsPassNumber = await scalar(
      pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("FYCode", sql.Int, fyCode)
        .input("GoodsTypeCode", sql.Int, 2),
      "sp_GateEntryGoodsOut_BindNo",
    );
    const uomRes = await pool
      .request()
      .query(
        "Select ISNULL(Max(ItemUOMCode),1) AS u from tbl_ItemUOM where ItemUOMName like 'BALE%' Group by ItemUOMName",
      );
    const itemUomCode = toInt(uomRes.recordset?.[0]?.u) || 1;

    // Supplier name for the gate pass (MobileNo not stored — matches VB '').
    const supRes = await pool
      .request()
      .input("SupplierCode", sql.Int, supplierCode)
      .query("Select SupplierName from tbl_Supplier Where SupplierCode = @SupplierCode");
    const supplierName = (supRes.recordset?.[0]?.SupplierName || "").toString().trim();

    // Raw material name for the gate pass detail line.
    const rmRes = await pool
      .request()
      .input("RawMaterialCode", sql.Int, rawMaterialCode)
      .query(
        "Select RawMaterialName from tbl_RawMaterial Where RawMaterialCode = @RawMaterialCode",
      );
    const rawMaterialName = (rmRes.recordset?.[0]?.RawMaterialName || "").toString().trim();

    const rejectDate = D(b.CottonRejectDate) || new Date();
    const vehicleNo = (b.VehicleNo || "").toString().trim();
    const remarks = (b.Remarks || "").toString().trim();

    tx = new sql.Transaction(pool);
    await tx.begin();

    // ---- header: sp_CottonReject_AddEdit -> CottonRejectCode ---------------
    const head = new sql.Request(tx);
    head.input("CottonRejectNo", sql.Int, rejectNo);
    head.input("CottonRejectDate", sql.DateTime, rejectDate);
    head.input("ArrivalCode", sql.Int, arrivalCode);
    head.input("NoofBales", sql.Decimal(18, 3), t.totalBales);
    head.input("Remarks", sql.NVarChar, remarks);
    head.input("RejectSales", sql.Int, 1);
    head.input("FYCode", sql.Int, fyCode);
    head.input("CompanyCode", sql.Int, companyCode);
    head.input("SupplierCode", sql.Int, supplierCode);
    head.input("RawMaterialCode", sql.Int, rawMaterialCode);
    head.input("TaxTypeCode", sql.Int, taxTypeCode);
    head.input("TotalBales", sql.Decimal(18, 3), t.totalBales);
    head.input("TotalNetWeight", sql.Decimal(18, 3), t.totalNetWeight);
    head.input("Rate", sql.Decimal(18, 3), toNum(b.Rate));
    head.input("Amount", sql.Decimal(18, 2), t.amount);
    head.input("CGSTPer", sql.Decimal(18, 2), t.cgstPer);
    head.input("SGSTPer", sql.Decimal(18, 2), t.sgstPer);
    head.input("IGSTPer", sql.Decimal(18, 2), t.igstPer);
    head.input("CGSTAmount", sql.Decimal(18, 2), t.cgstAmt);
    head.input("SGSTAmount", sql.Decimal(18, 2), t.sgstAmt);
    head.input("IGSTAmount", sql.Decimal(18, 2), t.igstAmt);
    head.input("NetAmount", sql.Decimal(18, 2), t.netAmount);
    head.input("VehicleNo", sql.NVarChar, vehicleNo);
    head.input("User", sql.Int, parseInt(userId));
    head.input("Node", sql.Int, parseInt(nodeCode));
    const rejectCode = await scalar(head, "sp_CottonReject_AddEdit");

    // ---- reject detail rows (selected bales) -------------------------------
    await new sql.Request(tx)
      .input("CottonRejectCode", sql.Int, rejectCode)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_CottonRejectDetails_Delete");

    let sno = 0;
    for (const d of details) {
      sno += 1;
      await new sql.Request(tx)
        .input("CottonRejectCode", sql.Int, rejectCode)
        .input("SNo", sql.Int, sno)
        .input("WeighmentDetailsCode", sql.Int, toInt(d.WeighmentDetailsCode))
        .input("BaleNo", sql.NVarChar, (d.BaleNo ?? "").toString())
        .input("GrossWeight", sql.Decimal(18, 3), toNum(d.GrossWeight))
        .input("Allowance", sql.Decimal(18, 3), toNum(d.Allowance))
        .input("SampleWeight", sql.Decimal(18, 3), toNum(d.SampleWeight))
        .input("TareWeight", sql.Decimal(18, 3), toNum(d.TareWeight))
        .input("NetWeight", sql.Decimal(18, 3), toNum(d.NetWeight))
        .input("CompanyCode", sql.Int, companyCode)
        .execute("sp_CottonRejectDetails_AddEdit");
    }

    // ---- Debit Note (supplier debit for the rejected goods) ----------------
    const dn = new sql.Request(tx);
    dn.input("User", sql.Int, parseInt(userId));
    dn.input("Node", sql.Int, parseInt(nodeCode));
    dn.input("DebitNoteNo", sql.Int, debitNoteNo);
    dn.input("DebitNoteDate", sql.DateTime, rejectDate);
    dn.input("RefType", sql.NVarChar, "COTTON");
    dn.input("SupplierCode", sql.Int, supplierCode);
    dn.input("DebitTypeCode", sql.Int, 0);
    dn.input("SupplierRefNo", sql.Int, 0);
    dn.input("TaxTypeCode", sql.Int, taxTypeCode);
    dn.input("TotalBasicAmount", sql.Decimal(18, 2), t.amount);
    dn.input("TotalCGSTAmount", sql.Decimal(18, 2), t.cgstAmt);
    dn.input("TotalSGSTAmount", sql.Decimal(18, 2), t.sgstAmt);
    dn.input("TotalIGSTAmount", sql.Decimal(18, 2), t.igstAmt);
    dn.input("TotalDebitAmount", sql.Decimal(18, 2), 0);
    dn.input("TotalAdjustmentAmount", sql.Decimal(18, 2), 0);
    dn.input("TotalNetAmount", sql.Decimal(18, 2), t.netAmount);
    dn.input("Remarks", sql.NVarChar, remarks);
    dn.input("Reject", sql.Int, 0);
    dn.input("FYCode", sql.Int, fyCode);
    dn.input("CompanyCode", sql.Int, companyCode);
    const debitNoteCode = await scalar(dn, "sp_DebitNote_AddEdit");

    await new sql.Request(tx)
      .input("DebitNoteCode", sql.Int, debitNoteCode)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_DebitNoteDetails_Delete");

    await new sql.Request(tx)
      .input("DebitNoteCode", sql.Int, debitNoteCode)
      .input("RefType", sql.NVarChar, "COTTON")
      .input("RefCode", sql.Int, 0)
      .input("BillNo", sql.NVarChar, rejectNo.toString())
      .input("BillDate", sql.DateTime, rejectDate)
      .input("BasicAmount", sql.Decimal(18, 2), t.netAmount)
      .input("CGSTPer", sql.Decimal(18, 2), t.cgstPer)
      .input("SGSTPer", sql.Decimal(18, 2), t.sgstPer)
      .input("IGSTPer", sql.Decimal(18, 2), t.igstPer)
      .input("CGSTAmount", sql.Decimal(18, 2), t.cgstAmt)
      .input("SGSTAmount", sql.Decimal(18, 2), t.sgstAmt)
      .input("IGSTAmount", sql.Decimal(18, 2), t.igstAmt)
      .input("Amount", sql.Decimal(18, 2), t.amount)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_DebitNoteDetails_Insert");

    // ---- Gate Entry Goods-Out pass (GoodsTypeCode 2, TransGoodsTypeCode 9) -
    const goodsHead = new sql.Request(tx);
    goodsHead.input("Goodspassnumber", sql.Int, goodsPassNumber);
    goodsHead.input("VehicleNo", sql.NVarChar, vehicleNo);
    goodsHead.input("MobileNumber", sql.NVarChar, "");
    goodsHead.input("CompanyName", sql.NVarChar, supplierName);
    goodsHead.input("CustomerCode", sql.Int, supplierCode);
    goodsHead.input("InvoiceNumber", sql.NVarChar, rejectNo.toString());
    goodsHead.input("GoodsTypeCode", sql.Int, 2);
    goodsHead.input("TransGoodsTypeCode", sql.Int, 9);
    goodsHead.input("Reason", sql.NVarChar, `Cottn Reject No.${rejectNo},     ${remarks}`);
    goodsHead.input("MaterialTypeCode", sql.Int, 1);
    goodsHead.input("StoreOutDate", sql.DateTime, rejectDate);
    goodsHead.input("StoreOuttime", sql.DateTime, rejectDate);
    goodsHead.input("Cancel", sql.Int, 0);
    goodsHead.input("CancelReason", sql.NVarChar, "");
    goodsHead.input("RefCode", sql.Int, rejectCode);
    goodsHead.input("RefNo", sql.NVarChar, rejectNo.toString());
    goodsHead.input("FYCode", sql.Int, fyCode);
    goodsHead.input("CompanyCode", sql.Int, companyCode);
    goodsHead.input("user", sql.Int, parseInt(userId));
    goodsHead.input("Node", sql.Int, parseInt(nodeCode));
    const goodsOutCode = await scalar(goodsHead, "sp_GateEntryGoodsOut_AddEdit");

    await new sql.Request(tx)
      .input("GoodsOutPassCode", sql.Int, goodsOutCode)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_GateEntryGoodsOutDetails_Delete");

    await new sql.Request(tx)
      .input("GoodsOutPassCode", sql.Int, goodsOutCode)
      .input("ItemName", sql.NVarChar, rawMaterialName)
      .input("OutQty", sql.Decimal(18, 3), t.totalBales)
      .input("RawMaterialCode", sql.Int, rawMaterialCode)
      .input("ItemUOMCode", sql.Int, itemUomCode)
      .input("CountNameCode", sql.Int, 0)
      .input("ItemCode", sql.Int, 0)
      .input("WasteItemCode", sql.Int, 0)
      .input("GoodsImage", sql.VarBinary, null)
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_GateEntryGoodsOutDetails_Insert");

    await tx.commit();
    return sendSuccess(res, { CottonRejectCode: rejectCode }, "The record is saved", 201);
  } catch (err) {
    if (tx) {
      try {
        await tx.rollback();
      } catch (_) {}
    }
    console.error("DB Error (CottonReject.create):", err);
    return sendError(res, err);
  }
};

// DELETE /cotton-reject/delete/:code
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = parseInt(req.params.code);
    if (!code) return sendError(res, "Invalid CottonRejectCode", 400);
    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("CottonRejectCode", sql.Int, code)
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_CottonReject_Delete");
    return sendSuccess(res, { CottonRejectCode: code }, "The record is deleted");
  } catch (err) {
    if (err.number === 547) {
      return sendError(res, "This record is in use and can not be deleted", 409);
    }
    console.error("DB Error (CottonReject.remove):", err);
    return sendError(res, err);
  }
};
