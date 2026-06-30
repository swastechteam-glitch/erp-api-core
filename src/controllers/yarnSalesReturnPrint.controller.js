import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Yarn Sales Return Print (port of WinForms frmSalesReturnPrint).
// A report/print screen: list the company's sales returns for the financial
// year, then View one to render a browser-printable layout (the desktop RDLC
// rptSalesReturn.rdlc becomes HTML on the client). Printing/export is only
// offered when the return has been APPROVED — mirroring Rpt_View, which checks
// tbl_SalesReturnApproval and shows the print/export buttons only if a row exists.
//
//   List    : GET /yarn-sales-return-print/lists           (vw_SalesReturn, company + FY)
//   Report  : GET /yarn-sales-return-print/report/:code    (header + details + company + approved)
//
// CompanyCode / FYCode come from the JWT (Company is fixed to the current one,
// as in the VB where the grid is filtered by int_CompanyCode / FYCode).
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getFYCode = (req) => toInt(req.headers.FYCode);

// GET /yarn-sales-return-print/lists — returns for the company + FY (the grid).
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const rs = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("FYCode", sql.Int, getFYCode(req))
      .query(
        `Select SalesReturnCode, SalesReturnNo, SalesReturnDate, CustomerName
           from vw_SalesReturn
          where CompanyCode = @CompanyCode AND FYCode = @FYCode
          Order by SalesReturnNo DESC`,
      );
    return sendSuccess(res, rs.recordset || []);
  } catch (err) {
    console.error("DB Error (YarnSalesReturnPrint.getList):", err);
    return sendError(res, err);
  }
};

// GET /yarn-sales-return-print/report/:code — data for the printable view (Rpt_View).
export const getReport = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const companyCode = getCompanyCode(req);
    const code = toInt(req.params.code);
    if (code <= 0) return sendError(res, "Invalid SalesReturnCode", 400);

    const [header, details, company, approval] = await Promise.all([
      pool.request().input("SalesReturnCode", sql.Int, code).query("Select * from vw_SalesReturn where SalesReturnCode = @SalesReturnCode"),
      pool.request().input("SalesReturnCode", sql.Int, code).execute("sp_SalesReturnDetails_GetAll"),
      pool.request().input("CompanyCode", sql.Int, companyCode).execute("sp_Company_GetAll"),
      // Print/export is enabled only when an approval row exists (VB Rpt_View check).
      pool.request().input("SalesReturnCode", sql.Int, code).query("Select 1 from tbl_SalesReturnApproval where SalesReturnCode = @SalesReturnCode"),
    ]);

    return sendSuccess(res, {
      approved: (approval.recordset || []).length > 0,
      company: company.recordset?.[0] || {},
      header: header.recordset?.[0] || {},
      details: details.recordset || [],
    });
  } catch (err) {
    console.error("DB Error (YarnSalesReturnPrint.getReport):", err);
    return sendError(res, err);
  }
};
