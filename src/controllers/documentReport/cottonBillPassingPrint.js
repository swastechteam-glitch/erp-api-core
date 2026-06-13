// Cotton — Bill Passing Print (Document report).
// Returns the pending bill-passing rows for the Documents Hub data grid (no PDF).
// Each row is keyed by ArrivalCode; clicking a row prints the single bill-passing
// PDF (cottonBillPassingPrintDetails).
//
//   EXEC sp_CottonBillPassing_Pendings @CompanyCode = <c>, @FyCode = <fy>
//
// The proc returns a purpose-built pending list, so we pass its columns through
// (only sorting by MillLotNo DESC). Scope: CompanyCode (query) + FYCode (JWT).

import sql from "mssql";
import { getPool } from "../../config/dynamicDB.js";

export const cottonBillPassingDocumentReport = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) {
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });
    }

    const CompanyCode = parseInt(req.query.CompanyCode) || 0;
    const FYCode = parseInt(req.headers.FYCode) || 0;

    const pool = await getPool(subDbName);
    const request = pool.request();
    request.input("CompanyCode", sql.Int, CompanyCode);
    request.input("FYCode", sql.Int, FYCode);

    const result = await request.execute("sp_CottonBillPassing_Pendings");
    const rows = result.recordset || [];

    // Project to the columns the slip list shows (+ hidden ArrivalCode key).
    const data = rows
      .map((r) => ({
        ArrivalCode: r.ArrivalCode,
        MillLotNo: r.MillLotNo,
        SupplierName: r.SupplierName,
        RefNo: r.RefNo,
        RawMaterialName: r.RawMaterialName,
        CPONo: r.CPONo,
        CPODate: r.CPODate,
      }))
      // Sort by MillLotNo DESC (string-aware, descending).
      .sort((a, b) =>
        String(b.MillLotNo ?? "").localeCompare(String(a.MillLotNo ?? ""), undefined, {
          numeric: true,
        })
      );

    res.status(200).json({ totalRecords: data.length, data });
  } catch (err) {
    console.error("cottonBillPassingDocumentReport:", err);
    res.status(500).json({ error: err.message });
  }
};
