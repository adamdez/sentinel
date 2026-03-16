"use client";

import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { VoiceRegistryRow, VoiceMeta, HandoffRuleConfig, VoiceRegistryType, VoiceRegistryStatus } from "@/lib/voice-registry";

// Re-export for UI convenience
export type { VoiceRegistryRow, VoiceMeta, HandoffRuleConfig, VoiceRegistryType, VoiceRegistryStatus };

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Session expired");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UseVoiceRegistryResult {
  versions:  VoiceRegistryRow[];
  /** Lookup map: `"${workflow}@${version}"` → VoiceMeta */
  metaMap:   Record<string, VoiceMeta>;
  loading:   boolean;
  error:     string | null;
  refetch:   () => Promise<void>;
  register:  (input: RegisterVoiceInput) => Promise<VoiceRegistryRow>;
  update:    (workflow: string, version: string, registryType: VoiceRegistryType, patch: UpdateVoicePatch) => Promise<VoiceRegistryRow>;
}

export interface RegisterVoiceInput {
  workflow:       string;
  registry_type:  VoiceRegistryType;
  version:        string;
  status?:        VoiceRegistryStatus;
  description?:   string;
  changelog?:     string;
  rule_config?:   HandoffRuleConfig | null;
}

export interface UpdateVoicePatch {
  status?:       VoiceRegistryStatus;
  description?:  string;
  changelog?:    string;
  rule_config?:  HandoffRuleConfig | null;
}

// ── Main hook ─────────────────────────────────────────────────────────────────

export function useVoiceRegistry(): UseVoiceRegistryResult {
  const [versions, setVersions] = useState<VoiceRegistryRow[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const metaMap: Record<string, VoiceMeta> = {};
  for (const v of versions) {
    metaMap[`${v.workflow}@${v.version}`] = {
      workflow:      v.workflow,
      registry_type: v.registry_type,
      version:       v.version,
      status:        v.status,
      description:   v.description,
    };
  }

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const h   = await getHeaders();
      const res = await fetch("/api/settings/voice-registry", { headers: h });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? "Failed to load voice registry");
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

  const register = useCallback(async (input: RegisterVoiceInput): Promise<VoiceRegistryRow> => {
    const h   = await getHeaders();
    const res = await fetch("/api/settings/voice-registry", {
      method:  "POST",
      headers: h,
      body:    JSON.stringify(input),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      throw new Error(b.error ?? "Failed to register voice entry");
    }
    const data = await res.json();
    const row: VoiceRegistryRow = data.version;
    setVersions(prev => {
      const without = prev.filter(v =>
        !(v.workflow === row.workflow && v.version === row.version && v.registry_type === row.registry_type)
      );
      return [row, ...without].sort((a, b) =>
        a.workflow.localeCompare(b.workflow) || b.created_at.localeCompare(a.created_at)
      );
    });
    return row;
  }, []);

  const update = useCallback(async (
    workflow:     string,
    version:      string,
    registryType: VoiceRegistryType,
    patch:        UpdateVoicePatch,
  ): Promise<VoiceRegistryRow> => {
    const h   = await getHeaders();
    const res = await fetch("/api/settings/voice-registry", {
      method:  "PATCH",
      headers: h,
      body:    JSON.stringify({ workflow, version, registry_type: registryType, ...patch }),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      throw new Error(b.error ?? "Failed to update voice entry");
    }
    const data = await res.json();
    const row: VoiceRegistryRow = data.version;
    setVersions(prev => prev.map(v =>
      v.workflow === row.workflow && v.version === row.version && v.registry_type === row.registry_type
        ? row : v
    ));
    return row;
  }, []);

  return { versions, metaMap, loading, error, refetch, register, update };
}
