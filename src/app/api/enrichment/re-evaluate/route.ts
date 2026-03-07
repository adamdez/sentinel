import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { checkDataSufficiency } from "@/lib/enrichment-gate";

export const maxDuration = 120;

/**
 * POST /api/enrichment/re-evaluate
 *
 * Re-evaluates enriched leads stuck in staging against the CURRENT data sufficiency gate.
 * Use after the gate rules have been updated to retroactively promote leads that
 * now qualify under the new rules.
 *
 * Auth: CRON_SECRET or service role
 *
 * Query params:
 *   ?dry=true  — preview only, don't actually promote
 *   ?limit=500 — max leads to evaluate (default 500)
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = req.headers.get("x-cron-secret");
  const token = authHeader?.replace("Bearer ", "");

  if (token !== process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry") === "true";
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "500"), 2000);

  const sb = createServerClient();

  // Find leads that are in staging AND have been through enrichment (have notes with "Enriched" or "Elite Seed")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: stagingLeads, error: leadsError } = await (sb.from("leads") as any)
    .select("id, property_id, priority, tags, notes, source")
    .eq("status", "staging")
    .not("property_id", "is", null)
    .order("priority", { ascending: false })
    .limit(limit);

  if (leadsError) {
    console.error("[ReEval] Error fetching leads:", leadsError);
    return NextResponse.json({ error: "Failed to fetch leads" }, { status: 500 });
  }

  if (!stagingLeads || stagingLeads.length === 0) {
    return NextResponse.json({ message: "No staging leads to evaluate", promoted: 0 });
  }

  // Get all property IDs
  const propertyIds = stagingLeads.map((l: { property_id: string }) => l.property_id).filter(Boolean);

  // Batch fetch properties in chunks of 50 (Supabase URL length limit)
  const propMap = new Map<string, {
    owner_name: string | null;
    address: string | null;
    estimated_value: number | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    owner_flags: Record<string, any> | null;
  }>();

  const CHUNK_SIZE = 50;
  for (let i = 0; i < propertyIds.length; i += CHUNK_SIZE) {
    const chunk = propertyIds.slice(i, i + CHUNK_SIZE);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: properties } = await (sb.from("properties") as any)
      .select("id, owner_name, address, estimated_value, owner_flags")
      .in("id", chunk);
    for (const p of (properties ?? [])) {
      propMap.set(p.id, p);
    }
  }

  console.log(`[ReEval] Fetched ${propMap.size} properties for ${propertyIds.length} property IDs`);

  const promoted: { leadId: string; propertyId: string; address: string; score: number }[] = [];
  const stillStaging: { leadId: string; missing: string[] }[] = [];

  for (const lead of stagingLeads) {
    const prop = propMap.get(lead.property_id);
    if (!prop) continue;

    // Extract mailing address
    const ownerFlags = prop.owner_flags ?? {};
    const mailingAddr = ownerFlags.mailing_address;
    const mailingStr = typeof mailingAddr === "string"
      ? mailingAddr
      : typeof mailingAddr === "object" && mailingAddr !== null
        ? [mailingAddr.address, mailingAddr.city, mailingAddr.state, mailingAddr.zip].filter(Boolean).join(", ")
        : "";

    // Check signal count from tags (signals are stored as tags on the lead)
    const signalTags = (lead.tags ?? []).filter((t: string) => !t.startsWith("score-"));
    const hasVerifiedSignal = signalTags.length > 0;

    const gate = checkDataSufficiency({
      ownerName: prop.owner_name,
      address: prop.address,
      mailingAddress: mailingStr || null,
      estimatedValue: prop.estimated_value,
      signalCount: signalTags.length,
      hasVerifiedSignal,
    });

    if (gate.isSufficient) {
      promoted.push({
        leadId: lead.id,
        propertyId: lead.property_id,
        address: prop.address ?? "Unknown",
        score: lead.priority ?? 0,
      });

      if (!dryRun) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb.from("leads") as any)
          .update({
            status: "prospect",
            promoted_at: new Date().toISOString(),
            notes: (lead.notes ?? "") + ` [re-evaluated & promoted ${new Date().toISOString().slice(0, 10)}]`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", lead.id);
      }
    } else {
      stillStaging.push({ leadId: lead.id, missing: gate.missingFields });
    }
  }

  if (!dryRun && promoted.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("event_log") as any).insert({
      user_id: "00000000-0000-0000-0000-000000000000",
      action: "enrichment.bulk_re_evaluate",
      entity_type: "system",
      entity_id: "re-evaluate",
      details: {
        promoted_count: promoted.length,
        still_staging: stillStaging.length,
        dry_run: dryRun,
        promoted_leads: promoted.slice(0, 50),
      },
    });
  }

  console.log(`[ReEval] Evaluated ${stagingLeads.length} staging leads: ${promoted.length} promoted, ${stillStaging.length} still staging${dryRun ? " (DRY RUN)" : ""}`);

  return NextResponse.json({
    evaluated: stagingLeads.length,
    promoted: promoted.length,
    stillStaging: stillStaging.length,
    dryRun,
    promotedLeads: promoted.slice(0, 100),
    // Show common missing field patterns
    missingFieldSummary: (() => {
      const counts: Record<string, number> = {};
      for (const s of stillStaging) {
        const key = s.missing.sort().join("+");
        counts[key] = (counts[key] ?? 0) + 1;
      }
      return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([fields, count]) => ({ missing: fields, count }));
    })(),
  });
}
