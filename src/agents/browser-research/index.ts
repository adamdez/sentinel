/**
 * Browser Research Agent
 *
 * Uses Firecrawl /agent endpoint for autonomous web investigation of leads.
 * Searches court records, social media, obituaries, news, property conditions,
 * and listing history — without needing explicit URLs.
 *
 * Write path: research results → dossier_artifacts → fact_assertions → review gate
 * Review gate: All facts created with confidence "low" or "medium" — operator promotes
 * Rollback: Delete artifacts + facts for the research run
 */

import { createAgentRun, completeAgentRun, getFeatureFlag } from "@/lib/control-plane";
import { createArtifact, createFact } from "@/lib/intelligence";

const FIRECRAWL_AGENT_URL = "https://api.firecrawl.dev/v2/agent";
const FIRECRAWL_STATUS_URL = "https://api.firecrawl.dev/v2/agent";
const AGENT_NAME = "browser-research";
const FIRECRAWL_CREDIT_COOLDOWN_MS = 60 * 60 * 1000;

let firecrawlBlockedUntil = 0;
let firecrawlBlockedReason = "";

const INVESTIGATION_SCHEMA = {
  type: "object",
  properties: {
    court_records: {
      type: "array",
      description: "Court cases, lawsuits, liens, judgments involving the owner",
      items: {
        type: "object",
        properties: {
          case_type: { type: "string", description: "Type: probate, foreclosure, bankruptcy, civil, criminal, lien" },
          summary: { type: "string", description: "Brief summary of the filing or case" },
          date: { type: "string", description: "Filing or event date" },
          source_url: { type: "string", description: "URL where this was found" },
        },
      },
    },
    social_profiles: {
      type: "array",
      description: "Social media profiles found (Facebook, LinkedIn, X/Twitter)",
      items: {
        type: "object",
        properties: {
          platform: { type: "string", description: "Platform name" },
          profile_url: { type: "string", description: "Profile URL" },
          summary: { type: "string", description: "Key details from profile — location, occupation, recent posts" },
        },
      },
    },
    obituaries: {
      type: "array",
      description: "Obituaries or death notices for the owner or family members",
      items: {
        type: "object",
        properties: {
          deceased_name: { type: "string", description: "Name of deceased" },
          relationship: { type: "string", description: "Relationship to property owner if known" },
          date: { type: "string", description: "Date of death or obituary publication" },
          summary: { type: "string", description: "Key details — survivors, memorial, estate mentions" },
          source_url: { type: "string", description: "URL of obituary" },
        },
      },
    },
    news_articles: {
      type: "array",
      description: "News articles, arrest records, bankruptcy notices mentioning the owner",
      items: {
        type: "object",
        properties: {
          headline: { type: "string", description: "Article headline" },
          summary: { type: "string", description: "Brief summary of the article" },
          date: { type: "string", description: "Publication date" },
          source_url: { type: "string", description: "Article URL" },
        },
      },
    },
    property_condition: {
      type: "array",
      description: "Code violations, condemned notices, permits, vacancy indicators",
      items: {
        type: "object",
        properties: {
          issue_type: { type: "string", description: "Type: code_violation, condemned, permit, vacancy" },
          summary: { type: "string", description: "Description of the issue" },
          date: { type: "string", description: "Date of filing or observation" },
          source_url: { type: "string", description: "Source URL" },
        },
      },
    },
    listing_history: {
      type: "array",
      description: "Real estate listing history from Zillow, Redfin, Realtor.com, etc.",
      items: {
        type: "object",
        properties: {
          status: { type: "string", description: "Listed, sold, delisted, price reduced" },
          price: { type: "number", description: "List or sale price" },
          date: { type: "string", description: "Listing or sale date" },
          source_url: { type: "string", description: "Listing URL" },
        },
      },
    },
    distress_signals: {
      type: "array",
      description: "Any indicators of seller motivation or distress",
      items: {
        type: "object",
        properties: {
          signal_type: { type: "string", description: "Type: tax_delinquent, pre_foreclosure, divorce, bankruptcy, probate, vacancy, code_violation" },
          detail: { type: "string", description: "Specific detail about the signal" },
          source_url: { type: "string", description: "Source URL" },
        },
      },
    },
  },
};

export interface BrowserResearchInput {
  leadId: string;
  propertyId?: string;
  ownerName?: string;
  propertyAddress?: string;
  county?: string;
  state?: string;
  apn?: string;
  researchGoals?: string[];
}

export interface WebResearchFinding {
  category: string;
  summary: string;
  sourceUrl?: string;
  date?: string;
}

export interface ResearchResult {
  runId: string;
  artifactsCreated: number;
  factsExtracted: number;
  sourcesSearched: number;
  findings: WebResearchFinding[];
  errors: string[];
}

