import { NextRequest, NextResponse } from "next/server";
import { firecrawlAdapter } from "@/providers/firecrawl/adapter";
import { createArtifact, createFact } from "@/lib/intelligence";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/properties/county-extract
 *
 * Extract property data from county assessor websites via Firecrawl.
 * Results flow through the canonical write path:
 *   Firecrawl response → raw artifact → fact assertions → (review gate → CRM sync)
 *
 * Accepts either:
 *   - { leadId, address?, apn?, county?, state? } — auto-selects county portal
 *   - { leadId, url } — scrapes a specific URL
 *
 * Returns extracted facts and artifact ID for tracing.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { leadId, url, address, apn, county, state } = body as {
      leadId: string;
      url?: string;
      address?: string;
      apn?: string;
      county?: string;
      state?: string;
    };

    if (!leadId) {
      return NextResponse.json({ error: "leadId is required" }, { status: 400 });
    }

    if (!firecrawlAdapter.isConfigured()) {
      return NextResponse.json(
        { error: "Firecrawl not configured (FIRECRAWL_API_KEY missing)" },
        { status: 503 },
      );
    }

    // Fetch from Firecrawl
    const result = url
      ? await firecrawlAdapter.scrapeUrl(url)
      : await firecrawlAdapter.lookupProperty({ address, apn, county, state });

    if (result.facts.length === 0) {
      return NextResponse.json({
        ok: true,
        provider: result.provider,
        factsExtracted: 0,
        message: "No data could be extracted from the county page",
        rawPayload: result.rawPayload,
      });
    }

    // Step 1: Store raw artifact
    const artifactId = await createArtifact({
      leadId,
      sourceUrl: (result.rawPayload as Record<string, unknown>).sourceUrl as string ?? url ?? null,
      sourceType: "firecrawl_county_extract",
      sourceLabel: (result.rawPayload as Record<string, unknown>).portalName as string ?? "County assessor page",
      rawExcerpt: JSON.stringify(result.rawPayload).slice(0, 10000),
      capturedBy: "firecrawl-adapter",
    });

    // Step 2: Create fact assertions
    const factResults = [];
    const allContradictions = [];

    for (const fact of result.facts) {
      const factResult = await createFact({
        artifactId,
        leadId,
        factType: fact.fieldName,
        factValue: String(fact.value),
        confidence: fact.confidence === "low" ? "low"
          : fact.confidence === "medium" ? "medium"
          : fact.confidence === "high" ? "high"
          : "unverified",
        assertedBy: `firecrawl:${fact.providerFieldPath}`,
      });

      factResults.push({
        factId: factResult.factId,
        fieldName: fact.fieldName,
        value: fact.value,
        confidence: fact.confidence,
      });

      if (factResult.contradictions.length > 0) {
        allContradictions.push({
          fieldName: fact.fieldName,
          contradictions: factResult.contradictions,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      provider: result.provider,
      artifactId,
      factsExtracted: factResults.length,
      facts: factResults,
      contradictions: allContradictions,
      hasContradictions: allContradictions.length > 0,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[county-extract] Error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
