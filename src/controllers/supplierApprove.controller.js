import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";
import { getStates, getBanks, getCompanyGroups } from "../utils/masters.js";

// ---------------------------------------------------------------------------
// Supplier Approval master (port of the WinForms frmSupplierApproval)
//   - List    : EXEC sp_Supplier_GetAll_PendApprove
//   - Create  : EXEC sp_Supplier_AddEdit (no @SupplierCode) -> "Approve"
//   - Update  : EXEC sp_Supplier_AddEdit (with @SupplierCode)
//   - Delete  : EXEC sp_Supplier_Delete
//   - Options : State / Bank / Company lookups (GET /supplier/options)
// AddEdit returns the SupplierCode; we then re-sync the child "supplier details"
// rows (bank / contact list) in the SAME transaction:
//   sp_SupplierDetails_Delete  then a loop of sp_SupplierDetails_Insert.
// On approve a SupplierID is generated via sp_Supplier_SupplierID.
//
// NOTE: the editable bank/contact child grid is exposed through the API as a
// `details[]` array but is NOT yet built in the React UI (parent fields only).
// When `details` is omitted the existing detail rows are left untouched.
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

// GET /supplier/lists  -> mirrors frmSupplierApprovalDetails list
export const getSupplierList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_Supplier_GetAll_PendApprove");

    const data = result.recordset.map((item) => ({
      ...item,
      id: item.SupplierCode,
      StatusText: STATUS_LABEL(item.Status),
    }));

    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getSupplierList):", err);
    return sendError(res, err);
  }
};

