import { SupabaseClient } from "@supabase/supabase-js";

export type RiskLevel = "green" | "yellow" | "red";
export type RecommendationType = 
  | "keyword_pause" 
  | "bid_adjust" 
  | "negative_add" 
  | "budget_adjust" 
  | "copy_suggestion" 
  | "waste_flag" 
  | "opportunity_flag";

export interface AIStructuredRecommendation {
  recommendation_type: string;
  risk_level: string;
  expected_impact: string;
  reason: string;
  related_campaign_id?: number | null;
  related_ad_group_id?: number | null;
  related_keyword_id?: number | null;
  related_search_term_id?: number | null;
}

/**
 * Validates raw JSON output from the AI and strictly enforces
 * entity existence and market boundaries. Drops hallucinated rows.
 */
export async function insertValidatedRecommendations(
  sb: SupabaseClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawRecs: any[],
  reviewId?: string
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const validInsertRows: any[] = [];

  for (const raw of rawRecs) {
    if (!raw || typeof raw !== "object") continue;

    // 1. Strict Type Validation
    const recType = raw.recommendation_type as RecommendationType;
    const validTypes = ["keyword_pause", "bid_adjust", "negative_add", "budget_adjust", "copy_suggestion", "waste_flag", "opportunity_flag"];
    if (!validTypes.includes(recType)) {
      continue;
    }

    let risk = raw.risk_level;
    if (!["green", "yellow", "red"].includes(risk)) {
      risk = "yellow"; // default fallback for invalid string
    }

    const row: Record<string, unknown> = {
      recommendation_type: recType,
      risk_level: risk,
      expected_impact: typeof raw.expected_impact === "string" ? raw.expected_impact : "Unknown",
      reason: typeof raw.reason === "string" ? raw.reason : "",
      status: "pending",
    };

    if (reviewId) {
      row.source_review_id = reviewId;
    }

    // 2. Entity and Market Validation (The Enforcement Core)
    // Always cascade up. Ignore whatever `market` the AI hallucinates, fetch truth.
    let trueMarket: string | null = null;
    let isValid = true;

    if (raw.related_keyword_id) {
      // Validate keyword
      const { data: kw } = await sb.from("ads_keywords")
        .select("id, ad_group_id")
        .eq("id", raw.related_keyword_id)
        .maybeSingle();

      if (!kw) {
        isValid = false;
      } else {
        row.related_keyword_id = kw.id;
        row.related_ad_group_id = kw.ad_group_id;

        // Parent ad group
        const { data: ag } = await sb.from("ads_ad_groups")
          .select("campaign_id")
          .eq("id", kw.ad_group_id)
          .maybeSingle();
        
        if (ag) {
          row.related_campaign_id = ag.campaign_id;
          const { data: camp } = await sb.from("ads_campaigns").select("market").eq("id", ag.campaign_id).maybeSingle();
          trueMarket = camp?.market ?? null;
        } else {
          isValid = false;
        }
      }

    } else if (raw.related_ad_group_id) {
      // Validate ad group
      const { data: ag } = await sb.from("ads_ad_groups")
        .select("id, campaign_id")
        .eq("id", raw.related_ad_group_id)
        .maybeSingle();
      if (!ag) {
        isValid = false;
      } else {
        row.related_ad_group_id = ag.id;
        row.related_campaign_id = ag.campaign_id;
        const { data: camp } = await sb.from("ads_campaigns").select("market").eq("id", ag.campaign_id).maybeSingle();
        trueMarket = camp?.market ?? null;
      }

    } else if (raw.related_campaign_id) {
      // Validate campaign
      const { data: camp } = await sb.from("ads_campaigns")
        .select("id, market")
        .eq("id", raw.related_campaign_id)
        .maybeSingle();
      if (!camp) {
        isValid = false;
      } else {
        row.related_campaign_id = camp.id;
        trueMarket = camp.market;
      }
    } else {
      // A recommendation must map to at least ONE valid entity
      isValid = false;
    }

    if (!isValid || !trueMarket) {
      // Entity not found in our DB, or market couldn't be resolved. Drop it entirely.
      continue;
    }

    // 3. Statically burn correct market
    row.market = trueMarket;
    validInsertRows.push(row);
  }

  // Insert valid rows only
  if (validInsertRows.length > 0) {
    const { error } = await sb.from("ads_recommendations").insert(validInsertRows);
    if (error) {
      console.error("[Ads/Recommendations] Insert error:", error);
    }
    return { inserted: validInsertRows.length, rawAttempted: rawRecs.length };
  }

  return { inserted: 0, rawAttempted: rawRecs.length };
}
