# Ads Command Center Upgrade — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the Ads Command Center so Key Intel persists server-side, the Opus + GPT-5.4 Pro team auto-generates recommendations into Approvals on a daily/weekly cron, the Chat AI has full account context and can create recommendations, the sync pulls all available Google Ads data, and approved recommendations can execute real mutations.

**Architecture:** Expand the 5-stage sync to ~8 stages covering negative keywords, budgets, quality scores, conversion actions, device metrics, and geo metrics. Add `ads_intelligence_briefings` table for server-side intel persistence. New `intel-to-recommendations.ts` module converts actionable intel data points into validated `ads_recommendations`. Upgrade cron to use Opus + GPT-5.4 Pro dual-model gate. Chat system prompt gets full context injection. Approvals get an Execute button that calls existing mutation functions.

**Tech Stack:** Next.js API routes, Supabase (Postgres), Google Ads API v23 (GAQL), Claude Opus 4.6, GPT-5.4 Pro, Vercel cron

---

### Task 1: Database Migration — New Tables and Columns

**Files:**
- Create: `supabase/migrations/20260316_ads_command_center_upgrade.sql`

**Step 1: Write the migration**

```sql
-- ============================================================
-- Ads Command Center Upgrade Migration
-- New tables: ads_negative_keywords, ads_campaign_budgets,
--   ads_conversion_actions, ads_device_metrics, ads_geo_metrics,
--   ads_intelligence_briefings, ads_alerts
-- New columns on ads_keywords, ads_recommendations
-- ============================================================

-- 1. ads_negative_keywords
CREATE TABLE IF NOT EXISTS ads_negative_keywords (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER REFERENCES ads_campaigns(id) ON DELETE CASCADE,
  ad_group_id INTEGER REFERENCES ads_ad_groups(id) ON DELETE CASCADE,
  google_criterion_id TEXT NOT NULL,
  keyword_text TEXT NOT NULL,
  match_type TEXT NOT NULL DEFAULT 'BROAD',
  level TEXT NOT NULL CHECK (level IN ('campaign', 'ad_group')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (google_criterion_id)
);

CREATE INDEX idx_ads_neg_kw_campaign ON ads_negative_keywords(campaign_id);
CREATE INDEX idx_ads_neg_kw_ad_group ON ads_negative_keywords(ad_group_id);

-- 2. ads_campaign_budgets
CREATE TABLE IF NOT EXISTS ads_campaign_budgets (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES ads_campaigns(id) ON DELETE CASCADE,
  google_budget_id TEXT NOT NULL,
  daily_budget_micros BIGINT NOT NULL DEFAULT 0,
  delivery_method TEXT DEFAULT 'STANDARD',
  is_shared BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (google_budget_id)
);

CREATE INDEX idx_ads_budgets_campaign ON ads_campaign_budgets(campaign_id);

-- 3. ads_conversion_actions
CREATE TABLE IF NOT EXISTS ads_conversion_actions (
  id SERIAL PRIMARY KEY,
  google_conversion_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT,
  status TEXT,
  counting_type TEXT,
  category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. ads_device_metrics
CREATE TABLE IF NOT EXISTS ads_device_metrics (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER REFERENCES ads_campaigns(id) ON DELETE CASCADE,
  device TEXT NOT NULL,
  report_date DATE NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  cost_micros BIGINT NOT NULL DEFAULT 0,
  conversions NUMERIC(12,2) NOT NULL DEFAULT 0,
  UNIQUE (campaign_id, device, report_date)
);

CREATE INDEX idx_ads_device_metrics_date ON ads_device_metrics(report_date);

-- 5. ads_geo_metrics
CREATE TABLE IF NOT EXISTS ads_geo_metrics (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER REFERENCES ads_campaigns(id) ON DELETE CASCADE,
  geo_name TEXT NOT NULL,
  geo_type TEXT NOT NULL DEFAULT 'city',
  report_date DATE NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  cost_micros BIGINT NOT NULL DEFAULT 0,
  conversions NUMERIC(12,2) NOT NULL DEFAULT 0,
  UNIQUE (campaign_id, geo_name, report_date)
);

CREATE INDEX idx_ads_geo_metrics_date ON ads_geo_metrics(report_date);

-- 6. ads_intelligence_briefings
CREATE TABLE IF NOT EXISTS ads_intelligence_briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_date DATE NOT NULL,
  account_status TEXT NOT NULL DEFAULT 'unknown',
  executive_summary TEXT,
  total_estimated_monthly_waste NUMERIC(12,2) DEFAULT 0,
  total_estimated_monthly_opportunity NUMERIC(12,2) DEFAULT 0,
  data_points JSONB DEFAULT '[]'::JSONB,
  adversarial_result JSONB,
  trigger TEXT NOT NULL CHECK (trigger IN ('manual', 'daily_cron', 'weekly_cron')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ads_intel_briefings_date ON ads_intelligence_briefings(created_at DESC);

-- 7. ads_alerts
CREATE TABLE IF NOT EXISTS ads_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_id UUID REFERENCES ads_intelligence_briefings(id) ON DELETE CASCADE,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ads_alerts_unread ON ads_alerts(read) WHERE read = FALSE;

-- 8. New columns on ads_keywords for quality score components
ALTER TABLE ads_keywords
  ADD COLUMN IF NOT EXISTS quality_score INTEGER,
  ADD COLUMN IF NOT EXISTS expected_ctr TEXT,
  ADD COLUMN IF NOT EXISTS ad_relevance TEXT,
  ADD COLUMN IF NOT EXISTS landing_page_experience TEXT;

-- 9. New column on ads_recommendations for source briefing link
ALTER TABLE ads_recommendations
  ADD COLUMN IF NOT EXISTS source_briefing_id UUID REFERENCES ads_intelligence_briefings(id);

-- 10. Add 'executed' to recommendation status if using enum
-- (If ads_recommendation_status is an enum, add the value; if text, this is a no-op)
DO $$
BEGIN
  ALTER TYPE ads_recommendation_status ADD VALUE IF NOT EXISTS 'executed';
EXCEPTION
  WHEN undefined_object THEN
    -- status is text, not enum — no action needed
    NULL;
END $$;
```

**Step 2: Apply the migration**

Run: `npx supabase db push` or apply via Supabase dashboard.
Expected: All tables created, columns added, indexes built.

**Step 3: Commit**

```bash
git add supabase/migrations/20260316_ads_command_center_upgrade.sql
git commit -m "feat(ads): add migration for command center upgrade — new tables and columns"
```

---

### Task 2: Expanded Google Ads Fetch Functions

**Files:**
- Modify: `src/lib/google-ads.ts` (add 6 new fetch functions after line 531)

