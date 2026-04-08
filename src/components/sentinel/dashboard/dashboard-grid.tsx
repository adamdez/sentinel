"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Inbox,
  Loader2,
  MapPin,
  Phone,
  PhoneCall,
  ShieldAlert,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { useSentinelStore } from "@/lib/store";
import { useModal } from "@/providers/modal-provider";
import { cn } from "@/lib/utils";

type SectionError = string | null;

interface DashTask {
  id: string;
  title: string;
  due_at: string | null;
  task_type: string;
  lead_id: string | null;
  lead_address?: string | null;
  lead_owner?: string | null;
  lead_phone?: string | null;
  lead_status?: string | null;
  dial_queue_active?: boolean;
  last_call_date?: string | null;
  last_call_disposition?: string | null;
  last_call_notes?: string | null;
  assigned_to: string | null;
  assigned_to_name?: string | null;
  notes: string | null;
}

interface BriefLead {
  id: string;
  next_action_due_at: string | null;
  next_action: string | null;
  created_at: string;
  source: string | null;
  properties: { address: string | null; city: string | null; owner_name: string | null } | null;
}

interface ReviewBlocker {
  id: string;
  entity_type: string | null;
  created_at: string;
}

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function dueBucket(dueAt: string | null): "overdue" | "today" | "upcoming" | "none" {
  if (!dueAt) return "none";
  const { start, end } = todayRange();
  const due = new Date(dueAt);
  if (due < start) return "overdue";
  if (due <= end) return "today";
  return "upcoming";
}

