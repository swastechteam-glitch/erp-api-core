import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Customer master (port of the WinForms frmCustomer)
//   - List    : EXEC sp_Customer_GetAll              (vw_Customer rows)
//   - Create  : EXEC sp_Customer_AddEdit (no @CustomerCode)  -> Save
//   - Update  : EXEC sp_Customer_AddEdit (with @CustomerCode)
//   - Delete  : EXEC sp_Customer_Delete (@CustomerCode)
//   - Options : Company / CustomerType / State / Agent / Approval lookups
// AddEdit needs @User / @Node / @CompanyCode, read from the auth token (headers).
//
// Differs from the Customer Approve screen: @CustomerID is always 0 here, the
// delete proc keys on CustomerCode, and an Inactive status is blocked while the
// customer still has an outstanding balance (sp_Customer_CurBalance).
// The GSTIN auto-fetch (external RapidAPI lookup on the WinForms screen) is a
// front-end convenience and is NOT reproduced here.
// ---------------------------------------------------------------------------

const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");

const toBit = (v) => {
  if (v === true || v === 1 || v === "1") return 1;
  if (typeof v === "string" && v.trim().toUpperCase() === "ACTIVE") return 1;
  return 0;
};

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};

const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};

// GET /customer/lists  -> mirrors frmCustomerDetails list
export const getCustomerList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_Customer_GetAll");

    const data = result.recordset.map((item) => ({
      ...item,
      id: item.CustomerCode,
      StatusText: STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getCustomerList):", err);
    return sendError(res, err);
  }
};

// GET /customer/list/:customerCode  -> single record (vw_Customer)
export const getCustomerById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.customerCode);
    if (!code) return sendError(res, "Invalid CustomerCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CustomerCode", sql.Int, code)
      .query("Select * from vw_Customer where CustomerCode = @CustomerCode");

    if (!result.recordset.length)
      return sendError(res, "Customer not found", 404);

    const row = result.recordset[0];
    return sendSuccess(res, { ...row, StatusText: STATUS_LABEL(row.Status) });
  } catch (err) {
    console.error("DB Error (getCustomerById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_Customer_AddEdit (btnSave_Click)
const saveOrUpdateCustomer = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const customerTypeCode = toInt(body.CustomerTypeCode);
    const companyGroupCode = toInt(body.CompanyGroupCode);
    const name = (body.CustomerName || "").trim();
    const address1 = (body.Address1 || "").trim();
    const address2 = (body.Address2 || "").trim();
    const stateCode = toInt(body.StateCode);
    const agentCode = toInt(body.AgentCode);
    const approvalCode = toInt(body.ApprovalCode);
    const gstNo = (body.GSTINNo || "").trim();

    const yarn = toBit(body.Yarn);
    const waste = toBit(body.Waste);
    const scrap = toBit(body.Scrap);
    const rawMaterial = toBit(body.RawMaterial);
    const tcs = toBit(body.TCS);
    const status = toBit(body.Status);

    // Validations mirror btnSave_Click.
    if (!customerTypeCode) return sendError(res, "Select the Customer Type", 400);
    if (!companyGroupCode) return sendError(res, "Select the Company Group", 400);
    if (!name) return sendError(res, "Customer Name should not be empty", 400);
    if (!address1) return sendError(res, "Address 1 should not be empty", 400);
    if (!address2) return sendError(res, "Address 2 should not be empty", 400);
    if (!stateCode) return sendError(res, "Select the State Name", 400);
    if (!agentCode) return sendError(res, "Select the Agent Name", 400);
    if (!yarn && !waste && !scrap && !rawMaterial && !tcs)
      return sendError(
        res,
        "Select the Customer (Yarn / Cotton Waste / Scrap / RawMaterial)",
        400
      );
    if (!approvalCode) return sendError(res, "Select the Approval Name", 400);
    if (gstNo && gstNo.length !== 15)
      return sendError(res, "GST NO 15 CHAR NOT BE COMPLETED", 400);

    const code = isEdit
      ? parseInt(req.params.customerCode ?? body.CustomerCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid CustomerCode for update", 400);

    const pool = await getPool(req.headers.subdbname);

    // Block setting an existing customer Inactive while a balance is pending.
    if (isEdit && !status) {
      const bal = await pool
        .request()
        .input("CustomerCode", sql.Int, code)
        .execute("sp_Customer_CurBalance");
      const balance = (bal.recordset || []).reduce(
        (sum, r) => sum + toNum(r.ClosingAmount),
        0
      );
      if (balance > 0)
        return sendError(
          res,
          `Customer Balance available for this customer is ${balance.toFixed(
            2
          )} Sorry Can't able to inactive now`,
          400
        );
    }

    const request = pool.request();
    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) request.input("CustomerCode", sql.Int, code);

    request.input("CustomerTypeCode", sql.Int, customerTypeCode);
    request.input("CustomerName", sql.NVarChar, name);
    request.input("LastName", sql.NVarChar, (body.LastName || "").trim());
    request.input("Address1", sql.NVarChar, address1);
    request.input("Address2", sql.NVarChar, address2);
    request.input("City", sql.NVarChar, (body.City || "").trim());
    request.input("District", sql.NVarChar, (body.District || "").trim());
    request.input("StateCode", sql.Int, stateCode);
    request.input("PinCode", sql.NVarChar, (body.PinCode || "").trim());
    request.input("ContactPerson", sql.NVarChar, (body.ContactPerson || "").trim());
    request.input("PhoneNo", sql.NVarChar, (body.PhoneNo || "").trim());
    request.input("MobileNo", sql.NVarChar, (body.MobileNo || "").trim());
    request.input("EMail", sql.NVarChar, (body.EMail || "").trim());
    request.input("OpnBalance", sql.Decimal(18, 2), toNum(body.OpnBalance));
    request.input("CustomerID", sql.Int, 0); // generated elsewhere (approval flow)
    request.input("AgentCode", sql.Int, agentCode);
    request.input("CreditDays", sql.Int, toInt(body.CreditDays));
    request.input("CreditLimit", sql.Decimal(18, 2), toNum(body.CreditLimit));
    request.input("PanNo", sql.NVarChar, (body.PanNo || "").trim());
    request.input("TINNo", sql.NVarChar, (body.TINNo || "").trim());
    request.input("CSTNo", sql.NVarChar, (body.CSTNo || "").trim());
    request.input("CustomerNameInTally", sql.NVarChar, (body.CustomerNameInTally || "").trim());
    request.input("TurnOver1415", sql.Decimal(18, 2), toNum(body.TurnOver1415));
    request.input("TurnOver1516", sql.Decimal(18, 2), toNum(body.TurnOver1516));
    request.input("ApprovalCode", sql.Int, approvalCode);
    request.input("GSTINNo", sql.NVarChar, gstNo);
    request.input("CompanyGroupCode", sql.Int, companyGroupCode);
    request.input("Distance", sql.Decimal(18, 2), toNum(body.Distance));

    // Purchase-type flags (param names match the SP / WinForms exactly).
    request.input("Yarn", sql.Bit, yarn);
    request.input("Waste", sql.Bit, waste);
    request.input("Scrap", sql.Bit, scrap);
    request.input("RawMaterial", sql.Bit, rawMaterial);
    request.input("TCS", sql.Bit, tcs);
    request.input("WarpCustomer", sql.Bit, toBit(body.WarpCustomer));
    request.input("HosieryCustomer", sql.Bit, toBit(body.HosieryCustomer));

    request.input("Status", sql.Bit, status);
    request.input("CompanyCode", sql.Int, toInt(req.headers.companyCode));

    await request.execute("sp_Customer_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (err.message && err.message.includes("UK")) {
      return sendError(res, "Already exist the CustomerDetails Name", 409);
    }
    console.error("DB Error (saveOrUpdateCustomer):", err);
    return sendError(res, err);
  }
};

