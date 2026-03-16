/**
 * Upsert function for ads_device_metrics.
 * Uses composite unique constraint (campaign_id, device, report_date).
 */

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
  const { error } = await supabase.from("ads_device_metrics").upsert(data, {
    onConflict: "campaign_id,device,report_date",
  });
  if (error) throw new Error(`upsertDeviceMetrics failed: ${error.message}`);
}
