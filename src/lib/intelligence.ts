/**
 * Intelligence Service Layer
 *
 * Implements the canonical write path from Blueprint Section 4.2:
 *   Provider payload → raw artifact → normalized fact assertions →
 *   dossier / assessment → review policy → CRM sync snapshot →
 *   Sentinel projection
 *
 * This module provides the pipeline logic that connects:
 *   dossier_artifacts → fact_assertions → dossiers → leads (projection)
 *
 * BOUNDARY RULES:
 *   - Artifacts are raw evidence captured from external sources
 *   - Facts are discrete claims extracted from artifacts (with confidence)
 *   - Dossiers summarize the best facts into an operator-ready brief
 *   - Only reviewed dossiers sync to CRM projection fields
 *   - No provider field names leak past this layer
 */

import { createServerClient } from "@/lib/supabase";
import { createAgentRun, completeAgentRun, submitProposal } from "@/lib/control-plane";

// ─── Types ──────────────────────────────────────────────────────────

export type ConfidenceLevel = "unverified" | "low" | "medium" | "high";
export type FactReviewStatus = "pending" | "accepted" | "rejected" | "superseded";
export type DossierStatus = "proposed" | "reviewed" | "rejected" | "stale";

export interface CreateArtifactInput {
  leadId: string;
  propertyId?: string;
  dossierId?: string;
  sourceUrl?: string;
  sourceType: string;
  sourceLabel?: string;
  extractedNotes?: string;
  rawExcerpt?: string;
  capturedBy?: string;
}

export interface CreateFactInput {
  artifactId: string;
  leadId: string;
  factType: string;
  factValue: string;
  confidence?: ConfidenceLevel;
  promotedField?: string;
  runId?: string;
  assertedBy?: string;
}

export interface DossierCompileInput {
  leadId: string;
  propertyId?: string;
  situationSummary: string;
  likelyDecisionMaker?: string;
  topFacts?: Array<{ type: string; value: string; confidence: string }>;
  recommendedCallAngle?: string;
  verificationChecklist?: Array<{ item: string; verified: boolean }>;
  sourceLinks?: Array<{ url: string; label: string }>;
  rawAiOutput?: Record<string, unknown>;
  aiRunId?: string;
}

/** Fields that sync from a reviewed dossier to the lead record (Blueprint 9.1). */
export interface CRMSyncProjection {
  currentDossierId: string;
  sellerSituationSummaryShort: string | null;
  recommendedCallAngle: string | null;
  likelyDecisionMaker: string | null;
  decisionMakerConfidence: string | null;
  topFact1: string | null;
  topFact2: string | null;
  topFact3: string | null;
  recommendedNextAction: string | null;
  propertySnapshotStatus: string;
  confidenceScore: number | null;
}

// ─── Artifact Operations ────────────────────────────────────────────

/**
 * Create a raw artifact (evidence from an external source).
 * Step 1 of the write path. Does not require review.
 */
export async function createArtifact(input: CreateArtifactInput): Promise<string> {
  const sb = createServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("dossier_artifacts") as any)
    .insert({
      lead_id: input.leadId,
      property_id: input.propertyId ?? null,
      dossier_id: input.dossierId ?? null,
      source_url: input.sourceUrl ?? null,
      source_type: input.sourceType,
      source_label: input.sourceLabel ?? null,
      extracted_notes: input.extractedNotes ?? null,
      raw_excerpt: input.rawExcerpt ?? null,
      captured_by: input.capturedBy ?? null,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create artifact: ${error.message}`);
  return data.id;
}

/**
 * List artifacts for a lead, most recent first.
 */
export async function getArtifactsForLead(leadId: string, limit = 20) {
  const sb = createServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("dossier_artifacts") as any)
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to fetch artifacts: ${error.message}`);
  return data ?? [];
}

// ─── Fact Assertion Operations ──────────────────────────────────────

/**
 * Create a fact assertion extracted from an artifact.
 * Step 2 of the write path. Starts as pending review.
 *
 * Automatically checks for contradictions with existing accepted facts
 * of the same type for the same lead. Contradictions are returned so
 * callers can flag them in the review queue.
 */
