"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, CheckCircle2, AlertTriangle, XCircle, MinusCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface ServiceCheck {
  name: string;
  status: "ok" | "degraded" | "down" | "unconfigured";
  latencyMs: number | null;
  error?: string;
  detail?: string;
}

interface HealthResponse {
  services: ServiceCheck[];
  summary: {
    ok: number;
    degraded: number;
    down: number;
    unconfigured: number;
    total: number;
    timestamp: string;
  };
}

const statusIcon = (status: ServiceCheck["status"]) => {
  switch (status) {
    case "ok": return <CheckCircle2 className="h-4 w-4 text-green-400" />;
    case "degraded": return <AlertTriangle className="h-4 w-4 text-amber-400" />;
    case "down": return <XCircle className="h-4 w-4 text-red-400" />;
    case "unconfigured": return <MinusCircle className="h-4 w-4 text-muted-foreground/40" />;
  }
};

const statusColor = (status: ServiceCheck["status"]) => {
  switch (status) {
    case "ok": return "border-green-500/20 bg-green-500/5";
    case "degraded": return "border-amber-500/20 bg-amber-500/5";
    case "down": return "border-red-500/20 bg-red-500/5";
    case "unconfigured": return "border-border/10 bg-muted/5";
  }
};

const statusLabel = (status: ServiceCheck["status"]) => {
  switch (status) {
    case "ok": return "Healthy";
    case "degraded": return "Degraded";
    case "down": return "Down";
    case "unconfigured": return "Not Configured";
  }
};

export default function HealthDashboard() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runCheck = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/health", {
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {},
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Health check failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { runCheck(); }, [runCheck]);

  const overallStatus = !data
    ? "loading"
    : data.summary.down > 0
      ? "down"
      : data.summary.degraded > 0
        ? "degraded"
        : "ok";

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">System Health</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Live status of all external services Sentinel depends on
          </p>
        </div>
        <button
          onClick={runCheck}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-border/20 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Checking..." : "Re-check All"}
        </button>
      </div>

      {/* Overall status banner */}
      {data && (
        <div className={`rounded-xl border p-4 flex items-center justify-between ${
          overallStatus === "ok" ? "border-green-500/20 bg-green-500/5" :
          overallStatus === "degraded" ? "border-amber-500/20 bg-amber-500/5" :
          "border-red-500/20 bg-red-500/5"
        }`}>
          <div className="flex items-center gap-3">
            {overallStatus === "ok" ? <CheckCircle2 className="h-6 w-6 text-green-400" /> :
             overallStatus === "degraded" ? <AlertTriangle className="h-6 w-6 text-amber-400" /> :
             <XCircle className="h-6 w-6 text-red-400" />}
            <div>
              <p className="font-bold text-foreground">
                {overallStatus === "ok" ? "All Systems Operational" :
                 overallStatus === "degraded" ? "Some Services Degraded" :
                 "Service Outage Detected"}
              </p>
              <p className="text-xs text-muted-foreground">
                {data.summary.ok} healthy, {data.summary.degraded} degraded, {data.summary.down} down, {data.summary.unconfigured} unconfigured
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {new Date(data.summary.timestamp).toLocaleTimeString()}
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Service grid */}
      {data && (
        <div className="space-y-2">
          {data.services.map((svc) => (
            <div
              key={svc.name}
              className={`rounded-lg border p-3 flex items-center justify-between ${statusColor(svc.status)}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                {statusIcon(svc.status)}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{svc.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {svc.error ?? svc.detail ?? statusLabel(svc.status)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {svc.latencyMs != null && (
                  <span className={`text-xs font-mono ${
                    svc.latencyMs < 500 ? "text-muted-foreground/60" :
                    svc.latencyMs < 2000 ? "text-amber-400/80" :
                    "text-red-400/80"
                  }`}>
                    {svc.latencyMs}ms
                  </span>
                )}
                <span className={`text-xs font-bold uppercase px-1.5 py-0.5 rounded ${
                  svc.status === "ok" ? "text-green-400" :
                  svc.status === "degraded" ? "text-amber-400" :
                  svc.status === "down" ? "text-red-400" :
                  "text-muted-foreground/40"
                }`}>
                  {statusLabel(svc.status)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {loading && !data && (
        <div className="text-center py-12">
          <RefreshCw className="h-8 w-8 text-muted-foreground animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Pinging all services...</p>
        </div>
      )}
    </div>
  );
}
