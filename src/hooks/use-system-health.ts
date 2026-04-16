"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";

export interface HealthSummary {
  status: "nominal" | "degraded" | "critical";
  errorCount: number;
  failedTransitionCount: number;
  apiFailureCount: number;
  crawlerIssueCount: number;
  message: string;
}

export function useSystemHealth() {
  const [health, setHealth] = useState<HealthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  const requestVersionRef = useRef(0);

  const fetchHealth = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    const requestVersion = ++requestVersionRef.current;
    if (!silent) setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";

      const res = await fetch("/api/grok/troubleshoot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ depth: 50 }),
      });

      if (!res.ok) {
        if (!mountedRef.current || requestVersion !== requestVersionRef.current) return;
        setHealth(null);
        return;
      }

      const data = await res.json();
      if (!mountedRef.current || requestVersion !== requestVersionRef.current) return;
      setHealth(data.healthSummary ?? null);
    } catch {
      if (!mountedRef.current || requestVersion !== requestVersionRef.current) return;
      setHealth(null);
    } finally {
      if (!silent && mountedRef.current && requestVersion === requestVersionRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void fetchHealth();
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      void fetchHealth({ silent: true });
    }, 5 * 60 * 1000);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchHealth]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void fetchHealth({ silent: true });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchHealth]);

  return { health, loading, refetch: fetchHealth };
}
