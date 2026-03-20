/**
 * Browser Research Agent
 *
 * Uses Firecrawl (not Playwright directly) to perform automated web research
 * for lead dossiers. Searches county records, news, court dockets, and
 * public information to build intelligence on properties and owners.
 *
 * Write path: research results → dossier_artifacts → fact_assertions → review gate
 * Review gate: All facts created with confidence "low" or "medium" — operator promotes
 * Rollback: Delete artifacts + facts for the research run
 */

import { createServerClient } from "@/lib/supabase";
import { createAgentRun, completeAgentRun, getFeatureFlag } from "@/lib/control-plane";
import { logGeneration } from "@/lib/langfuse";

const FIRECRAWL_API_URL = "https://api.firecrawl.dev/v1";
const AGENT_NAME = "browser-research";

export interface BrowserResearchInput {
  leadId: string;
  ownerName?: string;
  propertyAddress?: string;
  county?: string;
  state?: string;
  apn?: string;
  researchGoals?: string[];
}

export interface ResearchResult {
  runId: string;
  artifactsCreated: number;
  factsExtracted: number;
  sourcesSearched: number;
  errors: string[];
}

/**
 * Run browser research for a lead.
 * Parallelized Firecrawl searches + capped AI extraction to stay under 60s.
 */
export async function runBrowserResearch(input: BrowserResearchInput): Promise<ResearchResult> {
  const flag = await getFeatureFlag("agent.research.enabled");
  if (!flag?.enabled) {
    return { runId: "", artifactsCreated: 0, factsExtracted: 0, sourcesSearched: 0, errors: ["Feature flag disabled"] };
  }

  const runId = await createAgentRun({
    agentName: AGENT_NAME,
    triggerType: "event",
    leadId: input.leadId,
    inputs: input as unknown as Record<string, unknown>,
  });

  if (!runId) {
    return { runId: "", artifactsCreated: 0, factsExtracted: 0, sourcesSearched: 0, errors: ["Dedup: already running"] };
  }

  const sb = createServerClient();
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  const errors: string[] = [];
  let artifactsCreated = 0;
  let factsExtracted = 0;

  try {
    const queries = buildSearchQueries(input);

    // Phase 1: Run ALL Firecrawl searches in parallel (fast — ~3-5s total)
    interface SearchResult {
      url?: string;
      title?: string;
      markdown?: string;
      category: string;
      queryText: string;
    }

    const searchPromises = queries.map(async (query): Promise<SearchResult[]> => {
      try {
        const searchRes = await fetch(`${FIRECRAWL_API_URL}/search`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${firecrawlKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: query.query,
            limit: 2,
            scrapeOptions: { formats: ["markdown"] },
          }),
        });
        if (!searchRes.ok) {
          errors.push(`Search failed for "${query.category}": ${searchRes.status}`);
          return [];
        }
        const searchData = await searchRes.json();
        return (searchData.data ?? []).map((r: Record<string, string>) => ({
          ...r,
          category: query.category,
          queryText: query.query,
        }));
      } catch (err) {
        errors.push(`Error "${query.category}": ${err instanceof Error ? err.message : String(err)}`);
        return [];
      }
    });

    const allResults: SearchResult[] = (await Promise.all(searchPromises)).flat();
    const sourcesSearched = queries.length;

    // Phase 2: Store artifacts in parallel (fast — ~1-2s)
    const artifactIds = new Map<number, string>();
    await Promise.all(allResults.map(async (result, idx) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: artifact } = await (sb.from("dossier_artifacts") as any)
          .insert({
            lead_id: input.leadId,
            source_type: `browser_research_${result.category}`,
            source_provider: "firecrawl",
            raw_payload: {
              url: result.url,
              title: result.title,
              content: result.markdown?.slice(0, 5000),
              query: result.queryText,
            },
            run_id: runId,
          })
          .select("id")
          .single();
        if (artifact) {
          artifactsCreated++;
          artifactIds.set(idx, artifact.id);
        }
      } catch { /* skip failed inserts */ }
    }));

    // Phase 3: AI fact extraction — cap at 4 results to stay under 60s
    const extractable = allResults
      .map((r, idx) => ({ ...r, idx }))
      .filter((r) => r.markdown && process.env.ANTHROPIC_API_KEY)
      .slice(0, 4);

    for (const result of extractable) {
      try {
        const facts = await extractFactsFromContent(
          result.markdown!,
          result.category,
          input,
          runId,
        );
        for (const fact of facts) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (sb.from("fact_assertions") as any)
            .insert({
              lead_id: input.leadId,
              field_name: fact.field,
              value: fact.value,
              confidence: fact.confidence,
              source_type: `browser_research_${result.category}`,
              source_provider: "firecrawl",
              source_url: result.url,
              artifact_id: artifactIds.get(result.idx),
              run_id: runId,
            })
            .select()
            .then(() => {})
            .catch(() => {}); // Skip duplicates
          factsExtracted++;
        }
      } catch (err) {
        errors.push(`Extraction: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await completeAgentRun({
      runId,
      status: "completed",
      outputs: { artifactsCreated, factsExtracted, sourcesSearched, errors },
    });

    return { runId, artifactsCreated, factsExtracted, sourcesSearched, errors };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    await completeAgentRun({ runId, status: "failed", error: msg });
    return { runId, artifactsCreated, factsExtracted, sourcesSearched: 0, errors };
  }
}

// ── Search Query Builder ──────────────────────────────────────────────

interface SearchQuery {
  query: string;
  category: string;
}

function buildSearchQueries(input: BrowserResearchInput): SearchQuery[] {
  const queries: SearchQuery[] = [];
  const { ownerName, propertyAddress, county, state } = input;
  const location = county && state ? `${county} County ${state}` : "Spokane WA";

  // Property-specific searches
  if (propertyAddress) {
    queries.push({
      query: `"${propertyAddress}" property records ${location}`,
      category: "property_records",
    });
    queries.push({
      query: `"${propertyAddress}" sale listing zillow redfin`,
      category: "listing_history",
    });
  }

  // Owner-specific searches
  if (ownerName) {
    queries.push({
      query: `"${ownerName}" ${location} property owner`,
      category: "owner_background",
    });
    queries.push({
      query: `"${ownerName}" ${location} court records lawsuit`,
      category: "court_records",
    });
    queries.push({
      query: `"${ownerName}" obituary ${location}`,
      category: "probate_check",
    });
  }

  // County assessor
  if (propertyAddress || input.apn) {
    const searchTerm = input.apn ?? propertyAddress;
    queries.push({
      query: `${searchTerm} ${county ?? "Spokane"} county assessor tax records`,
      category: "tax_records",
    });
  }

  // Market context
  if (propertyAddress) {
    queries.push({
      query: `${propertyAddress} neighborhood crime safety walkability`,
      category: "neighborhood",
    });
  }

  return queries;
}

// ── AI Fact Extraction ────────────────────────────────────────────────

interface ExtractedFact {
  field: string;
  value: string;
  confidence: "low" | "medium";
}

async function extractFactsFromContent(
  content: string,
  category: string,
  input: BrowserResearchInput,
  traceId: string,
): Promise<ExtractedFact[]> {
  try {
    const { analyzeWithClaude } = await import("@/lib/claude-client");
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return [];

    const prompt = `Extract structured facts from this web content about a property/owner. Return ONLY a JSON array of facts.

Property: ${input.propertyAddress ?? "unknown"}
Owner: ${input.ownerName ?? "unknown"}
Research category: ${category}

Content (truncated):
${content.slice(0, 3000)}

Return JSON array like:
[
  {"field": "owner_occupation", "value": "retired teacher", "confidence": "low"},
  {"field": "property_last_sale_price", "value": "245000", "confidence": "medium"},
  {"field": "tax_delinquent", "value": "true", "confidence": "medium"},
  {"field": "probate_filing", "value": "2025-11-15", "confidence": "medium"}
]

Valid fields: owner_occupation, owner_age_estimate, property_last_sale_price, property_last_sale_date, tax_delinquent, tax_amount_owed, probate_filing, probate_date, lawsuit_filed, lawsuit_type, code_violation, vacancy_indicator, listing_history, neighborhood_quality, school_district, flood_zone, zoning, lot_size, year_built, bedrooms, bathrooms, square_footage, garage, pool, condition_notes, motivation_signal

Only include facts you can actually extract from the content. Empty array [] if nothing relevant.`;

    const result = await analyzeWithClaude({
      prompt,
      systemPrompt: "You are a real estate research analyst extracting structured facts from web content. Return only valid JSON arrays. Be conservative — only extract facts clearly stated in the content.",
      apiKey,
      temperature: 0.1,
      maxTokens: 2048,
      model: "claude-sonnet-4-6",
      traceId,
      generationName: `extract_facts_${category}`,
    });

    // Parse JSON from response
    const jsonMatch = result.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const facts: ExtractedFact[] = JSON.parse(jsonMatch[0]);
    return facts.filter((f) => f.field && f.value);
  } catch {
    return [];
  }
}

// Suppress unused import warning — logGeneration used via claude-client
void logGeneration;

// Export for API route
export { AGENT_NAME };