**Step 1: Add new type interfaces**

Add after `DailyMetricRow` interface (line 107):

```typescript
export interface NegativeKeywordData {
  criterionId: string;
  keywordText: string;
  matchType: string;
  level: "campaign" | "ad_group";
  campaignId: string;
  adGroupId: string | null;
}

export interface CampaignBudgetData {
  budgetId: string;
  campaignId: string;
  dailyBudgetMicros: number;
  deliveryMethod: string;
  isShared: boolean;
}

export interface ConversionActionData {
  conversionId: string;
  name: string;
  type: string;
  status: string;
  countingType: string;
  category: string;
}

export interface DeviceMetricRow {
  date: string;
  campaignId: string;
  device: string;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
}

export interface GeoMetricRow {
  date: string;
  campaignId: string;
  geoName: string;
  geoType: string;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
}

export interface QualityScoreData {
  criterionId: string;
  adGroupId: string;
  qualityScore: number | null;
  expectedCtr: string;
  adRelevance: string;
  landingPageExperience: string;
}
```

**Step 2: Add fetchNegativeKeywords function**

Add after `fetchDailyMetrics` function (after line 531):

```typescript
// ── Negative Keywords ────────────────────────────────────────────────

export async function fetchNegativeKeywords(
  config: GoogleAdsConfig,
): Promise<NegativeKeywordData[]> {
  // Campaign-level negatives
  const campaignQuery = `
    SELECT
      campaign_criterion.criterion_id,
      campaign_criterion.keyword.text,
      campaign_criterion.keyword.match_type,
      campaign.id
    FROM campaign_criterion
    WHERE campaign_criterion.type = 'KEYWORD'
      AND campaign_criterion.negative = TRUE
      AND campaign.status != 'REMOVED'
  `;

  // Ad-group-level negatives
  const adGroupQuery = `
    SELECT
      ad_group_criterion.criterion_id,
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group.id,
      campaign.id
    FROM ad_group_criterion
    WHERE ad_group_criterion.type = 'KEYWORD'
      AND ad_group_criterion.negative = TRUE
      AND campaign.status != 'REMOVED'
  `;

  const [campaignRows, adGroupRows] = await Promise.all([
    gaqlQuery(config, campaignQuery),
    gaqlQuery(config, adGroupQuery),
  ]);

  const results: NegativeKeywordData[] = [];

  for (const row of campaignRows) {
    const r = row as Record<string, Record<string, unknown>>;
    const criterion = r.campaignCriterion ?? r.campaign_criterion ?? {};
    const kw = (criterion as Record<string, unknown>).keyword as Record<string, unknown> | undefined;
    results.push({
      criterionId: String((criterion as Record<string, unknown>).criterionId ?? (criterion as Record<string, unknown>).criterion_id ?? ""),
      keywordText: String(kw?.text ?? ""),
      matchType: String(kw?.matchType ?? kw?.match_type ?? "BROAD"),
      level: "campaign",
      campaignId: String(r.campaign?.id ?? ""),
      adGroupId: null,
    });
  }

  for (const row of adGroupRows) {
    const r = row as Record<string, Record<string, unknown>>;
    const criterion = r.adGroupCriterion ?? r.ad_group_criterion ?? {};
    const kw = (criterion as Record<string, unknown>).keyword as Record<string, unknown> | undefined;
    results.push({
      criterionId: String((criterion as Record<string, unknown>).criterionId ?? (criterion as Record<string, unknown>).criterion_id ?? ""),
      keywordText: String(kw?.text ?? ""),
      matchType: String(kw?.matchType ?? kw?.match_type ?? "BROAD"),
      level: "ad_group",
      campaignId: String(r.campaign?.id ?? ""),
      adGroupId: String(r.adGroup?.id ?? r.ad_group?.id ?? ""),
    });
  }

  return results;
}
```

**Step 3: Add fetchCampaignBudgets function**

```typescript
// ── Campaign Budgets ─────────────────────────────────────────────────

export async function fetchCampaignBudgets(
  config: GoogleAdsConfig,
): Promise<CampaignBudgetData[]> {
  const query = `
    SELECT
      campaign_budget.id,
      campaign_budget.amount_micros,
      campaign_budget.delivery_method,
      campaign_budget.explicitly_shared,
      campaign.id
    FROM campaign_budget
    WHERE campaign.status != 'REMOVED'
  `;

  const rows = await gaqlQuery(config, query);

  return rows.map((row: unknown) => {
    const r = row as Record<string, Record<string, unknown>>;
    const budget = r.campaignBudget ?? r.campaign_budget ?? {};
    return {
      budgetId: String((budget as Record<string, unknown>).id ?? ""),
      campaignId: String(r.campaign?.id ?? ""),
      dailyBudgetMicros: Number((budget as Record<string, unknown>).amountMicros ?? (budget as Record<string, unknown>).amount_micros ?? 0),
      deliveryMethod: String((budget as Record<string, unknown>).deliveryMethod ?? (budget as Record<string, unknown>).delivery_method ?? "STANDARD"),
      isShared: Boolean((budget as Record<string, unknown>).explicitlyShared ?? (budget as Record<string, unknown>).explicitly_shared ?? false),
    };
  });
}
```

**Step 4: Add fetchConversionActions function**

```typescript
// ── Conversion Actions ───────────────────────────────────────────────

export async function fetchConversionActions(
  config: GoogleAdsConfig,
): Promise<ConversionActionData[]> {
  const query = `
    SELECT
      conversion_action.id,
      conversion_action.name,
      conversion_action.type,
      conversion_action.status,
      conversion_action.counting_type,
      conversion_action.category
    FROM conversion_action
  `;

  const rows = await gaqlQuery(config, query);

  return rows.map((row: unknown) => {
    const r = row as Record<string, Record<string, unknown>>;
    const ca = r.conversionAction ?? r.conversion_action ?? {};
    return {
      conversionId: String((ca as Record<string, unknown>).id ?? ""),
      name: String((ca as Record<string, unknown>).name ?? ""),
      type: String((ca as Record<string, unknown>).type ?? ""),
      status: String((ca as Record<string, unknown>).status ?? ""),
      countingType: String((ca as Record<string, unknown>).countingType ?? (ca as Record<string, unknown>).counting_type ?? ""),
      category: String((ca as Record<string, unknown>).category ?? ""),
    };
  });
}
```

**Step 5: Add fetchDevicePerformance function**

