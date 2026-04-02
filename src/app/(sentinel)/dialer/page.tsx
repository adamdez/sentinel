"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Call } from "@twilio/voice-sdk";
import {
  Phone, PhoneOff, PhoneForwarded, PhoneIncoming, Clock, Users, BarChart3, Home,
  Mic, MicOff, Voicemail, CalendarCheck, FileSignature,
  Skull, Heart, Search, Ghost, Zap, ChevronRight, Timer,
  Sparkles, DollarSign, Loader2, SkipForward, MessageSquare,
  X, Send, Shield, CheckCircle2, History, ArrowDownLeft, ArrowUpRight,
  AlertTriangle, Wifi, WifiOff, RefreshCw, FileText, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { calculateQuickScreen } from "@/lib/valuation";
import { useSentinelStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import {
  useDialerQueue,
  useAutoCycleQueue,
  useDialerKpis,
  useCallTimer,
  type QueueLead,
  type AutoCycleQueueLead,
} from "@/hooks/use-dialer";
import { RelationshipBadgeCompact } from "@/components/sentinel/relationship-badge";
import { getSequenceLabel, getCadencePosition } from "@/lib/call-scheduler";

import { usePreCallBrief } from "@/hooks/use-pre-call-brief";
import { useLiveCoach } from "@/hooks/use-live-coach";
import { CallSequenceGuide } from "@/components/sentinel/call-sequence-guide";
import { useCallHistory, type CallHistoryEntry } from "@/hooks/use-call-history";
import { MasterClientFileModal, clientFileFromRaw } from "@/components/sentinel/master-client-file-modal";
import { buildOperatorWorkflowSummary } from "@/components/sentinel/operator-workflow-summary";
import { filterBriefBullets, filterBriefWatchOuts, filterBriefGoal } from "@/lib/brief-trust-filter";
import { Eye } from "lucide-react";
import { useCoachSurface } from "@/providers/coach-provider";
import { CoachPanel, CoachToggle } from "@/components/sentinel/coach-panel";
import { PostCallPanel } from "@/components/sentinel/post-call-panel";
import { SellerMemoryPanel } from "@/components/sentinel/seller-memory-panel";
import { SellerMemoryPreview } from "@/components/sentinel/seller-memory-preview";
import { LiveCoachWindow } from "@/components/sentinel/live-coach-window";
import { UnlinkedCallsFolder } from "@/components/sentinel/unlinked-calls-folder";
import { JeffMessagesBanner } from "@/components/sentinel/jeff-messages-banner";
import { SmsMessagesPanel } from "@/components/sentinel/sms-messages-panel";
import type { LeadPhone } from "@/lib/dialer/types";
import type { JeffCallStatus } from "@/lib/dialer/jeff-batch-types";
import { resolveDialerPhoneSelection } from "@/lib/dialer/operator-auto-cycle";
import { useTwilio } from "@/providers/twilio-provider";
import {
  formatTalkTime,
  kpiDateInputValue,
  type DialerKpiPreset,
  type DialerKpiSnapshot,
} from "@/lib/dialer-kpis";

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
  return headers;
}

type DialerStats = {
  myOutbound: number;
  myInbound: number;
  myLiveAnswers: number;
  myAvgTalkTime: number;
  teamOutbound: number;
  teamInbound: number;
};

async function fetchDialerKpis(
  _userId: string,
  period: "today" | "week" | "month" | "all",
): Promise<{ my: DialerStats; team: DialerStats }> {
  const response = await fetch(
    `/api/dialer/v1/kpis?preset=${encodeURIComponent(period)}`,
    { headers: await authHeaders(), cache: "no-store" },
  );
  if (!response.ok) {
    return {
      my: { myOutbound: 0, myInbound: 0, myLiveAnswers: 0, myAvgTalkTime: 0, teamOutbound: 0, teamInbound: 0 },
      team: { myOutbound: 0, myInbound: 0, myLiveAnswers: 0, myAvgTalkTime: 0, teamOutbound: 0, teamInbound: 0 },
    };
  }

  const snapshot = (await response.json()) as DialerKpiSnapshot;
  return {
    my: {
      myOutbound: snapshot.metrics.outbound.user,
      myInbound: snapshot.metrics.inbound.user,
      myLiveAnswers: snapshot.metrics.pickups.user,
      myAvgTalkTime: snapshot.metrics.talkTimeSec.user,
      teamOutbound: snapshot.metrics.outbound.team,
      teamInbound: snapshot.metrics.inbound.team,
    },
    team: {
      myOutbound: snapshot.metrics.outbound.team,
      myInbound: snapshot.metrics.inbound.team,
      myLiveAnswers: snapshot.metrics.pickups.team,
      myAvgTalkTime: snapshot.metrics.talkTimeSec.team,
      teamOutbound: snapshot.metrics.outbound.team,
      teamInbound: snapshot.metrics.inbound.team,
    },
  };
}

// ── Transfer Brief (full shape from /api/dialer/v1/transfer-brief) ────────
interface TransferBriefFull {
  voiceSessionId: string;
  fromNumber: string;
  leadId: string | null;
  leadUrl: string | null;
  lead: {
    name: string | null;
    phone: string;
    email: string | null;
    address: string | null;
    stage: string | null;
    source: string | null;
    tags: string[];
  } | null;
  property: {
    address: string | null;
    city: string | null;
    county: string | null;
    propertyType: string | null;
  } | null;
  recentCalls: Array<{
    date: string;
    direction: string;
    disposition: string | null;
    summary: string | null;
  }>;
  openTasks: Array<{
    title: string;
    dueDate: string | null;
    status: string;
  }>;
  transferReason: string;
  callerType: string;
  transferBrief: string | null;
  discoverySlots: Record<string, string>;
  jeffNotes: string[];
  summary: string | null;
  createdAt: string;
}

type IncomingMatchState = {
  type: "lead" | "jeff" | "transfer" | "unknown";
  name?: string;
  address?: string;
  summary?: string;
  transferBrief?: TransferBriefFull;
} | null;

// ── KPI Card + Detail Modal (defined outside render to avoid focus issues) ──

type KpiKey = "myOutbound" | "myInbound" | "myLiveAnswers" | "myAvgTalkTime" | "teamOutbound" | "teamInbound";
type Period = "today" | "week" | "month" | "all";

const KPI_META: Record<KpiKey, { label: string; icon: React.ElementType; color: string; glow: string; teamKey: KpiKey; format?: (v: number) => string }> = {
  myOutbound:    { label: "My Outbound",    icon: PhoneForwarded, color: "text-primary",        glow: "var(--shadow-soft)",  teamKey: "teamOutbound" },
  myInbound:     { label: "My Inbound",     icon: PhoneIncoming,  color: "text-foreground",  glow: "var(--shadow-soft)", teamKey: "teamInbound" },
  myLiveAnswers: { label: "Outbounds Answered", icon: Phone,       color: "text-foreground", glow: "var(--shadow-soft)", teamKey: "myLiveAnswers" },
  myAvgTalkTime: { label: "Avg Talk Time",  icon: Timer,          color: "text-foreground",  glow: "var(--shadow-soft)", teamKey: "myAvgTalkTime", format: (s) => s > 0 ? `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}` : "0:00" },
  teamOutbound:  { label: "Team Outbound",  icon: Users,          color: "text-foreground",    glow: "var(--shadow-soft)", teamKey: "teamOutbound" },
  teamInbound:   { label: "Team Inbound",   icon: Users,          color: "text-foreground",    glow: "var(--shadow-soft)", teamKey: "teamInbound" },
};

const PERIOD_LABELS: { key: Period; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week",  label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "all",   label: "All Time" },
];

function KpiCard({ kpiKey, value, loading, onClick }: { kpiKey: KpiKey; value: number; loading: boolean; onClick: () => void }) {
  const meta = KPI_META[kpiKey];
  const Icon = meta.icon;
  const display = meta.format ? meta.format(value) : value;
  return (
    <button
      onClick={onClick}
      className="rounded-[14px] glass-card p-3 text-center
        transition-all duration-100 cursor-pointer hover:border-primary/25 hover:bg-overlay-3
        hover:shadow-[0_12px_40px_var(--shadow-medium)] active:scale-[0.98] group relative overflow-hidden w-full"
    >
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-overlay-6 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div
        className="h-7 w-7 rounded-[8px] flex items-center justify-center mx-auto mb-1"
        style={{ background: "var(--overlay-6)" }}
      >
        <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
      </div>
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin mx-auto" />
      ) : (
        <p className={`text-lg font-semibold tracking-tight ${meta.color}`}>{display}</p>
      )}
      <p className="text-sm text-muted-foreground/60 uppercase tracking-wider">{meta.label}</p>
      <p className="text-xs text-muted-foreground/50 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-widest">Click for details</p>
    </button>
  );
}

