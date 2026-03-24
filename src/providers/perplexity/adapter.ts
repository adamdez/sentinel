/**
 * Perplexity Sonar Deep Research Adapter
 *
 * Calls Perplexity's Sonar Deep Research model to independently verify
 * and synthesize intelligence into a readable, cited dossier narrative.
 *
 * This is the "verification + narrative engine" in the research pipeline:
 *   Phase 1 (Providers) → Phase 2 (Firecrawl Agent) → Phase 3 (THIS) → Dossier
 *
 * The adapter receives all evidence gathered so far and asks Perplexity to:
 *   1. Independently search hundreds of sources to verify and expand
 *   2. Cross-reference facts from different sources
 *   3. Write a readable, cited narrative for the operator
 *   4. Flag contradictions between sources
 *
 * Env: PERPLEXITY_API_KEY
 */

const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";

export interface PerplexityResearchInput {
  ownerName?: string;
  propertyAddress?: string;
  county?: string;
  state?: string;
  apn?: string;
  providerSummary: string;
  webFindings: string;
}

export interface PerplexityCitation {
  url: string;
  title?: string;
}

export interface PerplexityResearchResult {
  narrative: string;
  citations: PerplexityCitation[];
  verifiedFacts: Array<{
    factType: string;
    factValue: string;
    confidence: "low" | "medium" | "high";
    sourceDescription: string;
  }>;
  contradictions: Array<{
    claim: string;
    sourceA: string;
    sourceB: string;
    detail: string;
  }>;
  error?: string;
}

export function isPerplexityConfigured(): boolean {
  return Boolean(process.env.PERPLEXITY_API_KEY);
}

/**
 * Run Perplexity Sonar Deep Research for a lead.
 * Returns a verified narrative with citations, structured facts, and contradictions.
 */
