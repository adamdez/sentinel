"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone, PhoneOff, PhoneForwarded, PhoneIncoming, Clock, Users, BarChart3,
  Mic, MicOff, Voicemail, CalendarCheck, FileSignature,
  Skull, Heart, Search, Ghost, Zap, ChevronRight, Timer,
  Sparkles, DollarSign, Loader2, SkipForward, MessageSquare,
  X, Send,
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
      className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-3 text-center
        transition-all duration-200 cursor-pointer hover:border-cyan/20 hover:bg-cyan/[0.03]
        hover:shadow-[0_0_20px_rgba(0,212,255,0.08)] active:scale-[0.97] group relative overflow-hidden w-full"
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
        <p className={`text-lg font-bold tracking-tight ${meta.color}`} style={{ textShadow: `0 0 8px ${meta.glow}` }}>{display}</p>
      )}
      <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">{meta.label}</p>
      <p className="text-[8px] text-muted-foreground/30 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-widest">Click for details</p>
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
        className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-md flex items-center justify-center"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 24 }}
          transition={{ type: "spring", damping: 26, stiffness: 320 }}
          onClick={(e) => e.stopPropagation()}
          className="relative max-w-md w-full mx-4 rounded-[16px] border border-white/[0.08]
            bg-[rgba(8,8,18,0.92)] backdrop-blur-2xl shadow-[0_0_60px_rgba(0,212,255,0.08),0_0_120px_rgba(139,92,246,0.04)]
            flex flex-col overflow-hidden"
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
                    <p className="text-[9px] text-muted-foreground/50 uppercase tracking-widest mb-1">You</p>
                    <p className="text-3xl font-bold text-cyan" style={{ textShadow: "0 0 14px rgba(0,212,255,0.3)" }}>
                      {fmt(myVal)}
                    </p>
                  </div>
                  <div className="rounded-[12px] border border-purple-500/15 bg-purple-500/[0.04] p-4 text-center">
                    <p className="text-[9px] text-muted-foreground/50 uppercase tracking-widest mb-1">Team Total</p>
                    <p className="text-3xl font-bold text-purple-400" style={{ textShadow: "0 0 14px rgba(168,85,247,0.3)" }}>
                      {fmt(teamVal)}
                    </p>
                  </div>
                </div>

                {/* Ratio bar */}
                {teamVal > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground/50">
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
                      <p className="text-[9px] text-muted-foreground/40 uppercase tracking-widest">{s.label}</p>
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

function getScoreLabel(score: number): { label: string; variant: "fire" | "hot" | "warm" | "cold" } {
  if (score >= 85) return { label: "FIRE", variant: "fire" };
  if (score >= 70) return { label: "HOT", variant: "hot" };
  if (score >= 50) return { label: "WARM", variant: "warm" };
  return { label: "COLD", variant: "cold" };
}

function formatUsPhone(digits: string): string {
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

function toE164(digits: string): string {
  return `+1${digits.slice(0, 10)}`;
}

export default function DialerPage() {
  const { currentUser, ghostMode } = useSentinelStore();
  const { queue, loading: queueLoading, refetch: refetchQueue } = useDialerQueue(8);
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

  // Quick Manual Dial state
  const [manualPhone, setManualPhone] = useState("");
  const [manualDialing, setManualDialing] = useState(false);
  const [manualCallLogId, setManualCallLogId] = useState<string | null>(null);
  const [manualStatus, setManualStatus] = useState<"idle" | "dialing" | "connected" | "ended">("idle");
  const [smsComposeOpen, setSmsComposeOpen] = useState(false);
  const [smsComposeMsg, setSmsComposeMsg] = useState("");
  const [smsComposeSending, setSmsComposeSending] = useState(false);

  useEffect(() => {
    if (!currentLead && queue.length > 0) {
      setCurrentLead(queue[0]);
    }
  }, [queue, currentLead]);

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

    setCurrentLead(target);
    setCallState("dialing");
    setCallNotes("");
    timer.start();

    try {
      const res = await fetch("/api/dialer/call", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({
          phone,
          leadId: target.id,
          propertyId: target.property_id,
          userId: currentUser.id,
          ghostMode,
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
      const cellDisplay = data.transferTo
        ? `***${(data.transferTo as string).slice(-4)}`
        : currentUser.personal_cell
          ? `***${currentUser.personal_cell.slice(-4)}`
          : null;
      setTransferStatus(
        cellDisplay
          ? `Warm transfer to ${currentUser.name || "Agent"}'s cell (${cellDisplay})`
          : `Connected — no personal cell configured`
      );
      setCallState("connected");
      toast.success("Connected — Caller ID: Dominion Homes");
    } catch (err) {
      console.error("[Dialer]", err);
      toast.error("Network error — call not placed");
      setCallState("idle");
      timer.reset();
    }
  }, [currentLead, currentUser.id, currentUser.name, currentUser.personal_cell, ghostMode, timer]);

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

    setManualDialing(true);
    setManualStatus("dialing");

    try {
      const res = await fetch("/api/dialer/call", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({
          phone: toE164(manualPhone),
          userId: currentUser.id,
          ghostMode,
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
      setManualStatus("connected");
      const cellHint = data.transferTo ? ` → ***${(data.transferTo as string).slice(-4)}` : "";
      toast.success(`Calling ${formatUsPhone(manualPhone)}${cellHint} — Caller ID: Dominion Homes`);
    } catch {
      toast.error("Network error — call not placed");
      setManualStatus("idle");
    } finally {
      setManualDialing(false);
    }
  }, [manualPhone, currentUser.id, ghostMode]);

  const handleManualHangup = useCallback(() => {
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
  }, [manualCallLogId, currentUser.id]);

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
    setCallState("ended");
    setTransferStatus(null);
    timer.stop();
  }, [timer]);

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

    setCallState("idle");
    setCurrentCallLogId(null);
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
          <Badge variant="cyan" className="text-[10px] gap-1">
            <Zap className="h-2.5 w-2.5" />
            {callState === "connected" ? "LIVE — Dominion Homes" : "Twilio Ready"}
          </Badge>
        </div>
      }
    >
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
                  <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">
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
                  <span className="text-[10px] text-muted-foreground/30">{smsComposeMsg.length}/500</span>
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
              </h2>
              <button
                onClick={refetchQueue}
                className="text-[10px] text-muted-foreground/50 hover:text-foreground transition-colors"
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
              <p className="text-xs text-muted-foreground/50 text-center py-6">No leads with phone numbers in queue</p>
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
                        <span className="text-[10px] text-muted-foreground/40 font-mono w-3">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate flex items-center gap-1">
                            {lead.properties?.owner_name ?? "Unknown"}
                            <RelationshipBadgeCompact data={{ tags: lead.tags }} />
                          </p>
                          <p className="text-[10px] text-muted-foreground/50 truncate">{lead.properties?.address ?? "No address"}</p>
                        </div>
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
                          <p className="text-[10px] text-muted-foreground/50 uppercase">{item.label}</p>
                          <p className={`text-sm font-medium ${item.mono ? "font-mono" : ""}`}>{item.value}</p>
                        </div>
                      ))}
                      <div className="rounded-[10px] bg-white/[0.03] border border-white/[0.04] p-2.5">
                        <p className="text-[10px] text-muted-foreground/50 uppercase">Distress</p>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {(currentLead.tags ?? []).slice(0, 3).map((t) => (
                            <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-[6px] bg-red-500/[0.08] text-red-400 border border-red-500/15">
                              {t}
                            </span>
                          ))}
                          {(!currentLead.tags || currentLead.tags.length === 0) && (
                            <span className="text-[10px] text-muted-foreground/40">—</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[10px] bg-white/[0.03] border border-white/[0.04] p-2.5">
                      <p className="text-[10px] text-muted-foreground/50 uppercase mb-1">Source & Notes</p>
                      <p className="text-xs text-muted-foreground/60">
                        {currentLead.source ?? "unknown"} — {currentLead.notes ?? "No notes"}
                      </p>
                    </div>

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
                            onClick={() => setMuted(!muted)}
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
                      <p className="text-[10px] text-muted-foreground/40 flex items-center gap-1.5 pt-1">
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
          <GlassCard hover={false} className="!p-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5 text-cyan" />
              Disposition
              <span className="text-[9px] opacity-40 ml-auto">Keyboard shortcuts active</span>
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
                    <span className="text-[10px] font-mono text-muted-foreground/40 w-3">{d.hotkey}</span>
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
                  <p className="text-3xl font-bold font-mono tracking-wider text-neon">
                    {timer.formatted}
                  </p>
                  <p className="text-[10px] text-muted-foreground/50 mt-1 uppercase">
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
    </PageShell>
  );
}
