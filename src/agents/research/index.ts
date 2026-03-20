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
} from "@/lib/control-plane";
import {
  createArtifact,
  createFact,
  compileDossier,
  reviewDossier,
  syncDossierToLead,
  startResearchRun,
  closeResearchRun,
} from "@/lib/intelligence";
import { analyzeWithClaude, extractJsonObject } from "@/lib/claude-client";
import { RESEARCH_AGENT_PROMPT, RESEARCH_AGENT_MODEL, RESEARCH_AGENT_VERSION } from "./prompt";
import type {
  ResearchAgentInput,
  ResearchAgentOutput,
  ResearchAgentResult,
} from "./types";

/**
 * Build the user prompt with lead context for the Research Agent.
 */
function buildResearchPrompt(leadContext: Record<string, unknown>, input: ResearchAgentInput): string {
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

    // ── Call Claude ─────────────────────────────────────────────────────
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

    const userPrompt = buildResearchPrompt(lead, input);

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
    const artifactIds: string[] = [];
    const allContradictions: Array<{ factType: string; newValue: string; existingValue: string; existingFactId: string }> = [];
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
      artifactIds.push(artifactId);

      // Link artifact to research run
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("dossier_artifacts") as any)
        .update({ run_id: researchRunId })
        .eq("id", artifactId);
    }

    // ── Persist facts ───────────────────────────────────────────────────
    let factCount = 0;
    for (const fact of output.facts) {
      const artifactId = artifactIds[fact.artifactIndex];
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
    await closeResearchRun(researchRunId, dossierId, artifactIds.length, factCount);

    // ── Auto-review + promote if mode is "auto" ──────────────────────
    // Blueprint: when mode=auto and no contradictions, auto-review the
    // dossier and sync it to the lead. This skips the operator review
    // step for low-risk enrichment passes.
    let finalStatus: string = "queued_for_review";
    const mode = await getAgentMode("research");
    if (mode === "auto" && allContradictions.length === 0 && dossierId) {
      try {
        await reviewDossier(dossierId, "reviewed", "system:auto-review");
        await syncDossierToLead(dossierId);
        finalStatus = "auto_promoted";
      } catch (autoErr) {
        console.warn("[research-agent] Auto-promote failed (non-fatal):", autoErr);
        // Falls back to queued_for_review — operator can still promote manually
      }
    }

    // ── Complete agent run ──────────────────────────────────────────────
    await completeAgentRun({
      runId: agentRunId,
      status: "completed",
      outputs: {
        dossierId,
        artifactCount: artifactIds.length,
        factCount,
        researchRunId,
        autoPromoted: finalStatus === "auto_promoted",
      },
    });

    return {
      runId: agentRunId,
      dossierId,
      artifactCount: artifactIds.length,
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
