import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { runResearchAgent } from "@/agents/research";

export const runtime = "nodejs";
export const maxDuration = 120; // Research agent can take longer due to LLM call

/**
 * POST /api/agents/research
 *
 * Trigger the Research Agent for a lead. Operator-initiated.
 * The agent gathers public-source intelligence and creates a proposed dossier.
 *
 * Body: { leadId: string, propertyId?: string, focusAreas?: string[], operatorNotes?: string }
 *
 * Returns: { ok, runId, dossierId, artifactCount, factCount, status }
 *
 * Blueprint: "Research Agent: Triggered by lead promotion or operator request.
 * Produces enriched property facts, dossier draft, contradiction flags.
 * Review console before CRM sync."
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { leadId, propertyId, focusAreas, operatorNotes } = body;

    if (!leadId || typeof leadId !== "string") {
      return NextResponse.json({ error: "leadId is required" }, { status: 400 });
    }

    const result = await runResearchAgent({
      leadId,
      propertyId,
      triggeredBy: user.id,
      focusAreas,
      operatorNotes,
    });

    if (result.status === "failed") {
      return NextResponse.json({
        ok: false,
        runId: result.runId,
        error: result.error,
      }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      runId: result.runId,
      dossierId: result.dossierId,
      artifactCount: result.artifactCount,
      factCount: result.factCount,
      status: result.status,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[agents/research] Error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