// GET /supplier/list/:supplierCode  -> single record (+ child details)
export const getSupplierById = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.supplierCode);
    if (!code) return sendError(res, "Invalid SupplierCode", 400);

    const pool = await getPool(req.headers.subdbname);

    // Pull the parent row from the same source the list uses.
    const listRes = await pool.request().execute("sp_Supplier_GetAll_PendApprove");
    const row = listRes.recordset.find((r) => r.SupplierCode === code);
    if (!row) return sendError(res, "Supplier not found", 404);

    // Child bank/contact rows.
    const detRes = await pool
      .request()
      .input("SupplierCode", sql.Int, code)
      .execute("sp_SupplierDetails_GetAll");

    return sendSuccess(res, {
      ...row,
      Mail: row.Mail ?? row.MailID, // SP param is @Mail, column is MailID
      StatusText: STATUS_LABEL(row.Status),
      details: detRes.recordset || [],
    });
  } catch (err) {
    console.error("DB Error (getSupplierById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_Supplier_AddEdit (btnApprove_Click)
const saveOrUpdateSupplier = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const companyGroupCode = toInt(body.CompanyGroupCode);
    const name = (body.SupplierName || "").trim();
    const stateCode = toInt(body.StateCode);
    const approved = toBit(body.Approved);
    const nameInTally = (body.SupplierNameInTally || "").trim();

    // Validations mirror btnApprove_Click.
    if (!companyGroupCode) return sendError(res, "Select the Company Group", 400);
    if (!name) return sendError(res, "Supplier Name should not be empty", 400);
    if (!stateCode) return sendError(res, "Select the State Name", 400);
    if (!approved) return sendError(res, "Click the Approve Box", 400);
    if (!nameInTally)
      return sendError(res, "Enter the Supplier Name In Tally", 400);

    const code = isEdit
      ? parseInt(req.params.supplierCode ?? body.SupplierCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid SupplierCode for update", 400);

    const pool = await getPool(req.headers.subdbname);

    // Approving generates the SupplierID (sp_Supplier_SupplierID) when absent.
    let supplierId = toInt(body.SupplierID);
    if (!supplierId) {
      const idRes = await pool.request().execute("sp_Supplier_SupplierID");
      const idRow = idRes.recordset?.[0];
      supplierId = idRow ? toInt(Object.values(idRow)[0]) : 0;
    }

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const request = new sql.Request(tx);
      request.input("User", sql.Int, parseInt(userId));
      request.input("Node", sql.Int, parseInt(nodeCode));
      if (isEdit) request.input("SupplierCode", sql.Int, code);

      request.input("SupplierName", sql.NVarChar, name);
      request.input("Address1", sql.NVarChar, (body.Address1 || "").trim());
      request.input("Address2", sql.NVarChar, (body.Address2 || "").trim());
      request.input("City", sql.NVarChar, (body.City || "").trim());
      request.input("District", sql.NVarChar, (body.District || "").trim());
      request.input("StateCode", sql.Int, stateCode);
      request.input("PinCode", sql.NVarChar, (body.PinCode || "").trim());
      request.input("TinNo", sql.NVarChar, (body.TinNo || "").trim());
      request.input("CSTNo", sql.NVarChar, (body.CSTNo || "").trim());
      request.input("GSTNo", sql.NVarChar, (body.GSTNo || "").trim());
      request.input("Financier", sql.Bit, toBit(body.Financier));
      request.input("Insurar", sql.Bit, toBit(body.Insurar));
      request.input("Service", sql.Bit, toBit(body.Service));
      request.input("FuelBunk", sql.Bit, toBit(body.FuelBunk));
      request.input("Cotton", sql.Bit, toBit(body.Cotton));
      request.input("Waste", sql.Bit, toBit(body.Waste));
      request.input("Yarn", sql.Bit, toBit(body.Yarn));
      request.input("Stores", sql.Bit, toBit(body.Stores));
      request.input("CreditDays", sql.Int, toInt(body.CreditDays));
      request.input("OpnBalance", sql.Decimal(18, 2), toNum(body.OpnBalance));
      request.input("SupplierID", sql.Int, supplierId);
      request.input("SupplierNameInTally", sql.NVarChar, nameInTally);
      request.input("CompanyGroupCode", sql.Int, companyGroupCode);
      request.input("Status", sql.Bit, toBit(body.Status));
      request.input("CompanyCode", sql.Int, toInt(req.headers.companyCode));
      request.input("Mail", sql.NVarChar, (body.Mail || "").trim());
      request.input("MainMobileNo", sql.NVarChar, (body.MainMobileNo || "").trim());
      request.input("TCSApply", sql.Bit, toBit(body.TCSApply));

      const result = await request.execute("sp_Supplier_AddEdit");
      const scalarRow = result.recordset?.[0];
      const supplierCode = scalarRow
        ? toInt(Object.values(scalarRow)[0])
        : code || 0;

      // Re-sync the bank/contact child rows only when the client sends them.
      if (Array.isArray(body.details)) {
        await new sql.Request(tx)
          .input("SupplierCode", sql.Int, supplierCode)
          .execute("sp_SupplierDetails_Delete");

        let sno = 1;
        for (const d of body.details) {
          await new sql.Request(tx)
            .input("SupplierCode", sql.Int, supplierCode)
            .input("SNo", sql.Int, sno)
            .input("Section", sql.NVarChar, (d.Section || "").trim())
            .input("ContactPerson", sql.NVarChar, (d.ContactPerson || "").trim())
            .input("PhoneNo", sql.NVarChar, (d.PhoneNo || "").trim())
            .input("MobileNo", sql.NVarChar, (d.MobileNo || "").trim())
            .input("EMail", sql.NVarChar, (d.EMail || "").trim())
            .input("BankCode", sql.Int, toInt(d.BankCode))
            .input("AccountNo", sql.NVarChar, (d.AccountNo || "").trim())
            .input("IFSCCode", sql.NVarChar, (d.IFSCCode || "").trim())
            .input("FavourName", sql.NVarChar, (d.FavourName || "").trim())
            .execute("sp_SupplierDetails_Insert");
          sno++;
        }
      }

      await tx.commit();
      return sendSuccess(
        res,
        { SupplierCode: supplierCode, SupplierID: supplierId },
        "The record is Approved",
        isEdit ? 200 : 201
      );
    } catch (txErr) {
      try {
        await tx.rollback();
      } catch (_) {}
      throw txErr;
    }
  } catch (err) {
    if (
      err.message &&
      err.message.includes("UK_SupplierDetailsName_tblSupplierDetails")
    ) {
      return sendError(res, "Already exist the SupplierDetails Name", 409);
    }
    console.error("DB Error (saveOrUpdateSupplier):", err);
    return sendError(res, err);
  }
};

// POST /supplier/create        -> approve (create)
export const createSupplier = (req, res) => saveOrUpdateSupplier(req, res, false);

// PUT  /supplier/update/:code  -> approve (update)
export const updateSupplier = (req, res) => saveOrUpdateSupplier(req, res, true);

// DELETE /supplier/delete/:supplierCode -> EXEC sp_Supplier_Delete
export const deleteSupplier = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const code = parseInt(req.params.supplierCode);
    if (!code) return sendError(res, "Invalid SupplierCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("SupplierCode", sql.Int, code)
      .execute("sp_Supplier_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (
      err.message &&
      (err.message.includes("REFERENCE") || err.message.includes("FK_"))
    ) {
      return sendError(res, "You can not delete the Supplier!", 409);
    }
    console.error("DB Error (deleteSupplier):", err);
    return sendError(res, err);
  }
};

// GET /supplier/options -> dropdown lookups (Bind_Data()).
export const getSupplierOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);

    const [states, banks, companyGroups] = await Promise.all([
      getStates(pool),
      getBanks(pool),
      getCompanyGroups(pool),
    ]);

    return sendSuccess(res, { states, banks, companyGroups });
  } catch (err) {
    console.error("DB Error (getSupplierOptions):", err);
    return sendError(res, err);
  }
};
