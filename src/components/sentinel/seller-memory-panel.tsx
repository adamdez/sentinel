"use client";

/**
 * SellerMemoryPanel — Phase 3
 *
 * Repeat-call memory block. Helps Logan enter a call informed, fast, and safely.
 *
 * Data sources (all read-only, parallel fetches):
 *   1. context_snapshot  — frozen at session start via crm-bridge
 *      → qual signals, call counts, open task, last call notes
 *   2. call-memory API   — fresh from calls_log + leads at panel load time
 *      → last 3 call summaries with provenance, DM note, staleness
 *   3. objections API    — open objection tags from lead_objection_tags
 *
 * Provenance labeling rules:
 *   - Operator-written content: shown at full opacity, labeled with pen icon
 *   - AI-derived content:       shown at reduced opacity, italic, labeled with sparkle icon
 *   - Operator always takes precedence over AI for the same field
 *
 * Staleness rules (visual only — never hides data):
 *   - < 7 days:   full opacity (fresh)
 *   - 7–21 days:  slightly dimmed, "Xd ago" label
 *   - > 21 days:  more dimmed, orange age warning
 *
 * BOUNDARY: This component may only receive a CRMLeadContext-shaped prop
 * or fetch from dialer-owned API routes. It MUST NOT query CRM tables directly.
 */

import { useState, useEffect, useCallback } from "react";
import {
  Brain, Phone, CalendarClock, TrendingUp, Clock, Loader2,
  MessageSquare, Sparkles, CheckSquare, AlertTriangle,
  User, ChevronDown, ChevronUp, Pen, Handshake, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/sentinel/glass-card";
import { supabase } from "@/lib/supabase";
import type { CRMLeadContext, RepeatCallMemory, CallMemoryEntry } from "@/lib/dialer/types";
import { OBJECTION_TAG_LABELS, type ObjectionTag } from "@/lib/dialer/types";
import { TrustLanguagePack } from "@/components/sentinel/trust-language-chip";

// ── Constants ─────────────────────────────────────────────────────────────────

const TIMELINE_LABELS: Record<string, string> = {
  immediate: "Immediate",
  "30_days": "30 days",
  "60_days": "60 days",
  flexible:  "Flexible",
  unknown:   "Unknown",
};

const ROUTE_LABELS: Record<string, { label: string; color: string }> = {
  offer_ready: { label: "Offer Ready",  color: "text-emerald-400" },
  follow_up:   { label: "Follow Up",    color: "text-primary" },
  nurture:     { label: "Nurture",      color: "text-sky-400" },
  dead:        { label: "Dead",         color: "text-muted-foreground/50" },
  escalate:    { label: "Escalate",     color: "text-amber-400" },
};

const DISPO_LABELS: Record<string, string> = {
  completed:      "Talked",
  follow_up:      "Follow up",
  appointment:    "Appointment",
  offer_made:     "Offer made",
  not_interested: "Not interested",
  voicemail:      "Voicemail",
  no_answer:      "No answer",
  disqualified:   "Disqualified",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (session?.access_token) h["Authorization"] = `Bearer ${session.access_token}`;
  return h;
}

/** Returns staleness class + label for a days-ago value */
function stalenessStyle(daysAgo: number | null): { opacity: string; label: string | null; warn: boolean } {
  if (daysAgo === null) return { opacity: "opacity-40", label: null, warn: false };
  if (daysAgo < 7)  return { opacity: "opacity-100", label: null,       warn: false };
  if (daysAgo < 21) return { opacity: "opacity-70",  label: `${daysAgo}d ago`, warn: false };
  return              { opacity: "opacity-50",  label: `${daysAgo}d ago`, warn: true };
}

function daysAgo(isoDate: string): number {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / 86_400_000);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function fmtDuration(sec: number | null): string | null {
  if (!sec || sec < 5) return null;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MotivationDots({ level }: { level: number | null }) {
  if (level == null) return <span className="text-sm text-muted-foreground/40">—</span>;
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={`h-2 w-2 rounded-full transition-colors ${
            n <= level
              ? level >= 4 ? "bg-muted" : level >= 2 ? "bg-primary" : "bg-muted"
              : "bg-overlay-8"
          }`}
        />
      ))}
      <span className="ml-1 text-sm text-muted-foreground/50">{level}/5</span>
    </div>
  );
}

