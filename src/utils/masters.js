import sql from "mssql";

// ---------------------------------------------------------------------------
// Shared master-data lookups (dropdown / combo sources).
//
// Every transaction screen (Purchase Order, Cotton Purchase Order, ...) needs
// the same master lists — supplier, agent, state, tax, etc. Instead of each
// "...Options" endpoint re-writing the SQL, it calls the function it needs
// here. One supplier query lives in ONE place (getSuppliers) and is reused.
//
// Each function takes a `pool` (from getPool) and returns an array already
// shaped as { value, label, ... } so the controller just spreads the result.
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = parseInt(v);
  return Number.isNaN(n) ? 0 : n;
};
const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};

// Supplier master.
//   usage "stores" (default) -> stores suppliers, with StateCode + GSTNo
//                               (needed for the GST split on Purchase Order).
//   usage "cotton"           -> cotton suppliers, with GSTNo + MainMobileNo.
//   usage "all"              -> every active supplier, value/label only.
export const getSuppliers = async (pool, { usage = "stores" } = {}) => {
  // The flag column that gates the list:
  //   "cotton" -> Cotton=1, "stores" -> Stores=1, "all" -> no flag (every supplier).
  const flagWhere =
    usage === "all"
      ? ""
      : usage === "cotton"
        ? "AND Cotton = 1"
        : "AND Stores = 1";

  const r = await pool
    .request()
    .query(
      `Select * from tbl_Supplier where Status = 1 AND SupplierID IS NOT NULL ${flagWhere} Order by SupplierName`,
    );

  return r.recordset.map((s) => ({
    // "all" -> every supplier column; otherwise just the dropdown fields.
    ...(usage === "all" ? s : {}),
    value: s.SupplierCode,
    label: s.SupplierName,
    // // Address columns feed the multi-column supplier dropdown (Supplier Name +
    // // Address1 + Address2) used on the Purchase Order / Cotton PO screens.
    // Address1: s.Address1 ?? "",
    // Address2: s.Address2 ?? "",
    GSTNo: s.GSTNo ?? "",
    MainMobileNo: s.MainMobileNo ?? "",
    StateCode: toInt(s.StateCode),
  }));
};

// Agent / broker master. usage "cotton" -> only cotton agents.
export const getAgents = async (pool, { usage = "all" } = {}) => {
  const where =
    usage === "cotton" ? "where Status = 1 AND Cotton=1" : "where Status = 1";
  const r = await pool
    .request()
    .query(
      `Select AgentCode, AgentName from tbl_Agent ${where} Order by AgentName`,
    );
  return r.recordset.map((a) => ({ value: a.AgentCode, label: a.AgentName }));
};

// State master.
export const getStates = async (pool) => {
  const r = await pool
    .request()
    .query("Select StateCode, StateName from tbl_State Order by StateName");
  return r.recordset.map((s) => ({ value: s.StateCode, label: s.StateName }));
};

// Station master (all active stations, not filtered by state).
export const getStations = async (pool) => {
  const r = await pool
    .request()
    .query(
      "Select StationCode, StationName from tbl_Station WHERE Status = 1 Order by StationName",
    );
  return r.recordset.map((s) => ({
    value: s.StationCode,
    label: s.StationName,
  }));
};

// Raw material / cotton variety master.
export const getRawMaterials = async (pool) => {
  const r = await pool
    .request()
    .query(
      "Select RawMaterialCode, RawMaterialName from tbl_RawMaterial Where Status=1 Order by RawMaterialName",
    );
  return r.recordset.map((m) => ({
    value: m.RawMaterialCode,
    label: m.RawMaterialName,
  }));
};

// Packing type master.
export const getPackingTypes = async (pool) => {
  const r = await pool
    .request()
    .query(
      "Select PackingTypeCode, PackingType from tbl_PackingType Order by PackingType",
    );
  return r.recordset.map((p) => ({
    value: p.PackingTypeCode,
    label: p.PackingType,
  }));
};

// Quality STD master. usage "cotton" -> only cotton STDs.
export const getQualitySTDs = async (pool, { usage = "all" } = {}) => {
  const where =
    usage === "cotton"
      ? "WHERE ISNULL(Cotton,0) = 1 AND Status = 1"
      : "WHERE Status = 1";
  const r = await pool
    .request()
    .query(
      `Select CQTSTDCode, CQTSTDName from tbl_CQTSTD ${where} Order by CQTSTDName`,
    );
  return r.recordset.map((q) => ({
    value: q.CQTSTDCode,
    label: q.CQTSTDName,
  }));
};

// Purchase mode master.
export const getPurchaseModes = async (pool) => {
  const r = await pool
    .request()
    .query(
      "SELECT PurchaseModeCode, PurchaseMode from tbl_PurchaseMode Order by PurchaseMode",
    );
  return r.recordset.map((m) => ({
    value: m.PurchaseModeCode,
    label: m.PurchaseMode,
  }));
};

