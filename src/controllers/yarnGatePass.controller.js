import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Yarn Gate Pass — View / Print (port of WinForms frmYarnGatePassPrint).
// The desktop form lists gate passes, then renders the selected one as an RDLC
// report with a "Gate Pass" / "DC" (summary) mode that swaps the template. Here
// the list is browsable and View returns the printable gate-pass data (HTML).
//
//   List   : GET /yarn-gate-pass/lists
//   Report : GET /yarn-gate-pass/report/:gatePassNo
//
// CompanyCode / FYCode come from the JWT (Company is fixed, as in the VB).
// There is no add/edit/delete in this form — it is a report/print screen.
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getFYCode = (req) => toInt(req.headers.FYCode);

// GET /yarn-gate-pass/lists — gate passes for the current company + FY.
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const rs = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("FYCode", sql.Int, getFYCode(req))
      .execute("sp_YarnGatePass_View");
    return sendSuccess(res, rs.recordset || []);
  } catch (err) {
    console.error("DB Error (YarnGatePass.getList):", err);
    return sendError(res, err);
  }
};

// GET /yarn-gate-pass/report/:gatePassNo — data for the printable gate pass.
// Both "Gate Pass" and "DC" modes use the same proc (only the RDLC layout
// differs); the frontend chooses the presentation.
export const getReport = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const companyCode = getCompanyCode(req);
    const gatePassNo = toInt(req.params.gatePassNo);
    if (gatePassNo <= 0) return sendError(res, "Invalid GatePassNo", 400);

    const [print, company] = await Promise.all([
      pool.request().input("CompanyCode", sql.Int, companyCode).input("GatePassNo", sql.Int, gatePassNo).execute("sp_YarnGatePass_Print"),
      pool.request().input("CompanyCode", sql.Int, companyCode).execute("sp_Company_GetAll"),
    ]);

    const details = print.recordset || [];
    return sendSuccess(res, {
      header: details[0] || {},
      details,
      company: company.recordset?.[0] || {},
    });
  } catch (err) {
    console.error("DB Error (YarnGatePass.getReport):", err);
    return sendError(res, err);
  }
};
