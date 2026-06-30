import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// New Joiner Pass  (port of the WinForms rptNewJoinerPass).
//
//   From/To date range -> list new joiners (sp_Employee_NewJoining), each with a
//   "View" that renders a printable joiner pass. The desktop drives an RDLC; on
//   the web the React side renders the pass from this data + the company header.
//
//   Company-scoped.
//
//   Endpoints
//     GET  /list?fromDate=&toDate=     sp_Employee_NewJoining
//     GET  /company                     sp_Company_GetAll (pass header)
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const getCompanyCode = (req) => toInt(req.headers.companyCode);
const pad = (n) => String(n).padStart(2, "0");
const ymd = (v) => {
  if (!v) return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  const m = String(v).match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : String(v).slice(0, 10);
};
const ddmmyyyy = (v) => {
  const d = ymd(v);
  return d ? d.split("-").reverse().join("/") : "";
};
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

// GET /new-joiner-pass/list?fromDate=&toDate=
export const getList = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const fromDate = ymd(req.query.fromDate);
    const toDate = ymd(req.query.toDate);
    if (!fromDate || !toDate) return sendSuccess(res, []);

    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("FromDate", sql.VarChar(10), fromDate)
      .input("ToDate", sql.VarChar(10), toDate)
      .input("CompanyCode", sql.Int, cc)
      .execute("sp_Employee_NewJoining");

    const data = (r.recordset || []).map((row, i) => ({
      id: i + 1,
      EmployeeCode: toInt(pick(row, "EmployeeCode")),
      EmployeeID: (pick(row, "EmployeeID", "str_EmployeeID") ?? "").toString(),
      EmployeeName: pick(row, "EmployeeName") ?? "",
      DepartmentName: pick(row, "DepartmentName_English", "DepartmentName") ?? "",
      DesignationName: pick(row, "DesignationName") ?? "",
      DateOfJoining: ddmmyyyy(pick(row, "DateOfJoining")),
      DateOfJoiningISO: ymd(pick(row, "DateOfJoining")),
      AgentName: pick(row, "AgentName") ?? "",
      HostelTypeName: pick(row, "HostelTypeName") ?? "",
      EmpGroupName: pick(row, "EmpGroupName") ?? "",
      DesignationCode: toInt(pick(row, "DesignationCode")),
      FatherName: pick(row, "FatherName") ?? "",
      PhoneNo: (pick(row, "PhoneNo") ?? "").toString(),
    }));

    // DateOfJoining DESC, EmployeeID DESC (faithful to the desktop DefaultView.Sort)
    data.sort((a, b) => {
      if (a.DateOfJoiningISO !== b.DateOfJoiningISO) return a.DateOfJoiningISO < b.DateOfJoiningISO ? 1 : -1;
      return toInt(b.EmployeeID) - toInt(a.EmployeeID);
    });
    data.forEach((x, i) => (x.id = i + 1));

    return sendSuccess(res, data);
  } catch (err) {
    console.error("DB Error (NewJoinerPass.getList):", err);
    return sendError(res, err);
  }
};

// GET /new-joiner-pass/photo/:employeeCode  -> tbl_Employee_Photo (base64)
export const getPhoto = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const employeeCode = toInt(req.params.employeeCode);
    if (employeeCode <= 0) return sendSuccess(res, { photo: "" });
    const pool = await getPool(req.headers.subdbname);
    const r = await pool
      .request()
      .input("CompanyCode", sql.Int, cc)
      .input("EmployeeCode", sql.Int, employeeCode)
      .query("select Photo from tbl_Employee_Photo where CompanyCode = @CompanyCode AND EmployeeCode = @EmployeeCode");
    const buf = pick((r.recordset || [])[0], "Photo");
    const photo = buf && Buffer.isBuffer(buf) ? `data:image/jpeg;base64,${buf.toString("base64")}` : "";
    return sendSuccess(res, { photo });
  } catch (err) {
    console.error("DB Error (NewJoinerPass.getPhoto):", err);
    return sendSuccess(res, { photo: "" }); // photo is best-effort, never block the pass
  }
};

// GET /new-joiner-pass/company  -> sp_Company_GetAll (pass header)
export const getCompany = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const cc = getCompanyCode(req);
    const pool = await getPool(req.headers.subdbname);
    const r = await pool.request().input("CompanyCode", sql.Int, cc).execute("sp_Company_GetAll");
    const c = (r.recordset || [])[0] || {};
    return sendSuccess(res, {
      CompanyName: pick(c, "CompanyName") ?? "",
      Address1: pick(c, "Address1", "Address") ?? "",
      Address2: pick(c, "Address2") ?? "",
      City: pick(c, "City") ?? "",
      PhoneNo: (pick(c, "PhoneNo", "Phone") ?? "").toString(),
    });
  } catch (err) {
    console.error("DB Error (NewJoinerPass.getCompany):", err);
    return sendError(res, err);
  }
};
