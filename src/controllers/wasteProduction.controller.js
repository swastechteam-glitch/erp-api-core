import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Waste Production (port of the WinForms frmWasteProduction / frmWasteProductionDetails)
//   Bale-by-bale waste-stock entry. Each Save inserts ONE bale row (or several
//   when "No of Bags" bulk add is used). The Add screen and the Edit/Delete grid
//   are merged into ONE React page, both menu leaves pointing to it.
//
//   - GET    /waste-production/options             -> supervisors/employees/wasteItems
//   - GET    /waste-production/next-bale-no         -> { baleNo } (sp_WasteBaleNo_Bind)
//   - GET    /waste-production/lists                -> sp_WasteStock_GetByWasteProductionDate
//                                                      (?fromDate&toDate&wasteItemCode&opening, paginated)
//   - GET    /waste-production/list/:wasteBaleCode  -> single row (from sp_WasteStock_GetAll)
//   - POST   /waste-production/create               -> sp_WasteStock_AddEdit (loop over No of Bags)
//   - PUT    /waste-production/update/:wasteBaleCode -> sp_WasteStock_AddEdit (with @WasteBaleCode)
//   - DELETE /waste-production/delete/:wasteBaleCode -> sp_WasteStock_Delete
//
// Company from req.headers.companyCode, FY from req.headers.FYCode; AddEdit also
// needs @User / @Node from req.headers.userId / nodeCode. The desktop-only serial
// scale (Connect/Disconnect/auto-post), barcode/label printing, beep sound and
// the attendance-gated employee list are NOT ported (employees come from
// vw_Employee; EntryType defaults to "M" / manual, "A" when the client flags scale).
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};
const toBit = (v) => {
  if (v === true || v === 1 || v === "1") return 1;
  if (typeof v === "string" && ["1", "TRUE", "YES"].includes(v.trim().toUpperCase())) return 1;
  return 0;
};
const round3 = (n) => Math.round((toNum(n) + Number.EPSILON) * 1000) / 1000;
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getFYCode = (req) => toInt(req.headers.FYCode);
const todayStr = () => new Date().toISOString().slice(0, 10);

// Hard flag for the bale-number generator (tbl_Setting.WasteBaleNo = 1).
const getHard = async (pool) => {
  const r = await pool
    .request()
    .query("SELECT COUNT(*) AS cnt FROM tbl_Setting WHERE WasteBaleNo = 1");
  return (r.recordset?.[0]?.cnt ?? 0) > 0 ? 1 : 0;
};

// sp_WasteBaleNo_Bind @CompanyCode, @FYCode, @Hard [, @WasteItemCode] -> scalar bale no
const nextBaleNo = async (pool, companyCode, fyCode, hard, wasteItemCode) => {
  const request = pool
    .request()
    .input("CompanyCode", sql.Int, companyCode)
    .input("FYCode", sql.Int, fyCode)
    .input("Hard", sql.Int, hard);
  if (toInt(wasteItemCode) > 0)
    request.input("WasteItemCode", sql.Int, toInt(wasteItemCode));
  const r = await request.execute("sp_WasteBaleNo_Bind");
  const row = r.recordset?.[0];
  return row ? toInt(Object.values(row)[0]) : 0;
};

// GET /waste-production/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const companyCode = getCompanyCode(req);

    const [employees, wasteItems] = await Promise.all([
      pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .query(
          "Select EmployeeCode, EmployeeName from vw_Employee where CompanyCode = @CompanyCode Order by EmployeeName"
        ),
      pool
        .request()
        .query(
          "Select WasteItemCode, WasteItemName, BaleTareWeight, TareZeroAllowed " +
            "from tbl_WasteItem where Status = 1 order by OrderNo"
        ),
    ]);

    const empOpts = employees.recordset.map((r) => ({
      value: r.EmployeeCode,
      label: r.EmployeeName,
    }));

    return sendSuccess(res, {
      // Supervisor + Employee are bound to the same employee list in the form.
      supervisors: empOpts,
      employees: empOpts,
      wasteItems: wasteItems.recordset.map((r) => ({
        value: r.WasteItemCode,
        label: r.WasteItemName,
        BaleTareWeight: r.BaleTareWeight ?? 0,
        TareZeroAllowed: toBit(r.TareZeroAllowed),
      })),
    });
  } catch (err) {
    console.error("DB Error (getOptions WasteProduction):", err);
    return sendError(res, err);
  }
};

// GET /waste-production/next-bale-no?wasteItemCode=
export const getNextBaleNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const hard = await getHard(pool);
    const baleNo = await nextBaleNo(
      pool,
      getCompanyCode(req),
      getFYCode(req),
      hard,
      req.query.wasteItemCode
    );
    return sendSuccess(res, { baleNo });
  } catch (err) {
    console.error("DB Error (getNextBaleNo WasteProduction):", err);
    return sendError(res, err);
  }
};

