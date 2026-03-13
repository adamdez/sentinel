/**
 * Upsert function for ads_daily_metrics.
 * Uses composite unique constraint (report_date, campaign_id, ad_group_id, keyword_id).
 */

import { SupabaseClient } from "@supabase/supabase-js";

type AdsMarket = "spokane" | "kootenai";

export async function upsertDailyMetrics(
  supabase: SupabaseClient,
  data: {
    report_date: string;
    campaign_id: number | null;
    ad_group_id: number | null;
    keyword_id: number | null;
    market: AdsMarket | null;
    impressions: number;
    clicks: number;
    cost_micros: number;
    conversions: number;
    conversion_value_micros: number;
  },
): Promise<void> {
  const { error } = await supabase.from("ads_daily_metrics").upsert(data, {
    onConflict: "report_date,campaign_id,ad_group_id,keyword_id",
  });
  if (error) throw new Error(`upsertDailyMetrics failed: ${error.message}`);
}
