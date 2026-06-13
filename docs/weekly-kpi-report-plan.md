# Weekly Spinning KPI Report — AI Chat Implementation Plan

**Goal:** Make the AI chat produce the full KG NAIDU Mills–style *Weekly Production KPI
Analysis Report* (the 18-page reference PDF) from a chat prompt such as
*"weekly kpi report"* — with the daily trend tables, week-on-week comparison,
charts, KPI compliance matrix, machine-wise violators and the action plan.

Status legend: ✅ done · 🟡 partial · ❌ to build

---

## 1. Key architecture decision (read this first)

**This report must NOT go through the existing LLM→SQL chat path. It needs a
dedicated, deterministic report builder.**

Why the current path can't do it:

| Requirement of the KGN report | Current chat path |
|---|---|
| Data comes from **stored procedures** | `sqlEngine.validateSQL` blocks `EXEC` — SELECT only |
| Needs **two periods** (this week + last week for WoW) | Runs exactly **one** query per prompt |
| Needs a **per-day series** (7 rows per KPI) + targets + compliance + machine rollups | LLM writes a single ad-hoc SELECT |
| Output must be reproducible & exact | LLM SQL is non-deterministic |

So we add a **separate builder** that mirrors the proven production-report
controllers (`src/controllers/report/production/*`): it calls the SPs in code,
computes everything deterministically, and emits the `report` JSON the frontend
already renders. The LLM is used **only** to write the narrative prose
(executive summary, findings, recommendations) from the computed numbers.

---

## 2. Layer summary

| Layer | Status | Work |
|---|---|---|
| **Frontend renderer + PDF export** | ✅ | Already supports every section type used by the PDF (see `StructuredReportRenderer.jsx`). Tiny tweaks only. |
| **Data — production KPIs** | ✅ | In SQL via 2 SPs (below). |
| **Data — spindle KPIs (ADT, Rogue, Worst, Slip, SEB%)** | 🟡 | User confirms "another SQL table/proc" — **exact name still to locate** (§4). |
| **Data — KPI targets** | ❌ | No targets table yet — must add (§5). |
| **Backend — weekly KPI builder** | ❌ | New module — the core work (§6). |
| **Backend — intent routing** | ❌ | Route "weekly kpi report" prompts to the builder (§7). |
| **Backend — narrative prompt** | 🟡 | Reuse/adapt `summarize.js` for KPI-trend prose (§6.4). |

---

## 3. Confirmed data sources (production KPIs)

Both run on the **client ERP DB** via `getPool(subdbname)` with params
`CompanyCode (int)`, `FromDate (datetime)`, `ToDate (datetime)` — the exact
pattern in `runReport()` (`src/controllers/report/cotton/_common.js:390`).

### `sp_Prodn_SpinningProdnDetails_GetAll`
(per machine / count / mixing)

| KGN KPI | Column |
|---|---|
| Production (Kg) | `Prodn` |
| GPS (40s) | `GmsSpl` |
| UTI % | `Utilisation` |
| Efficiency % | `ProdnEffi` |
| UKG / MPI | `MPI` |
| Waste Kg / % | `WasteKgs` / `WastePer` |
| Allotted / Worked spindles | `AllottedSpindle` / `WorkedSpindle` |
| Target prodn | `TargetProdn` |
| Run mins | `ActualWorkingMins` |
| Machine / count labels | `MachineName`, `MachineNo`, `MachineCode`, `MachineSortOrderNo`, `CountName`, `MixingName` |

### `sp_Prodn_Spinning_EndBreaks_OverAll`
(per machine)

| KGN KPI | Column |
|---|---|
| EBHSH | `TotalEBHSH` |
| End Mending Time (EMT) | `TotalEM` |
| Idle Spindles | `TotalIdel` |
| Total End Breaks / Brks-Spl | `TotalEB` |
| Waste % | `TotalWastePer` |
| Actual count | `ActualCount` |
| Machine labels | `MachineName`, `MachineNo`, `MachineCode` |

---

## 4. To locate — the spindle-monitoring KPIs

**ADT, Rogue Spindles, Worst Spindles, Slip Spindles, SEB%** are not in the two
procs above. They appear *nowhere* in the current backend code. Run this on the
client DB (e.g. `SwasERP_Krishna`) to find the table/proc:

