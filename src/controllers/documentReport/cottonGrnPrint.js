// Cotton — GRN Print (Document report).
// Returns JSON rows from the vw_CottonArrival view for the Documents Hub data
// grid (no PDF). Each row is one cotton GRN / arrival; clicking a row prints
// the single-GRN PDF (cottonGrnPrintDetails).
//
// Source query:
//   SELECT ArrivalDate, MillLotNo, CPONo AS PONo, SupplierName,
//          PartyBillDCNo, PartyBillDCDate, ArrivalCode
//   FROM vw_CottonArrival
//   WHERE CompanyCode = @CompanyCode
//   ORDER BY ArrivalDate DESC, MillLotNo DESC
//
// Scope: CompanyCode (query string).

import sql from "mssql";
import { getPool } from "../../config/dynamicDB.js";

const QUERY = `
  SELECT ArrivalDate, MillLotNo, CPONo AS PONo, SupplierName,
         PartyBillDCNo, PartyBillDCDate, ArrivalCode
  FROM vw_CottonArrival
  WHERE CompanyCode = @CompanyCode
  ORDER BY ArrivalDate DESC, MillLotNo DESC`;

export const cottonGrnDocumentReport = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) {
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });
    }

    const CompanyCode = parseInt(req.query.CompanyCode) || 0;
    const pool = await getPool(subDbName);
    const request = pool.request();
    request.input("CompanyCode", sql.Int, CompanyCode);

    const result = await request.query(QUERY);
    const data = result.recordset || [];

    res.status(200).json({ totalRecords: data.length, data });
  } catch (err) {
    console.error("cottonGrnDocumentReport:", err);
    res.status(500).json({ error: err.message });
  }
};
