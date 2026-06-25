// Cotton — Quality Test Slip Print (Document report).
// Returns JSON rows from sp_CottonQualityTest_GetAll for the Documents Hub data
// grid (no PDF). Each row is one cotton quality test; clicking a row prints the
// single-test quality slip PDF (cottonQualitySlipPrintDetails), mirroring
// rptCottonQualitySlip.rdlc.
//
//   EXEC sp_CottonQualityTest_GetAll @CompanyCode = <c>, @FYCode = <f>
//
// Scope: CompanyCode + FYCode (sourced from the JWT via authenticate).

import sql from "mssql";
import { getPool } from "../../config/dynamicDB.js";

export const cottonQualitySlipDocumentReport = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) {
      return res.status(400).json({ success: false, message: "Missing subDBName" });
    }

    const CompanyCode = parseInt(req.query.CompanyCode) || parseInt(req.headers.companyCode) || 0;
    const FYCode = parseInt(req.headers.FYCode) || 0;

    const pool = await getPool(subDbName);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, CompanyCode)
      .input("FYCode", sql.Int, FYCode)
      .execute("sp_CottonQualityTest_GetAll");

    const data = (result.recordset || [])
      .map((r) => ({ ...r, id: r.CQTCode ?? r.ArrivalCode }))
      .sort((a, b) => Number(b.CQTCode ?? 0) - Number(a.CQTCode ?? 0));

    res.status(200).json({ totalRecords: data.length, data });
  } catch (err) {
    console.error("cottonQualitySlipDocumentReport:", err);
    res.status(500).json({ error: err.message });
  }
};
