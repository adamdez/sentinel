"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Brain,
  ChevronDown,
  ChevronUp,
  Copy,
  MessageSquareText,
  Shield,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import type { PreCallBrief } from "@/hooks/use-pre-call-brief";
import type { LiveCoachState } from "@/hooks/use-live-coach";

interface Props {
  brief: PreCallBrief | null;
  coach?: LiveCoachState | null;
  loading?: boolean;
  error?: string | null;
  className?: string;
  showHeader?: boolean;
}

const STAGE_LABELS: Record<string, string> = {
  connection: "Connection",
  situation: "Situation",
  problem_awareness: "Problem",
  solution_awareness: "Relief",
  consequence: "Consequence",
  commitment: "Commitment",
};

const DEAL_MODE_LABELS: Record<NonNullable<LiveCoachState["dealMode"]>, string> = {
  discovery: "Discovery",
  objection: "Objection",
  price: "Price",
  authority: "Authority",
  close: "Close",
};

const READINESS_LABELS: Record<NonNullable<LiveCoachState["closeReadiness"]>, string> = {
  not_ready: "Not Ready",
  warming: "Warming",
  ready_for_next_step: "Ready For Next Step",
  ready_for_offer: "Ready For Offer",
  ready_for_signature_path: "Ready For Signature Path",
};

const SLOT_META: Array<{
  key: keyof NonNullable<LiveCoachState["discoveryMap"]>;
  label: string;
  emphasize?: boolean;
}> = [
  { key: "surface_problem", label: "Surface Problem" },
  { key: "property_condition", label: "Property Condition" },
  { key: "human_pain", label: "Human Pain", emphasize: true },
  { key: "desired_relief", label: "Desired Relief", emphasize: true },
  { key: "motivation", label: "Motivation" },
  { key: "timeline", label: "Timeline" },
  { key: "decision_maker", label: "Decision Maker" },
  { key: "price_posture", label: "Price Posture" },
  { key: "next_step", label: "Next Step" },
];

