"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Loader2,
  XCircle,
  ClipboardList,
  Activity,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { sentinelAuthHeaders } from "@/lib/sentinel-auth-headers";
import { cn } from "@/lib/utils";
import { useState } from "react";
import type { AgentHealthSummary } from "@/lib/agent-health";

type ReviewTab = "pending" | "approved" | "rejected";

interface ReviewQueueItem {
  id: string;
  run_id: string | null;
  agent_name: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  proposal: Record<string, unknown>;
  rationale: string | null;
  status: string;
  priority: number | null;
  created_at: string;
}

interface AgentRunRow {
  id: string;
  agent_name: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  error?: string | null;
}

function failureTone(severity: "critical" | "high" | "medium"): string {
  if (severity === "critical") return "border-red-500/25 bg-red-500/8";
  if (severity === "high") return "border-amber-500/25 bg-amber-500/8";
  return "border-border/20 bg-muted/10";
}

function statusTone(successRate: number, failed: number): string {
  if (failed === 0 || successRate >= 90) return "border-green-500/20 bg-green-500/5";
  if (successRate >= 60) return "border-amber-500/20 bg-amber-500/5";
  return "border-red-500/20 bg-red-500/5";
}

function formatError(error?: string | null): string {
  if (!error) return "No error text recorded";
  return error.length > 180 ? `${error.slice(0, 177)}...` : error;
}

function agentBadgeClass(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("research")) return "border-border/35 bg-muted/10 text-foreground";
  if (n.includes("follow")) return "border-border/35 bg-muted/10 text-foreground";
  if (n.includes("dispo")) return "border-border/35 bg-muted/10 text-foreground";
  if (n.includes("qa")) return "border-border/35 bg-muted/10 text-foreground";
  if (n.includes("exception")) return "border-border/35 bg-muted/10 text-foreground";
  if (n.includes("ads")) return "border-border/35 bg-muted/10 text-foreground";
  return "border-overlay-15 bg-overlay-4 text-muted-foreground";
}

function proposalPreview(p: Record<string, unknown>): string {
  try {
    const s = JSON.stringify(p);
    return s.length > 280 ? `${s.slice(0, 280)}…` : s;
  } catch {
    return String(p);
  }
}

