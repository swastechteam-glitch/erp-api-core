// roleMenu.controller.js
// ---------------------------------------------------------------------------
// Role-based menu access: roles CRUD, menu catalog, role<->menu assignment,
// user<->role assignment, and the per-user "my menus" lookup the web app calls
// on login. Mirrors the project convention: parameterized SQL via getPool() and
// the shared sendSuccess / sendError / sendPaginated response helpers.
//
// IsSuperAdmin is NEVER set here — it is bootstrapped only in
//   db/role_menu_access.sql
// ---------------------------------------------------------------------------
import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { sendSuccess, sendError, sendPaginated } from "../utils/response.js";

const requireSub = (req, res) => {
  if (!req.headers.subdbname) {
    sendError(res, "Missing subDBName", 400);
    return false;
  }
  return true;
};

// A query/DDL against an RBAC table that hasn't been deployed yet surfaces as
// different SQL errors depending on the statement:
//   SELECT / INSERT       -> 208  ("Invalid object name 'dbo.tbl_web_...'")
//   ALTER TABLE (our lazy  -> 4902 ("Cannot find the object 'dbo.tbl_web_...'
//   column self-heal)              because it does not exist or you do not
//                                  have permissions.")
// Treat all of them as "RBAC not configured" so the app degrades gracefully
// (client falls back to showing all menus) instead of throwing a 500 and
// locking the user out with "No access yet".
const isMissingTableError = (err) =>
  err?.number === 208 ||
  err?.number === 4902 ||
  /invalid object name|cannot find the object/i.test(err?.message || "");

// Look up a user's role (used by my-menus and the super-admin guard).
const getUserRoleRow = async (pool, userCode) => {
  const r = await pool
    .request()
    .input("UserCode", sql.Int, userCode)
    .query(`
      SELECT TOP 1 r.RoleCode, r.RoleName, r.IsSuperAdmin
      FROM dbo.tbl_web_UserRole ur
      JOIN dbo.tbl_web_Role r ON r.RoleCode = ur.RoleCode AND r.Status = 1
      WHERE ur.UserCode = @UserCode
    `);
  return r.recordset[0] || null;
};

// Lazy migration: make sure the per-menu Add/Edit/Delete columns exist. Databases
// set up before this feature won't have them — add them on first use so the app
// self-heals (no manual SQL run). Idempotent, cached per subDB, and a no-op when
// the RBAC tables aren't deployed yet (handled as "not configured" elsewhere).
const _actionColsReady = new Set();
const ensureActionColumns = async (pool, subdbname) => {
  if (_actionColsReady.has(subdbname)) return;
  try {
    await pool.request().query(`
      IF COL_LENGTH('dbo.tbl_web_RoleMenu','CanAdd')    IS NULL ALTER TABLE dbo.tbl_web_RoleMenu ADD CanAdd    BIT NOT NULL CONSTRAINT DF_webRoleMenu_CanAdd    DEFAULT (1);
      IF COL_LENGTH('dbo.tbl_web_RoleMenu','CanEdit')   IS NULL ALTER TABLE dbo.tbl_web_RoleMenu ADD CanEdit   BIT NOT NULL CONSTRAINT DF_webRoleMenu_CanEdit   DEFAULT (1);
      IF COL_LENGTH('dbo.tbl_web_RoleMenu','CanDelete') IS NULL ALTER TABLE dbo.tbl_web_RoleMenu ADD CanDelete BIT NOT NULL CONSTRAINT DF_webRoleMenu_CanDelete DEFAULT (1);
      IF COL_LENGTH('dbo.tbl_web_UserMenu','CanAdd')    IS NULL ALTER TABLE dbo.tbl_web_UserMenu ADD CanAdd    BIT NOT NULL CONSTRAINT DF_webUserMenu_CanAdd    DEFAULT (1);
      IF COL_LENGTH('dbo.tbl_web_UserMenu','CanEdit')   IS NULL ALTER TABLE dbo.tbl_web_UserMenu ADD CanEdit   BIT NOT NULL CONSTRAINT DF_webUserMenu_CanEdit   DEFAULT (1);
      IF COL_LENGTH('dbo.tbl_web_UserMenu','CanDelete') IS NULL ALTER TABLE dbo.tbl_web_UserMenu ADD CanDelete BIT NOT NULL CONSTRAINT DF_webUserMenu_CanDelete DEFAULT (1);
    `);
    _actionColsReady.add(subdbname);
  } catch (err) {
    // Tables not deployed yet (notConfigured) -> handled elsewhere; don't cache
    // so a later call (after the one-time setup) retries the column add.
    if (isMissingTableError(err)) return;
    throw err;
  }
};