```typescript
// ── Device Performance ───────────────────────────────────────────────

export async function fetchDevicePerformance(
  config: GoogleAdsConfig,
  startDate: string,
  endDate: string,
): Promise<DeviceMetricRow[]> {
  const query = `
    SELECT
      segments.date,
      segments.device,
      campaign.id,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM campaign
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      AND campaign.status != 'REMOVED'
    ORDER BY segments.date DESC
  `;

  const rows = await gaqlQuery(config, query);

  return rows.map((row: unknown) => {
    const r = row as Record<string, Record<string, unknown>>;
    const segments = r.segments as Record<string, unknown> | undefined;
    return {
      date: String(segments?.date ?? ""),
      campaignId: String(r.campaign?.id ?? ""),
      device: String(segments?.device ?? "UNKNOWN"),
      impressions: Number(r.metrics?.impressions ?? 0),
      clicks: Number(r.metrics?.clicks ?? 0),
      costMicros: Number(r.metrics?.cost_micros ?? r.metrics?.costMicros ?? 0),
      conversions: Number(r.metrics?.conversions ?? 0),
    };
  });
}
```

**Step 6: Add fetchGeoPerformance function**

```typescript
// ── Geographic Performance ───────────────────────────────────────────

export async function fetchGeoPerformance(
  config: GoogleAdsConfig,
  startDate: string,
  endDate: string,
): Promise<GeoMetricRow[]> {
  const query = `
    SELECT
      segments.date,
      geographic_view.country_criterion_id,
      geographic_view.location_type,
      campaign.id,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM geographic_view
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
    LIMIT 500
  `;

  const rows = await gaqlQuery(config, query);

  return rows.map((row: unknown) => {
    const r = row as Record<string, Record<string, unknown>>;
    const segments = r.segments as Record<string, unknown> | undefined;
    const gv = r.geographicView ?? r.geographic_view ?? {};
    return {
      date: String(segments?.date ?? ""),
      campaignId: String(r.campaign?.id ?? ""),
      geoName: String((gv as Record<string, unknown>).countryCriterionId ?? (gv as Record<string, unknown>).country_criterion_id ?? "unknown"),
      geoType: String((gv as Record<string, unknown>).locationType ?? (gv as Record<string, unknown>).location_type ?? "city"),
      impressions: Number(r.metrics?.impressions ?? 0),
      clicks: Number(r.metrics?.clicks ?? 0),
      costMicros: Number(r.metrics?.cost_micros ?? r.metrics?.costMicros ?? 0),
      conversions: Number(r.metrics?.conversions ?? 0),
    };
  });
}
```

**Step 7: Add fetchQualityScores function**

```typescript
// ── Quality Scores ───────────────────────────────────────────────────

export async function fetchQualityScores(
  config: GoogleAdsConfig,
): Promise<QualityScoreData[]> {
  const query = `
    SELECT
      ad_group_criterion.criterion_id,
      ad_group_criterion.quality_info.quality_score,
      ad_group_criterion.quality_info.creative_quality_score,
      ad_group_criterion.quality_info.post_click_quality_score,
      ad_group_criterion.quality_info.search_predicted_ctr,
      ad_group.id
    FROM ad_group_criterion
    WHERE ad_group_criterion.type = 'KEYWORD'
      AND ad_group_criterion.status != 'REMOVED'
      AND campaign.status != 'REMOVED'
  `;

  const rows = await gaqlQuery(config, query);

  return rows.map((row: unknown) => {
    const r = row as Record<string, Record<string, unknown>>;
    const criterion = r.adGroupCriterion ?? r.ad_group_criterion ?? {};
    const qi = (criterion as Record<string, unknown>).qualityInfo ?? (criterion as Record<string, unknown>).quality_info ?? {};
    return {
      criterionId: String((criterion as Record<string, unknown>).criterionId ?? (criterion as Record<string, unknown>).criterion_id ?? ""),
      adGroupId: String(r.adGroup?.id ?? r.ad_group?.id ?? ""),
      qualityScore: (qi as Record<string, unknown>).qualityScore != null ? Number((qi as Record<string, unknown>).qualityScore ?? (qi as Record<string, unknown>).quality_score) : null,
      expectedCtr: String((qi as Record<string, unknown>).searchPredictedCtr ?? (qi as Record<string, unknown>).search_predicted_ctr ?? "UNSPECIFIED"),
      adRelevance: String((qi as Record<string, unknown>).creativeQualityScore ?? (qi as Record<string, unknown>).creative_quality_score ?? "UNSPECIFIED"),
      landingPageExperience: String((qi as Record<string, unknown>).postClickQualityScore ?? (qi as Record<string, unknown>).post_click_quality_score ?? "UNSPECIFIED"),
    };
  });
}
```

**Step 8: Add addNegativeKeyword mutation**

Add after the existing `updateCampaignBudget` function:

```typescript
export async function addNegativeKeyword(
  config: GoogleAdsConfig,
  campaignId: string,
  keywordText: string,
  matchType: "BROAD" | "PHRASE" | "EXACT" = "EXACT",
): Promise<unknown> {
  return mutate(config, [{
    campaignCriterionOperation: {
      create: {
        campaign: `customers/${config.customerId}/campaigns/${campaignId}`,
        negative: true,
        keyword: {
          text: keywordText,
          matchType,
        },
      },
    },
  }]);
}
```

**Step 9: Commit**

```bash
git add src/lib/google-ads.ts
git commit -m "feat(ads): add fetch functions for negative KWs, budgets, quality scores, conversions, device/geo metrics, and addNegativeKeyword mutation"
```

---

### Task 3: Expanded Sync Orchestration + Query Modules

**Files:**
- Create: `src/lib/ads/queries/negative-keywords.ts`
- Create: `src/lib/ads/queries/budgets.ts`
- Create: `src/lib/ads/queries/conversion-actions.ts`
- Create: `src/lib/ads/queries/device-metrics.ts`
- Create: `src/lib/ads/queries/geo-metrics.ts`
- Modify: `src/lib/ads/sync.ts` (add new stages 6-8, update imports and SyncResult)

**Step 1: Create negative-keywords query module**

File: `src/lib/ads/queries/negative-keywords.ts`

```typescript
import { SupabaseClient } from "@supabase/supabase-js";

export async function upsertNegativeKeyword(
  supabase: SupabaseClient,
  data: {
    google_criterion_id: string;
    campaign_id: number | null;
    ad_group_id: number | null;
    keyword_text: string;
    match_type: string;
    level: "campaign" | "ad_group";
  },
): Promise<number> {
  const { data: row, error } = await supabase
    .from("ads_negative_keywords")
    .upsert(
      { ...data, updated_at: new Date().toISOString() },
      { onConflict: "google_criterion_id" },
    )
    .select("id")
    .single();
  if (error) throw new Error(`upsertNegativeKeyword failed: ${error.message}`);
  return row.id;
}
```