function Pill({
  label,
  tone = "default",
}: {
  label: string;
  tone?: "default" | "accent" | "muted" | "danger";
}) {
  const className =
    tone === "accent"
      ? "border-primary/25 bg-primary/10 text-primary"
      : tone === "danger"
        ? "border-amber-500/20 bg-amber-500/10 text-amber-200"
        : tone === "muted"
          ? "border-overlay-8 bg-overlay-3 text-muted-foreground/60"
          : "border-overlay-8 bg-overlay-4 text-foreground/75";

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

function copyLine(text: string) {
  navigator.clipboard.writeText(text).then(() => {
    toast.success("Copied to clipboard");
  }).catch(() => {
    toast.error("Could not copy");
  });
}

function statusTone(status: string): "accent" | "default" | "muted" {
  if (status === "confirmed") return "accent";
  if (status === "partial") return "default";
  return "muted";
}

function statusLabel(status: string): string {
  if (status === "confirmed") return "Confirmed";
  if (status === "partial") return "Partial";
  return "Missing";
}

function relativeFreshness(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return null;
  const deltaMs = Date.now() - ts;
  const seconds = Math.max(0, Math.round(deltaMs / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

function humanizeEnum(value: string): string {
  return value.replace(/_/g, " ");
}

const GENERIC_GUARDRAILS = new Set([
  "Keep the call calm, specific, and discovery-first.",
  "Keep the call calm, specific, and discovery-first",
]);

// ---------------------------------------------------------------------------
// Pre-call brief layout (no live coach data yet)
// ---------------------------------------------------------------------------

function BriefOnlyBody({
  brief,
  nepqQuestions,
  vossLabels,
  guardrail,
}: {
  brief: PreCallBrief | null;
  nepqQuestions: [string, string, string];
  vossLabels: [string, string, string];
  guardrail: string;
}) {
  return (
    <div className="space-y-3">
      {brief && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-[10px] border border-yellow-500/20 bg-yellow-500/[0.06] p-3">
            <p className="text-xs uppercase tracking-wider text-yellow-300/70 mb-2">NEPQ Questions</p>
            <ul className="space-y-2">
              {nepqQuestions.map((q, i) => (
                <li
                  key={`nepq-${i}`}
                  role="button"
                  onClick={() => copyLine(q)}
                  className="text-sm text-yellow-300 leading-snug cursor-pointer hover:text-yellow-200 transition-colors"
                >
                  {q}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-[10px] border border-yellow-500/20 bg-yellow-500/[0.06] p-3">
            <p className="text-xs uppercase tracking-wider text-yellow-300/70 mb-2">Tactical Labels</p>
            <ul className="space-y-2">
              {vossLabels.map((label, i) => (
                <li
                  key={`voss-${i}`}
                  role="button"
                  onClick={() => copyLine(label)}
                  className="text-sm text-yellow-300 leading-snug cursor-pointer hover:text-yellow-200 transition-colors italic"
                >
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {!GENERIC_GUARDRAILS.has(guardrail) && (
        <div className="flex items-start gap-1.5 rounded-[8px] border border-amber-500/15 bg-amber-500/[0.04] px-3 py-2 text-xs text-amber-200/70">
          <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
          <span className="leading-snug">{guardrail}</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live coach layout — compact by default, progressive disclosure
// ---------------------------------------------------------------------------

function LiveCoachBody({
  coach,
  nextBestQuestion,
  guardrail,
  primaryGoal,
  nepqQuestions,
  vossLabels,
  structuredNotes,
  discoveryRows,
}: {
  coach: LiveCoachState;
  nextBestQuestion: string;
  guardrail: string;
  primaryGoal: string;
  nepqQuestions: [string, string, string];
  vossLabels: [string, string, string];
  structuredNotes: NonNullable<LiveCoachState["structuredLiveNotes"]>;
  discoveryRows: Array<{
    key: keyof NonNullable<LiveCoachState["discoveryMap"]>;
    label: string;
    emphasize?: boolean;
    item: NonNullable<LiveCoachState["discoveryMap"]>[keyof NonNullable<LiveCoachState["discoveryMap"]>];
    isPriority: boolean;
  }>;
}) {
  const [showMoves, setShowMoves] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);

  const gapLabel = coach.highestPriorityGap.replace(/_/g, " ");
  const whyNow = coach.whyThisGapNow;
  const backup = coach.backupQuestion;
  const mirror = coach.suggestedMirror;
  const label = coach.suggestedLabel;
  const hasAlternativeMoves = Boolean(backup || mirror || label);

  const confirmed = discoveryRows.filter((r) => r.item.status === "confirmed").length;
  const partial = discoveryRows.filter((r) => r.item.status === "partial").length;
  const total = discoveryRows.length;
  const sellerFreshness = relativeFreshness(coach.lastSellerTurnAt);
  const strategistFreshness = relativeFreshness(coach.lastStrategizedAt);
  const rescueMove = coach.rescueMove;
  const closeMove = coach.closeMove;

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2 px-1 text-[11px] text-muted-foreground/55">
        <Pill
          label={sellerFreshness ? `Seller turn ${sellerFreshness}` : "No fresh seller turn"}
          tone={sellerFreshness ? "accent" : "muted"}
        />
        <Pill
          label={strategistFreshness ? `Strategy ${strategistFreshness}` : "Rules only"}
          tone={strategistFreshness ? "default" : "muted"}
        />
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        <div className="rounded-[10px] border border-overlay-8 bg-overlay-2 p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1">Mode</p>
          <div className="flex items-center gap-2 flex-wrap">
            <Pill label={DEAL_MODE_LABELS[coach.dealMode] ?? coach.dealMode} tone="accent" />
            <Pill label={READINESS_LABELS[coach.closeReadiness] ?? coach.closeReadiness} tone="default" />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground/60 leading-snug">{coach.dealModeReason}</p>
        </div>
        <div className="rounded-[10px] border border-overlay-8 bg-overlay-2 p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1">Primary Blocker</p>
          <p className="text-sm text-foreground/85">{humanizeEnum(coach.primaryBlocker)}</p>
          {coach.secondaryBlocker && (
            <p className="mt-1 text-xs text-muted-foreground/60">Next: {humanizeEnum(coach.secondaryBlocker)}</p>
          )}
        </div>
        <div className="rounded-[10px] border border-overlay-8 bg-overlay-2 p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1">Commitment</p>
          <p className="text-sm text-foreground/85">{coach.commitmentTarget}</p>
          <p className="mt-1 text-xs text-muted-foreground/60">Confidence: {coach.commitmentConfidence}</p>
        </div>
      </div>

      {coach.whatChanged.length > 0 && (
        <div className="rounded-[10px] border border-overlay-8 bg-overlay-2 p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1.5">What Changed</p>
          <ul className="space-y-1">
            {coach.whatChanged.slice(0, 3).map((change, idx) => (
              <li key={`${change}-${idx}`} className="text-xs text-foreground/70 leading-snug flex items-start gap-1.5">
                <span className="text-primary/50 mt-0.5">•</span>
                <span>{change}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── PRIMARY: Next Best Question ── */}
      <div className="rounded-[10px] border border-primary/20 bg-primary/[0.06] p-3">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-1.5">
            <Zap className="h-3 w-3 text-primary" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-primary/80">Ask next</p>
          </div>
          {nextBestQuestion && (
            <button
              type="button"
              onClick={() => copyLine(nextBestQuestion)}
              className="inline-flex items-center gap-1 text-[11px] text-primary/60 hover:text-primary transition-colors"
            >
              <Copy className="h-3 w-3" />
              Copy
            </button>
          )}
        </div>
        <p className="text-[15px] text-foreground/90 leading-snug font-medium">
          {nextBestQuestion || "Collecting context\u2026"}
        </p>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {rescueMove && (
          <div className="rounded-[10px] border border-overlay-8 bg-overlay-2 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1">Rescue Move</p>
            <p className="text-sm text-foreground/75 leading-snug">{rescueMove}</p>
          </div>
        )}
        {closeMove && (
          <div className="rounded-[10px] border border-primary/20 bg-primary/[0.04] p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-primary/70 mb-1">Close Move</p>
            <p className="text-sm text-foreground/80 leading-snug">{closeMove}</p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 px-1 text-xs text-muted-foreground/55">
        <Pill label={`Authority: ${humanizeEnum(coach.authorityStatus)}`} tone="muted" />
        <Pill label={`Price: ${humanizeEnum(coach.pricePosture)}`} tone="muted" />
        <Pill label={`Seller: ${humanizeEnum(coach.sellerPosture)}`} tone="muted" />
      </div>

      {/* ── Gap reason ── */}
      <div className="flex items-center gap-2 px-1 text-xs">
        <Pill label={gapLabel} tone="accent" />
        {whyNow && (
          <span className="text-muted-foreground/55 leading-snug line-clamp-1">{whyNow}</span>
        )}
      </div>

      {/* ── Guardrail (only if non-generic) ── */}
      {!GENERIC_GUARDRAILS.has(guardrail) && (
        <div className="flex items-start gap-1.5 rounded-[8px] border border-amber-500/15 bg-amber-500/[0.04] px-3 py-2 text-xs text-amber-200/70">
          <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
          <span className="leading-snug">{guardrail}</span>
        </div>
      )}

      {/* ── More moves toggle ── */}
      <button
        type="button"
        onClick={() => setShowMoves((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded-[8px] px-2 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50 hover:text-muted-foreground/70 hover:bg-overlay-3 transition-colors"
      >
        {showMoves ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {hasAlternativeMoves ? "More moves" : "Questions & labels"}
      </button>

      {showMoves && (
        <div className="space-y-2.5">
          {/* Alternative moves from strategist */}
          {hasAlternativeMoves && (
            <div className="space-y-1.5 px-1">
              {backup && (
                <div
                  role="button"
                  onClick={() => copyLine(backup)}
                  className="flex items-start gap-2 cursor-pointer group"
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40 mt-0.5 shrink-0 w-14">Backup</span>
                  <span className="text-sm text-foreground/70 leading-snug group-hover:text-foreground/90 transition-colors">{backup}</span>
                </div>
              )}
              {mirror && (
                <div
                  role="button"
                  onClick={() => copyLine(mirror)}
                  className="flex items-start gap-2 cursor-pointer group"
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40 mt-0.5 shrink-0 w-14">Mirror</span>
                  <span className="text-sm text-foreground/70 leading-snug italic group-hover:text-foreground/90 transition-colors">{mirror}</span>
                </div>
              )}
              {label && (
                <div
                  role="button"
                  onClick={() => copyLine(label)}
                  className="flex items-start gap-2 cursor-pointer group"
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40 mt-0.5 shrink-0 w-14">Label</span>
                  <span className="text-sm text-foreground/70 leading-snug italic group-hover:text-foreground/90 transition-colors">{label}</span>
                </div>
              )}
            </div>
          )}

          {/* NEPQ + Voss */}
          <div className="grid gap-2.5 md:grid-cols-2">
            <div className="rounded-[8px] border border-yellow-500/15 bg-yellow-500/[0.04] p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-yellow-300/60 mb-1.5">NEPQ Questions</p>
              <ul className="space-y-1.5">
                {nepqQuestions.map((q, i) => (
                  <li
                    key={`nepq-${i}`}
                    role="button"
                    onClick={() => copyLine(q)}
                    className="text-xs text-yellow-300/90 leading-snug cursor-pointer hover:text-yellow-200 transition-colors"
                  >
                    {q}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-[8px] border border-yellow-500/15 bg-yellow-500/[0.04] p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-yellow-300/60 mb-1.5">Tactical Labels</p>
              <ul className="space-y-1.5">
                {vossLabels.map((vl, i) => (
                  <li
                    key={`voss-${i}`}
                    role="button"
                    onClick={() => copyLine(vl)}
                    className="text-xs text-yellow-300/90 leading-snug cursor-pointer hover:text-yellow-200 transition-colors italic"
                  >
                    {vl}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail toggle ── */}
      <button
        type="button"
        onClick={() => setShowDetail((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded-[8px] px-2 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50 hover:text-muted-foreground/70 hover:bg-overlay-3 transition-colors"
      >
        {showDetail ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        <span>Discovery &amp; notes</span>
        <span className="ml-auto font-normal text-muted-foreground/35">
          {confirmed}/{total} confirmed{partial > 0 ? ` · ${partial} partial` : ""}
        </span>
      </button>

      {showDetail && (
        <div className="space-y-2.5">
          {/* Discovery Map — collapsed summary or expanded */}
          <div className="rounded-[10px] border border-overlay-8 bg-overlay-2 p-2.5">
            <button
              type="button"
              onClick={() => setMapExpanded((v) => !v)}
              className="flex w-full items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50">Discovery Map</p>
                <Pill label={`Gap: ${gapLabel}`} tone="accent" />
              </div>
              {mapExpanded
                ? <ChevronUp className="h-3 w-3 text-muted-foreground/35" />
                : <ChevronDown className="h-3 w-3 text-muted-foreground/35" />}
            </button>

            {mapExpanded && (
              <div className="space-y-1.5 mt-2">
                {discoveryRows.map(({ key, label: slotLabel, item, emphasize, isPriority }) => (
                  <div
                    key={key}
                    className={`rounded-[6px] border px-2.5 py-2 ${
                      isPriority
                        ? "border-primary/25 bg-primary/[0.06]"
                        : emphasize
                          ? "border-overlay-8 bg-overlay-3"
                          : "border-overlay-6 bg-overlay-2"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-xs ${emphasize ? "text-foreground font-medium" : "text-foreground/70"}`}>
                        {slotLabel}
                      </p>
                      <Pill label={statusLabel(item.status)} tone={statusTone(item.status)} />
                    </div>
                    {item.value && (
                      <p className="text-xs text-muted-foreground/60 mt-0.5 leading-snug line-clamp-2">
                        {item.value}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Structured Live Notes */}
          <div className="rounded-[10px] border border-overlay-8 bg-overlay-2 p-2.5">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1.5">
              <MessageSquareText className="h-3 w-3" />
              Structured Live Notes
            </div>
            {structuredNotes.length > 0 ? (
              <ul className="space-y-1">
                {structuredNotes.slice(0, 6).map((note) => (
                  <li key={note.id} className="text-xs text-foreground/65 flex items-start gap-1.5">
                    <span className="text-primary/35 mt-0.5">•</span>
                    <span className="leading-snug">{note.text}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground/35 italic">
                Notes appear as the call develops.
              </p>
            )}
          </div>

          {/* Call Goal */}
          {primaryGoal && (
            <div className="rounded-[8px] border border-overlay-8 bg-overlay-2 px-2.5 py-2">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/50">
                <Shield className="h-3 w-3" />
                Call Goal
              </div>
              <p className="text-xs text-foreground/65 mt-0.5 leading-snug">{primaryGoal}</p>
            </div>
          )}

          <div className="rounded-[8px] border border-overlay-8 bg-overlay-2 px-2.5 py-2">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/50">
              <Shield className="h-3 w-3" />
              After Call
            </div>
            <p className="text-xs text-foreground/65 mt-0.5 leading-snug">{coach.postCallRecommendation}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export function LiveAssistPanel({
  brief,
  coach = null,
  loading = false,
  error = null,
  className = "",
  showHeader = true,
}: Props) {
  const [expanded, setExpanded] = useState(true);

  const fallbackQuestion = brief?.nextQuestions?.[0] ?? "";
  const stage = coach?.currentStage ?? brief?.currentStage ?? "situation";
  const primaryGoal = coach?.primaryGoal ?? brief?.primaryGoal ?? "";
  const nextBestQuestion = coach?.nextBestQuestion ?? fallbackQuestion;
  const guardrail = coach?.guardrails?.[0] ?? brief?.watchOuts?.[0] ?? "Keep the call calm, specific, and discovery-first.";
  const structuredNotes = coach?.structuredLiveNotes ?? [];

  const defaultNepq: [string, string, string] = [
    brief?.nextQuestions?.[0] ?? "Can you walk me through what is going on with the property right now?",
    brief?.nextQuestions?.[1] ?? "How is this situation affecting you personally right now?",
    brief?.nextQuestions?.[2] ?? "What has you wanting to solve this now instead of letting it sit?",
  ];
  const defaultVoss: [string, string, string] = [
    "It sounds like the property is in pretty good shape overall.",
    "It sounds like this hasn't been too much of a hassle so far.",
    "It sounds like there's no real rush on your end.",
  ];
  const nepqQuestions = coach?.nepqQuestions ?? defaultNepq;
  const vossLabels = coach?.vossLabels ?? defaultVoss;

  const sourceLabel = coach?.source === "gpt5"
    ? "GPT-5"
    : coach?.source === "rules"
      ? "Rules First"
      : null;

  const discoveryRows = useMemo(() => {
    if (!coach?.discoveryMap) return [];
    return SLOT_META.map((slot) => ({
      ...slot,
      item: coach.discoveryMap[slot.key],
      isPriority: coach.highestPriorityGap === slot.key,
    }));
  }, [coach]);

  if (!brief && !coach && !loading && !error) return null;

  const body = (
    <div className={`${showHeader ? "px-3 pb-3 pt-2 border-t border-overlay-8" : "p-3"} space-y-2.5`}>
      {error && (
        <div className="rounded-[10px] border border-amber-500/20 bg-amber-500/[0.06] p-3 flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <p className="text-sm text-amber-200/80">{error}</p>
        </div>
      )}
      {coach ? (
        <LiveCoachBody
          coach={coach}
          nextBestQuestion={nextBestQuestion}
          guardrail={guardrail}
          primaryGoal={primaryGoal}
          nepqQuestions={nepqQuestions}
          vossLabels={vossLabels}
          structuredNotes={structuredNotes}
          discoveryRows={discoveryRows}
        />
      ) : (
        <BriefOnlyBody
          brief={brief}
          nepqQuestions={nepqQuestions}
          vossLabels={vossLabels}
          guardrail={guardrail}
        />
      )}
    </div>
  );

  if (!showHeader) {
    return <div className={className}>{body}</div>;
  }

  return (
    <div className={`rounded-xl border border-overlay-10 bg-overlay-3 overflow-hidden ${className}`}>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-overlay-4 transition-colors"
      >
        <Brain className="h-3.5 w-3.5 text-primary/80" />
        <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex-1 text-left">
          Live Coach
        </span>
        <Pill label={STAGE_LABELS[stage] ?? "Situation"} tone="accent" />
        {sourceLabel && <Pill label={sourceLabel} tone="muted" />}
        {loading && <Pill label="Refreshing" tone="muted" />}
        {expanded
          ? <ChevronUp className="h-3 w-3 text-muted-foreground/40" />
          : <ChevronDown className="h-3 w-3 text-muted-foreground/40" />}
      </button>

      {expanded && body}
    </div>
  );
}
