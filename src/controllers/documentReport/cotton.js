// Cotton — Purchase Order Print (Document report).
// Returns JSON rows from the vw_CottonPurchaseOrder view for a financial year,
// for display in the Documents Hub data grid (no PDF).
//
// Source query:
//   SELECT CPONo, RefNo, SupplierName, RawMaterialName, Qty, Rate, CPOCode
//   FROM vw_CottonPurchaseOrder
//   WHERE CompanyCode = @CompanyCode AND FYCode = @FYCode
//   ORDER BY CPONo DESC
//
// Scope: CompanyCode + FYCode (query string; FYCode also accepted as fyCode).

import sql from "mssql";
import { getPool } from "../../config/dynamicDB.js";

const QUERY = `
  SELECT CPONo, RefNo, SupplierName, RawMaterialName, Qty, Rate, CPOCode
  FROM vw_CottonPurchaseOrder
  WHERE CompanyCode = @CompanyCode AND FYCode = @FYCode
  ORDER BY CPONo DESC`;

export const cottonDocumentReport = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) {
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });
    }

    const CompanyCode = parseInt(req.query.CompanyCode) || 0;
    // const FYCode = parseInt(req.query.FYCode || req.query.fyCode) || 0;
    const FYCode = req.headers.FYCode;
    const pool = await getPool(subDbName);
    const request = pool.request();
    request.input("CompanyCode", sql.Int, CompanyCode);
    request.input("FYCode", sql.Int, FYCode);

    const result = await request.query(QUERY);
    const data = result.recordset || [];

    res.status(200).json({ totalRecords: data.length, data });
  } catch (err) {
    console.error("cottonDocumentReport:", err);
    res.status(500).json({ error: err.message });
  }
};
