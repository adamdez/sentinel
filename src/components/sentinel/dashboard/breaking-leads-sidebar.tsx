"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, ArrowUp, Radio, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface TickerItem {
  id: string;
  name: string;
  type: string;
  score: number;
  label: "fire" | "hot";
  time: string;
  source?: string;
}

const SOURCE_CONFIG: Record<string, { label: string; color: string }> = {
  ranger_push: { label: "RANGER", color: "text-purple bg-purple/[0.08] border-purple/15" },
  propertyradar: { label: "PROPRADAR", color: "text-emerald-400 bg-emerald-500/[0.08] border-emerald-500/15" },
  manual: { label: "MANUAL", color: "text-cyan bg-cyan/[0.08] border-cyan/15" },
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

function scoreLabel(n: number): "fire" | "hot" {
  return n >= 65 ? "fire" : "hot";
}

function TickerRow({ item, index }: { item: TickerItem; index: number }) {
  const isFire = item.label === "fire";
  const src = item.source ? SOURCE_CONFIG[item.source] : null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ delay: index * 0.04, duration: 0.2 }}
      className={cn(
        "flex flex-col gap-1.5 p-2.5 rounded-[10px] text-xs transition-all relative cursor-pointer",
        isFire
          ? "bg-orange-500/[0.04] border border-orange-500/[0.1]"
          : "bg-white/[0.02] border border-transparent hover:border-white/[0.06]"
      )}
      style={isFire ? {
        boxShadow: "inset 0 0 20px rgba(255,107,53,0.03), 0 0 10px rgba(255,107,53,0.06)",
      } : {}}
    >
      {isFire && (
        <motion.div
          className="absolute inset-0 rounded-[10px] pointer-events-none"
          style={{
            background: "linear-gradient(90deg, transparent 0%, rgba(255,107,53,0.03) 50%, transparent 100%)",
            backgroundSize: "200% 100%",
          }}
          animate={{ backgroundPosition: ["0% 0%", "200% 0%"] }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
        />
      )}

      <div className="flex items-center gap-2 relative">
        <Zap
          className={cn("h-3 w-3 shrink-0", isFire ? "text-orange-400" : "text-cyan")}
          style={isFire ? { filter: "drop-shadow(0 0 3px rgba(255,107,53,0.5))" } : { filter: "drop-shadow(0 0 3px rgba(0,212,255,0.4))" }}
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
        <Badge variant={isFire ? "fire" : "hot"} className="text-[8px] gap-0.5 shrink-0">
          <ArrowUp className="h-2 w-2" />{item.score}
        </Badge>
      </div>

      <div className="flex items-center gap-1.5 pl-5 relative">
        <span className="text-[10px] text-muted-foreground/60 truncate">{item.type}</span>
        <span className="flex-1" />
        {src && (
          <span className={cn("text-[7px] px-1 py-0 rounded-[4px] border font-semibold shrink-0", src.color)}>
            {src.label}
          </span>
        )}
        <span className="text-[9px] text-muted-foreground/50 shrink-0">{item.time}</span>
      </div>
    </motion.div>
  );
}

export function BreakingLeadsSidebar() {
  const [items, setItems] = useState<TickerItem[]>([]);
  const [newPulse, setNewPulse] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchRecent = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: leads } = await (supabase.from("leads") as any)
      .select("id, property_id, priority, source, tags, created_at")
      .eq("status", "prospect")
      .gte("priority", 40)
      .order("created_at", { ascending: false })
      .limit(10);

    if (!leads || leads.length === 0) {
      setItems([]);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const propIds = [...new Set((leads as any[]).map((l: any) => l.property_id).filter(Boolean))];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const propsMap: Record<string, any> = {};

    if (propIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: props } = await (supabase.from("properties") as any)
        .select("id, address, owner_name")
        .in("id", propIds);

      if (props) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const p of props as any[]) propsMap[p.id] = p;
      }
    }

    const DISTRESS_LABELS: Record<string, string> = {
      probate: "Probate", pre_foreclosure: "Pre-Foreclosure", tax_lien: "Tax Lien",
      code_violation: "Code Viol.", vacant: "Vacant", divorce: "Divorce",
      bankruptcy: "Bankruptcy", fsbo: "FSBO", absentee: "Absentee", inherited: "Inherited",
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapped: TickerItem[] = (leads as any[]).map((l) => {
      const prop = propsMap[l.property_id] ?? {};
      const tags = (l.tags ?? []) as string[];
      const typeStr = tags.slice(0, 3).map((t: string) => DISTRESS_LABELS[t] ?? t).join(" + ") || "New Lead";

      return {
        id: l.id,
        name: prop.owner_name ?? prop.address ?? "Unknown",
        type: typeStr,
        score: l.priority ?? 0,
        label: scoreLabel(l.priority ?? 0),
        time: timeAgo(l.created_at),
        source: l.source ?? undefined,
      };
    });

    setItems(mapped);
  }, []);

  useEffect(() => {
    fetchRecent();

    const channel = supabase
      .channel("breaking_leads_sidebar")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "leads" }, () => {
        setNewPulse(true);
        setTimeout(() => setNewPulse(false), 600);
        fetchRecent();
      })
      .subscribe();

    channelRef.current = channel;
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [fetchRecent]);

  return (
    <div className="hidden lg:flex w-[300px] shrink-0 flex-col">
      <div
        className="rounded-[14px] border border-glass-border bg-glass backdrop-blur-2xl overflow-hidden holo-border inner-glow-card"
        style={{ transformStyle: "preserve-3d" }}
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-white/[0.04]">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className={cn(
                "absolute inline-flex h-full w-full rounded-full bg-cyan",
                newPulse ? "animate-ping opacity-75" : "animate-pulse opacity-50"
              )} />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan shadow-[0_0_6px_rgba(0,212,255,0.5)]" />
            </span>
            <span className="text-[10px] text-cyan font-semibold tracking-wider">BREAKING LEADS</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Radio className="h-3 w-3 text-cyan/60" />
            <span className="text-[9px] text-muted-foreground">LIVE</span>
          </div>
        </div>

        <div className="p-2.5 space-y-1.5 max-h-[calc(100vh-280px)] overflow-y-auto scrollbar-thin">
          {items.length === 0 ? (
            <div className="py-8 text-center text-[11px] text-muted-foreground/40">
              No recent prospects
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {items.map((item, i) => (
                <TickerRow key={item.id} item={item} index={i} />
              ))}
            </AnimatePresence>
          )}
        </div>

        <div className="px-4 py-2 border-t border-white/[0.04]">
          <Link
            href="/sales-funnel/prospects"
            className="flex items-center justify-center gap-1.5 text-[10px] text-cyan/70 hover:text-cyan transition-colors font-medium"
          >
            View All Prospects
            <ExternalLink className="h-2.5 w-2.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
