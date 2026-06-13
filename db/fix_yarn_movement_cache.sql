/* ============================================================================
   FIX: "Which yarn counts are moving slowly?" returned the WRONG answer
   ----------------------------------------------------------------------------
   Run this on the CENTRAL AI-chat metadata DB (Swas @103.131.196.130) — the
   database that holds tbl_chat_query_cache / tbl_chat_* (NOT a client DB).

   Why: the AI auto-cached a wrong SELECT for this question (KAS row pointed at
   vw_AI_Store_Stock_Statement = packaging stock; LOCALHOST row at
   vw_AI_Yarn_Packing). Yarn SALES movement by count lives in vw_AI_Yarn_Invoice.

   This script:
     1) adds the IsCurated column (so curated rows can never be auto-overwritten),
     2) pins the CORRECT SELECT (vw_AI_Yarn_Invoice, by CountName, slowest first)
        as a CURATED row for every tenant — overriding the poisoned rows.

   Idempotent — safe to run more than once. After the app redeploys with the new
   code it will also self-correct on the next ask, but this fixes it immediately.
   ============================================================================ */

-- 1) Add IsCurated if the column doesn't exist yet ---------------------------
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('tbl_chat_query_cache') AND name = 'IsCurated'
)
    ALTER TABLE tbl_chat_query_cache ADD IsCurated BIT NOT NULL DEFAULT 0;
GO

-- 2) Upsert the curated yarn-sales-movement query for all tenants -----------
DECLARE @key  NVARCHAR(300) = N'which yarn counts are moving slowly';
DECLARE @text NVARCHAR(MAX) = N'Which yarn counts are moving slowly?';
DECLARE @sql  NVARCHAR(MAX) = N'SELECT CountName,
       SUM(Bags) AS TotalBags,
       SUM(Weight) AS TotalKgs,
       SUM(NetAmount) AS TotalSalesValue
FROM vw_AI_Yarn_Invoice
WHERE BillDate >= DATEADD(MONTH, -3, CAST(CONVERT(VARCHAR(10), GETDATE(), 120) AS DATETIME))
  AND BillDate <= CAST(CONVERT(VARCHAR(10), GETDATE(), 120) AS DATETIME)
GROUP BY CountName
ORDER BY TotalKgs ASC';

-- 2a) Correct any rows that already exist for this question (all tenants) ----
UPDATE tbl_chat_query_cache
   SET SqlQuery   = @sql,
       Domain     = N'YARN_SALES',
       Intent     = N'DATA_QUERY',
       PromptText = @text,
       IsCurated  = 1,
       IsActive   = 1,
       UpdatedAt  = GETDATE()
 WHERE PromptKey = @key;

-- 2b) Seed the curated row for known tenants that don't have one yet ---------
--     Edit this list to match your subdbname codes.
DECLARE @tenants TABLE (SubDbName NVARCHAR(100));
INSERT INTO @tenants (SubDbName) VALUES (N'KAS'), (N'LOCALHOST'), (N'KPT'), (N'TPN');

INSERT INTO tbl_chat_query_cache
       (SubDbName, PromptKey, PromptText, Domain, Intent, SqlQuery, IsCurated, HitCount, IsActive, CreatedAt)
SELECT t.SubDbName, @key, @text, N'YARN_SALES', N'DATA_QUERY', @sql, 1, 0, 1, GETDATE()
  FROM @tenants t
 WHERE NOT EXISTS (
     SELECT 1 FROM tbl_chat_query_cache c
      WHERE c.SubDbName = t.SubDbName AND c.PromptKey = @key
 );
GO

-- 3) Verify -----------------------------------------------------------------
SELECT SubDbName, PromptKey, Domain, IsCurated, LEFT(SqlQuery, 60) AS SqlHead
  FROM tbl_chat_query_cache
 WHERE PromptKey = N'which yarn counts are moving slowly'
 ORDER BY SubDbName;
GO
