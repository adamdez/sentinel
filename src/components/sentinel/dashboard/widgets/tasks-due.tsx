"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { AlertCircle, Clock, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { useSentinelStore } from "@/lib/store";

interface TaskGroup {
  label: string;
  count: number;
  variant: "destructive" | "neon" | "secondary";
  icon: React.ComponentType<{ className?: string }>;
}

export function TasksDue() {
  const { currentUser } = useSentinelStore();
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [upcoming, setUpcoming] = useState<{ address: string; time: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchData = useCallback(async () => {
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: leads } = await (supabase.from("leads") as any)
      .select("id, next_call_scheduled_at, property_id, status")
      .eq("assigned_to", currentUser.id)
      .not("next_call_scheduled_at", "is", null)
      .lte("next_call_scheduled_at", tomorrow.toISOString())
      .in("status", ["lead", "negotiation", "prospect"])
      .order("next_call_scheduled_at", { ascending: true });

    const rows = (leads ?? []) as { id: string; next_call_scheduled_at: string; property_id: string; status: string }[];

    let overdue = 0;
    let dueToday = 0;
    let dueTomorrow = 0;
    const upcomingList: { address: string; time: string }[] = [];

    for (const r of rows) {
      const scheduled = new Date(r.next_call_scheduled_at);
      if (scheduled < now) overdue++;
      else if (scheduled <= endOfDay) dueToday++;
      else dueTomorrow++;

      if (upcomingList.length < 4) {
        const h = scheduled.getHours();
        const m = scheduled.getMinutes();
        const ampm = h >= 12 ? "PM" : "AM";
        const displayH = h % 12 || 12;
        const timeStr = scheduled < now
          ? "OVERDUE"
          : `${displayH}:${String(m).padStart(2, "0")} ${ampm}`;
        upcomingList.push({ address: r.property_id.slice(0, 8) + "…", time: timeStr });
      }
    }

    // Fetch addresses for the upcoming ones
    if (upcomingList.length > 0 && rows.length > 0) {
      const propIds = rows.slice(0, 4).map((r) => r.property_id).filter(Boolean);
      if (propIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: props } = await (supabase.from("properties") as any)
          .select("id, street_address")
          .in("id", propIds);
        const propMap: Record<string, string> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const p of (props ?? []) as any[]) propMap[p.id] = p.street_address ?? "";
        rows.slice(0, 4).forEach((r, i) => {
          if (upcomingList[i] && propMap[r.property_id]) {
            upcomingList[i].address = propMap[r.property_id];
          }
        });
      }
    }

    setGroups([
      { label: "Overdue", count: overdue, variant: "destructive", icon: AlertCircle },
      { label: "Due Today", count: dueToday, variant: "neon", icon: Clock },
      { label: "Tomorrow", count: dueTomorrow, variant: "secondary", icon: CheckCircle2 },
    ]);
    setUpcoming(upcomingList);
    setLoading(false);
  }, [currentUser.id]);

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel("tasks_due_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => fetchData())
      .subscribe();
    channelRef.current = channel;
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current); };
  }, [fetchData]);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full rounded-[10px]" />
        ))}
      </div>
    );
  }

  const totalDue = groups.reduce((s, g) => s + g.count, 0);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        {groups.map((g, i) => {
          const Icon = g.icon;
          return (
            <motion.div
              key={g.label}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.06 }}
              className="flex-1 text-center py-1.5 rounded-[10px] bg-secondary/20"
            >
              <Icon className="h-3 w-3 mx-auto mb-0.5 text-muted-foreground" />
              <p className="text-lg font-black">{g.count}</p>
              <Badge variant={g.variant} className="text-[8px]">{g.label}</Badge>
            </motion.div>
          );
        })}
      </div>

      {upcoming.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Next Up</p>
          {upcoming.map((u, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + i * 0.05 }}
              className="flex items-center justify-between text-[11px] py-0.5"
            >
              <span className="truncate flex-1 mr-2">{u.address}</span>
              <span className={u.time === "OVERDUE" ? "text-red-400 font-bold" : "text-muted-foreground"}>
                {u.time}
              </span>
            </motion.div>
          ))}
        </div>
      )}

      {totalDue === 0 && (
        <div className="text-center py-3 text-xs text-muted-foreground">
          No follow-ups scheduled — queue is clear.
        </div>
      )}
    </div>
  );
}
