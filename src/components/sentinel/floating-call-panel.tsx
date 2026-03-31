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

function buildIncomingFaviconDataUrl() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="16" fill="#07111f"/>
      <path d="M21 17c2 0 3 1 4 3l3 7c1 2 0 4-2 5l-4 3c2 4 5 7 9 9l3-4c1-2 3-3 5-2l7 3c2 1 3 2 3 4 0 3-1 6-3 8-2 2-5 3-8 3-11 0-24-13-24-24 0-3 1-6 3-8 2-2 5-3 8-3z" fill="#f8fafc"/>
      <circle cx="49" cy="15" r="9" fill="#ef4444"/>
    </svg>
  `.trim();

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function useIncomingCallAttention(active: boolean, incomingFrom: string | null) {
  const pathname = usePathname();
  const originalTitleRef = useRef<string>("");
  const originalFaviconRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const favicon = document.querySelector<HTMLLinkElement>("link[rel*='icon']");
    if (!originalTitleRef.current) {
      originalTitleRef.current = document.title;
    }
    if (favicon && originalFaviconRef.current == null) {
      originalFaviconRef.current = favicon.href;
    }

    if (!active || pathname === "/dialer") {
      document.title = originalTitleRef.current || document.title;
      if (favicon && originalFaviconRef.current) {
        favicon.href = originalFaviconRef.current;
      }
      return;
    }

    const callerLabel = formatPhone(incomingFrom);
    const incomingTitle = `Incoming Call - ${callerLabel}`;
    let alternate = false;

    if (favicon) {
      favicon.href = buildIncomingFaviconDataUrl();
    }

    document.title = incomingTitle;
    const interval = window.setInterval(() => {
      document.title = alternate ? incomingTitle : (originalTitleRef.current || "Sentinel");
      alternate = !alternate;
    }, 1000);

    return () => {
      window.clearInterval(interval);
      document.title = originalTitleRef.current || document.title;
      if (favicon && originalFaviconRef.current) {
        favicon.href = originalFaviconRef.current;
      }
    };
  }, [active, incomingFrom, pathname]);
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
  useIncomingCallAttention(isIncoming, incomingFrom);

  // Don't render on the dialer page — it manages its own call UI
  if (pathname === "/dialer") return null;

  // ── Incoming call — FULL-WIDTH TOP BANNER (unmissable) ────────────────
  if (isIncoming) {
    return (
      <>
        <div className="fixed inset-0 z-[9998] bg-black/75 backdrop-blur-sm" />

        <div className="fixed inset-0 z-[9999] animate-in fade-in duration-200">
          <div className="flex h-full items-center justify-center p-4 sm:p-8">
            <div className="relative w-full max-w-4xl overflow-hidden rounded-[28px] border border-emerald-400/30 bg-[#06131f]/95 shadow-[0_30px_120px_rgba(16,185,129,0.25)]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(52,211,153,0.16),transparent_50%)]" />
              <div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.4fr,auto] lg:items-center">
                <div className="flex items-start gap-5">
                  <div className="relative mt-1">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/18 ring-4 ring-emerald-300/15">
                      <PhoneIncoming className="h-10 w-10 text-emerald-200" />
                    </div>
                    <span className="absolute -right-1 -top-1 h-5 w-5 rounded-full bg-emerald-300 animate-ping" />
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.34em] text-emerald-200/75">
                        Incoming Call
                      </p>
                      <h2 className="text-3xl font-semibold text-white sm:text-4xl">
                        {formatPhone(incomingFrom)}
                      </h2>
                    </div>
                    <p className="max-w-2xl text-sm leading-6 text-emerald-100/80 sm:text-base">
                      Sentinel is ringing right now. Answer here or jump into the dialer for the full live-call workspace.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                  <button
                    onClick={answerIncoming}
                    className="flex min-w-[180px] items-center justify-center gap-2 rounded-2xl bg-emerald-300 px-6 py-4 text-base font-semibold text-emerald-950 shadow-lg shadow-emerald-500/20 transition-all hover:-translate-y-0.5 hover:bg-emerald-200"
                  >
                    <Phone className="h-5 w-5" />
                    Answer now
                  </button>
                  <button
                    onClick={rejectIncoming}
                    className="flex min-w-[180px] items-center justify-center gap-2 rounded-2xl border border-red-400/30 bg-red-500/15 px-6 py-4 text-base font-semibold text-red-100 transition-all hover:bg-red-500/25"
                  >
                    <PhoneOff className="h-5 w-5" />
                    Reject
                  </button>
                  <Link
                    href="/dialer"
                    className="flex min-w-[180px] items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/6 px-6 py-4 text-base font-semibold text-white/90 transition-all hover:bg-white/10"
                    title="Open in Dialer for full context"
                  >
                    <ExternalLink className="h-5 w-5" />
                    Open dialer
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
