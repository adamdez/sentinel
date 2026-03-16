/**
 * Upsert function for ads_negative_keywords.
 * Uses unique constraint on google_criterion_id.
 */

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
): Promise<void> {
  const { error } = await supabase.from("ads_negative_keywords").upsert(
    {
      ...data,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "google_criterion_id" },
  );
  if (error) throw new Error(`upsertNegativeKeyword failed: ${error.message}`);
}
