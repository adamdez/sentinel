"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/sentinel/glass-card";
import { PageShell } from "@/components/sentinel/page-shell";
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

type DeepDiveItem = {
  id: string;
  status: string | null;
  next_action: string | null;
  next_action_due_at: string | null;
  last_contact_at: string | null;
  total_calls: number;
  notes: string | null;
  parked_at: string | null;
  parked_reason: string | null;
  latest_dossier_status: string | null;
  latest_prep_status: string | null;
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
  const [items, setItems] = useState<DeepDiveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  const counts = useMemo(() => {
    const now = new Date();
    let overdue = 0;
    let today = 0;
    let tomorrow = 0;
    for (const item of items) {
      if (!item.next_action_due_at) continue;
      const due = formatDueDateLabel(item.next_action_due_at, now);
      if (due.overdue) overdue += 1;
      else if (due.text === "Due today") today += 1;
      else if (due.text === "Due tomorrow") tomorrow += 1;
    }
    return { total: items.length, overdue, today, tomorrow };
  }, [items]);

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
      toast.success("Research queued");
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
    setBusyId(item.id);
    try {
      const response = await fetch(`/api/dialer/v1/deep-dive/${item.id}/ready`, {
        method: "POST",
        headers: await authHeaders(),
      });
      const data = await response.json().catch(() => ({} as { error?: string }));
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to mark file ready");
      }
      toast.success("Lead is ready to dial again");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to mark file ready");
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
            { label: "Due tomorrow", value: counts.tomorrow },
          ].map((stat) => (
            <GlassCard key={stat.label} hover={false} className="!p-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground/55">{stat.label}</p>
              <p className="mt-1 text-2xl font-semibold">{stat.value}</p>
            </GlassCard>
          ))}
        </div>

        {loading ? (
          <GlassCard hover={false} className="!p-8 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground/50" />
          </GlassCard>
        ) : items.length === 0 ? (
          <GlassCard hover={false} className="!p-8 text-center">
            <p className="text-sm font-medium text-foreground/75">No files parked for deep-dive prep.</p>
            <p className="mt-1 text-sm text-muted-foreground/55">
              Use the `Deep Dive` action in the dialer or client file when you want to park a file for later research.
            </p>
          </GlassCard>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const due = formatDueDateLabel(item.next_action_due_at);
              const busy = busyId === item.id;
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
                      </div>

                      {item.parked_reason && (
                        <div className="rounded-[10px] border border-primary/15 bg-primary/[0.05] px-3 py-2 text-sm text-foreground/85">
                          {item.parked_reason}
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2 lg:max-w-[320px] lg:justify-end">
                      <Link href={`/leads?open=${item.id}`}>
                        <Button size="sm" variant="outline" className="gap-1.5">
                          <ArrowRight className="h-3.5 w-3.5" />
                          Open Client File
                        </Button>
                      </Link>
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void handleRunResearch(item)} disabled={busy}>
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                        Run Research
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void handleAssemblePrep(item)} disabled={busy}>
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookOpen className="h-3.5 w-3.5" />}
                        Build Prep
                      </Button>
                      <Button size="sm" className="gap-1.5" onClick={() => void handleMarkReady(item)} disabled={busy}>
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