// First-run bootstrap: true when NO user is mapped to a super-admin role yet.
// While true, any authenticated user is treated as super admin so the very
// first user can configure access. It auto-locks the moment a super admin is
// assigned. Returns null if the tables aren't deployed (handled by callers).
const isBootstrapMode = async (pool) => {
  try {
    const r = await pool.request().query(`
      SELECT TOP 1 1 AS x
      FROM dbo.tbl_web_UserRole ur
      JOIN dbo.tbl_web_Role r ON r.RoleCode = ur.RoleCode AND r.Status = 1
      WHERE r.IsSuperAdmin = 1
    `);
    return r.recordset.length === 0; // no super admin assigned -> bootstrap
  } catch (err) {
    if (isMissingTableError(err)) return null;
    throw err;
  }
};

// ── Express middleware: allow only the super admin through ──────────────────
export const requireSuperAdmin = async (req, res, next) => {
  try {
    if (!requireSub(req, res)) return;
    const userId = parseInt(req.headers.userId);
    if (!userId) return sendError(res, "Missing user context", 400);
    const pool = await getPool(req.headers.subdbname);
    // Self-heal the A/E/D columns before any role-access write/read runs (this
    // guard wraps every super-admin endpoint).
    await ensureActionColumns(pool, req.headers.subdbname);
    const role = await getUserRoleRow(pool, userId);
    if (role?.IsSuperAdmin) return next();
    // Bootstrap window: nobody is a super admin yet -> let the first user in.
    if ((await isBootstrapMode(pool)) === true) return next();
    return sendError(res, "Not authorized", 403);
  } catch (err) {
    console.error("DB Error (requireSuperAdmin):", err);
    return sendError(res, err);
  }
};

// Direct per-user menu grants (tbl_web_UserMenu) with their A/E/D flags. Returns
// [] when the user has no direct assignment, or null if the table isn't deployed
// yet (so callers can fall back to role menus instead of failing).
const getUserMenuRows = async (pool, userCode) => {
  try {
    const r = await pool
      .request()
      .input("UserCode", sql.Int, userCode)
      .query(`
        SELECT m.MenuKey, um.CanAdd, um.CanEdit, um.CanDelete
        FROM dbo.tbl_web_UserMenu um
        JOIN dbo.tbl_web_Menu m ON m.MenuCode = um.MenuCode AND m.Status = 1
        WHERE um.UserCode = @UserCode
      `);
    return r.recordset.map((m) => ({
      MenuKey: m.MenuKey,
      CanAdd: !!m.CanAdd,
      CanEdit: !!m.CanEdit,
      CanDelete: !!m.CanDelete,
    }));
  } catch (err) {
    if (isMissingTableError(err)) {
      return null; // table not created yet -> fall back to role menus
    }
    throw err;
  }
};

// Build the per-menu action map the web app enforces:  { key: {add,edit,del} }.
const toActions = (rows) => {
  const a = {};
  rows.forEach((m) => {
    a[m.MenuKey] = { add: !!m.CanAdd, edit: !!m.CanEdit, del: !!m.CanDelete };
  });
  return a;
};

