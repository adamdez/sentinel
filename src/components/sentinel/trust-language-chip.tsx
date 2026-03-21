"use client";

/**
 * TrustLanguageChip — compact expandable trust-copy snippet
 *
 * Collapsed: shows a labeled pill (e.g. "How did you get my info?")
 * Expanded:  shows the full approved copy + tone note + copy-to-clipboard
 *
 * Designed to drop into existing surfaces without redesigning them:
 *   - warm-transfer-card (context block)
 *   - seller-memory-panel (first-contact mode)
 *   - dossier call-strategy block
 *   - review page trust language card
 *
 * Usage:
 *   <TrustLanguageChip snippetKey="how_got_info" />
 *   <TrustLanguageChip snippetKey="who_we_are" defaultOpen />
 *   <TrustLanguagePack context="inbound_first_contact" />  ← shows all relevant
 */

import { useState, useCallback } from "react";
import { ChevronDown, ChevronUp, Copy, Check, Info } from "lucide-react";
import {
  getTrustSnippet,
  getSnippetsForContext,
  type TrustSnippetKey,
  type TrustSnippetContext,
  type TrustSnippet,
} from "@/lib/trust-language";

// ── Copy-to-clipboard hook ────────────────────────────────────────────────────

function useCopyToClipboard() {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API unavailable — silently ignore
    }
  }, []);
  return { copied, copy };
}

// ── Single snippet chip ───────────────────────────────────────────────────────

interface TrustLanguageChipProps {
  snippetKey:   TrustSnippetKey;
  /** Start in expanded state */
  defaultOpen?: boolean;
  /** Compact mode: smaller text, tighter padding */
  compact?:     boolean;
  className?:   string;
}

export function TrustLanguageChip({
  snippetKey,
  defaultOpen = false,
  compact     = true,
  className   = "",
}: TrustLanguageChipProps) {
  const [open, setOpen] = useState(defaultOpen);
  const { copied, copy } = useCopyToClipboard();
  const snippet = getTrustSnippet(snippetKey);

  return (
    <div
      className={`rounded-[8px] border border-primary/[0.12] bg-primary/[0.02] overflow-hidden transition-colors hover:bg-primary/[0.035] ${className}`}
    >
      {/* Collapsed header */}
      <button
        type="button"
        className={`w-full flex items-center gap-1.5 text-left transition-colors ${
          compact ? "px-2.5 py-1.5" : "px-3 py-2"
        }`}
        onClick={() => setOpen(o => !o)}
        title={open ? "Collapse" : "Expand script"}
      >
        <Info className={`shrink-0 text-primary/50 ${compact ? "h-2.5 w-2.5" : "h-3 w-3"}`} />
        <span className={`flex-1 font-medium text-primary/80 truncate ${compact ? "text-[9px]" : "text-[10px]"}`}>
          {snippet.label}
        </span>
        {!open && (
          <span className={`text-muted-foreground/40 line-clamp-1 flex-[2] ${compact ? "text-[8px]" : "text-[9px]"}`}>
            {snippet.summary}
          </span>
        )}
        {open
          ? <ChevronUp   className="h-2.5 w-2.5 text-muted-foreground/30 shrink-0" />
          : <ChevronDown className="h-2.5 w-2.5 text-muted-foreground/30 shrink-0" />
        }
      </button>

      {/* Expanded body */}
      {open && (
        <div className={`border-t border-primary/[0.08] space-y-2 ${compact ? "px-2.5 py-2" : "px-3 py-2.5"}`}>
          {/* Approved copy */}
          <p className={`text-foreground/75 leading-relaxed whitespace-pre-line ${compact ? "text-[10px]" : "text-[11px]"}`}>
            {snippet.copy}
          </p>

          {/* Tone note */}
          <div className="flex items-start gap-1.5">
            <span className="text-[8px] font-semibold uppercase tracking-wider text-muted-foreground/35 shrink-0 mt-0.5">
              Tone
            </span>
            <p className={`text-muted-foreground/45 italic leading-snug ${compact ? "text-[9px]" : "text-[10px]"}`}>
              {snippet.toneNote}
            </p>
          </div>

          {/* Copy button */}
          <button
            type="button"
            onClick={() => copy(snippet.copy)}
            className="flex items-center gap-1 rounded-[5px] border border-white/[0.07] bg-white/[0.03] px-2 py-0.5 text-[8px] text-muted-foreground/40 hover:text-muted-foreground/70 hover:border-white/[0.12] transition-colors"
          >
            {copied
              ? <><Check className="h-2.5 w-2.5 text-foreground" /> Copied</>
              : <><Copy  className="h-2.5 w-2.5" /> Copy script</>
            }
          </button>
        </div>
      )}
    </div>
  );
}

// ── Multi-snippet pack (context-aware) ────────────────────────────────────────

interface TrustLanguagePackProps {
  /** Filter by context — shows all snippets relevant for this surface */
  context:      TrustSnippetContext;
  /** If provided, show only these keys (subset of context) */
  onlyKeys?:    TrustSnippetKey[];
  compact?:     boolean;
  /** Label shown above the pack — pass null to hide */
  label?:       string | null;
  className?:   string;
}

export function TrustLanguagePack({
  context,
  onlyKeys,
  compact   = true,
  label     = "Trust scripts",
  className = "",
}: TrustLanguagePackProps) {
  const snippets: TrustSnippet[] = onlyKeys
    ? onlyKeys.map(k => getTrustSnippet(k))
    : getSnippetsForContext(context);

  if (snippets.length === 0) return null;

  return (
    <div className={`space-y-1 ${className}`}>
      {label !== null && (
        <p className="text-[8px] font-semibold uppercase tracking-wider text-muted-foreground/35 mb-1">
          {label}
        </p>
      )}
      {snippets.map(s => (
        <TrustLanguageChip key={s.key} snippetKey={s.key} compact={compact} />
      ))}
    </div>
  );
}

// ── Inline text reference (no expand, just the summary) ──────────────────────

interface TrustSummaryLineProps {
  snippetKey: TrustSnippetKey;
  className?: string;
}

export function TrustSummaryLine({ snippetKey, className = "" }: TrustSummaryLineProps) {
  const snippet = getTrustSnippet(snippetKey);
  return (
    <p className={`text-[9px] text-muted-foreground/45 italic leading-snug ${className}`}>
      <span className="not-italic text-muted-foreground/30 font-medium">{snippet.label}: </span>
      {snippet.summary}
    </p>
  );
}
