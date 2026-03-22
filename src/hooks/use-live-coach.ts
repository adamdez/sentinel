"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export type LiveCoachMode = "inbound" | "outbound";
export type NepqStage =
  | "connection"
  | "situation"
  | "problem_awareness"
  | "solution_awareness"
  | "consequence"
  | "commitment";

export type EmpathyMoveType =
  | "mirror"
  | "label"
  | "calibrated_question";

export interface EmpathyMove {
  type: EmpathyMoveType;
  text: string;
  cue: string;
}

export interface ObjectionCoachMove {
  objection: string;
  label: string;
  calibratedQuestion: string;
}

export interface LiveCoachState {
  currentStage: NepqStage;
  stageReason: string;
  primaryGoal: string;
  nextBestQuestion: string;
  nextQuestions: string[];
  empathyMoves: EmpathyMove[];
  objectionHandling: ObjectionCoachMove[];
  coachNotes: string[];
  guardrails: string[];
  buyingSignals: string[];
  riskFlags: string[];
  transcriptExcerpt: string;
  updatedAt: string;
  mode: LiveCoachMode;
  source: "gpt5" | "fallback";
}

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
  intervalMs = 6000,
}: UseLiveCoachOptions) {
  const [coach, setCoach] = useState<LiveCoachState | null>(null);
  const [loading, setLoading] = useState(false);
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
        if (!controller.signal.aborted) setCoach(null);
        return;
      }

      const data = await res.json() as LiveCoachState;
      if (!controller.signal.aborted) {
        setCoach(data);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("[Live Coach]", err);
      setCoach(null);
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
    refresh: fetchCoach,
  };
}
