import { SupabaseClient } from "@supabase/supabase-js";
import { insertValidatedRecommendations } from "./recommendations";

interface IntelDataPoint {
  rank: number;
  category: string;
  signal: string;
  why_it_matters: string;
  confidence: string;
  urgency: string;
  dollar_impact: string;
  market: string;
  entity: string;
  entity_id?: string | number | null;
  recommended_action: string;
}

type RecType =
  | "keyword_pause"
  | "bid_adjust"
  | "negative_add"
  | "budget_adjust"
  | "copy_suggestion"
  | "waste_flag"
  | "opportunity_flag";

/**
 * Map an intel data point's category + signal text to a recommendation type.
 * Returns null if no mapping fits (skip the data point).
 */
function mapToRecommendationType(dp: IntelDataPoint): RecType | null {
  const cat = dp.category?.toLowerCase() ?? "";
  const signal = (dp.signal ?? "").toLowerCase();
  const action = (dp.recommended_action ?? "").toLowerCase();
  const combined = `${signal} ${action}`;

  if (cat === "waste") {
    if (combined.includes("keyword")) return "keyword_pause";
    if (combined.includes("search term") || combined.includes("negative")) return "negative_add";
    return "waste_flag";
  }
  if (cat === "opportunity") return "opportunity_flag";
  if (cat === "quality") {
    if (combined.includes("bid") || combined.includes("cpc")) return "bid_adjust";
    return "keyword_pause";
  }
  if (cat === "structural") {
    if (combined.includes("budget")) return "budget_adjust";
    return null;
  }
  if (cat === "creative") return "copy_suggestion";
  if (cat === "risk") {
    if (combined.includes("negative") || combined.includes("search term")) return "negative_add";
    return null;
  }
  // competitive, trend, attribution, market — skip
  return null;
}

function urgencyToRisk(urgency: string): "red" | "yellow" | "green" {
  if (urgency === "act_now") return "red";
  if (urgency === "this_week") return "yellow";
  return "green";
}

/**
 * Converts actionable Key Intel data points into validated ads_recommendations.
 *
 * Only converts data points with urgency `act_now` or `this_week`.
 * Deduplicates against existing pending recommendations on the same entity + type within 7 days.
 */
export async function convertIntelToRecommendations(
  supabase: SupabaseClient,
  dataPoints: IntelDataPoint[],
  briefingId: string
): Promise<{ created: number; skipped: number; total: number }> {
  if (!dataPoints || dataPoints.length === 0) {
    return { created: 0, skipped: 0, total: 0 };
  }

  // Only process act_now and this_week urgency
  const actionable = dataPoints.filter(
    (dp) => dp.urgency === "act_now" || dp.urgency === "this_week"
  );

  if (actionable.length === 0) {
    return { created: 0, skipped: 0, total: dataPoints.length };
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawRecs: any[] = [];
  let skipped = 0;

  for (const dp of actionable) {
    const recType = mapToRecommendationType(dp);
    if (!recType) {
      skipped++;
      continue;
    }

    // Parse entity_id — could be a keyword, ad group, or campaign ID
    const entityId = dp.entity_id ? Number(dp.entity_id) : null;

    // Deduplication: check for existing pending recommendation on same entity + type within 7 days
    if (entityId) {
      let query = supabase
        .from("ads_recommendations")
        .select("id")
        .eq("recommendation_type", recType)
        .eq("status", "pending")
        .gte("created_at", sevenDaysAgo);

      // We don't know which FK column the entity maps to, so check all three
      // The insertValidatedRecommendations function will handle proper FK resolution
      query = query.or(
        `related_keyword_id.eq.${entityId},related_ad_group_id.eq.${entityId},related_campaign_id.eq.${entityId}`
      );

      const { data: existing } = await query.limit(1).maybeSingle();
      if (existing) {
        skipped++;
        continue;
      }
    }

    const risk = urgencyToRisk(dp.urgency);
    const dollarImpact = dp.dollar_impact && dp.dollar_impact !== "unquantifiable"
      ? dp.dollar_impact
      : "Unknown";

    // Build raw rec — insertValidatedRecommendations will validate entity FKs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec: any = {
      recommendation_type: recType,
      risk_level: risk,
      expected_impact: dollarImpact,
      reason: `[Intel #${dp.rank}] ${dp.signal}. ${dp.recommended_action ?? ""}`.trim(),
      source_briefing_id: briefingId,
    };

    // Try to attach entity_id to the right FK based on category/signal hints
    if (entityId) {
      const signal = (dp.signal ?? "").toLowerCase();
      const action = (dp.recommended_action ?? "").toLowerCase();
      const combined = `${signal} ${action}`;

      if (combined.includes("keyword")) {
        rec.related_keyword_id = entityId;
      } else if (combined.includes("ad group")) {
        rec.related_ad_group_id = entityId;
      } else if (combined.includes("campaign")) {
        rec.related_campaign_id = entityId;
      } else {
        // Default: try as campaign first (most common entity in intel briefings)
        rec.related_campaign_id = entityId;
      }
    }

    rawRecs.push(rec);
  }

  if (rawRecs.length === 0) {
    return { created: 0, skipped, total: dataPoints.length };
  }

  const result = await insertValidatedRecommendations(supabase, rawRecs);
  return {
    created: result.inserted,
    skipped: skipped + (result.rawAttempted - result.inserted),
    total: dataPoints.length,
  };
}
