import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ============================================================================
// Usable Waste Issue  (port of WinForms frmUsableWasteItemIssue) — ⚠️ SCAFFOLD
// ----------------------------------------------------------------------------
// Built from the SCREENSHOT ONLY (no .vb source was supplied). Every table,
// column and the whole issue mechanism below is a BEST GUESS following the
// existing naming pattern (tbl_UsableWasteStock / sp_UsableWasteStock_*).
// VERIFY against the real DB and adjust the names before trusting writes.
//
// ASSUMED schema --------------------------------------------------------------
//   tbl_UsableWasteItemIssue            (document header)
//     UsableWasteItemIssueCode  PK identity
//     IssueNo, IssueDate, CottonIssueCode, SupervisorCode, EmployeeCode,
//     TotalBales, CompanyCode, FYCode, CreatedBy, CreatedNode
//   tbl_UsableWasteItemIssue_Details    (one row per issued bale)
//     UsableWasteItemIssueDetailCode PK identity
//     UsableWasteItemIssueCode FK, UsableWasteBaleCode, BaleNo,
//     GrossWeight, TareWeight, NetWeight, UsableWasteItemCode
//   Available bales = rows in tbl_UsableWasteStock NOT already present in any
//   tbl_UsableWasteItemIssue_Details row (i.e. not yet issued).
//   Cotton Issue No dropdown = ASSUMED tbl_CottonIssue (CottonIssueCode, CottonIssueNo).
//
// Routes (gateway /api/v1) ----------------------------------------------------
//   GET    /usable-waste-issue/options          -> supervisors/employees/usableWasteItems/cottonIssues
//   GET    /usable-waste-issue/next-issue-no     -> { issueNo }
//   GET    /usable-waste-issue/available-bales   -> ?usableWasteItemCode&from&to  (stock not yet issued)
//   GET    /usable-waste-issue/lists             -> ?fromDate&toDate&cottonIssueCode&reportType (paginated)
//   GET    /usable-waste-issue/list/:code        -> header + detail bales
//   POST   /usable-waste-issue/create            -> header + selected bales
//   PUT    /usable-waste-issue/update/:code
//   DELETE /usable-waste-issue/delete/:code
//
// Company from req.headers.companyCode, FY from req.headers.FYCode, user context
// from req.headers.userId / nodeCode.
// ============================================================================

const HEADER = "tbl_UsableWasteItemIssue";
const DETAIL = "tbl_UsableWasteItemIssue_Details";

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};
const round3 = (n) => Math.round((toNum(n) + Number.EPSILON) * 1000) / 1000;
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const getFYCode = (req) => toInt(req.headers.FYCode);
const todayStr = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// GET /usable-waste-issue/options
// ---------------------------------------------------------------------------
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
          "Select UsableWasteItemCode, UsableWasteItemName from tbl_UsableWasteItem order by OrderNo"
        ),
    ]);

    // Cotton Issue No dropdown — ASSUMED source table. Isolated so a wrong name
    // doesn't break the whole options call (returns [] instead).
    let cottonIssues = [];
    try {
      const ci = await pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .input("FYCode", sql.Int, getFYCode(req))
        .query(
          "Select CottonIssueCode, CottonIssueNo from tbl_CottonIssue " +
            "where CompanyCode = @CompanyCode AND FYCode = @FYCode order by CottonIssueNo desc"
        );
      cottonIssues = ci.recordset.map((r) => ({
        value: r.CottonIssueCode,
        label: r.CottonIssueNo,
      }));
    } catch (e) {
      console.warn("UsableWasteIssue options: cottonIssues lookup failed (assumed table)", e.message);
    }

    const empOpts = employees.recordset.map((r) => ({
      value: r.EmployeeCode,
      label: r.EmployeeName,
    }));

    return sendSuccess(res, {
      supervisors: empOpts,
      employees: empOpts,
      usableWasteItems: usableWasteItems.recordset.map((r) => ({
        value: r.UsableWasteItemCode,
        label: r.UsableWasteItemName,
      })),
      cottonIssues,
    });
  } catch (err) {
    console.error("DB Error (getOptions UsableWasteIssue):", err);
    return sendError(res, err);
  }
};

