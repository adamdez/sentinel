/**
 * Research Agent — Types
 *
 * Input/output types for the Research Agent. Matches the intelligence
 * pipeline types in src/lib/intelligence.ts.
 */

export interface ResearchAgentInput {
  /** Lead UUID to research */
  leadId: string;
  /** Optional property UUID (used for property-specific lookups) */
  propertyId?: string;
  /** Who triggered this research (user ID or "cron") */
  triggeredBy: string;
  /** Optional focus areas (e.g., ["probate", "ownership", "financial"]) */
  focusAreas?: string[];
  /** Optional additional context from the operator */
  operatorNotes?: string;
}

export interface ResearchArtifact {
  sourceUrl: string | null;
  sourceType: "probate_filing" | "assessor" | "court_record" | "obituary" | "news" | "other";
  sourceLabel: string;
  extractedNotes: string;
  rawExcerpt?: string;
}

export interface ResearchFact {
  factType: "ownership" | "deceased" | "heir" | "probate_status" | "financial" | "property_condition" | "timeline" | "contact_info" | "other";
  factValue: string;
  confidence: "unverified" | "low" | "medium" | "high";
  /** Which artifact index (0-based) this fact was extracted from */
  artifactIndex: number;
  /** Optional: which dossier field this fact should inform */
  promotedField?: string;
}

export interface ResearchDossierDraft {
  situationSummary: string;
  likelyDecisionMaker: string | null;
  recommendedCallAngle: string;
  topFacts: Array<{ type: string; value: string; confidence: string }>;
  verificationChecklist: Array<{ item: string; verified: boolean }>;
  sourceLinks: Array<{ url: string; label: string }>;
  contradictions?: Array<{ description: string; evidenceA: string; evidenceB: string }>;
}

export interface ResearchAgentOutput {
  artifacts: ResearchArtifact[];
  facts: ResearchFact[];
  dossier: ResearchDossierDraft;
}

export interface ResearchAgentResult {
  runId: string;
  dossierId: string | null;
  artifactCount: number;
  factCount: number;
  status: "queued_for_review" | "auto_promoted" | "failed";
  error?: string;
}