// POST /customer/create        -> create
export const createCustomer = (req, res) => saveOrUpdateCustomer(req, res, false);

// PUT  /customer/update/:code  -> update
export const updateCustomer = (req, res) => saveOrUpdateCustomer(req, res, true);

// DELETE /customer/delete/:customerCode -> EXEC sp_Customer_Delete
export const deleteCustomer = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.customerCode);
    if (!code) return sendError(res, "Invalid CustomerCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("CustomerCode", sql.Int, code)
      .execute("sp_Customer_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the Customer!", 409);
    }
    console.error("DB Error (deleteCustomer):", err);
    return sendError(res, err);
  }
};

// GET /customer/options -> dropdown lookups (Bind_Data()).
export const getCustomerOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const map = (rows, vKey, lKey) =>
      rows.map((r) => ({ value: r[vKey], label: r[lKey] }));

    const [companyGroups, customerTypes, states, agents, approvals] =
      await Promise.all([
        pool.request().query("Select CompanyGroupCode, CompanyGroupName from tbl_CompanyGroup"),
        pool.request().query("Select CustomerTypeCode, CustomerType from tbl_CustomerType"),
        pool.request().query("Select StateCode, StateName from tbl_State"),
        pool.request().query("Select AgentCode, AgentName from tbl_Agent"),
        pool.request().query("Select ApprovalCode, ApprovalName from tbl_Approval"),
      ]);

    return sendSuccess(res, {
      companyGroups: map(companyGroups.recordset, "CompanyGroupCode", "CompanyGroupName"),
      customerTypes: map(customerTypes.recordset, "CustomerTypeCode", "CustomerType"),
      states: map(states.recordset, "StateCode", "StateName"),
      agents: map(agents.recordset, "AgentCode", "AgentName"),
      approvals: map(approvals.recordset, "ApprovalCode", "ApprovalName"),
    });
  } catch (err) {
    console.error("DB Error (getCustomerOptions):", err);
    return sendError(res, err);
  }
};
