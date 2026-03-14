import { SupabaseClient } from "@supabase/supabase-js";

export interface SimulationResult {
  success: boolean;
  code: "SUCCESS" | "STALE" | "ENTITY_NOT_FOUND" | "MARKET_MISMATCH" | "INVALID_STATE" | "DUPLICATE_RUN" | "DB_ERROR";
  message: string;
  details?: any;
}

/**
 * Phase 5 Slice 3 Step 1 — Mutation Gateway Simulator Layer
 * 
 * This service handles the non-executing "dry-run" simulation of an approved
 * recommendation. It enforces strict revalidation against the production DB
 * before logging a mock outcome.
 */
export async function simulateImplementation(
  sb: SupabaseClient,
  recommendationId: string,
  operatorId: string
): Promise<SimulationResult> {
  try {
    // 1. Eligibility & State Check
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rec, error: recErr } = await (sb.from("ads_recommendations") as any)
      .select("*")
      .eq("id", recommendationId)
      .single();

    if (recErr || !rec) {
      return { success: false, code: "ENTITY_NOT_FOUND", message: "Recommendation not found." };
    }

    if (rec.status !== "approved") {
      return { success: false, code: "INVALID_STATE", message: "Only approved recommendations can be simulated." };
    }

    // 2. Freshness Check (7-day rule)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    if (new Date(rec.created_at) < sevenDaysAgo) {
      return { success: false, code: "STALE", message: "Recommendation is older than 7 days." };
    }

    // 3. Entity Revalidation (The Trust-But-Verify Layer)
    // We re-query the source table to ensure the entity hasn't been deleted or moved market.
    let entityExists = false;
    let currentMarket: string | null = null;

    if (rec.related_keyword_id) {
      const { data: kw } = await sb.from("ads_keywords").select("id, ad_group_id").eq("id", rec.related_keyword_id).maybeSingle();
      if (kw) {
        entityExists = true;
        const { data: ag } = await sb.from("ads_ad_groups").select("campaign_id").eq("id", kw.ad_group_id).maybeSingle();
        const { data: camp } = await sb.from("ads_campaigns").select("market").eq("id", ag?.campaign_id).maybeSingle();
        currentMarket = camp?.market ?? null;
      }
    } else if (rec.related_ad_group_id) {
      const { data: ag } = await sb.from("ads_ad_groups").select("id, campaign_id").eq("id", rec.related_ad_group_id).maybeSingle();
      if (ag) {
        entityExists = true;
        const { data: camp } = await sb.from("ads_campaigns").select("market").eq("id", ag.campaign_id).maybeSingle();
        currentMarket = camp?.market ?? null;
      }
    } else if (rec.related_campaign_id) {
      const { data: camp } = await sb.from("ads_campaigns").select("id, market").eq("id", rec.related_campaign_id).maybeSingle();
      if (camp) {
        entityExists = true;
        currentMarket = camp.market;
      }
    }

    if (!entityExists) {
      return { success: false, code: "ENTITY_NOT_FOUND", message: "Target entity no longer exists in DB." };
    }

    if (currentMarket !== rec.market) {
      return { success: false, code: "MARKET_MISMATCH", message: "Entity market has changed since recommendation was made." };
    }

    // 4. Duplicate Prevention (Simulation Ledger Check)
    // Prevent spamming simulation logs for the same recommendation.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingLog } = await (sb.from("ads_implementation_logs") as any)
      .select("id")
      .eq("recommendation_id", recommendationId)
      .maybeSingle();

    if (existingLog) {
      return { success: false, code: "DUPLICATE_RUN", message: "This recommendation has already been simulated or implemented." };
    }

    // 5. Mock Logging (The Simulation Record)
    // We log success/failure to the implementation ledger with clear MOCK branding.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: logErr } = await (sb.from("ads_implementation_logs") as any).insert({
      recommendation_id: recommendationId,
      operator_id: operatorId,
      status: "MOCK_SUCCESS",
      details: "SIMULATION / DRY-RUN. No changes made to Google Ads.",
      attempted_at: new Date().toISOString()
    });

    if (logErr) {
      // 23505 = unique_violation: two requests raced past the step-4 check
      if ((logErr as { code?: string }).code === "23505") {
        return { success: false, code: "DUPLICATE_RUN", message: "This recommendation has already been simulated or implemented." };
      }
      console.error("[Simulator] Failed to write mock log:", logErr);
      return { success: false, code: "DB_ERROR", message: "Simulation completed but log write failed." };
    }

    // Note: Per Step 1 instructions, we do NOT change the recommendation status here.
    // The "implemented" status is reserved for actual execution in later slices.

    return {
      success: true,
      code: "SUCCESS",
      message: "Simulation successful. Mock implementation recorded in ledger.",
      details: {
        recommendationId,
        market: rec.market,
        type: rec.recommendation_type
      }
    };

  } catch (err) {
    console.error("[Simulator] Unexpected error:", err);
    return { success: false, code: "DB_ERROR", message: "An unexpected error occurred during simulation." };
  }
}