// ── GET /role-access/my-menus  (any authenticated user) ─────────────────────
export const getMyMenus = async (req, res) => {
  try {
    if (!requireSub(req, res)) return;
    const userId = parseInt(req.headers.userId);
    if (!userId) return sendError(res, "Missing user context", 400);

    const pool = await getPool(req.headers.subdbname);
    await ensureActionColumns(pool, req.headers.subdbname);
    const role = await getUserRoleRow(pool, userId);

    // Super admin or first-run bootstrap sees every menu.
    const bootstrap =
      !role?.IsSuperAdmin && (await isBootstrapMode(pool)) === true;
    if (role?.IsSuperAdmin || bootstrap) {
      const all = await pool
        .request()
        .query(`SELECT MenuKey FROM dbo.tbl_web_Menu WHERE Status = 1`);
      return sendSuccess(res, {
        roleName: role?.RoleName || (bootstrap ? "Bootstrap Admin" : ""),
        isSuperAdmin: true,
        bootstrap,
        menuKeys: all.recordset.map((m) => m.MenuKey),
      });
    }

    // A user's effective menus = the ROLE's menus (baseline) PLUS any direct
    // per-user menus (extras). Direct menus only ADD / override flags now — they
    // can no longer HIDE the role's menus, which used to silently break role-based
    // rollout (a user with leftover direct menus saw those instead of the role).
    const userRows = (await getUserMenuRows(pool, userId)) || [];

    // Nothing assigned at all (no role AND no direct menus) -> no access yet.
    if (!role && !userRows.length) {
      return sendSuccess(
        res,
        { roleName: "", isSuperAdmin: false, noRole: true, menuKeys: [] },
        "No role assigned"
      );
    }

    let roleRows = [];
    if (role) {
      const menus = await pool
        .request()
        .input("RoleCode", sql.Int, role.RoleCode)
        .query(`
          SELECT m.MenuKey, rm.CanAdd, rm.CanEdit, rm.CanDelete
          FROM dbo.tbl_web_RoleMenu rm
          JOIN dbo.tbl_web_Menu m ON m.MenuCode = rm.MenuCode AND m.Status = 1
          WHERE rm.RoleCode = @RoleCode
        `);
      roleRows = menus.recordset.map((m) => ({
        MenuKey: m.MenuKey,
        CanAdd: !!m.CanAdd,
        CanEdit: !!m.CanEdit,
        CanDelete: !!m.CanDelete,
      }));
    }

    // Merge: role first (baseline), then direct user rows override per-menu flags.
    const mergedMap = new Map();
    roleRows.forEach((r) => mergedMap.set(r.MenuKey, r));
    userRows.forEach((r) => mergedMap.set(r.MenuKey, r));
    const merged = Array.from(mergedMap.values());

    return sendSuccess(res, {
      roleName: role?.RoleName || "",
      isSuperAdmin: false,
      menuKeys: merged.map((m) => m.MenuKey),
      actions: toActions(merged),
    });
  } catch (err) {
    // If the RBAC tables don't exist yet (feature not deployed), don't break the
    // app — report "not configured" so the client falls back to showing all menus.
    if (isMissingTableError(err)) {
      return sendSuccess(
        res,
        { roleName: "", isSuperAdmin: false, notConfigured: true, menuKeys: [] },
        "RBAC not configured"
      );
    }
    console.error("DB Error (getMyMenus):", err);
    return sendError(res, err);
  }
};

// ── GET /role-access/roles ──────────────────────────────────────────────────
export const getRoles = async (req, res) => {
  try {
    if (!requireSub(req, res)) return;
    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().query(`
      SELECT RoleCode, RoleName, IsSuperAdmin, Status
      FROM dbo.tbl_web_Role
      ORDER BY RoleCode DESC
    `);
    const data = result.recordset.map((r) => ({
      ...r,
      id: r.RoleCode,
      StatusText: r.Status ? "ACTIVE" : "INACTIVE",
    }));
    return sendPaginated(res, data, req.query);
  } catch (err) {
    console.error("DB Error (getRoles):", err);
    return sendError(res, err);
  }
};

