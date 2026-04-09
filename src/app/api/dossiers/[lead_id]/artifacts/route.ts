import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { getSourcePolicy, POLICY_LABELS, POLICY_DESCRIPTIONS } from "@/lib/source-policy";

/**
 * GET /api/dossiers/[lead_id]/artifacts
 *
 * Returns all artifacts captured for a lead, ordered by most recent first.
 * Used by EvidenceCapturePanel to display captured evidence.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ lead_id: string }> }
) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { lead_id } = await params;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("dossier_artifacts") as any)
      .select(
        "id, lead_id, dossier_id, source_url, source_type, source_label, captured_at, extracted_notes, raw_excerpt, screenshot_url, captured_by, created_at"
      )
      .eq("lead_id", lead_id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ artifacts: data ?? [] });
  } catch (err) {
    console.error("[API/dossiers/artifacts] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/dossiers/[lead_id]/artifacts
 *
 * Creates a single artifact (evidence record) for a lead.
 * Operator-captured: source URL, type, label, and extracted notes.
 *
 * Body:
 *   source_url?        string
 *   source_type?       "probate_filing" | "obituary" | "assessor" | "court_record" | "news" | "other"
 *   source_label?      string  — human-readable label
 *   extracted_notes?   string  — key facts extracted from the source
 *   raw_excerpt?       string  — optional copy-paste of source text
 *   screenshot_url?    string  — URL of screenshot if available
 *   property_id?       string
 *
 * Does NOT create or update a dossier. That happens via POST /compile.
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

    if (!body.source_url && !body.extracted_notes) {
      return NextResponse.json(
        { error: "At least one of source_url or extracted_notes is required" },
        { status: 400 }
      );
    }

    const runId = (body.run_id ?? "").trim() || null;

    const record = {
      lead_id,
      property_id: body.property_id ?? null,
      source_url: body.source_url ?? null,
      source_type: body.source_type ?? "other",
      source_label: body.source_label ?? null,
      extracted_notes: body.extracted_notes ?? null,
      raw_excerpt: body.raw_excerpt ?? null,
      screenshot_url: body.screenshot_url ?? null,
      captured_by: user.id,
      run_id: runId,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("dossier_artifacts") as any)
      .insert(record)
      .select("id, lead_id, source_url, source_type, source_label, extracted_notes, captured_at, created_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Increment run counts if this artifact belongs to a run
    if (runId && data) {
      // Best-effort — don't fail the artifact create if the run update fails
      try {
        const sourceType: string = record.source_type ?? "other";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: run } = await (sb.from("research_runs") as any)
          .select("artifact_count, source_mix")
          .eq("id", runId)
          .eq("lead_id", lead_id)
          .maybeSingle();

        if (run) {
          const currentMix: string[] = Array.isArray(run.source_mix) ? run.source_mix : [];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (sb.from("research_runs") as any)
            .update({
              artifact_count: (run.artifact_count ?? 0) + 1,
              source_mix: currentMix.includes(sourceType)
                ? currentMix
                : [...currentMix, sourceType],
              updated_at: new Date().toISOString(),
            })
            .eq("id", runId);
        }
      } catch (runErr) {
        console.warn("[API/dossiers/artifacts] run counter update failed:", runErr);
      }
    }

    // Return policy context so the UI can show a warning immediately on capture.
    // A "blocked" source_type produces a policy_warning, not a rejection —
    // the artifact is still saved so Adam can see it and decide to delete.
    const policy     = await getSourcePolicy(record.source_type ?? "other");
    const policyMeta = policy !== "approved"
      ? { policy, label: POLICY_LABELS[policy], description: POLICY_DESCRIPTIONS[policy] }
      : null;

    return NextResponse.json({ artifact: data, policy_warning: policyMeta }, { status: 201 });
  } catch (err) {
    console.error("[API/dossiers/artifacts] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/dossiers/[lead_id]/artifacts
 *
 * Deletes a single artifact by id.
 * Body: { artifact_id }
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ lead_id: string }> }
) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { lead_id } = await params;
    const body = await req.json();
    const { artifact_id } = body;

    if (!artifact_id) {
      return NextResponse.json({ error: "artifact_id is required" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (sb.from("dossier_artifacts") as any)
      .delete()
      .eq("id", artifact_id)
      .eq("lead_id", lead_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[API/dossiers/artifacts] DELETE error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
