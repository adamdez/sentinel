/**
 * Attribution bridge: ads_lead_attribution queries.
 *
 * Connects Sentinel leads to Google Ads campaigns/keywords via gclid.
 * All entity FK references are validated against synced records —
 * never uses AI-inferred or guessed IDs.
 */

import { SupabaseClient } from "@supabase/supabase-js";

type AdsMarket = "spokane" | "kootenai";

/**
 * Create or update an attribution record when a lead arrives with a gclid.
 * Uses upsert on gclid (unique constraint) to prevent duplicate attribution
 * rows from double-submits. FKs start as NULL and are resolved later.
 *
 * If the same gclid arrives again, the existing row is updated with the
 * newest lead_id — but entity FKs (campaign_id, ad_group_id, etc.) are
 * NOT included in the upsert payload so they are preserved if already
 * resolved. On fresh insert, Postgres column defaults provide NULL.
 */
export async function insertAttribution(
  supabase: SupabaseClient,
  data: {
    lead_id: string; // UUID from leads table
    gclid: string;
    landing_page?: string | null;
    landing_domain?: string | null;
    source_channel?: string;
    market?: AdsMarket | null;
  },
): Promise<number | null> {
  const { data: row, error } = await supabase
    .from("ads_lead_attribution")
    .upsert(
      {
        lead_id: data.lead_id,
        gclid: data.gclid,
        landing_page: data.landing_page ?? null,
        landing_domain: data.landing_domain
          ?? (data.landing_page ? extractDomain(data.landing_page) : null),
        source_channel: data.source_channel ?? "google_ads",
        market: data.market ?? null,
        // Entity FKs (campaign_id, ad_group_id, keyword_id, search_term_id)
        // are intentionally EXCLUDED from the upsert payload:
        // - On fresh insert: Postgres defaults these to NULL
        // - On conflict (duplicate gclid): existing resolved FKs are preserved
        //   rather than being reset to NULL
      },
      { onConflict: "gclid" },
    )
    .select("id")
    .single();

  if (error) {
    console.error("[Attribution] Upsert failed:", error.message);
    return null;
  }
  return row.id;
}

/**
 * Get all attribution records with NULL campaign_id (unresolved).
 * These need FK resolution after the next sync.
 */
export async function getUnresolvedAttributions(
  supabase: SupabaseClient,
): Promise<
  Array<{
    id: number;
    lead_id: string;
    gclid: string;
    landing_page: string | null;
    created_at: string;
  }>
> {
  const { data, error } = await supabase
    .from("ads_lead_attribution")
    .select("id, lead_id, gclid, landing_page, created_at")
    .is("campaign_id", null)
    .not("gclid", "is", null)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[Attribution] Failed to fetch unresolved:", error.message);
    return [];
  }
  return data ?? [];
}

/**
 * Resolve an attribution record's FKs after matching against synced data.
 * Only updates fields that are non-null — preserves explicit unresolved state.
 */
export async function resolveAttributionFKs(
  supabase: SupabaseClient,
  attributionId: number,
  resolved: {
    campaign_id?: number | null;
    ad_group_id?: number | null;
    keyword_id?: number | null;
    search_term_id?: number | null;
    // market is intentionally excluded — county-based market from lead intake
    // is the source of truth and must not be overwritten by campaign market.
    // Campaign market is always available via: JOIN ads_campaigns ON campaign_id
  },
): Promise<void> {
  const updates: Record<string, unknown> = {};

  // Only set entity FKs that were actually resolved — never overwrite with null
  // Market is never set here — it comes from lead intake (county-based)
  if (resolved.campaign_id != null) updates.campaign_id = resolved.campaign_id;
  if (resolved.ad_group_id != null) updates.ad_group_id = resolved.ad_group_id;
  if (resolved.keyword_id != null) updates.keyword_id = resolved.keyword_id;
  if (resolved.search_term_id != null) updates.search_term_id = resolved.search_term_id;

  if (Object.keys(updates).length === 0) return;

  const { error } = await supabase
    .from("ads_lead_attribution")
    .update(updates)
    .eq("id", attributionId);

  if (error) {
    console.error(`[Attribution] FK resolution failed for id=${attributionId}:`, error.message);
  }
}

/**
 * Extract domain from a URL string.
 */
export function extractDomain(url: string): string | null {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname;
  } catch {
    return null;
  }
}
