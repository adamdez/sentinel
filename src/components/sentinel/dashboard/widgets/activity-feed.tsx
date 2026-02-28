"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Phone, UserPlus, FileCheck, Zap, Mail, Activity } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

interface FeedEvent {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown>;
  created_at: string;
}

const ACTION_ICONS: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  call: { icon: Phone, color: "text-neon" },
  score: { icon: Zap, color: "text-purple-400" },
  promote: { icon: UserPlus, color: "text-blue-400" },
  disposition: { icon: FileCheck, color: "text-orange-400" },
  email: { icon: Mail, color: "text-yellow-400" },
  create: { icon: UserPlus, color: "text-blue-400" },
  update: { icon: Activity, color: "text-cyan-400" },
  status_change: { icon: Zap, color: "text-neon" },
};

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

function formatEventText(event: FeedEvent): string {
  const d = event.details ?? {};
  const entity = (d.address as string) || (d.owner_name as string) || event.entity_type;

  switch (event.action) {
    case "call": return `Called ${entity} — ${(d.duration as string) || "completed"}`;
    case "score": return `AI scored ${entity} — ${d.score ?? "updated"}`;
    case "promote": return `Promoted ${entity} to leads`;
    case "disposition": return `Disposition sent for ${entity}`;
    case "email": return `Drip email to ${entity}`;
    case "status_change": return `${entity} → ${(d.new_status as string) || "new status"}`;
    case "create": return `New ${event.entity_type}: ${entity}`;
    case "update": return `Updated ${event.entity_type}: ${entity}`;
    default: return `${event.action} on ${entity}`;
  }
}

export function ActivityFeed() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("event_log") as any)
        .select("id, action, entity_type, entity_id, details, created_at")
        .order("created_at", { ascending: false })
        .limit(8);

      if (error) {
        console.error("[ActivityFeed] Fetch failed:", error);
        return;
      }

      setEvents((data as FeedEvent[]) ?? []);
    } catch (err) {
      console.error("[ActivityFeed] Error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();

    const channel = supabase
      .channel("activity_feed_rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "event_log" }, () => fetchEvents())
      .subscribe();

    channelRef.current = channel;
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [fetchEvents]);

  if (loading) {
    return (
      <div className="space-y-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-start gap-2.5 py-1.5">
            <Skeleton className="h-3 w-3 mt-0.5 rounded-full shrink-0" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-2 w-12" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-6 text-xs text-muted-foreground">
        No activity yet — actions will appear as you work leads.
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {events.map((event, i) => {
        const config = ACTION_ICONS[event.action] ?? ACTION_ICONS.update;
        const Icon = config.icon;
        return (
          <motion.div
            key={event.id}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            className="flex items-start gap-2.5 py-1.5"
          >
            <div className={cn("mt-0.5 shrink-0", config.color)} style={{ filter: "drop-shadow(0 0 3px currentColor)" }}>
              <Icon className="h-3 w-3" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] leading-tight truncate">{formatEventText(event)}</p>
              <p className="text-[9px] text-muted-foreground">{timeAgo(event.created_at)}</p>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
