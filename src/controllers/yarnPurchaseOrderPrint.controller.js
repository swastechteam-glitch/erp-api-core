import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Yarn Purchase Order Print (port of WinForms frmYarnPurchaseOrderPrint).
// A report/print screen: list the company's yarn purchase orders for the
// financial year, then View one to render a browser-printable layout (the
// desktop RDLC rptYarnPurchaseOrder.rdlc becomes HTML on the client). Printing /
// export is only offered when the order has been APPROVED — mirroring Rpt_View,
// which checks tbl_YarnPurchaseOrder.Approval = 1 and shows the print/export
// buttons only when a row exists.
//
//   List   : GET /yarn-purchase-order-print/lists          (vw_YarnPurchaseOrder, company + FY)
//   Report : GET /yarn-purchase-order-print/report/:code   (header + details + company + approved)
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

// GET /yarn-purchase-order-print/lists — orders for the company + FY (the grid).
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const rs = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("FYCode", sql.Int, getFYCode(req))
      .query(
        `Select YarnPurchaseOrderCode, YarnPurchaseOrderNo, YarnPurchaseOrderDate, SupplierName
           from vw_YarnPurchaseOrder
          where CompanyCode = @CompanyCode AND FYCode = @FYCode
          Order by YarnPurchaseOrderNo DESC`,
      );
    return sendSuccess(res, rs.recordset || []);
  } catch (err) {
    console.error("DB Error (YarnPurchaseOrderPrint.getList):", err);
    return sendError(res, err);
  }
};

// GET /yarn-purchase-order-print/report/:code — data for the printable view (Rpt_View).
export const getReport = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const companyCode = getCompanyCode(req);
    const code = toInt(req.params.code);
    if (code <= 0) return sendError(res, "Invalid YarnPurchaseOrderCode", 400);

    const [header, details, company, approval] = await Promise.all([
      pool.request().input("Code", sql.Int, code).query("Select * from vw_YarnPurchaseOrder where YarnPurchaseOrderCode = @Code"),
      pool.request().input("YarnPurchaseOrderCode", sql.Int, code).execute("sp_YarnPurchaseOrderDetails_GetAll"),
      pool.request().input("CompanyCode", sql.Int, companyCode).execute("sp_Company_GetAll"),
      // Print/export is enabled only when the order is approved (VB Rpt_View check).
      pool.request().input("Code", sql.Int, code).query("Select 1 from tbl_YarnPurchaseOrder where Approval = 1 AND YarnPurchaseOrderCode = @Code"),
    ]);

    return sendSuccess(res, {
      approved: (approval.recordset || []).length > 0,
      company: company.recordset?.[0] || {},
      header: header.recordset?.[0] || {},
      details: details.recordset || [],
    });
  } catch (err) {
    console.error("DB Error (YarnPurchaseOrderPrint.getReport):", err);
    return sendError(res, err);
  }
};
