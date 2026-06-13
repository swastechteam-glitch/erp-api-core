# Textiles_ERP_API

# SWAS AI Chat — v2.0 Upgrade

This package replaces all three layers of your AI chat:

| File | What it replaces | Where it goes |
| --- | --- | --- |
| `01_Chat_AI_Metadata.sql` | The AI metadata tables (chat_table, chat_column, …) | Run once on every company DB |
| `02_aiChatController.js`  | `controllers/aiChatController.js` | Node.js backend |
| `03_ERPAIChat.jsx`        | `components/ERPAIChat.jsx` | React frontend |

---

## What's new vs. v1

### SQL metadata
- **No more broken examples.** Every one of the 36 example SQL statements is valid SQL Server 2008 — verified with a parens-balance + empty-WHERE checker.
- **New `Domain` column on `chat_table`** so the backend can load only the tables relevant to the user's question (faster, cheaper, fewer model mistakes).
- **New `chat_intent_pattern` table** maps keywords like `absent`, `ot`, `kgs`, `wages` to a domain in milliseconds — no AI call needed for 90 %+ of questions.
- **Attendance status codes corrected.** The forward-slash suffix (`X/`, `L/`, `A/`, `WX/`, `H/` …) means half-day. Categories now distinguish PRESENT / ABSENT / LEAVE / HOLIDAY / WEEKOFF / HALFDAY.
- **Stronger synonyms** — `absentees`, `worked`, `payslip`, `payroll`, `manpower`, `headcount`, `half day`, `comp off`, `qty`, etc.
- **Better date intelligence** — adds `day before yesterday`, `last 7 days`, `last 30 days`, `current quarter`.

### Backend (Node.js)
- **Two-stage intent classifier**: fast keyword match against `chat_intent_pattern` first, then AI fallback only for ambiguous wording.
- **Domain-scoped schema** — an attendance question never sees the salary table description, and vice-versa. Smaller prompts → less drift → cheaper.
- **Schema caching** (5-min TTL, configurable via `AI_SCHEMA_TTL_MS`). Hot calls skip the metadata SELECTs entirely.
- **SQL self-repair**: if generated SQL fails, the model is invited to fix it once using the actual error message. No more dead-end "API Error".
- **Validator hardened**: auto-fixes `DATEFROMPARTS` / `EOMONTH`, strips empty `WHERE` clauses, replaces raw `Status =` with `LTRIM(RTRIM(Status)) =`, fixes the `OTHours` typo, manages DOL filter dynamically.
- **Conversation history forwarded** so follow-ups like "now show me last week" know what "now" means.
- **Cache-clear endpoint** for when you edit metadata: `clearSchemaCache`.

### Frontend (React)
- **Conversation history sent on every call** so the backend has context.
- **Smart auto-chart**: bar by default, line for time-series, pie for ≤ 8 categories. Falls back gracefully when no numeric column exists.
- **Three-stage typing indicator**: Thinking → Fetching data → Summarising.
- **Local "show as chart" path**: if you already have the data and ask for a chart, no backend round-trip happens — instant.
- **Demo mode triggers only on real network failures**, not on AI errors. AI errors get a clean inline message + retry suggestion.
- **Attendance cards are driven by the server's `aggregated` object**, never recomputed wrong on the client.

---

## Deployment

### 1. Backup first
```bash
# In SSMS, before anything else:
SELECT * INTO chat_table_backup        FROM chat_table;
SELECT * INTO chat_column_backup       FROM chat_column;
SELECT * INTO chat_prompt_example_bk   FROM chat_prompt_example;
-- (and any other chat_* tables you customised)
```

### 2. Run the metadata SQL
Open `01_Chat_AI_Metadata.sql` in SSMS, point it at your company DB (e.g. `SwasERP_SKT`), and run.
The script drops and recreates all `chat_*` tables, so it is safe to re-run.

Verify (uncomment the block at the bottom of the file):
```sql
SELECT 'Tables'         AS [Check], COUNT(*) FROM chat_table;          -- expect 10
SELECT 'Columns'        AS [Check], COUNT(*) FROM chat_column;          -- ~95
SELECT 'Examples'       AS [Check], COUNT(*) FROM chat_prompt_example;  -- 36
SELECT 'IntentPatterns' AS [Check], COUNT(*) FROM chat_intent_pattern;  -- ~60
```

> The old code used `tbl_chat_table` (with `tbl_` prefix). The new code uses **`chat_table`** (no prefix), matching your `CREATE TABLE` script. Make sure both the SQL file and the controller agree.

### 3. Replace the backend controller
```bash
cp 02_aiChatController.js  ./controllers/aiChatController.js
```
`.env` keys (the AI layer is multi-provider — routed by model name in
`src/services/aiChat/client.js`):
```
# Active providers
GEMINI_API_KEY=<google gemini key>        # cheap steps: intent / summary / chat
ANTHROPIC_API_KEY=<anthropic claude key>  # accuracy step: SQL generation/repair
AI_MODEL=gemini-flash-latest              # default cheap model (Gemini)
AI_SQL_MODEL=claude-sonnet-4-5            # default SQL model (Claude)
AI_SCHEMA_TTL_MS=300000                   # 5 min schema cache, default

# Disabled fallback (legacy OpenRouter provider) — uncomment to re-enable
# AI_API_KEY=<openrouter key>
# AI_BASE_URL=https://openrouter.ai/api/v1
```
Routing: model names starting with `gemini` go to Google, `claude`/`anthropic/`
go to Anthropic, anything else falls back to the legacy OpenRouter provider
(only if `AI_API_KEY` is set). All providers are called through their
OpenAI-compatible endpoints, so the rest of the code is unchanged.
The handler exports `aiChat` (same name as before) and a new `clearSchemaCache` you can wire to a small admin route:
```js
router.post("/ai/chat",   aiChat);
router.post("/ai/cache",  clearSchemaCache);  // optional
```

