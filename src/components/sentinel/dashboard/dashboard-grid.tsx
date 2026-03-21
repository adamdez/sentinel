"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  DollarSign,
  AlertTriangle,
  CalendarCheck,
  Phone,
  PhoneCall,
  Clock,
  ArrowRight,
  UserPlus,
  FileCheck,
  Zap,
  Activity,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { useSentinelStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface BusinessStats {
  pipelineValue: number;
  overdue: number;
  dueToday: number;
  callsToday: number;
}

interface PriorityLead {
  id: string;
  address: string | null;
  city: string | null;
  owner_first_name: string | null;
  owner_last_name: string | null;
  next_action_date: string | null;
  next_action: string | null;
  status: string | null;
  ai_score: number | null;
  created_at: string;
}

interface RecentEvent {
  id: string;
  event_type: string;
  description: string | null;
  created_at: string;
}

interface StalledDeal {
  id: string;
  address: string | null;
  owner_first_name: string | null;
  owner_last_name: string | null;
  updated_at: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

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

function urgencyDotColor(daysUntil: number | null): string {
  if (daysUntil === null) return "bg-muted";
  if (daysUntil <= -3) return "bg-muted";
  if (daysUntil < 0) return "bg-muted";
  if (daysUntil === 0) return "bg-muted";
  return "bg-muted";
}

function urgencyText(lead: PriorityLead): string {
  const diff = daysDiff(lead.next_action_date);
  if (diff === null) {
    // No next action date — check if new
    const created = new Date(lead.created_at);
    const ageHrs = (Date.now() - created.getTime()) / 3600000;
    if (ageHrs < 48) return "New — needs first contact";
    return "No follow-up scheduled";
  }
  if (diff <= -1) {
    const label = lead.next_action || "Callback";
    return `${label} ${Math.abs(diff)}d overdue`;
  }
  if (diff === 0) return lead.next_action ? `${lead.next_action} due today` : "Due today";
  return lead.next_action ? `${lead.next_action} in ${diff}d` : `Due in ${diff}d`;
}

const EVENT_ICONS: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  call: { icon: Phone, color: "text-primary" },
  stage_change: { icon: Zap, color: "text-foreground" },
  promote: { icon: UserPlus, color: "text-foreground" },
  offer: { icon: DollarSign, color: "text-foreground" },
  disposition: { icon: FileCheck, color: "text-foreground" },
  lead_created: { icon: UserPlus, color: "text-foreground" },
};

function eventIcon(eventType: string) {
  // Match partial keys (e.g. "call_completed" matches "call")
  for (const [key, val] of Object.entries(EVENT_ICONS)) {
    if (eventType.includes(key)) return val;
  }
  return { icon: Activity, color: "text-foreground" };
}

/* ------------------------------------------------------------------ */
/*  Section 1 — Business Status Strip                                  */
/* ------------------------------------------------------------------ */

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <Card className="bg-muted/60 border-border/60">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn("p-2 rounded-lg bg-muted/80", accent)}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xl font-bold leading-none">{value}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  TodayView (main component)                                         */
/* ------------------------------------------------------------------ */

