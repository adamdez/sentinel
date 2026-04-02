"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { sentinelAuthHeaders } from "@/lib/sentinel-auth-headers";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { BrickedCreateResponse } from "@/providers/bricked/adapter";
import { BrickedPhotoCarousel } from "./bricked-photo-carousel";
import { BrickedDealSidebar } from "./bricked-deal-sidebar";
import { BrickedPropertyTabs } from "./bricked-property-tabs";
import { BrickedCompMap } from "./bricked-comp-map";
import { BrickedCompCard } from "./bricked-comp-card";
import { BrickedRepairsList, type EditableRepair } from "./bricked-repairs-list";
import {
  BrickedOfferConfigModal,
  computeOfferPrice,
  DEFAULT_DEAL_CONFIG,
  type DealConfig,
} from "./bricked-offer-config-modal";

type BrickedAnalysisResponse = BrickedCreateResponse & {
  zillowEstimate?: number | null;
  zillowEstimateUpdatedAt?: string | null;
  zillowEstimateSourceUrl?: string | null;
  zillowEstimateConfidence?: string | null;
};

export interface BrickedAnalysisPanelProps {
  leadId: string;
  address: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  sqft?: number | null;
  yearBuilt?: number | null;
  estimatedValue?: number | null;
  computedArv?: number;
  cachedBrickedResponse?: BrickedAnalysisResponse | null;
  cachedBrickedFetchedAt?: string | null;
  cachedBrickedId?: string | null;
  cachedDealConfig?: DealConfig | null;
  cachedCompSelection?: number[] | null;
  cachedRepairsEdited?: EditableRepair[] | null;
}

