"use client";

import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { PromptMeta, PromptRegistryRow } from "@/lib/prompt-registry";

// Re-export for UI convenience
export type { PromptMeta, PromptRegistryRow };

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Session expired");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  };
}

// ── Main hook ─────────────────────────────────────────────────────────────────

export interface UsePromptRegistryResult {
  versions:  PromptRegistryRow[];
  /** Lookup map: `"${workflow}@${version}"` → PromptMeta */
  metaMap:   Record<string, PromptMeta>;
  loading:   boolean;
  error:     string | null;
  refetch:   () => Promise<void>;
  register:  (input: RegisterInput) => Promise<PromptRegistryRow>;
  update:    (workflow: string, version: string, patch: UpdatePatch) => Promise<PromptRegistryRow>;
}

export interface RegisterInput {
  workflow:     string;
  version:      string;
  status?:      "testing" | "active" | "deprecated";
  description?: string;
  changelog?:   string;
}

export interface UpdatePatch {
  status?:      "testing" | "active" | "deprecated";
  description?: string;
  changelog?:   string;
}

export function usePromptRegistry(): UsePromptRegistryResult {
  const [versions, setVersions] = useState<PromptRegistryRow[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const metaMap: Record<string, PromptMeta> = {};
  for (const v of versions) {
    metaMap[`${v.workflow}@${v.version}`] = {
      workflow:    v.workflow,
      version:     v.version,
      status:      v.status,
      description: v.description,
      changelog:   v.changelog,
    };
  }

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const h   = await getHeaders();
      const res = await fetch("/api/settings/prompt-registry", { headers: h });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? "Failed to load prompt registry");
      }
      const data = await res.json();
      setVersions(data.versions ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  const register = useCallback(async (input: RegisterInput): Promise<PromptRegistryRow> => {
    const h   = await getHeaders();
    const res = await fetch("/api/settings/prompt-registry", {
      method:  "POST",
      headers: h,
      body:    JSON.stringify(input),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      throw new Error(b.error ?? "Failed to register version");
    }
    const data = await res.json();
    const row: PromptRegistryRow = data.version;
    setVersions(prev => {
      const without = prev.filter(v => !(v.workflow === row.workflow && v.version === row.version));
      return [row, ...without].sort((a, b) =>
        a.workflow.localeCompare(b.workflow) || b.created_at.localeCompare(a.created_at)
      );
    });
    return row;
  }, []);

  const update = useCallback(async (
    workflow: string,
    version:  string,
    patch:    UpdatePatch
  ): Promise<PromptRegistryRow> => {
    const h   = await getHeaders();
    const res = await fetch("/api/settings/prompt-registry", {
      method:  "PATCH",
      headers: h,
      body:    JSON.stringify({ workflow, version, ...patch }),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      throw new Error(b.error ?? "Failed to update version");
    }
    const data = await res.json();
    const row: PromptRegistryRow = data.version;
    setVersions(prev => prev.map(v =>
      v.workflow === row.workflow && v.version === row.version ? row : v
    ));
    return row;
  }, []);

  return { versions, metaMap, loading, error, refetch, register, update };
}
