// ---------------------------------------------------------------------------
// Duplicate-name guard for master screens.
//
// Many client DBs have no UNIQUE constraint on the master's name column, so a
// duplicate is silently inserted and the user never sees an "already exists"
// message. This helper detects a duplicate BEFORE the AddEdit runs by reusing
// the entity's existing `sp_X_GetAll` proc — so we never hard-code physical
// table / column names and it works regardless of DB constraints.
//
//   if (await isDuplicateByGetAll(pool, {
//         proc: "sp_MaintenanceGroup_GetAll",
//         nameField: "MaintenanceGroupName",
//         codeField: "MaintenanceGroupCode",
//         name, code,                       // code is null on create
//       }))
//     return sendError(res, "Maintenance Group already exists", 409);
//
// For company / FY scoped GetAll procs pass their inputs via `params`:
//   params: [{ name: "CompanyCode", type: sql.Int, value: companyCode }]
// ---------------------------------------------------------------------------

export const isDuplicateByGetAll = async (
  pool,
  { proc, params = [], nameField, codeField, name, code }
) => {
  const target = String(name ?? "").trim().toLowerCase();
  if (!target || !proc || !nameField) return false;

  const request = pool.request();
  for (const p of params) request.input(p.name, p.type, p.value);
  const r = await request.execute(proc);

  return (r.recordset || []).some(
    (row) =>
      String(row[nameField] ?? "").trim().toLowerCase() === target &&
      Number(row[codeField] ?? 0) !== Number(code ?? 0)
  );
};

export default isDuplicateByGetAll;
