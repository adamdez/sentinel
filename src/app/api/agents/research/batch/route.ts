import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/agents/research/batch
 *
 * Trigger Research Agent for multiple leads. Fire-and-forget per lead
 * (each runs independently, dedup guard prevents double-runs).
 *
 * Body: { leadIds: string[], focusAreas?: string[] }
 *   — max 20 leads per batch
 *
 * Blueprint 4.2: "Research Agent auto-triggers on promotion but can also
 * be kicked off manually or via nightly enrichment pass."
 *
 * Returns immediately with status per lead (queued/skipped/error).
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { leadIds, focusAreas } = body as {
    leadIds?: string[];
    focusAreas?: string[];
  };

  if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
    return NextResponse.json({ error: "leadIds array required" }, { status: 400 });
  }

  if (leadIds.length > 20) {
    return NextResponse.json({ error: "Max 20 leads per batch" }, { status: 400 });
  }

  // Fetch lead → property mappings
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: leads } = await (sb.from("leads") as any)
    .select("id, property_id")
    .in("id", leadIds);

  const leadMap = new Map<string, string | null>();
  for (const l of leads ?? []) {
    leadMap.set(l.id, l.property_id ?? null);
  }

  const results: Array<{
    leadId: string;
    status: "queued" | "not_found" | "error";
    error?: string;
  }> = [];

  // Dynamic import to avoid circular deps
  const { runResearchAgent } = await import("@/agents/research");

  for (const leadId of leadIds) {
    if (!leadMap.has(leadId)) {
      results.push({ leadId, status: "not_found" });
      continue;
    }

    // Fire-and-forget — don't await completion, just kick off
    runResearchAgent({
      leadId,
      propertyId: leadMap.get(leadId) ?? undefined,
      triggeredBy: user.id,
      focusAreas,
    }).catch((err) => {
      console.warn(`[agents/research/batch] Failed for lead ${leadId.slice(0, 8)}:`, err);
    });

    results.push({ leadId, status: "queued" });
  }

  return NextResponse.json({
    ok: true,
    queued: results.filter((r) => r.status === "queued").length,
    results,
  });
}
