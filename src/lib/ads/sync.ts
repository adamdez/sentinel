/**
 * Google Ads 5-Stage Sync Orchestration
 *
 * Ported from dominion-ads-ai/services/sync/google-ads-sync.ts
 * Adapted for Sentinel's existing google-ads.ts fetch functions
 * and ads_* normalized tables.
 *
 * Stages:
 *   1. Campaigns    → build googleCampaignId → internalId map
 *   2. Ad Groups    → use campaign map, build ad group map
 *   3. Keywords     → use ad group map, build keyword map
 *   4. Search Terms → use all three maps
 *   5. Daily Metrics → use all three maps
 *
 * All upserts are idempotent via ON CONFLICT on unique columns.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import {
  GoogleAdsConfig,
  fetchCampaignPerformance,
  fetchAdGroupPerformance,
  fetchKeywordPerformance,
  fetchKeywordCriteria,
  fetchAdPerformance,
  fetchSearchTerms,
  fetchDailyMetrics,
} from "@/lib/google-ads";
import { upsertCampaign, upsertAdGroup, upsertKeyword } from "./queries/campaigns";
import { upsertSearchTerm } from "./queries/search-terms";
import { upsertDailyMetrics } from "./queries/daily-metrics";
import {
  startSyncLog,
  completeSyncLog,
  failSyncLog,
  isSyncRunning,
} from "./queries/sync-logs";
import { resolveUnresolvedAttributions } from "./resolve-attribution";

type AdsMarket = "spokane" | "kootenai";

export interface SyncResult {
  campaigns: number;
  adGroups: number;
  keywords: number;
  keywordCriteriaUpdated: number;
  ads: number;
  searchTerms: number;
  dailyMetrics: number;
  durationMs: number;
}

/**
 * Maps Google Ads campaign IDs to their market.
 * For now, default everything to 'spokane'.
 * This will be configurable when Kootenai campaigns launch.
 */
const CAMPAIGN_MARKET_MAP: Record<string, AdsMarket> = {
  // Known campaigns — add Kootenai campaign IDs here when they launch
  // e.g., "12345678901": "kootenai"
};

function resolveMarket(googleCampaignId: string): AdsMarket {
  return CAMPAIGN_MARKET_MAP[googleCampaignId] ?? "spokane";
}

