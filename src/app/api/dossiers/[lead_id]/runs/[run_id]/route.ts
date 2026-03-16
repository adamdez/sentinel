import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import type { ResearchRunStatus } from "../route";

/**
 * GET   /api/dossiers/[lead_id]/runs/[run_id]  — fetch a single run
 * PATCH /api/dossiers/[lead_id]/runs/[run_id]  — update status/notes or increment counts
 *
 * PATCH body (all fields optional):
 *   status?         "open"|"compiled"|"closed"|"abandoned"
 *   notes?          string
 *   dossier_id?     string   — set when run is compiled
 *   increment_artifacts? boolean  — increment artifact_count by 1
 *   increment_facts?     boolean  — increment fact_count by 1
 *   source_type?    string   — add to source_mix array if not already present
 *
 * Used by:
 *   - artifact POST: increment_artifacts=true, source_type=<type>
 *   - fact POST:     increment_facts=true
 *   - compile POST:  status=compiled, dossier_id=<id>
 *   - manual close:  status=closed|abandoned
 *
 * BOUNDARY: reads/writes research_runs only.
 */

const VALID_STATUSES: ResearchRunStatus[] = ["open", "compiled", "closed", "abandoned"];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ lead_id: string; run_id: string }> }
) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { lead_id, run_id } = await params;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: run, error } = await (sb.from("research_runs") as any)
      .select("*")
      .eq("id", run_id)
      .eq("lead_id", lead_id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!run)  return NextResponse.json({ error: "Run not found" }, { status: 404 });

    return NextResponse.json({ run });
  } catch (err) {
    console.error("[API/dossiers/runs/[run_id]] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ lead_id: string; run_id: string }> }
) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { lead_id, run_id } = await params;
    const body = await req.json().catch(() => ({}));

    // Fetch current run state (need source_mix + counts for increments)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: current, error: fetchErr } = await (sb.from("research_runs") as any)
      .select("id, lead_id, status, artifact_count, fact_count, source_mix")
      .eq("id", run_id)
      .eq("lead_id", lead_id)
      .maybeSingle();

    if (fetchErr || !current) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    // Status change
    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) {
        return NextResponse.json(
          { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
          { status: 400 }
        );
      }
      patch.status = body.status;
      if (body.status !== "open") {
        patch.closed_at = new Date().toISOString();
      }
    }

    if (body.notes !== undefined) {
      patch.notes = (body.notes ?? "").trim() || null;
    }

    if (body.dossier_id !== undefined) {
      patch.dossier_id = body.dossier_id;
    }

    // Increment artifact count
    if (body.increment_artifacts) {
      patch.artifact_count = (current.artifact_count ?? 0) + 1;
    }

    // Increment fact count
    if (body.increment_facts) {
      patch.fact_count = (current.fact_count ?? 0) + 1;
    }

    // Add source_type to source_mix if new
    if (body.source_type) {
      const currentMix: string[] = Array.isArray(current.source_mix) ? current.source_mix : [];
      if (!currentMix.includes(body.source_type)) {
        patch.source_mix = [...currentMix, body.source_type];
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updated, error: patchErr } = await (sb.from("research_runs") as any)
      .update(patch)
      .eq("id", run_id)
      .eq("lead_id", lead_id)
      .select("*")
      .single();

    if (patchErr) return NextResponse.json({ error: patchErr.message }, { status: 500 });

    return NextResponse.json({ run: updated });
  } catch (err) {
    console.error("[API/dossiers/runs/[run_id]] PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
