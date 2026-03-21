"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { PhoneOutgoing, Clock, PhoneOff, CheckCircle2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { useSentinelStore } from "@/lib/store";
import { cn } from "@/lib/utils";

interface CallStats {
  totalCalls: number;
  connected: number;
  noAnswer: number;
  talkMinutes: number;
}

export function CallsToday() {
  const { currentUser } = useSentinelStore();
  const [stats, setStats] = useState<CallStats | null>(null);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchData = useCallback(async () => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: calls } = await (supabase.from("calls_log") as any)
      .select("disposition, duration_sec")
      .eq("user_id", currentUser.id)
      .gte("started_at", startOfDay.toISOString());

    const rows = (calls ?? []) as { disposition: string; duration_sec: number | null }[];

    let connected = 0;
    let noAnswer = 0;
    let talkSec = 0;

    for (const r of rows) {
      const d = r.disposition ?? "";
      if (["no_answer", "initiating"].includes(d)) {
        noAnswer++;
      } else if (d !== "sms_outbound") {
        connected++;
      }
      talkSec += r.duration_sec ?? 0;
    }

    setStats({
      totalCalls: rows.length,
      connected,
      noAnswer,
      talkMinutes: Math.round(talkSec / 60),
    });
    setLoading(false);
  }, [currentUser.id]);

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel("calls_today_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "calls_log" }, () => fetchData())
      .subscribe();
    channelRef.current = channel;
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current); };
  }, [fetchData]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full rounded-[10px]" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }

  const s = stats!;
  const connectRate = s.totalCalls > 0 ? Math.round((s.connected / s.totalCalls) * 100) : 0;

  const metrics = [
    { icon: PhoneOutgoing, label: "Calls Made", value: String(s.totalCalls), color: "text-primary" },
    { icon: CheckCircle2, label: "Connected", value: String(s.connected), color: "text-foreground" },
    { icon: PhoneOff, label: "No Answer", value: String(s.noAnswer), color: "text-foreground" },
    { icon: Clock, label: "Talk Time", value: `${s.talkMinutes}m`, color: "text-foreground" },
  ];

  return (
    <div className="space-y-2.5">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center py-1.5 rounded-[12px] bg-secondary/20"
      >
        <p className="text-2xl font-black text-primary"
          style={{ textShadow: "0 0 12px rgba(0,0,0,0.4)" }}>
          {connectRate}%
        </p>
        <p className="text-[10px] text-muted-foreground">Connect Rate</p>
      </motion.div>

      {metrics.map((m, i) => {
        const Icon = m.icon;
        return (
          <motion.div
            key={m.label}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="flex items-center justify-between"
          >
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Icon className={cn("h-3 w-3", m.color)} />
              {m.label}
            </span>
            <span className="text-sm font-bold">{m.value}</span>
          </motion.div>
        );
      })}
    </div>
  );
}
