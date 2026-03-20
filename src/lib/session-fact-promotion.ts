/**
 * Session Fact Promotion
 *
 * Bridges the dialer domain (volatile) into the intelligence pipeline (durable).
 *
 * Dialer call sessions produce `session_extracted_facts` — quick, operator-confirmed
 * signals from live calls (motivation_signal, price_mention, timeline_mention, etc.).
 * These are volatile session-scoped data.
 *
 * When an operator promotes a session fact, this module:
 * 1. Creates a dossier_artifact (source_type: "call_session") for provenance
 * 2. Creates a fact_assertion linked to that artifact
 * 3. Returns contradiction info if the new fact conflicts with existing accepted facts
 *
 * Write path:
 *   session_extracted_facts (dialer domain, volatile)
 *     → dossier_artifacts (intel layer, source_type="call_session")
 *     → fact_assertions (intel layer, pending review)
 *     → [operator reviews] → dossier compilation → CRM sync
 *
 * BOUNDARY RULE: This module reads from the dialer domain but writes only
 * to the intelligence layer. It never writes back to call_sessions or
 * session_extracted_facts.
 */

import { createServerClient } from "@/lib/supabase";
import { createArtifact, createFact } from "@/lib/intelligence";
import type { ConfidenceLevel, CreateFactResult } from "@/lib/intelligence";

// ── Types ──────────────────────────────────────────────────────────

export interface PromoteFactInput {
  /** The session_extracted_facts row ID being promoted */
  sessionFactId: string;
  /** The call session ID this fact came from */
  sessionId: string;
  /** The lead this fact belongs to */
  leadId: string;
  /** Fact type from the dialer domain (mapped to intel fact_type) */
  factType: string;
  /** The raw text captured during the call */
  rawText: string;
  /** Structured value from the session fact, if any */
  structuredValue?: Record<string, unknown>;
  /** Who is promoting this fact (operator user ID) */
  promotedBy: string;
  /** Optional confidence override (defaults to "medium" for operator-confirmed call facts) */
  confidence?: ConfidenceLevel;
  /** Optional hint for which lead field this fact should map to */
  promotedField?: string;
}

export interface PromoteFactResult {
  artifactId: string;
  factResult: CreateFactResult;
}

// ── Fact Type Mapping ──────────────────────────────────────────────

/**
 * Maps dialer session fact types to intel pipeline fact types.
 * Dialer uses short labels; intel pipeline uses normalized types.
 */
const DIALER_TO_INTEL_FACT_TYPE: Record<string, string> = {
  motivation_signal: "seller_motivation",
  price_mention: "asking_price",
  timeline_mention: "seller_timeline",
  condition_note: "property_condition",
  objection: "seller_objection",
  follow_up_intent: "follow_up_signal",
  red_flag: "red_flag",
};

/**
 * Maps dialer fact types to the lead field they would promote to.
 */
const DIALER_TO_PROMOTED_FIELD: Record<string, string> = {
  motivation_signal: "motivation_level",
  price_mention: "asking_price",
  timeline_mention: "seller_timeline",
  condition_note: "property_condition_rating",
};

// ── Promotion Logic ────────────────────────────────────────────────

/**
 * Promote a single session_extracted_fact into the intelligence pipeline.
 *
 * Creates an artifact (evidence record) and a fact assertion (reviewable claim).
 * Returns contradiction info if the fact conflicts with existing accepted facts.
 */
export async function promoteSessionFact(
  input: PromoteFactInput,
): Promise<PromoteFactResult> {
  // 1. Create artifact for provenance
  const artifactId = await createArtifact({
    leadId: input.leadId,
    sourceType: "call_session",
    sourceLabel: `Call session ${input.sessionId}`,
    extractedNotes: input.rawText,
    rawExcerpt: input.structuredValue
      ? JSON.stringify(input.structuredValue)
      : input.rawText,
    capturedBy: input.promotedBy,
  });

  // 2. Create fact assertion in the intel pipeline
  const intelFactType = DIALER_TO_INTEL_FACT_TYPE[input.factType] ?? input.factType;
  const promotedField = input.promotedField
    ?? DIALER_TO_PROMOTED_FIELD[input.factType]
    ?? undefined;

  const factResult = await createFact({
    artifactId,
    leadId: input.leadId,
    factType: intelFactType,
    factValue: input.structuredValue
      ? JSON.stringify(input.structuredValue)
      : input.rawText,
    confidence: input.confidence ?? "medium",
    promotedField,
    assertedBy: input.promotedBy,
  });

  return { artifactId, factResult };
}

/**
 * Promote all confirmed session_extracted_facts for a given call session.
 * Only promotes facts where is_confirmed = true (operator-verified).
 *
 * Returns a summary of what was promoted and any contradictions detected.
 */
export async function promoteAllSessionFacts(
  sessionId: string,
  leadId: string,
  promotedBy: string,
): Promise<BatchPromoteResult> {
  const sb = createServerClient();

  // Fetch confirmed facts from the dialer domain
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: facts, error } = await (sb.from("session_extracted_facts") as any)
    .select("id, fact_type, raw_text, structured_value, is_confirmed")
    .eq("session_id", sessionId)
    .eq("is_confirmed", true);

  if (error) {
    throw new Error(`Failed to fetch session facts: ${error.message}`);
  }

  if (!facts || facts.length === 0) {
    return { promoted: 0, contradictions: 0, results: [] };
  }

  const results: PromoteFactResult[] = [];
  let contradictionCount = 0;

  for (const fact of facts) {
    const result = await promoteSessionFact({
      sessionFactId: fact.id,
      sessionId,
      leadId,
      factType: fact.fact_type,
      rawText: fact.raw_text,
      structuredValue: fact.structured_value ?? undefined,
      promotedBy,
    });

    results.push(result);
    if (result.factResult.contradictions.length > 0) {
      contradictionCount++;
    }
  }

  return {
    promoted: results.length,
    contradictions: contradictionCount,
    results,
  };
}

export interface BatchPromoteResult {
  promoted: number;
  contradictions: number;
  results: PromoteFactResult[];
}
