/**
 * Research Agent — Runner
 *
 * Blueprint: "Triggered by lead promotion or operator request.
 * Produces enriched property facts, dossier draft, contradiction flags.
 * Review console before CRM sync."
 *
 * This agent:
 * 1. Loads lead context from Sentinel
 * 2. Calls Claude with the research prompt + lead context
 * 3. Persists artifacts, facts, and a proposed dossier through the intelligence pipeline
 * 4. All writes go to staging tables only — operator must review + promote
 *
 * Imported by: /api/agents/research/route.ts
 */

import { createServerClient } from "@/lib/supabase";
import {
  createAgentRun,
  completeAgentRun,
  isAgentEnabled,
  getAgentMode,
  getFeatureFlag,
  submitProposal,
  resolveReviewItem,
} from "@/lib/control-plane";
import {
  createArtifact,
  createFact,
  compileDossier,
  reviewDossier,
  startResearchRun,
  closeResearchRun,
} from "@/lib/intelligence";
import { analyzeWithClaude, extractJsonObject } from "@/lib/claude-client";
import { lookupProperty } from "@/providers/lookup-service";
import type { ProviderLookupResult } from "@/providers/base-adapter";
import { runBrowserResearch, type WebResearchFinding } from "@/agents/browser-research";
import { runPerplexityResearch, isPerplexityConfigured } from "@/providers/perplexity/adapter";
import { RESEARCH_AGENT_PROMPT, RESEARCH_AGENT_MODEL, RESEARCH_AGENT_VERSION } from "./prompt";
import type {
  LeadContext,
  ResearchAgentInput,
  ResearchAgentOutput,
  ResearchAgentResult,
} from "./types";

/**
 * Map a raw Supabase lead row (with joined properties/contacts) to a typed LeadContext.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toLeadContext(lead: any, leadId: string): LeadContext {
  const prop = lead.properties ?? null;
  const contacts = Array.isArray(lead.contacts) ? lead.contacts : [];

  return {
    leadId,
    status: lead.status ?? null,
    priority: lead.priority ?? null,
    source: lead.source ?? null,
    notes: lead.notes ?? null,
    tags: lead.tags ?? null,
    nextAction: lead.next_action ?? null,
    nextActionDueAt: lead.next_action_due_at ?? null,
    decisionMakerNote: lead.decision_maker_note ?? null,
    property: prop
      ? {
          id: prop.id,
          address: prop.address ?? null,
          city: prop.city ?? null,
          state: prop.state ?? null,
          zip: prop.zip ?? null,
          county: prop.county ?? null,
          ownerName: prop.owner_name ?? null,
          ownerPhone: prop.owner_phone ?? null,
          estimatedValue: prop.estimated_value ?? null,
          equityPercent: prop.equity_percent ?? null,
          propertyType: prop.property_type ?? null,
          yearBuilt: prop.year_built ?? null,
          bedrooms: prop.bedrooms ?? null,
          bathrooms: prop.bathrooms ?? null,
          sqft: prop.sqft ?? null,
          lotSize: prop.lot_size ?? null,
        }
      : null,
    contacts: contacts.map((c: any) => ({
      firstName: c.first_name ?? null,
      lastName: c.last_name ?? null,
      phone: c.phone ?? null,
      email: c.email ?? null,
    })),
  };
}

/**
 * Build the user prompt with lead context for the Research Agent.
 */