**Step 2: Create budgets query module**

File: `src/lib/ads/queries/budgets.ts`

```typescript
import { SupabaseClient } from "@supabase/supabase-js";

export async function upsertCampaignBudget(
  supabase: SupabaseClient,
  data: {
    google_budget_id: string;
    campaign_id: number;
    daily_budget_micros: number;
    delivery_method: string;
    is_shared: boolean;
  },
): Promise<number> {
  const { data: row, error } = await supabase
    .from("ads_campaign_budgets")
    .upsert(
      { ...data, updated_at: new Date().toISOString() },
      { onConflict: "google_budget_id" },
    )
    .select("id")
    .single();
  if (error) throw new Error(`upsertCampaignBudget failed: ${error.message}`);
  return row.id;
}
```

**Step 3: Create conversion-actions query module**

File: `src/lib/ads/queries/conversion-actions.ts`

```typescript
import { SupabaseClient } from "@supabase/supabase-js";

export async function upsertConversionAction(
  supabase: SupabaseClient,
  data: {
    google_conversion_id: string;
    name: string;
    type: string;
    status: string;
    counting_type: string;
    category: string;
  },
): Promise<number> {
  const { data: row, error } = await supabase
    .from("ads_conversion_actions")
    .upsert(
      { ...data, updated_at: new Date().toISOString() },
      { onConflict: "google_conversion_id" },
    )
    .select("id")
    .single();
  if (error) throw new Error(`upsertConversionAction failed: ${error.message}`);
  return row.id;
}
```

**Step 4: Create device-metrics query module**

File: `src/lib/ads/queries/device-metrics.ts`

```typescript
import { SupabaseClient } from "@supabase/supabase-js";

export async function upsertDeviceMetrics(
  supabase: SupabaseClient,
  data: {
    campaign_id: number | null;
    device: string;
    report_date: string;
    impressions: number;
    clicks: number;
    cost_micros: number;
    conversions: number;
  },
): Promise<void> {
  const { error } = await supabase
    .from("ads_device_metrics")
    .upsert(data, { onConflict: "campaign_id,device,report_date" });
  if (error) throw new Error(`upsertDeviceMetrics failed: ${error.message}`);
}
```

**Step 5: Create geo-metrics query module**

File: `src/lib/ads/queries/geo-metrics.ts`

```typescript
import { SupabaseClient } from "@supabase/supabase-js";

export async function upsertGeoMetrics(
  supabase: SupabaseClient,
  data: {
    campaign_id: number | null;
    geo_name: string;
    geo_type: string;
    report_date: string;
    impressions: number;
    clicks: number;
    cost_micros: number;
    conversions: number;
  },
): Promise<void> {
  const { error } = await supabase
    .from("ads_geo_metrics")
    .upsert(data, { onConflict: "campaign_id,geo_name,report_date" });
  if (error) throw new Error(`upsertGeoMetrics failed: ${error.message}`);
}
```

**Step 6: Update sync.ts — add imports and new stages**

Update imports at top of `src/lib/ads/sync.ts` to add:

```typescript
import {
  fetchNegativeKeywords,
  fetchCampaignBudgets,
  fetchConversionActions,
  fetchDevicePerformance,
  fetchGeoPerformance,
  fetchQualityScores,
} from "@/lib/google-ads";
import { upsertNegativeKeyword } from "./queries/negative-keywords";
import { upsertCampaignBudget } from "./queries/budgets";
import { upsertConversionAction } from "./queries/conversion-actions";
import { upsertDeviceMetrics } from "./queries/device-metrics";
import { upsertGeoMetrics } from "./queries/geo-metrics";
```

Update `SyncResult` interface to add:

```typescript
  negativeKeywords: number;
  campaignBudgets: number;
  conversionActions: number;
  deviceMetrics: number;
  geoMetrics: number;
  qualityScoreUpdates: number;
```

Add new stages after Stage 5 (daily metrics), before the `Done` section (~line 272). Each stage is wrapped in a try/catch with non-fatal error handling matching the existing Stage 3b/3c pattern:

```typescript
    // ── Stage 6: Negative Keywords ──────────────────────────────────
    try {
      const negativeKws = await fetchNegativeKeywords(config);
      for (const nk of negativeKws) {
        const internalCampaignId = campaignIdMap.get(nk.campaignId) ?? null;
        const internalAdGroupId = nk.adGroupId ? (adGroupIdMap.get(nk.adGroupId) ?? null) : null;
        await upsertNegativeKeyword(supabase, {
          google_criterion_id: nk.criterionId,
          campaign_id: internalCampaignId,
          ad_group_id: internalAdGroupId,
          keyword_text: nk.keywordText,
          match_type: nk.matchType,
          level: nk.level,
        });
        result.negativeKeywords++;
      }
      console.log(`[Ads/Sync] Stage 6: ${result.negativeKeywords} negative keywords`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Ads/Sync] Stage 6 negative keywords failed (non-fatal):", err);
      result.stageErrors.push(`Stage 6 (negative keywords): ${msg}`);
    }

    // ── Stage 7: Campaign Budgets + Conversion Actions ──────────────
    try {
      const budgets = await fetchCampaignBudgets(config);
      for (const b of budgets) {
        const internalCampaignId = campaignIdMap.get(b.campaignId);
        if (internalCampaignId === undefined) continue;
        await upsertCampaignBudget(supabase, {
          google_budget_id: b.budgetId,
          campaign_id: internalCampaignId,
          daily_budget_micros: b.dailyBudgetMicros,
          delivery_method: b.deliveryMethod,
          is_shared: b.isShared,
        });
        result.campaignBudgets++;
      }
      console.log(`[Ads/Sync] Stage 7a: ${result.campaignBudgets} campaign budgets`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Ads/Sync] Stage 7a campaign budgets failed (non-fatal):", err);
      result.stageErrors.push(`Stage 7a (campaign budgets): ${msg}`);
    }

    try {
      const convActions = await fetchConversionActions(config);
      for (const ca of convActions) {
        await upsertConversionAction(supabase, {
          google_conversion_id: ca.conversionId,
          name: ca.name,
          type: ca.type,
          status: ca.status,
          counting_type: ca.countingType,
          category: ca.category,
        });
        result.conversionActions++;
      }
      console.log(`[Ads/Sync] Stage 7b: ${result.conversionActions} conversion actions`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Ads/Sync] Stage 7b conversion actions failed (non-fatal):", err);
      result.stageErrors.push(`Stage 7b (conversion actions): ${msg}`);
    }

    // ── Stage 8: Device + Geo Metrics + Quality Scores ──────────────
    try {
      const deviceRows = await fetchDevicePerformance(config, startDate, endDate);
      for (const d of deviceRows) {
        const internalCampaignId = campaignIdMap.get(d.campaignId) ?? null;
        await upsertDeviceMetrics(supabase, {
          campaign_id: internalCampaignId,
          device: d.device,
          report_date: d.date,
          impressions: d.impressions,
          clicks: d.clicks,
          cost_micros: d.costMicros,
          conversions: d.conversions,
        });
        result.deviceMetrics++;
      }
      console.log(`[Ads/Sync] Stage 8a: ${result.deviceMetrics} device metric rows`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Ads/Sync] Stage 8a device metrics failed (non-fatal):", err);
      result.stageErrors.push(`Stage 8a (device metrics): ${msg}`);
    }

    try {
      const geoRows = await fetchGeoPerformance(config, startDate, endDate);
      for (const g of geoRows) {
        const internalCampaignId = campaignIdMap.get(g.campaignId) ?? null;
        await upsertGeoMetrics(supabase, {
          campaign_id: internalCampaignId,
          geo_name: g.geoName,
          geo_type: g.geoType,
          report_date: g.date,
          impressions: g.impressions,
          clicks: g.clicks,
          cost_micros: g.costMicros,
          conversions: g.conversions,
        });
        result.geoMetrics++;
      }
      console.log(`[Ads/Sync] Stage 8b: ${result.geoMetrics} geo metric rows`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Ads/Sync] Stage 8b geo metrics failed (non-fatal):", err);
      result.stageErrors.push(`Stage 8b (geo metrics): ${msg}`);
    }

    try {
      const qsRows = await fetchQualityScores(config);
      for (const qs of qsRows) {
        const internalKeywordId = keywordIdMap.get(qs.criterionId);
        if (internalKeywordId === undefined) continue;
        const { error: qsErr } = await supabase
          .from("ads_keywords")
          .update({
            quality_score: qs.qualityScore,
            expected_ctr: qs.expectedCtr,
            ad_relevance: qs.adRelevance,
            landing_page_experience: qs.landingPageExperience,
            updated_at: new Date().toISOString(),
          })
          .eq("id", internalKeywordId);
        if (!qsErr) result.qualityScoreUpdates++;
      }
      console.log(`[Ads/Sync] Stage 8c: ${result.qualityScoreUpdates} quality scores updated`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Ads/Sync] Stage 8c quality scores failed (non-fatal):", err);
      result.stageErrors.push(`Stage 8c (quality scores): ${msg}`);
    }
```