// Decorate a grid row for the UI.
const decorate = (row) => ({
  ...row,
  id: row.WasteBaleCode,
});

// GET /waste-production/lists  -> sp_WasteStock_GetByWasteProductionDate (filtered + paginated)
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);

    const fromDate = req.query.fromDate || todayStr();
    const toDate = req.query.toDate || todayStr();
    const wasteItemCode = toInt(req.query.wasteItemCode);
    const opening = toBit(req.query.opening);

    const request = pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("FromDate", sql.DateTime, new Date(fromDate))
      .input("ToDate", sql.DateTime, new Date(toDate))
      .input("Opening", sql.Bit, opening);
    // @WasteItemCode is nullable in the proc — pass NULL for "All".
    request.input(
      "WasteItemCode",
      sql.Int,
      wasteItemCode > 0 ? wasteItemCode : null
    );

    const result = await request.execute("sp_WasteStock_GetByWasteProductionDate");
    const data = result.recordset.map(decorate);
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getList WasteProduction):", err);
    return sendError(res, err);
  }
};

// GET /waste-production/list/:wasteBaleCode  -> single record (from GetAll)
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.wasteBaleCode);
    if (!code) return sendError(res, "Invalid WasteBaleCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("FYCode", sql.Int, getFYCode(req))
      .execute("sp_WasteStock_GetAll");

    const row = result.recordset.find((r) => Number(r.WasteBaleCode) === code);
    if (!row) return sendError(res, "Waste Production record not found", 404);
    return sendSuccess(res, decorate(row));
  } catch (err) {
    console.error("DB Error (getById WasteProduction):", err);
    return sendError(res, err);
  }
};

// sp_BaleNoCheck @CompanyCode, @BaleNo -> truthy scalar when the bag no already exists
const baleNoExists = async (pool, companyCode, baleNo) => {
  const r = await pool
    .request()
    .input("CompanyCode", sql.Int, companyCode)
    .input("BaleNo", sql.Int, baleNo)
    .execute("sp_BaleNoCheck");
  const row = r.recordset?.[0];
  if (!row) return false;
  const v = Object.values(row)[0];
  return v !== null && v !== undefined && toNum(v) !== 0;
};

// Build and run sp_WasteStock_AddEdit for one bale.
const addEditBale = async (pool, req, { code, baleNo, body, wasteItem, net }) => {
  const request = pool.request();
  if (code) request.input("WasteBaleCode", sql.Int, code);
  request.input("BaleNo", sql.Int, baleNo);
  request.input("WasteProductionDate", sql.DateTime, new Date(body.WasteProductionDate));
  request.input("Opening", sql.Bit, toBit(body.Opening));
  request.input("SupervisorCode", sql.Int, toInt(body.SupervisorCode));
  request.input("EmployeeCode", sql.Int, toInt(body.EmployeeCode));
  request.input("GrossWeight", sql.Decimal(18, 3), round3(body.GrossWeight));
  request.input("TareWeight", sql.Decimal(18, 3), round3(body.TareWeight));
  request.input("NetWeight", sql.Decimal(18, 3), net);
  request.input("TrallyWeight", sql.Decimal(18, 3), round3(body.TrallyWeight));
  request.input("Companycode", sql.Int, getCompanyCode(req));
  request.input(
    "EntryType",
    sql.NVarChar,
    String(body.EntryType || "M").toUpperCase() === "A" ? "A" : "M"
  );
  request.input("WasteItemCode", sql.Int, toInt(body.WasteItemCode));
  request.input("User", sql.Int, toInt(req.headers.userId));
  request.input("Node", sql.Int, toInt(req.headers.nodeCode));
  await request.execute("sp_WasteStock_AddEdit");
};

// Shared validation (mirrors frmWasteProduction btnSave_Click).
const validateBale = (body, wasteItem) => {
  if (!body.WasteProductionDate || Number.isNaN(new Date(body.WasteProductionDate).getTime()))
    return "Invalid Ref. Date";
  if (toInt(body.SupervisorCode) <= 0) return "Select the Supervisor";
  if (toInt(body.EmployeeCode) <= 0) return "Select the Employee";
  if (toInt(body.WasteItemCode) <= 0) return "Select the Waste Item";
  if (toNum(body.GrossWeight) <= 0) return "Gross Weight should not be zero";
  // Tare may be zero only when the waste item allows it.
  if (!wasteItem?.TareZeroAllowed && toNum(body.TareWeight) <= 0)
    return "Tare Weight should not be zero";
  const net = round3(toNum(body.GrossWeight) - toNum(body.TareWeight) - toNum(body.TrallyWeight));
  if (net > round3(body.GrossWeight))
    return "Net Weight should not be greater than Gross Weight";
  if (net <= 0) return "Net Weight should not be zero";
  return null;
};

