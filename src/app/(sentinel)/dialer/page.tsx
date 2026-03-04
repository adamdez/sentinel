"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Device, Call } from "@twilio/voice-sdk";
import {
  Phone, PhoneOff, PhoneForwarded, PhoneIncoming, Clock, Users, BarChart3,
  Mic, MicOff, Voicemail, CalendarCheck, FileSignature,
  Skull, Heart, Search, Ghost, Zap, ChevronRight, ChevronUp, ChevronDown, Timer,
  Sparkles, DollarSign, Loader2, SkipForward, MessageSquare,
  X, Send, Shield, CheckCircle2, History, ArrowDownLeft, ArrowUpRight,
  AlertTriangle, Wifi, WifiOff,
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
import { getSequenceLabel } from "@/lib/call-scheduler";
import { useCallNotes } from "@/hooks/use-call-notes";
import { usePreCallBrief } from "@/hooks/use-pre-call-brief";
import { CallSequenceGuide } from "@/components/sentinel/call-sequence-guide";
import { useCallHistory, type CallHistoryEntry } from "@/hooks/use-call-history";

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
  myOutbound:    { label: "My Outbound",    icon: PhoneForwarded, color: "text-cyan",        glow: "rgba(0,212,255,0.12)",  teamKey: "teamOutbound" },
  myInbound:     { label: "My Inbound",     icon: PhoneIncoming,  color: "text-purple-400",  glow: "rgba(168,85,247,0.12)", teamKey: "teamInbound" },
  myLiveAnswers: { label: "My Live Answers", icon: Phone,         color: "text-emerald-400", glow: "rgba(16,185,129,0.12)", teamKey: "myLiveAnswers" },
  myAvgTalkTime: { label: "Avg Talk Time",  icon: Timer,          color: "text-orange-400",  glow: "rgba(251,146,60,0.12)", teamKey: "myAvgTalkTime", format: (s) => s > 0 ? `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}` : "0:00" },
  teamOutbound:  { label: "Team Outbound",  icon: Users,          color: "text-blue-400",    glow: "rgba(59,130,246,0.12)", teamKey: "teamOutbound" },
  teamInbound:   { label: "Team Inbound",   icon: Users,          color: "text-pink-400",    glow: "rgba(236,72,153,0.12)", teamKey: "teamInbound" },
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
        transition-all duration-100 cursor-pointer hover:border-cyan/24 hover:bg-cyan/[0.04]
        hover:shadow-[0_0_1px_rgba(0,229,255,0.6),0_0_4px_rgba(0,229,255,0.25),0_0_10px_rgba(0,229,255,0.1),0_18px_52px_rgba(0,0,0,0.5)] active:scale-[0.97] group relative overflow-hidden w-full holo-border wet-shine"
    >
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/[0.06] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div
        className="h-7 w-7 rounded-[8px] flex items-center justify-center mx-auto mb-1"
        style={{ background: meta.glow, boxShadow: `0 0 10px ${meta.glow}` }}
      >
        <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
      </div>
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin mx-auto" />
      ) : (
        <p className={`text-lg font-bold tracking-tight text-glow-number ${meta.color}`} style={{ textShadow: `0 0 8px ${meta.glow}` }}>{display}</p>
      )}
      <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wider">{meta.label}</p>
      <p className="text-[9px] text-muted-foreground/50 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-widest">Click for details</p>
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
            modal-glass holo-border wet-shine flex flex-col overflow-hidden"
        >
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-cyan/40 to-transparent" />

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-[10px] flex items-center justify-center" style={{ background: meta.glow }}>
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
                className={`px-3 py-1 rounded-[8px] text-[11px] font-medium transition-all ${
                  period === p.key
                    ? "text-cyan bg-cyan/8 border border-cyan/20"
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
                <Loader2 className="h-5 w-5 animate-spin text-cyan/50" />
              </div>
            ) : (
              <>
                {/* Big comparison */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-[12px] border border-cyan/15 bg-cyan/[0.04] p-4 text-center">
                    <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest mb-1">You</p>
                    <p className="text-3xl font-bold text-cyan" style={{ textShadow: "0 0 14px rgba(0,212,255,0.3)" }}>
                      {fmt(myVal)}
                    </p>
                  </div>
                  <div className="rounded-[12px] border border-purple-500/15 bg-purple-500/[0.04] p-4 text-center">
                    <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest mb-1">Team Total</p>
                    <p className="text-3xl font-bold text-purple-400" style={{ textShadow: "0 0 14px rgba(168,85,247,0.3)" }}>
                      {fmt(teamVal)}
                    </p>
                  </div>
                </div>

                {/* Ratio bar */}
                {teamVal > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground/60">
                      <span>Your share</span>
                      <span>{teamVal > 0 ? Math.round((myVal / teamVal) * 100) : 0}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/[0.04] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan to-purple-400 transition-all duration-500"
                        style={{ width: `${teamVal > 0 ? Math.min((myVal / teamVal) * 100, 100) : 0}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Extra stats */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Outbound", val: data?.my.myOutbound ?? 0, color: "text-cyan" },
                    { label: "Live Answers", val: data?.my.myLiveAnswers ?? 0, color: "text-emerald-400" },
                    { label: "Avg Talk", val: data?.my.myAvgTalkTime ?? 0, color: "text-orange-400", fmt: (v: number) => `${Math.floor(v / 60)}:${(v % 60).toString().padStart(2, "0")}` },
                  ].map((s) => (
                    <div key={s.label} className="rounded-[10px] border border-white/[0.06] bg-white/[0.02] p-2.5 text-center">
                      <p className="text-[10px] text-muted-foreground/55 uppercase tracking-widest">{s.label}</p>
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
  { key: "voicemail",   label: "Voicemail",    hotkey: "1", icon: Voicemail,      color: "text-blue-400",   bgColor: "bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/20" },
  { key: "no_answer",   label: "No Answer",    hotkey: "2", icon: PhoneOff,       color: "text-zinc-400",   bgColor: "bg-zinc-500/10 hover:bg-zinc-500/20 border-zinc-500/20" },
  { key: "interested",  label: "Interested",   hotkey: "3", icon: Sparkles,       color: "text-cyan",       bgColor: "bg-cyan/8 hover:bg-cyan/15 border-cyan/15" },
  { key: "appointment", label: "Appointment",  hotkey: "4", icon: CalendarCheck,  color: "text-emerald-400",bgColor: "bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20" },
  { key: "contract",    label: "Contract",     hotkey: "5", icon: FileSignature,  color: "text-orange-400", bgColor: "bg-orange-500/10 hover:bg-orange-500/20 border-orange-500/20" },
  { key: "dead",        label: "Dead",         hotkey: "6", icon: Skull,          color: "text-red-400",    bgColor: "bg-red-500/10 hover:bg-red-500/20 border-red-500/20" },
  { key: "nurture",     label: "Nurture",      hotkey: "7", icon: Heart,          color: "text-pink-400",   bgColor: "bg-pink-500/10 hover:bg-pink-500/20 border-pink-500/20" },
  { key: "skip_trace",  label: "Skip Trace",   hotkey: "8", icon: Search,         color: "text-cyan-400",   bgColor: "bg-cyan-500/10 hover:bg-cyan-500/20 border-cyan-500/20" },
  { key: "ghost",       label: "Ghost Research", hotkey: "9", icon: Ghost,        color: "text-yellow-400", bgColor: "bg-yellow-500/10 hover:bg-yellow-500/20 border-yellow-500/20" },
];

type CallState = "idle" | "dialing" | "connected" | "ended";

function formatCurrency(n: number): string {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n}`;
}

function getScoreLabel(score: number): { label: string; variant: "platinum" | "gold" | "silver" | "bronze" } {
  if (score >= 85) return { label: "PLATINUM", variant: "platinum" };
  if (score >= 70) return { label: "GOLD", variant: "gold" };
  if (score >= 50) return { label: "SILVER", variant: "silver" };
  return { label: "BRONZE", variant: "bronze" };
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

export default function DialerPage() {
  const { currentUser, ghostMode } = useSentinelStore();
  const { queue, loading: queueLoading, refetch: refetchQueue } = useDialerQueue(7);
  const { stats, loading: statsLoading } = useDialerStats();
  const timer = useCallTimer();

  const [callState, setCallState] = useState<CallState>("idle");
  const [currentLead, setCurrentLead] = useState<QueueLead | null>(null);
  const [currentCallLogId, setCurrentCallLogId] = useState<string | null>(null);
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
  const [historyOpen, setHistoryOpen] = useState(false);

  // Quick Manual Dial state
  const [manualPhone, setManualPhone] = useState("");
  const [manualDialing, setManualDialing] = useState(false);
  const [manualCallLogId, setManualCallLogId] = useState<string | null>(null);
  const [manualStatus, setManualStatus] = useState<"idle" | "dialing" | "connected" | "ended">("idle");
  const [smsComposeOpen, setSmsComposeOpen] = useState(false);
  const [smsComposeMsg, setSmsComposeMsg] = useState("");
  const [smsComposeSending, setSmsComposeSending] = useState(false);

  // Twilio VoIP Device
  const [deviceStatus, setDeviceStatus] = useState<"initializing" | "ready" | "error" | "offline">("initializing");
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [voipCallerId, setVoipCallerId] = useState<string>("");
  const deviceRef = useRef<Device | null>(null);

  // Twilio diagnostics + real-time call status
  const [currentCallSid, setCurrentCallSid] = useState<string | null>(null);
  const [liveCallStatus, setLiveCallStatus] = useState<string | null>(null);
  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [diagOpen, setDiagOpen] = useState(false);
  const [diagResults, setDiagResults] = useState<{ name: string; status: string; message: string; detail?: string }[] | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  useEffect(() => {
    if (!currentLead && queue.length > 0) {
      setCurrentLead(queue[0]);
    }
  }, [queue, currentLead]);

  // Auto-dial after consent granted
  useEffect(() => {
    if (consentGranted && currentLead) {
      setConsentGranted(false);
      handleDial(currentLead);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consentGranted]);

  // ── Twilio VoIP Device Initialization ────────────────────────────
  useEffect(() => {
    if (!currentUser.id) return;

    let cancelled = false;

    const initDevice = async () => {
      try {
        const hdrs = await authHeaders();
        const res = await fetch("/api/twilio/token", { headers: hdrs });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Token fetch failed" }));
          console.warn("[VoIP] Token error:", err.error);
          setDeviceStatus("error");
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
            toast.error(`VoIP error: ${err.message ?? "unknown"}`);
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
    };

    initDevice();

    return () => {
      cancelled = true;
      if (deviceRef.current) {
        deviceRef.current.destroy();
        deviceRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("leads") as any)
      .update({ call_consent: true, call_consent_at: new Date().toISOString() })
      .eq("id", currentLead.id);
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
      toast.error("VoIP not ready — check Twilio diagnostics");
      return;
    }

    setCurrentLead(target);
    setCallState("dialing");
    setCallNotes("");
    timer.start();

    try {
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
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Call failed");
        setCallState("idle");
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
        },
      });

      setActiveCall(call);
      setTransferStatus("Connecting via VoIP…");
      setCallState("connected");

      call.on("ringing", () => {
        setLiveCallStatus("ringing");
        setTransferStatus("Ringing prospect…");
      });

      call.on("accept", () => {
        setLiveCallStatus("in-progress");
        setTransferStatus("Connected via VoIP — Dominion Homes");
        toast.success("Call connected via VoIP");
      });

      call.on("disconnect", () => {
        setLiveCallStatus("completed");
        setActiveCall(null);
        // Don't auto-reset — let user disposition
      });

      call.on("error", (err: { message?: string }) => {
        toast.error(`Call error: ${err.message ?? "unknown"}`);
        setLiveCallStatus("failed");
        setActiveCall(null);
      });

      call.on("cancel", () => {
        setLiveCallStatus("canceled");
        setActiveCall(null);
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

  // ── Quick Manual Dial handler ──────────────────────────────────────
  const handleManualDial = useCallback(async () => {
    if (manualPhone.length < 10) {
      toast.error("Enter a valid 10-digit phone number");
      return;
    }

    if (!deviceRef.current || deviceStatus !== "ready") {
      toast.error("VoIP not ready — check Twilio diagnostics");
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
      });

      call.on("accept", () => {
        toast.success(`Connected to ${formatUsPhone(manualPhone)} via VoIP`);
      });

      call.on("disconnect", () => {
        setActiveCall(null);
        setManualStatus("ended");
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
    // Disconnect VoIP call
    if (activeCall) {
      activeCall.disconnect();
      setActiveCall(null);
    }
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
  }, [manualCallLogId, currentUser.id, activeCall]);

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
    setLiveCallStatus(null);
    setCallNotes("");
    setTransferStatus(null);
    timer.reset();
    setDispositionPending(false);

    const currentIdx = queue.findIndex((l) => l.id === currentLead?.id);
    const nextLead = queue[currentIdx + 1] ?? queue[0] ?? null;
    setCurrentLead(nextLead);
    refetchQueue();
  }, [currentCallLogId, callState, callNotes, currentLead, currentUser.id, handleHangup, queue, refetchQueue, timer]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;

      const dispo = DISPOSITIONS.find((d) => d.hotkey === e.key);
      if (dispo && (callState === "connected" || callState === "ended")) {
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
  }, [callState, currentLead, handleDial, handleDisposition, handleHangup]);

  const [activeKpi, setActiveKpi] = useState<KpiKey | null>(null);

  const kpiKeys: KpiKey[] = ["myOutbound", "myInbound", "myLiveAnswers", "myAvgTalkTime", "teamOutbound", "teamInbound"];

  return (
    <PageShell
      title="Power Dialer"
      description="AI-prioritized, compliance-gated, Twilio-powered calling"
      actions={
        <div className="flex items-center gap-2">
          {ghostMode && (
            <Badge variant="outline" className="text-[10px] gap-1 border-yellow-500/20 text-yellow-400">
              <Ghost className="h-2.5 w-2.5" /> Ghost Mode
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setDiagOpen(!diagOpen); if (!diagResults) runDiagnostics(); }}
            className="gap-1.5 text-[10px] h-7 px-2 text-muted-foreground hover:text-cyan"
          >
            {diagLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wifi className="h-3 w-3" />}
            Test Twilio
          </Button>
          <Badge variant={deviceStatus === "ready" ? "cyan" : "outline"} className={`text-[10px] gap-1 ${deviceStatus === "error" ? "border-red-500/30 text-red-400" : ""}`}>
            {deviceStatus === "ready" ? <Zap className="h-2.5 w-2.5" /> : deviceStatus === "error" ? <WifiOff className="h-2.5 w-2.5" /> : <Loader2 className="h-2.5 w-2.5 animate-spin" />}
            {callState === "connected"
              ? liveCallStatus === "ringing" ? "RINGING PROSPECT…"
                : liveCallStatus === "in-progress" ? "LIVE — VoIP"
                : liveCallStatus === "failed" ? "CALL FAILED"
                : "LIVE — VoIP"
              : deviceStatus === "ready" ? "VoIP Ready"
              : deviceStatus === "error" ? "VoIP Error"
              : deviceStatus === "initializing" ? "Connecting…"
              : "VoIP Offline"}
          </Badge>
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
                  <Wifi className="h-4 w-4 text-cyan" />
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
                    className="gap-1 text-[10px] h-6 px-2"
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
                        ? "border-emerald-500/20 bg-emerald-500/[0.04]"
                        : check.status === "warn"
                        ? "border-yellow-500/20 bg-yellow-500/[0.04]"
                        : "border-red-500/20 bg-red-500/[0.04]"
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className={`font-mono text-[10px] font-bold uppercase ${
                          check.status === "pass" ? "text-emerald-400" : check.status === "warn" ? "text-yellow-400" : "text-red-400"
                        }`}>
                          {check.status === "pass" ? "PASS" : check.status === "warn" ? "WARN" : "FAIL"}
                        </span>
                        <span className="font-semibold text-foreground/80">{check.name}</span>
                      </div>
                      <p className="mt-0.5 text-muted-foreground/70">{check.message}</p>
                      {check.detail && (
                        <p className="mt-1 text-[10px] text-muted-foreground/50 leading-relaxed">{check.detail}</p>
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
                ? "border-red-500/30 bg-red-500/8 text-red-300"
                : liveCallStatus === "ringing" || liveCallStatus === "ringing_agent" || liveCallStatus === "initiated"
                ? "border-cyan/30 bg-cyan/8 text-cyan"
                : "border-yellow-500/30 bg-yellow-500/8 text-yellow-300"
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
                className="ml-auto gap-1 text-[10px] h-6 px-2 text-red-300 hover:text-red-200"
              >
                <AlertTriangle className="h-3 w-3" />
                Diagnose
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Quick Manual Dial ─────────────────────────────────────────── */}
      <GlassCard hover={false} glow className="!p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-7 w-7 rounded-[8px] flex items-center justify-center bg-cyan/12" style={{ boxShadow: "0 0 12px rgba(0,212,255,0.15)" }}>
            <Phone className="h-3.5 w-3.5 text-cyan" />
          </div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Quick Manual Dial
          </h2>
          <Badge variant="cyan" className="text-[9px] ml-auto">Dominion Homes Caller ID</Badge>
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
              className="text-lg font-mono tracking-wide bg-white/[0.03] border-white/[0.06] focus:border-cyan/30 focus:ring-cyan/10 h-12 pr-24"
              onKeyDown={(e) => {
                if (e.key === "Enter" && manualStatus === "idle") {
                  e.preventDefault();
                  handleManualDial();
                }
              }}
            />
            {manualStatus !== "idle" && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-[10px]">
                <span className={`h-2 w-2 rounded-full animate-pulse ${manualStatus === "dialing" ? "bg-yellow-400" : manualStatus === "connected" ? "bg-cyan" : "bg-red-400"}`} />
                <span className={manualStatus === "dialing" ? "text-yellow-400" : manualStatus === "connected" ? "text-cyan" : "text-red-400"}>
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
                className="gap-2 h-12 px-6 bg-cyan/15 hover:bg-cyan/25 text-cyan border border-cyan/25 text-sm font-semibold"
                style={{ boxShadow: "0 0 20px rgba(0,212,255,0.1)" }}
              >
                {manualDialing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
                Dial Now
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
                className="gap-2 h-12 px-6 border-purple/25 text-purple hover:bg-purple/10 text-sm font-semibold"
                style={{ boxShadow: "0 0 20px rgba(168,85,247,0.08)" }}
              >
                <MessageSquare className="h-4 w-4" />
                Send Text
              </Button>
            </>
          ) : (
            <Button
              onClick={handleManualHangup}
              variant="destructive"
              className="gap-2 h-12 px-6 text-sm font-semibold"
            >
              <PhoneOff className="h-4 w-4" />
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
              <div className="mt-3 rounded-[12px] bg-white/[0.03] border border-purple/15 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wider">
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
                  <span className="text-[10px] text-muted-foreground/50">{smsComposeMsg.length}/500</span>
                  <Button
                    onClick={handleManualSms}
                    disabled={smsComposeSending || !smsComposeMsg.trim()}
                    size="sm"
                    className="gap-1.5 bg-purple/15 hover:bg-purple/25 text-purple border border-purple/25"
                  >
                    {smsComposeSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Send
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {kpiKeys.map((k) => (
          <KpiCard key={k} kpiKey={k} value={stats[k]} loading={statsLoading} onClick={() => setActiveKpi(k)} />
        ))}
      </div>

      {activeKpi && (
        <StatDetailModal kpiKey={activeKpi} userId={currentUser.id} onClose={() => setActiveKpi(null)} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mt-4">
        <div className="lg:col-span-3">
          <GlassCard hover={false} className="!p-3">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-cyan" />
                Dial Queue
                <CallSequenceGuide />
              </h2>
              <button
                onClick={refetchQueue}
                className="text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors"
              >
                Refresh
              </button>
            </div>

            {queueLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-14 rounded-[12px] bg-secondary/20 animate-pulse" />
                ))}
              </div>
            ) : queue.length === 0 ? (
              <div className="text-center py-6 space-y-3">
                <Phone className="h-6 w-6 mx-auto text-muted-foreground/20" />
                <p className="text-xs text-muted-foreground/50">No leads ready — go to Prospects and claim some</p>
                <a href="/sales-funnel/prospects">
                  <button className="px-5 py-2 rounded-[10px] text-xs font-bold text-cyan bg-cyan/[0.10] border border-cyan/25
                    hover:bg-cyan/[0.18] hover:border-cyan/35 shadow-[0_0_14px_rgba(0,212,255,0.08)]
                    hover:shadow-[0_0_22px_rgba(0,212,255,0.16)] transition-all">
                    Go to Prospects — Claim Leads
                  </button>
                </a>
                <p className="text-[11px] text-muted-foreground/60">Claimed leads appear here automatically</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {queue.map((lead, idx) => {
                  const isActive = currentLead?.id === lead.id;
                  const score = lead.priority ?? 0;
                  const sl = getScoreLabel(score);

                  return (
                    <button
                      key={lead.id}
                      onClick={() => setCurrentLead(lead)}
                      className={`w-full text-left rounded-[12px] p-2.5 transition-all duration-200 border ${
                        isActive
                          ? "bg-cyan/5 border-cyan/20 shadow-[0_0_12px_rgba(0,212,255,0.1)]"
                          : "bg-secondary/10 border-transparent hover:bg-secondary/20"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground/55 font-mono w-3">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate flex items-center gap-1">
                            {lead.properties?.owner_name ?? "Unknown"}
                            <RelationshipBadgeCompact data={{ tags: lead.tags }} />
                          </p>
                          <p className="text-xs text-muted-foreground/80 truncate">{lead.properties?.address ?? "No address"}</p>
                        </div>
                        <span className="text-[9px] text-muted-foreground/60 font-mono shrink-0">{lead.call_sequence_step ?? 1}/7</span>
                        <Badge variant={sl.variant} className="text-[9px] px-1.5 py-0 shrink-0">
                          {score}
                        </Badge>
                        {!lead.compliant && !ghostMode && (
                          <span className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)] shrink-0" title="Compliance blocked" />
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
                className="mb-3 rounded-[12px] border border-yellow-500/20 bg-yellow-500/5 p-4"
              >
                <div className="flex items-start gap-3">
                  <Shield className="h-5 w-5 text-yellow-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-yellow-400">Agent Consent Acknowledgment</p>
                    <p className="text-[11px] text-muted-foreground/70 mt-1 leading-relaxed">
                      This call may be recorded for quality, training, and AI note summarization purposes
                      as permitted under Washington law (RCW 9.73.030). Do you consent to continue?
                    </p>
                    <div className="flex items-center gap-2 mt-3">
                      <Button
                        size="sm"
                        onClick={grantConsent}
                        className="text-[11px] h-7 px-4 gap-1.5 bg-cyan/15 hover:bg-cyan/25 text-cyan border border-cyan/20"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        Confirm & Dial
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConsentPending(false)}
                        className="text-[11px] h-7 px-3"
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
                      callState === "dialing" ? "bg-yellow-500/10 text-yellow-400" :
                      callState === "connected" ? "bg-cyan/8 text-cyan" :
                      "bg-red-500/10 text-red-400"
                    }`}>
                      <span className={`h-2 w-2 rounded-full ${
                        callState === "dialing" ? "bg-yellow-400 animate-pulse" :
                        callState === "connected" ? "bg-cyan animate-pulse" :
                        "bg-red-400"
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
                        <Badge variant="outline" className="text-[9px] gap-1 border-cyan/20 text-cyan/70">
                          <Phone className="h-2.5 w-2.5" />
                          {getSequenceLabel(currentLead.call_sequence_step ?? 1)}
                        </Badge>
                        {!currentLead.compliant && !ghostMode && (
                          <Badge variant="destructive" className="text-[10px]">
                            COMPLIANCE BLOCKED
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: "Phone", value: currentLead.properties?.owner_phone ?? "—", mono: true },
                        { label: "ARV", value: currentLead.properties?.estimated_value ? `$${currentLead.properties.estimated_value.toLocaleString()}` : "—" },
                        { label: "Equity", value: currentLead.properties?.equity_percent != null ? `${currentLead.properties.equity_percent}%` : "—" },
                      ].map((item) => (
                        <div key={item.label} className="rounded-[10px] bg-white/[0.03] border border-white/[0.04] p-2.5">
                          <p className="text-[11px] text-muted-foreground/60 uppercase">{item.label}</p>
                          <p className={`text-sm font-medium ${item.mono ? "font-mono" : ""}`}>{item.value}</p>
                        </div>
                      ))}
                      <div className="rounded-[10px] bg-white/[0.03] border border-white/[0.04] p-2.5">
                        <p className="text-[11px] text-muted-foreground/60 uppercase">Distress</p>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {(currentLead.tags ?? []).slice(0, 3).map((t) => (
                            <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-[6px] bg-red-500/[0.08] text-red-400 border border-red-500/15">
                              {t}
                            </span>
                          ))}
                          {(!currentLead.tags || currentLead.tags.length === 0) && (
                            <span className="text-[10px] text-muted-foreground/55">—</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[10px] bg-white/[0.03] border border-white/[0.04] p-2.5">
                        <p className="text-[11px] text-muted-foreground/60 uppercase mb-1">Source & Notes</p>
                      <p className="text-xs text-muted-foreground/60">
                        {currentLead.source ?? "unknown"} — {currentLead.notes ?? "No notes"}
                      </p>
                    </div>

                    {/* Pre-Call Intelligence Brief */}
                    <AnimatePresence>
                      {callState === "idle" && (preCallBrief || briefLoading) && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="rounded-[10px] bg-purple-500/[0.06] border border-purple-500/20 p-2.5 overflow-hidden"
                        >
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <Sparkles className="h-3 w-3 text-purple-400" />
                            <span className="text-[11px] font-semibold tracking-wider uppercase text-purple-400">Pre-Call Brief</span>
                            {briefLoading && <Loader2 className="h-3 w-3 animate-spin text-purple-400/60 ml-auto" />}
                          </div>
                          {preCallBrief && (
                            <>
                              <ul className="space-y-1 mb-2">
                                {preCallBrief.bullets.map((b, i) => (
                                  <li key={i} className="text-xs text-foreground/80 flex items-start gap-1.5">
                                    <span className="text-purple-400 mt-0.5">•</span>
                                    {b}
                                  </li>
                                ))}
                              </ul>
                              {preCallBrief.suggestedOpener && (
                                <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-2 mt-1">
                                  <p className="text-[10px] text-muted-foreground/60 uppercase mb-0.5">Suggested Opener</p>
                                  <p className="text-xs text-foreground/70 italic">&ldquo;{preCallBrief.suggestedOpener}&rdquo;</p>
                                </div>
                              )}
                            </>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="flex items-center gap-2 pt-2">
                      {callState === "idle" && (
                        <>
                          <Button
                            onClick={() => handleDial()}
                            disabled={!currentLead.compliant && !ghostMode}
                            className="flex-1 gap-2 bg-cyan/15 hover:bg-cyan/25 text-cyan border border-cyan/25"
                          >
                            <Phone className="h-4 w-4" />
                            Dial {currentLead.properties?.owner_phone ? "" : "(No Phone)"}
                            <span className="text-[10px] opacity-50 ml-1">Enter</span>
                          </Button>
                          <Button
                            onClick={handleSendText}
                            disabled={(!currentLead.compliant && !ghostMode) || smsLoading || !currentLead.properties?.owner_phone}
                            variant="outline"
                            className="gap-2 border-purple/25 text-purple hover:bg-purple/10"
                          >
                            {smsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
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
                            className="flex-1 gap-2"
                            onClick={handleHangup}
                          >
                            <PhoneOff className="h-4 w-4" />
                            Hang Up
                            <span className="text-[10px] opacity-50 ml-1">Esc</span>
                          </Button>
                        </>
                      )}
                      {callState === "ended" && (
                        <div className="flex-1 text-center text-sm text-muted-foreground/60 py-2">
                          Call ended — {timer.formatted} — select disposition below
                        </div>
                      )}
                    </div>

                    {callState === "idle" && currentUser.personal_cell && (
                      <p className="text-[11px] text-muted-foreground/55 flex items-center gap-1.5 pt-1">
                        <PhoneForwarded className="h-3 w-3 text-cyan/40" />
                        Will transfer to your cell (***{currentUser.personal_cell.slice(-4)}) — Caller ID: Dominion Homes
                      </p>
                    )}
                    {callState === "idle" && !currentUser.personal_cell && (
                      <p className="text-[10px] text-yellow-400/60 flex items-center gap-1.5 pt-1">
                        <PhoneForwarded className="h-3 w-3" />
                        No personal cell set — <a href="/settings" className="underline hover:text-yellow-400">configure in Settings</a>
                      </p>
                    )}
                  </div>
                </GlassCard>

                <GlassCard hover={false} className="!p-3 mt-3">
                  <textarea
                    value={callNotes}
                    onChange={(e) => setCallNotes(e.target.value)}
                    placeholder="Call notes... (saved with disposition)"
                    className="w-full bg-transparent text-sm resize-none h-16 outline-none placeholder:text-muted-foreground/30"
                  />
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
                <Sparkles className="h-3 w-3 text-purple-400" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-purple-400/80">AI Call Summary</span>
                {latestSummaryTime && (
                  <span className="text-[9px] text-muted-foreground/40 ml-auto">
                    {new Date(latestSummaryTime).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground/80 leading-relaxed whitespace-pre-line max-h-28 overflow-y-auto scrollbar-thin">
                {latestSummary}
              </div>
            </GlassCard>
          )}

          <GlassCard hover={false} className="!p-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5 text-cyan" />
              Disposition
              <span className="text-[10px] opacity-40 ml-auto">Keyboard shortcuts active</span>
            </h2>

            <div className="grid grid-cols-1 gap-1.5">
              {DISPOSITIONS.map((d) => {
                const Icon = d.icon;
                const disabled = callState === "idle" || dispositionPending;

                return (
                  <button
                    key={d.key}
                    onClick={() => handleDisposition(d.key)}
                    disabled={disabled}
                    className={`flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-left transition-all duration-150 border
                      ${disabled ? "opacity-30 cursor-not-allowed" : d.bgColor}
                    `}
                  >
                    <span className="text-[10px] font-mono text-muted-foreground/55 w-3">{d.hotkey}</span>
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

          <AnimatePresence>
            {callState !== "idle" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
              >
                <GlassCard glow hover={false} className="!p-4 mt-3 text-center">
                  <Clock className="h-5 w-5 mx-auto mb-1 text-cyan" />
                  <p className="text-3xl font-bold font-mono tracking-wider text-neon text-glow-number">
                    {timer.formatted}
                  </p>
                  <p className="text-[11px] text-muted-foreground/60 mt-1 uppercase">
                    {callState === "dialing" ? "Ringing..." :
                     callState === "connected" ? "Live Call" :
                     "Call Ended"}
                  </p>
                </GlassCard>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Call History (collapsible) ─────────────────────────────── */}
      <GlassCard hover={false} className="!p-4 mt-4">
        <button
          onClick={() => setHistoryOpen((v) => !v)}
          className="w-full flex items-center justify-between cursor-pointer group"
        >
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <History className="h-3.5 w-3.5 text-cyan" />
            Call History
            <span className="text-[10px] font-normal text-muted-foreground/50 ml-1">
              {callHistory.length} recent
            </span>
          </h2>
          <div className="flex items-center gap-2">
            {historyOpen && (
              <div className="flex items-center gap-1">
                {(["all", "outbound", "inbound"] as const).map((f) => (
                  <span
                    key={f}
                    role="button"
                    onClick={(e) => { e.stopPropagation(); setHistoryFilter(f); }}
                    className={`px-2.5 py-1 rounded-[8px] text-[10px] font-medium transition-all ${
                      historyFilter === f
                        ? "text-cyan bg-cyan/8 border border-cyan/20"
                        : "text-muted-foreground/60 hover:text-foreground border border-transparent"
                    }`}
                  >
                    {f === "all" ? "All" : f === "outbound" ? "Outbound" : "Inbound"}
                  </span>
                ))}
              </div>
            )}
            {historyOpen ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-cyan transition-colors" />
            ) : (
              <ChevronUp className="h-4 w-4 text-muted-foreground group-hover:text-cyan transition-colors" />
            )}
          </div>
        </button>

        <AnimatePresence>
          {historyOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="pt-3">
                {historyLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-cyan/50" />
                  </div>
                ) : callHistory.length === 0 ? (
                  <div className="text-center py-6">
                    <History className="h-6 w-6 mx-auto text-muted-foreground/20 mb-2" />
                    <p className="text-xs text-muted-foreground/50">No calls yet — start dialing!</p>
                  </div>
                ) : (
                  <div className="max-h-[340px] overflow-y-auto scrollbar-thin space-y-1">
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
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>
    </PageShell>
  );
}

/* ── Call History Row ───────────────────────────────────────────── */

const DISPO_STYLES: Record<string, { color: string; bg: string }> = {
  voicemail:     { color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/15" },
  no_answer:     { color: "text-zinc-400",    bg: "bg-zinc-500/10 border-zinc-500/15" },
  interested:    { color: "text-cyan",        bg: "bg-cyan/8 border-cyan/15" },
  appointment:   { color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/15" },
  contract:      { color: "text-orange-400",  bg: "bg-orange-500/10 border-orange-500/15" },
  dead:          { color: "text-red-400",     bg: "bg-red-500/10 border-red-500/15" },
  nurture:       { color: "text-pink-400",    bg: "bg-pink-500/10 border-pink-500/15" },
  skip_trace:    { color: "text-cyan-400",    bg: "bg-cyan-500/10 border-cyan-500/15" },
  ghost:         { color: "text-yellow-400",  bg: "bg-yellow-500/10 border-yellow-500/15" },
  sms_outbound:  { color: "text-purple-400",  bg: "bg-purple-500/10 border-purple-500/15" },
  manual_hangup: { color: "text-zinc-400",    bg: "bg-zinc-500/10 border-zinc-500/15" },
  initiating:    { color: "text-yellow-400",  bg: "bg-yellow-500/10 border-yellow-500/15" },
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

  return (
    <div className="flex items-center gap-3 rounded-[12px] px-3 py-2.5 transition-all border border-transparent hover:border-white/[0.06] hover:bg-white/[0.02] group">
      {/* Direction icon */}
      <div className={`h-7 w-7 rounded-[8px] flex items-center justify-center shrink-0 ${
        isInbound ? "bg-purple-500/12" : isSms ? "bg-purple-500/12" : "bg-cyan/8"
      }`}>
        {isSms ? (
          <MessageSquare className="h-3.5 w-3.5 text-purple-400" />
        ) : isInbound ? (
          <ArrowDownLeft className="h-3.5 w-3.5 text-purple-400" />
        ) : (
          <ArrowUpRight className="h-3.5 w-3.5 text-cyan" />
        )}
      </div>

      {/* Contact + phone */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">
            {entry.owner_name ?? formatUsPhone(phoneDigits)}
          </p>
          {entry.owner_name && (
            <span className="text-[10px] text-muted-foreground/55 font-mono">
              {formatUsPhone(phoneDigits)}
            </span>
          )}
        </div>
        {entry.address && (
          <p className="text-[11px] text-muted-foreground/50 truncate">{entry.address}</p>
        )}
      </div>

      {/* Disposition badge */}
      <span className={`text-[9px] px-2 py-0.5 rounded-[6px] border font-medium uppercase tracking-wider shrink-0 ${style.color} ${style.bg}`}>
        {entry.disposition.replace(/_/g, " ")}
      </span>

      {/* Duration */}
      <span className="text-[11px] text-muted-foreground/50 font-mono w-10 text-right shrink-0">
        {formatDuration(entry.duration_sec)}
      </span>

      {/* Time ago */}
      <span className="text-[10px] text-muted-foreground/40 w-14 text-right shrink-0">
        {timeAgo(entry.started_at)}
      </span>

      {/* Callback button */}
      <button
        onClick={() => onDial(entry.phone_dialed)}
        className="h-7 w-7 rounded-[8px] flex items-center justify-center shrink-0
          opacity-0 group-hover:opacity-100 transition-all
          bg-cyan/10 hover:bg-cyan/20 border border-cyan/20 text-cyan"
        title={`Call back ${formatUsPhone(phoneDigits)}`}
      >
        <Phone className="h-3 w-3" />
      </button>
    </div>
  );
}