export async function createFact(input: CreateFactInput): Promise<CreateFactResult> {
  const sb = createServerClient();

  // Check for contradictions before inserting
  const contradictions = await detectContradictions(
    sb, input.leadId, input.factType, input.factValue,
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("fact_assertions") as any)
    .insert({
      artifact_id: input.artifactId,
      lead_id: input.leadId,
      fact_type: input.factType,
      fact_value: input.factValue,
      confidence: input.confidence ?? "unverified",
      review_status: "pending",
      promoted_field: input.promotedField ?? null,
      run_id: input.runId ?? null,
      asserted_by: input.assertedBy ?? null,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create fact: ${error.message}`);

  return {
    factId: data.id,
    contradictions,
  };
}

export interface CreateFactResult {
  factId: string;
  contradictions: Contradiction[];
}

export interface Contradiction {
  existingFactId: string;
  existingValue: string;
  existingConfidence: string;
  newValue: string;
}

/**
 * Detect contradictions between a proposed fact and existing accepted facts.
 * A contradiction exists when the same lead has an accepted fact of the same
 * type but with a different value. This creates an explicit record —
 * contradictions are never silently overwritten (confidence ladder rule).
 */
async function detectContradictions(
  sb: ReturnType<typeof createServerClient>,
  leadId: string,
  factType: string,
  factValue: string,
): Promise<Contradiction[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (sb.from("fact_assertions") as any)
    .select("id, fact_value, confidence")
    .eq("lead_id", leadId)
    .eq("fact_type", factType)
    .eq("review_status", "accepted")
    .neq("fact_value", factValue);

  if (!existing || existing.length === 0) return [];

  return existing.map((e: { id: string; fact_value: string; confidence: string }) => ({
    existingFactId: e.id,
    existingValue: e.fact_value,
    existingConfidence: e.confidence,
    newValue: factValue,
  }));
}

/**
 * Review a fact assertion (accept or reject).
 * Only accepted facts contribute to dossier compilation.
 */
export async function reviewFact(
  factId: string,
  status: "accepted" | "rejected",
  reviewedBy: string,
  newConfidence?: ConfidenceLevel,
): Promise<void> {
  const sb = createServerClient();

  const updates: Record<string, unknown> = {
    review_status: status,
    reviewed_by: reviewedBy,
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (newConfidence) updates.confidence = newConfidence;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb.from("fact_assertions") as any)
    .update(updates)
    .eq("id", factId);

  if (error) throw new Error(`Failed to review fact: ${error.message}`);
}

/**
 * Get accepted facts for a lead, suitable for dossier compilation.
 */
export async function getAcceptedFacts(leadId: string) {
  const sb = createServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("fact_assertions") as any)
    .select("*, dossier_artifacts(source_url, source_type, source_label)")
    .eq("lead_id", leadId)
    .eq("review_status", "accepted")
    .order("confidence", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch facts: ${error.message}`);
  return data ?? [];
}

// ─── Dossier Operations ─────────────────────────────────────────────

/**
 * Compile a dossier from accepted facts. Step 3 of the write path.
 * Creates a "proposed" dossier that requires review before CRM sync.
 */
export async function compileDossier(input: DossierCompileInput): Promise<string> {
  const sb = createServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("dossiers") as any)
    .insert({
      lead_id: input.leadId,
      property_id: input.propertyId ?? null,
      status: "proposed",
      situation_summary: input.situationSummary,
      likely_decision_maker: input.likelyDecisionMaker ?? null,
      top_facts: input.topFacts ?? null,
      recommended_call_angle: input.recommendedCallAngle ?? null,
      verification_checklist: input.verificationChecklist ?? null,
      source_links: input.sourceLinks ?? null,
      raw_ai_output: input.rawAiOutput ?? null,
      ai_run_id: input.aiRunId ?? null,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to compile dossier: ${error.message}`);
  return data.id;
}

/**
 * Review a dossier (approve or reject). Step 4 of the write path.
 * Approved dossiers become eligible for CRM sync.
 */
export async function reviewDossier(
  dossierId: string,
  status: "reviewed" | "rejected",
  reviewedBy: string,
  reviewNotes?: string,
): Promise<void> {
  const sb = createServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb.from("dossiers") as any)
    .update({
      status,
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
      review_notes: reviewNotes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", dossierId);

  if (error) throw new Error(`Failed to review dossier: ${error.message}`);
}

/**
 * Get the active reviewed dossier for a lead (most recent reviewed).
 */
export async function getActiveDossier(leadId: string) {
  const sb = createServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("dossiers") as any)
    .select("*")
    .eq("lead_id", leadId)
    .eq("status", "reviewed")
    .order("reviewed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch dossier: ${error.message}`);
  return data;
}

// ─── CRM Sync (Projection) ─────────────────────────────────────────

/**
 * Sync a reviewed dossier's key fields to the lead record.
 * Step 5-6 of the write path. Only runs on reviewed dossiers.
 *
 * Blueprint: "No model output writes directly without a review or policy gate."
 * This function enforces the gate by checking dossier.status === 'reviewed'.
 */
export async function syncDossierToLead(dossierId: string): Promise<CRMSyncProjection | null> {
  const sb = createServerClient();

  // Fetch the dossier — must be reviewed
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: dossier, error: dossierErr } = await (sb.from("dossiers") as any)
    .select("id, lead_id, status, situation_summary, recommended_call_angle, likely_decision_maker, top_facts")
    .eq("id", dossierId)
    .single();

  if (dossierErr || !dossier) return null;

  if (dossier.status !== "reviewed") {
    throw new Error(`Cannot sync dossier ${dossierId}: status is '${dossier.status}', must be 'reviewed'`);
  }

  // Extract top 3 facts for projection
  const topFacts = (dossier.top_facts as Array<{ type: string; value: string; confidence?: string }>) ?? [];

  // Compute confidence score from accepted fact count + source diversity
  const confidenceScore = await computeConfidenceScore(sb, dossier.lead_id);

  // Determine decision maker confidence from fact assertions
  const dmConfidence = dossier.likely_decision_maker
    ? await getDMConfidence(sb, dossier.lead_id)
    : null;

  const projection: CRMSyncProjection = {
    currentDossierId: dossier.id,
    sellerSituationSummaryShort: dossier.situation_summary
      ? dossier.situation_summary.slice(0, 500)
      : null,
    recommendedCallAngle: dossier.recommended_call_angle ?? null,
    likelyDecisionMaker: dossier.likely_decision_maker ?? null,
    decisionMakerConfidence: dmConfidence,
    topFact1: topFacts[0]?.value ?? null,
    topFact2: topFacts[1]?.value ?? null,
    topFact3: topFacts[2]?.value ?? null,
    recommendedNextAction: null, // Populated by agent recommendations, not dossier sync
    propertySnapshotStatus: "enriched",
    confidenceScore,
  };

  // Write full projection to lead record (Blueprint 9.1)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateErr } = await (sb.from("leads") as any)
    .update({
      current_dossier_id: projection.currentDossierId,
      seller_situation_summary_short: projection.sellerSituationSummaryShort,
      recommended_call_angle: projection.recommendedCallAngle,
      likely_decision_maker: projection.likelyDecisionMaker,
      decision_maker_confidence: projection.decisionMakerConfidence,
      top_fact_1: projection.topFact1,
      top_fact_2: projection.topFact2,
      top_fact_3: projection.topFact3,
      property_snapshot_status: projection.propertySnapshotStatus,
      confidence_score: projection.confidenceScore,
      updated_at: new Date().toISOString(),
    })
    .eq("id", dossier.lead_id);

  if (updateErr) {
    throw new Error(`Failed to sync dossier to lead: ${updateErr.message}`);
  }

  return projection;
}

