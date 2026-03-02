import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { runCrawlerPhase, runAttomPhase } from "@/lib/agent/ai-agent-core";
import { blendHeatScore } from "@/lib/scoring-predictive";
import { getScoreLabel } from "@/lib/scoring";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const PLATINUM_FLOOR = 90;
const PLATINUM_DET_FLOOR = 85;
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

/**
 * GET /api/ingest/platinum-seed
 *
 * Query-only: returns current Platinum prospect counts from DB.
 * Uses BOTH deterministic (scoring_records.composite_score) and
 * blended (leads.priority) for classification.
 */
export async function GET() {
  const sb = createServerClient();

  // Total prospects
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: totalProspects } = await (sb.from("leads") as any)
    .select("id", { count: "exact", head: true })
    .eq("status", "prospect");

  // Platinum by blended score (leads.priority >= 90)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: platinumBlended } = await (sb.from("leads") as any)
    .select("id", { count: "exact", head: true })
    .eq("status", "prospect")
    .gte("priority", PLATINUM_FLOOR);

  // Platinum by blended score (leads.priority >= 85)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: platinumBlended85 } = await (sb.from("leads") as any)
    .select("id", { count: "exact", head: true })
    .eq("status", "prospect")
    .gte("priority", PLATINUM_DET_FLOOR);

  // Top 10%
  const top10PctCount = totalProspects ? Math.ceil(totalProspects * 0.1) : 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: top10PctLeads } = await (sb.from("leads") as any)
    .select("id, priority")
    .eq("status", "prospect")
    .order("priority", { ascending: false })
    .limit(top10PctCount);
  const top10PctFloor = top10PctLeads?.length
    ? top10PctLeads[top10PctLeads.length - 1]?.priority ?? 0
    : 0;

  // Deterministic platinum: latest scoring_records per property joined to prospect leads
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: detPlatinum } = await (sb.from("scoring_records") as any)
    .select("property_id, composite_score")
    .gte("composite_score", PLATINUM_DET_FLOOR)
    .order("created_at", { ascending: false })
    .limit(5000);

  // Cross-reference with prospect leads
  const platPropIds = new Set((detPlatinum ?? []).map((r: { property_id: string }) => r.property_id));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prospectLeads } = await (sb.from("leads") as any)
    .select("id, property_id, priority, source, tags")
    .eq("status", "prospect")
    .order("priority", { ascending: false })
    .limit(5000);

  const platProspects = (prospectLeads ?? []).filter(
    (l: { property_id: string }) => platPropIds.has(l.property_id)
  );

  // Score distribution across ALL prospects
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: countGte85 } = await (sb.from("leads") as any)
    .select("id", { count: "exact", head: true })
    .eq("status", "prospect").gte("priority", 85);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: countGte65 } = await (sb.from("leads") as any)
    .select("id", { count: "exact", head: true })
    .eq("status", "prospect").gte("priority", 65);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: countGte40 } = await (sb.from("leads") as any)
    .select("id", { count: "exact", head: true })
    .eq("status", "prospect").gte("priority", 40);

  return NextResponse.json({
    totalProspects,
    platinum: {
      blendedGte90: platinumBlended,
      blendedGte85: platinumBlended85,
      deterministicGte85: detPlatinum?.length ?? 0,
      deterministicProspects: platProspects.length,
      top10Percent: { count: top10PctCount, floor: top10PctFloor },
    },
    distribution: {
      platinum_gte85: countGte85,
      gold_gte65: (countGte65 ?? 0) - (countGte85 ?? 0),
      silver_gte40: (countGte40 ?? 0) - (countGte65 ?? 0),
      bronze_lt40: (totalProspects ?? 0) - (countGte40 ?? 0),
    },
    topPlatinum: platProspects.slice(0, 25).map((l: Record<string, unknown>) => ({
      id: l.id,
      property_id: l.property_id,
      blendedScore: l.priority,
      source: l.source,
      tags: l.tags,
    })),
  });
}

/**
 * POST /api/ingest/platinum-seed
 *
 * Maximum Platinum Seed — runs EVERY source at max capacity:
 *   1. PropertyRadar bulk pull (1000/county × target counties)
 *   2. All 3 predictive crawlers (obituary, court docket, utility shutoff)
 *   3. ATTOM daily delta (if API key present)
 *   4. Post-ingest: query for all Platinum prospects (blended ≥90 or top 10%)
 *
 * Auth: CRON_SECRET bearer token or admin userId in body.
 */