export function TodayView() {
  const { currentUser } = useSentinelStore();

  // ---------- state ----------
  const [stats, setStats] = useState<BusinessStats | null>(null);
  const [priorityLeads, setPriorityLeads] = useState<PriorityLead[]>([]);
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([]);
  const [stalledDeals, setStalledDeals] = useState<StalledDeal[]>([]);
  const [loading, setLoading] = useState(true);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ---------- fetchers ----------
  const fetchAll = useCallback(async () => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const nowIso = new Date().toISOString();

    try {
      // --- Stats ---
      const activeStatuses = ["new", "contacted", "qualifying", "nurturing", "negotiating", "offer_prep", "under_contract"];

      // Pipeline value — sum estimated_value from properties joined to active leads
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: pipelineData } = await (supabase.from("leads") as any)
        .select("id, properties(estimated_value)")
        .in("status", activeStatuses);

      let pipelineValue = 0;
      if (pipelineData) {
        for (const lead of pipelineData) {
          const prop = lead.properties;
          if (prop) {
            const val = Array.isArray(prop) ? prop[0]?.estimated_value : prop?.estimated_value;
            if (typeof val === "number") pipelineValue += val;
          }
        }
      }

      // Overdue count
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count: overdueCount } = await (supabase.from("leads") as any)
        .select("id", { count: "exact", head: true })
        .lt("next_action_date", nowIso)
        .in("status", activeStatuses);

      // Due today count
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count: dueTodayCount } = await (supabase.from("leads") as any)
        .select("id", { count: "exact", head: true })
        .gte("next_action_date", todayStart.toISOString())
        .lte("next_action_date", todayEnd.toISOString())
        .in("status", activeStatuses);

      // Calls today
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count: callsTodayCount } = await (supabase.from("calls_log") as any)
        .select("id", { count: "exact", head: true })
        .gte("started_at", todayStart.toISOString())
        .eq("user_id", currentUser.id);

      setStats({
        pipelineValue,
        overdue: overdueCount ?? 0,
        dueToday: dueTodayCount ?? 0,
        callsToday: callsTodayCount ?? 0,
      });

      // --- Priority Queue ---
      // Get overdue + today + upcoming leads with next_action_date, ordered by date asc (overdue first)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: queueLeads } = await (supabase.from("leads") as any)
        .select("id, address, city, owner_first_name, owner_last_name, next_action_date, next_action, status, ai_score, created_at")
        .in("status", activeStatuses)
        .order("next_action_date", { ascending: true, nullsFirst: false })
        .limit(10);

      // Also get leads with no next_action_date that are new (created < 48h)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: noDateLeads } = await (supabase.from("leads") as any)
        .select("id, address, city, owner_first_name, owner_last_name, next_action_date, next_action, status, ai_score, created_at")
        .is("next_action_date", null)
        .in("status", ["new"])
        .order("created_at", { ascending: false })
        .limit(5);

      const combined: PriorityLead[] = [...(queueLeads ?? []), ...(noDateLeads ?? [])];
      // Sort: most overdue first, then due today, then upcoming, then no-date new
      combined.sort((a, b) => {
        const da = daysDiff(a.next_action_date);
        const db = daysDiff(b.next_action_date);
        // nulls go to end
        if (da === null && db === null) return 0;
        if (da === null) return 1;
        if (db === null) return -1;
        return da - db;
      });

      setPriorityLeads(combined.slice(0, 10));

      // --- Recent Activity ---
      const allowedTypes = ["call", "stage_change", "promote", "offer", "disposition", "lead_created"];
      // Build OR filter for event_type
      const orFilter = allowedTypes.map((t) => `event_type.ilike.%${t}%`).join(",");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: events } = await (supabase.from("event_log") as any)
        .select("id, event_type, description, created_at")
        .or(orFilter)
        .order("created_at", { ascending: false })
        .limit(5);

      setRecentEvents((events as RecentEvent[]) ?? []);

      // --- Stalled Deals ---
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: stalled } = await (supabase.from("leads") as any)
        .select("id, address, owner_first_name, owner_last_name, updated_at")
        .eq("status", "disposition")
        .lt("updated_at", oneDayAgo)
        .order("updated_at", { ascending: true })
        .limit(5);

      setStalledDeals((stalled as StalledDeal[]) ?? []);
    } catch (err) {
      console.error("[TodayView] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [currentUser.id]);

  useEffect(() => {
    fetchAll();

    // Real-time refresh on leads or calls changes
    const channel = supabase
      .channel("today_view_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "calls_log" }, () => fetchAll())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "event_log" }, () => fetchAll())
      .subscribe();

    channelRef.current = channel;
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [fetchAll]);

  // ---------- loading skeleton ----------
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl bg-muted/40" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl bg-muted/40" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-40 rounded-xl bg-muted/40" />
          <Skeleton className="h-40 rounded-xl bg-muted/40" />
        </div>
      </div>
    );
  }

  const s = stats ?? { pipelineValue: 0, overdue: 0, dueToday: 0, callsToday: 0 };

  return (
    <div className="space-y-6">
      {/* ---- Section 1: Business Status Strip ---- */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={DollarSign}
          label="Pipeline Value"
          value={s.pipelineValue > 0 ? `$${(s.pipelineValue / 1000).toFixed(0)}k` : "$0"}
          accent="text-foreground"
        />
        <StatCard
          icon={AlertTriangle}
          label="Overdue"
          value={s.overdue}
          accent={s.overdue > 0 ? "text-foreground" : "text-foreground"}
        />
        <StatCard
          icon={CalendarCheck}
          label="Due Today"
          value={s.dueToday}
          accent={s.dueToday > 0 ? "text-foreground" : "text-foreground"}
        />
        <StatCard
          icon={PhoneCall}
          label="Calls Today"
          value={s.callsToday}
          accent="text-primary"
        />
      </div>

      {/* ---- Section 2: Priority Queue ---- */}
      <Card className="bg-muted/60 border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Priority Queue
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {priorityLeads.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No leads with pending actions. Add a lead to get started.
            </div>
          ) : (
            <>
              {priorityLeads.map((lead) => {
                const diff = daysDiff(lead.next_action_date);
                const ownerName = [lead.owner_first_name, lead.owner_last_name].filter(Boolean).join(" ") || "Unknown Owner";
                const displayAddress = lead.address
                  ? `${lead.address}${lead.city ? `, ${lead.city}` : ""}`
                  : ownerName;

                return (
                  <div
                    key={lead.id}
                    className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/[0.03] transition-colors group"
                  >
                    {/* Urgency dot */}
                    <div className={cn("h-2.5 w-2.5 rounded-full shrink-0", urgencyDotColor(diff))} />

                    {/* Middle: Address + Owner + Why */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{displayAddress}</p>
                      {lead.address && (
                        <p className="text-[11px] text-muted-foreground truncate">{ownerName}</p>
                      )}
                      <p
                        className={cn(
                          "text-[11px] mt-0.5",
                          diff !== null && diff <= -3
                            ? "text-foreground font-medium"
                            : diff !== null && diff < 0
                              ? "text-foreground"
                              : diff === 0
                                ? "text-foreground"
                                : "text-muted-foreground"
                        )}
                      >
                        {urgencyText(lead)}
                      </p>
                    </div>

                    {/* Right: Score + Call button */}
                    <div className="flex items-center gap-2 shrink-0">
                      {lead.ai_score !== null && (
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-mono tabular-nums",
                            lead.ai_score >= 80
                              ? "border-border/40 text-foreground"
                              : lead.ai_score >= 60
                                ? "border-border/40 text-foreground"
                                : "border-border text-foreground"
                          )}
                        >
                          {lead.ai_score}
                        </Badge>
                      )}
                      <Button
                        size="sm"
                        className="h-7 text-[11px] gap-1 opacity-70 group-hover:opacity-100 transition-opacity"
                        onClick={() => {
                          window.location.href = `/leads?open=${lead.id}`;
                        }}
                      >
                        <Phone className="h-3 w-3" />
                        CALL NOW
                      </Button>
                    </div>
                  </div>
                );
              })}

              <a
                href="/leads"
                className="flex items-center justify-center gap-1 text-[11px] text-primary hover:text-primary/80 pt-2 transition-colors"
              >
                View all in Lead Queue
                <ArrowRight className="h-3 w-3" />
              </a>
            </>
          )}
        </CardContent>
      </Card>

      {/* ---- Bottom row: Activity + Stalled ---- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* ---- Section 3: Recent Activity ---- */}
        <Card className="bg-muted/60 border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentEvents.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                No recent activity — actions will appear as you work leads.
              </p>
            ) : (
              recentEvents.map((evt) => {
                const config = eventIcon(evt.event_type);
                const Icon = config.icon;
                return (
                  <div key={evt.id} className="flex items-start gap-2.5 py-1">
                    <div className={cn("mt-0.5 shrink-0", config.color)}>
                      <Icon className="h-3 w-3" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] leading-tight truncate">
                        {evt.description || evt.event_type}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{timeAgo(evt.created_at)}</p>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* ---- Section 4: Stalled Deals ---- */}
        <Card className="bg-muted/60 border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-foreground" />
              Stalled Deals
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stalledDeals.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-foreground py-4 justify-center">
                <CheckCircle2 className="h-4 w-4" />
                No stalled deals
              </div>
            ) : (
              stalledDeals.map((deal) => {
                const ownerName = [deal.owner_first_name, deal.owner_last_name].filter(Boolean).join(" ");
                const daysStalled = Math.floor((Date.now() - new Date(deal.updated_at).getTime()) / 86400000);
                return (
                  <button
                    key={deal.id}
                    onClick={() => { window.location.href = `/leads?open=${deal.id}`; }}
                    className="w-full flex items-center justify-between text-left p-2 rounded-lg hover:bg-white/[0.03] transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{deal.address || ownerName || "Unknown"}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px] border-border/30 text-foreground shrink-0 ml-2">
                      {daysStalled}d stalled
                    </Badge>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Backward-compatible export — other files import DashboardGrid */
export { TodayView as DashboardGrid };
