/**
 * Upsert function for ads_campaign_budgets.
 * Uses unique constraint on google_budget_id.
 */

import { SupabaseClient } from "@supabase/supabase-js";

export async function upsertCampaignBudget(
  supabase: SupabaseClient,
  data: {
    google_budget_id: string;
    campaign_id: number | null;
    daily_budget_micros: number;
    delivery_method: string;
    is_shared: boolean;
  },
): Promise<void> {
  const { error } = await supabase.from("ads_campaign_budgets").upsert(
    {
      ...data,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "google_budget_id" },
  );
  if (error) throw new Error(`upsertCampaignBudget failed: ${error.message}`);
}