// ─── Research Run Operations ────────────────────────────────────────

/**
 * Start a research run for a lead.
 * Groups related artifact + fact captures into one coherent pass.
 */
export async function startResearchRun(
  leadId: string,
  propertyId?: string,
  startedBy?: string,
): Promise<string> {
  const sb = createServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("research_runs") as any)
    .insert({
      lead_id: leadId,
      property_id: propertyId ?? null,
      status: "open",
      started_by: startedBy ?? null,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to start research run: ${error.message}`);
  return data.id;
}

/**
 * Close a research run and link it to the compiled dossier.
 */
export async function closeResearchRun(
  runId: string,
  dossierId: string,
  artifactCount: number,
  factCount: number,
): Promise<void> {
  const sb = createServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb.from("research_runs") as any)
    .update({
      status: "compiled",
      dossier_id: dossierId,
      artifact_count: artifactCount,
      fact_count: factCount,
      closed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId);

  if (error) throw new Error(`Failed to close research run: ${error.message}`);
}

// ─── Projection Helpers ──────────────────────────────────────────────

/**
 * Compute a confidence score (0-100) for a lead based on fact coverage,
 * source diversity, and contradiction count.
 */
async function computeConfidenceScore(
  sb: ReturnType<typeof createServerClient>,
  leadId: string,
): Promise<number | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: facts } = await (sb.from("fact_assertions") as any)
    .select("id, confidence, review_status")
    .eq("lead_id", leadId);

  if (!facts || facts.length === 0) return null;

  const accepted = facts.filter((f: { review_status: string }) => f.review_status === "accepted");
  const pending = facts.filter((f: { review_status: string }) => f.review_status === "pending");

  // Base: 20 points for having any facts
  let score = 20;

  // Accepted facts: up to 40 points (10 per accepted fact, capped)
  score += Math.min(accepted.length * 10, 40);

  // Pending facts contribute less: up to 15 points
  score += Math.min(pending.length * 5, 15);

  // High-confidence facts bonus: up to 15 points
  const highConf = accepted.filter((f: { confidence: string }) =>
    f.confidence === "high" || f.confidence === "verified",
  );
  score += Math.min(highConf.length * 5, 15);

  // Contradiction penalty
  const rejected = facts.filter((f: { review_status: string }) => f.review_status === "rejected");
  score -= rejected.length * 5;

  return Math.max(0, Math.min(100, score));
}

/**
 * Get the confidence level for the decision maker identification.
 * Maps from fact assertion confidence to the confidence ladder.
 */
async function getDMConfidence(
  sb: ReturnType<typeof createServerClient>,
  leadId: string,
): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (sb.from("fact_assertions") as any)
    .select("confidence")
    .eq("lead_id", leadId)
    .in("fact_type", ["ownership", "heir", "contact_info"])
    .eq("review_status", "accepted")
    .order("confidence", { ascending: false })
    .limit(1);

  if (!data || data.length === 0) return "weak";

  const confMap: Record<string, string> = {
    high: "strong",
    medium: "probable",
    low: "weak",
    unverified: "weak",
  };
  return confMap[data[0].confidence] ?? "weak";
}
