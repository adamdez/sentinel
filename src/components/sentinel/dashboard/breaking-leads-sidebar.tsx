"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, ArrowUp, Radio, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  apn?: string;
}

const SOURCE_CONFIG: Record<string, { label: string; color: string }> = {
  ranger: { label: "RANGER", color: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
  scraper: { label: "SCRAPER", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20" },
};

const FEED_DATA: TickerItem[] = [
  { id: "r1", name: "Voss Property", type: "Probate + Vacant + Inherited", score: 100, label: "fire", time: "12m ago", source: "ranger", apn: "SPK-2025-001" },
  { id: "r2", name: "Alcazar Property", type: "Pre-Foreclosure + Absentee", score: 86, label: "fire", time: "25m ago", source: "ranger", apn: "SPK-2025-002" },
  { id: "r3", name: "Whitfield Property", type: "Tax Lien + Code Viol.", score: 79, label: "hot", time: "38m ago", source: "ranger", apn: "SPK-2025-003" },
  { id: "1", name: "Henderson Estate", type: "Probate", score: 94, label: "fire", time: "1h ago", source: "scraper" },
  { id: "2", name: "Chen Property", type: "Pre-Foreclosure", score: 87, label: "hot", time: "2h ago", source: "scraper" },
  { id: "3", name: "Morales Lot", type: "Tax Lien + Vacant", score: 79, label: "hot", time: "3h ago" },
  { id: "4", name: "Park Residence", type: "FSBO", score: 71, label: "hot", time: "4h ago" },
  { id: "5", name: "Wright Duplex", type: "Bankruptcy", score: 68, label: "hot", time: "5h ago" },
];

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
        "flex flex-col gap-1.5 p-2.5 rounded-lg text-xs transition-all relative cursor-pointer hover:brightness-110",
        isFire
          ? "bg-orange-500/5 border border-orange-500/10"
          : "bg-secondary/20 border border-transparent hover:border-glass-border"
      )}
      style={isFire ? {
        boxShadow: "inset 0 0 20px rgba(255,107,53,0.04), 0 0 8px rgba(255,107,53,0.08)",
      } : {}}
    >
      {isFire && (
        <motion.div
          className="absolute inset-0 rounded-lg pointer-events-none"
          style={{
            background: "linear-gradient(90deg, transparent 0%, rgba(255,107,53,0.04) 50%, transparent 100%)",
            backgroundSize: "200% 100%",
          }}
          animate={{ backgroundPosition: ["0% 0%", "200% 0%"] }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
        />
      )}

      <div className="flex items-center gap-2 relative">
        <Zap
          className={cn("h-3 w-3 shrink-0", isFire ? "text-orange-400" : "text-neon")}
          style={isFire ? { filter: "drop-shadow(0 0 3px rgba(255,107,53,0.5))" } : { filter: "drop-shadow(0 0 3px rgba(0,255,136,0.4))" }}
        />
        <span
          className="font-semibold truncate flex-1 text-foreground"
          style={{
            textShadow: "0 0 8px rgba(0,255,136,0.15), 0 0 16px rgba(0,255,136,0.06)",
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
        <span className="text-[10px] text-muted-foreground truncate">{item.type}</span>
        <span className="flex-1" />
        {src && (
          <span className={cn("text-[7px] px-1 py-0 rounded border font-semibold shrink-0", src.color)}>
            {src.label}
          </span>
        )}
        <span className="text-[9px] text-muted-foreground shrink-0">{item.time}</span>
      </div>
    </motion.div>
  );
}

export function BreakingLeadsSidebar() {
  const [cycleOffset, setCycleOffset] = useState(0);
  const [newPulse, setNewPulse] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setCycleOffset((prev) => (prev + 1) % FEED_DATA.length);
      setNewPulse(true);
      setTimeout(() => setNewPulse(false), 600);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const visibleItems = [...FEED_DATA.slice(cycleOffset), ...FEED_DATA.slice(0, cycleOffset)].slice(0, 6);

  return (
    <div className="hidden lg:flex w-[300px] shrink-0 flex-col">
      <div
        className="rounded-xl border border-glass-border bg-glass backdrop-blur-xl overflow-hidden holo-border"
        style={{ transformStyle: "preserve-3d" }}
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-glass-border/50">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className={cn(
                "absolute inline-flex h-full w-full rounded-full bg-neon",
                newPulse ? "animate-ping opacity-75" : "animate-pulse opacity-50"
              )} />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-neon" />
            </span>
            <span className="text-[10px] text-neon font-semibold tracking-wider">BREAKING LEADS</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Radio className="h-3 w-3 text-neon/60" />
            <span className="text-[9px] text-muted-foreground">LIVE</span>
          </div>
        </div>

        <div className="p-2.5 space-y-1.5 max-h-[calc(100vh-280px)] overflow-y-auto scrollbar-thin">
          <AnimatePresence mode="popLayout">
            {visibleItems.map((item, i) => (
              <TickerRow key={item.id} item={item} index={i} />
            ))}
          </AnimatePresence>
        </div>

        <div className="px-4 py-2 border-t border-glass-border/50">
          <Link
            href="/sales-funnel/prospects"
            className="flex items-center justify-center gap-1.5 text-[10px] text-neon/70 hover:text-neon transition-colors font-medium"
          >
            View All Prospects
            <ExternalLink className="h-2.5 w-2.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