function getFirecrawlAvailability(): { available: true } | { available: false; reason: string } {
  if (Date.now() < firecrawlBlockedUntil) {
    return {
      available: false,
      reason: firecrawlBlockedReason || "Firecrawl agent temporarily disabled after a billing failure.",
    };
  }
  return { available: true };
}

function blockFirecrawlForCredits(reason: string) {
  firecrawlBlockedUntil = Date.now() + FIRECRAWL_CREDIT_COOLDOWN_MS;
  firecrawlBlockedReason = reason;
}

async function checkFirecrawlCredits(apiKey: string): Promise<{ available: boolean; reason?: string }> {
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/team/credit-usage", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      if (res.status === 402) {
        const reason = `Firecrawl credits exhausted: ${err.slice(0, 220)}`;
        blockFirecrawlForCredits(reason);
        return { available: false, reason };
      }
      if (res.status === 401 || res.status === 403) {
        return { available: false, reason: `Firecrawl auth or billing issue: ${err.slice(0, 220)}` };
      }
      return { available: true };
    }

    const data = await res.json().catch(() => null) as {
      data?: { remainingCredits?: number; planCredits?: number };
    } | null;
    const remainingCredits = Number(data?.data?.remainingCredits ?? 0);
    const planCredits = Number(data?.data?.planCredits ?? 0);
    if (remainingCredits <= 0) {
      const reason = `Firecrawl credits exhausted: ${remainingCredits} credits remaining out of ${planCredits || "unknown"} plan credits`;
      blockFirecrawlForCredits(reason);
      return { available: false, reason };
    }
    return { available: true };
  } catch {
    return { available: true };
  }
}

/**
 * Run autonomous web research for a lead via Firecrawl /agent.
 * Returns structured findings persisted as artifacts + facts.
 */
export async function runBrowserResearch(input: BrowserResearchInput): Promise<ResearchResult> {
  const flag = await getFeatureFlag("agent.research.enabled");
  if (!flag?.enabled) {
    return { runId: "", artifactsCreated: 0, factsExtracted: 0, sourcesSearched: 0, findings: [], errors: ["Feature flag disabled"] };
  }

  const availability = getFirecrawlAvailability();
  if (!availability.available) {
    return {
      runId: "",
      artifactsCreated: 0,
      factsExtracted: 0,
      sourcesSearched: 0,
      findings: [],
      errors: [availability.reason],
    };
  }

  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  if (!firecrawlKey) {
    return { runId: "", artifactsCreated: 0, factsExtracted: 0, sourcesSearched: 0, findings: [], errors: ["FIRECRAWL_API_KEY not set"] };
  }

  const creditStatus = await checkFirecrawlCredits(firecrawlKey);
  if (!creditStatus.available) {
    return {
      runId: "",
      artifactsCreated: 0,
      factsExtracted: 0,
      sourcesSearched: 0,
      findings: [],
      errors: [creditStatus.reason ?? "Firecrawl unavailable"],
    };
  }

  const runId = await createAgentRun({
    agentName: AGENT_NAME,
    triggerType: "event",
    leadId: input.leadId,
    inputs: input as unknown as Record<string, unknown>,
  });

  if (!runId) {
    return { runId: "", artifactsCreated: 0, factsExtracted: 0, sourcesSearched: 0, findings: [], errors: ["Dedup: already running"] };
  }

  const errors: string[] = [];
  let artifactsCreated = 0;
  let factsExtracted = 0;
  const findings: WebResearchFinding[] = [];

  try {
    const prompt = buildAgentPrompt(input);

    // Submit Firecrawl Agent job
    const submitRes = await fetch(FIRECRAWL_AGENT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${firecrawlKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        schema: INVESTIGATION_SCHEMA,
        model: "spark-1-pro",
        maxCredits: 150,
      }),
    });

    if (!submitRes.ok) {
      const errText = await submitRes.text().catch(() => "");
      if (submitRes.status === 402 && /insufficient credits/i.test(errText)) {
        const reason = `Firecrawl credits exhausted: ${errText.slice(0, 220)}`;
        blockFirecrawlForCredits(reason);
        throw new Error(reason);
      }
      throw new Error(`Firecrawl Agent submit failed: ${submitRes.status} ${errText}`);
    }

    const submitData = await submitRes.json();
    const jobId = submitData.id;
    if (!jobId) throw new Error("Firecrawl Agent returned no job ID");

    // Poll for completion (max ~90 seconds)
    const agentData = await pollAgentJob(jobId, firecrawlKey);
    if (!agentData) {
      throw new Error("Firecrawl Agent job timed out or failed");
    }

    // Persist each category's findings as artifacts + facts
    const categories = [
      { key: "court_records", factType: "court_record", label: "Court Records" },
      { key: "social_profiles", factType: "social_profile", label: "Social Media" },
      { key: "obituaries", factType: "obituary", label: "Obituaries" },
      { key: "news_articles", factType: "news_article", label: "News" },
      { key: "property_condition", factType: "property_condition", label: "Property Condition" },
      { key: "listing_history", factType: "listing_event", label: "Listing History" },
      { key: "distress_signals", factType: "distress_signal", label: "Distress Signals" },
    ];

    for (const cat of categories) {
      const items = agentData[cat.key];
      if (!Array.isArray(items) || items.length === 0) continue;

      for (const item of items) {
        const summary = item.summary ?? item.headline ?? item.detail ?? item.status ?? "";
        const sourceUrl = item.source_url ?? item.profile_url ?? undefined;

        findings.push({
          category: cat.key,
          summary: typeof summary === "string" ? summary.slice(0, 500) : String(summary),
          sourceUrl,
          date: item.date,
        });

        try {
          const artifactId = await createArtifact({
            leadId: input.leadId,
            propertyId: input.propertyId,
            sourceUrl,
            sourceType: `web_research_${cat.key}`,
            sourceLabel: `${cat.label}: ${typeof summary === "string" ? summary.slice(0, 100) : ""}`,
            extractedNotes: JSON.stringify(item).slice(0, 4000),
            capturedBy: "firecrawl-agent",
          });
          artifactsCreated++;

          const factValue = typeof summary === "string" ? summary.slice(0, 500) : String(summary);
          if (factValue.length > 5) {
            const confidenceLevel = sourceUrl ? "medium" : "low";
            await createFact({
              artifactId,
              leadId: input.leadId,
              factType: `web_${cat.factType}`,
              factValue,
              confidence: confidenceLevel as "low" | "medium",
              runId,
              assertedBy: "firecrawl-agent",
            });
            factsExtracted++;
          }
        } catch (persistErr) {
          errors.push(`Persist ${cat.key}: ${persistErr instanceof Error ? persistErr.message : String(persistErr)}`);
        }
      }
    }

    await completeAgentRun({
      runId,
      status: "completed",
      outputs: { artifactsCreated, factsExtracted, sourcesSearched: categories.length, errors },
    });

    return { runId, artifactsCreated, factsExtracted, sourcesSearched: categories.length, findings, errors };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    const creditFailure = /firecrawl credits exhausted|insufficient credits/i.test(msg);
    await completeAgentRun({
      runId,
      status: creditFailure ? "cancelled" : "failed",
      error: msg,
      outputs: creditFailure ? { skipped: true, reason: "firecrawl_credits_exhausted" } : undefined,
    });
    return { runId, artifactsCreated, factsExtracted, sourcesSearched: 0, findings, errors };
  }
}

