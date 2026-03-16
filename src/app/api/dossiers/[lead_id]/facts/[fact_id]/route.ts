import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

/**
 * PATCH  /api/dossiers/[lead_id]/facts/[fact_id]
 * DELETE /api/dossiers/[lead_id]/facts/[fact_id]
 *
 * PATCH — update review status, confidence, or promoted_field.
 *   Allowlisted fields: review_status, confidence, promoted_field, fact_value, fact_type
 *   Sets reviewed_by + reviewed_at when review_status is changed to accepted|rejected.
 *
 * DELETE — remove a fact assertion entirely (soft delete not needed here;
 *   facts are operator annotations, not durable audit records).
 *
 * BOUNDARY: reads/writes fact_assertions only.
 * Does NOT write to leads, dossiers, or any CRM-owned table.
 */

const REVIEW_STATUSES  = ["pending", "accepted", "rejected"] as const;
const CONFIDENCE_VALS  = ["unverified", "low", "medium", "high"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ lead_id: string; fact_id: string }> }
) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { lead_id, fact_id } = await params;
    const body = await req.json().catch(() => ({}));

    // Verify the fact belongs to this lead
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing, error: fetchErr } = await (sb.from("fact_assertions") as any)
      .select("id, lead_id, review_status")
      .eq("id", fact_id)
      .eq("lead_id", lead_id)
      .maybeSingle();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: "Fact not found" }, { status: 404 });
    }

    // Build allowlisted patch
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.review_status !== undefined) {
      if (!REVIEW_STATUSES.includes(body.review_status)) {
        return NextResponse.json(
          { error: `review_status must be one of: ${REVIEW_STATUSES.join(", ")}` },
          { status: 400 }
        );
      }
      patch.review_status = body.review_status;
      // Record reviewer when moving to a terminal state
      if (body.review_status === "accepted" || body.review_status === "rejected") {
        patch.reviewed_by = user.id;
        patch.reviewed_at = new Date().toISOString();
      }
    }

    if (body.confidence !== undefined) {
      if (!CONFIDENCE_VALS.includes(body.confidence)) {
        return NextResponse.json(
          { error: `confidence must be one of: ${CONFIDENCE_VALS.join(", ")}` },
          { status: 400 }
        );
      }
      patch.confidence = body.confidence;
    }

    if (body.promoted_field !== undefined) {
      patch.promoted_field = (body.promoted_field ?? "").trim() || null;
    }

    if (body.fact_value !== undefined) {
      const v = (body.fact_value ?? "").trim();
      if (!v) return NextResponse.json({ error: "fact_value cannot be empty" }, { status: 400 });
      patch.fact_value = v;
    }

    if (body.fact_type !== undefined) {
      patch.fact_type = body.fact_type;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updated, error: patchErr } = await (sb.from("fact_assertions") as any)
      .update(patch)
      .eq("id", fact_id)
      .eq("lead_id", lead_id)
      .select("*")
      .single();

    if (patchErr) return NextResponse.json({ error: patchErr.message }, { status: 500 });

    return NextResponse.json({ fact: updated });
  } catch (err) {
    console.error("[API/dossiers/facts/[fact_id]] PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ lead_id: string; fact_id: string }> }
) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { lead_id, fact_id } = await params;

    // Verify ownership before delete
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing, error: fetchErr } = await (sb.from("fact_assertions") as any)
      .select("id")
      .eq("id", fact_id)
      .eq("lead_id", lead_id)
      .maybeSingle();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: "Fact not found" }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: deleteErr } = await (sb.from("fact_assertions") as any)
      .delete()
      .eq("id", fact_id);

    if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[API/dossiers/facts/[fact_id]] DELETE error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