/** Provenance badge — operator pen or AI sparkle */
function ProvenanceBadge({ source }: { source: "operator" | "ai" | "system" | null }) {
  if (!source || source === "system") return null;
  if (source === "operator") {
    return (
      <span title="Operator-confirmed" className="flex items-center gap-0.5 text-xs text-primary/50 font-medium shrink-0">
        <Pen className="h-2 w-2" aria-hidden="true" />
        confirmed
      </span>
    );
  }
  return (
    <span title="AI-derived — not operator-confirmed" className="flex items-center gap-0.5 text-xs text-foreground/50 italic shrink-0">
      <Sparkles className="h-2 w-2" aria-hidden="true" />
      AI
    </span>
  );
}

/** A single call entry in the history strip */
function CallHistoryRow({ call, index }: { call: CallMemoryEntry; index: number }) {
  const [expanded, setExpanded] = useState(index === 0); // first call expanded by default
  const age  = daysAgo(call.date);
  const { opacity, label: ageLabel, warn } = stalenessStyle(age);
  const content = call.preferSource === "notes" ? call.notes : call.aiSummary;
  const sourceLabel = call.preferSource === "notes" ? call.noteSourceLabel : call.aiSourceLabel;
  const isAi    = call.preferSource === "ai";
  const hasContent = !!content;
  const dur = fmtDuration(call.durationSec);

  return (
    <div className={`rounded-[8px] border border-overlay-5 bg-overlay-2 overflow-hidden ${opacity}`}>
      {/* Row header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-overlay-2 transition-colors"
      >
        <span className={`text-sm font-semibold shrink-0 ${warn ? "text-foreground/70" : "text-muted-foreground/60"}`}>
          {fmtDate(call.date)}
        </span>
        {ageLabel && (
          <span className={`text-xs shrink-0 ${warn ? "text-foreground/50" : "text-muted-foreground/35"}`}>
            {ageLabel}
          </span>
        )}
        {call.disposition && (
          <span className="text-sm text-foreground/60 font-medium truncate flex-1">
            {DISPO_LABELS[call.disposition] ?? call.disposition.replace(/_/g, " ")}
          </span>
        )}
        {dur && (
          <span className="text-xs text-muted-foreground/30 shrink-0">{dur}</span>
        )}
        {isAi && hasContent && (
          <span title="AI summary"><Sparkles className="h-2.5 w-2.5 text-foreground/40 shrink-0" /></span>
        )}
        {!isAi && hasContent && (
          <span title="Operator notes"><Pen className="h-2.5 w-2.5 text-primary/40 shrink-0" /></span>
        )}
        {hasContent && (
          expanded
            ? <ChevronUp   className="h-3 w-3 text-muted-foreground/25 shrink-0" />
            : <ChevronDown className="h-3 w-3 text-muted-foreground/25 shrink-0" />
        )}
      </button>

      {/* Content */}
      {expanded && hasContent && (
        <div className="px-2.5 pb-2 pt-0.5 border-t border-overlay-4">
          {sourceLabel && (
            <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground/40">
              {sourceLabel}
            </p>
          )}
          {isAi ? (
            <p className="text-sm text-foreground/50 italic leading-relaxed line-clamp-4">
              {content}
            </p>
          ) : (
            <p className="text-sm text-foreground/75 leading-relaxed line-clamp-5 whitespace-pre-wrap">
              {content}
            </p>
          )}
          {isAi && (
            <span className="text-xs text-foreground/40 italic mt-0.5 block">AI summary — not operator-confirmed</span>
          )}
        </div>
      )}

      {expanded && !hasContent && (
        <div className="px-2.5 pb-2 pt-0.5 border-t border-overlay-4">
          <p className="text-sm text-muted-foreground/25 italic">No notes recorded</p>
        </div>
      )}
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface OpenObjection {
  id:         string;
  tag:        string;
  note:       string | null;
  created_at: string;
}

export interface SellerMemoryPanelProps {
  sessionId: string;
  /** Optional: pass context directly if already loaded (avoids extra fetch) */
  context?: CRMLeadContext | null;
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SellerMemoryPanel({ sessionId, context: contextProp, className = "" }: SellerMemoryPanelProps) {
  const [context, setContext]     = useState<CRMLeadContext | null>(contextProp ?? null);
  const [ctxLoading, setCtxLoading] = useState(!contextProp);
  const [error, setError]         = useState<string | null>(null);

  // Rich memory (last 3 calls + DM note)
  const [memory, setMemory]       = useState<RepeatCallMemory | null>(null);
  const [memLoading, setMemLoading] = useState(false);

  // Open objection tags
  const [objections, setObjections] = useState<OpenObjection[]>([]);

  // Expandable sections
  const [historyOpen, setHistoryOpen] = useState(true);
  const [qualOpen,    setQualOpen]    = useState(false);

  // ── Fetch context snapshot ──────────────────────────────────────────────
  useEffect(() => {
    if (contextProp !== undefined) {
      setContext(contextProp);
      setCtxLoading(false);
      return;
    }
    let cancelled = false;
    setCtxLoading(true);
    authHeaders()
      .then((h) => fetch(`/api/dialer/v1/sessions/${sessionId}`, { headers: h }))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
      .then((data: { session: { context_snapshot?: CRMLeadContext | null } }) => {
        if (!cancelled) {
          setContext(data.session?.context_snapshot ?? null);
          setCtxLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) { setError("Could not load seller history"); setCtxLoading(false); }
      });
    return () => { cancelled = true; };
  }, [sessionId, contextProp]);

  // ── Parallel fetch: rich memory + objections once leadId is known ────────
  const fetchMemory = useCallback((leadId: string) => {
    setMemLoading(true);
    authHeaders()
      .then((h) => fetch(`/api/dialer/v1/leads/${leadId}/call-memory`, { headers: h }))
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { memory?: RepeatCallMemory } | null) => {
        if (data?.memory) setMemory(data.memory);
      })
      .catch(() => {})
      .finally(() => setMemLoading(false));
  }, []);

  const fetchObjections = useCallback((leadId: string) => {
    authHeaders()
      .then((h) => fetch(`/api/dialer/v1/leads/${leadId}/objections?status=open&limit=5`, { headers: h }))
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { objections?: OpenObjection[] } | null) => {
        if (data?.objections) setObjections(data.objections);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const leadId = context?.leadId;
    if (!leadId) return;
    fetchMemory(leadId);
    fetchObjections(leadId);
  }, [context?.leadId, fetchMemory, fetchObjections]);

  // ── Loading ──────────────────────────────────────────────────────────────
  const loading = ctxLoading;

  // ── Staleness for quick stats ────────────────────────────────────────────
  const lastContactDays = memory?.daysSinceLastContact ?? null;
  const { warn: contactWarn } = stalenessStyle(lastContactDays);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <GlassCard hover={false} className={`!p-3 border-border/15 ${className}`}>
      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 mb-2.5">
        <Brain className="h-3 w-3 text-foreground" />
        <span className="text-sm font-semibold uppercase tracking-wider text-foreground/80">
          Seller Memory
        </span>
        {(loading || memLoading) && (
          <Loader2 className="h-2.5 w-2.5 animate-spin text-foreground/40 ml-auto" />
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/30" />
        </div>
      )}

      {error && !loading && (
        <p className="text-sm text-muted-foreground/40 italic">{error}</p>
      )}

      {!loading && !error && context && (
        <div className="space-y-2">

          {/* ── Quick stats strip ─────────────────────────────── */}
          <div className="grid grid-cols-3 gap-1.5">
            <div className="rounded-[8px] bg-overlay-3 border border-overlay-4 p-2 text-center">
              <Phone className="h-2.5 w-2.5 text-primary/50 mx-auto mb-0.5" />
              <p className="text-sm font-bold text-foreground">{context.totalCalls}</p>
              <p className="text-xs text-muted-foreground/50 uppercase">Calls</p>
            </div>
            <div className="rounded-[8px] bg-overlay-3 border border-overlay-4 p-2 text-center">
              <TrendingUp className="h-2.5 w-2.5 text-foreground/50 mx-auto mb-0.5" />
              <p className="text-sm font-bold text-foreground">{context.liveAnswers}</p>
              <p className="text-xs text-muted-foreground/50 uppercase">Answered</p>
            </div>
            <div className={`rounded-[8px] bg-overlay-3 border p-2 text-center ${contactWarn ? "border-border/20" : "border-overlay-4"}`}>
              <Clock className={`h-2.5 w-2.5 mx-auto mb-0.5 ${contactWarn ? "text-foreground/60" : "text-foreground/40"}`} />
              <p className={`text-sm font-semibold truncate ${contactWarn ? "text-foreground/80" : "text-foreground"}`}>
                {lastContactDays !== null
                  ? lastContactDays === 0 ? "Today" : `${lastContactDays}d`
                  : context.lastCallDate
                    ? fmtDate(context.lastCallDate)
                    : "—"}
              </p>
              <p className="text-xs text-muted-foreground/50 uppercase">Last</p>
            </div>
          </div>

          {/* ── Open task (promised follow-up) ────────────────── */}
          {context.openTaskTitle && (
            <div className="flex items-start gap-1.5 rounded-[8px] bg-muted/[0.06] border border-border/20 px-2.5 py-1.5">
              <CheckSquare className="h-3 w-3 text-foreground/70 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <p className="text-sm text-foreground/90 font-medium leading-snug truncate flex-1">
                    {context.openTaskTitle}
                  </p>
                  <span className="text-xs text-foreground/40 shrink-0 uppercase tracking-wide">promised</span>
                </div>
                {context.openTaskDueAt && (
                  <p className="text-sm text-foreground/50 mt-0.5">
                    Due {fmtDateTime(context.openTaskDueAt)}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── Scheduled callback ────────────────────────────── */}
          {context.nextCallScheduledAt && (
            <div className="flex items-center gap-1.5 rounded-[8px] bg-primary/[0.04] border border-primary/15 px-2.5 py-1.5">
              <CalendarClock className="h-3 w-3 text-primary/60 shrink-0" />
              <span className="text-sm text-primary/80">
                Callback: {fmtDateTime(context.nextCallScheduledAt)}
              </span>
            </div>
          )}

          {/* ── Structured post-call intelligence ─────────────── */}
          {/* Renders deal temp badge, promises, next action, and callback
              timing from the most recent post_call_structures row (via
              call-memory API). Only shows when at least one structured
              field exists. */}
          {(memory?.lastCallPromises || memory?.lastCallObjection || memory?.lastCallNextAction || memory?.lastCallCallbackTiming || memory?.lastCallDealTemperature) ? (
            <div className="rounded-[8px] bg-primary/[0.03] border border-primary/10 px-2.5 py-1.5 space-y-1">
              {memory.lastCallDealTemperature && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-muted-foreground/50 uppercase">Deal Temp:</span>
                  <span className={cn("text-xs font-bold px-1.5 py-0.5 rounded",
                    memory.lastCallDealTemperature === "hot" ? "bg-red-500/20 text-red-400" :
                    memory.lastCallDealTemperature === "warm" ? "bg-amber-500/20 text-amber-400" :
                    memory.lastCallDealTemperature === "cool" ? "bg-blue-500/20 text-blue-400" :
                    "bg-muted/20 text-muted-foreground"
                  )}>
                    {memory.lastCallDealTemperature.charAt(0).toUpperCase() + memory.lastCallDealTemperature.slice(1)}
                  </span>
                </div>
              )}
              {memory.lastCallPromises && (
                <div className="flex items-start gap-1.5">
                  <Handshake className="h-3 w-3 text-primary/50 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-semibold uppercase tracking-wider text-primary/40">Promised</span>
                    <p className="text-sm text-foreground/75 leading-snug">{memory.lastCallPromises}</p>
                  </div>
                </div>
              )}
              {memory.lastCallNextAction && (
                <div className="flex items-start gap-1.5">
                  <ArrowRight className="h-3 w-3 text-foreground/50 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-semibold uppercase tracking-wider text-foreground/40">Next action</span>
                    <p className="text-sm text-foreground/75 leading-snug">{memory.lastCallNextAction}</p>
                  </div>
                </div>
              )}
              {memory.lastCallCallbackTiming && (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground/50">Best callback:</span>
                  <span className="text-foreground/80">{memory.lastCallCallbackTiming}</span>
                </div>
              )}
            </div>
          ) : (memory?.recentCalls ?? []).length > 0 && !memLoading ? (
            <div className="rounded-[8px] bg-muted/[0.03] border border-border/10 px-2.5 py-1.5">
              <p className="text-xs text-muted-foreground/40 italic">
                Structured memory will populate after next call
              </p>
            </div>
          ) : null}

          {/* ── Open objections ───────────────────────────────── */}
          {objections.length > 0 && (
            <div className="rounded-[8px] bg-muted/[0.04] border border-border/15 px-2.5 py-1.5">
              <div className="flex items-center gap-1 mb-1">
                <AlertTriangle className="h-2.5 w-2.5 text-foreground/60 shrink-0" />
                <span className="text-xs font-semibold uppercase tracking-wider text-foreground/60">
                  Still blocking
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {objections.map((obj) => {
                  const age2 = daysAgo(obj.created_at);
                  const { warn: objWarn } = stalenessStyle(age2);
                  return (
                    <span
                      key={obj.id}
                      title={obj.note ? `${obj.note} (${age2}d ago)` : `${age2}d ago`}
                      className={`inline-flex items-center rounded-[5px] border px-1.5 py-0.5 text-sm font-medium ${
                        objWarn
                          ? "bg-muted/15 border-border/30 text-foreground/70"
                          : "bg-muted/10 border-border/20 text-foreground/80"
                      }`}
                    >
                      {OBJECTION_TAG_LABELS[obj.tag as ObjectionTag] ?? obj.tag}
                      <span className="ml-1 text-xs opacity-50">{age2}d</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Decision-maker note ───────────────────────────── */}
          {memory?.decisionMakerNote && (
            <div className="flex items-start gap-1.5 rounded-[8px] bg-muted/[0.04] border border-border/15 px-2.5 py-1.5">
              <User className="h-3 w-3 text-foreground/60 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-foreground/50">
                    Decision-maker
                  </span>
                  <ProvenanceBadge source={memory.decisionMakerSource} />
                  {memory?.decisionMakerConfirmed != null && (
                    <span className={cn("text-xs px-1 py-0.5 rounded ml-1",
                      memory.decisionMakerConfirmed ? "bg-green-500/20 text-green-400" : "bg-muted/20 text-muted-foreground/60"
                    )}>
                      {memory.decisionMakerConfirmed ? "Confirmed" : "AI-derived"}
                    </span>
                  )}
                </div>
                <p className={`text-sm leading-snug ${
                  memory.decisionMakerSource === "ai"
                    ? "text-foreground/55 italic"
                    : "text-foreground/80"
                }`}>
                  {memory.decisionMakerNote}
                </p>
              </div>
            </div>
          )}

          {/* ── Call history (last 3 calls) ───────────────────── */}
          {(memory?.recentCalls ?? []).length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setHistoryOpen((v) => !v)}
                className="w-full flex items-center gap-1.5 mb-1 hover:opacity-80 transition-opacity"
              >
                <MessageSquare className="h-2.5 w-2.5 text-primary/50 shrink-0" />
                <span className="text-xs font-semibold uppercase tracking-wider text-primary/50 flex-1 text-left">
                  Call history ({memory!.recentCalls.length})
                </span>
                {memLoading && <Loader2 className="h-2.5 w-2.5 animate-spin text-muted-foreground/30" />}
                {!memLoading && (
                  historyOpen
                    ? <ChevronUp   className="h-3 w-3 text-muted-foreground/25" />
                    : <ChevronDown className="h-3 w-3 text-muted-foreground/25" />
                )}
              </button>
              {historyOpen && (
                <div className="space-y-1">
                  {memory!.recentCalls.map((call, i) => (
                    <CallHistoryRow key={call.callLogId} call={call} index={i} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Fallback: show last call from context_snapshot if memory hasn't loaded yet */}
          {(memory?.recentCalls ?? []).length === 0 && !memLoading &&
            (context.lastCallNotes || context.lastCallAiSummary) && (
            <div className="pt-0.5 border-t border-overlay-4">
              {context.lastCallNotes ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <Pen className="h-2.5 w-2.5 text-primary/50 shrink-0" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-primary/50">Last call</span>
                  </div>
                  <p className="text-sm text-foreground/75 leading-relaxed line-clamp-4">
                    {context.lastCallNotes}
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <Sparkles className="h-2.5 w-2.5 text-foreground/50 shrink-0" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-foreground/50">
                      AI summary (unreviewed)
                    </span>
                  </div>
                  <p className="text-sm text-foreground/55 italic leading-relaxed line-clamp-4">
                    {context.lastCallAiSummary}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Qual signals (collapsible) ────────────────────── */}
          {(context.motivationLevel != null || context.sellerTimeline || context.qualificationRoute) && (
            <div className="border-t border-overlay-4">
              <button
                type="button"
                onClick={() => setQualOpen((v) => !v)}
                className="w-full flex items-center gap-1.5 py-1 hover:opacity-80 transition-opacity"
              >
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/40 flex-1 text-left">
                  Qual signals
                </span>
                {qualOpen
                  ? <ChevronUp   className="h-3 w-3 text-muted-foreground/25" />
                  : <ChevronDown className="h-3 w-3 text-muted-foreground/25" />}
              </button>
              {qualOpen && (
                <div className="space-y-1.5 pb-1">
                  {context.motivationLevel != null && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground/50">Motivation</span>
                      <MotivationDots level={context.motivationLevel} />
                    </div>
                  )}
                  {context.sellerTimeline && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground/50">Timeline</span>
                      <span className="text-foreground/80 font-medium">
                        {TIMELINE_LABELS[context.sellerTimeline] ?? context.sellerTimeline}
                      </span>
                    </div>
                  )}
                  {context.qualificationRoute && ROUTE_LABELS[context.qualificationRoute] && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground/50">Route</span>
                      <span className={`font-semibold ${ROUTE_LABELS[context.qualificationRoute].color}`}>
                        {ROUTE_LABELS[context.qualificationRoute].label}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── First contact empty state ─────────────────────── */}
          {context.totalCalls === 0 && objections.length === 0 &&
            !context.openTaskTitle && !memory?.decisionMakerNote && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground/40 italic text-center py-0.5">
                First contact — no prior history
              </p>
              <TrustLanguagePack
                context="inbound_first_contact"
                compact
                label="First-call scripts"
              />
            </div>
          )}

        </div>
      )}

      {!loading && !error && !context && (
        <p className="text-sm text-muted-foreground/40 italic">No seller context available</p>
      )}
    </GlassCard>
  );
}