Also update the `totalFetched` and `totalUpserted` calculations near line 276 to include the new counts.

**Step 7: Commit**

```bash
git add src/lib/ads/queries/negative-keywords.ts src/lib/ads/queries/budgets.ts src/lib/ads/queries/conversion-actions.ts src/lib/ads/queries/device-metrics.ts src/lib/ads/queries/geo-metrics.ts src/lib/ads/sync.ts
git commit -m "feat(ads): expand sync to 8 stages — negative KWs, budgets, conversions, device/geo metrics, quality scores"
```

---

### Task 4: Intel Persistence + Intel-to-Recommendations Pipeline

**Files:**
- Create: `src/lib/ads/intel-to-recommendations.ts`
- Modify: `src/app/api/ads/intelligence/route.ts` (save to DB, add GET handler)
- Modify: `src/app/(sentinel)/ads/page.tsx` lines 787-912 (IntelligenceTab — server-side fetch, remove localStorage)

**Step 1: Create intel-to-recommendations module**

File: `src/lib/ads/intel-to-recommendations.ts`

```typescript
/**
 * Converts actionable Key Intel data points into validated ads_recommendations.
 *
 * Only data points with urgency 'act_now' or 'this_week' are converted.
 * Deduplication: skips if a pending recommendation exists for the same
 * entity + action type within the last 7 days.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { insertValidatedRecommendations } from "./recommendations";

interface IntelDataPoint {
  rank: number;
  category: string;
  signal: string;
  why_it_matters: string;
  confidence: string;
  urgency: string;
  dollar_impact: string;
  market: string;
  entity: string;
  entity_id: string;
  recommended_action: string;
}

/**
 * Maps an intel data point to a recommendation shape that
 * insertValidatedRecommendations can validate and insert.
 */
function mapToRecommendation(dp: IntelDataPoint): {
  recommendation_type: string;
  risk_level: string;
  expected_impact: string;
  reason: string;
  related_keyword_id?: number;
  related_ad_group_id?: number;
  related_campaign_id?: number;
} | null {
  // Determine recommendation type from category + signal
  let recType: string;

  if (dp.category === "waste" && dp.signal.toLowerCase().includes("keyword")) {
    recType = "keyword_pause";
  } else if (dp.category === "waste" && dp.signal.toLowerCase().includes("search term")) {
    recType = "negative_add";
  } else if (dp.category === "opportunity") {
    recType = "opportunity_flag";
  } else if (dp.category === "quality") {
    recType = dp.signal.toLowerCase().includes("quality score") ? "keyword_pause" : "bid_adjust";
  } else if (dp.category === "structural" && dp.signal.toLowerCase().includes("budget")) {
    recType = "budget_adjust";
  } else if (dp.category === "creative") {
    recType = "copy_suggestion";
  } else if (dp.category === "risk" && dp.signal.toLowerCase().includes("negative")) {
    recType = "negative_add";
  } else if (dp.category === "waste") {
    // Generic waste — try to determine from entity context
    recType = "waste_flag";
  } else {
    // Not directly actionable as a recommendation
    return null;
  }

  // Map risk from urgency
  const riskMap: Record<string, string> = {
    act_now: "red",
    this_week: "yellow",
    monitor: "green",
    fyi: "green",
  };

  // Try to extract entity ID (the intel route includes entity_id when available)
  const entityId = dp.entity_id ? Number(dp.entity_id) : null;

  const rec: Record<string, unknown> = {
    recommendation_type: recType,
    risk_level: riskMap[dp.urgency] ?? "yellow",
    expected_impact: dp.dollar_impact ?? "Unknown",
    reason: `${dp.signal}. ${dp.why_it_matters}`,
  };

  // Assign entity FK based on category context
  if (recType === "keyword_pause" || recType === "bid_adjust") {
    if (entityId) rec.related_keyword_id = entityId;
  } else if (recType === "budget_adjust") {
    if (entityId) rec.related_campaign_id = entityId;
  } else if (recType === "negative_add" || recType === "waste_flag" || recType === "opportunity_flag") {
    // These may not have a direct keyword FK — try campaign
    if (entityId) rec.related_campaign_id = entityId;
  }

  return rec as ReturnType<typeof mapToRecommendation>;
}

export async function convertIntelToRecommendations(
  supabase: SupabaseClient,
  dataPoints: IntelDataPoint[],
  briefingId: string,
): Promise<{ created: number; skipped: number; total: number }> {
  const actionable = dataPoints.filter(
    (dp) => dp.urgency === "act_now" || dp.urgency === "this_week"
  );

  const mapped = actionable
    .map(mapToRecommendation)
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (mapped.length === 0) {
    return { created: 0, skipped: actionable.length, total: dataPoints.length };
  }

  // Deduplication: check existing pending recommendations from the last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: existingRecs } = await supabase
    .from("ads_recommendations")
    .select("recommendation_type, related_keyword_id, related_campaign_id, related_ad_group_id")
    .eq("status", "pending")
    .gte("created_at", sevenDaysAgo.toISOString());

  const existingKeys = new Set(
    (existingRecs ?? []).map((r: Record<string, unknown>) => {
      const entityKey = r.related_keyword_id
        ? `kw_${r.related_keyword_id}`
        : r.related_ad_group_id
          ? `ag_${r.related_ad_group_id}`
          : `camp_${r.related_campaign_id}`;
      return `${entityKey}_${r.recommendation_type}`;
    })
  );

  const deduped = mapped.filter((r) => {
    const entityKey = r.related_keyword_id
      ? `kw_${r.related_keyword_id}`
      : r.related_ad_group_id
        ? `ag_${r.related_ad_group_id}`
        : `camp_${r.related_campaign_id}`;
    return !existingKeys.has(`${entityKey}_${r.recommendation_type}`);
  });

  if (deduped.length === 0) {
    return { created: 0, skipped: mapped.length, total: dataPoints.length };
  }

  // Add source_briefing_id to each recommendation's metadata
  const withBriefing = deduped.map((r) => ({
    ...r,
    source_briefing_id: briefingId,
  }));

  const result = await insertValidatedRecommendations(supabase, withBriefing);

  return {
    created: result.inserted,
    skipped: mapped.length - deduped.length + (deduped.length - result.inserted),
    total: dataPoints.length,
  };
}
```

