import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Route master (port of the WinForms frmRoute / frmRouteDetails)
//
//   A company-scoped master: RouteName + Status.
//   Stored procs (kept identical to the desktop):
//     sp_Route_AddEdit  -> insert/update (@User/@Node + @CompanyCode, edit adds @RouteCode)
//     sp_Route_GetAll   -> list (@CompanyCode)
//     sp_Route_Delete   -> delete (@RouteCode,@CompanyCode)
//
//   Company from req.headers.companyCode; user/node from the auth token.
//   Both create and edit pass @User/@Node (faithful to the desktop).
//
//   Endpoints
//     GET    /lists           sp_Route_GetAll for the company
//     GET    /list/:code      one route (from GetAll)
//     POST   /create          sp_Route_AddEdit (no @RouteCode)
//     PUT    /update/:code    sp_Route_AddEdit (with @RouteCode)
//     DELETE /delete/:code    sp_Route_Delete
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const STATUS_LABEL = (status) => (status ? "ACTIVE" : "INACTIVE");
const toStatusBit = (status) => {
  if (status === true || status === 1 || status === "1") return 1;
  if (typeof status === "string" && status.trim().toUpperCase() === "ACTIVE") return 1;
  return 0;
};
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const pick = (row, ...keys) => {
  if (!row) return undefined;
  for (const k of keys) {
    if (k == null) continue;
    if (row[k] !== undefined) return row[k];
    const lk = String(k).toLowerCase();
    const hit = Object.keys(row).find((o) => o.toLowerCase() === lk);
    if (hit) return row[hit];
  }
  return undefined;
};

// GET /route/lists  -> sp_Route_GetAll @CompanyCode
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_Route_GetAll");
    const data = (r.recordset || []).map((row) => {
      const code = toInt(pick(row, "RouteCode"));
      return {
        ...row,
        id: code,
        RouteCode: code,
        RouteName: pick(row, "RouteName") ?? "",
        Status: STATUS_LABEL(toStatusBit(pick(row, "Status"))),
      };
    });
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (Route.getList):", err);
    return sendError(res, err);
  }
};

// GET /route/list/:code  -> one record for the edit screen (from GetAll).
export const getById = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (code <= 0) return sendError(res, "Invalid RouteCode", 400);

    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_Route_GetAll");
    const row = (r.recordset || []).find((x) => toInt(pick(x, "RouteCode")) === code);
    if (!row) return sendError(res, "Route not found", 404);

    return sendSuccess(res, {
      RouteCode: code,
      RouteName: pick(row, "RouteName") ?? "",
      Status: toStatusBit(pick(row, "Status")),
    });
  } catch (err) {
    console.error("DB Error (Route.getById):", err);
    return sendError(res, err);
  }
};

// Shared add/edit handler -> EXEC sp_Route_AddEdit (btnSave_Click)
const saveOrUpdate = async (req, res, isEdit) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);

    const userId = req.headers.userId;
    const nodeCode = req.headers.nodeCode;
    if (!userId || !nodeCode)
      return sendError(res, "Missing user context (userId / nodeCode)", 400);

    const companyCode = getCompanyCode(req);
    if (companyCode <= 0)
      return sendError(res, "You are logged in to a group of companies; switch to a single company.", 400);

    const body = req.body || {};
    const routeName = (body.RouteName || "").trim();
    if (!routeName) return sendError(res, "Route Name should not be empty", 400);

    const code = isEdit ? toInt(req.params.code ?? body.RouteCode) : null;
    if (isEdit && !code) return sendError(res, "Invalid RouteCode for update", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();

    request.input("User", sql.Int, parseInt(userId));
    request.input("Node", sql.Int, parseInt(nodeCode));
    if (isEdit) request.input("RouteCode", sql.Int, code);
    request.input("RouteName", sql.NVarChar, routeName);
    request.input("Status", sql.Int, toStatusBit(body.Status));
    request.input("CompanyCode", sql.Int, companyCode);

    await request.execute("sp_Route_AddEdit");

    return sendSuccess(
      res,
      null,
      isEdit ? "The record is updated" : "The record is saved",
      isEdit ? 200 : 201
    );
  } catch (err) {
    if (err.message && err.message.includes("UK_")) {
      return sendError(res, "Already exist the Route Name", 409);
    }
    console.error("DB Error (saveOrUpdateRoute):", err);
    return sendError(res, err);
  }
};

// POST /route/create
export const create = (req, res) => saveOrUpdate(req, res, false);

// PUT  /route/update/:code
export const update = (req, res) => saveOrUpdate(req, res, true);

// DELETE /route/delete/:code  -> sp_Route_Delete (@RouteCode,@CompanyCode)
export const remove = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const code = toInt(req.params.code);
    if (code <= 0) return sendError(res, "Invalid RouteCode", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("RouteCode", sql.Int, code)
      .input("CompanyCode", sql.Int, getCompanyCode(req))
      .execute("sp_Route_Delete");

    return sendSuccess(res, null, "The record is deleted");
  } catch (err) {
    if (err.message && (err.message.includes("FK_") || err.message.includes("REFERENCE"))) {
      return sendError(res, "You can not delete the Route !", 409);
    }
    console.error("DB Error (deleteRoute):", err);
    return sendError(res, err);
  }
};