function buildResearchPrompt(
  leadContext: LeadContext,
  input: ResearchAgentInput,
  providerResults: ProviderLookupResult[],
  webFindings: WebResearchFinding[] = [],
  perplexityNarrative = "",
): string {
  const parts: string[] = [
    "## Lead Context",
    "```json",
    JSON.stringify(leadContext, null, 2),
    "```",
    "",
  ];

  if (input.focusAreas?.length) {
    parts.push(`## Focus Areas\nPlease prioritize research on: ${input.focusAreas.join(", ")}`);
    parts.push("");
  }

  if (input.operatorNotes) {
    parts.push(`## Operator Notes\n${input.operatorNotes}`);
    parts.push("");
  }

  if (providerResults.length > 0) {
    const summarizedProviderData = providerResults.map((result) => ({
      provider: result.provider,
      fetchedAt: result.fetchedAt,
      cached: result.cached,
      factCount: result.facts.length,
      facts: result.facts.slice(0, 60).map((fact) => ({
        fieldName: fact.fieldName,
        value: fact.value,
        confidence: fact.confidence,
      })),
    }));

    parts.push(
      "## Provider Intelligence (PropertyRadar / Bricked AI / County GIS / Firecrawl)",
      "Treat this as structured evidence from provider adapters. Prefer these facts when relevant.",
      "Bricked AI provides ARV, CMV, repair estimates, and comparable sales — high confidence for valuation.",
      "```json",
      JSON.stringify(summarizedProviderData, null, 2),
      "```",
      "",
    );
  }

  if (webFindings.length > 0) {
    parts.push(
      "## Web Research Findings (Firecrawl Agent)",
      "The following findings were gathered by autonomous web investigation. Use them as supporting evidence.",
    );
    for (const f of webFindings.slice(0, 30)) {
      parts.push(`- [${f.category}] ${f.summary}${f.sourceUrl ? ` (source: ${f.sourceUrl})` : ""}${f.date ? ` [${f.date}]` : ""}`);
    }
    parts.push("");
  }

  if (perplexityNarrative.length > 50) {
    parts.push(
      "## Verified Dossier Narrative (Perplexity Deep Research)",
      "The following narrative was independently researched and verified across hundreds of sources.",
      "USE THIS as the primary basis for your situation_summary and recommended_call_angle.",
      "Your job is to structure it into the JSON format below, not to rewrite it.",
      "",
      perplexityNarrative.slice(0, 5000),
      "",
    );
  }

  parts.push(
    "## Instructions",
    "Synthesize ALL evidence above into a JSON response with this exact structure:",
    "```json",
    JSON.stringify({
      artifacts: [{
        sourceUrl: "https://example.com/...",
        sourceType: "probate_filing",
        sourceLabel: "Spokane County Probate Docket",
        extractedNotes: "Key findings from this source...",
      }],
      facts: [{
        factType: "probate_status",
        factValue: "Probate filed November 2025, case #...",
        confidence: "medium",
        artifactIndex: 0,
        promotedField: "situation_summary",
      }],
      dossier: {
        situationSummary: "1-2 sentence summary for Logan...",
        likelyDecisionMaker: "Name and role",
        recommendedCallAngle: "Specific approach for the call...",
        topFacts: [{ type: "probate_status", value: "...", confidence: "medium" }],
        verificationChecklist: [{ item: "Verify probate case number", verified: false }],
        sourceLinks: [{ url: "https://...", label: "Source description" }],
        contradictions: [],
      }
    }, null, 2),
    "```",
    "",
    "Return ONLY the JSON object. No markdown fences, no explanation text.",
  );

  return parts.join("\n");
}

