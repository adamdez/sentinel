"use client";

import { Phone, PhoneOff, PhoneIncoming, Mic, MicOff, ExternalLink, Loader2 } from "lucide-react";
import { useTwilio } from "@/providers/twilio-provider";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import Link from "next/link";

function formatPhone(raw: string | null): string {
  if (!raw) return "Unknown";
  const d = raw.replace(/\D/g, "").slice(-10);
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return raw;
}

// ── Ringtone via Web Audio API (no audio file needed) ─────────────────
function useRingtone(active: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      return;
    }

    // Create a simple two-tone ring pattern
    function playRingBurst() {
      try {
        if (!ctxRef.current) ctxRef.current = new AudioContext();
        const ctx = ctxRef.current;
        const now = ctx.currentTime;

        // Two-tone ring: 440Hz + 480Hz (standard US phone ring)
        [440, 480].forEach((freq) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.15, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
          osc.connect(gain).connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.8);
        });
      } catch {
        // Audio context may be blocked until user interaction — that's OK
      }
    }

    playRingBurst();
    intervalRef.current = setInterval(playRingBurst, 2000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [active]);
}

export function FloatingCallPanel() {
  const {
    callState, callMeta, formatted, isMuted,
    incomingCall, incomingFrom,
    endCall, toggleMute, answerIncoming, rejectIncoming,
  } = useTwilio();
  const pathname = usePathname();

  const isIncoming = callState === "incoming" && !!incomingCall;

  // Play ringtone whenever there's an incoming call (any page except dialer)
  useRingtone(isIncoming && pathname !== "/dialer");

  // Don't render on the dialer page — it manages its own call UI
  if (pathname === "/dialer") return null;

  // ── Incoming call — FULL-WIDTH TOP BANNER (unmissable) ────────────────
  if (isIncoming) {
    return (
      <>
        {/* Dark overlay behind the banner */}
        <div className="fixed inset-0 z-[9998] bg-black/40 pointer-events-none" />

        {/* Full-width top banner */}
        <div className="fixed top-0 left-0 right-0 z-[9999] animate-in slide-in-from-top duration-300">
          <div className="relative overflow-hidden bg-emerald-600 shadow-2xl">
            {/* Animated pulse background */}
            <div className="absolute inset-0 bg-emerald-400/20 animate-pulse" />

            <div className="relative mx-auto max-w-5xl px-4 py-4 sm:px-6">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                {/* Left: icon + caller info */}
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="h-14 w-14 rounded-full flex items-center justify-center bg-white/20 ring-4 ring-white/30 animate-bounce">
                      <PhoneIncoming className="h-7 w-7 text-white" />
                    </div>
                    <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-white animate-ping" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-white tracking-wide uppercase">
                      Incoming Call
                    </p>
                    <p className="text-2xl font-mono font-bold text-white/95">
                      {formatPhone(incomingFrom)}
                    </p>
                  </div>
                </div>

                {/* Right: answer/reject buttons */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={answerIncoming}
                    className="flex items-center gap-2 rounded-xl px-8 py-3 text-base font-bold bg-white text-emerald-700 hover:bg-emerald-50 shadow-lg transition-all hover:scale-105 active:scale-95"
                  >
                    <Phone className="h-5 w-5" />
                    Answer
                  </button>
                  <button
                    onClick={rejectIncoming}
                    className="flex items-center gap-2 rounded-xl px-6 py-3 text-base font-bold bg-red-500/80 text-white hover:bg-red-500 shadow-lg transition-all hover:scale-105 active:scale-95"
                  >
                    <PhoneOff className="h-5 w-5" />
                    Reject
                  </button>
                  <Link
                    href="/dialer"
                    className="flex items-center gap-1.5 rounded-xl px-4 py-3 text-sm font-semibold bg-white/20 text-white hover:bg-white/30 transition-colors"
                    title="Open in Dialer for full context"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Dialer
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── Active/ended call panel ──────────────────────────────────────────
  if (callState === "idle") return null;

  const isDialing = callState === "dialing";
  const isEnded = callState === "ended";

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-50 w-72 rounded-xl border shadow-2xl backdrop-blur-xl",
        "bg-card/95 border-overlay-6",
        isEnded && "opacity-60",
      )}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Pulsing indicator */}
        <div className="relative shrink-0">
          <div
            className={cn(
              "h-8 w-8 rounded-full flex items-center justify-center",
              isDialing
                ? "bg-amber-500/20 text-amber-400"
                : isEnded
                  ? "bg-muted text-muted-foreground"
                  : "bg-green-500/20 text-green-400",
            )}
          >
            {isDialing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Phone className="h-4 w-4" />
            )}
          </div>
          {!isDialing && !isEnded && (
            <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-400 animate-pulse" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate text-foreground">
            {callMeta?.leadName || "Unknown"}
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              {isDialing
                ? "Dialing…"
                : isEnded
                  ? "Call ended"
                  : formatted}
            </span>
            {callMeta?.phone && (
              <>
                <span>·</span>
                <span>***{callMeta.phone.slice(-4)}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Controls */}
      {!isEnded && (
        <div className="flex items-center gap-2 px-4 pb-3">
          <button
            onClick={toggleMute}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-colors",
              isMuted
                ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                : "bg-overlay-4 text-muted-foreground hover:bg-overlay-6 hover:text-foreground",
            )}
          >
            {isMuted ? (
              <MicOff className="h-3.5 w-3.5" />
            ) : (
              <Mic className="h-3.5 w-3.5" />
            )}
            {isMuted ? "Unmute" : "Mute"}
          </button>

          <button
            onClick={endCall}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors"
          >
            <PhoneOff className="h-3.5 w-3.5" />
            End
          </button>

          <Link
            href="/dialer"
            className="flex items-center justify-center rounded-lg py-1.5 px-2 text-xs text-muted-foreground hover:text-foreground bg-overlay-4 hover:bg-overlay-6 transition-colors"
            title="Open in Dialer"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
    </div>
  );
}
