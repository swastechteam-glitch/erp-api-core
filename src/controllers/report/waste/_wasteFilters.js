// Shared in-memory filtering for the Waste Production report family.
//
// The WinForms frmWasteProductionDateWise screen runs the report SPs with only
// CompanyCode + FromDate + ToDate, then filters the returned rows in memory by
// the chosen Supervisor / Employee / Item Name multi-selects
// (DataResult.Select("SupervisorCode IN (...)") etc.). We mirror that exactly:
// the React screen sends the selected codes as comma-separated query params and
// each report controller narrows its recordset here before building the PDF.
//
//   ?SupervisorCodes=1,4,7&EmployeeCodes=12,15&WasteItemCodes=3
//
// A filter is applied only when (a) the query supplies codes AND (b) the row
// actually carries that column — so the Bale-No Abstract report (whose SP has
// no Supervisor/Employee columns) silently ignores those two filters, just like
// the VB "BaleNoAbstract" branch which only filtered by Waste Item.

const csvSet = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const set = new Set(
    String(v)
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
  );
  return set.size ? set : null;
};

export const applyWasteFilters = (rows, query = {}) => {
  if (!Array.isArray(rows) || rows.length === 0) return rows || [];
  const sup = csvSet(query.SupervisorCodes);
  const emp = csvSet(query.EmployeeCodes);
  const item = csvSet(query.WasteItemCodes);
  if (!sup && !emp && !item) return rows;

  return rows.filter((r) => {
    if (item && r.WasteItemCode != null && !item.has(String(r.WasteItemCode)))
      return false;
    if (sup && r.SupervisorCode != null && !sup.has(String(r.SupervisorCode)))
      return false;
    if (emp && r.EmployeeCode != null && !emp.has(String(r.EmployeeCode)))
      return false;
    return true;
  });
};
