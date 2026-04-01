# Deep Research Pipeline — Design Doc

**Date:** 2026-04-01
**Owner:** Claude Code (backend/intelligence)
**Status:** Approved

---

## Problem

When a lead enters Sentinel with a distress signal (probate, divorce, foreclosure, tax lien, bankruptcy), the system knows the signal type but not the details Logan needs before calling: who is the decision maker, what stage is the legal process in, are there heirs/executors to contact, what happened and when.

Currently this research is manual or doesn't happen. The county-refresh cron scraped assessor pages but wrote to intelligence tables that never surfaced in the client file. PropertyRadar provides only boolean flags (e.g., `isDeceasedProperty`) with no case details, heir names, or filing dates.

## Solution

An automated deep research pipeline that fires immediately when any lead appears in the queue, searches public records and the web for distress-specific intelligence, and auto-promotes findings directly to the client file — no operator click required.

---

## Trigger

Any lead creation path fires a non-blocking POST to `/api/intelligence/deep-research`:
- Manual lead creation
- CSV import
- PPL ingest
- PropertyRadar webhook
- Any other ingest route

The trigger fires after the lead row exists with tags populated. Research runs asynchronously — the creating request returns immediately.

## Search Strategies Per Distress Type

### Probate
1. Web search: `"[owner_name] obituary [city] [state]"` — death date, surviving family
2. Web search: `"[owner_name] probate [county] Superior Court"` — case number, executor
3. Scrape: Spokane County Superior Court case search (if Spokane)
4. Scrape: Kootenai County District Court records (if Kootenai)
5. **Extract:** heir names, executor name, case number, case status, filing date, attorney

### Divorce
1. Web search: `"[owner_name] divorce [county] [state]"` — case details
2. Court portal scrape for dissolution records
3. **Extract:** parties, property division status, who retains property

### Foreclosure
1. Web search: `"[address] foreclosure auction [county]"` — auction dates, trustee
2. Web search: `"[owner_name] notice of default [county]"` — lien amounts, timeline
3. **Extract:** auction date, lien amount, default amount, trustee, redemption deadline

### Tax Lien
1. County treasurer portal scrape for delinquent amounts
2. Web search: `"[address] tax sale [county] [year]"` — upcoming tax sale
3. **Extract:** delinquent amount, years delinquent, redemption deadline

### Bankruptcy
1. Web search: `"[owner_name] bankruptcy [state]"` — case filing
2. **Extract:** chapter, filing date, discharge status, trustee

### Generic (no specific distress tag)
1. Web search: `"[owner_name] [address] [county]"` — any public record mentions
2. **Extract:** anything relevant to property situation

## Claude Analysis & Dossier Compilation

After artifacts and facts are collected, Claude analyzes all findings with a structured prompt to determine:

1. **Decision maker** — name, relationship, and reasoning
2. **Legal status** — one sentence: case stage, key dates, deadlines
3. **Recommended call angle** — what to lead with, what to avoid
4. **Top 3 facts** — what Logan needs before calling

Output maps to existing client file fields:
- `likely_decision_maker` — "Jane Smith (daughter, personal representative)"
- `seller_situation_summary_short` — "Probate filed 2/15/2026, case #26-4-01234-32. Estate in administration."
- `recommended_call_angle` — "Express condolences, ask about family plans for property."
- `top_fact_1/2/3` — key facts from research
- `decision_maker_confidence` — based on source count and agreement

## Auto-Promote (No Review Gate)

The pipeline bypasses the manual review gate. After dossier compilation:
1. Dossier status set directly to `reviewed`
2. `syncDossierToLead()` writes to client file fields
3. Dossier status set to `promoted`

Contradictions still create explicit records in `fact_assertions` — they don't block promotion but are visible in the dossier detail view.

## Resilience

- **Cleanup cron** (`/api/cron/research-retry`): runs every 30 min, finds `research_runs` stuck as `running` for >10 min, retries them
- **Idempotency**: research checks for existing `research_runs` for the lead before starting a new one
- **Rate limiting**: respects Firecrawl 20 req/min limit with delays between searches
- **Timeout handling**: if Vercel function hits 300s limit, the run stays as `running` and cleanup cron retries
- **Graceful degradation**: if Firecrawl is down or court portal is unreachable, partial results still compile (dossier notes what couldn't be found)

## Files

### New
| File | Purpose |
|------|---------|
| `src/app/api/intelligence/deep-research/route.ts` | Main research endpoint (trigger) |
| `src/lib/research-strategies.ts` | Search strategy definitions per distress type |
| `src/lib/research-executor.ts` | Orchestrates Firecrawl searches + Claude analysis + dossier compile + auto-promote |
| `src/app/api/cron/research-retry/route.ts` | Cleanup cron for stuck/failed runs |

### Modified
| File | Change |
|------|--------|
| `src/providers/firecrawl/adapter.ts` | Add `webSearch(query, limit)` and `scrapeWithSchema(url, schema)` methods |
| `src/app/api/ingest/route.ts` | Fire-and-forget call to deep-research after lead creation |
| `src/app/api/ingest/propertyradar/route.ts` | Same trigger |
| `src/lib/intelligence.ts` | Add `autoPromoteDossier(dossierId)` that skips review gate |
| `vercel.json` | Add research-retry cron entry |

### Existing (reused as-is)
| File | What's reused |
|------|---------------|
| `src/lib/intelligence.ts` | `createArtifact`, `createFact`, `compileDossier`, `syncDossierToLead`, `startResearchRun`, `closeResearchRun` |
| `src/lib/cron-run-tracker.ts` | `withCronTracking` for the retry cron |
| `src/providers/firecrawl/adapter.ts` | Existing Firecrawl client initialization |

## Verification

1. Create a test probate lead manually → verify research fires, artifacts created, dossier compiled, client file fields populated
2. Import a CSV with mixed distress types → verify each gets appropriate search strategy
3. Kill a research run mid-flight → verify cleanup cron retries it within 30 min
4. Check Firecrawl usage doesn't exceed rate limits under concurrent lead creation
5. Verify client file shows: decision maker, situation summary, call angle, top facts

## Not In Scope

- New database tables or schema changes (facts and dossiers handle all storage)
- UI changes (client file already displays the promoted fields)
- PACER integration (federal bankruptcy records — future if needed)
- Recurring re-research (this is a one-time-per-lead pipeline; re-research is a future feature)
