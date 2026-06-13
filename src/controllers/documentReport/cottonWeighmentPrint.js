// Cotton — Weighment Slip Print (Document report).
// Returns JSON rows for the Documents Hub data grid (no PDF). Source is the
// fat sp_CottonWeighment_GetAll proc, so we project only the columns the slip
// list needs and collapse to one row per WeighmentCode (NoofBales summed).
//
//   EXEC sp_CottonWeighment_GetAll @CompanyCode = <CompanyCode>, @FYCode = <FYCode>
//
// Shown columns: WeighmentDate, WeighmentNo, SupplierName, ArrivalDate,
//                MillLotNo, CPONo, CPODate, NoofBales (+ hidden WeighmentCode).
//
// Scope: CompanyCode (query) + FYCode (JWT -> req.headers.FYCode).

import sql from "mssql";
import { getPool } from "../../config/dynamicDB.js";

export const cottonWeighmentDocumentReport = async (req, res) => {
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

    const result = await request.execute("sp_CottonWeighment_GetAll");
    const rows = result.recordset || [];

    // One row per weighment slip; NoofBales summed across that weighment's rows.
    const byCode = new Map();
    for (const r of rows) {
      const code = r.WeighmentCode;
      if (!byCode.has(code)) {
        byCode.set(code, {
          WeighmentCode: code,
          WeighmentNo: r.WeighmentNo,
          WeighmentDate: r.WeighmentDate,
          SupplierName: r.SupplierName,
          ArrivalDate: r.ArrivalDate,
          MillLotNo: r.MillLotNo,
          CPONo: r.CPONo,
          CPODate: r.CPODate,
          NoofBales: 0,
        });
      }
      byCode.get(code).NoofBales += Number(r.NoofBales) || 0;
    }

    const data = [...byCode.values()].sort(
      (a, b) =>
        new Date(b.WeighmentDate) - new Date(a.WeighmentDate) ||
        (Number(b.WeighmentNo) || 0) - (Number(a.WeighmentNo) || 0)
    );

    res.status(200).json({ totalRecords: data.length, data });
  } catch (err) {
    console.error("cottonWeighmentDocumentReport:", err);
    res.status(500).json({ error: err.message });
  }
};
