"use client";

/**
 * PromptVersionBadge
 *
 * Compact inline badge showing workflow + version + status for a traced AI output.
 * Clicking or hovering shows description and changelog in a tooltip.
 *
 * Designed to be embedded in review surfaces (dialer review page, dossier queue)
 * without taking up meaningful vertical space.
 *
 * Props:
 *   workflow   — e.g. "summarize", "extract"
 *   version    — e.g. "2.1.0"
 *   meta?      — optional pre-fetched PromptMeta (if already loaded by parent)
 *
 * If meta is not provided, renders just workflow@version with a neutral badge.
 */

import { useState, useRef, useEffect } from "react";
import { Info } from "lucide-react";
import type { PromptMeta, PromptStatus } from "@/lib/prompt-registry";

// ── Status display config ─────────────────────────────────────────────────────

const STATUS_STYLES: Record<PromptStatus, { label: string; classes: string }> = {
  active:     { label: "active",     classes: "bg-muted/10 text-foreground border-border/20" },
  deprecated: { label: "deprecated", classes: "bg-muted/10 text-foreground border-border/20" },
  testing:    { label: "testing",    classes: "bg-muted/10 text-foreground border-border/20" },
};

// ── Component ─────────────────────────────────────────────────────────────────

interface PromptVersionBadgeProps {
  workflow: string;
  version:  string;
  meta?:    PromptMeta | null;
  /** If true, render in a compact single-line format suitable for table rows */
  compact?: boolean;
}

export function PromptVersionBadge({
  workflow,
  version,
  meta,
  compact = false,
}: PromptVersionBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close tooltip on outside click
  useEffect(() => {
    if (!showTooltip) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShowTooltip(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showTooltip]);

  const status = meta?.status ?? null;
  const statusStyle = status ? STATUS_STYLES[status] : null;
  const hasDetail = !!(meta?.description || meta?.changelog);

  if (compact) {
    return (
      <div ref={ref} className="relative inline-flex items-center gap-1">
        <span className="font-mono text-sm text-muted-foreground/50">
          {workflow}@{version}
        </span>
        {statusStyle && (
          <span className={`text-xs px-1 py-0.5 rounded border font-medium ${statusStyle.classes}`}>
            {statusStyle.label}
          </span>
        )}
        {hasDetail && (
          <button
            onClick={() => setShowTooltip(v => !v)}
            className="text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors"
            aria-label="Prompt details"
          >
            <Info className="h-2.5 w-2.5" />
          </button>
        )}
        {showTooltip && meta && (
          <TooltipCard meta={meta} onClose={() => setShowTooltip(false)} />
        )}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative inline-flex items-start gap-1.5 flex-wrap">
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-sm text-muted-foreground/60">
          {workflow}
        </span>
        <span className="text-sm text-muted-foreground/30">v{version}</span>
      </div>
      {statusStyle && (
        <span className={`text-sm px-1.5 py-0.5 rounded-full border font-medium ${statusStyle.classes}`}>
          {statusStyle.label}
        </span>
      )}
      {hasDetail && (
        <button
          onClick={() => setShowTooltip(v => !v)}
          className="text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors mt-0.5"
          aria-label="Prompt details"
        >
          <Info className="h-3 w-3" />
        </button>
      )}
      {showTooltip && meta && (
        <TooltipCard meta={meta} onClose={() => setShowTooltip(false)} />
      )}
    </div>
  );
}

// ── Tooltip card ──────────────────────────────────────────────────────────────

function TooltipCard({
  meta,
  onClose,
}: {
  meta: PromptMeta;
  onClose: () => void;
}) {
  return (
    <div className="absolute left-0 top-full mt-1.5 z-50 w-72 rounded-lg border border-border/60 bg-popover shadow-xl p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-medium text-foreground/80">
          {meta.workflow} v{meta.version}
        </span>
        <button
          onClick={onClose}
          className="text-muted-foreground/30 hover:text-muted-foreground text-xs leading-none"
        >
          ✕
        </button>
      </div>

      {meta.description && (
        <p className="text-sm text-muted-foreground leading-snug">
          {meta.description}
        </p>
      )}

      {meta.changelog && (
        <div className="border-t border-border/40 pt-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/40 mb-1">
            What changed
          </p>
          <p className="text-sm text-muted-foreground/70 leading-snug italic">
            {meta.changelog}
          </p>
        </div>
      )}
    </div>
  );
}
