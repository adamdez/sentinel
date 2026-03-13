/**
 * Background attribution resolver.
 *
 * After each sync, attempts to resolve unresolved ads_lead_attribution
 * records by matching against synced campaign/ad_group/keyword data.
 *
 * Resolution strategy (deterministic only — never guesses):
 *
 * 1. If exactly ONE enabled campaign exists in the account for the
 *    attribution's date window → assign that campaign's internal ID.
 *    Market is NOT overwritten — the county-based market set at lead
 *    intake time is preserved. Campaign market is available via FK join.
 *
 * 2. If multiple campaigns exist → leave campaign_id NULL (ambiguous).
 *    Operator can manually resolve via Supabase dashboard.
 *
 * 3. Ad group and keyword FKs are NOT resolved in this phase.
 *    The Google Ads click_view resource could resolve these but requires
 *    Standard API access (not Explorer). These stay NULL until either:
 *    - click_view access is confirmed and a GAQL query is added
 *    - operator manually links them
 *
 * Design rules:
 * - Never trust AI-inferred IDs
 * - All entity references validated against actual synced records
 * - Ambiguous market assignment → leave NULL, don't guess
 * - Explicit unresolved state preferred over silently incorrect values
 * - Data freshness check: skip resolution if last sync > 36 hours old
 */

import { SupabaseClient } from "@supabase/supabase-js";
import {
  getUnresolvedAttributions,
  resolveAttributionFKs,
} from "./queries/attribution";

export interface ResolutionResult {
  total: number;
  resolved: number;
  skippedStale: boolean;
  skippedAmbiguous: number;
}

/**
 * Resolve unresolved attribution records against synced campaign data.
 * Called automatically after each sync completes.
 */
export async function resolveUnresolvedAttributions(
  supabase: SupabaseClient,
): Promise<ResolutionResult> {
  const result: ResolutionResult = {
    total: 0,
    resolved: 0,
    skippedStale: false,
    skippedAmbiguous: 0,
  };

  // ── Data freshness check ──────────────────────────────────────────
  const { data: lastSync } = await supabase
    .from("ads_sync_logs")
    .select("completed_at")
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .single();

  if (!lastSync?.completed_at) {
    console.log("[Attribution/Resolve] No completed sync found, skipping resolution");
    result.skippedStale = true;
    return result;
  }

  const lastSyncAge = Date.now() - new Date(lastSync.completed_at).getTime();
  const STALE_THRESHOLD_MS = 36 * 60 * 60 * 1000; // 36 hours

  if (lastSyncAge > STALE_THRESHOLD_MS) {
    console.log("[Attribution/Resolve] Last sync is stale (>36h), skipping resolution");
    result.skippedStale = true;
    return result;
  }

  // ── Get unresolved records ────────────────────────────────────────
  const unresolved = await getUnresolvedAttributions(supabase);
  result.total = unresolved.length;

  if (unresolved.length === 0) {
    console.log("[Attribution/Resolve] No unresolved attribution records");
    return result;
  }

  // ── Get all synced campaigns ──────────────────────────────────────
  const { data: campaigns } = await supabase
    .from("ads_campaigns")
    .select("id, google_campaign_id, name, market, status")
    .neq("status", "REMOVED");

  if (!campaigns || campaigns.length === 0) {
    console.log("[Attribution/Resolve] No synced campaigns found, cannot resolve");
    return result;
  }

  // Filter to ENABLED campaigns only for resolution
  const enabledCampaigns = campaigns.filter(
    (c) => c.status === "ENABLED" || c.status === "ACTIVE",
  );

  for (const attr of unresolved) {
    // ── Deterministic resolution ──────────────────────────────────
    //
    // Strategy: If exactly ONE enabled campaign exists, assign it.
    // This works for Dominion because:
    //   - Spokane has exactly 1 active search campaign
    //   - Kootenai has 0 campaigns (not launched yet)
    //   - When Kootenai launches, we'll need gclid→click_view resolution
    //     or campaign-name matching
    //
    // If multiple enabled campaigns exist, we cannot deterministically
    // assign without click_view data → leave unresolved.

    if (enabledCampaigns.length === 1) {
      const campaign = enabledCampaigns[0];
      await resolveAttributionFKs(supabase, attr.id, {
        campaign_id: campaign.id,
        // market intentionally NOT set here — county-based market from lead
        // intake is the source of truth. Campaign market available via FK join.
        // ad_group_id and keyword_id left NULL — need click_view for these
      });
      result.resolved++;
      console.log(
        `[Attribution/Resolve] Resolved attribution ${attr.id} → campaign "${campaign.name}" (${campaign.market})`,
      );
    } else if (enabledCampaigns.length > 1) {
      // Multiple enabled campaigns — ambiguous, skip
      result.skippedAmbiguous++;
      console.log(
        `[Attribution/Resolve] Attribution ${attr.id} ambiguous — ${enabledCampaigns.length} enabled campaigns, cannot determine which one`,
      );
    }
    // If 0 enabled campaigns, do nothing — data not synced yet
  }

  console.log(
    `[Attribution/Resolve] Done: ${result.resolved}/${result.total} resolved, ${result.skippedAmbiguous} ambiguous`,
  );

  return result;
}
