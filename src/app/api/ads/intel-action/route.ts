import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  refreshAccessToken,
  getGoogleAdsConfig,
  setKeywordStatus,
  addNegativeKeyword,
  updateCampaignBudget,
  setAdGroupStatus,
} from "@/lib/google-ads";

export const dynamic = "force-dynamic";

/**
 * POST /api/ads/intel-action
 *
 * Execute a fix directly from an intelligence finding.
 * Bypasses the recommendation/approval flow for speed.
 * All mutations are logged to ads_implementation_logs.
 *
 * Body: {
 *   action: "add_negatives" | "pause_keyword" | "pause_keywords_broad" | "budget_adjust" | "pause_ad_group",
 *   params: { ... action-specific params ... },
 *   finding: { rank, signal, recommended_action }  // for logging
 * }
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await sb.auth.getUser(token ?? "");
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    action?: string;
    params?: Record<string, unknown>;
    finding?: { rank?: number; signal?: string; recommended_action?: string };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action, params, finding } = body;
  if (!action || !params) {
    return NextResponse.json({ error: "action and params required" }, { status: 400 });
  }

  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  if (!refreshToken) {
    return NextResponse.json({ error: "GOOGLE_ADS_REFRESH_TOKEN not configured" }, { status: 503 });
  }

  try {
    const accessToken = await refreshAccessToken(refreshToken);
    const config = getGoogleAdsConfig(accessToken);
    const results: unknown[] = [];
    let actionDesc = action;

    switch (action) {
      // ── Add negative keywords at campaign level ──
      case "add_negatives": {
        const keywords = params.keywords as string[];
        const campaignId = params.campaignId as string;
        const matchType = (params.matchType as string)?.toUpperCase() as "BROAD" | "PHRASE" | "EXACT" || "EXACT";

        if (!keywords?.length || !campaignId) {
          return NextResponse.json({ error: "add_negatives requires keywords[] and campaignId" }, { status: 400 });
        }

        // Resolve Google campaign ID from DB
        let googleCampaignId = campaignId;
        if (!campaignId.match(/^\d+$/)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: camp } = await (sb.from("ads_campaigns") as any)
            .select("google_campaign_id")
            .eq("id", campaignId)
            .maybeSingle();
          googleCampaignId = camp?.google_campaign_id ?? campaignId;
        }

        for (const kw of keywords) {
          // Strip trailing commas, quotes, and other invalid chars from parsed keywords
          const trimmed = kw.trim().replace(/[,;:!?'"]+$/g, "").replace(/^[,;:!?'"]+/g, "").trim().toLowerCase();
          if (!trimmed) continue;
          try {
            const r = await addNegativeKeyword(config, googleCampaignId, trimmed, matchType);
            results.push({ keyword: trimmed, status: "added", result: r });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            // Duplicate negative keyword is OK — just skip
            if (msg.includes("DUPLICATE") || msg.includes("already exists")) {
              results.push({ keyword: trimmed, status: "already_exists" });
            } else {
              results.push({ keyword: trimmed, status: "error", error: msg });
            }
          }
        }
        actionDesc = `add_negatives (${results.filter((r: any) => (r as any).status === "added").length}/${keywords.length})`;
        break;
      }

      // ── Pause a specific keyword by ID ──
      case "pause_keyword": {
        const keywordId = params.keywordId as string;
        const adGroupId = params.adGroupId as string;

        if (!keywordId || !adGroupId) {
          return NextResponse.json({ error: "pause_keyword requires keywordId and adGroupId" }, { status: 400 });
        }

        const r = await setKeywordStatus(config, adGroupId, keywordId, "PAUSED");
        results.push({ keywordId, status: "paused", result: r });

        // Update local DB
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb.from("ads_keywords") as any)
          .update({ status: "PAUSED" })
          .eq("google_keyword_id", keywordId);
        break;
      }

      // ── Pause all broad match keywords in an ad group ──
      case "pause_keywords_broad": {
        const targetAdGroupName = params.adGroupName as string;
        if (!targetAdGroupName) {
          return NextResponse.json({ error: "pause_keywords_broad requires adGroupName" }, { status: 400 });
        }

        // Find the ad group — try exact match first, then ilike, pick shortest name match
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let { data: ag } = await (sb.from("ads_ad_groups") as any)
          .select("id, google_ad_group_id, name")
          .eq("name", targetAdGroupName)
          .maybeSingle();

        if (!ag?.google_ad_group_id) {
          // Fallback: ilike with multiple results, pick best match
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: agMatches } = await (sb.from("ads_ad_groups") as any)
            .select("id, google_ad_group_id, name")
            .ilike("name", `%${targetAdGroupName}%`)
            .not("google_ad_group_id", "eq", "")
            .order("name");
          // Pick the shortest matching name (most specific match)
          if (agMatches?.length) {
            ag = agMatches.sort((a: { name: string }, b: { name: string }) => a.name.length - b.name.length)[0];
          }
        }

        if (!ag?.google_ad_group_id) {
          return NextResponse.json({ error: `Ad group "${targetAdGroupName}" not found` }, { status: 404 });
        }

        // Find all broad match keywords in this ad group
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: broadKws } = await (sb.from("ads_keywords") as any)
          .select("id, google_keyword_id, text, match_type")
          .eq("ad_group_id", ag.id)
          .eq("match_type", "BROAD")
          .eq("status", "ENABLED");

        if (!broadKws?.length) {
          return NextResponse.json({ ok: true, message: "No enabled broad match keywords found", results: [] });
        }

        for (const kw of broadKws) {
          if (!kw.google_keyword_id) continue;
          try {
            const r = await setKeywordStatus(config, ag.google_ad_group_id, kw.google_keyword_id, "PAUSED");
            results.push({ keywordId: kw.google_keyword_id, text: kw.text, status: "paused", result: r });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (sb.from("ads_keywords") as any)
              .update({ status: "PAUSED" })
              .eq("id", kw.id);
          } catch (err) {
            results.push({ keywordId: kw.google_keyword_id, text: kw.text, status: "error", error: String(err) });
          }
        }
        actionDesc = `pause_keywords_broad (${results.filter((r: any) => (r as any).status === "paused").length}/${broadKws.length} in ${targetAdGroupName})`;
        break;
      }

      // ── Adjust campaign budget ──
      case "budget_adjust": {
        const newDailyBudget = params.newDailyBudget as number;
        if (!newDailyBudget || newDailyBudget < 1 || newDailyBudget > 10000) {
          return NextResponse.json({ error: "budget_adjust requires newDailyBudget ($1-$10,000)" }, { status: 400 });
        }

        // Get the campaign budget — try DB first, fallback to API
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: budgets } = await (sb.from("ads_campaign_budgets") as any)
          .select("google_budget_id, campaign_id")
          .limit(1)
          .maybeSingle();

        let googleBudgetId = budgets?.google_budget_id;

        // If DB is empty, fetch budget from Google Ads API directly
        if (!googleBudgetId) {
          const { fetchCampaignBudgets } = await import("@/lib/google-ads");
          const apiBudgets = await fetchCampaignBudgets(config);
          if (apiBudgets.length > 0) {
            googleBudgetId = apiBudgets[0].budgetId;
          }
        }

        if (!googleBudgetId) {
          return NextResponse.json({ error: "No campaign budget found — run a sync first, or check Google Ads" }, { status: 404 });
        }

        const newBudgetMicros = Math.round(newDailyBudget * 1_000_000);
        const r = await updateCampaignBudget(config, googleBudgetId, newBudgetMicros);
        results.push({ newDailyBudget, status: "adjusted", result: r });

        // Update local DB if exists
        if (budgets?.google_budget_id) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (sb.from("ads_campaign_budgets") as any)
            .update({ daily_budget_micros: newBudgetMicros })
            .eq("google_budget_id", budgets.google_budget_id);
        }
        break;
      }

      // ── Pause an ad group ──
      case "pause_ad_group": {
        const agName = params.adGroupName as string;
        if (!agName) {
          return NextResponse.json({ error: "pause_ad_group requires adGroupName" }, { status: 400 });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: ag } = await (sb.from("ads_ad_groups") as any)
          .select("google_ad_group_id")
          .ilike("name", `%${agName}%`)
          .maybeSingle();

        if (!ag?.google_ad_group_id) {
          return NextResponse.json({ error: `Ad group "${agName}" not found` }, { status: 404 });
        }

        const r = await setAdGroupStatus(config, ag.google_ad_group_id, "PAUSED");
        results.push({ adGroupName: agName, status: "paused", result: r });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb.from("ads_ad_groups") as any)
          .update({ status: "PAUSED" })
          .eq("google_ad_group_id", ag.google_ad_group_id);
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    // Log the action
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("ads_implementation_logs") as any).insert({
      implemented_by: user.id,
      result: "SUCCESS",
      action_taken: actionDesc,
      notes: JSON.stringify({
        source: "intel_action",
        finding: finding ?? null,
        params,
        results,
      }),
      implemented_at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, action: actionDesc, results });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[Ads/IntelAction]", errMsg);

    // Log failure
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("ads_implementation_logs") as any).insert({
        implemented_by: user.id,
        result: "FAILED",
        action_taken: action,
        notes: JSON.stringify({ source: "intel_action", finding, params, error: errMsg }),
        implemented_at: new Date().toISOString(),
      });
    } catch (logErr) {
      console.error("[Ads/IntelAction] Failed to log:", logErr);
    }

    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
