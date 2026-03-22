"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  AlertTriangle,
  CalendarCheck,
  Phone,
  PhoneCall,
  ArrowRight,
  Activity,
  CheckCircle2,
  ShieldAlert,
  Inbox,
  Ban,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { useSentinelStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { LeadStatus } from "@/lib/types";

const ACTIVE_STATUSES: LeadStatus[] = ["lead", "negotiation", "disposition", "nurture"];

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

    setLoading(false);
  }, [currentUser?.id]);

  useEffect(() => {
    fetchAll();

    const channel = supabase
      .channel("today_brief_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "calls_log" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "review_queue" }, () => fetchAll())
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
            <div key={lead.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/[0.03] transition-colors group">
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
              className="w-full flex items-center justify-between text-left p-2.5 rounded-lg hover:bg-white/[0.03] transition-colors"
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
          <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/[0.03] transition-colors">
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
    <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/[0.03] transition-colors group">
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

export { TodayView as DashboardGrid };
