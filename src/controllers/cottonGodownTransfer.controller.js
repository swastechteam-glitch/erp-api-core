import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Cotton Godown Transfer (port of frmCottonGodownTransfer)
//   Move an arrived cotton lot from one godown to another. Pick a Mill Lot (its
//   supplier / agent / station / variety / weights auto-fill as read-only Lot
//   Details, and Godown From is taken from its weighment), choose Transfer To +
//   remarks, then save. Mirrors btnSave_Click:
//     EXEC sp_CottonGodownTransfer_AddEdit
//     UPDATE tbl_CottonWeighment SET GodownCode = <to> WHERE ArrivalCode = <a>
//
//   - GET    /cotton-godown-transfer/options       -> mill lots + godowns
//   - GET    /cotton-godown-transfer/lists         -> sp_CottonGodownTransfer_GetAll (paginated)
//   - GET    /cotton-godown-transfer/list/:code    -> one transfer (for edit)
//   - POST   /cotton-godown-transfer/create        -> AddEdit (+ weighment update)
//   - PUT    /cotton-godown-transfer/update/:code  -> AddEdit (+ weighment update)
//   - DELETE /cotton-godown-transfer/delete/:code  -> sp_CottonGodownTransfer_Delete
//
// Company from req.headers.companyCode, user/node from req.headers.userId / nodeCode.
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const getCompanyCode = (req) => toInt(req.headers.companyCode);

// GET /cotton-godown-transfer/options -> mill lots (with lot details) + godowns.
export const getOptions = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const companyCode = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);

    const [millLots, godowns] = await Promise.all([
      pool
        .request()
        .input("CompanyCode", sql.Int, companyCode)
        .query(
          `SELECT a.ArrivalCode, a.MillLotNo, a.SupplierName, a.AgentName, a.StationName,
                  a.RawMaterialName, a.Qty, a.PartyGrossWeight, a.PartyTareWeight, a.PartyNetWeight,
                  (SELECT TOP 1 w.GodownCode FROM vw_CottonWeighment w
                     WHERE w.CompanyCode = a.CompanyCode AND w.ArrivalCode = a.ArrivalCode
                       AND w.GodownCode IS NOT NULL) AS GodownCodeFrom
             FROM vw_CottonArrival a
            WHERE a.CompanyCode = @CompanyCode AND a.ArrivalDate > '2016-11-01'
            ORDER BY a.MillLotNo DESC`,
        ),
      pool.request().query("Select GodownCode, GodownName from tbl_Godown Order by GodownName"),
    ]);

    return sendSuccess(res, {
      millLots: (millLots.recordset || []).map((r) => ({
        value: r.ArrivalCode,
        label: r.MillLotNo,
        ArrivalCode: r.ArrivalCode,
        MillLotNo: r.MillLotNo,
        SupplierName: r.SupplierName,
        AgentName: r.AgentName,
        StationName: r.StationName,
        RawMaterialName: r.RawMaterialName,
        Qty: r.Qty,
        PartyGrossWeight: r.PartyGrossWeight,
        PartyTareWeight: r.PartyTareWeight,
        PartyNetWeight: r.PartyNetWeight,
        GodownCodeFrom: r.GodownCodeFrom ?? 0,
      })),
      godowns: (godowns.recordset || []).map((r) => ({
        value: r.GodownCode,
        label: r.GodownName,
      })),
    });
  } catch (err) {
    console.error("DB Error (GodownTransfer getOptions):", err);
    return sendError(res, err);
  }
};

// GET /cotton-godown-transfer/lists -> all transfers (paginated).
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_CottonGodownTransfer_GetAll");
    const data = (result.recordset || [])
      .map((r) => ({ ...r, id: r.GodownTransferCode }))
      .sort((a, b) => Number(b.GodownTransferCode) - Number(a.GodownTransferCode));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (GodownTransfer getList):", err);
    return sendError(res, err);
  }
};

// GET /cotton-godown-transfer/list/:code -> one transfer for edit.
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = parseInt(req.params.code);
    if (!code) return sendError(res, "Invalid GodownTransferCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_CottonGodownTransfer_GetAll");
    const row = (result.recordset || []).find(
      (r) => parseInt(r.GodownTransferCode) === code,
    );
    if (!row) return sendError(res, "Godown Transfer not found", 404);
    return sendSuccess(res, row);
  } catch (err) {
    console.error("DB Error (GodownTransfer getById):", err);
    return sendError(res, err);
  }
};

// Shared create/update runner.
const save = async (req, res, code) => {
  let tx;
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const b = req.body || {};
    const arrivalCode = toInt(b.ArrivalCode);
    const godownFrom = toInt(b.GodownCodeFrom);
    const godownTo = toInt(b.GodownCodeTo);
    if (arrivalCode <= 0) return sendError(res, "Select the Mill Lot No", 400);
    if (godownFrom <= 0) return sendError(res, "Select the Godown From", 400);
    if (godownTo <= 0) return sendError(res, "Select the Godown Transfer To", 400);

    const companyCode = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);
    tx = new sql.Transaction(pool);
    await tx.begin();

    const head = new sql.Request(tx);
    if (code > 0) head.input("GodownTransferCode", sql.Int, code);
    head.input("TransferDate", sql.DateTime, b.TransferDate ? new Date(b.TransferDate) : new Date());
    head.input("ArrivalCode", sql.Int, arrivalCode);
    head.input("GodownCodeFrom", sql.Int, godownFrom);
    head.input("GodownCodeTo", sql.Int, godownTo);
    head.input("Remarks", sql.NVarChar, (b.Remarks || "").toString().trim());
    head.input("User", sql.Int, parseInt(userId));
    head.input("Node", sql.Int, parseInt(nodeCode));
    head.input("CompanyCode", sql.Int, companyCode);
    await head.execute("sp_CottonGodownTransfer_AddEdit");

    // Re-point the lot's weighment to the destination godown (matches WinForms).
    await new sql.Request(tx)
      .input("GodownToCode", sql.Int, godownTo)
      .input("CompanyCode", sql.Int, companyCode)
      .input("ArrivalCode", sql.Int, arrivalCode)
      .query(
        "UPDATE tbl_CottonWeighment SET GodownCode = @GodownToCode WHERE CompanyCode = @CompanyCode AND ArrivalCode = @ArrivalCode",
      );

    await tx.commit();
    return sendSuccess(
      res,
      { ArrivalCode: arrivalCode },
      code > 0 ? "The record is updated" : "The record is saved",
      code > 0 ? 200 : 201,
    );
  } catch (err) {
    if (tx) {
      try {
        await tx.rollback();
      } catch (_) {}
    }
    console.error("DB Error (GodownTransfer save):", err);
    return sendError(res, err);
  }
};

// POST /cotton-godown-transfer/create
export const create = (req, res) => save(req, res, 0);
// PUT /cotton-godown-transfer/update/:code
export const update = (req, res) => save(req, res, parseInt(req.params.code) || 0);

// DELETE /cotton-godown-transfer/delete/:code
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = parseInt(req.params.code);
    if (!code) return sendError(res, "Invalid GodownTransferCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("GodownTransferCode", sql.Int, code)
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_CottonGodownTransfer_Delete");
    return sendSuccess(res, { GodownTransferCode: code }, "The record is deleted", 200);
  } catch (err) {
    console.error("DB Error (GodownTransfer remove):", err);
    return sendError(res, err);
  }
};