function buildAgentPrompt(input: BrowserResearchInput): string {
  const parts: string[] = [];
  const location = input.county && input.state
    ? `${input.county} County, ${input.state}`
    : "Spokane County, WA";

  parts.push(`Investigate this property and its owner for a real estate acquisition company in ${location}.`);
  parts.push("");

  if (input.ownerName) parts.push(`Property Owner: ${input.ownerName}`);
  if (input.propertyAddress) parts.push(`Property Address: ${input.propertyAddress}`);
  if (input.apn) parts.push(`APN/Parcel: ${input.apn}`);
  parts.push(`Location: ${location}`);
  parts.push("");

  parts.push("Find ALL of the following:");
  parts.push("1. Court records: probate filings, foreclosure notices, bankruptcy, civil lawsuits, liens, judgments");
  parts.push("2. Social media: Facebook, LinkedIn, X/Twitter profiles for the owner");
  parts.push("3. Obituaries: death notices for the owner or immediate family members");
  parts.push("4. News articles: any news, arrest records, or public notices mentioning the owner");
  parts.push("5. Property condition: code violations, condemned notices, building permits, vacancy indicators");
  parts.push("6. Listing history: past or current real estate listings on Zillow, Redfin, Realtor.com");
  parts.push("7. Distress signals: tax delinquency, pre-foreclosure, divorce filings, bankruptcy, estate sales");
  parts.push("");
  parts.push("Search thoroughly across multiple sources. Include source URLs for everything found.");

  if (input.researchGoals?.length) {
    parts.push("");
    parts.push(`Additional research goals: ${input.researchGoals.join(", ")}`);
  }

  return parts.join("\n");
}

async function pollAgentJob(
  jobId: string,
  apiKey: string,
  maxWaitMs = 90_000,
): Promise<Record<string, unknown> | null> {
  const start = Date.now();
  let delay = 3000;

  while (Date.now() - start < maxWaitMs) {
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, 10_000);

    try {
      const res = await fetch(`${FIRECRAWL_STATUS_URL}/${jobId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) continue;

      const status = await res.json();
      if (status.status === "completed" && status.data) {
        return status.data as Record<string, unknown>;
      }
      if (status.status === "failed" || status.status === "cancelled") {
        return null;
      }
    } catch {
      // Retry on network errors
    }
  }

  return null;
}

export { AGENT_NAME };