// Fetch the selected waste item (for TareZeroAllowed).
const getWasteItem = async (pool, wasteItemCode) => {
  const r = await pool
    .request()
    .input("WasteItemCode", sql.Int, toInt(wasteItemCode))
    .query(
      "Select WasteItemCode, BaleTareWeight, TareZeroAllowed from tbl_WasteItem where WasteItemCode = @WasteItemCode"
    );
  const row = r.recordset?.[0];
  return row ? { ...row, TareZeroAllowed: toBit(row.TareZeroAllowed) } : null;
};

// POST /waste-production/create  (loops over "No of Bags" bulk add)
export const createWasteProduction = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    if (!req.headers.userId || !req.headers.nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const pool = await getPool(req.headers.subdbname);
    const companyCode = getCompanyCode(req);
    const fyCode = getFYCode(req);

    const wasteItem = await getWasteItem(pool, body.WasteItemCode);
    const err = validateBale(body, wasteItem);
    if (err) return sendError(res, err, 400);

    const opening = toBit(body.Opening);
    // Opening-stock bales carry a user-entered bale no (single bag). Production
    // bales are auto-numbered, one per bag.
    const noOfBags = opening ? 1 : Math.max(1, toInt(body.NoOfBags) || 1);
    const hard = await getHard(pool);
    const net = round3(toNum(body.GrossWeight) - toNum(body.TareWeight) - toNum(body.TrallyWeight));

    const saved = [];
    for (let i = 0; i < noOfBags; i++) {
      const baleNo = opening
        ? toInt(body.BaleNo)
        : await nextBaleNo(pool, companyCode, fyCode, hard, body.WasteItemCode);
      if (baleNo <= 0) return sendError(res, "Bag No should not be empty", 400);
      if (await baleNoExists(pool, companyCode, baleNo))
        return sendError(res, "Already Exist the BagNo", 409);
      await addEditBale(pool, req, { code: null, baleNo, body, wasteItem, net });
      saved.push(baleNo);
    }

    return sendSuccess(res, { baleNos: saved }, "The record is saved", 201);
  } catch (err) {
    if (err.message && err.message.includes("PK_WasteStock_BagNo"))
      return sendError(res, "Already exist the BagNo", 409);
    console.error("DB Error (createWasteProduction):", err);
    return sendError(res, err);
  }
};

// PUT /waste-production/update/:wasteBaleCode
export const updateWasteProduction = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    if (!req.headers.userId || !req.headers.nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const code = toInt(req.params.wasteBaleCode);
    if (!code) return sendError(res, "Invalid WasteBaleCode", 400);

    const body = req.body || {};
    const pool = await getPool(req.headers.subdbname);

    const wasteItem = await getWasteItem(pool, body.WasteItemCode);
    const err = validateBale(body, wasteItem);
    if (err) return sendError(res, err, 400);

    const baleNo = toInt(body.BaleNo);
    if (baleNo <= 0) return sendError(res, "Bag No should not be empty", 400);
    const net = round3(toNum(body.GrossWeight) - toNum(body.TareWeight) - toNum(body.TrallyWeight));

    await addEditBale(pool, req, { code, baleNo, body, wasteItem, net });
    return sendSuccess(res, { WasteBaleCode: code }, "The record is updated", 200);
  } catch (err) {
    if (err.message && err.message.includes("PK_WasteStock_BagNo"))
      return sendError(res, "Already exist the BagNo", 409);
    console.error("DB Error (updateWasteProduction):", err);
    return sendError(res, err);
  }
};

// DELETE /waste-production/delete/:wasteBaleCode
export const deleteWasteProduction = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.wasteBaleCode);
    if (!code) return sendError(res, "Invalid WasteBaleCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const companyCode = getCompanyCode(req);

    // Guards mirror frmWasteProductionDetails: a bale already in a Waste DC or a
    // Waste Invoice cannot be deleted.
    const [dc, inv] = await Promise.all([
      pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("WasteBaleCode", sql.Int, code)
        .query("Select 1 from tbl_WasteDCDetails where CompanyCode = @CompanyCode AND WasteBaleCode = @WasteBaleCode"),
      pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("WasteBaleCode", sql.Int, code)
        .query("Select 1 from tbl_WasteInvoice_BaleDetails where CompanyCode = @CompanyCode AND WasteBaleCode = @WasteBaleCode"),
    ]);
    if (dc.recordset.length)
      return sendError(res, "This Bale Already DC Entry", 409);
    if (inv.recordset.length)
      return sendError(res, "This Bale Already Billed", 409);

    await pool
      .request()
      .input("CompanyCode", sql.Int, companyCode)
      .input("WasteBaleCode", sql.Int, code)
      .execute("sp_WasteStock_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("REFERENCE") || err.message.includes("FK_")))
      return sendError(res, "You can not delete the Waste Production!", 409);
    console.error("DB Error (deleteWasteProduction):", err);
    return sendError(res, err);
  }
};