function StatDetailModal({ kpiKey, userId, onClose }: { kpiKey: KpiKey; userId: string; onClose: () => void }) {
  const [period, setPeriod] = useState<Period>("today");
  const [data, setData] = useState<{ my: DialerStats; team: DialerStats } | null>(null);
  const [loading, setLoading] = useState(true);
  const meta = KPI_META[kpiKey];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchDialerKpis(userId, period).then((d) => {
      if (!cancelled) { setData(d); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [userId, period]);

  const myVal = data ? data.my[kpiKey] : 0;
  const teamVal = data ? data.team[meta.teamKey] : 0;
  const fmt = meta.format ?? ((v: number) => String(v));

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] modal-backdrop flex items-center justify-center"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 24 }}
          transition={{ type: "spring", damping: 26, stiffness: 320 }}
          onClick={(e) => e.stopPropagation()}
          className="relative max-w-md w-full mx-4 rounded-[16px] border border-overlay-8
            modal-glass flex flex-col overflow-hidden"
        >
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-overlay-15 to-transparent" />

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-overlay-6">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-[10px] flex items-center justify-center bg-overlay-6">
                <meta.icon className={`h-4 w-4 ${meta.color}`} />
              </div>
              <h3 className="text-sm font-bold text-white">{meta.label} — Breakdown</h3>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-[10px] hover:bg-overlay-6 transition-colors text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Period tabs */}
          <div className="flex items-center gap-1 px-4 py-2 border-b border-overlay-6">
            {PERIOD_LABELS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-3 py-1 rounded-[8px] text-sm font-medium transition-all ${
                  period === p.key
                    ? "text-primary bg-primary/8 border border-primary/20"
                    : "text-muted-foreground hover:text-foreground border border-transparent"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="p-5 space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-primary/50" />
              </div>
            ) : (
              <>
                {/* Big comparison */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-[12px] border border-primary/15 bg-primary/[0.04] p-4 text-center">
                    <p className="text-sm text-muted-foreground/60 uppercase tracking-widest mb-1">You</p>
                    <p className="text-3xl font-bold text-primary" style={{ textShadow: "0 0 14px var(--shadow-medium)" }}>
                      {fmt(myVal)}
                    </p>
                  </div>
                  <div className="rounded-[12px] border border-border/15 bg-muted/[0.04] p-4 text-center">
                    <p className="text-sm text-muted-foreground/60 uppercase tracking-widest mb-1">Team Total</p>
                    <p className="text-3xl font-bold text-foreground" style={{ textShadow: "0 0 14px var(--shadow-soft)" }}>
                      {fmt(teamVal)}
                    </p>
                  </div>
                </div>

                {/* Ratio bar */}
                {teamVal > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-sm text-muted-foreground/60">
                      <span>Your share</span>
                      <span>{teamVal > 0 ? Math.round((myVal / teamVal) * 100) : 0}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-overlay-4 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-muted transition-all duration-500"
                        style={{ width: `${teamVal > 0 ? Math.min((myVal / teamVal) * 100, 100) : 0}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Extra stats */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Outbound", val: data?.my.myOutbound ?? 0, color: "text-primary" },
                    { label: "Answered", val: data?.my.myLiveAnswers ?? 0, color: "text-foreground" },
                    { label: "Avg Talk", val: data?.my.myAvgTalkTime ?? 0, color: "text-foreground", fmt: (v: number) => `${Math.floor(v / 60)}:${(v % 60).toString().padStart(2, "0")}` },
                  ].map((s) => (
                    <div key={s.label} className="rounded-[10px] border border-overlay-6 bg-overlay-2 p-2.5 text-center">
                      <p className="text-sm text-muted-foreground/55 uppercase tracking-widest">{s.label}</p>
                      <p className={`text-sm font-bold font-mono ${s.color}`}>{s.fmt ? s.fmt(s.val) : s.val}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

type KpiPeriodPreset = Exclude<DialerKpiPreset, "custom">;
type DialerKpiMetricKey = keyof DialerKpiSnapshot["metrics"];

const KPI_PERIOD_LABELS: Array<{ key: KpiPeriodPreset; label: string }> = [
  { key: "today", label: "Today" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
  { key: "all", label: "All Time" },
];

const KPI_GROUPS: Array<{
  key: DialerKpiMetricKey;
  label: string;
  icon: React.ElementType;
  accentClass: string;
  format?: (value: number) => string;
}> = [
  { key: "outbound", label: "Outbound", icon: PhoneForwarded, accentClass: "text-primary" },
  { key: "pickups", label: "Pickups", icon: Phone, accentClass: "text-emerald-300" },
  { key: "inbound", label: "Inbound", icon: PhoneIncoming, accentClass: "text-foreground" },
  { key: "missedCalls", label: "Missed Calls", icon: PhoneOff, accentClass: "text-amber-300" },
  { key: "talkTimeSec", label: "Talk Time", icon: Timer, accentClass: "text-sky-300", format: formatTalkTime },
];

function DialerKpiGroup({
  label,
  icon: Icon,
  accentClass,
  personal,
  team,
  loading,
  format,
}: {
  label: string;
  icon: React.ElementType;
  accentClass: string;
  personal: number;
  team: number;
  loading: boolean;
  format?: (value: number) => string;
}) {
  const renderValue = (value: number) => (format ? format(value) : value.toString());

  return (
    <div className="rounded-[14px] border border-overlay-6 bg-overlay-2 px-4 py-3 shadow-[0_10px_30px_var(--shadow-soft)]">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/65">
        <div className="flex h-7 w-7 items-center justify-center rounded-[10px] bg-overlay-6">
          <Icon className={`h-3.5 w-3.5 ${accentClass}`} />
        </div>
        <span>{label}</span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/50">You</p>
          {loading ? (
            <Loader2 className="mt-1 h-5 w-5 animate-spin text-primary/50" />
          ) : (
            <p className={`text-2xl font-semibold tracking-tight ${accentClass}`}>{renderValue(personal)}</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/50">Team</p>
          <p className="mt-1 text-sm font-medium text-foreground/85">{loading ? "..." : renderValue(team)}</p>
        </div>
      </div>
    </div>
  );
}

interface DispoOption {
  key: string;
  label: string;
  hotkey: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}

const DISPOSITIONS: DispoOption[] = [
  { key: "voicemail",   label: "Voicemail",    hotkey: "1", icon: Voicemail,      color: "text-foreground",   bgColor: "bg-muted/10 hover:bg-muted/20 border-border/20" },
  { key: "no_answer",   label: "No Answer",    hotkey: "2", icon: PhoneOff,       color: "text-foreground",   bgColor: "bg-muted/10 hover:bg-muted/20 border-border/20" },
  { key: "interested",  label: "Interested",   hotkey: "3", icon: Sparkles,       color: "text-primary",       bgColor: "bg-primary/8 hover:bg-primary/15 border-primary/15" },
  { key: "appointment", label: "Appointment",  hotkey: "4", icon: CalendarCheck,  color: "text-foreground",bgColor: "bg-muted/10 hover:bg-muted/20 border-border/20" },
  { key: "contract",    label: "Contract",     hotkey: "5", icon: FileSignature,  color: "text-foreground", bgColor: "bg-muted/10 hover:bg-muted/20 border-border/20" },
  { key: "dead_lead",   label: "Dead Lead",    hotkey: "6", icon: Skull,          color: "text-foreground",    bgColor: "bg-muted/10 hover:bg-muted/20 border-border/20" },
  { key: "disqualified", label: "Nurture",     hotkey: "7", icon: Heart,          color: "text-foreground",   bgColor: "bg-muted/10 hover:bg-muted/20 border-border/20" },
  { key: "skip_trace",  label: "Skip Trace",   hotkey: "8", icon: Search,         color: "text-primary-400",   bgColor: "bg-primary-500/10 hover:bg-primary-500/20 border-primary-500/20" },
  { key: "ghost",       label: "Property Research", hotkey: "9", icon: Ghost,        color: "text-foreground", bgColor: "bg-muted/10 hover:bg-muted/20 border-border/20" },
];

type CallState = "idle" | "dialing" | "connected" | "ended";

function formatCurrency(n: number): string {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n}`;
}

function getScoreLabel(score: number): { label: string; variant: "platinum" | "gold" | "silver" | "bronze" } {
  if (score >= 85) return { label: "TOP", variant: "platinum" };
  if (score >= 70) return { label: "HIGH", variant: "gold" };
  if (score >= 50) return { label: "MED", variant: "silver" };
  return { label: "LOW", variant: "bronze" };
}

function stageLabel(status: string | null | undefined): string {
  const normalized = (status ?? "").toLowerCase();
  if (normalized === "lead") return "Lead";
  if (normalized === "negotiation") return "Negotiation";
  if (normalized === "disposition") return "Disposition";
  if (normalized === "nurture") return "Nurture";
  if (normalized === "dead") return "Dead";
  if (normalized === "closed") return "Closed";
  if (normalized === "prospect") return "New";
  return "Unknown";
}

function qualificationRouteLabel(route: string | null | undefined): string {
  const normalized = (route ?? "").toLowerCase();
  if (!normalized) return "Not routed";
  if (normalized === "offer_ready") return "Offer Ready";
  if (normalized === "follow_up") return "Follow-Up";
  if (normalized === "nurture") return "Nurture";
  if (normalized === "dead") return "Dead";
  if (normalized === "escalate") return "Escalate Review";
  return normalized.replace(/_/g, " ");
}

function notePreview(note: string | null | undefined, max = 110): string {
  const cleaned = (note ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "No recent note";
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1)}…`;
}

function countQualificationGaps(lead: QueueLead): number {
  return getQualificationGapNames(lead).length;
}

function getQualificationGapNames(lead: QueueLead): string[] {
  const gaps: string[] = [];
  if (lead.decision_maker_confirmed !== true) gaps.push("decision-maker");
  if (lead.motivation_level == null) gaps.push("motivation");
  if (lead.seller_timeline == null) gaps.push("timeline");
  if (lead.condition_level == null) gaps.push("condition");
  if (lead.price_expectation == null) gaps.push("price");
  return gaps;
}

// Builds a labeled note scaffold for fields still missing on the lead.
// Returns empty string if all fields are already captured (no scaffold needed).
function buildNoteScaffold(lead: QueueLead): string {
  const lines: string[] = [];
  if (lead.seller_timeline == null)           lines.push("Timeline: ");
  if (lead.motivation_level == null)          lines.push("Motivation: ");
  if (lead.decision_maker_confirmed !== true) lines.push("Decision maker: ");
  if (lead.price_expectation == null)         lines.push("Asking price: ");
  if (lead.condition_level == null)           lines.push("Condition: ");
  return lines.join("\n");
}

function compactCallAssistPrompts(params: {
  route: string | null;
  nextActionLabel: string;
  hasDueDate: boolean;
  totalCalls: number;
  missingMotivation: boolean;
  missingTimeline: boolean;
  missingDecisionMaker: boolean;
  missingPriceExpectation: boolean;
  missingCondition: boolean;
}): string[] {
  const prompts: string[] = [];

  // Route-specific prompts take slot 1 when present
  if (params.route === "offer_ready") {
    prompts.push("Confirm: are you the sole decision maker, and what's your timeline for closing?");
  } else if (params.route === "escalate") {
    prompts.push("Set expectation: Adam will review this — expect a follow-up within 24 hours.");
  }

  // First-call trust opener fills next available slot
  if (params.totalCalls <= 1 && prompts.length < 2) {
    prompts.push("Open with: 'I\u2019m a local direct buyer — no agents or listing pressure.'");
  }

  // Qualification questions in priority order — fill remaining slots
  const qualQuestions: string[] = [];
  if (params.missingTimeline)         qualQuestions.push("Ask: what\u2019s your ideal timeline to sell?");
  if (params.missingMotivation)       qualQuestions.push("Ask: what\u2019s driving the decision to sell right now?");
  if (params.missingDecisionMaker)    qualQuestions.push("Ask: are you the only decision maker on this property?");
  if (params.missingPriceExpectation) qualQuestions.push("Ask: what number would make this a done deal for you?");
  if (params.missingCondition)        qualQuestions.push("Ask: any major repairs needed \u2014 roof, foundation, HVAC?");
  for (const q of qualQuestions) {
    if (prompts.length >= 2) break;
    prompts.push(q);
  }

  // Due-date reminder fills last slot if still open
  if (!params.hasDueDate && prompts.length < 2) {
    prompts.push("Before ending, set a specific callback date and time.");
  }

  if (prompts.length === 0) {
    prompts.push(`Close with a clear next step: ${params.nextActionLabel.toLowerCase()}.`);
  }
  return prompts.slice(0, 2);
}

const TIMELINE_SHORT: Record<string, string> = {
  immediate: "Immediate",
  "30_days":  "30 days",
  "60_days":  "60 days",
  flexible:   "Flexible",
  unknown:    "Unknown",
};

function relativeAge(iso: string | null): string | null {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

function formatUsPhone(digits: string): string {
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

function formatMoneyFull(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

function relativeUpdatedLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  const diffMin = Math.max(0, Math.floor((Date.now() - ms) / 60_000));
  if (diffMin < 1) return "updated just now";
  if (diffMin < 60) return `updated ${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `updated ${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `updated ${diffDay}d ago`;
}

function LiveAnswerIntelPanel({
  lead,
  dialedPhone,
  onOpenDetail,
}: {
  lead: QueueLead;
  dialedPhone: string | null;
  onOpenDetail: () => void;
}) {
  const ownerFlags = (lead.properties?.owner_flags as Record<string, unknown> | null) ?? null;
  const estimatedValue = lead.properties?.estimated_value ?? null;
  const compArv = typeof ownerFlags?.comp_arv === "number" ? ownerFlags.comp_arv : null;
  const brickedArv = typeof ownerFlags?.bricked_arv === "number" ? ownerFlags.bricked_arv : null;
  const brickedCmv = typeof ownerFlags?.bricked_cmv === "number" ? ownerFlags.bricked_cmv : null;
  const repairCost = typeof ownerFlags?.bricked_repair_cost === "number" ? ownerFlags.bricked_repair_cost : null;
  const compCount = typeof ownerFlags?.comp_count === "number" ? ownerFlags.comp_count : 0;
  const compAddresses = Array.isArray(ownerFlags?.comp_addresses)
    ? ownerFlags.comp_addresses.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  const mailingAddress = typeof ownerFlags?.mailing_address === "string" ? ownerFlags.mailing_address : null;
  const compUpdatedAt = typeof ownerFlags?.comp_arv_updated_at === "string" ? ownerFlags.comp_arv_updated_at : null;
  const bestArv = compArv ?? brickedArv ?? estimatedValue ?? null;
  const arvSource = compArv != null
    ? `${compCount || 1} saved comp${compCount === 1 ? "" : "s"}`
    : brickedArv != null
      ? "Bricked valuation"
      : estimatedValue != null
        ? "AVM estimate"
        : "No value yet";
  const quickScreen = estimatedValue && estimatedValue > 0 ? calculateQuickScreen(estimatedValue) : null;
  const valuationHint = compCount > 0
    ? "Use this ARV anchor and confirm condition fast."
    : quickScreen
      ? "No saved comps yet. Use the screen range carefully and validate repairs."
      : "Open Property Intel if the seller gets specific on price.";

  return (
    <GlassCard hover={false} className="!p-3 mb-3 border-primary/10">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <Home className="h-3.5 w-3.5 text-primary/70" />
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Live Property Intel
            </p>
          </div>
          <p className="text-sm font-semibold text-foreground">
            {lead.properties?.address ?? "No property address"}
          </p>
          <p className="text-xs text-muted-foreground/55 mt-0.5">
            {lead.properties?.owner_name ?? "Unknown owner"}
            {dialedPhone ? ` · ${formatUsPhone(dialedPhone.replace(/\D/g, "").slice(-10))}` : ""}
          </p>
          {mailingAddress && (
            <p className="text-xs text-muted-foreground/45 mt-1">
              Mailing: {mailingAddress}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenDetail}
          className="gap-1.5 border-border/20 text-muted-foreground hover:text-foreground"
        >
          <Eye className="h-3.5 w-3.5" />
          Full File
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2.5 mb-3">
        <div className="rounded-[10px] border border-primary/15 bg-primary/[0.05] p-2.5">
          <p className="text-[11px] uppercase tracking-wider text-primary/65 mb-1">Best ARV</p>
          <p className="text-lg font-semibold text-primary">
            {bestArv ? formatMoneyFull(bestArv) : "—"}
          </p>
          <p className="text-xs text-muted-foreground/50 mt-1">{arvSource}</p>
        </div>
        <div className="rounded-[10px] border border-border/15 bg-overlay-2 p-2.5">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground/55 mb-1">Quick Screen</p>
          {quickScreen ? (
            <>
              <p className="text-sm font-semibold text-foreground">
                {formatMoneyFull(quickScreen.maoLow)} - {formatMoneyFull(quickScreen.maoHigh)}
              </p>
              <p className="text-xs text-muted-foreground/45 mt-1">rough offer range off AVM</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground/40 italic">Need AVM</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm mb-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground/55">AVM</span>
          <span className="font-mono text-foreground">{estimatedValue ? formatMoneyFull(estimatedValue) : "—"}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground/55">Equity</span>
          <span className="font-mono text-foreground">{lead.properties?.equity_percent != null ? `${lead.properties.equity_percent}%` : "—"}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground/55">CMV</span>
          <span className="font-mono text-foreground">{brickedCmv ? formatMoneyFull(brickedCmv) : "—"}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground/55">Repairs</span>
          <span className="font-mono text-foreground">{repairCost ? `-${formatMoneyFull(repairCost)}` : "—"}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        <span className="px-2 py-1 rounded-[8px] text-[11px] border border-overlay-6 bg-overlay-2 text-muted-foreground/65">
          {stageLabel(lead.status)}
        </span>
        <span className="px-2 py-1 rounded-[8px] text-[11px] border border-overlay-6 bg-overlay-2 text-muted-foreground/65">
          {qualificationRouteLabel(lead.qualification_route)}
        </span>
        {lead.seller_timeline && (
          <span className="px-2 py-1 rounded-[8px] text-[11px] border border-overlay-6 bg-overlay-2 text-muted-foreground/65">
            Timeline {lead.seller_timeline.replace(/_/g, " ")}
          </span>
        )}
        {lead.motivation_level != null && (
          <span className="px-2 py-1 rounded-[8px] text-[11px] border border-overlay-6 bg-overlay-2 text-muted-foreground/65">
            Motivation {lead.motivation_level}/5
          </span>
        )}
      </div>

      <div className="rounded-[10px] border border-overlay-6 bg-overlay-2 px-2.5 py-2">
        <div className="flex items-center justify-between gap-3 mb-1.5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground/55">Comp Notes</p>
          <span className="text-[11px] text-muted-foreground/40">
            {relativeUpdatedLabel(compUpdatedAt) ?? (compCount > 0 ? `${compCount} comp${compCount === 1 ? "" : "s"} saved` : "No saved comps")}
          </span>
        </div>
        {compAddresses.length > 0 ? (
          <ul className="space-y-1">
            {compAddresses.slice(0, 3).map((address) => (
              <li key={address} className="text-sm text-foreground/78">
                {address}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground/45">{valuationHint}</p>
        )}
      </div>
    </GlassCard>
  );
}

function toE164(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  // Strip leading country code "1" so we don't double it
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return `+1${digits.slice(0, 10)}`;
}

type DialerMode = "queue" | "autoCycle";

function DialerPageInner() {
  const { currentUser, ghostMode } = useSentinelStore();
  const { queue, loading: queueLoading, refetch: refetchQueue } = useDialerQueue(200);
  const { queue: autoCycleQueue, loading: autoCycleLoading, refetch: refetchAutoCycle } = useAutoCycleQueue(200);
  const [selectedKpiPreset, setSelectedKpiPreset] = useState<DialerKpiPreset>("today");
  const [customKpiFrom, setCustomKpiFrom] = useState("");
  const [customKpiTo, setCustomKpiTo] = useState("");
  const [scoreboardExpanded, setScoreboardExpanded] = useState(false);
  const kpiSelection = useMemo(
    () => (
      selectedKpiPreset === "custom"
        ? { preset: "custom" as const, from: customKpiFrom || undefined, to: customKpiTo || undefined }
        : { preset: selectedKpiPreset }
    ),
    [customKpiFrom, customKpiTo, selectedKpiPreset],
  );
  const { snapshot: kpiSnapshot, loading: statsLoading } = useDialerKpis(kpiSelection);
  const timer = useCallTimer();

  const [callState, setCallState] = useState<CallState>("idle");
  const [currentLead, setCurrentLead] = useState<QueueLead | null>(null);
  const [dialerMode, setDialerMode] = useState<DialerMode>("queue");
  const autoCycleMode = dialerMode === "autoCycle";
  const [queueSkipTracing, setQueueSkipTracing] = useState(false);
  const [currentDialedPhone, setCurrentDialedPhone] = useState<string | null>(null);
  const [currentCallLogId, setCurrentCallLogId] = useState<string | null>(null);
  const [dialerSessionId, setDialerSessionId] = useState<string | null>(null); // PR3b: survives call end for PostCallPanel publish
  const [muted, setMuted] = useState(false);
  const [callNotes, setCallNotes] = useState("");
  const [dispositionPending, setDispositionPending] = useState(false);
  const [smsLoading, setSmsLoading] = useState(false);
  const [transferStatus, setTransferStatus] = useState<string | null>(null);

  // Phone cycling roster — fetched from lead_phones API when a lead is loaded
  const [leadPhones, setLeadPhones] = useState<LeadPhone[]>([]);
  const [phoneIndex, setPhoneIndex] = useState(0);
  const displayedQueue = autoCycleMode ? autoCycleQueue : queue;
  const displayedQueueLoading = autoCycleMode ? autoCycleLoading : queueLoading;
  const currentLeadAutoCycleEntry = autoCycleQueue.find((lead) => lead.id === currentLead?.id);
  const currentAutoCycleLead = (autoCycleMode
    ? currentLeadAutoCycleEntry
    : null) as AutoCycleQueueLead | undefined;
  const phoneSelection = useMemo(
    () =>
      resolveDialerPhoneSelection({
        autoCycleMode,
        leadPhones,
        phoneIndex,
        nextPhoneId: currentAutoCycleLead?.autoCycle.nextPhoneId ?? null,
        fallbackPhone: currentLead?.properties?.owner_phone ?? null,
      }),
    [autoCycleMode, currentAutoCycleLead?.autoCycle.nextPhoneId, currentLead?.properties?.owner_phone, leadPhones, phoneIndex],
  );
  const activeLeadPhones = phoneSelection.activePhones;
  const selectedPhoneIndex = phoneSelection.selectedIndex;
  const selectedLeadPhone = phoneSelection.selectedPhone;
  const selectedDialPhone = phoneSelection.phone;
  const phonesActiveCount = activeLeadPhones.length;
  const phonesAttempted = activeLeadPhones.filter((phone) => phone.last_called_at).length;

  // useCallNotes removed — seller memory preview covers last-call context
  const { brief: preCallBrief, loading: briefLoading, error: briefError, regenerate: retryBrief } = usePreCallBrief(currentLead?.id ?? null);
  const { coach: liveCoach, loading: liveCoachLoading, error: liveCoachError } = useLiveCoach({
    sessionId: dialerSessionId,
    enabled: callState === "connected" && !!dialerSessionId,
    mode: "outbound",
    sessionInstructions: currentLead?.seller_timeline == null
      ? "Prioritize timeline discovery before discussing price."
      : currentLead?.decision_maker_confirmed !== true
        ? "Confirm who else is involved before asking for commitment."
        : null,
  });
  const { history: callHistory, loading: historyLoading } = useCallHistory(currentUser.id, 30);
  const [historyFilter, setHistoryFilter] = useState<"all" | "outbound" | "inbound">("all");
  const [idleRailTab, setIdleRailTab] = useState<"history" | "jeff" | "sms">("history");
  const [briefDetailOpen, setBriefDetailOpen] = useState(false);
  const filteredBrief = useMemo(() => {
    if (!preCallBrief) return null;
    const goal = filterBriefGoal(preCallBrief.primaryGoal);
    const bullets = filterBriefBullets(preCallBrief.bullets).slice(0, 3);
    const watchOuts = filterBriefWatchOuts(preCallBrief.watchOuts);
    const hasContent = !!(goal || bullets.length || watchOuts.length || preCallBrief.riskFlags.length || preCallBrief.nextQuestions.length);
    return hasContent ? { goal, bullets, watchOuts, riskFlags: preCallBrief.riskFlags, nextQuestions: preCallBrief.nextQuestions } : null;
  }, [preCallBrief]);
  const prevLeadIdForBrief = useRef<string | null>(null);
  if (currentLead?.id !== prevLeadIdForBrief.current) {
    prevLeadIdForBrief.current = currentLead?.id ?? null;
    if (briefDetailOpen) setBriefDetailOpen(false);
  }

  useCoachSurface("dialer", {});
  const [fileModalOpen, setFileModalOpen] = useState(false);
  const [liveNotes, setLiveNotes] = useState<string[]>([]);
  const [savedNotes, setSavedNotes] = useState<Array<{ content: string; time: string }>>([]);
  const [savingNote, setSavingNote] = useState(false);
  const noteSeqRef = useRef(0);
  const transcriptSyncRef = useRef<{
    sessionId: string | null;
    lastSequence: number;
    sellerChunks: string[];
  }>({
    sessionId: null,
    lastSequence: 0,
    sellerChunks: [],
  });
  // Tracks whether the note scaffold has been seeded for the current call session.
  // Reset to false each time callState returns to idle so the next call starts fresh.
  const noteScaffoldSeeded = useRef(false);

  // Live notes realtime subscription is below manualCallLogId declaration

  // Fetch phone roster when lead changes
  useEffect(() => {
    if (!currentLead?.id) { setLeadPhones([]); setPhoneIndex(0); return; }
    let active = true;
    (async () => {
      try {
        const hdrs = await authHeaders();
        const res = await fetch(`/api/leads/${currentLead.id}/phones`, { headers: hdrs });
        if (res.ok && active) {
          const data = await res.json();
          const phones: LeadPhone[] = data.phones ?? [];
          setLeadPhones(phones);
          if (!autoCycleMode) {
            setPhoneIndex(0);
          }
        }
      } catch { /* non-fatal */ }
    })();
    return () => { active = false; };
  }, [autoCycleMode, currentAutoCycleLead?.autoCycle.nextPhoneId, currentLead?.id]);

  // Seed structured note scaffold once when call first becomes connected (session-backed only).
  // Only fires when callNotes is empty — never overwrites operator input.
  useEffect(() => {
    if (callState === "idle") {
      noteScaffoldSeeded.current = false;
      return;
    }
    if (callState !== "connected") return;
    if (!dialerSessionId) return;         // session-backed path only
    if (noteScaffoldSeeded.current) return;
    if (!currentLead) return;
    noteScaffoldSeeded.current = true;
    setCallNotes((prev) => {
      if (prev.trim()) return prev;       // don't overwrite if operator already typed
      return buildNoteScaffold(currentLead);
    });
  }, [callState, dialerSessionId, currentLead]);

  // Quick Manual Dial state
  const searchParams = useSearchParams();
  const [manualPhone, setManualPhone] = useState(() => {
    const p = searchParams.get("phone") ?? "";
    return p.replace(/\D/g, "").replace(/^1/, "").slice(0, 10);
  });
  const [manualDialExpanded, setManualDialExpanded] = useState(false);
  const [manualDialing, setManualDialing] = useState(false);
  const [manualCallLogId, setManualCallLogId] = useState<string | null>(null);
  const [manualSessionId, setManualSessionId] = useState<string | null>(null);
  const [manualStatus, setManualStatus] = useState<"idle" | "dialing" | "connected" | "ended">("idle");
  const { coach: manualLiveCoach, loading: manualLiveCoachLoading, error: manualLiveCoachError } = useLiveCoach({
    sessionId: manualSessionId,
    enabled: manualStatus === "connected" && !!manualSessionId,
    mode: "outbound",
    sessionInstructions: "Manual outbound call. Prioritize rapport, motivation, timeline, and decision-maker discovery before price.",
  });
  const displayedLiveNotes =
    liveCoach?.structuredLiveNotes?.length
      ? liveCoach.structuredLiveNotes.map((note) => note.text)
      : liveNotes;
  const displayedManualLiveNotes =
    manualLiveCoach?.structuredLiveNotes?.length
      ? manualLiveCoach.structuredLiveNotes.map((note) => note.text)
      : liveNotes;
  const [smsComposeOpen, setSmsComposeOpen] = useState(false);
  const [smsComposeMsg, setSmsComposeMsg] = useState("");
  const [smsComposeSending, setSmsComposeSending] = useState(false);
  const callActive = callState !== "idle";
  const manualDialOpen = manualDialExpanded || manualStatus !== "idle" || smsComposeOpen;
  const queueCoachActive = callState === "connected";
  const manualCoachActive = !queueCoachActive && manualStatus === "connected";
  const activeCoachBrief = queueCoachActive ? preCallBrief : null;
  const activeCoach = queueCoachActive ? liveCoach : manualCoachActive ? manualLiveCoach : null;
  const activeCoachLoading = queueCoachActive ? liveCoachLoading : manualCoachActive ? manualLiveCoachLoading : false;
  const activeCoachError = queueCoachActive ? liveCoachError : manualCoachActive ? manualLiveCoachError : null;

  // Phone auto-match: when a manual call connects, look up the number
  const [phoneMatchResult, setPhoneMatchResult] = useState<{
    leads: Array<{ id: string; ownerName: string; address: string | null }>;
    unlinkedSessions: Array<{ id: string; startedAt: string; summary: string | null }>;
  } | null>(null);
  const phoneMatchFired = useRef<string | null>(null);

  useEffect(() => {
    if (manualStatus !== "connected" || !manualPhone || currentLead) return;
    if (phoneMatchFired.current === manualPhone) return;
    phoneMatchFired.current = manualPhone;

    (async () => {
      try {
        const hdrs = await authHeaders();
        const res = await fetch(`/api/dialer/v1/phone-lookup?phone=${manualPhone}`, { headers: hdrs });
        if (!res.ok) return;
        const data = await res.json();
        setPhoneMatchResult(data);
        if (data.leads?.length === 1) {
          toast.info(`Auto-matched: ${data.leads[0].ownerName ?? data.leads[0].address ?? "Lead found"}`);
        } else if (data.leads?.length > 1) {
          toast.info(`${data.leads.length} leads match this number`);
        } else if (data.unlinkedSessions?.length > 0) {
          toast.info("Previous unlinked call found for this number");
        }
      } catch { /* non-fatal */ }
    })();
  }, [manualStatus, manualPhone, currentLead]);

  useEffect(() => {
    if (manualStatus === "idle") {
      setPhoneMatchResult(null);
      phoneMatchFired.current = null;
    }
  }, [manualStatus]);

  // Poll transcript chunks directly from session_notes.
  // Production does not yet have the legacy calls_log.live_notes bridge.
  const activeSessionForNotes = dialerSessionId || manualSessionId;
  useEffect(() => {
    if (!activeSessionForNotes) {
      transcriptSyncRef.current = {
        sessionId: null,
        lastSequence: 0,
        sellerChunks: [],
      };
      setLiveNotes([]);
      return;
    }

    if (transcriptSyncRef.current.sessionId !== activeSessionForNotes) {
      transcriptSyncRef.current = {
        sessionId: activeSessionForNotes,
        lastSequence: 0,
        sellerChunks: [],
      };
    }

    let cancelled = false;
    let timer: number | null = null;

    const buildGroupedNotes = (chunks: string[]) => {
      const grouped: string[] = [];
      let currentGroup = "";

      for (const chunk of chunks) {
        if (currentGroup.length + chunk.length > 300) {
          if (currentGroup) grouped.push(`Seller: "${currentGroup}"`);
          currentGroup = chunk;
        } else {
          currentGroup = currentGroup ? `${currentGroup} ${chunk}` : chunk;
        }
      }

      if (currentGroup) grouped.push(`Seller: "${currentGroup}"`);
      return grouped.slice(-12);
    };

    const pollNotes = async () => {
      try {
        const hdrs = await authHeaders();
        const syncState = transcriptSyncRef.current;
        const searchParams = new URLSearchParams({ note_type: "transcript_chunk" });
        if (syncState.lastSequence > 0) {
          searchParams.set("after_sequence", String(syncState.lastSequence));
          searchParams.set("limit", "120");
        }
        const res = await fetch(
          `/api/dialer/v1/sessions/${activeSessionForNotes}/notes?${searchParams.toString()}`,
          { headers: hdrs },
        );
        if (!res.ok) return;

        const data = await res.json() as {
          notes?: Array<{
            content: string | null;
            speaker: "operator" | "seller" | "ai" | null;
            sequence_num: number;
          }>;
        };

        if (cancelled) return;

        const notes = data.notes ?? [];
        if (notes.length > 0) {
          const newestSequence = Math.max(
            transcriptSyncRef.current.lastSequence,
            ...notes.map((note) => note.sequence_num),
          );
          transcriptSyncRef.current.lastSequence = newestSequence;

          const sellerChunks = notes
            .filter((note) => note.speaker === "seller" && typeof note.content === "string")
            .map((note) => note.content!.trim())
            .filter((content) => content.length > 0);

          if (syncState.lastSequence > 0) {
            transcriptSyncRef.current.sellerChunks = [
              ...transcriptSyncRef.current.sellerChunks,
              ...sellerChunks,
            ].slice(-60);
          } else {
            transcriptSyncRef.current.sellerChunks = sellerChunks.slice(-60);
          }
        }

        setLiveNotes(buildGroupedNotes(transcriptSyncRef.current.sellerChunks));
      } catch (error) {
        if (!cancelled) {
          console.warn("[dialer] live transcript polling failed:", error);
        }
      }
    };

    const runPoll = async () => {
      await pollNotes();
      if (cancelled) return;
      timer = window.setTimeout(() => {
        void runPoll();
      }, 2000);
    };

    void runPoll();

    return () => {
      cancelled = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [activeSessionForNotes]);

  // Inline SMS compose for the lead card (separate from manual-dial SMS compose)
  const [leadSmsOpen, setLeadSmsOpen] = useState(false);
  const [leadSmsMsg, setLeadSmsMsg] = useState("");
  const [leadSmsSending, setLeadSmsSending] = useState(false);

  // Twilio VoIP Device — lifecycle managed by TwilioProvider
  const { deviceStatus, deviceRef, voipCallerId, initDevice, setSuppressIncoming } = useTwilio();
  const [activeCall, setActiveCall] = useState<Call | null>(null);

  // Tell the provider to skip its own incoming-call handler —
  // this page registers a richer handler with phone lookup, transfer brief, audio, etc.
  useEffect(() => {
    setSuppressIncoming(true);
    return () => setSuppressIncoming(false);
  }, [setSuppressIncoming]);

  // Ref to track active session ID for inbound disconnect handler (avoids stale closure)
  const activeSessionRef = useRef<string | null>(null);

  // Incoming call state
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);
  const [incomingFrom, setIncomingFrom] = useState<string | null>(null);
  const [incomingMatch, setIncomingMatch] = useState<IncomingMatchState>(null);
  const incomingAudioRef = useRef<HTMLAudioElement | null>(null);

  // Missed calls
  const [missedCalls, setMissedCalls] = useState<Array<{ phone: string; time: string; id: string }>>([]);

  // Twilio diagnostics + real-time call status
  const [currentCallSid, setCurrentCallSid] = useState<string | null>(null);
  const [liveCallStatus, setLiveCallStatus] = useState<string | null>(null);
  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeCallRef = useRef<Call | null>(null);
  const [diagOpen, setDiagOpen] = useState(false);
  const [diagResults, setDiagResults] = useState<{ name: string; status: string; message: string; detail?: string }[] | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  useEffect(() => {
    if (!currentLead && displayedQueue.length > 0) {
      setCurrentLead(displayedQueue[0]);
      if (!autoCycleMode) setPhoneIndex(0);
    }
  }, [displayedQueue, currentLead, autoCycleMode]);

  useEffect(() => {
    if (!currentLead) return;
    if (displayedQueue.some((lead) => lead.id === currentLead.id)) return;
    setCurrentLead(displayedQueue[0] ?? null);
  }, [displayedQueue, currentLead]);

  // Keep activeCallRef in sync for polling callback closures
  useEffect(() => { activeCallRef.current = activeCall; }, [activeCall]);

  // Sync currentLead with refreshed queue data when the queue updates.
  // Deps intentionally use currentLead?.id (not currentLead) to avoid an
  // infinite loop: setCurrentLead → currentLead changes → effect re-fires.
  const currentLeadIdRef = useRef(currentLead?.id);
  currentLeadIdRef.current = currentLead?.id;
  useEffect(() => {
    const id = currentLeadIdRef.current;
    if (!id) return;
    const refreshedLead = displayedQueue.find((lead) => lead.id === id);
    if (refreshedLead) {
      setCurrentLead(refreshedLead);
    }
  }, [displayedQueue]);

  const handleModalRefresh = useCallback(() => {
    refetchQueue();
    refetchAutoCycle();
  }, [refetchAutoCycle, refetchQueue]);

  const handleAddCurrentLeadToAutoCycle = useCallback(async () => {
    if (!currentLead?.id) return;
    try {
      const res = await fetch("/api/dialer/v1/auto-cycle", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ leadId: currentLead.id }),
      });
      const data = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) {
        toast.error(data.error ?? "Could not add lead to Auto Cycle");
        return;
      }
      await refetchAutoCycle();
      setDialerMode("autoCycle");
      toast.success("Lead added to Auto Cycle");
    } catch {
      toast.error("Could not add lead to Auto Cycle");
    }
  }, [currentLead?.id, refetchAutoCycle]);

  const handleRemoveCurrentLeadFromAutoCycle = useCallback(async () => {
    if (!currentLead?.id) return;
    try {
      const res = await fetch(`/api/dialer/v1/auto-cycle?leadId=${encodeURIComponent(currentLead.id)}`, {
        method: "DELETE",
        headers: await authHeaders(),
      });
      const data = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) {
        toast.error(data.error ?? "Could not remove lead from Auto Cycle");
        return;
      }
      await refetchAutoCycle();
      if (autoCycleMode) {
        setCurrentLead(null);
      }
      toast.success("Lead removed from Auto Cycle");
    } catch {
      toast.error("Could not remove lead from Auto Cycle");
    }
  }, [autoCycleMode, currentLead?.id, refetchAutoCycle]);

  // ── Remove lead from dial queue (unassign) ──────────────────────────
  const handleRemoveFromQueue = useCallback(async (leadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/dialer/v1/dial-queue?leadId=${encodeURIComponent(leadId)}`, {
        method: "DELETE",
        headers: await authHeaders(),
      });
      if (!res.ok) throw new Error();
      if (currentLead?.id === leadId) setCurrentLead(null);
      refetchQueue();
      toast.success("Removed from queue");
    } catch {
      toast.error("Could not remove from queue");
    }
  }, [currentLead?.id, refetchQueue]);

  const handleSkipTraceQueue = useCallback(async () => {
    if (queueSkipTracing) return;
    setQueueSkipTracing(true);
    try {
      const res = await fetch("/api/dialer/v1/dial-queue/skip-trace", {
        method: "POST",
        headers: await authHeaders(),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to skip trace queue");
        return;
      }

      const summary = data.summary as {
        checked: number;
        tracedNow: number;
        skippedAlreadyTraced: number;
        failed: number;
        phonesSaved: number;
      };

      refetchQueue();
      if (currentLead?.id) {
        const hdrs = await authHeaders();
        fetch(`/api/leads/${currentLead.id}/phones`, { headers: hdrs }).catch(() => {});
      }

      const pieces = [
        `${summary.checked} checked`,
        `${summary.tracedNow} traced now`,
        `${summary.skippedAlreadyTraced} already traced`,
        `${summary.failed} failed`,
        `${summary.phonesSaved} phones saved`,
      ];

      if (summary.failed > 0) {
        toast.warning(`Queue skip trace finished: ${pieces.join(", ")}`);
      } else {
        toast.success(`Queue skip trace finished: ${pieces.join(", ")}`);
      }
    } finally {
      setQueueSkipTracing(false);
    }
  }, [queueSkipTracing, refetchQueue, currentLead?.id]);

  // ── Remove lead from auto-cycle inline ──────────────────────────────
  const handleRemoveFromAutoCycle = useCallback(async (leadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/dialer/v1/auto-cycle?leadId=${encodeURIComponent(leadId)}`, {
        method: "DELETE",
        headers: await authHeaders(),
      });
      if (!res.ok) throw new Error();
      if (currentLead?.id === leadId) setCurrentLead(null);
      refetchAutoCycle();
      toast.success("Removed from Auto Cycle");
    } catch {
      toast.error("Could not remove");
    }
  }, [currentLead?.id, refetchAutoCycle]);

  // ── Incoming call handler — attached to provider-managed Device ──
  useEffect(() => {
    const device = deviceRef.current;
    if (!device) return;

    const handleIncoming = (call: Call) => {
      console.log("[VoIP] Incoming call from", call.parameters?.From);
      const fromNumber = call.parameters?.From ?? null;
      setIncomingCall(call);
      setIncomingFrom(fromNumber);
      setIncomingMatch(null);

      if (fromNumber) {
        authHeaders().then(async (h) => {
          const [lookupRes, briefRes] = await Promise.all([
            fetch(`/api/dialer/v1/phone-lookup?phone=${encodeURIComponent(fromNumber)}`, { headers: h }),
            fetch(`/api/dialer/v1/transfer-brief?phone=${encodeURIComponent(fromNumber)}`, { headers: h }),
          ]);
          const data = lookupRes.ok ? await lookupRes.json() : null;
          const briefData = briefRes.ok ? await briefRes.json() : null;

          if (briefData?.brief) {
            const b = briefData.brief as TransferBriefFull;
            setIncomingMatch({
              type: "transfer",
              name: b.lead?.name ?? data?.leads?.[0]?.properties?.owner_name ?? data?.leads?.[0]?.owner_name ?? "Seller",
              address: b.lead?.address ?? b.property?.address ?? data?.leads?.[0]?.properties?.address ?? undefined,
              summary: b.transferReason ?? "Jeff qualified this caller",
              transferBrief: b,
            });
            return;
          }

          if (!data) { setIncomingMatch({ type: "unknown" }); return; }
          if (data.leads?.length === 1) {
            const l = data.leads[0];
            setIncomingMatch({ type: "lead", name: l.properties?.owner_name ?? l.owner_name ?? "Known lead", address: l.properties?.address ?? null });
          } else if (data.leads?.length > 1) {
            setIncomingMatch({ type: "lead", name: `${data.leads.length} leads match this number` });
          } else if (data.unlinkedSessions?.length) {
            setIncomingMatch({ type: "jeff", summary: "Previous caller — has history" });
          } else {
            setIncomingMatch({ type: "unknown" });
          }
        }).catch(() => setIncomingMatch({ type: "unknown" }));
      }

      try {
        if (!incomingAudioRef.current) {
          incomingAudioRef.current = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ==");
          incomingAudioRef.current.loop = true;
        }
        incomingAudioRef.current.play().catch(() => {});
      } catch {}

      call.on("cancel", () => {
        setIncomingCall(null);
        setIncomingFrom(null);
        setIncomingMatch(null);
        incomingAudioRef.current?.pause();
        if (fromNumber) {
          setMissedCalls((prev) => [{ phone: fromNumber, time: new Date().toISOString(), id: crypto.randomUUID() }, ...prev.slice(0, 9)]);
        }
      });
      call.on("disconnect", () => {
        // Pre-accept disconnect: caller hung up while ringing.
        // Post-accept disconnect is handled by handleAnswerIncoming's listeners.
        setIncomingCall(null);
        setIncomingFrom(null);
        setIncomingMatch(null);
        incomingAudioRef.current?.pause();
      });
    };

    device.on("incoming", handleIncoming);
    return () => { device.removeListener("incoming", handleIncoming); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceStatus]);

  // ── Real-time call status polling ─────────────────────────────────
  // Polls /api/dialer/call-status every 2s to track the actual Twilio call state
  useEffect(() => {
    if (callState !== "connected" && callState !== "dialing") {
      // Stop polling when not in a call
      if (statusPollRef.current) {
        clearInterval(statusPollRef.current);
        statusPollRef.current = null;
      }
      setLiveCallStatus(null);
      return;
    }

    const poll = async () => {
      if (!currentCallLogId && !currentCallSid) return;
      try {
        const hdrs = await authHeaders();
        const params = new URLSearchParams();
        if (currentCallLogId) params.set("callLogId", currentCallLogId);
        if (currentCallSid) params.set("callSid", currentCallSid);
        const res = await fetch(`/api/dialer/call-status?${params}`, { headers: hdrs });
        if (!res.ok) return;
        const data = await res.json();

        const status = data.twilioStatus || data.dbStatus;
        setLiveCallStatus(status);

        // Detect failures the old flow would miss
        if (status === "failed" || status === "canceled" || status === "busy" || status === "no-answer") {
          const reason = data.twilioError || `Call ${status}`;
          toast.error(reason);
          setTransferStatus(`Call failed: ${reason}`);
          // Don't auto-reset to idle — let the user see the error and disposition
        }

        // Safety net: if Twilio says the call completed but we still show
        // "connected", force-disconnect the browser leg so the operator
        // doesn't sit on dead air thinking the customer is still there.
        if (status === "completed" && callState === "connected") {
          console.warn("[Dialer] Twilio reports completed but UI still connected — forcing disconnect");
          if (activeCallRef.current) {
            try { activeCallRef.current.disconnect(); } catch { /* already dead */ }
          }
          setActiveCall(null);
          setCallState("ended");
          setTransferStatus(null);
          setLiveCallStatus("completed");
          timer.stop();
        }
      } catch {
        // Non-blocking
      }
    };

    // Poll immediately, then every 2s
    poll();
    statusPollRef.current = setInterval(poll, 2000);

    return () => {
      if (statusPollRef.current) {
        clearInterval(statusPollRef.current);
        statusPollRef.current = null;
      }
    };
  }, [callState, currentCallLogId, currentCallSid]);

  // ── Twilio diagnostics ──────────────────────────────────────────
  const runDiagnostics = useCallback(async () => {
    setDiagLoading(true);
    setDiagResults(null);
    try {
      const res = await fetch("/api/dialer/test", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ userId: currentUser.id }),
      });
      const data = await res.json();
      setDiagResults(data.checks ?? []);
      if (data.overall === "fail") {
        toast.error("Twilio setup has issues — see diagnostics below");
      } else if (data.overall === "warn") {
        toast("Twilio setup has warnings — review diagnostics", { icon: "⚠️" });
      } else {
        toast.success("Twilio setup looks good!");
      }
    } catch {
      toast.error("Failed to run diagnostics");
    } finally {
      setDiagLoading(false);
    }
  }, [currentUser.id]);

  // ── Incoming call handlers ────────────────────────────────────────
  const handleAnswerIncoming = useCallback(async () => {
    if (!incomingCall) return;
    incomingAudioRef.current?.pause();

    // Accept the call first
    incomingCall.accept();
    const acceptedCall = incomingCall;
    setActiveCall(acceptedCall);
    setCallState("connected");
    timer.start();
    setIncomingCall(null);

    // ── Attach event listeners to the accepted call ──────────────────
    // Without these, disconnect/error events are silently lost and the
    // UI can sit on dead air forever.
    acceptedCall.on("disconnect", () => {
      console.log("[Dialer] Inbound call disconnected");
      setActiveCall(null);
      setCallState("ended");
      timer.stop();
      const sessId = activeSessionRef.current;
      if (sessId) {
        authHeaders().then(async (hdrs) => {
          const res = await fetch(`/api/dialer/v1/sessions/${sessId}`, {
            method: "PATCH",
            headers: hdrs,
            body: JSON.stringify({ status: "ended" }),
          });
          if (!res.ok) {
            await fetch(`/api/dialer/v1/sessions/${sessId}`, {
              method: "PATCH",
              headers: hdrs,
              body: JSON.stringify({ status: "failed" }),
            });
          }
        }).catch(() => {});
      }
    });

    acceptedCall.on("error", (err: { message?: string }) => {
      console.error("[Dialer] Inbound call error:", err.message);
      toast.error(`Call error: ${err.message ?? "unknown"}`);
      setActiveCall(null);
      setCallState("ended");
      timer.stop();
      const sessId = activeSessionRef.current;
      if (sessId) {
        authHeaders().then((hdrs) =>
          fetch(`/api/dialer/v1/sessions/${sessId}`, {
            method: "PATCH",
            headers: hdrs,
            body: JSON.stringify({ status: "failed" }),
          })
        ).catch(() => {});
      }
    });

    acceptedCall.on("cancel", () => {
      console.log("[Dialer] Inbound call canceled by caller");
      setActiveCall(null);
      setCallState("idle");
      timer.reset();
      const sessId = activeSessionRef.current;
      if (sessId) {
        authHeaders().then((hdrs) =>
          fetch(`/api/dialer/v1/sessions/${sessId}`, {
            method: "PATCH",
            headers: hdrs,
            body: JSON.stringify({ status: "failed" }),
          })
        ).catch(() => {});
      }
    });

    // If matched to a known lead, load it and auto-open client file
    let matchedLead: typeof currentLead = null;
    if (incomingMatch?.type === "lead" && incomingFrom) {
      matchedLead = displayedQueue.find((q) => q.properties?.owner_phone?.replace(/\D/g, "")?.slice(-10) === incomingFrom.replace(/\D/g, "").slice(-10)) ?? null;
      if (matchedLead) {
        setCurrentLead(matchedLead);
        setFileModalOpen(true);
      }
    }

    // Auto-open client file for Jeff transfers so the operator sees full context immediately
    if (incomingMatch?.type === "transfer" && incomingMatch.transferBrief?.leadId) {
      const briefLead = displayedQueue.find((q) => q.id === incomingMatch.transferBrief!.leadId) ?? null;
      if (briefLead) {
        matchedLead = briefLead;
        setCurrentLead(briefLead);
        setFileModalOpen(true);
      } else if (incomingMatch.transferBrief.leadUrl) {
        window.open(incomingMatch.transferBrief.leadUrl, "_blank");
      }
    }

    // Look up the session created by the inbound webhook (or create one as fallback)
    // The inbound webhook creates session + calls_log + starts Deepgram stream BEFORE ringing
    try {
      const hdrs = await authHeaders();
      const phoneDigits = incomingFrom?.replace(/\D/g, "") ?? "";
      const phoneFmt = phoneDigits.length >= 10 ? `+1${phoneDigits.slice(-10)}` : incomingFrom;

      console.log("[Dialer] Inbound answer — incomingFrom:", incomingFrom, "phoneDigits:", phoneDigits);

      // Find the inbound session created by the webhook.
      let existingSessionId: string | null = null;
      let existingCallLogId: string | null = null;
      let existingTwilioSid: string | null = null;
      try {
        const ringingRes = await fetch("/api/dialer/v1/sessions/inbound-ringing", { headers: hdrs });
        if (ringingRes.ok) {
          const ringingData = await ringingRes.json();
          if (ringingData.session) {
            existingSessionId = ringingData.session.id;
            existingTwilioSid = ringingData.session.twilio_sid ?? null;
            console.log("[Dialer] Found ringing inbound session:", existingSessionId, "phone:", ringingData.session.phone_dialed);
          }
        }
      } catch {
        console.log("[Dialer] Ringing session lookup failed");
      }
      if (!existingSessionId) {
        console.log("[Dialer] No ringing session found — will create fallback");
      }

      if (existingSessionId) {
        // Claim the session — BLOCKING so ownership is guaranteed before any
        // note polling or live coach fetches happen.
        activeSessionRef.current = existingSessionId;
        if (matchedLead) {
          setDialerSessionId(existingSessionId);
        } else {
          setManualSessionId(existingSessionId);
          setManualStatus("connected");
        }

        try {
          const claimRes = await fetch("/api/dialer/v1/sessions/claim-inbound", {
            method: "POST",
            headers: hdrs,
            body: JSON.stringify({ sessionId: existingSessionId }),
          });
          if (claimRes.ok) {
            const claimData = await claimRes.json();
            console.log("[Dialer] Session claimed:", claimData);
          } else {
            console.warn("[Dialer] Claim-inbound returned", claimRes.status);
          }
        } catch (e) {
          console.warn("[Dialer] Claim-inbound failed:", e);
        }

        // Look up the calls_log entry linked to this session for status polling
        try {
          const logRes = await fetch(
            `/api/dialer/call-status?sessionId=${encodeURIComponent(existingSessionId)}`,
            { headers: hdrs },
          );
          if (logRes.ok) {
            const logData = await logRes.json();
            if (logData.callLogId) {
              existingCallLogId = logData.callLogId;
              setCurrentCallLogId(logData.callLogId);
              console.log("[Dialer] Linked callLogId:", logData.callLogId);
            }
          }
        } catch {
          console.log("[Dialer] Call log lookup failed — polling may be limited");
        }

        // Set twilio SID so status polling has a fallback
        if (existingTwilioSid) {
          setCurrentCallSid(existingTwilioSid);
        }
      } else {
        // Fallback: create a new session if webhook didn't create one
        const sessRes = await fetch("/api/dialer/v1/sessions", {
          method: "POST",
          headers: hdrs,
          body: JSON.stringify({
            lead_id: matchedLead?.id ?? null,
            phone_dialed: phoneFmt,
          }),
        });
        if (sessRes.ok) {
          const sessData = await sessRes.json();
          const newSessionId = sessData.session?.id ?? null;
          activeSessionRef.current = newSessionId;
          if (matchedLead) {
            setDialerSessionId(newSessionId);
          } else {
            setManualSessionId(newSessionId);
          }
          if (newSessionId) {
            await fetch(`/api/dialer/v1/sessions/${newSessionId}`, {
              method: "PATCH",
              headers: hdrs,
              body: JSON.stringify({ status: "connected" }),
            }).catch(() => {});
          }
        }
      }
    } catch {
      console.warn("[Dialer] Inbound session lookup/creation failed — call proceeds without tracking");
    }

    toast.success("Call connected");
  }, [displayedQueue, incomingCall, incomingMatch, incomingFrom, timer]);

  const handleDeclineIncoming = useCallback(() => {
    if (!incomingCall) return;
    incomingAudioRef.current?.pause();
    incomingCall.reject();
    if (incomingFrom) {
      setMissedCalls((prev) => [{ phone: incomingFrom!, time: new Date().toISOString(), id: crypto.randomUUID() }, ...prev.slice(0, 9)]);
    }
    setIncomingCall(null);
    setIncomingFrom(null);
    setIncomingMatch(null);
  }, [incomingCall, incomingFrom]);

  // ── Jeff callback handler ──────────────────────────────────────────
  const handleJeffCallback = useCallback(async (phone: string, _summary: string | null) => {
    const target = phone.replace(/\D/g, "");
    if (!target || target.length < 10) { toast.error("Invalid phone number"); return; }
    if (!deviceRef.current || deviceStatus !== "ready") { toast.error("VoIP not ready"); return; }
    setCallState("dialing");
    setManualStatus("dialing");
    try {
      const call = await deviceRef.current.connect({
        params: { To: `+1${target.slice(-10)}`, CallerId: voipCallerId },
      });
      setActiveCall(call);
      timer.start();
    } catch {
      toast.error("Call failed");
      setCallState("idle");
      setManualStatus("idle");
    }
  }, [deviceStatus, voipCallerId, timer]);

  const handleDial = useCallback(async () => {
    const target = currentLead;
    if (!target) return;
    const phone = selectedDialPhone;
    if (!phone) {
      toast.error("No phone number for this lead");
      return;
    }

    if (!target.compliant && !ghostMode) {
      toast.error("Compliance blocked — cannot dial");
      return;
    }

    if (!deviceRef.current || deviceStatus !== "ready") {
      toast.error("VoIP not connected — click Reconnect and try again");
      return;
    }

    setCurrentLead(target);
    setCurrentDialedPhone(phone);
    setCallState("dialing");
    setCallNotes("");
    timer.start();

    try {
      // Create dialer session for session notes + post-call publish (PR2/PR3).
      // Non-blocking: if session creation fails, call proceeds without session tracking.
      let newSessionId: string | null = null;
      try {
        const sessionRes = await fetch("/api/dialer/v1/sessions", {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({ lead_id: target.id, phone_dialed: toE164(phone) }),
        });
        if (sessionRes.ok) {
          const sessionData = await sessionRes.json();
          newSessionId = sessionData.session?.id ?? null;
        }
      } catch {
        console.warn("[Dialer] Session creation failed — call will proceed without session tracking");
      }
      setDialerSessionId(newSessionId);

      // VoIP pre-flight: compliance + logging
      const res = await fetch("/api/dialer/call", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({
          phone,
          leadId: target.id,
          propertyId: target.property_id,
          userId: currentUser.id,
          ghostMode,
          mode: "voip",
          sessionId: newSessionId,  // links calls_log.dialer_session_id → call_sessions
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Call failed");
        setCallState("idle");
        setDialerSessionId(null);
        setCurrentDialedPhone(null);
        timer.reset();
        return;
      }

      setCurrentCallLogId(data.callLogId);

      // Connect via browser VoIP
      const call = await deviceRef.current.connect({
        params: {
          To: toE164(phone),
          callLogId: data.callLogId ?? "",
          agentId: currentUser.id,
          callerId: voipCallerId,
          sessionId: newSessionId ?? "",  // forwarded by browser route into StatusCallback (PR2)
        },
      });

      setActiveCall(call);
      setTransferStatus("Connecting via VoIP…");
      setCallState("connected");

      call.on("ringing", () => {
        setLiveCallStatus("ringing");
        setTransferStatus("Ringing seller…");
        // Advance session: initiating → ringing (required before ended is valid)
        if (newSessionId) {
          authHeaders().then((hdrs) =>
            fetch(`/api/dialer/v1/sessions/${newSessionId}`, {
              method: "PATCH",
              headers: hdrs,
              body: JSON.stringify({ status: "ringing" }),
            })
          ).catch(() => {});
        }
      });

      call.on("accept", () => {
        setLiveCallStatus("in-progress");
        setTransferStatus("Connected via VoIP — Dominion Homes");
        toast.success("Call connected via VoIP");
        // Advance session: ringing → connected (or initiating → connected)
        if (newSessionId) {
          authHeaders().then((hdrs) =>
            fetch(`/api/dialer/v1/sessions/${newSessionId}`, {
              method: "PATCH",
              headers: hdrs,
              body: JSON.stringify({ status: "connected" }),
            })
          ).catch(() => {});
        }
      });

      call.on("disconnect", () => {
        setLiveCallStatus("completed");
        setActiveCall(null);
        setCallState("ended");
        timer.stop();
        // Advance session to terminal so publish can proceed.
        // Try "ended" first; fall back to "failed" if session is still in
        // "initiating" (where "ended" is not a valid DB transition).
        if (newSessionId) {
          authHeaders().then(async (hdrs) => {
            const res = await fetch(`/api/dialer/v1/sessions/${newSessionId}`, {
              method: "PATCH",
              headers: hdrs,
              body: JSON.stringify({ status: "ended" }),
            });
            if (!res.ok) {
              await fetch(`/api/dialer/v1/sessions/${newSessionId}`, {
                method: "PATCH",
                headers: hdrs,
                body: JSON.stringify({ status: "failed" }),
              });
            }
          }).catch(() => {});
        }
      });

      call.on("error", (err: { message?: string }) => {
        toast.error(`Call error: ${err.message ?? "unknown"}`);
        setLiveCallStatus("failed");
        setActiveCall(null);
        if (newSessionId) {
          authHeaders().then((hdrs) =>
            fetch(`/api/dialer/v1/sessions/${newSessionId}`, {
              method: "PATCH",
              headers: hdrs,
              body: JSON.stringify({ status: "failed" }),
            })
          ).catch(() => {});
        }
      });

      call.on("cancel", () => {
        setLiveCallStatus("canceled");
        setActiveCall(null);
        if (newSessionId) {
          authHeaders().then((hdrs) =>
            fetch(`/api/dialer/v1/sessions/${newSessionId}`, {
              method: "PATCH",
              headers: hdrs,
              body: JSON.stringify({ status: "failed" }),
            })
          ).catch(() => {});
        }
      });
    } catch (err) {
      console.error("[Dialer]", err);
      toast.error("Network error — call not placed");
      setCallState("idle");
      setCurrentDialedPhone(null);
      timer.reset();
    }
  }, [currentLead, currentUser.id, deviceStatus, ghostMode, selectedDialPhone, timer, voipCallerId]);

  const handleSendText = useCallback(async () => {
    if (!currentLead) return;
    const phone = selectedDialPhone;
    if (!phone) {
      toast.error("No phone number for this lead");
      return;
    }

    setSmsLoading(true);
    try {
      const res = await fetch("/api/dialer/sms", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({
          phone,
          message: `Hi ${currentLead.properties?.owner_name?.split(" ")[0] ?? "there"}, this is Dominion Homes. We're interested in your property at ${currentLead.properties?.address ?? "your address"}. Would you have a few minutes to chat? Reply STOP to opt out.`,
          leadId: currentLead.id,
          propertyId: currentLead.property_id,
          userId: currentUser.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "SMS failed");
      } else {
        toast.success("Text sent via Dominion Homes");
      }
    } catch {
      toast.error("Network error — SMS not sent");
    } finally {
      setSmsLoading(false);
    }
  }, [currentLead, currentUser.id, selectedDialPhone]);

  // ── Lead card inline SMS send ──────────────────────────────────────
  const handleLeadSmsSend = useCallback(async (phone: string) => {
    if (!currentLead || !leadSmsMsg.trim()) return;
    setLeadSmsSending(true);
    try {
      const res = await fetch("/api/dialer/sms", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({
          phone,
          message: leadSmsMsg.trim(),
          leadId: currentLead.id,
          propertyId: currentLead.property_id,
          userId: currentUser.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "SMS failed");
      } else {
        toast.success("Text sent via Dominion Homes");
        setLeadSmsOpen(false);
        setLeadSmsMsg("");
      }
    } catch {
      toast.error("Network error — SMS not sent");
    } finally {
      setLeadSmsSending(false);
    }
  }, [currentLead, leadSmsMsg, currentUser.id]);

  // ── Quick Manual Dial handler ──────────────────────────────────────
  const handleManualDial = useCallback(async () => {
    if (manualPhone.length < 10) {
      toast.error("Enter a valid 10-digit phone number");
      return;
    }

    if (!deviceRef.current || deviceStatus !== "ready") {
      toast.error("VoIP not connected — click Reconnect and try again");
      return;
    }

    setManualDialing(true);
    setManualStatus("dialing");

    try {
      // VoIP pre-flight
      const res = await fetch("/api/dialer/call", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({
          phone: toE164(manualPhone),
          userId: currentUser.id,
          ghostMode,
          mode: "voip",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Call failed");
        setManualStatus("idle");
        setManualDialing(false);
        return;
      }

      setManualCallLogId(data.callLogId);

      // Create a session so PostCallPanel can render after the call
      let manualSessionIdLocal: string | null = null;
      try {
        const sessRes = await fetch("/api/dialer/v1/sessions", {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            lead_id: null,
            phone_dialed: toE164(manualPhone),
          }),
        });
        if (sessRes.ok) {
          const sessData = await sessRes.json();
          manualSessionIdLocal = sessData.session?.id ?? null;
          setManualSessionId(manualSessionIdLocal);
        }
      } catch { /* non-fatal — manual dial still works without session */ }

      // Connect via browser VoIP
      const call = await deviceRef.current.connect({
        params: {
          To: toE164(manualPhone),
          callLogId: data.callLogId ?? "",
          sessionId: manualSessionIdLocal ?? "",
          agentId: currentUser.id,
          callerId: voipCallerId,
        },
      });

      setActiveCall(call);
      setManualStatus("connected");

      call.on("ringing", () => {
        toast.success(`Ringing ${formatUsPhone(manualPhone)} via VoIP…`);
        // Advance manual session: initiating → ringing
        if (manualSessionIdLocal) {
          authHeaders().then((hdrs) =>
            fetch(`/api/dialer/v1/sessions/${manualSessionIdLocal}`, {
              method: "PATCH",
              headers: hdrs,
              body: JSON.stringify({ status: "ringing" }),
            })
          ).catch(() => {});
        }
      });

      call.on("accept", () => {
        toast.success(`Connected to ${formatUsPhone(manualPhone)} via VoIP`);
        // Advance manual session: ringing → connected
        if (manualSessionIdLocal) {
          authHeaders().then((hdrs) =>
            fetch(`/api/dialer/v1/sessions/${manualSessionIdLocal}`, {
              method: "PATCH",
              headers: hdrs,
              body: JSON.stringify({ status: "connected" }),
            })
          ).catch(() => {});
        }
      });

      call.on("disconnect", () => {
        setActiveCall(null);
        setManualStatus("ended");
        // Advance manual session to terminal so closeout works.
        // Try "ended" first; if session is still in "initiating" (fire-and-forget
        // ringing/connected PATCHes haven't landed), "ended" is invalid per DB
        // trigger. Fall back to "failed" which is valid from any non-terminal state.
        if (manualSessionIdLocal) {
          authHeaders().then(async (hdrs) => {
            const res = await fetch(`/api/dialer/v1/sessions/${manualSessionIdLocal}`, {
              method: "PATCH",
              headers: hdrs,
              body: JSON.stringify({ status: "ended" }),
            });
            if (!res.ok) {
              // Fallback: "failed" is valid from initiating/ringing/connected
              await fetch(`/api/dialer/v1/sessions/${manualSessionIdLocal}`, {
                method: "PATCH",
                headers: hdrs,
                body: JSON.stringify({ status: "failed" }),
              });
            }
          }).catch(() => {});
        }
      });

      call.on("error", (err: { message?: string }) => {
        toast.error(`Call error: ${err.message ?? "unknown"}`);
        setActiveCall(null);
        setManualStatus("idle");
      });
    } catch {
      toast.error("Network error — call not placed");
      setManualStatus("idle");
    } finally {
      setManualDialing(false);
    }
  }, [manualPhone, currentUser.id, ghostMode, deviceStatus, voipCallerId]);

  const handleManualHangup = useCallback(() => {
    if (activeCall) {
      activeCall.disconnect();
      setActiveCall(null);
    }
    // End the session so PostCallPanel can publish
    if (manualSessionId) {
      authHeaders().then((hdrs) =>
        fetch(`/api/dialer/v1/sessions/${manualSessionId}`, {
          method: "PATCH",
          headers: hdrs,
          body: JSON.stringify({ status: "ended" }),
        }),
      ).catch(() => {});
      setManualStatus("ended");
    } else {
      // No session — fall back to legacy counter PATCH and reset
      if (manualCallLogId) {
        authHeaders().then((hdrs) =>
          fetch("/api/dialer/call", {
            method: "PATCH",
            headers: hdrs,
            body: JSON.stringify({ callLogId: manualCallLogId, disposition: "manual_hangup", userId: currentUser.id }),
          }),
        ).catch(() => {});
      }
      setManualStatus("idle");
      setManualCallLogId(null);
    }
  }, [manualCallLogId, manualSessionId, currentUser.id, activeCall]);

  const handleManualSms = useCallback(async () => {
    if (manualPhone.length < 10) {
      toast.error("Enter a valid phone number first");
      return;
    }
    if (!smsComposeMsg.trim()) {
      toast.error("Enter a message");
      return;
    }

    setSmsComposeSending(true);
    try {
      const res = await fetch("/api/dialer/sms", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({
          phone: toE164(manualPhone),
          message: smsComposeMsg.trim(),
          userId: currentUser.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "SMS failed");
      } else {
        toast.success("Text sent via Dominion Homes");
        setSmsComposeOpen(false);
        setSmsComposeMsg("");
      }
    } catch {
      toast.error("Network error — SMS not sent");
    } finally {
      setSmsComposeSending(false);
    }
  }, [manualPhone, smsComposeMsg, currentUser.id]);

  const handleHangup = useCallback(() => {
    // Disconnect VoIP call
    if (activeCall) {
      activeCall.disconnect();
      setActiveCall(null);
    }
    if (dialerSessionId && callNotes.trim()) {
      const normalized = callNotes.trim();
      const alreadySaved = savedNotes.some((note) => note.content.trim() === normalized);
      if (!alreadySaved) {
        noteSeqRef.current += 1;
        authHeaders().then((headers) =>
          fetch(`/api/dialer/v1/sessions/${dialerSessionId}/notes`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              note_type: "operator_note",
              content: normalized,
              speaker: "operator",
              sequence_num: noteSeqRef.current,
              is_ai_generated: false,
            }),
          }),
        ).then((res) => {
          if (res?.ok) {
            setSavedNotes((prev) => [...prev, { content: normalized, time: new Date().toISOString() }]);
          }
        }).catch(() => {});
      }
    }
    setCallState("ended");
    setTransferStatus(null);
    setCurrentCallSid(null);
    setLiveCallStatus(null);
    setMuted(false);
    timer.stop();
  }, [timer, activeCall, dialerSessionId, callNotes, savedNotes]);

  const handleDisposition = useCallback(async (dispoKey: string) => {
    if (!currentCallLogId && callState !== "idle") {
      toast.error("No active call to disposition");
      return;
    }

    setDispositionPending(true);

    if (callState === "connected") {
      handleHangup();
    }

    if (currentCallLogId) {
      try {
        await fetch("/api/dialer/call", {
          method: "PATCH",
          headers: await authHeaders(),
          body: JSON.stringify({
            callLogId: currentCallLogId,
            disposition: dispoKey,
            durationSec: timer.elapsed,
            notes: callNotes || null,
            userId: currentUser.id,
          }),
        });
      } catch (err) {
        console.error("[Dialer] disposition error:", err);
      }
    }

    const dispo = DISPOSITIONS.find((d) => d.key === dispoKey);
    toast.success(`${dispo?.label ?? dispoKey} logged`);

    // Trigger AI summary in background (non-blocking)
    if (currentCallLogId && callNotes && callNotes.trim().length >= 5) {
      const summaryCallLogId = currentCallLogId;
      const summaryLeadId = currentLead?.id;
      const summaryNotes = callNotes;
      authHeaders().then((hdrs) =>
        fetch("/api/dialer/summarize", {
          method: "POST",
          headers: hdrs,
          body: JSON.stringify({
            callLogId: summaryCallLogId,
            notes: summaryNotes,
            leadId: summaryLeadId,
            disposition: dispoKey,
            duration: timer.elapsed,
            ownerName: currentLead?.properties?.owner_name,
            address: currentLead?.properties?.address,
          }),
        })
      ).then((res) => {
        if (res.ok) toast.success("AI call summary saved", { duration: 2000 });
      }).catch(() => {});
    }

    setCallState("idle");
    setCurrentCallLogId(null);
    setCurrentCallSid(null);
    setDialerSessionId(null);
    setLiveCallStatus(null);
    setCallNotes("");
    setTransferStatus(null);
    setMuted(false);
    timer.reset();
    setDispositionPending(false);

    // Phone cycling: if there are un-attempted active phones, stay on same lead
    // Terminal dispositions (dead_lead / disqualified) skip phone cycling but still
    // stay on lead — operator uses ⏩ to advance manually
    const isTerminal = dispoKey === "dead_lead" || dispoKey === "disqualified";
    const activePhones = leadPhones.filter(p => p.status === "active");
    const nextPhoneIdx = phoneIndex + 1;

    if (autoCycleMode) {
      // Auto-cycle: always advance to next lead
      const currentIdx = displayedQueue.findIndex((l) => l.id === currentLead?.id);
      const nextLead = displayedQueue[currentIdx + 1] ?? displayedQueue[0] ?? null;
      setCurrentLead(nextLead);
      refetchAutoCycle();
    } else if (!isTerminal && nextPhoneIdx < activePhones.length) {
      // Regular queue: cycle to next phone, stay on same lead
      setPhoneIndex(nextPhoneIdx);
      toast.info(`Phone ${nextPhoneIdx + 1} of ${activePhones.length} — next number loaded`);
      if (currentLead?.id) {
        authHeaders().then(hdrs =>
          fetch(`/api/leads/${currentLead.id}/phones`, { headers: hdrs })
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data?.phones) setLeadPhones(data.phones); })
        ).catch(() => {});
      }
    } else {
      const currentIdx = displayedQueue.findIndex((l) => l.id === currentLead?.id);
      const nextLead = displayedQueue[currentIdx + 1] ?? null;
      if (nextLead) {
        setCurrentLead(nextLead);
        setPhoneIndex(0);
        toast.info(isTerminal ? "Lead done — next lead loaded" : "Next lead loaded");
      } else {
        toast.info("Queue complete — all leads attempted");
      }
    }
  }, [autoCycleMode, currentCallLogId, callState, callNotes, currentLead, currentUser.id, displayedQueue, handleHangup, refetchAutoCycle, refetchQueue, timer, leadPhones, phoneIndex]);

  // ── PostCallPanel completion handler ────────────────────────────────
  // Shared by onComplete and onSkip — PostCallPanel handles its own API calls.
  // Cycles to the next un-attempted phone before advancing to the next lead.
  const handlePostCallDone = useCallback(() => {
    setCallState("idle");
    setCurrentCallLogId(null);
    setCurrentCallSid(null);
    setDialerSessionId(null);
    setCurrentDialedPhone(null);
    setLiveCallStatus(null);
    setCallNotes("");
    setTransferStatus(null);
    setMuted(false);
    setSavedNotes([]);
    noteSeqRef.current = 0;
    timer.reset();

    if (autoCycleMode) {
      setCurrentLead(null);
      setPhoneIndex(0);
      refetchAutoCycle();
      return;
    }

    // Regular queue: cycle phones within lead, then advance to next lead
    const activePhones = leadPhones.filter((p) => p.status === "active");
    const nextPhoneIdx = phoneIndex + 1;
    if (activePhones.length > 1 && nextPhoneIdx < activePhones.length) {
      setPhoneIndex(nextPhoneIdx);
      toast.info(`Phone ${nextPhoneIdx + 1} of ${activePhones.length} — next number loaded`);
      if (currentLead?.id) {
        authHeaders().then(hdrs =>
          fetch(`/api/leads/${currentLead.id}/phones`, { headers: hdrs })
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data?.phones) setLeadPhones(data.phones); })
        ).catch(() => {});
      }
    } else {
      const currentIdx = displayedQueue.findIndex((l) => l.id === currentLead?.id);
      const nextLead = displayedQueue[currentIdx + 1] ?? null;
      if (nextLead) {
        setCurrentLead(nextLead);
        setPhoneIndex(0);
        toast.info("Next lead loaded");
      } else {
        toast.info("Queue complete — all leads attempted");
      }
    }
  }, [autoCycleMode, currentLead, displayedQueue, refetchAutoCycle, timer, leadPhones, phoneIndex]);

  // ── Manual dial PostCallPanel completion handler ──────────────────
  const handleManualPostCallDone = useCallback(() => {
    setManualStatus("idle");
    setManualCallLogId(null);
    setManualSessionId(null);
  }, []);

  // ── Mid-call timestamped note save ─────────────────────────────────
  const handleSaveNote = useCallback(async () => {
    if (!dialerSessionId || !callNotes.trim() || savingNote) return;
    setSavingNote(true);
    const content = callNotes.trim();
    const alreadySaved = savedNotes.some((note) => note.content.trim() === content);
    if (alreadySaved) {
      setSavingNote(false);
      toast.info("Latest note is already saved", { duration: 1500 });
      return;
    }
    try {
      noteSeqRef.current += 1;
      const res = await fetch(`/api/dialer/v1/sessions/${dialerSessionId}/notes`, {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({
          note_type: "operator_note",
          content,
          speaker: "operator",
          sequence_num: noteSeqRef.current,
          is_ai_generated: false,
        }),
      });
      if (res.ok) {
        setSavedNotes((prev) => [...prev, { content, time: new Date().toISOString() }]);
        toast.success("Note saved", { duration: 1500 });
      }
    } catch { /* non-fatal */ }
    finally { setSavingNote(false); }
  }, [dialerSessionId, callNotes, savingNote, savedNotes]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;

      const dispo = DISPOSITIONS.find((d) => d.hotkey === e.key);
      // Disable hotkeys when PostCallPanel is active (callState===ended && dialerSessionId set)
      if (dispo && (callState === "connected" || (callState === "ended" && !dialerSessionId))) {
        e.preventDefault();
        handleDisposition(dispo.key);
        return;
      }

      if (e.key === "Enter" && callState === "idle" && currentLead) {
        e.preventDefault();
        handleDial();
        return;
      }

      if (e.key === "Escape" && (callState === "dialing" || callState === "connected")) {
        e.preventDefault();
        handleHangup();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [callState, dialerSessionId, currentLead, handleDial, handleDisposition, handleHangup]);

  const dialerContext = useMemo(() => {
    if (!currentLead) return null;

    const wf = buildOperatorWorkflowSummary({
      status: currentLead.status,
      qualificationRoute: currentLead.qualification_route,
      assignedTo: currentLead.assigned_to,
      nextCallScheduledAt: currentLead.next_call_scheduled_at,
      nextFollowUpAt: currentLead.next_follow_up_at ?? currentLead.follow_up_date,
      lastContactAt: currentLead.last_contact_at,
      totalCalls: currentLead.total_calls,
      createdAt: currentLead.promoted_at,
      promotedAt: currentLead.promoted_at,
    });
    const leadHistory = callHistory.find((entry) => entry.lead_id === currentLead.id);
    const recentOutcome = leadHistory?.disposition ?? currentLead.disposition_code ?? "none";
    const dueText = wf.dueLabel === "—" ? "No due date" : wf.dueLabel;
    const qualificationGaps = countQualificationGaps(currentLead);
    const qualificationGapNames = getQualificationGapNames(currentLead);
    const assistPrompts = compactCallAssistPrompts({
      route: currentLead.qualification_route ?? null,
      nextActionLabel: wf.doNow,
      hasDueDate: wf.effectiveDueIso != null,
      totalCalls: currentLead.total_calls ?? 0,
      missingMotivation: currentLead.motivation_level == null,
      missingTimeline: currentLead.seller_timeline == null,
      missingDecisionMaker: currentLead.decision_maker_confirmed !== true,
      missingPriceExpectation: currentLead.price_expectation == null,
      missingCondition: currentLead.condition_level == null,
    });

    // "Why Now" — the single most important pre-call signal
    const totalCalls = currentLead.total_calls ?? 0;
    const dueIso = wf.effectiveDueIso;
    let whyNow: { text: string; tone: "red" | "amber" | "muted" } = { text: "Queued lead", tone: "muted" };
    if (totalCalls === 0) {
      whyNow = { text: "First contact — never called", tone: "muted" };
    } else if (dueIso) {
      const dueMs = new Date(dueIso).getTime();
      const nowMs = Date.now();
      const diffDays = Math.round((dueMs - nowMs) / 86400000);
      if (diffDays < 0) {
        whyNow = { text: `Callback ${Math.abs(diffDays)}d overdue — seller expects you`, tone: "red" };
      } else if (diffDays === 0) {
        whyNow = { text: "Callback due today", tone: "amber" };
      } else {
        whyNow = { text: `Follow-up in ${diffDays}d`, tone: "muted" };
      }
    } else if (totalCalls > 0) {
      const daysSince = currentLead.last_contact_at
        ? Math.max(0, Math.floor((Date.now() - new Date(currentLead.last_contact_at).getTime()) / 86400000))
        : null;
      whyNow = {
        text: daysSince != null ? `Re-attempt — last touch ${daysSince}d ago` : "Re-attempt",
        tone: daysSince != null && daysSince > 7 ? "amber" : "muted",
      };
    }

    return {
      stage: stageLabel(currentLead.status),
      route: qualificationRouteLabel(currentLead.qualification_route),
      nextActionLabel: wf.doNow,
      dueText,
      qualificationScore: currentLead.qualification_score_total,
      qualificationGaps,
      qualificationGapNames,
      recentOutcome: recentOutcome.replace(/_/g, " "),
      notePreview: notePreview(currentLead.notes),
      assistPrompts,
      motivationLevel: currentLead.motivation_level,
      sellerTimeline:  currentLead.seller_timeline,
      lastContactAt:   currentLead.last_contact_at,
      whyNow,
    };
  }, [callHistory, currentLead]);

  return (
    <PageShell
      title="Dialer"
      description=""
      actions={
        <div className="flex items-center gap-2">
          {ghostMode && (
            <Badge variant="outline" className="text-sm gap-1 border-border/20 text-foreground">
              <Ghost className="h-2.5 w-2.5" /> Research Only
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setDiagOpen(!diagOpen); if (!diagResults) runDiagnostics(); }}
            className="gap-1.5 text-sm h-7 px-2 text-muted-foreground hover:text-primary"
          >
            {diagLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wifi className="h-3 w-3" />}
            Test Twilio
          </Button>
          <Badge
            variant={deviceStatus === "ready" ? "cyan" : "outline"}
            className={`text-sm gap-1 ${
              deviceStatus === "error" || deviceStatus === "offline"
                ? "border-border/20 text-muted-foreground"
                : deviceStatus === "initializing"
                  ? "border-border/30 text-muted-foreground"
                  : ""
            }`}
          >
            {deviceStatus === "ready" ? <Zap className="h-2.5 w-2.5" /> : deviceStatus === "error" || deviceStatus === "offline" ? <WifiOff className="h-2.5 w-2.5 opacity-60" /> : <Loader2 className="h-2.5 w-2.5 animate-spin" />}
            {callState === "connected"
              ? liveCallStatus === "ringing" ? "RINGING SELLER…"
                : liveCallStatus === "in-progress" ? "LIVE — VoIP"
                : liveCallStatus === "failed" ? "CALL FAILED"
                : "LIVE — VoIP"
              : deviceStatus === "ready" ? "VoIP Ready"
              : deviceStatus === "error" ? "VoIP Offline"
              : deviceStatus === "initializing" ? "Connecting…"
              : "VoIP Offline"}
          </Badge>
          {(deviceStatus === "error" || deviceStatus === "offline") && callState === "idle" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => initDevice()}
              className="gap-1 text-xs h-6 px-2 text-muted-foreground hover:text-primary"
            >
              <RefreshCw className="h-3 w-3" />
              Reconnect
            </Button>
          )}
          <CoachToggle />
        </div>
      }
    >
      {/* ── Twilio Diagnostics Panel ──────────────────────────────────── */}
      <AnimatePresence>
        {diagOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 overflow-hidden"
          >
            <GlassCard hover={false} className="!p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Wifi className="h-4 w-4 text-primary" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Twilio Connection Diagnostics
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={runDiagnostics}
                    disabled={diagLoading}
                    className="gap-1 text-sm h-6 px-2"
                  >
                    {diagLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Re-test
                  </Button>
                  <button onClick={() => setDiagOpen(false)} className="p-1 rounded hover:bg-overlay-6">
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
              </div>

              {diagLoading && !diagResults && (
                <div className="flex items-center gap-2 py-4 justify-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-xs">Running diagnostics…</span>
                </div>
              )}

              {diagResults && (
                <div className="space-y-2">
                  {diagResults.map((check, i) => (
                    <div key={i} className={`rounded-[10px] border px-3 py-2 text-xs ${
                      check.status === "pass"
                        ? "border-border/20 bg-muted/[0.04]"
                        : check.status === "warn"
                        ? "border-border/20 bg-muted/[0.04]"
                        : "border-border/20 bg-muted/[0.04]"
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className={`font-mono text-sm font-bold uppercase ${
                          check.status === "pass" ? "text-foreground" : check.status === "warn" ? "text-foreground" : "text-foreground"
                        }`}>
                          {check.status === "pass" ? "PASS" : check.status === "warn" ? "WARN" : "FAIL"}
                        </span>
                        <span className="font-semibold text-foreground/80">{check.name}</span>
                      </div>
                      <p className="mt-0.5 text-muted-foreground/70">{check.message}</p>
                      {check.detail && (
                        <p className="mt-1 text-sm text-muted-foreground/50 leading-relaxed">{check.detail}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Live Call Status Banner ────────────────────────────────────── */}
      <AnimatePresence>
        {callState === "connected" && liveCallStatus && !["in-progress", "completed", "agent_connected", "agent_answered"].includes(liveCallStatus) && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`mb-3 px-4 py-2 rounded-[10px] border text-xs flex items-center gap-2 ${
              liveCallStatus === "failed" || liveCallStatus === "canceled"
                ? "border-border/30 bg-muted/8 text-foreground"
                : liveCallStatus === "ringing" || liveCallStatus === "ringing_agent" || liveCallStatus === "initiated"
                ? "border-primary/30 bg-primary/8 text-primary"
                : "border-border/30 bg-muted/8 text-foreground"
            }`}
          >
            {(liveCallStatus === "failed" || liveCallStatus === "canceled") ? (
              <WifiOff className="h-3.5 w-3.5 flex-shrink-0" />
            ) : (
              <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
            )}
            <span className="font-medium">
              {liveCallStatus === "initiated" && "Connecting VoIP call…"}
              {liveCallStatus === "ringing" && "Ringing seller…"}
              {liveCallStatus === "ringing_prospect" && "Ringing seller…"}
              {liveCallStatus === "ringing_agent" && "Connecting VoIP…"}
              {liveCallStatus === "failed" && "Call failed — run diagnostics to troubleshoot"}
              {liveCallStatus === "canceled" && "Call was canceled"}
              {liveCallStatus === "busy" && "Seller line is busy"}
              {liveCallStatus === "no-answer" && "No answer — try again"}
              {liveCallStatus === "agent_busy" && "Line is busy — try again"}
              {liveCallStatus === "agent_no_answer" && "No answer — try again"}
              {!["initiated", "ringing", "ringing_prospect", "ringing_agent", "failed", "canceled", "busy", "no-answer", "agent_busy", "agent_no_answer"].includes(liveCallStatus) && `Status: ${liveCallStatus}`}
            </span>
            {(liveCallStatus === "failed" || liveCallStatus === "canceled") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setDiagOpen(true); runDiagnostics(); }}
                className="ml-auto gap-1 text-sm h-6 px-2 text-foreground hover:text-foreground"
              >
                <AlertTriangle className="h-3 w-3" />
                Diagnose
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className={cn("mb-2 rounded-[12px] border border-overlay-6 bg-overlay-2 shadow-[0_16px_40px_var(--shadow-soft)]", scoreboardExpanded && !callActive ? "p-3" : "px-3 py-2", callActive && "hidden")}>
        <button
          type="button"
          onClick={() => setScoreboardExpanded((value) => !value)}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <div className="min-w-0 flex items-center gap-2">
            <BarChart3 className="h-3 w-3 text-muted-foreground/50 shrink-0" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground/60">Scoreboard</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {!scoreboardExpanded && (
              <div className="hidden items-center gap-2 text-xs text-muted-foreground/65 sm:flex">
                {KPI_GROUPS.map((group) => (
                  <div key={group.key} className="rounded-full border border-overlay-6 bg-overlay-3 px-2.5 py-1">
                    <span className="uppercase tracking-[0.18em]">{group.label}</span>
                    <span className="ml-2 font-medium text-foreground/85">
                      {(group.format ? group.format(kpiSnapshot.metrics[group.key].user) : kpiSnapshot.metrics[group.key].user.toString())}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-overlay-6 bg-overlay-3 text-muted-foreground transition-colors hover:text-foreground">
              <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", scoreboardExpanded && "rotate-90")} />
            </span>
          </div>
        </button>

        {scoreboardExpanded && !callActive && (
          <div className="mt-3 border-t border-overlay-6 pt-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex flex-col gap-2 xl:items-start">
                <div className="flex flex-wrap gap-2">
                  {KPI_PERIOD_LABELS.map((period) => (
                    <button
                      key={period.key}
                      type="button"
                      onClick={() => setSelectedKpiPreset(period.key)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] transition-colors",
                        selectedKpiPreset === period.key
                          ? "border-primary/30 bg-primary/10 text-primary"
                          : "border-overlay-6 bg-overlay-3 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {period.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/55">From</label>
                    <Input
                      type="date"
                      value={customKpiFrom}
                      max={customKpiTo || undefined}
                      onChange={(event) => {
                        const nextFrom = event.target.value;
                        setCustomKpiFrom(nextFrom);
                        setSelectedKpiPreset("custom");
                        if (customKpiTo && nextFrom && customKpiTo < nextFrom) {
                          setCustomKpiTo(nextFrom);
                        }
                      }}
                      className="h-9 w-[152px] border-overlay-6 bg-overlay-3 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/55">To</label>
                    <Input
                      type="date"
                      value={customKpiTo}
                      min={customKpiFrom || undefined}
                      onChange={(event) => {
                        setCustomKpiTo(event.target.value);
                        setSelectedKpiPreset("custom");
                      }}
                      className="h-9 w-[152px] border-overlay-6 bg-overlay-3 text-sm"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 px-3 text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setCustomKpiFrom("");
                      setCustomKpiTo("");
                      setSelectedKpiPreset("today");
                    }}
                  >
                    Reset
                  </Button>
                </div>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground/60">
              <span>Showing</span>
              <span className="font-medium text-foreground/80">{kpiDateInputValue(kpiSnapshot.range.from) || "Beginning"}</span>
              <span>to</span>
              <span className="font-medium text-foreground/80">{kpiDateInputValue(kpiSnapshot.range.to) || "Now"}</span>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
              {KPI_GROUPS.map((group) => (
                <DialerKpiGroup
                  key={group.key}
                  label={group.label}
                  icon={group.icon}
                  accentClass={group.accentClass}
                  personal={kpiSnapshot.metrics[group.key].user}
                  team={kpiSnapshot.metrics[group.key].team}
                  loading={statsLoading}
                  format={group.format}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Quick Manual Dial ─────────────────────────────────────────── */}
      <GlassCard hover={false} className={cn("mb-2", manualDialOpen ? "!p-3" : "!px-3 !py-2", callActive && manualStatus === "idle" && "hidden")}>
        <button
          type="button"
          onClick={() => setManualDialExpanded((value) => !value)}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <div className="min-w-0 flex items-center gap-2">
            <Phone className="h-3 w-3 text-muted-foreground/50 shrink-0" />
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground/60">
              Manual Dial
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {!manualDialOpen && (
              <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground/60">
                <span className="rounded-full border border-overlay-6 bg-overlay-3 px-2.5 py-1 font-mono">
                  {formatUsPhone(manualPhone) || "(509) 555-1234"}
                </span>
              </div>
            )}
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-overlay-6 bg-overlay-3 text-muted-foreground transition-colors hover:text-foreground">
              <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", manualDialOpen && "rotate-90")} />
            </span>
          </div>
        </button>

        {manualDialOpen && (
          <div className="mt-3 border-t border-overlay-6 pt-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Input
              value={formatUsPhone(manualPhone)}
              onChange={(e) => {
                const raw = e.target.value.replace(/\D/g, "");
                setManualPhone(raw.slice(0, 10));
              }}
              placeholder="(509) 555-1234"
              className="text-sm font-mono tracking-wide bg-overlay-3 border-overlay-6 focus:border-primary/30 focus:ring-ring/10 h-9 pr-24"
              onKeyDown={(e) => {
                if (e.key === "Enter" && manualStatus === "idle") {
                  e.preventDefault();
                  handleManualDial();
                }
              }}
            />
            {manualStatus !== "idle" && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-sm">
                <span className={`h-2 w-2 rounded-full animate-pulse ${manualStatus === "dialing" ? "bg-muted" : manualStatus === "connected" ? "bg-primary" : "bg-muted"}`} />
                <span className={manualStatus === "dialing" ? "text-foreground" : manualStatus === "connected" ? "text-primary" : "text-foreground"}>
                  {manualStatus === "dialing" ? "Calling..." : manualStatus === "connected" ? "Live" : "Ended"}
                </span>
              </span>
            )}
          </div>

          {manualStatus === "idle" ? (
            <>
              <Button
                onClick={handleManualDial}
                disabled={manualDialing || manualPhone.length < 10}
                className="gap-1.5 h-9 px-4 bg-primary/15 hover:bg-primary/25 text-primary border border-primary/25 text-xs font-semibold"
              >
                {manualDialing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Phone className="h-3.5 w-3.5" />}
                Dial
              </Button>
              <Button
                onClick={() => {
                  if (manualPhone.length < 10) {
                    toast.error("Enter a valid phone number first");
                    return;
                  }
                  setSmsComposeOpen(!smsComposeOpen);
                }}
                disabled={manualPhone.length < 10}
                variant="outline"
                className="gap-1.5 h-9 px-4 border-border text-foreground hover:bg-muted text-xs font-semibold"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Text
              </Button>
            </>
          ) : (
            <Button
              onClick={handleManualHangup}
              variant="destructive"
              className="gap-1.5 h-9 px-4 text-xs font-semibold"
            >
              <PhoneOff className="h-3.5 w-3.5" />
              End
            </Button>
          )}
        </div>
        </div>
        )}

        {/* Inline SMS Compose */}
        <AnimatePresence>
          {smsComposeOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="mt-3 rounded-[12px] bg-overlay-3 border border-border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground/60 uppercase tracking-wider">
                    SMS to {formatUsPhone(manualPhone)}
                  </p>
                  <button onClick={() => setSmsComposeOpen(false)} className="text-muted-foreground/40 hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <textarea
                  value={smsComposeMsg}
                  onChange={(e) => setSmsComposeMsg(e.target.value)}
                  placeholder="Hi, this is Dominion Homes..."
                  className="w-full bg-transparent text-sm resize-none h-20 outline-none placeholder:text-muted-foreground/30 border border-overlay-4 rounded-[8px] p-2"
                  maxLength={500}
                />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground/50">{smsComposeMsg.length}/500</span>
                  <Button
                    onClick={handleManualSms}
                    disabled={smsComposeSending || !smsComposeMsg.trim()}
                    size="sm"
                    className="gap-1.5 bg-primary/12 hover:bg-primary/18 text-primary border border-primary/25"
                  >
                    {smsComposeSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Send
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Phone auto-match banner */}
        {phoneMatchResult && !currentLead && manualStatus === "connected" && (
          <GlassCard hover={false} className="!p-2.5 mt-3 border-primary/15">
            {phoneMatchResult.leads.length === 1 ? (
              <button
                type="button"
                onClick={() => {
                  const lead = displayedQueue.find((q) => q.id === phoneMatchResult.leads[0].id);
                  if (lead) { setCurrentLead(lead); toast.success("Lead loaded"); }
                  else toast.info("Lead found but not in queue — search in Leads tab");
                }}
                className="w-full text-left text-sm text-foreground/85 hover:text-foreground"
              >
                <span className="text-primary font-medium">Match found:</span>{" "}
                {phoneMatchResult.leads[0].ownerName} — {phoneMatchResult.leads[0].address ?? "No address"}
                <span className="text-xs text-muted-foreground/50 ml-2">Click to load</span>
              </button>
            ) : phoneMatchResult.leads.length > 1 ? (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground/60 font-semibold uppercase tracking-wider">Multiple leads match this number</p>
                {phoneMatchResult.leads.slice(0, 3).map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => {
                      const lead = displayedQueue.find((q) => q.id === l.id);
                      if (lead) { setCurrentLead(lead); toast.success("Lead loaded"); }
                      else toast.info("Lead found but not in queue — search in Leads tab");
                    }}
                    className="block w-full text-left text-sm text-foreground/75 hover:text-foreground px-1.5 py-0.5 rounded hover:bg-overlay-4"
                  >
                    {l.ownerName} — {l.address ?? "No address"}
                  </button>
                ))}
              </div>
            ) : phoneMatchResult.unlinkedSessions.length > 0 ? (
              <p className="text-sm text-muted-foreground/70">
                <span className="text-primary/70 font-medium">Previous caller:</span>{" "}
                {phoneMatchResult.unlinkedSessions[0].summary ?? "No summary"}{" "}
                <span className="text-xs text-muted-foreground/40">
                  ({new Date(phoneMatchResult.unlinkedSessions[0].startedAt).toLocaleDateString()})
                </span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground/50">New caller — no history</p>
            )}
          </GlassCard>
        )}

        {/* AI Live Notes for manual dial — real-time transcription */}
        {(manualStatus === "connected" || manualStatus === "ended" || (manualCallLogId && displayedManualLiveNotes.length > 0)) && (
          <GlassCard hover={false} className="!p-3 mt-3 border-primary/10">
            <div className="flex items-center gap-1.5 mb-2">
              <Zap className="h-3 w-3 text-primary/60" />
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {manualLiveCoach?.structuredLiveNotes?.length ? "Structured Live Notes" : "Live Notes"}
              </p>
              {manualStatus === "connected" && (
                <span className="ml-auto flex items-center gap-1 text-xs text-primary/50">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  Listening
                </span>
              )}
            </div>
            {displayedManualLiveNotes.length > 0 ? (
              <ul className="space-y-1 max-h-48 overflow-y-auto">
                {displayedManualLiveNotes.map((note, i) => (
                  <li key={i} className="text-sm text-foreground/80 flex items-start gap-1.5">
                    <span className="text-primary/40 mt-0.5 shrink-0">&bull;</span>
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground/40 italic">
                Notes will appear as the conversation progresses...
              </p>
            )}
          </GlassCard>
        )}


        {/* Manual dial PostCallPanel — session-backed publish path */}
        {manualStatus === "ended" && manualSessionId && (
          <div className="mt-3">
            <PostCallPanel
              sessionId={manualSessionId}
              callLogId={manualCallLogId}
              userId={currentUser.id}
              timerElapsed={0}
              initialSummary=""
              initialMotivationLevel={null}
              initialSellerTimeline={null}
              onComplete={handleManualPostCallDone}
              onSkip={handleManualPostCallDone}
            />
          </div>
        )}
      </GlassCard>

      {/* ── Incoming Call Overlay ────────────────────────────────────── */}
      <AnimatePresence>
        {incomingCall && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className={cn(
                "w-full rounded-[16px] border border-overlay-8 bg-panel-solid p-8 shadow-[0_20px_60px_var(--shadow-heavy)] text-center space-y-6 max-h-[85vh] overflow-y-auto",
                incomingMatch?.type === "transfer" ? "max-w-xl" : "max-w-md",
              )}
            >
              <div className="flex items-center justify-center">
                <div className="h-16 w-16 rounded-full bg-emerald-500/15 border-2 border-emerald-500/40 flex items-center justify-center animate-pulse">
                  <PhoneIncoming className="h-8 w-8 text-emerald-400" />
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground/60 mb-1">Incoming Call</p>
                <p className="text-2xl font-bold font-mono text-foreground">
                  {incomingFrom ? (() => { const d = incomingFrom.replace(/\D/g, "").slice(-10); return d.length === 10 ? `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}` : incomingFrom; })() : "Unknown"}
                </p>
              </div>
              {incomingMatch && (
                <div className="rounded-[10px] bg-overlay-2 border border-overlay-6 p-3 text-left">
                  {incomingMatch.type === "lead" && (
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      <span className="text-sm text-foreground font-medium">{incomingMatch.name}</span>
                    </div>
                  )}
                  {incomingMatch.type === "lead" && incomingMatch.address && (
                    <p className="text-xs text-muted-foreground/60 mt-1 ml-4">{incomingMatch.address}</p>
                  )}
                  {incomingMatch.type === "transfer" && (() => {
                    const tb = incomingMatch.transferBrief;
                    return (
                    <div className="space-y-3 text-left">
                      {/* Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                          <span className="text-sm font-semibold text-emerald-400">Jeff&apos;s Transfer Brief</span>
                        </div>
                        {tb?.leadUrl && (
                          <a
                            href={tb.leadUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 border border-primary/30 text-xs font-semibold text-primary hover:bg-primary/25 transition-colors"
                          >
                            <ExternalLink className="h-3 w-3" /> Open Client File
                          </a>
                        )}
                      </div>

                      {/* Name + address + reason */}
                      <div className="space-y-1">
                        {incomingMatch.name && (
                          <p className="text-sm text-foreground font-medium">{incomingMatch.name}</p>
                        )}
                        {incomingMatch.address && (
                          <p className="text-xs text-muted-foreground/60">{incomingMatch.address}</p>
                        )}
                        {incomingMatch.summary && (
                          <p className="text-xs text-emerald-400/80 font-medium mt-1">{incomingMatch.summary}</p>
                        )}
                      </div>

                      {/* Jeff's Notes — most important section */}
                      {tb?.jeffNotes && tb.jeffNotes.length > 0 && (
                        <div className="rounded-lg bg-emerald-500/[0.06] border border-emerald-500/15 p-3 space-y-1.5">
                          <p className="text-[10px] uppercase tracking-wider text-emerald-400/70 font-semibold">Jeff&apos;s Notes</p>
                          {tb.jeffNotes.map((note, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs text-foreground/90">
                              <span className="text-emerald-400 mt-0.5 shrink-0">&bull;</span>
                              <span>{note}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Discovery Slots */}
                      {tb?.discoverySlots && Object.keys(tb.discoverySlots).length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(tb.discoverySlots).map(([slot, value]) => (
                            <span key={slot} className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-400">
                              <span className="font-semibold">{slot}:</span> {String(value).slice(0, 40)}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Lead Context */}
                      {tb?.lead && (tb.lead.stage || tb.lead.source || (tb.lead.tags && tb.lead.tags.length > 0)) && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {tb.lead.stage && (
                            <Badge variant="outline" className="text-[10px] border-muted-foreground/20">{tb.lead.stage}</Badge>
                          )}
                          {tb.lead.source && (
                            <Badge variant="outline" className="text-[10px] border-muted-foreground/20">{tb.lead.source}</Badge>
                          )}
                          {tb.lead.tags?.map((tag) => (
                            <Badge key={tag} variant="outline" className="text-[10px] border-primary/20 text-primary/70">{tag}</Badge>
                          ))}
                          {tb.lead.email && (
                            <span className="text-[10px] text-muted-foreground/50 ml-1">{tb.lead.email}</span>
                          )}
                        </div>
                      )}

                      {/* Property Info */}
                      {tb?.property && (tb.property.county || tb.property.propertyType) && (
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50">
                          <Home className="h-3 w-3 shrink-0" />
                          {[tb.property.propertyType, tb.property.city, tb.property.county].filter(Boolean).join(" · ")}
                        </div>
                      )}

                      {/* Recent Calls */}
                      {tb?.recentCalls && tb.recentCalls.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/40 font-semibold">Recent Calls</p>
                          {tb.recentCalls.slice(0, 3).map((call, i) => (
                            <div key={i} className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
                              {call.direction === "inbound" ? (
                                <ArrowDownLeft className="h-3 w-3 text-emerald-400/60 shrink-0" />
                              ) : (
                                <ArrowUpRight className="h-3 w-3 text-primary/60 shrink-0" />
                              )}
                              <span>{new Date(call.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                              <span className="text-muted-foreground/30">—</span>
                              <span className="capitalize">{call.disposition ?? "No disposition"}</span>
                              {call.summary && (
                                <>
                                  <span className="text-muted-foreground/30">—</span>
                                  <span className="truncate max-w-[200px]">{call.summary}</span>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Open Tasks */}
                      {tb?.openTasks && tb.openTasks.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/40 font-semibold">Open Tasks</p>
                          {tb.openTasks.slice(0, 3).map((task, i) => (
                            <div key={i} className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
                              <CheckCircle2 className="h-3 w-3 shrink-0 text-primary/40" />
                              <span>{task.title}</span>
                              {task.dueDate && (
                                <span className="text-muted-foreground/30">— Due {new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Caller Type */}
                      {tb?.callerType && (
                        <p className="text-[10px] text-muted-foreground/40">Type: {tb.callerType}</p>
                      )}
                    </div>
                    );
                  })()}
                  {incomingMatch.type === "jeff" && (
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-amber-400" />
                      <span className="text-sm text-amber-400">{incomingMatch.summary}</span>
                    </div>
                  )}
                  {incomingMatch.type === "unknown" && (
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                      <span className="text-sm text-muted-foreground/60">New caller — no history</span>
                    </div>
                  )}
                </div>
              )}
              <div className="flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={handleAnswerIncoming}
                  className="flex items-center gap-2 px-8 py-3 rounded-full bg-emerald-500 text-white font-bold text-sm hover:bg-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all"
                >
                  <Phone className="h-5 w-5" /> Answer
                </button>
                <button
                  type="button"
                  onClick={handleDeclineIncoming}
                  className="flex items-center gap-2 px-6 py-3 rounded-full bg-red-500/15 text-red-400 font-medium text-sm hover:bg-red-500/25 border border-red-500/25 transition-all"
                >
                  <PhoneOff className="h-4 w-4" /> Decline
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4">
          <GlassCard hover={false} className="!p-3 min-h-[520px]">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-primary" />
                {autoCycleMode ? "Auto Cycle" : "Dial Queue"}
                <CallSequenceGuide />
              </h2>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <div className="flex items-center gap-0.5 rounded-[8px] border border-border/20 p-0.5">
                  {([["queue", "Queue"], ["autoCycle", "Auto Cycle"]] as const).map(([mode, label]) => (
                    <button
                      key={mode}
                      onClick={() => setDialerMode(mode)}
                      className={cn(
                        "px-2 py-1 rounded-[6px] text-[11px] uppercase tracking-wider transition-colors",
                        dialerMode === mode
                          ? "bg-primary/10 text-primary border border-primary/25"
                          : "text-muted-foreground/60 hover:text-foreground border border-transparent",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleModalRefresh}
                  className="text-sm text-muted-foreground/60 hover:text-foreground transition-colors"
                >
                  Refresh
                </button>
                <a
                  href="/settings/jeff-outbound"
                  className="text-sm text-emerald-300/80 hover:text-emerald-200 transition-colors"
                >
                  Jeff Outbound
                </a>
                {!autoCycleMode && dialerMode === "queue" && (
                  <button
                    onClick={handleSkipTraceQueue}
                    disabled={queueSkipTracing || displayedQueueLoading || displayedQueue.length === 0}
                    className="inline-flex items-center gap-1.5 rounded-[8px] border border-primary/20 bg-primary/8 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary transition-colors hover:bg-primary/15 disabled:opacity-50"
                  >
                    {queueSkipTracing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                    Skip Trace Queue
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground/40 mb-2">
              {autoCycleMode
                ? "Ready-now leads float to the top."
                : `${displayedQueue.length} queued`}
            </p>

            {displayedQueueLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-14 rounded-[12px] bg-secondary/20 animate-pulse" />
                ))}
              </div>
            ) : displayedQueue.length === 0 ? (
              <div className="flex min-h-[400px] flex-col items-center justify-center text-center py-6 space-y-3">
                <Phone className="h-7 w-7 mx-auto text-muted-foreground/15" />
                <p className="text-sm font-medium text-foreground/70">Queue is empty</p>
                <a href="/leads">
                  <button className="px-5 py-2 rounded-[10px] text-xs font-bold text-primary bg-primary/[0.10] border border-primary/25
                    hover:bg-primary/[0.18] hover:border-primary/35 shadow-[0_0_14px_var(--shadow-soft)]
                    hover:shadow-[0_0_22px_var(--shadow-soft)] transition-all">
                    Add leads from Lead Queue
                  </button>
                </a>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[66vh] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-overlay-8 scrollbar-track-transparent">
                <div className="flex gap-2 pl-5 pr-10 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/55">
                  <span className="min-w-0 flex-1">Do now</span>
                  <span className="w-[76px] shrink-0">Due</span>
                  <span className="w-[84px] shrink-0 text-right">Last touch</span>
                </div>
                {displayedQueue.map((lead, idx) => {
                  const isActive = currentLead?.id === lead.id;
                  const rowDueIso = autoCycleMode && "autoCycle" in lead
                    ? (lead as AutoCycleQueueLead).autoCycle.nextDueAt
                    : lead.next_call_scheduled_at ?? lead.next_follow_up_at ?? lead.follow_up_date ?? null;
                  const wf = buildOperatorWorkflowSummary({
                    status: lead.status,
                    qualificationRoute: lead.qualification_route,
                    assignedTo: lead.assigned_to,
                    nextCallScheduledAt: autoCycleMode && "autoCycle" in lead
                      ? (lead as AutoCycleQueueLead).autoCycle.nextDueAt ?? lead.next_call_scheduled_at
                      : lead.next_call_scheduled_at,
                    nextFollowUpAt: autoCycleMode ? null : (lead.next_follow_up_at ?? lead.follow_up_date),
                    lastContactAt: lead.last_contact_at,
                    totalCalls: lead.total_calls,
                    createdAt: lead.promoted_at,
                    promotedAt: lead.promoted_at,
                  });
                  const autoCycleLead = autoCycleMode ? lead as AutoCycleQueueLead : null;
                  const autoCycleStatusLabel = autoCycleLead
                    ? autoCycleLead.autoCycle.readyNow
                      ? "Ready now"
                      : autoCycleLead.autoCycle.cycleStatus === "waiting"
                        ? "Retry window"
                        : autoCycleLead.autoCycle.cycleStatus === "paused"
                          ? "Paused"
                          : "In cycle"
                    : null;

                  return (
                    <button
                      key={lead.id}
                      onClick={() => {
                        setCurrentLead(lead);
                        if (!autoCycleMode) {
                          setPhoneIndex(0);
                        }
                      }}
                      className={`w-full text-left rounded-[12px] p-2.5 transition-all duration-200 border ${
                        isActive
                          ? "bg-primary/5 border-primary/20 shadow-[0_0_12px_var(--shadow-soft)]"
                          : "bg-secondary/10 border-transparent hover:bg-secondary/20"
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground/55 font-mono w-3">{idx + 1}</span>
                          <p className="text-sm font-medium truncate flex-1 min-w-0">
                            {lead.properties?.owner_name ?? "Unknown"}
                          </p>
                          {!lead.compliant && !ghostMode && (
                            <span className="h-2 w-2 rounded-full bg-foreground/80 shadow-[0_0_6px_var(--shadow-medium)] shrink-0" title="Compliance blocked" />
                          )}
                          <RelationshipBadgeCompact data={{ tags: lead.tags }} />
                          <button
                            type="button"
                            onClick={(e) => autoCycleMode ? handleRemoveFromAutoCycle(lead.id, e) : handleRemoveFromQueue(lead.id, e)}
                            className="shrink-0 p-0.5 rounded text-red-400/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            title={autoCycleMode ? "Remove from Auto Cycle" : "Remove from queue"}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="flex items-center gap-2 pl-5">
                          <span className="text-xs text-muted-foreground/70 font-mono">{lead.properties?.owner_phone || "No phone"}</span>
                          {lead.tags?.slice(0, 1).map((tag) => (
                            <span key={tag} className="text-xs px-1.5 py-0 rounded bg-overlay-4 border border-overlay-8 text-muted-foreground/60">{tag}</span>
                          ))}
                        </div>
                        <div className="grid grid-cols-[1fr_76px_84px] gap-1 pl-5 pr-2 text-xs items-center">
                          <span
                            className={cn(
                              "min-w-0 truncate font-medium",
                              wf.urgency === "critical" && "text-red-400/95",
                              wf.urgency === "high" && "text-amber-300/90",
                              wf.urgency !== "critical" && wf.urgency !== "high" && "text-foreground/85",
                            )}
                            title={wf.doNow}
                          >
                            {wf.doNow}
                          </span>
                          <span
                            className={cn(
                              "tabular-nums shrink-0",
                              wf.dueOverdue ? "text-red-400 font-medium" : "text-muted-foreground/60",
                            )}
                            title={rowDueIso ?? undefined}
                          >
                            {wf.dueLabel}
                          </span>
                          <span className="flex items-center justify-end gap-1 shrink-0 text-right">
                            <span className="text-muted-foreground/70 tabular-nums">{wf.lastTouchLabel}</span>
                            {wf.workedToday && (
                              <span className="rounded px-1 py-0 text-[9px] font-bold uppercase tracking-wide text-primary bg-primary/10 border border-primary/20">
                                Today
                              </span>
                            )}
                          </span>
                        </div>
                        {autoCycleLead && (
                          <div className="flex flex-wrap items-center gap-1.5 pl-5 pt-1">
                            <span className="rounded-[7px] border border-primary/15 bg-primary/[0.06] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary/80">
                              Round {autoCycleLead.autoCycle.currentRound}
                            </span>
                            <span className="rounded-[7px] border border-overlay-6 bg-overlay-3 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground/65">
                              {autoCycleLead.autoCycle.remainingPhones} phone{autoCycleLead.autoCycle.remainingPhones === 1 ? "" : "s"} left
                            </span>
                            {autoCycleStatusLabel && (
                              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/55">
                                {autoCycleStatusLabel}
                              </span>
                            )}
                            {autoCycleLead.autoCycle.voicemailDropNext && (
                              <span className="rounded-[7px] border border-amber-500/20 bg-amber-500/[0.07] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-amber-300">
                                VM next
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </GlassCard>
        </div>

        <div className="lg:col-span-5">
          <AnimatePresence mode="wait">
            {currentLead ? (
              <motion.div
                key={currentLead.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <GlassCard
                  hover={false}
                  glow={callState === "connected" || callState === "dialing"}
                >
                  {callState !== "idle" && (
                    <div className={`flex items-center gap-2 mb-3 text-xs px-3 py-1.5 rounded-lg ${
                      callState === "dialing" ? "bg-muted/10 text-foreground" :
                      callState === "connected" ? "bg-primary/8 text-primary" :
                      "bg-muted/10 text-foreground"
                    }`}>
                      <span className={`h-2 w-2 rounded-full ${
                        callState === "dialing" ? "bg-muted animate-pulse" :
                        callState === "connected" ? "bg-primary animate-pulse" :
                        "bg-muted"
                      }`} />
                      {callState === "dialing" && (transferStatus ?? "Dialing...")}
                      {callState === "connected" && `Connected — ${timer.formatted} — Outbound number in use`}
                      {callState === "ended" && `Ended — ${timer.formatted}`}
                    </div>
                  )}

                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-bold tracking-tight title-glow">
                            {currentLead.properties?.owner_name ?? "Unknown Owner"}
                          </h3>
                          <RelationshipBadgeCompact data={{ tags: currentLead.tags }} />
                        </div>
                        <p className="text-sm text-muted-foreground/70">
                          {currentLead.properties?.address ?? "No address"}
                        </p>
                        <p className="text-xs text-muted-foreground/50 mt-0.5">
                          {currentLead.properties?.city}, {currentLead.properties?.state} — {currentLead.properties?.county} County
                        </p>
                        <button
                          onClick={() => setFileModalOpen(true)}
                          className="mt-1 inline-flex items-center gap-1 text-sm text-primary hover:text-primary/80 hover:underline transition-colors"
                        >
                          <Eye className="h-3 w-3" />
                          Open Lead Detail
                        </button>
                        <button
                          onClick={currentLeadAutoCycleEntry ? handleRemoveCurrentLeadFromAutoCycle : handleAddCurrentLeadToAutoCycle}
                          className={cn(
                            "mt-1 inline-flex items-center gap-1 text-sm transition-colors",
                            currentLeadAutoCycleEntry
                              ? "text-primary hover:text-primary/80"
                              : "text-emerald-400 hover:text-emerald-300",
                          )}
                        >
                          <Zap className="h-3 w-3" />
                          {currentLeadAutoCycleEntry ? "Remove From Auto Cycle" : "Add To Auto Cycle"}
                        </button>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {/* Score hidden until live scoring loop is wired — showing untrusted numbers is worse than no number */}
                        <Badge variant="outline" className="text-sm px-2.5 py-0.5 gap-1 border-border/20 text-muted-foreground/50">
                          —
                        </Badge>
                        {currentLeadAutoCycleEntry && (
                          <Badge variant="outline" className="text-xs gap-1 border-primary/20 text-primary/80">
                            <Zap className="h-2.5 w-2.5" />
                            Round {currentLeadAutoCycleEntry.autoCycle.currentRound}
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-xs gap-1 border-primary/20 text-primary/70">
                          <Phone className="h-2.5 w-2.5" />
                          {getCadencePosition(currentLead.total_calls ?? 0).label}
                        </Badge>
                        {currentLeadAutoCycleEntry?.autoCycle.voicemailDropNext && (
                          <Badge variant="outline" className="text-xs gap-1 border-amber-500/20 text-amber-300">
                            <Voicemail className="h-2.5 w-2.5" />
                            VM Next
                          </Badge>
                        )}
                        {!currentLead.compliant && !ghostMode && (
                          <Badge variant="destructive" className="text-sm">
                            COMPLIANCE BLOCKED
                          </Badge>
                        )}
                      </div>
                    </div>

                    {dialerContext && (
                      <>
                        {/* Why Now — the single most important pre-call signal */}
                        <div className={cn(
                          "rounded-[8px] px-3 py-1.5 text-xs font-semibold flex items-center gap-2",
                          dialerContext.whyNow.tone === "red" && "bg-red-500/10 text-red-400 border border-red-500/20",
                          dialerContext.whyNow.tone === "amber" && "bg-amber-500/10 text-amber-400 border border-amber-500/20",
                          dialerContext.whyNow.tone === "muted" && "bg-overlay-3 text-foreground/70 border border-overlay-6",
                        )}>
                          {dialerContext.whyNow.tone === "red" && <AlertTriangle className="h-3 w-3 shrink-0" />}
                          {dialerContext.whyNow.tone === "amber" && <CalendarCheck className="h-3 w-3 shrink-0" />}
                          {dialerContext.whyNow.text}
                          {(currentLead?.total_calls ?? 0) > 0 && dialerContext.lastContactAt && (
                            <span className="ml-auto text-[10px] font-normal text-muted-foreground/50">
                              Last: <span className="capitalize">{dialerContext.recentOutcome}</span> · {relativeAge(dialerContext.lastContactAt)}
                            </span>
                          )}
                        </div>

                        <div className="rounded-[10px] bg-overlay-3 border border-overlay-6 p-2.5">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span><span className="text-foreground font-medium">{dialerContext.stage}</span></span>
                            <span className="text-muted-foreground/30">·</span>
                            <span>{dialerContext.nextActionLabel}</span>
                            {dialerContext.qualificationGapNames.length > 0 && (
                              <>
                                <span className="text-muted-foreground/30">·</span>
                                <span className="text-amber-400">Ask: {dialerContext.qualificationGapNames.slice(0, 3).join(", ")}</span>
                              </>
                            )}
                            {dialerContext.motivationLevel != null && (
                              <>
                                <span className="text-muted-foreground/30">·</span>
                                <span>Motivation {dialerContext.motivationLevel}/5</span>
                              </>
                            )}
                            {dialerContext.sellerTimeline && dialerContext.sellerTimeline !== "unknown" && (
                              <>
                                <span className="text-muted-foreground/30">·</span>
                                <span>{TIMELINE_SHORT[dialerContext.sellerTimeline] ?? dialerContext.sellerTimeline}</span>
                              </>
                            )}
                            {/* Note preview removed — seller memory preview now shows full continuity context */}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Compact property vitals — single block instead of 9 tiles */}
                    <div className="rounded-[10px] bg-overlay-3 border border-overlay-6 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                        <span className="font-mono text-foreground">{currentDialedPhone ?? currentLead.properties?.owner_phone ?? "No phone"}</span>
                        <span className="text-muted-foreground/40">|</span>
                        <span>ARV <span className="text-foreground font-medium">{currentLead.properties?.estimated_value ? `$${currentLead.properties.estimated_value.toLocaleString()}` : "—"}</span></span>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        <span>Equity <span className="text-foreground font-medium">{(() => {
                          const p = currentLead.properties as any;
                          if (p?.equity_percent != null) return `${p.equity_percent}%`;
                          const flags = p?.owner_flags as Record<string, unknown> | null;
                          const avail = Number(flags?.available_equity);
                          if (avail > 0) return `$${avail.toLocaleString()}`;
                          const arv = p?.estimated_value;
                          const loan = Number(flags?.total_loan_balance ?? p?.total_loan_balance);
                          if (arv && loan > 0) {
                            const eq = arv - loan;
                            return eq >= 0 ? `$${eq.toLocaleString()}` : `-$${Math.abs(eq).toLocaleString()}`;
                          }
                          if (flags?.is_free_clear || flags?.freeAndClear) return "100%";
                          return "—";
                        })()}</span></span>
                        <span className="text-muted-foreground/40">|</span>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        <span>{(currentLead.properties as any)?.bedrooms ?? "—"}bd/{(currentLead.properties as any)?.bathrooms ?? "—"}ba</span>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        <span>{(currentLead.properties as any)?.sqft?.toLocaleString() ?? "—"} sqft</span>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        <span>Built {(currentLead.properties as any)?.year_built ?? "—"}</span>
                      </div>
                      {(currentLead.tags ?? []).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {currentLead.tags.slice(0, 4).map((t) => (
                            <span key={t} className="text-xs px-1.5 py-0 rounded-[5px] bg-muted/[0.08] text-foreground/80 border border-border/15">
                              {t.replace(/_/g, " ")}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Seller memory — factual continuity outranks AI brief */}
                    {callState === "idle" && currentLead && (
                      <SellerMemoryPreview leadId={currentLead.id} />
                    )}

                    {/* Pre-Call Brief — trust-filtered: only specific, useful AI content */}
                    <AnimatePresence>
                      {callState === "idle" && (filteredBrief || briefLoading || (briefError && !preCallBrief)) && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="rounded-[10px] bg-muted/[0.06] border border-border/20 p-2.5 overflow-hidden"
                        >
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <Sparkles className="h-3 w-3 text-foreground" />
                            <span className="text-xs font-semibold tracking-wider uppercase text-foreground">Brief</span>
                            {briefLoading && <Loader2 className="h-3 w-3 animate-spin text-foreground/60 ml-auto" />}
                          </div>
                          {briefError && !preCallBrief && (
                            <div className="flex items-center gap-2 rounded-lg bg-amber-500/[0.06] border border-amber-500/20 p-2">
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                              <p className="text-xs text-amber-200/80 flex-1">{briefError}</p>
                              <button onClick={retryBrief} className="text-xs text-amber-300 hover:text-amber-200 underline shrink-0">Retry</button>
                            </div>
                          )}
                          {filteredBrief && (
                            <>
                              {filteredBrief.goal && (
                                <p className="text-xs text-foreground/80 font-medium leading-snug mb-1.5">
                                  {filteredBrief.goal}
                                </p>
                              )}
                              {filteredBrief.bullets.length > 0 && (
                                <ul className="space-y-0.5">
                                  {filteredBrief.bullets.map((b, i) => (
                                    <li key={i} className="text-xs text-foreground/70 flex items-start gap-1.5">
                                      <span className="text-foreground/40 mt-0.5">•</span>
                                      {b}
                                    </li>
                                  ))}
                                </ul>
                              )}
                              {filteredBrief.watchOuts.length > 0 && (
                                <div className="flex items-start gap-1.5 mt-1.5 text-xs text-amber-300/70">
                                  <AlertTriangle className="h-2.5 w-2.5 shrink-0 mt-0.5" />
                                  <span className="leading-snug line-clamp-2">{filteredBrief.watchOuts[0]}</span>
                                </div>
                              )}
                              {filteredBrief.riskFlags.length > 0 && !briefDetailOpen && (
                                <div className="flex items-center gap-1 mt-1.5 text-xs text-amber-400/80">
                                  <AlertTriangle className="h-2.5 w-2.5" />
                                  {filteredBrief.riskFlags.length} risk flag{filteredBrief.riskFlags.length !== 1 ? "s" : ""}
                                </div>
                              )}
                              {(filteredBrief.nextQuestions.length > 0 || filteredBrief.riskFlags.length > 0) && (
                                <>
                                  <button
                                    onClick={() => setBriefDetailOpen(!briefDetailOpen)}
                                    className="mt-1.5 text-[10px] text-primary/70 hover:text-primary transition-colors"
                                  >
                                    {briefDetailOpen ? "Less" : "More detail"}
                                  </button>
                                  <AnimatePresence>
                                    {briefDetailOpen && (
                                      <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="overflow-hidden"
                                      >
                                        {filteredBrief.nextQuestions.length > 0 && (
                                          <div className="rounded-lg bg-overlay-3 border border-overlay-6 p-2 mt-1.5">
                                            <p className="text-[10px] text-muted-foreground/55 uppercase mb-1">Questions</p>
                                            <div className="space-y-0.5">
                                              {filteredBrief.nextQuestions.slice(0, 3).map((q, i) => (
                                                <p key={i} className="text-xs text-foreground/75 leading-snug">• {q}</p>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                        {filteredBrief.riskFlags.length > 0 && (
                                          <div className="rounded-lg bg-muted/[0.06] border border-border/20 p-2 mt-1.5">
                                            <p className="text-[10px] text-amber-400/70 uppercase mb-1">Risk Flags</p>
                                            <div className="space-y-0.5">
                                              {filteredBrief.riskFlags.map((flag, i) => (
                                                <div key={i} className="flex items-start gap-1.5 text-xs text-foreground/75">
                                                  <AlertTriangle className="h-2.5 w-2.5 mt-0.5 shrink-0 text-amber-400/60" />
                                                  <p>{flag}</p>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </>
                              )}
                            </>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Phone roster from lead_phones */}
                    {callState === "idle" && activeLeadPhones.length > 1 && (() => {
                      const activePhones = activeLeadPhones;
                      return (
                        <div className="space-y-1.5 pb-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground/50">
                              Phone {selectedPhoneIndex + 1} of {activePhones.length}
                              {phonesAttempted > 0 && ` · ${phonesAttempted} tried`}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {activePhones.map((lp, i) => (
                              <button
                                key={lp.id}
                                type="button"
                                onClick={() => {
                                  if (!autoCycleMode) {
                                    setPhoneIndex(i);
                                  }
                                }}
                                className={cn(
                                  "h-7 px-2.5 rounded-[8px] text-sm font-mono border transition-all flex items-center gap-1.5",
                                  i === selectedPhoneIndex
                                    ? "bg-primary/15 border-primary/30 text-primary font-bold"
                                    : lp.last_called_at
                                      ? "bg-muted/8 border-border/20 text-muted-foreground/60"
                                      : "bg-primary/8 hover:bg-primary/18 border-primary/20 text-primary",
                                )}
                              >
                                <Phone className="h-3 w-3" />
                                {formatUsPhone(lp.phone.replace(/\D/g, "").slice(-10))}
                                {lp.is_primary && <span className="text-xs">★</span>}
                                {lp.last_called_at && <span className="text-xs text-muted-foreground/40">✓</span>}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    <div className="flex items-center gap-2 pt-2">
                      {callState === "idle" && (
                        <>
                          <Button
                            onClick={() => handleDial()}
                            disabled={!currentLead.compliant && !ghostMode}
                            className="flex-1 gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-sm"
                          >
                            <Phone className="h-4 w-4" />
                            {(() => {
                              if (selectedLeadPhone) return `Call ${formatUsPhone(selectedLeadPhone.phone.replace(/\D/g, "").slice(-10))}`;
                              return currentLead.properties?.owner_phone ? "Call Now" : "No Phone";
                            })()}
                          </Button>
                          <Button
                            onClick={() => {
                              const currentIdx = displayedQueue.findIndex((l) => l.id === currentLead.id);
                              const nextLead = displayedQueue[currentIdx + 1] ?? displayedQueue[0] ?? null;
                              if (nextLead) {
                                setCurrentLead(nextLead);
                                if (!autoCycleMode) {
                                  setPhoneIndex(0);
                                }
                              }
                            }}
                            variant="outline"
                            className="gap-1.5 border-border/30 text-muted-foreground hover:text-foreground hover:bg-muted/20"
                            title="Skip to next lead"
                          >
                            <SkipForward className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            onClick={() => {
                              if (!currentLead.properties?.owner_phone) {
                                toast.error("No phone number for this lead");
                                return;
                              }
                              setLeadSmsOpen((v) => !v);
                              if (!leadSmsMsg) {
                                setLeadSmsMsg(`Hi ${currentLead.properties?.owner_name?.split(" ")[0] ?? "there"}, this is Dominion Homes reaching out about your property at ${currentLead.properties?.address ?? "your address"}. Would you have a few minutes to chat? Reply STOP to opt out.`);
                              }
                            }}
                            disabled={(!currentLead.compliant && !ghostMode) || !currentLead.properties?.owner_phone}
                            variant="outline"
                            className={`gap-2 border-border text-foreground hover:bg-muted ${leadSmsOpen ? "bg-muted border-border" : ""}`}
                          >
                            <MessageSquare className="h-4 w-4" />
                            Text
                          </Button>
                        </>
                      )}
                      {(callState === "dialing" || callState === "connected") && (
                        <>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => {
                              const next = !muted;
                              setMuted(next);
                              if (activeCall) activeCall.mute(next);
                            }}
                            className="shrink-0"
                          >
                            {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="destructive"
                            className="flex-1 gap-2 font-semibold"
                            onClick={handleHangup}
                          >
                            <PhoneOff className="h-4 w-4" />
                            End Call
                          </Button>
                        </>
                      )}
                      {callState === "ended" && (
                        <div className="flex-1 rounded-[8px] border border-amber-500/20 bg-amber-500/[0.04] text-center text-xs text-amber-300 font-medium py-2.5">
                          Call ended — {timer.formatted} — close out below
                        </div>
                      )}
                    </div>

                    {false /* VoIP hint removed — shown in header badge instead */}

                    {/* Inline SMS compose for lead card */}
                    {leadSmsOpen && callState === "idle" && currentLead.properties?.owner_phone && (
                      <div className="mt-3 rounded-[12px] bg-overlay-3 border border-border p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-muted-foreground/60 uppercase tracking-wider">
                            SMS to {formatUsPhone(currentLead.properties.owner_phone.replace(/\D/g, "").slice(-10))}
                          </p>
                          <button
                            type="button"
                            onClick={() => setLeadSmsOpen(false)}
                            className="text-muted-foreground/40 hover:text-foreground"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <textarea
                          value={leadSmsMsg}
                          onChange={(e) => setLeadSmsMsg(e.target.value)}
                          placeholder="Write your message..."
                          className="w-full bg-transparent text-sm resize-none h-20 outline-none placeholder:text-muted-foreground/30 border border-overlay-4 rounded-[8px] p-2"
                          maxLength={500}
                        />
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground/50">{leadSmsMsg.length}/500</span>
                          <Button
                            onClick={() => handleLeadSmsSend(currentLead.properties!.owner_phone!)}
                            disabled={leadSmsSending || !leadSmsMsg.trim()}
                            size="sm"
                            className="gap-1.5 bg-primary/12 hover:bg-primary/18 text-primary border border-primary/25"
                          >
                            {leadSmsSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                            Send
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </GlassCard>

                {/* AI Live Notes — auto-generated from call transcription */}
                {(callState === "connected" || callState === "ended" || displayedLiveNotes.length > 0) && (
                  <GlassCard hover={false} className="!p-3 mt-3 border-primary/10">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Zap className="h-3 w-3 text-primary/60" />
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {liveCoach?.structuredLiveNotes?.length ? "Structured Live Notes" : "Live Notes"}
                      </p>
                      {callState === "connected" && (
                        <span className="ml-auto flex items-center gap-1 text-xs text-primary/50">
                          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                          Listening
                        </span>
                      )}
                    </div>
                    {displayedLiveNotes.length > 0 ? (
                      <ul className="space-y-1">
                        {displayedLiveNotes.map((note, i) => (
                          <li key={i} className="text-sm text-foreground/80 flex items-start gap-1.5">
                            <span className="text-primary/40 mt-0.5 shrink-0">•</span>
                            <span>{note}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground/40 italic">
                        Notes will appear as the conversation progresses...
                      </p>
                    )}
                  </GlassCard>
                )}

                <GlassCard hover={false} className="!p-3 mt-3">
                  <textarea
                    value={callNotes}
                    onChange={(e) => setCallNotes(e.target.value)}
                    placeholder="Call notes... (saved with disposition)"
                    className="w-full bg-transparent text-sm resize-none h-16 outline-none placeholder:text-muted-foreground/30"
                  />
                  {/* Mid-call save button + saved notes */}
                  {callState === "connected" && dialerSessionId && (
                    <div className="border-t border-overlay-4 pt-2 mt-1">
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-sm px-2.5 border-primary/20 text-primary/60 hover:bg-primary/10"
                          onClick={handleSaveNote}
                          disabled={savingNote || !callNotes.trim()}
                        >
                          {savingNote ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                          Save note with timestamp
                        </Button>
                        {savedNotes.length > 0 && (
                          <span className="text-xs text-muted-foreground/30">{savedNotes.length} saved</span>
                        )}
                      </div>
                      {savedNotes.length > 0 && (
                        <div className="mt-2 space-y-1 max-h-24 overflow-y-auto scrollbar-thin">
                          {savedNotes.map((n, i) => (
                            <div key={i} className="flex items-start gap-1.5 text-sm">
                              <span className="text-muted-foreground/30 shrink-0 font-mono">
                                {new Date(n.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                              </span>
                              <span className="text-foreground/50 leading-snug">{n.content}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </GlassCard>
              </motion.div>
            ) : (
              <GlassCard hover={false} className="flex min-h-[520px] items-center justify-center">
                <div className="text-center space-y-2">
                  {displayedQueueLoading ? (
                    <Loader2 className="h-5 w-5 mx-auto animate-spin text-muted-foreground/30" />
                  ) : (
                    <>
                      <Phone className="h-7 w-7 mx-auto text-muted-foreground/15" />
                      <p className="text-sm text-muted-foreground/50">
                        {displayedQueue.length > 0 ? "Loading first lead…" : "Queue is empty"}
                      </p>
                    </>
                  )}
                </div>
              </GlassCard>
            )}
          </AnimatePresence>
        </div>

        <div className="lg:col-span-3">
          <div className="space-y-2 lg:sticky lg:top-24">
            {/* Missed calls — urgent, always visible above everything */}
            {missedCalls.length > 0 && (
              <GlassCard hover={false} className="!p-3 border-amber-400/20 bg-amber-400/[0.02]">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-1.5 mb-2">
                  <PhoneIncoming className="h-3.5 w-3.5" />
                  Missed Calls ({missedCalls.length})
                </h2>
                <div className="space-y-1">
                  {missedCalls.map((mc) => (
                    <div key={mc.id} className="flex items-center justify-between text-xs py-1">
                      <span className="font-mono text-foreground/80">
                        {(() => { const d = mc.phone.replace(/\D/g, "").slice(-10); return d.length === 10 ? `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}` : mc.phone; })()}
                      </span>
                      <span className="text-muted-foreground/50">{(() => { const m = Math.floor((Date.now() - new Date(mc.time).getTime()) / 60000); return m < 1 ? "just now" : m < 60 ? `${m}m ago` : `${Math.floor(m/60)}h ago`; })()}</span>
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}

            <AnimatePresence mode="wait">
              {callState !== "idle" ? (
                <motion.div
                  key="disposition-panel"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  {callState === "connected" && currentLead && (
                    <LiveAnswerIntelPanel
                      lead={currentLead}
                      dialedPhone={currentDialedPhone}
                      onOpenDetail={() => setFileModalOpen(true)}
                    />
                  )}

                  {dialerSessionId && (
                    <SellerMemoryPanel
                      sessionId={dialerSessionId}
                      className="mb-3"
                    />
                  )}

                  {callState === "ended" && dialerSessionId ? (
                    <PostCallPanel
                      sessionId={dialerSessionId}
                      callLogId={currentCallLogId}
                      userId={currentUser.id}
                      timerElapsed={timer.elapsed}
                      initialSummary={callNotes}
                      initialMotivationLevel={currentLead?.motivation_level ?? null}
                      initialSellerTimeline={currentLead?.seller_timeline ?? null}
                      qualContext={currentLead ? {
                        address: currentLead.properties?.address ?? null,
                        decisionMakerConfirmed: currentLead.decision_maker_confirmed ?? false,
                        conditionLevel: currentLead.condition_level ?? null,
                        occupancyScore: currentLead.occupancy_score ?? null,
                        hasOpenTask: false,
                      } : null}
                      phoneNumber={currentDialedPhone}
                      leadId={currentLead?.id ?? null}
                      autoCycleEnabled={autoCycleMode}
                      onComplete={handlePostCallDone}
                      onSkip={handlePostCallDone}
                    />
                  ) : (
                    <GlassCard hover={false} className="!p-3">
                      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                        <BarChart3 className="h-3.5 w-3.5 text-primary" />
                        Disposition
                        <span className="text-sm opacity-40 ml-auto">Keyboard shortcuts active</span>
                      </h2>

                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full mb-2.5 gap-2 border-overlay-12 text-muted-foreground hover:text-foreground hover:bg-overlay-4"
                        onClick={() => setFileModalOpen(true)}
                      >
                        <Eye className="h-3 w-3" />
                        Open Lead Detail
                      </Button>

                      <div className="grid grid-cols-1 gap-1.5">
                        {DISPOSITIONS.map((d) => {
                          const Icon = d.icon;
                          return (
                            <button
                              key={d.key}
                              onClick={() => handleDisposition(d.key)}
                              disabled={dispositionPending}
                              className={`flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-left transition-all duration-150 border ${d.bgColor}`}
                            >
                              <span className="text-sm font-mono text-muted-foreground/55 w-3">{d.hotkey}</span>
                              <Icon className={`h-4 w-4 ${d.color}`} />
                              <span className="text-sm font-medium flex-1">{d.label}</span>
                              <ChevronRight className="h-3 w-3 text-muted-foreground/30" />
                            </button>
                          );
                        })}
                      </div>

                      <Button
                        variant="outline"
                        className="w-full mt-3 gap-2 text-xs"
                        onClick={() => {
                          const idx = displayedQueue.findIndex((l) => l.id === currentLead?.id);
                          setCurrentLead(displayedQueue[(idx + 1) % displayedQueue.length] ?? null);
                          if (!autoCycleMode) {
                            setPhoneIndex(0);
                          }
                          setCallState("idle");
                          setCallNotes("");
                          timer.reset();
                        }}
                        disabled={displayedQueue.length <= 1}
                      >
                        <SkipForward className="h-3.5 w-3.5" />
                        Next Lead
                      </Button>
                    </GlassCard>
                  )}

                  <div className="mt-3 flex items-center justify-center gap-2 px-3 py-2 rounded-[10px] border border-overlay-6 bg-overlay-2">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm font-mono font-medium text-foreground">{timer.formatted}</span>
                    <span className="text-xs text-muted-foreground/50 uppercase">
                      {callState === "dialing" ? "Ringing" :
                       callState === "connected" ? "Live" :
                       "Ended"}
                    </span>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="idle-rail"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* ── Tab selector: History / Jeff / SMS ── */}
                  <div className="flex items-center gap-0.5 mb-2 rounded-[8px] border border-overlay-6 bg-overlay-2 p-0.5">
                    {([
                      { key: "history" as const, label: "History" },
                      { key: "jeff" as const, label: "Jeff" },
                      { key: "sms" as const, label: "SMS" },
                    ] as const).map(({ key, label }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setIdleRailTab(key)}
                        className={cn(
                          "flex-1 px-2 py-1.5 rounded-[6px] text-[11px] font-semibold uppercase tracking-wider transition-colors",
                          idleRailTab === key
                            ? "bg-primary/10 text-primary border border-primary/25"
                            : "text-muted-foreground/55 hover:text-foreground border border-transparent",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* History tab */}
                  {idleRailTab === "history" && (
                    <GlassCard hover={false} className="!p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-muted-foreground/50">
                          {callHistory.length} recent
                        </span>
                        <div className="flex items-center gap-0.5">
                          {(["all", "outbound", "inbound"] as const).map((f) => (
                            <button
                              key={f}
                              type="button"
                              onClick={() => setHistoryFilter(f)}
                              className={cn(
                                "px-2 py-0.5 rounded-[6px] text-[10px] font-medium transition-all",
                                historyFilter === f
                                  ? "text-primary bg-primary/8 border border-primary/20"
                                  : "text-muted-foreground/50 hover:text-foreground border border-transparent",
                              )}
                            >
                              {f === "all" ? "All" : f === "outbound" ? "Out" : "In"}
                            </button>
                          ))}
                        </div>
                      </div>

                      {historyLoading ? (
                        <div className="flex items-center justify-center py-6">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/30" />
                        </div>
                      ) : callHistory.length === 0 ? (
                        <div className="text-center py-6">
                          <p className="text-xs text-muted-foreground/40">No calls yet</p>
                        </div>
                      ) : (
                        <div className={cn("overflow-y-auto scrollbar-thin space-y-1", currentLead ? "max-h-[calc(100vh-520px)]" : "max-h-[280px]")}>
                          {callHistory
                            .filter((c) => historyFilter === "all" || c.direction === historyFilter)
                            .map((entry) => (
                              <CallHistoryRow
                                key={entry.id}
                                entry={entry}
                                allHistory={callHistory}
                                onDial={(phone) => {
                                  setManualPhone(phone.replace(/\D/g, "").replace(/^1/, "").slice(0, 10));
                                  window.scrollTo({ top: 0, behavior: "smooth" });
                                  toast.info(`${formatUsPhone(phone.replace(/\D/g, "").slice(-10))} loaded — hit Dial Now`);
                                }}
                              />
                            ))}
                        </div>
                      )}
                    </GlassCard>
                  )}

                  {/* Jeff tab — component renders its own GlassCard */}
                  {idleRailTab === "jeff" && (
                    <JeffMessagesBanner onCallBack={handleJeffCallback} onLinked={refetchQueue} />
                  )}

                  {/* SMS tab — component renders its own GlassCard */}
                  {idleRailTab === "sms" && (
                    <SmsMessagesPanel onCallNumber={(phone) => {
                      const digits = phone.replace(/\D/g, "").slice(-10);
                      if (digits.length === 10 && deviceStatus === "ready") {
                        timer.start();
                        const formatted = `+1${digits}`;
                        deviceRef.current?.connect({ params: { To: formatted, From: voipCallerId || "" } });
                      }
                    }} />
                  )}

                  <UnlinkedCallsFolder onLinked={refetchQueue} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <LiveCoachWindow
        active={queueCoachActive || manualCoachActive}
        brief={activeCoachBrief}
        coach={activeCoach}
        loading={activeCoachLoading}
        error={activeCoachError}
        fileModalOpen={fileModalOpen}
        sessionId={queueCoachActive ? dialerSessionId : manualCoachActive ? manualSessionId : null}
        coachMode="outbound"
      />

      {/* Master Client File Modal */}
      {currentLead && (
        <MasterClientFileModal
          clientFile={clientFileFromRaw(
            {
              id: currentLead.id,
              property_id: currentLead.property_id,
              status: currentLead.status,
              priority: currentLead.priority,
              source: currentLead.source,
              tags: currentLead.tags,
              notes: currentLead.notes,
              assigned_to: currentLead.assigned_to,
              lock_version: currentLead.lock_version,
              promoted_at: currentLead.promoted_at,
              last_contact_at: currentLead.last_contact_at,
              next_call_scheduled_at: currentLead.next_call_scheduled_at,
              next_follow_up_at: currentLead.next_follow_up_at,
              disposition_code: currentLead.disposition_code,
              qualification_route: currentLead.qualification_route,
              qualification_score_total: currentLead.qualification_score_total,
              motivation_level: currentLead.motivation_level,
              seller_timeline: currentLead.seller_timeline,
              condition_level: currentLead.condition_level,
              decision_maker_confirmed: currentLead.decision_maker_confirmed,
              price_expectation: currentLead.price_expectation,
              occupancy_score: currentLead.occupancy_score,
              equity_flexibility_score: currentLead.equity_flexibility_score,
              call_sequence_step: currentLead.call_sequence_step,
              total_calls: currentLead.total_calls,
              live_answers: currentLead.live_answers,
              voicemails_left: currentLead.voicemails_left,
            },
            {
              id: currentLead.properties?.id ?? "",
              address: currentLead.properties?.address ?? "",
              owner_name: currentLead.properties?.owner_name ?? "Unknown",
              owner_phone: currentLead.properties?.owner_phone ?? null,
              estimated_value: currentLead.properties?.estimated_value ?? null,
              equity_percent: currentLead.properties?.equity_percent ?? null,
              city: currentLead.properties?.city ?? "",
              state: currentLead.properties?.state ?? "",
              county: currentLead.properties?.county ?? "",
              owner_flags: currentLead.properties?.owner_flags ?? {},
            },
          )}
          open={fileModalOpen}
          onClose={() => setFileModalOpen(false)}
          onRefresh={handleModalRefresh}
        />
      )}

      <CoachPanel />
    </PageShell>
  );
}

export default function DialerPage() {
  return (
    <Suspense fallback={null}>
      <DialerPageInner />
    </Suspense>
  );
}

/* ── Call History Row ───────────────────────────────────────────── */

const DISPO_STYLES: Record<string, { color: string; bg: string }> = {
  voicemail:     { color: "text-foreground",    bg: "bg-muted/10 border-border/15" },
  no_answer:     { color: "text-foreground",    bg: "bg-muted/10 border-border/15" },
  interested:    { color: "text-primary",        bg: "bg-primary/8 border-primary/15" },
  appointment:   { color: "text-foreground", bg: "bg-muted/10 border-border/15" },
  contract:      { color: "text-foreground",  bg: "bg-muted/10 border-border/15" },
  dead:          { color: "text-foreground",     bg: "bg-muted/10 border-border/15" },
  nurture:       { color: "text-foreground",    bg: "bg-muted/10 border-border/15" },
  skip_trace:    { color: "text-primary-400",    bg: "bg-primary-500/10 border-primary-500/15" },
  ghost:         { color: "text-foreground",  bg: "bg-muted/10 border-border/15" },
  sms_outbound:  { color: "text-foreground",  bg: "bg-muted/10 border-border/15" },
  manual_hangup: { color: "text-foreground",    bg: "bg-muted/10 border-border/15" },
  initiating:    { color: "text-foreground",  bg: "bg-muted/10 border-border/15" },
};

function timeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(isoStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function CallHistoryRow({ entry, allHistory, onDial }: { entry: CallHistoryEntry; allHistory: CallHistoryEntry[]; onDial: (phone: string) => void }) {
  const [notesOpen, setNotesOpen] = useState(false);
  const style = DISPO_STYLES[entry.disposition] ?? { color: "text-muted-foreground", bg: "bg-overlay-3 border-overlay-6" };
  const isInbound = entry.direction === "inbound";
  const isSms = entry.disposition === "sms_outbound";
  const phoneDigits = (entry.phone_dialed ?? "").replace(/\D/g, "").slice(-10);
  const hasLead = Boolean(entry.lead_id);
  const hasNotes = Boolean(entry.notes?.trim() || entry.ai_summary?.trim());

  // All calls to/from this phone number (for multi-call context)
  const priorCalls = useMemo(() => {
    if (!phoneDigits) return [];
    return allHistory.filter((c) => {
      const digits = (c.phone_dialed ?? "").replace(/\D/g, "").slice(-10);
      return digits === phoneDigits && c.id !== entry.id && (c.notes?.trim() || c.ai_summary?.trim());
    });
  }, [allHistory, phoneDigits, entry.id]);

  const hasAnyNotes = hasNotes || priorCalls.length > 0;

  return (
    <div>
      <div className="flex items-center gap-2.5 rounded-[12px] px-3 py-2.5 transition-all border border-transparent hover:border-overlay-6 hover:bg-overlay-2">
        {/* Direction dot — indicator only, not a button */}
        <span
          className={`h-2 w-2 rounded-full shrink-0 mt-0.5 ${
            isSms ? "bg-muted" : isInbound ? "bg-muted" : "bg-primary"
          }`}
          title={isSms ? "SMS" : isInbound ? "Inbound" : "Outbound"}
        />

        {/* Contact + phone */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium truncate">
              {entry.owner_name ?? formatUsPhone(phoneDigits)}
            </p>
            {entry.owner_name && (
              <span className="text-sm text-muted-foreground/45 font-mono shrink-0">
                {formatUsPhone(phoneDigits)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-xs px-1.5 py-0.5 rounded-[5px] border font-medium uppercase tracking-wider shrink-0 ${style.color} ${style.bg}`}>
              {entry.disposition.replace(/_/g, " ")}
            </span>
            {entry.duration_sec > 0 && (
              <span className="text-sm text-muted-foreground/45 font-mono">{formatDuration(entry.duration_sec)}</span>
            )}
            <span className="text-sm text-muted-foreground/35">{timeAgo(entry.started_at)}</span>
          </div>
        </div>

        {/* Notes button — visible when this call or any prior call to same number has notes */}
        {hasAnyNotes && (
          <button
            onClick={() => setNotesOpen(!notesOpen)}
            className={`h-7 w-7 rounded-[8px] flex items-center justify-center shrink-0 transition-all relative
              ${notesOpen
                ? "bg-primary/20 border border-primary/30 text-primary"
                : "bg-overlay-4 hover:bg-overlay-8 border border-overlay-8 hover:border-overlay-15 text-muted-foreground/50 hover:text-foreground"
              }`}
            title={`View notes${priorCalls.length > 0 ? ` (${priorCalls.length + (hasNotes ? 1 : 0)} calls)` : ""}`}
          >
            <FileText className="h-3 w-3" />
            {priorCalls.length > 0 && (
              <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-primary text-[9px] font-bold text-primary-foreground flex items-center justify-center">
                {priorCalls.length + (hasNotes ? 1 : 0)}
              </span>
            )}
          </button>
        )}

        {/* Redial button — always visible */}
        {phoneDigits && (
          <button
            onClick={() => onDial(entry.phone_dialed)}
            className="h-7 w-7 rounded-[8px] flex items-center justify-center shrink-0
              bg-primary/8 hover:bg-primary/20 border border-primary/15 hover:border-primary/30
              text-primary/70 hover:text-primary transition-all"
            title={`Redial ${formatUsPhone(phoneDigits)}`}
          >
            <Phone className="h-3 w-3" />
          </button>
        )}

        {/* Open Lead button — always visible when linked to a lead */}
        {hasLead && (
          <a
            href={`/leads?open=${entry.lead_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="h-7 w-7 rounded-[8px] flex items-center justify-center shrink-0
              bg-overlay-4 hover:bg-overlay-8 border border-overlay-8 hover:border-overlay-15
              text-muted-foreground/50 hover:text-foreground transition-all"
            title="Open lead detail"
          >
            <ArrowUpRight className="h-3 w-3" />
          </a>
        )}
      </div>

      {/* Expandable notes panel — this call + prior calls to same number */}
      {notesOpen && hasAnyNotes && (
        <div className="mx-3 mb-2 px-3 py-2 rounded-[8px] bg-overlay-2 border border-overlay-6 text-sm space-y-2 max-h-64 overflow-y-auto">
          {/* This call's notes */}
          {hasNotes && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50 mb-0.5">
                This call &middot; {timeAgo(entry.started_at)}
              </p>
              {entry.notes && (
                <p className="text-foreground/70 whitespace-pre-wrap text-sm leading-relaxed">{entry.notes}</p>
              )}
              {entry.ai_summary && (
                <div className="mt-1">
                  <p className="text-xs text-muted-foreground/40 flex items-center gap-1 mb-0.5">
                    <Sparkles className="h-2.5 w-2.5" /> AI Summary
                  </p>
                  <p className="text-foreground/60 whitespace-pre-wrap text-sm leading-relaxed">{entry.ai_summary}</p>
                </div>
              )}
            </div>
          )}
          {/* Prior calls to the same phone number */}
          {priorCalls.map((prior) => (
            <div key={prior.id} className="border-t border-overlay-4 pt-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50 mb-0.5">
                {prior.direction === "inbound" ? "Inbound" : "Outbound"} &middot; {timeAgo(prior.started_at)}
                {prior.duration_sec > 0 && <span className="font-mono ml-1">{formatDuration(prior.duration_sec)}</span>}
              </p>
              {prior.notes && (
                <p className="text-foreground/70 whitespace-pre-wrap text-sm leading-relaxed">{prior.notes}</p>
              )}
              {prior.ai_summary && (
                <div className="mt-1">
                  <p className="text-xs text-muted-foreground/40 flex items-center gap-1 mb-0.5">
                    <Sparkles className="h-2.5 w-2.5" /> AI Summary
                  </p>
                  <p className="text-foreground/60 whitespace-pre-wrap text-sm leading-relaxed">{prior.ai_summary}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
