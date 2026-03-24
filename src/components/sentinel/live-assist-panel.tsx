"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Brain,
  ChevronDown,
  ChevronUp,
  Copy,
  MessageSquareText,
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
  error?: string | null;
  className?: string;
  variant?: "docked" | "overlay";
  popoutOpen?: boolean;
  onTogglePopout?: () => void;
}

const STAGE_LABELS: Record<string, string> = {
  connection: "Connection",
  situation: "Situation",
  problem_awareness: "Problem",
  solution_awareness: "Relief",
  consequence: "Consequence",
  commitment: "Commitment",
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

export function LiveAssistPanel({
  brief,
  coach = null,
  loading = false,
  error = null,
  className = "",
  variant = "docked",
  popoutOpen = false,
  onTogglePopout,
}: Props) {
  const [expanded, setExpanded] = useState(true);

  const fallbackQuestion = brief?.nextQuestions?.[0] ?? "";
  const stage = coach?.currentStage ?? brief?.currentStage ?? "situation";
  const stageReason = coach?.whyThisGapNow ?? coach?.stageReason ?? brief?.stageReason ?? "";
  const primaryGoal = coach?.primaryGoal ?? brief?.primaryGoal ?? "";
  const nextBestQuestion = coach?.nextBestQuestion ?? fallbackQuestion;
  const backupQuestion = coach?.backupQuestion ?? brief?.nextQuestions?.[1] ?? null;
  const suggestedMirror = coach?.suggestedMirror ?? coach?.empathyMoves?.find((move) => move.type === "mirror")?.text ?? null;
  const suggestedLabel = coach?.suggestedLabel ?? coach?.empathyMoves?.find((move) => move.type === "label")?.text ?? null;
  const guardrail = coach?.guardrails?.[0] ?? brief?.watchOuts?.[0] ?? "Keep the call calm, specific, and discovery-first.";
  const structuredNotes = coach?.structuredLiveNotes ?? [];

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

  return (
    <div
      className={`rounded-xl border border-overlay-10 bg-overlay-3 overflow-hidden ${
        variant === "overlay"
          ? "shadow-[0_24px_80px_var(--shadow-heavy)] backdrop-blur-xl"
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
        <Pill label={STAGE_LABELS[stage] ?? "Situation"} tone="accent" />
        {sourceLabel && <Pill label={sourceLabel} tone="muted" />}
        {loading && <Pill label="Refreshing" tone="muted" />}
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
          {error && !coach && (
            <div className="rounded-[10px] border border-amber-500/20 bg-amber-500/[0.06] p-3 flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <p className="text-sm text-amber-200/80">{error}</p>
            </div>
          )}
          {!coach && !error && (
            <div className="rounded-[10px] border border-primary/15 bg-primary/[0.05] p-3">
              <p className="text-xs uppercase tracking-wider text-primary/70">Next Best Question</p>
              <p className="text-sm text-foreground/85 mt-1 leading-snug">
                {nextBestQuestion || "The live coach is still collecting context."}
              </p>
              {(stageReason || primaryGoal) && (
                <p className="text-xs text-muted-foreground/50 mt-2 leading-snug">
                  {[stageReason, primaryGoal].filter(Boolean).join(" ")}
                </p>
              )}
            </div>
          )}

          {coach && (
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="space-y-3">
                <div className="rounded-[10px] border border-overlay-8 bg-overlay-2 p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground/55">Discovery Map</p>
                    <Pill
                      label={`Gap: ${coach.highestPriorityGap.replace(/_/g, " ")}`}
                      tone="accent"
                    />
                  </div>

                  <div className="space-y-2">
                    {discoveryRows.map(({ key, label, item, emphasize, isPriority }) => (
                      <div
                        key={key}
                        className={`rounded-[8px] border p-2.5 ${
                          isPriority
                            ? "border-primary/25 bg-primary/[0.06]"
                            : emphasize
                              ? "border-overlay-8 bg-overlay-3"
                              : "border-overlay-6 bg-overlay-2"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-sm ${emphasize ? "text-foreground font-medium" : "text-foreground/75"}`}>
                            {label}
                          </p>
                          <Pill label={statusLabel(item.status)} tone={statusTone(item.status)} />
                        </div>
                        <p className="text-sm text-muted-foreground/70 mt-1 leading-snug">
                          {item.value ?? "Still missing."}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[10px] border border-overlay-8 bg-overlay-2 p-3">
                  <div className="flex items-center gap-1.5 mb-2 text-xs uppercase tracking-wider text-muted-foreground/55">
                    <MessageSquareText className="h-3 w-3" />
                    Structured Live Notes
                  </div>
                  {structuredNotes.length > 0 ? (
                    <ul className="space-y-1.5">
                      {structuredNotes.slice(0, 6).map((note) => (
                        <li key={note.id} className="text-sm text-foreground/72 flex items-start gap-2">
                          <span className="text-primary/40 mt-0.5">•</span>
                          <span>{note.text}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground/40 italic">
                      Structured notes will appear as the call develops.
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-[10px] border border-primary/15 bg-primary/[0.05] p-3">
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
                  <p className="text-sm text-foreground/90 mt-1 leading-snug">
                    {nextBestQuestion || "The live coach is still collecting context."}
                  </p>
                  <p className="text-xs text-muted-foreground/45 mt-2 leading-snug">
                    Advisory only. The coach updates after the answer shows up in live notes or transcript capture.
                  </p>
                </div>

                <div className="grid gap-3">
                  <div className="rounded-[10px] border border-overlay-8 bg-overlay-2 p-3">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground/55">Why Now</p>
                    <p className="text-sm text-foreground/72 mt-1 leading-snug">
                      {stageReason || "Stay on the clearest open gap before moving ahead."}
                    </p>
                  </div>

                  {backupQuestion && (
                    <div className="rounded-[10px] border border-overlay-8 bg-overlay-2 p-3">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground/55">Backup Question</p>
                      <p className="text-sm text-foreground/72 mt-1 leading-snug">{backupQuestion}</p>
                    </div>
                  )}

                  {(suggestedMirror || suggestedLabel) && (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-[10px] border border-overlay-8 bg-overlay-2 p-3">
                        <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground/55">
                          <Sparkles className="h-3 w-3" />
                          Suggested Mirror
                        </div>
                        <p className="text-sm text-foreground/72 mt-1 leading-snug">
                          {suggestedMirror ?? "None right now."}
                        </p>
                      </div>
                      <div className="rounded-[10px] border border-overlay-8 bg-overlay-2 p-3">
                        <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground/55">
                          <Sparkles className="h-3 w-3" />
                          Suggested Label
                        </div>
                        <p className="text-sm text-foreground/72 mt-1 leading-snug">
                          {suggestedLabel ?? "None right now."}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="rounded-[10px] border border-amber-500/15 bg-amber-500/[0.06] p-3">
                    <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-amber-200/80">
                      <AlertTriangle className="h-3 w-3" />
                      Guardrail
                    </div>
                    <p className="text-sm text-foreground/72 mt-1 leading-snug">
                      {guardrail}
                    </p>
                  </div>

                  {primaryGoal && (
                    <div className="rounded-[10px] border border-overlay-8 bg-overlay-2 p-3">
                      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground/55">
                        <Shield className="h-3 w-3" />
                        Call Goal
                      </div>
                      <p className="text-sm text-foreground/72 mt-1 leading-snug">{primaryGoal}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