// ── POST/PUT role (IsSuperAdmin intentionally not settable here) ────────────
const saveRole = async (req, res, isEdit) => {
  try {
    if (!requireSub(req, res)) return;
    const userId = parseInt(req.headers.userId) || null;
    const name = (req.body?.RoleName || "").trim();
    if (!name) return sendError(res, "Role name is required", 400);

    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();
    request.input("RoleName", sql.NVarChar, name);
    request.input("Status", sql.Bit, req.body?.Status === false ? 0 : 1);
    request.input("User", sql.Int, userId);

    if (isEdit) {
      const code = parseInt(req.params.roleCode);
      if (!code) return sendError(res, "Invalid roleCode", 400);
      request.input("RoleCode", sql.Int, code);
      await request.query(`
        UPDATE dbo.tbl_web_Role
        SET RoleName = @RoleName, Status = @Status,
            ModifiedBy = @User, ModifiedOn = GETDATE()
        WHERE RoleCode = @RoleCode
      `);
      return sendSuccess(res, null, "Role updated");
    }

    const ins = await request.query(`
      INSERT INTO dbo.tbl_web_Role (RoleName, Status, CreatedBy, CreatedOn)
      OUTPUT INSERTED.RoleCode
      VALUES (@RoleName, @Status, @User, GETDATE())
    `);
    return sendSuccess(res, { RoleCode: ins.recordset[0].RoleCode }, "Role created", 201);
  } catch (err) {
    console.error("DB Error (saveRole):", err);
    return sendError(res, err);
  }
};

export const createRole = (req, res) => saveRole(req, res, false);
export const updateRole = (req, res) => saveRole(req, res, true);

// ── DELETE /role-access/roles/:roleCode ─────────────────────────────────────
export const deleteRole = async (req, res) => {
  try {
    if (!requireSub(req, res)) return;
    const code = parseInt(req.params.roleCode);
    if (!code) return sendError(res, "Invalid roleCode", 400);

    const pool = await getPool(req.headers.subdbname);

    const role = await pool
      .request()
      .input("RoleCode", sql.Int, code)
      .query(`SELECT IsSuperAdmin FROM dbo.tbl_web_Role WHERE RoleCode = @RoleCode`);
    if (!role.recordset[0]) return sendError(res, "Role not found", 404);
    if (role.recordset[0].IsSuperAdmin)
      return sendError(res, "The Super Admin role cannot be deleted", 400);

    const used = await pool
      .request()
      .input("RoleCode", sql.Int, code)
      .query(`SELECT COUNT(*) AS c FROM dbo.tbl_web_UserRole WHERE RoleCode = @RoleCode`);
    if (used.recordset[0].c > 0)
      return sendError(res, "Cannot delete: users are assigned to this role", 400);

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      await new sql.Request(tx)
        .input("RoleCode", sql.Int, code)
        .query(`DELETE FROM dbo.tbl_web_RoleMenu WHERE RoleCode = @RoleCode`);
      await new sql.Request(tx)
        .input("RoleCode", sql.Int, code)
        .query(`DELETE FROM dbo.tbl_web_Role WHERE RoleCode = @RoleCode`);
      await tx.commit();
    } catch (e) {
      await tx.rollback();
      throw e;
    }
    return sendSuccess(res, null, "Role deleted");
  } catch (err) {
    console.error("DB Error (deleteRole):", err);
    return sendError(res, err);
  }
};

// ── GET /role-access/menus  (the seeded catalog) ────────────────────────────
export const getMenus = async (req, res) => {
  try {
    if (!requireSub(req, res)) return;
    const pool = await getPool(req.headers.subdbname);
    const result = await pool.request().query(`
      SELECT MenuCode, MenuKey, MenuLabel, MenuType, GroupName, SortOrder
      FROM dbo.tbl_web_Menu
      WHERE Status = 1
      ORDER BY SortOrder
    `);
    return sendSuccess(res, result.recordset);
  } catch (err) {
    console.error("DB Error (getMenus):", err);
    return sendError(res, err);
  }
};

