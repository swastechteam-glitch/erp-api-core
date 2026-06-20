import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Supplier master (port of the WinForms frmSupplier — the plain Save flow)
//   - List    : EXEC sp_Supplier_GetAll
//   - Create  : EXEC sp_Supplier_AddEdit (no @SupplierCode) -> Save
//   - Update  : EXEC sp_Supplier_AddEdit (with @SupplierCode)
//   - Delete  : EXEC sp_Supplier_Delete
//   - Options : State / Bank / Company lookups (GET /supplier/options)
// AddEdit returns the SupplierCode; we then re-sync the child "supplier details"
// rows (bank / contact list) in the SAME transaction:
//   sp_SupplierDetails_Delete then a loop of sp_SupplierDetails_Insert.
//
// Sibling of the Supplier Approval screen (/supplier-approve): same procs, but
// no Approve checkbox / SupplierID generation, list is sp_Supplier_GetAll, and
// the required fields match frmSupplier.btnSave_Click.
//
// NOTE: the editable bank/contact child grid is exposed as a `details[]` array
// but is NOT yet built in the React UI (parent fields only). When `details` is
// omitted the existing detail rows are left untouched. The GSTIN auto-fetch
// (external RapidAPI lookup) on the WinForms screen is not reproduced here.
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

// GET /supplier/lists  -> mirrors frmSupplierDetails list
export const getSupplierList = async (req, res) => {
  try {
    if (!req.headers.subdbname)
      return sendError(res, "Missing subDBName", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().execute("sp_Supplier_GetAll");

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

    const listRes = await pool.request().execute("sp_Supplier_GetAll");
    const row = listRes.recordset.find((r) => r.SupplierCode === code);
    if (!row) return sendError(res, "Supplier not found", 404);

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

// Shared add/edit handler -> EXEC sp_Supplier_AddEdit (btnSave_Click)
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
    const address1 = (body.Address1 || "").trim();
    const address2 = (body.Address2 || "").trim();
    const city = (body.City || "").trim();
    const district = (body.District || "").trim();
    const stateCode = toInt(body.StateCode);
    const pinCode = (body.PinCode || "").trim();
    const gstNo = (body.GSTNo || "").trim();

    // Validations mirror btnSave_Click.
    if (!companyGroupCode) return sendError(res, "Select the Company Group", 400);
    if (!name) return sendError(res, "Supplier Name should not be empty", 400);
    if (!address1) return sendError(res, "Select the Address Line 1", 400);
    if (!address2) return sendError(res, "Select the Address Line 2", 400);
    if (!city) return sendError(res, "Select the City", 400);
    if (!district) return sendError(res, "Select the District", 400);
    if (!stateCode) return sendError(res, "Select the State Name", 400);
    if (!pinCode) return sendError(res, "Select the Pincode", 400);
    if (gstNo && gstNo.length !== 15)
      return sendError(res, "GST NO 15 CHAR NOT BE COMPLETED", 400);

    const code = isEdit
      ? parseInt(req.params.supplierCode ?? body.SupplierCode)
      : null;
    if (isEdit && !code)
      return sendError(res, "Invalid SupplierCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const request = new sql.Request(tx);
      request.input("User", sql.Int, parseInt(userId));
      request.input("Node", sql.Int, parseInt(nodeCode));
      if (isEdit) request.input("SupplierCode", sql.Int, code);

      request.input("SupplierName", sql.NVarChar, name);
      request.input("Address1", sql.NVarChar, address1);
      request.input("Address2", sql.NVarChar, address2);
      request.input("City", sql.NVarChar, city);
      request.input("District", sql.NVarChar, district);
      request.input("StateCode", sql.Int, stateCode);
      request.input("PinCode", sql.NVarChar, pinCode);
      request.input("TinNo", sql.NVarChar, (body.TinNo || "").trim());
      request.input("CSTNo", sql.NVarChar, (body.CSTNo || "").trim());
      request.input("GSTNo", sql.NVarChar, gstNo);
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
      request.input("CompanyGroupCode", sql.Int, companyGroupCode);
      request.input("SupplierNameInTally", sql.NVarChar, (body.SupplierNameInTally || "").trim());
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
        { SupplierCode: supplierCode },
        isEdit ? "The record is updated" : "The record is saved",
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

// POST /supplier/create        -> create
export const createSupplier = (req, res) => saveOrUpdateSupplier(req, res, false);

// PUT  /supplier/update/:code  -> update
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
    const map = (rows, vKey, lKey) =>
      rows.map((r) => ({ value: r[vKey], label: r[lKey] }));

    const [states, banks, companyGroups] = await Promise.all([
      pool.request().query("Select StateCode, StateName from tbl_State Order by StateName"),
      pool.request().query("Select BankCode, BankName from tbl_Bank Order by BankName"),
      pool.request().query("Select CompanyGroupCode, CompanyGroupName from tbl_CompanyGroup"),
    ]);

    return sendSuccess(res, {
      states: map(states.recordset, "StateCode", "StateName"),
      banks: map(banks.recordset, "BankCode", "BankName"),
      companyGroups: map(companyGroups.recordset, "CompanyGroupCode", "CompanyGroupName"),
    });
  } catch (err) {
    console.error("DB Error (getSupplierOptions):", err);
    return sendError(res, err);
  }
};
