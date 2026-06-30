import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Yarn GRN Print (port of WinForms frmYarnGRNPrint).
// A report/print screen: list the yarn GRNs (vw_YarnGRN), then View one to render
// a browser-printable layout (the desktop RDLC rptYarnGRN.rdlc becomes HTML on the
// client). Rpt_View pulls the GRN line details (sp_YarnGRNDetails_GetAll), the
// bag-number abstract (sp_YarnGRN_GetBagNo_Abs) and the company; the print/export
// buttons are enabled whenever the GRN row exists (always, for a listed GRN).
//
//   List   : GET /yarn-grn-print/lists          (vw_YarnGRN)
//   Report : GET /yarn-grn-print/report/:code   (header + details + bagNoAbs + company)
//
// CompanyCode comes from the JWT (the VB Company combo is disabled / fixed).
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const getCompanyCode = (req) => toInt(req.headers.companyCode);

// GET /yarn-grn-print/lists — GRNs for the company (the grid).
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const rs = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .query(
        `Select YarnGRNCode, YarnGRNNo, YarnGRNDate, SupplierName
           from vw_YarnGRN
          where CompanyCode = @CompanyCode
          Order by YarnGRNNo DESC`,
      );
    return sendSuccess(res, rs.recordset || []);
  } catch (err) {
    console.error("DB Error (YarnGRNPrint.getList):", err);
    return sendError(res, err);
  }
};

// GET /yarn-grn-print/report/:code — data for the printable view (Rpt_View).
export const getReport = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const companyCode = getCompanyCode(req);
    const code = toInt(req.params.code);
    if (code <= 0) return sendError(res, "Invalid YarnGRNCode", 400);

    const [header, details, bagNoAbs, company, exists] = await Promise.all([
      pool.request().input("Code", sql.Int, code).query("Select * from vw_YarnGRN where YarnGRNCode = @Code"),
      pool.request().input("YarnGRNCode", sql.Int, code).input("CompanyCode", sql.Int, companyCode).execute("sp_YarnGRNDetails_GetAll"),
      pool.request().input("YarnGRNCode", sql.Int, code).execute("sp_YarnGRN_GetBagNo_Abs"),
      pool.request().input("CompanyCode", sql.Int, companyCode).execute("sp_Company_GetAll"),
      // Print/export is enabled whenever the GRN row exists (VB Rpt_View check).
      pool.request().input("Code", sql.Int, code).query("Select 1 from tbl_YarnGRN where YarnGRNCode = @Code"),
    ]);

    return sendSuccess(res, {
      approved: (exists.recordset || []).length > 0,
      company: company.recordset?.[0] || {},
      header: header.recordset?.[0] || {},
      details: details.recordset || [],
      bagNoAbs: bagNoAbs.recordset || [],
    });
  } catch (err) {
    console.error("DB Error (YarnGRNPrint.getReport):", err);
    return sendError(res, err);
  }
};