export async function POST(req: Request) {
  const incomingAuth = req.headers.get("authorization") ?? "";
  const bearerToken = incomingAuth.replace("Bearer ", "");
  const cronSecret = process.env.CRON_SECRET;
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* defaults */ }

  let isAdmin = false;
  if (cronSecret && bearerToken === cronSecret) {
    isAdmin = true;
  } else if (body.userId) {
    const sb = createServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (sb.from("user_profiles") as any)
      .select("role").eq("id", body.userId).single();
    isAdmin = profile?.role === "admin";
  }
  if (!isAdmin && cronSecret) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const startTime = Date.now();
  const counties = (body.counties as string[]) ?? ["Spokane", "Kootenai"];
  // Always use localhost for internal API calls in dev
  const baseUrl = "http://localhost:3000";
  // Forward the exact auth header for internal calls
  const authHeader = cronSecret ? `Bearer ${cronSecret}` : incomingAuth;

  console.log(`[PlatinumSeed] === MAXIMUM PLATINUM SEED STARTED === counties=[${counties}]`);

  const phases: Record<string, unknown> = {};

  // ── Phase 1: PropertyRadar Targeted Distress Pulls ─────────────────
  // Run targeted pulls per distress lens, then a generic bulk pull.
  // Targeted pulls hit probate/foreclosure/tax/vacant which score highest.
  const distressLenses = ["probate", "foreclosure", "tax", "vacant", "divorce", "bankruptcy"];
  const prResults: Record<string, unknown>[] = [];

  for (const lens of distressLenses) {
    for (const county of counties) {
      try {
        console.log(`[PlatinumSeed] Phase 1: PR distress pull — ${county} / ${lens} (200 max)...`);
        const res = await fetch(`${baseUrl}/api/ingest/propertyradar/bulk-seed`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: authHeader },
          body: JSON.stringify({ counties: [county], limit: 200, distressLens: lens }),
        });
        const data = await res.json();
        prResults.push({ county, lens, ...data });
        console.log(`[PlatinumSeed] PR ${county}/${lens}: ${data.inserted ?? 0} new, ${data.scoreBreakdown?.platinum ?? 0} plat`);
      } catch (err) {
        console.error(`[PlatinumSeed] PR ${county}/${lens} error:`, err);
        prResults.push({ county, lens, error: String(err) });
      }
    }
  }
  phases.propertyRadar = prResults;

  // ── Phase 2: All Predictive Crawlers ──────────────────────────────
  try {
    console.log("[PlatinumSeed] Phase 2: Running ALL crawlers (obituary + court docket + utility shutoff)...");
    const crawlerResult = await runCrawlerPhase();
    phases.crawlers = crawlerResult;
    const totalPromoted = crawlerResult.results.reduce((s, r) => s + r.promoted, 0);
    console.log(`[PlatinumSeed] Phase 2 complete — ${totalPromoted} promoted from crawlers`);
  } catch (err) {
    console.error("[PlatinumSeed] Phase 2 error:", err);
    phases.crawlers = { error: String(err) };
  }

  // ── Phase 3: ATTOM Daily Delta ────────────────────────────────────
  try {
    console.log("[PlatinumSeed] Phase 3: ATTOM daily delta...");
    const attomResult = await runAttomPhase();
    phases.attom = {
      success: attomResult.success,
      skipped: attomResult.skipped,
      reason: attomResult.reason,
      totalApiCalls: attomResult.totalApiCalls,
      estimatedCost: attomResult.estimatedCost,
      promoted: attomResult.counties.reduce((s, c) => s + c.promoted, 0),
    };
    console.log(`[PlatinumSeed] Phase 3 complete — ${attomResult.skipped ? "SKIPPED" : `${attomResult.totalApiCalls} API calls`}`);
  } catch (err) {
    console.error("[PlatinumSeed] Phase 3 error:", err);
    phases.attom = { error: String(err) };
  }

  // ── Phase 4: Query for Platinum Prospects ─────────────────────────
  const sb = createServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: totalProspects } = await (sb.from("leads") as any)
    .select("id", { count: "exact", head: true })
    .eq("status", "prospect");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: platinumLeads, count: platinumCount } = await (sb.from("leads") as any)
    .select("id, property_id, priority, source, tags, promoted_at", { count: "exact" })
    .eq("status", "prospect")
    .gte("priority", PLATINUM_FLOOR)
    .order("priority", { ascending: false });

  // Top 10% threshold
  const top10PctThreshold = totalProspects && totalProspects > 0
    ? Math.ceil(totalProspects * 0.1)
    : 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: top10PctLeads } = await (sb.from("leads") as any)
    .select("id, priority")
    .eq("status", "prospect")
    .order("priority", { ascending: false })
    .limit(top10PctThreshold);

  const top10PctFloor = top10PctLeads?.length
    ? top10PctLeads[top10PctLeads.length - 1]?.priority ?? 0
    : 0;

  // Use the more generous of the two criteria
  const effectiveFloor = Math.min(PLATINUM_FLOOR, top10PctFloor);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: finalPlatinumCount } = await (sb.from("leads") as any)
    .select("id", { count: "exact", head: true })
    .eq("status", "prospect")
    .gte("priority", effectiveFloor);

  // Get score distribution for reporting
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allScores } = await (sb.from("leads") as any)
    .select("priority")
    .eq("status", "prospect")
    .order("priority", { ascending: false });

  const distribution = { platinum: 0, gold: 0, silver: 0, bronze: 0 };
  for (const lead of allScores ?? []) {
    const s = lead.priority ?? 0;
    if (s >= 85) distribution.platinum++;
    else if (s >= 65) distribution.gold++;
    else if (s >= 40) distribution.silver++;
    else distribution.bronze++;
  }

  const elapsed = Date.now() - startTime;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("event_log") as any).insert({
    user_id: SYSTEM_USER_ID,
    action: "platinum_seed.complete",
    entity_type: "batch",
    entity_id: "PLATINUM_MAX_SEED",
    details: {
      counties,
      total_prospects: totalProspects,
      platinum_gte90: platinumCount,
      top_10pct_threshold: top10PctFloor,
      top_10pct_count: top10PctThreshold,
      final_platinum_count: finalPlatinumCount,
      effective_floor: effectiveFloor,
      distribution,
      phases,
      elapsed_ms: elapsed,
    },
  });

  console.log(`[PlatinumSeed] === COMPLETE ===`);
  console.log(`[PlatinumSeed] Total prospects: ${totalProspects}`);
  console.log(`[PlatinumSeed] Platinum (≥${PLATINUM_FLOOR}): ${platinumCount}`);
  console.log(`[PlatinumSeed] Top 10% floor: ${top10PctFloor} (${top10PctThreshold} leads)`);
  console.log(`[PlatinumSeed] Final Platinum count (effective ≥${effectiveFloor}): ${finalPlatinumCount}`);
  console.log(`[PlatinumSeed] Distribution: ${JSON.stringify(distribution)}`);

  return NextResponse.json({
    success: true,
    totalProspects,
    platinumCount: finalPlatinumCount,
    platinumFloor: effectiveFloor,
    criteria: {
      hardFloor: PLATINUM_FLOOR,
      top10PctFloor,
      effectiveFloor,
      method: effectiveFloor === PLATINUM_FLOOR ? "score_>=90" : "top_10_percent",
    },
    distribution,
    topScores: (platinumLeads ?? []).slice(0, 20).map((l: Record<string, unknown>) => ({
      id: l.id,
      priority: l.priority,
      source: l.source,
      tags: l.tags,
    })),
    phases,
    elapsed_ms: elapsed,
    timestamp: new Date().toISOString(),
  });
}