export async function runNormalizedSync(
  supabase: SupabaseClient,
  config: GoogleAdsConfig,
  startDate: string,
  endDate: string,
): Promise<SyncResult> {
  // ── Sync lock ──────────────────────────────────────────────────────
  const running = await isSyncRunning(supabase);
  if (running) {
    throw new Error("Another sync is already running. Wait for it to complete.");
  }

  const syncLogId = await startSyncLog(supabase, "full_sync", startDate, endDate);
  const syncStart = Date.now();

  const result: SyncResult = {
    campaigns: 0,
    adGroups: 0,
    keywords: 0,
    keywordCriteriaUpdated: 0,
    ads: 0,
    searchTerms: 0,
    dailyMetrics: 0,
    durationMs: 0,
  };

  try {
    // ── Stage 1: Campaigns ─────────────────────────────────────────
    const campaignIdMap = new Map<string, number>();
    const campaignMarketMap = new Map<string, AdsMarket>();

    const campaigns = await fetchCampaignPerformance(config, startDate, endDate);
    for (const c of campaigns) {
      const market = resolveMarket(c.campaignId);
      const internalId = await upsertCampaign(supabase, {
        google_campaign_id: c.campaignId,
        name: c.campaignName,
        market,
        status: c.status,
        campaign_type: null,
        search_impression_share: c.searchImpressionShare,
        search_top_impression_pct: c.searchTopImpressionPct,
        search_abs_top_impression_pct: c.searchAbsTopImpressionPct,
      });
      campaignIdMap.set(c.campaignId, internalId);
      campaignMarketMap.set(c.campaignId, market);
      result.campaigns++;
    }
    console.log(`[Ads/Sync] Stage 1: ${result.campaigns} campaigns`);

    // ── Stage 2: Ad Groups ─────────────────────────────────────────
    const adGroupIdMap = new Map<string, number>();

    const adGroups = await fetchAdGroupPerformance(config, startDate, endDate);
    for (const ag of adGroups) {
      const internalCampaignId = campaignIdMap.get(ag.campaignId);
      if (internalCampaignId === undefined) {
        console.warn(`[Ads/Sync] Ad group ${ag.adGroupId} references unknown campaign ${ag.campaignId}, skipping`);
        continue;
      }
      const internalId = await upsertAdGroup(supabase, {
        google_ad_group_id: ag.adGroupId,
        campaign_id: internalCampaignId,
        name: ag.adGroupName,
        status: "ENABLED",
      });
      adGroupIdMap.set(ag.adGroupId, internalId);
      result.adGroups++;
    }
    console.log(`[Ads/Sync] Stage 2: ${result.adGroups} ad groups`);

    // ── Stage 3: Keywords ──────────────────────────────────────────
    const keywordIdMap = new Map<string, number>();

    const keywords = await fetchKeywordPerformance(config, startDate, endDate);
    for (const kw of keywords) {
      const internalAdGroupId = adGroupIdMap.get(kw.adGroupId);
      if (internalAdGroupId === undefined) {
        console.warn(`[Ads/Sync] Keyword ${kw.keywordId} references unknown ad group ${kw.adGroupId}, skipping`);
        continue;
      }
      const internalId = await upsertKeyword(supabase, {
        google_keyword_id: kw.keywordId,
        ad_group_id: internalAdGroupId,
        text: kw.keywordText,
        match_type: kw.matchType,
        status: "ENABLED",
        seller_situation: null,
      });
      keywordIdMap.set(kw.keywordId, internalId);
      result.keywords++;
    }
    console.log(`[Ads/Sync] Stage 3: ${result.keywords} keywords`);

    // ── Stage 3b: Keyword Criteria backfill (text + match_type) ────
    try {
      const criteria = await fetchKeywordCriteria(config);
      for (const kc of criteria) {
        // Only update keywords we already synced
        const internalKeywordId = keywordIdMap.get(kc.criterionId);
        if (internalKeywordId === undefined) continue;
        if (!kc.keywordText) continue;

        const { error: updateErr } = await supabase
          .from("ads_keywords")
          .update({
            text: kc.keywordText,
            match_type: kc.matchType,
            status: kc.status || "ENABLED",
            updated_at: new Date().toISOString(),
          })
          .eq("id", internalKeywordId);

        if (!updateErr) result.keywordCriteriaUpdated++;
      }
      console.log(`[Ads/Sync] Stage 3b: ${result.keywordCriteriaUpdated} keywords updated with text/match_type`);
    } catch (criteriaErr) {
      console.error("[Ads/Sync] Stage 3b keyword criteria backfill failed (non-fatal):", criteriaErr);
    }

    // ── Stage 3c: Ad Copy ──────────────────────────────────────────
    try {
      const ads = await fetchAdPerformance(config, startDate, endDate);
      for (const ad of ads) {
        const internalCampaignId = campaignIdMap.get(ad.campaignId) ?? null;
        const internalAdGroupId = adGroupIdMap.get(ad.adGroupId) ?? null;

        const headlines = [ad.headline1, ad.headline2, ad.headline3].filter(Boolean);
        const descriptions = [ad.description1, ad.description2].filter(Boolean);

        const { error: adErr } = await supabase
          .from("ads_ads")
          .upsert(
            {
              google_ad_id: ad.adId,
              ad_group_id: internalAdGroupId,
              campaign_id: internalCampaignId,
              headlines,
              descriptions,
              status: "ENABLED",
              impressions: ad.impressions,
              clicks: ad.clicks,
              cost_micros: Math.round(ad.cost * 1_000_000),
              conversions: ad.conversions,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "google_ad_id" },
          );

        if (!adErr) result.ads++;
      }
      console.log(`[Ads/Sync] Stage 3c: ${result.ads} ads synced`);
    } catch (adErr) {
      console.error("[Ads/Sync] Stage 3c ad copy sync failed (non-fatal):", adErr);
    }

    // ── Stage 4: Search Terms ──────────────────────────────────────
    const searchTerms = await fetchSearchTerms(config, startDate, endDate);
    for (const st of searchTerms) {
      const internalCampaignId = campaignIdMap.get(st.campaignId) ?? null;
      const internalAdGroupId = adGroupIdMap.get(st.adGroupId) ?? null;
      const internalKeywordId = keywordIdMap.get(st.keywordId) ?? null;
      const market = campaignMarketMap.get(st.campaignId) ?? null;

      await upsertSearchTerm(supabase, {
        search_term: st.searchTerm,
        campaign_id: internalCampaignId,
        ad_group_id: internalAdGroupId,
        keyword_id: internalKeywordId,
        market,
        impressions: st.impressions,
        clicks: st.clicks,
        cost_micros: st.costMicros,
        conversions: st.conversions,
      });
      result.searchTerms++;
    }
    console.log(`[Ads/Sync] Stage 4: ${result.searchTerms} search terms`);

    // ── Stage 5: Daily Metrics ─────────────────────────────────────
    const dailyRows = await fetchDailyMetrics(config, startDate, endDate);
    for (const m of dailyRows) {
      const internalCampaignId = campaignIdMap.get(m.campaignId) ?? null;
      const internalAdGroupId = adGroupIdMap.get(m.adGroupId ?? "") ?? null;
      const internalKeywordId = keywordIdMap.get(m.keywordId ?? "") ?? null;
      const market = campaignMarketMap.get(m.campaignId) ?? null;

      await upsertDailyMetrics(supabase, {
        report_date: m.date,
        campaign_id: internalCampaignId,
        ad_group_id: internalAdGroupId,
        keyword_id: internalKeywordId,
        market,
        impressions: m.impressions,
        clicks: m.clicks,
        cost_micros: m.costMicros,
        conversions: m.conversions,
        conversion_value_micros: m.conversionValueMicros,
      });
      result.dailyMetrics++;
    }
    console.log(`[Ads/Sync] Stage 5: ${result.dailyMetrics} daily metric rows`);

    // ── Done ───────────────────────────────────────────────────────
    result.durationMs = Date.now() - syncStart;
    const totalFetched = campaigns.length + adGroups.length + keywords.length + searchTerms.length + dailyRows.length;
    const totalUpserted = result.campaigns + result.adGroups + result.keywords + result.keywordCriteriaUpdated + result.ads + result.searchTerms + result.dailyMetrics;

    await completeSyncLog(supabase, syncLogId, {
      records_fetched: totalFetched,
      records_upserted: totalUpserted,
      duration_ms: result.durationMs,
    });

    // ── Post-sync: resolve pending attribution records ──────────────
    try {
      const attrResult = await resolveUnresolvedAttributions(supabase);
      if (attrResult.resolved > 0 || attrResult.skippedAmbiguous > 0) {
        console.log(
          `[Ads/Sync] Attribution resolution: ${attrResult.resolved}/${attrResult.total} resolved, ${attrResult.skippedAmbiguous} ambiguous`,
        );
      }
    } catch (attrErr) {
      // Attribution resolution failure must not break sync
      console.error("[Ads/Sync] Attribution resolution failed (non-fatal):", attrErr);
    }

    console.log(`[Ads/Sync] Complete in ${result.durationMs}ms`, result);
    return result;
  } catch (error) {
    const durationMs = Date.now() - syncStart;
    const errMsg = error instanceof Error ? error.message : String(error);
    await failSyncLog(supabase, syncLogId, errMsg, durationMs);
    throw error;
  }
}
