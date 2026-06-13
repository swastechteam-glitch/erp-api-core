// Cotton — Moisture Test Print (Document report).
// Returns JSON rows from the vw_CottonMoistureTest view for the Documents Hub
// data grid (no PDF). Each row is one moisture test; clicking a row prints the
// single-test PDF (cottonMoistureTestPrintDetails).
//
// Source query:
//   SELECT MillLotNo, CottonMoistureTestNo AS TestNo,
//          CottonMoistureTestDate AS TestDate, SupplierName, EmployeeName, ArrivalCode
//   FROM vw_CottonMoistureTest
//   WHERE FYCode = @FYCode
//   ORDER BY CottonMoistureTestNo, CottonMoistureTestDate, MillLotNo
//
// Scope: FYCode (sourced from the JWT via authenticate -> req.headers.FYCode).

import sql from "mssql";
import { getPool } from "../../config/dynamicDB.js";

const QUERY = `
  SELECT MillLotNo, CottonMoistureTestNo AS TestNo,
         CottonMoistureTestDate AS TestDate, SupplierName, EmployeeName, ArrivalCode
  FROM vw_CottonMoistureTest
  WHERE FYCode = @FYCode
  ORDER BY CottonMoistureTestNo DESC, CottonMoistureTestDate DESC, MillLotNo DESC`;

export const cottonMoistureTestDocumentReport = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) {
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });
    }

    const FYCode = parseInt(req.headers.FYCode) || 0;
    const pool = await getPool(subDbName);
    const request = pool.request();
    request.input("FYCode", sql.Int, FYCode);

    const result = await request.query(QUERY);
    const data = result.recordset || [];

    res.status(200).json({ totalRecords: data.length, data });
  } catch (err) {
    console.error("cottonMoistureTestDocumentReport:", err);
    res.status(500).json({ error: err.message });
  }
};
