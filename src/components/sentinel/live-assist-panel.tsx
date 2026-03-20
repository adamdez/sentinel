"use client";

/**
 * LiveAssistPanel — Phase 1: static prompts from pre-call brief.
 *
 * Shown during an active call (callState === "connected").
 * Surfaces the most useful talking points, suggested questions,
 * and objection rebuttals from the already-fetched pre-call brief.
 *
 * Phase 2 (future): dynamic prompts from live transcription + STT.
 */

import { useState } from "react";
import {
  Sparkles, MessageSquare, AlertTriangle, Shield,
  ChevronDown, ChevronUp, Lightbulb,
} from "lucide-react";
import type { PreCallBrief } from "@/hooks/use-pre-call-brief";

interface Props {
  brief: PreCallBrief | null;
  className?: string;
}

export function LiveAssistPanel({ brief, className = "" }: Props) {
  const [expanded, setExpanded] = useState(true);

  if (!brief) return null;

  const hasTalkingPoints = brief.talkingPoints.length > 0;
  const hasObjections = brief.objections.length > 0;
  const hasWatchOuts = brief.watchOuts.length > 0;
  const hasRiskFlags = brief.riskFlags.length > 0;

  if (!hasTalkingPoints && !hasObjections && !hasWatchOuts) return null;

  return (
    <div className={`rounded-xl border border-purple-500/20 bg-purple-500/[0.03] overflow-hidden ${className}`}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-1.5 px-3 py-2 hover:bg-purple-500/[0.03] transition-colors"
      >
        <Sparkles className="h-3 w-3 text-purple-400/60" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-purple-300/60 flex-1 text-left">
          Live Assist
        </span>
        <span className="text-[9px] text-muted-foreground/30">from brief</span>
        {expanded
          ? <ChevronUp className="h-3 w-3 text-purple-400/30" />
          : <ChevronDown className="h-3 w-3 text-purple-400/30" />
        }
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2.5 border-t border-purple-500/10 pt-2">
          {/* Suggested opener */}
          {brief.suggestedOpener && (
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-purple-300/40">
                <MessageSquare className="h-2.5 w-2.5" />
                Open with
              </div>
              <p className="text-[11px] text-foreground/70 leading-snug italic">
                &ldquo;{brief.suggestedOpener}&rdquo;
              </p>
            </div>
          )}

          {/* Key talking points */}
          {hasTalkingPoints && (
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-cyan/40">
                <Lightbulb className="h-2.5 w-2.5" />
                Ask / discuss
              </div>
              <ul className="space-y-0.5">
                {brief.talkingPoints.slice(0, 4).map((tp, i) => (
                  <li key={i} className="text-[10px] text-foreground/60 leading-snug flex items-start gap-1.5">
                    <span className="text-cyan/30 mt-0.5 shrink-0">•</span>
                    {tp}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Objection rebuttals */}
          {hasObjections && (
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-amber-400/40">
                <Shield className="h-2.5 w-2.5" />
                If they say…
              </div>
              <div className="space-y-1.5">
                {brief.objections.slice(0, 3).map((obj, i) => (
                  <div key={i} className="rounded-[6px] bg-white/[0.02] border border-white/[0.04] px-2 py-1.5">
                    <p className="text-[10px] text-amber-400/60 font-medium leading-snug mb-0.5">
                      &ldquo;{obj.objection}&rdquo;
                    </p>
                    <p className="text-[10px] text-foreground/50 leading-snug">
                      → {obj.rebuttal}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Watch outs */}
          {hasWatchOuts && (
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-orange-400/40">
                <AlertTriangle className="h-2.5 w-2.5" />
                Watch out
              </div>
              <ul className="space-y-0.5">
                {brief.watchOuts.slice(0, 3).map((wo, i) => (
                  <li key={i} className="text-[10px] text-orange-300/50 leading-snug flex items-start gap-1.5">
                    <span className="text-orange-400/30 mt-0.5 shrink-0">⚠</span>
                    {wo}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Risk flags */}
          {hasRiskFlags && (
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-red-400/40">
                <AlertTriangle className="h-2.5 w-2.5" />
                Risk flags
              </div>
              <ul className="space-y-0.5">
                {brief.riskFlags.slice(0, 3).map((rf, i) => (
                  <li key={i} className="text-[10px] text-red-300/50 leading-snug flex items-start gap-1.5">
                    <span className="text-red-400/30 mt-0.5 shrink-0">!</span>
                    {rf}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Negotiation anchor */}
          {brief.negotiationAnchor && (
            <div className="rounded-[6px] bg-emerald-500/[0.04] border border-emerald-500/10 px-2 py-1.5">
              <p className="text-[10px] text-emerald-400/50 leading-snug">
                <span className="font-medium">Anchor:</span> {brief.negotiationAnchor}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