// ---------------------------------------------------------------------------
// GET /usable-waste-issue/next-issue-no
// ---------------------------------------------------------------------------
export const getNextIssueNo = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("FYCode", sql.Int, getFYCode(req))
      .query(
        `Select ISNULL(MAX(IssueNo), 0) + 1 AS IssueNo from ${HEADER} ` +
          "where CompanyCode = @CompanyCode AND FYCode = @FYCode"
      );
    return sendSuccess(res, { issueNo: toInt(r.recordset?.[0]?.IssueNo) || 1 });
  } catch (err) {
    console.error("DB Error (getNextIssueNo UsableWasteIssue):", err);
    return sendError(res, err);
  }
};

// ---------------------------------------------------------------------------
// GET /usable-waste-issue/available-bales?usableWasteItemCode=&from=&to=
//   Usable-waste-stock bales that have not yet been issued.
// ---------------------------------------------------------------------------
export const getAvailableBales = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);

    const usableWasteItemCode = toInt(req.query.usableWasteItemCode);
    const from = toInt(req.query.from);
    const to = toInt(req.query.to);

    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("FYCode", sql.Int, getFYCode(req))
      .input("UsableWasteItemCode", sql.Int, usableWasteItemCode)
      .input("FromBale", sql.Int, from)
      .input("ToBale", sql.Int, to)
      .query(
        `Select s.UsableWasteBaleCode, s.BaleNo, s.GrossWeight, s.TareWeight,
                s.NetWeight, s.UsableWasteItemCode, i.UsableWasteItemName
           from tbl_UsableWasteStock s
           left join tbl_UsableWasteItem i on i.UsableWasteItemCode = s.UsableWasteItemCode
          where s.CompanyCode = @CompanyCode AND s.FYCode = @FYCode
            and (@UsableWasteItemCode = 0 OR s.UsableWasteItemCode = @UsableWasteItemCode)
            and (@FromBale = 0 OR s.BaleNo >= @FromBale)
            and (@ToBale = 0 OR s.BaleNo <= @ToBale)
            and NOT EXISTS (Select 1 from ${DETAIL} d where d.UsableWasteBaleCode = s.UsableWasteBaleCode)
          order by s.BaleNo`
      );

    return sendSuccess(
      res,
      result.recordset.map((r) => ({ ...r, id: r.UsableWasteBaleCode }))
    );
  } catch (err) {
    console.error("DB Error (getAvailableBales UsableWasteIssue):", err);
    return sendError(res, err);
  }
};

// ---------------------------------------------------------------------------
// GET /usable-waste-issue/lists  (saved issues — filtered + paginated)
// ---------------------------------------------------------------------------
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);

    const fromDate = req.query.fromDate || todayStr();
    const toDate = req.query.toDate || todayStr();
    const cottonIssueCode = toInt(req.query.cottonIssueCode);

    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .input("FYCode", sql.Int, getFYCode(req))
      .input("FromDate", sql.DateTime, new Date(fromDate))
      .input("ToDate", sql.DateTime, new Date(toDate))
      .input("CottonIssueCode", sql.Int, cottonIssueCode)
      .query(
        `Select h.UsableWasteItemIssueCode, h.IssueNo, h.IssueDate, h.CottonIssueCode,
                h.SupervisorCode, h.EmployeeCode, h.TotalBales,
                sup.EmployeeName AS SupervisorName, emp.EmployeeName AS EmployeeName,
                ci.CottonIssueNo
           from ${HEADER} h
           left join vw_Employee sup on sup.EmployeeCode = h.SupervisorCode
           left join vw_Employee emp on emp.EmployeeCode = h.EmployeeCode
           left join tbl_CottonIssue ci on ci.CottonIssueCode = h.CottonIssueCode
          where h.CompanyCode = @CompanyCode AND h.FYCode = @FYCode
            and h.IssueDate >= @FromDate AND h.IssueDate <= @ToDate
            and (@CottonIssueCode = 0 OR h.CottonIssueCode = @CottonIssueCode)
          order by h.IssueNo desc`
      );

    const data = result.recordset.map((r) => ({ ...r, id: r.UsableWasteItemIssueCode }));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getList UsableWasteIssue):", err);
    return sendError(res, err);
  }
};

