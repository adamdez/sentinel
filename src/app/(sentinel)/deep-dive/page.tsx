"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/sentinel/glass-card";
import { PageShell } from "@/components/sentinel/page-shell";
import { buildDeepDiveActionableItems, evaluateDeepDiveQueueState, evaluateDeepDiveReadiness } from "@/lib/deep-dive";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { formatDueDateLabel } from "@/lib/due-date-label";
import {
  ArrowRight,
  BookOpen,
  Clock,
  FileSearch,
  Loader2,
  Phone,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

type ResearchQuality = "full" | "fallback" | "degraded" | "needs_review";
type QueueStatus = "needs_research" | "needs_review" | "ready_for_rerun" | "ready_to_call";

type DeepDiveItem = {
  id: string;
  status: string | null;
  assigned_to: string | null;
  next_action: string | null;
  next_action_due_at: string | null;
  last_contact_at: string | null;
  total_calls: number;
  notes: string | null;
  parked_at: string | null;
  parked_reason: string | null;
  latest_dossier_status: string | null;
  latest_prep_status: string | null;
  research_quality: ResearchQuality | null;
  research_quality_reason: string | null;
  research_gap_count: number;
  research_gaps: string[];
  research_staged_at: string | null;
  likely_decision_maker: string | null;
  decision_maker_confidence: number | null;
  next_of_kin_count: number;
  queue_status: QueueStatus;
  ready_for_rerun: boolean;
  actionable_research_count: number;
  actionable_open_count: number;
  actionable_completed_count: number;
  actionable_unresolved_count: number;
  last_research_task_completed_at: string | null;
  open_research_task_count: number;
  open_research_tasks: Array<{
    id: string;
    title: string | null;
    assigned_to: string | null;
    due_at: string | null;
    source_type: string | null;
    source_key: string | null;
  }>;
  completed_research_task_count: number;
  completed_research_tasks: Array<{
    id: string;
    title: string | null;
    assigned_to: string | null;
    due_at: string | null;
    completed_at: string | null;
    source_type: string | null;
    source_key: string | null;
  }>;
  properties: {
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    county: string | null;
    owner_name: string | null;
    owner_phone: string | null;
  } | null;
};

type AssignmentOption = {
  id: string;
  name: string;
};

function formatTimeAgo(iso: string | null): string {
  if (!iso) return "unknown";
  const diffMs = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diffMs)) return "unknown";
  if (diffMs < 60_000) return "just now";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function defaultResearchTaskDueAt(): string {
  const due = new Date();
  due.setDate(due.getDate() + 1);
  due.setHours(9, 0, 0, 0);
  return due.toISOString();
}

