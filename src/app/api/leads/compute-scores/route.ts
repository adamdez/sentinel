import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { scoreBuyers, rankedRadarEntries } from "@/lib/buyer-fit";
import type { LeadContext, BuyerWithPhase1 } from "@/lib/buyer-fit";

export const runtime = "nodejs";

/**
 * POST /api/leads/compute-scores
 *
 * Recomputes opportunity_score, contactability_score, and confidence_score
 * for one or more leads and writes them to the leads table.
 *
 * Body: { leadIds: string[] } — max 50 per request
 *
 * Blueprint 9.2: "Three composite scores visible on every lead card."
 *   - opportunity_score: distress signals + equity + motivation + deal potential
 *   - contactability_score: phone quality + call history + consent + timing
 *   - confidence_score: fact coverage + source diversity (computed by intelligence.ts)
 *
 * Can be called manually, by the Research Agent after dossier promotion,
 * or by a nightly cron to refresh stale scores.
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { leadIds } = body as { leadIds?: string[] };

  if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
    return NextResponse.json({ error: "leadIds array required" }, { status: 400 });
  }

  if (leadIds.length > 50) {
    return NextResponse.json({ error: "Max 50 leads per request" }, { status: 400 });
  }

  const results: Array<{ leadId: string; scores: Scores | null; error?: string }> = [];

  for (const leadId of leadIds) {
    try {
      const scores = await computeLeadScores(sb, leadId);
      if (scores) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const scoreUpdate: Record<string, any> = {
          opportunity_score: scores.opportunity,
          contactability_score: scores.contactability,
          confidence_score: scores.confidence,
        };
        if (scores.buyer_fit !== null) {
          scoreUpdate.buyer_fit_score = scores.buyer_fit;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb.from("leads") as any)
          .update(scoreUpdate)
          .eq("id", leadId);
      }
      results.push({ leadId, scores });
    } catch (err) {
      results.push({
        leadId,
        scores: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ ok: true, results });
}

// ─── Score computation ─────────────────────────────────────────────

interface Scores {
  opportunity: number;
  contactability: number;
  confidence: number | null;
  buyer_fit: number | null;
}

async function computeLeadScores(
  sb: ReturnType<typeof import("@/lib/supabase").createServerClient>,
  leadId: string,
): Promise<Scores | null> {
  // Fetch lead + property in one query
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lead } = await (sb.from("leads") as any)
    .select(`
      id, property_id, status, motivation_level, total_calls, live_answers,
      call_consent, priority, source,
      last_contact_at, next_follow_up_at,
      properties(estimated_value, equity_percent, owner_phone, owner_email, zip, property_type)
    `)
    .eq("id", leadId)
    .single();

  if (!lead) return null;

  const property = lead.properties as Record<string, unknown> | null;

  // ── Opportunity Score (0-100) ────────────────────────────────────
  // Factors: motivation + distress severity + equity position + deal potential
  let opportunity = 0;

  // Motivation level (0-25 points)
  const motivation = (lead.motivation_level as number) ?? 0;
  opportunity += Math.min(motivation * 5, 25);

  // Distress events severity (0-25 points)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: distressEvents } = await (sb.from("distress_events") as any)
    .select("severity")
    .eq("property_id", lead.property_id)
    .order("created_at", { ascending: false })
    .limit(5);

  if (distressEvents && distressEvents.length > 0) {
    const avgSeverity = distressEvents.reduce(
      (sum: number, e: { severity: number }) => sum + (e.severity ?? 0), 0
    ) / distressEvents.length;
    opportunity += Math.min(Math.round(avgSeverity * 2.5), 25);
  }

  // Equity position (0-25 points)
  const equity = (property?.equity_percent as number) ?? 0;
  if (equity >= 50) opportunity += 25;
  else if (equity >= 30) opportunity += 15;
  else if (equity >= 15) opportunity += 8;

  // Priority / composite score contribution (0-25 points)
  const priority = (lead.priority as number) ?? 0;
  opportunity += Math.min(Math.round(priority / 4), 25);

  opportunity = Math.max(0, Math.min(100, opportunity));

  // ── Contactability Score (0-100) ─────────────────────────────────
  // Factors: phone availability + call history + consent + recency
  let contactability = 0;

  // Has phone (0-30 points)
  const hasPhone = !!(property?.owner_phone);
  const hasEmail = !!(property?.owner_email);
  if (hasPhone) contactability += 30;
  if (hasEmail) contactability += 10;

  // Call consent (0-15 points)
  if (lead.call_consent !== false) contactability += 15;

  // Live answer rate (0-25 points)
  const totalCalls = (lead.total_calls as number) ?? 0;
  const liveAnswers = (lead.live_answers as number) ?? 0;
  if (totalCalls > 0) {
    const answerRate = liveAnswers / totalCalls;
    contactability += Math.min(Math.round(answerRate * 25), 25);
  } else if (hasPhone) {
    // No calls yet but has phone — optimistic default
    contactability += 12;
  }

  // Recency of last contact (0-20 points)
  if (lead.last_contact_at) {
    const daysSince = Math.floor(
      (Date.now() - new Date(lead.last_contact_at as string).getTime()) / 86_400_000,
    );
    if (daysSince <= 3) contactability += 20;
    else if (daysSince <= 7) contactability += 15;
    else if (daysSince <= 14) contactability += 10;
    else if (daysSince <= 30) contactability += 5;
  }

  contactability = Math.max(0, Math.min(100, contactability));

  // ── Confidence Score (from intelligence pipeline) ────────────────
  // Delegates to fact assertion analysis
  const confidence = await computeFactConfidence(sb, leadId);

  // ── Buyer Fit Score (top buyer match for this lead) ────────────
  const buyerFit = await computeBuyerFitScore(sb, leadId, lead, property);

  return { opportunity, contactability, confidence, buyer_fit: buyerFit };
}

/**
 * Compute confidence score from fact assertions.
 * Mirrors the logic in intelligence.ts computeConfidenceScore.
 */
