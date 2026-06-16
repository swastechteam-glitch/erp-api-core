import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Company master (port of the WinForms frmCompanyDetails)
//   - List : EXEC sp_Company_GetAll @CompanyCode
//   - Read : filtered from sp_Company_GetAll (no single-row SP exists)
// NOTE: Create / Update (sp_Company_AddEdit) is NOT implemented yet because the
//       entry form (frmCompany.vb) was not available to map its parameters.
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

// GET /company/lists  -> EXEC sp_Company_GetAll @CompanyCode
export const getCompanyList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const companyCode = parseInt(req.headers.companyCode);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_Company_GetAll");

    const data = result.recordset.map((item) => ({
      ...item,
      id: item.CompanyCode,
      StatusText:
        item.Status === undefined ? undefined : STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getCompanyList):", err);
    return sendError(res, err);
  }
};

// GET /company/list/:companyCode  -> single record (filtered from GetAll)
export const getCompanyById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.companyCode);
    if (!code) return sendError(res, "Invalid CompanyCode", 400);

    const companyCode = parseInt(req.headers.companyCode);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .execute("sp_Company_GetAll");

    const row = result.recordset.find((r) => r.CompanyCode === code);
    if (!row) return sendError(res, "Company not found", 404);

    return sendSuccess(res, {
      ...row,
      StatusText:
        row.Status === undefined ? undefined : STATUS_LABEL(row.Status),
    });
  } catch (err) {
    console.error("DB Error (getCompanyById):", err);
    return sendError(res, err);
  }
};
