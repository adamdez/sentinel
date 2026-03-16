"use client";

/**
 * useDialerWeekly
 *
 * Fetches /api/dialer/v1/weekly and returns the typed result.
 * Uses the Supabase session token for dialer-path auth.
 * Re-fetches when `weeks` changes.
 */

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

// ── Types (mirror the route's exported shape) ─────────────────

export interface WeekBucket {
  week:                     string;   // YYYY-Www
  week_start:               string;   // ISO Monday 00:00 UTC
  calls_published:          number;
  follow_up_calls:          number;
  tasks_created:            number;
  callbacks_defaulted:      number;
  ai_reviewed:              number;
  ai_flagged:               number;
  task_creation_pct:        number | null;
  callback_slippage_pct:    number | null;
  ai_flag_rate_pct:         number | null;
}

export interface WeeklyData {
  generated_at:        string;
  weeks_returned:      number;
  overdue_tasks_now:   number;
  weeks:               WeekBucket[];  // newest first
}

// ── Hook ──────────────────────────────────────────────────────

export function useDialerWeekly(weeks = 4) {
  const [data,    setData]    = useState<WeeklyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetch_() {
      setLoading(true);
      setError(null);

      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token ?? "";

        const res = await fetch(`/api/dialer/v1/weekly?weeks=${weeks}`, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        });

        if (!res.ok) {
          if (!cancelled) setError("Failed to load dialer weekly data");
          return;
        }

        const payload: WeeklyData = await res.json();
        if (!cancelled) setData(payload);
      } catch {
        if (!cancelled) setError("Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetch_();
    return () => { cancelled = true; };
  }, [weeks]);

  return { data, loading, error };
}