async function computeFactConfidence(
  sb: ReturnType<typeof import("@/lib/supabase").createServerClient>,
  leadId: string,
): Promise<number | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: facts } = await (sb.from("fact_assertions") as any)
    .select("id, confidence, review_status")
    .eq("lead_id", leadId);

  if (!facts || facts.length === 0) return null;

  const accepted = facts.filter((f: { review_status: string }) => f.review_status === "accepted");
  const pending = facts.filter((f: { review_status: string }) => f.review_status === "pending");

  let score = 20; // Base for having any facts
  score += Math.min(accepted.length * 10, 40);
  score += Math.min(pending.length * 5, 15);

  const highConf = accepted.filter(
    (f: { confidence: string }) => f.confidence === "high" || f.confidence === "verified",
  );
  score += Math.min(highConf.length * 5, 15);

  const rejected = facts.filter((f: { review_status: string }) => f.review_status === "rejected");
  score -= rejected.length * 5;

  return Math.max(0, Math.min(100, score));
}

/**
 * Compute buyer fit score: runs scoreBuyers() against all active buyers
 * and returns the top match score (0–100). Returns null if no active buyers.
 */
async function computeBuyerFitScore(
  sb: ReturnType<typeof import("@/lib/supabase").createServerClient>,
  leadId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lead: Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  property: Record<string, any> | null,
): Promise<number | null> {
  // Fetch all active buyers with Phase 1 fields
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: buyers } = await (sb.from("buyers") as any)
    .select("*")
    .eq("status", "active");

  if (!buyers || buyers.length === 0) return null;

  // Build lead context for the scorer
  const leadContext: LeadContext = {
    market: (lead.source as string)?.includes("kootenai") ? "kootenai_county" : "spokane_county",
    zip: property?.zip ?? null,
    propertyType: property?.property_type ?? null,
    estimatedValue: (property?.estimated_value as number) ?? null,
    isVacant: false, // default — no vacancy field on lead query
    conditionLevel: (lead.motivation_level as number) ?? null, // closest proxy available
    priceExpectation: null,
  };

  // Check if there's a deal for this lead to get already-actioned buyer IDs
  const alreadyActioned = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: deals } = await (sb.from("deals") as any)
    .select("id")
    .eq("lead_id", leadId)
    .limit(1);

  if (deals && deals.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: dealBuyers } = await (sb.from("deal_buyers") as any)
      .select("buyer_id")
      .eq("deal_id", deals[0].id);

    if (dealBuyers) {
      for (const db of dealBuyers) {
        alreadyActioned.add(db.buyer_id);
      }
    }
  }

  const results = scoreBuyers(buyers as BuyerWithPhase1[], leadContext, alreadyActioned);
  const ranked = rankedRadarEntries(results);

  if (ranked.length === 0) return null;

  // Return the top buyer's score
  return ranked[0].score;
}
