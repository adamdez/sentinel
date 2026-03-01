"use client";

import { useState } from "react";

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

/**
 * Full-size badge for modal headers and detail views.
 */
export function RelationshipBadge({ data }: { data: RelationshipData }) {
  const [showTip, setShowTip] = useState(false);
  const heir = isLikelyHeir(data);
  const pct = getHeirPercent(data);

  return (
    <div className="relative inline-flex" onMouseEnter={() => setShowTip(true)} onMouseLeave={() => setShowTip(false)}>
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] text-[11px] font-bold uppercase tracking-wider border backdrop-blur-sm cursor-default ${
          heir
            ? "text-purple-300 bg-purple-500/12 border-purple-500/25"
            : "text-emerald-300 bg-emerald-500/12 border-emerald-500/25"
        }`}
        style={{
          boxShadow: heir
            ? "0 0 12px rgba(168,85,247,0.15), inset 0 1px 0 rgba(168,85,247,0.1)"
            : "0 0 12px rgba(0,255,136,0.12), inset 0 1px 0 rgba(0,255,136,0.08)",
        }}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${heir ? "bg-purple-400 animate-pulse" : "bg-emerald-400"}`}
        />
        {heir ? `Likely Heir / Estate — ${pct}%` : "Property Owner"}
      </span>

      {showTip && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 rounded-[12px] bg-[#0a0a12]/95 border border-white/[0.08] backdrop-blur-xl text-[10px] shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
          <p className="font-semibold text-[11px] mb-1.5 text-foreground">
            {heir ? "Likely Heir / Estate Contact" : "Direct Property Owner"}
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
              <span className={`font-medium ${heir ? "text-purple-400" : "text-emerald-400"}`}>{pct}%</span>
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
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px w-2 h-2 rotate-45 bg-[#0a0a12]/95 border-r border-b border-white/[0.08]" />
        </div>
      )}
    </div>
  );
}

/**
 * Compact inline badge for table rows, queue cards, and tickers.
 */
export function RelationshipBadgeCompact({ data }: { data: RelationshipData }) {
  const heir = isLikelyHeir(data);
  const pct = getHeirPercent(data);

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0 rounded-[6px] text-[8px] font-bold uppercase tracking-wider border shrink-0 ${
        heir
          ? "text-purple-300 bg-purple-500/10 border-purple-500/20"
          : "text-emerald-300 bg-emerald-500/10 border-emerald-500/20"
      }`}
      title={heir ? `Likely Heir/Estate — ${pct}%` : "Property Owner"}
    >
      <span
        className={`h-1 w-1 rounded-full ${heir ? "bg-purple-400 animate-pulse" : "bg-emerald-400"}`}
      />
      {heir ? `HEIR ${pct}%` : "OWNER"}
    </span>
  );
}
