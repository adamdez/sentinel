"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  LiveCoachMode as SharedLiveCoachMode,
  LiveCoachResponseV2,
} from "@/lib/dialer/live-coach-types";
import { supabase } from "@/lib/supabase";

export type LiveCoachMode = SharedLiveCoachMode;
export type LiveCoachState = LiveCoachResponseV2;

interface UseLiveCoachOptions {
  sessionId: string | null;
  enabled: boolean;
  mode?: LiveCoachMode;
  sessionInstructions?: string | null;
  intervalMs?: number;
}

export function useLiveCoach({
  sessionId,
  enabled,
  mode = "outbound",
  sessionInstructions,
  intervalMs = 1200,
}: UseLiveCoachOptions) {
  const [coach, setCoach] = useState<LiveCoachState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const pollTimerRef = useRef<number | null>(null);

  const clearScheduledPoll = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const fetchCoach = useCallback(async () => {
    if (!sessionId || !enabled || inFlightRef.current) return;

    clearScheduledPoll();
    const controller = new AbortController();
    abortRef.current = controller;
    inFlightRef.current = true;

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch(`/api/dialer/v1/sessions/${sessionId}/live-assist`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mode,
          sessionInstructions: sessionInstructions ?? undefined,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        if (!controller.signal.aborted) {
          setError(`Coaching unavailable (${res.status})`);
        }
        return;
      }

      const data = await res.json() as LiveCoachState;
      if (!controller.signal.aborted) {
        setCoach(data);
        setError(null);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("[Live Coach]", err);
      if (!controller.signal.aborted) {
        setError("Coaching unavailable - network error");
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      inFlightRef.current = false;
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [clearScheduledPoll, enabled, mode, sessionId, sessionInstructions]);

  useEffect(() => {
    if (!sessionId || !enabled) {
      clearScheduledPoll();
      setCoach(null);
      setLoading(false);
      setError(null);
      inFlightRef.current = false;
      abortRef.current?.abort();
      return;
    }

    let cancelled = false;

    const runPoll = async () => {
      await fetchCoach();
      if (cancelled) return;
      pollTimerRef.current = window.setTimeout(() => {
        void runPoll();
      }, intervalMs);
    };

    void runPoll();

    return () => {
      cancelled = true;
      clearScheduledPoll();
      inFlightRef.current = false;
      abortRef.current?.abort();
    };
  }, [clearScheduledPoll, enabled, fetchCoach, intervalMs, sessionId]);

  return {
    coach,
    loading,
    error,
    refresh: fetchCoach,
  };
}
