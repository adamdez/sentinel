# Sentinel Dead Code Audit — April 2, 2026

## Summary

**134 total API routes.** ~15 cron-triggered, ~105 frontend-called, ~13 admin/one-time.
**32 dead components** (never imported anywhere).
**8 dead lib files** (never imported anywhere).
**2 dead hooks** (never imported anywhere).
**45 single-use components** (imported exactly once — worth reviewing but not necessarily dead).

---

## Dead Components (Safe to Delete)

These are never imported by any file in the codebase:

### `src/components/sentinel/bricked/` — FALSE POSITIVE
All bricked components are transitively imported via `bricked-analysis-panel.tsx` → `master-client-file-modal.tsx` (11 imports). **Do not delete.**

### `src/components/sentinel/client-file-v2/` (entire folder dead)
- `client-file-overlay` — dead (v2 attempt, superseded)
- `header` — dead
- `tabs/calculator-tab` — dead
- `tabs/comps-tab` — dead
- `tabs/contact-tab` — dead

### `src/components/sentinel/master-client-file/` — FALSE POSITIVE
Components are transitively imported via `contact-tab.tsx` → `master-client-file-parts.tsx` → `master-client-file-modal.tsx` (11 imports). **Do not delete.**

### Other dead components
- `dialer-widget` — dead
- `kpi-summary-row` — dead
- `master-client-file-parts` — dead
- `negative-intelligence-block` — dead
- `pipeline-board` — dead
- `psalm20/empty-state` — dead
- `score-breakdown-modal` — dead
- `warm-transfer-card` — dead

---

## Dead Lib Files (Safe to Delete)

- `src/lib/audit.ts` — never imported
- `src/lib/coach-content.ts` — never imported
- `src/lib/feature-flags.ts` — never imported
- `src/lib/get-twilio-number.ts` — never imported
- `src/lib/predictive-skiptrace.ts` — never imported
- `src/lib/rbac.ts` — never imported
- `src/lib/supabase-realtime.ts` — never imported
- `src/lib/supabase-types.ts` — never imported

---

## Dead Hooks (Safe to Delete)

- `src/hooks/use-morning-queue.ts` — never imported
- `src/hooks/use-optimistic.ts` — never imported

---

## API Routes Needing Production Verification

These routes exist but may never be called. Check Vercel logs for hits in last 30 days:

### Likely Dead (one-time admin scripts that already ran)
- `/api/ingest/cleanup-fsbo` — one-time FSBO purge
- `/api/ingest/csv-backfill` — one-time CSV backfill
- `/api/admin/reset-obit-attempts` — one-time reset
- `/api/admin/backfill-photos` — one-time photo extraction
- `/api/admin/clean-slate` — destructive admin tool
- `/api/admin/mass-seed` — one-time mass ingest

### Possibly Dead (built but may not be wired to UI)
- `/api/grok/*` (4 routes) — Grok AI assistant, unclear if UI uses it
- `/api/upgrade-request` — feature request submission
- `/api/inbound/queue` — separate from dialer v1 queue?
- `/api/scoring/retrain` — manual retrain trigger
- `/api/scoring/replay` — manual replay trigger
- `/api/enrichment/flush` — nuclear reset, should rarely be used
- `/api/enrichment/purge` — garbage cleanup

### Routes With Data Quality Concerns
- `/api/ingest/csv-upload` — 5-min timeout, can't finish 300 rows
- `/api/imports/commit` — same timeout issue for large imports
- `calls_log` entries stuck at `disposition: "in_progress"` — no cleanup handler

---

## Data Rot Issues

1. **calls_log in_progress forever**: Inbound calls create entries with `disposition: "in_progress"` in the `after()` hook. If the call chain completes (answered or missed), the disposition is never updated on the calls_log row — only dialer_events get written. These rows accumulate.

2. **call_sessions stuck at "ringing"**: Same pattern — created during initial TwiML, never resolved to final status.

3. **voice_sessions stuck at "failed"**: 5 rows from March 26 testing, never cleaned up.

4. **intake_leads stale state**: Realtime subscription may miss direct SQL updates (as seen with the badge bug today).

---

## Cleanup Priority Order

1. **Delete dead components** (32 files) — zero risk, immediate cognitive load reduction
2. **Delete dead lib/hooks** (10 files) — zero risk
3. **Add disposition cleanup** for calls_log and call_sessions — prevents data rot
4. **Verify API routes against Vercel logs** — identify truly dead routes
5. **Delete dead routes** — reduce attack surface and maintenance burden
6. **Review single-use components** — consolidate where it makes sense
