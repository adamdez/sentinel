"use client";

import { useState, useEffect, useCallback } from "react";
import { Brain, RefreshCw, ArrowRight, AlertTriangle, AlertCircle, Info } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

interface Insight {
  title: string;
  body: string;
  action: string | null;
  severity: "info" | "warning" | "critical";
}

const SEVERITY_CONFIG = {
  critical: {
    icon: AlertCircle,
    border: "border-red-500/30",
    bg: "bg-red-500/5",
    dot: "bg-red-500",
    text: "text-red-400",
  },
  warning: {
    icon: AlertTriangle,
    border: "border-amber-500/30",
    bg: "bg-amber-500/5",
    dot: "bg-amber-500",
    text: "text-amber-400",
  },
  info: {
    icon: Info,
    border: "border-cyan-500/30",
    bg: "bg-cyan-500/5",
    dot: "bg-cyan-400",
    text: "text-cyan-400",
  },
};

export function GrokInsights() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInsights = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";

      const res = await fetch("/api/grok/insights", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Request failed" }));
        setError(body.error ?? "Failed to load insights");
        return;
      }

      const data = await res.json();
      setInsights(data.insights ?? []);
    } catch {
      setError("Could not reach Grok");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInsights();
    const interval = setInterval(fetchInsights, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchInsights]);

  return (
    <div className="flex flex-col gap-2 h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Brain className="h-3.5 w-3.5 text-purple-400" />
          <span className="text-[11px] font-semibold tracking-wider uppercase text-purple-400">
            Grok Insights
          </span>
        </div>
        <button
          onClick={fetchInsights}
          disabled={loading}
          className="p-1 rounded hover:bg-white/5 transition-colors disabled:opacity-40"
        >
          <RefreshCw className={cn("h-3 w-3 text-muted-foreground", loading && "animate-spin")} />
        </button>
      </div>

      {loading && insights.length === 0 && (
        <div className="flex-1 flex flex-col gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5 animate-pulse">
              <div className="h-3 w-24 bg-white/10 rounded mb-1.5" />
              <div className="h-2.5 w-full bg-white/5 rounded" />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-muted-foreground">{error}</p>
        </div>
      )}

      {!loading && !error && insights.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-muted-foreground">No insights available</p>
        </div>
      )}

      <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[280px] scrollbar-thin">
        {insights.map((insight, i) => {
          const sev = SEVERITY_CONFIG[insight.severity] ?? SEVERITY_CONFIG.info;
          const SevIcon = sev.icon;
          return (
            <div
              key={i}
              className={cn(
                "rounded-lg border p-2.5 transition-all hover:brightness-110",
                sev.border,
                sev.bg,
              )}
            >
              <div className="flex items-start gap-2">
                <SevIcon className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", sev.text)} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground/90 leading-tight">
                    {insight.title}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                    {insight.body}
                  </p>
                  {insight.action && (
                    <a
                      href={insight.action}
                      className={cn(
                        "inline-flex items-center gap-1 text-[10px] font-medium mt-1.5",
                        sev.text, "hover:underline",
                      )}
                    >
                      Take Action <ArrowRight className="h-2.5 w-2.5" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
