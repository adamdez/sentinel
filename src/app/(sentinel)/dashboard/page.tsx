"use client";

import { useState, useEffect } from "react";
import { Zap, Shield, Flame } from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { DashboardGrid } from "@/components/sentinel/dashboard/dashboard-grid";
import { BreakingLeadsSidebar } from "@/components/sentinel/dashboard/breaking-leads-sidebar";
import { Badge } from "@/components/ui/badge";
import { useSentinelStore } from "@/lib/store";
import { SCORING_MODEL_VERSION } from "@/lib/scoring";
import { toast } from "sonner";

const ELITE_SEED_FLAG = "sentinel_elite_seed_done";

export default function DashboardPage() {
  const { currentUser, ghostMode } = useSentinelStore();
  const [eliteDone, setEliteDone] = useState(true);
  const [eliteLoading, setEliteLoading] = useState(false);

  useEffect(() => {
    setEliteDone(localStorage.getItem(ELITE_SEED_FLAG) === "1");
  }, []);

  async function handleEliteSeed() {
    setEliteLoading(true);
    try {
      const res = await fetch("/api/ingest/propertyradar/top10", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ counties: ["Spokane", "Kootenai"] }),
      });

      let data: Record<string, unknown>;
      try {
        data = await res.json();
      } catch {
        toast.error("Elite seed returned non-JSON — check server logs");
        return;
      }

      if (!res.ok || !data.success) {
        const msg = typeof data.error === "string" ? data.error : "Elite seed failed";
        toast.error(msg);
        if (data.topScores) {
          console.table(data.topScores);
        }
        console.error("[EliteSeed] Response:", data);
        return;
      }

      const prospects = (data.prospects ?? []) as { address: string; score: number; label: string }[];
      const count = typeof data.count === "number" ? data.count : prospects.length;
      const newCount = typeof data.newInserts === "number" ? data.newInserts : count;
      const updCount = typeof data.updated === "number" ? data.updated : 0;
      const dedupEvents = typeof data.eventsDeduped === "number" ? data.eventsDeduped : 0;

      toast.success(`🔥 ${count} Elite Prospects Processed!`, {
        description: `${newCount} new · ${updCount} updated · ${dedupEvents} events deduped. Fetched ${data.totalFetched ?? "?"} → scored ${data.totalScored ?? "?"} → kept ${count}. PR cost: ${data.prCost ?? "?"}`,
        duration: 8000,
      });

      prospects.slice(0, 10).forEach((p, i) =>
        toast.info(`${i + 1}/${count} — ${p.score} ${String(p.label).toUpperCase()} — ${p.address}`, { duration: 5000 }),
      );

      localStorage.setItem(ELITE_SEED_FLAG, "1");
      setEliteDone(true);
    } catch (err) {
      console.error("[EliteSeed] Network error:", err);
      toast.error("Network error reaching /api/ingest/propertyradar/top10");
    } finally {
      setEliteLoading(false);
    }
  }

  return (
    <PageShell
      title={`Welcome back, ${currentUser.name ? currentUser.name.split(" ")[0] : "..."}`}
      description="Sentinel command center — your personalized acquisition intelligence"
      actions={
        <div className="flex items-center gap-2">
          {!eliteDone && (
            <button
              onClick={handleEliteSeed}
              disabled={eliteLoading}
              className="relative px-4 py-1.5 rounded-xl font-bold text-[11px] uppercase tracking-wider
                bg-red-600 hover:bg-red-500 text-white border border-red-400/40
                shadow-[0_0_14px_rgba(255,60,60,0.45)] hover:shadow-[0_0_22px_rgba(255,60,60,0.6)]
                transition-all active:scale-95 disabled:opacity-50 disabled:cursor-wait
                flex items-center gap-1.5"
            >
              <Flame className="h-3.5 w-3.5" />
              {eliteLoading ? "Pulling…" : "TEMP — TOP 10 ELITE SEED"}
            </button>
          )}
          {ghostMode && (
            <Badge variant="outline" className="text-[10px] gap-1 border-yellow-500/30 text-yellow-400">
              Ghost Mode — activity not logged
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px] gap-1">
            <Shield className="h-2.5 w-2.5" />
            {currentUser.role}
          </Badge>
          <Badge variant="neon" className="text-[10px] gap-1">
            <Zap className="h-2.5 w-2.5" />
            AI Model {SCORING_MODEL_VERSION}
          </Badge>
        </div>
      }
    >
      <div className="flex gap-4">
        <div className="flex-1 min-w-0">
          <DashboardGrid />
        </div>
        <BreakingLeadsSidebar />
      </div>
    </PageShell>
  );
}
