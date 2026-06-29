import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Yarn Sales Order Print (port of WinForms frmSalesOrderPrint).
// A report/print screen: filter by Customer / Agent (+ a Sales Order vs Work
// Order mode), list matching orders, then View one to render a printable
// layout (the desktop RDLC report becomes browser-printable HTML on the client).
//
//   Options : GET /yarn-sales-order-print/options              (customers, agents, companies)
//   List    : GET /yarn-sales-order-print/lists?customerCode=&agentCode=
//   Report  : GET /yarn-sales-order-print/report/:soCode?mode=sales|work
//
// CompanyCode / FYCode come from the JWT (Company is fixed to the current one,
// matching the disabled company combo in the VB).
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getFYCode = (req) => toInt(req.headers.FYCode);

const opt = (rs, valueKey, labelKey) =>
  (rs.recordset || []).map((r) => ({ ...r, value: r[valueKey], label: r[labelKey] }));

// GET /yarn-sales-order-print/options — filter dropdowns.
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const [customers, agents, companies] = await Promise.all([
      pool.request().query("Select CustomerName, CustomerCode, AgentCode from tbl_Customer Order by CustomerName"),
      pool.request().query("Select AgentName, AgentCode from tbl_Agent where Yarn = 1 Order by AgentName"),
      pool.request().execute("sp_Company_GetAll"),
    ]);
    return sendSuccess(res, {
      customers: opt(customers, "CustomerCode", "CustomerName"),
      agents: opt(agents, "AgentCode", "AgentName"),
      companies: opt(companies, "CompanyCode", "CompanyName"),
      companyCode: getCompanyCode(req),
    });
  } catch (err) {
    console.error("DB Error (YarnSalesOrderPrint.getOptions):", err);
    return sendError(res, err);
  }
};

// GET /yarn-sales-order-print/lists?customerCode=&agentCode= — matching orders.
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const customerCode = toInt(req.query.customerCode);
    const agentCode = toInt(req.query.agentCode);

    const request = pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("FYCode", sql.Int, getFYCode(req));
    let where = "CompanyCode = @CompanyCode AND FYCode = @FYCode";
    if (customerCode > 0) {
      request.input("CustomerCode", sql.Int, customerCode);
      where += " AND CustomerCode = @CustomerCode";
    } else if (agentCode > 0) {
      request.input("AgentCode", sql.Int, agentCode);
      where += " AND AgentCode = @AgentCode";
    }
    const rs = await request.query(
      `select SOCode, SONo, SODate, CustomerName from vw_SalesOrder where ${where} Order by SONo DESC`
    );
    return sendSuccess(res, rs.recordset || []);
  } catch (err) {
    console.error("DB Error (YarnSalesOrderPrint.getList):", err);
    return sendError(res, err);
  }
};

// GET /yarn-sales-order-print/report/:soCode?mode= — data for the printable view.
export const getReport = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const companyCode = getCompanyCode(req);
    const soCode = toInt(req.params.soCode);
    if (soCode <= 0) return sendError(res, "Invalid SOCode", 400);
    const mode = (req.query.mode || "sales").toString().toLowerCase();

    const base = [
      pool.request().input("SOCode", sql.Int, soCode).query("Select * from vw_SalesOrder where SOCode = @SOCode"),
      pool.request().input("CompanyCode", sql.Int, companyCode).input("SOCode", sql.Int, soCode).execute("sp_SalesOrderDetails_GetAll"),
      pool.request().input("CompanyCode", sql.Int, companyCode).execute("sp_Company_GetAll"),
      pool.request().input("SOCode", sql.Int, soCode).query("Select 1 from vw_SalesOrder where Approval = 1 AND SOCode = @SOCode"),
    ];

    // Work Order print also pulls quality / packing / delivery (extra report bands).
    const extra =
      mode === "work"
        ? [
            pool.request().input("SOCode", sql.Int, soCode).execute("sp_SalesOrder_Quality_GetAll"),
            pool.request().input("SOCode", sql.Int, soCode).execute("sp_SalesOrder_PackingDetails_GetAll"),
            pool.request().input("SOCode", sql.Int, soCode).execute("sp_SalesOrder_DeliverySchedule_GetAll"),
          ]
        : [];

    const [header, details, company, approval, quality, packing, delivery] = await Promise.all([...base, ...extra]);

    return sendSuccess(res, {
      mode,
      approved: (approval.recordset || []).length > 0,
      company: company.recordset?.[0] || {},
      header: header.recordset?.[0] || {},
      details: details.recordset || [],
      quality: quality ? quality.recordset || [] : [],
      packing: packing ? packing.recordset || [] : [],
      delivery: delivery ? delivery.recordset || [] : [],
    });
  } catch (err) {
    console.error("DB Error (YarnSalesOrderPrint.getReport):", err);
    return sendError(res, err);
  }
};