// ── POST /role-access/sync-menus  { menus:[{menuKey,menuLabel,menuType,groupName,sortOrder}] } ──
// Upserts the app's canonical menu catalog (the web app builds it from its own
// menu config) into tbl_web_Menu. INSERTS any menu keys that don't exist yet, so
// a newly-added page shows up in Role Access automatically — no need to re-run
// the seed SQL. INSERT-ONLY: existing rows (their labels, order, and role/user
// grants) are never modified or deleted. Called automatically when a super admin
// opens the Role Access screen.
export const syncMenus = async (req, res) => {
  try {
    if (!requireSub(req, res)) return;
    const incoming = Array.isArray(req.body?.menus) ? req.body.menus : [];

    // Normalize + dedupe by MenuKey (MERGE needs a unique source key).
    const seen = new Set();
    const menus = [];
    for (const m of incoming) {
      const key = (m?.menuKey ?? "").toString().trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      menus.push({
        menuKey: key.slice(0, 120),
        menuLabel: ((m?.menuLabel ?? key).toString().trim() || key).slice(0, 200),
        menuType: m?.menuType === "module" ? "module" : "screen",
        groupName: m?.groupName ? m.groupName.toString().slice(0, 120) : null,
        sortOrder: Number.isFinite(+m?.sortOrder) ? +m.sortOrder : 0,
      });
    }
    if (!menus.length) return sendSuccess(res, { inserted: 0, total: 0 }, "No menus to sync");

    const pool = await getPool(req.headers.subdbname);

    // 5 params/row -> chunk to stay well under SQL Server's 2100-param / 1000-row limits.
    const CHUNK = 200;
    let inserted = 0;
    for (let start = 0; start < menus.length; start += CHUNK) {
      const batch = menus.slice(start, start + CHUNK);
      const r = new sql.Request(pool);
      const rows = batch.map((m, i) => {
        r.input(`k${i}`, sql.NVarChar, m.menuKey);
        r.input(`l${i}`, sql.NVarChar, m.menuLabel);
        r.input(`t${i}`, sql.NVarChar, m.menuType);
        r.input(`g${i}`, sql.NVarChar, m.groupName);
        r.input(`o${i}`, sql.Int, m.sortOrder);
        return `(@k${i},@l${i},@t${i},@g${i},@o${i})`;
      });
      const result = await r.query(`
        MERGE dbo.tbl_web_Menu AS tgt
        USING (VALUES ${rows.join(",")}) AS src(MenuKey, MenuLabel, MenuType, GroupName, SortOrder)
          ON tgt.MenuKey = src.MenuKey
        WHEN NOT MATCHED THEN
          INSERT (MenuKey, MenuLabel, MenuType, GroupName, SortOrder, Status)
          VALUES (src.MenuKey, src.MenuLabel, src.MenuType, src.GroupName, src.SortOrder, 1);
      `);
      inserted += result.rowsAffected?.[0] || 0;
    }
    return sendSuccess(res, { inserted, total: menus.length }, `Synced ${inserted} new menu(s)`);
  } catch (err) {
    // Tables not deployed yet -> the setup screen handles it; don't error out.
    if (isMissingTableError(err)) {
      return sendSuccess(res, { inserted: 0, notConfigured: true }, "RBAC not configured");
    }
    console.error("DB Error (syncMenus):", err);
    return sendError(res, err);
  }
};

// ── GET /role-access/role-menus/:roleCode -> [MenuKey, ...] ──────────────────
export const getRoleMenus = async (req, res) => {
  try {
    if (!requireSub(req, res)) return;
    const code = parseInt(req.params.roleCode);
    if (!code) return sendError(res, "Invalid roleCode", 400);
    const pool = await getPool(req.headers.subdbname);
    const result = await pool
      .request()
      .input("RoleCode", sql.Int, code)
      .query(`
        SELECT m.MenuKey, rm.CanAdd, rm.CanEdit, rm.CanDelete
        FROM dbo.tbl_web_RoleMenu rm
        JOIN dbo.tbl_web_Menu m ON m.MenuCode = rm.MenuCode AND m.Status = 1
        WHERE rm.RoleCode = @RoleCode
      `);
    return sendSuccess(
      res,
      result.recordset.map((m) => ({
        MenuKey: m.MenuKey,
        CanAdd: !!m.CanAdd,
        CanEdit: !!m.CanEdit,
        CanDelete: !!m.CanDelete,
      }))
    );
  } catch (err) {
    console.error("DB Error (getRoleMenus):", err);
    return sendError(res, err);
  }
};

