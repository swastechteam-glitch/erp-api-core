import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Customer Approve master (port of the WinForms frmCustomerApprove)
//   - List    : EXEC sp_Customer_GetAll              (vw_Customer rows)
//   - Create  : EXEC sp_Customer_AddEdit (no @CustomerCode) -> "Approve"
//   - Update  : EXEC sp_Customer_AddEdit (with @CustomerCode)
//   - Delete  : EXEC sp_CustomerApproved_Delete (@CustomerApprovedCode)
//   - Options : Company / CustomerType / State / Agent / Approval lookups
// AddEdit needs @User / @Node / @CompanyCode, read from the auth token (headers).
// On approve a CustomerID is generated via sp_Customer_CustomerID.
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

// GET /customer-approve/lists  -> mirrors frmCustomerApprovedDetailsEdit list
export const getCustomerApproveList = async (req, res) => {
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
    console.error("DB Error (getCustomerApproveList):", err);
    return sendError(res, err);
  }
};

// GET /customer-approve/list/:customerCode  -> single record (vw_Customer)
export const getCustomerApproveById = async (req, res) => {
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
    console.error("DB Error (getCustomerApproveById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_Customer_AddEdit (btnApprove_Click)
const saveOrUpdateCustomer = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const companyGroupCode = toInt(body.CompanyGroupCode);
    const customerTypeCode = toInt(body.CustomerTypeCode);
    const name = (body.CustomerName || "").trim();
    const address1 = (body.Address1 || "").trim();
    const stateCode = toInt(body.StateCode);
    const agentCode = toInt(body.AgentCode);
    const approvalCode = toInt(body.ApprovalCode);
    const approved = toBit(body.Approved);
    const nameInTally = (body.CustomerNameInTally || "").trim();

    const yarn = toBit(body.Yarn);
    const waste = toBit(body.Waste);
    const scrap = toBit(body.Scrap);
    const rawMaterial = toBit(body.RawMaterial);

    // Validations mirror btnApprove_Click.
    if (!companyGroupCode) return sendError(res, "Select the Company Group", 400);
    if (!customerTypeCode) return sendError(res, "Select the Customer Type", 400);
    if (!name) return sendError(res, "Customer Name should not be empty", 400);
    if (!address1) return sendError(res, "Address 1 should not be empty", 400);
    if (!stateCode) return sendError(res, "Select the State Name", 400);
    if (!agentCode) return sendError(res, "Select the Agent Name", 400);
    if (!approvalCode) return sendError(res, "Select the Approval Name", 400);
    if (!approved) return sendError(res, "Click the Approve Box", 400);
    if (!nameInTally)
      return sendError(res, "Enter the Customer Name In Tally", 400);
    if (!yarn && !waste && !scrap && !rawMaterial)
      return sendError(
        res,
        "Select the Customer (Yarn / Cotton Waste / Scrap / RawMaterial)",
        400
      );

    const code = isEdit
      ? parseInt(req.params.customerCode ?? body.CustomerCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid CustomerCode for update", 400);

    const pool = await getPool(req.headers.subdbname);

    // Approving generates the CustomerID (sp_Customer_CustomerID) when absent.
    let customerId = toInt(body.CustomerID);
    if (!customerId) {
      const idRes = await pool.request().execute("sp_Customer_CustomerID");
      const idRow = idRes.recordset?.[0];
      customerId = idRow ? toInt(Object.values(idRow)[0]) : 0;
    }

    const request = pool.request();
    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) request.input("CustomerCode", sql.Int, code);

    request.input("CustomerTypeCode", sql.Int, customerTypeCode);
    request.input("CustomerName", sql.NVarChar, name);
    request.input("LastName", sql.NVarChar, (body.LastName || "").trim());
    request.input("Address1", sql.NVarChar, address1);
    request.input("Address2", sql.NVarChar, (body.Address2 || "").trim());
    request.input("City", sql.NVarChar, (body.City || "").trim());
    request.input("District", sql.NVarChar, (body.District || "").trim());
    request.input("StateCode", sql.Int, stateCode);
    request.input("PinCode", sql.NVarChar, (body.PinCode || "").trim());
    request.input("ContactPerson", sql.NVarChar, (body.ContactPerson || "").trim());
    request.input("PhoneNo", sql.NVarChar, (body.PhoneNo || "").trim());
    request.input("MobileNo", sql.NVarChar, (body.MobileNo || "").trim());
    request.input("EMail", sql.NVarChar, (body.EMail || "").trim());
    request.input("OpnBalance", sql.Decimal(18, 2), toNum(body.OpnBalance));
    request.input("CustomerID", sql.Int, customerId);
    request.input("AgentCode", sql.Int, agentCode);
    request.input("CreditDays", sql.Int, toInt(body.CreditDays));
    request.input("CreditLimit", sql.Decimal(18, 2), toNum(body.CreditLimit));
    request.input("PanNo", sql.NVarChar, (body.PanNo || "").trim());
    request.input("TINNo", sql.NVarChar, (body.TINNo || "").trim());
    request.input("CSTNo", sql.NVarChar, (body.CSTNo || "").trim());
    request.input("GSTINNo", sql.NVarChar, (body.GSTINNo || "").trim());
    request.input("CustomerNameInTally", sql.NVarChar, nameInTally);
    request.input("TurnOver1415", sql.Decimal(18, 2), toNum(body.TurnOver1415));
    request.input("TurnOver1516", sql.Decimal(18, 2), toNum(body.TurnOver1516));
    request.input("ApprovalCode", sql.Int, approvalCode);
    request.input("CompanyGroupCode", sql.Int, companyGroupCode);
    request.input("Distance", sql.Decimal(18, 2), toNum(body.Distance));

    // Purchase-type flags (param names match the SP / WinForms exactly).
    request.input("Yarn", sql.Bit, yarn);
    request.input("Waste", sql.Bit, waste);
    request.input("Scrap", sql.Bit, scrap);
    request.input("RawMaterial", sql.Bit, rawMaterial);
    request.input("WarpCustomer", sql.Bit, toBit(body.WarpCustomer));
    request.input("HosieryCustomer", sql.Bit, toBit(body.HosieryCustomer));
    request.input("TCS", sql.Bit, toBit(body.TCS));

    request.input("Status", sql.Bit, toBit(body.Status));
    request.input("CompanyCode", sql.Int, toInt(req.headers.companyCode));

    await request.execute("sp_Customer_AddEdit");

    return sendSuccess(
      res,
      { CustomerID: customerId },
      "The record is Approved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (
      err.message &&
      err.message.includes("UK_CustomerDetailsName_tblCustomerDetails")
    ) {
      return sendError(res, "Already exist the CustomerDetails Name", 409);
    }
    console.error("DB Error (saveOrUpdateCustomer):", err);
    return sendError(res, err);
  }
};

