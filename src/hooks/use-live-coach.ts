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

  const fetchCoach = useCallback(async () => {
    if (!sessionId || !enabled) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

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
          setCoach(null);
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
      setCoach(null);
      setError("Coaching unavailable — network error");
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [enabled, mode, sessionId, sessionInstructions]);

  useEffect(() => {
    if (!sessionId || !enabled) {
      setCoach(null);
      setLoading(false);
      setError(null);
      abortRef.current?.abort();
      return;
    }

    void fetchCoach();
    const timer = window.setInterval(() => {
      void fetchCoach();
    }, intervalMs);

    return () => {
      abortRef.current?.abort();
      window.clearInterval(timer);
    };
  }, [enabled, fetchCoach, intervalMs, sessionId]);

  return {
    coach,
    loading,
    error,
    refresh: fetchCoach,
  };
}
