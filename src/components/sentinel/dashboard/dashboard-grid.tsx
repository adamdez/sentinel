"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  AlertTriangle,
  CalendarCheck,
  Phone,
  PhoneCall,
  PhoneIncoming,
  ArrowRight,
  Activity,
  CheckCircle2,
  ShieldAlert,
  Inbox,
  Ban,
  Link2,
  Plus,
  Trash2,
  Loader2,
  Search,
  Pin,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { useSentinelStore } from "@/lib/store";
import { useModal } from "@/providers/modal-provider";
import { cn } from "@/lib/utils";
import type { LeadStatus } from "@/lib/types";

const ACTIVE_STATUSES: LeadStatus[] = ["lead", "negotiation", "disposition", "nurture"];

interface UnlinkedCall {
  id: string;
  phone_dialed: string | null;
  started_at: string;
  duration_sec: number | null;
  direction: string | null;
  ai_summary: string | null;
}

interface BriefStats {
  overdue: number;
  dueToday: number;
  callsToday: number;
  newInbound: number;
}

interface PriorityLead {
  id: string;
  next_action_due_at: string | null;
  next_call_scheduled_at: string | null;
  next_action: string | null;
  status: string | null;
  priority: number | null;
  created_at: string;
  source: string | null;
  notes: string | null;
  properties: { address: string | null; city: string | null; owner_name: string | null } | null;
}

interface StalledDeal {
  id: string;
  source: string | null;
  notes: string | null;
  updated_at: string;
  properties: { address: string | null; city: string | null; owner_name: string | null } | null;
}

interface ReviewBlocker {
  id: string;
  entity_type: string | null;
  status: string | null;
  created_at: string;
}

type SectionError = string | null;

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function daysDiff(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

function effectiveDueDate(lead: PriorityLead): string | null {
  return lead.next_call_scheduled_at ?? lead.next_action_due_at ?? null;
}

function urgencyDotColor(diff: number | null): string {
  if (diff === null) return "bg-muted-foreground/40";
  if (diff < 0) return "bg-red-500";
  if (diff === 0) return "bg-amber-400";
  return "bg-emerald-500";
}

function urgencyText(lead: PriorityLead): string {
  const d = effectiveDueDate(lead);
  const diff = daysDiff(d);
  const action = lead.next_action || "Follow up";
  if (diff === null) return `${action} — no date set`;
  if (diff < -1) return `${action} — ${Math.abs(diff)} days overdue`;
  if (diff === -1) return `${action} — overdue since yesterday`;
  if (diff === 0) return `${action} — due today`;
  if (diff === 1) return `${action} — due tomorrow`;
  return `${action} — due in ${diff} days`;
}

function leadLabel(lead: PriorityLead): string {
  const prop = Array.isArray(lead.properties) ? lead.properties[0] : lead.properties;
  if (prop?.address) return `${prop.address}${prop.city ? `, ${prop.city}` : ""}`;
  if (prop?.owner_name) return prop.owner_name;
  return lead.source || `Lead ${lead.id.slice(0, 8)}`;
}

function SectionErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
      <ShieldAlert className="h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function EmptySection({ icon: Icon, message }: { icon: typeof CheckCircle2; message: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
      <Icon className="h-4 w-4" />
      {message}
    </div>
  );
}