function researchQualityTone(quality: ResearchQuality | null): {
  label: string;
  className: string;
} {
  switch (quality) {
    case "full":
      return {
        label: "Research Full",
        className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
      };
    case "fallback":
      return {
        label: "Research Fallback",
        className: "border-sky-500/30 bg-sky-500/10 text-sky-200",
      };
    case "needs_review":
      return {
        label: "Research Needs Review",
        className: "border-amber-500/30 bg-amber-500/10 text-amber-200",
      };
    case "degraded":
      return {
        label: "Research Degraded",
        className: "border-rose-500/30 bg-rose-500/10 text-rose-200",
      };
    default:
      return {
        label: "Research Not Run",
        className: "border-border/30 bg-muted/10 text-foreground/75",
      };
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  return headers;
}

async function fetchLeadContext(leadId: string) {
  const headers = await authHeaders();
  const response = await fetch(`/api/dialer/v1/context/${leadId}`, { headers });
  if (!response.ok) {
    const data = await response.json().catch(() => ({} as { error?: string }));
    throw new Error(data.error ?? "Failed to load dialer context");
  }
  const data = await response.json();
  return data.context;
}

export default function DeepDivePage() {
  const router = useRouter();
  const [items, setItems] = useState<DeepDiveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | QueueStatus>("all");
  const [assignmentOptions, setAssignmentOptions] = useState<AssignmentOption[]>([]);
  const [assignmentTargets, setAssignmentTargets] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/dialer/v1/deep-dive", { headers: await authHeaders() });
      if (!response.ok) {
        const data = await response.json().catch(() => ({} as { error?: string }));
        throw new Error(data.error ?? "Failed to load deep-dive queue");
      }
      const data = await response.json();
      setItems(data.items ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load deep-dive queue");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase.from("user_profiles") as any)
          .select("id, full_name, role")
          .in("role", ["admin", "agent"])
          .order("full_name");

        if (!active) return;
        const options = Array.isArray(data)
          ? data.map((row: { id: string; full_name?: string | null }) => ({
              id: row.id,
              name: row.full_name?.trim() || `${row.id.slice(0, 8)}...`,
            }))
          : [];
        setAssignmentOptions(options);
      } catch (error) {
        console.error("[deep-dive] failed to load assignment options:", error);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setAssignmentTargets((current) => {
      const next: Record<string, string> = {};
      for (const item of items) {
        next[item.id] = current[item.id] ?? item.assigned_to ?? "";
      }
      return next;
    });
  }, [items]);

  const counts = useMemo(() => {
    const now = new Date();
    let overdue = 0;
    let today = 0;
    let tomorrow = 0;
    let ready = 0;
    let readyForRerun = 0;
    let needsReview = 0;
    let needsResearch = 0;
    for (const item of items) {
      if (item.queue_status === "ready_to_call") ready += 1;
      else if (item.queue_status === "ready_for_rerun") readyForRerun += 1;
      else if (item.queue_status === "needs_review") needsReview += 1;
      else needsResearch += 1;
      if (!item.next_action_due_at) continue;
      const due = formatDueDateLabel(item.next_action_due_at, now);
      if (due.overdue) overdue += 1;
      else if (due.text === "Due today") today += 1;
      else if (due.text === "Due tomorrow") tomorrow += 1;
    }
    return { total: items.length, overdue, today, tomorrow, ready, readyForRerun, needsReview, needsResearch };
  }, [items]);

  const visibleItems = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((item) => item.queue_status === filter);
  }, [filter, items]);

  const handleRunResearch = useCallback(async (item: DeepDiveItem) => {
    setBusyId(item.id);
    try {
      const response = await fetch("/api/agents/research", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ leadId: item.id }),
      });
      const data = await response.json().catch(() => ({} as { error?: string }));
      if (!response.ok || data.ok === false) {
        throw new Error(data.error ?? "Failed to start research");
      }
      toast.success(item.ready_for_rerun ? "Deep Search rerun queued" : "Research queued");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start research");
    } finally {
      setBusyId(null);
    }
  }, [load]);

  const handleAssemblePrep = useCallback(async (item: DeepDiveItem) => {
    setBusyId(item.id);
    try {
      const context = await fetchLeadContext(item.id);
      const response = await fetch("/api/dialer/v1/outbound-prep", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({
          lead_id: item.id,
          crm_context: context,
          objection_tags: [],
        }),
      });
      const data = await response.json().catch(() => ({} as { error?: string }));
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to build prep frame");
      }
      toast.success("Prep frame assembled");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to build prep frame");
    } finally {
      setBusyId(null);
    }
  }, [load]);

  const handleMarkReady = useCallback(async (item: DeepDiveItem) => {
    const readiness = evaluateDeepDiveReadiness({
      research_quality: item.research_quality,
      research_gap_count: item.research_gap_count,
      likely_decision_maker: item.likely_decision_maker,
    });
    if (!readiness.ready) {
      toast.error(readiness.blockers[0] ?? "This file is not ready to return to calling yet.");
      return;
    }

    setBusyId(item.id);
    try {
      const response = await fetch(`/api/dialer/v1/deep-dive/${item.id}/ready`, {
        method: "POST",
        headers: await authHeaders(),
      });
      const data = await response.json().catch(() => ({} as { error?: string; blockers?: string[] }));
      if (!response.ok) {
        throw new Error(data.blockers?.[0] ?? data.error ?? "Failed to mark file ready");
      }
      toast.success("Lead is ready to dial again");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to mark file ready");
    } finally {
      setBusyId(null);
    }
  }, [load]);

  const handleAssign = useCallback(async (item: DeepDiveItem) => {
    const targetId = assignmentTargets[item.id] ?? "";
    if (!targetId) {
      toast.error("Select an owner before assigning.");
      return;
    }
    if (targetId === (item.assigned_to ?? "")) {
      toast.message("Lead owner is already selected.");
      return;
    }

    setBusyId(item.id);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: current, error: fetchErr } = await (supabase.from("leads") as any)
        .select("lock_version")
        .eq("id", item.id)
        .single();

      if (fetchErr || !current) {
        throw new Error("Could not load current lead state");
      }

      const headers = await authHeaders();
      headers["x-lock-version"] = String(current.lock_version ?? 0);

      const response = await fetch("/api/prospects", {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          lead_id: item.id,
          assigned_to: targetId,
        }),
      });

      const data = await response.json().catch(() => ({} as { error?: string; detail?: string }));
      if (!response.ok) {
        throw new Error(data.detail ?? data.error ?? "Failed to assign lead");
      }

      const targetName = assignmentOptions.find((option) => option.id === targetId)?.name ?? "selected owner";
      toast.success(`Lead reassigned to ${targetName}`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to assign lead");
    } finally {
      setBusyId(null);
    }
  }, [assignmentOptions, assignmentTargets, load]);

  const handleCreateResearchTask = useCallback(async (
    item: DeepDiveItem,
    action: ReturnType<typeof buildDeepDiveActionableItems>[number],
  ) => {
    setBusyId(item.id);
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({
          title: `Research - ${action.label.slice(0, 72)}`,
          description: [
            "Created from the Deep Dive queue.",
            action.label,
            item.likely_decision_maker ? `Current staged decision-maker: ${item.likely_decision_maker}` : null,
            item.parked_reason ? `Why parked: ${item.parked_reason}` : null,
            item.properties?.address ? `Property: ${item.properties.address}` : null,
          ].filter(Boolean).join("\n\n"),
          lead_id: item.id,
          assigned_to: assignmentTargets[item.id] ?? item.assigned_to ?? undefined,
          due_at: defaultResearchTaskDueAt(),
          priority: 2,
          task_type: "research",
          source_type: action.sourceType,
          source_key: action.sourceKey,
        }),
      });
      const payload = await response.json().catch(() => ({} as { error?: string; reused_existing?: boolean; reopened?: boolean }));
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to create task");
      }
      if (payload.reopened) {
        toast.success("Research task reopened");
      } else if (payload.reused_existing) {
        toast.success("Research task already open");
      } else {
        toast.success("Research task created");
      }
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create task");
    } finally {
      setBusyId(null);
    }
  }, [assignmentTargets, load]);

  const handleUpdateResearchTaskStatus = useCallback(async (
    item: DeepDiveItem,
    taskId: string,
    status: "completed" | "pending",
  ) => {
    setBusyId(item.id);
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: await authHeaders(),
        body: JSON.stringify({ status }),
      });
      const payload = await response.json().catch(() => ({} as { error?: string }));
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to update research task");
      }
      toast.success(status === "completed" ? "Research task completed" : "Research task reopened");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update research task");
    } finally {
      setBusyId(null);
    }
  }, [load]);

  return (
    <PageShell title="Deep Dive" description="Parked files that need research before they return to calling">
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <FileSearch className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold tracking-tight">Deep Dive Queue</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Parked files stay out of power dialing until prep is finished.
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          {[
            { label: "Total parked", value: counts.total },
            { label: "Overdue", value: counts.overdue },
            { label: "Due today", value: counts.today },
            { label: "Ready to call", value: counts.ready },
          ].map((stat) => (
            <GlassCard key={stat.label} hover={false} className="!p-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground/55">{stat.label}</p>
              <p className="mt-1 text-2xl font-semibold">{stat.value}</p>
            </GlassCard>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            { key: "all", label: "All", value: counts.total },
            { key: "needs_research", label: "Needs Research", value: counts.needsResearch },
            { key: "needs_review", label: "Needs Review", value: counts.needsReview },
            { key: "ready_for_rerun", label: "Ready for Rerun", value: counts.readyForRerun },
            { key: "ready_to_call", label: "Ready to Call", value: counts.ready },
          ].map((option) => (
            <Button
              key={option.key}
              size="sm"
              variant={filter === option.key ? "default" : "outline"}
              className="gap-1.5"
              onClick={() => setFilter(option.key as "all" | QueueStatus)}
            >
              {option.label}
              <Badge variant="outline" className="border-current/20 bg-transparent text-[10px]">
                {option.value}
              </Badge>
            </Button>
          ))}
        </div>

        {loading ? (
          <GlassCard hover={false} className="!p-8 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground/50" />
          </GlassCard>
        ) : visibleItems.length === 0 ? (
          <GlassCard hover={false} className="!p-8 text-center">
            <p className="text-sm font-medium text-foreground/75">
              {items.length === 0 ? "No files parked for deep-dive prep." : "No files match this Deep Dive filter."}
            </p>
            <p className="mt-1 text-sm text-muted-foreground/55">
              {items.length === 0
                ? "Use the `Deep Dive` action in the dialer or client file when you want to park a file for later research."
                : "Try another filter or refresh the queue after research work completes."}
            </p>
          </GlassCard>
        ) : (
          <div className="space-y-3">
            {visibleItems.map((item) => {
              const due = formatDueDateLabel(item.next_action_due_at);
              const busy = busyId === item.id;
              const queueState = evaluateDeepDiveQueueState({
                leadId: item.id,
                research_quality: item.research_quality,
                research_gap_count: item.research_gap_count,
                research_gaps: item.research_gaps,
                research_staged_at: item.research_staged_at,
                likely_decision_maker: item.likely_decision_maker,
                openResearchTasks: item.open_research_tasks,
              });
              const researchQuality = researchQualityTone(item.research_quality);
              const readiness = queueState.readiness;
              const actionableItems = buildDeepDiveActionableItems({
                leadId: item.id,
                research_quality: item.research_quality,
                research_gap_count: item.research_gap_count,
                research_gaps: item.research_gaps,
                likely_decision_maker: item.likely_decision_maker,
              });
              const openActionTaskMap = new Map(
                item.open_research_tasks
                  .filter((task) => task.source_type && task.source_key)
                  .map((task) => [`${task.source_type}:${task.source_key}`, task] as const),
              );
              return (
                <GlassCard key={item.id} hover={false} className="!p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold text-foreground">
                          {item.properties?.owner_name ?? item.properties?.address ?? "Unknown file"}
                        </h2>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] uppercase tracking-wider",
                            due.overdue
                              ? "border-red-500/30 bg-red-500/10 text-red-300"
                              : due.text === "Due today"
                                ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                                : "border-border/30 bg-muted/10 text-foreground/75",
                          )}
                        >
                          {due.text === "n/a" ? "No due date" : due.text}
                        </Badge>
                        {item.latest_dossier_status && (
                          <Badge variant="outline" className="text-[10px] uppercase tracking-wider border-border/30">
                            Dossier: {item.latest_dossier_status}
                          </Badge>
                        )}
                        {item.latest_prep_status && (
                          <Badge variant="outline" className="text-[10px] uppercase tracking-wider border-border/30">
                            Prep: {item.latest_prep_status}
                          </Badge>
                        )}
                        <Badge variant="outline" className={cn("text-[10px] uppercase tracking-wider", researchQuality.className)}>
                          {researchQuality.label}
                        </Badge>
                        {item.queue_status === "ready_for_rerun" && (
                          <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-[10px] uppercase tracking-wider text-sky-100">
                            Ready for Rerun
                          </Badge>
                        )}
                        {item.queue_status === "ready_to_call" && (
                          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[10px] uppercase tracking-wider text-emerald-100">
                            Ready to Call
                          </Badge>
                        )}
                      </div>

                      <div className="space-y-0.5 text-sm text-muted-foreground/75">
                        <p>{[item.properties?.address, item.properties?.city, item.properties?.state, item.properties?.zip].filter(Boolean).join(", ")}</p>
                        {item.properties?.owner_phone && <p>{item.properties.owner_phone}</p>}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground/60">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Parked {formatTimeAgo(item.parked_at)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {item.total_calls} call{item.total_calls === 1 ? "" : "s"}
                        </span>
                        <span>
                          Owner: {assignmentOptions.find((option) => option.id === item.assigned_to)?.name ?? "Unassigned"}
                        </span>
                      </div>

                      {(item.likely_decision_maker || item.research_gap_count > 0 || item.next_of_kin_count > 0 || item.research_quality_reason) && (
                        <div className="rounded-[10px] border border-border/20 bg-background/30 px-3 py-2.5 space-y-1.5">
                          {item.likely_decision_maker && (
                            <p className="text-sm text-foreground/90">
                              Decision-maker:{" "}
                              <span className="font-medium text-foreground">{item.likely_decision_maker}</span>
                              {item.decision_maker_confidence != null && (
                                <span className="ml-2 text-xs text-muted-foreground/65">
                                  {Math.round(item.decision_maker_confidence * 100)}% confidence
                                </span>
                              )}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground/65">
                            {item.next_of_kin_count > 0 && <span>{item.next_of_kin_count} kin / authority contact{item.next_of_kin_count === 1 ? "" : "s"}</span>}
                            <span>{item.research_gap_count} research gap{item.research_gap_count === 1 ? "" : "s"}</span>
                            {item.research_staged_at && <span>Staged {formatTimeAgo(item.research_staged_at)}</span>}
                          </div>
                          {item.actionable_research_count > 0 && (
                            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground/65">
                              <span>{item.actionable_completed_count}/{item.actionable_research_count} blocker task{item.actionable_research_count === 1 ? "" : "s"} resolved</span>
                              {item.actionable_open_count > 0 && <span>{item.actionable_open_count} blocker task{item.actionable_open_count === 1 ? "" : "s"} still open</span>}
                              {item.last_research_task_completed_at && <span>Last blocker completed {formatTimeAgo(item.last_research_task_completed_at)}</span>}
                            </div>
                          )}
                          {item.research_quality_reason && (
                            <p className="text-xs text-muted-foreground/70">{item.research_quality_reason}</p>
                          )}
                          {!readiness.ready && (
                            <div className="flex flex-wrap gap-2 pt-1">
                              {readiness.blockers.map((blocker) => (
                                <Badge
                                  key={`${item.id}-${blocker}`}
                                  variant="outline"
                                  className="max-w-full whitespace-normal border-amber-500/20 bg-amber-500/10 text-left text-[10px] uppercase tracking-wider text-amber-100"
                                >
                                  {blocker}
                                </Badge>
                              ))}
                            </div>
                          )}
                          {actionableItems.length > 0 && (
                            <div className="space-y-2 pt-1">
                              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground/55">
                                Actionable Research
                              </p>
                              <div className="space-y-2">
                                {actionableItems.slice(0, 3).map((action) => {
                                  const existingTask = openActionTaskMap.get(`${action.sourceType}:${action.sourceKey}`);
                                  const existingAssignee = existingTask?.assigned_to
                                    ? assignmentOptions.find((option) => option.id === existingTask.assigned_to)?.name ?? "Assigned"
                                    : "Unassigned";
                                  return (
                                    <div
                                      key={`${item.id}-${action.key}`}
                                      className="flex flex-col gap-2 rounded-md border border-border/20 bg-background/20 px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between"
                                    >
                                      <div className="space-y-1">
                                        <p className="text-xs text-foreground/85">{action.label}</p>
                                        {existingTask && (
                                          <p className="text-[11px] text-muted-foreground/60">
                                            Open task: {existingTask.title ?? "Research task"} · {existingAssignee}
                                          </p>
                                        )}
                                      </div>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="gap-1.5 self-start sm:self-auto"
                                        onClick={() => void handleCreateResearchTask(item, action)}
                                        disabled={busy || Boolean(existingTask)}
                                      >
                                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                                        {existingTask ? "Task Open" : "Create Task"}
                                      </Button>
                                    </div>
                                  );
                                })}
                                {actionableItems.length > 3 && (
                                  <p className="text-xs text-muted-foreground/60">
                                    +{actionableItems.length - 3} more research item{actionableItems.length - 3 === 1 ? "" : "s"} in the full Deep Search view
                                  </p>
                                )}
                              </div>
                            </div>
                          )}
                          {(item.open_research_task_count > 0 || item.completed_research_task_count > 0) && (
                            <div className="space-y-2 pt-1">
                              {item.open_research_task_count > 0 && (
                                <div className="space-y-2">
                                  <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground/55">
                                    Open Research Tasks
                                  </p>
                                  <div className="space-y-2">
                                    {item.open_research_tasks.slice(0, 3).map((task) => {
                                      const assigneeName = task.assigned_to
                                        ? assignmentOptions.find((option) => option.id === task.assigned_to)?.name ?? "Assigned"
                                        : "Unassigned";
                                      return (
                                        <div
                                          key={`${item.id}-${task.id}`}
                                          className="flex flex-col gap-2 rounded-md border border-sky-500/20 bg-sky-500/10 px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between"
                                        >
                                          <div className="space-y-1">
                                            <p className="text-xs text-sky-50">{task.title ?? "Research task"}</p>
                                            <p className="text-[11px] text-sky-100/70">
                                              {assigneeName}
                                              {task.due_at ? ` · Due ${formatDueDateLabel(task.due_at).text}` : ""}
                                            </p>
                                          </div>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="gap-1.5 self-start border-sky-400/30 bg-sky-500/10 text-sky-50 hover:bg-sky-500/20 sm:self-auto"
                                            onClick={() => void handleUpdateResearchTaskStatus(item, task.id, "completed")}
                                            disabled={busy}
                                          >
                                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                                            Mark Complete
                                          </Button>
                                        </div>
                                      );
                                    })}
                                    {item.open_research_task_count > 3 && (
                                      <p className="text-xs text-muted-foreground/60">
                                        +{item.open_research_task_count - 3} more open research task{item.open_research_task_count - 3 === 1 ? "" : "s"}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              )}
                              {item.completed_research_task_count > 0 && (
                                <div className="space-y-2">
                                  <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground/55">
                                    Recently Completed
                                  </p>
                                  <div className="space-y-2">
                                    {item.completed_research_tasks.slice(0, 2).map((task) => {
                                      const assigneeName = task.assigned_to
                                        ? assignmentOptions.find((option) => option.id === task.assigned_to)?.name ?? "Assigned"
                                        : "Unassigned";
                                      return (
                                        <div
                                          key={`${item.id}-completed-${task.id}`}
                                          className="flex flex-col gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between"
                                        >
                                          <div className="space-y-1">
                                            <p className="text-xs text-emerald-50">{task.title ?? "Research task"}</p>
                                            <p className="text-[11px] text-emerald-100/70">
                                              {assigneeName}
                                              {task.completed_at ? ` · Completed ${formatTimeAgo(task.completed_at)}` : ""}
                                            </p>
                                          </div>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="gap-1.5 self-start border-emerald-400/30 bg-emerald-500/10 text-emerald-50 hover:bg-emerald-500/20 sm:self-auto"
                                            onClick={() => void handleUpdateResearchTaskStatus(item, task.id, "pending")}
                                            disabled={busy}
                                          >
                                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                                            Reopen
                                          </Button>
                                        </div>
                                      );
                                    })}
                                    {item.completed_research_task_count > 2 && (
                                      <p className="text-xs text-muted-foreground/60">
                                        +{item.completed_research_task_count - 2} more completed research task{item.completed_research_task_count - 2 === 1 ? "" : "s"}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {item.parked_reason && (
                        <div className="rounded-[10px] border border-primary/15 bg-primary/[0.05] px-3 py-2 text-sm text-foreground/85">
                          {item.parked_reason}
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2 lg:max-w-[320px] lg:justify-end">
                      <div className="flex min-w-[220px] items-center gap-2">
                        <select
                          value={assignmentTargets[item.id] ?? item.assigned_to ?? ""}
                          onChange={(event) =>
                            setAssignmentTargets((current) => ({
                              ...current,
                              [item.id]: event.target.value,
                            }))
                          }
                          className="h-9 flex-1 rounded-md border border-border/30 bg-background/60 px-2 text-xs text-foreground focus:border-primary/30 focus:outline-none focus:ring-1 focus:ring-ring/20"
                          disabled={busy}
                        >
                          <option value="">Unassigned</option>
                          {assignmentOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name}
                            </option>
                          ))}
                        </select>
                        <Button size="sm" variant="outline" onClick={() => void handleAssign(item)} disabled={busy}>
                          Assign
                        </Button>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => router.push(`/leads?segment=all&open=${item.id}`)}
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                        Open Client File
                      </Button>
                      <Button
                        size="sm"
                        variant={item.ready_for_rerun ? "default" : "outline"}
                        className="gap-1.5"
                        onClick={() => void handleRunResearch(item)}
                        disabled={busy}
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                        {item.ready_for_rerun ? "Rerun Deep Search" : "Run Research"}
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void handleAssemblePrep(item)} disabled={busy}>
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookOpen className="h-3.5 w-3.5" />}
                        Build Prep
                      </Button>
                      <Button size="sm" className="gap-1.5" onClick={() => void handleMarkReady(item)} disabled={busy || !readiness.ready}>
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        Ready Again
                      </Button>
                    </div>
                  </div>
                </GlassCard>
              );
            })}
          </div>
        )}
      </div>
    </PageShell>
  );
}
