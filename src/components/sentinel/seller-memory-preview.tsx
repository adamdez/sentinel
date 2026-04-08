"use client";

/**
 * SellerMemoryPreview - abbreviated pre-call memory block.
 *
 * Shown in the idle state when a lead is selected but before a call starts.
 * Fetches from the existing call-memory endpoint and displays the most
 * critical repeat-call signals: last call summary, open objections,
 * promises made, callback timing, deal temperature, and staleness.
 *
 * Read-only. No write paths. Degrades gracefully for first-contact leads.
 */

import { useState, useEffect } from "react";
import {
  AlertTriangle, CalendarClock,
  Loader2, User,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { RepeatCallMemory } from "@/lib/dialer/types";
import { OBJECTION_TAG_LABELS, type ObjectionTag } from "@/lib/dialer/types";

interface Props {
  leadId: string;
  className?: string;
}

const TEMP_COLORS: Record<string, string> = {
  hot: "text-red-400",
  warm: "text-amber-400",
  cool: "text-sky-400",
  cold: "text-muted-foreground/60",
  dead: "text-muted-foreground/40",
};

export function SellerMemoryPreview({ leadId, className = "" }: Props) {
  const [memory, setMemory] = useState<RepeatCallMemory | null>(null);
  const [objections, setObjections] = useState<Array<{ tag: string; note?: string | null }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMemory(null);
    setObjections([]);

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const hdrs: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) hdrs["Authorization"] = `Bearer ${session.access_token}`;

      const [memRes, objRes] = await Promise.all([
        fetch(`/api/dialer/v1/leads/${leadId}/call-memory`, { headers: hdrs }).catch(() => null),
        fetch(`/api/dialer/v1/leads/${leadId}/objections?status=open&limit=5`, { headers: hdrs }).catch(() => null),
      ]);

      if (cancelled) return;

      if (memRes?.ok) {
        const data = await memRes.json();
        setMemory(data.memory ?? null);
      }
      if (objRes?.ok) {
        const data = await objRes.json();
        setObjections(data.objections ?? []);
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [leadId]);

  if (loading) {
    return (
      <div className={`flex items-center gap-2 py-3 text-xs text-muted-foreground/50 ${className}`}>
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading seller memory...
      </div>
    );
  }

  // No memory at all and no objections - show first-contact hint instead of nothing
  if (!memory || memory.recentCalls.length === 0) {
    if (objections.length > 0) {
      // Edge case: objections exist but no calls loaded - show objections only
      return (
        <div className={`rounded-xl border border-border/20 bg-muted/[0.04] p-3 space-y-2 ${className}`}>
          <div className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-foreground/70">
            <User className="h-3 w-3" />
            Seller Memory
          </div>
          <div className="flex flex-wrap gap-1 pt-0.5">
            {objections.map((obj, i) => (
              <span
                key={i}
                className="inline-flex items-center rounded-full bg-muted/10 border border-border/20 px-1.5 py-0.5 text-xs text-foreground"
              >
                {OBJECTION_TAG_LABELS[obj.tag as ObjectionTag] ?? obj.tag}
              </span>
            ))}
          </div>
        </div>
      );
    }
    return (
      <div className={`rounded-xl border border-border/20 bg-muted/[0.04] p-3 ${className}`}>
        <div className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-foreground/70">
          <User className="h-3 w-3" />
          Seller Memory
        </div>
        <p className="text-sm text-muted-foreground/40 italic mt-1.5">
          First contact - memory will populate after calls
        </p>
      </div>
    );
  }

  const staleDays = memory.daysSinceLastContact;
  const staleWarn = staleDays !== null && staleDays > 21;

  const hasStructuredFields = !!(
    memory.lastCallSummary || memory.lastCallBullets.length > 0 ||
    memory.lastCallPromises || memory.lastCallObjection ||
    memory.lastCallNextAction || memory.lastCallCallbackTiming ||
    memory.lastCallDealTemperature
  );

  const hasCallback = !!memory.lastCallCallbackTiming;
  const lastNote = memory.recentCalls[0]?.notes || memory.recentCalls[0]?.aiSummary;

  return (
    <div className={`rounded-xl border border-border/20 bg-muted/[0.04] p-3 space-y-1.5 ${className}`}>
      {/* Header: title + quick stats */}
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-foreground/60">
        <User className="h-3 w-3" />
        Seller Memory
        <span className="flex items-center gap-2 ml-auto font-normal text-[10px]">
          <span className="text-muted-foreground/40">
            {memory.recentCalls.length} call{memory.recentCalls.length !== 1 ? "s" : ""}
          </span>
          {staleDays !== null && (
            <span className={staleWarn ? "text-amber-400/80" : "text-muted-foreground/40"}>
              {staleDays}d ago
            </span>
          )}
          {memory.lastCallDealTemperature && (
            <span className={TEMP_COLORS[memory.lastCallDealTemperature] ?? "text-muted-foreground/50"}>
              {memory.lastCallDealTemperature}
            </span>
          )}
        </span>
      </div>

      {/* Callback continuity - strongest signal, shown first */}
      {hasCallback && (
        <div className="flex items-center gap-1.5 rounded-[6px] bg-primary/[0.06] border border-primary/15 px-2 py-1 text-xs text-primary/90">
          <CalendarClock className="h-3 w-3 shrink-0" />
          <span className="font-medium">{memory.lastCallCallbackTiming}</span>
        </div>
      )}

      {/* High-signal recap bullets */}
      {memory.lastCallBullets.length > 0 && (
        <div className="space-y-1 border-b border-border/10 pb-1.5">
          {memory.lastCallBullets.map((bullet, index) => (
            <div key={`${index}-${bullet}`} className="flex items-start gap-2 text-xs">
              <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
              <span className="text-foreground/75 leading-snug">{bullet}</span>
            </div>
          ))}
        </div>
      )}

      {/* Last objection */}
      {memory.lastCallObjection && !memory.lastCallBullets.some((bullet) => bullet.includes(memory.lastCallObjection ?? "")) && (
        <div className="flex items-start gap-1.5 text-xs">
          <AlertTriangle className="h-3 w-3 text-amber-400/60 shrink-0 mt-0.5" />
          <span className="text-foreground/70 line-clamp-2">{memory.lastCallObjection}</span>
        </div>
      )}

      {/* Open objection tags */}
      {objections.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {objections.map((obj, i) => (
            <span
              key={i}
              className="inline-flex items-center rounded-full bg-muted/10 border border-border/20 px-1.5 py-0.5 text-[10px] text-foreground/80"
            >
              {OBJECTION_TAG_LABELS[obj.tag as ObjectionTag] ?? obj.tag}
            </span>
          ))}
        </div>
      )}

      {/* Last call note / AI summary - compact, truncated */}
      {lastNote && memory.lastCallBullets.length === 0 && (
        <p className="text-xs text-muted-foreground/50 leading-snug line-clamp-2 border-t border-border/10 pt-1.5">
          {lastNote}
        </p>
      )}

      {!hasStructuredFields && memory.recentCalls.length > 0 && !lastNote && (
        <p className="text-[10px] text-muted-foreground/30 italic">
          Memory populates after next call
        </p>
      )}
    </div>
  );
}
