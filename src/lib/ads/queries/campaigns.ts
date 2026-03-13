/**
 * Upsert functions for ads_campaigns, ads_ad_groups, ads_keywords.
 * All return the internal database ID for FK resolution in later sync stages.
 */

import { SupabaseClient } from "@supabase/supabase-js";

type AdsMarket = "spokane" | "kootenai";

// ── Campaigns ────────────────────────────────────────────────────────

export async function upsertCampaign(
  supabase: SupabaseClient,
  data: {
    google_campaign_id: string;
    name: string;
    market: AdsMarket;
    status: string;
    campaign_type?: string | null;
  },
): Promise<number> {
  const { data: row, error } = await supabase
    .from("ads_campaigns")
    .upsert(
      { ...data, updated_at: new Date().toISOString() },
      { onConflict: "google_campaign_id" },
    )
    .select("id")
    .single();
  if (error) throw new Error(`upsertCampaign failed: ${error.message}`);
  return row.id;
}

// ── Ad Groups ────────────────────────────────────────────────────────

export async function upsertAdGroup(
  supabase: SupabaseClient,
  data: {
    google_ad_group_id: string;
    campaign_id: number;
    name: string;
    status: string;
  },
): Promise<number> {
  const { data: row, error } = await supabase
    .from("ads_ad_groups")
    .upsert(
      { ...data, updated_at: new Date().toISOString() },
      { onConflict: "google_ad_group_id" },
    )
    .select("id")
    .single();
  if (error) throw new Error(`upsertAdGroup failed: ${error.message}`);
  return row.id;
}

// ── Keywords ─────────────────────────────────────────────────────────

export async function upsertKeyword(
  supabase: SupabaseClient,
  data: {
    google_keyword_id: string;
    ad_group_id: number;
    text: string;
    match_type: string;
    status: string;
    seller_situation?: string | null;
  },
): Promise<number> {
  const { data: row, error } = await supabase
    .from("ads_keywords")
    .upsert(
      { ...data, updated_at: new Date().toISOString() },
      { onConflict: "google_keyword_id" },
    )
    .select("id")
    .single();
  if (error) throw new Error(`upsertKeyword failed: ${error.message}`);
  return row.id;
}