function dueLabel(dueAt: string | null) {
  if (!dueAt) return "No due date";
  const bucket = dueBucket(dueAt);
  const due = new Date(dueAt);
  if (bucket === "overdue") {
    const days = Math.max(1, Math.floor((Date.now() - due.getTime()) / 86400000));
    return days === 1 ? "1 day overdue" : `${days} days overdue`;
  }
  if (bucket === "today") return `Today ${due.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  return due.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ago(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function callbackTask(task: DashTask) {
  const type = (task.task_type ?? "").toLowerCase();
  const title = task.title.toLowerCase();
  return type === "callback" || type === "call_back" || title.includes("callback") || title.includes("call back") || title.includes("return call");
}

function taskTitle(task: DashTask) {
  if (task.lead_owner && task.lead_owner !== "Unknown Owner") {
    return task.lead_address ? `${task.lead_owner} — ${task.lead_address}` : task.lead_owner;
  }
  return task.lead_address ?? task.title;
}

function leadTitle(lead: BriefLead) {
  if (lead.properties?.owner_name && lead.properties.owner_name !== "Unknown Owner") {
    return lead.properties.address ? `${lead.properties.owner_name} — ${lead.properties.address}` : lead.properties.owner_name;
  }
  if (lead.properties?.address) return lead.properties.address;
  return lead.source ?? `Lead ${lead.id.slice(0, 8)}`;
}

function cut(text: string, limit = 96) {
  return text.length <= limit ? { text, truncated: false } : { text: `${text.slice(0, limit).trimEnd()}...`, truncated: true };
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
      <ShieldAlert className="h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function Empty({ icon: Icon, message }: { icon: typeof CheckCircle2; message: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
      <Icon className="h-4 w-4" />
      <span>{message}</span>
    </div>
  );
}

function Stat({ icon: Icon, label, value, color }: { icon: typeof AlertTriangle; label: string; value: number; color: string }) {
  return (
    <Card className="border-border/40 bg-muted/40">
      <CardContent className="flex items-center gap-3 p-3">
        <Icon className={cn("h-4 w-4 shrink-0", color)} />
        <div>
          <p className={cn("text-xl font-bold leading-none", color)}>{value}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Section({
  icon: Icon,
  title,
  iconColor,
  count,
  actions,
  children,
}: {
  icon: typeof AlertTriangle;
  title: string;
  iconColor: string;
  count?: number;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-border/40 bg-muted/40">
      <CardHeader className="flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Icon className={cn("h-4 w-4", iconColor)} />
          <span>{title}</span>
          {typeof count === "number" && <Badge variant="outline">{count}</Badge>}
        </CardTitle>
        {actions}
      </CardHeader>
      <CardContent className="space-y-2 pt-0">{children}</CardContent>
    </Card>
  );
}

export function DashboardGrid() {
  const { currentUser } = useSentinelStore();
  const { openModal } = useModal();
  const [loading, setLoading] = useState(true);
  const [tasksError, setTasksError] = useState<SectionError>(null);
  const [driveByError, setDriveByError] = useState<SectionError>(null);
  const [inboundError, setInboundError] = useState<SectionError>(null);
  const [opsError, setOpsError] = useState<SectionError>(null);
  const [allTasks, setAllTasks] = useState<DashTask[]>([]);
  const [driveByLeads, setDriveByLeads] = useState<BriefLead[]>([]);
  const [inboundLeads, setInboundLeads] = useState<BriefLead[]>([]);
  const [stalledDeals, setStalledDeals] = useState<BriefLead[]>([]);
  const [reviewBlockers, setReviewBlockers] = useState<ReviewBlocker[]>([]);
  const [teamExpanded, setTeamExpanded] = useState(false);
  const [opsExpanded, setOpsExpanded] = useState(false);
  const [selectedCallbacks, setSelectedCallbacks] = useState<string[]>([]);
  const [queueingLeadIds, setQueueingLeadIds] = useState<string[]>([]);
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchAll = useCallback(async () => {
    const { end } = todayRange();
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
      const res = await fetch("/api/tasks?status=pending&view=all", { headers });
      if (!res.ok) throw new Error("Failed to load tasks");
      const json = await res.json();
      setAllTasks(json.tasks ?? []);
      setTasksError(null);
    } catch (err) {
      console.error("[Today] tasks error:", err);
      setAllTasks([]);
      setTasksError("Failed to load tasks");
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase.from("leads") as any)
        .select("id, next_action_due_at, next_action, created_at, source, properties(address, city, owner_name)")
        .ilike("next_action", "drive by%")
        .not("status", "in", '(\"dead\",\"closed\")')
        .lte("next_action_due_at", end.toISOString())
        .order("next_action_due_at", { ascending: true })
        .limit(8);
      if (currentUser?.id) query = query.eq("assigned_to", currentUser.id);
      const { data, error } = await query;
      if (error) throw error;
      setDriveByLeads(data ?? []);
      setDriveByError(null);
    } catch (err) {
      console.error("[Today] drive by error:", err);
      setDriveByLeads([]);
      setDriveByError("Failed to load drive-by work");
    }

    try {
      const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("leads") as any)
        .select("id, next_action_due_at, next_action, created_at, source, properties(address, city, owner_name)")
        .in("status", ["staging", "prospect"])
        .gte("created_at", twoDaysAgo)
        .not("source", "like", "csv:%")
        .not("source", "like", "crawl%")
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      setInboundLeads(data ?? []);
      setInboundError(null);
    } catch (err) {
      console.error("[Today] inbound error:", err);
      setInboundLeads([]);
      setInboundError("Failed to load new inbound");
    }

    try {
      const stalledBefore = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stalledPromise = (supabase.from("leads") as any)
        .select("id, next_action_due_at, next_action, created_at, source, properties(address, city, owner_name)")
        .eq("status", "disposition")
        .lt("updated_at", stalledBefore)
        .order("updated_at", { ascending: true })
        .limit(5);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const reviewPromise = (supabase.from("review_queue") as any)
        .select("id, entity_type, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(5);
      const [{ data: stalled, error: stalledError }, { data: reviews, error: reviewError }] = await Promise.all([stalledPromise, reviewPromise]);
      if (stalledError) throw stalledError;
      if (reviewError) throw reviewError;
      setStalledDeals(stalled ?? []);
      setReviewBlockers(reviews ?? []);
      setOpsError(null);
    } catch (err) {
      console.error("[Today] ops error:", err);
      setStalledDeals([]);
      setReviewBlockers([]);
      setOpsError("Failed to load ops exceptions");
    }

    setLoading(false);
  }, [currentUser?.id]);

  useEffect(() => {
    setLoading(true);
    fetchAll();
    const channel = supabase
      .channel("today_command_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "calls_log" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "review_queue" }, () => fetchAll())
      .subscribe();
    channelRef.current = channel;
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [fetchAll]);

  const myTasks = useMemo(() => allTasks.filter((task) => task.assigned_to === currentUser?.id), [allTasks, currentUser?.id]);
  const myCallbacks = useMemo(() => myTasks.filter((task) => callbackTask(task) && ["overdue", "today"].includes(dueBucket(task.due_at))), [myTasks]);
  const myActionTasks = useMemo(() => myTasks.filter((task) => !callbackTask(task) && ["overdue", "today"].includes(dueBucket(task.due_at))), [myTasks]);
  const teamGroups = useMemo(() => {
    const groups: Record<string, { name: string; tasks: DashTask[] }> = {};
    for (const task of allTasks) {
      if (task.assigned_to === currentUser?.id) continue;
      if (!["overdue", "today"].includes(dueBucket(task.due_at))) continue;
      const key = task.assigned_to ?? "unassigned";
      if (!groups[key]) groups[key] = { name: task.assigned_to_name ?? "Unassigned", tasks: [] };
      groups[key].tasks.push(task);
    }
    return Object.values(groups).sort((a, b) => a.name.localeCompare(b.name));
  }, [allTasks, currentUser?.id]);

  useEffect(() => {
    const validIds = new Set(myCallbacks.map((task) => task.id));
    setSelectedCallbacks((prev) => prev.filter((id) => validIds.has(id)));
  }, [myCallbacks]);

  const toggleNote = useCallback((key: string) => {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const openLead = useCallback((leadId: string | null) => {
    if (!leadId) return;
    openModal("client-file", { leadId });
  }, [openModal]);

  const queueTasks = useCallback(async (tasks: DashTask[]) => {
    const leadIds = [...new Set(tasks.map((task) => task.lead_id).filter((value): value is string => typeof value === "string" && value.length > 0))];
    if (leadIds.length === 0) {
      toast.error("No lead is attached to those callbacks.");
      return;
    }
    setQueueingLeadIds((prev) => [...new Set([...prev, ...leadIds])]);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch("/api/dialer/v1/dial-queue", {
        method: "POST",
        headers,
        body: JSON.stringify({ leadIds }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json?.error === "string" ? json.error : "Failed to queue callbacks");
      const queued = Array.isArray(json?.queuedIds) ? json.queuedIds.length : 0;
      const conflicted = Array.isArray(json?.conflictedIds) ? json.conflictedIds.length : 0;
      if (queued > 0) toast.success(`${queued} callback${queued === 1 ? "" : "s"} queued to dialer.`);
      if (conflicted > 0) toast.error(`${conflicted} lead${conflicted === 1 ? "" : "s"} could not be queued because they belong to another operator.`);
      setSelectedCallbacks([]);
      await fetchAll();
    } catch (err) {
      console.error("[Today] queue callbacks error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to queue callbacks");
    } finally {
      setQueueingLeadIds((prev) => prev.filter((leadId) => !leadIds.includes(leadId)));
    }
  }, [fetchAll]);

  const queueSelected = useMemo(() => myCallbacks.filter((task) => selectedCallbacks.includes(task.id)), [myCallbacks, selectedCallbacks]);

  const renderNote = (rowId: string, kind: "last" | "todo", label: string, text: string | null) => {
    if (!text) return null;
    const key = `${rowId}:${kind}`;
    const display = expandedNotes.has(key) ? { text, truncated: false } : cut(text);
    return (
      <p className="text-[11px] text-muted-foreground/55">
        <span className="font-medium text-muted-foreground/75">{label}: </span>
        {display.text}
        {(display.truncated || text.length > 96) && (
          <button type="button" onClick={() => toggleNote(key)} className="ml-1 text-primary hover:text-primary/80">
            {expandedNotes.has(key) ? "less" : "more"}
          </button>
        )}
      </p>
    );
  };

  const renderTaskRow = (task: DashTask, options?: { selectable?: boolean; showAssignee?: boolean }) => {
    const lastCall = task.last_call_date
      ? `${task.last_call_disposition ?? "call"} ${ago(task.last_call_date)}${task.last_call_notes ? ` — ${task.last_call_notes}` : ""}`
      : null;
    const inQueue = task.dial_queue_active === true;
    const queueing = task.lead_id ? queueingLeadIds.includes(task.lead_id) : false;

    return (
      <div key={task.id} className="rounded-lg border border-border/30 bg-background/30 p-3">
        <div className="flex items-start gap-3">
          {options?.selectable ? (
            <input
              type="checkbox"
              checked={selectedCallbacks.includes(task.id)}
              onChange={() => setSelectedCallbacks((prev) => prev.includes(task.id) ? prev.filter((id) => id !== task.id) : [...prev, task.id])}
              disabled={!task.lead_id}
              className="mt-1 h-4 w-4 rounded border-border/50 bg-background"
            />
          ) : (
            <span className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", dueBucket(task.due_at) === "overdue" ? "bg-red-500" : "bg-amber-400")} />
          )}
          <div className="min-w-0 flex-1">
            <button onClick={() => openLead(task.lead_id)} className="block text-left text-sm font-semibold text-foreground hover:text-primary">
              {taskTitle(task)}
            </button>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {dueLabel(task.due_at)} · {task.title}
              {task.lead_phone ? ` · ${task.lead_phone}` : " · No phone"}
            </p>
            {options?.showAssignee && task.assigned_to_name && (
              <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground/55">{task.assigned_to_name}</p>
            )}
            {renderNote(task.id, "last", "Last call", lastCall)}
            {renderNote(task.id, "todo", "Todo", task.notes)}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {callbackTask(task) && (
              inQueue ? (
                <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/10">In Dial Queue</Badge>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void queueTasks([task])}
                  disabled={!task.lead_id || queueing}
                  className="h-8 gap-1 text-xs"
                >
                  {queueing ? <Loader2 className="h-3 w-3 animate-spin" /> : <PhoneCall className="h-3 w-3" />}
                  Queue
                </Button>
              )
            )}
            <Button size="sm" onClick={() => openLead(task.lead_id)} className="h-8 gap-1 text-xs">
              <Phone className="h-3 w-3" />
              Open
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const renderLeadRow = (lead: BriefLead, actionLabel: string, onAction: () => void, subtitle: string) => (
    <div key={lead.id} className="flex items-center gap-3 rounded-lg border border-border/30 bg-background/30 p-3">
      <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-400" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{leadTitle(lead)}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <Button size="sm" className="h-8 gap-1 text-xs" onClick={onAction}>
        <ArrowRight className="h-3 w-3" />
        {actionLabel}
      </Button>
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl bg-muted/40" />)}
        </div>
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-xl bg-muted/40" />)}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {tasksError && <ErrorBanner message={tasksError} />}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={AlertTriangle} label="My Overdue" value={myTasks.filter((task) => dueBucket(task.due_at) === "overdue").length} color={myTasks.some((task) => dueBucket(task.due_at) === "overdue") ? "text-red-400" : "text-muted-foreground"} />
        <Stat icon={CalendarCheck} label="My Due Today" value={myTasks.filter((task) => dueBucket(task.due_at) === "today").length} color={myTasks.some((task) => dueBucket(task.due_at) === "today") ? "text-amber-400" : "text-muted-foreground"} />
        <Stat icon={PhoneCall} label="My Callbacks Ready" value={myCallbacks.length} color={myCallbacks.length > 0 ? "text-primary" : "text-muted-foreground"} />
        <Stat icon={MapPin} label="My Drive By" value={driveByLeads.length} color={driveByLeads.length > 0 ? "text-amber-400" : "text-muted-foreground"} />
      </div>

      <Section
        icon={PhoneCall}
        title="My Callbacks Ready"
        iconColor="text-primary"
        count={myCallbacks.length}
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { window.location.href = "/dialer"; }}>
              Open Dialer
            </Button>
            <Button size="sm" className="h-8 gap-1 text-xs" disabled={queueSelected.length === 0} onClick={() => void queueTasks(queueSelected)}>
              <PhoneCall className="h-3 w-3" />
              Queue Selected to Dialer
            </Button>
          </div>
        }
      >
        {myCallbacks.length === 0 ? <Empty icon={CheckCircle2} message="No callbacks are ready right now." /> : myCallbacks.map((task) => renderTaskRow(task, { selectable: true }))}
      </Section>

      <Section icon={Clock} title="My Tasks Today" iconColor="text-amber-400" count={myActionTasks.length}>
        {myActionTasks.length === 0 ? <Empty icon={CheckCircle2} message="No non-call tasks are due today." /> : myActionTasks.map((task) => renderTaskRow(task))}
      </Section>

      <Section
        icon={Users}
        title="Team Radar"
        iconColor="text-muted-foreground"
        count={teamGroups.reduce((sum, group) => sum + group.tasks.length, 0)}
        actions={
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => setTeamExpanded((value) => !value)}>
            {teamExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {teamExpanded ? "Hide Team" : "Show Team"}
          </Button>
        }
      >
        {!teamExpanded ? (
          <p className="text-sm text-muted-foreground">Your own callbacks and follow-ups stay first. Open Team Radar when you want to see who else is carrying overdue or due-today work.</p>
        ) : teamGroups.length === 0 ? (
          <Empty icon={CheckCircle2} message="No team tasks are overdue or due today." />
        ) : (
          <div className="space-y-3">
            {teamGroups.map((group) => (
              <div key={group.name} className="space-y-2">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{group.name}</p>
                  <Badge variant="outline">{group.tasks.length}</Badge>
                </div>
                {group.tasks.map((task) => renderTaskRow(task, { showAssignee: true }))}
              </div>
            ))}
          </div>
        )}
      </Section>

      <div className="grid gap-5 xl:grid-cols-2">
        <Section icon={MapPin} title="Drive By" iconColor="text-amber-400" count={driveByLeads.length}>
          {driveByError ? <ErrorBanner message={driveByError} /> : driveByLeads.length === 0 ? <Empty icon={CheckCircle2} message="No drive-bys are due for you today." /> : (
            <>
              {driveByLeads.map((lead) => renderLeadRow(lead, "Drive By", () => { window.location.href = "/drive-by"; }, lead.next_action_due_at ? dueLabel(lead.next_action_due_at) : "Drive-by queued"))}
              <a href="/drive-by" className="flex items-center justify-center gap-1 pt-1 text-sm text-primary transition-colors hover:text-primary/80">Full Drive By board <ArrowRight className="h-3 w-3" /></a>
            </>
          )}
        </Section>

        <Section icon={Inbox} title="New Inbound" iconColor="text-amber-400" count={inboundLeads.length}>
          {inboundError ? <ErrorBanner message={inboundError} /> : inboundLeads.length === 0 ? <Empty icon={CheckCircle2} message="No fresh inbound leads in the last 48 hours." /> : (
            <>
              {inboundLeads.map((lead) => renderLeadRow(lead, "Open", () => openLead(lead.id), `${ago(lead.created_at)} · ${lead.source ?? "Inbound"}`))}
              <a href="/leads?filter=new_inbound" className="flex items-center justify-center gap-1 pt-1 text-sm text-primary transition-colors hover:text-primary/80">View all new inbound <ArrowRight className="h-3 w-3" /></a>
            </>
          )}
        </Section>
      </div>

      <Section
        icon={ShieldAlert}
        title="Ops & Exceptions"
        iconColor="text-violet-400"
        count={stalledDeals.length + reviewBlockers.length}
        actions={
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => setOpsExpanded((value) => !value)}>
            {opsExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {opsExpanded ? "Hide Ops" : "Show Ops"}
          </Button>
        }
      >
        {!opsExpanded ? (
          <p className="text-sm text-muted-foreground">Review blockers and stalled dispo still matter, but they should not crowd your main operator work. Expand this when you want the exceptions queue.</p>
        ) : opsError ? (
          <ErrorBanner message={opsError} />
        ) : stalledDeals.length === 0 && reviewBlockers.length === 0 ? (
          <Empty icon={CheckCircle2} message="No ops exceptions are waiting." />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center gap-2"><Ban className="h-4 w-4 text-amber-400" /><p className="text-sm font-semibold">Stalled Dispo</p><Badge variant="outline">{stalledDeals.length}</Badge></div>
              {stalledDeals.length === 0 ? <Empty icon={CheckCircle2} message="No stalled dispo items." /> : stalledDeals.map((lead) => renderLeadRow(lead, "Open", () => openLead(lead.id), `Disposition idle ${ago(lead.created_at)}`))}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-violet-400" /><p className="text-sm font-semibold">Review Blockers</p><Badge variant="outline">{reviewBlockers.length}</Badge></div>
              {reviewBlockers.length === 0 ? <Empty icon={CheckCircle2} message="No review blockers." /> : reviewBlockers.map((item) => (
                <div key={item.id} className="flex items-center gap-3 rounded-lg border border-border/30 bg-background/30 p-3">
                  <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-violet-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{item.entity_type ?? "Review item"}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{ago(item.created_at)}</p>
                  </div>
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { window.location.href = "/dialer/review/dossier-queue"; }}>Open</Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}
