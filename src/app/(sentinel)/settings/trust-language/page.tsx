"use client";

/**
 * /settings/trust-language — Trust Language Asset Pack
 *
 * Read-only admin view of all approved trust snippets.
 * Shows version, all snippet copy, tone notes, contexts, and usage guidance.
 *
 * Adam can see the full approved pack at a glance.
 * To update copy: edit src/lib/trust-language.ts and bump TRUST_LANGUAGE_VERSION.
 *
 * Does NOT: auto-generate copy, edit in-browser without deploy, sync to website.
 */

import Link from "next/link";
import { ArrowLeft, MessageSquare, Copy, Check } from "lucide-react";
import { useState, useCallback } from "react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Badge } from "@/components/ui/badge";
import {
  getAllSnippets,
  getFirstCallSnippets,
  TRUST_LANGUAGE_VERSION,
  type TrustSnippet,
  type TrustSnippetContext,
} from "@/lib/trust-language";

// ── Context badge ─────────────────────────────────────────────────────────────

const CONTEXT_LABELS: Record<TrustSnippetContext, string> = {
  inbound_first_contact: "First contact",
  warm_transfer:         "Warm transfer",
  objection_response:    "Objection",
  call_strategy:         "Call strategy",
  always_available:      "Always",
};

const CONTEXT_COLORS: Record<TrustSnippetContext, string> = {
  inbound_first_contact: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  warm_transfer:         "bg-red-500/10 text-red-400 border-red-500/20",
  objection_response:    "bg-amber-500/10 text-amber-400 border-amber-500/20",
  call_strategy:         "bg-cyan/10 text-cyan border-cyan/20",
  always_available:      "bg-white/[0.05] text-muted-foreground/50 border-white/[0.08]",
};

function ContextBadge({ ctx }: { ctx: TrustSnippetContext }) {
  return (
    <Badge variant="outline" className={`text-[8px] px-1.5 py-0 ${CONTEXT_COLORS[ctx]}`}>
      {CONTEXT_LABELS[ctx]}
    </Badge>
  );
}

// ── Copy button ───────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* ignore */ }
  }, [text]);
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1 rounded-[5px] border border-white/[0.07] bg-white/[0.03] px-2 py-0.5 text-[8px] text-muted-foreground/40 hover:text-muted-foreground/70 hover:border-white/[0.12] transition-colors shrink-0"
    >
      {copied
        ? <><Check className="h-2.5 w-2.5 text-emerald-400" /> Copied</>
        : <><Copy  className="h-2.5 w-2.5" /> Copy</>
      }
    </button>
  );
}

// ── Snippet card ──────────────────────────────────────────────────────────────

function SnippetCard({ snippet }: { snippet: TrustSnippet }) {
  return (
    <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.01] overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-2 px-4 py-3 bg-white/[0.015]">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[11px] font-semibold text-foreground/80">{snippet.label}</h3>
            {snippet.firstCallPriority && (
              <Badge variant="outline" className="text-[8px] px-1.5 py-0 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                First-call priority
              </Badge>
            )}
          </div>
          <code className="text-[8px] text-muted-foreground/30 font-mono">{snippet.key}</code>
        </div>
        <div className="flex gap-1 flex-wrap justify-end">
          {snippet.contexts.map(ctx => (
            <ContextBadge key={ctx} ctx={ctx} />
          ))}
        </div>
      </div>

      {/* Copy */}
      <div className="px-4 py-3 space-y-2">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/35 mb-1">
            Approved copy
          </p>
          <div className="flex items-start gap-2">
            <p className="flex-1 text-[11px] text-foreground/75 leading-relaxed whitespace-pre-line">
              {snippet.copy}
            </p>
            <CopyButton text={snippet.copy} />
          </div>
        </div>

        <div>
          <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/35 mb-0.5">
            Tone note
          </p>
          <p className="text-[10px] text-muted-foreground/50 italic leading-snug">
            {snippet.toneNote}
          </p>
        </div>

        <div>
          <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/35 mb-0.5">
            Summary (collapsed display)
          </p>
          <p className="text-[10px] text-muted-foreground/50 leading-snug">
            {snippet.summary}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TrustLanguagePage() {
  const allSnippets       = getAllSnippets();
  const firstCallSnippets = getFirstCallSnippets();

  return (
    <PageShell
      title="Trust Language Pack"
      description="Approved seller-facing copy for inbound, warm transfer, and call strategy surfaces."
    >
      <div className="max-w-2xl mx-auto space-y-4">

        {/* Back */}
        <Link
          href="/settings"
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        >
          <ArrowLeft className="h-3 w-3" />
          Settings
        </Link>

        {/* Version banner */}
        <GlassCard hover={false} className="!p-4">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-4 w-4 text-cyan/50 shrink-0" />
            <div className="flex-1">
              <p className="text-[11px] font-semibold text-foreground/80">
                Trust Language Pack
                <code className="ml-2 text-[9px] font-mono text-muted-foreground/40">v{TRUST_LANGUAGE_VERSION}</code>
              </p>
              <p className="text-[10px] text-muted-foreground/45 mt-0.5">
                {allSnippets.length} approved snippets · {firstCallSnippets.length} first-call priority
              </p>
            </div>
            <div className="text-right">
              <p className="text-[8px] text-muted-foreground/25 leading-snug">
                To update copy, edit<br />
                <code className="font-mono">src/lib/trust-language.ts</code><br />
                and bump the version.
              </p>
            </div>
          </div>
        </GlassCard>

        {/* Tone rules */}
        <GlassCard hover={false} className="!p-4">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/40 mb-2">
            Tone rules
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
            {[
              ["Use", "Local · Respectful · Direct · Calm · Trustworthy · Practical"],
              ["Avoid", "Investor-bro language · Fake urgency · Generic guru advice · Enterprise jargon"],
            ].map(([label, value]) => (
              <div key={label} className="col-span-2 flex gap-2">
                <span className={`font-medium shrink-0 ${label === "Use" ? "text-emerald-400" : "text-red-400"}`}>{label}:</span>
                <span className="text-muted-foreground/60">{value}</span>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Snippet cards */}
        <div className="space-y-3">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/40">
            All snippets ({allSnippets.length})
          </p>
          {allSnippets.map(snippet => (
            <SnippetCard key={snippet.key} snippet={snippet} />
          ))}
        </div>

        {/* Usage note */}
        <GlassCard hover={false} className="!p-3">
          <p className="text-[9px] text-muted-foreground/30 leading-relaxed">
            <strong className="text-muted-foreground/50">Where these appear:</strong>{" "}
            First-call priority snippets surface in the seller memory panel when totalCalls === 0.
            Warm-transfer snippets appear in the warm-transfer card context block.
            All snippets are available via <code className="text-[8px]">TrustLanguageChip</code> or{" "}
            <code className="text-[8px]">TrustLanguagePack</code> components.
            Copy is static — changes require a code deploy (auditable).
          </p>
        </GlassCard>

      </div>
    </PageShell>
  );
}
