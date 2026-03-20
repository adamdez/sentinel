# Ads Command Center Upgrade — Design Document

**Date:** 2026-03-16
**Status:** Approved
**Author:** Adam + Claude

## Problem Statement

Three interconnected issues in the Ads Command Center:

1. **Key Intel data disappears on tab switch** — React unmount/remount race causes localStorage cache to flash empty state before hydrating. Data should persist server-side and always show the latest briefing with its age.

2. **Chat AI has weak context** — Only sees 30-day metrics (50 rows), top 30 search terms, and latest review. Has no access to: intel results, recommendations, approval history, negative keywords, budgets, quality scores, conversion config, device/geo data.

3. **Approvals tab is passive** — Only shows recommendations from manual AI Review triggers. Key Intel identifies waste and opportunities but doesn't auto-generate actionable recommendations. No pipeline from "intel found waste" → "here's a proposed fix, approve it."

Additionally, the Google Ads data sync is incomplete — negative keywords, budgets, quality scores, conversion actions, device metrics, and geo metrics are not pulled. The cron writes to legacy tables the Approvals tab doesn't read, and uses Sonnet without adversarial review.

## Design

### 1. Expanded Sync — Full Google Ads Data

New fetch functions in `google-ads.ts`:

| Function | GAQL Resource | Data |
|----------|--------------|------|
| `fetchNegativeKeywords()` | `campaign_criterion` + `ad_group_criterion` (negative) | text, match type, level, status |
| `fetchCampaignBudgets()` | `campaign_budget` | daily budget, delivery method, shared flag |
| `fetchQualityScores()` | `ad_group_criterion` | quality score + 3 components |
| `fetchConversionActions()` | `conversion_action` | name, type, status, counting type |
| `fetchDevicePerformance()` | `campaign` + `segments.device` | per-device CPC/CTR/conversions |
| `fetchGeoPerformance()` | `geographic_view` | city/metro clicks, cost, conversions |

New Supabase tables:
- `ads_negative_keywords` (campaign_id, ad_group_id nullable, keyword_text, match_type, level)
- `ads_campaign_budgets` (campaign_id, daily_budget_micros, delivery_method, is_shared)
- `ads_conversion_actions` (google_id, name, type, status, counting_type, category)
- `ads_device_metrics` (campaign_id, device, report_date, impressions, clicks, cost_micros, conversions)
- `ads_geo_metrics` (campaign_id, geo_name, geo_type, report_date, impressions, clicks, cost_micros, conversions)

New columns on `ads_keywords`: quality_score, expected_ctr, ad_relevance, landing_page_experience.

Sync orchestrator grows from 5 to ~8 stages, same atomic lock pattern.

### 2. Key Intel Persistence — Server-Side

New table: `ads_intelligence_briefings`
- id, briefing_date, account_status, executive_summary, total_estimated_monthly_waste, total_estimated_monthly_opportunity, data_points (jsonb), adversarial_result (jsonb), trigger (manual/daily_cron/weekly_cron), created_at

UI changes:
- On mount: GET fetches latest briefing from DB (not localStorage)
- Shows age indicator: "Updated 3 hours ago" / "Updated 2 days ago — consider refreshing"
- Refresh button triggers fresh dual-model extraction, saves to DB
- Remove localStorage cache entirely
- No more empty state on tab switch

### 3. Intel → Recommendations Pipeline

New module: `lib/ads/intel-to-recommendations.ts`

When Key Intel runs (manual or cron), data points with urgency `act_now` or `this_week` get converted to recommendations:

| Intel category | Recommendation type |
|---------------|-------------------|
| waste (keyword) | keyword_pause |
| waste (search term) | negative_add |
| opportunity | opportunity_flag |
| quality (low QS) | bid_adjust or keyword_pause |
| structural (budget) | budget_adjust |
| creative | copy_suggestion |
| risk (missing negatives) | negative_add |

Deduplication: skip if pending recommendation exists for same entity + action within 7 days.
Every recommendation carries source_briefing_id FK. Entity validation through existing `insertValidatedRecommendations`.

### 4. Cron Upgrade

| Schedule | Steps |
|----------|-------|
| Daily (6am PST) | Expanded sync → Opus Key Intel → GPT-5.4 Pro adversarial → Save briefing → Convert to recommendations → Set alert if act_now items |
| Weekly (Sun 7am PST) | Everything daily + Opus Ad Copy Lab → GPT-5.4 Pro copy review → copy_suggestion recommendations |

Vercel cron config:
```json
{
  "crons": [
    { "path": "/api/ads/cycle?mode=daily", "schedule": "0 14 * * *" },
    { "path": "/api/ads/cycle?mode=weekly", "schedule": "0 15 * * 0" }
  ]
}
```

Legacy `ad_actions` writes removed from cron. Everything flows through `ads_recommendations`.

### 5. Chat Gets Full Context + Can Create Recommendations

New context injected into chat system prompt:
- Latest intelligence briefing (summary + top 10 data points)
- Current pending recommendations
- Recent approval/rejection history (last 20)
- Negative keywords list
- Campaign budgets
- Quality scores
- Conversion action config
- Device and geo performance summaries

Chat can create recommendations: operator requests like "pause keywords with CPC over $30" get structured, validated through `insertValidatedRecommendations`, and confirmed. Does NOT bypass dual-model gate for bulk suggestions.

### 6. Approved Recommendations Execute in Google Ads

Two-step safety: Approve → Execute (separate clicks).

Execute flow:
1. Re-validate entity exists, recommendation fresh (<7 days)
2. Call mutation: keyword_pause → setKeywordStatus(PAUSED), bid_adjust → updateKeywordBid, budget_adjust → updateCampaignBudget, negative_add → new addNegativeKeyword()
3. Log real result in ads_implementation_logs
4. Update status to 'executed'

Red-risk recommendations require typing "CONFIRM" before execution.

### 7. Alert Badge

Daily cron sets alert flag when act_now items found. Sentinel sidebar shows red badge on "Ads Command Center" when unread alerts exist. Clears on visit.

New table: `ads_alerts` (id, briefing_id, severity, message, read, created_at)

## New Database Objects Summary

| Object | Type |
|--------|------|
| ads_intelligence_briefings | New table |
| ads_negative_keywords | New table |
| ads_campaign_budgets | New table |
| ads_conversion_actions | New table |
| ads_device_metrics | New table |
| ads_geo_metrics | New table |
| ads_alerts | New table |
| ads_keywords.quality_score | New column |
| ads_keywords.expected_ctr | New column |
| ads_keywords.ad_relevance | New column |
| ads_keywords.landing_page_experience | New column |
| ads_recommendations.source_briefing_id | New column |
| ads_recommendations status 'executed' | New enum value |

## Out of Scope (Deferred)

- Hour/day-of-week optimization
- Asset/extension management
- Ad creation from approved copy (complex mutation)
- Geographic/zip-level optimization beyond basic metrics
