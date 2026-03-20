import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { runBrowserResearch } from "@/agents/browser-research";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/agents/browser-research
 *
 * Trigger browser research for a lead. Searches web sources,
 * extracts facts, stores artifacts. All facts go to review queue
 * with low/medium confidence.
 *
 * Body: { leadId, researchGoals? }
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { leadId, researchGoals } = body as { leadId: string; researchGoals?: string[] };

  if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });

  // Get lead + property data for research context
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lead } = await (sb.from("leads") as any)
    .select("id, first_name, last_name, phone, property_id, properties(address, county, state, apn)")
    .eq("id", leadId)
    .single();

  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const property = lead.properties;
  const ownerName = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || undefined;

  const result = await runBrowserResearch({
    leadId,
    ownerName,
    propertyAddress: property?.address,
    county: property?.county,
    state: property?.state,
    apn: property?.apn,
    researchGoals,
  });

  return NextResponse.json(result);
}
