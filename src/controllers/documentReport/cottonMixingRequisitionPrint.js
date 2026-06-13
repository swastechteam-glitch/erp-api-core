// Cotton — Issue Mixing Requisition Print (Document report).
// Returns JSON rows from tbl_CMIRequisition for the Documents Hub data grid
// (no PDF). Each row is one mixing-issue requisition; clicking a row prints the
// single-requisition PDF (cottonMixingRequisitionPrintDetails).
//
// Source query:
//   SELECT CMIRequisitionCode, CMIRequisitionDate, CMIRequisitionNo, TotalBales
//   FROM tbl_CMIRequisition
//   WHERE CompanyCode = @CompanyCode AND FYCode = @FYCode
//   ORDER BY CMIRequisitionNo DESC
//
// Scope: CompanyCode (query) + FYCode (JWT -> req.headers.FYCode).

import sql from "mssql";
import { getPool } from "../../config/dynamicDB.js";

const QUERY = `
  SELECT CMIRequisitionCode, CMIRequisitionDate, CMIRequisitionNo, TotalBales
  FROM tbl_CMIRequisition
  WHERE CompanyCode = @CompanyCode AND FYCode = @FYCode
  ORDER BY CMIRequisitionNo DESC`;

export const cottonMixingRequisitionDocumentReport = async (req, res) => {
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

    const result = await request.query(QUERY);
    const data = result.recordset || [];

    res.status(200).json({ totalRecords: data.length, data });
  } catch (err) {
    console.error("cottonMixingRequisitionDocumentReport:", err);
    res.status(500).json({ error: err.message });
  }
};
