"use client";

/**
 * QualGapStrip — qualification checklist display
 *
 * Compact read-only strip showing which qualification items are known vs unknown
 * for a lead. Does NOT block publish. Informational only.
 *
 * Two display modes:
 *   compact  — horizontal chip strip (for PostCallPanel Step 3)
 *   expanded — vertical list with questions (for review surface / Lead Detail)
 *
 * Tone rules:
 *   - Unknown items use neutral grey — never red, never "bad"
 *   - Known items show a quiet green check
 *   - The suggested follow-up question is soft, not alarming
 *   - High-priority unknowns are visually slightly more prominent, not urgent
 */

import { Check, HelpCircle, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import type { QualGapItem, QualChecklistItem } from "@/lib/dialer/qual-checklist";
import { computeQualGaps, nextQualQuestion } from "@/lib/dialer/qual-checklist";
import type { QualCheckInput } from "@/lib/dialer/qual-checklist";

// ── Re-export for convenience ─────────────────────────────────────────────────
export type { QualCheckInput };

// ── Chip colors ───────────────────────────────────────────────────────────────

function chipClass(item: QualGapItem): string {
  if (item.known) {
    return "bg-emerald-500/[0.06] border-emerald-500/15 text-emerald-400/60";
  }
  if (item.priority === "high") {
    return "bg-white/[0.04] border-white/[0.10] text-foreground/70";
  }
  return "bg-white/[0.02] border-white/[0.06] text-muted-foreground/50";
}

// ── Compact strip ─────────────────────────────────────────────────────────────

export interface QualGapStripCompactProps {
  input: QualCheckInput;
  /** Show the next-question suggestion below the strip */
  showNextQuestion?: boolean;
  className?: string;
}

export function QualGapStripCompact({
  input,
  showNextQuestion = true,
  className = "",
}: QualGapStripCompactProps) {
  const items = computeQualGaps(input);
  const gaps  = items.filter((i) => !i.known);
  const next  = nextQualQuestion(gaps);

  if (items.length === 0) return null;

  return (
    <div className={`space-y-1.5 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/40">
          Qual checklist
        </span>
        {gaps.length === 0 ? (
          <span className="text-[9px] text-emerald-400/60 font-medium ml-auto">All known</span>
        ) : (
          <span className="text-[9px] text-muted-foreground/40 ml-auto">
            {gaps.length} still unknown
          </span>
        )}
      </div>

      {/* Chip row */}
      <div className="flex flex-wrap gap-1">
        {items.map((item) => (
          <span
            key={item.key}
            title={item.known ? "Known" : item.question}
            className={`inline-flex items-center gap-0.5 rounded-[5px] border px-1.5 py-0.5 text-[10px] font-medium transition-colors ${chipClass(item)}`}
          >
            {item.known ? (
              <Check className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
            ) : (
              <HelpCircle className="h-2.5 w-2.5 shrink-0 opacity-50" aria-hidden="true" />
            )}
            {item.label}
          </span>
        ))}
      </div>

      {/* Next question suggestion */}
      {showNextQuestion && next && (
        <p className="text-[10px] text-muted-foreground/40 leading-snug px-0.5">
          <span className="text-muted-foreground/30">Ask: </span>
          <span className="italic">{next}</span>
        </p>
      )}
    </div>
  );
}

// ── Expanded list (for review surface) ───────────────────────────────────────

export interface QualGapListProps {
  input: QualCheckInput;
  /** Show known items in the list (default: false — gaps only) */
  showKnown?: boolean;
  /** Collapsible (default: true) */
  collapsible?: boolean;
  defaultOpen?: boolean;
  className?: string;
}

export function QualGapList({
  input,
  showKnown = false,
  collapsible = true,
  defaultOpen = false,
  className = "",
}: QualGapListProps) {
  const [open, setOpen] = useState(defaultOpen);
  const items = computeQualGaps(input);
  const gaps  = items.filter((i) => !i.known);
  const display = showKnown ? items : gaps;

  if (gaps.length === 0 && !showKnown) {
    return (
      <div className={`flex items-center gap-1.5 px-1 ${className}`}>
        <Check className="h-3 w-3 text-emerald-400/60 shrink-0" aria-hidden="true" />
        <span className="text-[11px] text-emerald-400/60">All qualification items known</span>
      </div>
    );
  }

  const header = (
    <div className="flex items-center gap-1.5">
      <HelpCircle className="h-2.5 w-2.5 text-muted-foreground/40 shrink-0" aria-hidden="true" />
      <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/40 flex-1">
        Qual gaps
      </span>
      <span className="text-[9px] text-muted-foreground/35">
        {gaps.length} of {items.length} unknown
      </span>
      {collapsible && (
        open
          ? <ChevronUp   className="h-3 w-3 text-muted-foreground/25" aria-hidden="true" />
          : <ChevronDown className="h-3 w-3 text-muted-foreground/25" aria-hidden="true" />
      )}
    </div>
  );

  return (
    <div className={className}>
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full hover:opacity-80 transition-opacity"
        >
          {header}
        </button>
      ) : (
        <div>{header}</div>
      )}

      {(!collapsible || open) && (
        <div className="mt-1.5 space-y-0.5">
          {display.map((item) => (
            <QualGapRow key={item.key} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function QualGapRow({ item }: { item: QualGapItem | QualChecklistItem & { known: boolean } }) {
  return (
    <div className={`flex items-start gap-2 rounded-[6px] px-2 py-1 ${
      (item as QualGapItem).known
        ? "bg-emerald-500/[0.03] border border-emerald-500/[0.08]"
        : "bg-white/[0.02] border border-white/[0.04]"
    }`}>
      <div className="shrink-0 mt-0.5">
        {(item as QualGapItem).known ? (
          <Check className="h-3 w-3 text-emerald-400/50" aria-hidden="true" />
        ) : (
          <HelpCircle className="h-3 w-3 text-muted-foreground/30" aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={`text-[11px] font-medium ${
            (item as QualGapItem).known ? "text-emerald-400/60" : "text-foreground/70"
          }`}>
            {item.label}
          </span>
          <span className={`text-[9px] uppercase tracking-wide shrink-0 ${
            item.priority === "high"
              ? "text-muted-foreground/35"
              : "text-muted-foreground/20"
          }`}>
            {item.priority}
          </span>
        </div>
        {!(item as QualGapItem).known && (
          <p className="text-[10px] text-muted-foreground/40 italic leading-snug mt-0.5">
            {item.question}
          </p>
        )}
      </div>
    </div>
  );
}
