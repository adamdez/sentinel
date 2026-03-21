import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

/**
 * POST /api/dossiers/[lead_id]/promote
 *
 * Applies a reviewed dossier's structured intelligence to the lead record.
 * This is the ONLY path that writes dossier-derived content to durable lead truth.
 *
 * Writes (Blueprint §9.1 CRM Projection Fields):
 *   - leads.decision_maker_note — set from dossier.likely_decision_maker
 *   - leads.seller_situation_summary_short — from dossier.situation_summary (max 500 chars)
 *   - leads.recommended_call_angle — from dossier.recommended_call_angle
 *   - leads.likely_decision_maker — from dossier.likely_decision_maker
 *   - leads.decision_maker_confidence — from dossier.raw_ai_output
 *   - leads.opportunity_score — from dossier.raw_ai_output
 *   - leads.confidence_score — from dossier.raw_ai_output
 *   - leads.contactability_score — from dossier.raw_ai_output
 *   - leads.buyer_fit_score — from dossier.raw_ai_output
 *   - leads.recommended_next_action — from dossier.raw_ai_output
 *   - leads.top_fact_1/2/3 — from dossier.top_facts or fact_assertions
 *   - leads.current_dossier_id — FK to the promoted dossier
 *   - leads.dossier_url — link to dossier review page
 *   - leads.notes — APPENDED (never overwritten) with a timestamped summary
 *
 * Does NOT overwrite qualification fields (motivation_level, condition_level, etc.)
 * that come from real operator calls.
 *
 * Body: { dossier_id }
 *
 * This route does NOT check user role beyond authentication — in the current
 * 2-person system both operators have full access. If role gating is added
 * later, check user_profiles.role = 'admin' here.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ lead_id: string }> }
) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { lead_id } = await params;
    const body = await req.json();
    const { dossier_id } = body;

    if (!dossier_id) {
      return NextResponse.json({ error: "dossier_id is required" }, { status: 400 });
    }

    // ── 1. Atomically claim the dossier for promotion ─────────────────
    // Uses an atomic update with a status guard to prevent double-promote.
    // Only a dossier currently in 'reviewed' status will be claimed.

    const now = new Date();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: dossier, error: claimErr } = await (sb.from("dossiers") as any)
      .update({ status: "promoting", updated_at: now.toISOString() })
      .eq("id", dossier_id)
      .eq("lead_id", lead_id)
      .eq("status", "reviewed")
      .select("id, lead_id, situation_summary, likely_decision_maker, recommended_call_angle, top_facts, raw_ai_output")
      .single();

    if (claimErr || !dossier) {
      // Either not found or already promoted/promoting — both mean we can't proceed
      return NextResponse.json(
        { error: "Dossier not found, already promoted, or not yet reviewed." },
        { status: 409 }
      );
    }

    // ── 2. Fetch current lead notes to append (not overwrite) ─────────

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lead, error: leadErr } = await (sb.from("leads") as any)
      .select("id, notes")
      .eq("id", lead_id)
      .single();

    if (leadErr || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Build the appended note entry — timestamped, clearly labeled
    const dateLabel = now.toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
    const promotionEntry = [
      `[Dossier promoted ${dateLabel}]`,
      dossier.situation_summary ? `Summary: ${dossier.situation_summary}` : null,
      dossier.likely_decision_maker ? `Decision-maker: ${dossier.likely_decision_maker}` : null,
      dossier.recommended_call_angle ? `Call angle: ${dossier.recommended_call_angle}` : null,
    ].filter(Boolean).join("\n");

    const updatedNotes = lead.notes
      ? `${lead.notes}\n\n${promotionEntry}`
      : promotionEntry;

    // ── 3. Extract scores & metadata from raw_ai_output ────────────────
    // raw_ai_output is the full AI dossier blob — scores live here when
    // the intelligence pipeline populated them.

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawAi: Record<string, any> = (typeof dossier.raw_ai_output === "object" && dossier.raw_ai_output) ? dossier.raw_ai_output : {};

    // Helper: clamp a numeric score to 0-100 smallint range, or null
    const clampScore = (val: unknown): number | null => {
      if (val == null) return null;
      const n = Number(val);
      if (isNaN(n)) return null;
      return Math.max(0, Math.min(100, Math.round(n)));
    };

    // ── 3a. Resolve top facts ────────────────────────────────────────
    // Prefer dossier.top_facts (structured [{fact, source}]), fall back
    // to querying fact_assertions for this lead sorted by confidence.

    let topFact1: string | null = null;
    let topFact2: string | null = null;
    let topFact3: string | null = null;

    const dossierTopFacts = Array.isArray(dossier.top_facts) ? dossier.top_facts : [];
    if (dossierTopFacts.length > 0) {
      // Each entry is {fact: string, source?: string}
      topFact1 = typeof dossierTopFacts[0]?.fact === "string" ? dossierTopFacts[0].fact : null;
      topFact2 = typeof dossierTopFacts[1]?.fact === "string" ? dossierTopFacts[1].fact : null;
      topFact3 = typeof dossierTopFacts[2]?.fact === "string" ? dossierTopFacts[2].fact : null;
    } else {
      // Fallback: query fact_assertions for this lead, prefer verified/strong confidence
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: topAssertions } = await (sb.from("fact_assertions") as any)
        .select("fact_value, confidence")
        .eq("lead_id", lead_id)
        .in("confidence", ["verified", "strong", "probable"])
        .order("confidence", { ascending: true }) // verified first (alphabetical: p < s < v)
        .order("created_at", { ascending: false })
        .limit(3);

      if (topAssertions && topAssertions.length > 0) {
        topFact1 = topAssertions[0]?.fact_value ?? null;
        topFact2 = topAssertions[1]?.fact_value ?? null;
        topFact3 = topAssertions[2]?.fact_value ?? null;
      }
    }

    // ── 3b. Build the leads update payload ───────────────────────────

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const dossierUrl = `${siteUrl}/dialer/review/dossier-queue?lead=${lead_id}`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leadUpdate: Record<string, any> = {
      // Always write
      updated_at: now.toISOString(),
      notes: updatedNotes,
      dossier_url: dossierUrl,
      current_dossier_id: dossier.id,

      // Decision maker (keep legacy field + new projection field)
      decision_maker_note: dossier.likely_decision_maker ?? null,
      likely_decision_maker: dossier.likely_decision_maker ?? null,

      // Situation & call angle
      seller_situation_summary_short: dossier.situation_summary
        ? dossier.situation_summary.substring(0, 500)
        : null,
      recommended_call_angle: dossier.recommended_call_angle ?? null,

      // Decision maker confidence
      decision_maker_confidence: rawAi.decision_maker_confidence
        ?? rawAi.decisionMakerConfidence
        ?? null,

      // Scores — clamp to 0-100 smallint
      opportunity_score: clampScore(rawAi.opportunity_score ?? rawAi.opportunityScore),
      confidence_score: clampScore(rawAi.confidence_score ?? rawAi.confidenceScore),
      contactability_score: clampScore(rawAi.contactability_score ?? rawAi.contactabilityScore),
      buyer_fit_score: clampScore(rawAi.buyer_fit_score ?? rawAi.buyerFitScore),

      // Top facts
      top_fact_1: topFact1,
      top_fact_2: topFact2,
      top_fact_3: topFact3,

      // Recommended next action
      recommended_next_action: rawAi.recommended_next_action
        ?? rawAi.recommendedNextAction
        ?? rawAi.suggested_next_action
        ?? null,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: leadUpdateErr } = await (sb.from("leads") as any)
      .update(leadUpdate)
      .eq("id", lead_id);

    if (leadUpdateErr) {
      // Rollback: revert dossier status back to reviewed so it can be retried
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("dossiers") as any)
        .update({ status: "reviewed", updated_at: new Date().toISOString() })
        .eq("id", dossier_id)
        .eq("status", "promoting");
      return NextResponse.json({ error: leadUpdateErr.message }, { status: 500 });
    }

    // ── 4. Finalize dossier as promoted ─────────────────────────────

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: dossierUpdateErr } = await (sb.from("dossiers") as any)
      .update({
        status: "promoted",
        updated_at: now.toISOString(),
      })
      .eq("id", dossier_id)
      .eq("status", "promoting")
      .select("id")
      .single();

    if (dossierUpdateErr) {
      return NextResponse.json(
        { error: `Lead updated but dossier status failed: ${dossierUpdateErr.message}` },
        { status: 500 }
      );
    }

    // Build a summary of which fields were actually written (non-null)
    const fieldsWritten = Object.entries(leadUpdate)
      .filter(([k, v]) => v != null && k !== "updated_at" && k !== "notes")
      .map(([k]) => k);

    return NextResponse.json({
      ok: true,
      promoted: {
        dossier_id,
        lead_id,
        promoted_at: now.toISOString(),
        promoted_by: user.id,
        fields_written: fieldsWritten,
      },
    });
  } catch (err) {
    console.error("[API/dossiers/promote] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
