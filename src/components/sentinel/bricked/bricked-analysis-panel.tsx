"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
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

export interface BrickedAnalysisPanelProps {
  leadId: string;
  address: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  sqft?: number | null;
  yearBuilt?: number | null;
  estimatedValue?: number | null;
  computedArv?: number;
}

export function BrickedAnalysisPanel({
  leadId,
  address,
  bedrooms,
  bathrooms,
  sqft,
  yearBuilt,
}: BrickedAnalysisPanelProps) {
  const [analysis, setAnalysis] = useState<BrickedCreateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSet, setSelectedSet] = useState<Set<number>>(new Set());
  const [highlightedComp, setHighlightedComp] = useState<number | null>(null);
  const [dealConfig, setDealConfig] = useState<DealConfig>(DEFAULT_DEAL_CONFIG);
  const [configOpen, setConfigOpen] = useState(false);
  const [repairTotal, setRepairTotal] = useState<number | null>(null);
  const repairsRef = useRef<HTMLDivElement>(null);
  const fetched = useRef(false);

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
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(
          (json as { error?: string }).error ?? `Bricked returned ${res.status}`,
        );
      const data = json as BrickedCreateResponse;
      setAnalysis(data);
      const initial = new Set<number>();
      (data.comps ?? []).forEach((c, i) => {
        if (c.selected) initial.add(i);
      });
      setSelectedSet(initial);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }, [address, leadId, bedrooms, bathrooms, sqft, yearBuilt]);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    void fetchAnalysis();
  }, [fetchAnalysis]);

  const toggleComp = useCallback((idx: number) => {
    setSelectedSet((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const handlePinClick = useCallback((idx: number) => {
    setHighlightedComp(idx);
    document.getElementById(`bricked-comp-${idx}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const handleRepairsChange = useCallback((_repairs: EditableRepair[], total: number) => {
    setRepairTotal(total);
  }, []);

  const handleRepairsSave = useCallback((_repairs: EditableRepair[]) => {
    // Future: persist to owner_flags.bricked_repairs
  }, []);

  const handleConfigSave = useCallback((config: DealConfig) => {
    setDealConfig(config);
    // Future: persist to owner_flags.deal_config
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-cyan" />
        <p className="text-sm">Analyzing with Bricked AI…</p>
        <p className="text-[10px] text-muted-foreground/50">Usually 2–5 seconds</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[10px] border border-red-500/20 bg-red-500/[0.04] p-6 text-center text-sm text-red-400">
        {error}
      </div>
    );
  }

  if (!analysis) return null;

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

  const effectiveRepairCost = repairTotal ?? analysis.totalRepairCost ?? 0;
  const offerPrice = computedArv != null
    ? computeOfferPrice(computedArv, effectiveRepairCost, dealConfig)
    : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-sm font-semibold">{analysis.property.address?.fullAddress ?? address}</h2>
        <p className="text-[10px] text-muted-foreground/60 mt-0.5">
          Bricked ID: {analysis.id}
        </p>
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
        <div className="w-[240px] shrink-0 hidden lg:block">
          <BrickedDealSidebar
            arv={computedArv}
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
          />
        </div>
      </div>

      {/* Comparable Properties */}
      <div className="flex items-center gap-3 pt-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Comparable Properties
        </h3>
        <Badge variant="outline" className="text-[9px]">{selectedSet.size} selected</Badge>
        {computedArv != null && (
          <span className="ml-auto text-xs font-mono text-emerald-400">
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
      />

      {/* Mobile deal summary */}
      <div className="lg:hidden">
        <BrickedDealSidebar
          arv={computedArv}
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
