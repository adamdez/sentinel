/**
 * Upsert function for ads_conversion_actions.
 * Uses unique constraint on google_conversion_id.
 */

import { SupabaseClient } from "@supabase/supabase-js";

export async function upsertConversionAction(
  supabase: SupabaseClient,
  data: {
    google_conversion_id: string;
    name: string;
    type: string;
    status: string;
    counting_type: string;
    category: string;
  },
): Promise<void> {
  const { error } = await supabase.from("ads_conversion_actions").upsert(
    {
      ...data,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "google_conversion_id" },
  );
  if (error) throw new Error(`upsertConversionAction failed: ${error.message}`);
}
