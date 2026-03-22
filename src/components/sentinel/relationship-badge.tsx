"use client";

import { useState, useRef, useCallback } from "react";

export interface RelationshipData {
  ownerAgeInference?: number | null;
  lifeEventProbability?: number | null;
  heirProbability?: number | null;
  tags?: string[];
  contactProbability?: number | null;
  bestAddress?: string | null;
}

function isLikelyHeir(data: RelationshipData): boolean {
  const prob = data.heirProbability ?? data.lifeEventProbability ?? 0;
  if (prob >= 0.40) return true;

  const tags = data.tags ?? [];
  const hasProbate = tags.some((t) =>
    /probate|inherited|estate|obituary/i.test(t)
  );
  if (hasProbate && (data.ownerAgeInference ?? 0) >= 70) return true;

  return false;
}

function getHeirPercent(data: RelationshipData): number {
  const raw = data.heirProbability ?? data.lifeEventProbability ?? 0;
  return Math.round(raw * 100);
}

type Placement = "top" | "bottom";
const TIP_HEIGHT_ESTIMATE = 160;
const FLIP_MARGIN = 16;

function useSmartPlacement() {
  const ref = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<Placement>("bottom");

  const recalc = useCallback(() => {
    if (!ref.current) { setPlacement("bottom"); return; }
    const rect = ref.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setPlacement(spaceBelow >= TIP_HEIGHT_ESTIMATE + FLIP_MARGIN ? "bottom" : "top");
  }, []);

  return { ref, placement, recalc } as const;
}

function TooltipContent({ data, heir, pct, placement }: {
  data: RelationshipData; heir: boolean; pct: number; placement: Placement;
}) {
  const isBottom = placement === "bottom";
  return (
    <div
      className={`absolute z-[60] left-1/2 -translate-x-1/2 w-64 p-3 rounded-[12px] bg-[rgba(8,8,16,0.96)] border border-overlay-8 backdrop-blur-2xl text-sm ${
        isBottom ? "top-full mt-2" : "bottom-full mb-2"
      }`}
      style={{
        boxShadow:
          "0 8px 40px var(--shadow-heavy), 0 0 1px var(--overlay-6), 0 0 20px var(--shadow-soft)",
      }}
    >
      {/* Holographic top edge */}
      <div className="absolute inset-x-0 top-0 h-[1px] rounded-t-[12px] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

      <p className="font-semibold text-sm mb-1.5 text-foreground">
        {heir ? "Likely Heir / Estate Contact" : "Property Owner"}
      </p>
      <div className="space-y-1 text-muted-foreground">
        {data.ownerAgeInference != null && (
          <div className="flex justify-between">
            <span>Inferred Age</span>
            <span className="text-foreground font-medium">{data.ownerAgeInference} yrs</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>Heir / Estate Prob.</span>
          <span className={`font-medium ${heir ? "text-foreground" : "text-foreground"}`}>{pct}%</span>
        </div>
        {data.contactProbability != null && (
          <div className="flex justify-between">
            <span>Contact Probability</span>
            <span className="text-foreground font-medium">{Math.round(data.contactProbability * 100)}%</span>
          </div>
        )}
        {data.tags && data.tags.length > 0 && (
          <div className="flex justify-between">
            <span>Signals</span>
            <span className="text-foreground font-medium truncate ml-2">{data.tags.slice(0, 3).join(", ")}</span>
          </div>
        )}
        {data.bestAddress && (
          <div className="flex justify-between">
            <span>Best Address</span>
            <span className="text-foreground font-medium truncate ml-2">{data.bestAddress}</span>
          </div>
        )}
      </div>

      {/* Arrow — flips depending on placement */}
      <div
        className={`absolute left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-[rgba(8,8,16,0.96)] border-overlay-8 ${
          isBottom
            ? "bottom-full mb-px border-l border-t -mt-px top-[-4px]"
            : "top-full mt-px border-r border-b -mb-px bottom-[-4px]"
        }`}
        style={{ position: "absolute" }}
      />
    </div>
  );
}

/**
 * Full-size badge for modal headers and detail views.
 */
export function RelationshipBadge({ data }: { data: RelationshipData }) {
  const [showTip, setShowTip] = useState(false);
  const { ref, placement, recalc } = useSmartPlacement();
  const heir = isLikelyHeir(data);
  const pct = getHeirPercent(data);

  const handleEnter = useCallback(() => { recalc(); setShowTip(true); }, [recalc]);

  return (
    <div
      ref={ref}
      className="relative inline-flex"
      onMouseEnter={handleEnter}
      onMouseLeave={() => setShowTip(false)}
    >
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] text-sm font-bold uppercase tracking-wider border backdrop-blur-sm cursor-default ${
          heir
            ? "text-foreground bg-muted/12 border-border/25"
            : "text-foreground bg-muted/12 border-border/25"
        }`}
        style={{
          boxShadow: heir
            ? "0 0 12px rgba(168,85,247,0.15), inset 0 1px 0 rgba(168,85,247,0.1)"
            : "0 0 12px var(--overlay-12), inset 0 1px 0 var(--overlay-8)",
        }}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${heir ? "bg-muted animate-pulse" : "bg-muted"}`}
        />
        {heir ? `Likely Heir — ${pct}%` : "Owner"}
      </span>

      {showTip && <TooltipContent data={data} heir={heir} pct={pct} placement={placement} />}
    </div>
  );
}

/**
 * Compact inline badge for table rows, queue cards, and tickers.
 */
export function RelationshipBadgeCompact({ data }: { data: RelationshipData }) {
  const [showTip, setShowTip] = useState(false);
  const { ref, placement, recalc } = useSmartPlacement();
  const heir = isLikelyHeir(data);
  const pct = getHeirPercent(data);

  const handleEnter = useCallback(() => { recalc(); setShowTip(true); }, [recalc]);

  return (
    <span
      ref={ref}
      className="relative inline-flex"
      onMouseEnter={handleEnter}
      onMouseLeave={() => setShowTip(false)}
    >
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0 rounded-[6px] text-xs font-bold uppercase tracking-wider border shrink-0 ${
          heir
            ? "text-foreground bg-muted/10 border-border/20"
            : "text-foreground bg-muted/10 border-border/20"
        }`}
      >
        <span
          className={`h-1 w-1 rounded-full ${heir ? "bg-muted animate-pulse" : "bg-muted"}`}
        />
        {heir ? `Heir ${pct}%` : "Owner"}
      </span>

      {showTip && <TooltipContent data={data} heir={heir} pct={pct} placement={placement} />}
    </span>
  );
}
