"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export interface CallNote {
  id: string;
  disposition: string;
  duration_sec: number;
  notes: string | null;
  ai_summary: string | null;
  summary_timestamp: string | null;
  started_at: string;
  ended_at: string | null;
}

export function useCallNotes(leadId: string | null | undefined, limit = 5) {
  const [notes, setNotes] = useState<CallNote[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch_ = useCallback(async () => {
    if (!leadId) { setNotes([]); return; }
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from("calls_log") as any)
      .select("id, disposition, duration_sec, notes, ai_summary, summary_timestamp, started_at, ended_at")
      .eq("lead_id", leadId)
      .order("started_at", { ascending: false })
      .limit(limit);
    setNotes((data ?? []) as CallNote[]);
    setLoading(false);
  }, [leadId, limit]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const latestSummary = notes.find((n) => n.ai_summary)?.ai_summary ?? null;
  const latestSummaryTime = notes.find((n) => n.ai_summary)?.summary_timestamp ?? null;

  return { notes, loading, latestSummary, latestSummaryTime, refetch: fetch_ };
}
