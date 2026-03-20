import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/refresh-scores
 *
 * Nightly score refresh — recomputes opportunity_score, contactability_score,
 * and confidence_score for all active leads.
 *
 * Blueprint 9.2: "Scores must be fresh daily. Stale scores mislead operators."
 *
 * Runs after the exception scan (2am PT) so exception data is current.
 * Processes in batches of 50 to stay within Vercel timeout.
 *
 * Secured by CRON_SECRET header.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;

  if (expected && secret !== expected && secret !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createServerClient();

  // Get all active leads that need scoring
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: leads, error } = await (sb.from("leads") as any)
    .select("id")
    .in("status", ["prospect", "lead", "negotiation", "disposition", "nurture"])
    .order("updated_at", { ascending: true })
    .limit(500);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!leads || leads.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, summary: "No active leads to score." });
  }

  let processed = 0;
  let errors = 0;

  // Process in batches
  const BATCH_SIZE = 50;
  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const batch = leads.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async (lead: { id: string }) => {
        const scores = await computeScoresForLead(sb, lead.id);
        if (scores) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (sb.from("leads") as any)
            .update({
              opportunity_score: scores.opportunity,
              contactability_score: scores.contactability,
              confidence_score: scores.confidence,
            })
            .eq("id", lead.id);
        }
      }),
    );

    for (const r of results) {
      if (r.status === "fulfilled") processed++;
      else errors++;
    }
  }

  return NextResponse.json({
    ok: true,
    processed,
    errors,
    total: leads.length,
    summary: `Refreshed scores for ${processed}/${leads.length} active leads.`,
  });
}

// ─── Inline score computation (mirrors /api/leads/compute-scores) ──

async function computeScoresForLead(
  sb: ReturnType<typeof createServerClient>,
  leadId: string,
): Promise<{ opportunity: number; contactability: number; confidence: number | null } | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lead } = await (sb.from("leads") as any)
    .select(`
      id, status, motivation_level, total_calls, live_answers,
      call_consent, priority,
      last_contact_at,
      properties(estimated_value, equity_percent, owner_phone, owner_email)
    `)
    .eq("id", leadId)
    .single();

  if (!lead) return null;

  const property = lead.properties as Record<string, unknown> | null;

  // Opportunity (0-100)
  let opportunity = 0;
  const motivation = (lead.motivation_level as number) ?? 0;
  opportunity += Math.min(motivation * 5, 25);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: distressEvents } = await (sb.from("distress_events") as any)
    .select("severity")
    .eq("property_id", lead.id)
    .order("created_at", { ascending: false })
    .limit(5);

  if (distressEvents && distressEvents.length > 0) {
    const avgSev = distressEvents.reduce(
      (s: number, e: { severity: number }) => s + (e.severity ?? 0), 0,
    ) / distressEvents.length;
    opportunity += Math.min(Math.round(avgSev * 2.5), 25);
  }

  const equity = (property?.equity_percent as number) ?? 0;
  if (equity >= 50) opportunity += 25;
  else if (equity >= 30) opportunity += 15;
  else if (equity >= 15) opportunity += 8;

  const priority = (lead.priority as number) ?? 0;
  opportunity += Math.min(Math.round(priority / 4), 25);
  opportunity = Math.max(0, Math.min(100, opportunity));

  // Contactability (0-100)
  let contactability = 0;
  if (property?.owner_phone) contactability += 30;
  if (property?.owner_email) contactability += 10;
  if (lead.call_consent !== false) contactability += 15;

  const totalCalls = (lead.total_calls as number) ?? 0;
  const liveAnswers = (lead.live_answers as number) ?? 0;
  if (totalCalls > 0) {
    contactability += Math.min(Math.round((liveAnswers / totalCalls) * 25), 25);
  } else if (property?.owner_phone) {
    contactability += 12;
  }

  if (lead.last_contact_at) {
    const days = Math.floor(
      (Date.now() - new Date(lead.last_contact_at as string).getTime()) / 86_400_000,
    );
    if (days <= 3) contactability += 20;
    else if (days <= 7) contactability += 15;
    else if (days <= 14) contactability += 10;
    else if (days <= 30) contactability += 5;
  }
  contactability = Math.max(0, Math.min(100, contactability));

  // Confidence (from facts)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: facts } = await (sb.from("fact_assertions") as any)
    .select("id, confidence, review_status")
    .eq("lead_id", leadId);

  let confidence: number | null = null;
  if (facts && facts.length > 0) {
    const accepted = facts.filter((f: { review_status: string }) => f.review_status === "accepted");
    const pending = facts.filter((f: { review_status: string }) => f.review_status === "pending");
    let score = 20;
    score += Math.min(accepted.length * 10, 40);
    score += Math.min(pending.length * 5, 15);
    const highConf = accepted.filter(
      (f: { confidence: string }) => f.confidence === "high" || f.confidence === "verified",
    );
    score += Math.min(highConf.length * 5, 15);
    const rejected = facts.filter((f: { review_status: string }) => f.review_status === "rejected");
    score -= rejected.length * 5;
    confidence = Math.max(0, Math.min(100, score));
  }

  return { opportunity, contactability, confidence };
}