// ---------------------------------------------------------------------------
// GET /usable-waste-issue/list/:code  (header + detail bales)
// ---------------------------------------------------------------------------
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (!code) return sendError(res, "Invalid UsableWasteItemIssueCode", 400);

    const pool = await getPool(req.headers.subdbname);

    const head = await pool
      .request()
      .input("Code", sql.Int, code)
      .query(`Select * from ${HEADER} where UsableWasteItemIssueCode = @Code`);
    const header = head.recordset?.[0];
    if (!header) return sendError(res, "Usable Waste Issue not found", 404);

    const det = await pool
      .request()
      .input("Code", sql.Int, code)
      .query(
        `Select d.UsableWasteItemIssueDetailCode, d.UsableWasteBaleCode, d.BaleNo,
                d.GrossWeight, d.TareWeight, d.NetWeight, d.UsableWasteItemCode,
                i.UsableWasteItemName
           from ${DETAIL} d
           left join tbl_UsableWasteItem i on i.UsableWasteItemCode = d.UsableWasteItemCode
          where d.UsableWasteItemIssueCode = @Code
          order by d.BaleNo`
      );

    return sendSuccess(res, { ...header, details: det.recordset });
  } catch (err) {
    console.error("DB Error (getById UsableWasteIssue):", err);
    return sendError(res, err);
  }
};

// Validate the document payload (mirrors the WinForms btnSave guards we can see).
const validateIssue = (body) => {
  if (!body.IssueDate || Number.isNaN(new Date(body.IssueDate).getTime()))
    return "Invalid Issue Date";
  if (toInt(body.SupervisorCode) <= 0) return "Select the Supervisor";
  if (toInt(body.EmployeeCode) <= 0) return "Select the Employee";
  const bales = Array.isArray(body.bales) ? body.bales : [];
  if (bales.length === 0) return "Add at least one bale to issue";
  return null;
};

// Insert all detail bales for a header (inside the open transaction).
const insertDetails = async (tx, issueCode, bales) => {
  for (const b of bales) {
    await new sql.Request(tx)
      .input("IssueCode", sql.Int, issueCode)
      .input("UsableWasteBaleCode", sql.Int, toInt(b.UsableWasteBaleCode))
      .input("BaleNo", sql.Int, toInt(b.BaleNo))
      .input("GrossWeight", sql.Decimal(18, 3), round3(b.GrossWeight))
      .input("TareWeight", sql.Decimal(18, 3), round3(b.TareWeight))
      .input("NetWeight", sql.Decimal(18, 3), round3(b.NetWeight))
      .input("UsableWasteItemCode", sql.Int, toInt(b.UsableWasteItemCode))
      .query(
        `Insert into ${DETAIL}
           (UsableWasteItemIssueCode, UsableWasteBaleCode, BaleNo, GrossWeight,
            TareWeight, NetWeight, UsableWasteItemCode)
         values
           (@IssueCode, @UsableWasteBaleCode, @BaleNo, @GrossWeight,
            @TareWeight, @NetWeight, @UsableWasteItemCode)`
      );
  }
};

