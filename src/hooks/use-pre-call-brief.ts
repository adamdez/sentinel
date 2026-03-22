"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export interface PreCallBrief {
  bullets: string[];
  suggestedOpener: string;
  currentStage: string;
  stageReason: string;
  primaryGoal: string;
  talkingPoints: string[];
  objections: { objection: string; rebuttal: string }[];
  nextQuestions: string[];
  empathyMoves: { type: string; text: string; cue: string }[];
  objectionHandling: { objection: string; label: string; calibratedQuestion: string }[];
  negotiationAnchor: string | null;
  watchOuts: string[];
  riskFlags: string[];
}

export function usePreCallBrief(leadId: string | null) {
  const [brief, setBrief] = useState<PreCallBrief | null>(null);
  const [loading, setLoading] = useState(false);
  const cacheRef = useRef<Map<string, PreCallBrief>>(new Map());
  const abortRef = useRef<AbortController | null>(null);

  const fetchBrief = useCallback(async (id: string, bust = false) => {
    if (!bust) {
      const cached = cacheRef.current.get(id);
      if (cached) {
        setBrief(cached);
        return;
      }
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setBrief(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";

      const res = await fetch("/api/dialer/v1/pre-call-brief", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ leadId: id }),
        signal: controller.signal,
      });

      if (!res.ok) {
        setBrief(null);
        return;
      }

      const data = await res.json();
      const result: PreCallBrief = {
        bullets: data.bullets ?? [],
        suggestedOpener: data.suggestedOpener ?? "",
        currentStage: data.currentStage ?? "situation",
        stageReason: data.stageReason ?? "",
        primaryGoal: data.primaryGoal ?? "",
        talkingPoints: data.talkingPoints ?? [],
        objections: data.objections ?? [],
        nextQuestions: data.nextQuestions ?? [],
        empathyMoves: data.empathyMoves ?? [],
        objectionHandling: data.objectionHandling ?? [],
        negotiationAnchor: data.negotiationAnchor ?? null,
        watchOuts: data.watchOuts ?? [],
        riskFlags: data.riskFlags ?? [],
      };

      cacheRef.current.set(id, result);
      if (!controller.signal.aborted) {
        setBrief(result);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("[Pre-Call Brief]", err);
      setBrief(null);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  const regenerate = useCallback(() => {
    if (!leadId) return;
    cacheRef.current.delete(leadId);
    fetchBrief(leadId, true);
  }, [leadId, fetchBrief]);

  useEffect(() => {
    if (!leadId) {
      setBrief(null);
      return;
    }

    const timer = setTimeout(() => {
      fetchBrief(leadId);
    }, 300);

    return () => clearTimeout(timer);
  }, [leadId, fetchBrief]);

  return { brief, loading, regenerate };
}
