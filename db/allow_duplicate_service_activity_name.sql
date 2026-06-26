/* ============================================================================
   ALLOW duplicate Service Activity names (Mechanical & Electrical)
   ----------------------------------------------------------------------------
   Run this on EACH CLIENT/TENANT database (the per-subdbname company DBs that
   hold tbl_ServiceActivity) — NOT the central AI-chat DB.

   Why: the DB rule "UK_tbl_ServiceActivity" makes the activity NAME globally
   unique, which wrongly blocked using the same name in both Mechanical and
   Electrical (the 409 "Please Check the Entry"). The business wants the same
   name allowed ACROSS types, but still NOT duplicated WITHIN one type.

   So we DROP this DB-level rule. Per-(ServiceType, Name) uniqueness is now
   enforced in serviceActivity.controller.js, which returns the message
   "Already Exists Service Activity Name" for a within-type duplicate.

   NOTE: the controller also drops this rule automatically the first time a
   Service Activity is saved against each client DB (best-effort). This script
   is the manual equivalent — useful if the app's DB user lacks ALTER
   permission, so a DBA can apply it directly.

   Idempotent — safe to run more than once. No row data is changed.
   ============================================================================ */

-- Drop it whether it exists as a UNIQUE / key CONSTRAINT ...
IF EXISTS (
    SELECT 1 FROM sys.key_constraints
    WHERE name = 'UK_tbl_ServiceActivity'
      AND parent_object_id = OBJECT_ID('tbl_ServiceActivity')
)
    ALTER TABLE tbl_ServiceActivity DROP CONSTRAINT UK_tbl_ServiceActivity;
GO

-- ... or as a standalone UNIQUE INDEX.
IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UK_tbl_ServiceActivity'
      AND object_id = OBJECT_ID('tbl_ServiceActivity')
)
    DROP INDEX UK_tbl_ServiceActivity ON tbl_ServiceActivity;
GO

-- Verify (should return NO rows once the rule is gone).
SELECT 'constraint' AS kind, name FROM sys.key_constraints
 WHERE name = 'UK_tbl_ServiceActivity' AND parent_object_id = OBJECT_ID('tbl_ServiceActivity')
UNION ALL
SELECT 'index' AS kind, name FROM sys.indexes
 WHERE name = 'UK_tbl_ServiceActivity' AND object_id = OBJECT_ID('tbl_ServiceActivity');
GO