export function BrickedAnalysisPanel({
  leadId,
  address,
  bedrooms,
  bathrooms,
  sqft,
  yearBuilt,
  cachedBrickedResponse,
  cachedBrickedFetchedAt,
  cachedBrickedId,
  cachedDealConfig,
  cachedCompSelection,
  cachedRepairsEdited,
}: BrickedAnalysisPanelProps) {
  const hasCachedData = cachedBrickedResponse != null;

  const [analysis, setAnalysis] = useState<BrickedAnalysisResponse | null>(
    cachedBrickedResponse ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(cachedBrickedFetchedAt ?? null);
  const [selectedSet, setSelectedSet] = useState<Set<number>>(() => {
    if (cachedCompSelection) return new Set(cachedCompSelection);
    if (cachedBrickedResponse?.comps) {
      const s = new Set<number>();
      cachedBrickedResponse.comps.forEach((c, i) => { if (c.selected) s.add(i); });
      return s;
    }
    return new Set();
  });
  const [highlightedComp, setHighlightedComp] = useState<number | null>(null);
  const [dealConfig, setDealConfig] = useState<DealConfig>(cachedDealConfig ?? DEFAULT_DEAL_CONFIG);
  const [configOpen, setConfigOpen] = useState(false);
  const [repairTotal, setRepairTotal] = useState<number | null>(null);
  const repairsRef = useRef<HTMLDivElement>(null);
  const fetched = useRef(hasCachedData);

  // ── Sync cached data arriving after mount ──────────────────────────
  // useState only captures the initial value. If the parent re-renders
  // with fresh ownerFlags (e.g. after DB fetch completes), this effect
  // hydrates the panel from the cache instead of re-running analysis.
  useEffect(() => {
    if (cachedBrickedResponse && !analysis) {
      setAnalysis(cachedBrickedResponse);
      setLastFetchedAt(cachedBrickedFetchedAt ?? null);
      fetched.current = true;
      if (!cachedCompSelection && cachedBrickedResponse.comps) {
        const s = new Set<number>();
        cachedBrickedResponse.comps.forEach((c, i) => { if (c.selected) s.add(i); });
        setSelectedSet(s);
      }
    }
  }, [cachedBrickedResponse, cachedBrickedFetchedAt, cachedCompSelection, analysis]);

  const fetchAnalysis = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/bricked/analyze", {
        method: "POST",
        headers: await sentinelAuthHeaders(),
        body: JSON.stringify({
          address,
          leadId,
          bedrooms: bedrooms ?? undefined,
          bathrooms: bathrooms ?? undefined,
          squareFeet: sqft ?? undefined,
          yearBuilt: yearBuilt ?? undefined,
          // Pass cached bricked_id so the API can use /get/{id}
          // instead of /create when re-fetching previously analyzed properties
          brickedId: cachedBrickedId ?? undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(
          (json as { error?: string }).error ?? `Bricked returned ${res.status}`,
        );
      const data = json as BrickedAnalysisResponse;
      setAnalysis(data);
      setLastFetchedAt(new Date().toISOString());
      const initial = new Set<number>();
      (data.comps ?? []).forEach((c, i) => {
        if (c.selected) initial.add(i);
      });
      setSelectedSet(initial);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Analysis failed";
      if (analysis) {
        toast.error(`Refresh failed: ${msg}`);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [address, leadId, bedrooms, bathrooms, sqft, yearBuilt, analysis, cachedBrickedId]);

  useEffect(() => {
    if (fetched.current) return;
    // If we know analysis was done before (bricked_id or fetched_at exists)
    // but the full response is missing (large JSONB not returned), still
    // call the analyze endpoint — it will use the /get/{id} fallback
    // instead of creating a new analysis from scratch.
    fetched.current = true;
    void fetchAnalysis();
  }, [fetchAnalysis]);

  const persistToOwnerFlags = useCallback(
    async (patch: Record<string, unknown>) => {
      try {
        const headers = await sentinelAuthHeaders();
        await fetch("/api/bricked/persist-config", {
          method: "POST",
          headers,
          body: JSON.stringify({ leadId, ...patch }),
        });
      } catch {
        // non-blocking — cache persists next time
      }
    },
    [leadId],
  );

  const toggleComp = useCallback((idx: number) => {
    setSelectedSet((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      void persistToOwnerFlags({ bricked_comp_selection: Array.from(next) });
      return next;
    });
  }, [persistToOwnerFlags]);

  const handlePinClick = useCallback((idx: number) => {
    setHighlightedComp(idx);
    document.getElementById(`bricked-comp-${idx}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const handleRepairsChange = useCallback((_repairs: EditableRepair[], total: number) => {
    setRepairTotal(total);
  }, []);

  const handleRepairsSave = useCallback(
    (repairs: EditableRepair[]) => {
      void persistToOwnerFlags({ bricked_repairs_edited: repairs });
    },
    [persistToOwnerFlags],
  );

  const handleConfigSave = useCallback(
    (config: DealConfig) => {
      setDealConfig(config);
      void persistToOwnerFlags({ deal_config: config });
    },
    [persistToOwnerFlags],
  );

  if (loading && !analysis) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-cyan" />
        <p className="text-sm">Analyzing with Bricked AI…</p>
        <p className="text-[10px] text-muted-foreground/50">Usually 2–5 seconds</p>
      </div>
    );
  }

  if (error && !analysis) {
    return (
      <div className="rounded-[10px] border border-red-500/20 bg-red-500/[0.04] p-6 text-center text-sm text-red-400">
        {error}
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <p className="text-sm text-muted-foreground">No Bricked data pulled for this property yet.</p>
        <button
          onClick={fetchAnalysis}
          className="flex items-center gap-2 rounded-md bg-primary/15 px-4 py-2 text-sm font-medium text-primary border border-primary/25 hover:bg-primary/25 transition-colors"
        >
          Start Analysis
        </button>
      </div>
    );
  }

  const comps = analysis.comps ?? [];
  const repairs = analysis.repairs ?? [];
  const subLat = analysis.property.latitude ?? 47.65;
  const subLng = analysis.property.longitude ?? -117.43;

  const selectedComps = comps.filter((_, i) => selectedSet.has(i));
  const computedArv =
    selectedComps.length > 0
      ? selectedComps.reduce((s, c) => s + (c.adjusted_value ?? c.details?.lastSaleAmount ?? 0), 0) /
        selectedComps.length
      : analysis.arv;

  const effectiveRepairCost = repairTotal ?? analysis.totalRepairCost ?? 20000;
  const offerPrice = computedArv != null
    ? computeOfferPrice(computedArv, effectiveRepairCost, dealConfig)
    : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">{analysis.property.address?.fullAddress ?? address}</h2>
          <p className="text-xs text-muted-foreground/60 mt-0.5">
            Bricked ID: {analysis.id}
            {lastFetchedAt && (
              <span className="ml-2">
                · Last pulled {new Date(lastFetchedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={fetchAnalysis}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground border border-glass-border hover:bg-muted/10 transition-colors disabled:opacity-50 shrink-0"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Refresh
        </button>
      </div>

      {/* Two-column: photos+tabs | sidebar */}
      <div className="flex gap-4">
        <div className="flex-1 min-w-0 space-y-4">
          <BrickedPhotoCarousel
            images={analysis.property.images ?? []}
            address={analysis.property.address?.fullAddress}
          />
          <BrickedPropertyTabs property={analysis.property} />
        </div>
        <div className="w-[292px] shrink-0 hidden lg:block">
          <BrickedDealSidebar
            arv={computedArv}
            zillowEstimate={analysis.zillowEstimate}
            zillowEstimateSourceUrl={analysis.zillowEstimateSourceUrl}
            cmv={analysis.cmv}
            totalRepairCost={effectiveRepairCost}
            offerPrice={offerPrice}
            selectedCompCount={selectedSet.size}
            dashboardLink={analysis.dashboardLink}
            shareLink={analysis.shareLink}
            onScrollToRepairs={() =>
              repairsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
            onConfigureClick={() => setConfigOpen(true)}
            onRepairCostChange={setRepairTotal}
          />
        </div>
      </div>

      {/* Comparable Properties */}
      <div className="flex items-center gap-3 pt-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Comparable Properties
        </h3>
        <Badge variant="outline" className="text-[10px]">{selectedSet.size} selected</Badge>
        {computedArv != null && (
          <span className="ml-auto text-sm font-mono text-emerald-400">
            ARV {formatCurrency(computedArv)}
          </span>
        )}
      </div>

      {comps.length > 0 && (
        <BrickedCompMap
          subjectLat={subLat}
          subjectLng={subLng}
          subjectAddress={analysis.property.address?.fullAddress ?? address}
          comps={comps}
          selectedIndices={selectedSet}
          highlightedIndex={highlightedComp}
          onPinClick={handlePinClick}
        />
      )}

      <div className="space-y-3">
        {comps.map((comp, i) => (
          <BrickedCompCard
            key={i}
            comp={comp}
            index={i}
            selected={selectedSet.has(i)}
            onToggle={toggleComp}
            subjectLat={subLat}
            subjectLng={subLng}
            highlighted={highlightedComp === i}
          />
        ))}
      </div>

      {/* Repairs */}
      <BrickedRepairsList
        ref={repairsRef}
        repairs={repairs}
        totalRepairCost={analysis.totalRepairCost}
        onRepairsChange={handleRepairsChange}
        onSave={handleRepairsSave}
        initialEdited={cachedRepairsEdited}
      />

      {/* Mobile deal summary */}
      <div className="lg:hidden">
        <BrickedDealSidebar
          arv={computedArv}
          zillowEstimate={analysis.zillowEstimate}
          zillowEstimateSourceUrl={analysis.zillowEstimateSourceUrl}
          cmv={analysis.cmv}
          totalRepairCost={effectiveRepairCost}
          offerPrice={offerPrice}
          selectedCompCount={selectedSet.size}
          dashboardLink={analysis.dashboardLink}
          shareLink={analysis.shareLink}
          onScrollToRepairs={() =>
            repairsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
          onConfigureClick={() => setConfigOpen(true)}
          onRepairCostChange={setRepairTotal}
        />
      </div>

      {/* Offer Config Modal */}
      {computedArv != null && (
        <BrickedOfferConfigModal
          open={configOpen}
          onClose={() => setConfigOpen(false)}
          onSave={handleConfigSave}
          arv={computedArv}
          repairCost={effectiveRepairCost}
          initialConfig={dealConfig}
        />
      )}
    </div>
  );
}
