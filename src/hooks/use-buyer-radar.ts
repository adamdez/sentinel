"use client";

import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { ScorerResult } from "@/lib/buyer-fit";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Session expired. Please sign in again.");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  };
}

export interface ExistingDealBuyer {
  id: string;
  buyer_id: string;
  status: string;
  date_contacted: string | null;
  offer_amount: number | null;
  notes: string | null;
}

export type RadarResultWithExisting = ScorerResult & { existingDealBuyer: ExistingDealBuyer | null };

export interface BuyerRadarData {
  leadId: string;
  dealId: string | null;
  activeBuyerCount: number;
  monetizabilityVisible: boolean;
  monetizabilityScore: number | null;
  manualMonetizabilityScore: number | null;
  dispoFrictionLevel: string | null;
  results: RadarResultWithExisting[];
}

export function useBuyerRadar(leadId: string | null) {
  const [data, setData] = useState<BuyerRadarData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!leadId) { setData(null); return; }
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await window.fetch(`/api/buyers/radar?lead_id=${leadId}`, { headers });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Radar fetch failed (${res.status})`);
      }
      const json = await res.json();
      setData(json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  return { data, loading, error, refetch };
}

export async function queueBuyerForOutreach(dealId: string, buyerId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await window.fetch("/api/deal-buyers", {
    method: "POST",
    headers,
    body: JSON.stringify({ deal_id: dealId, buyer_id: buyerId, status: "queued" }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to queue buyer");
  }
}

export async function dismissBuyerForDeal(dealId: string, buyerId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await window.fetch("/api/deal-buyers", {
    method: "POST",
    headers,
    body: JSON.stringify({ deal_id: dealId, buyer_id: buyerId, status: "passed" }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to dismiss buyer");
  }
}

export async function updateExistingDealBuyerStatus(dealBuyerId: string, status: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await window.fetch(`/api/deal-buyers/${dealBuyerId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to update deal-buyer status");
  }
}