```sql
-- candidate objects
SELECT name, type_desc FROM sys.objects
WHERE type IN ('P','V','U')
  AND (name LIKE '%Doff%'  OR name LIKE '%Spindle%' OR name LIKE '%Rogue%'
    OR name LIKE '%Worst%' OR name LIKE '%Slip%'    OR name LIKE '%SEB%'
    OR name LIKE '%StartUp%' OR name LIKE '%EndBreak%')
ORDER BY type_desc, name;

-- candidate columns
SELECT t.name AS ObjectName, c.name AS ColumnName
FROM sys.columns c
JOIN sys.objects t ON c.object_id = t.object_id
WHERE t.type IN ('U','V')
  AND (c.name LIKE '%Doff%' OR c.name LIKE '%Rogue%' OR c.name LIKE '%Worst%'
    OR c.name LIKE '%Slip%' OR c.name LIKE '%SEB%'  OR c.name LIKE '%StartUp%'
    OR c.name LIKE '%ADT%')
ORDER BY t.name, c.name;
```

> **Blocking until resolved.** If these live in a separate monitoring system and
> not in the ERP DB, that KPI's section is built with "data not available" and
> wired in once the feed exists. The rest of the report does not depend on it.

---

## 5. KPI targets (new)

Targets (≤3.50 ADT, ≤6.00 EBHSH, ≤3.00 EMT, ≥94% UTI, ≤2 idle, ≤10 rogue/worst,
≤10 slip, ≤3.00% SEB, ≤1.50% waste) drive the Status badges and the compliance
matrix. Add a small table in the **central AI_CHAT DB** (`Swas`):

```sql
CREATE TABLE tbl_chat_kpi_target (
  KpiKey       VARCHAR(40)  NOT NULL,   -- 'ADT','EBHSH','EMT','UTI','IDLE_SP', ...
  DisplayName  VARCHAR(80)  NOT NULL,   -- 'Average Doff Time (ADT)'
  Unit         VARCHAR(16)  NULL,       -- 'min','%','machines'
  TargetValue  DECIMAL(10,2) NOT NULL,
  Direction    CHAR(4)      NOT NULL,   -- 'LTE' (≤ is good) or 'GTE' (≥ is good)
  SortOrder    INT          NOT NULL DEFAULT 0,
  IsActive     BIT          NOT NULL DEFAULT 1
);
```

Optionally per-tenant later (add `SubDbName`); start global.

---

## 6. Backend — the builder (core work)

New folder: `src/services/aiChat/weeklyKpi/`

```
weeklyKpi/
  index.js          # buildWeeklyKpiReport(subdbname, companyCode, { weekOf }) -> report JSON
  fetch.js          # callSpinningSP() per-day, for current + previous week
  compute.js        # daily series, weekly avg, WoW delta, target status, machine violators
  targets.js        # load tbl_chat_kpi_target (cached)
  sections.js       # assemble the report JSON (the section objects in §6.3)
  narrative.js      # LLM call for exec summary / findings / recommendations only
```

### 6.1 Date handling
Reuse `dates.js` (weeks start **Sunday**). Build:
- `thisWeek` = current week's days (up to today),
- `lastWeek` = previous full week.

For the daily series, call each SP **once per day** across the range
(~14–28 quick SP calls). Deterministic and simple; cache the assembled report
per `(subdbname, companyCode, weekStart)` for a few minutes.

### 6.2 SP call (reuse the proven pattern)
```js
import sql from "mssql";
import { getPool } from "../../../config/dynamicDB.js";

async function runSP(subdbname, spName, { companyCode, fromDate, toDate }) {
  const pool = await getPool(subdbname);
  const r = pool.request();
  r.input("CompanyCode", sql.Int, parseInt(companyCode) || 0);
  r.input("FromDate", sql.DateTime, new Date(fromDate));
  r.input("ToDate",   sql.DateTime, new Date(toDate));
  return (await r.execute(spName)).recordset || [];
}
```

### 6.3 The `report` JSON contract (what the frontend already renders)

Top level (confirmed against `StructuredReportRenderer.jsx` + `sampleReport.js`):

```js
{
  title, subtitle,
  period:     { label, workingDays },
  comparison: { label, workingDays },          // shown via metaTable
  kpiSnapshot:[ { label, value, unit, sub } ],  // ≤ 8 cover tiles
  snapshotBanner: "…",
  metaTable: [ ["Report Period","…"], … ],
  sections: [ … ]                               // below
}
```

Section types and their exact shapes:

