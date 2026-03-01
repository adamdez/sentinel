"use client";

import { useState, useEffect } from "react";
import { Zap, Shield, Flame, Loader2 } from "lucide-react";
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
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);

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
    toast.loading("Checking existing elite leads...", { id: "elite-seed" });
    try {
      // Step 1 — check existing leads in DB
      const check = await fetchEliteJson();
      if (!check.ok || !check.data.success) {
        toast.error(String(check.data.error ?? "Failed to check existing leads"), { id: "elite-seed" });
        console.error("[EliteSeed] Check failed:", check.data);
        return;
      }

      const existingCount = typeof check.data.count === "number" ? check.data.count : 0;
      const needsSeed = check.data.needsSeed === true;

      // Step 2 — if fewer than 10, pull fresh from PropertyRadar
      if (needsSeed) {
        toast.loading(
          `Only ${existingCount} elite leads in DB — pulling fresh from PropertyRadar...`,
          { id: "elite-seed" },
        );

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
          toast.error(msg, { id: "elite-seed" });
          console.error("[EliteSeed] POST seed failed:", seedData);

          if (existingCount > 0) {
            toast.info(`Showing ${existingCount} existing leads instead`, { duration: 4000 });
            displayEliteResults((check.data.topScores ?? []) as EliteScore[], false);
            window.dispatchEvent(new CustomEvent("sentinel:refresh-dashboard"));
          }
          return;
        }

        const newCount = typeof seedData.count === "number" ? seedData.count : 0;
        console.log(`[EliteSeed] Seeded ${newCount} leads from PropertyRadar`);

        // Step 3 — re-query to get the full enriched top 10
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
      } else {
        // DB already has >= 10 — display directly
        const topScores = (check.data.topScores ?? []) as EliteScore[];
        if (topScores.length === 0) {
          toast.info("No elite leads found — run ingest first.", { id: "elite-seed", duration: 6000 });
          return;
        }
        displayEliteResults(topScores, false);
      }

      localStorage.setItem(ELITE_SEED_FLAG, "1");
      setEliteDone(true);
      window.dispatchEvent(new CustomEvent("sentinel:refresh-dashboard"));
    } catch (err) {
      console.error("[EliteSeed] Network error:", err);
      toast.error("Network error reaching EliteSeed API", { id: "elite-seed" });
    } finally {
      setEliteLoading(false);
    }
  }

  async function handleBulkSeed() {
    setBulkConfirmOpen(false);
    setBulkLoading(true);
    toast.loading("Seeding 1000 predictive leads from PropertyRadar...", { id: "bulk-seed" });
    try {
      const res = await fetch("/api/ingest/propertyradar/bulk-seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 1000, counties: ["Spokane", "Kootenai"], userId: currentUser.id }),
      });

      let data: Record<string, unknown>;
      try {
        data = await res.json();
      } catch {
        toast.error("Bulk seed returned non-JSON — check server logs", { id: "bulk-seed" });
        return;
      }

      if (!res.ok || !data.success) {
        const msg = typeof data.error === "string" ? data.error : "Bulk seed failed";
        toast.error(msg, { id: "bulk-seed" });
        console.error("[BulkSeed] Response:", data);
        return;
      }

      const inserted = typeof data.inserted === "number" ? data.inserted : 0;
      const updCount = typeof data.updated === "number" ? data.updated : 0;
      const fetched = typeof data.totalFetched === "number" ? data.totalFetched : 0;
      const scored = typeof data.totalScored === "number" ? data.totalScored : 0;
      const aboveCut = typeof data.aboveCutoff === "number" ? data.aboveCutoff : 0;
      const topScore = typeof data.topScore === "number" ? data.topScore : 0;
      const topAddr = typeof data.topAddress === "string" ? data.topAddress : "—";
      const elapsed = typeof data.elapsed_ms === "number" ? Math.round(data.elapsed_ms / 1000) : "?";

      console.log("[BulkSeed] Complete:", data);

      toast.success(`${inserted} new leads seeded, ${updCount} updated`, {
        id: "bulk-seed",
        description: `Fetched ${fetched} → scored ${scored} → ${aboveCut} above 75 cutoff. Top: ${topScore} pts — ${topAddr}. Took ${elapsed}s.`,
        duration: 12000,
      });

      window.dispatchEvent(new CustomEvent("sentinel:refresh-dashboard"));
    } catch (err) {
      console.error("[BulkSeed] Network error:", err);
      toast.error("Network error reaching bulk seed API", { id: "bulk-seed" });
    } finally {
      setBulkLoading(false);
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
              disabled={eliteLoading || bulkLoading}
              className="relative px-4 py-1.5 rounded-[12px] font-bold text-[11px] uppercase tracking-wider
                bg-red-600 hover:bg-red-500 text-white border border-red-400/40
                shadow-[0_0_14px_rgba(255,60,60,0.45)] hover:shadow-[0_0_22px_rgba(255,60,60,0.6)]
                transition-all active:scale-95 disabled:opacity-50 disabled:cursor-wait
                flex items-center gap-1.5"
            >
              <Flame className="h-3.5 w-3.5" />
              {eliteLoading ? "Pulling…" : "TEMP — TOP 10 ELITE SEED"}
            </button>
          )}
          {currentUser.role === "admin" && (
            <button
              onClick={() => setBulkConfirmOpen(true)}
              disabled={bulkLoading || eliteLoading}
              className="relative px-4 py-1.5 rounded-[12px] font-bold text-[11px] uppercase tracking-wider
                bg-red-800 hover:bg-red-700 text-white border border-red-500/30
                shadow-[0_0_14px_rgba(200,40,40,0.35)] hover:shadow-[0_0_22px_rgba(200,40,40,0.5)]
                transition-all active:scale-95 disabled:opacity-50 disabled:cursor-wait
                flex items-center gap-1.5"
            >
              {bulkLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Flame className="h-3.5 w-3.5" />}
              {bulkLoading ? "Seeding…" : "Bulk Elite Seed 1000"}
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

      {/* Bulk Seed Confirmation Modal */}
      {bulkConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setBulkConfirmOpen(false)}
          />
          <div
            className="relative rounded-[16px] border border-red-500/20 p-6 max-w-md w-full mx-4
              bg-[#0a0a12]/95 backdrop-blur-xl shadow-[0_0_40px_rgba(255,40,40,0.15)]"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-[10px] bg-red-600/15 flex items-center justify-center">
                <Flame className="h-4 w-4 text-red-400" />
              </div>
              <h3 className="text-sm font-bold text-white">Bulk Elite Seed 1000</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
              This will pull and score <span className="text-white font-semibold">1,000 fresh leads</span> from
              PropertyRadar (Spokane + Kootenai), run full Predictive Scoring v2.1, and insert all prospects with
              blended score &ge; 75.
            </p>
            <p className="text-[10px] text-red-400/70 mb-4">
              This uses PropertyRadar API credits. Only run when you need a large fresh batch.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setBulkConfirmOpen(false)}
                className="px-4 py-1.5 rounded-[10px] text-[11px] font-semibold text-muted-foreground
                  bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkSeed}
                className="px-4 py-1.5 rounded-[10px] text-[11px] font-bold text-white uppercase tracking-wider
                  bg-red-600 hover:bg-red-500 border border-red-400/40
                  shadow-[0_0_14px_rgba(255,60,60,0.35)] hover:shadow-[0_0_22px_rgba(255,60,60,0.5)]
                  transition-all active:scale-95"
              >
                Confirm — Seed 1,000 Leads
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
