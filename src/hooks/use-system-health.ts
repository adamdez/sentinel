"use client";

import { useState, useEffect, useCallback } from "react";
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

  const fetchHealth = useCallback(async () => {
    setLoading(true);
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
        setHealth(null);
        return;
      }

      const data = await res.json();
      setHealth(data.healthSummary ?? null);
    } catch {
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  return { health, loading, refetch: fetchHealth };
}