function TodayView() {
  const { currentUser } = useSentinelStore();
  const { openModal } = useModal();

  const [stats, setStats] = useState<BriefStats | null>(null);
  const [statsError, setStatsError] = useState<SectionError>(null);
  const [overdueLeads, setOverdueLeads] = useState<PriorityLead[]>([]);
  const [overdueError, setOverdueError] = useState<SectionError>(null);
  const [inboundLeads, setInboundLeads] = useState<PriorityLead[]>([]);
  const [inboundError, setInboundError] = useState<SectionError>(null);
  const [callNowLeads, setCallNowLeads] = useState<PriorityLead[]>([]);
  const [callNowError, setCallNowError] = useState<SectionError>(null);
  const [callbackLeads, setCallbackLeads] = useState<PriorityLead[]>([]);
  const [callbackError, setCallbackError] = useState<SectionError>(null);
  const [stalledDeals, setStalledDeals] = useState<StalledDeal[]>([]);
  const [stalledError, setStalledError] = useState<SectionError>(null);
  const [reviewBlockers, setReviewBlockers] = useState<ReviewBlocker[]>([]);
  const [reviewError, setReviewError] = useState<SectionError>(null);
  const [unlinkedCalls, setUnlinkedCalls] = useState<UnlinkedCall[]>([]);
  const [unlinkedError, setUnlinkedError] = useState<SectionError>(null);

  // Unified task state
  interface DashTask {
    id: string;
    title: string;
    due_at: string | null;
    status: string;
    task_type: string;
    lead_id: string | null;
    lead_address?: string | null;
    lead_owner?: string | null;
    lead_phone?: string | null;
    lead_status?: string | null;
    last_call_date?: string | null;
    last_call_disposition?: string | null;
    last_call_notes?: string | null;
    assigned_to: string | null;
    notes: string | null;
  }
  const [allTasks, setAllTasks] = useState<DashTask[]>([]);
  const [tasksError, setTasksError] = useState<SectionError>(null);
  const [filterUser, setFilterUser] = useState<string | "all">("all");
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [completingReasonId, setCompletingReasonId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchAll = useCallback(async () => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const nowIso = new Date().toISOString();

    // Stats
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count: overdueCount, error: e1 } = await (supabase.from("leads") as any)
        .select("id", { count: "exact", head: true })
        .or(`next_call_scheduled_at.lt.${nowIso},next_action_due_at.lt.${nowIso}`)
        .in("status", ACTIVE_STATUSES);
      if (e1) throw e1;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count: dueTodayCount, error: e2 } = await (supabase.from("leads") as any)
        .select("id", { count: "exact", head: true })
        .or(`and(next_call_scheduled_at.gte.${todayStart.toISOString()},next_call_scheduled_at.lte.${todayEnd.toISOString()}),and(next_action_due_at.gte.${todayStart.toISOString()},next_action_due_at.lte.${todayEnd.toISOString()})`)
        .in("status", ACTIVE_STATUSES);
      if (e2) throw e2;

      let callsTodayCount: number | null = 0;
      if (currentUser?.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { count, error: e3 } = await (supabase.from("calls_log") as any)
          .select("id", { count: "exact", head: true })
          .gte("started_at", todayStart.toISOString())
          .eq("user_id", currentUser.id);
        if (e3) throw e3;
        callsTodayCount = count;
      }

      const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      // New inbound = real-time leads (ads, forms, calls), NOT bulk CSV imports or crawlers
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count: newInboundCount, error: e4 } = await (supabase.from("leads") as any)
        .select("id", { count: "exact", head: true })
        .in("status", ["staging", "prospect"])
        .gte("created_at", twoDaysAgo)
        .not("source", "like", "csv:%")
        .not("source", "eq", "craigslist")
        .not("source", "like", "crawl%");
      if (e4) throw e4;

      setStats({
        overdue: overdueCount ?? 0,
        dueToday: dueTodayCount ?? 0,
        callsToday: callsTodayCount ?? 0,
        newInbound: newInboundCount ?? 0,
      });
      setStatsError(null);
    } catch (err) {
      console.error("[Today] stats error:", err);
      setStatsError("Failed to load status counts");
    }

    // Overdue follow-ups
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("leads") as any)
        .select("id, next_action_due_at, next_call_scheduled_at, next_action, status, priority, created_at, source, notes, properties(address, city, owner_name)")
        .or(`next_call_scheduled_at.lt.${nowIso},next_action_due_at.lt.${nowIso}`)
        .in("status", ACTIVE_STATUSES)
        .order("next_action_due_at", { ascending: true, nullsFirst: false })
        .limit(8);
      if (error) throw error;
      setOverdueLeads(data ?? []);
      setOverdueError(null);
    } catch (err) {
      console.error("[Today] overdue error:", err);
      setOverdueError("Failed to load overdue follow-ups");
    }

    // New inbound / awaiting first contact
    try {
      const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // New inbound leads only — exclude bulk CSV imports and crawlers
      const { data, error } = await (supabase.from("leads") as any)
        .select("id, next_action_due_at, next_call_scheduled_at, next_action, status, priority, created_at, source, notes, properties(address, city, owner_name)")
        .in("status", ["staging", "prospect"])
        .gte("created_at", twoDaysAgo)
        .not("source", "like", "csv:%")
        .not("source", "eq", "craigslist")
        .not("source", "like", "crawl%")
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      setInboundLeads(data ?? []);
      setInboundError(null);
    } catch (err) {
      console.error("[Today] inbound error:", err);
      setInboundError("Failed to load new inbound leads");
    }

    // Top call-now leads (high priority, active, with a next action)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("leads") as any)
        .select("id, next_action_due_at, next_call_scheduled_at, next_action, status, priority, created_at, source, notes, properties(address, city, owner_name)")
        .in("status", ACTIVE_STATUSES)
        .not("next_action", "is", null)
        .order("priority", { ascending: false })
        .limit(6);
      if (error) throw error;
      setCallNowLeads(data ?? []);
      setCallNowError(null);
    } catch (err) {
      console.error("[Today] call-now error:", err);
      setCallNowError("Failed to load priority call queue");
    }

    // Today's callbacks
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("leads") as any)
        .select("id, next_action_due_at, next_call_scheduled_at, next_action, status, priority, created_at, source, notes, properties(address, city, owner_name)")
        .gte("next_call_scheduled_at", todayStart.toISOString())
        .lte("next_call_scheduled_at", todayEnd.toISOString())
        .in("status", ACTIVE_STATUSES)
        .order("next_call_scheduled_at", { ascending: true })
        .limit(8);
      if (error) throw error;
      setCallbackLeads(data ?? []);
      setCallbackError(null);
    } catch (err) {
      console.error("[Today] callbacks error:", err);
      setCallbackError("Failed to load today's callbacks");
    }

    // Stalled dispo
    try {
      const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("leads") as any)
        .select("id, source, notes, updated_at, properties(address, city, owner_name)")
        .eq("status", "disposition")
        .lt("updated_at", twoDaysAgo)
        .order("updated_at", { ascending: true })
        .limit(5);
      if (error) throw error;
      setStalledDeals(data ?? []);
      setStalledError(null);
    } catch (err) {
      console.error("[Today] stalled dispo error:", err);
      setStalledError("Failed to load stalled dispo items");
    }

    // Review blockers
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("review_queue") as any)
        .select("id, entity_type, status, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(5);
      if (error) throw error;
      setReviewBlockers(data ?? []);
      setReviewError(null);
    } catch (err) {
      console.error("[Today] review error:", err);
      setReviewError("Failed to load review queue");
    }

    // Unlinked calls
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("call_sessions") as any)
        .select("id, phone_dialed, started_at, duration_sec, direction, ai_summary")
        .is("lead_id", null)
        .eq("status", "ended")
        .order("started_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      setUnlinkedCalls(data ?? []);
      setUnlinkedError(null);
    } catch (err) {
      console.error("[Today] unlinked calls error:", err);
      setUnlinkedError("Failed to load unlinked calls");
    }

    // Unified tasks — all pending tasks with lead context
    try {
      const { data: { session: sess } } = await supabase.auth.getSession();
      const hdrs: Record<string, string> = sess?.access_token
        ? { Authorization: `Bearer ${sess.access_token}` }
        : {};
      const res = await fetch("/api/tasks?status=pending&view=all", { headers: hdrs });
      if (res.ok) {
        const json = await res.json();
        setAllTasks(json.tasks ?? []);
      }
      setTasksError(null);
    } catch (err) {
      console.error("[Today] tasks error:", err);
      setTasksError("Failed to load tasks");
    }

    setLoading(false);
  }, [currentUser?.id]);

  useEffect(() => {
    fetchAll();

    const channel = supabase
      .channel("today_brief_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "calls_log" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "review_queue" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => fetchAll())
      .subscribe();

    channelRef.current = channel;
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [fetchAll]);

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl bg-muted/40" />
          ))}
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-xl bg-muted/40" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Status strip */}
      {statsError ? (
        <SectionErrorBanner message={statsError} />
      ) : stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatPill
            icon={AlertTriangle}
            label="Overdue"
            value={stats.overdue}
            color={stats.overdue > 0 ? "text-red-400" : "text-muted-foreground"}
          />
          <StatPill
            icon={Inbox}
            label="New Inbound"
            value={stats.newInbound}
            color={stats.newInbound > 0 ? "text-amber-400" : "text-muted-foreground"}
          />
          <StatPill
            icon={CalendarCheck}
            label="Due Today"
            value={stats.dueToday}
            color={stats.dueToday > 0 ? "text-amber-400" : "text-muted-foreground"}
          />
          <StatPill
            icon={PhoneCall}
            label="Calls Today"
            value={stats.callsToday}
            color="text-primary"
          />
        </div>
      )}

      {/* 0. Unified Tasks */}
      {tasksError ? (
        <SectionErrorBanner message={tasksError} />
      ) : (() => {
        const now = new Date();
        const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);

        const filtered = filterUser === "all"
          ? allTasks
          : allTasks.filter((t) => t.assigned_to === filterUser);

        const overdueTasks = filtered.filter((t) => t.due_at && new Date(t.due_at) < todayStart);
        const todayTasks = filtered.filter((t) => t.due_at && new Date(t.due_at) >= todayStart && new Date(t.due_at) <= todayEnd);
        const upcomingTasks = filtered.filter((t) => t.due_at && new Date(t.due_at) > todayEnd);
        const noDueTasks = filtered.filter((t) => !t.due_at);
        const totalCount = filtered.length;

        const COMPLETION_REASONS = ["Called", "Texted", "Rescheduled", "Not needed"] as const;

        const handleCompleteTask = async (taskId: string, reason: string) => {
          setCompletingId(taskId);
          try {
            const { data: { session: sess } } = await supabase.auth.getSession();
            const hdrs: Record<string, string> = sess?.access_token
              ? { Authorization: `Bearer ${sess.access_token}`, "Content-Type": "application/json" }
              : { "Content-Type": "application/json" };
            await fetch(`/api/tasks/${taskId}`, {
              method: "PATCH",
              headers: hdrs,
              body: JSON.stringify({ status: "completed", notes: `[Completed: ${reason}]` }),
            });
            setCompletingReasonId(null);
            fetchAll();
          } catch { /* retry on next poll */ } finally {
            setCompletingId(null);
          }
        };

        const lastCallLabel = (task: DashTask) => {
          if (!task.last_call_date) return null;
          const dispo = task.last_call_disposition ?? "call";
          const ago = timeAgo(task.last_call_date);
          const snippet = task.last_call_notes ? ` — ${task.last_call_notes.slice(0, 60)}` : "";
          return `Last: ${dispo} ${ago}${snippet}`;
        };

        const TaskRow = ({ task }: { task: DashTask }) => {
          const dueDiff = task.due_at ? daysDiff(task.due_at) : null;
          const dotColor = dueDiff !== null
            ? dueDiff < 0 ? "bg-red-500" : dueDiff === 0 ? "bg-amber-400" : "bg-emerald-500"
            : "bg-muted-foreground/40";
          const dueLabel = task.due_at
            ? dueDiff !== null
              ? dueDiff < -1 ? `${Math.abs(dueDiff)} days overdue`
              : dueDiff === -1 ? "Yesterday"
              : dueDiff === 0 ? new Date(task.due_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
              : dueDiff === 1 ? "Tomorrow"
              : `In ${dueDiff} days`
            : ""
            : "No date";

          const primaryLabel = task.lead_owner || task.title;
          const secondaryParts = [
            task.lead_address,
            task.lead_owner ? task.title : null,
          ].filter(Boolean).join(" · ");
          const callContext = lastCallLabel(task);
          const showReasonPicker = completingReasonId === task.id;

          return (
            <div className="group flex items-start gap-2.5 py-2 px-1 hover:bg-overlay-4 rounded-lg transition-colors">
              <div className={cn("mt-1.5 h-2 w-2 rounded-full shrink-0", dotColor)} />
              <div className="flex-1 min-w-0">
                <button
                  onClick={() => task.lead_id ? openModal("client-file", { leadId: task.lead_id }) : null}
                  className={cn(
                    "text-sm text-foreground/90 font-medium truncate block text-left",
                    task.lead_id ? "hover:text-primary cursor-pointer" : "cursor-default"
                  )}
                >
                  {primaryLabel}
                </button>
                {secondaryParts && (
                  <p className="text-xs text-muted-foreground/50 mt-0.5 truncate">
                    {secondaryParts}
                    {task.lead_status && <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 ml-1.5">{task.lead_status}</Badge>}
                  </p>
                )}
                {callContext && (
                  <p className="text-[11px] text-muted-foreground/40 mt-0.5 truncate italic">
                    {callContext}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground/50">{dueLabel}</span>
                {task.lead_phone && !showReasonPicker && (
                  <button
                    onClick={() => {
                      if (task.lead_id) openModal("client-file", { leadId: task.lead_id });
                    }}
                    className="hidden group-hover:flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20"
                  >
                    <Phone className="h-2.5 w-2.5" /> Call
                  </button>
                )}
                {showReasonPicker ? (
                  <div className="flex items-center gap-1 flex-wrap">
                    {COMPLETION_REASONS.map((reason) => (
                      <button
                        key={reason}
                        onClick={() => handleCompleteTask(task.id, reason)}
                        disabled={completingId === task.id}
                        className="px-2 py-0.5 rounded text-[10px] font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 disabled:opacity-40"
                      >
                        {completingId === task.id ? "..." : reason}
                      </button>
                    ))}
                    <button
                      onClick={() => setCompletingReasonId(null)}
                      className="px-1.5 py-0.5 rounded text-[10px] text-muted-foreground/50 hover:text-foreground/70"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setCompletingReasonId(task.id)}
                    className="hidden group-hover:flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20"
                  >
                    <CheckCircle2 className="h-2.5 w-2.5" /> Done
                  </button>
                )}
              </div>
            </div>
          );
        };

        return (
          <Card className="border-overlay-8">
            <CardHeader className="pb-2 flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Pin className="h-4 w-4 text-primary" /> Today&apos;s Tasks
                <Badge variant="outline" className="ml-1">{totalCount}</Badge>
              </CardTitle>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setFilterUser("all")}
                  className={cn("px-2 py-0.5 rounded text-[11px] font-medium border transition-colors",
                    filterUser === "all" ? "border-primary/40 bg-primary/15 text-primary" : "border-overlay-6 text-muted-foreground/50 hover:text-foreground/70")}
                >
                  All
                </button>
                {currentUser?.id && (
                  <button
                    onClick={() => setFilterUser(currentUser.id)}
                    className={cn("px-2 py-0.5 rounded text-[11px] font-medium border transition-colors",
                      filterUser === currentUser.id ? "border-primary/40 bg-primary/15 text-primary" : "border-overlay-6 text-muted-foreground/50 hover:text-foreground/70")}
                  >
                    Mine
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-1 pt-0">
              {totalCount === 0 && (
                <EmptySection icon={CheckCircle2} message="No pending tasks" />
              )}
              {overdueTasks.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-red-400 font-semibold mb-1 mt-1">Overdue ({overdueTasks.length})</p>
                  {overdueTasks.map((t) => <TaskRow key={t.id} task={t} />)}
                </div>
              )}
              {todayTasks.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-amber-400 font-semibold mb-1 mt-2">Due Today ({todayTasks.length})</p>
                  {todayTasks.map((t) => <TaskRow key={t.id} task={t} />)}
                </div>
              )}
              {upcomingTasks.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/40 font-semibold mb-1 mt-2">Upcoming ({upcomingTasks.length})</p>
                  {upcomingTasks.map((t) => <TaskRow key={t.id} task={t} />)}
                </div>
              )}
              {noDueTasks.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/40 font-semibold mb-1 mt-2">No Date ({noDueTasks.length})</p>
                  {noDueTasks.map((t) => <TaskRow key={t.id} task={t} />)}
                </div>
              )}
              {totalCount > 0 && (
                <a href="/tasks" className="flex items-center justify-center gap-1 text-sm text-primary hover:text-primary/80 pt-2 transition-colors">
                  View all tasks <ArrowRight className="h-3 w-3" />
                </a>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* 1. Overdue follow-ups */}
      <BriefSection
        icon={AlertTriangle}
        title="Overdue Follow-ups"
        iconColor="text-red-400"
        error={overdueError}
        count={overdueLeads.length}
        emptyMessage="No overdue follow-ups"
        emptyIcon={CheckCircle2}
      >
        {overdueLeads.map((lead) => (
          <LeadRow key={lead.id} lead={lead} />
        ))}
        {overdueLeads.length > 0 && (
          <a
            href="/leads?filter=overdue"
            className="flex items-center justify-center gap-1 text-sm text-primary hover:text-primary/80 pt-1 transition-colors"
          >
            View all overdue in Lead Queue <ArrowRight className="h-3 w-3" />
          </a>
        )}
      </BriefSection>

      {/* 2. New inbound / awaiting first contact */}
      <BriefSection
        icon={Inbox}
        title="New Inbound — Awaiting First Contact"
        iconColor="text-amber-400"
        error={inboundError}
        count={inboundLeads.length}
        emptyMessage="No new inbound leads in the last 48 hours"
        emptyIcon={CheckCircle2}
      >
        {inboundLeads.map((lead) => (
          <LeadRow key={lead.id} lead={lead} showAge />
        ))}
        {inboundLeads.length > 0 && (
          <a
            href="/leads?filter=new_inbound"
            className="flex items-center justify-center gap-1 text-sm text-primary hover:text-primary/80 pt-1 transition-colors"
          >
            View all new inbound <ArrowRight className="h-3 w-3" />
          </a>
        )}
      </BriefSection>

      {/* 3. Top call-now leads */}
      <BriefSection
        icon={Phone}
        title="Priority Call Queue"
        iconColor="text-primary"
        error={callNowError}
        count={callNowLeads.length}
        emptyMessage="No active leads with a pending action"
        emptyIcon={Activity}
      >
        {callNowLeads.map((lead) => (
          <LeadRow key={lead.id} lead={lead} showScore />
        ))}
        {callNowLeads.length > 0 && (
          <a
            href="/leads"
            className="flex items-center justify-center gap-1 text-sm text-primary hover:text-primary/80 pt-1 transition-colors"
          >
            Full Lead Queue <ArrowRight className="h-3 w-3" />
          </a>
        )}
      </BriefSection>

      {/* 4. Today's callbacks */}
      <BriefSection
        icon={CalendarCheck}
        title="Today's Callbacks"
        iconColor="text-emerald-400"
        error={callbackError}
        count={callbackLeads.length}
        emptyMessage="No callbacks scheduled for today"
        emptyIcon={CalendarCheck}
      >
        {callbackLeads.map((lead) => {
          const time = lead.next_call_scheduled_at
            ? new Date(lead.next_call_scheduled_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
            : null;
          return (
            <div key={lead.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-overlay-3 transition-colors group">
              <div className="h-2.5 w-2.5 rounded-full shrink-0 bg-emerald-500" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{leadLabel(lead)}</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {time ? `Callback at ${time}` : lead.next_action || "Follow up"}
                </p>
              </div>
              <Button
                size="sm"
                className="h-7 text-sm gap-1 opacity-70 group-hover:opacity-100 transition-opacity"
                onClick={() => { window.location.href = `/leads?open=${lead.id}`; }}
              >
                <Phone className="h-3 w-3" />
                Open
              </Button>
            </div>
          );
        })}
      </BriefSection>

      {/* 5. Stalled dispo blockers */}
      <BriefSection
        icon={Ban}
        title="Stalled Dispo"
        iconColor="text-amber-400"
        error={stalledError}
        count={stalledDeals.length}
        emptyMessage="No stalled dispo items"
        emptyIcon={CheckCircle2}
      >
        {stalledDeals.map((deal) => {
          const daysStalled = Math.floor((Date.now() - new Date(deal.updated_at).getTime()) / 86400000);
          const dealProp = Array.isArray(deal.properties) ? deal.properties[0] : deal.properties;
          const label = dealProp?.address
            ? `${dealProp.address}${dealProp.city ? `, ${dealProp.city}` : ""}`
            : dealProp?.owner_name ?? deal.source ?? `Lead ${deal.id.slice(0, 8)}`;
          return (
            <button
              key={deal.id}
              onClick={() => { window.location.href = `/leads?open=${deal.id}`; }}
              className="w-full flex items-center justify-between text-left p-2.5 rounded-lg hover:bg-overlay-3 transition-colors"
            >
              <p className="text-sm font-medium truncate">{label}</p>
              <Badge variant="outline" className="text-sm border-amber-500/30 text-amber-400 shrink-0 ml-2">
                {daysStalled}d stalled
              </Badge>
            </button>
          );
        })}
      </BriefSection>

      {/* 6. Review blockers */}
      <BriefSection
        icon={ShieldAlert}
        title="Review Blockers"
        iconColor="text-violet-400"
        error={reviewError}
        count={reviewBlockers.length}
        emptyMessage="No pending review items"
        emptyIcon={CheckCircle2}
      >
        {reviewBlockers.map((item) => (
          <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-overlay-3 transition-colors">
            <div className="h-2.5 w-2.5 rounded-full shrink-0 bg-violet-500" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{item.entity_type ?? "Review item"}</p>
              <p className="text-sm text-muted-foreground">{timeAgo(item.created_at)}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-sm opacity-70 hover:opacity-100"
              onClick={() => { window.location.href = "/dialer/review/dossier-queue"; }}
            >
              Review
            </Button>
          </div>
        ))}
      </BriefSection>

      {/* Unlinked Calls */}
      {(unlinkedCalls.length > 0 || unlinkedError) && (
        <BriefSection
          icon={PhoneIncoming}
          iconColor="text-muted-foreground"
          title="Unlinked Calls"
          error={unlinkedError}
          count={unlinkedCalls.length}
          emptyMessage="No unlinked calls"
          emptyIcon={CheckCircle2}
        >
          {unlinkedCalls.map((call) => (
            <UnlinkedCallRow key={call.id} call={call} onAction={fetchAll} />
          ))}
        </BriefSection>
      )}
    </div>
  );
}

function StatPill({ icon: Icon, label, value, color }: {
  icon: typeof AlertTriangle;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <Card className="bg-muted/40 border-border/40">
      <CardContent className="flex items-center gap-3 p-3">
        <Icon className={cn("h-4 w-4 shrink-0", color)} />
        <div>
          <p className={cn("text-xl font-bold leading-none tabular-nums", color)}>{value}</p>
          <p className="text-sm text-muted-foreground mt-0.5">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function BriefSection({ icon: Icon, title, iconColor, error, count, emptyMessage, emptyIcon, children }: {
  icon: typeof AlertTriangle;
  title: string;
  iconColor: string;
  error: SectionError;
  count: number;
  emptyMessage: string;
  emptyIcon: typeof CheckCircle2;
  children: React.ReactNode;
}) {
  return (
    <Card className="bg-muted/40 border-border/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Icon className={cn("h-4 w-4", iconColor)} />
          {title}
          {!error && count > 0 && (
            <Badge variant="outline" className="ml-auto text-sm tabular-nums border-border/40">
              {count}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {error ? (
          <SectionErrorBanner message={error} />
        ) : count === 0 ? (
          <EmptySection icon={emptyIcon} message={emptyMessage} />
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

function LeadRow({ lead, showScore, showAge }: { lead: PriorityLead; showScore?: boolean; showAge?: boolean }) {
  const diff = daysDiff(effectiveDueDate(lead));
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-overlay-3 transition-colors group">
      <div className={cn("h-2.5 w-2.5 rounded-full shrink-0", urgencyDotColor(diff))} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{leadLabel(lead)}</p>
        <p className={cn(
          "text-sm mt-0.5",
          diff !== null && diff < 0 ? "text-red-400" : "text-muted-foreground"
        )}>
          {showAge ? `${lead.source ?? "Unknown source"} — ${timeAgo(lead.created_at)}` : urgencyText(lead)}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {showScore && lead.priority !== null && (
          <Badge
            variant="outline"
            className={cn(
              "text-sm font-mono tabular-nums",
              lead.priority >= 80 ? "border-red-500/30 text-red-400" :
              lead.priority >= 60 ? "border-amber-500/30 text-amber-400" :
              "border-border text-muted-foreground"
            )}
          >
            {lead.priority}
          </Badge>
        )}
        <Button
          size="sm"
          className="h-7 text-sm gap-1 opacity-70 group-hover:opacity-100 transition-opacity"
          onClick={() => { window.location.href = `/leads?open=${lead.id}`; }}
        >
          <Phone className="h-3 w-3" />
          Open
        </Button>
      </div>
    </div>
  );
}

function UnlinkedCallRow({ call, onAction }: { call: UnlinkedCall; onAction: () => void }) {
  const [deleting, setDeleting] = useState(false);

  const formatPhone = (p: string | null) => {
    if (!p) return "Unknown";
    const d = p.replace(/\D/g, "").slice(-10);
    if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    return p;
  };

  const formatDuration = (sec: number | null) => {
    if (!sec) return "0:00";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this call and its notes? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
      const res = await fetch(`/api/dialer/v1/sessions/${call.id}`, { method: "DELETE", headers });
      if (!res.ok) throw new Error("Delete failed");
      onAction();
    } catch {
      setDeleting(false);
    }
  };

  const started = new Date(call.started_at);
  const timeStr = started.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const dateStr = started.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-overlay-3 transition-colors group">
      <div className="h-2.5 w-2.5 rounded-full shrink-0 bg-muted-foreground/30 mt-1.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold">{formatPhone(call.phone_dialed)}</span>
          <span className="text-muted-foreground/50">·</span>
          <span className="text-muted-foreground/60">{dateStr} {timeStr}</span>
          <span className="text-muted-foreground/50">·</span>
          <span className="text-muted-foreground/60">{formatDuration(call.duration_sec)}</span>
          {call.direction && (
            <>
              <span className="text-muted-foreground/50">·</span>
              <span className="text-muted-foreground/60 capitalize">{call.direction}</span>
            </>
          )}
        </div>
        {call.ai_summary && (
          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{call.ai_summary}</p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0 opacity-50 group-hover:opacity-100 transition-opacity">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1"
          onClick={() => { window.location.href = `/leads?phone=${call.phone_dialed ?? ""}`; }}
        >
          <Link2 className="h-3 w-3" />
          Link
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-muted-foreground/50 hover:text-red-400"
          onClick={handleDelete}
          disabled={deleting}
        >
          {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
        </Button>
      </div>
    </div>
  );
}

export { TodayView as DashboardGrid };
