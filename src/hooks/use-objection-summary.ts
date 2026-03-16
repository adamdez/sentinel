"use client";

/**
 * useObjectionSummary
 *
 * Fetches the 30-day objection tag summary from
 * GET /api/dialer/v1/objections/summary.
 *
 * Used in the /dialer/review page for the Objection Patterns section.
 * Also exposes a resolveTag action that calls PATCH /api/dialer/v1/objections/[id].
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export interface ObjectionTagSummaryItem {
  tag:      string;
  label:    string;
  total:    number;
  open:     number;
  resolved: number;
}

export interface RecentObjectionRow {
  id:         string;
  lead_id:    string;
  tag:        string;
  note:       string | null;
  status:     "open" | "resolved";
  created_at: string;
}

export interface ObjectionSummary {
  period_days:  number;
  total_tagged: number;
  by_tag:       ObjectionTagSummaryItem[];
  recent:       RecentObjectionRow[];
}

async function getHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (session?.access_token) h["Authorization"] = `Bearer ${session.access_token}`;
  return h;
}

export function useObjectionSummary(days = 30) {
  const [summary,  setSummary]  = useState<ObjectionSummary | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hdrs = await getHeaders();
      const res  = await fetch(`/api/dialer/v1/objections/summary?days=${days}`, { headers: hdrs });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as ObjectionSummary;
      setSummary(data);
    } catch (e) {
      setError((e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const resolveTag = useCallback(async (id: string) => {
    try {
      const hdrs = await getHeaders();
      const res  = await fetch(`/api/dialer/v1/objections/${id}`, {
        method:  "PATCH",
        headers: hdrs,
        body:    JSON.stringify({ status: "resolved" }),
      });
      if (!res.ok) return;
      // Optimistic update — remove from recent open list and decrement open counts
      setSummary((prev) => {
        if (!prev) return prev;
        const updatedRecent = prev.recent.map((r) =>
          r.id === id ? { ...r, status: "resolved" as const } : r,
        );
        const resolvedTag = prev.recent.find((r) => r.id === id)?.tag;
        const updatedByTag = prev.by_tag.map((t) =>
          t.tag === resolvedTag
            ? { ...t, open: Math.max(0, t.open - 1), resolved: t.resolved + 1 }
            : t,
        );
        return { ...prev, recent: updatedRecent, by_tag: updatedByTag };
      });
    } catch {
      // non-fatal — will re-sync on next load
    }
  }, []);

  return { summary, loading, error, refetch: fetch_, resolveTag };
}
