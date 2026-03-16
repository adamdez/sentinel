import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

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

    return NextResponse.json({ dossier: data });
  } catch (err) {
    console.error("[API/dossiers/review] PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
