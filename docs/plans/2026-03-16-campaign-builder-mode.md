# Campaign Builder Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the intelligence pipeline detect thin accounts and generate campaign-building recommendations (keyword_add, negative_add) that flow through the existing Approvals queue and execute in Google Ads.

**Architecture:** The existing `/api/ads/intelligence` route checks account maturity (keyword count, negative count, conversion actions). If thin, it swaps to a "builder" prompt that generates `keyword_add` and `negative_add` recommendations with keyword text + match type stored in `metadata` JSONB. A new `addKeyword` mutation in google-ads.ts handles execution. The same Approvals → Execute flow handles everything.

**Tech Stack:** Next.js API routes, Supabase Postgres, Google Ads API v18 mutations, Claude Opus 4.6

---

### Task 1: Add `addKeyword` mutation to google-ads.ts

**Files:**
- Modify: `src/lib/google-ads.ts`

**Step 1: Add the addKeyword export after addNegativeKeyword (line ~938)**

```typescript
export async function addKeyword(
  config: GoogleAdsConfig,
  adGroupId: string,
  keywordText: string,
  matchType: "BROAD" | "PHRASE" | "EXACT" = "EXACT",
  bidMicros?: number,
): Promise<unknown> {
  const criterion: Record<string, unknown> = {
    adGroup: `customers/${config.customerId}/adGroups/${adGroupId}`,
    status: "ENABLED",
    keyword: { text: keywordText, matchType },
  };
  if (bidMicros) {
    criterion.cpcBidMicros = String(bidMicros);
  }
  return mutate(config, [{
    adGroupCriterionOperation: {
      create: criterion,
    },
  }]);
}
```

**Step 2: Add createAdGroup export after addKeyword**

```typescript
export async function createAdGroup(
  config: GoogleAdsConfig,
  campaignId: string,
  adGroupName: string,
): Promise<unknown> {
  return mutate(config, [{
    adGroupOperation: {
      create: {
        campaign: `customers/${config.customerId}/campaigns/${campaignId}`,
        name: adGroupName,
        status: "ENABLED",
        type: "SEARCH_STANDARD",
      },
    },
  }]);
}
```

**Step 3: Update the imports in execute/route.ts**

In `src/app/api/ads/execute/route.ts` line 1-10, add `addKeyword` and `createAdGroup` to the import:

```typescript
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
```

**Step 4: Verify build**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/lib/google-ads.ts src/app/api/ads/execute/route.ts
git commit -m "feat(ads): add addKeyword and createAdGroup Google Ads mutations"
```

---

### Task 2: Add `keyword_add` and `ad_group_create` execution cases

**Files:**
- Modify: `src/app/api/ads/execute/route.ts`

**Step 1: Update the SELECT query to include metadata**

The existing select at line ~46 needs `metadata` added:

```typescript
const { data: rec, error: recErr } = await (sb
    .from("ads_recommendations") as any)
    .select("*, ads_keywords(google_keyword_id, ad_group_id, ads_ad_groups(google_ad_group_id, campaign_id, ads_campaigns(google_campaign_id)))")
    .eq("id", recommendationId)
    .eq("status", "approved")
    .maybeSingle();
```

The `*` already includes `metadata`, so no change needed here. The metadata JSONB field will contain `{ keyword_text, match_type, bid_micros }` for keyword_add and `{ ad_group_name }` for ad_group_create.

**Step 2: Add `keyword_add` case in the switch statement (before the `default` case)**

```typescript
      case "keyword_add": {
        // Metadata must contain keyword_text, match_type, and target ad group
        const meta = rec.metadata as Record<string, unknown> | null;
        const keywordText = meta?.keyword_text as string | undefined;
        const matchType = (meta?.match_type as string)?.toUpperCase() as "BROAD" | "PHRASE" | "EXACT" | undefined;
        if (!keywordText || !matchType) {
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

        const bidMicros = meta?.bid_micros ? Number(meta.bid_micros) : undefined;
        mutationResult = await addKeyword(config, googleAdGroupId, keywordText, matchType, bidMicros);
        break;
      }
      case "ad_group_create": {
        const meta = rec.metadata as Record<string, unknown> | null;
        const adGroupName = meta?.ad_group_name as string | undefined;
        if (!adGroupName) {
          return NextResponse.json({ error: "ad_group_create requires metadata.ad_group_name" }, { status: 422 });
        }

        // Resolve campaign Google ID
        let googleCampaignId: string | null = null;
        if (rec.related_campaign_id) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: campData } = await (sb.from("ads_campaigns") as any)
            .select("google_campaign_id")
            .eq("id", rec.related_campaign_id)
            .maybeSingle();
          googleCampaignId = campData?.google_campaign_id ?? null;
        }
        if (!googleCampaignId) {
          return NextResponse.json({ error: "Cannot resolve campaign for ad_group_create" }, { status: 422 });
        }

        mutationResult = await createAdGroup(config, googleCampaignId, adGroupName);
        break;
      }
