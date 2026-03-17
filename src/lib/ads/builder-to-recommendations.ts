import { SupabaseClient } from "@supabase/supabase-js";

interface BuilderKeyword {
  keyword_text: string;
  match_type: "EXACT" | "PHRASE" | "BROAD";
  ad_group_name: string;
  bid_dollars?: number;
  rationale: string;
}

interface BuilderNegative {
  keyword_text: string;
  match_type: "EXACT" | "PHRASE" | "BROAD";
  level: "campaign" | "account";
  rationale: string;
}

interface BuilderAdGroup {
  name: string;
  purpose: string;
  campaign_name: string;
}

interface BuilderOutput {
  account_assessment: string;
  ad_groups: BuilderAdGroup[];
  keywords: BuilderKeyword[];
  negatives: BuilderNegative[];
}

/**
 * Converts AI builder output into ads_recommendations rows.
 * Builder recommendations use `metadata` JSONB to carry payload
 * (keyword text, match type, etc.) since the entities don't exist yet.
 */
export async function convertBuilderToRecommendations(
  sb: SupabaseClient,
  builder: BuilderOutput,
  briefingId: string,
): Promise<{ created: number; skipped: number; total: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recs: any[] = [];
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  // Fetch campaigns + ad groups for FK resolution
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: campaigns } = await (sb.from("ads_campaigns") as any)
    .select("id, name, google_campaign_id, market");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: adGroups } = await (sb.from("ads_ad_groups") as any)
    .select("id, name, google_ad_group_id, campaign_id");

  const campList = campaigns ?? [];
  const agList = adGroups ?? [];

  // Helper: find campaign by name (fuzzy) or use first enabled
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const findCampaign = (name?: string): any => {
    if (name) {
      const lower = name.toLowerCase();
      const match = campList.find((c: Record<string, unknown>) =>
        (c.name as string)?.toLowerCase().includes(lower)
      );
      if (match) return match;
    }
    return campList[0] ?? null;
  };

  // Helper: find ad group by name
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const findAdGroup = (name: string, campaignId?: number): any => {
    const lower = name.toLowerCase();
    return agList.find((ag: Record<string, unknown>) =>
      (ag.name as string)?.toLowerCase().includes(lower) &&
      (!campaignId || ag.campaign_id === campaignId)
    );
  };

  // Dedup helper: check for existing pending rec with same keyword_text
  const existingCheck = async (type: string, keywordText: string): Promise<boolean> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (sb.from("ads_recommendations") as any)
      .select("id")
      .eq("recommendation_type", type)
      .eq("status", "pending")
      .gte("created_at", sevenDaysAgo)
      .contains("metadata", { keyword_text: keywordText })
      .limit(1)
      .maybeSingle();
    return !!data;
  };

  let skipped = 0;

  // ── Ad Group recommendations ──
  for (const ag of (builder.ad_groups ?? [])) {
    const camp = findCampaign(ag.campaign_name);
    if (!camp) { skipped++; continue; }

    // Check if ad group already exists
    const existingAg = findAdGroup(ag.name, camp.id);
    if (existingAg) { skipped++; continue; }

    recs.push({
      recommendation_type: "ad_group_create",
      risk_level: "green",
      expected_impact: ag.purpose,
      reason: `Create ad group "${ag.name}" in ${camp.name}. ${ag.purpose}`,
      related_campaign_id: camp.id,
      market: camp.market,
      metadata: { ad_group_name: ag.name },
      status: "pending",
      source_briefing_id: briefingId,
    });
  }

  // ── Keyword recommendations ──
  for (const kw of (builder.keywords ?? [])) {
    if (await existingCheck("keyword_add", kw.keyword_text)) { skipped++; continue; }

    const camp = findCampaign();
    if (!camp) { skipped++; continue; }

    // Try to find the target ad group
    const ag = findAdGroup(kw.ad_group_name, camp.id);

    recs.push({
      recommendation_type: "keyword_add",
      risk_level: "green",
      expected_impact: kw.rationale,
      reason: `Add "${kw.keyword_text}" [${kw.match_type}] to ${kw.ad_group_name}. ${kw.rationale}`,
      related_campaign_id: camp.id,
      related_ad_group_id: ag?.id ?? null,
      market: camp.market,
      metadata: {
        keyword_text: kw.keyword_text,
        match_type: kw.match_type,
        target_ad_group_name: kw.ad_group_name,
        bid_micros: kw.bid_dollars ? Math.round(kw.bid_dollars * 1_000_000) : null,
      },
      status: "pending",
      source_briefing_id: briefingId,
    });
  }

  // ── Negative keyword recommendations ──
  for (const neg of (builder.negatives ?? [])) {
    if (await existingCheck("negative_add", neg.keyword_text)) { skipped++; continue; }

    const camp = findCampaign();
    if (!camp) { skipped++; continue; }

    recs.push({
      recommendation_type: "negative_add",
      risk_level: "green",
      expected_impact: neg.rationale,
      reason: `Block "${neg.keyword_text}" [${neg.match_type}]. ${neg.rationale}`,
      related_campaign_id: camp.id,
      market: camp.market,
      metadata: {
        keyword_text: neg.keyword_text,
        match_type: neg.match_type,
      },
      status: "pending",
      source_briefing_id: briefingId,
    });
  }

  // Insert all at once
  if (recs.length === 0) {
    return { created: 0, skipped, total: (builder.keywords?.length ?? 0) + (builder.negatives?.length ?? 0) + (builder.ad_groups?.length ?? 0) };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb.from("ads_recommendations") as any).insert(recs);
  if (error) {
    console.error("[Builder] Insert error:", error);
    return { created: 0, skipped, total: recs.length + skipped };
  }

  return {
    created: recs.length,
    skipped,
    total: recs.length + skipped,
  };
}
