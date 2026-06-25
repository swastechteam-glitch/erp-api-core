// Cotton — RawMaterial Sales Print (Document report).
// Returns JSON rows from sp_CottonSales_GetAll for the Documents Hub / employee
// data grid (no PDF). Each row is one cotton sale; clicking a row prints the
// single-sale GST tax invoice PDF (cottonSalesPrintDetails), mirroring
// rptCottonSales.rdlc.
//
//   EXEC sp_CottonSales_GetAll @CompanyCode = <c>
//
// Scope: CompanyCode (sourced from the JWT via authenticate, query override allowed).

import sql from "mssql";
import { getPool } from "../../config/dynamicDB.js";

export const cottonSalesDocumentReport = async (req, res) => {
  try {
    const subDbName = req.headers.subdbname;
    if (!subDbName) {
      return res.status(400).json({ success: false, message: "Missing subDBName" });
    }

    const CompanyCode = parseInt(req.query.CompanyCode) || parseInt(req.headers.companyCode) || 0;

    const pool = await getPool(subDbName);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, CompanyCode)
      .execute("sp_CottonSales_GetAll");

    const data = (result.recordset || [])
      .map((r) => ({ ...r, id: r.CottonSalesCode }))
      .sort((a, b) => Number(b.CottonSalesCode ?? 0) - Number(a.CottonSalesCode ?? 0));

    res.status(200).json({ totalRecords: data.length, data });
  } catch (err) {
    console.error("cottonSalesDocumentReport:", err);
    res.status(500).json({ error: err.message });
  }
};
