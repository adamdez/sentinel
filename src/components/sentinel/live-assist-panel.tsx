"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Brain,
  ChevronDown,
  ChevronUp,
  Copy,
  Lightbulb,
  MessageSquare,
  Minimize2,
  MoveUpRight,
  Shield,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import type { PreCallBrief } from "@/hooks/use-pre-call-brief";
import type { LiveCoachState } from "@/hooks/use-live-coach";

interface Props {
  brief: PreCallBrief | null;
  coach?: LiveCoachState | null;
  loading?: boolean;
  className?: string;
  variant?: "docked" | "overlay";
  popoutOpen?: boolean;
  onTogglePopout?: () => void;
}

const STAGE_LABELS: Record<string, string> = {
  connection: "Connection",
  situation: "Situation",
  problem_awareness: "Problem",
  solution_awareness: "Solution",
  consequence: "Consequence",
  commitment: "Commitment",
};

function Pill({
  label,
  tone = "default",
}: {
  label: string;
  tone?: "default" | "accent" | "muted";
}) {
  const className =
    tone === "accent"
      ? "border-primary/25 bg-primary/10 text-primary"
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

export function LiveAssistPanel({
  brief,
  coach = null,
  loading = false,
  className = "",
  variant = "docked",
  popoutOpen = false,
  onTogglePopout,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const stage = coach?.currentStage ?? brief?.currentStage ?? "situation";
  const stageReason = coach?.stageReason ?? brief?.stageReason ?? "";
  const primaryGoal = coach?.primaryGoal ?? brief?.primaryGoal ?? "";
  const nextBestQuestion = coach?.nextBestQuestion ?? brief?.nextQuestions?.[0] ?? "";

  const mergedQuestions = useMemo(() => {
    const items = [
      nextBestQuestion,
      ...(coach?.nextQuestions ?? []),
      ...(brief?.nextQuestions ?? []),
    ].filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    return Array.from(new Set(items)).slice(0, 4);
  }, [brief?.nextQuestions, coach?.nextQuestions, nextBestQuestion]);

  const empathyMoves = useMemo(() => {
    const items = [...(coach?.empathyMoves ?? []), ...(brief?.empathyMoves ?? [])];
    return items.slice(0, 4);
  }, [brief?.empathyMoves, coach?.empathyMoves]);

  const objectionHandling = useMemo(() => {
    const items = [...(coach?.objectionHandling ?? []), ...(brief?.objectionHandling ?? [])];
    return items.slice(0, 3);
  }, [brief?.objectionHandling, coach?.objectionHandling]);

  const guardrails = [...(coach?.guardrails ?? []), ...(coach?.riskFlags ?? []), ...(brief?.watchOuts ?? []), ...(brief?.riskFlags ?? [])]
    .filter(Boolean)
    .slice(0, 5);

  const buyingSignals = coach?.buyingSignals ?? [];
  const coachNotes = coach?.coachNotes ?? [];

  if (!brief && !coach && !loading) return null;

  return (
    <div
      className={`rounded-xl border border-overlay-10 bg-overlay-3 overflow-hidden ${
        variant === "overlay"
          ? "shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl"
          : ""
      } ${className}`}
    >
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-overlay-4 transition-colors"
      >
        <Brain className="h-3.5 w-3.5 text-primary/80" />
        <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex-1 text-left">
          Live Coach
        </span>
        <Pill
          label={STAGE_LABELS[stage] ?? "Situation"}
          tone="accent"
        />
        {loading && <Pill label="Refreshing" tone="muted" />}
        {coach?.source === "fallback" && <Pill label="Fallback" tone="muted" />}
        {onTogglePopout && (
          <span
            role="button"
            onClick={(event) => {
              event.stopPropagation();
              onTogglePopout();
            }}
            className="inline-flex items-center justify-center rounded-[8px] border border-overlay-8 bg-overlay-3 p-1 text-muted-foreground/60 hover:text-foreground"
            title={popoutOpen ? "Close pop-out coach" : "Pop out coach"}
          >
            {variant === "overlay" || popoutOpen
              ? <Minimize2 className="h-3 w-3" />
              : <MoveUpRight className="h-3 w-3" />}
          </span>
        )}
        {expanded
          ? <ChevronUp className="h-3 w-3 text-muted-foreground/40" />
          : <ChevronDown className="h-3 w-3 text-muted-foreground/40" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-2 border-t border-overlay-8 space-y-3">
          <div className="rounded-[10px] border border-primary/15 bg-primary/[0.05] p-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-wider text-primary/70">Next Best Question</p>
              {nextBestQuestion && (
                <button
                  type="button"
                  onClick={() => copyLine(nextBestQuestion)}
                  className="inline-flex items-center gap-1 text-xs text-primary/70 hover:text-primary"
                >
                  <Copy className="h-3 w-3" />
                  Copy
                </button>
              )}
            </div>
            <p className="text-sm text-foreground/85 mt-1 leading-snug">
              {nextBestQuestion || "Keep the seller talking and let GPT-5 gather more context."}
            </p>
          </div>

          {(stageReason || primaryGoal) && (
            <div className="grid gap-2 md:grid-cols-2">
              <div className="rounded-[8px] border border-overlay-8 bg-overlay-2 p-2.5">
                <p className="text-xs uppercase tracking-wider text-muted-foreground/50">Why This Stage</p>
                <p className="text-sm text-foreground/70 mt-1 leading-snug">{stageReason || "Drive understanding before persuasion."}</p>
              </div>
              <div className="rounded-[8px] border border-overlay-8 bg-overlay-2 p-2.5">
                <p className="text-xs uppercase tracking-wider text-muted-foreground/50">Call Goal</p>
                <p className="text-sm text-foreground/70 mt-1 leading-snug">{primaryGoal || "Clarify situation, timing, and next step."}</p>
              </div>
            </div>
          )}

          {mergedQuestions.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-primary/60">
                <Lightbulb className="h-3 w-3" />
                Backup Questions
              </div>
              <ul className="space-y-1">
                {mergedQuestions.slice(1).map((question, index) => (
                  <li key={`${question}-${index}`} className="text-sm text-foreground/65 flex items-start gap-1.5">
                    <span className="text-primary/40 mt-0.5">•</span>
                    {question}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {empathyMoves.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground/55">
                <Sparkles className="h-3 w-3" />
                Empathy Moves
              </div>
              <div className="space-y-1.5">
                {empathyMoves.map((move, index) => (
                  <div key={`${move.text}-${index}`} className="rounded-[8px] border border-overlay-6 bg-overlay-2 p-2">
                    <div className="flex items-center gap-2 mb-1">
                      <Pill
                        label={move.type === "calibrated_question" ? "Calibrated" : move.type === "label" ? "Label" : "Mirror"}
                        tone="default"
                      />
                    </div>
                    <p className="text-sm text-foreground/78 leading-snug">{move.text}</p>
                    <p className="text-xs text-muted-foreground/45 mt-1">{move.cue}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {objectionHandling.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground/55">
                <Shield className="h-3 w-3" />
                Objection Moves
              </div>
              <div className="space-y-1.5">
                {objectionHandling.map((move, index) => (
                  <div key={`${move.objection}-${index}`} className="rounded-[8px] border border-overlay-6 bg-overlay-2 p-2.5">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground/40 mb-1">{move.objection}</p>
                    <p className="text-sm text-foreground/72 leading-snug">
                      <span className="text-muted-foreground/45">Label:</span> {move.label}
                    </p>
                    <p className="text-sm text-foreground/72 leading-snug mt-1">
                      <span className="text-muted-foreground/45">Question:</span> {move.calibratedQuestion}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {coachNotes.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground/55">
                <MessageSquare className="h-3 w-3" />
                Coach Notes
              </div>
              <ul className="space-y-1">
                {coachNotes.map((note, index) => (
                  <li key={`${note}-${index}`} className="text-sm text-foreground/65 flex items-start gap-1.5">
                    <span className="text-primary/40 mt-0.5">•</span>
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(guardrails.length > 0 || buyingSignals.length > 0) && (
            <div className="grid gap-2 md:grid-cols-2">
              <div className="rounded-[8px] border border-overlay-8 bg-overlay-2 p-2.5">
                <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground/55 mb-1.5">
                  <AlertTriangle className="h-3 w-3" />
                  Guardrails
                </div>
                <ul className="space-y-1">
                  {guardrails.length > 0 ? guardrails.map((item, index) => (
                    <li key={`${item}-${index}`} className="text-sm text-foreground/60 flex items-start gap-1.5">
                      <span className="text-foreground/35 mt-0.5">!</span>
                      {item}
                    </li>
                  )) : <li className="text-sm text-muted-foreground/35">No active guardrails.</li>}
                </ul>
              </div>
              <div className="rounded-[8px] border border-overlay-8 bg-overlay-2 p-2.5">
                <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-primary/60 mb-1.5">
                  <Sparkles className="h-3 w-3" />
                  Buying Signals
                </div>
                <ul className="space-y-1">
                  {buyingSignals.length > 0 ? buyingSignals.map((item, index) => (
                    <li key={`${item}-${index}`} className="text-sm text-foreground/60 flex items-start gap-1.5">
                      <span className="text-primary/40 mt-0.5">•</span>
                      {item}
                    </li>
                  )) : <li className="text-sm text-muted-foreground/35">GPT-5 has not seen a strong signal yet.</li>}
                </ul>
              </div>
            </div>
          )}

          {coach?.transcriptExcerpt && variant === "overlay" && (
            <div className="rounded-[8px] border border-overlay-6 bg-black/20 p-2.5">
              <p className="text-xs uppercase tracking-wider text-muted-foreground/50 mb-1">Recent Transcript</p>
              <p className="text-sm text-foreground/65 whitespace-pre-wrap leading-relaxed max-h-44 overflow-y-auto">
                {coach.transcriptExcerpt}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
