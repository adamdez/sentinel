"use client";

/**
 * master-client-file-parts.tsx
 * Shared presentational micro-components extracted from
 * master-client-file-modal.tsx to reduce file size and improve reuse.
 */

import { useState } from "react";
import { MapPin, Home, Copy, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AIScore } from "@/lib/types";

// ═══════════════════════════════════════════════════════════════════════
// InfoRow — single key-value display with optional icon
// ═══════════════════════════════════════════════════════════════════════

export function InfoRow({ icon: Icon, label, value, mono, highlight }: {
  icon: typeof MapPin; label: string; value: string | number | null | undefined; mono?: boolean; highlight?: boolean;
}) {
  if (value == null || value === "") return null;
  return (
    <div className="flex items-start gap-3 py-1.5">
      <Icon className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", highlight ? "text-cyan" : "text-muted-foreground")} />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className={cn("text-sm truncate", mono && "font-mono", highlight ? "text-neon font-semibold" : "text-foreground")}>{value}</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Section — titled card wrapper
// ═══════════════════════════════════════════════════════════════════════

export function Section({ title, icon: Icon, children }: { title: string; icon: typeof Home; children: React.ReactNode }) {
  return (
    <div className="rounded-[12px] border border-glass-border bg-secondary/10 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">{title}</p>
      </div>
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// CopyBtn — tiny clipboard button with confirmation
// ═══════════════════════════════════════════════════════════════════════

export function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
      className="p-0.5 rounded hover:bg-white/[0.06] transition-colors shrink-0"
      title="Copy"
    >
      {copied ? <CheckCircle2 className="h-3 w-3 text-cyan" /> : <Copy className="h-3 w-3 text-muted-foreground/50 hover:text-muted-foreground" />}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ScoreCard — tier-colored score display with click-to-drill
// ═══════════════════════════════════════════════════════════════════════

export const TIER_COLORS = {
  platinum: { bar: "bg-cyan-400", border: "border-cyan-400/30", glow: "rgba(0,212,255,0.3)", text: "text-cyan-300", hoverBorder: "hover:border-cyan-400/50" },
  gold:     { bar: "bg-amber-400", border: "border-amber-500/30", glow: "rgba(245,158,11,0.3)", text: "text-amber-400", hoverBorder: "hover:border-amber-400/50" },
  silver:   { bar: "bg-slate-300", border: "border-slate-400/30", glow: "rgba(148,163,184,0.3)", text: "text-slate-300", hoverBorder: "hover:border-slate-300/50" },
  bronze:   { bar: "bg-orange-500", border: "border-orange-600/30", glow: "rgba(249,115,22,0.3)", text: "text-orange-400", hoverBorder: "hover:border-orange-500/50" },
} as const;

export function getTier(score: number): keyof typeof TIER_COLORS {
  if (score >= 85) return "platinum";
  if (score >= 65) return "gold";
  if (score >= 40) return "silver";
  return "bronze";
}

const TIER_CONTEXT: Record<keyof typeof TIER_COLORS, string> = {
  platinum: "High priority — strong close potential",
  gold: "Good prospect — worth pursuing",
  silver: "Moderate — needs qualification",
  bronze: "Low priority — limited signals",
};

export function ScoreCard({ label, value, onClick }: { label: string; value: number; onClick?: () => void }) {
  const pct = Math.min(value, 100);
  const tier = getTier(value);
  const tc = TIER_COLORS[tier];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-[10px] border bg-white/[0.04] p-3 text-center transition-all duration-200 w-full",
        tc.border, tc.hoverBorder,
        "cursor-pointer hover:bg-white/[0.06] hover:shadow-[0_0_20px_var(--glow)] active:scale-[0.97]",
        "group relative overflow-hidden"
      )}
      style={{ "--glow": tc.glow } as React.CSSProperties}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <p className={cn("text-[10px] uppercase tracking-wider mb-1 transition-colors relative z-10", tc.text)}>{label}</p>
      <p className="text-xl font-bold relative z-10 transition-all" style={{ textShadow: `0 0 10px ${tc.glow}` }}>{value}</p>
      <p className="text-[9px] text-muted-foreground/70 relative z-10 mt-0.5">{TIER_CONTEXT[tier]}</p>
      <div className="h-1.5 rounded-full bg-secondary mt-2 overflow-hidden relative z-10">
        <div className={cn("h-full rounded-full transition-all", tc.bar)} style={{ width: `${pct}%` }} />
      </div>
      <p className={cn("text-[8px] mt-1.5 transition-colors relative z-10 uppercase tracking-widest font-semibold", tc.text, "opacity-60 group-hover:opacity-100")}>
        {tier.toUpperCase()} — tap to drill
      </p>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// OwnerFlag — small flag badge
// ═══════════════════════════════════════════════════════════════════════

export function OwnerFlag({ active, label, icon: Icon }: { active: boolean; label: string; icon: typeof Home }) {
  if (!active) return null;
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-medium">
      <Icon className="h-3 w-3" />{label}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// BreakdownRow — single line in a score breakdown
// ═══════════════════════════════════════════════════════════════════════

export function BreakdownRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between text-xs px-3 py-1.5 rounded-[8px] bg-white/[0.02] border border-white/[0.04]">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-mono font-semibold", color)}>{value}</span>
    </div>
  );
}