export async function runPerplexityResearch(
  input: PerplexityResearchInput,
): Promise<PerplexityResearchResult> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    return {
      narrative: "",
      citations: [],
      verifiedFacts: [],
      contradictions: [],
      error: "PERPLEXITY_API_KEY not configured",
    };
  }

  const location = input.county && input.state
    ? `${input.county} County, ${input.state}`
    : "Spokane County, WA";

  const systemPrompt = `You are an investigative research analyst for a real estate acquisition company. Your job is to produce a thorough, verified dossier about a property owner and their property.

Write a clear, readable narrative that a caller (Logan) can read in under 60 seconds before picking up the phone. Structure it as:

1. **Owner Situation** — Who is the owner? What is their current situation? (probate, financial distress, divorce, elderly, absent, etc.)
2. **Decision Maker** — Who has authority to sell? If probate, who is the PR/executor? Multiple heirs?
3. **Property Context** — What's the property condition? Any code violations, vacancy, listing history?
4. **Recommended Call Angle** — Specific approach for the conversation. Not generic — reference what you found.
5. **Verified Facts** — Key facts with confidence levels based on source quality.
6. **Contradictions** — Any facts that conflict between sources.

RULES:
- Cite every claim with its source URL
- Be direct and factual — no filler
- Flag anything you couldn't verify as "unverified"
- If you find the owner is deceased, identify the likely heir/executor
- If you find distress signals (foreclosure, tax delinquency, bankruptcy), highlight them prominently

After the narrative, output a JSON block with this exact structure:
\`\`\`json
{
  "verified_facts": [
    {"fact_type": "probate_status", "fact_value": "Filed Nov 2025, case #...", "confidence": "high", "source_description": "Spokane County Clerk"}
  ],
  "contradictions": [
    {"claim": "Owner age", "source_a": "Obituary says 78", "source_b": "Facebook says 72", "detail": "Age discrepancy"}
  ]
}
\`\`\``;

  const userPrompt = buildPerplexityPrompt(input, location);

  try {
    const res = await fetch(PERPLEXITY_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar-deep-research",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 4096,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        narrative: "",
        citations: [],
        verifiedFacts: [],
        contradictions: [],
        error: `Perplexity API error: ${res.status} ${errText.slice(0, 200)}`,
      };
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? "";
    const citations = extractCitations(data);

    const { verifiedFacts, contradictions } = parseStructuredOutput(content);

    // The narrative is everything before the JSON block
    const jsonBlockStart = content.indexOf("```json");
    const narrative = jsonBlockStart > 0
      ? content.slice(0, jsonBlockStart).trim()
      : content.trim();

    return {
      narrative,
      citations,
      verifiedFacts,
      contradictions,
    };
  } catch (err) {
    return {
      narrative: "",
      citations: [],
      verifiedFacts: [],
      contradictions: [],
      error: `Perplexity request failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function buildPerplexityPrompt(input: PerplexityResearchInput, location: string): string {
  const parts: string[] = [];

  parts.push(`Research this property and owner thoroughly. Verify the information below and expand with your own findings.`);
  parts.push("");

  if (input.ownerName) parts.push(`Owner Name: ${input.ownerName}`);
  if (input.propertyAddress) parts.push(`Property Address: ${input.propertyAddress}`);
  if (input.apn) parts.push(`APN/Parcel: ${input.apn}`);
  parts.push(`Location: ${location}`);
  parts.push("");

  if (input.providerSummary) {
    parts.push("## Data from property intelligence providers (PropertyRadar, Bricked AI, County GIS):");
    parts.push(input.providerSummary.slice(0, 3000));
    parts.push("");
  }

  if (input.webFindings) {
    parts.push("## Preliminary web research findings (Firecrawl Agent):");
    parts.push(input.webFindings.slice(0, 3000));
    parts.push("");
  }

  parts.push("## Your task:");
  parts.push("1. Verify the facts above by finding independent sources");
  parts.push("2. Search for additional information: court records, probate filings, obituaries, social media, news, property listings, tax records, code violations");
  parts.push("3. Write a clear dossier narrative with your findings");
  parts.push("4. Flag any contradictions between sources");
  parts.push("5. Recommend a specific call angle for the acquisition conversation");

  return parts.join("\n");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractCitations(apiResponse: any): PerplexityCitation[] {
  const citations: PerplexityCitation[] = [];
  const rawCitations = apiResponse.citations;
  if (Array.isArray(rawCitations)) {
    for (const c of rawCitations) {
      if (typeof c === "string") {
        citations.push({ url: c });
      } else if (c && typeof c.url === "string") {
        citations.push({ url: c.url, title: c.title });
      }
    }
  }
  return citations;
}

function parseStructuredOutput(content: string): {
  verifiedFacts: PerplexityResearchResult["verifiedFacts"];
  contradictions: PerplexityResearchResult["contradictions"];
} {
  const verifiedFacts: PerplexityResearchResult["verifiedFacts"] = [];
  const contradictions: PerplexityResearchResult["contradictions"] = [];

  const jsonMatch = content.match(/```json\s*([\s\S]*?)```/);
  if (!jsonMatch) return { verifiedFacts, contradictions };

  try {
    const parsed = JSON.parse(jsonMatch[1]);

    if (Array.isArray(parsed.verified_facts)) {
      for (const f of parsed.verified_facts) {
        if (f.fact_type && f.fact_value) {
          verifiedFacts.push({
            factType: f.fact_type,
            factValue: String(f.fact_value),
            confidence: ["low", "medium", "high"].includes(f.confidence) ? f.confidence : "low",
            sourceDescription: f.source_description ?? "",
          });
        }
      }
    }

    if (Array.isArray(parsed.contradictions)) {
      for (const c of parsed.contradictions) {
        if (c.claim) {
          contradictions.push({
            claim: c.claim,
            sourceA: c.source_a ?? "",
            sourceB: c.source_b ?? "",
            detail: c.detail ?? "",
          });
        }
      }
    }
  } catch {
    // JSON parse failed — return empty structured data, narrative still usable
  }

  return { verifiedFacts, contradictions };
}