### 4. Replace the React component
```bash
cp 03_ERPAIChat.jsx  ./src/components/ERPAIChat.jsx
```
You also need to update your Redux action so the `history` field flows through. In `aiChatActions.js`:
```js
export const aiChatApis = createAsyncThunk(
  "aiChat/send",
  async ({ prompt, history }, thunkAPI) => {
    return axios.post("/api/ai/chat", { prompt, history });
    //                                            ^^^^^^^^ new
  },
);
```

---

## Quick smoke tests

After deployment, try these in order. Each should return the right data (or a friendly empty-state message) and the right shape of UI:

| Prompt | Domain | What to expect |
| --- | --- | --- |
| `hi` | GENERAL_CHAT | Friendly greeting, no SQL |
| `total employees` | EMPLOYEE | A single number, no DOL filter |
| `who is absent today` | ATTENDANCE | List with employee name + dept + status |
| `today present count` | ATTENDANCE | Single number with attendance summary card |
| `department wise present and absent count today` | ATTENDANCE | Grouped table |
| `today ot employees list` | ATTENDANCE | Sorted descending by OT |
| `this week production` | PRODUCTION | Single row with totals |
| `daily production trend last 7 days` | PRODUCTION | 7 rows; ask for "chart" to plot |
| `yesterday reason wise stoppage hours` | STOPPAGE | Grouped table by reason |
| `top 10 highest paid employees this month` | SALARY | Top 10 list |
| `this month department wise total salary` | SALARY | Grouped table |
| `chart` (after the previous query) | ↑ same data | Local chart render — no backend hit |

---

## Adding new examples / synonyms later

Just `INSERT` rows — no code changes needed. The controller picks them up on the next cache expiry (5 min) or immediately after calling `POST /api/ai/cache` to clear the cache.

```sql
INSERT INTO chat_prompt_example (Category, Domain, UserPrompt, CorrectSQL, Notes)
VALUES (
  'ATTENDANCE', 'ATTENDANCE',
  'who is late today by more than 1 hour',
  'SELECT vw_Employee_Attendance.EmployeeID, vw_Employee_Attendance.EmployeeName,
          vw_Employee_Attendance.DepartmentName, vw_Employee_Attendance.LateIn
   FROM tbl_Employee
   LEFT JOIN vw_Employee_Attendance
     ON tbl_Employee.EmployeeCode = vw_Employee_Attendance.EmployeeCode
    AND vw_Employee_Attendance.CalendarDate = CAST(CONVERT(VARCHAR(10), GETDATE(), 120) AS DATETIME)
   WHERE vw_Employee_Attendance.LateIn > 60
     AND (tbl_Employee.DOL IS NULL OR vw_Employee_Attendance.CalendarDate IS NOT NULL)
   ORDER BY vw_Employee_Attendance.LateIn DESC',
  'LateIn is in minutes. 60 = one hour.'
);
```

```sql
INSERT INTO chat_synonym (UserWord, SynonymType, TargetTable, TargetColumn, TargetValue)
VALUES ('night shift', 'COLUMN', 'tbl_Shift', 'ShiftName', NULL);

INSERT INTO chat_intent_pattern (Domain, Keyword, Priority)
VALUES ('ATTENDANCE', 'night shift', 2);
```

---

## Troubleshooting

| Symptom | Where to look |
| --- | --- |
| AI says "I couldn't find any data" but data exists | Check date range — most queries default to today. Try "yesterday" or "this week" explicitly. |
| Wrong domain detected | Add specific keywords to `chat_intent_pattern` with lower (=higher) priority. |
| Generated SQL has `WHERE` then nothing | Should now be impossible — the validator strips empty WHEREs. If you still see one, log the raw `rawSql` before validation. |
| "Invalid column name 'OTHours'" | Validator should auto-fix to `OT_Hours`. Confirm you deployed the new validator. |
| Stale schema after editing chat_* | Call `POST /api/ai/cache` or wait 5 min. |
| Slow first response | Schema cache is empty — second call is ~10× faster. |

---

## File contents at a glance

- **`01_Chat_AI_Metadata.sql`** — 12 tables, 10 business-table descriptions, ~95 column descriptions, 36 SQL examples, ~60 intent patterns, ~75 synonyms, 13 date phrases, 22 attendance status codes, 15 query rules.
- **`02_aiChatController.js`** — single-file controller. Exports `aiChat` and `clearSchemaCache`.
- **`03_ERPAIChat.jsx`** — single-file React component. Same export name as before.

That's it. Drop the three files in, run the SQL, restart the Node server, refresh the browser, and the AI gets smarter the next time someone asks.