**Step 2: Update intelligence route — add server-side persistence and GET handler**

Modify `src/app/api/ads/intelligence/route.ts`:

- Add a `GET` handler that returns the latest briefing from `ads_intelligence_briefings`
- Update the `POST` handler to save the briefing to `ads_intelligence_briefings` and run `convertIntelToRecommendations`
- Add trigger parameter support (manual vs cron)

The GET handler:

```typescript
/**
 * GET /api/ads/intelligence
 *
 * Returns the latest intelligence briefing from the database.
 */
export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await sb.auth.getUser(token ?? "");
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: briefing } = await sb
    .from("ads_intelligence_briefings")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!briefing) {
    return NextResponse.json({ ok: true, intelligence: null, savedAt: null });
  }

  return NextResponse.json({
    ok: true,
    intelligence: {
      briefing_date: briefing.briefing_date,
      account_status: briefing.account_status,
      executive_summary: briefing.executive_summary,
      total_estimated_monthly_waste: briefing.total_estimated_monthly_waste,
      total_estimated_monthly_opportunity: briefing.total_estimated_monthly_opportunity,
      data_points: briefing.data_points,
    },
    adversarial: briefing.adversarial_result,
    savedAt: briefing.created_at,
    briefingId: briefing.id,
  });
}
```

At the end of the existing POST handler, after the adversarial review and before the return, add:

```typescript
    // ── Save briefing to database ──────────────────────────────────────
    let body: { trigger?: string } = {};
    try { body = await req.json().catch(() => ({})); } catch {}
    const triggerType = body.trigger ?? "manual";

    const { data: savedBriefing } = await sb
      .from("ads_intelligence_briefings")
      .insert({
        briefing_date: new Date().toISOString().split("T")[0],
        account_status: (parsed as Record<string, unknown>).account_status ?? "unknown",
        executive_summary: (parsed as Record<string, unknown>).executive_summary ?? "",
        total_estimated_monthly_waste: Number((parsed as Record<string, unknown>).total_estimated_monthly_waste ?? 0),
        total_estimated_monthly_opportunity: Number((parsed as Record<string, unknown>).total_estimated_monthly_opportunity ?? 0),
        data_points: (parsed as Record<string, unknown>).data_points ?? [],
        adversarial_result: adversarialResult ? { ... } : null,
        trigger: triggerType,
      })
      .select("id")
      .single();

    // ── Convert actionable intel to recommendations ────────────────────
    let recsResult = null;
    if (savedBriefing?.id && Array.isArray((parsed as Record<string, unknown>).data_points)) {
      try {
        recsResult = await convertIntelToRecommendations(
          sb,
          (parsed as Record<string, unknown>).data_points as any[],
          savedBriefing.id,
        );
        console.log(`[Intelligence] Recommendations: ${recsResult.created} created, ${recsResult.skipped} skipped`);
      } catch (recErr) {
        console.error("[Intelligence] Recommendation conversion failed (non-blocking):", recErr);
      }
    }

    // ── Create alerts for act_now items ─────────────────────────────────
    const actNowPoints = ((parsed as Record<string, unknown>).data_points as any[] ?? [])
      .filter((dp: any) => dp.urgency === "act_now");
    if (actNowPoints.length > 0 && savedBriefing?.id) {
      await sb.from("ads_alerts").insert({
        briefing_id: savedBriefing.id,
        severity: "critical",
        message: `${actNowPoints.length} critical finding${actNowPoints.length > 1 ? "s" : ""} require immediate attention`,
      });
    }
```

Update the return to include `savedAt`, `briefingId`, and `recommendations`.

**Step 3: Update IntelligenceTab in page.tsx**

Replace the localStorage-based caching with server-side fetch:

- On mount: `fetch GET /api/ads/intelligence` to load latest briefing
- Show results immediately with age: `"Updated X hours ago"` using `savedAt`
- "Refresh" button calls `POST /api/ads/intelligence`
- Remove `INTEL_CACHE_KEY`, remove `localStorage.getItem/setItem` calls
- Remove the early return that shows empty state when `!intelligence && !loading && !error` — instead show loading spinner on mount, then data or "no briefing yet" message

**Step 4: Commit**

```bash
git add src/lib/ads/intel-to-recommendations.ts src/app/api/ads/intelligence/route.ts src/app/(sentinel)/ads/page.tsx
git commit -m "feat(ads): server-side intel persistence, intel-to-recommendations pipeline, remove localStorage cache"
```

---

