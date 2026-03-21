import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

/**
 * POST /api/dossiers/[lead_id]/promote
 *
 * Applies a reviewed dossier's structured intelligence to the lead record.
 * This is the ONLY path that writes dossier-derived content to durable lead truth.
 *
 * Writes:
 *   - leads.decision_maker_note — set from dossier.likely_decision_maker
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
      .select("id, lead_id, situation_summary, likely_decision_maker, recommended_call_angle")
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

    // ── 3. Update leads ───────────────────────────────────────────────

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const dossierUrl = `${siteUrl}/dialer/review/dossier-queue?lead=${lead_id}`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: leadUpdateErr } = await (sb.from("leads") as any)
      .update({
        decision_maker_note: dossier.likely_decision_maker ?? null,
        notes: updatedNotes,
        dossier_url: dossierUrl,
        updated_at: now.toISOString(),
      })
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

    return NextResponse.json({
      ok: true,
      promoted: {
        dossier_id,
        lead_id,
        promoted_at: now.toISOString(),
        promoted_by: user.id,
      },
    });
  } catch (err) {
    console.error("[API/dossiers/promote] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