```

**Step 3: Update the default error message**

```typescript
      default:
        return NextResponse.json({
          error: `Execution not yet supported for type: ${rec.recommendation_type}. Supported: keyword_pause, keyword_add, bid_adjust, negative_add, budget_adjust, ad_group_create.`
        }, { status: 400 });
```

**Step 4: Verify build**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/app/api/ads/execute/route.ts
git commit -m "feat(ads): add keyword_add and ad_group_create execution cases"
```

---

### Task 3: Add `keyword_add` and `ad_group_create` to recommendation types

**Files:**
- Modify: `src/lib/ads/recommendations.ts`
- Modify: `src/lib/ads/intel-to-recommendations.ts`

**Step 1: Update the RecommendationType union in recommendations.ts**

```typescript
export type RecommendationType =
  | "keyword_pause"
  | "keyword_add"
  | "bid_adjust"
  | "negative_add"
  | "budget_adjust"
  | "ad_group_create"
  | "copy_suggestion"
  | "waste_flag"
  | "opportunity_flag";
```

**Step 2: Update the validTypes array in insertValidatedRecommendations**

```typescript
    const validTypes = ["keyword_pause", "keyword_add", "bid_adjust", "negative_add", "budget_adjust", "ad_group_create", "copy_suggestion", "waste_flag", "opportunity_flag"];
```

**Step 3: Add builder-type validation in insertValidatedRecommendations**

After the existing entity validation block (after the `} else {` at line ~124 that checks for no entity), add a special case for builder types that only need a campaign reference and metadata:

The existing code at line 124 says:
```typescript
    } else {
      // A recommendation must map to at least ONE valid entity
      isValid = false;
    }
```

Change this to:

```typescript
    } else {
      // Builder types (keyword_add, ad_group_create, negative_add) can be valid
      // with just a campaign_id in metadata, resolved below
      const builderTypes = ["keyword_add", "ad_group_create", "negative_add"];
      if (!builderTypes.includes(recType)) {
        isValid = false;
      }
    }
```

For builder recommendations, the `metadata` JSONB field carries the actual payload (keyword text, match type, ad group name), and `related_campaign_id` is set directly by the builder pipeline. The existing entity validation would reject them because they don't have keyword/ad_group FKs yet (the entities don't exist — we're creating them). So we need to handle market resolution for builder types that have `related_campaign_id` set in their metadata.

Add this right before the `if (!isValid || !trueMarket)` check:

```typescript
    // Builder types may have campaign_id set directly without going through entity chain
    if (isValid && !trueMarket && raw.related_campaign_id && !row.related_campaign_id) {
      const { data: camp } = await sb.from("ads_campaigns")
        .select("id, market")
        .eq("id", raw.related_campaign_id)
        .maybeSingle();
      if (camp) {
        row.related_campaign_id = camp.id;
        trueMarket = camp.market;
      } else {
        isValid = false;
      }
    }
```

**Step 4: Update the RecType union in intel-to-recommendations.ts**

```typescript
type RecType =
  | "keyword_pause"
  | "keyword_add"
  | "bid_adjust"
  | "negative_add"
  | "budget_adjust"
  | "ad_group_create"
  | "copy_suggestion"
  | "waste_flag"
  | "opportunity_flag";
```

**Step 5: Verify build**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add src/lib/ads/recommendations.ts src/lib/ads/intel-to-recommendations.ts
git commit -m "feat(ads): add keyword_add and ad_group_create recommendation types with builder validation"
```

---

### Task 4: Builder mode detection and prompt in intelligence route

This is the core task. The intelligence route detects account maturity and swaps to a builder prompt when the account is thin.

**Files:**
- Modify: `src/app/api/ads/intelligence/route.ts`
- Create: `src/lib/ads/builder-to-recommendations.ts`

**Step 1: Create builder-to-recommendations.ts**

This file converts the AI's builder output into `keyword_add`, `negative_add`, and `ad_group_create` recommendations that go through the existing approvals queue.

```typescript
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

  // Insert all at once (bypass entity validation for builder recs)
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
```

**Step 2: Add builder mode detection and prompt to intelligence route**

In `src/app/api/ads/intelligence/route.ts`, after the data is fetched and aggregated (after line ~143 `const last7 = agg(metrics7);`), add account maturity detection:

```typescript
    // ── Account maturity detection ──────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [negativeRes, conversionRes] = await Promise.all([
      (sb.from("ads_negative_keywords") as any).select("id", { count: "exact", head: true }),
      (sb.from("ads_conversion_actions") as any).select("id", { count: "exact", head: true }),
    ]);

    const realKeywords = keywords.filter((k: Record<string, unknown>) =>
      k.text && k.text !== "" && k.google_keyword_id && k.google_keyword_id !== ""
    );
    const negativeCount = negativeRes.count ?? 0;
    const conversionCount = conversionRes.count ?? 0;
    const isBuilderMode = realKeywords.length < 5 || negativeCount < 3;