// POST /customer-approve/create        -> approve (create)
export const createCustomerApprove = (req, res) =>
  saveOrUpdateCustomer(req, res, false);

// PUT  /customer-approve/update/:code  -> approve (update)
export const updateCustomerApprove = (req, res) =>
  saveOrUpdateCustomer(req, res, true);

// DELETE /customer-approve/delete/:customerCode
//   Resolves CustomerApprovedCode from the view, then sp_CustomerApproved_Delete.
export const deleteCustomerApprove = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.customerCode);
    if (!code) return sendError(res, "Invalid CustomerCode", 400);

    const pool = await getPool(req.headers.subdbname);

    const lookup = await pool
      .request()
      .input("CustomerCode", sql.Int, code)
      .query(
        "Select CustomerApprovedCode from vw_Customer where CustomerCode = @CustomerCode"
      );

    const approvedCode = lookup.recordset?.[0]?.CustomerApprovedCode;
    if (!approvedCode)
      return sendError(res, "Customer approval record not found", 404);

    await pool
      .request()
      .input("CustomerApprovedCode", sql.Int, approvedCode)
      .execute("sp_CustomerApproved_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the Customer!", 409);
    }
    console.error("DB Error (deleteCustomerApprove):", err);
    return sendError(res, err);
  }
};

// GET /customer-approve/options -> dropdown lookups (Bind_Data()).
export const getCustomerApproveOptions = async (req, res) => {
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
    console.error("DB Error (getCustomerApproveOptions):", err);
    return sendError(res, err);
  }
};
