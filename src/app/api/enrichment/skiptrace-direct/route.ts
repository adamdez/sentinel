/**
 * POST /api/enrichment/skiptrace-direct
 *
 * Direct (non-Inngest) skip-trace endpoint.
 * Runs skip-trace synchronously for a small batch of leads.
 * Use this for testing or when Inngest isn't available.
 *
 * Body: { leadIds: string[] }  (max 5 per request)
 *
 * Founder-only endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { runSkipTraceIntel } from "@/lib/skiptrace-intel";

export const maxDuration = 120; // 2 minutes for Vercel

export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const founderIds = (process.env.FOUNDER_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!founderIds.includes(user.id)) {
    return NextResponse.json({ error: "Forbidden — founder only" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { leadIds, force } = body as { leadIds?: string[]; force?: boolean };

  if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
    return NextResponse.json({ error: "leadIds array required" }, { status: 400 });
  }

  if (leadIds.length > 5) {
    return NextResponse.json({ error: "Max 5 leads per request" }, { status: 400 });
  }

  // Fetch lead + property data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: leads, error } = await (sb.from("leads") as any)
    .select(`
      id,
      property_id,
      properties!inner (
        address,
        city,
        state,
        zip,
        owner_name
      )
    `)
    .in("id", leadIds)
    .not("property_id", "is", null);

  if (error) {
    return NextResponse.json({ error: `Failed to fetch leads: ${error.message}` }, { status: 500 });
  }

  const results = [];

  for (const lead of (leads ?? [])) {
    const prop = lead.properties as Record<string, unknown> | null;
    const ownerName = (prop?.owner_name as string) || "Unknown";

    try {
      const result = await runSkipTraceIntel({
        leadId: lead.id as string,
        propertyId: lead.property_id as string,
        address: (prop?.address as string) || undefined,
        city: (prop?.city as string) || undefined,
        state: (prop?.state as string) || undefined,
        zip: (prop?.zip as string) || undefined,
        ownerName: ownerName || undefined,
        reason: "bulk",
        force: force ?? false,
      });

      results.push({
        leadId: lead.id,
        leadName: ownerName,
        ...result,
      });
    } catch (err) {
      results.push({
        leadId: lead.id,
        leadName: ownerName,
        ran: false,
        reason: "unexpected_error",
        error: err instanceof Error ? err.message : String(err),
        phonesFound: 0,
        emailsFound: 0,
        newFactsCreated: 0,
        phonesPromoted: 0,
      });
    }

    // Rate limit delay between calls
    if ((leads ?? []).indexOf(lead) < (leads ?? []).length - 1) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return NextResponse.json({
    ok: true,
    leadsProcessed: results.length,
    results,
  });
}
