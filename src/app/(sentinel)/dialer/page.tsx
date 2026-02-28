"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone, PhoneOff, PhoneForwarded, Clock, Users, BarChart3,
  Mic, MicOff, Voicemail, CalendarCheck, FileSignature,
  Skull, Heart, Search, Ghost, Zap, ChevronRight,
  Sparkles, DollarSign, Loader2, SkipForward,
} from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSentinelStore } from "@/lib/store";
import { useDialerQueue, useDialerStats, useCallTimer, type QueueLead } from "@/hooks/use-dialer";

// ── Disposition Config ────────────────────────────────────────────────

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
  { key: "interested",  label: "Interested",   hotkey: "3", icon: Sparkles,       color: "text-neon",       bgColor: "bg-neon/10 hover:bg-neon/20 border-neon/20" },
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

// ── Main Dialer Page ──────────────────────────────────────────────────

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

  // Auto-select first lead if none selected
  useEffect(() => {
    if (!currentLead && queue.length > 0) {
      setCurrentLead(queue[0]);
    }
  }, [queue, currentLead]);

  // ── Dial ──────────────────────────────────────────────────────────

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
        headers: { "Content-Type": "application/json" },
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
      setCallState("connected");
      toast.success("Connected via Twilio");
    } catch (err) {
      console.error("[Dialer]", err);
      toast.error("Network error — call not placed");
      setCallState("idle");
      timer.reset();
    }
  }, [currentLead, currentUser.id, ghostMode, timer]);

  // ── Hang Up ──────────────────────────────────────────────────────

  const handleHangup = useCallback(() => {
    setCallState("ended");
    timer.stop();
  }, [timer]);

  // ── Disposition ──────────────────────────────────────────────────

  const handleDisposition = useCallback(async (dispoKey: string) => {
    if (!currentCallLogId && callState !== "idle") {
      toast.error("No active call to disposition");
      return;
    }

    setDispositionPending(true);

    // If there's a call in progress, end it first
    if (callState === "connected") {
      handleHangup();
    }

    if (currentCallLogId) {
      try {
        await fetch("/api/dialer/call", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
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

    // Advance to next lead
    setCallState("idle");
    setCurrentCallLogId(null);
    setCallNotes("");
    timer.reset();
    setDispositionPending(false);

    const currentIdx = queue.findIndex((l) => l.id === currentLead?.id);
    const nextLead = queue[currentIdx + 1] ?? queue[0] ?? null;
    setCurrentLead(nextLead);
    refetchQueue();
  }, [currentCallLogId, callState, callNotes, currentLead, currentUser.id, handleHangup, queue, refetchQueue, timer]);

  // ── Keyboard Hotkeys ─────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore if typing in textarea
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

  // ── Stats Cards ──────────────────────────────────────────────────

  const statCards = [
    { label: "My Calls", value: stats.myCalls, icon: PhoneForwarded, color: "text-neon" },
    { label: "Team Calls", value: stats.teamCalls, icon: Users, color: "text-blue-400" },
    { label: "Connect %", value: `${stats.connectRate}%`, icon: BarChart3, color: "text-purple-400" },
    { label: "Appts", value: stats.appointments, icon: CalendarCheck, color: "text-emerald-400" },
    { label: "Contracts", value: stats.contracts, icon: FileSignature, color: "text-orange-400" },
    { label: "Fees Earned", value: formatCurrency(stats.feesEarned), icon: DollarSign, color: "text-yellow-400" },
  ];

  return (
    <PageShell
      title="Power Dialer"
      description="AI-prioritized, compliance-gated, Twilio-powered calling"
      actions={
        <div className="flex items-center gap-2">
          {ghostMode && (
            <Badge variant="outline" className="text-[10px] gap-1 border-yellow-500/30 text-yellow-400">
              <Ghost className="h-2.5 w-2.5" /> Ghost Mode
            </Badge>
          )}
          <Badge variant="neon" className="text-[10px] gap-1">
            <Zap className="h-2.5 w-2.5" />
            Twilio {callState === "connected" ? "LIVE" : "Ready"}
          </Badge>
        </div>
      }
    >
      {/* ── Top Stats Bar ──────────────────────────────────────────── */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {statCards.map((s) => (
          <GlassCard key={s.label} className="!p-3 text-center" hover={false} delay={0.05}>
            <s.icon className={`h-4 w-4 mx-auto mb-1 ${s.color}`} />
            {statsLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mx-auto" />
            ) : (
              <p className="text-lg font-bold tracking-tight">{s.value}</p>
            )}
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
          </GlassCard>
        ))}
      </div>

      {/* ── Main 3-Column Layout ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mt-4">
        {/* LEFT: Queue */}
        <div className="lg:col-span-3">
          <GlassCard hover={false} className="!p-3">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-neon" />
                Dial Queue
              </h2>
              <button
                onClick={refetchQueue}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Refresh
              </button>
            </div>

            {queueLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-14 rounded-lg bg-secondary/20 animate-pulse" />
                ))}
              </div>
            ) : queue.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No leads with phone numbers in queue</p>
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
                      className={`w-full text-left rounded-lg p-2.5 transition-all duration-200 border ${
                        isActive
                          ? "bg-neon/5 border-neon/30 shadow-[0_0_12px_rgba(0,255,136,0.1)]"
                          : "bg-secondary/10 border-transparent hover:bg-secondary/20"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground font-mono w-3">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{lead.properties?.owner_name ?? "Unknown"}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{lead.properties?.address ?? "No address"}</p>
                        </div>
                        <Badge variant={sl.variant} className="text-[9px] px-1.5 py-0 shrink-0">
                          {score}
                        </Badge>
                        {!lead.compliant && !ghostMode && (
                          <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" title="Compliance blocked" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </GlassCard>
        </div>

        {/* CENTER: Current Lead Card */}
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
                  glow={callState === "connected"}
                  className={callState === "dialing" ? "!border-yellow-500/30" : ""}
                >
                  {/* Call state indicator */}
                  {callState !== "idle" && (
                    <div className={`flex items-center gap-2 mb-3 text-xs px-3 py-1.5 rounded-lg ${
                      callState === "dialing" ? "bg-yellow-500/10 text-yellow-400" :
                      callState === "connected" ? "bg-neon/10 text-neon" :
                      "bg-red-500/10 text-red-400"
                    }`}>
                      <span className={`h-2 w-2 rounded-full ${
                        callState === "dialing" ? "bg-yellow-400 animate-pulse" :
                        callState === "connected" ? "bg-neon animate-pulse" :
                        "bg-red-400"
                      }`} />
                      {callState === "dialing" && "Dialing..."}
                      {callState === "connected" && `Connected — ${timer.formatted}`}
                      {callState === "ended" && `Ended — ${timer.formatted}`}
                    </div>
                  )}

                  {/* Lead info */}
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-lg font-bold tracking-tight">
                          {currentLead.properties?.owner_name ?? "Unknown Owner"}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {currentLead.properties?.address ?? "No address"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
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

                    {/* Property details grid */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-secondary/20 p-2.5">
                        <p className="text-[10px] text-muted-foreground uppercase">Phone</p>
                        <p className="text-sm font-medium font-mono">
                          {currentLead.properties?.owner_phone ?? "—"}
                        </p>
                      </div>
                      <div className="rounded-lg bg-secondary/20 p-2.5">
                        <p className="text-[10px] text-muted-foreground uppercase">ARV</p>
                        <p className="text-sm font-medium">
                          {currentLead.properties?.estimated_value
                            ? `$${currentLead.properties.estimated_value.toLocaleString()}`
                            : "—"}
                        </p>
                      </div>
                      <div className="rounded-lg bg-secondary/20 p-2.5">
                        <p className="text-[10px] text-muted-foreground uppercase">Equity</p>
                        <p className="text-sm font-medium">
                          {currentLead.properties?.equity_percent != null
                            ? `${currentLead.properties.equity_percent}%`
                            : "—"}
                        </p>
                      </div>
                      <div className="rounded-lg bg-secondary/20 p-2.5">
                        <p className="text-[10px] text-muted-foreground uppercase">Distress</p>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {(currentLead.tags ?? []).slice(0, 3).map((t) => (
                            <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                              {t}
                            </span>
                          ))}
                          {(!currentLead.tags || currentLead.tags.length === 0) && (
                            <span className="text-[10px] text-muted-foreground">—</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Source + notes */}
                    <div className="rounded-lg bg-secondary/20 p-2.5">
                      <p className="text-[10px] text-muted-foreground uppercase mb-1">Source & Notes</p>
                      <p className="text-xs text-muted-foreground">
                        {currentLead.source ?? "unknown"} — {currentLead.notes ?? "No notes"}
                      </p>
                    </div>

                    {/* Call controls */}
                    <div className="flex items-center gap-2 pt-2">
                      {callState === "idle" && (
                        <Button
                          onClick={() => handleDial()}
                          disabled={!currentLead.compliant && !ghostMode}
                          className="flex-1 gap-2 bg-neon/20 hover:bg-neon/30 text-neon border border-neon/30"
                        >
                          <Phone className="h-4 w-4" />
                          Dial {currentLead.properties?.owner_phone ? "" : "(No Phone)"}
                          <span className="text-[10px] opacity-60 ml-1">Enter</span>
                        </Button>
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
                            <span className="text-[10px] opacity-60 ml-1">Esc</span>
                          </Button>
                        </>
                      )}
                      {callState === "ended" && (
                        <div className="flex-1 text-center text-sm text-muted-foreground py-2">
                          Call ended — {timer.formatted} — select disposition below
                        </div>
                      )}
                    </div>
                  </div>
                </GlassCard>

                {/* Notes textarea */}
                <GlassCard hover={false} className="!p-3 mt-3">
                  <textarea
                    value={callNotes}
                    onChange={(e) => setCallNotes(e.target.value)}
                    placeholder="Call notes... (saved with disposition)"
                    className="w-full bg-transparent text-sm resize-none h-16 outline-none placeholder:text-muted-foreground/40"
                  />
                </GlassCard>
              </motion.div>
            ) : (
              <GlassCard hover={false} className="flex items-center justify-center h-64">
                <div className="text-center text-muted-foreground">
                  <Phone className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Select a lead from the queue to begin</p>
                </div>
              </GlassCard>
            )}
          </AnimatePresence>
        </div>

        {/* RIGHT: Disposition Panel */}
        <div className="lg:col-span-4">
          <GlassCard hover={false} className="!p-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5 text-neon" />
              Disposition
              <span className="text-[9px] opacity-50 ml-auto">Keyboard shortcuts active</span>
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
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-150 border
                      ${disabled ? "opacity-30 cursor-not-allowed" : d.bgColor}
                    `}
                  >
                    <span className="text-[10px] font-mono text-muted-foreground w-3">{d.hotkey}</span>
                    <Icon className={`h-4 w-4 ${d.color}`} />
                    <span className="text-sm font-medium flex-1">{d.label}</span>
                    <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
                  </button>
                );
              })}
            </div>

            {/* Next Lead button */}
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

          {/* Live timer card (visible during calls) */}
          <AnimatePresence>
            {callState !== "idle" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
              >
                <GlassCard glow hover={false} className="!p-4 mt-3 text-center">
                  <Clock className="h-5 w-5 mx-auto mb-1 text-neon" />
                  <p className="text-3xl font-bold font-mono tracking-wider text-neon">
                    {timer.formatted}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1 uppercase">
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
