"use client";

import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Session expired. Please sign in again.");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  };
}

// ── Dossier types ─────────────────────────────────────────────────────────────

export interface DossierTopFact {
  fact: string;
  source: string;
}

export interface DossierVerificationItem {
  item: string;
  verified: boolean;
}

export interface DossierSourceLink {
  label: string;
  url: string;
}

export interface DossierRow {
  id: string;
  lead_id: string;
  property_id: string | null;
  status: "reviewed" | "promoted";
  situation_summary: string | null;
  likely_decision_maker: string | null;
  top_facts: DossierTopFact[] | null;
  recommended_call_angle: string | null;
  verification_checklist: DossierVerificationItem[] | null;
  source_links: DossierSourceLink[] | null;
  ai_run_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
}

// ── useDossier ────────────────────────────────────────────────────────────────
// Returns the most recent reviewed/promoted dossier for a lead.
// Returns null when none exists (meaning DossierBlock should not render).

export function useDossier(leadId: string | null) {
  const [dossier, setDossier] = useState<DossierRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!leadId) { setDossier(null); return; }
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await window.fetch(`/api/dossiers/${leadId}`, { headers });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Dossier fetch failed (${res.status})`);
      }
      const { dossier: data } = await res.json();
      setDossier(data ?? null);
    } catch (err: unknown) {
      // A missing dossier is not an error the operator needs to see
      if (err instanceof Error && err.message.includes("404")) {
        setDossier(null);
      } else {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  return { dossier, loading, error, refetch: fetch };
}

// ── Mutation helpers ──────────────────────────────────────────────────────────

export async function reviewDossier(
  leadId: string,
  dossierId: string,
  status: "reviewed" | "flagged",
  reviewNotes?: string
): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await window.fetch(`/api/dossiers/${leadId}/review`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ dossier_id: dossierId, status, review_notes: reviewNotes }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to review dossier");
  }
}

export async function promoteDossier(leadId: string, dossierId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await window.fetch(`/api/dossiers/${leadId}/promote`, {
    method: "POST",
    headers,
    body: JSON.stringify({ dossier_id: dossierId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to promote dossier");
  }
}