// Normalize a save payload: prefer the new
//   menus: [{ menuKey, canAdd, canEdit, canDelete }]
// shape; fall back to the legacy `menuKeys: [...]` (full CRUD) for older clients.
const normalizeMenus = (body) => {
  if (Array.isArray(body?.menus)) {
    return body.menus
      .filter((m) => m && m.menuKey)
      .map((m) => ({
        menuKey: String(m.menuKey),
        canAdd: m.canAdd !== false,
        canEdit: m.canEdit !== false,
        canDelete: m.canDelete !== false,
      }));
  }
  if (Array.isArray(body?.menuKeys)) {
    return body.menuKeys.map((k) => ({
      menuKey: String(k),
      canAdd: true,
      canEdit: true,
      canDelete: true,
    }));
  }
  return [];
};

// Insert (owner -> menu) grants with their A/E/D flags into a RoleMenu/UserMenu
// table inside an existing transaction. Resolves MenuKey -> MenuCode via a join
// so unknown keys are silently ignored. `table`/`ownerCol` are server constants.
const insertMenuGrants = async (tx, table, ownerCol, ownerCode, menus) => {
  if (!menus.length) return;
  // SQL Server caps a request at 2100 parameters (and a VALUES list at 1000
  // rows). Each menu contributes 4 params, so a role/user with many menus (600+)
  // would blow past 2100 and abort the transaction with error 8003. Chunk the
  // grants to stay well under both limits.
  const CHUNK = 200;
  for (let start = 0; start < menus.length; start += CHUNK) {
    const batch = menus.slice(start, start + CHUNK);
    const r = new sql.Request(tx);
    r.input("Owner", sql.Int, ownerCode);
    const rows = batch.map((m, i) => {
      r.input(`k${i}`, sql.NVarChar, m.menuKey);
      r.input(`a${i}`, sql.Bit, m.canAdd ? 1 : 0);
      r.input(`e${i}`, sql.Bit, m.canEdit ? 1 : 0);
      r.input(`d${i}`, sql.Bit, m.canDelete ? 1 : 0);
      return `(@k${i},@a${i},@e${i},@d${i})`;
    });
    await r.query(`
      INSERT INTO dbo.${table} (${ownerCol}, MenuCode, CanAdd, CanEdit, CanDelete)
      SELECT @Owner, m.MenuCode, v.CanAdd, v.CanEdit, v.CanDelete
      FROM dbo.tbl_web_Menu m
      JOIN (VALUES ${rows.join(",")}) AS v(MenuKey, CanAdd, CanEdit, CanDelete)
        ON v.MenuKey = m.MenuKey
    `);
  }
};

// ── POST /role-access/role-menus { roleCode, menus:[{menuKey,canAdd,...}] } ──
// Replaces the full set for the role (delete-all + insert-selected, with flags).
export const saveRoleMenus = async (req, res) => {
  try {
    if (!requireSub(req, res)) return;
    const roleCode = parseInt(req.body?.roleCode);
    if (!roleCode) return sendError(res, "Invalid roleCode", 400);
    const menus = normalizeMenus(req.body);

    const pool = await getPool(req.headers.subdbname);
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      await new sql.Request(tx)
        .input("RoleCode", sql.Int, roleCode)
        .query(`DELETE FROM dbo.tbl_web_RoleMenu WHERE RoleCode = @RoleCode`);
      await insertMenuGrants(tx, "tbl_web_RoleMenu", "RoleCode", roleCode, menus);
      await tx.commit();
    } catch (e) {
      await tx.rollback();
      throw e;
    }
    return sendSuccess(res, null, "Menu access updated");
  } catch (err) {
    console.error("DB Error (saveRoleMenus):", err);
    return sendError(res, err);
  }
};

