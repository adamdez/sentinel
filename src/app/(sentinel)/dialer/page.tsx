"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Device, Call } from "@twilio/voice-sdk";
import {
  Phone, PhoneOff, PhoneForwarded, PhoneIncoming, Clock, Users, BarChart3,
  Mic, MicOff, Voicemail, CalendarCheck, FileSignature,
  Skull, Heart, Search, Ghost, Zap, ChevronRight, Timer,
  Sparkles, DollarSign, Loader2, SkipForward, MessageSquare,
  X, Send, Shield, CheckCircle2, History, ArrowDownLeft, ArrowUpRight,
  AlertTriangle, Wifi, WifiOff, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSentinelStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { useDialerQueue, useDialerStats, useCallTimer, fetchDialerKpis, type QueueLead, type DialerStats } from "@/hooks/use-dialer";
import { RelationshipBadgeCompact } from "@/components/sentinel/relationship-badge";
import { getSequenceLabel, getCadencePosition } from "@/lib/call-scheduler";
import { useCallNotes } from "@/hooks/use-call-notes";
import { usePreCallBrief } from "@/hooks/use-pre-call-brief";
import { CallSequenceGuide } from "@/components/sentinel/call-sequence-guide";
import { useCallHistory, type CallHistoryEntry } from "@/hooks/use-call-history";
import { MasterClientFileModal, clientFileFromRaw } from "@/components/sentinel/master-client-file-modal";
import { deriveNextActionVisibility } from "@/lib/leads-data";
import { formatDueDateLabel } from "@/lib/due-date-label";
import { Eye } from "lucide-react";
import { useCoachSurface } from "@/providers/coach-provider";
import { CoachPanel, CoachToggle } from "@/components/sentinel/coach-panel";
import { PostCallPanel } from "@/components/sentinel/post-call-panel";
import { SellerMemoryPanel } from "@/components/sentinel/seller-memory-panel";
import { SellerMemoryPreview } from "@/components/sentinel/seller-memory-preview";
import { LiveAssistPanel } from "@/components/sentinel/live-assist-panel";

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
  return headers;
}

// ── KPI Card + Detail Modal (defined outside render to avoid focus issues) ──

type KpiKey = "myOutbound" | "myInbound" | "myLiveAnswers" | "myAvgTalkTime" | "teamOutbound" | "teamInbound";
type Period = "today" | "week" | "month" | "all";

const KPI_META: Record<KpiKey, { label: string; icon: React.ElementType; color: string; glow: string; teamKey: KpiKey; format?: (v: number) => string }> = {
  myOutbound:    { label: "My Outbound",    icon: PhoneForwarded, color: "text-primary",        glow: "rgba(0,0,0,0.12)",  teamKey: "teamOutbound" },
  myInbound:     { label: "My Inbound",     icon: PhoneIncoming,  color: "text-foreground",  glow: "rgba(0,0,0,0.1)", teamKey: "teamInbound" },
  myLiveAnswers: { label: "Outbounds Answered", icon: Phone,       color: "text-foreground", glow: "rgba(0,0,0,0.12)", teamKey: "myLiveAnswers" },
  myAvgTalkTime: { label: "Avg Talk Time",  icon: Timer,          color: "text-foreground",  glow: "rgba(0,0,0,0.1)", teamKey: "myAvgTalkTime", format: (s) => s > 0 ? `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}` : "0:00" },
  teamOutbound:  { label: "Team Outbound",  icon: Users,          color: "text-foreground",    glow: "rgba(0,0,0,0.1)", teamKey: "teamOutbound" },
  teamInbound:   { label: "Team Inbound",   icon: Users,          color: "text-foreground",    glow: "rgba(0,0,0,0.1)", teamKey: "teamInbound" },
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
        transition-all duration-100 cursor-pointer hover:border-primary/25 hover:bg-white/[0.03]
        hover:shadow-[0_12px_40px_rgba(0,0,0,0.28)] active:scale-[0.98] group relative overflow-hidden w-full"
    >
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/[0.06] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div
        className="h-7 w-7 rounded-[8px] flex items-center justify-center mx-auto mb-1"
        style={{ background: "rgba(255,255,255,0.06)" }}
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
          className="relative max-w-md w-full mx-4 rounded-[16px] border border-white/[0.08]
            modal-glass flex flex-col overflow-hidden"
        >
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-[10px] flex items-center justify-center bg-white/[0.06]">
                <meta.icon className={`h-4 w-4 ${meta.color}`} />
              </div>
              <h3 className="text-sm font-bold text-white">{meta.label} — Breakdown</h3>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-[10px] hover:bg-white/[0.06] transition-colors text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Period tabs */}
          <div className="flex items-center gap-1 px-4 py-2 border-b border-white/[0.06]">
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
                    <p className="text-3xl font-bold text-primary" style={{ textShadow: "0 0 14px rgba(0,0,0,0.3)" }}>
                      {fmt(myVal)}
                    </p>
                  </div>
                  <div className="rounded-[12px] border border-border/15 bg-muted/[0.04] p-4 text-center">
                    <p className="text-sm text-muted-foreground/60 uppercase tracking-widest mb-1">Team Total</p>
                    <p className="text-3xl font-bold text-foreground" style={{ textShadow: "0 0 14px rgba(0,0,0,0.12)" }}>
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
                    <div className="h-2 rounded-full bg-white/[0.04] overflow-hidden">
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
                    <div key={s.label} className="rounded-[10px] border border-white/[0.06] bg-white/[0.02] p-2.5 text-center">
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
  { key: "dead",        label: "Dead",         hotkey: "6", icon: Skull,          color: "text-foreground",    bgColor: "bg-muted/10 hover:bg-muted/20 border-border/20" },
  { key: "nurture",     label: "Nurture",      hotkey: "7", icon: Heart,          color: "text-foreground",   bgColor: "bg-muted/10 hover:bg-muted/20 border-border/20" },
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
  if (normalized === "prospect") return "Prospect";
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
  let gaps = 0;
  if (lead.motivation_level == null) gaps += 1;
  if (lead.seller_timeline == null) gaps += 1;
  if (lead.condition_level == null) gaps += 1;
  if (lead.decision_maker_confirmed !== true) gaps += 1;
  if (lead.price_expectation == null) gaps += 1;
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