// Purchase type master.
export const getPurchaseTypes = async (pool) => {
  const r = await pool
    .request()
    .query(
      "SELECT PurchaseTypeCode, PurchaseType from tbl_PurchaseType Order by PurchaseType",
    );
  return r.recordset.map((t) => ({
    value: t.PurchaseTypeCode,
    label: t.PurchaseType,
  }));
};

// Mode-of-despatch master (sp_ModeOfDespatch_GetAll).
export const getModesOfDespatch = async (pool) => {
  const r = await pool.request().execute("sp_ModeOfDespatch_GetAll");
  return r.recordset.map((d) => ({
    value: d.ModeOfDespatchCode,
    label: d.ModeOfDespatchName,
  }));
};

// Transporter master (sp_Transporter_GetAll).
export const getTransporters = async (pool) => {
  const r = await pool.request().execute("sp_Transporter_GetAll");
  return r.recordset.map((t) => ({
    value: t.TransporterCode,
    label: t.TransporterName,
  }));
};

// Currency master.
export const getCurrencies = async (pool) => {
  const r = await pool
    .request()
    .query("Select CurrencyCode, CurrencyName, ShortName from tbl_Currency");
  return r.recordset.map((c) => ({
    value: c.CurrencyCode,
    label: c.ShortName ?? c.CurrencyName,
  }));
};

// Tax master (active taxes only).
export const getTaxes = async (pool) => {
  const r = await pool
    .request()
    .query(
      "Select TaxCode, TaxName, Tax from tbl_Tax where Status = 1 ORDER BY TaxName",
    );
  return r.recordset.map((t) => ({
    value: t.TaxCode,
    label: t.TaxName,
    tax: toNum(t.Tax),
  }));
};

// Cotton packing material master.
export const getCottonPackingMaterials = async (pool) => {
  const r = await pool
    .request()
    .query(
      "Select CottonPackingMaterialCode, CottonPackingMaterialName from tbl_CottonPackingMaterial where Status = 1 Order by CottonPackingMaterialName",
    );
  return r.recordset.map((m) => ({
    value: m.CottonPackingMaterialCode,
    label: m.CottonPackingMaterialName,
  }));
};

// Cotton arrival / receipt type master.
//   NOTE: the transaction saves this by NAME (WinForms sent the name), so the
//   option value is the name, not the code.
export const getCottonArrivalTypes = async (pool) => {
  const r = await pool
    .request()
    .query(
      "Select CottonArrivalTypeCode, CottonArrivalTypeName from tbl_CottonArrivalType Where Status = 1",
    );
  return r.recordset.map((t) => ({
    value: t.CottonArrivalTypeName,
    label: t.CottonArrivalTypeName,
  }));
};

// Fixed combo lists (WinForms combo indexes, not DB-backed). Shared by the
// cotton screens so the index->label mapping lives in one place.
export const PAYMENT_TYPES = [
  { value: 0, label: "SPOT" },
  { value: 1, label: "FMD" },
];
export const PAYMENT_MODES = [
  { value: 0, label: "IMMEDIATE" },
  { value: 1, label: "CREDIT" },
  { value: 2, label: "ADVANCE PAYMENT" },
];

// Bank master.
export const getBanks = async (pool) => {
  const r = await pool
    .request()
    .query("Select BankCode, BankName from tbl_Bank Order by BankName");
  return r.recordset.map((b) => ({ value: b.BankCode, label: b.BankName }));
};

// Company group master.
export const getCompanyGroups = async (pool) => {
  const r = await pool
    .request()
    .query(
      "Select CompanyGroupCode, CompanyGroupName from tbl_CompanyGroup Order by CompanyGroupName",
    );
  return r.recordset.map((g) => ({
    value: g.CompanyGroupCode,
    label: g.CompanyGroupName,
  }));
};

// Customer type master.
export const getCustomerTypes = async (pool) => {
  const r = await pool
    .request()
    .query(
      "Select CustomerTypeCode, CustomerType from tbl_CustomerType Order by CustomerType",
    );
  return r.recordset.map((t) => ({
    value: t.CustomerTypeCode,
    label: t.CustomerType,
  }));
};

// Approval status master.
export const getApprovals = async (pool) => {
  const r = await pool
    .request()
    .query("Select ApprovalCode, ApprovalName from tbl_Approval");
  return r.recordset.map((a) => ({
    value: a.ApprovalCode,
    label: a.ApprovalName,
  }));
};

// Company's own StateCode (for the GST inter/intra-state split).
export const getCompanyStateCode = async (pool, companyCode) => {
  const r = await pool
    .request()
    .input("CompanyCode", sql.Int, toInt(companyCode))
    .query(
      "Select StateCode from tbl_Company Where CompanyCode = @CompanyCode",
    );
  return toInt(r.recordset?.[0]?.StateCode);
};

// Stations for a state (dependent dropdown).
export const getStationsByState = async (pool, stateCode) => {
  const r = await pool
    .request()
    .input("StateCode", sql.Int, toInt(stateCode))
    .query(
      "Select StationCode, StationName from tbl_Station Where StateCode = @StateCode Order By StationName",
    );
  return r.recordset.map((s) => ({
    value: s.StationCode,
    label: s.StationName,
  }));
};
