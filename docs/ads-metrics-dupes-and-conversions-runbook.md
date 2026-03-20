# Google Ads: duplicate metrics & zero conversions (Sentinel mapping)

This runbook translates generic “campaign_performance + Prisma” advice into **how Sentinel actually works**, so you do not run the wrong SQL or hunt the wrong table.

## Issue 1 — Numbers look ~2× Google Ads

### What Sentinel uses (not Prisma)

- **Table:** `ads_daily_metrics` (Supabase / Postgres), not `campaign_performance`.
- **ORM:** Sentinel uses **Drizzle** for some schema and **Supabase client** for ads sync — there is **no** Prisma `CampaignPerformance` model to edit.
- **Sync:** `POST /api/ads/sync` → `src/lib/ads/sync.ts` → `upsertDailyMetrics` in `src/lib/ads/queries/daily-metrics.ts`.
- **API shape:** Daily rows are pulled at **campaign level** (`fetchDailyMetrics` in `src/lib/google-ads.ts`) with `ad_group_id` and `keyword_id` **NULL**.

### Why duplicates could still exist

1. **Historical rows** written before the **NULL-safe unique constraint** was applied. Postgres treats `NULL` as distinct in older `UNIQUE` definitions, so multiple “campaign-only” rows `(date, campaign_id, NULL, NULL)` could accumulate; upserts did not collapse them.
2. **Migration not applied** on your Supabase project: `supabase/migrations/20260314_fix_null_composite_constraints.sql` adds  
   `UNIQUE NULLS NOT DISTINCT (report_date, campaign_id, ad_group_id, keyword_id)` on `ads_daily_metrics`.
3. **Mixed granularity** in the table (legacy ad-group-level daily rows **plus** campaign-level rows). Summing **all** rows for a date range **double-counts** vs the Google Ads campaign report.

### Purge duplicate rows (Postgres / Supabase SQL editor)

**Inspect:**

```sql
SELECT
  report_date,
  campaign_id,
  ad_group_id,
  keyword_id,
  COUNT(*) AS n
FROM ads_daily_metrics
GROUP BY 1, 2, 3, 4
HAVING COUNT(*) > 1
ORDER BY n DESC, report_date DESC;
```

**Delete duplicates, keep one row per logical key** (uses `ctid`; safe when you have no FKs pointing at these rows — confirm in your project):

```sql
WITH ranked AS (
  SELECT
    ctid,
    ROW_NUMBER() OVER (
      PARTITION BY report_date, campaign_id, ad_group_id, keyword_id
      ORDER BY ctid
    ) AS rn
  FROM ads_daily_metrics
)
DELETE FROM ads_daily_metrics a
USING ranked r
WHERE a.ctid = r.ctid
  AND r.rn > 1;
```

**Backup first** (optional but recommended):

```sql
CREATE TABLE ads_daily_metrics_backup_20260319 AS
TABLE ads_daily_metrics;
```

### Permanent prevention (already in repo)

- Apply migration **`20260314_fix_null_composite_constraints.sql`** if it is not yet on production.
- Sync already uses **upsert** with  
  `onConflict: "report_date,campaign_id,ad_group_id,keyword_id"` — once the DB constraint matches, re-syncs should not re-inflate.

### UI / API note

- The Ads **dashboard** can restrict totals to **campaign-level** rows (`ad_group_id` and `keyword_id` IS NULL) so mixed legacy data does not inflate totals.
- Other readers (`/api/ads/cycle`, `/api/ads/review`, etc.) may still need the same rule or a one-time dedupe — **Claude Code** owns those API routes per `AI-COORDINATION.md`.

---

## Issue 2 — Zero conversions in Sentinel

Sentinel’s sync reads **conversions from the Google Ads API** (`metrics.conversions` in `fetchDailyMetrics`). If the **tag / GTM / thank-you flow** never fires in Google, the API returns **0** and Sentinel will correctly show **0**.

The chatbot’s Steps 1–5 (Goals → Conversions, Tag Assistant, Network tab, call extensions, action types) are still the right **operational** diagnosis. Fixes are on **dominionhomedeals.com** (or your landing host) and in **Google Ads**, not in Sentinel’s database.

**Sentinel’s role after you fix tracking:** run **Sync Google Ads** and confirm `ads_daily_metrics.conversions` and conversion-action sync stages move off zero.

---

## Priority (adjusted for Sentinel)

| When | Action |
|------|--------|
| Today | Run duplicate **detection** SQL on `ads_daily_metrics`; backup; run **delete** only if dupes exist. Confirm migration `20260314` applied on Supabase. |
| Today | Run conversion **diagnostics** on the live site + Google Ads (tag / GTM / form submit). |
| This week | If APIs still aggregate all granularities, have **Claude Code** align those queries with campaign-level filters or document a single source of truth for rollups. |

---

## Related code (for navigation)

- `src/lib/google-ads.ts` — `fetchDailyMetrics` (campaign-level GAQL).
- `src/lib/ads/queries/daily-metrics.ts` — Supabase upsert.
- `src/lib/ads/sync.ts` — Stage 5 daily metrics.
- `supabase/migrations/20260314_fix_null_composite_constraints.sql` — NULL-safe unique key.