function toE164(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  // Strip leading country code "1" so we don't double it
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return `+1${digits.slice(0, 10)}`;
}

function DialerPageInner() {
  const { currentUser, ghostMode } = useSentinelStore();
  const { queue, loading: queueLoading, refetch: refetchQueue } = useDialerQueue(7);
  const { stats, loading: statsLoading } = useDialerStats();
  const timer = useCallTimer();

  const [callState, setCallState] = useState<CallState>("idle");
  const [currentLead, setCurrentLead] = useState<QueueLead | null>(null);
  const [currentCallLogId, setCurrentCallLogId] = useState<string | null>(null);
  const [dialerSessionId, setDialerSessionId] = useState<string | null>(null); // PR3b: survives call end for PostCallPanel publish
  const [muted, setMuted] = useState(false);
  const [callNotes, setCallNotes] = useState("");
  const [dispositionPending, setDispositionPending] = useState(false);
  const [smsLoading, setSmsLoading] = useState(false);
  const [transferStatus, setTransferStatus] = useState<string | null>(null);
  const [consentPending, setConsentPending] = useState(false);
  const [consentGranted, setConsentGranted] = useState(false);
  const { latestSummary, latestSummaryTime } = useCallNotes(currentLead?.id);
  const { brief: preCallBrief, loading: briefLoading } = usePreCallBrief(currentLead?.id ?? null);
  const { history: callHistory, loading: historyLoading } = useCallHistory(currentUser.id, 30);
  const [historyFilter, setHistoryFilter] = useState<"all" | "outbound" | "inbound">("all");

  useCoachSurface("dialer", {});
  const [fileModalOpen, setFileModalOpen] = useState(false);
  const [liveNotes, setLiveNotes] = useState<string[]>([]);
  const [savedNotes, setSavedNotes] = useState<Array<{ content: string; time: string }>>([]);
  const [savingNote, setSavingNote] = useState(false);
  const noteSeqRef = useRef(0);
  // Tracks whether the note scaffold has been seeded for the current call session.
  // Reset to false each time callState returns to idle so the next call starts fresh.
  const noteScaffoldSeeded = useRef(false);

  // Subscribe to live_notes updates from transcription server via Supabase realtime
  useEffect(() => {
    if (!currentCallLogId) { setLiveNotes([]); return; }
    const channel = supabase
      .channel(`live-notes-${currentCallLogId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "calls_log", filter: `id=eq.${currentCallLogId}` },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          const notes = payload.new?.live_notes;
          if (Array.isArray(notes) && notes.length > 0) {
            setLiveNotes(notes);
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentCallLogId]);

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
  const [manualDialing, setManualDialing] = useState(false);
  const [manualCallLogId, setManualCallLogId] = useState<string | null>(null);
  const [manualSessionId, setManualSessionId] = useState<string | null>(null);
  const [manualStatus, setManualStatus] = useState<"idle" | "dialing" | "connected" | "ended">("idle");
  const [smsComposeOpen, setSmsComposeOpen] = useState(false);
  const [smsComposeMsg, setSmsComposeMsg] = useState("");
  const [smsComposeSending, setSmsComposeSending] = useState(false);

  // Inline SMS compose for the lead card (separate from manual-dial SMS compose)
  const [leadSmsOpen, setLeadSmsOpen] = useState(false);
  const [leadSmsMsg, setLeadSmsMsg] = useState("");
  const [leadSmsSending, setLeadSmsSending] = useState(false);

  // Twilio VoIP Device
  const [deviceStatus, setDeviceStatus] = useState<"initializing" | "ready" | "error" | "offline">("initializing");
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [voipCallerId, setVoipCallerId] = useState<string>("");
  const deviceRef = useRef<Device | null>(null);

  // Twilio diagnostics + real-time call status
  const [currentCallSid, setCurrentCallSid] = useState<string | null>(null);
  const [liveCallStatus, setLiveCallStatus] = useState<string | null>(null);
  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeCallRef = useRef<Call | null>(null);
  const [diagOpen, setDiagOpen] = useState(false);
  const [diagResults, setDiagResults] = useState<{ name: string; status: string; message: string; detail?: string }[] | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  useEffect(() => {
    if (!currentLead && queue.length > 0) {
      setCurrentLead(queue[0]);
    }
  }, [queue, currentLead]);

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
    const refreshedLead = queue.find((lead) => lead.id === id);
    if (refreshedLead) {
      setCurrentLead(refreshedLead);
    }
  }, [queue]);

  const handleModalRefresh = useCallback(() => {
    refetchQueue();
  }, [refetchQueue]);

  // Auto-dial after consent granted
  useEffect(() => {
    if (consentGranted && currentLead) {
      setConsentGranted(false);
      handleDial(currentLead);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consentGranted]);

  // ── Twilio VoIP Device Initialization ────────────────────────────
  const initDeviceCancelRef = useRef<(() => void) | null>(null);

  const initDevice = useCallback(async () => {
    if (!currentUser.id) return;

    // Tear down previous device / cancel previous init
    if (initDeviceCancelRef.current) initDeviceCancelRef.current();
    if (deviceRef.current) {
      deviceRef.current.destroy();
      deviceRef.current = null;
    }

    let cancelled = false;
    const cancel = () => { cancelled = true; };
    initDeviceCancelRef.current = cancel;

    setDeviceStatus("initializing");

    try {
      const hdrs = await authHeaders();
      const res = await fetch("/api/twilio/token", { headers: hdrs });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Token fetch failed" }));
        console.warn("[VoIP] Token error:", err.error);
        if (!cancelled) setDeviceStatus("error");
        return;
      }

      const { token, callerId: cid } = await res.json();
      if (cancelled) return;

      setVoipCallerId(cid || "");

      const device = new Device(token, {
        codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
        closeProtection: "A call is in progress. Are you sure you want to leave?",
      });

      device.on("registered", () => {
        if (!cancelled) {
          setDeviceStatus("ready");
          console.log("[VoIP] Device registered");
        }
      });

      device.on("error", (err: { message?: string }) => {
        console.error("[VoIP] Device error:", err);
        if (!cancelled) {
          setDeviceStatus("error");
          // Silently log — no toast; user sees the subtle "VoIP Offline" badge
        }
      });

      device.on("unregistered", () => {
        if (!cancelled) setDeviceStatus("offline");
      });

      // Token refresh — fires ~3 min before expiry
      device.on("tokenWillExpire", async () => {
        try {
          const hdrs2 = await authHeaders();
          const r = await fetch("/api/twilio/token", { headers: hdrs2 });
          if (r.ok) {
            const { token: newToken } = await r.json();
            device.updateToken(newToken);
            console.log("[VoIP] Token refreshed");
          }
        } catch {
          console.warn("[VoIP] Token refresh failed");
        }
      });

      await device.register();
      if (!cancelled) deviceRef.current = device;
    } catch (err) {
      console.error("[VoIP] Device init failed:", err);
      if (!cancelled) setDeviceStatus("error");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  useEffect(() => {
    if (!currentUser.id) return;

    initDevice();

    const timeout = setTimeout(() => {
      if (deviceRef.current === null) {
        setDeviceStatus("error");
        console.warn("[VoIP] Connection timed out");
      }
    }, 15_000);

    return () => {
      clearTimeout(timeout);
      if (initDeviceCancelRef.current) initDeviceCancelRef.current();
      if (deviceRef.current) {
        deviceRef.current.destroy();
        deviceRef.current = null;
      }
    };
  }, [currentUser.id, initDevice]);

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

  const grantConsent = useCallback(async () => {
    if (!currentLead) return;

    const res = await fetch("/api/dialer/consent", {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({ leadId: currentLead.id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      toast.error(data?.error ?? `Consent save failed (HTTP ${res.status})`);
      return;
    }

    setConsentPending(false);
    setConsentGranted(true);
  }, [currentLead]);

  const handleDial = useCallback(async (lead?: QueueLead) => {
    const target = lead ?? currentLead;
    if (!target) return;

    const phone = target.properties?.owner_phone;
    if (!phone) {
      toast.error("No phone number for this lead");
      return;
    }

    if (!target.compliant && !ghostMode) {
      toast.error("Compliance blocked — cannot dial");
      return;
    }

    // Check consent for first call — query lead record
    if (target.total_calls === 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: leadCheck } = await (supabase.from("leads") as any)
        .select("call_consent")
        .eq("id", target.id)
        .single();
      if (!leadCheck?.call_consent) {
        setCurrentLead(target);
        setConsentPending(true);
        return;
      }
    }

    if (!deviceRef.current || deviceStatus !== "ready") {
      toast.error("VoIP not connected — click Reconnect and try again");
      return;
    }

    setCurrentLead(target);
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
        setTransferStatus("Ringing prospect…");
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
        // Advance session to terminal so publish can proceed (409 is non-fatal
        // if Twilio StatusCallback already advanced it first, or if session was never created).
        if (newSessionId) {
          authHeaders().then((hdrs) =>
            fetch(`/api/dialer/v1/sessions/${newSessionId}`, {
              method: "PATCH",
              headers: hdrs,
              body: JSON.stringify({ status: "ended" }),
            })
          ).catch(() => {});
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
      timer.reset();
    }
  }, [currentLead, currentUser.id, ghostMode, timer, deviceStatus, voipCallerId]);

  const handleSendText = useCallback(async () => {
    if (!currentLead) return;
    const phone = currentLead.properties?.owner_phone;
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
  }, [currentLead, currentUser.id]);

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
        // Advance manual session to terminal so closeout works
        if (manualSessionIdLocal) {
          authHeaders().then((hdrs) =>
            fetch(`/api/dialer/v1/sessions/${manualSessionIdLocal}`, {
              method: "PATCH",
              headers: hdrs,
              body: JSON.stringify({ status: "ended" }),
            })
          ).catch(() => {});
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
    setCallState("ended");
    setTransferStatus(null);
    setCurrentCallSid(null);
    setLiveCallStatus(null);
    setMuted(false);
    timer.stop();
  }, [timer, activeCall]);

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

    const currentIdx = queue.findIndex((l) => l.id === currentLead?.id);
    const nextLead = queue[currentIdx + 1] ?? queue[0] ?? null;
    setCurrentLead(nextLead);
    refetchQueue();
  }, [currentCallLogId, callState, callNotes, currentLead, currentUser.id, handleHangup, queue, refetchQueue, timer]);

  // ── PostCallPanel completion handler ────────────────────────────────
  // Shared by onComplete and onSkip — PostCallPanel handles its own API calls.
  const handlePostCallDone = useCallback(() => {
    setCallState("idle");
    setCurrentCallLogId(null);
    setCurrentCallSid(null);
    setDialerSessionId(null);
    setLiveCallStatus(null);
    setCallNotes("");
    setTransferStatus(null);
    setMuted(false);
    setSavedNotes([]);
    noteSeqRef.current = 0;
    timer.reset();
    const currentIdx = queue.findIndex((l) => l.id === currentLead?.id);
    const nextLead = queue[currentIdx + 1] ?? queue[0] ?? null;
    setCurrentLead(nextLead);
    refetchQueue();
  }, [currentLead, queue, refetchQueue, timer]);

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
  }, [dialerSessionId, callNotes, savingNote]);

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

  const [activeKpi, setActiveKpi] = useState<KpiKey | null>(null);

  const kpiKeys: KpiKey[] = ["myOutbound", "myInbound", "myLiveAnswers", "myAvgTalkTime", "teamOutbound", "teamInbound"];

  const dialerContext = useMemo(() => {
    if (!currentLead) return null;

    const nextAction = deriveNextActionVisibility({
      status: currentLead.status,
      qualificationRoute: (currentLead.qualification_route as "offer_ready" | "follow_up" | "nurture" | "dead" | "escalate" | null) ?? null,
      nextCallScheduledAt: currentLead.next_call_scheduled_at,
      nextFollowUpAt: currentLead.next_follow_up_at,
    });
    const leadHistory = callHistory.find((entry) => entry.lead_id === currentLead.id);
    const recentOutcome = leadHistory?.disposition ?? currentLead.disposition_code ?? "none";
    const dueText = nextAction.dueAt ? formatDueDateLabel(nextAction.dueAt).text : "No due date";
    const qualificationGaps = countQualificationGaps(currentLead);
    const assistPrompts = compactCallAssistPrompts({
      route: currentLead.qualification_route ?? null,
      nextActionLabel: nextAction.label,
      hasDueDate: Boolean(nextAction.dueAt),
      totalCalls: currentLead.total_calls ?? 0,
      missingMotivation: currentLead.motivation_level == null,
      missingTimeline: currentLead.seller_timeline == null,
      missingDecisionMaker: currentLead.decision_maker_confirmed !== true,
      missingPriceExpectation: currentLead.price_expectation == null,
      missingCondition: currentLead.condition_level == null,
    });

    return {
      stage: stageLabel(currentLead.status),
      route: qualificationRouteLabel(currentLead.qualification_route),
      nextActionLabel: nextAction.label,
      dueText,
      qualificationScore: currentLead.qualification_score_total,
      qualificationGaps,
      recentOutcome: recentOutcome.replace(/_/g, " "),
      notePreview: notePreview(currentLead.notes),
      assistPrompts,
      motivationLevel: currentLead.motivation_level,
      sellerTimeline:  currentLead.seller_timeline,
      lastContactAt:   currentLead.last_contact_at,
    };
  }, [callHistory, currentLead]);

  return (
    <PageShell
      title="Dialer"
      description="Call workspace — prepare, call, close out"
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
              ? liveCallStatus === "ringing" ? "RINGING PROSPECT…"
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
                  <button onClick={() => setDiagOpen(false)} className="p-1 rounded hover:bg-white/[0.06]">
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
              {liveCallStatus === "ringing" && "Ringing prospect…"}
              {liveCallStatus === "ringing_prospect" && "Ringing prospect…"}
              {liveCallStatus === "ringing_agent" && "Connecting VoIP…"}
              {liveCallStatus === "failed" && "Call failed — run diagnostics to troubleshoot"}
              {liveCallStatus === "canceled" && "Call was canceled"}
              {liveCallStatus === "busy" && "Prospect line is busy"}
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

      {/* ── Quick Manual Dial ─────────────────────────────────────────── */}
      <GlassCard hover={false} className="!p-3 mb-3">
        <div className="flex items-center gap-2 mb-2">
          <Phone className="h-3 w-3 text-muted-foreground" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Manual Dial
          </h2>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Input
              value={formatUsPhone(manualPhone)}
              onChange={(e) => {
                const raw = e.target.value.replace(/\D/g, "");
                setManualPhone(raw.slice(0, 10));
              }}
              placeholder="(509) 555-1234"
              className="text-sm font-mono tracking-wide bg-white/[0.03] border-white/[0.06] focus:border-primary/30 focus:ring-ring/10 h-9 pr-24"
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
              <div className="mt-3 rounded-[12px] bg-white/[0.03] border border-border p-3 space-y-2">
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
                  className="w-full bg-transparent text-sm resize-none h-20 outline-none placeholder:text-muted-foreground/30 border border-white/[0.04] rounded-[8px] p-2"
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

      {/* Compact KPI summary — click any stat for detail */}
      <div className="flex items-center gap-4 px-3 py-1.5 rounded-[10px] border border-white/[0.06] bg-white/[0.02] text-xs text-muted-foreground mb-3">
        {kpiKeys.slice(0, 4).map((k) => {
          const meta = KPI_META[k];
          const display = meta.format ? meta.format(stats[k]) : stats[k];
          return (
            <button key={k} onClick={() => setActiveKpi(k)} className="flex items-center gap-1.5 hover:text-foreground transition-colors">
              <meta.icon className="h-3 w-3" />
              <span className="font-medium text-foreground/80">{statsLoading ? "—" : display}</span>
              <span className="uppercase tracking-wider text-muted-foreground/50">{meta.label}</span>
            </button>
          );
        })}
      </div>

      {activeKpi && (
        <StatDetailModal kpiKey={activeKpi} userId={currentUser.id} onClose={() => setActiveKpi(null)} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-3">
          <GlassCard hover={false} className="!p-3">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-primary" />
                Dial Queue
                <CallSequenceGuide />
              </h2>
              <button
                onClick={refetchQueue}
                className="text-sm text-muted-foreground/60 hover:text-foreground transition-colors"
              >
                Refresh
              </button>
            </div>
            <p className="text-sm text-muted-foreground/50 mb-2">
              Overdue first, then due today, then unscheduled.
            </p>

            {queueLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-14 rounded-[12px] bg-secondary/20 animate-pulse" />
                ))}
              </div>
            ) : queue.length === 0 ? (
              <div className="text-center py-6 space-y-3">
                <Phone className="h-6 w-6 mx-auto text-muted-foreground/20" />
                <p className="text-xs text-muted-foreground/50">No leads queued — add or claim leads from the Lead Queue</p>
                <a href="/leads">
                  <button className="px-5 py-2 rounded-[10px] text-xs font-bold text-primary bg-primary/[0.10] border border-primary/25
                    hover:bg-primary/[0.18] hover:border-primary/35 shadow-[0_0_14px_rgba(0,0,0,0.08)]
                    hover:shadow-[0_0_22px_rgba(0,0,0,0.16)] transition-all">
                    Go to Lead Queue
                  </button>
                </a>
                <p className="text-sm text-muted-foreground/60">Claimed leads appear here automatically</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {queue.map((lead, idx) => {
                  const isActive = currentLead?.id === lead.id;
                  const score = lead.priority ?? 0;
                  const sl = getScoreLabel(score);
                  const rowNextAction = deriveNextActionVisibility({
                    status: lead.status,
                    qualificationRoute: lead.qualification_route,
                    nextCallScheduledAt: lead.next_call_scheduled_at,
                    nextFollowUpAt: lead.next_follow_up_at ?? lead.follow_up_date ?? null,
                  });
                  const rowDueIso = lead.next_call_scheduled_at ?? lead.next_follow_up_at ?? lead.follow_up_date ?? null;
                  const rowDue = formatDueDateLabel(rowDueIso);
                  const rowDueLabel = rowDue.text === "n/a" ? "No due date" : rowDue.text;

                  return (
                    <button
                      key={lead.id}
                      onClick={() => setCurrentLead(lead)}
                      className={`w-full text-left rounded-[12px] p-2.5 transition-all duration-200 border ${
                        isActive
                          ? "bg-primary/5 border-primary/20 shadow-[0_0_12px_rgba(0,0,0,0.1)]"
                          : "bg-secondary/10 border-transparent hover:bg-secondary/20"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground/55 font-mono w-3">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate flex items-center gap-1">
                            {lead.properties?.owner_name ?? "Unknown"}
                            <RelationshipBadgeCompact data={{ tags: lead.tags }} />
                          </p>
                          <p className="text-xs text-muted-foreground/80 truncate">{lead.properties?.address ?? "No address"}</p>
                          <p className="text-sm text-muted-foreground/65 truncate">
                            {stageLabel(lead.status)} - {qualificationRouteLabel(lead.qualification_route)} - Next: {rowNextAction.label}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground/60 font-mono shrink-0" title={getCadencePosition(lead.total_calls ?? 0).label}>
                          {(lead.total_calls ?? 0)}/{getCadencePosition(lead.total_calls ?? 0).totalTouches}
                        </span>
                        <span
                          className={
                            rowDue.overdue
                              ? "text-xs px-1.5 py-0 rounded border border-border/35 bg-muted/10 text-foreground shrink-0"
                              : rowDue.urgent
                                ? "text-xs px-1.5 py-0 rounded border border-border/35 bg-muted/10 text-foreground shrink-0"
                                : "text-xs px-1.5 py-0 rounded border border-white/12 bg-white/[0.04] text-muted-foreground shrink-0"
                          }
                          title="Next action due state"
                        >
                          {rowDueLabel}
                        </span>
                        <Badge variant={sl.variant} className="text-xs px-1.5 py-0 shrink-0">
                          {score}
                        </Badge>
                        {!lead.compliant && !ghostMode && (
                          <span className="h-2 w-2 rounded-full bg-foreground/80 shadow-[0_0_6px_rgba(0,0,0,0.25)] shrink-0" title="Compliance blocked" />
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
          {/* One-time consent banner */}
          <AnimatePresence>
            {consentPending && currentLead && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mb-3 rounded-[12px] border border-border/20 bg-muted/5 p-4"
              >
                <div className="flex items-start gap-3">
                  <Shield className="h-5 w-5 text-foreground shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">Agent Consent Acknowledgment</p>
                    <p className="text-sm text-muted-foreground/70 mt-1 leading-relaxed">
                      This call may be recorded for quality, training, and AI note summarization purposes
                      as permitted under Washington law (RCW 9.73.030). Do you consent to continue?
                    </p>
                    <div className="flex items-center gap-2 mt-3">
                      <Button
                        size="sm"
                        onClick={grantConsent}
                        className="text-sm h-7 px-4 gap-1.5 bg-primary/15 hover:bg-primary/25 text-primary border border-primary/20"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        Confirm & Dial
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConsentPending(false)}
                        className="text-sm h-7 px-3"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

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
                      {callState === "connected" && `Connected — ${timer.formatted} — Caller ID: Dominion Homes`}
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
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {(() => {
                          const sl = getScoreLabel(currentLead.priority);
                          return (
                            <Badge variant={sl.variant} className="text-sm px-2.5 py-0.5 gap-1">
                              <Sparkles className="h-3 w-3" />
                              {currentLead.priority} {sl.label}
                            </Badge>
                          );
                        })()}
                        <Badge variant="outline" className="text-xs gap-1 border-primary/20 text-primary/70">
                          <Phone className="h-2.5 w-2.5" />
                          {getCadencePosition(currentLead.total_calls ?? 0).label}
                        </Badge>
                        {!currentLead.compliant && !ghostMode && (
                          <Badge variant="destructive" className="text-sm">
                            COMPLIANCE BLOCKED
                          </Badge>
                        )}
                      </div>
                    </div>

                    {dialerContext && (
                      <div className="rounded-[10px] bg-white/[0.03] border border-white/[0.06] p-2.5 space-y-2">
                        {/* Compact context line */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span><span className="text-foreground font-medium">{dialerContext.stage}</span></span>
                          <span className="text-muted-foreground/30">·</span>
                          <span>Next: <span className="text-foreground font-medium">{dialerContext.nextActionLabel}</span></span>
                          <span className="text-muted-foreground/30">·</span>
                          <span className={dialerContext.dueText === "Overdue" ? "text-red-400 font-medium" : ""}>Due: {dialerContext.dueText}</span>
                          {dialerContext.qualificationGaps > 0 && (
                            <>
                              <span className="text-muted-foreground/30">·</span>
                              <span className="text-amber-400">{dialerContext.qualificationGaps} qual gap{dialerContext.qualificationGaps === 1 ? "" : "s"}</span>
                            </>
                          )}
                          {dialerContext.motivationLevel != null && (
                            <>
                              <span className="text-muted-foreground/30">·</span>
                              <span>Motivation: <span className="text-foreground font-medium">{dialerContext.motivationLevel}/5</span></span>
                            </>
                          )}
                          {dialerContext.sellerTimeline && dialerContext.sellerTimeline !== "unknown" && (
                            <>
                              <span className="text-muted-foreground/30">·</span>
                              <span>Timeline: <span className="text-foreground font-medium">{TIMELINE_SHORT[dialerContext.sellerTimeline] ?? dialerContext.sellerTimeline}</span></span>
                            </>
                          )}
                        </div>
                        {/* Last outcome + note */}
                        <p className="text-xs text-muted-foreground/70">
                          Last: <span className="text-foreground/80 capitalize">{dialerContext.recentOutcome}</span>
                          {dialerContext.lastContactAt && <> · {relativeAge(dialerContext.lastContactAt)}</>}
                          {dialerContext.notePreview !== "No recent note" && (
                            <> — <span className="text-foreground/70">{dialerContext.notePreview}</span></>
                          )}
                        </p>
                        {/* Call assist prompts — compact */}
                        {dialerContext.assistPrompts.length > 0 && (
                          <div className="space-y-0.5">
                            {dialerContext.assistPrompts.map((prompt, idx) => (
                              <p key={idx} className="text-xs text-primary/80">→ {prompt}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Compact property vitals — single block instead of 9 tiles */}
                    <div className="rounded-[10px] bg-white/[0.03] border border-white/[0.06] px-3 py-2">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                        <span className="font-mono text-foreground">{currentLead.properties?.owner_phone ?? "No phone"}</span>
                        <span className="text-muted-foreground/40">|</span>
                        <span>ARV <span className="text-foreground font-medium">{currentLead.properties?.estimated_value ? `$${currentLead.properties.estimated_value.toLocaleString()}` : "—"}</span></span>
                        <span>Equity <span className="text-foreground font-medium">{currentLead.properties?.equity_percent != null ? `${currentLead.properties.equity_percent}%` : "—"}</span></span>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        <span>Owed <span className="text-foreground font-medium">{(currentLead.properties as any)?.total_loan_balance ? `$${Number((currentLead.properties as any).total_loan_balance).toLocaleString()}` : (currentLead.properties as any)?.owner_flags?.is_free_clear ? "Free & Clear" : "—"}</span></span>
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

                    {/* Pre-Call Intelligence Brief */}
                    <AnimatePresence>
                      {callState === "idle" && (preCallBrief || briefLoading) && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="rounded-[10px] bg-muted/[0.06] border border-border/20 p-2.5 overflow-hidden"
                        >
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <Sparkles className="h-3 w-3 text-foreground" />
                            <span className="text-sm font-semibold tracking-wider uppercase text-foreground">Pre-Call Brief</span>
                            {briefLoading && <Loader2 className="h-3 w-3 animate-spin text-foreground/60 ml-auto" />}
                          </div>
                          {preCallBrief && (
                            <>
                              <ul className="space-y-1 mb-2">
                                {preCallBrief.bullets.map((b, i) => (
                                  <li key={i} className="text-xs text-foreground/80 flex items-start gap-1.5">
                                    <span className="text-foreground mt-0.5">•</span>
                                    {b}
                                  </li>
                                ))}
                              </ul>
                              {preCallBrief.suggestedOpener && (
                                <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-2 mt-1">
                                  <p className="text-sm text-muted-foreground/60 uppercase mb-0.5">Suggested Opener</p>
                                  <p className="text-xs text-foreground/70 italic">&ldquo;{preCallBrief.suggestedOpener}&rdquo;</p>
                                </div>
                              )}
                              {preCallBrief.riskFlags.length > 0 && (
                                <div className="rounded-lg bg-muted/[0.06] border border-border/20 p-2 mt-1.5">
                                  <p className="text-sm text-foreground/70 uppercase mb-1">Risk Flags / Things That May Not Line Up</p>
                                  <div className="space-y-1">
                                    {preCallBrief.riskFlags.map((flag, i) => (
                                      <div key={i} className="flex items-start gap-1.5 text-sm text-foreground/80">
                                        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0 text-foreground/70" />
                                        <p>{flag}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Secondary phones from skip-trace / manual entry */}
                    {callState === "idle" && (() => {
                      const allPhones = (currentLead.properties?.owner_flags?.all_phones as { number: string; dnc?: boolean; lineType?: string }[] | undefined) ?? [];
                      const manualPhones = (currentLead.properties?.owner_flags?.manual_phones as string[] | undefined) ?? [];
                      // Combine: all_phones first, then manual_phones not already in all_phones
                      const primaryPhone = currentLead.properties?.owner_phone ?? "";
                      const extraPhones: string[] = [];
                      for (const p of allPhones) {
                        const num = p.number?.replace(/\D/g, "").slice(-10);
                        if (num && num !== primaryPhone.replace(/\D/g, "").slice(-10)) extraPhones.push(p.number);
                      }
                      for (const p of manualPhones) {
                        const num = p.replace(/\D/g, "").slice(-10);
                        if (num && num !== primaryPhone.replace(/\D/g, "").slice(-10) && !extraPhones.some(e => e.replace(/\D/g, "").slice(-10) === num)) extraPhones.push(p);
                      }
                      if (extraPhones.length === 0) return null;
                      return (
                        <div className="flex flex-wrap gap-1.5 pb-1">
                          <span className="text-sm text-muted-foreground/50 w-full">Additional numbers:</span>
                          {extraPhones.slice(0, 4).map((ph, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => {
                                const digits = ph.replace(/\D/g, "").replace(/^1/, "").slice(0, 10);
                                setManualPhone(digits);
                                window.scrollTo({ top: 0, behavior: "smooth" });
                                toast.info(`${formatUsPhone(digits)} loaded — hit Dial Now`);
                              }}
                              className="h-7 px-2.5 rounded-[8px] text-sm font-mono bg-primary/8 hover:bg-primary/18 border border-primary/20 text-primary transition-all flex items-center gap-1.5"
                            >
                              <Phone className="h-3 w-3" />
                              {formatUsPhone(ph.replace(/\D/g, "").slice(-10))}
                            </button>
                          ))}
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
                            {currentLead.properties?.owner_phone ? "Call Now" : "No Phone"}
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
                          Call ended — {timer.formatted} — complete closeout before moving on
                        </div>
                      )}
                    </div>

                    {false /* VoIP hint removed — shown in header badge instead */}

                    {/* Inline SMS compose for lead card */}
                    {leadSmsOpen && callState === "idle" && currentLead.properties?.owner_phone && (
                      <div className="mt-3 rounded-[12px] bg-white/[0.03] border border-border p-3 space-y-2">
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
                          className="w-full bg-transparent text-sm resize-none h-20 outline-none placeholder:text-muted-foreground/30 border border-white/[0.04] rounded-[8px] p-2"
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
                {(callState === "connected" || callState === "ended" || liveNotes.length > 0) && (
                  <GlassCard hover={false} className="!p-3 mt-3 border-primary/10">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Zap className="h-3 w-3 text-primary/60" />
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Live Notes</p>
                      {callState === "connected" && (
                        <span className="ml-auto flex items-center gap-1 text-xs text-primary/50">
                          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                          Listening
                        </span>
                      )}
                    </div>
                    {liveNotes.length > 0 ? (
                      <ul className="space-y-1">
                        {liveNotes.map((note, i) => (
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
                    <div className="border-t border-white/[0.04] pt-2 mt-1">
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
              <GlassCard hover={false} className="flex items-center justify-center h-64">
                <div className="text-center text-muted-foreground/40">
                  <Phone className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Select a lead from the queue to begin</p>
                </div>
              </GlassCard>
            )}
          </AnimatePresence>
        </div>

        <div className="lg:col-span-4">
          {/* Last Call AI Summary */}
          {currentLead && latestSummary && (
            <GlassCard hover={false} className="!p-3 mb-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Last Call Summary</span>
                {latestSummaryTime && (
                  <span className="text-xs text-muted-foreground/40 ml-auto">
                    {new Date(latestSummaryTime).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                )}
              </div>
              <div className="text-sm text-muted-foreground/80 leading-relaxed whitespace-pre-line max-h-28 overflow-y-auto scrollbar-thin">
                {latestSummary}
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
                {/* ── Seller Memory: visible during and after call ── */}
                {dialerSessionId && (
                  <SellerMemoryPanel
                    sessionId={dialerSessionId}
                    className="mb-3"
                  />
                )}

                {/* ── Live Assist: brief-based prompts during active call ── */}
                {callState === "connected" && preCallBrief && (
                  <LiveAssistPanel brief={preCallBrief} className="mb-3" />
                )}

                {callState === "ended" && dialerSessionId ? (
                  /* ── PostCallPanel: session-backed calls get publish path ── */
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
                    phoneNumber={currentLead?.properties?.owner_phone ?? null}
                    leadId={currentLead?.id ?? null}
                    onComplete={handlePostCallDone}
                    onSkip={handlePostCallDone}
                  />
                ) : (
                  /* ── Legacy disposition: live call or no-session fallback ── */
                  <GlassCard hover={false} className="!p-3">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                      <BarChart3 className="h-3.5 w-3.5 text-primary" />
                      Disposition
                      <span className="text-sm opacity-40 ml-auto">Keyboard shortcuts active</span>
                    </h2>

                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mb-2.5 gap-2 border-white/12 text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
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
                        const idx = queue.findIndex((l) => l.id === currentLead?.id);
                        setCurrentLead(queue[(idx + 1) % queue.length] ?? null);
                        setCallState("idle");
                        setCallNotes("");
                        timer.reset();
                      }}
                      disabled={queue.length <= 1}
                    >
                      <SkipForward className="h-3.5 w-3.5" />
                      Next Lead
                    </Button>
                  </GlassCard>
                )}

                <div className="mt-3 flex items-center justify-center gap-2 px-3 py-2 rounded-[10px] border border-white/[0.06] bg-white/[0.02]">
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
                key="call-history-panel"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {/* ── Pre-call seller memory (idle state) ── */}
                {currentLead && (
                  <SellerMemoryPreview leadId={currentLead.id} className="mb-3" />
                )}

                <GlassCard hover={false} className="!p-3">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <History className="h-3.5 w-3.5 text-primary" />
                      Call History
                      <span className="text-sm font-normal text-muted-foreground/50 ml-1">
                        {callHistory.length} recent
                      </span>
                    </h2>
                    <div className="flex items-center gap-1">
                      {(["all", "outbound", "inbound"] as const).map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setHistoryFilter(f)}
                          className={`px-2.5 py-1 rounded-[8px] text-sm font-medium transition-all ${
                            historyFilter === f
                              ? "text-primary bg-primary/8 border border-primary/20"
                              : "text-muted-foreground/60 hover:text-foreground border border-transparent"
                          }`}
                        >
                          {f === "all" ? "All" : f === "outbound" ? "Outbound" : "Inbound"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {historyLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-primary/50" />
                    </div>
                  ) : callHistory.length === 0 ? (
                    <div className="text-center py-6">
                      <History className="h-6 w-6 mx-auto text-muted-foreground/20 mb-2" />
                      <p className="text-xs text-muted-foreground/50">No calls yet — start dialing!</p>
                    </div>
                  ) : (
                    <div className="max-h-[calc(100vh-420px)] overflow-y-auto scrollbar-thin space-y-1">
                      {callHistory
                        .filter((c) => historyFilter === "all" || c.direction === historyFilter)
                        .map((entry) => (
                          <CallHistoryRow
                            key={entry.id}
                            entry={entry}
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
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

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

function CallHistoryRow({ entry, onDial }: { entry: CallHistoryEntry; onDial: (phone: string) => void }) {
  const style = DISPO_STYLES[entry.disposition] ?? { color: "text-muted-foreground", bg: "bg-white/[0.03] border-white/[0.06]" };
  const isInbound = entry.direction === "inbound";
  const isSms = entry.disposition === "sms_outbound";
  const phoneDigits = (entry.phone_dialed ?? "").replace(/\D/g, "").slice(-10);
  const hasLead = Boolean(entry.lead_id);

  return (
    <div className="flex items-center gap-2.5 rounded-[12px] px-3 py-2.5 transition-all border border-transparent hover:border-white/[0.06] hover:bg-white/[0.02]">
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
            bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/[0.16]
            text-muted-foreground/50 hover:text-foreground transition-all"
          title="Open lead detail"
        >
          <ArrowUpRight className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
