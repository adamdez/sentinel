"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, ArrowUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { RelationshipBadgeCompact } from "@/components/sentinel/relationship-badge";

interface TickerItem {
  id: string;
  name: string;
  type: string;
  score: number;
  label: "fire" | "hot";
  time: string;
  source?: string;
  daysUntilDistress?: number | null;
  tags?: string[];
}

const SOURCE_MAP: Record<string, { label: string; color: string }> = {
  ranger_push: { label: "RANGER", color: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
  propertyradar: { label: "PROPRADAR", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  manual: { label: "MANUAL", color: "text-sky-400 bg-sky-500/10 border-sky-500/20" },
  "manual-new-prospect": { label: "MANUAL", color: "text-sky-400 bg-sky-500/10 border-sky-500/20" },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function BreakingLeadsTicker() {
  const [items, setItems] = useState<TickerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchRecent = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: leads } = await (supabase.from("leads") as any)
      .select("id, property_id, priority, source, tags, created_at")
      .eq("status", "prospect")
      .gte("priority", 40)
      .order("created_at", { ascending: false })
      .limit(8);

    if (!leads || leads.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }

    const propIds = [...new Set((leads as { property_id: string }[]).map((l) => l.property_id).filter(Boolean))];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const propsMap: Record<string, any> = {};

    if (propIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: props } = await (supabase.from("properties") as any)
        .select("id, address, owner_name")
        .in("id", propIds);
      if (props) {
        for (const p of props as { id: string; address: string; owner_name: string }[]) {
          propsMap[p.id] = p;
        }
      }
    }

    // Fetch latest predictions for these properties
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const predMap: Record<string, number> = {};
    if (propIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: preds } = await (supabase.from("scoring_predictions") as any)
        .select("property_id, days_until_distress")
        .in("property_id", propIds)
        .order("created_at", { ascending: false });
      if (preds) {
        for (const p of preds as { property_id: string; days_until_distress: number }[]) {
          if (!(p.property_id in predMap)) predMap[p.property_id] = p.days_until_distress;
        }
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapped: TickerItem[] = (leads as any[]).map((l) => {
      const prop = propsMap[l.property_id];
      const tag = l.tags?.[0]?.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) ?? "Signal";
      return {
        id: l.id,
        name: prop?.owner_name ?? "Unknown",
        type: tag,
        score: l.priority ?? 0,
        label: (l.priority ?? 0) >= 65 ? "fire" as const : "hot" as const,
        time: timeAgo(l.created_at),
        source: l.source ?? undefined,
        daysUntilDistress: predMap[l.property_id] ?? null,
        tags: l.tags ?? [],
      };
    });

    setItems(mapped);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRecent();

    channelRef.current = supabase
      .channel("ticker-leads")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "leads" }, () => {
        fetchRecent();
      })
      .subscribe();

    const onRefresh = () => fetchRecent();
    window.addEventListener("sentinel:refresh-dashboard", onRefresh);

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      window.removeEventListener("sentinel:refresh-dashboard", onRefresh);
    };
  }, [fetchRecent]);

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-3 w-16" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-md" />
        ))}
      </div>
    );
  }

  const visible = items.slice(0, 4);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan" />
        </span>
        <span className="text-[10px] text-cyan font-medium">LIVE</span>
      </div>

      {visible.length === 0 ? (
        <div className="text-center py-4">
          <Zap className="h-5 w-5 text-muted-foreground mx-auto mb-1" />
          <p className="text-[10px] text-muted-foreground">No breaking leads yet</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <AnimatePresence mode="popLayout">
            {visible.map((item, i) => {
              const isFire = item.label === "fire";
              const src = item.source ? SOURCE_MAP[item.source] : null;
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ delay: i * 0.05 }}
                  className={cn(
                    "flex items-center gap-2.5 p-2 rounded-md text-xs transition-all relative",
                    isFire
                      ? "bg-orange-500/5 border border-orange-500/10"
                      : "bg-white/[0.02]"
                  )}
                  style={isFire ? {
                    boxShadow: "inset 0 0 20px rgba(255,107,53,0.04), 0 0 8px rgba(255,107,53,0.08)",
                  } : {}}
                >
                  {isFire && (
                    <motion.div
                      className="absolute inset-0 rounded-md pointer-events-none"
                      style={{
                        background: "linear-gradient(90deg, transparent 0%, rgba(255,107,53,0.03) 50%, transparent 100%)",
                        backgroundSize: "200% 100%",
                      }}
                      animate={{ backgroundPosition: ["0% 0%", "200% 0%"] }}
                      transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                    />
                  )}
                  <Zap
                    className={cn("h-3 w-3 shrink-0", isFire ? "text-orange-400" : "text-cyan")}
                    style={isFire ? { filter: "drop-shadow(0 0 3px rgba(255,107,53,0.5))" } : {}}
                  />
                  <span
                    className="font-semibold truncate flex-1 text-foreground"
                    style={{
                      textShadow: "0 0 8px rgba(0,212,255,0.15), 0 0 16px rgba(0,212,255,0.06)",
                      WebkitFontSmoothing: "antialiased",
                    }}
                  >
                    {item.name}
                  </span>
                  <RelationshipBadgeCompact data={{ tags: item.tags }} />
                  {item.daysUntilDistress != null && (
                    <span className="text-[7px] px-1 py-0 rounded border font-semibold shrink-0 text-orange-400 bg-orange-500/10 border-orange-500/20">
                      {item.daysUntilDistress}d
                    </span>
                  )}
                  {src && (
                    <span className={cn("text-[7px] px-1 py-0 rounded border font-semibold shrink-0", src.color)}>
                      {src.label}
                    </span>
                  )}
                  <Badge variant={isFire ? "fire" : "hot"} className="text-[8px] gap-0.5">
                    <ArrowUp className="h-2 w-2" />{item.score}
                  </Badge>
                  <span className="text-[9px] text-muted-foreground shrink-0">{item.time}</span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <p className="text-[9px] text-muted-foreground text-center pt-1">
        {items.length > 0
          ? `${items.length} breaking leads — real-time feed`
          : "Waiting for high-score prospects"}
      </p>
    </div>
  );
}
