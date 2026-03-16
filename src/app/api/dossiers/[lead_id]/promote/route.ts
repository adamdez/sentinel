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

    // ── 1. Fetch the dossier — must be 'reviewed' status ──────────────

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: dossier, error: dossierErr } = await (sb.from("dossiers") as any)
      .select("id, lead_id, status, situation_summary, likely_decision_maker, recommended_call_angle")
      .eq("id", dossier_id)
      .eq("lead_id", lead_id)
      .single();

    if (dossierErr || !dossier) {
      return NextResponse.json({ error: "Dossier not found" }, { status: 404 });
    }
    if (dossier.status !== "reviewed") {
      return NextResponse.json(
        { error: "Only reviewed dossiers can be promoted. Review the dossier first." },
        { status: 422 }
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
    const now = new Date();
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: leadUpdateErr } = await (sb.from("leads") as any)
      .update({
        decision_maker_note: dossier.likely_decision_maker ?? null,
        notes: updatedNotes,
        updated_at: now.toISOString(),
      })
      .eq("id", lead_id);

    if (leadUpdateErr) {
      return NextResponse.json({ error: leadUpdateErr.message }, { status: 500 });
    }

    // ── 4. Mark dossier as promoted ───────────────────────────────────

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("dossiers") as any)
      .update({
        status: "promoted",
        updated_at: now.toISOString(),
      })
      .eq("id", dossier_id);

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