### Task 5: Cron Upgrade — Dual-Model Gate on Daily/Weekly

**Files:**
- Modify: `src/app/api/ads/cycle/route.ts` (replace legacy flow with Opus + GPT-5.4 Pro intel pipeline)
- Modify: `vercel.json` (verify cron timing)

**Step 1: Rewrite cycle route**

Replace the existing cycle route to:

1. Run expanded sync (same as before)
2. Call the intelligence extraction endpoint internally (or inline the logic) using Opus + GPT-5.4 Pro
3. Save briefing server-side (via the updated intelligence route logic)
4. Convert actionable items to recommendations (already handled by the updated POST)
5. On weekly: additionally run the copy-lab logic and save copy_suggestion recommendations

The key change: replace the heuristic budget-burner check and Sonnet weekly review with the full dual-model intel pipeline. Remove all writes to legacy `ad_actions` and `ad_reviews` tables from the cron path.

**Step 2: Verify vercel.json cron config**

Current config already has the ads cron jobs. Update timing if needed:

```json
{
  "path": "/api/ads/cycle?mode=daily",
  "schedule": "0 14 * * *"
},
{
  "path": "/api/ads/cycle?mode=weekly",
  "schedule": "0 15 * * 0"
}
```

Current times are 14:00 UTC (6am PST) daily and 15:00 UTC (7am PST) Sundays — these are good.

**Step 3: Commit**

```bash
git add src/app/api/ads/cycle/route.ts vercel.json
git commit -m "feat(ads): upgrade cron to use Opus + GPT-5.4 dual-model intel pipeline, remove legacy ad_actions writes"
```

---

### Task 6: Chat Context Expansion + Recommendation Creation

**Files:**
- Modify: `src/app/api/ads/chat/route.ts` (expand system prompt context with intel, recs, negatives, budgets, QS, conversions, device, geo)

**Step 1: Expand context injection**

After the existing context assembly (~line 70), add queries for:

```typescript
// Additional context for full Command Center awareness
const [
  negativeKwsRes,
  budgetsRes,
  convActionsRes,
  deviceRes,
  geoRes,
  latestIntelRes,
  pendingRecsRes,
  recentDecisionsRes,
  keywordsWithQsRes,
] = await Promise.all([
  sb.from("ads_negative_keywords").select("keyword_text, match_type, level, campaign_id").limit(100),
  sb.from("ads_campaign_budgets").select("campaign_id, daily_budget_micros, delivery_method"),
  sb.from("ads_conversion_actions").select("name, type, status, counting_type, category"),
  sb.from("ads_device_metrics").select("campaign_id, device, impressions, clicks, cost_micros, conversions").gte("report_date", thirtyDaysAgo).limit(50),
  sb.from("ads_geo_metrics").select("campaign_id, geo_name, impressions, clicks, cost_micros, conversions").gte("report_date", thirtyDaysAgo).order("cost_micros", { ascending: false }).limit(50),
  sb.from("ads_intelligence_briefings").select("executive_summary, account_status, data_points, created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  sb.from("ads_recommendations").select("recommendation_type, risk_level, reason, market, status, created_at").eq("status", "pending").order("created_at", { ascending: false }).limit(20),
  sb.from("ads_recommendations").select("recommendation_type, status, market, created_at").in("status", ["approved", "ignored"]).order("created_at", { ascending: false }).limit(20),
  sb.from("ads_keywords").select("text, match_type, quality_score, expected_ctr, ad_relevance, landing_page_experience, status").not("quality_score", "is", null).limit(50),
]);
```

Then append each as a labeled section to the system prompt, similar to the existing pattern for campaigns and search terms.

**Step 2: Add recommendation creation capability**

Add a function-calling-style instruction to the system prompt that tells Claude it can output a special JSON block to create recommendations:

```
## Creating Recommendations

When the operator asks you to propose a change (pause a keyword, add a negative, adjust a bid, etc.), you can create a recommendation by including this exact JSON block in your response:

<RECOMMENDATION>
[{ "recommendation_type": "keyword_pause", "related_keyword_id": 123, "risk_level": "yellow", "expected_impact": "$50/mo saved", "reason": "Keyword burning budget with 0 conversions" }]
</RECOMMENDATION>

Valid recommendation_types: keyword_pause, bid_adjust, negative_add, budget_adjust, copy_suggestion, waste_flag, opportunity_flag
Valid risk_levels: green, yellow, red

The system will validate entity IDs, insert into the Approvals queue, and confirm back to the operator.
```

Then in the streaming response handler on the client side, detect `<RECOMMENDATION>...</RECOMMENDATION>` blocks, extract the JSON, and POST to a new endpoint that runs `insertValidatedRecommendations`.

**Step 3: Commit**

```bash
git add src/app/api/ads/chat/route.ts src/app/(sentinel)/ads/page.tsx
git commit -m "feat(ads): expand chat context with full account data, add recommendation creation from chat"
```

---

### Task 7: Approved Recommendations Execute + Alert Badge

**Files:**
- Modify: `src/components/sentinel/ads/pending-approvals-table.tsx` (add Execute button, CONFIRM gate for red risk)
- Create: `src/app/api/ads/execute/route.ts` (execution endpoint that calls Google Ads mutations)
- Modify: `src/components/layout/sidebar.tsx` (add alert badge for Ads)

**Step 1: Create execution API route**