| PDF section | `type` | Shape |
|---|---|---|
| 1 Executive Summary | `narrative` | `{ id, title, type, body }` (markdown) |
| 2 Daily Production + WoW | `table_with_chart` | `{ table:{head,body,footerRow}, chart:{type:"bar",data:[{label,value}],title}, notes:[…] }` |
| 3–12 each KPI trend (UTI, ADT, EBHSH, EMT, Idle, Rogue, Worst, SEB%, Slip, Total EB) | `kpi_trend` | `{ target, achievement, table:{head,body}, chart:{type:"line",data:[{label,value}],title}, recommendation }` |
| 13 KPI Compliance Summary | `compliance` | `{ head, body }` — Status cells like `WITHIN TARGET`/`ABOVE TARGET`/`PASS`/`FAIL`/`IMPROVED`/`WORSE` auto-badge |
| 14 Machine-wise chronic violators | `compliance` or `table` | `{ head, body }` |
| 15 Key Findings | `findings` | `{ findings:[{ level:"CRITICAL"|"HIGH"|…, title, body }] }` |
| 16 Action Priority Matrix | `action_matrix` | `{ head:["#","Action Item","Responsible","Timeline","Priority"], body:[[…]] }` — the column matching `/priority/i` is badged |

Status badge vocabulary the renderer understands:
`CRITICAL, HIGH, MEDIUM, LOW, POSITIVE, ACHIEVEMENT, INFO, IMPROVED, WORSE,
PASS, PARTIAL, FAIL, WITHIN TARGET, ABOVE TARGET`.

WoW arrows are plain strings: `▲ 0.25` / `▼ 2.37` / `—` (see `wow()` in
`sampleReport.js`).

### 6.4 Narrative (LLM, prose only)
Feed the **computed** daily series + weekly averages + WoW deltas + compliance
to a prompt adapted from `summarize.js` and parse its markdown into the
`narrative` / `findings` / `action_matrix` sections (the parsers in
`report.js` — `parseBullets`, `pullSection` — already do this and can be reused).
The LLM never sees SQL and never invents numbers.

---

## 7. Triggering it from chat

In `aiChat.comtroller.js`, before the SQL path, detect a weekly-report intent:

```js
const WEEKLY_KPI_RE = /\b(weekly\s+kpi|kpi\s+report|production\s+kpi|kgn?\s+report|weekly\s+production\s+report)\b/i;
if (WEEKLY_KPI_RE.test(prompt)) {
  const report = await buildWeeklyKpiReport(subdbname, req.headers.companyCode, {/* weekOf */});
  // log to history, then respond with { success, type:"data", report, … }
  return res.json({ success:true, type:"data", report, summary: report.snapshotBanner, … });
}
```

Optionally also add a keyword row to `tbl_chat_intent_pattern` for a new
`PRODUCTION_KPI` domain, but the regex short-circuit is enough to start.

Response envelope stays identical to today's data response, so the frontend
renders it through the same `StructuredReportRenderer`.

---

## 8. Frontend (minimal)

Already done: cover + tiles, `narrative`, `table_with_chart` (charts via
`ModernChartCard`), `kpi_trend` (target/achievement/status/WoW/recommendation),
`compliance` (badges), `findings`, `action_matrix`, PDF export.

Possible small tweaks:
- `ReportCover` ignores `report.comparison` — add a line to show the comparison
  period (or keep it in `metaTable`, which already works).
- `action_matrix` renders any `head`/`body`, so the extra
  Responsible/Timeline columns work with no change.

---

## 9. Build sequence

1. **Locate spindle KPIs** (§4) — unblocks ADT/Rogue/Worst/Slip/SEB sections.
2. **Create `tbl_chat_kpi_target`** + seed targets (§5).
3. **`weeklyKpi/fetch.js` + `compute.js`** — get the two confirmed SPs producing
   correct daily series + weekly avg + WoW + compliance. Verify numbers against a
   known week before styling.
4. **`sections.js`** — assemble the report JSON; confirm it renders by returning
   it from a temporary debug route.
5. **`narrative.js`** — wire the LLM prose for sections 1/15/16.
6. **Intent routing** in the controller (§7).
7. **Add spindle-KPI sections** once §1 is resolved.
8. **History logging** — reuse `saveAiHistory`.
9. **Caching** + final QA against the reference PDF.

---

## 10. Open items / risks

- **Spindle KPI location (§4)** — the one true blocker for full parity.
- **Per-day SP cost** — ~14–28 SP calls per report; mitigate with a short cache.
- **`% M/cs Flagged`** in the PDF needs a per-machine-vs-target count each day —
  available from the machine-level SP rows; confirm the threshold definition with
  the mill.
- **Targets ownership** — confirm the target values + whether they differ per
  tenant/count.

---

## 11. Effort estimate

| Phase | Effort |
|---|---|
| Locate spindle data + targets table | 0.5 day |
| fetch + compute (2 confirmed SPs) | 1.5–2 days |
| sections + narrative + routing | 1.5 days |
| Spindle KPI sections (after §4) | 0.5–1 day |
| QA vs reference PDF | 0.5 day |
| **Total** | **~4.5–5.5 days** |
