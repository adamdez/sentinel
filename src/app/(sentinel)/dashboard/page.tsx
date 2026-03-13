"use client";

import { useState, useEffect } from "react";
import { Zap, Shield, Flame, Loader2, Plus } from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { DashboardGrid } from "@/components/sentinel/dashboard/dashboard-grid";
import { BreakingLeadsSidebar } from "@/components/sentinel/dashboard/breaking-leads-sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSentinelStore } from "@/lib/store";
import { useModal } from "@/providers/modal-provider";
import { SCORING_MODEL_VERSION } from "@/lib/scoring";
import { toast } from "sonner";

const ELITE_SEED_FLAG = "sentinel_elite_seed_done";

export default function DashboardPage() {
  const { currentUser, ghostMode } = useSentinelStore();
  const { openModal } = useModal();
  const [eliteDone, setEliteDone] = useState(true);
  const [eliteLoading, setEliteLoading] = useState(false);

  useEffect(() => {
    setEliteDone(localStorage.getItem(ELITE_SEED_FLAG) === "1");
  }, []);

  type EliteScore = {
    id: string; apn: string; address: string; owner_name: string;
    composite_score: number; predictive_score: number | null;
    heir_probability: number | null; tags: string[];
  };

  async function fetchEliteJson(qs = ""): Promise<{ ok: boolean; data: Record<string, unknown> }> {
    const res = await fetch(`/api/ingest/propertyradar/top10${qs}`);
    if (!res.ok) {
      const errText = await res.text().catch(() => "Unknown error");
      let errMsg = `Server returned ${res.status}`;
      try { errMsg = JSON.parse(errText).error ?? errMsg; } catch { /* keep status */ }
      return { ok: false, data: { error: errMsg } };
    }
    try {
      return { ok: true, data: await res.json() };
    } catch {
      return { ok: false, data: { error: "Non-JSON response" } };
    }
  }

  function displayEliteResults(topScores: EliteScore[], seeded: boolean) {
    const count = topScores.length;
    console.table(topScores.map((s, i) => ({
      "#": i + 1,
      Score: s.composite_score,
      Predictive: s.predictive_score ?? "—",
      HeirPct: s.heir_probability != null ? `${s.heir_probability}%` : "—",
      Owner: s.owner_name,
      Address: s.address,
      Tags: (s.tags ?? []).join(", "),
    })));

    toast.success(
      seeded ? `${count} new leads seeded and scored successfully` : `${count} Elite Predictive Leads Ready`,
      {
        id: "elite-seed",
        description: `Top score: ${topScores[0]?.composite_score ?? "?"} — ${topScores[0]?.address ?? "?"}`,
        duration: 8000,
      },
    );

    topScores.forEach((s, i) =>
      toast.info(`#${i + 1} — ${s.composite_score} pts — ${s.owner_name} — ${s.address}`, { duration: 5000 }),
    );
  }

  async function handleEliteSeed() {
    setEliteLoading(true);
    toast.loading("Pulling 10 fresh elite predictive leads from PropertyRadar...", { id: "elite-seed" });
    try {
      // Always POST — pull fresh from PropertyRadar, score, and insert
      const seedRes = await fetch("/api/ingest/propertyradar/top10", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ counties: ["Spokane", "Kootenai"] }),
      });

      let seedData: Record<string, unknown>;
      try {
        seedData = await seedRes.json();
      } catch {
        seedData = {};
      }

      if (!seedRes.ok || !seedData.success) {
        const msg = typeof seedData.error === "string" ? seedData.error : "PropertyRadar seed failed";
        toast.error(msg, {
          id: "elite-seed",
          description: "Check PROPERTYRADAR_API_KEY in environment variables and verify API credits.",
          duration: 8000,
        });
        console.error("[EliteSeed] POST seed failed:", seedData);
        return;
      }

      const newCount = typeof seedData.newInserts === "number" ? seedData.newInserts : 0;
      const updCount = typeof seedData.updated === "number" ? seedData.updated : 0;
      console.log(`[EliteSeed] Seeded ${newCount} new, ${updCount} updated from PropertyRadar`);

      // Re-query to get full enriched top 10 with predictions
      toast.loading("Scoring and ranking top 10...", { id: "elite-seed" });
      const final = await fetchEliteJson("?existingOnly=true");
      if (!final.ok || !final.data.success) {
        toast.error("Re-query after seed failed", { id: "elite-seed" });
        return;
      }

      const topScores = (final.data.topScores ?? []) as EliteScore[];
      if (topScores.length === 0) {
        toast.info("Seed completed but no leads scored >= 75. Try loosening criteria.", { id: "elite-seed", duration: 6000 });
        return;
      }

      displayEliteResults(topScores, true);
      localStorage.setItem(ELITE_SEED_FLAG, "1");
      setEliteDone(true);
      window.dispatchEvent(new CustomEvent("sentinel:refresh-dashboard"));
    } catch (err) {
      console.error("[EliteSeed] Network error:", err);
      toast.error("Network error reaching EliteSeed API — check connection", { id: "elite-seed" });
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
          <Button size="sm" className="gap-2 text-xs" onClick={() => openModal("new-prospect")}>
            <Plus className="h-3 w-3" />
            Add Lead
          </Button>
          {/* Go Prospecting button hidden — wiring preserved in handleEliteSeed */}
          {ghostMode && (
            <Badge variant="outline" className="text-[11px] gap-1 border-yellow-500/30 text-yellow-400">
              Ghost Mode — activity not logged
            </Badge>
          )}
          <Badge variant="outline" className="text-[11px] gap-1">
            <Shield className="h-3 w-3" />
            {currentUser.role}
          </Badge>
          <Badge variant="neon" className="text-[11px] gap-1">
            <Zap className="h-3 w-3" />
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
