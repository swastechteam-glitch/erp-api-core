import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Usable Waste Production (port of the WinForms frmUsableWasteProduction /
//   frmUsableWasteProductionDetails). Bale-by-bale usable-waste-stock entry.
//   Each Save inserts ONE bale row (or several when "No of Bags" bulk add is
//   used). The Add screen and the Edit/Delete grid are merged into ONE React
//   page, both menu leaves pointing to it.
//
//   - GET    /usable-waste-production/options                    -> supervisors/employees/usableWasteItems
//   - GET    /usable-waste-production/next-bale-no               -> { baleNo } (max(BaleNo)+1)
//   - GET    /usable-waste-production/lists                      -> sp_UsableWasteStock_GetByUsableWasteProductionDate
//                                                                   (?fromDate&toDate&usableWasteItemCode&opening, paginated)
//   - GET    /usable-waste-production/list/:usableWasteBaleCode  -> single row (from sp_UsableWasteStock_GetAll)
//   - POST   /usable-waste-production/create                     -> sp_UsableWasteStock_AddEdit (loop over No of Bags)
//   - PUT    /usable-waste-production/update/:usableWasteBaleCode -> sp_UsableWasteStock_AddEdit (matched by BaleNo)
//   - DELETE /usable-waste-production/delete/:usableWasteBaleCode -> sp_UsableWasteStock_Delete
//
// Company from req.headers.companyCode, FY from req.headers.FYCode; AddEdit also
// needs @User / @Node from req.headers.userId / nodeCode. The desktop-only serial
// scale (Connect/Disconnect/auto-post), barcode/label printing and beep sound are
// NOT ported (employees come from vw_Employee; EntryType defaults to "M" / manual,
// "A" when the client flags scale).
//
// NB: unlike Waste Production, sp_UsableWasteStock_AddEdit does NOT take a bale
// code — it upserts on (CompanyCode, BaleNo) exactly like the desktop, so the
// update path simply re-saves the existing BaleNo. The next-bale-no is a plain
// max(BaleNo)+1 query (no Hard flag / per-item generator).
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

// Next bag no — select isnull(max(BaleNo),0)+1 from tbl_UsableWasteStock (per company + FY).
const nextBaleNo = async (pool, companyCode, fyCode) => {
  const r = await pool
    .request()
    .input("CompanyCode", sql.Int, companyCode)
    .input("FYCode", sql.Int, fyCode)
    .query(
      "Select ISNULL(MAX(BaleNo), 0) + 1 AS BaleNo from tbl_UsableWasteStock " +
        "where CompanyCode = @CompanyCode AND FYCode = @FYCode"
    );
  return toInt(r.recordset?.[0]?.BaleNo) || 1;
};

// GET /usable-waste-production/options
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const companyCode = getCompanyCode(req);

    const [employees, usableWasteItems] = await Promise.all([
      pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .query(
          "Select EmployeeCode, EmployeeName from vw_Employee where CompanyCode = @CompanyCode Order by EmployeeName"
        ),
      pool
        .request()
        .query(
          "Select UsableWasteItemCode, UsableWasteItemName, BaleTareWeight, TareZeroAllowed " +
            "from tbl_UsableWasteItem order by OrderNo"
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
      usableWasteItems: usableWasteItems.recordset.map((r) => ({
        value: r.UsableWasteItemCode,
        label: r.UsableWasteItemName,
        BaleTareWeight: r.BaleTareWeight ?? 0,
        TareZeroAllowed: toBit(r.TareZeroAllowed),
      })),
    });
  } catch (err) {
    console.error("DB Error (getOptions UsableWasteProduction):", err);
    return sendError(res, err);
  }
};

// GET /usable-waste-production/next-bale-no
export const getNextBaleNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const baleNo = await nextBaleNo(pool, getCompanyCode(req), getFYCode(req));
    return sendSuccess(res, { baleNo });
  } catch (err) {
    console.error("DB Error (getNextBaleNo UsableWasteProduction):", err);
    return sendError(res, err);
  }
};