File: `src/app/api/ads/execute/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  refreshAccessToken,
  getGoogleAdsConfig,
  setKeywordStatus,
  updateKeywordBid,
  updateCampaignBudget,
  addNegativeKeyword,
} from "@/lib/google-ads";

export const dynamic = "force-dynamic";

/**
 * POST /api/ads/execute
 *
 * Executes an approved recommendation in Google Ads.
 * Requires: { recommendationId: string, confirmation?: string }
 * Red-risk recommendations require confirmation === "CONFIRM"
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await sb.auth.getUser(token ?? "");
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { recommendationId, confirmation } = body;

  if (!recommendationId) {
    return NextResponse.json({ error: "recommendationId required" }, { status: 400 });
  }

  // Fetch the recommendation
  const { data: rec, error: recErr } = await sb
    .from("ads_recommendations")
    .select("*, ads_keywords(google_keyword_id, ad_group_id, ads_ad_groups(google_ad_group_id, campaign_id, ads_campaigns(google_campaign_id)))")
    .eq("id", recommendationId)
    .eq("status", "approved")
    .maybeSingle();

  if (recErr || !rec) {
    return NextResponse.json({ error: "Recommendation not found or not approved" }, { status: 404 });
  }

  // Freshness check
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  if (new Date(rec.created_at) < sevenDaysAgo) {
    return NextResponse.json({ error: "Recommendation is stale (>7 days). Please re-run intel." }, { status: 409 });
  }

  // Red-risk confirmation gate
  if (rec.risk_level === "red" && confirmation !== "CONFIRM") {
    return NextResponse.json({ error: "Red-risk recommendation requires confirmation === 'CONFIRM'" }, { status: 400 });
  }

  // Execute the mutation
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  if (!refreshToken) {
    return NextResponse.json({ error: "GOOGLE_ADS_REFRESH_TOKEN not configured" }, { status: 503 });
  }

  try {
    const accessToken = await refreshAccessToken(refreshToken);
    const config = getGoogleAdsConfig(accessToken);
    let mutationResult: unknown = null;

    // Route to correct mutation based on recommendation type
    switch (rec.recommendation_type) {
      case "keyword_pause": {
        const kw = rec.ads_keywords;
        const ag = kw?.ads_ad_groups;
        if (!kw?.google_keyword_id || !ag?.google_ad_group_id) {
          return NextResponse.json({ error: "Cannot resolve keyword entity for execution" }, { status: 422 });
        }
        mutationResult = await setKeywordStatus(config, ag.google_ad_group_id, kw.google_keyword_id, "PAUSED");
        break;
      }
      case "bid_adjust": {
        const kw = rec.ads_keywords;
        const ag = kw?.ads_ad_groups;
        if (!kw?.google_keyword_id || !ag?.google_ad_group_id) {
          return NextResponse.json({ error: "Cannot resolve keyword entity for execution" }, { status: 422 });
        }
        // Extract new bid from expected_impact or reason
        const bidMatch = rec.expected_impact?.match(/\$?([\d.]+)/);
        const newBidMicros = bidMatch ? Math.round(parseFloat(bidMatch[1]) * 1_000_000) : null;
        if (!newBidMicros) {
          return NextResponse.json({ error: "Cannot determine new bid amount" }, { status: 422 });
        }
        mutationResult = await updateKeywordBid(config, ag.google_ad_group_id, kw.google_keyword_id, newBidMicros);
        break;
      }
      case "negative_add": {
        // Extract keyword text from reason
        const camp = rec.ads_keywords?.ads_ad_groups?.ads_campaigns;
        const googleCampaignId = camp?.google_campaign_id;
        if (!googleCampaignId) {
          // Try from campaign directly
          if (rec.related_campaign_id) {
            const { data: campData } = await sb.from("ads_campaigns").select("google_campaign_id").eq("id", rec.related_campaign_id).maybeSingle();
            if (campData?.google_campaign_id) {
              // Extract the keyword text from reason field
              const negText = rec.reason?.match(/["']([^"']+)["']/)?.[1] ?? rec.reason?.split(":")[0]?.trim();
              if (negText) {
                mutationResult = await addNegativeKeyword(config, campData.google_campaign_id, negText, "EXACT");
              }
            }
          }
          if (!mutationResult) {
            return NextResponse.json({ error: "Cannot resolve campaign for negative keyword" }, { status: 422 });
          }
        }
        break;
      }
      case "budget_adjust": {
        // Budget adjustments need the campaign budget ID
        if (rec.related_campaign_id) {
          const { data: budgetData } = await sb.from("ads_campaign_budgets").select("google_budget_id").eq("campaign_id", rec.related_campaign_id).maybeSingle();
          const amountMatch = rec.expected_impact?.match(/\$?([\d.]+)/);
          const newBudgetMicros = amountMatch ? Math.round(parseFloat(amountMatch[1]) * 1_000_000) : null;
          if (budgetData?.google_budget_id && newBudgetMicros) {
            mutationResult = await updateCampaignBudget(config, budgetData.google_budget_id, newBudgetMicros);
          } else {
            return NextResponse.json({ error: "Cannot resolve budget entity or amount" }, { status: 422 });
          }
        }
        break;
      }
      default:
        return NextResponse.json({ error: `Execution not supported for type: ${rec.recommendation_type}` }, { status: 400 });
    }

    // Log execution result
    await sb.from("ads_implementation_logs").insert({
      recommendation_id: recommendationId,
      executed_by: user.id,
      result: "SUCCESS",
      details: JSON.stringify(mutationResult),
      executed_at: new Date().toISOString(),
    });

    // Update recommendation status to executed
    await sb.from("ads_recommendations").update({ status: "executed" }).eq("id", recommendationId);

    return NextResponse.json({ ok: true, executed: rec.recommendation_type, result: mutationResult });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[Ads/Execute]", errMsg);

    // Log failure
    await sb.from("ads_implementation_logs").insert({
      recommendation_id: recommendationId,
      executed_by: user.id,
      result: "FAILED",
      details: errMsg,
      executed_at: new Date().toISOString(),
    });

    return NextResponse.json({ error: `Execution failed: ${errMsg}` }, { status: 500 });
  }
}
```

**Step 2: Update pending-approvals-table.tsx**

Add an "Execute" button column for approved recommendations. When clicked:
- If risk_level === "red", show a confirmation modal with text input requiring "CONFIRM"
- Call `POST /api/ads/execute` with the recommendation ID
- Show success/failure inline
- Refresh the table

**Step 3: Add alert badge to sidebar**

In `src/components/layout/sidebar.tsx`:
- Add a Supabase query for unread ads_alerts count
- Show a small red dot/badge next to "Ads" in the nav when count > 0
- On navigation to /ads, mark alerts as read

**Step 4: Commit**

```bash
git add src/app/api/ads/execute/route.ts src/components/sentinel/ads/pending-approvals-table.tsx src/components/layout/sidebar.tsx
git commit -m "feat(ads): add real Google Ads execution from Approvals, alert badge on sidebar"
```

---

## Execution Order

Tasks 1-3 are foundation (DB + fetch + sync). Task 4 is the core intel pipeline. Task 5 is the cron upgrade. Task 6 is chat expansion. Task 7 is execution + alerts.

**Dependencies:**
- Task 1 (migration) must run first
- Task 2 (fetch functions) before Task 3 (sync)
- Task 3 (sync) before Task 5 (cron)
- Task 4 (intel pipeline) before Task 5 (cron)
- Tasks 1-4 before Task 6 (chat needs the new tables)
- Tasks 1-4 before Task 7 (execute needs the new tables)
- Tasks 6 and 7 can run in parallel

```
Task 1 (migration) → Task 2 (fetch) → Task 3 (sync) ─┐
                                                        ├→ Task 5 (cron)
Task 4 (intel pipeline) ───────────────────────────────┘
                                                        ├→ Task 6 (chat) ─── parallel
                                                        └→ Task 7 (execute) ─ parallel
```
