/**
 * Upsert function for ads_geo_metrics.
 * Uses composite unique constraint (campaign_id, geo_name, report_date).
 */

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
  const { error } = await supabase.from("ads_geo_metrics").upsert(data, {
    onConflict: "campaign_id,geo_name,report_date",
  });
  if (error) throw new Error(`upsertGeoMetrics failed: ${error.message}`);
}