export function AgentReviewQueuePanel() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<ReviewTab>("pending");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");

  const queueQuery = useQuery({
    queryKey: ["review-queue", tab],
    queryFn: async () => {
      const res = await fetch(
        `/api/control-plane/review-queue?status=${tab}&limit=50`,
        { headers: await sentinelAuthHeaders(false) },
      );
      if (!res.ok) throw new Error("Failed to load review queue");
      const json = (await res.json()) as { data: ReviewQueueItem[]; count: number };
      return json;
    },
  });

  const runsQuery = useQuery({
    queryKey: ["agent-runs", 20],
    queryFn: async () => {
      const res = await fetch("/api/control-plane/agent-runs?limit=20", {
        headers: await sentinelAuthHeaders(false),
      });
      if (!res.ok) throw new Error("Failed to load agent runs");
      const json = (await res.json()) as { data: AgentRunRow[] };
      return json.data ?? [];
    },
  });

  const healthQuery = useQuery({
    queryKey: ["agent-health", 48],
    queryFn: async () => {
      const res = await fetch("/api/control-plane/agent-health?window_hours=48&limit=300", {
        headers: await sentinelAuthHeaders(false),
      });
      if (!res.ok) throw new Error("Failed to load agent health");
      const json = (await res.json()) as { summary: AgentHealthSummary };
      return json.summary;
    },
  });

  const patchMutation = useMutation({
    mutationFn: async (body: { id: string; status: "approved" | "rejected"; review_notes?: string }) => {
      const res = await fetch("/api/control-plane/review-queue", {
        method: "PATCH",
        headers: await sentinelAuthHeaders(),
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Request failed");
      return json as {
        data: {
          id: string;
          status: string;
          executed?: boolean;
          action?: string;
          detail?: Record<string, unknown>;
          reason?: string;
        };
      };
    },
    onSuccess: (json, vars) => {
      void qc.invalidateQueries({ queryKey: ["review-queue"] });
      if (vars.status === "approved") {
        const d = json.data.detail;
        const detailStr = d ? JSON.stringify(d).slice(0, 400) : json.data.reason ?? "Completed";
        toast.success(
          json.data.executed ? `Executed: ${json.data.action ?? "action"}` : "Approved (no execution)",
          { description: detailStr },
        );
      } else {
        toast.message("Proposal rejected");
      }
      setRejectingId(null);
      setRejectNotes("");
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Update failed");
    },
  });

  const items = queueQuery.data?.data ?? [];
  const sorted = [...items].sort((a, b) => {
    const pa = a.priority ?? 0;
    const pb = b.priority ?? 0;
    if (pb !== pa) return pb - pa;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
  const health = healthQuery.data;

  return (
    <div className="space-y-4">
      <GlassCard hover={false} className={cn("!p-4", health ? statusTone(health.totals.successRate, health.totals.failed) : "border-border/20")}>
        <div className="flex flex-wrap items-start gap-3 justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground/60" />
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/70">
                Agent Health
              </h3>
            </div>
            {healthQuery.isLoading ? (
              <p className="text-sm text-muted-foreground/60 flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading agent health...
              </p>
            ) : healthQuery.error ? (
              <p className="text-sm text-red-300">{(healthQuery.error as Error).message}</p>
            ) : health ? (
              <>
                <p className="text-sm font-medium text-foreground">{health.headline}</p>
                <p className="text-xs text-muted-foreground/70">
                  Last {health.windowHours}h: {health.totals.completed} completed, {health.totals.failed} failed, {health.totals.cancelled} cancelled, {health.totals.running} still running.
                </p>
              </>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {health ? (
              <>
                <Badge variant="outline" className="text-sm">
                  {health.totals.successRate}% success
                </Badge>
                <Link href="/admin/health" className="inline-flex items-center gap-1 text-xs text-primary/70 hover:text-primary">
                  System health
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </>
            ) : null}
          </div>
        </div>

        {health && health.causes.length > 0 ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {health.causes.slice(0, 4).map((cause) => (
              <div key={cause.key} className={cn("rounded-lg border p-3", failureTone(cause.severity))}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{cause.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground/80">{cause.detail}</p>
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    {cause.count}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-foreground/85">{cause.action}</p>
                <p className="mt-1 text-[11px] text-muted-foreground/60">
                  Agents: {cause.agents.join(", ")}
                </p>
              </div>
            ))}
          </div>
        ) : health && !healthQuery.isLoading ? (
          <p className="mt-3 text-sm text-muted-foreground/65">No recurring failure pattern in the current window.</p>
        ) : null}
      </GlassCard>

      <GlassCard hover={false} className="!p-3">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { id: "pending" as const, label: "Pending" },
              { id: "approved" as const, label: "Approved" },
              { id: "rejected" as const, label: "Rejected" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                setRejectingId(null);
                setRejectNotes("");
              }}
              className={cn(
                "rounded-[10px] px-3 py-1.5 text-sm font-medium border transition-colors",
                tab === t.id
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-overlay-6 text-muted-foreground hover:border-overlay-10",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </GlassCard>

      {queueQuery.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading proposals…
        </div>
      )}

      {queueQuery.error && (
        <GlassCard hover={false} className="border-border/20 text-sm text-foreground">
          {(queueQuery.error as Error).message}
        </GlassCard>
      )}

      {!queueQuery.isLoading && !queueQuery.error && sorted.length === 0 && tab === "pending" && (
        <GlassCard hover={false} className="!p-8 text-center text-sm text-muted-foreground">
          <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p>No pending proposals. Agents will submit proposals here when they run.</p>
        </GlassCard>
      )}

      {!queueQuery.isLoading && !queueQuery.error && sorted.length === 0 && tab !== "pending" && (
        <GlassCard hover={false} className="!p-6 text-sm text-muted-foreground">
          No {tab} items in this view.
        </GlassCard>
      )}

      <div className="space-y-3">
        {sorted.map((item) => (
          <GlassCard key={item.id} hover={false} className="!p-4">
            <div className="flex flex-wrap items-start gap-2 justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={cn("text-sm font-medium", agentBadgeClass(item.agent_name))}>
                  {item.agent_name}
                </Badge>
                <span className="text-sm uppercase tracking-wide text-muted-foreground/50">
                  {item.action}
                </span>
                {item.priority != null && (
                  <span className="text-sm text-foreground/80">P{item.priority}</span>
                )}
              </div>
              <span className="text-sm text-muted-foreground/40">
                {new Date(item.created_at).toLocaleString()}
              </span>
            </div>

            {item.rationale ? (
              <p className="mt-2 text-xs text-muted-foreground/90 leading-relaxed">{item.rationale}</p>
            ) : null}

            <pre className="mt-2 rounded-md border border-overlay-6 bg-black/20 p-2 text-sm font-mono text-muted-foreground/80 overflow-x-auto max-h-28 overflow-y-auto">
              {proposalPreview(item.proposal)}
            </pre>

            {tab === "pending" && (
              <div className="mt-3 flex flex-col gap-2">
                {rejectingId === item.id ? (
                  <div className="flex flex-col gap-2">
                    <textarea
                      value={rejectNotes}
                      onChange={(e) => setRejectNotes(e.target.value)}
                      placeholder="Review notes (optional)"
                      className="w-full min-h-[64px] rounded-md border border-overlay-10 bg-overlay-3 px-2 py-1.5 text-xs"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        className="gap-1"
                        disabled={patchMutation.isPending}
                        onClick={() =>
                          patchMutation.mutate({
                            id: item.id,
                            status: "rejected",
                            review_notes: rejectNotes.trim() || undefined,
                          })
                        }
                      >
                        {patchMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                        Confirm reject
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setRejectingId(null); setRejectNotes(""); }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      className="gap-1 bg-muted/90 hover:bg-muted text-white"
                      disabled={patchMutation.isPending}
                      onClick={() => patchMutation.mutate({ id: item.id, status: "approved" })}
                    >
                      {patchMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="gap-1"
                      disabled={patchMutation.isPending}
                      onClick={() => { setRejectingId(item.id); setRejectNotes(""); }}
                    >
                      <XCircle className="h-3 w-3" />
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            )}
          </GlassCard>
        ))}
      </div>

      <GlassCard hover={false} className="!p-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="h-3.5 w-3.5 text-muted-foreground/50" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/60">
            Recent agent runs
          </h3>
          <Link href="/dialer/review/eval" className="ml-auto text-xs text-primary/50 hover:text-primary/80">
            Eval →
          </Link>
        </div>
        {runsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground/40 flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading…
          </p>
        ) : runsQuery.data && runsQuery.data.length > 0 ? (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {runsQuery.data.map((r) => (
              <div
                key={r.id}
                className="rounded-md border border-overlay-4 px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={cn("font-medium truncate", agentBadgeClass(r.agent_name))}>{r.agent_name}</span>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "shrink-0 text-xs font-medium",
                      r.status === "failed" ? "text-red-300" : r.status === "completed" ? "text-green-300" : "text-muted-foreground/60",
                    )}>
                      {r.status}
                    </span>
                    <span className="text-muted-foreground/35 shrink-0">
                      {new Date(r.started_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
                {r.status === "failed" ? (
                  <div className="mt-2 rounded-md border border-red-500/15 bg-red-500/5 px-2 py-1.5">
                    <div className="flex items-start gap-2 text-xs text-red-100/90">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-red-300" />
                      <p>{formatError(r.error)}</p>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground/35">No recent runs.</p>
        )}
      </GlassCard>
    </div>
  );
}