// ---------------------------------------------------------------------------
// POST /usable-waste-issue/create
// ---------------------------------------------------------------------------
export const createUsableWasteIssue = async (req, res) => {
  const body = req.body || {};
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    if (!req.headers.userId || !req.headers.nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const err = validateIssue(body);
    if (err) return sendError(res, err, 400);

    const pool = await getPool(req.headers.subdbname);
    const companyCode = getCompanyCode(req);
    const fyCode = getFYCode(req);
    const bales = body.bales;

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      // Issue No computed inside the tx to avoid races.
      const noRes = await new sql.Request(tx)
        .input("CompanyCode", sql.Int, companyCode)
        .input("FYCode", sql.Int, fyCode)
        .query(
          `Select ISNULL(MAX(IssueNo), 0) + 1 AS IssueNo from ${HEADER} ` +
            "where CompanyCode = @CompanyCode AND FYCode = @FYCode"
        );
      const issueNo = toInt(noRes.recordset?.[0]?.IssueNo) || 1;

      const insHead = await new sql.Request(tx)
        .input("IssueNo", sql.Int, issueNo)
        .input("IssueDate", sql.DateTime, new Date(body.IssueDate))
        .input("CottonIssueCode", sql.Int, toInt(body.CottonIssueCode))
        .input("SupervisorCode", sql.Int, toInt(body.SupervisorCode))
        .input("EmployeeCode", sql.Int, toInt(body.EmployeeCode))
        .input("TotalBales", sql.Int, bales.length)
        .input("CompanyCode", sql.Int, companyCode)
        .input("FYCode", sql.Int, fyCode)
        .input("CreatedBy", sql.Int, toInt(req.headers.userId))
        .input("CreatedNode", sql.Int, toInt(req.headers.nodeCode))
        .query(
          `Insert into ${HEADER}
             (IssueNo, IssueDate, CottonIssueCode, SupervisorCode, EmployeeCode,
              TotalBales, CompanyCode, FYCode, CreatedBy, CreatedNode)
           OUTPUT INSERTED.UsableWasteItemIssueCode AS Code
           values
             (@IssueNo, @IssueDate, @CottonIssueCode, @SupervisorCode, @EmployeeCode,
              @TotalBales, @CompanyCode, @FYCode, @CreatedBy, @CreatedNode)`
        );
      const issueCode = toInt(insHead.recordset?.[0]?.Code);

      await insertDetails(tx, issueCode, bales);
      await tx.commit();
      return sendSuccess(res, { UsableWasteItemIssueCode: issueCode, IssueNo: issueNo }, "The record is saved", 201);
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  } catch (err) {
    console.error("DB Error (createUsableWasteIssue):", err);
    return sendError(res, err);
  }
};

// ---------------------------------------------------------------------------
// PUT /usable-waste-issue/update/:code  (replace header + details)
// ---------------------------------------------------------------------------
export const updateUsableWasteIssue = async (req, res) => {
  const body = req.body || {};
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (!code) return sendError(res, "Invalid UsableWasteItemIssueCode", 400);

    const err = validateIssue(body);
    if (err) return sendError(res, err, 400);

    const pool = await getPool(req.headers.subdbname);
    const bales = body.bales;

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      await new sql.Request(tx)
        .input("Code", sql.Int, code)
        .input("IssueDate", sql.DateTime, new Date(body.IssueDate))
        .input("CottonIssueCode", sql.Int, toInt(body.CottonIssueCode))
        .input("SupervisorCode", sql.Int, toInt(body.SupervisorCode))
        .input("EmployeeCode", sql.Int, toInt(body.EmployeeCode))
        .input("TotalBales", sql.Int, bales.length)
        .query(
          `Update ${HEADER} set IssueDate = @IssueDate, CottonIssueCode = @CottonIssueCode,
                  SupervisorCode = @SupervisorCode, EmployeeCode = @EmployeeCode,
                  TotalBales = @TotalBales
            where UsableWasteItemIssueCode = @Code`
        );
      await new sql.Request(tx)
        .input("Code", sql.Int, code)
        .query(`Delete from ${DETAIL} where UsableWasteItemIssueCode = @Code`);
      await insertDetails(tx, code, bales);
      await tx.commit();
      return sendSuccess(res, { UsableWasteItemIssueCode: code }, "The record is updated", 200);
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  } catch (err) {
    console.error("DB Error (updateUsableWasteIssue):", err);
    return sendError(res, err);
  }
};

// ---------------------------------------------------------------------------
// DELETE /usable-waste-issue/delete/:code
// ---------------------------------------------------------------------------
export const deleteUsableWasteIssue = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (!code) return sendError(res, "Invalid UsableWasteItemIssueCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      await new sql.Request(tx)
        .input("Code", sql.Int, code)
        .query(`Delete from ${DETAIL} where UsableWasteItemIssueCode = @Code`);
      await new sql.Request(tx)
        .input("Code", sql.Int, code)
        .query(`Delete from ${HEADER} where UsableWasteItemIssueCode = @Code`);
      await tx.commit();
      return sendSuccess(res, null, "The record is deleted");
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  } catch (err) {
    if (err.message && (err.message.includes("REFERENCE") || err.message.includes("FK_")))
      return sendError(res, "You can not delete the Usable Waste Issue!", 409);
    console.error("DB Error (deleteUsableWasteIssue):", err);
    return sendError(res, err);
  }
};
