"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";

type ReconcileResponse = {
  ok: boolean;
  filters: { runId: string | null; sourceSystem: string | null; limit: number };
  summary: {
    total_candidates: number;
    leads_created: number;
    client_files_enriched: number;
    skipped: number;
    failed: number;
    persisted_updates: number;
  };
  top_failure_reasons: Array<{ reason: string; count: number }>;
  items: Array<{
    id: string;
    created_at: string;
    source_system: string | null;
    source_run_id: string | null;
    source_record_id: string | null;
    ingest_mode: string | null;
    ingest_status: string;
    failure_reason: string | null;
    persisted_updates: number;
  }>;
};

export default function ScoutReconcilePage() {
  const [runId, setRunId] = useState("");
  const [sourceSystem, setSourceSystem] = useState("");
  const [data, setData] = useState<ReconcileResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const qs = new URLSearchParams();
      if (runId.trim()) qs.set("runId", runId.trim());
      if (sourceSystem.trim()) qs.set("sourceSystem", sourceSystem.trim());
      qs.set("limit", "1000");

      const res = await fetch(`/api/admin/scout/reconcile?${qs.toString()}`, {
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {},
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setData(json as ReconcileResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reconciliation report");
    } finally {
      setLoading(false);
    }
  }, [runId, sourceSystem]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Scout Reconciliation</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Run-level create vs enrich visibility for Spokane Scout ingest
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border/20 bg-overlay-5 hover:bg-overlay-10 text-sm font-medium disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <input
          value={runId}
          onChange={(e) => setRunId(e.target.value)}
          placeholder="Filter by source_run_id"
          className="w-full rounded-lg border border-border/20 bg-overlay-4 px-3 py-2 text-sm"
        />
        <input
          value={sourceSystem}
          onChange={(e) => setSourceSystem(e.target.value)}
          placeholder="Filter by source_system"
          className="w-full rounded-lg border border-border/20 bg-overlay-4 px-3 py-2 text-sm"
        />
        <button
          onClick={load}
          disabled={loading}
          className="rounded-lg border border-primary/20 bg-primary/10 text-primary text-sm font-medium px-3 py-2 hover:bg-primary/20 disabled:opacity-50"
        >
          Apply Filters
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>
      )}

      {loading && !data ? (
        <div className="py-12 text-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
          Loading reconciliation report...
        </div>
      ) : null}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <Metric label="Candidates" value={data.summary.total_candidates} />
            <Metric label="Created" value={data.summary.leads_created} />
            <Metric label="Enriched" value={data.summary.client_files_enriched} />
            <Metric label="Skipped" value={data.summary.skipped} />
            <Metric label="Failed" value={data.summary.failed} />
            <Metric label="Persisted" value={data.summary.persisted_updates} />
          </div>

          <div className="rounded-xl border border-border/15 bg-overlay-3 p-4 space-y-2">
            <h2 className="text-sm font-semibold text-foreground">Top Failure Reasons</h2>
            {data.top_failure_reasons.length === 0 ? (
              <p className="text-sm text-muted-foreground">No failures in this selection.</p>
            ) : (
              data.top_failure_reasons.map((row) => (
                <div key={row.reason} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{row.reason}</span>
                  <span className="text-foreground font-medium">{row.count}</span>
                </div>
              ))
            )}
          </div>

          <div className="rounded-xl border border-border/15 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-overlay-4 text-muted-foreground">
                <tr>
                  <th className="text-left p-2">Time</th>
                  <th className="text-left p-2">Run</th>
                  <th className="text-left p-2">Record</th>
                  <th className="text-left p-2">Mode</th>
                  <th className="text-left p-2">Status</th>
                  <th className="text-left p-2">Persisted</th>
                  <th className="text-left p-2">Failure</th>
                </tr>
              </thead>
              <tbody>
                {data.items.slice(0, 150).map((row) => (
                  <tr key={row.id} className="border-t border-border/10">
                    <td className="p-2 text-muted-foreground">{new Date(row.created_at).toLocaleString()}</td>
                    <td className="p-2">{row.source_run_id ?? "—"}</td>
                    <td className="p-2 font-mono text-xs">{row.source_record_id ?? "—"}</td>
                    <td className="p-2">{row.ingest_mode ?? "—"}</td>
                    <td className="p-2">{row.ingest_status}</td>
                    <td className="p-2">{row.persisted_updates}</td>
                    <td className="p-2 text-red-300">{row.failure_reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/15 bg-overlay-3 p-3">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-lg font-semibold text-foreground mt-1">{value}</p>
    </div>
  );
}

