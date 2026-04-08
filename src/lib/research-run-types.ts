export type UnifiedResearchSourceGroup = "deep_property" | "legal" | "people_intel";

export interface NextOfKinCandidate {
  name: string;
  role: string;
  summary: string;
  source: string;
  confidence: number;
  phones: string[];
  emails: string[];
}

export interface PeopleIntelHighlight {
  summary: string;
  source: string;
  confidence: number;
  category: string;
  url?: string;
  date?: string;
}

export interface UnifiedResearchMetadata {
  version: "unified_research_v1";
  source_groups: UnifiedResearchSourceGroup[];
  ai_provider: "openai" | "fallback";
  ai_model: string;
  legal: {
    supported: boolean;
    status: "completed" | "partial" | "unsupported";
    county: string | null;
    documents_found: number;
    documents_inserted: number;
    court_cases_found: number;
    errors: string[];
    next_upcoming_event: {
      date: string | null;
      type: string | null;
      caseNumber: string | null;
      description: string | null;
    } | null;
  };
  people_intel: {
    highlights: PeopleIntelHighlight[];
    next_of_kin: NextOfKinCandidate[];
  };
  artifact_count: number;
  staged_at: string;
}

export interface UnifiedResearchStatusResponse {
  run: {
    id: string;
    status: string;
    started_at: string;
    closed_at: string | null;
    artifact_count: number;
    fact_count: number;
    source_mix: string[] | null;
  } | null;
  dossier: {
    id: string;
    status: string;
    created_at: string;
    reviewed_at?: string | null;
  } | null;
  metadata: UnifiedResearchMetadata | null;
}