// Decorate a grid row for the UI.
const decorate = (row) => ({
  ...row,
  id: row.UsableWasteBaleCode,
});

// GET /usable-waste-production/lists  -> sp_UsableWasteStock_GetByUsableWasteProductionDate (filtered + paginated)
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);

    const fromDate = req.query.fromDate || todayStr();
    const toDate = req.query.toDate || todayStr();
    const usableWasteItemCode = toInt(req.query.usableWasteItemCode);
    const opening = toBit(req.query.opening);

    const request = pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("FromDate", sql.DateTime, new Date(fromDate))
      .input("ToDate", sql.DateTime, new Date(toDate))
      .input("Opening", sql.Bit, opening);
    // @UsableWasteItemCode is nullable in the proc — pass NULL for "All".
    request.input(
      "UsableWasteItemCode",
      sql.Int,
      usableWasteItemCode > 0 ? usableWasteItemCode : null
    );

    const result = await request.execute(
      "sp_UsableWasteStock_GetByUsableWasteProductionDate"
    );
    const data = result.recordset.map(decorate);
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getList UsableWasteProduction):", err);
    return sendError(res, err);
  }
};

// GET /usable-waste-production/list/:usableWasteBaleCode  -> single record (from GetAll)
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.usableWasteBaleCode);
    if (!code) return sendError(res, "Invalid UsableWasteBaleCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("FYCode", sql.Int, getFYCode(req))
      .execute("sp_UsableWasteStock_GetAll");

    const row = result.recordset.find(
      (r) => Number(r.UsableWasteBaleCode) === code
    );
    if (!row) return sendError(res, "Usable Waste Production record not found", 404);
    return sendSuccess(res, decorate(row));
  } catch (err) {
    console.error("DB Error (getById UsableWasteProduction):", err);
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

// Build and run sp_UsableWasteStock_AddEdit for one bale.
// (The proc upserts on CompanyCode + BaleNo — no bale-code parameter.)
const addEditBale = async (pool, req, { baleNo, body, net }) => {
  const request = pool.request();
  request.input("BaleNo", sql.Int, baleNo);
  request.input("UsableWasteProductionDate", sql.DateTime, new Date(body.UsableWasteProductionDate));
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
  request.input("UsableWasteItemCode", sql.Int, toInt(body.UsableWasteItemCode));
  request.input("User", sql.Int, toInt(req.headers.userId));
  request.input("Node", sql.Int, toInt(req.headers.nodeCode));
  await request.execute("sp_UsableWasteStock_AddEdit");
};

// Shared validation (mirrors frmUsableWasteProduction btnSave_Click).
const validateBale = (body, usableWasteItem) => {
  if (!body.UsableWasteProductionDate || Number.isNaN(new Date(body.UsableWasteProductionDate).getTime()))
    return "Invalid Ref. Date";
  if (toInt(body.SupervisorCode) <= 0) return "Select the Supervisor";
  if (toInt(body.EmployeeCode) <= 0) return "Select the Employee";
  if (toInt(body.UsableWasteItemCode) <= 0) return "Select the Waste Item";
  if (toNum(body.GrossWeight) <= 0) return "Gross Weight should not be zero";
  // Tare may be zero only when the usable waste item allows it.
  if (!usableWasteItem?.TareZeroAllowed && toNum(body.TareWeight) <= 0)
    return "Tare Weight should not be zero";
  const net = round3(toNum(body.GrossWeight) - toNum(body.TareWeight) - toNum(body.TrallyWeight));
  if (net > round3(body.GrossWeight))
    return "Net Weight should not be greater than Gross Weight";
  if (net <= 0) return "Net Weight should not be zero";
  return null;
};

// Fetch the selected usable waste item (for TareZeroAllowed).
const getUsableWasteItem = async (pool, usableWasteItemCode) => {
  const r = await pool
    .request()
    .input("UsableWasteItemCode", sql.Int, toInt(usableWasteItemCode))
    .query(
      "Select UsableWasteItemCode, BaleTareWeight, TareZeroAllowed from tbl_UsableWasteItem where UsableWasteItemCode = @UsableWasteItemCode"
    );
  const row = r.recordset?.[0];
  return row ? { ...row, TareZeroAllowed: toBit(row.TareZeroAllowed) } : null;
};

// POST /usable-waste-production/create  (loops over "No of Bags" bulk add)
export const createUsableWasteProduction = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    if (!req.headers.userId || !req.headers.nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const body = req.body || {};
    const pool = await getPool(req.headers.subdbname);
    const companyCode = getCompanyCode(req);
    const fyCode = getFYCode(req);

    const usableWasteItem = await getUsableWasteItem(pool, body.UsableWasteItemCode);
    const err = validateBale(body, usableWasteItem);
    if (err) return sendError(res, err, 400);

    const opening = toBit(body.Opening);
    // Opening-stock bales carry a user-entered bale no (single bag). Production
    // bales are auto-numbered, one per bag.
    const noOfBags = opening ? 1 : Math.max(1, toInt(body.NoOfBags) || 1);
    const net = round3(toNum(body.GrossWeight) - toNum(body.TareWeight) - toNum(body.TrallyWeight));

    const saved = [];
    for (let i = 0; i < noOfBags; i++) {
      const baleNo = opening
        ? toInt(body.BaleNo)
        : await nextBaleNo(pool, companyCode, fyCode);
      if (baleNo <= 0) return sendError(res, "Bag No should not be empty", 400);
      if (await baleNoExists(pool, companyCode, baleNo))
        return sendError(res, "Already Exist the BagNo", 409);
      await addEditBale(pool, req, { baleNo, body, net });
      saved.push(baleNo);
    }

    return sendSuccess(res, { baleNos: saved }, "The record is saved", 201);
  } catch (err) {
    if (err.message && err.message.includes("PK_UsableWasteStock_BagNo"))
      return sendError(res, "Already exist the BagNo", 409);
    console.error("DB Error (createUsableWasteProduction):", err);
    return sendError(res, err);
  }
};

