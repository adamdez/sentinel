"use client";

import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { ResearchRunRow, ResearchRunStatus } from "@/app/api/dossiers/[lead_id]/runs/route";

// Re-export for UI convenience
export type { ResearchRunRow, ResearchRunStatus };

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Session expired. Please sign in again.");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface UseResearchRunsResult {
  runs:        ResearchRunRow[];
  activeRun:   ResearchRunRow | null;  // most recent open run, if any
  loading:     boolean;
  error:       string | null;
  refetch:     () => Promise<void>;
  startRun:    (options?: { notes?: string; property_id?: string }) => Promise<ResearchRunRow>;
  closeRun:    (runId: string, status?: "closed" | "abandoned") => Promise<ResearchRunRow>;
  incrementArtifact: (runId: string, sourceType: string) => Promise<void>;
  incrementFact:     (runId: string) => Promise<void>;
  markCompiled:      (runId: string, dossierId: string) => Promise<void>;
}

export function useResearchRuns(leadId: string | null): UseResearchRunsResult {
  const [runs, setRuns]       = useState<ResearchRunRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const activeRun = runs.find(r => r.status === "open") ?? null;

  const refetch = useCallback(async () => {
    if (!leadId) { setRuns([]); return; }
    setLoading(true);
    setError(null);
    try {
      const h   = await getHeaders();
      const res = await fetch(`/api/dossiers/${leadId}/runs?limit=20`, { headers: h });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? "Failed to load runs");
      }
      const data = await res.json();
      setRuns(data.runs ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  const startRun = useCallback(async (
    options?: { notes?: string; property_id?: string }
  ): Promise<ResearchRunRow> => {
    if (!leadId) throw new Error("No leadId");
    const h   = await getHeaders();
    const res = await fetch(`/api/dossiers/${leadId}/runs`, {
      method:  "POST",
      headers: h,
      body:    JSON.stringify(options ?? {}),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      throw new Error(b.error ?? "Failed to start run");
    }
    const data = await res.json();
    const run: ResearchRunRow = data.run;
    setRuns(prev => {
      const withoutThis = prev.filter(r => r.id !== run.id);
      return [run, ...withoutThis];
    });
    return run;
  }, [leadId]);

  const patchRun = useCallback(async (
    runId: string,
    patch: Record<string, unknown>
  ): Promise<ResearchRunRow> => {
    if (!leadId) throw new Error("No leadId");
    const h   = await getHeaders();
    const res = await fetch(`/api/dossiers/${leadId}/runs/${runId}`, {
      method:  "PATCH",
      headers: h,
      body:    JSON.stringify(patch),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      throw new Error(b.error ?? "Failed to update run");
    }
    const data = await res.json();
    const updated: ResearchRunRow = data.run;
    setRuns(prev => prev.map(r => r.id === runId ? updated : r));
    return updated;
  }, [leadId]);

  const closeRun = useCallback(async (
    runId: string,
    status: "closed" | "abandoned" = "closed"
  ): Promise<ResearchRunRow> => {
    return patchRun(runId, { status });
  }, [patchRun]);

  const incrementArtifact = useCallback(async (
    runId: string,
    sourceType: string
  ): Promise<void> => {
    await patchRun(runId, { increment_artifacts: true, source_type: sourceType });
  }, [patchRun]);

  const incrementFact = useCallback(async (runId: string): Promise<void> => {
    await patchRun(runId, { increment_facts: true });
  }, [patchRun]);

  const markCompiled = useCallback(async (
    runId: string,
    dossierId: string
  ): Promise<void> => {
    await patchRun(runId, { status: "compiled", dossier_id: dossierId });
  }, [patchRun]);

  return {
    runs,
    activeRun,
    loading,
    error,
    refetch,
    startRun,
    closeRun,
    incrementArtifact,
    incrementFact,
    markCompiled,
  };
}
