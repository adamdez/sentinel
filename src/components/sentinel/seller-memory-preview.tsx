"use client";

/**
 * SellerMemoryPreview — abbreviated pre-call memory block.
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
  Phone, Handshake, AlertTriangle, CalendarClock, Thermometer,
  MessageSquare, Loader2, User,
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
        Loading seller memory…
      </div>
    );
  }

  if (!memory || memory.recentCalls.length === 0) return null;

  const staleDays = memory.daysSinceLastContact;
  const staleWarn = staleDays !== null && staleDays > 21;

  return (
    <div className={`rounded-xl border border-border/20 bg-muted/[0.04] p-3 space-y-2 ${className}`}>
      <div className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-foreground/70">
        <User className="h-3 w-3" />
        Seller Memory
        {staleDays !== null && (
          <span className={`ml-auto text-xs font-normal ${staleWarn ? "text-foreground" : "text-muted-foreground/40"}`}>
            Last contact {staleDays}d ago
          </span>
        )}
      </div>

      {/* Quick stats */}
      <div className="flex gap-3 text-sm text-muted-foreground/60">
        <span className="flex items-center gap-1">
          <Phone className="h-2.5 w-2.5" />
          {memory.recentCalls.length} recent call{memory.recentCalls.length !== 1 ? "s" : ""}
        </span>
        {memory.lastCallDealTemperature && (
          <span className={`flex items-center gap-1 ${TEMP_COLORS[memory.lastCallDealTemperature] ?? "text-muted-foreground/50"}`}>
            <Thermometer className="h-2.5 w-2.5" />
            {memory.lastCallDealTemperature}
          </span>
        )}
      </div>

      {/* Structured fields from last call */}
      <div className="space-y-1">
        {memory.lastCallPromises && (
          <div className="flex items-start gap-1.5 text-sm">
            <Handshake className="h-3 w-3 text-foreground/60 shrink-0 mt-0.5" />
            <span className="text-foreground/70">{memory.lastCallPromises}</span>
          </div>
        )}
        {memory.lastCallObjection && (
          <div className="flex items-start gap-1.5 text-sm">
            <AlertTriangle className="h-3 w-3 text-foreground/60 shrink-0 mt-0.5" />
            <span className="text-foreground/70">{memory.lastCallObjection}</span>
          </div>
        )}
        {memory.lastCallNextAction && (
          <div className="flex items-start gap-1.5 text-sm">
            <MessageSquare className="h-3 w-3 text-primary/60 shrink-0 mt-0.5" />
            <span className="text-foreground/70">{memory.lastCallNextAction}</span>
          </div>
        )}
        {memory.lastCallCallbackTiming && (
          <div className="flex items-start gap-1.5 text-sm">
            <CalendarClock className="h-3 w-3 text-primary/50 shrink-0 mt-0.5" />
            <span className="text-foreground/70">{memory.lastCallCallbackTiming}</span>
          </div>
        )}
      </div>

      {/* Open objections */}
      {objections.length > 0 && (
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
      )}

      {/* Last call note preview */}
      {memory.recentCalls[0] && (
        <div className="text-sm text-muted-foreground/50 leading-snug line-clamp-2 border-t border-border/10 pt-1.5 mt-1">
          {memory.recentCalls[0].notes || memory.recentCalls[0].aiSummary || "No notes from last call"}
        </div>
      )}
    </div>
  );
}
