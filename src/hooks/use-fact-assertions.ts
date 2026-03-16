"use client";

import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { FactAssertionRow } from "@/app/api/dossiers/[lead_id]/facts/route";
import type { FactType, FactConfidence, FactReviewStatus } from "@/lib/dossier-facts";

// Re-export so components can import from one place
export type { FactAssertionRow, FactType, FactConfidence, FactReviewStatus };
export {
  FACT_TYPES,
  FACT_TYPE_LABELS,
  CONFIDENCE_LABELS,
  PROMOTED_FIELD_OPTIONS,
} from "@/lib/dossier-facts";

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getAuthHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (session?.access_token) h["Authorization"] = `Bearer ${session.access_token}`;
  return h;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface UseFactAssertionsResult {
  facts:        FactAssertionRow[];
  loading:      boolean;
  error:        string | null;
  refetch:      () => Promise<void>;
  addFact:      (input: AddFactInput) => Promise<FactAssertionRow | null>;
  patchFact:    (factId: string, patch: FactPatch) => Promise<FactAssertionRow | null>;
  deleteFact:   (factId: string) => Promise<boolean>;
}

export interface AddFactInput {
  artifact_id:     string;
  fact_type?:      FactType;
  fact_value:      string;
  confidence?:     FactConfidence;
  promoted_field?: string | null;
}

export interface FactPatch {
  review_status?:  FactReviewStatus;
  confidence?:     FactConfidence;
  promoted_field?: string | null;
  fact_value?:     string;
  fact_type?:      FactType;
}

export function useFactAssertions(
  leadId: string,
  options?: { artifactId?: string; reviewStatus?: FactReviewStatus }
): UseFactAssertionsResult {
  const [facts, setFacts]   = useState<FactAssertionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const buildUrl = useCallback(() => {
    const base = `/api/dossiers/${leadId}/facts`;
    const params = new URLSearchParams();
    if (options?.artifactId)   params.set("artifact_id",   options.artifactId);
    if (options?.reviewStatus) params.set("review_status", options.reviewStatus);
    return params.toString() ? `${base}?${params}` : base;
  }, [leadId, options?.artifactId, options?.reviewStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const h = await getAuthHeader();
      const res = await fetch(buildUrl(), { headers: h });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? "Failed to load facts");
      }
      const data = await res.json();
      setFacts(data.facts ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [buildUrl]);

  const addFact = useCallback(async (input: AddFactInput): Promise<FactAssertionRow | null> => {
    try {
      const h = await getAuthHeader();
      const res = await fetch(`/api/dossiers/${leadId}/facts`, {
        method: "POST",
        headers: h,
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? "Failed to add fact");
      }
      const data = await res.json();
      const newFact: FactAssertionRow = data.fact;
      setFacts(prev => [newFact, ...prev]);
      return newFact;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
      return null;
    }
  }, [leadId]);

  const patchFact = useCallback(async (factId: string, patch: FactPatch): Promise<FactAssertionRow | null> => {
    try {
      const h = await getAuthHeader();
      const res = await fetch(`/api/dossiers/${leadId}/facts/${factId}`, {
        method: "PATCH",
        headers: h,
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? "Failed to update fact");
      }
      const data = await res.json();
      const updated: FactAssertionRow = data.fact;
      setFacts(prev => prev.map(f => f.id === factId ? updated : f));
      return updated;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
      return null;
    }
  }, [leadId]);

  const deleteFact = useCallback(async (factId: string): Promise<boolean> => {
    try {
      const h = await getAuthHeader();
      const res = await fetch(`/api/dossiers/${leadId}/facts/${factId}`, {
        method: "DELETE",
        headers: h,
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? "Failed to delete fact");
      }
      setFacts(prev => prev.filter(f => f.id !== factId));
      return true;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
      return false;
    }
  }, [leadId]);

  return { facts, loading, error, refetch, addFact, patchFact, deleteFact };
}
