import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { inngest } from "@/inngest/client";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/agents/research/batch
 *
 * Trigger Research Agent for multiple leads.
 * Requests are queued through Inngest so retries/concurrency are centralized.
 *
 * Body: { leadIds: string[], focusAreas?: string[] }
 *   - max 20 leads per batch
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: leads } = await (sb.from("leads") as any)
    .select("id, property_id")
    .in("id", leadIds);

  const leadMap = new Map<string, string | null>();
  for (const lead of leads ?? []) {
    leadMap.set(lead.id, lead.property_id ?? null);
  }

  const results: Array<{
    leadId: string;
    status: "queued" | "not_found";
  }> = [];

  for (const leadId of leadIds) {
    if (!leadMap.has(leadId)) {
      results.push({ leadId, status: "not_found" });
      continue;
    }

    void inngest.send({
      name: "agent/research.requested",
      data: {
        leadId,
        propertyId: leadMap.get(leadId) ?? undefined,
        triggeredBy: user.id,
        focusAreas,
      },
    }).catch((err) => {
      console.warn(`[agents/research/batch] Failed to queue lead ${leadId.slice(0, 8)}:`, err);
    });

    results.push({ leadId, status: "queued" });
  }

  return NextResponse.json({
    ok: true,
    queued: results.filter((result) => result.status === "queued").length,
    results,
  });
}