```

**Step 3: Add the builder prompt**

Add this constant at the top of the file (after the existing INTELLIGENCE_SYSTEM_PROMPT):

```typescript
const BUILDER_SYSTEM_PROMPT = `You are a senior Google Ads campaign builder for Dominion Home Deals, a cash home buyer in Spokane County WA (primary) and Kootenai County ID (secondary). They wholesale residential properties off-market.

Your job is to BUILD the campaign structure from scratch — ad groups, keywords, and negative keywords. The account is new or thin. Do NOT analyze performance (there isn't enough). Instead, create the foundation.

Target seller intent: people who want to sell their house fast for cash. NOT buyers looking to purchase homes.

Respond ONLY with the exact JSON format requested — no commentary, no markdown, no preamble.`;
```

**Step 4: Add the builder prompt and branching logic**

Replace the existing intelligence prompt section. After `isBuilderMode` is calculated, branch:

```typescript
    let parsed: Record<string, unknown>;
    let isBuilderResponse = false;

    if (isBuilderMode) {
      // ── Builder mode: generate campaign structure ──────────────────
      const builderPrompt = `## CAMPAIGN BUILDER

This Google Ads account is NEW or THIN. It needs structure built, not optimization.

Current state:
- ${campaigns.length} campaigns: ${campaigns.map((c: Record<string, unknown>) => `${c.name} (${c.market}, ${c.status})`).join(", ")}
- ${realKeywords.length} real keywords (with Google Ads IDs)
- ${negativeCount} negative keywords
- ${conversionCount} conversion actions
- ${searchTerms.length} search terms observed so far
- $${last30.spend.toFixed(2)} spent in 30 days, ${last30.clicks} clicks, ${last30.conversions} conversions

${searchTerms.length > 0 ? `Search terms people actually typed (showing what traffic you're getting):
${searchTerms.slice(0, 30).map((st: Record<string, unknown>) => `- "${st.search_term}" (${st.clicks} clicks, $${(Number(st.cost_micros ?? 0) / 1_000_000).toFixed(2)})`).join("\n")}` : "No search term data yet."}

## YOUR TASK

Build the campaign structure for a cash home buyer in Spokane/Kootenai:

1. Suggest 2-4 ad groups organized by seller situation (e.g., "Fast Cash Sale", "Inherited Property", "Distressed/As-Is", "Foreclosure/Pre-Foreclosure")
2. Generate 15-25 seller-intent keywords across those ad groups. Use EXACT and PHRASE match. Bid suggestion $8-15 per keyword.
3. Generate 20-30 negative keywords to block buyer intent, agent searches, and irrelevant traffic. Use PHRASE match for broad blocks, EXACT for specific terms.

Respond with a single JSON object:
{
  "account_assessment": "<1-2 sentences: current state and what's needed>",
  "ad_groups": [
    { "name": "<ad group name>", "purpose": "<1 sentence>", "campaign_name": "<target campaign>" }
  ],
  "keywords": [
    { "keyword_text": "<the keyword>", "match_type": "EXACT|PHRASE", "ad_group_name": "<target ad group>", "bid_dollars": <number>, "rationale": "<1 sentence>" }
  ],
  "negatives": [
    { "keyword_text": "<term to block>", "match_type": "PHRASE|EXACT", "level": "campaign", "rationale": "<1 sentence>" }
  ]
}`;

      const rawResponse = await analyzeWithClaude({
        prompt: builderPrompt,
        systemPrompt: BUILDER_SYSTEM_PROMPT,
        apiKey,
        maxTokens: 6000,
        model: "claude-opus-4-6",
      });

      const jsonStr = extractJsonObject(rawResponse);
      if (!jsonStr) {
        console.error("[Intelligence/Builder] Non-JSON response:", rawResponse.slice(0, 500));
        return NextResponse.json({ error: "Builder response could not be parsed. Please try again." }, { status: 422 });
      }
      try {
        parsed = JSON.parse(jsonStr);
      } catch (parseErr) {
        console.error("[Intelligence/Builder] JSON.parse failed:", parseErr);
        return NextResponse.json({ error: "Builder response could not be parsed. Please try again." }, { status: 422 });
      }
      isBuilderResponse = true;

    } else {
      // ── Normal optimization mode ──────────────────────────────────
```

Then the existing optimization prompt code follows (the `intelligencePrompt` variable, the `analyzeWithClaude` call, and the JSON parsing). Close the else block after the existing JSON parsing.

**Step 5: Add the builder-to-recommendations conversion**

Add the import at the top of the file:

```typescript
import { convertBuilderToRecommendations } from "@/lib/ads/builder-to-recommendations";
```

Then after the existing recommendation conversion block (around line ~328), add the builder path:

```typescript
    // ── Convert to recommendations ──────────────────────────────────
    let recommendations = { created: 0, skipped: 0, total: 0 };
    if (briefingId && isBuilderResponse) {
      try {
        recommendations = await convertBuilderToRecommendations(
          sb,
          parsed as any,
          briefingId,
        );
      } catch (recErr) {
        console.error("[Intelligence] Builder recommendation conversion failed:", recErr);
      }
    } else if (briefingId && dataPoints.length > 0) {
      try {
        recommendations = await convertIntelToRecommendations(sb, dataPoints, briefingId);
      } catch (recErr) {
        console.error("[Intelligence] Recommendation conversion failed (non-blocking):", recErr);
      }
    }
```

**Step 6: Ensure the builder response is saved correctly**

The existing persist-to-database block saves `parsed.briefing_date`, `parsed.account_status`, etc. For builder mode, the shape is different. Adapt the insert:

```typescript
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dataPoints = isBuilderResponse ? [] : ((parsed.data_points ?? []) as any[]);

    const { data: savedBriefing, error: saveErr } = await (sb.from("ads_intelligence_briefings") as any)
      .insert({
        briefing_date: parsed.briefing_date ?? new Date().toISOString().split("T")[0],
        account_status: isBuilderResponse ? "building" : (parsed.account_status ?? "caution"),
        executive_summary: isBuilderResponse
          ? (parsed.account_assessment as string ?? "Account is in builder mode — generating campaign structure.")
          : (parsed.executive_summary ?? ""),
        total_estimated_monthly_waste: isBuilderResponse ? 0 : (parsed.total_estimated_monthly_waste ?? 0),
        total_estimated_monthly_opportunity: isBuilderResponse ? 0 : (parsed.total_estimated_monthly_opportunity ?? 0),
        data_points: isBuilderResponse
          ? [{ rank: 1, category: "structural", signal: parsed.account_assessment, urgency: "act_now", confidence: "confirmed", market: "both", recommended_action: "Review and approve the builder recommendations in the Approvals tab." }]
          : dataPoints,
        adversarial_result: isBuilderResponse ? null : adversarialPayload,
        trigger,
      })
      .select("id, created_at")
      .single();
```

**Step 7: Skip adversarial review in builder mode**

Wrap the adversarial review block in a condition:

```typescript
    let adversarialResult = null;
    if (!isBuilderResponse && openaiKey) {
      try {
        adversarialResult = await runAdversarialReview({
          rawData: rawDataContext,
          primaryAnalysis: JSON.stringify(parsed, null, 2),
          openaiKey,
        });
      } catch (advErr) {
        console.error("[Intelligence] Adversarial review failed (non-blocking):", advErr);
      }
    }
```

**Step 8: Verify build**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds

**Step 9: Commit**

```bash
git add src/app/api/ads/intelligence/route.ts src/lib/ads/builder-to-recommendations.ts
git commit -m "feat(ads): add builder mode to intelligence pipeline — generates keyword_add, negative_add, ad_group_create recommendations for thin accounts"
```

---

### Task 5: Update Approvals table to show builder recommendation details

**Files:**
- Modify: `src/components/sentinel/ads/pending-approvals-table.tsx`
- Modify: `src/app/api/ads/approvals/route.ts`

**Step 1: Add metadata to the Approvals API response**

In `src/app/api/ads/approvals/route.ts`, add `metadata` to the SELECT:

The select already includes `*` via the enrichment map, but the explicit field list doesn't include metadata. Add it:

After `created_at,` in the select string, add:
```
      metadata,
```

In the enriched map return object, add:
```typescript
      metadata: rec.metadata ?? null,
```

**Step 2: Add metadata to the PendingRecommendation interface**

```typescript
interface PendingRecommendation {
  id: string;
  recommendation_type: string;
  risk_level: "green" | "yellow" | "red";
  expected_impact: string;
  reason: string;
  market: string;
  created_at: string;
  related_campaign_id?: number;
  related_ad_group_id?: number;
  related_keyword_id?: number;
  entity_name?: string;
  campaign_name?: string;
  executable?: boolean;
  metadata?: Record<string, unknown> | null;
}
```

**Step 3: Update the entity column to show builder details**

For `keyword_add` and `negative_add` recommendations, the entity column should show the keyword text from metadata instead of "Unknown":

In the entity name display section (the `<td>` for Market/Entity), update the entity type label:

```typescript
<span className="font-semibold text-foreground/90">
  {rec.recommendation_type === "keyword_add" ? "Add Keyword" :
   rec.recommendation_type === "negative_add" ? "Block Term" :
   rec.recommendation_type === "ad_group_create" ? "New Ad Group" :
   rec.related_keyword_id ? "Keyword" :
   rec.related_ad_group_id ? "Ad Group" : "Campaign"}
</span>
```

And show the keyword text from metadata when entity_name is unknown:

```typescript
<span className="text-[11px] text-foreground/60 truncate max-w-[180px]" title={rec.entity_name}>
  {rec.entity_name && rec.entity_name !== "Unknown" && rec.entity_name !== "Unknown keyword"
    ? rec.entity_name
    : (rec.metadata?.keyword_text as string) ?? (rec.metadata?.ad_group_name as string) ?? null}
</span>
{(rec.metadata?.match_type) && (
  <span className="text-[9px] text-muted-foreground/40 font-mono uppercase">
    {rec.metadata.match_type as string}
  </span>
)}
```

**Step 4: Mark builder recommendations as executable**

In the approvals route enrichment, builder types that have metadata are always executable (they create new entities, they don't need existing Google IDs):

```typescript
    // Builder types with metadata are always executable
    const builderTypes = ["keyword_add", "ad_group_create"];
    if (builderTypes.includes(rec.recommendation_type) && rec.metadata) {
      executable = true;
    }
```

Add this after the `nonMutating` check.

**Step 5: Verify build**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add src/components/sentinel/ads/pending-approvals-table.tsx src/app/api/ads/approvals/route.ts
git commit -m "feat(ads): show builder recommendation details in Approvals table — keyword text, match type, entity labels"
```

---

### Task 6: Update the negative_add execution to use metadata when available

**Files:**
- Modify: `src/app/api/ads/execute/route.ts`

**Step 1: Update the negative_add case to prefer metadata**

The existing `negative_add` case extracts keyword text from the `reason` field using regex. Builder recommendations store it cleanly in `metadata.keyword_text`. Update the case:

```typescript
      case "negative_add": {
        // Resolve campaign
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
        const meta = rec.metadata as Record<string, unknown> | null;
        const negText = (meta?.keyword_text as string)
          ?? rec.reason?.match(/["']([^"']+)["']/)?.[1]
          ?? rec.reason?.split(".")[0]?.trim();
        if (!negText) {
          return NextResponse.json({ error: "Cannot extract negative keyword text" }, { status: 422 });
        }
        const negMatchType = (meta?.match_type as string)?.toUpperCase() as "BROAD" | "PHRASE" | "EXACT" | undefined;
        mutationResult = await addNegativeKeyword(config, googleCampaignId, negText, negMatchType ?? "EXACT");
        break;
      }
```

**Step 2: Verify build**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/app/api/ads/execute/route.ts
git commit -m "fix(ads): negative_add execution prefers metadata.keyword_text over regex extraction"
```

---

### Task 7: Final integration test and deploy

**Step 1: Full build verification**

Run: `npx next build 2>&1 | tail -10`
Expected: Clean build, no errors

**Step 2: Git status and final commit if needed**

```bash
git status
git log --oneline -8
```

**Step 3: Deploy to Vercel**

```bash
git push origin main
vercel --prod
```

**Step 4: Test the full flow**

1. Go to Ads Command Center → Key Intel tab
2. Click Refresh — should detect thin account and run builder mode
3. Check Approvals tab — should see 30-50 pending recommendations (keyword_add, negative_add, ad_group_create)
4. Approve one negative keyword → Execute → verify it appears in Google Ads
5. Approve one keyword_add → Execute → verify it appears in Google Ads
