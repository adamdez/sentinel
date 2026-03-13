/**
 * Upsert function for ads_search_terms.
 * Uses composite unique constraint (search_term, campaign_id, ad_group_id).
 */

import { SupabaseClient } from "@supabase/supabase-js";

type AdsMarket = "spokane" | "kootenai";

export async function upsertSearchTerm(
  supabase: SupabaseClient,
  data: {
    search_term: string;
    campaign_id: number | null;
    ad_group_id: number | null;
    keyword_id: number | null;
    market: AdsMarket | null;
    impressions: number;
    clicks: number;
    cost_micros: number;
    conversions: number;
    conversion_value_micros?: number;
  },
): Promise<void> {
  const { error } = await supabase.from("ads_search_terms").upsert(
    {
      ...data,
      conversion_value_micros: data.conversion_value_micros ?? 0,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "search_term,campaign_id,ad_group_id" },
  );
  if (error) throw new Error(`upsertSearchTerm failed: ${error.message}`);
}
