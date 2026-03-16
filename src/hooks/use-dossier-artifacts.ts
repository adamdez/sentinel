"use client";

import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ArtifactSourceType =
  | "probate_filing"
  | "obituary"
  | "assessor"
  | "court_record"
  | "news"
  // Absentee-landlord source types
  | "rental_listing"
  | "mailing_address_mismatch"
  | "property_management_record"
  | "tax_delinquency"
  | "other";

// ── Client-side static policy map ─────────────────────────────────────────────
// Mirrors the DB seed defaults. Used for badge rendering without a server call.
// The authoritative values live in source_policies table — this is display only.

export type ClientSourcePolicy = "approved" | "review_required" | "blocked";

export const CLIENT_SOURCE_POLICIES: Record<ArtifactSourceType, ClientSourcePolicy> = {
  // Probate / inherited
  probate_filing:              "approved",
  assessor:                    "approved",
  court_record:                "approved",
  obituary:                    "review_required",
  news:                        "review_required",
  // Absentee-landlord
  mailing_address_mismatch:    "approved",
  tax_delinquency:             "approved",
  rental_listing:              "review_required",
  property_management_record:  "review_required",
  other:                       "review_required",
};

export const POLICY_BADGE: Record<ClientSourcePolicy, { label: string; className: string }> = {
  approved:        { label: "Approved",       className: "text-emerald-400/70 border-emerald-500/20" },
  review_required: { label: "Review required", className: "text-amber-400/70 border-amber-500/25" },
  blocked:         { label: "Blocked",         className: "text-red-400/70 border-red-500/20" },
};

export const SOURCE_TYPE_LABELS: Record<ArtifactSourceType, string> = {
  // Probate / inherited
  probate_filing:             "Probate filing",
  obituary:                   "Obituary",
  assessor:                   "Assessor / tax record",
  court_record:               "Court record",
  news:                       "News / media",
  // Absentee-landlord
  rental_listing:             "Rental listing",
  mailing_address_mismatch:   "Mailing address mismatch",
  property_management_record: "Property management record",
  tax_delinquency:            "Tax delinquency record",
  other:                      "Other",
};

export interface ArtifactRow {
  id: string;
  lead_id: string;
  dossier_id: string | null;
  source_url: string | null;
  source_type: ArtifactSourceType;
  source_label: string | null;
  captured_at: string;
  extracted_notes: string | null;
  screenshot_url: string | null;
  captured_by: string | null;
  created_at: string;
}

// ── Auth header helper ────────────────────────────────────────────────────────

async function getHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Session expired. Please sign in again.");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  };
}

// ── useDossierArtifacts ───────────────────────────────────────────────────────

export function useDossierArtifacts(leadId: string | null) {
  const [artifacts, setArtifacts] = useState<ArtifactRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchArtifacts = useCallback(async () => {
    if (!leadId) { setArtifacts([]); return; }
    setLoading(true);
    setError(null);
    try {
      const headers = await getHeaders();
      const res = await window.fetch(`/api/dossiers/${leadId}/artifacts`, { headers });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || `Failed to load artifacts (${res.status})`);
      }
      const { artifacts: data } = await res.json();
      setArtifacts(data ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  const addArtifact = useCallback(async (payload: {
    source_url?: string;
    source_type?: ArtifactSourceType;
    source_label?: string;
    extracted_notes?: string;
    raw_excerpt?: string;
    screenshot_url?: string;
    property_id?: string;
    run_id?: string | null;
  }): Promise<{ artifact: ArtifactRow; policy_warning: { policy: string; label: string; description: string } | null }> => {
    if (!leadId) throw new Error("No leadId");
    const headers = await getHeaders();
    const res = await window.fetch(`/api/dossiers/${leadId}/artifacts`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      throw new Error(b.error || "Failed to add artifact");
    }
    const body = await res.json();
    setArtifacts(prev => [body.artifact, ...prev]);
    // Return both the artifact and any policy warning for the UI to display
    return { artifact: body.artifact, policy_warning: body.policy_warning ?? null };
  }, [leadId]);

  const deleteArtifact = useCallback(async (artifactId: string): Promise<void> => {
    if (!leadId) throw new Error("No leadId");
    const headers = await getHeaders();
    const res = await window.fetch(`/api/dossiers/${leadId}/artifacts`, {
      method: "DELETE",
      headers,
      body: JSON.stringify({ artifact_id: artifactId }),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      throw new Error(b.error || "Failed to delete artifact");
    }
    setArtifacts(prev => prev.filter(a => a.id !== artifactId));
  }, [leadId]);

  const compileDossier = useCallback(async (options?: {
    artifact_ids?: string[];
    situation_summary?: string;
    property_id?: string;
    run_id?: string | null;
    /** Pass "absentee_landlord" to tag dossier type in raw_ai_output */
    dossier_type?: string;
  }): Promise<{
    dossier_id:       string;
    compiled_from:    number;
    excluded_blocked: number;
    policy_flags:     Array<{ artifact_id: string; source_type: string; policy: string; rationale: string | null }>;
  }> => {
    if (!leadId) throw new Error("No leadId");
    const headers = await getHeaders();
    const res = await window.fetch(`/api/dossiers/${leadId}/compile`, {
      method: "POST",
      headers,
      body: JSON.stringify(options ?? {}),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      throw new Error(b.error || "Failed to compile dossier");
    }
    const data = await res.json();
    return {
      dossier_id:       data.dossier.id,
      compiled_from:    data.compiled_from,
      excluded_blocked: data.excluded_blocked ?? 0,
      policy_flags:     data.policy_flags ?? [],
    };
  }, [leadId]);

  return {
    artifacts,
    loading,
    error,
    refetch: fetchArtifacts,
    addArtifact,
    deleteArtifact,
    compileDossier,
  };
}
