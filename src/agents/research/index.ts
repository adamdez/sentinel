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
      "## Provider Intelligence (ATTOM / PropertyRadar / Bricked AI)",
      "Treat this as structured evidence from provider adapters. Prefer these facts when relevant.",
      "Bricked AI provides ARV, CMV, repair estimates, and comparable sales — high confidence for valuation.",
      "```json",
      JSON.stringify(summarizedProviderData, null, 2),
      "```",
      "",
    );
  }

  parts.push(
    "## Instructions",
    "Research this lead and produce a JSON response with this exact structure:",
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

    // ── Pull provider intelligence (ATTOM + PropertyRadar + Bricked) ────
    const lookupParams = {
      address: lead.properties?.address ?? undefined,
      apn: lead.properties?.apn ?? undefined,
      county: lead.properties?.county ?? undefined,
      state: lead.properties?.state ?? undefined,
      zip: lead.properties?.zip ?? undefined,
    };
    let providerResults: ProviderLookupResult[] = [];

    if (lookupParams.address || lookupParams.apn) {
      const providerLookup = await lookupProperty(lookupParams, ["attom", "propertyradar", "bricked"]);
      providerResults = providerLookup.results.filter((r) => r.facts.length > 0);

      if (providerLookup.errors.length > 0) {
        console.warn("[research-agent] Provider lookup warnings:", providerLookup.errors);
      }
    }

    // ── Call Claude ─────────────────────────────────────────────────────
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

    const leadContext = toLeadContext(lead, input.leadId);
    const userPrompt = buildResearchPrompt(leadContext, input, providerResults);

    const rawResponse = await analyzeWithClaude({
      prompt: userPrompt,
      systemPrompt: RESEARCH_AGENT_PROMPT,
      apiKey,
      temperature: 0.3,
      maxTokens: 8192,
      model: RESEARCH_AGENT_MODEL,
    });

    // ── Parse response ──────────────────────────────────────────────────
    const jsonStr = extractJsonObject(rawResponse);
    if (!jsonStr) {
      throw new Error("Research Agent returned no valid JSON");
    }

    const output: ResearchAgentOutput = JSON.parse(jsonStr);

    // ── Persist artifacts ───────────────────────────────────────────────
    const aiArtifactIds: string[] = [];
    let artifactCount = 0;
    const allContradictions: Array<{ factType: string; newValue: string; existingValue: string; existingFactId: string }> = [];

    // Persist provider adapter artifacts/facts through the intelligence write path.
    // This makes ATTOM/PropertyRadar evidence available to review workflows today.
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
    const dossierId = await compileDossier({
      leadId: input.leadId,
      propertyId: input.propertyId ?? lead.properties?.id,
      situationSummary: output.dossier.situationSummary,
      likelyDecisionMaker: output.dossier.likelyDecisionMaker ?? undefined,
      topFacts: output.dossier.topFacts,
      recommendedCallAngle: output.dossier.recommendedCallAngle,
      verificationChecklist: output.dossier.verificationChecklist,
      sourceLinks: output.dossier.sourceLinks,
      rawAiOutput: {
        model: RESEARCH_AGENT_MODEL,
        version: RESEARCH_AGENT_VERSION,
        contradictions: output.dossier.contradictions ?? [],
        dbContradictions: allContradictions, // contradictions detected against existing accepted facts
        rawResponse: rawResponse.slice(0, 2000), // truncate for storage
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