// ── GET /role-access/users  (for the assign-user-role screen) ───────────────
export const getUsers = async (req, res) => {
  try {
    if (!requireSub(req, res)) return;
    const pool = await getPool(req.headers.subdbname);
    const request = pool.request();
    let where = `WHERE u.Status = 1`;
    if (req.headers.companyCode) {
      request.input("CompanyCode", sql.Int, parseInt(req.headers.companyCode));
      where += ` AND u.companyCode = @CompanyCode`;
    }
    const result = await request.query(`
      SELECT u.UserCode, u.UName, ur.RoleCode, r.RoleName
      FROM dbo.vw_User u
      LEFT JOIN dbo.tbl_web_UserRole ur ON ur.UserCode = u.UserCode
      LEFT JOIN dbo.tbl_web_Role r ON r.RoleCode = ur.RoleCode
      ${where}
      ORDER BY u.UName
    `);
    return sendSuccess(res, result.recordset);
  } catch (err) {
    console.error("DB Error (getUsers):", err);
    return sendError(res, err);
  }
};

// ── POST /role-access/user-role  { userCode, roleCode } ─────────────────────
export const saveUserRole = async (req, res) => {
  try {
    if (!requireSub(req, res)) return;
    const userCode = parseInt(req.body?.userCode);
    const roleCode = parseInt(req.body?.roleCode);
    if (!userCode || !roleCode)
      return sendError(res, "userCode and roleCode are required", 400);

    const pool = await getPool(req.headers.subdbname);
    await pool
      .request()
      .input("UserCode", sql.Int, userCode)
      .input("RoleCode", sql.Int, roleCode)
      .query(`
        MERGE dbo.tbl_web_UserRole AS t
        USING (SELECT @UserCode AS UserCode) AS s ON t.UserCode = s.UserCode
        WHEN MATCHED THEN UPDATE SET RoleCode = @RoleCode
        WHEN NOT MATCHED THEN INSERT (UserCode, RoleCode) VALUES (@UserCode, @RoleCode);
      `);
    return sendSuccess(res, null, "Role assigned to user");
  } catch (err) {
    console.error("DB Error (saveUserRole):", err);
    return sendError(res, err);
  }
};

// ── GET /role-access/user-menus/:userCode -> [MenuKey, ...] ──────────────────
// The menus assigned DIRECTLY to a user (tbl_UserMenu), independent of role.
export const getUserMenus = async (req, res) => {
  try {
    if (!requireSub(req, res)) return;
    const code = parseInt(req.params.userCode);
    if (!code) return sendError(res, "Invalid userCode", 400);
    const pool = await getPool(req.headers.subdbname);
    const rows = await getUserMenuRows(pool, code);
    return sendSuccess(res, rows || []);
  } catch (err) {
    console.error("DB Error (getUserMenus):", err);
    return sendError(res, err);
  }
};

// ── POST /role-access/user-menus  { userCode, menuKeys: [...] } ──────────────
// Replaces the full direct-menu set for a user (delete-all + insert-selected).
// An empty menuKeys clears the user's direct menus -> they fall back to role.
export const saveUserMenus = async (req, res) => {
  try {
    if (!requireSub(req, res)) return;
    const userCode = parseInt(req.body?.userCode);
    if (!userCode) return sendError(res, "Invalid userCode", 400);
    const menus = normalizeMenus(req.body);

    const pool = await getPool(req.headers.subdbname);
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      await new sql.Request(tx)
        .input("UserCode", sql.Int, userCode)
        .query(`DELETE FROM dbo.tbl_web_UserMenu WHERE UserCode = @UserCode`);
      await insertMenuGrants(tx, "tbl_web_UserMenu", "UserCode", userCode, menus);
      await tx.commit();
    } catch (e) {
      await tx.rollback();
      throw e;
    }
    return sendSuccess(res, null, "User menu access updated");
  } catch (err) {
    console.error("DB Error (saveUserMenus):", err);
    return sendError(res, err);
  }
};
