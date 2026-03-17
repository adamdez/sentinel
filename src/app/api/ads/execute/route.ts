import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  refreshAccessToken,
  getGoogleAdsConfig,
  setKeywordStatus,
  updateKeywordBid,
  updateCampaignBudget,
  addNegativeKeyword,
  addKeyword,
  createAdGroup,
} from "@/lib/google-ads";

export const dynamic = "force-dynamic";

/**
 * POST /api/ads/execute
 *
 * Executes an approved recommendation in Google Ads.
 * Requires: { recommendationId: string, confirmation?: string }
 * Red-risk recommendations require confirmation === "CONFIRM"
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await sb.auth.getUser(token ?? "");
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { recommendationId?: string; confirmation?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { recommendationId, confirmation } = body;

  if (!recommendationId) {
    return NextResponse.json({ error: "recommendationId required" }, { status: 400 });
  }

  // Fetch the recommendation with joined entity data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rec, error: recErr } = await (sb
    .from("ads_recommendations") as any)
    .select("*, ads_keywords(google_keyword_id, ad_group_id, ads_ad_groups(google_ad_group_id, campaign_id, ads_campaigns(google_campaign_id)))")
    .eq("id", recommendationId)
    .eq("status", "approved")
    .maybeSingle();

  if (recErr || !rec) {
    return NextResponse.json({ error: "Recommendation not found or not approved" }, { status: 404 });
  }

  // Freshness check — 7 day max
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  if (new Date(rec.created_at) < sevenDaysAgo) {
    return NextResponse.json({ error: "Recommendation is stale (>7 days). Please re-run intel and generate fresh recommendations." }, { status: 409 });
  }

  // Red-risk confirmation gate
  if (rec.risk_level === "red" && confirmation !== "CONFIRM") {
    return NextResponse.json({
      error: "Red-risk recommendation requires confirmation. Send { confirmation: 'CONFIRM' } to proceed.",
      requiresConfirmation: true
    }, { status: 400 });
  }

  // Execute the mutation
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  if (!refreshToken) {
    return NextResponse.json({ error: "GOOGLE_ADS_REFRESH_TOKEN not configured" }, { status: 503 });
  }

  try {
    const accessToken = await refreshAccessToken(refreshToken);
    const config = getGoogleAdsConfig(accessToken);
    let mutationResult: unknown = null;

    switch (rec.recommendation_type) {
      case "keyword_pause": {
        const kw = rec.ads_keywords;
        const ag = kw?.ads_ad_groups;
        if (!kw?.google_keyword_id || !ag?.google_ad_group_id) {
          return NextResponse.json({ error: "Cannot resolve keyword entity for execution" }, { status: 422 });
        }
        mutationResult = await setKeywordStatus(config, ag.google_ad_group_id, kw.google_keyword_id, "PAUSED");
        break;
      }
      case "bid_adjust": {
        const kw = rec.ads_keywords;
        const ag = kw?.ads_ad_groups;
        if (!kw?.google_keyword_id || !ag?.google_ad_group_id) {
          return NextResponse.json({ error: "Cannot resolve keyword entity for execution" }, { status: 422 });
        }
        const bidMatch = rec.expected_impact?.match(/\$?([\d.]+)/);
        const bidDollars = bidMatch ? parseFloat(bidMatch[1]) : null;
        if (!bidDollars || bidDollars < 0.01 || bidDollars > 100) {
          return NextResponse.json({ error: "Cannot determine valid bid amount (must be $0.01–$100). Parsed: " + bidDollars }, { status: 422 });
        }
        const newBidMicros = Math.round(bidDollars * 1_000_000);
        mutationResult = await updateKeywordBid(config, ag.google_ad_group_id, kw.google_keyword_id, newBidMicros);
        break;
      }
      case "negative_add": {
        // Resolve campaign from keyword chain or directly
        let googleCampaignId: string | null = null;
        const camp = rec.ads_keywords?.ads_ad_groups?.ads_campaigns;
        if (camp?.google_campaign_id) {
          googleCampaignId = camp.google_campaign_id;
        } else if (rec.related_campaign_id) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: campData } = await (sb.from("ads_campaigns") as any)
            .select("google_campaign_id")
            .eq("id", rec.related_campaign_id)
            .maybeSingle();
          googleCampaignId = campData?.google_campaign_id ?? null;
        }
        if (!googleCampaignId) {
          return NextResponse.json({ error: "Cannot resolve campaign for negative keyword" }, { status: 422 });
        }
        // Prefer metadata for keyword text and match type (builder mode)
        const negMeta = rec.metadata as Record<string, unknown> | null;
        const negText = (negMeta?.keyword_text as string)
          ?? rec.reason?.match(/["']([^"']+)["']/)?.[1]
          ?? rec.reason?.split(".")[0]?.trim();
        if (!negText) {
          return NextResponse.json({ error: "Cannot extract negative keyword text" }, { status: 422 });
        }
        const negMatchType = (negMeta?.match_type as string)?.toUpperCase() as "BROAD" | "PHRASE" | "EXACT" | undefined;
        mutationResult = await addNegativeKeyword(config, googleCampaignId, negText, negMatchType ?? "EXACT");
        break;
      }
      case "keyword_add": {
        // Metadata must contain keyword_text, match_type, and target ad group
        const kwMeta = rec.metadata as Record<string, unknown> | null;
        const keywordText = kwMeta?.keyword_text as string | undefined;
        const kwMatchType = (kwMeta?.match_type as string)?.toUpperCase() as "BROAD" | "PHRASE" | "EXACT" | undefined;
        if (!keywordText || !kwMatchType) {
          return NextResponse.json({ error: "keyword_add requires metadata.keyword_text and metadata.match_type" }, { status: 422 });
        }

        // Resolve the ad group's Google ID
        let googleAdGroupId: string | null = null;
        if (rec.related_ad_group_id) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: agData } = await (sb.from("ads_ad_groups") as any)
            .select("google_ad_group_id")
            .eq("id", rec.related_ad_group_id)
            .maybeSingle();
          googleAdGroupId = agData?.google_ad_group_id ?? null;
        }
        if (!googleAdGroupId) {
          return NextResponse.json({ error: "Cannot resolve ad group for keyword_add" }, { status: 422 });
        }

        const kwBidMicros = kwMeta?.bid_micros ? Number(kwMeta.bid_micros) : undefined;
        mutationResult = await addKeyword(config, googleAdGroupId, keywordText, kwMatchType, kwBidMicros);
        break;
      }
      case "ad_group_create": {
        const agMeta = rec.metadata as Record<string, unknown> | null;
        const adGroupName = agMeta?.ad_group_name as string | undefined;
        if (!adGroupName) {
          return NextResponse.json({ error: "ad_group_create requires metadata.ad_group_name" }, { status: 422 });
        }

        // Resolve campaign Google ID
        let googleCampId: string | null = null;
        if (rec.related_campaign_id) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: campData } = await (sb.from("ads_campaigns") as any)
            .select("google_campaign_id")
            .eq("id", rec.related_campaign_id)
            .maybeSingle();
          googleCampId = campData?.google_campaign_id ?? null;
        }
        if (!googleCampId) {
          return NextResponse.json({ error: "Cannot resolve campaign for ad_group_create" }, { status: 422 });
        }

        mutationResult = await createAdGroup(config, googleCampId, adGroupName);
        break;
      }
      case "budget_adjust": {
        if (!rec.related_campaign_id) {
          return NextResponse.json({ error: "No campaign linked for budget adjustment" }, { status: 422 });
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: budgetData } = await (sb.from("ads_campaign_budgets") as any)
          .select("google_budget_id")
          .eq("campaign_id", rec.related_campaign_id)
          .maybeSingle();
        const amountMatch = rec.expected_impact?.match(/\$?([\d.]+)/);
        const budgetDollars = amountMatch ? parseFloat(amountMatch[1]) : null;
        if (!budgetData?.google_budget_id || !budgetDollars || budgetDollars < 1 || budgetDollars > 10000) {
          return NextResponse.json({ error: "Cannot resolve budget entity or valid amount ($1–$10,000). Parsed: " + budgetDollars }, { status: 422 });
        }
        const newBudgetMicros = Math.round(budgetDollars * 1_000_000);
        mutationResult = await updateCampaignBudget(config, budgetData.google_budget_id, newBudgetMicros);
        break;
      }
      default:
        return NextResponse.json({
          error: `Execution not yet supported for type: ${rec.recommendation_type}. Supported: keyword_pause, keyword_add, bid_adjust, negative_add, budget_adjust, ad_group_create.`
        }, { status: 400 });
    }

    // Log success
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("ads_implementation_logs") as any).insert({
      recommendation_id: recommendationId,
      executed_by: user.id,
      result: "SUCCESS",
      details: JSON.stringify(mutationResult),
      executed_at: new Date().toISOString(),
    });

    // Update recommendation status to executed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("ads_recommendations") as any)
      .update({ status: "executed" })
      .eq("id", recommendationId);

    return NextResponse.json({ ok: true, executed: rec.recommendation_type, result: mutationResult });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[Ads/Execute]", errMsg);

    // Log failure (non-blocking)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("ads_implementation_logs") as any).insert({
        recommendation_id: recommendationId,
        executed_by: user.id,
        result: "FAILED",
        details: errMsg,
        executed_at: new Date().toISOString(),
      });
    } catch (logErr) {
      console.error("[Ads/Execute] Failed to log execution failure:", logErr);
    }

    return NextResponse.json({ error: `Execution failed: ${errMsg}` }, { status: 500 });
  }
}