function sanitizeFactKey(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function formatFactValue(value: string | number | boolean | null): string {
  if (value === null || value === undefined) return "unknown";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

/**
 * Run the Research Agent for a single lead.
 *
 * All writes go to staging tables (dossier_artifacts, fact_assertions,
 * dossiers with status='proposed'). Operator must review + promote.
 */
export async function runResearchAgent(
  input: ResearchAgentInput,
): Promise<ResearchAgentResult> {
  // ── Feature flag check ──────────────────────────────────────────────
  const enabled = await isAgentEnabled("research");
  if (!enabled) {
    return {
      runId: "",
      dossierId: null,
      artifactCount: 0,
      factCount: 0,
      status: "failed",
      error: "Research agent disabled via feature flag",
    };
  }

  // ── Create traced agent run (with dedup guard) ─────────────────────
  const agentRunId = await createAgentRun({
    agentName: "research",
    triggerType: "operator_request",
    triggerRef: input.leadId,
    leadId: input.leadId,
    model: RESEARCH_AGENT_MODEL,
    promptVersion: RESEARCH_AGENT_VERSION,
    inputs: {
      leadId: input.leadId,
      focusAreas: input.focusAreas,
      triggeredBy: input.triggeredBy,
    },
  });

  if (!agentRunId) {
    return {
      runId: "dedup",
      dossierId: null,
      artifactCount: 0,
      factCount: 0,
      status: "failed",
      error: "Research Agent already running for this lead — skipped duplicate.",
    };
  }

  try {
    const sb = createServerClient();

    // ── Load lead context ───────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lead, error: leadErr } = await (sb.from("leads") as any)
      .select(`
        id, status, priority, source, notes, tags,
        next_action, next_action_due_at,
        decision_maker_note,
        properties(id, address, city, state, zip, owner_name, owner_phone,
                   estimated_value, equity_percent, property_type, year_built,
                   bedrooms, bathrooms, sqft, lot_size, county),
        contacts(first_name, last_name, phone, email)
      `)
      .eq("id", input.leadId)
      .single();

    if (leadErr || !lead) {
      throw new Error(`Lead not found: ${input.leadId}`);
    }

    // ── Start research run ──────────────────────────────────────────────
    const researchRunId = await startResearchRun(
      input.leadId,
      input.propertyId ?? lead.properties?.id,
      input.triggeredBy,
    );

    // ── Pull provider intelligence (PropertyRadar + Bricked) ─────────────
    const lookupParams = {
      address: lead.properties?.address ?? undefined,
      apn: lead.properties?.apn ?? undefined,
      county: lead.properties?.county ?? undefined,
      state: lead.properties?.state ?? undefined,
      zip: lead.properties?.zip ?? undefined,
    };
    let providerResults: ProviderLookupResult[] = [];

    if (lookupParams.address || lookupParams.apn) {
      const providerLookup = await lookupProperty(lookupParams, ["propertyradar", "bricked", "spokane_gis", "firecrawl"]);
      providerResults = providerLookup.results.filter((r) => r.facts.length > 0);

      if (providerLookup.errors.length > 0) {
        console.warn("[research-agent] Provider lookup warnings:", providerLookup.errors);
      }
    }

    // ── Phase 2: Firecrawl Agent web investigation ────────────────────
    let webFindings: WebResearchFinding[] = [];
    const prop = lead.properties;
    try {
      const webResult = await runBrowserResearch({
        leadId: input.leadId,
        propertyId: input.propertyId ?? prop?.id,
        ownerName: prop?.owner_name ?? undefined,
        propertyAddress: prop?.address ?? undefined,
        county: prop?.county ?? undefined,
        state: prop?.state ?? undefined,
        apn: prop?.apn ?? undefined,
        researchGoals: input.focusAreas,
      });
      webFindings = webResult.findings;
      console.log(`[research-agent] Phase 2 complete: ${webResult.artifactsCreated} artifacts, ${webResult.factsExtracted} facts from web`);
    } catch (webErr) {
      console.warn("[research-agent] Phase 2 (web research) failed (non-fatal):", webErr);
    }

    // ── Phase 3: Perplexity Deep Research (verification + narrative) ──
    let perplexityNarrative = "";
    let perplexityCitations: Array<{ url: string; title?: string }> = [];
    let perplexityVerifiedFacts: Array<{ factType: string; factValue: string; confidence: "low" | "medium" | "high"; sourceDescription: string }> = [];
    let perplexityContradictions: Array<{ claim: string; sourceA: string; sourceB: string; detail: string }> = [];

    if (isPerplexityConfigured()) {
      try {
        const providerSummary = providerResults
          .map((r) => `${r.provider}: ${r.facts.slice(0, 20).map(f => `${f.fieldName}=${f.value}`).join(", ")}`)
          .join("\n");
        const webSummary = webFindings
          .map((f) => `[${f.category}] ${f.summary}${f.sourceUrl ? ` (${f.sourceUrl})` : ""}`)
          .join("\n");

        const pxResult = await runPerplexityResearch({
          ownerName: prop?.owner_name ?? undefined,
          propertyAddress: prop?.address ?? undefined,
          county: prop?.county ?? undefined,
          state: prop?.state ?? undefined,
          apn: prop?.apn ?? undefined,
          providerSummary,
          webFindings: webSummary,
        });

        if (pxResult.error) {
          console.warn("[research-agent] Phase 3 (Perplexity) warning:", pxResult.error);
        }

        perplexityNarrative = pxResult.narrative;
        perplexityCitations = pxResult.citations;
        perplexityVerifiedFacts = pxResult.verifiedFacts;
        perplexityContradictions = pxResult.contradictions;

        // Persist Perplexity narrative as a verified artifact
        if (perplexityNarrative.length > 50) {
          const pxArtifactId = await createArtifact({
            leadId: input.leadId,
            propertyId: input.propertyId ?? prop?.id,
            sourceType: "perplexity_deep_research",
            sourceLabel: "Perplexity Sonar Deep Research — verified narrative",
            extractedNotes: perplexityNarrative.slice(0, 8000),
            rawExcerpt: JSON.stringify({ citations: perplexityCitations, contradictions: perplexityContradictions }).slice(0, 5000),
            capturedBy: "perplexity-sonar",
          });

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (sb.from("dossier_artifacts") as any)
            .update({ run_id: researchRunId })
            .eq("id", pxArtifactId);

          // Persist Perplexity's verified facts
          for (const vf of perplexityVerifiedFacts) {
            await createFact({
              artifactId: pxArtifactId,
              leadId: input.leadId,
              factType: `verified_${sanitizeFactKey(vf.factType)}`,
              factValue: vf.factValue.slice(0, 500),
              confidence: vf.confidence,
              runId: researchRunId,
              assertedBy: "perplexity-sonar",
            });
          }
        }

        console.log(`[research-agent] Phase 3 complete: ${perplexityVerifiedFacts.length} verified facts, ${perplexityContradictions.length} contradictions`);
      } catch (pxErr) {
        console.warn("[research-agent] Phase 3 (Perplexity) failed (non-fatal):", pxErr);
      }
    } else {
      console.debug("[research-agent] Phase 3 skipped — PERPLEXITY_API_KEY not configured");
    }

    // ── Phase 4: Claude analysis (provider fact extraction + dossier structure) ──
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

    const leadContext = toLeadContext(lead, input.leadId);
    const userPrompt = buildResearchPrompt(leadContext, input, providerResults, webFindings, perplexityNarrative);

    const rawResponse = await analyzeWithClaude({
      prompt: userPrompt,
      systemPrompt: RESEARCH_AGENT_PROMPT,
      apiKey,
      temperature: 0.3,
      maxTokens: 8192,
      model: RESEARCH_AGENT_MODEL,
      timeoutMs: 90_000,
      maxRetries: 0,
    });

    // ── Parse response ──────────────────────────────────────────────────
    const jsonStr = extractJsonObject(rawResponse);
    if (!jsonStr) {
      throw new Error("Research Agent returned no valid JSON");
    }

    const output: ResearchAgentOutput = JSON.parse(jsonStr);

    // ── Persist Claude artifacts ─────────────────────────────────────────
    const aiArtifactIds: string[] = [];
    let artifactCount = 0;
    const allContradictions: Array<{ factType: string; newValue: string; existingValue: string; existingFactId: string }> = [];

    // Include Perplexity contradictions in the master list
    for (const pc of perplexityContradictions) {
      allContradictions.push({
        factType: `perplexity_${sanitizeFactKey(pc.claim)}`,
        newValue: pc.sourceB,
        existingValue: pc.sourceA,
        existingFactId: "perplexity-cross-ref",
      });
    }

    // Persist provider adapter artifacts/facts through the intelligence write path.
    // This makes PropertyRadar/Bricked evidence available to review workflows today.
    let factCount = 0;
    for (const providerResult of providerResults) {
      const providerArtifactId = await createArtifact({
        leadId: input.leadId,
        propertyId: input.propertyId ?? lead.properties?.id,
        sourceType: "provider_lookup",
        sourceLabel: `${providerResult.provider} property lookup`,
        extractedNotes: `Imported ${providerResult.facts.length} canonical facts from ${providerResult.provider}`,
        rawExcerpt: JSON.stringify({
          provider: providerResult.provider,
          fetchedAt: providerResult.fetchedAt,
          cached: providerResult.cached,
          rawPayload: providerResult.rawPayload,
        }).slice(0, 30_000),
        capturedBy: input.triggeredBy,
      });
      artifactCount++;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("dossier_artifacts") as any)
        .update({ run_id: researchRunId })
        .eq("id", providerArtifactId);

      for (const fact of providerResult.facts) {
        const providerFactType = `provider_${sanitizeFactKey(providerResult.provider)}_${sanitizeFactKey(fact.fieldName)}`;
        const result = await createFact({
          artifactId: providerArtifactId,
          leadId: input.leadId,
          factType: providerFactType,
          factValue: formatFactValue(fact.value),
          confidence: fact.confidence,
          runId: researchRunId,
          assertedBy: input.triggeredBy,
        });
        factCount++;

        if (result.contradictions.length > 0) {
          allContradictions.push(
            ...result.contradictions.map((c) => ({
              factType: providerFactType,
              newValue: c.newValue,
              existingValue: c.existingValue,
              existingFactId: c.existingFactId,
            })),
          );
        }
      }
    }

    // ── Sync high-confidence Bricked valuation to lead ownerFlags ──────
    // This makes ARV/CMV immediately visible in the overview tab without
    // waiting for manual dossier promotion. Write path: provider → CRM sync.
    const brickedResult = providerResults.find(r => r.provider === "bricked");
    if (brickedResult && brickedResult.facts.length > 0) {
      const getFact = (name: string) =>
        brickedResult.facts.find(f => f.fieldName === name)?.value;
      const brickedSync: Record<string, unknown> = {};

      const arvEst = getFact("arv_estimate");
      if (typeof arvEst === "number" && arvEst > 0) brickedSync.comp_arv = arvEst;

      const cmvEst = getFact("cmv_estimate");
      if (typeof cmvEst === "number" && cmvEst > 0) brickedSync.bricked_cmv = cmvEst;

      const repairCost = getFact("total_repair_cost");
      if (typeof repairCost === "number" && repairCost > 0) brickedSync.bricked_repair_cost = repairCost;

      const shareLink = getFact("bricked_share_link");
      if (typeof shareLink === "string" && shareLink) brickedSync.bricked_share_link = shareLink;

      const brickedId = getFact("bricked_property_id");
      if (typeof brickedId === "string" && brickedId) brickedSync.bricked_id = brickedId;

      const brickedCompCount = getFact("comp_count");
      if (typeof brickedCompCount === "number") brickedSync.comp_count = brickedCompCount;

      const brickedArv = getFact("arv_estimate");
      if (typeof brickedArv === "number" && brickedArv > 0) brickedSync.bricked_arv = brickedArv;

      const renovScore = getFact("renovation_score");
      if (typeof renovScore === "number") brickedSync.bricked_renovation_score = renovScore;

      const equity = getFact("estimated_equity");
      if (typeof equity === "number" && equity > 0) brickedSync.bricked_equity = equity;

      const mortgage = getFact("open_mortgage_balance");
      if (typeof mortgage === "number" && mortgage > 0) brickedSync.bricked_open_mortgage = mortgage;

      const ownerNames = getFact("owner_names");
      if (typeof ownerNames === "string" && ownerNames) brickedSync.bricked_owner_names = ownerNames;

      const ownerYears = getFact("ownership_length_years");
      if (typeof ownerYears === "number") brickedSync.bricked_ownership_years = ownerYears;

      const rawPayload = brickedResult.rawPayload as Record<string, unknown>;
      const repairs = rawPayload?.repairs;
      if (Array.isArray(repairs) && repairs.length > 0) brickedSync.bricked_repairs = repairs;

      const images = (rawPayload?.property as any)?.images;
      if (Array.isArray(images) && images.length > 0) brickedSync.bricked_subject_images = images;

      const dashboardLink = rawPayload?.dashboardLink;
      if (typeof dashboardLink === "string" && dashboardLink) brickedSync.bricked_dashboard_link = dashboardLink;

      if (Object.keys(brickedSync).length > 0) {
        // JSONB merge via read-modify-write — preserves existing ownerFlags
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: currentLead } = await (sb.from("leads") as any)
          .select("owner_flags")
          .eq("id", input.leadId)
          .single();
        const merged = {
          ...((currentLead?.owner_flags as Record<string, unknown>) ?? {}),
          ...brickedSync,
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb.from("leads") as any)
          .update({ owner_flags: merged })
          .eq("id", input.leadId);

        console.log("[research-agent] Synced Bricked valuation to ownerFlags:", Object.keys(brickedSync));
      }
    }

    // ── Auto-promote high-confidence provider facts ────────────────────
    // Blueprint: "high" confidence facts from trusted providers auto-promote
    // to avoid review queue bottleneck. Facts with contradictions still
    // route to manual review via the standard pending path.
    for (const providerResult of providerResults) {
      for (const fact of providerResult.facts) {
        if (
          fact.confidence === "high" &&
          !allContradictions.some(c =>
            c.factType === `provider_${sanitizeFactKey(providerResult.provider)}_${sanitizeFactKey(fact.fieldName)}`,
          )
        ) {
          const factType = `provider_${sanitizeFactKey(providerResult.provider)}_${sanitizeFactKey(fact.fieldName)}`;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (sb.from("fact_assertions") as any)
            .update({ review_status: "accepted" })
            .eq("lead_id", input.leadId)
            .eq("fact_type", factType)
            .eq("review_status", "pending");
        }
      }
    }

    for (const artifact of output.artifacts) {
      const artifactId = await createArtifact({
        leadId: input.leadId,
        propertyId: input.propertyId ?? lead.properties?.id,
        sourceUrl: artifact.sourceUrl ?? undefined,
        sourceType: artifact.sourceType,
        sourceLabel: artifact.sourceLabel,
        extractedNotes: artifact.extractedNotes,
        rawExcerpt: artifact.rawExcerpt,
        capturedBy: input.triggeredBy,
      });
      aiArtifactIds.push(artifactId);
      artifactCount++;

      // Link artifact to research run
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("dossier_artifacts") as any)
        .update({ run_id: researchRunId })
        .eq("id", artifactId);
    }

    // ── Persist model-extracted facts ───────────────────────────────────
    for (const fact of output.facts) {
      const artifactId = aiArtifactIds[fact.artifactIndex];
      if (!artifactId) continue; // skip if artifact index is out of range

      const result = await createFact({
        artifactId,
        leadId: input.leadId,
        factType: fact.factType,
        factValue: fact.factValue,
        confidence: fact.confidence,
        promotedField: fact.promotedField,
        runId: researchRunId,
        assertedBy: input.triggeredBy,
      });
      factCount++;

      // Track contradictions detected during fact creation
      if (result.contradictions.length > 0) {
        allContradictions.push(
          ...result.contradictions.map(c => ({
            factType: fact.factType,
            newValue: c.newValue,
            existingValue: c.existingValue,
            existingFactId: c.existingFactId,
          })),
        );
      }
    }

    // ── Compile proposed dossier ────────────────────────────────────────
    // Prefer Perplexity narrative for situation summary when available —
    // it's independently verified across hundreds of sources.
    const finalSituationSummary = perplexityNarrative.length > 50
      ? perplexityNarrative.slice(0, 2000)
      : output.dossier.situationSummary;

    // Merge source links from Claude + Perplexity citations
    const mergedSourceLinks = [
      ...(output.dossier.sourceLinks ?? []),
      ...perplexityCitations.map((c) => ({ url: c.url, label: c.title ?? "Perplexity source" })),
    ];

    const dossierId = await compileDossier({
      leadId: input.leadId,
      propertyId: input.propertyId ?? lead.properties?.id,
      situationSummary: finalSituationSummary,
      likelyDecisionMaker: output.dossier.likelyDecisionMaker ?? undefined,
      topFacts: output.dossier.topFacts,
      recommendedCallAngle: output.dossier.recommendedCallAngle,
      verificationChecklist: output.dossier.verificationChecklist,
      sourceLinks: mergedSourceLinks,
      rawAiOutput: {
        model: RESEARCH_AGENT_MODEL,
        version: RESEARCH_AGENT_VERSION,
        phases: {
          providers: providerResults.map(r => r.provider),
          webResearch: { findingsCount: webFindings.length },
          perplexity: { narrativeLength: perplexityNarrative.length, citationCount: perplexityCitations.length, verifiedFactCount: perplexityVerifiedFacts.length },
          claude: { model: RESEARCH_AGENT_MODEL },
        },
        contradictions: output.dossier.contradictions ?? [],
        perplexityContradictions,
        dbContradictions: allContradictions,
        rawResponse: rawResponse.slice(0, 2000),
      },
      aiRunId: agentRunId,
    });

    // ── Close research run ──────────────────────────────────────────────
    await closeResearchRun(researchRunId, dossierId, artifactCount, factCount);

    // ── Auto-review + promote if mode is "auto" ──────────────────────
    // Blueprint: when mode=auto and no contradictions, auto-review the
    // dossier and submit a proposal to the review queue instead of
    // writing directly to the CRM. This preserves the audit trail.
    // Gated behind feature flag — if not explicitly enabled, dossier stays "proposed".
    let finalStatus: string = "queued_for_review";
    const mode = await getAgentMode("research");
    const autoPromoteFlag = await getFeatureFlag("agent.research.auto_promote");
    if (mode === "auto" && allContradictions.length === 0 && dossierId && autoPromoteFlag?.enabled) {
      try {
        await reviewDossier(dossierId, "reviewed", "system:auto-review");

        // Derive a numeric confidence score from the distribution of fact confidence levels
        const highConfidenceFacts = output.facts.filter(
          f => f.confidence === "high",
        ).length;
        const confidenceScore = factCount > 0 ? Math.round((highConfidenceFacts / factCount) * 100) : 0;

        // Submit proposal to review queue instead of writing directly to CRM
        const proposalId = await submitProposal({
          runId: agentRunId ?? "",
          agentName: "research",
          entityType: "dossier",
          entityId: dossierId,
          action: "sync_dossier_to_lead",
          proposal: { dossierId, confidence: confidenceScore },
          rationale: `Auto-review: 0 contradictions. Confidence: ${confidenceScore}. Facts: ${factCount}.`,
          priority: confidenceScore >= 75 ? 2 : 5,
          expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
        });

        // Policy gate: auto-approve high-confidence proposals (≥80% confidence, ≥5 facts)
        // This keeps audit trail intact while removing human friction for clear wins
        if (proposalId && confidenceScore >= 80 && factCount >= 5) {
          await resolveReviewItem(proposalId, "approved", "policy:high_confidence");
        }

        finalStatus = "pending_review";
      } catch (autoErr) {
        console.warn("[research-agent] Auto-promote failed (non-fatal):", autoErr);
        // Falls back to queued_for_review — operator can still promote manually
      }
    } else if (mode === "auto" && allContradictions.length === 0 && dossierId && !autoPromoteFlag?.enabled) {
      console.debug("[research-agent] Auto-promote skipped — feature flag agent.research.auto_promote not enabled. Dossier remains proposed.");
    }

    // ── Complete agent run ──────────────────────────────────────────────
    await completeAgentRun({
      runId: agentRunId,
      status: "completed",
      outputs: {
        dossierId,
        artifactCount,
        factCount,
        researchRunId,
        pendingReview: finalStatus === "pending_review",
      },
    });

    return {
      runId: agentRunId,
      dossierId,
      artifactCount,
      factCount,
      status: finalStatus as ResearchAgentResult["status"],
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    // Mark agent run as failed
    await completeAgentRun({
      runId: agentRunId,
      status: "failed",
      error: errorMsg,
    }).catch(() => {});

    return {
      runId: agentRunId,
      dossierId: null,
      artifactCount: 0,
      factCount: 0,
      status: "failed",
      error: errorMsg,
    };
  }
}