// PUT /usable-waste-production/update/:usableWasteBaleCode
export const updateUsableWasteProduction = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    if (!req.headers.userId || !req.headers.nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const code = toInt(req.params.usableWasteBaleCode);
    if (!code) return sendError(res, "Invalid UsableWasteBaleCode", 400);

    const body = req.body || {};
    const pool = await getPool(req.headers.subdbname);

    const usableWasteItem = await getUsableWasteItem(pool, body.UsableWasteItemCode);
    const err = validateBale(body, usableWasteItem);
    if (err) return sendError(res, err, 400);

    const baleNo = toInt(body.BaleNo);
    if (baleNo <= 0) return sendError(res, "Bag No should not be empty", 400);
    const net = round3(toNum(body.GrossWeight) - toNum(body.TareWeight) - toNum(body.TrallyWeight));

    // The proc upserts on the existing BaleNo (matches the desktop edit path).
    await addEditBale(pool, req, { baleNo, body, net });
    return sendSuccess(res, { UsableWasteBaleCode: code }, "The record is updated", 200);
  } catch (err) {
    if (err.message && err.message.includes("PK_UsableWasteStock_BagNo"))
      return sendError(res, "Already exist the BagNo", 409);
    console.error("DB Error (updateUsableWasteProduction):", err);
    return sendError(res, err);
  }
};

// DELETE /usable-waste-production/delete/:usableWasteBaleCode
export const deleteUsableWasteProduction = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.usableWasteBaleCode);
    if (!code) return sendError(res, "Invalid UsableWasteBaleCode", 400);

    const pool = await getPool(req.headers.subdbname);

    await pool
      .request()
      .input("UsableWasteBaleCode", sql.Int, code)
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_UsableWasteStock_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("REFERENCE") || err.message.includes("FK_")))
      return sendError(res, "You can not delete the Usable Waste Production!", 409);
    console.error("DB Error (deleteUsableWasteProduction):", err);
    return sendError(res, err);
  }
};
