import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { firecrawlAdapter } from "@/providers/firecrawl/adapter";
import { createArtifact, createFact } from "@/lib/intelligence";
import { withCronTracking } from "@/lib/cron-run-tracker";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * GET /api/cron/county-refresh
 *
 * Runs daily at 3am PT. Finds active leads in Spokane/Kootenai counties
 * that have no recent Firecrawl county record extraction (>14 days or never),
 * then scrapes their county assessor page for tax/valuation/ownership data.
 *
 * Write path:
 *   Firecrawl scrape → dossier_artifacts (raw) → fact_assertions (normalized)
 *   → operator review if contradictions found
 *
 * Rate limit: Processes up to 10 leads per run (20 req/min Firecrawl limit).
 * Secured by CRON_SECRET header.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;

  if (expected && secret !== expected && secret !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!firecrawlAdapter.isConfigured()) {
    return NextResponse.json({ ok: true, message: "Firecrawl not configured", extracted: 0 });
  }

  return withCronTracking("county-refresh", async (run) => {
    const sb = createServerClient();
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    // Find active leads in our primary markets that need county data refresh
    const ACTIVE_STATUSES = ["prospect", "lead", "negotiation"];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: candidates } = await (sb.from("leads") as any)
      .select("id, property_id, properties(address, city, state, county, apn)")
      .in("status", ACTIVE_STATUSES)
      .not("property_id", "is", null)
      .order("updated_at", { ascending: true })
      .limit(50);

    if (!candidates || candidates.length === 0) {
      return NextResponse.json({ ok: true, candidates: 0, extracted: 0 });
    }

    // Filter to Spokane/Kootenai counties only
    const targetLeads = candidates.filter((lead: Record<string, unknown>) => {
      const prop = lead.properties as Record<string, unknown> | null;
      if (!prop) return false;
      const county = (prop.county as string ?? "").toLowerCase();
      const state = (prop.state as string ?? "").toUpperCase();
      return (
        (county.includes("spokane") && state === "WA") ||
        (county.includes("kootenai") && state === "ID")
      );
    });

    if (targetLeads.length === 0) {
      return NextResponse.json({ ok: true, candidates: 0, extracted: 0, reason: "no_target_county_leads" });
    }

    // Check which leads already have a recent Firecrawl artifact
    const leadIds = targetLeads.map((l: Record<string, unknown>) => l.id as string);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: recentArtifacts } = await (sb.from("dossier_artifacts") as any)
      .select("lead_id")
      .in("lead_id", leadIds)
      .eq("source_type", "firecrawl_county")
      .gte("created_at", fourteenDaysAgo);

    const recentLeadIds = new Set((recentArtifacts ?? []).map((a: Record<string, unknown>) => a.lead_id));
    const staleLeads = targetLeads.filter((l: Record<string, unknown>) => !recentLeadIds.has(l.id as string));

    if (staleLeads.length === 0) {
      return NextResponse.json({ ok: true, candidates: targetLeads.length, extracted: 0, reason: "all_fresh" });
    }

    // Process up to 10 leads per run
    let extracted = 0;
    let errors = 0;

    for (const lead of staleLeads.slice(0, 10)) {
      try {
        const prop = lead.properties as Record<string, unknown>;
        const address = prop.address as string | undefined;
        const apn = prop.apn as string | undefined;
        const county = prop.county as string | undefined;
        const state = prop.state as string | undefined;

        if (!address && !apn) continue;

        const result = await firecrawlAdapter.lookupProperty({
          address,
          apn,
          county,
          state,
        });

        if (result.facts.length === 0) continue;

        // Write path step 1: store raw artifact
        const artifactId = await createArtifact({
          leadId: lead.id as string,
          propertyId: lead.property_id as string,
          sourceType: "firecrawl_county",
          sourceUrl: (result.rawPayload as Record<string, unknown>)?.sourceUrl as string ?? undefined,
          sourceLabel: (result.rawPayload as Record<string, unknown>)?.portalName as string ?? "County Assessor",
          rawExcerpt: JSON.stringify(result.rawPayload).slice(0, 5000),
          capturedBy: "cron/county-refresh",
        });

        // Write path step 2: create fact assertions
        for (const fact of result.facts) {
          await createFact({
            artifactId,
            leadId: lead.id as string,
            factType: fact.fieldName,
            factValue: String(fact.value),
            confidence: fact.confidence === "unverified" ? "low" : fact.confidence,
            assertedBy: "cron/county-refresh",
          });
        }

        extracted++;
        run.increment();
      } catch (err) {
        console.error(`[county-refresh] Failed for lead ${lead.id}:`, err instanceof Error ? err.message : err);
        errors++;
      }

      // Rate limit: wait 3 seconds between scrapes
      if (extracted + errors < staleLeads.slice(0, 10).length) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }

    return NextResponse.json({
      ok: true,
      candidates: staleLeads.length,
      extracted,
      errors,
    });
  });
}