/**
 * PATCH /api/ingest/platinum-seed
 *
 * Batch re-score: re-computes blended scores for all prospect leads
 * using confidence-weighted blend. Updates leads.priority and tags.
 * No auth required (read/update only, no external API calls).
 */
export async function PATCH() {
  const sb = createServerClient();
  const startTime = Date.now();

  // Paginate through all prospects (Supabase caps at 1000 per query)
  const PAGE_SIZE = 1000;
  const prospects: Record<string, unknown>[] = [];
  let offset = 0;
  while (true) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: page } = await (sb.from("leads") as any)
      .select("id, property_id, priority, tags")
      .eq("status", "prospect")
      .order("created_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (!page || page.length === 0) break;
    prospects.push(...page);
    offset += page.length;
    if (page.length < PAGE_SIZE) break;
  }

  if (prospects.length === 0) {
    return NextResponse.json({ success: true, message: "No prospects to re-score", updated: 0 });
  }

  console.log(`[PlatinumSeed/Rescore] Loaded ${prospects.length} prospects for re-scoring...`);

  let updated = 0;
  let platinumCount = 0;
  let topScore = 0;
  const distribution = { platinum: 0, gold: 0, silver: 0, bronze: 0 };

  for (const lead of prospects) {
    // Get latest deterministic score
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: scoreRec } = await (sb.from("scoring_records") as any)
      .select("composite_score")
      .eq("property_id", lead.property_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Get latest predictive score + confidence
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: predRec } = await (sb.from("scoring_predictions") as any)
      .select("predictive_score, confidence")
      .eq("property_id", lead.property_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!scoreRec) continue;

    const detScore = scoreRec.composite_score;
    const predScore = predRec?.predictive_score ?? 0;
    const confidence = predRec?.confidence != null ? Number(predRec.confidence) : 30;

    const newBlended = blendHeatScore(detScore, predScore, confidence);
    const label = getScoreLabel(newBlended);
    const scoreLabelTag = `score-${label}`;

    distribution[label as keyof typeof distribution]++;
    if (newBlended >= 85) platinumCount++;
    if (newBlended > topScore) topScore = newBlended;

    if (newBlended !== lead.priority) {
      const existingTags: string[] = Array.isArray(lead.tags) ? lead.tags : [];
      const newTags = [scoreLabelTag, ...existingTags.filter((t: string) => !t.startsWith("score-"))];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("leads") as any)
        .update({ priority: newBlended, tags: newTags })
        .eq("id", lead.id);
      updated++;
    }
  }

  const elapsed = Date.now() - startTime;

  console.log(`[PlatinumSeed/Rescore] === COMPLETE ===`);
  console.log(`[PlatinumSeed/Rescore] Processed ${prospects.length}, updated ${updated}`);
  console.log(`[PlatinumSeed/Rescore] Platinum (≥85): ${platinumCount}, top score: ${topScore}`);
  console.log(`[PlatinumSeed/Rescore] Distribution: ${JSON.stringify(distribution)}`);

  return NextResponse.json({
    success: true,
    processed: prospects.length,
    updated,
    platinumCount,
    topScore,
    distribution,
    elapsed_ms: elapsed,
  });
}
