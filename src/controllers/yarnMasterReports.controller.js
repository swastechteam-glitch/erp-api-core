import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError } from "../utils/response.js";

// ---------------------------------------------------------------------------
// Yarn Master Reports — port of WinForms rptCountName ("Yarn Master Reports").
// One screen that renders SEVEN master lists, chosen by report type, each from
// its own sp_*_GetAll, with an optional Status filter (ALL / ACTIVE / INACTIVE).
// Mirrors the VB btndbReportView_Click switch on DynamicReportType, where each
// case runs its proc and only adds @Status for ACTIVE(1) / INACTIVE(0).
//
//   Types  : GET /yarn-master-reports/types
//   Report : GET /yarn-master-reports/report?type=&status=
//
// The REPORTS whitelist is the security boundary — only these mapped procs can
// be executed (the `type` query is never used to build a proc name directly).
// ---------------------------------------------------------------------------

const REPORTS = {
  countName:    { proc: "sp_CountName_GetAll",    title: "Count Name Details" },
  countType:    { proc: "sp_CountType_GetAll",    title: "Count Type Details" },
  lotNo:        { proc: "sp_LotNo_GetAll",        title: "LotNo Details" },
  otherCharges: { proc: "sp_OtherCharges_GetAll", title: "Other Charges Details" },
  salesType:    { proc: "sp_SalesType_GetAll",    title: "SalesType Details" },
  taxType:      { proc: "sp_TaxType_GetAll",      title: "TaxType Details" },
  tipColour:    { proc: "sp_TipColour_GetAll",    title: "Tip Colour Details" },
};

// GET /yarn-master-reports/types — the selectable report types (the radio list).
export const getTypes = (req, res) =>
  sendSuccess(res, Object.entries(REPORTS).map(([key, v]) => ({ key, value: key, label: v.title, title: v.title })));

// GET /yarn-master-reports/report?type=&status= — run one master report.
export const getReport = async (req, res) => {
  try {
    if (!req.headers.subdbname) return sendError(res, "Missing subDBName", 400);
    const type = String(req.query.type || "");
    const def = REPORTS[type];
    if (!def) return sendError(res, "Select the Report", 400);

    const status = String(req.query.status || "all").toLowerCase();
    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();
    // Only filter for ACTIVE / INACTIVE — ALL omits @Status (VB behaviour).
    if (status === "active") request.input("Status", sql.Bit, 1);
    else if (status === "inactive") request.input("Status", sql.Bit, 0);

    const rs = await request.execute(def.proc);
    return sendSuccess(res, { type, title: def.title, rows: rs.recordset || [] });
  } catch (err) {
    console.error("DB Error (YarnMasterReports.getReport):", err);
    return sendError(res, err);
  }
};
