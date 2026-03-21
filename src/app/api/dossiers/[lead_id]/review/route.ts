import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import type { WriteEvalRatingInput } from "@/lib/eval-ratings";

/**
 * PATCH /api/dossiers/[lead_id]/review
 *
 * Sets review status on a dossier, optionally updating structured fields
 * before marking it reviewed. This is the edit-then-approve path.
 *
 * Body:
 *   dossier_id          string  (required)
 *   status              "reviewed" | "flagged"  (required)
 *   review_notes?       string
 *   // Optional field overrides — Adam can correct AI output before approving:
 *   situation_summary?         string
 *   likely_decision_maker?     string
 *   top_facts?                 {fact: string, source: string}[]
 *   recommended_call_angle?    string
 *   verification_checklist?    {item: string, verified: boolean}[]
 *   source_links?              {label: string, url: string}[]
 *
 * - Does NOT touch the leads table (promotion is a separate POST).
 * - Records who reviewed and when.
 * - A 'reviewed' dossier will then be visible in DossierBlock.
 * - A 'flagged' dossier is retained for traceability but hidden from operators.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ lead_id: string }> }
) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { lead_id } = await params;
    const body = await req.json();

    const { dossier_id, status, review_notes, ...fieldOverrides } = body;

    if (!dossier_id) {
      return NextResponse.json({ error: "dossier_id is required" }, { status: 400 });
    }
    if (!["reviewed", "flagged"].includes(status)) {
      return NextResponse.json(
        { error: "status must be 'reviewed' or 'flagged'" },
        { status: 400 }
      );
    }

    // Build update — only accept the explicit field override allowlist
    const allowedOverrides = [
      "situation_summary",
      "likely_decision_maker",
      "top_facts",
      "recommended_call_angle",
      "verification_checklist",
      "source_links",
    ] as const;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = {
      status,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      review_notes: review_notes ?? null,
      updated_at: new Date().toISOString(),
    };

    for (const key of allowedOverrides) {
      if (key in fieldOverrides) {
        update[key] = fieldOverrides[key] ?? null;
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("dossiers") as any)
      .update(update)
      .eq("id", dossier_id)
      .eq("lead_id", lead_id)
      .select(`
        id, lead_id, status, reviewed_at, review_notes,
        situation_summary, likely_decision_maker, top_facts,
        recommended_call_angle, verification_checklist, source_links
      `)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Dossier not found" }, { status: 404 });

    // ── Set dossier_url on lead when dossier is reviewed ─────────────────────
    if (status === "reviewed") {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
      const dossierUrl = `${siteUrl}/dialer/review/dossier-queue?lead=${lead_id}`;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("leads") as any)
        .update({ dossier_url: dossierUrl, updated_at: new Date().toISOString() })
        .eq("id", lead_id);
    }

    // ── Best-effort eval rating side-effect ────────────────────────────────────
    // Write a rating to eval_ratings when Adam reviews a dossier.
    // Verdict mapping: reviewed → good, flagged → needs_work
    // Failure is non-fatal — dossier review has already succeeded.
    void (async () => {
      try {
        // Fetch ai_run_id from dossier for the run reference
        const { data: dossierMeta } = await (sb.from("dossiers") as any)
          .select("ai_run_id, lead_id")
          .eq("id", dossier_id)
          .single();

        const run_id = dossierMeta?.ai_run_id;
        if (!run_id) return; // no trace — skip eval write

        const evalPayload: WriteEvalRatingInput = {
          run_id,
          workflow:          "extract",
          prompt_version:    "1.0.0", // static — dossier compile doesn't version prompts yet
          lead_id:           dossierMeta?.lead_id ?? lead_id,
          verdict:           status === "reviewed" ? "good" : "needs_work",
          rubric_dimension:  status === "reviewed" ? "useful_and_accurate" : "other",
          reviewer_note:     review_notes ?? undefined,
          output_snapshot:   data.situation_summary
            ? `${data.situation_summary}`.slice(0, 500)
            : undefined,
        };

        await (sb.from("eval_ratings") as any)
          .upsert({ ...evalPayload, reviewed_by: user.id, reviewed_at: new Date().toISOString() }, { onConflict: "run_id" });
      } catch {
        // non-fatal — never block dossier review
      }
    })();

    return NextResponse.json({ dossier: data });
  } catch (err) {
    console.error("[API/dossiers/review] PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
