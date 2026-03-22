/**
 * POST /api/admin/seed-dossiers
 *
 * Triggers the Research Agent on the top N leads that have properties
 * but no existing dossier. Used for demo seeding.
 *
 * Auth: Bearer token validated via requireAuth
 *
 * Body (optional):
 *   { "limit": number }   — max leads to process (default 5, max 10)
 *
 * Response:
 *   { processed, succeeded, failed, results }
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { runResearchAgent } from "@/agents/research";

export async function POST(req: NextRequest) {
  const sb = createServerClient();

  const user = await requireAuth(req, sb);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse body
  let limit = 5;
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body.limit === "number" && body.limit > 0) {
      limit = Math.min(Math.floor(body.limit), 10);
    }
  } catch {
    // use default
  }

  // Find leads with properties but no dossier
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: leads, error: leadsErr } = await (sb.from("leads") as any)
    .select("id, property_id, source, status")
    .not("property_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(100);

  if (leadsErr || !leads) {
    return NextResponse.json(
      { error: `Failed to query leads: ${leadsErr?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  // Filter out leads that already have dossiers
  const leadIds = (leads as Array<{ id: string }>).map((l) => l.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingDossiers } = await (sb.from("dossiers") as any)
    .select("lead_id")
    .in("lead_id", leadIds);

  const hasDossier = new Set<string>(
    ((existingDossiers ?? []) as Array<{ lead_id: string }>).map((d) => d.lead_id),
  );

  const candidates = (leads as Array<{ id: string; property_id: string; source: string; status: string }>)
    .filter((l) => !hasDossier.has(l.id))
    .slice(0, limit);

  if (candidates.length === 0) {
    return NextResponse.json({
      processed: 0,
      succeeded: 0,
      failed: 0,
      results: [],
      message: "All leads with properties already have dossiers",
    });
  }

  // Run research agent sequentially on each candidate
  let succeeded = 0;
  let failed = 0;
  const results: Array<{ leadId: string; ok: boolean; runId?: string; error?: string }> = [];

  for (const lead of candidates) {
    try {
      const result = await runResearchAgent({
        leadId: lead.id,
        propertyId: lead.property_id,
        triggeredBy: user.id,
      });

      if (result.status === "failed") {
        failed++;
        results.push({ leadId: lead.id, ok: false, runId: result.runId, error: result.error ?? "unknown" });
      } else {
        succeeded++;
        results.push({ leadId: lead.id, ok: true, runId: result.runId });
      }
    } catch (err) {
      failed++;
      results.push({
        leadId: lead.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    processed: candidates.length,
    succeeded,
    failed,
    results,
  });
}
